use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use cuttledoc::{
    ArtifactFetcher, ArtifactManifest, BUILT_IN_MANIFESTS, BackendId, ManifestId, ModelDescriptor,
    ModelId, ModelManager, ModelOperations, ModelProgress, ModelProvisioning, ModelState,
    ProviderId, default_cache_root, recognition_asset_inventory,
};
use serde_json::json;

const MODEL_LIST_SCHEMA_VERSION: &str = "1.0.0";
const APPLE_ASSET_MODEL_ID: &str = "apple-speech-assets";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum ModelOutputFormat {
    #[default]
    Text,
    Json,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ModelSelector {
    Id(String),
    All,
    Asr,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ModelCommand {
    List {
        cache_root: Option<PathBuf>,
        format: ModelOutputFormat,
    },
    Install {
        selector: ModelSelector,
        cache_root: Option<PathBuf>,
    },
    Verify {
        selector: ModelSelector,
        cache_root: Option<PathBuf>,
    },
    Remove {
        id: String,
        cache_root: Option<PathBuf>,
    },
    CacheRoot {
        cache_root: Option<PathBuf>,
    },
}

pub fn parse(arguments: &[String]) -> Result<ModelCommand, String> {
    let Some(action) = arguments.first() else {
        return Err("models requires list, install, verify, remove, or cache-root".to_owned());
    };
    match action.as_str() {
        "list" => {
            let (cache_root, format) = parse_options(&arguments[1..], true)?;
            Ok(ModelCommand::List { cache_root, format })
        }
        "install" | "download" => {
            let selector = arguments
                .get(1)
                .filter(|value| !value.starts_with('-'))
                .ok_or("models install requires a model ID, asr, or all")?;
            let (cache_root, _) = parse_options(&arguments[2..], false)?;
            Ok(ModelCommand::Install {
                selector: parse_selector(selector),
                cache_root,
            })
        }
        "verify" => {
            let selector = arguments
                .get(1)
                .filter(|value| !value.starts_with('-'))
                .ok_or("models verify requires a model ID, asr, or all")?;
            let (cache_root, _) = parse_options(&arguments[2..], false)?;
            Ok(ModelCommand::Verify {
                selector: parse_selector(selector),
                cache_root,
            })
        }
        "remove" => {
            let id = arguments
                .get(1)
                .filter(|value| !value.starts_with('-'))
                .ok_or("models remove requires a model ID")?;
            let (cache_root, _) = parse_options(&arguments[2..], false)?;
            Ok(ModelCommand::Remove {
                id: id.clone(),
                cache_root,
            })
        }
        "cache-root" => {
            let (cache_root, _) = parse_options(&arguments[1..], false)?;
            Ok(ModelCommand::CacheRoot { cache_root })
        }
        _ => Err(format!("unsupported models action: {action}")),
    }
}

pub fn run(command: ModelCommand) -> Result<(), String> {
    match command {
        ModelCommand::List { cache_root, format } => {
            let manager = manager(cache_root)?;
            let mut entries = manager
                .list()
                .map_err(format_model_error)?
                .into_iter()
                .map(|descriptor| ModelListEntry {
                    total_bytes: manifest_bytes(descriptor.id.as_str()),
                    descriptor,
                    system_assets: None,
                })
                .collect::<Vec<_>>();
            entries.push(apple_asset_entry());
            render_list(&entries, format)
        }
        ModelCommand::Install {
            selector,
            cache_root,
        } => {
            require_local_model_host()?;
            let manager = manager(cache_root)?;
            let roots = legacy_model_roots();
            let mut fetcher = CurlArtifactFetcher { roots };
            for id in selected_models(&selector)? {
                let descriptor = manager
                    .install(id, &mut fetcher, render_progress)
                    .map_err(format_model_error)?;
                println!("{}\t{}", descriptor.id, descriptor.state.as_str());
            }
            Ok(())
        }
        ModelCommand::Verify {
            selector,
            cache_root,
        } => {
            let manager = manager(cache_root)?;
            for id in selected_models(&selector)? {
                let descriptor = manager.verify(id).map_err(format_model_error)?;
                println!("{}\t{}", descriptor.id, descriptor.state.as_str());
            }
            Ok(())
        }
        ModelCommand::Remove { id, cache_root } => {
            let manager = manager(cache_root)?;
            let removed = manager.remove(&id).map_err(format_model_error)?;
            println!(
                "{id}\t{}",
                if removed { "removed" } else { "not_installed" }
            );
            Ok(())
        }
        ModelCommand::CacheRoot { cache_root } => {
            println!("{}", resolve_cache_root(cache_root)?.display());
            Ok(())
        }
    }
}

pub fn resolve_cache_root(explicit: Option<PathBuf>) -> Result<PathBuf, String> {
    match explicit {
        Some(path) if path.as_os_str().is_empty() => {
            Err("--cache-root must not be empty".to_owned())
        }
        Some(path) => Ok(path),
        None => default_cache_root().map_err(format_model_error),
    }
}

fn manager(cache_root: Option<PathBuf>) -> Result<ModelManager, String> {
    Ok(ModelManager::new(resolve_cache_root(cache_root)?))
}

fn parse_options(
    arguments: &[String],
    allow_format: bool,
) -> Result<(Option<PathBuf>, ModelOutputFormat), String> {
    let mut cache_root = None;
    let mut format = None;
    let mut index = 0;
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--cache-root" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--cache-root requires a directory path")?;
                if cache_root.replace(PathBuf::from(value)).is_some() {
                    return Err("--cache-root may only be specified once".to_owned());
                }
                index += 2;
            }
            "--format" if allow_format => {
                let value = arguments
                    .get(index + 1)
                    .ok_or("--format requires text or json")?;
                let value = match value.as_str() {
                    "text" => ModelOutputFormat::Text,
                    "json" => ModelOutputFormat::Json,
                    _ => return Err("--format requires text or json".to_owned()),
                };
                if format.replace(value).is_some() {
                    return Err("--format may only be specified once".to_owned());
                }
                index += 2;
            }
            option => return Err(format!("unsupported models option: {option}")),
        }
    }
    Ok((cache_root, format.unwrap_or_default()))
}

fn parse_selector(value: &str) -> ModelSelector {
    match value {
        "all" => ModelSelector::All,
        "asr" => ModelSelector::Asr,
        id => ModelSelector::Id(id.to_owned()),
    }
}

fn selected_models(selector: &ModelSelector) -> Result<Vec<&'static str>, String> {
    match selector {
        ModelSelector::Id(id) => BUILT_IN_MANIFESTS
            .iter()
            .find(|manifest| manifest.id == id)
            .map(|manifest| vec![manifest.id])
            .ok_or_else(|| {
                format!(
                    "UNKNOWN_MODEL: unknown Cuttledoc-managed model: {id}; run `cuttledoc models list`"
                )
            }),
        ModelSelector::All => Ok(BUILT_IN_MANIFESTS
            .iter()
            .map(|manifest| manifest.id)
            .collect()),
        ModelSelector::Asr => Ok(vec!["whisper-large-v3-turbo"]),
    }
}

fn require_local_model_host() -> Result<(), String> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok(())
    } else {
        Err(
            "UNSUPPORTED_MODEL_OPERATION: local model installation requires macOS on Apple Silicon"
                .to_owned(),
        )
    }
}

#[derive(Clone, Debug)]
struct SystemAssetSummary {
    supported_locales: Vec<String>,
    installed_locales: Vec<String>,
    reserved_locales: Vec<String>,
    maximum_reserved_locales: u32,
}

#[derive(Clone, Debug)]
struct ModelListEntry {
    descriptor: ModelDescriptor,
    total_bytes: Option<u64>,
    system_assets: Option<SystemAssetSummary>,
}

fn apple_asset_entry() -> ModelListEntry {
    let model = ModelId::new(APPLE_ASSET_MODEL_ID).expect("Apple asset model ID");
    let (state, assets) = match recognition_asset_inventory(&BackendId::apple_speech()) {
        Ok(inventory) => {
            let state = if inventory.installed_locales.is_empty() {
                ModelState::Missing
            } else {
                ModelState::Ready
            };
            (
                state,
                Some(SystemAssetSummary {
                    supported_locales: inventory.supported_locales,
                    installed_locales: inventory.installed_locales,
                    reserved_locales: inventory.reserved_locales,
                    maximum_reserved_locales: inventory.maximum_reserved_locales,
                }),
            )
        }
        Err(_) => (ModelState::ProviderUnavailable, None),
    };
    ModelListEntry {
        descriptor: ModelDescriptor {
            id: model,
            provider: ProviderId::new("apple").expect("Apple provider ID"),
            provisioning: ModelProvisioning::SystemManaged,
            state,
            operations: ModelOperations::default(),
            manifest: None,
            revision: None,
        },
        total_bytes: None,
        system_assets: assets,
    }
}

fn render_list(entries: &[ModelListEntry], format: ModelOutputFormat) -> Result<(), String> {
    match format {
        ModelOutputFormat::Text => {
            for entry in entries {
                let asset_detail = entry
                    .system_assets
                    .as_ref()
                    .map(|assets| {
                        format!(
                            "\tsupported_locales={}\tinstalled_locales={}\treserved_locales={}",
                            assets.supported_locales.len(),
                            assets.installed_locales.len(),
                            assets.reserved_locales.len()
                        )
                    })
                    .unwrap_or_default();
                println!(
                    "{}\t{}\t{}\t{}\tbytes={}{}",
                    entry.descriptor.id,
                    entry.descriptor.state.as_str(),
                    entry.descriptor.provisioning.as_str(),
                    entry.descriptor.provider,
                    entry
                        .total_bytes
                        .map_or_else(|| "-".to_owned(), |bytes| bytes.to_string()),
                    asset_detail
                );
            }
            Ok(())
        }
        ModelOutputFormat::Json => {
            let models = entries
                .iter()
                .map(|entry| {
                    let assets = entry.system_assets.as_ref().map(|assets| {
                        json!({
                            "supported_locales": assets.supported_locales,
                            "installed_locales": assets.installed_locales,
                            "reserved_locales": assets.reserved_locales,
                            "maximum_reserved_locales": assets.maximum_reserved_locales,
                        })
                    });
                    json!({
                        "id": entry.descriptor.id.as_str(),
                        "state": entry.descriptor.state.as_str(),
                        "provider": entry.descriptor.provider.as_str(),
                        "provisioning": entry.descriptor.provisioning.as_str(),
                        "operations": {
                            "install": entry.descriptor.operations.install,
                            "verify": entry.descriptor.operations.verify,
                            "remove": entry.descriptor.operations.remove,
                        },
                        "manifest": entry.descriptor.manifest.as_ref().map(ManifestId::as_str),
                        "revision": entry.descriptor.revision,
                        "bytes": entry.total_bytes,
                        "system_assets": assets,
                    })
                })
                .collect::<Vec<_>>();
            let output = json!({
                "schema_version": MODEL_LIST_SCHEMA_VERSION,
                "kind": "model_list",
                "models": models,
            });
            println!(
                "{}",
                serde_json::to_string_pretty(&output)
                    .map_err(|error| format!("could not encode model list: {error}"))?
            );
            Ok(())
        }
    }
}

fn manifest_bytes(id: &str) -> Option<u64> {
    BUILT_IN_MANIFESTS
        .iter()
        .find(|manifest| manifest.id == id)
        .map(|manifest| manifest.total_bytes())
}

fn render_progress(progress: ModelProgress) {
    let percent = if progress.total_bytes == 0 {
        0.0
    } else {
        progress.completed_bytes as f64 / progress.total_bytes as f64 * 100.0
    };
    eprintln!(
        "{}\t{}\t{percent:.1}%\t{}",
        progress.model,
        progress.phase.as_str(),
        progress.artifact.as_deref().unwrap_or("-")
    );
}

fn format_model_error(error: cuttledoc::ModelError) -> String {
    match &error.remediation {
        Some(remediation) => format!("{error}; remediation: {remediation}"),
        None => error.to_string(),
    }
}

struct CurlArtifactFetcher {
    roots: Vec<PathBuf>,
}

impl ArtifactFetcher for CurlArtifactFetcher {
    fn fetch(&mut self, artifact: &ArtifactManifest, destination: &Path) -> Result<(), String> {
        for root in &self.roots {
            let source = root.join(artifact.path);
            if source.is_file() {
                return fs::hard_link(&source, destination)
                    .or_else(|_| fs::copy(&source, destination).map(|_| ()))
                    .map_err(|error| {
                        format!(
                            "could not reuse existing artifact {}: {error}",
                            source.display()
                        )
                    });
            }
        }

        let curl = if Path::new("/usr/bin/curl").is_file() {
            PathBuf::from("/usr/bin/curl")
        } else {
            PathBuf::from("curl")
        };
        let output = Command::new(&curl)
            .args([
                "--fail",
                "--location",
                "--retry",
                "3",
                "--silent",
                "--show-error",
                "--output",
            ])
            .arg(destination)
            .arg(artifact.url)
            .output()
            .map_err(|error| format!("could not start {}: {error}", curl.display()))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        Err(if detail.is_empty() {
            format!("curl exited with {}", output.status)
        } else {
            format!("curl exited with {}: {}", output.status, truncate(detail))
        })
    }
}

fn legacy_model_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = env::var_os("CUTTLEDOC_WHISPER_MODEL_PATH") {
        if let Some(parent) = PathBuf::from(path).parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Some(path) = env::var_os("CUTTLEDOC_GEMMA_MODEL_DIR") {
        roots.push(PathBuf::from(path));
    }
    if let Some(home) = env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".cache/whisper-coreml/models"));
    }
    roots
}

fn truncate(value: &str) -> String {
    const LIMIT: usize = 4_096;
    if value.len() <= LIMIT {
        return value.to_owned();
    }
    let mut boundary = LIMIT;
    while !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    format!("{}…", &value[..boundary])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn parses_model_commands_and_legacy_download_alias() {
        assert_eq!(
            parse(&arguments(&["list", "--format", "json"])),
            Ok(ModelCommand::List {
                cache_root: None,
                format: ModelOutputFormat::Json,
            })
        );
        assert_eq!(
            parse(&arguments(&["download", "asr", "--cache-root", "/models"])),
            Ok(ModelCommand::Install {
                selector: ModelSelector::Asr,
                cache_root: Some(PathBuf::from("/models")),
            })
        );
        assert_eq!(
            parse(&arguments(&["verify", "all"])),
            Ok(ModelCommand::Verify {
                selector: ModelSelector::All,
                cache_root: None,
            })
        );
        assert_eq!(
            parse(&arguments(&["remove", "whisper-large-v3-turbo"])),
            Ok(ModelCommand::Remove {
                id: "whisper-large-v3-turbo".to_owned(),
                cache_root: None,
            })
        );
    }

    #[test]
    fn rejects_ambiguous_model_commands() {
        assert!(parse(&arguments(&[])).is_err());
        assert!(parse(&arguments(&["install"])).is_err());
        assert!(parse(&arguments(&["list", "--format", "yaml"])).is_err());
        assert!(
            parse(&arguments(&[
                "verify",
                "all",
                "--cache-root",
                "/one",
                "--cache-root",
                "/two"
            ]))
            .is_err()
        );
    }

    #[test]
    fn selectors_are_bounded_to_known_models() {
        assert_eq!(
            selected_models(&ModelSelector::Asr).expect("ASR"),
            vec!["whisper-large-v3-turbo"]
        );
        assert!(
            selected_models(&ModelSelector::Id("unknown".to_owned()))
                .expect_err("unknown model")
                .starts_with("UNKNOWN_MODEL:")
        );
    }
}

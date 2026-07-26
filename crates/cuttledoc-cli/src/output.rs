use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use cuttledoc::{EnhancementOutcome, TranscriptionResult};
use serde_json::json;

use crate::cli_error::{CliError, CliResult};

pub const TRANSCRIPTION_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum OutputFormat {
    #[default]
    Text,
    Markdown,
    Json,
}

impl OutputFormat {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "text" => Ok(Self::Text),
            "markdown" => Ok(Self::Markdown),
            "json" => Ok(Self::Json),
            _ => Err("--format requires text, markdown, or json".to_owned()),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OutputOptions {
    pub format: OutputFormat,
    pub path: Option<PathBuf>,
    pub overwrite: bool,
}

pub fn emit_result(result: &TranscriptionResult, options: &OutputOptions) -> CliResult<()> {
    validate_output(options)?;
    let rendered = render_result(result, options.format)?;
    match &options.path {
        Some(path) => write_file(path, rendered.as_bytes(), options.overwrite),
        None => {
            let mut stdout = io::stdout().lock();
            stdout
                .write_all(rendered.as_bytes())
                .and_then(|()| stdout.flush())
                .map_err(|error| {
                    CliError::new(
                        "OUTPUT_WRITE_FAILED",
                        format!("could not write standard output: {error}"),
                        1,
                    )
                })
        }
    }
}

pub fn validate_output(options: &OutputOptions) -> CliResult<()> {
    let Some(path) = &options.path else {
        return Ok(());
    };
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    if !parent.is_dir() {
        return Err(CliError::new(
            "OUTPUT_DIRECTORY_MISSING",
            format!("output directory does not exist: {}", parent.display()),
            1,
        )
        .with_remediation("create the directory or choose an existing output directory"));
    }
    if path.is_dir() {
        return Err(CliError::new(
            "OUTPUT_PATH_INVALID",
            format!("output path is a directory: {}", path.display()),
            1,
        )
        .with_remediation("choose a file path for --output"));
    }
    if path.exists() && !options.overwrite {
        return Err(CliError::new(
            "OUTPUT_EXISTS",
            format!("output already exists: {}", path.display()),
            3,
        )
        .with_remediation("pass --force to replace the existing output"));
    }
    Ok(())
}

pub fn render_result(result: &TranscriptionResult, format: OutputFormat) -> CliResult<String> {
    match format {
        OutputFormat::Text => Ok(terminal_newline(&result.text)),
        OutputFormat::Markdown => Ok(format!(
            "# Transcript\n\n{}",
            terminal_newline(&result.text)
        )),
        OutputFormat::Json => render_json(result),
    }
}

fn render_json(result: &TranscriptionResult) -> CliResult<String> {
    let enhancement = result.enhancement.as_ref().map(|enhancement| {
        let (outcome, fallback_reason, fallback_detail) = match &enhancement.outcome {
            EnhancementOutcome::Applied => ("applied", None, None),
            EnhancementOutcome::RawFallback { reason, detail } => {
                ("raw_fallback", Some(reason.as_str()), Some(detail.as_str()))
            }
        };
        json!({
            "backend": enhancement.backend.as_str(),
            "model": enhancement.model.as_str(),
            "outcome": outcome,
            "fallback_reason": fallback_reason,
            "fallback_detail": fallback_detail,
            "prompt_id": enhancement.prompt_id,
            "prompt_sha256": enhancement.prompt_sha256,
            "processing_duration_ms": enhancement.processing_duration.as_secs_f64() * 1_000.0,
        })
    });
    let output = json!({
        "schema_version": TRANSCRIPTION_SCHEMA_VERSION,
        "kind": "transcription",
        "raw_text": result.raw_text,
        "text": result.text,
        "language": result.language,
        "backend": result.backend.as_str(),
        "model": result.model.as_ref().map(|model| model.as_str()),
        "media_duration_ms": result.media_duration.as_secs_f64() * 1_000.0,
        "processing_duration_ms": result.processing_duration.as_secs_f64() * 1_000.0,
        "enhancement": enhancement,
    });
    let mut rendered = serde_json::to_string_pretty(&output).map_err(|error| {
        CliError::new(
            "OUTPUT_ENCODING_FAILED",
            format!("could not encode CLI result: {error}"),
            1,
        )
    })?;
    rendered.push('\n');
    Ok(rendered)
}

fn terminal_newline(value: &str) -> String {
    let mut value = value.trim_end_matches(['\r', '\n']).to_owned();
    value.push('\n');
    value
}

fn write_file(path: &Path, contents: &[u8], overwrite: bool) -> CliResult<()> {
    validate_output(&OutputOptions {
        format: OutputFormat::Text,
        path: Some(path.to_path_buf()),
        overwrite,
    })?;
    let temporary = temporary_path(path)?;
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| {
                CliError::new(
                    "OUTPUT_WRITE_FAILED",
                    format!(
                        "could not create temporary output {}: {error}",
                        temporary.display()
                    ),
                    1,
                )
            })?;
        file.write_all(contents)
            .and_then(|()| file.sync_all())
            .map_err(|error| {
                CliError::new(
                    "OUTPUT_WRITE_FAILED",
                    format!(
                        "could not write temporary output {}: {error}",
                        temporary.display()
                    ),
                    1,
                )
            })?;

        if overwrite {
            fs::rename(&temporary, path)
        } else {
            fs::hard_link(&temporary, path).and_then(|()| fs::remove_file(&temporary))
        }
        .map_err(|error| {
            CliError::new(
                "OUTPUT_COMMIT_FAILED",
                format!("could not commit output {}: {error}", path.display()),
                1,
            )
        })
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn temporary_path(path: &Path) -> CliResult<PathBuf> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            CliError::new(
                "OUTPUT_PATH_INVALID",
                format!("output path has no valid file name: {}", path.display()),
                1,
            )
        })?;
    for attempt in 0..100_u8 {
        let candidate = parent.join(format!(
            ".{file_name}.cuttledoc-{}-{attempt}.tmp",
            std::process::id()
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(CliError::new(
        "OUTPUT_WRITE_FAILED",
        format!(
            "could not allocate a temporary output beside {}",
            path.display()
        ),
        1,
    ))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use cuttledoc::{BackendId, ModelId};

    use super::*;

    fn result() -> TranscriptionResult {
        TranscriptionResult {
            raw_text: "raw transcript".to_owned(),
            text: "Corrected transcript.".to_owned(),
            language: Some("en".to_owned()),
            backend: BackendId::apple_speech(),
            model: Some(ModelId::new("fixture-model").expect("model ID")),
            media_duration: Duration::from_millis(1_250),
            processing_duration: Duration::from_millis(250),
            segments: Vec::new(),
            enhancement: None,
        }
    }

    #[test]
    fn formats_text_markdown_and_versioned_json() {
        assert_eq!(
            render_result(&result(), OutputFormat::Text).expect("text"),
            "Corrected transcript.\n"
        );
        assert_eq!(
            render_result(&result(), OutputFormat::Markdown).expect("markdown"),
            "# Transcript\n\nCorrected transcript.\n"
        );
        assert_eq!(
            render_result(&result(), OutputFormat::Json).expect("JSON"),
            concat!(
                "{\n",
                "  \"backend\": \"apple-speech\",\n",
                "  \"enhancement\": null,\n",
                "  \"kind\": \"transcription\",\n",
                "  \"language\": \"en\",\n",
                "  \"media_duration_ms\": 1250.0,\n",
                "  \"model\": \"fixture-model\",\n",
                "  \"processing_duration_ms\": 250.0,\n",
                "  \"raw_text\": \"raw transcript\",\n",
                "  \"schema_version\": \"1.0.0\",\n",
                "  \"text\": \"Corrected transcript.\"\n",
                "}\n"
            )
        );
    }

    #[test]
    fn file_output_refuses_overwrite_unless_explicit() {
        let root =
            std::env::temp_dir().join(format!("cuttledoc-cli-output-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test directory");
        let output = root.join("transcript.txt");

        write_file(&output, b"first\n", false).expect("initial output");
        let error = write_file(&output, b"second\n", false).expect_err("overwrite must fail");
        assert_eq!(error.code, "OUTPUT_EXISTS");
        assert!(
            error
                .remediation
                .as_deref()
                .is_some_and(|value| value.contains("--force"))
        );
        assert_eq!(fs::read(&output).expect("original output"), b"first\n");

        write_file(&output, b"second\n", true).expect("explicit overwrite");
        assert_eq!(fs::read(&output).expect("replaced output"), b"second\n");
        assert!(fs::read_dir(&root).expect("directory").all(|entry| {
            !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .contains(".tmp")
        }));
        fs::remove_dir_all(root).expect("remove test directory");
    }
}

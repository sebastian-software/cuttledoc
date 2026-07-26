use std::error::Error;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::manifests::{BUILT_IN_MANIFESTS, ModelManifest, built_in_manifest};
use crate::{
    ManifestId, ModelDescriptor, ModelId, ModelOperations, ModelProvisioning, ModelState,
    ProviderId,
};

pub const CACHE_ROOT_ENV: &str = "CUTTLEDOC_CACHE_ROOT";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelErrorCode {
    CacheRootUnavailable,
    UnknownModel,
    UnsupportedOperation,
    OperationInProgress,
    DownloadFailed,
    ModelMissing,
    ModelInvalid,
    Io,
}

impl ModelErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CacheRootUnavailable => "CACHE_ROOT_UNAVAILABLE",
            Self::UnknownModel => "UNKNOWN_MODEL",
            Self::UnsupportedOperation => "UNSUPPORTED_MODEL_OPERATION",
            Self::OperationInProgress => "MODEL_OPERATION_IN_PROGRESS",
            Self::DownloadFailed => "MODEL_DOWNLOAD_FAILED",
            Self::ModelMissing => "MODEL_MISSING",
            Self::ModelInvalid => "MODEL_INVALID",
            Self::Io => "MODEL_IO_FAILED",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelError {
    pub code: ModelErrorCode,
    pub message: String,
    pub model: Option<ModelId>,
    pub remediation: Option<String>,
}

impl ModelError {
    fn new(code: ModelErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            model: None,
            remediation: None,
        }
    }

    fn with_model(mut self, model: ModelId) -> Self {
        self.model = Some(model);
        self
    }

    fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }
}

impl fmt::Display for ModelError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code.as_str(), self.message)
    }
}

impl Error for ModelError {}

pub type ModelResult<T> = std::result::Result<T, ModelError>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelProgressPhase {
    Preparing,
    Downloading,
    Verifying,
    Committing,
    Complete,
}

impl ModelProgressPhase {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Downloading => "downloading",
            Self::Verifying => "verifying",
            Self::Committing => "committing",
            Self::Complete => "complete",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelProgress {
    pub model: ModelId,
    pub phase: ModelProgressPhase,
    pub artifact: Option<String>,
    pub completed_bytes: u64,
    pub total_bytes: u64,
}

pub trait ArtifactFetcher {
    fn fetch(
        &mut self,
        artifact: &crate::ArtifactManifest,
        destination: &Path,
    ) -> std::result::Result<(), String>;
}

#[derive(Clone, Debug)]
pub struct ModelManager {
    cache_root: PathBuf,
    manifests: &'static [ModelManifest],
}

impl ModelManager {
    pub fn new(cache_root: impl Into<PathBuf>) -> Self {
        Self {
            cache_root: cache_root.into(),
            manifests: BUILT_IN_MANIFESTS,
        }
    }

    #[cfg(test)]
    fn with_manifests(cache_root: impl Into<PathBuf>, manifests: &'static [ModelManifest]) -> Self {
        Self {
            cache_root: cache_root.into(),
            manifests,
        }
    }

    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }

    pub fn model_directory(&self, id: &str) -> ModelResult<PathBuf> {
        let manifest = self.manifest(id)?;
        Ok(self.models_root().join(manifest.id))
    }

    pub fn list(&self) -> ModelResult<Vec<ModelDescriptor>> {
        self.manifests
            .iter()
            .map(|manifest| self.descriptor(manifest))
            .collect()
    }

    pub fn inspect(&self, id: &str) -> ModelResult<ModelDescriptor> {
        self.descriptor(self.manifest(id)?)
    }

    pub fn verify(&self, id: &str) -> ModelResult<ModelDescriptor> {
        let manifest = self.manifest(id)?;
        let descriptor = self.descriptor(manifest)?;
        match descriptor.state {
            ModelState::Ready => Ok(descriptor),
            ModelState::Missing | ModelState::Partial => Err(ModelError::new(
                ModelErrorCode::ModelMissing,
                format!("model {} is not completely installed", manifest.id),
            )
            .with_model(model_id(manifest))
            .with_remediation(format!("run `cuttledoc models install {}`", manifest.id))),
            ModelState::Invalid => Err(ModelError::new(
                ModelErrorCode::ModelInvalid,
                format!("model {} failed manifest verification", manifest.id),
            )
            .with_model(model_id(manifest))
            .with_remediation(format!(
                "run `cuttledoc models install {}` to replace the invalid snapshot",
                manifest.id
            ))),
            ModelState::Available | ModelState::ProviderUnavailable => Err(ModelError::new(
                ModelErrorCode::UnsupportedOperation,
                format!("model {} is not Cuttledoc-managed", manifest.id),
            )
            .with_model(model_id(manifest))),
        }
    }

    pub fn install(
        &self,
        id: &str,
        fetcher: &mut dyn ArtifactFetcher,
        mut on_progress: impl FnMut(ModelProgress),
    ) -> ModelResult<ModelDescriptor> {
        let manifest = self.manifest(id)?;
        let model = model_id(manifest);
        let total_bytes = manifest.total_bytes();
        on_progress(progress(
            &model,
            ModelProgressPhase::Preparing,
            None,
            0,
            total_bytes,
        ));

        fs::create_dir_all(self.models_root()).map_err(|error| {
            io_error(
                format!(
                    "could not create model cache {}",
                    self.models_root().display()
                ),
                error,
            )
            .with_model(model.clone())
        })?;
        let _lock = OperationLock::acquire(self, manifest)?;

        if matches!(self.descriptor(manifest)?.state, ModelState::Ready) {
            on_progress(progress(
                &model,
                ModelProgressPhase::Complete,
                None,
                total_bytes,
                total_bytes,
            ));
            return self.descriptor(manifest);
        }

        let staging = self.allocate_work_directory(".staging", manifest.id)?;
        let mut staging_guard = WorkDirectory::new(staging.clone());
        let mut completed_bytes = 0_u64;
        for artifact in manifest.artifacts {
            let destination = staging.join(artifact.path);
            let parent = destination.parent().ok_or_else(|| {
                ModelError::new(
                    ModelErrorCode::ModelInvalid,
                    format!("artifact path has no parent: {}", artifact.path),
                )
                .with_model(model.clone())
            })?;
            fs::create_dir_all(parent).map_err(|error| {
                io_error(
                    format!("could not create staging directory {}", parent.display()),
                    error,
                )
                .with_model(model.clone())
            })?;
            on_progress(progress(
                &model,
                ModelProgressPhase::Downloading,
                Some(artifact.path),
                completed_bytes,
                total_bytes,
            ));
            fetcher.fetch(artifact, &destination).map_err(|detail| {
                ModelError::new(
                    ModelErrorCode::DownloadFailed,
                    format!("could not download {}: {detail}", artifact.path),
                )
                .with_model(model.clone())
                .with_remediation("check network access and retry the installation")
            })?;
            verify_artifact(&staging, artifact).map_err(|error| error.with_model(model.clone()))?;
            completed_bytes = completed_bytes.saturating_add(artifact.bytes);
            on_progress(progress(
                &model,
                ModelProgressPhase::Downloading,
                Some(artifact.path),
                completed_bytes,
                total_bytes,
            ));
        }

        on_progress(progress(
            &model,
            ModelProgressPhase::Verifying,
            None,
            completed_bytes,
            total_bytes,
        ));
        let state = state_at(&staging, manifest)?;
        if state != ModelState::Ready {
            return Err(ModelError::new(
                ModelErrorCode::ModelInvalid,
                format!("staged model {} did not verify as ready", manifest.id),
            )
            .with_model(model));
        }

        on_progress(progress(
            &model,
            ModelProgressPhase::Committing,
            None,
            completed_bytes,
            total_bytes,
        ));
        self.commit_staging(manifest, &staging)?;
        staging_guard.disarm();
        let descriptor = self.verify(manifest.id)?;
        on_progress(progress(
            &model,
            ModelProgressPhase::Complete,
            None,
            total_bytes,
            total_bytes,
        ));
        Ok(descriptor)
    }

    pub fn remove(&self, id: &str) -> ModelResult<bool> {
        let manifest = self.manifest(id)?;
        fs::create_dir_all(self.models_root()).map_err(|error| {
            io_error(
                format!(
                    "could not create model cache {}",
                    self.models_root().display()
                ),
                error,
            )
        })?;
        let _lock = OperationLock::acquire(self, manifest)?;
        let destination = self.models_root().join(manifest.id);
        if !destination.exists() {
            return Ok(false);
        }
        let trash = self.allocate_work_path(".trash", manifest.id)?;
        fs::rename(&destination, &trash).map_err(|error| {
            io_error(
                format!("could not detach model {}", destination.display()),
                error,
            )
            .with_model(model_id(manifest))
        })?;
        fs::remove_dir_all(&trash).map_err(|error| {
            io_error(format!("could not remove model {}", trash.display()), error)
                .with_model(model_id(manifest))
        })?;
        Ok(true)
    }

    fn descriptor(&self, manifest: &ModelManifest) -> ModelResult<ModelDescriptor> {
        Ok(ModelDescriptor {
            id: model_id(manifest),
            provider: ProviderId::new(manifest.provider)
                .expect("built-in provider identifiers are valid"),
            provisioning: ModelProvisioning::CuttledocManaged,
            state: state_at(&self.models_root().join(manifest.id), manifest)?,
            operations: ModelOperations {
                install: true,
                verify: true,
                remove: true,
            },
            manifest: Some(
                ManifestId::new(manifest.manifest_id)
                    .expect("built-in manifest identifiers are valid"),
            ),
            revision: Some(manifest.revision.to_owned()),
        })
    }

    fn manifest(&self, id: &str) -> ModelResult<&'static ModelManifest> {
        if std::ptr::eq(self.manifests, BUILT_IN_MANIFESTS) {
            return built_in_manifest(id).ok_or_else(|| unknown_model(id));
        }
        self.manifests
            .iter()
            .find(|manifest| manifest.id == id)
            .ok_or_else(|| unknown_model(id))
    }

    fn models_root(&self) -> PathBuf {
        self.cache_root.join("models")
    }

    fn allocate_work_directory(&self, area: &str, id: &str) -> ModelResult<PathBuf> {
        let path = self.allocate_work_path(area, id)?;
        fs::create_dir(&path).map_err(|error| {
            io_error(
                format!("could not create work directory {}", path.display()),
                error,
            )
        })?;
        Ok(path)
    }

    fn allocate_work_path(&self, area: &str, id: &str) -> ModelResult<PathBuf> {
        let root = self.cache_root.join(area);
        fs::create_dir_all(&root).map_err(|error| {
            io_error(
                format!("could not create work root {}", root.display()),
                error,
            )
        })?;
        for attempt in 0..100_u8 {
            let candidate = root.join(format!("{id}-{}-{attempt}", std::process::id()));
            if !candidate.exists() {
                return Ok(candidate);
            }
        }
        Err(ModelError::new(
            ModelErrorCode::Io,
            format!("could not allocate work path for model {id}"),
        ))
    }

    fn commit_staging(&self, manifest: &ModelManifest, staging: &Path) -> ModelResult<()> {
        let destination = self.models_root().join(manifest.id);
        let backup = destination.exists().then(|| {
            self.allocate_work_path(".backup", manifest.id)
                .map(|path| (destination.clone(), path))
        });
        let backup = backup.transpose()?;
        if let Some((current, backup)) = &backup {
            fs::rename(current, backup).map_err(|error| {
                io_error(
                    format!("could not detach existing model {}", current.display()),
                    error,
                )
                .with_model(model_id(manifest))
            })?;
        }
        if let Err(error) = fs::rename(staging, &destination) {
            if let Some((current, backup)) = &backup {
                let _ = fs::rename(backup, current);
            }
            return Err(io_error(
                format!("could not commit model {}", destination.display()),
                error,
            )
            .with_model(model_id(manifest)));
        }
        if let Some((_, backup)) = backup {
            fs::remove_dir_all(&backup).map_err(|error| {
                io_error(
                    format!("could not remove replaced model {}", backup.display()),
                    error,
                )
                .with_model(model_id(manifest))
            })?;
        }
        Ok(())
    }
}

pub fn default_cache_root() -> ModelResult<PathBuf> {
    if let Some(path) = std::env::var_os(CACHE_ROOT_ENV).filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    #[cfg(target_os = "windows")]
    if let Some(path) = std::env::var_os("LOCALAPPDATA").filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(path).join("cuttledoc"));
    }
    if let Some(path) = std::env::var_os("XDG_CACHE_HOME").filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(path).join("cuttledoc"));
    }
    if let Some(path) = std::env::var_os("HOME").filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(path).join(".cache/cuttledoc"));
    }
    Err(ModelError::new(
        ModelErrorCode::CacheRootUnavailable,
        format!("could not resolve a model cache root; set {CACHE_ROOT_ENV} or pass --cache-root"),
    )
    .with_remediation(format!("set {CACHE_ROOT_ENV} to a writable directory")))
}

fn state_at(root: &Path, manifest: &ModelManifest) -> ModelResult<ModelState> {
    if !root.exists() {
        return Ok(ModelState::Missing);
    }
    if !root.is_dir() {
        return Ok(ModelState::Invalid);
    }
    for artifact in manifest.artifacts {
        let path = root.join(artifact.path);
        if !path.exists() {
            return Ok(ModelState::Partial);
        }
        match verify_artifact(root, artifact) {
            Ok(()) => {}
            Err(error) if error.code == ModelErrorCode::ModelInvalid => {
                return Ok(ModelState::Invalid);
            }
            Err(error) => return Err(error),
        }
    }
    Ok(ModelState::Ready)
}

fn verify_artifact(root: &Path, artifact: &crate::ArtifactManifest) -> ModelResult<()> {
    let path = root.join(artifact.path);
    let metadata = fs::metadata(&path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            ModelError::new(
                ModelErrorCode::ModelMissing,
                format!("model artifact is missing: {}", artifact.path),
            )
        } else {
            io_error(
                format!("could not inspect model artifact {}", path.display()),
                error,
            )
        }
    })?;
    if !metadata.is_file() || metadata.len() != artifact.bytes {
        return Err(ModelError::new(
            ModelErrorCode::ModelInvalid,
            format!(
                "model artifact {} has {} bytes; expected {}",
                artifact.path,
                metadata.len(),
                artifact.bytes
            ),
        ));
    }
    let actual = sha256(&path)?;
    if actual != artifact.sha256 {
        return Err(ModelError::new(
            ModelErrorCode::ModelInvalid,
            format!(
                "model artifact {} failed SHA-256 verification",
                artifact.path
            ),
        ));
    }
    Ok(())
}

fn sha256(path: &Path) -> ModelResult<String> {
    let mut file = File::open(path).map_err(|error| {
        io_error(
            format!("could not open model artifact {}", path.display()),
            error,
        )
    })?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let bytes = file.read(&mut buffer).map_err(|error| {
            io_error(
                format!("could not read model artifact {}", path.display()),
                error,
            )
        })?;
        if bytes == 0 {
            break;
        }
        digest.update(&buffer[..bytes]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn model_id(manifest: &ModelManifest) -> ModelId {
    ModelId::new(manifest.id).expect("built-in model identifiers are valid")
}

fn unknown_model(id: &str) -> ModelError {
    ModelError::new(
        ModelErrorCode::UnknownModel,
        format!("unknown Cuttledoc-managed model: {id}"),
    )
    .with_remediation("run `cuttledoc models list` to inspect supported models")
}

fn io_error(context: impl Into<String>, error: io::Error) -> ModelError {
    ModelError::new(ModelErrorCode::Io, format!("{}: {error}", context.into()))
}

fn progress(
    model: &ModelId,
    phase: ModelProgressPhase,
    artifact: Option<&str>,
    completed_bytes: u64,
    total_bytes: u64,
) -> ModelProgress {
    ModelProgress {
        model: model.clone(),
        phase,
        artifact: artifact.map(str::to_owned),
        completed_bytes,
        total_bytes,
    }
}

struct OperationLock {
    path: PathBuf,
}

impl OperationLock {
    fn acquire(manager: &ModelManager, manifest: &ModelManifest) -> ModelResult<Self> {
        let root = manager.cache_root.join(".locks");
        fs::create_dir_all(&root).map_err(|error| {
            io_error(
                format!("could not create model lock root {}", root.display()),
                error,
            )
        })?;
        let path = root.join(format!("{}.lock", manifest.id));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| {
                if error.kind() == io::ErrorKind::AlreadyExists {
                    ModelError::new(
                        ModelErrorCode::OperationInProgress,
                        format!("another operation is active for model {}", manifest.id),
                    )
                    .with_model(model_id(manifest))
                    .with_remediation("wait for the active model operation to finish")
                } else {
                    io_error(
                        format!("could not create model lock {}", path.display()),
                        error,
                    )
                    .with_model(model_id(manifest))
                }
            })?;
        writeln!(file, "{}", std::process::id()).map_err(|error| {
            io_error(
                format!("could not write model lock {}", path.display()),
                error,
            )
            .with_model(model_id(manifest))
        })?;
        Ok(Self { path })
    }
}

impl Drop for OperationLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

struct WorkDirectory {
    path: PathBuf,
    armed: bool,
}

impl WorkDirectory {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for WorkDirectory {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ArtifactManifest;

    const FIXTURE_ARTIFACT: ArtifactManifest = ArtifactManifest {
        path: "weights/model.bin",
        bytes: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        url: "fixture://model",
    };
    const FIXTURE_MANIFEST: ModelManifest = ModelManifest {
        id: "fixture-model",
        manifest_id: "fixture-model-v1",
        provider: "fixture",
        revision: "fixture@1",
        artifacts: &[FIXTURE_ARTIFACT],
    };
    const FIXTURE_MANIFESTS: &[ModelManifest] = &[FIXTURE_MANIFEST];

    struct FixtureFetcher {
        bytes: &'static [u8],
    }

    impl ArtifactFetcher for FixtureFetcher {
        fn fetch(
            &mut self,
            _artifact: &ArtifactManifest,
            destination: &Path,
        ) -> std::result::Result<(), String> {
            fs::write(destination, self.bytes).map_err(|error| error.to_string())
        }
    }

    fn temporary_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "cuttledoc-model-manager-{name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn install_verify_and_remove_are_manifest_driven() {
        let root = temporary_root("lifecycle");
        let _ = fs::remove_dir_all(&root);
        let manager = ModelManager::with_manifests(&root, FIXTURE_MANIFESTS);
        assert_eq!(
            manager.inspect("fixture-model").expect("descriptor").state,
            ModelState::Missing
        );

        let mut progress_events = Vec::new();
        let descriptor = manager
            .install(
                "fixture-model",
                &mut FixtureFetcher { bytes: b"hello" },
                |event| progress_events.push(event),
            )
            .expect("install");
        assert_eq!(descriptor.state, ModelState::Ready);
        assert_eq!(
            progress_events
                .iter()
                .map(|event| event.phase)
                .collect::<Vec<_>>(),
            vec![
                ModelProgressPhase::Preparing,
                ModelProgressPhase::Downloading,
                ModelProgressPhase::Downloading,
                ModelProgressPhase::Verifying,
                ModelProgressPhase::Committing,
                ModelProgressPhase::Complete,
            ]
        );
        assert_eq!(
            manager.verify("fixture-model").expect("verify").state,
            ModelState::Ready
        );
        assert!(manager.remove("fixture-model").expect("remove"));
        assert!(!manager.remove("fixture-model").expect("idempotent remove"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn invalid_download_never_reaches_the_final_model_path() {
        let root = temporary_root("invalid");
        let _ = fs::remove_dir_all(&root);
        let manager = ModelManager::with_manifests(&root, FIXTURE_MANIFESTS);
        let error = manager
            .install(
                "fixture-model",
                &mut FixtureFetcher { bytes: b"wrong" },
                |_| {},
            )
            .expect_err("invalid digest");
        assert_eq!(error.code, ModelErrorCode::ModelInvalid);
        assert!(
            !manager
                .model_directory("fixture-model")
                .expect("model directory")
                .exists()
        );
        assert!(
            fs::read_dir(root.join(".staging"))
                .expect("staging root")
                .next()
                .is_none()
        );
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn partial_and_invalid_states_are_distinct() {
        let root = temporary_root("states");
        let _ = fs::remove_dir_all(&root);
        let manager = ModelManager::with_manifests(&root, FIXTURE_MANIFESTS);
        let directory = manager
            .model_directory("fixture-model")
            .expect("model directory");
        fs::create_dir_all(&directory).expect("partial model");
        assert_eq!(
            manager.inspect("fixture-model").expect("partial").state,
            ModelState::Partial
        );
        fs::create_dir_all(directory.join("weights")).expect("artifact parent");
        fs::write(directory.join("weights/model.bin"), b"wrong").expect("invalid artifact");
        assert_eq!(
            manager.inspect("fixture-model").expect("invalid").state,
            ModelState::Invalid
        );
        fs::remove_dir_all(root).expect("remove test root");
    }
}

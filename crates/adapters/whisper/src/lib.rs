//! Private whisper.cpp compatibility boundary for Cuttledoc.
//!
//! No whisper.cpp or C++ type crosses this crate. Native support is compiled
//! only when an ADR-0017 source checkout is provided explicitly.

use std::error::Error;
use std::fmt;
use std::path::{Path, PathBuf};

pub const BACKEND_ID: &str = "whisper";
pub const MODEL_ID: &str = "whisper-large-v3-turbo";
pub const ABI_VERSION: u32 = 1;
pub const MODEL_PATH_ENV: &str = "CUTTLEDOC_WHISPER_MODEL_PATH";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BuildSupport {
    Native,
    SourceNotPrepared,
    UnsupportedPlatform,
}

pub const fn build_support() -> BuildSupport {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        BuildSupport::UnsupportedPlatform
    } else if cfg!(cuttledoc_whisper_native) {
        BuildSupport::Native
    } else {
        BuildSupport::SourceNotPrepared
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterErrorKind {
    UnsupportedPlatform,
    SourceNotPrepared,
    InvalidInput,
    ModelMissing,
    ModelInvalid,
    EngineLoadFailed,
    TranscriptionFailed,
    Cancelled,
    CallbackViolation,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdapterError {
    pub kind: AdapterErrorKind,
    pub message: String,
}

impl AdapterError {
    fn new(kind: AdapterErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for AdapterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl Error for AdapterError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NativeTimeRange {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeSegment {
    pub range: NativeTimeRange,
    pub text: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeTranscriptionResult {
    pub language: Option<String>,
    pub segments: Vec<NativeSegment>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineOptions {
    pub model_path: PathBuf,
    pub language: Option<String>,
    pub threads: u32,
}

pub struct WhisperEngine {
    inner: platform::Engine,
}

impl WhisperEngine {
    pub fn create(options: &EngineOptions) -> Result<Self, AdapterError> {
        validate_model(&options.model_path)?;
        platform::Engine::create(options).map(|inner| Self { inner })
    }

    pub fn transcribe(
        &mut self,
        samples: &[f32],
        is_cancelled: impl Fn() -> bool,
    ) -> Result<NativeTranscriptionResult, AdapterError> {
        validate_samples(samples)?;
        self.inner.transcribe(samples, &is_cancelled)
    }
}

fn validate_samples(samples: &[f32]) -> Result<(), AdapterError> {
    if samples.is_empty() || samples.iter().any(|sample| !sample.is_finite()) {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Whisper input must contain finite PCM samples",
        ));
    }
    Ok(())
}

pub fn configured_model_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(MODEL_PATH_ENV).map(PathBuf::from) {
        return Some(path);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let primary =
        home.join(".cache/cuttledoc/models/whisper-large-v3-turbo/ggml-large-v3-turbo.bin");
    if primary.is_file() {
        return Some(primary);
    }
    let legacy = home.join(".cache/whisper-coreml/models/ggml-large-v3-turbo.bin");
    legacy.is_file().then_some(legacy)
}

pub fn coreml_model_path(model_path: &Path) -> Option<PathBuf> {
    let file_name = model_path.file_name()?.to_str()?;
    let stem = file_name.strip_suffix(".bin")?;
    Some(model_path.with_file_name(format!("{stem}-encoder.mlmodelc")))
}

pub fn validate_model(model_path: &Path) -> Result<(), AdapterError> {
    if !model_path.is_file() {
        return Err(AdapterError::new(
            AdapterErrorKind::ModelMissing,
            format!("Whisper GGML model is missing: {}", model_path.display()),
        ));
    }
    let Some(coreml_path) = coreml_model_path(model_path) else {
        return Err(AdapterError::new(
            AdapterErrorKind::ModelInvalid,
            "Whisper model path must end in .bin",
        ));
    };
    if !coreml_path.is_dir() {
        return Err(AdapterError::new(
            AdapterErrorKind::ModelMissing,
            format!(
                "paired Whisper Core ML encoder is missing: {}",
                coreml_path.display()
            ),
        ));
    }
    Ok(())
}

#[cfg(all(target_os = "macos", target_arch = "aarch64", cuttledoc_whisper_native))]
#[allow(unsafe_code)]
mod platform {
    use std::ffi::{CStr, CString, c_char, c_float, c_void};
    use std::os::unix::ffi::OsStrExt;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::ptr::{self, NonNull};

    use super::{
        ABI_VERSION, AdapterError, AdapterErrorKind, EngineOptions, NativeSegment, NativeTimeRange,
        NativeTranscriptionResult,
    };

    const STATUS_OK: i32 = 0;
    const STATUS_INVALID_INPUT: i32 = 1;
    const STATUS_LOAD_FAILED: i32 = 2;
    const STATUS_TRANSCRIPTION_FAILED: i32 = 3;
    const STATUS_CANCELLED: i32 = 4;

    type SegmentCallback = extern "C" fn(*mut c_void, i64, i64, *const c_char);
    type CancelCallback = extern "C" fn(*mut c_void) -> i32;

    unsafe extern "C" {
        fn cuttledoc_whisper_abi_version() -> u32;
        fn cuttledoc_whisper_engine_create(
            model_path: *const c_char,
            language: *const c_char,
            threads: u32,
            error_output: *mut *mut c_char,
        ) -> *mut c_void;
        fn cuttledoc_whisper_engine_transcribe(
            handle: *mut c_void,
            samples: *const c_float,
            sample_count: usize,
            segment_callback: SegmentCallback,
            cancel_callback: CancelCallback,
            callback_context: *mut c_void,
            resolved_language: *mut *mut c_char,
            error_output: *mut *mut c_char,
        ) -> i32;
        fn cuttledoc_whisper_engine_destroy(handle: *mut c_void);
        fn cuttledoc_whisper_free_string(value: *mut c_char);
    }

    pub struct Engine {
        handle: NonNull<c_void>,
    }

    impl Engine {
        pub fn create(options: &EngineOptions) -> Result<Self, AdapterError> {
            if unsafe { cuttledoc_whisper_abi_version() } != ABI_VERSION {
                return Err(AdapterError::new(
                    AdapterErrorKind::EngineLoadFailed,
                    "linked Whisper adapter ABI does not match the Rust boundary",
                ));
            }
            let model_path =
                CString::new(options.model_path.as_os_str().as_bytes()).map_err(|_| {
                    AdapterError::new(
                        AdapterErrorKind::InvalidInput,
                        "Whisper model path contains an interior NUL byte",
                    )
                })?;
            let language =
                CString::new(options.language.as_deref().unwrap_or("auto")).map_err(|_| {
                    AdapterError::new(
                        AdapterErrorKind::InvalidInput,
                        "Whisper language contains an interior NUL byte",
                    )
                })?;
            let mut error_output = ptr::null_mut();
            let handle = unsafe {
                cuttledoc_whisper_engine_create(
                    model_path.as_ptr(),
                    language.as_ptr(),
                    options.threads,
                    &mut error_output,
                )
            };
            NonNull::new(handle)
                .map(|handle| Self { handle })
                .ok_or_else(|| {
                    AdapterError::new(
                        AdapterErrorKind::EngineLoadFailed,
                        take_native_string(error_output)
                            .unwrap_or_else(|| "Whisper engine creation failed".to_owned()),
                    )
                })
        }

        pub fn transcribe(
            &mut self,
            samples: &[f32],
            is_cancelled: &dyn Fn() -> bool,
        ) -> Result<NativeTranscriptionResult, AdapterError> {
            let mut state = CallbackState {
                segments: Vec::new(),
                error: None,
                is_cancelled,
            };
            let context = ptr::from_mut(&mut state).cast::<c_void>();
            let mut language_output = ptr::null_mut();
            let mut error_output = ptr::null_mut();
            let status = unsafe {
                cuttledoc_whisper_engine_transcribe(
                    self.handle.as_ptr(),
                    samples.as_ptr(),
                    samples.len(),
                    receive_segment,
                    receive_cancellation,
                    context,
                    &mut language_output,
                    &mut error_output,
                )
            };
            if let Some(message) = state.error {
                return Err(AdapterError::new(
                    AdapterErrorKind::CallbackViolation,
                    message,
                ));
            }
            if status != STATUS_OK {
                let kind = match status {
                    STATUS_INVALID_INPUT => AdapterErrorKind::InvalidInput,
                    STATUS_LOAD_FAILED => AdapterErrorKind::EngineLoadFailed,
                    STATUS_CANCELLED => AdapterErrorKind::Cancelled,
                    STATUS_TRANSCRIPTION_FAILED => AdapterErrorKind::TranscriptionFailed,
                    _ => AdapterErrorKind::TranscriptionFailed,
                };
                return Err(AdapterError::new(
                    kind,
                    take_native_string(error_output).unwrap_or_else(|| {
                        format!("Whisper transcription failed with status {status}")
                    }),
                ));
            }
            let language = take_native_string(language_output).filter(|value| !value.is_empty());
            Ok(NativeTranscriptionResult {
                language,
                segments: state.segments,
            })
        }
    }

    impl Drop for Engine {
        fn drop(&mut self) {
            unsafe { cuttledoc_whisper_engine_destroy(self.handle.as_ptr()) };
        }
    }

    struct CallbackState<'a> {
        segments: Vec<NativeSegment>,
        error: Option<String>,
        is_cancelled: &'a dyn Fn() -> bool,
    }

    extern "C" fn receive_segment(
        context: *mut c_void,
        start_ms: i64,
        end_ms: i64,
        text: *const c_char,
    ) {
        if context.is_null() {
            return;
        }
        let state = unsafe { &mut *context.cast::<CallbackState<'_>>() };
        if state.error.is_some() {
            return;
        }
        let result = catch_unwind(AssertUnwindSafe(|| {
            if start_ms < 0 || end_ms <= start_ms {
                return Err("Whisper emitted an invalid segment range".to_owned());
            }
            if text.is_null() {
                return Err("Whisper emitted a null segment text".to_owned());
            }
            let text = unsafe { CStr::from_ptr(text) }
                .to_str()
                .map_err(|_| "Whisper emitted non-UTF-8 segment text".to_owned())?
                .trim()
                .to_owned();
            if text.is_empty() {
                return Ok(());
            }
            state.segments.push(NativeSegment {
                range: NativeTimeRange {
                    start_ms: u64::try_from(start_ms)
                        .map_err(|_| "Whisper emitted a negative segment start".to_owned())?,
                    end_ms: u64::try_from(end_ms)
                        .map_err(|_| "Whisper emitted a negative segment end".to_owned())?,
                },
                text,
            });
            Ok(())
        }));
        match result {
            Ok(Ok(())) => {}
            Ok(Err(message)) => state.error = Some(message),
            Err(_) => state.error = Some("Whisper segment callback panicked".to_owned()),
        }
    }

    extern "C" fn receive_cancellation(context: *mut c_void) -> i32 {
        if context.is_null() {
            return 0;
        }
        let state = unsafe { &*context.cast::<CallbackState<'_>>() };
        catch_unwind(AssertUnwindSafe(|| (state.is_cancelled)()))
            .unwrap_or(true)
            .into()
    }

    fn take_native_string(value: *mut c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let result = unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .into_owned();
        unsafe { cuttledoc_whisper_free_string(value) };
        Some(result)
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64", cuttledoc_whisper_native)))]
mod platform {
    use super::{
        AdapterError, AdapterErrorKind, EngineOptions, NativeTranscriptionResult, build_support,
    };

    pub struct Engine;

    impl Engine {
        pub fn create(_options: &EngineOptions) -> Result<Self, AdapterError> {
            let (kind, message) = match build_support() {
                super::BuildSupport::UnsupportedPlatform => (
                    AdapterErrorKind::UnsupportedPlatform,
                    "Whisper requires macOS 26 or newer on Apple Silicon",
                ),
                super::BuildSupport::SourceNotPrepared => (
                    AdapterErrorKind::SourceNotPrepared,
                    "Whisper was not included in this build; prepare the ADR-0017 source and set CUTTLEDOC_WHISPER_CPP_DIR",
                ),
                super::BuildSupport::Native => {
                    unreachable!("native build uses the platform module")
                }
            };
            Err(AdapterError::new(kind, message))
        }

        pub fn transcribe(
            &mut self,
            _samples: &[f32],
            _is_cancelled: &dyn Fn() -> bool,
        ) -> Result<NativeTranscriptionResult, AdapterError> {
            Err(AdapterError::new(
                AdapterErrorKind::UnsupportedPlatform,
                "Whisper is unavailable in this build",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn build_support_matches_the_compiled_boundary() {
        let expected = if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            BuildSupport::UnsupportedPlatform
        } else if cfg!(cuttledoc_whisper_native) {
            BuildSupport::Native
        } else {
            BuildSupport::SourceNotPrepared
        };
        assert_eq!(build_support(), expected);
    }

    #[test]
    fn coreml_path_follows_the_upstream_naming_contract() {
        assert_eq!(
            coreml_model_path(Path::new("/models/ggml-large-v3-turbo.bin")),
            Some(PathBuf::from(
                "/models/ggml-large-v3-turbo-encoder.mlmodelc"
            ))
        );
        assert_eq!(coreml_model_path(Path::new("/models/model.gguf")), None);
    }

    #[test]
    fn model_validation_requires_the_paired_encoder() {
        let root = std::env::temp_dir().join(format!(
            "cuttledoc-whisper-model-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test directory");
        let model = root.join("ggml-large-v3-turbo.bin");
        fs::write(&model, b"model").expect("model fixture");

        let error = validate_model(&model).expect_err("encoder must be required");
        assert_eq!(error.kind, AdapterErrorKind::ModelMissing);

        fs::create_dir(root.join("ggml-large-v3-turbo-encoder.mlmodelc")).expect("encoder fixture");
        validate_model(&model).expect("paired model fixture");
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn empty_or_non_finite_pcm_is_rejected_before_native_work() {
        assert_eq!(
            validate_samples(&[]).expect_err("empty input").kind,
            AdapterErrorKind::InvalidInput
        );
        assert_eq!(
            validate_samples(&[f32::NAN])
                .expect_err("non-finite input")
                .kind,
            AdapterErrorKind::InvalidInput
        );
    }
}

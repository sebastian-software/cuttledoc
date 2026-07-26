//! Private Gemma 4 boundary over the official MLX C++ core.
//!
//! Rust owns the model-specific chat, tokenizer, memory, cancellation, and
//! streaming contracts. No MLX or C++ type crosses this crate.

use std::error::Error;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use tokenizers::Tokenizer;

pub const BACKEND_ID: &str = "gemma-mlx";
pub const MODEL_ID: &str = "gemma-4-26b-a4b-it-4bit";
pub const MODEL_PATH_ENV: &str = "CUTTLEDOC_GEMMA_MODEL_DIR";
pub const METALLIB_PATH_ENV: &str = "CUTTLEDOC_MLX_METALLIB_PATH";
pub const ABI_VERSION: u32 = 1;
pub const MODEL_REVISION: &str = "0d77464eeb233a2da68ebf9d7dc4edaac7db956d";
pub const MLX_REVISION: &str = "7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247";
pub const MINIMUM_UNIFIED_MEMORY_BYTES: u64 = 32 * 1_024 * 1_024 * 1_024;
pub const SYSTEM_HEADROOM_BYTES: u64 = 8 * 1_024 * 1_024 * 1_024;
pub const MODEL_SNAPSHOT_BYTES: u64 = 15_373_586_252;
pub const REQUIRED_AVAILABLE_MEMORY_BYTES: u64 = MODEL_SNAPSHOT_BYTES + SYSTEM_HEADROOM_BYTES;

const TOKENIZER_VOCAB_SIZE: usize = 262_144;
const BOS_TOKEN_ID: u32 = 2;
const STOP_TOKEN_IDS: &[u32] = &[1, 50, 106];
const EXPECTED_ARTIFACTS: &[(&str, u64)] = &[
    ("chat_template.jinja", 17_466),
    ("config.json", 12_180),
    ("generation_config.json", 208),
    ("model-00001-of-00003.safetensors", 5_320_218_487),
    ("model-00002-of-00003.safetensors", 5_363_328_422),
    ("model-00003-of-00003.safetensors", 4_657_658_867),
    ("model.safetensors.index.json", 176_940),
    ("processor_config.json", 1_316),
    ("tokenizer.json", 32_169_626),
    ("tokenizer_config.json", 2_740),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BuildSupport {
    Native,
    SourceNotPrepared,
    UnsupportedPlatform,
}

pub const fn build_support() -> BuildSupport {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        BuildSupport::UnsupportedPlatform
    } else if cfg!(cuttledoc_gemma_mlx_native) {
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
    InsufficientMemory,
    EngineLoadFailed,
    GenerationFailed,
    Cancelled,
    Busy,
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
pub struct MemorySnapshot {
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MemoryGate {
    Ready,
    InsufficientTotal {
        required_bytes: u64,
        actual_bytes: u64,
    },
    InsufficientHeadroom {
        required_bytes: u64,
        actual_bytes: u64,
    },
}

impl MemoryGate {
    pub const fn is_ready(self) -> bool {
        matches!(self, Self::Ready)
    }
}

pub const fn evaluate_memory(snapshot: MemorySnapshot) -> MemoryGate {
    if snapshot.total_bytes < MINIMUM_UNIFIED_MEMORY_BYTES {
        MemoryGate::InsufficientTotal {
            required_bytes: MINIMUM_UNIFIED_MEMORY_BYTES,
            actual_bytes: snapshot.total_bytes,
        }
    } else if snapshot.available_bytes < REQUIRED_AVAILABLE_MEMORY_BYTES {
        MemoryGate::InsufficientHeadroom {
            required_bytes: REQUIRED_AVAILABLE_MEMORY_BYTES,
            actual_bytes: snapshot.available_bytes,
        }
    } else {
        MemoryGate::Ready
    }
}

pub fn system_memory_snapshot() -> Option<MemorySnapshot> {
    memory::snapshot()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeFinishReason {
    Stop,
    Length,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeGenerationResult {
    pub text: String,
    pub finish_reason: NativeFinishReason,
    pub prompt_tokens: u64,
    pub generated_tokens: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineOptions {
    pub model_directory: PathBuf,
    pub metallib_path: Option<PathBuf>,
    pub memory: Option<MemorySnapshot>,
}

pub struct GemmaEngine {
    tokenizer: Tokenizer,
    session: platform::Session,
}

impl GemmaEngine {
    pub fn create(options: &EngineOptions) -> Result<Self, AdapterError> {
        validate_model(&options.model_directory)?;
        let memory = options
            .memory
            .or_else(system_memory_snapshot)
            .ok_or_else(|| {
                AdapterError::new(
                    AdapterErrorKind::UnsupportedPlatform,
                    "Gemma memory capacity could not be measured on this host",
                )
            })?;
        match evaluate_memory(memory) {
            MemoryGate::Ready => {}
            MemoryGate::InsufficientTotal {
                required_bytes,
                actual_bytes,
            } => {
                return Err(AdapterError::new(
                    AdapterErrorKind::InsufficientMemory,
                    format!(
                        "Gemma requires at least {required_bytes} bytes of unified memory; the host reports {actual_bytes}"
                    ),
                ));
            }
            MemoryGate::InsufficientHeadroom {
                required_bytes,
                actual_bytes,
            } => {
                return Err(AdapterError::new(
                    AdapterErrorKind::InsufficientMemory,
                    format!(
                        "Gemma requires at least {required_bytes} currently available bytes; the host reports {actual_bytes}"
                    ),
                ));
            }
        }

        let tokenizer_path = options.model_directory.join("tokenizer.json");
        let tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|error| {
            AdapterError::new(
                AdapterErrorKind::ModelInvalid,
                format!(
                    "could not load Gemma tokenizer {}: {error}",
                    tokenizer_path.display()
                ),
            )
        })?;
        validate_tokenizer(&tokenizer)?;
        let session =
            platform::Session::create(&options.model_directory, options.metallib_path.as_deref())?;
        Ok(Self { tokenizer, session })
    }

    pub fn generate(
        &mut self,
        messages: &[ChatMessage],
        maximum_tokens: u32,
        is_cancelled: impl Fn() -> bool,
        mut on_delta: impl FnMut(String) -> Result<(), AdapterError>,
    ) -> Result<NativeGenerationResult, AdapterError> {
        if maximum_tokens == 0 {
            return Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "Gemma maximum_tokens must be greater than zero",
            ));
        }
        let prompt = render_chat(messages)?;
        let encoding = self.tokenizer.encode(prompt, false).map_err(|error| {
            AdapterError::new(
                AdapterErrorKind::InvalidInput,
                format!("could not tokenize the Gemma prompt: {error}"),
            )
        })?;
        let prompt_tokens = encoding.get_ids();
        if prompt_tokens.is_empty() || prompt_tokens.first() != Some(&BOS_TOKEN_ID) {
            return Err(AdapterError::new(
                AdapterErrorKind::ModelInvalid,
                "Gemma tokenizer did not preserve the required BOS token",
            ));
        }

        let mut generated_tokens = Vec::new();
        let mut emitted_text = String::new();
        let native =
            self.session
                .generate(prompt_tokens, maximum_tokens, &is_cancelled, &mut |token| {
                    generated_tokens.push(token);
                    let decoded =
                        self.tokenizer
                            .decode(&generated_tokens, true)
                            .map_err(|error| {
                                AdapterError::new(
                                    AdapterErrorKind::CallbackViolation,
                                    format!("could not decode a Gemma token update: {error}"),
                                )
                            })?;
                    let delta = decoded.strip_prefix(&emitted_text).ok_or_else(|| {
                        AdapterError::new(
                            AdapterErrorKind::CallbackViolation,
                            "Gemma token updates changed text that was already emitted",
                        )
                    })?;
                    if !delta.is_empty() {
                        on_delta(delta.to_owned())?;
                        emitted_text = decoded;
                    }
                    Ok(())
                })?;
        let text = self
            .tokenizer
            .decode(&generated_tokens, true)
            .map_err(|error| {
                AdapterError::new(
                    AdapterErrorKind::GenerationFailed,
                    format!("could not decode the final Gemma output: {error}"),
                )
            })?;
        if text != emitted_text {
            let delta = text.strip_prefix(&emitted_text).ok_or_else(|| {
                AdapterError::new(
                    AdapterErrorKind::CallbackViolation,
                    "final Gemma text changed text that was already emitted",
                )
            })?;
            if !delta.is_empty() {
                on_delta(delta.to_owned())?;
            }
        }
        Ok(NativeGenerationResult {
            text,
            finish_reason: native.finish_reason,
            prompt_tokens: u64::try_from(prompt_tokens.len()).unwrap_or(u64::MAX),
            generated_tokens: u64::try_from(generated_tokens.len()).unwrap_or(u64::MAX),
        })
    }
}

pub fn configured_model_directory() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(MODEL_PATH_ENV).map(PathBuf::from) {
        return Some(path);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let path = home.join(".cache/cuttledoc/models/gemma-4-26b-a4b-it-4bit");
    path.is_dir().then_some(path)
}

pub fn configured_metallib_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(METALLIB_PATH_ENV).map(PathBuf::from) {
        return Some(path);
    }
    if let Ok(executable) = std::env::current_exe() {
        let path = executable.with_file_name("mlx.metallib");
        if path.is_file() {
            return Some(path);
        }
    }
    option_env!("CUTTLEDOC_GEMMA_BUILD_METALLIB")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
}

pub fn validate_model(model_directory: &Path) -> Result<(), AdapterError> {
    if !model_directory.is_dir() {
        return Err(AdapterError::new(
            AdapterErrorKind::ModelMissing,
            format!(
                "Gemma model directory is missing: {}",
                model_directory.display()
            ),
        ));
    }
    for (relative_path, expected_bytes) in EXPECTED_ARTIFACTS {
        let path = model_directory.join(relative_path);
        let metadata = fs::metadata(&path).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::ModelMissing,
                format!("Gemma model artifact is missing: {}", path.display()),
            )
        })?;
        if !metadata.is_file() || metadata.len() != *expected_bytes {
            return Err(AdapterError::new(
                AdapterErrorKind::ModelInvalid,
                format!(
                    "Gemma model artifact {} has {} bytes; expected {expected_bytes}",
                    path.display(),
                    metadata.len()
                ),
            ));
        }
    }
    Ok(())
}

pub fn render_chat(messages: &[ChatMessage]) -> Result<String, AdapterError> {
    if messages.is_empty() {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Gemma chat requires at least one message",
        ));
    }
    if messages
        .iter()
        .any(|message| message.content.trim().is_empty())
    {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Gemma chat messages must not be empty",
        ));
    }
    if messages
        .iter()
        .skip(1)
        .any(|message| message.role == ChatRole::System)
    {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Gemma permits a system message only in the first position",
        ));
    }

    let mut rendered = String::from("<bos>");
    let mut messages = messages;
    if messages[0].role == ChatRole::System {
        rendered.push_str("<|turn>system\n");
        rendered.push_str(messages[0].content.trim());
        rendered.push_str("<turn|>\n");
        messages = &messages[1..];
    }
    let mut previous_role = None;
    for message in messages {
        if previous_role == Some(message.role) {
            return Err(AdapterError::new(
                AdapterErrorKind::InvalidInput,
                "Gemma chat roles must alternate",
            ));
        }
        let role = match message.role {
            ChatRole::System => unreachable!("non-leading system messages were rejected"),
            ChatRole::User => "user",
            ChatRole::Assistant => "model",
        };
        rendered.push_str("<|turn>");
        rendered.push_str(role);
        rendered.push('\n');
        rendered.push_str(message.content.trim());
        rendered.push_str("<turn|>\n");
        previous_role = Some(message.role);
    }
    if previous_role != Some(ChatRole::User) {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "Gemma generation requires a final user message",
        ));
    }
    rendered.push_str("<|turn>model\n<|channel>thought\n<channel|>");
    Ok(rendered)
}

fn validate_tokenizer(tokenizer: &Tokenizer) -> Result<(), AdapterError> {
    if tokenizer.get_vocab_size(true) != TOKENIZER_VOCAB_SIZE
        || tokenizer.token_to_id("<bos>") != Some(BOS_TOKEN_ID)
        || STOP_TOKEN_IDS
            .iter()
            .any(|token| tokenizer.id_to_token(*token).is_none())
    {
        return Err(AdapterError::new(
            AdapterErrorKind::ModelInvalid,
            "Gemma tokenizer identity does not match the pinned model",
        ));
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PlatformGenerationResult {
    finish_reason: NativeFinishReason,
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod memory {
    use std::ffi::{c_char, c_void};
    use std::mem;
    use std::ptr;

    use super::MemorySnapshot;

    unsafe extern "C" {
        fn os_proc_available_memory() -> usize;
        fn sysctlbyname(
            name: *const c_char,
            old_value: *mut c_void,
            old_length: *mut usize,
            new_value: *mut c_void,
            new_length: usize,
        ) -> i32;
    }

    pub fn snapshot() -> Option<MemorySnapshot> {
        let mut total_bytes = 0_u64;
        let mut length = mem::size_of::<u64>();
        let status = unsafe {
            sysctlbyname(
                c"hw.memsize".as_ptr(),
                ptr::from_mut(&mut total_bytes).cast(),
                &mut length,
                ptr::null_mut(),
                0,
            )
        };
        if status != 0 || length != mem::size_of::<u64>() {
            return None;
        }
        Some(MemorySnapshot {
            total_bytes,
            available_bytes: u64::try_from(unsafe { os_proc_available_memory() }).ok()?,
        })
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
mod memory {
    use super::MemorySnapshot;

    pub fn snapshot() -> Option<MemorySnapshot> {
        None
    }
}

#[cfg(all(
    target_os = "macos",
    target_arch = "aarch64",
    cuttledoc_gemma_mlx_native
))]
#[allow(unsafe_code)]
mod platform {
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::os::unix::ffi::OsStrExt;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::path::Path;
    use std::ptr::{self, NonNull};

    use super::{
        ABI_VERSION, AdapterError, AdapterErrorKind, NativeFinishReason, PlatformGenerationResult,
    };

    const STATUS_OK: i32 = 0;
    const STATUS_INVALID_INPUT: i32 = 1;
    const STATUS_LOAD_FAILED: i32 = 2;
    const STATUS_GENERATION_FAILED: i32 = 3;
    const STATUS_CANCELLED: i32 = 4;
    const STATUS_BUSY: i32 = 5;
    const FINISH_STOP: i32 = 0;
    const FINISH_LENGTH: i32 = 1;

    type TokenCallback = extern "C" fn(*mut c_void, u32) -> i32;
    type CancelCallback = extern "C" fn(*mut c_void) -> i32;

    unsafe extern "C" {
        fn cuttledoc_gemma_mlx_abi_version() -> u32;
        fn cuttledoc_gemma_mlx_session_create(
            model_directory: *const c_char,
            metallib_path: *const c_char,
            status_output: *mut i32,
            error_output: *mut *mut c_char,
        ) -> *mut c_void;
        fn cuttledoc_gemma_mlx_session_generate(
            handle: *mut c_void,
            prompt_tokens: *const u32,
            prompt_token_count: usize,
            maximum_tokens: u32,
            token_callback: TokenCallback,
            cancel_callback: CancelCallback,
            callback_context: *mut c_void,
            finish_reason_output: *mut i32,
            error_output: *mut *mut c_char,
        ) -> i32;
        fn cuttledoc_gemma_mlx_session_destroy(handle: *mut c_void);
        fn cuttledoc_gemma_mlx_free_string(value: *mut c_char);
    }

    pub struct Session {
        handle: NonNull<c_void>,
    }

    impl Session {
        pub fn create(
            model_directory: &Path,
            metallib_path: Option<&Path>,
        ) -> Result<Self, AdapterError> {
            if unsafe { cuttledoc_gemma_mlx_abi_version() } != ABI_VERSION {
                return Err(AdapterError::new(
                    AdapterErrorKind::EngineLoadFailed,
                    "linked Gemma MLX adapter ABI does not match Rust",
                ));
            }
            let model_directory =
                CString::new(model_directory.as_os_str().as_bytes()).map_err(|_| {
                    AdapterError::new(
                        AdapterErrorKind::InvalidInput,
                        "Gemma model path contains an interior NUL byte",
                    )
                })?;
            let metallib_path = metallib_path
                .map(Path::to_path_buf)
                .or_else(super::configured_metallib_path)
                .ok_or_else(|| {
                    AdapterError::new(
                        AdapterErrorKind::EngineLoadFailed,
                        format!(
                            "MLX metallib is missing; set {} or colocate mlx.metallib with the executable",
                            super::METALLIB_PATH_ENV
                        ),
                    )
                })?;
            let metallib_path =
                CString::new(metallib_path.as_os_str().as_bytes()).map_err(|_| {
                    AdapterError::new(
                        AdapterErrorKind::InvalidInput,
                        "MLX metallib path contains an interior NUL byte",
                    )
                })?;
            let mut status = STATUS_LOAD_FAILED;
            let mut error_output = ptr::null_mut();
            let handle = unsafe {
                cuttledoc_gemma_mlx_session_create(
                    model_directory.as_ptr(),
                    metallib_path.as_ptr(),
                    &mut status,
                    &mut error_output,
                )
            };
            NonNull::new(handle)
                .map(|handle| Self { handle })
                .ok_or_else(|| native_error(status, error_output, "Gemma session creation failed"))
        }

        pub fn generate(
            &mut self,
            prompt_tokens: &[u32],
            maximum_tokens: u32,
            is_cancelled: &dyn Fn() -> bool,
            on_token: &mut dyn FnMut(u32) -> Result<(), AdapterError>,
        ) -> Result<PlatformGenerationResult, AdapterError> {
            let mut callback = CallbackState {
                is_cancelled,
                on_token,
                error: None,
            };
            let mut finish_reason = FINISH_LENGTH;
            let mut error_output = ptr::null_mut();
            let status = unsafe {
                cuttledoc_gemma_mlx_session_generate(
                    self.handle.as_ptr(),
                    prompt_tokens.as_ptr(),
                    prompt_tokens.len(),
                    maximum_tokens,
                    receive_token,
                    receive_cancellation,
                    ptr::from_mut(&mut callback).cast(),
                    &mut finish_reason,
                    &mut error_output,
                )
            };
            if let Some(error) = callback.error {
                let _ = take_native_string(error_output);
                return Err(error);
            }
            if status != STATUS_OK {
                return Err(native_error(
                    status,
                    error_output,
                    "Gemma generation failed",
                ));
            }
            let finish_reason = match finish_reason {
                FINISH_STOP => NativeFinishReason::Stop,
                FINISH_LENGTH => NativeFinishReason::Length,
                _ => {
                    return Err(AdapterError::new(
                        AdapterErrorKind::GenerationFailed,
                        "Gemma returned an unknown finish reason",
                    ));
                }
            };
            Ok(PlatformGenerationResult { finish_reason })
        }
    }

    impl Drop for Session {
        fn drop(&mut self) {
            unsafe { cuttledoc_gemma_mlx_session_destroy(self.handle.as_ptr()) };
        }
    }

    struct CallbackState<'a> {
        is_cancelled: &'a dyn Fn() -> bool,
        on_token: &'a mut dyn FnMut(u32) -> Result<(), AdapterError>,
        error: Option<AdapterError>,
    }

    extern "C" fn receive_token(context: *mut c_void, token: u32) -> i32 {
        if context.is_null() {
            return 1;
        }
        let state = unsafe { &mut *context.cast::<CallbackState<'_>>() };
        match catch_unwind(AssertUnwindSafe(|| (state.on_token)(token))) {
            Ok(Ok(())) => 0,
            Ok(Err(error)) => {
                state.error = Some(error);
                1
            }
            Err(_) => {
                state.error = Some(AdapterError::new(
                    AdapterErrorKind::CallbackViolation,
                    "Gemma token callback panicked",
                ));
                1
            }
        }
    }

    extern "C" fn receive_cancellation(context: *mut c_void) -> i32 {
        if context.is_null() {
            return 1;
        }
        let state = unsafe { &*context.cast::<CallbackState<'_>>() };
        catch_unwind(AssertUnwindSafe(|| (state.is_cancelled)()))
            .unwrap_or(true)
            .into()
    }

    fn native_error(status: i32, error: *mut c_char, fallback: &str) -> AdapterError {
        let kind = match status {
            STATUS_INVALID_INPUT => AdapterErrorKind::InvalidInput,
            STATUS_LOAD_FAILED => AdapterErrorKind::EngineLoadFailed,
            STATUS_CANCELLED => AdapterErrorKind::Cancelled,
            STATUS_BUSY => AdapterErrorKind::Busy,
            STATUS_GENERATION_FAILED => AdapterErrorKind::GenerationFailed,
            _ => AdapterErrorKind::GenerationFailed,
        };
        AdapterError::new(
            kind,
            take_native_string(error).unwrap_or_else(|| fallback.to_owned()),
        )
    }

    fn take_native_string(value: *mut c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let result = unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .into_owned();
        unsafe { cuttledoc_gemma_mlx_free_string(value) };
        Some(result)
    }
}

#[cfg(not(all(
    target_os = "macos",
    target_arch = "aarch64",
    cuttledoc_gemma_mlx_native
)))]
mod platform {
    use std::path::Path;

    use super::{
        AdapterError, AdapterErrorKind, BuildSupport, PlatformGenerationResult, build_support,
    };

    pub struct Session;

    impl Session {
        pub fn create(
            _model_directory: &Path,
            _metallib_path: Option<&Path>,
        ) -> Result<Self, AdapterError> {
            let (kind, message) = match build_support() {
                BuildSupport::UnsupportedPlatform => (
                    AdapterErrorKind::UnsupportedPlatform,
                    "Gemma MLX requires macOS on Apple Silicon",
                ),
                BuildSupport::SourceNotPrepared => (
                    AdapterErrorKind::SourceNotPrepared,
                    "Gemma MLX was not included in this build; prepare the pinned official MLX source",
                ),
                BuildSupport::Native => {
                    unreachable!("native build uses the native platform module")
                }
            };
            Err(AdapterError::new(kind, message))
        }

        pub fn generate(
            &mut self,
            _prompt_tokens: &[u32],
            _maximum_tokens: u32,
            _is_cancelled: &dyn Fn() -> bool,
            _on_token: &mut dyn FnMut(u32) -> Result<(), AdapterError>,
        ) -> Result<PlatformGenerationResult, AdapterError> {
            Err(AdapterError::new(
                AdapterErrorKind::UnsupportedPlatform,
                "Gemma MLX is unavailable in this build",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GIB: u64 = 1_024 * 1_024 * 1_024;

    #[test]
    fn memory_gate_requires_both_capacity_and_current_headroom() {
        assert!(matches!(
            evaluate_memory(MemorySnapshot {
                total_bytes: 24 * GIB,
                available_bytes: 24 * GIB,
            }),
            MemoryGate::InsufficientTotal { .. }
        ));
        assert!(matches!(
            evaluate_memory(MemorySnapshot {
                total_bytes: 64 * GIB,
                available_bytes: 20 * GIB,
            }),
            MemoryGate::InsufficientHeadroom { .. }
        ));
        assert_eq!(
            evaluate_memory(MemorySnapshot {
                total_bytes: 32 * GIB,
                available_bytes: REQUIRED_AVAILABLE_MEMORY_BYTES,
            }),
            MemoryGate::Ready
        );
    }

    #[test]
    fn chat_renderer_matches_the_pinned_non_thinking_template_subset() {
        let rendered = render_chat(&[
            ChatMessage {
                role: ChatRole::System,
                content: " Stay bounded. ".to_owned(),
            },
            ChatMessage {
                role: ChatRole::User,
                content: " Correct this. ".to_owned(),
            },
        ])
        .expect("valid chat");
        assert_eq!(
            rendered,
            "<bos><|turn>system\nStay bounded.<turn|>\n<|turn>user\nCorrect this.<turn|>\n<|turn>model\n<|channel>thought\n<channel|>"
        );
    }

    #[test]
    fn chat_renderer_rejects_ambiguous_conversations() {
        for messages in [
            Vec::new(),
            vec![ChatMessage {
                role: ChatRole::Assistant,
                content: "answer".to_owned(),
            }],
            vec![
                ChatMessage {
                    role: ChatRole::User,
                    content: "one".to_owned(),
                },
                ChatMessage {
                    role: ChatRole::User,
                    content: "two".to_owned(),
                },
            ],
        ] {
            assert!(render_chat(&messages).is_err());
        }
    }

    #[test]
    fn missing_model_is_reported_before_native_work() {
        let missing = std::env::temp_dir().join(format!(
            "cuttledoc-missing-gemma-model-{}",
            std::process::id()
        ));
        assert_eq!(
            validate_model(&missing)
                .expect_err("model must be missing")
                .kind,
            AdapterErrorKind::ModelMissing
        );
    }

    #[test]
    fn build_support_matches_the_compiled_boundary() {
        let expected = if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            BuildSupport::UnsupportedPlatform
        } else if cfg!(cuttledoc_gemma_mlx_native) {
            BuildSupport::Native
        } else {
            BuildSupport::SourceNotPrepared
        };
        assert_eq!(build_support(), expected);
    }
}

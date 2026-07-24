use std::error::Error;
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NativeTimeRange {
    pub start_ms: u64,
    pub end_ms: u64,
}

impl NativeTimeRange {
    pub const fn is_valid(self) -> bool {
        self.start_ms < self.end_ms
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeSegment {
    pub range: NativeTimeRange,
    pub text: String,
    pub confidence: Option<f32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeStability {
    Volatile,
    Final,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeUpdateKind {
    Replace {
        segments: Vec<NativeSegment>,
        stability: NativeStability,
    },
    Revoke,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeTranscriptionUpdate {
    pub sequence: u64,
    pub affected_range: NativeTimeRange,
    pub text: String,
    pub kind: NativeUpdateKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PushOutcome {
    Accepted,
    WouldBlock,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterErrorKind {
    UnsupportedPlatform,
    InvalidInput,
    SessionCreateFailed,
    NativeFailure,
    SessionClosed,
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

#[cfg(any(target_os = "macos", test))]
fn validate_pcm(samples: &[f32]) -> Result<(), AdapterError> {
    if samples.is_empty() {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "PCM chunk must not be empty",
        ));
    }
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err(AdapterError::new(
            AdapterErrorKind::InvalidInput,
            "PCM chunk must contain only finite samples",
        ));
    }
    Ok(())
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod platform {
    use std::collections::BTreeMap;
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::ptr::{self, NonNull};
    use std::sync::Mutex;

    use super::{
        AdapterError, AdapterErrorKind, NativeSegment, NativeStability, NativeTimeRange,
        NativeTranscriptionUpdate, NativeUpdateKind, PushOutcome, validate_pcm,
    };

    const UPDATE_REPLACE: i32 = 1;
    const UPDATE_REVOKE: i32 = 2;
    const STABILITY_NONE: i32 = 0;
    const STABILITY_VOLATILE: i32 = 1;
    const STABILITY_FINAL: i32 = 2;
    const PUSH_OK: i32 = 0;
    const PUSH_NATIVE_FAILURE: i32 = 1;
    const PUSH_INVALID_INPUT: i32 = 2;
    const PUSH_SESSION_CLOSED: i32 = 3;
    const PUSH_WOULD_BLOCK: i32 = 4;

    type SegmentCallback = extern "C" fn(*mut c_void, u64, i64, i64, *const c_char, u8, f64);
    type UpdateCallback = extern "C" fn(*mut c_void, u64, i32, i32, i64, i64, *const c_char);

    unsafe extern "C" {
        fn cuttledoc_speech_session_create(
            locale: *const c_char,
            sample_rate: u32,
            segment_callback: SegmentCallback,
            update_callback: UpdateCallback,
            callback_context: *mut c_void,
            resolved_locale: *mut *mut c_char,
            error_output: *mut *mut c_char,
        ) -> *mut c_void;
        fn cuttledoc_speech_session_push_pcm_f32(
            handle: *mut c_void,
            samples: *const f32,
            sample_count: u32,
        ) -> i32;
        fn cuttledoc_speech_session_finish(
            handle: *mut c_void,
            error_output: *mut *mut c_char,
        ) -> i32;
        fn cuttledoc_speech_session_cancel(handle: *mut c_void);
        fn cuttledoc_speech_session_destroy(handle: *mut c_void);
        fn cuttledoc_speech_free_string(value: *mut c_char);
    }

    #[derive(Debug, Default)]
    struct CallbackState {
        pending_segments: BTreeMap<u64, Vec<NativeSegment>>,
        updates: Vec<NativeTranscriptionUpdate>,
        error: Option<String>,
    }

    impl CallbackState {
        fn fail(&mut self, message: impl Into<String>) {
            if self.error.is_none() {
                self.error = Some(message.into());
            }
        }
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum SessionState {
        Active,
        Finished,
        Cancelled,
        Closed,
    }

    #[derive(Debug)]
    pub struct SpeechSession {
        handle: Option<NonNull<c_void>>,
        callbacks: Box<Mutex<CallbackState>>,
        resolved_locale: String,
        state: SessionState,
    }

    impl SpeechSession {
        pub fn create(locale: &str, sample_rate: u32) -> Result<Self, AdapterError> {
            if sample_rate == 0 {
                return Err(AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "sample rate must be greater than zero",
                ));
            }
            let locale = CString::new(locale).map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "locale must not contain a NUL byte",
                )
            })?;
            let mut callbacks = Box::new(Mutex::new(CallbackState::default()));
            let callback_context =
                ptr::from_mut::<Mutex<CallbackState>>(&mut *callbacks).cast::<c_void>();
            let mut resolved_locale = ptr::null_mut();
            let mut error_output = ptr::null_mut();
            let raw_handle = unsafe {
                cuttledoc_speech_session_create(
                    locale.as_ptr(),
                    sample_rate,
                    receive_segment,
                    receive_update,
                    callback_context,
                    &mut resolved_locale,
                    &mut error_output,
                )
            };
            let Some(handle) = NonNull::new(raw_handle) else {
                let message = take_native_string(error_output)
                    .unwrap_or_else(|| "session creation failed without an error".to_owned());
                return Err(AdapterError::new(
                    AdapterErrorKind::SessionCreateFailed,
                    message,
                ));
            };

            let Some(resolved_locale) = take_native_string(resolved_locale) else {
                unsafe {
                    cuttledoc_speech_session_destroy(handle.as_ptr());
                }
                return Err(AdapterError::new(
                    AdapterErrorKind::NativeFailure,
                    "session creation returned no resolved locale",
                ));
            };
            Ok(Self {
                handle: Some(handle),
                callbacks,
                resolved_locale,
                state: SessionState::Active,
            })
        }

        pub fn resolved_locale(&self) -> Option<&str> {
            Some(&self.resolved_locale)
        }

        pub fn push(&mut self, samples: &[f32]) -> Result<PushOutcome, AdapterError> {
            let handle = self.active_handle()?;
            validate_pcm(samples)?;
            let sample_count = u32::try_from(samples.len()).map_err(|_| {
                AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "PCM chunk exceeds the native u32 sample limit",
                )
            })?;
            let status = unsafe {
                cuttledoc_speech_session_push_pcm_f32(
                    handle.as_ptr(),
                    samples.as_ptr(),
                    sample_count,
                )
            };
            match status {
                PUSH_OK => Ok(PushOutcome::Accepted),
                PUSH_WOULD_BLOCK => Ok(PushOutcome::WouldBlock),
                PUSH_INVALID_INPUT => Err(AdapterError::new(
                    AdapterErrorKind::InvalidInput,
                    "native adapter rejected the PCM chunk",
                )),
                PUSH_SESSION_CLOSED => Err(AdapterError::new(
                    AdapterErrorKind::SessionClosed,
                    "native session no longer accepts PCM",
                )),
                PUSH_NATIVE_FAILURE => Err(AdapterError::new(
                    AdapterErrorKind::NativeFailure,
                    "native adapter could not allocate or enqueue PCM",
                )),
                other => Err(AdapterError::new(
                    AdapterErrorKind::NativeFailure,
                    format!("native adapter returned unknown push status {other}"),
                )),
            }
        }

        pub fn take_updates(&mut self) -> Result<Vec<NativeTranscriptionUpdate>, AdapterError> {
            self.drain_updates(false)
        }

        fn drain_updates(
            &mut self,
            require_complete: bool,
        ) -> Result<Vec<NativeTranscriptionUpdate>, AdapterError> {
            let mut callbacks = lock_callback_state(&self.callbacks);
            if let Some(message) = callbacks.error.take() {
                return Err(AdapterError::new(
                    AdapterErrorKind::CallbackViolation,
                    message,
                ));
            }
            if require_complete && !callbacks.pending_segments.is_empty() {
                let sequences = callbacks
                    .pending_segments
                    .keys()
                    .map(u64::to_string)
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(AdapterError::new(
                    AdapterErrorKind::CallbackViolation,
                    format!("finish left segments without updates for sequences {sequences}"),
                ));
            }
            Ok(std::mem::take(&mut callbacks.updates))
        }

        pub fn finish(&mut self) -> Result<Vec<NativeTranscriptionUpdate>, AdapterError> {
            let handle = self.active_handle()?;
            let mut error_output = ptr::null_mut();
            let status =
                unsafe { cuttledoc_speech_session_finish(handle.as_ptr(), &mut error_output) };
            self.state = SessionState::Finished;
            if status != 0 {
                let message = take_native_string(error_output)
                    .unwrap_or_else(|| format!("native finish failed with status {status}"));
                return Err(AdapterError::new(AdapterErrorKind::NativeFailure, message));
            }
            self.drain_updates(true)
        }

        pub fn cancel(&mut self) {
            if self.state != SessionState::Active {
                return;
            }
            if let Some(handle) = self.handle {
                unsafe {
                    cuttledoc_speech_session_cancel(handle.as_ptr());
                }
            }
            self.state = SessionState::Cancelled;
        }

        pub fn close(&mut self) {
            if let Some(handle) = self.handle.take() {
                unsafe {
                    cuttledoc_speech_session_destroy(handle.as_ptr());
                }
            }
            self.state = SessionState::Closed;
        }

        fn active_handle(&self) -> Result<NonNull<c_void>, AdapterError> {
            if self.state != SessionState::Active {
                return Err(AdapterError::new(
                    AdapterErrorKind::SessionClosed,
                    "speech session is not active",
                ));
            }
            self.handle.ok_or_else(|| {
                AdapterError::new(
                    AdapterErrorKind::SessionClosed,
                    "speech session has no native handle",
                )
            })
        }
    }

    impl Drop for SpeechSession {
        fn drop(&mut self) {
            self.close();
        }
    }

    extern "C" fn receive_segment(
        context: *mut c_void,
        sequence: u64,
        start_ms: i64,
        end_ms: i64,
        text: *const c_char,
        has_confidence: u8,
        confidence: f64,
    ) {
        let Some(callbacks) = callback_state(context) else {
            return;
        };
        let mut callbacks = lock_callback_state(callbacks);
        let Some(range) = native_range(start_ms, end_ms) else {
            callbacks.fail(format!(
                "segment {sequence} has invalid range {start_ms}..{end_ms}"
            ));
            return;
        };
        let Some(text) = borrowed_string(text) else {
            callbacks.fail(format!("segment {sequence} has invalid UTF-8 text"));
            return;
        };
        let confidence = if has_confidence == 0 {
            None
        } else if confidence.is_finite() {
            Some(confidence as f32)
        } else {
            callbacks.fail(format!("segment {sequence} has non-finite confidence"));
            return;
        };
        callbacks
            .pending_segments
            .entry(sequence)
            .or_default()
            .push(NativeSegment {
                range,
                text,
                confidence,
            });
    }

    extern "C" fn receive_update(
        context: *mut c_void,
        sequence: u64,
        kind: i32,
        stability: i32,
        start_ms: i64,
        end_ms: i64,
        text: *const c_char,
    ) {
        let Some(callbacks) = callback_state(context) else {
            return;
        };
        let mut callbacks = lock_callback_state(callbacks);
        let Some(affected_range) = native_range(start_ms, end_ms) else {
            callbacks.fail(format!(
                "update {sequence} has invalid affected range {start_ms}..{end_ms}"
            ));
            return;
        };
        let Some(text) = borrowed_string(text) else {
            callbacks.fail(format!("update {sequence} has invalid UTF-8 text"));
            return;
        };
        let mut segments = callbacks
            .pending_segments
            .remove(&sequence)
            .unwrap_or_default();

        let update_kind = match kind {
            UPDATE_REPLACE => {
                let stability = match stability {
                    STABILITY_VOLATILE => NativeStability::Volatile,
                    STABILITY_FINAL => NativeStability::Final,
                    other => {
                        callbacks.fail(format!(
                            "replace update {sequence} has unknown stability {other}"
                        ));
                        return;
                    }
                };
                if segments.is_empty() && !text.is_empty() {
                    segments.push(NativeSegment {
                        range: affected_range,
                        text: text.clone(),
                        confidence: None,
                    });
                }
                NativeUpdateKind::Replace {
                    segments,
                    stability,
                }
            }
            UPDATE_REVOKE if stability == STABILITY_NONE => {
                if !segments.is_empty() {
                    callbacks.fail(format!(
                        "revoke update {sequence} unexpectedly received segments"
                    ));
                    return;
                }
                NativeUpdateKind::Revoke
            }
            UPDATE_REVOKE => {
                callbacks.fail(format!(
                    "revoke update {sequence} has unexpected stability {stability}"
                ));
                return;
            }
            other => {
                callbacks.fail(format!("update {sequence} has unknown kind {other}"));
                return;
            }
        };

        callbacks.updates.push(NativeTranscriptionUpdate {
            sequence,
            affected_range,
            text,
            kind: update_kind,
        });
    }

    fn callback_state(context: *mut c_void) -> Option<&'static Mutex<CallbackState>> {
        if context.is_null() {
            return None;
        }
        Some(unsafe { &*context.cast::<Mutex<CallbackState>>() })
    }

    fn lock_callback_state(
        callbacks: &Mutex<CallbackState>,
    ) -> std::sync::MutexGuard<'_, CallbackState> {
        callbacks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn native_range(start_ms: i64, end_ms: i64) -> Option<NativeTimeRange> {
        let range = NativeTimeRange {
            start_ms: u64::try_from(start_ms).ok()?,
            end_ms: u64::try_from(end_ms).ok()?,
        };
        range.is_valid().then_some(range)
    }

    fn borrowed_string(value: *const c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        unsafe { CStr::from_ptr(value) }
            .to_str()
            .ok()
            .map(str::to_owned)
    }

    fn take_native_string(value: *mut c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let message = unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .into_owned();
        unsafe {
            cuttledoc_speech_free_string(value);
        }
        Some(message)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn typed_callbacks_reconstruct_a_complete_update() {
            let callbacks = Mutex::new(CallbackState::default());
            let context = ptr::from_ref(&callbacks).cast_mut().cast::<c_void>();
            let segment_text = CString::new("hello").expect("valid C string");
            receive_segment(context, 1, 0, 500, segment_text.as_ptr(), 1, 0.875);
            let update_text = CString::new("hello").expect("valid C string");
            receive_update(
                context,
                1,
                UPDATE_REPLACE,
                STABILITY_FINAL,
                0,
                500,
                update_text.as_ptr(),
            );

            let callbacks = lock_callback_state(&callbacks);
            assert_eq!(callbacks.error, None);
            assert_eq!(
                callbacks.updates,
                vec![NativeTranscriptionUpdate {
                    sequence: 1,
                    affected_range: NativeTimeRange {
                        start_ms: 0,
                        end_ms: 500,
                    },
                    text: "hello".to_owned(),
                    kind: NativeUpdateKind::Replace {
                        segments: vec![NativeSegment {
                            range: NativeTimeRange {
                                start_ms: 0,
                                end_ms: 500,
                            },
                            text: "hello".to_owned(),
                            confidence: Some(0.875),
                        }],
                        stability: NativeStability::Final,
                    },
                }]
            );
        }

        #[test]
        fn invalid_callback_data_becomes_a_contract_error() {
            let callbacks = Mutex::new(CallbackState::default());
            let context = ptr::from_ref(&callbacks).cast_mut().cast::<c_void>();
            let text = CString::new("invalid").expect("valid C string");
            receive_update(
                context,
                1,
                UPDATE_REPLACE,
                STABILITY_FINAL,
                -1,
                500,
                text.as_ptr(),
            );

            let callbacks = lock_callback_state(&callbacks);
            assert_eq!(callbacks.updates, Vec::new());
            assert!(
                callbacks
                    .error
                    .as_deref()
                    .is_some_and(|error| error.contains("invalid affected range"))
            );
        }
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub use platform::SpeechSession;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
#[derive(Debug)]
pub struct SpeechSession;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
impl SpeechSession {
    pub fn create(_locale: &str, _sample_rate: u32) -> Result<Self, AdapterError> {
        Err(AdapterError::new(
            AdapterErrorKind::UnsupportedPlatform,
            "Apple Speech requires macOS 26 or newer on Apple Silicon",
        ))
    }

    pub fn resolved_locale(&self) -> Option<&str> {
        None
    }

    pub fn push(&mut self, _samples: &[f32]) -> Result<PushOutcome, AdapterError> {
        Err(AdapterError::new(
            AdapterErrorKind::UnsupportedPlatform,
            "Apple Speech is unavailable on this platform",
        ))
    }

    pub fn take_updates(&mut self) -> Result<Vec<NativeTranscriptionUpdate>, AdapterError> {
        Err(AdapterError::new(
            AdapterErrorKind::UnsupportedPlatform,
            "Apple Speech is unavailable on this platform",
        ))
    }

    pub fn finish(&mut self) -> Result<Vec<NativeTranscriptionUpdate>, AdapterError> {
        Err(AdapterError::new(
            AdapterErrorKind::UnsupportedPlatform,
            "Apple Speech is unavailable on this platform",
        ))
    }

    pub fn cancel(&mut self) {}

    pub fn close(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_validation_rejects_values_that_cannot_cross_the_swift_conversion() {
        assert!(validate_pcm(&[]).is_err());
        assert!(validate_pcm(&[f32::NAN]).is_err());
        assert!(validate_pcm(&[f32::INFINITY]).is_err());
        assert!(validate_pcm(&[-1.0, 0.0, 1.0]).is_ok());
    }
}

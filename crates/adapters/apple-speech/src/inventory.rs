#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LocaleInventory {
    pub supported: Vec<String>,
    pub installed: Vec<String>,
    pub reserved: Vec<String>,
    pub maximum_reserved: u32,
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod platform {
    use std::ffi::{CStr, c_char, c_void};
    use std::ptr;

    use super::LocaleInventory;
    use crate::{AdapterError, AdapterErrorKind};

    const LOCALE_SUPPORTED: i32 = 1;
    const LOCALE_INSTALLED: i32 = 2;
    const LOCALE_RESERVED: i32 = 3;

    type LocaleCallback = extern "C" fn(*mut c_void, i32, *const c_char);

    unsafe extern "C" {
        fn cuttledoc_speech_locale_inventory(
            callback: LocaleCallback,
            callback_context: *mut c_void,
            maximum_reserved_locales: *mut u32,
            error_output: *mut *mut c_char,
        ) -> i32;
        fn cuttledoc_speech_free_string(value: *mut c_char);
    }

    #[derive(Debug, Default)]
    struct CallbackState {
        inventory: LocaleInventory,
        error: Option<String>,
    }

    pub fn locale_inventory() -> Result<LocaleInventory, AdapterError> {
        let mut state = CallbackState::default();
        let context = ptr::from_mut(&mut state).cast::<c_void>();
        let mut maximum_reserved = 0;
        let mut error_output = ptr::null_mut();
        let status = unsafe {
            cuttledoc_speech_locale_inventory(
                receive_locale,
                context,
                &mut maximum_reserved,
                &mut error_output,
            )
        };
        if status != 0 {
            let message = take_native_string(error_output)
                .unwrap_or_else(|| format!("locale inventory failed with status {status}"));
            return Err(AdapterError::new(
                AdapterErrorKind::InventoryFailed,
                message,
            ));
        }
        if let Some(message) = state.error {
            return Err(AdapterError::new(
                AdapterErrorKind::CallbackViolation,
                message,
            ));
        }
        state.inventory.maximum_reserved = maximum_reserved;
        normalize(&mut state.inventory.supported);
        normalize(&mut state.inventory.installed);
        normalize(&mut state.inventory.reserved);
        Ok(state.inventory)
    }

    extern "C" fn receive_locale(context: *mut c_void, kind: i32, locale: *const c_char) {
        if context.is_null() {
            return;
        }
        let state = unsafe { &mut *context.cast::<CallbackState>() };
        if state.error.is_some() {
            return;
        }
        let Some(locale) = borrowed_string(locale) else {
            state.error = Some("locale inventory returned invalid UTF-8".to_owned());
            return;
        };
        match kind {
            LOCALE_SUPPORTED => state.inventory.supported.push(locale),
            LOCALE_INSTALLED => state.inventory.installed.push(locale),
            LOCALE_RESERVED => state.inventory.reserved.push(locale),
            other => {
                state.error = Some(format!(
                    "locale inventory returned unknown locale kind {other}"
                ));
            }
        }
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

    fn normalize(locales: &mut Vec<String>) {
        locales.sort_unstable();
        locales.dedup();
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub use platform::locale_inventory;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
pub fn locale_inventory() -> Result<LocaleInventory, crate::AdapterError> {
    Err(crate::AdapterError::new(
        crate::AdapterErrorKind::UnsupportedPlatform,
        "Apple Speech requires macOS 26 or newer on Apple Silicon",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AdapterErrorKind;

    #[test]
    fn unsupported_platform_is_explicit() {
        if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            return;
        }
        let error = locale_inventory().expect_err("unsupported host must fail");
        assert_eq!(error.kind, AdapterErrorKind::UnsupportedPlatform);
    }
}

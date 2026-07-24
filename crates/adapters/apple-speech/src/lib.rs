//! Private platform boundary for the Apple SpeechTranscriber adapter.
//!
//! This crate deliberately exposes no Apple framework types. The Swift C ABI
//! implementation will remain owned here when the Phase 2 vertical slice is
//! added.

pub const BACKEND_ID: &str = "apple-speech";
pub const ABI_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BuildSupport {
    SupportedHost,
    UnsupportedHost,
}

pub const fn build_support() -> BuildSupport {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        BuildSupport::SupportedHost
    } else {
        BuildSupport::UnsupportedHost
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod native {
    unsafe extern "C" {
        fn cuttledoc_speech_abi_version() -> u32;
    }

    pub fn abi_version() -> u32 {
        // SAFETY: The symbol is linked from the repository-owned Swift static
        // library. It takes no pointers and has no state or ownership effects.
        unsafe { cuttledoc_speech_abi_version() }
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn linked_abi_version() -> Option<u32> {
    Some(native::abi_version())
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
pub const fn linked_abi_version() -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_gate_matches_the_supported_baseline() {
        let expected = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            BuildSupport::SupportedHost
        } else {
            BuildSupport::UnsupportedHost
        };
        assert_eq!(build_support(), expected);
    }

    #[test]
    fn native_abi_matches_the_rust_boundary() {
        let expected = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            Some(ABI_VERSION)
        } else {
            None
        };
        assert_eq!(linked_abi_version(), expected);
    }
}

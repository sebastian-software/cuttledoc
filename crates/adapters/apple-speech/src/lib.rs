//! Private platform boundary for the Apple SpeechTranscriber adapter.
//!
//! This crate deliberately exposes no Apple framework types. The Swift C ABI
//! implementation will remain owned here when the Phase 2 vertical slice is
//! added.

pub const BACKEND_ID: &str = "apple-speech";

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
}

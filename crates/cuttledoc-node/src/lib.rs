use cuttledoc::{Availability, recognition_capabilities};
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendCapability {
    pub id: String,
    pub available: bool,
    #[napi(js_name = "unavailableReason")]
    pub unavailable_reason: Option<String>,
}

#[napi]
pub fn version() -> String {
    cuttledoc::VERSION.to_owned()
}

#[napi(js_name = "recognitionBackends")]
pub fn recognition_backends() -> Vec<BackendCapability> {
    recognition_capabilities()
        .into_iter()
        .map(|capability| {
            let (available, unavailable_reason) = match capability.availability {
                Availability::Available => (true, None),
                Availability::Unavailable { reason, .. } => {
                    (false, Some(reason.as_str().to_owned()))
                }
            };
            BackendCapability {
                id: capability.backend.to_string(),
                available,
                unavailable_reason,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_boundary_uses_the_rust_capability_source() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
        assert_eq!(
            recognition_backends(),
            vec![BackendCapability {
                id: "apple-speech".to_owned(),
                available: false,
                unavailable_reason: Some(
                    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
                        "native_component_unavailable"
                    } else {
                        "unsupported_platform"
                    }
                    .to_owned()
                ),
            }]
        );
    }
}

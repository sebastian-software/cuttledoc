#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArtifactManifest {
    pub path: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
    pub url: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ModelManifest {
    pub id: &'static str,
    pub manifest_id: &'static str,
    pub provider: &'static str,
    pub revision: &'static str,
    pub artifacts: &'static [ArtifactManifest],
}

impl ModelManifest {
    pub fn total_bytes(self) -> u64 {
        self.artifacts.iter().map(|artifact| artifact.bytes).sum()
    }
}

const WHISPER_ARTIFACTS: &[ArtifactManifest] = &[
    ArtifactManifest {
        path: "ggml-large-v3-turbo.bin",
        bytes: 1_624_555_275,
        sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin",
    },
    ArtifactManifest {
        path: "ggml-large-v3-turbo-encoder.mlmodelc/analytics/coremldata.bin",
        bytes: 243,
        sha256: "a207b44aef13857e63631fd0e898c595f6147a8016b0b368d81bf8f84c9b3fbc",
        url: "https://huggingface.co/sebastian-software/whisper-coreml-models/resolve/dd3515371e6b560b63ec275abf020153a45caa60/ggml-large-v3-turbo-encoder.mlmodelc/analytics/coremldata.bin",
    },
    ArtifactManifest {
        path: "ggml-large-v3-turbo-encoder.mlmodelc/coremldata.bin",
        bytes: 380,
        sha256: "6518bbdf3ccd178e703f839c37f287995826ce6f9ba977057121c8497426bc90",
        url: "https://huggingface.co/sebastian-software/whisper-coreml-models/resolve/dd3515371e6b560b63ec275abf020153a45caa60/ggml-large-v3-turbo-encoder.mlmodelc/coremldata.bin",
    },
    ArtifactManifest {
        path: "ggml-large-v3-turbo-encoder.mlmodelc/metadata.json",
        bytes: 1_866,
        sha256: "9c7444439b70609a0bd8aad3d624f3d491d1e19beefbc748f7f22c6a2ea0e8ea",
        url: "https://huggingface.co/sebastian-software/whisper-coreml-models/resolve/dd3515371e6b560b63ec275abf020153a45caa60/ggml-large-v3-turbo-encoder.mlmodelc/metadata.json",
    },
    ArtifactManifest {
        path: "ggml-large-v3-turbo-encoder.mlmodelc/model.mil",
        bytes: 1_148_534,
        sha256: "7df4ffa5df99643d58d8b66ef7f61aeb320d29210785830a640fd4f7da9eccac",
        url: "https://huggingface.co/sebastian-software/whisper-coreml-models/resolve/dd3515371e6b560b63ec275abf020153a45caa60/ggml-large-v3-turbo-encoder.mlmodelc/model.mil",
    },
    ArtifactManifest {
        path: "ggml-large-v3-turbo-encoder.mlmodelc/weights/weight.bin",
        bytes: 1_273_969_152,
        sha256: "fcc450fb244d55335f6df82a41558de1b07d44acaf67c7b7b3040da44f94bdd3",
        url: "https://huggingface.co/sebastian-software/whisper-coreml-models/resolve/dd3515371e6b560b63ec275abf020153a45caa60/ggml-large-v3-turbo-encoder.mlmodelc/weights/weight.bin",
    },
];

const GEMMA_ARTIFACTS: &[ArtifactManifest] = &[
    ArtifactManifest {
        path: "chat_template.jinja",
        bytes: 17_466,
        sha256: "36e3a42e5cf14cd0020e72d92e1fdd9970f59b82170e421f0cbe1bb42bead3f0",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/chat_template.jinja",
    },
    ArtifactManifest {
        path: "config.json",
        bytes: 12_180,
        sha256: "419e13a27ec359654c1ce7dd06d1a87149fd07d0c8af9f770494185e62e1b2ba",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/config.json",
    },
    ArtifactManifest {
        path: "generation_config.json",
        bytes: 208,
        sha256: "d4226bbe3117d2d253ba4609720ba82c6c4ce4627a9a6ae05387c78983ac03de",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/generation_config.json",
    },
    ArtifactManifest {
        path: "model-00001-of-00003.safetensors",
        bytes: 5_320_218_487,
        sha256: "683f420ee09550b8027bf0335c4202e196b37eb520b60a4bcbe8690b9e388c07",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/model-00001-of-00003.safetensors",
    },
    ArtifactManifest {
        path: "model-00002-of-00003.safetensors",
        bytes: 5_363_328_422,
        sha256: "feab2873c2976fb7ed666f8462549564a29409364388e0c8f6b015729d165e15",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/model-00002-of-00003.safetensors",
    },
    ArtifactManifest {
        path: "model-00003-of-00003.safetensors",
        bytes: 4_657_658_867,
        sha256: "bc607486deb1de5bc7e459932fda5c776a4f816b368feaa661bab8cfbb47e567",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/model-00003-of-00003.safetensors",
    },
    ArtifactManifest {
        path: "model.safetensors.index.json",
        bytes: 176_940,
        sha256: "bf198c9f5ea6462addca1966e5dd669c407537a876e82cf06db9084c5c850b13",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/model.safetensors.index.json",
    },
    ArtifactManifest {
        path: "processor_config.json",
        bytes: 1_316,
        sha256: "de3e580aebdc98272d4c4547daffe6525fcbae18a83a0e0bcf0d7444d4ee6f37",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/processor_config.json",
    },
    ArtifactManifest {
        path: "tokenizer.json",
        bytes: 32_169_626,
        sha256: "cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/tokenizer.json",
    },
    ArtifactManifest {
        path: "tokenizer_config.json",
        bytes: 2_740,
        sha256: "080d9e1aff284e2f6043889cd05367966f7c7b80e025fbc0b06745e218158656",
        url: "https://huggingface.co/mlx-community/gemma-4-26b-a4b-it-4bit/resolve/0d77464eeb233a2da68ebf9d7dc4edaac7db956d/tokenizer_config.json",
    },
];

pub const BUILT_IN_MANIFESTS: &[ModelManifest] = &[
    ModelManifest {
        id: "whisper-large-v3-turbo",
        manifest_id: "whisper-large-v3-turbo-ggml-coreml-v1",
        provider: "hugging-face",
        revision: "ggerganov/whisper.cpp@5359861c739e955e79d9a303bcbc70fb988958b1 + sebastian-software/whisper-coreml-models@dd3515371e6b560b63ec275abf020153a45caa60",
        artifacts: WHISPER_ARTIFACTS,
    },
    ModelManifest {
        id: "gemma-4-26b-a4b-it-4bit",
        manifest_id: "gemma-4-26b-a4b-it-4bit-mlx-v1",
        provider: "hugging-face",
        revision: "mlx-community/gemma-4-26b-a4b-it-4bit@0d77464eeb233a2da68ebf9d7dc4edaac7db956d",
        artifacts: GEMMA_ARTIFACTS,
    },
];

pub fn built_in_manifest(id: &str) -> Option<&'static ModelManifest> {
    BUILT_IN_MANIFESTS.iter().find(|manifest| manifest.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_manifests_pin_complete_known_snapshots() {
        let whisper = built_in_manifest("whisper-large-v3-turbo").expect("Whisper manifest");
        assert_eq!(whisper.artifacts.len(), 6);
        assert_eq!(whisper.total_bytes(), 2_899_675_450);

        let gemma = built_in_manifest("gemma-4-26b-a4b-it-4bit").expect("Gemma manifest");
        assert_eq!(gemma.artifacts.len(), 10);
        assert_eq!(gemma.total_bytes(), 15_373_586_252);
    }
}

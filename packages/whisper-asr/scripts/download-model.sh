#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PACKAGE_DIR/../../models"
VENDOR_DIR="$PACKAGE_DIR/vendor/whisper.cpp"

# Default model
MODEL="${1:-large-v3-turbo}"

echo "Downloading Whisper model: $MODEL"

# Use whisper.cpp's download script
cd "$VENDOR_DIR"
bash ./models/download-ggml-model.sh "$MODEL"

# Create symlink in our models directory
mkdir -p "$MODELS_DIR/whisper"
GGML_MODEL="$VENDOR_DIR/models/ggml-$MODEL.bin"

if [ -f "$GGML_MODEL" ]; then
    cp "$GGML_MODEL" "$MODELS_DIR/whisper/"
    echo ""
    echo "Model downloaded to: $MODELS_DIR/whisper/ggml-$MODEL.bin"
else
    echo "Error: Model file not found at $GGML_MODEL"
    exit 1
fi

# Generate CoreML model for encoder acceleration
echo ""
echo "To enable CoreML acceleration, generate the CoreML encoder model:"
echo ""
echo "  cd $VENDOR_DIR"
echo "  pip install ane_transformers openai-whisper coremltools"
echo "  ./models/generate-coreml-model.sh $MODEL"
echo ""
echo "This will create: models/ggml-$MODEL-encoder.mlmodelc"


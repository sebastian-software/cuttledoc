#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$PACKAGE_DIR/vendor"
WHISPER_VERSION="v1.7.3"

echo "Preparing whisper.cpp for @cuttledoc/whisper-asr..."

# Clone whisper.cpp if not exists
if [ ! -d "$VENDOR_DIR/whisper.cpp" ]; then
    echo "Cloning whisper.cpp $WHISPER_VERSION..."
    mkdir -p "$VENDOR_DIR"
    git clone --depth 1 --branch "$WHISPER_VERSION" \
        https://github.com/ggerganov/whisper.cpp.git \
        "$VENDOR_DIR/whisper.cpp"
else
    echo "whisper.cpp already exists in vendor/"
fi

# Build whisper.cpp with CoreML support
echo "Building whisper.cpp with CoreML support..."
cd "$VENDOR_DIR/whisper.cpp"

# Clean previous builds
rm -rf build

# Configure with Metal GPU (CoreML is optional, requires separate model files)
# To enable CoreML: set -DWHISPER_COREML=ON and generate CoreML models
cmake -B build \
    -DWHISPER_COREML=OFF \
    -DWHISPER_METAL=ON \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_EXAMPLES=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build build -j$(sysctl -n hw.ncpu) --config Release

echo "whisper.cpp built successfully!"
echo ""
echo "Static library: $VENDOR_DIR/whisper.cpp/build/src/libwhisper.a"
echo ""
echo "Next step: Run 'npm run download:model' to download a Whisper model"


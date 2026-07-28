#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
source_dir=${CUTTLEDOC_MLX_SOURCE_DIR:?set CUTTLEDOC_MLX_SOURCE_DIR to MLX v0.31.2 or v0.32.0}
model_dir=${CUTTLEDOC_MLX_MODEL_DIR:-"$HOME/.cache/cuttledoc/mlx-whisper-tiny"}
source_fixture=${CUTTLEDOC_MLX_FIXTURE:-"$root/../cuttledoc/packages/cuttledoc/fixtures/fleurs-en-000.ogg"}
language=${CUTTLEDOC_MLX_LANGUAGE:-en}
lifecycle_count=${CUTTLEDOC_MLX_LIFECYCLES:-3}
runs_per_lifecycle=${CUTTLEDOC_MLX_RUNS_PER_LIFECYCLE:-2}
actual_commit=$(git -C "$source_dir" rev-parse HEAD)

case "$actual_commit" in
  68cf2fddd8de5edd8ab3d926391772b2e2cedad8)
    mlx_release=v0.31.2
    ;;
  7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247)
    mlx_release=v0.32.0
    ;;
  *)
    echo "expected official MLX v0.31.2 or v0.32.0, got $actual_commit" >&2
    exit 1
    ;;
esac

if ! xcrun --find metal >/dev/null; then
  echo "Xcode Metal Toolchain is required; install it with xcodebuild -downloadComponent MetalToolchain" >&2
  exit 1
fi
if [[ ! -f "$source_fixture" ]]; then
  echo "missing real fixture: $source_fixture" >&2
  exit 2
fi

bash "$root/scripts/fetch-mlx-whisper-model.sh" "$model_dir"

if [[ -n "${CUTTLEDOC_MLX_BUILD_DIR:-}" ]]; then
  build_dir=$CUTTLEDOC_MLX_BUILD_DIR
  mkdir -p "$build_dir"
else
  build_dir=$(mktemp -d /private/tmp/cuttledoc-mlx-direct.XXXXXX)
  trap 'rm -rf "$build_dir"' EXIT
fi

fixture="$build_dir/fleurs-en-000.f32le"
ffmpeg \
  -y \
  -v error \
  -i "$source_fixture" \
  -ar 16000 \
  -ac 1 \
  -f f32le \
  -acodec pcm_f32le \
  "$fixture"

cmake \
  -S "$root/spikes/mlx-direct" \
  -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \
  -DMLX_SOURCE_DIR="$source_dir"
cmake --build "$build_dir" --target cuttledoc_mlx_shim --parallel 2

rustc \
  --edition 2024 \
  -C opt-level=3 \
  -C strip=symbols \
  -C 'link-arg=-Wl,-rpath,@executable_path' \
  "$root/spikes/mlx-direct/rust/main.rs" \
  -L "native=$build_dir" \
  -l dylib=cuttledoc_mlx_shim \
  -o "$build_dir/cuttledoc-mlx-whisper"

echo "UPSTREAM"
echo "mlx_release=$mlx_release"
echo "mlx_commit=$actual_commit"
echo "language=$language"

for device in cpu gpu; do
  if [[ "$device" == "cpu" ]]; then
    echo "CPU"
  else
    echo "GPU"
  fi
  /usr/bin/time -l \
    "$build_dir/cuttledoc-mlx-whisper" \
    "$model_dir" \
    "$fixture" \
    "$device" \
    "$language" \
    "$lifecycle_count" \
    "$runs_per_lifecycle"
done

echo "ARTIFACTS"
stat -f 'shim_dylib_bytes=%z' "$build_dir/libcuttledoc_mlx_shim.dylib"
stat -f 'rust_executable_bytes=%z' "$build_dir/cuttledoc-mlx-whisper"
stat -f 'metallib_bytes=%z' "$build_dir/mlx.metallib"
stat -f 'source_model_npz_bytes=%z' "$model_dir/downloads/weights.npz"
find "$model_dir" -maxdepth 1 -name '*.npy' -type f -print0 |
  xargs -0 stat -f '%z' |
  awk '{sum += $1} END {print "extracted_model_and_filter_bytes=" sum}'

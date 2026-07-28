#!/usr/bin/env bash

set -euo pipefail

model_revision=78c52ab98ca87f570bc57ad852e15ef7060f9f76
examples_revision=796f5b53cab69a3d48a44233ce21aae889e94a08
model_dir=${1:-"${CUTTLEDOC_MLX_MODEL_DIR:-$HOME/.cache/cuttledoc/mlx-whisper-tiny}"}
downloads="$model_dir/downloads"

mkdir -p "$downloads"

download_verified() {
  local url=$1
  local destination=$2
  local expected_sha256=$3

  if [[ ! -f "$destination" ]] ||
    [[ "$(shasum -a 256 "$destination" | awk '{print $1}')" != "$expected_sha256" ]]; then
    curl -fL --retry 3 -o "$destination" "$url"
  fi

  local actual_sha256
  actual_sha256=$(shasum -a 256 "$destination" | awk '{print $1}')
  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    echo "SHA-256 mismatch for $destination: expected $expected_sha256, got $actual_sha256" >&2
    exit 1
  fi
}

download_verified \
  "https://huggingface.co/mlx-community/whisper-tiny/resolve/$model_revision/config.json" \
  "$downloads/config.json" \
  aaff20ce8f69beddee3fe0cc1e08f4e92f58586cb9f12ba00a6f73cbfec1cb1c
download_verified \
  "https://huggingface.co/mlx-community/whisper-tiny/resolve/$model_revision/README.md" \
  "$downloads/README.md" \
  1a06ac5bc9c41b79d5bceb8ea9767adae1395e166a9da84b3cd2baff526f61da
download_verified \
  "https://huggingface.co/mlx-community/whisper-tiny/resolve/$model_revision/weights.npz" \
  "$downloads/weights.npz" \
  d5a3b8671ac7aab11a2c9d0f16e7da94bad5500d785856f438c6bd44c3723944
download_verified \
  "https://raw.githubusercontent.com/ml-explore/mlx-examples/$examples_revision/whisper/mlx_whisper/assets/mel_filters.npz" \
  "$downloads/mel_filters.npz" \
  7450ae70723a5ef9d341e3cee628c7cb0177f36ce42c44b7ed2bf3325f0f6d4c
download_verified \
  "https://raw.githubusercontent.com/ml-explore/mlx-examples/$examples_revision/whisper/mlx_whisper/assets/multilingual.tiktoken" \
  "$downloads/multilingual.tiktoken" \
  b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126

unzip -qo "$downloads/weights.npz" '*.npy' -d "$model_dir"
unzip -qo "$downloads/mel_filters.npz" mel_80.npy -d "$model_dir"
cp "$downloads/multilingual.tiktoken" "$model_dir/multilingual.tiktoken"

tensor_count=$(find "$model_dir" -maxdepth 1 \( -name 'encoder.*.npy' -o -name 'decoder.*.npy' \) -type f | wc -l | tr -d ' ')
if [[ "$tensor_count" != 166 ]]; then
  echo "expected 166 Whisper model tensors, found $tensor_count" >&2
  exit 1
fi

echo "model_revision=$model_revision"
echo "examples_revision=$examples_revision"
echo "model_directory=$model_dir"
echo "model_tensors=$tensor_count"
find "$model_dir" -maxdepth 1 -name '*.npy' -type f -print0 |
  xargs -0 stat -f '%z' |
  awk '{sum += $1} END {print "extracted_model_and_filter_bytes=" sum}'

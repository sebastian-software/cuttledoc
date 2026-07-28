#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard_source="$repo_root/packages/cuttledoc/tests/compiler-guard.sh"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/cuttledoc-cli-test.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

first_output_dir="$work_dir/artifacts-first"
second_output_dir="$work_dir/artifacts-second"
archive_path="$("$repo_root/scripts/pack-cuttledoc-cli.sh" "$first_output_dir")"
repeat_archive_path="$("$repo_root/scripts/pack-cuttledoc-cli.sh" "$second_output_dir")"
if ! cmp -s "$archive_path" "$repeat_archive_path"; then
  echo "repeated CLI packaging was not byte-identical" >&2
  exit 1
fi
install_root="$work_dir/install"
mkdir -p "$install_root"
tar -C "$install_root" -xzf "$archive_path"
package_dir="$(find "$install_root" -mindepth 1 -maxdepth 1 -type d -print | sed -n '1p')"
binary="$package_dir/cuttledoc"

compiler_guard="$work_dir/compiler-guard"
mkdir -p "$compiler_guard"
for tool in cargo cc c++ clang gcc g++ cmake rustc xcodebuild; do
  ln -s "$guard_source" "$compiler_guard/$tool"
done
runtime_path="$compiler_guard:/usr/bin:/bin"
test_home="$work_dir/home"
mkdir -p "$test_home"

env -i PATH="$runtime_path" HOME="$test_home" "$binary" --version |
  grep -qx "cuttledoc 0.1.0"
env -i PATH="$runtime_path" HOME="$test_home" "$binary" --help |
  grep -q "cuttledoc models install"
env -i PATH="$runtime_path" HOME="$test_home" \
  "$binary" models cache-root --cache-root "$work_dir/cache" |
  grep -qx "$work_dir/cache"
env -i PATH="$runtime_path" HOME="$test_home" \
  "$binary" models list --cache-root "$work_dir/cache" --format json \
  >"$work_dir/models.json"
grep -q '"schema_version": "1.0.0"' "$work_dir/models.json"
grep -q '"id": "whisper-large-v3-turbo"' "$work_dir/models.json"
grep -q '"id": "apple-speech-assets"' "$work_dir/models.json"

set +e
usage_output="$(
  env -i PATH="$runtime_path" HOME="$test_home" \
    "$binary" unsupported 2>&1
)"
usage_status=$?
set -e
if [[ "$usage_status" -ne 2 || "$usage_output" != *"error[CLI_USAGE]"* ]]; then
  echo "installed CLI did not preserve the usage error contract" >&2
  exit 1
fi

touch "$work_dir/existing.txt"
set +e
output_error="$(
  env -i PATH="$runtime_path" HOME="$test_home" \
    "$binary" transcribe "$work_dir/missing.opus" \
      --language en-US \
      --output "$work_dir/existing.txt" 2>&1
)"
output_status=$?
set -e
if [[ "$output_status" -ne 3 || "$output_error" != *"error[OUTPUT_EXISTS]"* ]]; then
  echo "installed CLI did not preserve the safe-overwrite contract" >&2
  exit 1
fi

set +e
model_error="$(
  env -i PATH="$runtime_path" HOME="$test_home" \
    "$binary" models verify whisper-large-v3-turbo \
      --cache-root "$work_dir/cache" 2>&1
)"
model_status=$?
set -e
if [[ "$model_status" -ne 1 || "$model_error" != *"error[MODEL_MISSING]"* ]]; then
  echo "installed CLI did not preserve the missing-model contract" >&2
  exit 1
fi

if [[ -n "${CUTTLEDOC_CLI_MEDIA_FIXTURE:-}" ]]; then
  : "${CUTTLEDOC_CLI_MEDIA_LANGUAGE:?set CUTTLEDOC_CLI_MEDIA_LANGUAGE}"
  : "${CUTTLEDOC_CLI_FFMPEG_PATH:?set CUTTLEDOC_CLI_FFMPEG_PATH}"
  env -i \
    PATH="$runtime_path" \
    HOME="$test_home" \
    "$binary" transcribe "$CUTTLEDOC_CLI_MEDIA_FIXTURE" \
      --backend apple-speech \
      --language "$CUTTLEDOC_CLI_MEDIA_LANGUAGE" \
      --ffmpeg-path "$CUTTLEDOC_CLI_FFMPEG_PATH" \
      --format json \
      --output "$work_dir/transcript.json" \
      --progress \
      2>"$work_dir/progress.log"
  grep -q '"schema_version": "1.0.0"' "$work_dir/transcript.json"
  grep -q '"backend": "apple-speech"' "$work_dir/transcript.json"
  grep -q '"raw_text": "' "$work_dir/transcript.json"
  grep -q $'progress\tfinalizing\t1\t1' "$work_dir/progress.log"
fi

artifact_size="$(stat -f '%z' "$archive_path")"
echo "CLI artifact smoke passed: $(basename "$archive_path") ($artifact_size bytes)"

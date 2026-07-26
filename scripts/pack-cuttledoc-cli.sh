#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-"$repo_root/artifacts"}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "the current native Cuttledoc CLI artifact requires darwin-arm64" >&2
  exit 1
fi

if [[ -z "${CUTTLEDOC_WHISPER_CPP_DIR:-}" ]]; then
  CUTTLEDOC_WHISPER_CPP_DIR="$(
    "$repo_root/scripts/fetch-whisper-cpp.sh" \
      "$repo_root/target/vendor/whisper.cpp-v1.8.2"
  )"
  export CUTTLEDOC_WHISPER_CPP_DIR
fi

if [[ -z "${CUTTLEDOC_MLX_DIR:-}" ]]; then
  CUTTLEDOC_MLX_DIR="$(
    "$repo_root/scripts/fetch-official-mlx.sh" \
      "$repo_root/target/vendor/mlx-v0.32.0"
  )"
  export CUTTLEDOC_MLX_DIR
fi

export CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-"$repo_root/target/clang-module-cache"}"
mkdir -p "$CLANG_MODULE_CACHE_PATH"

cargo build --release --locked -p cuttledoc-cli

gemma_build_dir="$(
  find "$repo_root/target/release/build" \
    -path '*/out/gemma-mlx-build' \
    -type d \
    -exec test -f '{}/libcuttledoc_gemma_mlx_adapter.dylib' ';' \
    -exec test -f '{}/mlx.metallib' ';' \
    -print |
    sed -n '1p'
)"
if [[ -z "$gemma_build_dir" ]]; then
  echo "release build omitted the Gemma MLX runtime artifacts" >&2
  exit 1
fi

version="$(
  sed -n 's/^version = "\(.*\)"/\1/p' "$repo_root/Cargo.toml" |
    sed -n '1p'
)"
if [[ -z "$version" ]]; then
  echo "could not resolve the workspace version" >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/cuttledoc-cli-pack.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

archive_root="cuttledoc-$version-darwin-arm64"
package_dir="$work_dir/$archive_root"
mkdir -p "$package_dir" "$output_dir"
cp "$repo_root/target/release/cuttledoc" "$package_dir/cuttledoc"
cp "$gemma_build_dir/libcuttledoc_gemma_mlx_adapter.dylib" \
  "$package_dir/libcuttledoc_gemma_mlx_adapter.dylib"
cp "$gemma_build_dir/mlx.metallib" "$package_dir/mlx.metallib"
cp "$repo_root/LICENSE" "$package_dir/LICENSE"

binary_rpaths="$(otool -l "$package_dir/cuttledoc")"
if [[ "$binary_rpaths" != *"@executable_path"* ]]; then
  echo "CLI artifact is missing the sibling @executable_path rpath" >&2
  exit 1
fi
binary_dependencies="$(otool -L "$package_dir/cuttledoc")"
if [[ "$binary_dependencies" != *"@rpath/libcuttledoc_gemma_mlx_adapter.dylib"* ]]; then
  echo "CLI artifact is missing the pinned Gemma MLX adapter dependency" >&2
  exit 1
fi

strip -x "$package_dir/cuttledoc"

archive_path="$output_dir/$archive_root.tar.gz"
tar -C "$work_dir" -czf "$archive_path" "$archive_root"
archive_entries="$(tar -tzf "$archive_path")"
for entry in \
  "$archive_root/cuttledoc" \
  "$archive_root/libcuttledoc_gemma_mlx_adapter.dylib" \
  "$archive_root/mlx.metallib" \
  "$archive_root/LICENSE"
do
  if ! grep -qx "$entry" <<<"$archive_entries"; then
    echo "CLI artifact is missing $entry" >&2
    exit 1
  fi
done

if grep -Eq '\.(safetensors|bin)$|\.mlmodelc/' <<<"$archive_entries"; then
  echo "CLI artifact must not bundle model weights" >&2
  exit 1
fi

printf '%s\n' "$archive_path"

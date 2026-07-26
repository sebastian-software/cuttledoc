#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_source="$repo_root/packages/cuttledoc"
output_dir="${1:-"$repo_root/artifacts"}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "cuttledoc's current Node artifact requires darwin-arm64" >&2
  exit 1
fi

if [[ -z "${CUTTLEDOC_WHISPER_CPP_DIR:-}" ]]; then
  CUTTLEDOC_WHISPER_CPP_DIR="$(
    "$repo_root/scripts/fetch-whisper-cpp.sh" \
      "$repo_root/target/vendor/whisper.cpp-v1.8.2"
  )"
  export CUTTLEDOC_WHISPER_CPP_DIR
fi

cargo build --release --locked -p cuttledoc-node

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/cuttledoc-node-pack.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
export npm_config_cache="$work_dir/npm-cache"

package_dir="$work_dir/package"
mkdir -p "$package_dir" "$output_dir"
cp "$package_source/package.json" "$package_dir/package.json"
cp "$package_source/index.cjs" "$package_dir/index.cjs"
cp "$package_source/index.js" "$package_dir/index.js"
cp "$package_source/index.d.ts" "$package_dir/index.d.ts"
cp "$package_source/README.md" "$package_dir/README.md"
cp "$repo_root/LICENSE" "$package_dir/LICENSE"
cp "$repo_root/target/release/libcuttledoc_node.dylib" \
  "$package_dir/cuttledoc.darwin-arm64.node"

tarball_name="$(cd "$package_dir" && npm pack --silent --pack-destination "$output_dir")"
tarball_path="$output_dir/$tarball_name"
archive_entries="$(tar -tzf "$tarball_path")"

for entry in \
  package/package.json \
  package/index.cjs \
  package/index.js \
  package/index.d.ts \
  package/README.md \
  package/LICENSE \
  package/cuttledoc.darwin-arm64.node
do
  if ! grep -qx "$entry" <<<"$archive_entries"; then
    echo "npm artifact is missing $entry" >&2
    exit 1
  fi
done

if grep -Eq '(^|/)(Cargo(\.toml|\.lock)?|src|build\.rs|binding\.gyp|CMakeLists\.txt|install\.(js|cjs|mjs))($|/)' <<<"$archive_entries"; then
  echo "npm artifact unexpectedly contains native build inputs" >&2
  exit 1
fi

node -e "
  const manifest = require('$package_dir/package.json');
  if (manifest.scripts?.install || manifest.scripts?.preinstall || manifest.scripts?.postinstall) {
    throw new Error('npm artifact must not contain lifecycle build scripts');
  }
"

printf '%s\n' "$tarball_path"

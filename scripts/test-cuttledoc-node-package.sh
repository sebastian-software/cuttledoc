#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tests_source="$repo_root/packages/cuttledoc/tests"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/cuttledoc-node-test.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
export npm_config_cache="$work_dir/npm-cache"

tarball_path="$("$repo_root/scripts/pack-cuttledoc-node.sh" "$work_dir")"

compiler_guard_dir="$work_dir/compiler-guard"
mkdir -p "$compiler_guard_dir"
for tool in cargo cc c++ clang gcc g++ cmake node-gyp; do
  ln -s "$tests_source/compiler-guard.sh" "$compiler_guard_dir/$tool"
done

for mode in esm commonjs; do
  app_dir="$work_dir/$mode-app"
  mkdir -p "$app_dir"
  PATH="$compiler_guard_dir:$PATH" \
    npm_config_node_gyp="$compiler_guard_dir/node-gyp" \
    npm install \
      --prefix "$app_dir" \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      "$tarball_path"

  if [[ "$mode" == "esm" ]]; then
    cp "$tests_source/esm.mjs" "$app_dir/package-smoke.mjs"
    node "$app_dir/package-smoke.mjs"
  else
    cp "$tests_source/commonjs.cjs" "$app_dir/package-smoke.cjs"
    node "$app_dir/package-smoke.cjs"

    native_artifact="$app_dir/node_modules/cuttledoc/cuttledoc.darwin-arm64.node"
    mv "$native_artifact" "$native_artifact.missing"
    cp "$tests_source/missing-artifact.cjs" "$app_dir/missing-artifact.cjs"
    node "$app_dir/missing-artifact.cjs"
  fi
done

artifact_size="$(stat -f '%z' "$tarball_path")"
echo "npm artifact: $(basename "$tarball_path") ($artifact_size bytes)"

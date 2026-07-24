#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
allowlist="$root/docs/dependency-allowlist.txt"

if [[ ! -f "$allowlist" ]]; then
  echo "missing dependency allowlist: $allowlist" >&2
  exit 1
fi

manifests=$(find "$root" -path "$root/.git" -prune -o -name Cargo.toml -print)

if [[ -z "$manifests" ]]; then
  echo "dependency policy: no Cargo manifests yet; documentation gate passed"
  exit 0
fi

if ! command -v cargo >/dev/null || ! command -v jq >/dev/null; then
  echo "dependency policy needs cargo and jq once Cargo manifests exist" >&2
  exit 1
fi

dependencies=$(
  while IFS= read -r manifest; do
    cargo metadata --manifest-path "$manifest" --no-deps --format-version=1 \
      | jq -r '.packages[].dependencies[] | select(.source != null) | .name'
  done <<< "$manifests" | LC_ALL=C sort -u
)

while IFS= read -r dependency; do
  [[ -z "$dependency" ]] && continue
  if ! grep -Fqx "$dependency" "$allowlist"; then
    echo "unreviewed direct dependency: $dependency" >&2
    echo "add its accepted inventory entry and then docs/dependency-allowlist.txt" >&2
    exit 1
  fi
done <<< "$dependencies"

reference_only=("mlx-rs" "mlx-sys" "mistralrs" "candle-core")
for dependency in "${reference_only[@]}"; do
  if printf '%s\n' "$dependencies" | grep -Fqx "$dependency"; then
    echo "reference-only dependency is present: $dependency" >&2
    exit 1
  fi
done

echo "dependency policy: direct dependencies are reviewed"

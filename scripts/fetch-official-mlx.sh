#!/usr/bin/env bash
set -euo pipefail

revision=7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247
destination=${1:-target/vendor/mlx-v0.32.0}

if [[ -e "$destination" && ! -d "$destination/.git" ]]; then
  echo "MLX destination exists but is not a Git checkout: $destination" >&2
  exit 1
fi

if [[ ! -d "$destination/.git" ]]; then
  mkdir -p "$(dirname "$destination")"
  git init --quiet "$destination"
  git -C "$destination" remote add origin https://github.com/ml-explore/mlx.git
else
  if [[ "$(git -C "$destination" remote get-url origin)" != "https://github.com/ml-explore/mlx.git" ]]; then
    echo "unexpected official MLX origin: $(git -C "$destination" remote get-url origin)" >&2
    exit 1
  fi
  if [[ -n "$(git -C "$destination" status --porcelain)" ]]; then
    echo "official MLX checkout contains local changes: $destination" >&2
    exit 1
  fi
fi

if [[ "$(git -C "$destination" rev-parse HEAD 2>/dev/null || true)" != "$revision" ]]; then
  if ! git -C "$destination" cat-file -e "$revision^{commit}" 2>/dev/null; then
    git -C "$destination" fetch --quiet --depth 1 origin "$revision"
  fi
  git -C "$destination" checkout --quiet --detach "$revision"
fi

actual_revision=$(git -C "$destination" rev-parse HEAD)
if [[ "$actual_revision" != "$revision" ]]; then
  echo "expected official MLX $revision, got $actual_revision" >&2
  exit 1
fi
if [[ -n "$(git -C "$destination" status --short)" ]]; then
  echo "official MLX checkout contains local changes: $destination" >&2
  exit 1
fi

printf '%s\n' "$(cd "$destination" && pwd)"

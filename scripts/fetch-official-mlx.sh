#!/usr/bin/env bash
set -euo pipefail

revision=7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247
destination=${1:-target/vendor/mlx-v0.32.0}

if [[ ! -d "$destination/.git" ]]; then
  if [[ -e "$destination" ]]; then
    echo "MLX destination exists but is not a Git checkout: $destination" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$destination")"
  git init --quiet "$destination"
  git -C "$destination" remote add origin https://github.com/ml-explore/mlx.git
  git -C "$destination" fetch --quiet --depth 1 origin "$revision"
  git -C "$destination" checkout --quiet --detach FETCH_HEAD
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

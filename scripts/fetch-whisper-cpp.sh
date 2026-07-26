#!/usr/bin/env bash
set -euo pipefail

revision="4979e04f5dcaccb36057e059bbaed8a2f5288315"
tree="7342a3d8d9bf7e45f7acd0b917340302424f0fef"
archive_sha256="95e39341ddf07bd7e0b6568b92831737630854567fe38c2c80330e287479bf29"
source_url="https://github.com/ggml-org/whisper.cpp.git"
destination="${1:-target/vendor/whisper.cpp-v1.8.2}"

if [[ -e "$destination" && ! -d "$destination/.git" ]]; then
  echo "refusing to replace non-checkout path: $destination" >&2
  exit 1
fi

if [[ ! -d "$destination/.git" ]]; then
  mkdir -p "$(dirname "$destination")"
  git clone --filter=blob:none --no-checkout "$source_url" "$destination"
else
  if [[ "$(git -C "$destination" remote get-url origin)" != "$source_url" ]]; then
    echo "unexpected whisper.cpp origin: $(git -C "$destination" remote get-url origin)" >&2
    exit 1
  fi
  if [[ -n "$(git -C "$destination" status --porcelain)" ]]; then
    echo "refusing to replace a dirty whisper.cpp checkout: $destination" >&2
    exit 1
  fi
fi

if [[ "$(git -C "$destination" rev-parse HEAD 2>/dev/null || true)" != "$revision" ]]; then
  if ! git -C "$destination" cat-file -e "$revision^{commit}" 2>/dev/null; then
    git -C "$destination" fetch --depth 1 origin "$revision"
  fi
  git -C "$destination" checkout --detach "$revision"
fi

actual_revision="$(git -C "$destination" rev-parse HEAD)"
actual_tree="$(git -C "$destination" rev-parse 'HEAD^{tree}')"
actual_archive_sha256="$(git -C "$destination" archive --format=tar HEAD | shasum -a 256 | cut -d ' ' -f 1)"

if [[ "$actual_revision" != "$revision" ]]; then
  echo "unexpected whisper.cpp revision: $actual_revision" >&2
  exit 1
fi
if [[ "$actual_tree" != "$tree" ]]; then
  echo "unexpected whisper.cpp tree: $actual_tree" >&2
  exit 1
fi
if [[ "$actual_archive_sha256" != "$archive_sha256" ]]; then
  echo "unexpected whisper.cpp source digest: $actual_archive_sha256" >&2
  exit 1
fi
if [[ -n "$(git -C "$destination" status --porcelain)" ]]; then
  echo "whisper.cpp checkout is dirty after verification" >&2
  exit 1
fi

printf '%s\n' "$(cd "$destination" && pwd)"

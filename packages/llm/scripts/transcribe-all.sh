#!/bin/bash
# Transcribe all TTS audio files with Whisper
# Runs 2 in parallel for faster processing

set -e
cd "$(dirname "$0")/../../.."

AUDIO_DIR="packages/llm/fixtures/audio"
CACHE_DIR="packages/llm/results/tts-stt-cache"
CUTTLEDOC="node packages/cuttledoc/bin/cuttledoc.js"

mkdir -p "$CACHE_DIR"

transcribe() {
  local file="$1"
  local lang="$2"
  local name="$3"
  local cache_file="$CACHE_DIR/$name.txt"

  if [ -s "$cache_file" ]; then
    echo "✓ $name (cached)"
    return 0
  fi

  echo "📝 Transcribing $name (whisper, lang=$lang)..."
  $CUTTLEDOC "$file" --backend whisper --language "$lang" --quiet 2>&1 | tail -n +3 > "$cache_file"

  local words=$(wc -w < "$cache_file" | tr -d ' ')
  echo "✓ $name: $words words"
}

export -f transcribe
export CACHE_DIR CUTTLEDOC

echo "🎤 Transcribing TTS audio with Whisper (2 parallel)..."
echo ""

# Process in pairs (2 parallel)
transcribe "$AUDIO_DIR/de-sample - Mila.ogg" "de" "de-Mila" &
transcribe "$AUDIO_DIR/de-sample - Otto.ogg" "de" "de-Otto" &
wait

transcribe "$AUDIO_DIR/en-sample - Brian.ogg" "en" "en-Brian" &
transcribe "$AUDIO_DIR/en-sample - Jesscia.ogg" "en" "en-Jesscia" &
wait

transcribe "$AUDIO_DIR/es-sample - Enrique M. Nieto.ogg" "es" "es-Enrique_M._Nieto" &
transcribe "$AUDIO_DIR/es-sample - Sarah Martin.ogg" "es" "es-Sarah_Martin" &
wait

transcribe "$AUDIO_DIR/fr-sample - Manon.ogg" "fr" "fr-Manon" &
transcribe "$AUDIO_DIR/fr-sample - Paul.ogg" "fr" "fr-Paul" &
wait

transcribe "$AUDIO_DIR/pt-sample - Adam.ogg" "pt" "pt-Adam" &
transcribe "$AUDIO_DIR/pt-sample - Raquel.ogg" "pt" "pt-Raquel" &
wait

echo ""
echo "✅ All transcriptions complete!"
echo ""
ls -la "$CACHE_DIR"


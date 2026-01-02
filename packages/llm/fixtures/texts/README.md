# LLM Benchmark Texte

Wikipedia-artige Texte für den LLM-Korrektur-Benchmark. Diese Texte werden mit TTS (ElevenLabs) zu Audio konvertiert, dann mit STT (Parakeet) transkribiert, und schließlich mit LLMs korrigiert.

## Texte

| Datei           | Sprache       | Thema                           | Wörter | ~Dauer   |
| --------------- | ------------- | ------------------------------- | ------ | -------- |
| `en-sample.txt` | Englisch      | Öffentlicher Nahverkehr         | ~1100  | ~6-7 min |
| `de-sample.txt` | Deutsch       | Sonnensystem-Erforschung        | ~1000  | ~6-7 min |
| `fr-sample.txt` | Französisch   | Gastronomie                     | ~950   | ~6-7 min |
| `es-sample.txt` | Spanisch      | Lateinamerikanische Architektur | ~1050  | ~6-7 min |
| `pt-sample.txt` | Portugiesisch | Ozean-Biodiversität             | ~1100  | ~7-8 min |

## Anleitung

### 1. Audio mit ElevenLabs erstellen

Für jede Sprache **zwei** Audio-Dateien erstellen (männlich + weiblich):

**Empfohlene Stimmen:**

- Englisch: `Rachel` (weiblich), `Adam` (männlich)
- Deutsch: `Nicole` (weiblich), `Arnold` (männlich)
- Französisch: `Charlotte` (weiblich), `Thomas` (männlich)
- Spanisch: `Valentina` (weiblich), `Jorge` (männlich)
- Portugiesisch: `Fernanda` (weiblich), `Ricardo` (männlich)

**Einstellungen:**

- Model: `Eleven Multilingual v2`
- Stability: ~50%
- Similarity: ~75%
- Format: MP3 oder WAV

### 2. Dateien speichern

Audio-Dateien in `/packages/llm/fixtures/audio/` speichern:

```
audio/
  en-female.mp3
  en-male.mp3
  de-female.mp3
  de-male.mp3
  fr-female.mp3
  fr-male.mp3
  es-female.mp3
  es-male.mp3
  pt-female.mp3
  pt-male.mp3
```

### 3. Benchmark ausführen

```bash
cd packages/llm
pnpm benchmark:real
```

Das Script wird:

1. Audio mit Parakeet transkribieren
2. STT-Output mit verschiedenen LLMs korrigieren
3. WER vor/nach Korrektur berechnen
4. Ergebnisse in `results/` speichern

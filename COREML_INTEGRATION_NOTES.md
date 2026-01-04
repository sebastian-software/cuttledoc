# CoreML Integration Notes

## Status

Die Integration ist vollständig. Beide CoreML-Pakete funktionieren wie erwartet.

## Architektur

```
cuttledoc (macOS only)
├── parakeet-coreml  → 40x real-time, 25 Sprachen
├── whisper-coreml   → 14x real-time, 99 Sprachen
└── openai           → Cloud API (optional)
```

## Model Downloads

Die CoreML-Pakete haben `autoDownload: true` als Default:

- Beim ersten `initialize()` werden Models automatisch heruntergeladen
- Kein manueller Download erforderlich

Für explizites Pre-Download (`cuttledoc models download`):

- `parakeet-coreml`: `downloadModels()` + `downloadVadModel()`
- `whisper-coreml`: `downloadModel()`

## Platform

CoreML ist nur auf macOS verfügbar. Die Integration prüft `process.platform === "darwin"`.

---

## Verbesserungsvorschläge für CoreML-Pakete

### Sprachlisten exportieren (DRY)

**Status:** Offen

Die Sprachliste für Parakeet ist aktuell in `cuttledoc/src/backends/coreml/index.ts` dupliziert.

**Empfehlung:**

```typescript
// parakeet-coreml sollte exportieren:
export const SUPPORTED_LANGUAGES = ["en", "de", "fr", ...] as const
```

---

## Betroffene Dateien

- `/packages/cuttledoc/src/index.ts` - Hauptintegration
- `/packages/cuttledoc/src/backends/coreml/index.ts` - CoreML Backend
- `/packages/cuttledoc/src/cli/index.ts` - CLI Download Commands

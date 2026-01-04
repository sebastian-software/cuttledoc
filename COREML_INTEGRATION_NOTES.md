# CoreML Integration Notes

## Gefundene Issues bei der Integration

### 1. whisper-coreml API Mismatch

**Status:** Offen

**Beschreibung:**
Die lokale Entwicklungsversion von `whisper-coreml` (im Workspace) hat zusätzliche Exports, die in der veröffentlichten npm Version 1.0.2 noch nicht vorhanden sind:

- `downloadCoreMLModel` - Nicht in npm Version 1.0.2
- `getCoreMLModelPath` - Nicht in npm Version 1.0.2
- `isBinModelDownloaded` - Nicht in npm Version 1.0.2
- `isCoreMLModelDownloaded` - Nicht in npm Version 1.0.2

**Workaround:**
`downloadModel()` wird verwendet, welches nur das .bin Model herunterlädt. Das CoreML Model muss separat behandelt werden.

**Empfehlung:**
Nach dem nächsten Release von `whisper-coreml` die Dependency in cuttledoc aktualisieren und die Download-Logik erweitern.

---

### 2. Model Download Logik

**Status:** Vereinfacht

**Beschreibung:**
Die CoreML-Pakete laden Models automatisch beim ersten `initialize()` herunter wenn `autoDownload: true` (default) gesetzt ist.

Für `cuttledoc models download` wird die manuelle Download-Funktion verwendet:

- `parakeet-coreml`: `downloadModels()` + `downloadVadModel()`
- `whisper-coreml`: `downloadModel()`

---

### 3. Platform Check

**Status:** Implementiert

**Beschreibung:**
CoreML ist nur auf macOS verfügbar. Die Integration prüft `process.platform === "darwin"` und gibt entsprechende Fehlermeldungen aus.

---

## Nächste Schritte

1. [ ] `whisper-coreml` neue Version veröffentlichen mit `downloadCoreMLModel` Export
2. [ ] `parakeet-coreml` + `whisper-coreml`: Sprachlisten exportieren (DRY)
   - `SUPPORTED_LANGUAGES` Konstante exportieren
   - Aktuell dupliziert in `cuttledoc/src/backends/coreml/index.ts`
3. [ ] cuttledoc auf neue Versionen updaten
4. [ ] E2E Tests mit echten Models durchführen

## Betroffene Dateien

- `/packages/cuttledoc/src/index.ts` - Hauptintegration
- `/packages/cuttledoc/src/backends/coreml/index.ts` - CoreML Backend
- `/packages/cuttledoc/src/cli/index.ts` - CLI Download Commands

# Known Issues & Future Improvements

Diese Liste dokumentiert erkannte Probleme und mögliche Verbesserungen für zukünftige Arbeit.

---

## 🔴 Kritische Issues

### 1. Parakeet v3 int8 erkennt Französisch nicht korrekt

**Status:** Offen  
**Priorität:** Hoch  
**Entdeckt:** 2025-01-02

**Problem:**

- Das Parakeet-TDT-0.6b-v3 Modell in der int8-quantisierten Version erkennt Französisch nicht korrekt
- Statt französischer Transkription wird ein Englisch-Französisch-Mischmasch ausgegeben
- WER für FR: 86-97% (unbrauchbar)
- Andere Sprachen (DE, ES, PT) funktionieren mit ~3-8% WER

**Ursache (vermutet):**

- Die int8-Quantisierung hat möglicherweise die französische Spracherkennung beschädigt
- v3 gibt es nur als int8, keine fp16/fp32 Version verfügbar
- MacWhisper mit "Parakeet v3" funktioniert - verwendet möglicherweise andere Modellquelle

**Workaround:**

- Whisper-large-v3 für französische Inhalte verwenden

**Mögliche Lösungen:**

- [ ] Issue bei Sherpa-ONNX öffnen: https://github.com/k2-fsa/sherpa-onnx/issues
- [ ] fp16-Version von v3 selbst aus NeMo-Modell konvertieren
- [ ] Prüfen ob NVIDIA eine ONNX-Version bereitstellt

**Referenzen:**

- Sherpa-ONNX Releases: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
- NeMo Parakeet v3: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3

---

## 🟡 Verbesserungen

### 2. LLM-Benchmark mit längeren Samples

**Status:** Erledigt ✅  
**Priorität:** Mittel

**Problem:**

- FLEURS-Samples sind zu kurz (~10-15 Sek) für aussagekräftige LLM-Korrektur-Benchmarks
- Einzelne Sätze bieten wenig Kontext für sinnvolle Korrekturen

**Lösung:**

- ✅ Längere TTS-generierte Texte (~5-7 Minuten pro Sprache)
- ✅ Wikipedia-artige Texte mit ElevenLabs TTS erstellt
- ✅ Benchmark mit allen 5 Sprachen abgeschlossen (2025-01-02)

**Ergebnisse (Whisper STT → LLM-Korrektur):**

| Modell   | Ø WER vorher | Ø WER nachher | Verbesserung | Speed  |
| -------- | ------------ | ------------- | ------------ | ------ |
| gemma3n  | 9.2%         | 3.8%          | +59%         | 37 t/s |
| phi4:14b | 9.2%         | 4.2%          | +54%         | 36 t/s |

**Erkenntnisse:**

- LLM-Korrektur verbessert in 9/10 Fällen die Ergebnisse
- Besonders effektiv bei hohem WER (>10%): Verbesserungen bis zu 78%
- Minimale Verschlechterung in Einzelfällen (~0.7 Prozentpunkte)
- **Empfehlung:** LLM standardmäßig aktivieren

---

### 3. Parakeet Sprach-Parameter wird ignoriert

**Status:** Offen  
**Priorität:** Mittel

**Problem:**

- Der `--language` Parameter bei Parakeet scheint ignoriert zu werden
- Transducer-Modelle in Sherpa-ONNX haben keine explizite Spracheinstellung
- Nur Whisper-Modelle unterstützen `language` Parameter in der Config

**Zu klären:**

- [ ] Wie funktioniert Spracherkennung bei Parakeet/Transducer-Modellen?
- [ ] Ist automatische Spracherkennung implementiert?
- [ ] Sherpa-ONNX Dokumentation prüfen

---

### 4. OGG/Opus Dateien im Benchmark-Verzeichnis

**Status:** Erledigt ✅  
**Priorität:** Niedrig

**Problem:**

- MP3-Dateien waren zu groß für Repository

**Lösung:**

- ✅ Konvertierung zu OGG/Opus (48kbps) - ~3x kleiner
- ✅ .gitignore angepasst

---

## 🟢 Abgeschlossene Issues

### 5. ElevenLabs 5000-Zeichen-Limit

**Status:** Erledigt ✅

**Problem:**

- Referenztexte waren länger als das ElevenLabs-Limit
- WER-Berechnung war dadurch verfälscht

**Lösung:**

- ✅ Texte manuell auf passende Länge gekürzt

---

### 6. LLM-Korrektur-Prompt verbessert

**Status:** Erledigt ✅

**Problem:**

- Alter Prompt war zu kurz, Modelle (Mistral, Qwen) übersetzten statt zu korrigieren

**Lösung:**

- ✅ Ausführlicher Prompt mit expliziten Verboten (DO NOT translate, summarize, rephrase)
- ✅ In `packages/llm/src/types.ts` als `TRANSCRIPT_CORRECTION_PROMPT`

---

## 📝 Nächste Schritte

1. [x] ~~LLM-Benchmark mit Whisper für alle 5 Sprachen abschließen~~ ✅
2. [ ] Issue bei Sherpa-ONNX für Parakeet v3 fp16 öffnen
3. [ ] Ergebnisse in README/Docs übernehmen
4. [x] ~~Entscheiden welches LLM-Modell als Default~~ → **gemma3n** (schneller, leicht besser)
5. [ ] LLM standardmäßig aktivieren im CLI

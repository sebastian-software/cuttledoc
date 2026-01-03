/**
 * WhisperEngine - C++ wrapper for whisper.cpp with CoreML support
 */

#ifndef WHISPER_ENGINE_H
#define WHISPER_ENGINE_H

#include <string>
#include <vector>
#include <memory>
#include <functional>

struct TranscriptionSegment {
    int64_t startMs;
    int64_t endMs;
    std::string text;
    float confidence;
};

struct TranscriptionResult {
    std::string text;
    std::string language;
    double durationMs;
    std::vector<TranscriptionSegment> segments;
};

struct WhisperEngineOptions {
    std::string modelPath;
    std::string language = "auto";  // "auto" for auto-detect, or ISO code like "en", "de", "fr"
    bool translate = false;          // Translate to English
    bool withTimestamps = true;      // Include word/segment timestamps
    int threads = 0;                 // 0 = auto (use all cores)
};

class WhisperEngine {
public:
    explicit WhisperEngine(const WhisperEngineOptions& options);
    ~WhisperEngine();

    // Non-copyable
    WhisperEngine(const WhisperEngine&) = delete;
    WhisperEngine& operator=(const WhisperEngine&) = delete;

    /**
     * Check if the engine is ready for transcription
     */
    bool isReady() const;

    /**
     * Transcribe audio samples
     * @param samples Float32 audio samples, mono, 16kHz
     * @param sampleCount Number of samples
     * @param sampleRate Sample rate (will be resampled to 16kHz if different)
     * @return Transcription result
     */
    TranscriptionResult transcribe(const float* samples, size_t sampleCount, int sampleRate = 16000);

    /**
     * Transcribe audio file
     * @param filePath Path to audio file (WAV, MP3, etc.)
     * @return Transcription result
     */
    TranscriptionResult transcribeFile(const std::string& filePath);

    /**
     * Get the detected language from last transcription
     */
    std::string getDetectedLanguage() const;

    /**
     * Clean up resources
     */
    void cleanup();

    /**
     * Get version info
     */
    static std::string getVersion();

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

#endif // WHISPER_ENGINE_H


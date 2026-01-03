/**
 * WhisperEngine Implementation
 *
 * Wraps whisper.cpp for use in Node.js via N-API.
 * Supports CoreML acceleration on Apple Silicon.
 */

#include "whisper_engine.h"
#include "whisper.h"

#include <chrono>
#include <cmath>
#include <algorithm>
#include <stdexcept>

struct WhisperEngine::Impl {
    whisper_context* ctx = nullptr;
    WhisperEngineOptions options;
    std::string detectedLanguage;
    bool ready = false;

    ~Impl() {
        if (ctx) {
            whisper_free(ctx);
            ctx = nullptr;
        }
    }
};

WhisperEngine::WhisperEngine(const WhisperEngineOptions& options)
    : pImpl(std::make_unique<Impl>()) {

    pImpl->options = options;

    // Initialize whisper context with CoreML support
    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = true;  // Enable GPU/CoreML

    pImpl->ctx = whisper_init_from_file_with_params(
        options.modelPath.c_str(),
        cparams
    );

    if (!pImpl->ctx) {
        throw std::runtime_error("Failed to load Whisper model from: " + options.modelPath);
    }

    pImpl->ready = true;
}

WhisperEngine::~WhisperEngine() {
    cleanup();
}

bool WhisperEngine::isReady() const {
    return pImpl && pImpl->ready && pImpl->ctx;
}

TranscriptionResult WhisperEngine::transcribe(const float* samples, size_t sampleCount, int sampleRate) {
    if (!isReady()) {
        throw std::runtime_error("WhisperEngine not initialized");
    }

    auto startTime = std::chrono::high_resolution_clock::now();

    // Resample if necessary (whisper expects 16kHz)
    std::vector<float> resampledSamples;
    const float* audioData = samples;
    size_t audioSize = sampleCount;

    if (sampleRate != WHISPER_SAMPLE_RATE) {
        // Simple linear resampling (for production, use a proper resampler)
        double ratio = static_cast<double>(WHISPER_SAMPLE_RATE) / sampleRate;
        size_t newSize = static_cast<size_t>(sampleCount * ratio);
        resampledSamples.resize(newSize);

        for (size_t i = 0; i < newSize; i++) {
            double srcIdx = i / ratio;
            size_t idx0 = static_cast<size_t>(srcIdx);
            size_t idx1 = std::min(idx0 + 1, sampleCount - 1);
            double frac = srcIdx - idx0;
            resampledSamples[i] = static_cast<float>(
                samples[idx0] * (1.0 - frac) + samples[idx1] * frac
            );
        }

        audioData = resampledSamples.data();
        audioSize = newSize;
    }

    // Configure transcription parameters
    whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);

    // Language settings
    if (pImpl->options.language == "auto") {
        wparams.language = "en";  // Default to English (auto-detect has issues)
        wparams.detect_language = false;
    } else {
        wparams.language = pImpl->options.language.c_str();
        wparams.detect_language = false;
    }

    wparams.translate = pImpl->options.translate;
    wparams.no_timestamps = false;

    // Thread settings
    wparams.n_threads = pImpl->options.threads > 0 ? pImpl->options.threads : 4;

    // Performance settings
    wparams.print_progress = false;
    wparams.print_realtime = false;
    wparams.print_special = false;
    wparams.print_timestamps = false;

    // Standard decoding mode
    wparams.single_segment = false;
    wparams.token_timestamps = true;
    wparams.n_max_text_ctx = 16384;

    // Run transcription
    int result = whisper_full(pImpl->ctx, wparams, audioData, static_cast<int>(audioSize));

    if (result != 0) {
        throw std::runtime_error("Whisper transcription failed with code: " + std::to_string(result));
    }

    // Get detected language
    if (wparams.detect_language) {
        int langId = whisper_full_lang_id(pImpl->ctx);
        pImpl->detectedLanguage = whisper_lang_str(langId);
    } else {
        pImpl->detectedLanguage = pImpl->options.language;
    }

    // Collect results
    TranscriptionResult txResult;
    txResult.language = pImpl->detectedLanguage;

    int numSegments = whisper_full_n_segments(pImpl->ctx);
    std::string fullText;

    for (int i = 0; i < numSegments; i++) {
        const char* segmentText = whisper_full_get_segment_text(pImpl->ctx, i);

        TranscriptionSegment segment;
        segment.startMs = whisper_full_get_segment_t0(pImpl->ctx, i) * 10;  // Convert to ms
        segment.endMs = whisper_full_get_segment_t1(pImpl->ctx, i) * 10;
        segment.text = segmentText ? segmentText : "";
        segment.confidence = 1.0f;  // whisper.cpp doesn't expose confidence directly

        txResult.segments.push_back(segment);

        if (!fullText.empty() && !segment.text.empty() && segment.text[0] != ' ') {
            fullText += " ";
        }
        fullText += segment.text;
    }

    // Trim leading/trailing whitespace
    size_t start = fullText.find_first_not_of(" \t\n\r");
    size_t end = fullText.find_last_not_of(" \t\n\r");
    if (start != std::string::npos && end != std::string::npos) {
        txResult.text = fullText.substr(start, end - start + 1);
    } else {
        txResult.text = "";
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    txResult.durationMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();

    return txResult;
}

TranscriptionResult WhisperEngine::transcribeFile(const std::string& filePath) {
    // For now, throw - caller should load audio and use transcribe()
    throw std::runtime_error("transcribeFile not yet implemented - use transcribe() with samples");
}

std::string WhisperEngine::getDetectedLanguage() const {
    return pImpl ? pImpl->detectedLanguage : "";
}

void WhisperEngine::cleanup() {
    if (pImpl) {
        if (pImpl->ctx) {
            whisper_free(pImpl->ctx);
            pImpl->ctx = nullptr;
        }
        pImpl->ready = false;
    }
}

std::string WhisperEngine::getVersion() {
    return "whisper.cpp CoreML";
}


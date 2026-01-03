/**
 * ASR Engine Header
 *
 * Defines the interface for the CoreML-based ASR engine.
 */

#ifndef ASR_ENGINE_H
#define ASR_ENGINE_H

#include <string>
#include <vector>
#include <memory>

#ifdef __OBJC__
@class MLModel;
@class MLMultiArray;
#else
typedef void MLModel;
typedef void MLMultiArray;
#endif

/**
 * CoreML ASR Engine using Parakeet TDT v3
 *
 * This engine loads CoreML models and performs speech-to-text transcription
 * using Apple's Neural Engine for optimal performance on Apple Silicon.
 */
class AsrEngine {
public:
    /**
     * Constructor
     * @param modelDir Path to directory containing CoreML model files
     */
    explicit AsrEngine(const std::string& modelDir);

    /**
     * Destructor - cleans up CoreML models
     */
    ~AsrEngine();

    /**
     * Check if the engine is ready for transcription
     */
    bool isReady() const;

    /**
     * Transcribe audio samples
     * @param samples Pointer to float32 audio samples
     * @param sampleCount Number of samples
     * @param sampleRate Sample rate (should be 16000)
     * @return Transcribed text
     */
    std::string transcribe(const float* samples, size_t sampleCount, int sampleRate);

    /**
     * Transcribe audio from file
     * @param filePath Path to audio file
     * @return Transcribed text
     */
    std::string transcribeFile(const std::string& filePath);

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;

    /**
     * Run encoder on mel features
     */
    std::vector<float> runEncoder(const std::vector<float>& melFeatures);

    /**
     * Compute mel spectrogram using CoreML model
     */
    std::vector<float> computeMelWithCoreML(const float* samples, size_t sampleCount,
                                             int sampleRate, void* melModel);

    // Prevent copying
    AsrEngine(const AsrEngine&) = delete;
    AsrEngine& operator=(const AsrEngine&) = delete;
};

#endif // ASR_ENGINE_H

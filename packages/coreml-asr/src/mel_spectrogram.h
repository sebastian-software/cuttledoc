/**
 * Mel Spectrogram Computation
 *
 * Software implementation of mel spectrogram extraction for audio preprocessing.
 * Used as fallback when CoreML mel model is not available.
 */

#ifndef MEL_SPECTROGRAM_H
#define MEL_SPECTROGRAM_H

#include <vector>
#include <memory>

class MelSpectrogram {
public:
    /**
     * Constructor with default parameters for Parakeet v3 CoreML model
     * - Sample rate: 16000 Hz
     * - FFT size: 512
     * - Hop length: 160 (10ms at 16kHz)
     * - Mel bins: 128 (FluidInference CoreML model uses 128)
     */
    MelSpectrogram(int sampleRate = 16000,
                   int fftSize = 512,
                   int hopLength = 160,
                   int melBins = 128);

    ~MelSpectrogram();

    /**
     * Compute mel spectrogram from audio samples
     * @param samples Audio samples (float32, normalized to [-1, 1])
     * @param sampleCount Number of samples
     * @param sampleRate Sample rate of input audio
     * @return Flattened mel spectrogram [num_frames, mel_bins]
     */
    std::vector<float> compute(const float* samples, size_t sampleCount, int sampleRate);

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

#endif // MEL_SPECTROGRAM_H

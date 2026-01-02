/**
 * Mel Spectrogram Implementation
 *
 * Uses Apple's Accelerate framework for efficient FFT computation.
 */

#import <Accelerate/Accelerate.h>
#include "mel_spectrogram.h"
#include <cmath>
#include <algorithm>

struct MelSpectrogram::Impl {
    int sampleRate;
    int fftSize;
    int hopLength;
    int melBins;

    // Accelerate FFT setup
    FFTSetup fftSetup;
    int log2n;

    // Mel filterbank
    std::vector<float> melFilterbank;
    std::vector<int> melFilterbankIndices;

    // Window function (Hann)
    std::vector<float> window;

    Impl(int sr, int fft, int hop, int mel)
        : sampleRate(sr), fftSize(fft), hopLength(hop), melBins(mel) {
        log2n = static_cast<int>(log2(fftSize));
        fftSetup = vDSP_create_fftsetup(log2n, FFT_RADIX2);

        // Create Hann window
        window.resize(fftSize);
        vDSP_hann_window(window.data(), fftSize, vDSP_HANN_NORM);

        // Create mel filterbank
        createMelFilterbank();
    }

    ~Impl() {
        if (fftSetup) {
            vDSP_destroy_fftsetup(fftSetup);
        }
    }

    /**
     * Convert frequency to mel scale
     */
    static float hzToMel(float hz) {
        return 2595.0f * log10f(1.0f + hz / 700.0f);
    }

    /**
     * Convert mel to frequency
     */
    static float melToHz(float mel) {
        return 700.0f * (powf(10.0f, mel / 2595.0f) - 1.0f);
    }

    /**
     * Create mel filterbank matrix
     */
    void createMelFilterbank() {
        float fMin = 0.0f;
        float fMax = static_cast<float>(sampleRate) / 2.0f;

        float melMin = hzToMel(fMin);
        float melMax = hzToMel(fMax);

        // Create mel points
        std::vector<float> melPoints(melBins + 2);
        for (int i = 0; i < melBins + 2; i++) {
            melPoints[i] = melMin + (melMax - melMin) * i / (melBins + 1);
        }

        // Convert back to Hz
        std::vector<float> hzPoints(melBins + 2);
        for (int i = 0; i < melBins + 2; i++) {
            hzPoints[i] = melToHz(melPoints[i]);
        }

        // Convert to FFT bin indices
        int numBins = fftSize / 2 + 1;
        std::vector<int> binIndices(melBins + 2);
        for (int i = 0; i < melBins + 2; i++) {
            binIndices[i] = static_cast<int>(floorf((fftSize + 1) * hzPoints[i] / sampleRate));
        }

        // Create filterbank (sparse representation would be more efficient)
        melFilterbank.resize(melBins * numBins, 0.0f);

        for (int m = 0; m < melBins; m++) {
            int fStart = binIndices[m];
            int fCenter = binIndices[m + 1];
            int fEnd = binIndices[m + 2];

            // Rising slope
            for (int f = fStart; f < fCenter; f++) {
                if (f >= 0 && f < numBins && fCenter != fStart) {
                    melFilterbank[m * numBins + f] =
                        static_cast<float>(f - fStart) / (fCenter - fStart);
                }
            }

            // Falling slope
            for (int f = fCenter; f < fEnd; f++) {
                if (f >= 0 && f < numBins && fEnd != fCenter) {
                    melFilterbank[m * numBins + f] =
                        static_cast<float>(fEnd - f) / (fEnd - fCenter);
                }
            }
        }
    }
};

MelSpectrogram::MelSpectrogram(int sampleRate, int fftSize, int hopLength, int melBins)
    : pImpl(std::make_unique<Impl>(sampleRate, fftSize, hopLength, melBins)) {}

MelSpectrogram::~MelSpectrogram() = default;

std::vector<float> MelSpectrogram::compute(const float* samples, size_t sampleCount, int sampleRate) {
    // Resample if needed (simple case: assume same sample rate for now)
    if (sampleRate != pImpl->sampleRate) {
        // TODO: Implement resampling
        // For now, just proceed with warning
    }

    int fftSize = pImpl->fftSize;
    int hopLength = pImpl->hopLength;
    int melBins = pImpl->melBins;
    int numBins = fftSize / 2 + 1;

    // Calculate number of frames
    int numFrames = static_cast<int>((sampleCount - fftSize) / hopLength) + 1;
    if (numFrames <= 0) {
        // Audio too short, pad with zeros
        std::vector<float> padded(fftSize, 0.0f);
        std::copy(samples, samples + std::min(sampleCount, static_cast<size_t>(fftSize)),
                  padded.begin());
        samples = padded.data();
        sampleCount = fftSize;
        numFrames = 1;
    }

    // Allocate buffers
    std::vector<float> frame(fftSize);
    std::vector<float> realPart(fftSize);
    std::vector<float> imagPart(fftSize);
    std::vector<float> magnitude(numBins);
    std::vector<float> melOutput(numFrames * melBins);

    DSPSplitComplex splitComplex;
    splitComplex.realp = realPart.data();
    splitComplex.imagp = imagPart.data();

    for (int i = 0; i < numFrames; i++) {
        int offset = i * hopLength;

        // Copy frame and apply window
        for (int j = 0; j < fftSize; j++) {
            if (offset + j < static_cast<int>(sampleCount)) {
                frame[j] = samples[offset + j] * pImpl->window[j];
            } else {
                frame[j] = 0.0f;
            }
        }

        // Convert to split complex format
        vDSP_ctoz((DSPComplex*)frame.data(), 2, &splitComplex, 1, fftSize / 2);

        // Perform FFT
        vDSP_fft_zrip(pImpl->fftSetup, &splitComplex, 1, pImpl->log2n, FFT_FORWARD);

        // Compute magnitude spectrum
        // Note: For power spectrum, we'd square these values
        vDSP_zvmags(&splitComplex, 1, magnitude.data(), 1, numBins);

        // Apply mel filterbank
        for (int m = 0; m < melBins; m++) {
            float sum = 0.0f;
            for (int f = 0; f < numBins; f++) {
                sum += magnitude[f] * pImpl->melFilterbank[m * numBins + f];
            }
            // Apply log compression (add small epsilon for numerical stability)
            melOutput[i * melBins + m] = logf(std::max(sum, 1e-10f));
        }
    }

    return melOutput;
}

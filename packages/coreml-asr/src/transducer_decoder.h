/**
 * Transducer Decoder
 *
 * Implements greedy and beam search decoding for RNN-T / TDT models.
 */

#ifndef TRANSDUCER_DECODER_H
#define TRANSDUCER_DECODER_H

#include <vector>
#include <string>
#include <memory>

#ifdef __OBJC__
@class MLModel;
#else
typedef void MLModel;
#endif

class TransducerDecoder {
public:
    /**
     * Constructor
     * @param vocabulary Token vocabulary for decoding
     * @param blankId ID of the blank token (default: 8192 for Parakeet-TDT-v3)
     */
    explicit TransducerDecoder(const std::vector<std::string>& vocabulary, int blankId = 8192);

    ~TransducerDecoder();

    /**
     * Decode encoder output to token IDs using greedy search
     * @param encoderOutput Encoder hidden states [num_frames, hidden_dim]
     * @param decoderModel CoreML decoder/prediction network model
     * @param jointModel CoreML joint network model
     * @param numFrames Optional number of frames to decode (0 = use all frames)
     * @return Vector of decoded token IDs
     */
    std::vector<int> decode(const std::vector<float>& encoderOutput,
                            void* decoderModel,
                            void* jointModel,
                            int numFrames = 0);

    /**
     * Decode with beam search (TODO)
     */
    std::vector<int> decodeBeam(const std::vector<float>& encoderOutput,
                                void* decoderModel,
                                void* jointModel,
                                int beamWidth = 4);

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

#endif // TRANSDUCER_DECODER_H

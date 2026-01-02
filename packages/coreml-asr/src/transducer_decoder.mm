/**
 * Transducer Decoder Implementation
 *
 * Greedy decoding for TDT (Token Duration Transducer) models.
 */

#import <Foundation/Foundation.h>
#import <CoreML/CoreML.h>

#include "transducer_decoder.h"
#include <algorithm>
#include <cmath>

struct TransducerDecoder::Impl {
    std::vector<std::string> vocabulary;
    int blankId;
    int vocabSize;

    Impl(const std::vector<std::string>& vocab, int blank)
        : vocabulary(vocab), blankId(blank), vocabSize(static_cast<int>(vocab.size())) {}
};

TransducerDecoder::TransducerDecoder(const std::vector<std::string>& vocabulary, int blankId)
    : pImpl(std::make_unique<Impl>(vocabulary, blankId)) {}

TransducerDecoder::~TransducerDecoder() = default;

/**
 * Run decoder/prediction network
 */
static std::vector<float> runDecoder(MLModel* model, int lastToken, const std::vector<float>& state) {
    @autoreleasepool {
        NSError* error = nil;

        // Create input for last token (usually embedded)
        NSArray<NSNumber*>* tokenShape = @[@1, @1];
        MLMultiArray* tokenInput = [[MLMultiArray alloc] initWithShape:tokenShape
                                                              dataType:MLMultiArrayDataTypeInt32
                                                                 error:&error];
        if (!error) {
            ((int32_t*)tokenInput.dataPointer)[0] = lastToken;
        }

        // Create state input if provided
        MLMultiArray* stateInput = nil;
        if (!state.empty()) {
            NSArray<NSNumber*>* stateShape = @[@1, @(state.size())];
            stateInput = [[MLMultiArray alloc] initWithShape:stateShape
                                                    dataType:MLMultiArrayDataTypeFloat32
                                                       error:&error];
            if (!error) {
                memcpy(stateInput.dataPointer, state.data(), state.size() * sizeof(float));
            }
        }

        // Build input dictionary
        NSMutableDictionary* inputDict = [NSMutableDictionary dictionary];
        inputDict[@"token"] = tokenInput;
        if (stateInput) {
            inputDict[@"state"] = stateInput;
        }

        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];

        id<MLFeatureProvider> output = [model predictionFromFeatures:provider error:&error];
        if (error) {
            return {};
        }

        // Extract decoder output
        MLFeatureValue* outputValue = [output featureValueForName:@"decoder_output"];
        if (!outputValue) {
            outputValue = [output featureValueForName:@"output"];
        }
        if (!outputValue || !outputValue.multiArrayValue) {
            return {};
        }

        MLMultiArray* outputArray = outputValue.multiArrayValue;
        NSInteger totalElements = 1;
        for (NSNumber* dim in outputArray.shape) {
            totalElements *= dim.integerValue;
        }

        std::vector<float> result(totalElements);
        memcpy(result.data(), (float*)outputArray.dataPointer, totalElements * sizeof(float));
        return result;
    }
}

/**
 * Run joint network to get logits
 */
static std::vector<float> runJoint(MLModel* model,
                                    const std::vector<float>& encoderState,
                                    const std::vector<float>& decoderState) {
    @autoreleasepool {
        NSError* error = nil;

        // Encoder state input
        NSArray<NSNumber*>* encShape = @[@1, @1, @(encoderState.size())];
        MLMultiArray* encInput = [[MLMultiArray alloc] initWithShape:encShape
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (!error) {
            memcpy(encInput.dataPointer, encoderState.data(), encoderState.size() * sizeof(float));
        }

        // Decoder state input
        NSArray<NSNumber*>* decShape = @[@1, @1, @(decoderState.size())];
        MLMultiArray* decInput = [[MLMultiArray alloc] initWithShape:decShape
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (!error) {
            memcpy(decInput.dataPointer, decoderState.data(), decoderState.size() * sizeof(float));
        }

        NSDictionary* inputDict = @{
            @"encoder_output": encInput,
            @"decoder_output": decInput
        };

        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];

        id<MLFeatureProvider> output = [model predictionFromFeatures:provider error:&error];
        if (error) {
            return {};
        }

        MLFeatureValue* outputValue = [output featureValueForName:@"logits"];
        if (!outputValue) {
            outputValue = [output featureValueForName:@"output"];
        }
        if (!outputValue || !outputValue.multiArrayValue) {
            return {};
        }

        MLMultiArray* outputArray = outputValue.multiArrayValue;
        NSInteger totalElements = 1;
        for (NSNumber* dim in outputArray.shape) {
            totalElements *= dim.integerValue;
        }

        std::vector<float> result(totalElements);
        memcpy(result.data(), (float*)outputArray.dataPointer, totalElements * sizeof(float));
        return result;
    }
}

/**
 * Find argmax of a vector
 */
static int argmax(const std::vector<float>& v) {
    if (v.empty()) return 0;
    return static_cast<int>(std::max_element(v.begin(), v.end()) - v.begin());
}

std::vector<int> TransducerDecoder::decode(const std::vector<float>& encoderOutput,
                                           void* decoderModel,
                                           void* jointModel) {
    @autoreleasepool {
        MLModel* decoder = (__bridge MLModel*)decoderModel;
        MLModel* joint = (__bridge MLModel*)jointModel;

        std::vector<int> tokens;
        int blankId = pImpl->blankId;
        int vocabSize = pImpl->vocabSize;

        // Determine encoder hidden dimension and number of frames
        // This assumes encoderOutput is [num_frames, hidden_dim]
        // We need to know the hidden dimension from the model

        // For Parakeet TDT, typical hidden dim is 512 or 1024
        int hiddenDim = 512; // Default, should be detected from model
        int numFrames = static_cast<int>(encoderOutput.size()) / hiddenDim;

        if (numFrames <= 0) {
            return tokens;
        }

        // Initialize decoder state
        int lastToken = blankId; // Start with blank
        std::vector<float> decoderState;

        // Greedy decoding
        for (int t = 0; t < numFrames; t++) {
            // Get encoder output for this frame
            std::vector<float> encFrame(encoderOutput.begin() + t * hiddenDim,
                                         encoderOutput.begin() + (t + 1) * hiddenDim);

            // Run decoder
            std::vector<float> decOutput = runDecoder(decoder, lastToken, decoderState);
            if (decOutput.empty()) {
                // Fallback: use zero decoder state
                decOutput.resize(hiddenDim, 0.0f);
            }

            // Run joint network
            std::vector<float> logits = runJoint(joint, encFrame, decOutput);

            if (logits.empty()) {
                continue;
            }

            // Get predicted token
            int predictedToken = argmax(logits);

            // For TDT: handle duration predictions
            // Simplified: just emit non-blank tokens
            if (predictedToken != blankId && predictedToken < vocabSize) {
                tokens.push_back(predictedToken);
                lastToken = predictedToken;
            }
        }

        return tokens;
    }
}

std::vector<int> TransducerDecoder::decodeBeam(const std::vector<float>& encoderOutput,
                                               void* decoderModel,
                                               void* jointModel,
                                               int beamWidth) {
    // TODO: Implement beam search
    // For now, fall back to greedy
    return decode(encoderOutput, decoderModel, jointModel);
}

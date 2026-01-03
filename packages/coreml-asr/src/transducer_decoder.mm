/**
 * Transducer Decoder Implementation for FluidInference CoreML Models
 *
 * Greedy decoding for TDT (Token Duration Transducer) models.
 * The FluidInference model has a special interface where Joint directly outputs token_id.
 */

#import <Foundation/Foundation.h>
#import <CoreML/CoreML.h>

#include "transducer_decoder.h"
#include <algorithm>
#include <cmath>

// Constants from model specs
static const int ENCODER_DIM = 1024;
static const int DECODER_DIM = 640;
static const int LSTM_LAYERS = 2;
// Parakeet-TDT-v3 uses 8192 regular tokens with blank at index 8192

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
 * Run decoder/prediction network with LSTM state
 */
static bool runDecoder(MLModel* model,
                       int targetToken,
                       const std::vector<float>& hIn,
                       const std::vector<float>& cIn,
                       std::vector<float>& decoderOutput,
                       std::vector<float>& hOut,
                       std::vector<float>& cOut) {
    @autoreleasepool {
        NSError* error = nil;

        // Create targets input: shape (1, 1)
        MLMultiArray* targets = [[MLMultiArray alloc] initWithShape:@[@1, @1]
                                                           dataType:MLMultiArrayDataTypeInt32
                                                              error:&error];
        if (error) return false;
        ((int32_t*)targets.dataPointer)[0] = targetToken;

        // Create target_length input: shape (1)
        MLMultiArray* targetLength = [[MLMultiArray alloc] initWithShape:@[@1]
                                                                dataType:MLMultiArrayDataTypeInt32
                                                                   error:&error];
        if (error) return false;
        ((int32_t*)targetLength.dataPointer)[0] = 1;

        // Create h_in input: shape (2, 1, 640)
        MLMultiArray* hInArray = [[MLMultiArray alloc] initWithShape:@[@(LSTM_LAYERS), @1, @(DECODER_DIM)]
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (error) return false;
        if (!hIn.empty()) {
            memcpy(hInArray.dataPointer, hIn.data(), hIn.size() * sizeof(float));
        } else {
            memset(hInArray.dataPointer, 0, LSTM_LAYERS * DECODER_DIM * sizeof(float));
        }

        // Create c_in input: shape (2, 1, 640)
        MLMultiArray* cInArray = [[MLMultiArray alloc] initWithShape:@[@(LSTM_LAYERS), @1, @(DECODER_DIM)]
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (error) return false;
        if (!cIn.empty()) {
            memcpy(cInArray.dataPointer, cIn.data(), cIn.size() * sizeof(float));
        } else {
            memset(cInArray.dataPointer, 0, LSTM_LAYERS * DECODER_DIM * sizeof(float));
        }

        // Build input dictionary
        NSDictionary* inputDict = @{
            @"targets": targets,
            @"target_length": targetLength,
            @"h_in": hInArray,
            @"c_in": cInArray
        };

        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];
        if (error) return false;

        id<MLFeatureProvider> output = [model predictionFromFeatures:provider error:&error];
        if (error) {
            NSLog(@"Decoder error: %@", [error localizedDescription]);
            return false;
        }

        // Extract decoder output: shape (1, 640, 1)
        MLFeatureValue* decoderValue = [output featureValueForName:@"decoder"];
        if (!decoderValue || !decoderValue.multiArrayValue) return false;

        MLMultiArray* decArray = decoderValue.multiArrayValue;
        decoderOutput.resize(DECODER_DIM);
        float* decPtr = (float*)decArray.dataPointer;
        for (int i = 0; i < DECODER_DIM; i++) {
            decoderOutput[i] = decPtr[i];
        }

        // Extract h_out: shape (2, 1, 640)
        MLFeatureValue* hOutValue = [output featureValueForName:@"h_out"];
        if (hOutValue && hOutValue.multiArrayValue) {
            hOut.resize(LSTM_LAYERS * DECODER_DIM);
            memcpy(hOut.data(), hOutValue.multiArrayValue.dataPointer, hOut.size() * sizeof(float));
        }

        // Extract c_out: shape (2, 1, 640)
        MLFeatureValue* cOutValue = [output featureValueForName:@"c_out"];
        if (cOutValue && cOutValue.multiArrayValue) {
            cOut.resize(LSTM_LAYERS * DECODER_DIM);
            memcpy(cOut.data(), cOutValue.multiArrayValue.dataPointer, cOut.size() * sizeof(float));
        }

        return true;
    }
}

/**
 * Run joint network to get token prediction
 * Returns: token_id (or -1 for blank/error), duration, probability
 */
static bool runJoint(MLModel* model,
                     const std::vector<float>& encoderStep,
                     const std::vector<float>& decoderStep,
                     int& tokenId,
                     int& duration,
                     float& probability) {
    @autoreleasepool {
        NSError* error = nil;

        // Create encoder_step input: shape (1, 1024, 1)
        MLMultiArray* encInput = [[MLMultiArray alloc] initWithShape:@[@1, @(ENCODER_DIM), @1]
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (error) return false;
        float* encPtr = (float*)encInput.dataPointer;
        for (int i = 0; i < ENCODER_DIM; i++) {
            encPtr[i] = encoderStep[i];
        }

        // Create decoder_step input: shape (1, 640, 1)
        MLMultiArray* decInput = [[MLMultiArray alloc] initWithShape:@[@1, @(DECODER_DIM), @1]
                                                            dataType:MLMultiArrayDataTypeFloat32
                                                               error:&error];
        if (error) return false;
        float* decPtr = (float*)decInput.dataPointer;
        for (int i = 0; i < DECODER_DIM; i++) {
            decPtr[i] = decoderStep[i];
        }

        NSDictionary* inputDict = @{
            @"encoder_step": encInput,
            @"decoder_step": decInput
        };

        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];
        if (error) return false;

        id<MLFeatureProvider> output = [model predictionFromFeatures:provider error:&error];
        if (error) {
            NSLog(@"Joint error: %@", [error localizedDescription]);
            return false;
        }

        // Extract token_id: shape (1, 1, 1)
        MLFeatureValue* tokenValue = [output featureValueForName:@"token_id"];
        if (!tokenValue || !tokenValue.multiArrayValue) return false;

        MLMultiArray* tokenArray = tokenValue.multiArrayValue;

        // Handle different data types
        if (tokenArray.dataType == MLMultiArrayDataTypeFloat32) {
            tokenId = (int)((float*)tokenArray.dataPointer)[0];
        } else if (tokenArray.dataType == MLMultiArrayDataTypeInt32) {
            tokenId = ((int32_t*)tokenArray.dataPointer)[0];
        } else {
            // Fallback: try float interpretation
            tokenId = (int)[tokenArray objectAtIndexedSubscript:0].floatValue;
        }

        // Extract duration: shape (1, 1, 1)
        MLFeatureValue* durationValue = [output featureValueForName:@"duration"];
        if (durationValue && durationValue.multiArrayValue) {
            MLMultiArray* durArray = durationValue.multiArrayValue;
            // Log data type once
            static bool durTypeLogged = false;
            if (!durTypeLogged) {
                NSLog(@"duration dataType: %ld (int32=131104, float32=65568)", (long)durArray.dataType);
                durTypeLogged = true;
            }
            if (durArray.dataType == MLMultiArrayDataTypeInt32) {
                duration = ((int32_t*)durArray.dataPointer)[0];
            } else {
                duration = (int)((float*)durArray.dataPointer)[0];
            }
        } else {
            duration = 1;
        }

        // Extract token_prob: shape (1, 1, 1)
        MLFeatureValue* probValue = [output featureValueForName:@"token_prob"];
        if (probValue && probValue.multiArrayValue) {
            probability = ((float*)probValue.multiArrayValue.dataPointer)[0];
        } else {
            probability = 1.0f;
        }

        return true;
    }
}

std::vector<int> TransducerDecoder::decode(const std::vector<float>& encoderOutput,
                                           void* decoderModel,
                                           void* jointModel,
                                           int providedNumFrames) {
    @autoreleasepool {
        MLModel* decoder = (__bridge MLModel*)decoderModel;
        MLModel* joint = (__bridge MLModel*)jointModel;

        std::vector<int> tokens;
        int blankId = pImpl->blankId;
        int vocabSize = pImpl->vocabSize;

        // Encoder output is [1, 1024, num_frames] - we need to extract frames
        // Total size / ENCODER_DIM = num_frames
        int totalFrames = static_cast<int>(encoderOutput.size()) / ENCODER_DIM;

        // Use provided numFrames if valid, otherwise use all frames
        int numFrames = (providedNumFrames > 0 && providedNumFrames <= totalFrames)
                        ? providedNumFrames : totalFrames;

        if (numFrames <= 0) {
            NSLog(@"TransducerDecoder: No frames in encoder output (size=%zu)", encoderOutput.size());
            return tokens;
        }


        // Initialize LSTM states (zeros)
        std::vector<float> hState(LSTM_LAYERS * DECODER_DIM, 0.0f);
        std::vector<float> cState(LSTM_LAYERS * DECODER_DIM, 0.0f);

        // Initialize decoder with blank token
        int lastToken = blankId;
        std::vector<float> decoderOutput;
        std::vector<float> hOut, cOut;

        // Run initial decoder step with blank token
        if (!runDecoder(decoder, lastToken, hState, cState, decoderOutput, hOut, cOut)) {
            return tokens;
        }
        hState = hOut;
        cState = cOut;

        // Greedy decoding over encoder frames
        int t = 0;
        int maxIterations = numFrames * 10; // Safety limit
        int iterations = 0;

        while (t < numFrames && iterations < maxIterations) {
            iterations++;

            // Extract encoder frame at position t
            // AsrEngine now outputs in [time, hidden] layout for easier access
            // So element at time=t, hidden=d is at: t * ENCODER_DIM + d
            std::vector<float> encoderFrame(ENCODER_DIM);
            size_t frameOffset = t * ENCODER_DIM;
            for (int d = 0; d < ENCODER_DIM; d++) {
                encoderFrame[d] = encoderOutput[frameOffset + d];
            }


            // Run joint network
            int tokenId = 0;
            int duration = 1;
            float probability = 0.0f;

            if (!runJoint(joint, encoderFrame, decoderOutput, tokenId, duration, probability)) {
                // On error, skip to next frame
                t++;
                continue;
            }


            // Debug: Log non-blank tokens with their duration
            if (tokenId != blankId && tokenId >= 0 && tokenId < vocabSize && iterations < 20) {
                NSLog(@"Frame %d: token=%d, duration=%d, prob=%.3f", t, tokenId, duration, probability);
            }

            if (tokenId == blankId || tokenId < 0 || tokenId >= vocabSize) {
                // Blank or invalid token - advance time by at least 1 frame
                t += std::max(1, duration);
            } else {
                // Non-blank token - emit it and update decoder
                tokens.push_back(tokenId);
                lastToken = tokenId;

                // Run decoder with new token
                if (!runDecoder(decoder, lastToken, hState, cState, decoderOutput, hOut, cOut)) {
                    t++;
                    continue;
                }
                hState = hOut;
                cState = cOut;

                // For TDT: advance time by duration
                // Always advance at least 1 frame to prevent infinite loops
                t += std::max(1, duration);
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
    return decode(encoderOutput, decoderModel, jointModel, 0);
}

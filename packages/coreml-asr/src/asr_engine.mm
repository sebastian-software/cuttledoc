/**
 * ASR Engine Implementation
 *
 * CoreML-based speech recognition using Parakeet TDT v3 models.
 */

#import <Foundation/Foundation.h>
#import <CoreML/CoreML.h>
#import <Accelerate/Accelerate.h>

#include "asr_engine.h"
#include "mel_spectrogram.h"
#include "transducer_decoder.h"

#include <fstream>
#include <stdexcept>

/**
 * Private implementation (PIMPL pattern)
 */
struct AsrEngine::Impl {
    // CoreML Models
    MLModel* encoderModel = nil;
    MLModel* decoderModel = nil;
    MLModel* jointModel = nil;
    MLModel* melModel = nil;

    // Tokenizer vocabulary
    std::vector<std::string> vocabulary;

    // Model directory
    std::string modelDir;

    // Ready state
    bool ready = false;

    // Mel spectrogram processor
    std::unique_ptr<MelSpectrogram> melProcessor;

    // Transducer decoder
    std::unique_ptr<TransducerDecoder> decoder;

    // Last mel length from preprocessor (for encoder)
    int32_t lastMelLength = 0;

    // Last encoder length (after downsampling)
    int32_t lastEncoderLength = 0;

    // Encoder output strides for proper frame extraction
    NSInteger encoderStride0 = 0;  // batch stride
    NSInteger encoderStride1 = 0;  // hidden stride (includes padding!)
    NSInteger encoderStride2 = 1;  // time stride
};

/**
 * Load a CoreML model from a .mlmodelc directory
 */
static MLModel* loadModel(const std::string& path) {
    @autoreleasepool {
        NSString* nsPath = [NSString stringWithUTF8String:path.c_str()];
        NSURL* url = [NSURL fileURLWithPath:nsPath];

        NSError* error = nil;

        // Configure for optimal performance on Apple Silicon
        MLModelConfiguration* config = [[MLModelConfiguration alloc] init];
        config.computeUnits = MLComputeUnitsAll; // Use ANE + GPU + CPU

        MLModel* model = [MLModel modelWithContentsOfURL:url configuration:config error:&error];

        if (error != nil) {
            NSString* errorMsg = [error localizedDescription];
            throw std::runtime_error(std::string("Failed to load model: ") +
                                     [errorMsg UTF8String]);
        }

        return model;
    }
}

/**
 * Load vocabulary/tokens from file
 */
static std::vector<std::string> loadVocabulary(const std::string& path) {
    std::vector<std::string> vocab;
    std::ifstream file(path);

    if (!file.is_open()) {
        throw std::runtime_error("Failed to open vocabulary file: " + path);
    }

    std::string line;
    while (std::getline(file, line)) {
        // FluidInference vocab.txt format: each line is just the token itself
        // Tokens may start with a space (word boundary marker)
        // Just use the entire line as the token
        vocab.push_back(line);
    }

    return vocab;
}

AsrEngine::AsrEngine(const std::string& modelDir) : pImpl(std::make_unique<Impl>()) {
    pImpl->modelDir = modelDir;

    @autoreleasepool {
        try {
            // Load CoreML models
            // Note: Model names based on FluidInference/parakeet-tdt-0.6b-v3-coreml
            std::string encoderPath = modelDir + "/Encoder.mlmodelc";
            std::string decoderPath = modelDir + "/Decoder.mlmodelc";
            std::string jointPath = modelDir + "/JointDecision.mlmodelc";
            // Preprocessor model combines audio → mel spectrogram for the encoder
            std::string melPath = modelDir + "/Preprocessor.mlmodelc";

            // Check if models exist, try alternative names
            NSFileManager* fm = [NSFileManager defaultManager];

            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:encoderPath.c_str()]]) {
                encoderPath = modelDir + "/ParakeetEncoder_15s.mlmodelc";
            }

            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:decoderPath.c_str()]]) {
                decoderPath = modelDir + "/ParakeetDecoder.mlmodelc";
            }

            pImpl->encoderModel = loadModel(encoderPath);
            pImpl->decoderModel = loadModel(decoderPath);
            pImpl->jointModel = loadModel(jointPath);

            // Preprocessor model is required - it handles audio → mel spectrogram
            if ([fm fileExistsAtPath:[NSString stringWithUTF8String:melPath.c_str()]]) {
                pImpl->melModel = loadModel(melPath);

            } else {
                NSLog(@"WARNING: Preprocessor model not found at %s, transcription may fail", melPath.c_str());
            }

            // Load vocabulary
            std::string vocabPath = modelDir + "/vocab.txt";
            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:vocabPath.c_str()]]) {
                vocabPath = modelDir + "/tokens.txt";
            }
            pImpl->vocabulary = loadVocabulary(vocabPath);
            // Initialize processors
            pImpl->melProcessor = std::make_unique<MelSpectrogram>();
            pImpl->decoder = std::make_unique<TransducerDecoder>(pImpl->vocabulary);
            pImpl->ready = true;

        } catch (const std::exception& e) {
            NSLog(@"Failed to initialize ASR Engine: %s", e.what());
            throw;
        }
    }
}

AsrEngine::~AsrEngine() {
    @autoreleasepool {
        pImpl->encoderModel = nil;
        pImpl->decoderModel = nil;
        pImpl->jointModel = nil;
        pImpl->melModel = nil;
    }
}

bool AsrEngine::isReady() const {
    return pImpl->ready;
}

std::string AsrEngine::transcribe(const float* samples, size_t sampleCount, int sampleRate) {
    if (!pImpl->ready) {
        throw std::runtime_error("ASR engine not initialized");
    }

    @autoreleasepool {
        // Step 1: Compute mel spectrogram
        std::vector<float> melFeatures;

        if (pImpl->melModel != nil) {
            // Use CoreML mel spectrogram model
            melFeatures = computeMelWithCoreML(samples, sampleCount, sampleRate,
                                                (__bridge void*)pImpl->melModel);
        } else {
            // Use software mel spectrogram
            melFeatures = pImpl->melProcessor->compute(samples, sampleCount, sampleRate);
        }

        // Step 2: Run encoder
        std::vector<float> encoderOutput = runEncoder(melFeatures);

        // Step 3: Run transducer decoding (greedy or beam search)
        // Use only the actual encoder frames, not padded ones
        int32_t actualEncoderLength = pImpl->lastEncoderLength > 0 ? pImpl->lastEncoderLength : 188;

        std::vector<int> tokenIds = pImpl->decoder->decode(
            encoderOutput,
            (__bridge void*)pImpl->decoderModel,
            (__bridge void*)pImpl->jointModel,
            actualEncoderLength
        );

        // Step 4: Convert token IDs to text
        std::string result;
        for (int tokenId : tokenIds) {
            if (tokenId >= 0 && tokenId < static_cast<int>(pImpl->vocabulary.size())) {
                std::string token = pImpl->vocabulary[tokenId];

                // Handle special tokens
                if (token.empty() ||
                    token == "<blk>" || token == "<blank>" || token == "<pad>" ||
                    token == "<unk>" || token == "<|nospeech|>" ||
                    token.find("<|") == 0) {  // Skip all special tokens like <|...|>
                    continue;
                }

                // SentencePiece uses leading space for word boundaries
                // Just append the token as-is (including the space if present)
                result += token;
            }
        }

        // Trim leading/trailing whitespace
        size_t start = result.find_first_not_of(' ');
        if (start == std::string::npos) return "";
        size_t end = result.find_last_not_of(' ');
        return result.substr(start, end - start + 1);
    }
}

std::string AsrEngine::transcribeFile(const std::string& filePath) {
    // TODO: Implement audio file loading
    // For now, this requires the caller to load the audio and call transcribe()
    throw std::runtime_error("transcribeFile not yet implemented - use transcribe() with samples");
}

/**
 * Run the encoder model on mel features
 */
std::vector<float> AsrEngine::runEncoder(const std::vector<float>& melFeatures) {
    @autoreleasepool {
        // Create input MLMultiArray
        // FluidInference CoreML model expects FIXED shape [1, 128, 1501]
        const int melBins = 128;
        const size_t fixedFrames = 1501; // Fixed size for 15 second audio
        size_t numFrames = melFeatures.size() / melBins;

        // Clamp input frames to max
        if (numFrames > fixedFrames) {
            numFrames = fixedFrames;
        }

        NSError* error = nil;
        NSArray<NSNumber*>* shape = @[@1, @(melBins), @(fixedFrames)];
        MLMultiArray* input = [[MLMultiArray alloc] initWithShape:shape
                                                         dataType:MLMultiArrayDataTypeFloat32
                                                            error:&error];
        if (error) {
            throw std::runtime_error("Failed to create input array");
        }

        // Zero-initialize for padding
        float* inputPtr = (float*)input.dataPointer;
        memset(inputPtr, 0, melBins * fixedFrames * sizeof(float));


        // Copy mel features using proper stride handling
        // Input melFeatures is in row-major [mel_bins][time] format
        // MLMultiArray might have different strides
        NSInteger inStride0 = [input.strides[0] integerValue]; // batch stride
        NSInteger inStride1 = [input.strides[1] integerValue]; // mel_bins stride
        NSInteger inStride2 = [input.strides[2] integerValue]; // time stride

        // numFrames from melFeatures = melFeatures.size() / melBins
        size_t srcNumFrames = melFeatures.size() / melBins;
        for (int m = 0; m < melBins; m++) {
            for (size_t t = 0; t < srcNumFrames && t < fixedFrames; t++) {
                // Source: row-major [m][t] where melFeatures is [melBins][srcNumFrames]
                size_t srcIdx = m * srcNumFrames + t;
                // Target: MLMultiArray with strides
                NSInteger dstIdx = 0 * inStride0 + m * inStride1 + (NSInteger)t * inStride2;
                inputPtr[dstIdx] = melFeatures[srcIdx];
            }
        }

        // Create mel_length input (actual number of frames without padding)
        // Use the value from the preprocessor if available
        int32_t actualMelLength = (pImpl->lastMelLength > 0) ? pImpl->lastMelLength : static_cast<int32_t>(numFrames);

        NSArray<NSNumber*>* lengthShape = @[@1];
        MLMultiArray* lengthInput = [[MLMultiArray alloc] initWithShape:lengthShape
                                                               dataType:MLMultiArrayDataTypeInt32
                                                                  error:&error];
        if (error) {
            throw std::runtime_error("Failed to create length array");
        }
        ((int32_t*)lengthInput.dataPointer)[0] = actualMelLength;

        // Create feature provider with both inputs
        NSDictionary* inputDict = @{
            @"mel": input,
            @"mel_length": lengthInput
        };
        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];

        if (error) {
            throw std::runtime_error("Failed to create feature provider");
        }

        // Run prediction
        id<MLFeatureProvider> output = [pImpl->encoderModel predictionFromFeatures:provider
                                                                             error:&error];
        if (error) {
            NSString* errorMsg = [error localizedDescription];
            throw std::runtime_error(std::string("Encoder prediction failed: ") +
                                     [errorMsg UTF8String]);
        }

        // Extract output - try various names
        NSArray<NSString*>* possibleNames = @[@"encoder", @"encoder_output", @"output", @"encoded", @"hidden", @"features", @"x"];
        MLFeatureValue* outputValue = nil;

        for (NSString* name in possibleNames) {
            outputValue = [output featureValueForName:name];
            if (outputValue != nil && outputValue.multiArrayValue != nil) {
                break;
            }
        }

        if (outputValue == nil || outputValue.multiArrayValue == nil) {
            throw std::runtime_error("Failed to get encoder output");
        }

        MLMultiArray* outputArray = outputValue.multiArrayValue;


        // Store strides for proper frame extraction in decoder
        pImpl->encoderStride0 = [outputArray.strides[0] integerValue];  // batch stride
        pImpl->encoderStride1 = [outputArray.strides[1] integerValue];  // hidden stride
        pImpl->encoderStride2 = [outputArray.strides[2] integerValue];  // time stride

        // Get encoder_length (actual number of encoder frames after downsampling)
        MLFeatureValue* encoderLengthValue = [output featureValueForName:@"encoder_length"];
        if (encoderLengthValue && encoderLengthValue.multiArrayValue) {
            pImpl->lastEncoderLength = ((int32_t*)encoderLengthValue.multiArrayValue.dataPointer)[0];
        } else {
            // Calculate encoder length from mel_length (8x downsampling)
            pImpl->lastEncoderLength = (pImpl->lastMelLength + 7) / 8;
        }

        // Extract encoder output with proper stride handling
        // Shape: [1, 1024, numTimeFrames]
        // Strides may include padding, so we can't just memcpy
        NSInteger hiddenDim = [outputArray.shape[1] integerValue];   // 1024
        NSInteger numTimeFrames = [outputArray.shape[2] integerValue];  // e.g. 188
        NSInteger stride1 = [outputArray.strides[1] integerValue];  // hidden stride (may be > numTimeFrames due to padding)
        NSInteger stride2 = [outputArray.strides[2] integerValue];  // time stride (usually 1)

        // We'll reorganize data to [numTimeFrames, hiddenDim] for easier access in decoder
        // Result format: contiguous [numTimeFrames * hiddenDim] with layout [time][hidden]
        std::vector<float> result(numTimeFrames * hiddenDim);
        float* outputPtr = (float*)outputArray.dataPointer;

        for (NSInteger t = 0; t < numTimeFrames; t++) {
            for (NSInteger h = 0; h < hiddenDim; h++) {
                // Original layout: [batch, hidden, time]
                // Index: batch * stride0 + hidden * stride1 + time * stride2
                // For batch=0: hidden * stride1 + time * stride2
                NSInteger srcIdx = h * stride1 + t * stride2;
                // Target layout: [time, hidden]
                NSInteger dstIdx = t * hiddenDim + h;
                result[dstIdx] = outputPtr[srcIdx];
            }
        }


        return result;
    }
}

/**
 * Compute mel spectrogram using CoreML Preprocessor model
 * FluidInference Preprocessor expects: audio_signal [1, samples], audio_length [1]
 * Returns: mel features suitable for encoder
 */
std::vector<float> AsrEngine::computeMelWithCoreML(const float* samples, size_t sampleCount,
                                                    int sampleRate, void* melModelPtr) {
    MLModel* preprocessor = (__bridge MLModel*)melModelPtr;
    @autoreleasepool {
        NSError* error = nil;

        // Pad audio to 240000 samples (15 seconds) as expected by the model
        const size_t targetSamples = 240000;
        size_t paddedCount = std::max(sampleCount, targetSamples);

        // Create audio_signal input array [1, samples]
        NSArray<NSNumber*>* shape = @[@1, @(paddedCount)];
        MLMultiArray* audioInput = [[MLMultiArray alloc] initWithShape:shape
                                                              dataType:MLMultiArrayDataTypeFloat32
                                                                 error:&error];
        if (error) {
            throw std::runtime_error("Failed to create audio input array");
        }

        float* inputPtr = (float*)audioInput.dataPointer;
        memcpy(inputPtr, samples, sampleCount * sizeof(float));
        // Zero-pad the rest
        if (paddedCount > sampleCount) {
            memset(inputPtr + sampleCount, 0, (paddedCount - sampleCount) * sizeof(float));
        }

        // Create audio_length input [1]
        NSArray<NSNumber*>* lengthShape = @[@1];
        MLMultiArray* lengthInput = [[MLMultiArray alloc] initWithShape:lengthShape
                                                               dataType:MLMultiArrayDataTypeInt32
                                                                  error:&error];
        if (error) {
            throw std::runtime_error("Failed to create length input array");
        }
        ((int32_t*)lengthInput.dataPointer)[0] = static_cast<int32_t>(sampleCount);

        // Run preprocessor model
        NSDictionary* inputDict = @{
            @"audio_signal": audioInput,
            @"audio_length": lengthInput
        };
        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];

        id<MLFeatureProvider> output = [preprocessor predictionFromFeatures:provider error:&error];
        if (error) {
            NSLog(@"Preprocessor error: %@", [error localizedDescription]);
            throw std::runtime_error("Preprocessor computation failed");
        }

        // Try to find mel output - common names
        NSArray<NSString*>* possibleNames = @[@"mel", @"mel_spectrogram", @"mel_output", @"output", @"x"];
        MLFeatureValue* outputValue = nil;

        for (NSString* name in possibleNames) {
            outputValue = [output featureValueForName:name];
            if (outputValue != nil && outputValue.multiArrayValue != nil) {
                break;
            }
        }

        if (outputValue == nil || outputValue.multiArrayValue == nil) {
            // Log available outputs
            NSLog(@"Available preprocessor outputs:");
            for (NSString* name in output.featureNames) {
                NSLog(@"  - %@", name);
            }
            throw std::runtime_error("Failed to get preprocessor output");
        }

        MLMultiArray* outputArray = outputValue.multiArrayValue;


        // Get mel_length from preprocessor (actual length without padding)
        MLFeatureValue* melLengthValue = [output featureValueForName:@"mel_length"];
        if (melLengthValue && melLengthValue.multiArrayValue) {
            int32_t actualMelLength = ((int32_t*)melLengthValue.multiArrayValue.dataPointer)[0];
            // Store this for later use (we'll need to pass it to the encoder)
            pImpl->lastMelLength = actualMelLength;
        }

        // Extract mel features with proper stride handling
        // Shape: [1, mel_bins, num_frames] -> expected [1, 128, 1501]
        NSInteger melBins = [outputArray.shape[1] integerValue];   // 128
        NSInteger numFrames = [outputArray.shape[2] integerValue]; // 1501
        NSInteger stride0 = [outputArray.strides[0] integerValue]; // batch stride
        NSInteger stride1 = [outputArray.strides[1] integerValue]; // mel_bins stride
        NSInteger stride2 = [outputArray.strides[2] integerValue]; // time stride

        // Result will be contiguous [mel_bins * num_frames] in row-major order
        // The encoder expects [1, 128, 1501] layout so we store it as [mel_bins][time]
        std::vector<float> result(melBins * numFrames);
        float* outputPtr = (float*)outputArray.dataPointer;

        for (NSInteger m = 0; m < melBins; m++) {
            for (NSInteger t = 0; t < numFrames; t++) {
                // Source: [0, m, t] with strides
                NSInteger srcIdx = 0 * stride0 + m * stride1 + t * stride2;
                // Target: row-major [m][t]
                NSInteger dstIdx = m * numFrames + t;
                result[dstIdx] = outputPtr[srcIdx];
            }
        }


        return result;
    }
}

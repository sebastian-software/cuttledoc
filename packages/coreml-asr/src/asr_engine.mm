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
        // Each line may be "token index" or just "token"
        size_t spacePos = line.find(' ');
        if (spacePos != std::string::npos) {
            vocab.push_back(line.substr(0, spacePos));
        } else {
            vocab.push_back(line);
        }
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
            std::string melPath = modelDir + "/Melspectrogram_15s.mlmodelc";

            // Check if models exist, try alternative names
            NSFileManager* fm = [NSFileManager defaultManager];

            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:encoderPath.c_str()]]) {
                encoderPath = modelDir + "/ParakeetEncoder_15s.mlmodelc";
            }

            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:decoderPath.c_str()]]) {
                decoderPath = modelDir + "/ParakeetDecoder.mlmodelc";
            }

            NSLog(@"Loading encoder from: %s", encoderPath.c_str());
            pImpl->encoderModel = loadModel(encoderPath);

            NSLog(@"Loading decoder from: %s", decoderPath.c_str());
            pImpl->decoderModel = loadModel(decoderPath);

            NSLog(@"Loading joint model from: %s", jointPath.c_str());
            pImpl->jointModel = loadModel(jointPath);

            // Mel spectrogram model is optional - we can compute it in software
            if ([fm fileExistsAtPath:[NSString stringWithUTF8String:melPath.c_str()]]) {
                NSLog(@"Loading mel spectrogram model from: %s", melPath.c_str());
                pImpl->melModel = loadModel(melPath);
            } else {
                NSLog(@"Mel spectrogram model not found, using software implementation");
            }

            // Load vocabulary
            std::string vocabPath = modelDir + "/vocab.txt";
            if (![fm fileExistsAtPath:[NSString stringWithUTF8String:vocabPath.c_str()]]) {
                vocabPath = modelDir + "/tokens.txt";
            }
            pImpl->vocabulary = loadVocabulary(vocabPath);
            NSLog(@"Loaded vocabulary with %zu tokens", pImpl->vocabulary.size());

            // Initialize processors
            pImpl->melProcessor = std::make_unique<MelSpectrogram>();
            pImpl->decoder = std::make_unique<TransducerDecoder>(pImpl->vocabulary);

            pImpl->ready = true;
            NSLog(@"ASR Engine initialized successfully");

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
        std::vector<int> tokenIds = pImpl->decoder->decode(
            encoderOutput,
            (__bridge void*)pImpl->decoderModel,
            (__bridge void*)pImpl->jointModel
        );

        // Step 4: Convert token IDs to text
        std::string result;
        for (int tokenId : tokenIds) {
            if (tokenId >= 0 && tokenId < static_cast<int>(pImpl->vocabulary.size())) {
                std::string token = pImpl->vocabulary[tokenId];
                // Handle special tokens and subword markers
                if (token == "<blk>" || token == "<blank>" || token == "<pad>") {
                    continue;
                }
                if (token.find("▁") == 0) {
                    // SentencePiece space marker
                    result += " " + token.substr(3); // Skip the ▁ character
                } else {
                    result += token;
                }
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

        // Copy and transpose data: [frames, mel_bins] -> [1, mel_bins, frames]
        for (size_t f = 0; f < numFrames; f++) {
            for (int m = 0; m < melBins; m++) {
                inputPtr[m * fixedFrames + f] = melFeatures[f * melBins + m];
            }
        }

        // Create mel_length input (actual number of frames without padding)
        NSArray<NSNumber*>* lengthShape = @[@1];
        MLMultiArray* lengthInput = [[MLMultiArray alloc] initWithShape:lengthShape
                                                               dataType:MLMultiArrayDataTypeInt32
                                                                  error:&error];
        if (error) {
            throw std::runtime_error("Failed to create length array");
        }
        ((int32_t*)lengthInput.dataPointer)[0] = static_cast<int32_t>(numFrames);

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
                NSLog(@"Found encoder output with name: %@", name);
                break;
            }
        }

        if (outputValue == nil || outputValue.multiArrayValue == nil) {
            // List all available feature names for debugging
            NSLog(@"Available output features:");
            for (NSString* name in output.featureNames) {
                NSLog(@"  - %@", name);
            }
            throw std::runtime_error("Failed to get encoder output");
        }

        MLMultiArray* outputArray = outputValue.multiArrayValue;
        NSInteger totalElements = 1;
        for (NSNumber* dim in outputArray.shape) {
            totalElements *= dim.integerValue;
        }

        std::vector<float> result(totalElements);
        float* outputPtr = (float*)outputArray.dataPointer;
        memcpy(result.data(), outputPtr, totalElements * sizeof(float));

        return result;
    }
}

/**
 * Compute mel spectrogram using CoreML model
 */
std::vector<float> AsrEngine::computeMelWithCoreML(const float* samples, size_t sampleCount,
                                                    int sampleRate, void* melModelPtr) {
    MLModel* melModel = (__bridge MLModel*)melModelPtr;
    @autoreleasepool {
        NSError* error = nil;

        // Create input array for audio samples
        NSArray<NSNumber*>* shape = @[@1, @(sampleCount)];
        MLMultiArray* input = [[MLMultiArray alloc] initWithShape:shape
                                                         dataType:MLMultiArrayDataTypeFloat32
                                                            error:&error];
        if (error) {
            throw std::runtime_error("Failed to create mel input array");
        }

        float* inputPtr = (float*)input.dataPointer;
        memcpy(inputPtr, samples, sampleCount * sizeof(float));

        // Run mel spectrogram model
        NSDictionary* inputDict = @{@"audio": input};
        MLDictionaryFeatureProvider* provider =
            [[MLDictionaryFeatureProvider alloc] initWithDictionary:inputDict error:&error];

        id<MLFeatureProvider> output = [melModel predictionFromFeatures:provider error:&error];
        if (error) {
            throw std::runtime_error("Mel spectrogram computation failed");
        }

        MLFeatureValue* outputValue = [output featureValueForName:@"mel_spectrogram"];
        if (outputValue == nil) {
            outputValue = [output featureValueForName:@"output"];
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

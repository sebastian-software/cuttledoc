/**
 * Apple Speech Framework native bindings for Node.js
 *
 * Uses SFSpeechRecognizer for on-device speech recognition.
 * Requires macOS 12.0+ and speech recognition permissions.
 */

#import <Speech/Speech.h>
#import <AVFoundation/AVFoundation.h>
#include <napi.h>
#include <string>
#include <vector>

/**
 * Segment result from transcription
 */
struct TranscriptionSegment {
    std::string text;
    double startSeconds;
    double endSeconds;
    double confidence;
};

/**
 * Full transcription result
 */
struct TranscriptionData {
    std::string text;
    std::vector<TranscriptionSegment> segments;
    double durationSeconds;
    std::string error;
    bool success;
};

/**
 * Async worker for speech recognition
 */
class TranscribeWorker : public Napi::AsyncWorker {
public:
    TranscribeWorker(
        Napi::Env env,
        Napi::Promise::Deferred deferred,
        std::string audioPath,
        std::string language,
        bool onDeviceOnly
    ) : Napi::AsyncWorker(env),
        deferred_(deferred),
        audioPath_(std::move(audioPath)),
        language_(std::move(language)),
        onDeviceOnly_(onDeviceOnly) {}

    void Execute() override {
        @autoreleasepool {
            // Create locale from language string
            NSString* localeId = [NSString stringWithUTF8String:language_.c_str()];
            NSLocale* locale = [NSLocale localeWithLocaleIdentifier:localeId];

            // Initialize speech recognizer
            SFSpeechRecognizer* recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];

            if (!recognizer) {
                result_.success = false;
                result_.error = "Failed to create speech recognizer for locale: " + language_;
                return;
            }

            if (!recognizer.isAvailable) {
                result_.success = false;
                result_.error = "Speech recognizer is not available for locale: " + language_;
                return;
            }

            // Check if on-device recognition is supported when required
            if (onDeviceOnly_ && !recognizer.supportsOnDeviceRecognition) {
                result_.success = false;
                result_.error = "On-device recognition not supported for locale: " + language_;
                return;
            }

            // Create URL from audio path
            NSString* pathString = [NSString stringWithUTF8String:audioPath_.c_str()];
            NSURL* audioURL = [NSURL fileURLWithPath:pathString];

            // Check if file exists
            if (![[NSFileManager defaultManager] fileExistsAtPath:pathString]) {
                result_.success = false;
                result_.error = "Audio file not found: " + audioPath_;
                return;
            }

            // Get audio duration using AVAsset
            AVAsset* asset = [AVAsset assetWithURL:audioURL];
            CMTime duration = asset.duration;
            result_.durationSeconds = CMTimeGetSeconds(duration);

            // Create recognition request
            SFSpeechURLRecognitionRequest* request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:audioURL];
            request.requiresOnDeviceRecognition = onDeviceOnly_;
            request.shouldReportPartialResults = NO;

            // Enable timing info for segments
            if (@available(macOS 13.0, *)) {
                request.addsPunctuation = YES;
            }

            // Semaphore for synchronous waiting
            dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

            __block NSString* resultText = nil;
            __block NSError* resultError = nil;
            __block NSArray<SFTranscriptionSegment*>* resultSegments = nil;

            // Start recognition task
            [recognizer recognitionTaskWithRequest:request
                resultHandler:^(SFSpeechRecognitionResult* result, NSError* error) {
                    if (error) {
                        resultError = error;
                        dispatch_semaphore_signal(semaphore);
                        return;
                    }

                    if (result.isFinal) {
                        resultText = result.bestTranscription.formattedString;
                        resultSegments = result.bestTranscription.segments;
                        dispatch_semaphore_signal(semaphore);
                    }
                }];

            // Wait for completion (with timeout of 5 minutes)
            dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 5 * 60 * NSEC_PER_SEC);
            long waitResult = dispatch_semaphore_wait(semaphore, timeout);

            if (waitResult != 0) {
                result_.success = false;
                result_.error = "Recognition timed out after 5 minutes";
                return;
            }

            if (resultError) {
                result_.success = false;
                result_.error = [[resultError localizedDescription] UTF8String];
                return;
            }

            if (!resultText) {
                result_.success = false;
                result_.error = "No transcription result received";
                return;
            }

            // Store results
            result_.success = true;
            result_.text = [resultText UTF8String];

            // Process segments
            if (resultSegments) {
                for (SFTranscriptionSegment* segment in resultSegments) {
                    TranscriptionSegment seg;
                    seg.text = [segment.substring UTF8String];
                    seg.startSeconds = segment.timestamp;
                    seg.endSeconds = segment.timestamp + segment.duration;
                    seg.confidence = segment.confidence;
                    result_.segments.push_back(seg);
                }
            }
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Object result = Napi::Object::New(env);

        if (!result_.success) {
            deferred_.Reject(Napi::Error::New(env, result_.error).Value());
            return;
        }

        result.Set("text", Napi::String::New(env, result_.text));
        result.Set("durationSeconds", Napi::Number::New(env, result_.durationSeconds));

        // Create segments array
        Napi::Array segments = Napi::Array::New(env, result_.segments.size());
        for (size_t i = 0; i < result_.segments.size(); i++) {
            const auto& seg = result_.segments[i];
            Napi::Object segObj = Napi::Object::New(env);
            segObj.Set("text", Napi::String::New(env, seg.text));
            segObj.Set("startSeconds", Napi::Number::New(env, seg.startSeconds));
            segObj.Set("endSeconds", Napi::Number::New(env, seg.endSeconds));
            segObj.Set("confidence", Napi::Number::New(env, seg.confidence));
            segments.Set(i, segObj);
        }
        result.Set("segments", segments);

        deferred_.Resolve(result);
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

private:
    Napi::Promise::Deferred deferred_;
    std::string audioPath_;
    std::string language_;
    bool onDeviceOnly_;
    TranscriptionData result_;
};

/**
 * Transcribe an audio file
 *
 * @param audioPath Path to the audio file
 * @param options Object with language (string) and onDeviceOnly (boolean)
 * @returns Promise<TranscriptionResult>
 */
Napi::Value Transcribe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Audio path (string) is required").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string audioPath = info[0].As<Napi::String>();
    std::string language = "en-US";
    bool onDeviceOnly = true;

    // Parse options object
    if (info.Length() > 1 && info[1].IsObject()) {
        Napi::Object options = info[1].As<Napi::Object>();

        if (options.Has("language") && options.Get("language").IsString()) {
            language = options.Get("language").As<Napi::String>();
        }

        if (options.Has("onDeviceOnly") && options.Get("onDeviceOnly").IsBoolean()) {
            onDeviceOnly = options.Get("onDeviceOnly").As<Napi::Boolean>();
        }
    }

    // Create promise and worker
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    TranscribeWorker* worker = new TranscribeWorker(env, deferred, audioPath, language, onDeviceOnly);
    worker->Queue();

    return deferred.Promise();
}

/**
 * Check if speech recognition is available
 *
 * @returns boolean
 */
Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
    @autoreleasepool {
        SFSpeechRecognizer* recognizer = [[SFSpeechRecognizer alloc] init];
        bool available = recognizer != nil && recognizer.isAvailable;
        return Napi::Boolean::New(info.Env(), available);
    }
}

/**
 * Check if on-device recognition is supported for a locale
 *
 * @param language Locale identifier (e.g., "en-US", "de-DE")
 * @returns boolean
 */
Napi::Value SupportsOnDevice(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string language = "en-US";
    if (info.Length() > 0 && info[0].IsString()) {
        language = info[0].As<Napi::String>();
    }

    @autoreleasepool {
        NSString* localeId = [NSString stringWithUTF8String:language.c_str()];
        NSLocale* locale = [NSLocale localeWithLocaleIdentifier:localeId];
        SFSpeechRecognizer* recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];

        bool supported = recognizer != nil && recognizer.supportsOnDeviceRecognition;
        return Napi::Boolean::New(env, supported);
    }
}

/**
 * Get list of supported locales
 *
 * @returns string[] Array of locale identifiers
 */
Napi::Value GetSupportedLocales(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    @autoreleasepool {
        NSSet<NSLocale*>* locales = [SFSpeechRecognizer supportedLocales];
        Napi::Array result = Napi::Array::New(env, locales.count);

        NSUInteger i = 0;
        for (NSLocale* locale in locales) {
            NSString* identifier = locale.localeIdentifier;
            result.Set(i++, Napi::String::New(env, [identifier UTF8String]));
        }

        return result;
    }
}

/**
 * Request speech recognition authorization
 *
 * @returns Promise<string> Authorization status
 */
Napi::Value RequestAuthorization(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    // We need to copy the deferred to use in the block
    auto deferredPtr = std::make_shared<Napi::Promise::Deferred>(deferred);
    auto tsfn = Napi::ThreadSafeFunction::New(
        env,
        Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
        "AuthCallback",
        0,
        1
    );

    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
        std::string statusStr;
        switch (status) {
            case SFSpeechRecognizerAuthorizationStatusAuthorized:
                statusStr = "authorized";
                break;
            case SFSpeechRecognizerAuthorizationStatusDenied:
                statusStr = "denied";
                break;
            case SFSpeechRecognizerAuthorizationStatusRestricted:
                statusStr = "restricted";
                break;
            case SFSpeechRecognizerAuthorizationStatusNotDetermined:
                statusStr = "notDetermined";
                break;
        }

        tsfn.BlockingCall([deferredPtr, statusStr](Napi::Env env, Napi::Function) {
            deferredPtr->Resolve(Napi::String::New(env, statusStr));
        });
        tsfn.Release();
    }];

    return deferred.Promise();
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("transcribe", Napi::Function::New(env, Transcribe));
    exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
    exports.Set("supportsOnDevice", Napi::Function::New(env, SupportsOnDevice));
    exports.Set("getSupportedLocales", Napi::Function::New(env, GetSupportedLocales));
    exports.Set("requestAuthorization", Napi::Function::New(env, RequestAuthorization));
    return exports;
}

NODE_API_MODULE(apple_speech, Init)


/**
 * Apple Speech Framework native bindings for Node.js
 *
 * Uses SFSpeechRecognizer for on-device speech recognition.
 * Requires macOS 12.0+ and speech recognition permissions.
 *
 * @copyright 2024 Sebastian Werner, Sebastian Software GmbH
 * @license MIT
 * @author Sebastian Werner <s.werner@sebastian-software.de>
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
 * Perform transcription on the main thread with RunLoop
 *
 * Apple Speech Framework requires an active RunLoop for callbacks.
 * This function runs transcription synchronously on the main dispatch queue.
 */
TranscriptionData PerformTranscription(
    const std::string& audioPath,
    const std::string& language,
    bool onDeviceOnly
) {
    TranscriptionData result;

    @autoreleasepool {
        // Create locale from language string
        NSString* localeId = [NSString stringWithUTF8String:language.c_str()];
        NSLocale* locale = [NSLocale localeWithLocaleIdentifier:localeId];

        // Initialize speech recognizer
        SFSpeechRecognizer* recognizer = [[SFSpeechRecognizer alloc] initWithLocale:locale];

        if (!recognizer) {
            result.success = false;
            result.error = "Failed to create speech recognizer for locale: " + language;
            return result;
        }

        if (!recognizer.isAvailable) {
            result.success = false;
            result.error = "Speech recognizer is not available for locale: " + language;
            return result;
        }

        // Check if on-device recognition is supported when required
        if (onDeviceOnly && !recognizer.supportsOnDeviceRecognition) {
            result.success = false;
            result.error = "On-device recognition not supported for locale: " + language;
            return result;
        }

        // Create URL from audio path
        NSString* pathString = [NSString stringWithUTF8String:audioPath.c_str()];
        NSURL* audioURL = [NSURL fileURLWithPath:pathString];

        // Check if file exists
        if (![[NSFileManager defaultManager] fileExistsAtPath:pathString]) {
            result.success = false;
            result.error = "Audio file not found: " + audioPath;
            return result;
        }

        // Get audio duration using AVAsset
        AVAsset* asset = [AVAsset assetWithURL:audioURL];
        CMTime duration = asset.duration;
        result.durationSeconds = CMTimeGetSeconds(duration);

        // Create recognition request
        SFSpeechURLRecognitionRequest* request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:audioURL];
        request.requiresOnDeviceRecognition = onDeviceOnly;
        request.shouldReportPartialResults = NO;

        // Enable punctuation on macOS 13+
        if (@available(macOS 13.0, *)) {
            request.addsPunctuation = YES;
        }

        // Use a condition variable for synchronization
        __block BOOL completed = NO;
        __block NSString* resultText = nil;
        __block NSError* resultError = nil;
        __block NSArray<SFTranscriptionSegment*>* resultSegments = nil;

        // Start recognition task
        SFSpeechRecognitionTask* task = [recognizer recognitionTaskWithRequest:request
            resultHandler:^(SFSpeechRecognitionResult* speechResult, NSError* error) {
                if (error) {
                    resultError = error;
                    completed = YES;
                    return;
                }

                if (speechResult.isFinal) {
                    resultText = speechResult.bestTranscription.formattedString;
                    resultSegments = speechResult.bestTranscription.segments;
                    completed = YES;
                }
            }];

        // Run the RunLoop until we get a result or timeout
        NSDate* timeoutDate = [NSDate dateWithTimeIntervalSinceNow:300]; // 5 minutes
        while (!completed && [[NSDate date] compare:timeoutDate] == NSOrderedAscending) {
            // Process RunLoop events for 0.1 seconds at a time
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                     beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
        }

        // Cancel task if still running
        if (!completed) {
            [task cancel];
            result.success = false;
            result.error = "Recognition timed out after 5 minutes";
            return result;
        }

        if (resultError) {
            result.success = false;
            result.error = [[resultError localizedDescription] UTF8String];
            return result;
        }

        if (!resultText) {
            result.success = false;
            result.error = "No transcription result received";
            return result;
        }

        // Store results
        result.success = true;
        result.text = [resultText UTF8String];

        // Process segments
        if (resultSegments) {
            for (SFTranscriptionSegment* segment in resultSegments) {
                TranscriptionSegment seg;
                seg.text = [segment.substring UTF8String];
                seg.startSeconds = segment.timestamp;
                seg.endSeconds = segment.timestamp + segment.duration;
                seg.confidence = segment.confidence;
                result.segments.push_back(seg);
            }
        }
    }

    return result;
}

/**
 * Async worker for speech recognition
 *
 * Creates its own thread with a RunLoop to handle Apple Speech callbacks.
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
        // Create a dedicated thread with its own RunLoop for Speech recognition
        __block TranscriptionData localResult;
        dispatch_semaphore_t doneSemaphore = dispatch_semaphore_create(0);

        NSThread* recognitionThread = [[NSThread alloc] initWithBlock:^{
            @autoreleasepool {
                // Add a dummy port to keep the RunLoop alive
                [[NSRunLoop currentRunLoop] addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];

                localResult = PerformTranscription(audioPath_, language_, onDeviceOnly_);
                dispatch_semaphore_signal(doneSemaphore);
            }
        }];

        [recognitionThread start];

        // Wait for the recognition thread to complete (with timeout)
        dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 6 * 60 * NSEC_PER_SEC);
        long waitResult = dispatch_semaphore_wait(doneSemaphore, timeout);

        if (waitResult != 0) {
            [recognitionThread cancel];
            result_.success = false;
            result_.error = "Recognition thread timed out";
        } else {
            result_ = localResult;
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
 * Get current authorization status (synchronous)
 *
 * @returns string Authorization status
 */
Napi::Value GetAuthorizationStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    @autoreleasepool {
        SFSpeechRecognizerAuthorizationStatus status = [SFSpeechRecognizer authorizationStatus];

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

        return Napi::String::New(env, statusStr);
    }
}

/**
 * Async worker for authorization request
 */
class AuthorizationWorker : public Napi::AsyncWorker {
public:
    AuthorizationWorker(Napi::Env env, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env), deferred_(deferred) {}

    void Execute() override {
        dispatch_semaphore_t doneSemaphore = dispatch_semaphore_create(0);
        __block std::string localStatus;

        NSThread* authThread = [[NSThread alloc] initWithBlock:^{
            @autoreleasepool {
                [[NSRunLoop currentRunLoop] addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];

                __block BOOL completed = NO;

                [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
                    switch (status) {
                        case SFSpeechRecognizerAuthorizationStatusAuthorized:
                            localStatus = "authorized";
                            break;
                        case SFSpeechRecognizerAuthorizationStatusDenied:
                            localStatus = "denied";
                            break;
                        case SFSpeechRecognizerAuthorizationStatusRestricted:
                            localStatus = "restricted";
                            break;
                        case SFSpeechRecognizerAuthorizationStatusNotDetermined:
                            localStatus = "notDetermined";
                            break;
                    }
                    completed = YES;
                }];

                // Run the RunLoop until we get the callback
                NSDate* timeout = [NSDate dateWithTimeIntervalSinceNow:30];
                while (!completed && [[NSDate date] compare:timeout] == NSOrderedAscending) {
                    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                            beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
                }

                if (!completed) {
                    localStatus = "timeout";
                }

                dispatch_semaphore_signal(doneSemaphore);
            }
        }];

        [authThread start];

        // Wait for completion
        dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 35 * NSEC_PER_SEC);
        long waitResult = dispatch_semaphore_wait(doneSemaphore, timeout);

        if (waitResult != 0) {
            status_ = "timeout";
        } else {
            status_ = localStatus;
        }
    }

    void OnOK() override {
        deferred_.Resolve(Napi::String::New(Env(), status_));
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

private:
    Napi::Promise::Deferred deferred_;
    std::string status_;
};

/**
 * Request speech recognition authorization
 *
 * Note: This opens a system dialog on first call. The callback requires
 * a RunLoop, so we run it on a dedicated thread.
 *
 * @returns Promise<string> Authorization status
 */
Napi::Value RequestAuthorization(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    AuthorizationWorker* worker = new AuthorizationWorker(env, deferred);
    worker->Queue();

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
    exports.Set("getAuthorizationStatus", Napi::Function::New(env, GetAuthorizationStatus));
    exports.Set("requestAuthorization", Napi::Function::New(env, RequestAuthorization));
    return exports;
}

NODE_API_MODULE(apple_speech, Init)


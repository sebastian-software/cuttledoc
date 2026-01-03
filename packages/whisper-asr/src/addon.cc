/**
 * N-API Bindings for WhisperEngine
 *
 * Exposes whisper.cpp with CoreML support to Node.js
 */

#include <napi.h>
#include "whisper_engine.h"
#include <memory>

static std::unique_ptr<WhisperEngine> g_engine;

/**
 * Initialize the Whisper engine
 * initialize(options: { modelPath: string, language?: string, translate?: boolean, threads?: number })
 */
Napi::Value Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected options object").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object options = info[0].As<Napi::Object>();

    if (!options.Has("modelPath") || !options.Get("modelPath").IsString()) {
        Napi::TypeError::New(env, "modelPath is required").ThrowAsJavaScriptException();
        return env.Null();
    }

    WhisperEngineOptions engineOptions;
    engineOptions.modelPath = options.Get("modelPath").As<Napi::String>().Utf8Value();

    if (options.Has("language") && options.Get("language").IsString()) {
        engineOptions.language = options.Get("language").As<Napi::String>().Utf8Value();
    }

    if (options.Has("translate") && options.Get("translate").IsBoolean()) {
        engineOptions.translate = options.Get("translate").As<Napi::Boolean>().Value();
    }

    if (options.Has("threads") && options.Get("threads").IsNumber()) {
        engineOptions.threads = options.Get("threads").As<Napi::Number>().Int32Value();
    }

    try {
        g_engine = std::make_unique<WhisperEngine>(engineOptions);
        return Napi::Boolean::New(env, true);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to initialize Whisper: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Check if the engine is initialized
 */
Napi::Value IsInitialized(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, g_engine && g_engine->isReady());
}

/**
 * Transcribe audio samples
 * transcribe(samples: Float32Array, sampleRate: number): TranscriptionResult
 */
Napi::Value Transcribe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_engine || !g_engine->isReady()) {
        Napi::Error::New(env, "Whisper engine not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected (samples, sampleRate)").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "samples must be a Float32Array").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Float32Array samples = info[0].As<Napi::Float32Array>();
    int sampleRate = info[1].As<Napi::Number>().Int32Value();

    try {
        TranscriptionResult result = g_engine->transcribe(
            samples.Data(),
            samples.ElementLength(),
            sampleRate
        );

        // Build result object
        Napi::Object resultObj = Napi::Object::New(env);
        resultObj.Set("text", Napi::String::New(env, result.text));
        resultObj.Set("language", Napi::String::New(env, result.language));
        resultObj.Set("durationMs", Napi::Number::New(env, result.durationMs));

        // Build segments array
        Napi::Array segmentsArray = Napi::Array::New(env, result.segments.size());
        for (size_t i = 0; i < result.segments.size(); i++) {
            const auto& seg = result.segments[i];
            Napi::Object segObj = Napi::Object::New(env);
            segObj.Set("startMs", Napi::Number::New(env, static_cast<double>(seg.startMs)));
            segObj.Set("endMs", Napi::Number::New(env, static_cast<double>(seg.endMs)));
            segObj.Set("text", Napi::String::New(env, seg.text));
            segObj.Set("confidence", Napi::Number::New(env, seg.confidence));
            segmentsArray.Set(static_cast<uint32_t>(i), segObj);
        }
        resultObj.Set("segments", segmentsArray);

        return resultObj;

    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Transcription failed: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Clean up resources
 */
Napi::Value Cleanup(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_engine) {
        g_engine->cleanup();
        g_engine.reset();
    }

    return env.Undefined();
}

/**
 * Get version info
 */
Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    Napi::Object version = Napi::Object::New(env);
    version.Set("addon", Napi::String::New(env, "1.0.0"));
    version.Set("whisper", Napi::String::New(env, WhisperEngine::getVersion()));
    version.Set("coreml", Napi::String::New(env, "CoreML (ANE accelerated)"));

    return version;
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initialize", Napi::Function::New(env, Initialize));
    exports.Set("isInitialized", Napi::Function::New(env, IsInitialized));
    exports.Set("transcribe", Napi::Function::New(env, Transcribe));
    exports.Set("cleanup", Napi::Function::New(env, Cleanup));
    exports.Set("getVersion", Napi::Function::New(env, GetVersion));

    return exports;
}

NODE_API_MODULE(whisper_asr, Init)


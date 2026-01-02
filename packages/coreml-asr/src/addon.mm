/**
 * CoreML ASR Native Addon for Node.js
 *
 * This addon provides speech-to-text functionality using Apple's CoreML
 * with the Parakeet TDT v3 model.
 */

#import <Foundation/Foundation.h>
#import <CoreML/CoreML.h>
#import <napi.h>

#include "asr_engine.h"

// Global ASR engine instance
static AsrEngine* g_engine = nullptr;

/**
 * Initialize the ASR engine with model paths
 * @param modelDir Path to directory containing CoreML models
 */
Napi::Value Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Model directory path expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string modelDir = info[0].As<Napi::String>().Utf8Value();

    try {
        if (g_engine != nullptr) {
            delete g_engine;
        }
        g_engine = new AsrEngine(modelDir);
        return Napi::Boolean::New(env, true);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to initialize ASR engine: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Check if the engine is initialized
 */
Napi::Value IsInitialized(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_engine != nullptr && g_engine->isReady());
}

/**
 * Transcribe audio samples
 * @param samples Float32Array of audio samples (16kHz, mono)
 * @param sampleRate Sample rate (should be 16000)
 */
Napi::Value Transcribe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_engine == nullptr || !g_engine->isReady()) {
        Napi::Error::New(env, "ASR engine not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Float32Array of audio samples expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Float32Array samples = info[0].As<Napi::Float32Array>();
    size_t sampleCount = samples.ElementLength();

    int sampleRate = 16000;
    if (info.Length() > 1 && info[1].IsNumber()) {
        sampleRate = info[1].As<Napi::Number>().Int32Value();
    }

    try {
        std::string result = g_engine->transcribe(samples.Data(), sampleCount, sampleRate);
        return Napi::String::New(env, result);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Transcription failed: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Transcribe audio from a file path
 * @param filePath Path to audio file (WAV, 16kHz mono preferred)
 */
Napi::Value TranscribeFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_engine == nullptr || !g_engine->isReady()) {
        Napi::Error::New(env, "ASR engine not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();

    try {
        std::string result = g_engine->transcribeFile(filePath);
        return Napi::String::New(env, result);
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
    if (g_engine != nullptr) {
        delete g_engine;
        g_engine = nullptr;
    }
    return info.Env().Undefined();
}

/**
 * Get version information
 */
Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object version = Napi::Object::New(env);
    version.Set("addon", "1.0.0");
    version.Set("model", "parakeet-tdt-0.6b-v3");
    version.Set("coreml", "CoreML 7.0+");
    return version;
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initialize", Napi::Function::New(env, Initialize));
    exports.Set("isInitialized", Napi::Function::New(env, IsInitialized));
    exports.Set("transcribe", Napi::Function::New(env, Transcribe));
    exports.Set("transcribeFile", Napi::Function::New(env, TranscribeFile));
    exports.Set("cleanup", Napi::Function::New(env, Cleanup));
    exports.Set("getVersion", Napi::Function::New(env, GetVersion));
    return exports;
}

NODE_API_MODULE(coreml_asr, Init)

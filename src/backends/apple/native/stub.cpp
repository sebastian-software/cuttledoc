/**
 * Stub implementation for non-macOS platforms
 *
 * All functions throw an error indicating Apple Speech is not available.
 */

#include <napi.h>

Napi::Value Transcribe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Error::New(env, "Apple Speech is only available on macOS")
        .ThrowAsJavaScriptException();
    return env.Undefined();
}

Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), false);
}

Napi::Value SupportsOnDevice(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), false);
}

Napi::Value GetSupportedLocales(const Napi::CallbackInfo& info) {
    return Napi::Array::New(info.Env(), 0);
}

Napi::Value RequestAuthorization(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    deferred.Reject(Napi::Error::New(env, "Apple Speech is only available on macOS").Value());
    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("transcribe", Napi::Function::New(env, Transcribe));
    exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
    exports.Set("supportsOnDevice", Napi::Function::New(env, SupportsOnDevice));
    exports.Set("getSupportedLocales", Napi::Function::New(env, GetSupportedLocales));
    exports.Set("requestAuthorization", Napi::Function::New(env, RequestAuthorization));
    return exports;
}

NODE_API_MODULE(apple_speech, Init)


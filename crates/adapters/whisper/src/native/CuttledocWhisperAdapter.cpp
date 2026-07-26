#include "cuttledoc_whisper_adapter.h"
#include "whisper.h"

#include <algorithm>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <memory>
#include <new>
#include <string>

namespace {

constexpr int32_t kOk = 0;
constexpr int32_t kInvalidInput = 1;
constexpr int32_t kLoadFailed = 2;
constexpr int32_t kTranscriptionFailed = 3;
constexpr int32_t kCancelled = 4;

struct WhisperEngine {
    whisper_context *context = nullptr;
    std::string language;
    uint32_t threads = 4;

    ~WhisperEngine() {
        if (context != nullptr) {
            whisper_free(context);
        }
    }
};

struct CallbackBridge {
    int32_t (*cancel)(void *) = nullptr;
    void *context = nullptr;
};

void suppress_log(ggml_log_level, const char *, void *) {}

bool should_abort(void *raw) {
    auto *bridge = static_cast<CallbackBridge *>(raw);
    return bridge != nullptr && bridge->cancel != nullptr &&
           bridge->cancel(bridge->context) != 0;
}

char *copy_string(const std::string &value) {
    auto *copy = static_cast<char *>(std::malloc(value.size() + 1));
    if (copy == nullptr) {
        return nullptr;
    }
    std::memcpy(copy, value.c_str(), value.size() + 1);
    return copy;
}

void set_error(char **output, const std::string &message) {
    if (output != nullptr) {
        *output = copy_string(message);
    }
}

bool is_auto_language(const std::string &language) {
    return language.empty() || language == "auto";
}

}  // namespace

extern "C" uint32_t cuttledoc_whisper_abi_version() {
    return 1;
}

extern "C" void *cuttledoc_whisper_engine_create(
    const char *model_path,
    const char *language,
    uint32_t threads,
    char **error_output
) {
    if (error_output != nullptr) {
        *error_output = nullptr;
    }
    if (model_path == nullptr || model_path[0] == '\0') {
        set_error(error_output, "Whisper requires a non-empty model path");
        return nullptr;
    }

    try {
        auto engine = std::make_unique<WhisperEngine>();
        engine->language = language == nullptr ? "auto" : language;
        engine->threads = threads == 0 ? 4 : threads;

        whisper_log_set(suppress_log, nullptr);
        whisper_context_params parameters = whisper_context_default_params();
        parameters.use_gpu = true;
        engine->context = whisper_init_from_file_with_params(model_path, parameters);
        if (engine->context == nullptr) {
            set_error(error_output, "whisper.cpp could not load the configured model");
            return nullptr;
        }
        return engine.release();
    } catch (const std::exception &error) {
        set_error(error_output, error.what());
        return nullptr;
    } catch (...) {
        set_error(error_output, "unknown exception while loading whisper.cpp");
        return nullptr;
    }
}

extern "C" int32_t cuttledoc_whisper_engine_transcribe(
    void *handle,
    const float *samples,
    size_t sample_count,
    void (*segment_callback)(void *, int64_t, int64_t, const char *),
    int32_t (*cancel_callback)(void *),
    void *callback_context,
    char **resolved_language,
    char **error_output
) {
    if (resolved_language != nullptr) {
        *resolved_language = nullptr;
    }
    if (error_output != nullptr) {
        *error_output = nullptr;
    }
    if (handle == nullptr || samples == nullptr || sample_count == 0 ||
        sample_count > static_cast<size_t>(INT_MAX) || segment_callback == nullptr) {
        set_error(error_output, "invalid Whisper transcription input");
        return kInvalidInput;
    }

    auto *engine = static_cast<WhisperEngine *>(handle);
    CallbackBridge bridge{cancel_callback, callback_context};
    if (should_abort(&bridge)) {
        return kCancelled;
    }

    try {
        whisper_full_params parameters =
            whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        const bool detect_language = is_auto_language(engine->language);
        parameters.language = engine->language.c_str();
        parameters.detect_language = false;
        parameters.translate = false;
        parameters.no_timestamps = false;
        parameters.n_threads = static_cast<int>(engine->threads);
        parameters.print_progress = false;
        parameters.print_realtime = false;
        parameters.print_special = false;
        parameters.print_timestamps = false;
        parameters.single_segment = false;
        parameters.token_timestamps = true;
        parameters.n_max_text_ctx = 16384;
        parameters.abort_callback = should_abort;
        parameters.abort_callback_user_data = &bridge;

        const int result = whisper_full(
            engine->context,
            parameters,
            samples,
            static_cast<int>(sample_count)
        );
        if (should_abort(&bridge)) {
            return kCancelled;
        }
        if (result != 0) {
            set_error(
                error_output,
                "whisper.cpp transcription failed with code " + std::to_string(result)
            );
            return kTranscriptionFailed;
        }

        const int language_id = whisper_full_lang_id(engine->context);
        const char *language_value = whisper_lang_str(language_id);
        const std::string language =
            language_value == nullptr
                ? (detect_language ? "" : engine->language)
                : language_value;
        if (resolved_language != nullptr) {
            *resolved_language = copy_string(language);
            if (*resolved_language == nullptr) {
                set_error(error_output, "could not allocate the resolved language");
                return kTranscriptionFailed;
            }
        }

        const int segment_count = whisper_full_n_segments(engine->context);
        for (int index = 0; index < segment_count; ++index) {
            const char *text = whisper_full_get_segment_text(engine->context, index);
            segment_callback(
                callback_context,
                whisper_full_get_segment_t0(engine->context, index) * 10,
                whisper_full_get_segment_t1(engine->context, index) * 10,
                text == nullptr ? "" : text
            );
        }
        return kOk;
    } catch (const std::exception &error) {
        set_error(error_output, error.what());
        return kTranscriptionFailed;
    } catch (...) {
        set_error(error_output, "unknown exception while transcribing with whisper.cpp");
        return kTranscriptionFailed;
    }
}

extern "C" void cuttledoc_whisper_engine_destroy(void *handle) {
    delete static_cast<WhisperEngine *>(handle);
}

extern "C" void cuttledoc_whisper_free_string(char *value) {
    std::free(value);
}

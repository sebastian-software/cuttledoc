#ifndef CUTTLEDOC_WHISPER_ADAPTER_H
#define CUTTLEDOC_WHISPER_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CUTTLEDOC_WHISPER_ABI_VERSION 1

#define CUTTLEDOC_WHISPER_OK 0
#define CUTTLEDOC_WHISPER_INVALID_INPUT 1
#define CUTTLEDOC_WHISPER_LOAD_FAILED 2
#define CUTTLEDOC_WHISPER_TRANSCRIPTION_FAILED 3
#define CUTTLEDOC_WHISPER_CANCELLED 4

typedef void (*cuttledoc_whisper_segment_callback)(
    void *context,
    int64_t start_ms,
    int64_t end_ms,
    const char *text
);

typedef int32_t (*cuttledoc_whisper_cancel_callback)(void *context);

uint32_t cuttledoc_whisper_abi_version(void);

void *cuttledoc_whisper_engine_create(
    const char *model_path,
    const char *language,
    uint32_t threads,
    char **error_output
);

int32_t cuttledoc_whisper_engine_transcribe(
    void *handle,
    const float *samples,
    size_t sample_count,
    cuttledoc_whisper_segment_callback segment_callback,
    cuttledoc_whisper_cancel_callback cancel_callback,
    void *callback_context,
    char **resolved_language,
    char **error_output
);

void cuttledoc_whisper_engine_destroy(void *handle);
void cuttledoc_whisper_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif

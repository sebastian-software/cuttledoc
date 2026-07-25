#ifndef CUTTLEDOC_SPEECH_ADAPTER_H
#define CUTTLEDOC_SPEECH_ADAPTER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CUTTLEDOC_SPEECH_ABI_VERSION 2

#define CUTTLEDOC_SPEECH_LOCALE_SUPPORTED 1
#define CUTTLEDOC_SPEECH_LOCALE_INSTALLED 2
#define CUTTLEDOC_SPEECH_LOCALE_RESERVED 3

#define CUTTLEDOC_SPEECH_UPDATE_REPLACE 1
#define CUTTLEDOC_SPEECH_UPDATE_REVOKE 2

#define CUTTLEDOC_SPEECH_STABILITY_NONE 0
#define CUTTLEDOC_SPEECH_STABILITY_VOLATILE 1
#define CUTTLEDOC_SPEECH_STABILITY_FINAL 2

#define CUTTLEDOC_SPEECH_PUSH_OK 0
#define CUTTLEDOC_SPEECH_PUSH_NATIVE_FAILURE 1
#define CUTTLEDOC_SPEECH_PUSH_INVALID_INPUT 2
#define CUTTLEDOC_SPEECH_PUSH_SESSION_CLOSED 3
#define CUTTLEDOC_SPEECH_PUSH_WOULD_BLOCK 4

typedef void (*cuttledoc_speech_segment_callback)(
    void *context,
    uint64_t sequence,
    int64_t start_ms,
    int64_t end_ms,
    const char *text,
    uint8_t has_confidence,
    double confidence
);

typedef void (*cuttledoc_speech_update_callback)(
    void *context,
    uint64_t sequence,
    int32_t kind,
    int32_t stability,
    int64_t affected_start_ms,
    int64_t affected_end_ms,
    const char *text
);

typedef void (*cuttledoc_speech_locale_callback)(
    void *context,
    int32_t kind,
    const char *locale
);

uint32_t cuttledoc_speech_abi_version(void);

int32_t cuttledoc_speech_locale_inventory(
    cuttledoc_speech_locale_callback callback,
    void *callback_context,
    uint32_t *maximum_reserved_locales,
    char **error_output
);

void *cuttledoc_speech_session_create(
    const char *locale,
    uint32_t sample_rate,
    cuttledoc_speech_segment_callback segment_callback,
    cuttledoc_speech_update_callback update_callback,
    void *callback_context,
    char **resolved_locale,
    char **error_output
);

/*
 * The adapter copies samples before returning. Calls for one session must be
 * serialized. WOULD_BLOCK means that this exact chunk may be retried; accepted
 * input is never dropped.
 */
int32_t cuttledoc_speech_session_push_pcm_f32(
    void *handle,
    const float *samples,
    uint32_t sample_count
);

int32_t cuttledoc_speech_session_finish(
    void *handle,
    char **error_output
);

void cuttledoc_speech_session_cancel(void *handle);
void cuttledoc_speech_session_destroy(void *handle);
void cuttledoc_speech_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif

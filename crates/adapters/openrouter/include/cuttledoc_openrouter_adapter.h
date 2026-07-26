#ifndef CUTTLEDOC_OPENROUTER_ADAPTER_H
#define CUTTLEDOC_OPENROUTER_ADAPTER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CUTTLEDOC_OPENROUTER_OK 0
#define CUTTLEDOC_OPENROUTER_INVALID_INPUT 1
#define CUTTLEDOC_OPENROUTER_TRANSPORT_FAILED 2
#define CUTTLEDOC_OPENROUTER_CANCELLED 3

typedef int32_t (*cuttledoc_openrouter_cancel_callback)(void *context);

int32_t cuttledoc_openrouter_send(
    const char *api_key,
    const char *request_json,
    uint64_t timeout_milliseconds,
    cuttledoc_openrouter_cancel_callback cancel_callback,
    void *callback_context,
    int32_t *http_status_output,
    char **response_output,
    char **error_output
);

void cuttledoc_openrouter_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif

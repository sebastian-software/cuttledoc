#ifndef CUTTLEDOC_GEMMA_MLX_ADAPTER_H
#define CUTTLEDOC_GEMMA_MLX_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CUTTLEDOC_GEMMA_MLX_ABI_VERSION 1

#define CUTTLEDOC_GEMMA_MLX_OK 0
#define CUTTLEDOC_GEMMA_MLX_INVALID_INPUT 1
#define CUTTLEDOC_GEMMA_MLX_LOAD_FAILED 2
#define CUTTLEDOC_GEMMA_MLX_GENERATION_FAILED 3
#define CUTTLEDOC_GEMMA_MLX_CANCELLED 4
#define CUTTLEDOC_GEMMA_MLX_BUSY 5

#define CUTTLEDOC_GEMMA_MLX_FINISH_STOP 0
#define CUTTLEDOC_GEMMA_MLX_FINISH_LENGTH 1

typedef int32_t (*cuttledoc_gemma_mlx_token_callback)(
    void *context,
    uint32_t token
);

typedef int32_t (*cuttledoc_gemma_mlx_cancel_callback)(void *context);

uint32_t cuttledoc_gemma_mlx_abi_version(void);

void *cuttledoc_gemma_mlx_session_create(
    const char *model_directory,
    const char *metallib_path,
    int32_t *status_output,
    char **error_output
);

int32_t cuttledoc_gemma_mlx_session_generate(
    void *handle,
    const uint32_t *prompt_tokens,
    size_t prompt_token_count,
    uint32_t maximum_tokens,
    cuttledoc_gemma_mlx_token_callback token_callback,
    cuttledoc_gemma_mlx_cancel_callback cancel_callback,
    void *callback_context,
    int32_t *finish_reason_output,
    char **error_output
);

void cuttledoc_gemma_mlx_session_destroy(void *handle);
void cuttledoc_gemma_mlx_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif

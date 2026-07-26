cmake_minimum_required(VERSION 3.25)

project(cuttledoc_gemma_mlx_adapter LANGUAGES CXX)

if(NOT DEFINED MLX_SOURCE_DIR)
  message(FATAL_ERROR "Set MLX_SOURCE_DIR to the pinned official MLX checkout")
endif()
if(NOT EXISTS "${MLX_SOURCE_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "MLX_SOURCE_DIR is not an MLX source checkout")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(MLX_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(MLX_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(MLX_BUILD_BENCHMARKS OFF CACHE BOOL "" FORCE)
set(MLX_BUILD_PYTHON_BINDINGS OFF CACHE BOOL "" FORCE)
set(MLX_BUILD_GGUF OFF CACHE BOOL "" FORCE)
set(MLX_BUILD_SAFETENSORS ON CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

add_subdirectory("${MLX_SOURCE_DIR}" mlx-upstream EXCLUDE_FROM_ALL)

add_library(
  cuttledoc_gemma_mlx_adapter
  SHARED
  ../src/native/CuttledocGemmaMlxAdapter.cpp)
target_link_libraries(cuttledoc_gemma_mlx_adapter PRIVATE mlx)
target_include_directories(cuttledoc_gemma_mlx_adapter PUBLIC ../include)
target_compile_options(
  cuttledoc_gemma_mlx_adapter
  PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -Wno-deprecated-copy
  -Wno-unused-parameter
  -Werror)

if(TARGET mlx-metallib)
  add_dependencies(cuttledoc_gemma_mlx_adapter mlx-metallib)
  add_custom_command(
    TARGET cuttledoc_gemma_mlx_adapter
    POST_BUILD
    COMMAND
      ${CMAKE_COMMAND} -E copy_if_different
      "${CMAKE_BINARY_DIR}/mlx-upstream/mlx/backend/metal/kernels/mlx.metallib"
      "$<TARGET_FILE_DIR:cuttledoc_gemma_mlx_adapter>/mlx.metallib"
    COMMENT "Colocating the pinned MLX Metal library")
endif()

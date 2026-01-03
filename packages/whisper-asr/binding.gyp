{
  "targets": [
    {
      "target_name": "whisper_asr",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/addon.cc",
        "src/whisper_engine.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "vendor/whisper.cpp/include",
        "vendor/whisper.cpp/ggml/include"
      ],
      "libraries": [
        "../vendor/whisper.cpp/build/src/libwhisper.a",
        "../vendor/whisper.cpp/build/src/libwhisper.coreml.a",
        "../vendor/whisper.cpp/build/ggml/src/libggml.a",
        "../vendor/whisper.cpp/build/ggml/src/libggml-base.a",
        "../vendor/whisper.cpp/build/ggml/src/libggml-cpu.a",
        "../vendor/whisper.cpp/build/ggml/src/ggml-metal/libggml-metal.a",
        "../vendor/whisper.cpp/build/ggml/src/ggml-blas/libggml-blas.a",
        "-framework Accelerate",
        "-framework CoreML",
        "-framework Foundation",
        "-framework Metal",
        "-framework MetalKit"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "WHISPER_COREML"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "14.0",
            "OTHER_CPLUSPLUSFLAGS": [
              "-std=c++17",
              "-fvisibility=hidden"
            ],
            "OTHER_LDFLAGS": [
              "-Wl,-dead_strip"
            ]
          }
        }]
      ]
    }
  ]
}


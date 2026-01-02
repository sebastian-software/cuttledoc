{
  "targets": [
    {
      "target_name": "coreml_asr",
      "sources": [
        "src/addon.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "src/asr_engine.mm",
            "src/mel_spectrogram.mm",
            "src/transducer_decoder.mm"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "14.0",
            "OTHER_CFLAGS": [
              "-fobjc-arc"
            ],
            "OTHER_LDFLAGS": [
              "-framework CoreML",
              "-framework Foundation",
              "-framework Accelerate"
            ]
          }
        }]
      ]
    }
  ]
}

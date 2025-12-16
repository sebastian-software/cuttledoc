{
  "targets": [
    {
      "target_name": "apple_speech",
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "src/backends/apple/native/speech.mm"
          ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "libraries": [
            "-framework Speech",
            "-framework Foundation",
            "-framework AVFoundation"
          ],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "OTHER_CFLAGS": ["-fobjc-arc"],
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
          },
          "defines": ["NAPI_CPP_EXCEPTIONS"],
          "cflags!": ["-fno-exceptions"],
          "cflags_cc!": ["-fno-exceptions"]
        }],
        ["OS!='mac'", {
          "sources": [
            "src/backends/apple/native/stub.cpp"
          ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
        }]
      ]
    }
  ]
}


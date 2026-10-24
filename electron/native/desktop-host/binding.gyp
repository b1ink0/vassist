{
  "targets": [
    {
      "target_name": "desktop_host",
      "variables": {
        "clang": 0
      },
      "configurations": {
        "Debug": {
          "msbuild_toolset": "v143"
        },
        "Release": {
          "msbuild_toolset": "v143"
        }
      },
      "sources": ["desktop_host.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "RuntimeTypeInfo": "true"
        }
      },
      "libraries": ["user32.lib"]
    }
  ]
}

# For more information about using CMake with Android Studio, read the
# documentation: https://d.android.com/studio/projects/add-native-code.html.

cmake_minimum_required(VERSION 3.22.1)

project("llama-android")

# Fetch llama.cpp from GitHub
include(FetchContent)
FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)

# Make llama.cpp available - this also provides "common" library
FetchContent_MakeAvailable(llama)

# Build mtmd library for multimodal support (includes clip vision encoder)
set(MTMD_SOURCE_DIR "${llama_SOURCE_DIR}/tools/mtmd")
add_library(
    mtmd
    STATIC
    ${MTMD_SOURCE_DIR}/mtmd.cpp
    ${MTMD_SOURCE_DIR}/mtmd-helper.cpp
    ${MTMD_SOURCE_DIR}/mtmd-audio.cpp
    ${MTMD_SOURCE_DIR}/clip.cpp
    ${MTMD_SOURCE_DIR}/models/cogvlm.cpp
    ${MTMD_SOURCE_DIR}/models/conformer.cpp
    ${MTMD_SOURCE_DIR}/models/glm4v.cpp
    ${MTMD_SOURCE_DIR}/models/internvl.cpp
    ${MTMD_SOURCE_DIR}/models/kimivl.cpp
    ${MTMD_SOURCE_DIR}/models/llama4.cpp
    ${MTMD_SOURCE_DIR}/models/llava.cpp
    ${MTMD_SOURCE_DIR}/models/minicpmv.cpp
    ${MTMD_SOURCE_DIR}/models/pixtral.cpp
    ${MTMD_SOURCE_DIR}/models/qwen2vl.cpp
    ${MTMD_SOURCE_DIR}/models/qwen3vl.cpp
    ${MTMD_SOURCE_DIR}/models/siglip.cpp
    ${MTMD_SOURCE_DIR}/models/whisper-enc.cpp
)

# mtmd needs llama and common libraries
target_include_directories(
    mtmd
    PUBLIC
    ${MTMD_SOURCE_DIR}
    ${llama_SOURCE_DIR}/include
    ${llama_SOURCE_DIR}/common
    ${llama_SOURCE_DIR}/ggml/include
)

target_link_libraries(
    mtmd
    PUBLIC
    llama
    common
)

# Creates and names a library, sets it as SHARED
add_library(
    llama-android
    SHARED
    llama-android.cpp
)

# Add mtmd include directory for llama-android
target_include_directories(
    llama-android
    PRIVATE
    ${MTMD_SOURCE_DIR}
)

# Find required Android libraries
find_library(log-lib log)
find_library(android-lib android)

# Link libraries (added mtmd for multimodal support)
target_link_libraries(
    llama-android
    common
    llama
    mtmd
    ${log-lib}
    ${android-lib}
)

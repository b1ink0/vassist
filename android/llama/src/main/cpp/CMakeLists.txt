# For more information about using CMake with Android Studio, read the
# documentation: https://d.android.com/studio/projects/add-native-code.html.

cmake_minimum_required(VERSION 3.22.1)

project("llama-android")

if(ANDROID)
    find_library(VULKAN_LIBRARY vulkan REQUIRED)
    
    if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
        set(NDK_HOST_TAG "windows-x86_64")
    elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Linux")
        set(NDK_HOST_TAG "linux-x86_64")
    elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin")
        set(NDK_HOST_TAG "darwin-x86_64")
    endif()
    
    # Vulkan headers are in NDK sysroot
    set(VULKAN_INCLUDE_DIR "${ANDROID_NDK}/toolchains/llvm/prebuilt/${NDK_HOST_TAG}/sysroot/usr/include")
    
    set(VULKAN_GLSLC "${ANDROID_NDK}/shader-tools/${NDK_HOST_TAG}/glslc")
    if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
        set(VULKAN_GLSLC "${VULKAN_GLSLC}.exe")
    endif()
    
    if(EXISTS ${VULKAN_GLSLC})
        set(Vulkan_GLSLC_EXECUTABLE ${VULKAN_GLSLC} CACHE STRING "Vulkan GLSLC" FORCE)
        message(STATUS "Using NDK glslc: ${VULKAN_GLSLC}")
    else()
        message(WARNING "NDK glslc not found at ${VULKAN_GLSLC}")
    endif()
    
    # Create Vulkan::Vulkan target that llama.cpp expects
    if(NOT TARGET Vulkan::Vulkan)
        add_library(Vulkan::Vulkan SHARED IMPORTED)
        set_target_properties(Vulkan::Vulkan PROPERTIES
            IMPORTED_LOCATION ${VULKAN_LIBRARY}
            INTERFACE_INCLUDE_DIRECTORIES ${VULKAN_INCLUDE_DIR}
        )
    endif()
    
    # Set variables that FindVulkan.cmake expects
    set(Vulkan_FOUND TRUE CACHE BOOL "Vulkan found" FORCE)
    set(Vulkan_LIBRARY ${VULKAN_LIBRARY} CACHE STRING "Vulkan library" FORCE)
    set(Vulkan_INCLUDE_DIR ${VULKAN_INCLUDE_DIR} CACHE STRING "Vulkan include dir" FORCE)
    
    message(STATUS "Android Vulkan library: ${VULKAN_LIBRARY}")
    message(STATUS "Android Vulkan headers: ${VULKAN_INCLUDE_DIR}")
    
    include(FetchContent)
    FetchContent_Declare(
        vulkan_hpp
        GIT_REPOSITORY https://github.com/KhronosGroup/Vulkan-Hpp.git
        GIT_TAG        v1.3.275
        GIT_SHALLOW    TRUE
        SOURCE_DIR     ${CMAKE_CURRENT_BINARY_DIR}/vulkan-hpp
    )
    FetchContent_MakeAvailable(vulkan_hpp)
    include_directories(${CMAKE_CURRENT_BINARY_DIR}/vulkan-hpp)
endif()

# Fetch llama.cpp from GitHub
include(FetchContent)
FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG        master
    GIT_SHALLOW    TRUE
    PATCH_COMMAND ""
)

# Download llama.cpp but don't configure yet
FetchContent_GetProperties(llama)
if(NOT llama_POPULATED)
    FetchContent_Populate(llama)
    
    if(EXISTS "${llama_SOURCE_DIR}/ggml/src/CMakeLists.txt")
        file(READ "${llama_SOURCE_DIR}/ggml/src/CMakeLists.txt" GGML_CMAKE)
        
        string(REPLACE 
            "if (GGML_VULKAN)"
            "if (GGML_VULKAN)\n    # Android patch: Skip shader generator to avoid cross-compilation\n    set(GGML_VULKAN_RUN_TESTS OFF)\n    set(GGML_VULKAN_GENERATE_SHADERS OFF)"
            GGML_CMAKE "${GGML_CMAKE}"
        )
        
        file(WRITE "${llama_SOURCE_DIR}/ggml/src/CMakeLists.txt" "${GGML_CMAKE}")
        message(STATUS "✓ Patched llama.cpp Vulkan build for Android")
    endif()
    
    add_subdirectory(${llama_SOURCE_DIR} ${llama_BINARY_DIR})
endif()

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
    ${MTMD_SOURCE_DIR}/models/mobilenetv5.cpp
    ${MTMD_SOURCE_DIR}/models/pixtral.cpp
    ${MTMD_SOURCE_DIR}/models/qwen2vl.cpp
    ${MTMD_SOURCE_DIR}/models/qwen3vl.cpp
    ${MTMD_SOURCE_DIR}/models/siglip.cpp
    ${MTMD_SOURCE_DIR}/models/whisper-enc.cpp
    ${MTMD_SOURCE_DIR}/models/youtuvl.cpp
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

# Link libraries (added mtmd for multimodal support and vulkan for GPU)
target_link_libraries(
    llama-android
    common
    llama
    mtmd
    ${log-lib}
    ${android-lib}
    vulkan
)

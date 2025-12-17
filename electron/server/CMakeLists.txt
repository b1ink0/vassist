cmake_minimum_required(VERSION 3.22)

project(vassist_server)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Enable ccache for faster recompilation
find_program(CCACHE_PROGRAM ccache)
if(CCACHE_PROGRAM)
    set(CMAKE_C_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
    set(CMAKE_CXX_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
    set(CMAKE_CUDA_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
endif()

# Find Node.js addon API from root node_modules
set(NODE_ADDON_API_DIR "${CMAKE_SOURCE_DIR}/../../node_modules/node-addon-api")

# Find Node.js headers and lib
if(NOT DEFINED CMAKE_JS_INC)
    # Get Node.js version and node-gyp cache path
    execute_process(
        COMMAND node -p "require('path').join(process.env.LOCALAPPDATA || process.env.HOME, 'node-gyp', 'Cache', process.version.slice(1), 'include', 'node')"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        OUTPUT_VARIABLE NODE_INCLUDE_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    string(REPLACE "\"" "" NODE_INCLUDE_DIR "${NODE_INCLUDE_DIR}")
    string(REPLACE "\\" "/" NODE_INCLUDE_DIR "${NODE_INCLUDE_DIR}")
    
    # Verify headers exist
    if(NOT EXISTS "${NODE_INCLUDE_DIR}/node.h")
        message(FATAL_ERROR "Node.js headers not found. Run: bunx node-gyp install")
    endif()
    
    set(CMAKE_JS_INC "${NODE_INCLUDE_DIR}")
    message(STATUS "Node.js headers: ${CMAKE_JS_INC}")
endif()

# Find node.lib on Windows
if(WIN32 AND NOT DEFINED CMAKE_JS_LIB)
    execute_process(
        COMMAND node -p "require('path').join(process.env.LOCALAPPDATA || process.env.HOME, 'node-gyp', 'Cache', process.version.slice(1), process.arch, 'node.lib')"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        OUTPUT_VARIABLE NODE_LIB_FILE
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    string(REPLACE "\"" "" NODE_LIB_FILE "${NODE_LIB_FILE}")
    string(REPLACE "\\" "/" NODE_LIB_FILE "${NODE_LIB_FILE}")
    
    if(NOT EXISTS "${NODE_LIB_FILE}")
        message(FATAL_ERROR "node.lib not found at ${NODE_LIB_FILE}. Run: bunx node-gyp install")
    endif()
    
    set(CMAKE_JS_LIB "${NODE_LIB_FILE}")
    message(STATUS "Node.js lib: ${CMAKE_JS_LIB}")
endif()

# Fetch llama.cpp
include(FetchContent)
set(FETCHCONTENT_QUIET OFF)  # Show download progress
FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG master
    GIT_SHALLOW TRUE
    GIT_PROGRESS TRUE
)

# Configure llama.cpp
set(GGML_CUDA ON CACHE BOOL "Enable CUDA" FORCE)
set(LLAMA_BUILD_COMMON ON CACHE BOOL "Build common library" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "Don't build server" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "Don't build examples" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "Disable CURL" FORCE)
set(LLAMA_HTTPLIB ON CACHE BOOL "Use httplib for downloads" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Static libs" FORCE)

FetchContent_MakeAvailable(llama)

# Fetch whisper.cpp
FetchContent_Declare(
    whisper
    GIT_REPOSITORY https://github.com/ggml-org/whisper.cpp
    GIT_TAG master
    GIT_SHALLOW TRUE
)

set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "Don't build examples" FORCE)
FetchContent_MakeAvailable(whisper)

# Fetch cpp-httplib
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib
    GIT_TAG v0.15.3
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(httplib)

# Fetch nlohmann/json
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json
    GIT_TAG v3.11.3
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(json)

# Node.js addon
add_library(server SHARED
    src/server.cpp
    src/llm.cpp
    src/tts.cpp
    src/stt.cpp
    src/http.cpp
)

target_include_directories(server PRIVATE
    ${NODE_ADDON_API_DIR}
    ${NODE_ADDON_API_DIR}/..
    ${CMAKE_JS_INC}
    ${CMAKE_SOURCE_DIR}/src
    ${llama_SOURCE_DIR}/include
    ${llama_SOURCE_DIR}/common
    ${llama_SOURCE_DIR}/ggml/include
    ${httplib_SOURCE_DIR}
    ${json_SOURCE_DIR}/include
)

target_link_libraries(server
    llama
    common
    whisper
    ${CMAKE_JS_LIB}
)

set_target_properties(server PROPERTIES 
    PREFIX ""
    SUFFIX ".node"
)

if(WIN32)
    target_compile_definitions(server PRIVATE NAPI_VERSION=8)
    
    # Bundle CUDA runtime DLLs for GPU support
    # These DLLs are ~50MB but enable GPU acceleration for users with NVIDIA GPUs
    # Users without NVIDIA GPUs will still work (CPU fallback)
    
    find_package(CUDAToolkit QUIET)
    if(CUDAToolkit_FOUND)
        message(STATUS "CUDA Toolkit found: ${CUDAToolkit_VERSION}")
        message(STATUS "Bundling CUDA runtime DLLs...")
        
        # CUDA 13.x uses bin/x64/, older versions use bin/
        set(CUDA_BIN_PATHS
            "${CUDAToolkit_BIN_DIR}/x64"
            "${CUDAToolkit_BIN_DIR}"
        )
        
        # DLLs to bundle
        set(CUDA_DLL_NAMES
            "cudart64_${CUDAToolkit_VERSION_MAJOR}.dll"
            "cublas64_${CUDAToolkit_VERSION_MAJOR}.dll"
            "cublasLt64_${CUDAToolkit_VERSION_MAJOR}.dll"
        )
        
        foreach(DLL_NAME ${CUDA_DLL_NAMES})
            set(DLL_FOUND FALSE)
            foreach(BIN_PATH ${CUDA_BIN_PATHS})
                set(CUDA_DLL "${BIN_PATH}/${DLL_NAME}")
                if(EXISTS "${CUDA_DLL}")
                    add_custom_command(TARGET server POST_BUILD
                        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        "${CUDA_DLL}"
                        "$<TARGET_FILE_DIR:server>"
                        COMMENT "Copying ${DLL_NAME}"
                    )
                    message(STATUS "  Will bundle: ${CUDA_DLL}")
                    set(DLL_FOUND TRUE)
                    break()
                endif()
            endforeach()
            if(NOT DLL_FOUND)
                message(WARNING "  CUDA DLL not found: ${DLL_NAME}")
            endif()
        endforeach()
    else()
        message(WARNING "CUDA Toolkit not found. server.node will require CUDA runtime DLLs at runtime.")
    endif()
endif()

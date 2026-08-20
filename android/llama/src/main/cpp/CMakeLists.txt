cmake_minimum_required(VERSION 3.22.1)
project("llama-android")

set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)

include(FetchContent)
FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggerganov/llama.cpp.git
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(llama)

add_subdirectory("${llama_SOURCE_DIR}/tools/mtmd" "${CMAKE_CURRENT_BINARY_DIR}/mtmd")

add_library(
    llama-android
    SHARED
    llama-android.cpp
)

target_include_directories(
    llama-android
    PRIVATE
    ${llama_SOURCE_DIR}/tools/mtmd
    ${llama_SOURCE_DIR}/common
    ${llama_SOURCE_DIR}/include
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(
    llama-android
    llama-common
    mtmd
    ${log-lib}
    ${android-lib}
)

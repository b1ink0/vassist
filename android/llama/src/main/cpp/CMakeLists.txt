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

# Creates and names a library, sets it as SHARED
add_library(
    llama-android
    SHARED
    llama-android.cpp
)

# Find required Android libraries
find_library(log-lib log)
find_library(android-lib android)

# Link libraries
target_link_libraries(
    llama-android
    common
    llama
    ${log-lib}
    ${android-lib}
)

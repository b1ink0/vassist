# Windows host toolchain for vulkan-shaders-gen cross-compilation
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR AMD64)

# Try to find compilers in common locations
# Priority: MinGW > MSVC > Clang
set(MINGW_PATHS
    "C:/mingw64/bin"
    "C:/msys64/mingw64/bin"
    "C:/Program Files/mingw-w64/x86_64-8.1.0-posix-seh-rt_v6-rev0/mingw64/bin"
)

set(MSVC_PATHS
    "C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.40.33807/bin/Hostx64/x64"
    "C:/Program Files/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.40.33807/bin/Hostx64/x64"
    "C:/Program Files (x86)/Microsoft Visual Studio/2019/Community/VC/Tools/MSVC/14.29.30133/bin/Hostx64/x64"
)

# Search for MinGW first
find_program(GCC_COMPILER gcc PATHS ${MINGW_PATHS} NO_DEFAULT_PATH)
find_program(GXX_COMPILER g++ PATHS ${MINGW_PATHS} NO_DEFAULT_PATH)

# If MinGW found, use it
if(GCC_COMPILER AND GXX_COMPILER)
    set(CMAKE_C_COMPILER ${GCC_COMPILER})
    set(CMAKE_CXX_COMPILER ${GXX_COMPILER})
    message(STATUS "Using MinGW: ${CMAKE_C_COMPILER}")
else()
    # Try MSVC
    find_program(CL_COMPILER cl PATHS ${MSVC_PATHS} NO_DEFAULT_PATH)
    if(CL_COMPILER)
        set(CMAKE_C_COMPILER ${CL_COMPILER})
        set(CMAKE_CXX_COMPILER ${CL_COMPILER})
        message(STATUS "Using MSVC: ${CMAKE_C_COMPILER}")
    else()
        # Fallback to system PATH
        find_program(CMAKE_C_COMPILER NAMES gcc cl clang)
        find_program(CMAKE_CXX_COMPILER NAMES g++ cl clang++)
        if(CMAKE_C_COMPILER)
            message(STATUS "Using system compiler: ${CMAKE_C_COMPILER}")
        else()
            message(FATAL_ERROR "No C/C++ compiler found! Install MinGW or Visual Studio")
        endif()
    endif()
endif()

# Disable cross-compilation search restrictions
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE NEVER)

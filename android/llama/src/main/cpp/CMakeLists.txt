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
    GIT_TAG        70aff25250075bf23b533c207b55168a4f926350
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(llama)

# WORKAROUND: Patch llama.cpp to accept older GGUF models that have 3-element rope sections instead of 4
# Some qwen2/qwen35 models exported by Ollama have an array length of 3, but llama.cpp upstream aggressively expects exactly 4.
file(READ "${llama_SOURCE_DIR}/src/llama-model-loader.cpp" LLAMA_LOADER_SRC)
string(REPLACE "if (n != arr_info.length) {" "if (n < arr_info.length) {" LLAMA_LOADER_SRC "${LLAMA_LOADER_SRC}")
file(WRITE "${llama_SOURCE_DIR}/src/llama-model-loader.cpp" "${LLAMA_LOADER_SRC}")

# WORKAROUND 2: Patch qwen35.cpp to make ssm_dt.bias optional (Ollama qwen3.5:0.8b missing tensor)
file(READ "${llama_SOURCE_DIR}/src/models/qwen35.cpp" QWEN35_SRC)
string(REPLACE "tn(LLM_TENSOR_SSM_DT,         \"bias\",   il), { hparams.ssm_dt_rank }, flags" "tn(LLM_TENSOR_SSM_DT,         \"bias\",   il), { hparams.ssm_dt_rank }, TENSOR_NOT_REQUIRED" QWEN35_SRC "${QWEN35_SRC}")
string(REPLACE "ggml_add(ctx0, alpha, model.layers[il].ssm_dt);" "model.layers[il].ssm_dt ? ggml_add(ctx0, alpha, model.layers[il].ssm_dt) : alpha;" QWEN35_SRC "${QWEN35_SRC}")

# WORKAROUND 3: Patch qwen35.cpp to properly evaluate per-layer variable dimensions
string(REPLACE "n_embd_k_gqa, n_embd_v_gqa" "hparams.n_embd_k_gqa(il), hparams.n_embd_v_gqa(il)" QWEN35_SRC "${QWEN35_SRC}")
string(REPLACE "n_head_kv, n_tokens" "hparams.n_head_kv(il), n_tokens" QWEN35_SRC "${QWEN35_SRC}")

file(WRITE "${llama_SOURCE_DIR}/src/models/qwen35.cpp" "${QWEN35_SRC}")

# WORKAROUND 4: Patch llama-model.cpp to allow partial tensor loading conditionally
# VLMs embedded in the same GGUF (like Qwen3.5 Ollama hybrid) need partial load. 
# We dynamically check GGUF metadata instead of unconditionally allowing partial load.
file(READ "${llama_SOURCE_DIR}/src/llama-model.cpp" LLAMA_MODEL_SRC)
set(VLM_DETECT_CODE "bool is_vlm = false;\n    for (int i = 0; i < gguf_get_n_kv(ml.metadata); i++) {\n        const char * key = gguf_get_key(ml.metadata, i);\n        std::string s_key(key);\n        if (s_key.find(\"clip.vision.\") == 0 || s_key.find(\"vision.\") == 0 || s_key.find(\"qwen35.vision.\") == 0 || s_key.find(\"qwen3vl.vision.\") == 0 || s_key == \"clip.has_vision_encoder\") {\n            is_vlm = true;\n            break;\n        }\n    }\n    ml.done_getting_tensors(is_vlm); // PATCHED: dynamic partial load for VLM backbones")
string(REPLACE "ml.done_getting_tensors(true); // PATCHED: allow partial load for VLM backbones" "${VLM_DETECT_CODE}" LLAMA_MODEL_SRC "${LLAMA_MODEL_SRC}")
string(REPLACE "ml.done_getting_tensors();" "${VLM_DETECT_CODE}" LLAMA_MODEL_SRC "${LLAMA_MODEL_SRC}")
file(WRITE "${llama_SOURCE_DIR}/src/llama-model.cpp" "${LLAMA_MODEL_SRC}")

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

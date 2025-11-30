#include <android/log.h>
#include <jni.h>
#include <iomanip>
#include <cmath>
#include <string>
#include <unistd.h>
#include <sstream>
#include "llama.h"
#include "common.h"

#define TAG "llama-android.cpp"
#define LOGi(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGe(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

// Cache for JNI method IDs
jclass la_int_var;
jmethodID la_int_var_value;
jmethodID la_int_var_inc;

// Cached token string for incomplete UTF-8 sequences
static std::string cached_token_chars;

// Check if string is valid UTF-8
bool is_valid_utf8(const char * string) {
    if (!string) return true;
    
    const unsigned char * bytes = (const unsigned char *)string;
    unsigned int cp;
    int num;
    
    while (*bytes != 0x00) {
        if ((*bytes & 0x80) == 0x00) {
            cp = (*bytes & 0x7F);
            num = 1;
        } else if ((*bytes & 0xE0) == 0xC0) {
            cp = (*bytes & 0x1F);
            num = 2;
        } else if ((*bytes & 0xF0) == 0xE0) {
            cp = (*bytes & 0x0F);
            num = 3;
        } else if ((*bytes & 0xF8) == 0xF0) {
            cp = (*bytes & 0x07);
            num = 4;
        } else {
            return false;
        }
        
        bytes += 1;
        for (int i = 1; i < num; ++i) {
            if ((*bytes & 0xC0) != 0x80) return false;
            cp = (cp << 6) | (*bytes & 0x3F);
            bytes += 1;
        }
        
        if ((cp > 0x10FFFF) ||
            ((cp >= 0xD800) && (cp <= 0xDFFF)) ||
            ((cp <= 0x007F) && (num != 1)) ||
            ((cp >= 0x0080) && (cp <= 0x07FF) && (num != 2)) ||
            ((cp >= 0x0800) && (cp <= 0xFFFF) && (num != 3)) ||
            ((cp >= 0x10000) && (cp <= 0x1FFFFF) && (num != 4))) {
            return false;
        }
    }
    
    return true;
}

// Custom log callback for Android logcat
static void log_callback(ggml_log_level level, const char * fmt, void * data) {
    int priority;
    switch (level) {
        case GGML_LOG_LEVEL_ERROR: priority = ANDROID_LOG_ERROR; break;
        case GGML_LOG_LEVEL_WARN:  priority = ANDROID_LOG_WARN; break;
        case GGML_LOG_LEVEL_INFO:  priority = ANDROID_LOG_INFO; break;
        case GGML_LOG_LEVEL_DEBUG: priority = ANDROID_LOG_DEBUG; break;
        default: priority = ANDROID_LOG_VERBOSE; break;
    }
    __android_log_print(priority, TAG, "%s", fmt);
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_load_1model(JNIEnv *env, jobject, jstring filename) {
    llama_model_params model_params = llama_model_default_params();
    
    // Use fewer GPU layers on mobile - CPU is often faster for small models
    model_params.n_gpu_layers = 0;
    
    auto path_to_model = env->GetStringUTFChars(filename, 0);
    LOGi("Loading model from %s", path_to_model);
    
    auto model = llama_model_load_from_file(path_to_model, model_params);
    env->ReleaseStringUTFChars(filename, path_to_model);
    
    if (!model) {
        LOGe("load_model() failed");
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), "load_model() failed");
        return 0;
    }
    
    LOGi("Model loaded successfully");
    return reinterpret_cast<jlong>(model);
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_free_1model(JNIEnv *, jobject, jlong model) {
    llama_model_free(reinterpret_cast<llama_model *>(model));
    LOGi("Model freed");
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_new_1context(JNIEnv *env, jobject, jlong jmodel, jint n_ctx) {
    auto model = reinterpret_cast<llama_model *>(jmodel);
    
    if (!model) {
        LOGe("new_context(): model cannot be null");
        env->ThrowNew(env->FindClass("java/lang/IllegalArgumentException"), "Model cannot be null");
        return 0;
    }
    
    // Use optimal thread count for mobile
    int n_threads = std::max(1, std::min(4, (int)sysconf(_SC_NPROCESSORS_ONLN) - 2));
    LOGi("Using %d threads, context size: %d", n_threads, n_ctx);
    
    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = n_ctx > 0 ? n_ctx : 2048;
    ctx_params.n_threads = n_threads;
    ctx_params.n_threads_batch = n_threads;
    
    llama_context * context = llama_init_from_model(model, ctx_params);
    
    if (!context) {
        LOGe("llama_init_from_model() returned null");
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),
                      "llama_init_from_model() failed");
        return 0;
    }
    
    return reinterpret_cast<jlong>(context);
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_free_1context(JNIEnv *, jobject, jlong context) {
    llama_free(reinterpret_cast<llama_context *>(context));
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_backend_1init(JNIEnv *, jobject) {
    llama_backend_init();
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_backend_1free(JNIEnv *, jobject) {
    llama_backend_free();
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_log_1to_1android(JNIEnv *, jobject) {
    llama_log_set(log_callback, NULL);
}

extern "C"
JNIEXPORT jstring JNICALL
Java_android_llama_cpp_LlamaAndroid_system_1info(JNIEnv *env, jobject) {
    return env->NewStringUTF(llama_print_system_info());
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_new_1batch(JNIEnv *, jobject, jint n_tokens, jint embd, jint n_seq_max) {
    auto batch = new llama_batch;
    *batch = llama_batch_init(n_tokens, embd, n_seq_max);
    return reinterpret_cast<jlong>(batch);
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_free_1batch(JNIEnv *, jobject, jlong batch_pointer) {
    auto batch = reinterpret_cast<llama_batch *>(batch_pointer);
    llama_batch_free(*batch);
    delete batch;
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_new_1sampler(JNIEnv *env, jobject thiz, jfloat temperature, jint top_k, jfloat top_p, jlong context_pointer) {
    auto sparams = llama_sampler_chain_default_params();
    sparams.no_perf = true;
    
    llama_sampler * smpl = llama_sampler_chain_init(sparams);
    
    // NOTE: Thinking mode is disabled at the prompt level by prefilling with <think></think>
    // in formatChatPrompt(). This is the proper approach used by llama.cpp/koboldcpp.
    // Logit bias is NOT used - the model sees a closed thinking block and skips thinking.
    
    if (temperature <= 0.0f) {
        // Greedy sampling
        llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
    } else {
        // Temperature + Top-K + Top-P sampling
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(top_k));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(top_p, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(temperature));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    }
    
    return reinterpret_cast<jlong>(smpl);
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_free_1sampler(JNIEnv *, jobject, jlong sampler_pointer) {
    llama_sampler_free(reinterpret_cast<llama_sampler *>(sampler_pointer));
}

extern "C"
JNIEXPORT void JNICALL
Java_android_llama_cpp_LlamaAndroid_kv_1cache_1clear(JNIEnv *, jobject, jlong context) {
    llama_memory_clear(llama_get_memory(reinterpret_cast<llama_context *>(context)), false);
}

extern "C"
JNIEXPORT jint JNICALL
Java_android_llama_cpp_LlamaAndroid_completion_1init(
        JNIEnv *env,
        jobject,
        jlong context_pointer,
        jlong batch_pointer,
        jstring jtext,
        jint n_len
) {
    cached_token_chars.clear();
    
    const auto text = env->GetStringUTFChars(jtext, 0);
    const auto context = reinterpret_cast<llama_context *>(context_pointer);
    const auto batch = reinterpret_cast<llama_batch *>(batch_pointer);
    
    const auto tokens_list = common_tokenize(context, text, true, true);
    
    auto n_ctx = llama_n_ctx(context);
    auto n_kv_req = tokens_list.size() + n_len;
    
    LOGi("Prompt tokens: %zu, n_len: %d, n_ctx: %d, n_kv_req: %zu", 
         tokens_list.size(), n_len, n_ctx, n_kv_req);
    
    if (n_kv_req > n_ctx) {
        LOGe("error: n_kv_req (%zu) > n_ctx (%d)", n_kv_req, n_ctx);
    }
    
    // Clear batch and add prompt tokens
    common_batch_clear(*batch);
    for (size_t i = 0; i < tokens_list.size(); i++) {
        common_batch_add(*batch, tokens_list[i], i, { 0 }, false);
    }
    
    // Enable logits for the last token
    batch->logits[batch->n_tokens - 1] = true;
    
    if (llama_decode(context, *batch) != 0) {
        LOGe("llama_decode() failed during prompt processing");
    }
    
    env->ReleaseStringUTFChars(jtext, text);
    
    return batch->n_tokens;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_android_llama_cpp_LlamaAndroid_completion_1loop(
        JNIEnv * env,
        jobject,
        jlong context_pointer,
        jlong batch_pointer,
        jlong sampler_pointer,
        jint n_len,
        jobject intvar_ncur
) {
    const auto context = reinterpret_cast<llama_context *>(context_pointer);
    const auto batch = reinterpret_cast<llama_batch *>(batch_pointer);
    const auto sampler = reinterpret_cast<llama_sampler *>(sampler_pointer);
    const auto model = llama_get_model(context);
    const auto vocab = llama_model_get_vocab(model);
    
    // Cache JNI method IDs
    if (!la_int_var) la_int_var = env->GetObjectClass(intvar_ncur);
    if (!la_int_var_value) la_int_var_value = env->GetMethodID(la_int_var, "getValue", "()I");
    if (!la_int_var_inc) la_int_var_inc = env->GetMethodID(la_int_var, "inc", "()V");
    
    // Sample next token
    const auto new_token_id = llama_sampler_sample(sampler, context, -1);
    const auto n_cur = env->CallIntMethod(intvar_ncur, la_int_var_value);
    
    // Check for end of generation
    if (llama_vocab_is_eog(vocab, new_token_id) || n_cur >= n_len) {
        return nullptr;
    }
    
    // Convert token to string
    auto new_token_chars = common_token_to_piece(context, new_token_id);
    cached_token_chars += new_token_chars;
    
    jstring new_token = nullptr;
    if (is_valid_utf8(cached_token_chars.c_str())) {
        new_token = env->NewStringUTF(cached_token_chars.c_str());
        cached_token_chars.clear();
    } else {
        new_token = env->NewStringUTF("");
    }
    
    // Prepare next batch
    common_batch_clear(*batch);
    common_batch_add(*batch, new_token_id, n_cur, { 0 }, true);
    
    env->CallVoidMethod(intvar_ncur, la_int_var_inc);
    
    if (llama_decode(context, *batch) != 0) {
        LOGe("llama_decode() failed");
    }
    
    return new_token;
}

extern "C"
JNIEXPORT jstring JNICALL
Java_android_llama_cpp_LlamaAndroid_get_1model_1desc(JNIEnv *env, jobject, jlong model_pointer) {
    const auto model = reinterpret_cast<llama_model *>(model_pointer);
    char model_desc[256];
    llama_model_desc(model, model_desc, sizeof(model_desc));
    return env->NewStringUTF(model_desc);
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_get_1model_1size(JNIEnv *, jobject, jlong model_pointer) {
    const auto model = reinterpret_cast<llama_model *>(model_pointer);
    return llama_model_size(model);
}

extern "C"
JNIEXPORT jlong JNICALL
Java_android_llama_cpp_LlamaAndroid_get_1model_1n_1params(JNIEnv *, jobject, jlong model_pointer) {
    const auto model = reinterpret_cast<llama_model *>(model_pointer);
    return llama_model_n_params(model);
}

extern "C"
JNIEXPORT jstring JNICALL
Java_android_llama_cpp_LlamaAndroid_get_1chat_1template(JNIEnv *env, jobject, jlong model_pointer) {
    const auto model = reinterpret_cast<llama_model *>(model_pointer);
    const char * tmpl = llama_model_chat_template(model, nullptr);
    if (tmpl) {
        return env->NewStringUTF(tmpl);
    }
    return nullptr;
}

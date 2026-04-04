#include <napi.h>
#include "http.h"
#include "llama.h"
#include "common.h"
#include "whisper.h"
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <memory>

/**
 * Server - Unified HTTP server on http://127.0.0.1:11438
 * Endpoints:
 *   POST /v1/chat/completions - LLM
 *   POST /v1/audio/speech - TTS  
 *   POST /v1/audio/transcriptions - STT
 */
class Server : public Napi::ObjectWrap<Server> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Server(const Napi::CallbackInfo& info);
    ~Server();

private:
    static Napi::FunctionReference constructor;

    // API
    Napi::Value Start(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    Napi::Value GetStatus(const Napi::CallbackInfo& info);

    // HTTP server thread
    void RunHTTP();

    // LLM
    llama_model* llm_model = nullptr;
    llama_context* llm_ctx = nullptr;
    std::mutex llm_mutex;

    // STT
    whisper_context* stt_ctx = nullptr;
    std::mutex stt_mutex;

    // Server state
    std::atomic<bool> running{false};
    std::thread http_thread;
    std::unique_ptr<HTTPServerInterface> http_server;
    int port = 11438;
};

Napi::FunctionReference Server::constructor;

Napi::Object Server::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "Server", {
        InstanceMethod("start", &Server::Start),
        InstanceMethod("stop", &Server::Stop),
        InstanceMethod("getStatus", &Server::GetStatus)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("Server", func);
    return exports;
}

Server::Server(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<Server>(info) {
    try {
        llama_backend_init();
        whisper_log_set(nullptr, nullptr); // Disable whisper logs
    } catch (const std::exception& e) {
        Napi::Error::New(info.Env(), std::string("Failed to initialize backend: ") + e.what()).ThrowAsJavaScriptException();
    } catch (...) {
        Napi::Error::New(info.Env(), "Failed to initialize backend: unknown error").ThrowAsJavaScriptException();
    }
}

Server::~Server() {
    running = false;
    if (http_server) {
        http_server->Stop();
        http_server.reset();
    }
    if (http_thread.joinable()) http_thread.join();
    
    if (llm_ctx) llama_free(llm_ctx);
    if (llm_model) llama_free_model(llm_model);
    if (stt_ctx) whisper_free(stt_ctx);
    
    llama_backend_free();
}

Napi::Value Server::Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (running) {
        return Napi::Boolean::New(env, false);
    }

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Options required").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object opts = info[0].As<Napi::Object>();
    
    // Load LLM model
    if (opts.Has("llmModel")) {
        std::string path = opts.Get("llmModel").As<Napi::String>().Utf8Value();
        
        llama_model_params mp = llama_model_default_params();
        mp.n_gpu_layers = 99;
        
        llm_model = llama_load_model_from_file(path.c_str(), mp);
        if (!llm_model) {
            Napi::Error::New(env, "Failed to load LLM model").ThrowAsJavaScriptException();
            return env.Null();
        }

        llama_context_params cp = llama_context_default_params();
        cp.n_ctx = 4096;
        cp.n_batch = 512;
        
        llm_ctx = llama_new_context_with_model(llm_model, cp);
        if (!llm_ctx) {
            Napi::Error::New(env, "Failed to create LLM context").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    // Load STT model
    if (opts.Has("sttModel")) {
        std::string path = opts.Get("sttModel").As<Napi::String>().Utf8Value();
        
        whisper_context_params cp = whisper_context_default_params();
        cp.use_gpu = true;
        
        stt_ctx = whisper_init_from_file_with_params(path.c_str(), cp);
        if (!stt_ctx) {
            Napi::Error::New(env, "Failed to load STT model").ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    if (opts.Has("port")) {
        port = opts.Get("port").As<Napi::Number>().Int32Value();
    }

    // Start HTTP server
    running = true;
    http_server = CreateHTTPServer(port, llm_model, llm_ctx, llm_mutex, stt_ctx, stt_mutex);
    http_thread = std::thread(&Server::RunHTTP, this);

    return Napi::Boolean::New(env, true);
}

Napi::Value Server::Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!running) return Napi::Boolean::New(env, false);

    running = false;
    if (http_server) {
        http_server->Stop();
        http_server.reset();
    }
    if (http_thread.joinable()) http_thread.join();

    return Napi::Boolean::New(env, true);
}

Napi::Value Server::GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object status = Napi::Object::New(env);
    status.Set("running", Napi::Boolean::New(env, running));
    status.Set("port", Napi::Number::New(env, port));
    status.Set("url", Napi::String::New(env, "http://127.0.0.1:" + std::to_string(port)));
    status.Set("llmReady", Napi::Boolean::New(env, llm_model != nullptr));
    status.Set("sttReady", Napi::Boolean::New(env, stt_ctx != nullptr));
    
    return status;
}

void Server::RunHTTP() {
    if (http_server) {
        http_server->Start(); // Blocks until server stops
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return Server::Init(env, exports);
}

NODE_API_MODULE(server, Init)

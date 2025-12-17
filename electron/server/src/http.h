#pragma once

#include <memory>
#include <mutex>

// HTTPServer interface (for server.cpp to use without full definition)
class HTTPServerInterface {
public:
    virtual ~HTTPServerInterface() = default;
    virtual void Start() = 0;
    virtual void Stop() = 0;
};

// Factory function to create HTTP server
std::unique_ptr<HTTPServerInterface> CreateHTTPServer(
    int port, 
    void* llm_model, 
    void* llm_ctx, 
    std::mutex& llm_mutex, 
    void* stt_ctx, 
    std::mutex& stt_mutex
);

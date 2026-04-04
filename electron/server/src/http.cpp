#include <napi.h>
#include "http.h"
#include "httplib.h"
#include <string>
#include <memory>
#include <mutex>
#include <functional>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Forward declarations from llm.cpp and stt.cpp
extern void HandleChatCompletion(const json& request, void* llm_model, void* llm_ctx, std::mutex& llm_mutex,
                                 std::function<void(const std::string&, bool)> callback);
extern std::string HandleTranscription(const std::vector<uint8_t>& audio_data, void* stt_ctx, std::mutex& stt_mutex);

class HTTPServer : public HTTPServerInterface {
public:
    HTTPServer(int port, void* llm_model, void* llm_ctx, std::mutex& llm_mutex, 
               void* stt_ctx, std::mutex& stt_mutex)
        : port(port), llm_model(llm_model), llm_ctx(llm_ctx), llm_mutex(llm_mutex),
          stt_ctx(stt_ctx), stt_mutex(stt_mutex) {
        
        server.Post("/v1/chat/completions", [this](const httplib::Request& req, httplib::Response& res) {
            this->HandleLLM(req, res);
        });

        server.Post("/v1/audio/transcriptions", [this](const httplib::Request& req, httplib::Response& res) {
            this->HandleSTT(req, res);
        });

        // CORS headers
        server.set_default_headers({
            {"Access-Control-Allow-Origin", "*"},
            {"Access-Control-Allow-Methods", "POST, OPTIONS"},
            {"Access-Control-Allow-Headers", "Content-Type"}
        });

        server.Options(".*", [](const httplib::Request&, httplib::Response& res) {
            res.status = 200;
        });
    }

    void Start() {
        server.listen("127.0.0.1", port);
    }

    void Stop() {
        server.stop();
    }

private:
    void HandleLLM(const httplib::Request& req, httplib::Response& res) {
        try {
            if (!llm_model || !llm_ctx) {
                res.status = 503;
                res.set_content(R"({"error": "LLM not loaded"})", "application/json");
                return;
            }

            json request = json::parse(req.body);
            bool stream = request.value("stream", false);

            if (stream) {
                // Streaming response
                res.set_header("Content-Type", "text/event-stream");
                res.set_header("Cache-Control", "no-cache");
                res.set_header("Connection", "keep-alive");
                
                res.set_content_provider(
                    "text/event-stream",
                    [this, request](size_t offset, httplib::DataSink& sink) {
                        HandleChatCompletion(request, llm_model, llm_ctx, llm_mutex,
                            [&sink](const std::string& chunk, bool is_done) {
                                sink.write(chunk.c_str(), chunk.size());
                                if (is_done) {
                                    sink.done();
                                }
                            });
                        return true;
                    }
                );
            } else {
                // Non-streaming response
                std::string response_text;
                HandleChatCompletion(request, llm_model, llm_ctx, llm_mutex,
                    [&response_text](const std::string& chunk, bool is_done) {
                        response_text = chunk;
                    });
                res.set_content(response_text, "application/json");
            }
        } catch (const std::exception& e) {
            res.status = 500;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    }

    void HandleSTT(const httplib::Request& req, httplib::Response& res) {
        try {
            if (!stt_ctx) {
                res.status = 503;
                res.set_content(R"({"error": "STT not loaded"})", "application/json");
                return;
            }

            // Parse multipart form data for audio file
            httplib::MultipartFormDataItems files;
            if (!req.has_file("file")) {
                res.status = 400;
                res.set_content(R"({"error": "No audio file provided"})", "application/json");
                return;
            }
            auto file = req.get_file_value("file");

            std::vector<uint8_t> audio_data(file.content.begin(), file.content.end());

            if (audio_data.empty()) {
                res.status = 400;
                res.set_content(R"({"error": "No audio file"})", "application/json");
                return;
            }

            std::string response = HandleTranscription(audio_data, stt_ctx, stt_mutex);
            res.set_content(response, "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            json error = {{"error", e.what()}};
            res.set_content(error.dump(), "application/json");
        }
    }

    httplib::Server server;
    int port;
    void* llm_model;
    void* llm_ctx;
    std::mutex& llm_mutex;
    void* stt_ctx;
    std::mutex& stt_mutex;
};

// Factory function to create HTTPServer
std::unique_ptr<HTTPServerInterface> CreateHTTPServer(int port, void* llm_model, void* llm_ctx, 
    std::mutex& llm_mutex, void* stt_ctx, std::mutex& stt_mutex) {
    return std::make_unique<HTTPServer>(port, llm_model, llm_ctx, llm_mutex, stt_ctx, stt_mutex);
}

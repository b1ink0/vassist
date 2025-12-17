// TTS handler - /v1/audio/speech
// Proxies to GPT-SoVITS Python server on port 9880
// All audio processing and caching handled in Python

#include "tts.h"
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <sstream>

using json = nlohmann::json;

std::string HandleTTS(const json& request) {
    try {
        // Validate input
        std::string text = request.value("input", "");
        if (text.empty()) {
            json error = {
                {"error", {
                    {"message", "Missing 'input' field"},
                    {"type", "invalid_request_error"},
                    {"code", "invalid_input"}
                }}
            };
            return error.dump();
        }
        
        // Create HTTP client for GPT-SoVITS Python server
        httplib::Client client("http://127.0.0.1:9880");
        client.set_connection_timeout(30);
        client.set_read_timeout(120);  // Longer timeout for TTS generation
        
        // Check if server is running
        auto health = client.Get("/health");
        if (!health || health->status != 200) {
            json error = {
                {"error", {
                    {"message", "TTS service unavailable. GPT-SoVITS server not running."},
                    {"type", "service_unavailable"},
                    {"code", "tts_service_down"}
                }}
            };
            return error.dump();
        }
        
        // Forward entire request as JSON to Python
        // Python will handle:
        // - Base64 audio decoding
        // - Reference audio caching
        // - Multiple references
        // - Actual TTS inference
        
        httplib::Headers headers = {
            {"Content-Type", "application/json"}
        };
        
        auto res = client.Post("/v1/audio/speech", headers, request.dump(), "application/json");
        
        if (!res) {
            json error = {
                {"error", {
                    {"message", "Failed to connect to TTS service"},
                    {"type", "service_error"},
                    {"code", "connection_failed"}
                }}
            };
            return error.dump();
        }
        
        if (res->status != 200) {
            json error = {
                {"error", {
                    {"message", "TTS generation failed: " + res->body},
                    {"type", "tts_error"},
                    {"code", "generation_failed"}
                }}
            };
            return error.dump();
        }
        
        // Return response from Python as-is
        return res->body;
        
    } catch (const std::exception& e) {
        json error = {
            {"error", {
                {"message", std::string("TTS error: ") + e.what()},
                {"type", "internal_error"},
                {"code", "tts_exception"}
            }}
        };
        return error.dump();
    }
}

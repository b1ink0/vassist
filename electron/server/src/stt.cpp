#include "whisper.h"
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <mutex>
#include <cstring>

using json = nlohmann::json;

// Decode audio to PCM format (simplified - assumes WAV input)
std::vector<float> DecodeAudioToPCM(const std::vector<uint8_t>& audio_data) {
    std::vector<float> pcm;
    
    // Skip WAV header (44 bytes)
    if (audio_data.size() < 44) {
        return pcm;
    }

    // Convert 16-bit PCM to float
    const int16_t* samples = reinterpret_cast<const int16_t*>(audio_data.data() + 44);
    size_t num_samples = (audio_data.size() - 44) / 2;

    pcm.reserve(num_samples);
    for (size_t i = 0; i < num_samples; i++) {
        pcm.push_back(static_cast<float>(samples[i]) / 32768.0f);
    }

    return pcm;
}

std::string HandleTranscription(const std::vector<uint8_t>& audio_data, void* ctx_ptr, std::mutex& stt_mutex) {
    std::lock_guard<std::mutex> lock(stt_mutex);
    
    whisper_context* ctx = static_cast<whisper_context*>(ctx_ptr);

    try {
        // Decode audio
        std::vector<float> pcm = DecodeAudioToPCM(audio_data);
        if (pcm.empty()) {
            throw std::runtime_error("Failed to decode audio");
        }

        // Setup whisper params
        whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.print_progress = false;
        params.print_special = false;
        params.print_realtime = false;
        params.print_timestamps = false;
        params.translate = false;
        params.language = "en";
        params.n_threads = 4;
        params.offset_ms = 0;
        params.duration_ms = 0;

        // Run transcription
        if (whisper_full(ctx, params, pcm.data(), pcm.size()) != 0) {
            throw std::runtime_error("whisper_full failed");
        }

        // Extract text
        std::string transcription;
        int n_segments = whisper_full_n_segments(ctx);
        
        for (int i = 0; i < n_segments; i++) {
            const char* text = whisper_full_get_segment_text(ctx, i);
            if (text) {
                transcription += text;
            }
        }

        // Trim whitespace
        auto start = transcription.find_first_not_of(" \t\n\r");
        auto end = transcription.find_last_not_of(" \t\n\r");
        if (start != std::string::npos && end != std::string::npos) {
            transcription = transcription.substr(start, end - start + 1);
        }

        // Build OpenAI-compatible response
        json response = {
            {"text", transcription}
        };

        return response.dump();

    } catch (const std::exception& e) {
        json error = {
            {"error", {
                {"message", e.what()},
                {"type", "server_error"},
                {"code", "internal_error"}
            }}
        };
        return error.dump();
    }
}

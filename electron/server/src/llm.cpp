#include "llama.h"
#include "common.h"
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <mutex>
#include <functional>
#include <ctime>

using json = nlohmann::json;

void HandleChatCompletion(const json& request, void* model_ptr, void* ctx_ptr, std::mutex& llm_mutex,
                          std::function<void(const std::string&, bool)> callback) {
    std::lock_guard<std::mutex> lock(llm_mutex);
    
    llama_model* model = static_cast<llama_model*>(model_ptr);
    llama_context* ctx = static_cast<llama_context*>(ctx_ptr);

    try {
        // Extract request params
        auto messages = request["messages"];
        int max_tokens = request.value("max_tokens", 2048);
        float temperature = request.value("temperature", 0.7f);
        float top_p = request.value("top_p", 0.9f);
        bool stream = request.value("stream", false);
        std::string model_name = request.value("model", "llama");
        std::string completion_id = "chatcmpl-" + std::to_string(std::time(nullptr));
        long created = std::time(nullptr);

        // Build prompt from messages (ChatML format)
        std::string prompt;
        for (const auto& msg : messages) {
            std::string role = msg["role"];
            std::string content = msg["content"];
            
            if (role == "system") {
                prompt += "<|im_start|>system\n" + content + "<|im_end|>\n";
            } else if (role == "user") {
                prompt += "<|im_start|>user\n" + content + "<|im_end|>\n";
            } else if (role == "assistant") {
                prompt += "<|im_start|>assistant\n" + content + "<|im_end|>\n";
            }
        }
        prompt += "<|im_start|>assistant\n";

        // Tokenize - new API
        const llama_vocab* vocab = llama_model_get_vocab(model);
        std::vector<llama_token> tokens;
        tokens.resize(prompt.size() + 16);
        int n_tokens = llama_tokenize(vocab, prompt.c_str(), prompt.size(), tokens.data(), tokens.size(), true, false);
        if (n_tokens < 0) {
            tokens.resize(-n_tokens);
            n_tokens = llama_tokenize(vocab, prompt.c_str(), prompt.size(), tokens.data(), tokens.size(), true, false);
        }
        tokens.resize(n_tokens);
        
        // Evaluate prompt
        llama_batch batch = llama_batch_get_one(tokens.data(), tokens.size());

        if (llama_decode(ctx, batch) != 0) {
            throw std::runtime_error("llama_decode failed");
        }

        // Setup sampling - simplified for new API
        auto sparams = llama_sampler_chain_default_params();
        llama_sampler* smpl = llama_sampler_chain_init(sparams);
        llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
        llama_sampler_chain_add(smpl, llama_sampler_init_top_p(top_p, 1));
        llama_sampler_chain_add(smpl, llama_sampler_init_temp(temperature));
        llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

        // Send initial role chunk for streaming (OpenAI format)
        if (stream) {
            json role_chunk = {
                {"id", completion_id},
                {"object", "chat.completion.chunk"},
                {"created", created},
                {"model", model_name},
                {"system_fingerprint", "fp_local"},
                {"choices", json::array({
                    {
                        {"index", 0},
                        {"delta", {{"role", "assistant"}}},
                        {"logprobs", nullptr},
                        {"finish_reason", nullptr}
                    }
                })}
            };
            callback("data: " + role_chunk.dump() + "\n\n", false);
        }

        // Generate tokens
        std::string generated_text;
        int n_decode = 0;

        while (n_decode < max_tokens) {
            llama_token new_token_id = llama_sampler_sample(smpl, ctx, -1);
            
            // Check for EOS
            if (llama_token_is_eog(vocab, new_token_id)) {
                break;
            }

            // Convert token to text
            char piece_buf[256];
            int n_chars = llama_token_to_piece(vocab, new_token_id, piece_buf, sizeof(piece_buf), 0, false);
            std::string piece(piece_buf, n_chars);
            generated_text += piece;

            // Send streaming chunk if enabled
            if (stream) {
                json chunk = {
                    {"id", completion_id},
                    {"object", "chat.completion.chunk"},
                    {"created", created},
                    {"model", model_name},
                    {"system_fingerprint", "fp_local"},
                    {"choices", json::array({
                        {
                            {"index", 0},
                            {"delta", {{"content", piece}}},
                            {"logprobs", nullptr},
                            {"finish_reason", nullptr}
                        }
                    })}
                };
                callback("data: " + chunk.dump() + "\n\n", false);
            }

            // Decode next token
            llama_batch next_batch = llama_batch_get_one(&new_token_id, 1);
            if (llama_decode(ctx, next_batch) != 0) {
                break;
            }

            n_decode++;
        }

        llama_sampler_free(smpl);

        if (stream) {
            // Send final chunk with finish_reason
            json final_chunk = {
                {"id", completion_id},
                {"object", "chat.completion.chunk"},
                {"created", created},
                {"model", model_name},
                {"system_fingerprint", "fp_local"},
                {"choices", json::array({
                    {
                        {"index", 0},
                        {"delta", json::object()},
                        {"logprobs", nullptr},
                        {"finish_reason", "stop"}
                    }
                })}
            };
            callback("data: " + final_chunk.dump() + "\n\n", false);
            callback("data: [DONE]\n\n", true);
        } else {
            // Build non-streaming response
            json response = {
                {"id", completion_id},
                {"object", "chat.completion"},
                {"created", created},
                {"model", model_name},
                {"system_fingerprint", "fp_local"},
                {"choices", json::array({
                    {
                        {"index", 0},
                        {"message", {
                            {"role", "assistant"},
                            {"content", generated_text}
                        }},
                        {"logprobs", nullptr},
                        {"finish_reason", "stop"}
                    }
                })},
                {"usage", {
                    {"prompt_tokens", (int)tokens.size()},
                    {"completion_tokens", n_decode},
                    {"total_tokens", (int)tokens.size() + n_decode}
                }}
            };
            callback(response.dump(), true);
        }

    } catch (const std::exception& e) {
        json error = {
            {"error", {
                {"message", e.what()},
                {"type", "server_error"},
                {"code", "internal_error"}
            }}
        };
        callback(error.dump(), true);
    }
}

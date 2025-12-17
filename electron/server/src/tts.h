#pragma once
#include <string>
#include <nlohmann/json.hpp>

std::string HandleTTS(const nlohmann::json& request);

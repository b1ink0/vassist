package com.vassist.app.ai

/** Counts from the runtime, including multimodal prompt tokens. */
data class LLMUsage(
    val contextTokens: Int,
    val contextSize: Int? = null,
    val inputTokens: Int? = null,
    val outputTokens: Int? = null
)

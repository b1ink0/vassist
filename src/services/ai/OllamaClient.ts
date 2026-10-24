import type { LLMParameters } from "../../config/llmParameters";

/** Native Ollama options, adapted to the chat stream consumed by AIService. */
export default class OllamaClient {
  constructor(
    private readonly endpoint: string,
    private readonly config: LLMParameters,
    private readonly apiKey?: string,
  ) {}

  chat = {
    completions: {
      create: async (
        body: Record<string, any>,
        options: { signal?: AbortSignal } = {},
      ) => {
        const parameters: Record<string, unknown> = {};
        for (const key of [
          "temperature",
          "top_p",
          "top_k",
          "min_p",
          "typical_p",
          "repeat_penalty",
          "repeat_last_n",
          "presence_penalty",
          "frequency_penalty",
          "seed",
          "stop",
        ]) {
          if (body[key] !== undefined) parameters[key] = body[key];
        }
        parameters.num_predict = body.max_tokens ?? body.max_completion_tokens;
        if (this.config.contextSize && this.config.contextSize > 0)
          parameters.num_ctx = this.config.contextSize;
        const messages = body.messages.map((message: Record<string, any>) => {
          if (typeof message.content === "string") return message;
          const content: string[] = [];
          const images: string[] = [];
          for (const part of message.content ?? []) {
            if (part.type === "text") content.push(part.text);
            else if (part.type === "image_url") {
              const match = /^data:[^;]+;base64,(.*)$/s.exec(
                part.image_url.url,
              );
              if (!match)
                throw new Error(
                  "Ollama native image input requires a base64 data URL",
                );
              images.push(match[1]!);
            } else
              throw new Error(
                `Ollama native does not support ${part.type} input`,
              );
          }
          return {
            ...message,
            content: content.join("\n"),
            ...(images.length ? { images } : {}),
          };
        });
        const root = this.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
        const response = await fetch(`${root}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: body.model,
            messages,
            stream: true,
            options: parameters,
            think: body.enable_thinking ?? false,
          }),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (!response.ok)
          throw new Error(
            `Ollama request failed (${response.status}): ${await response.text()}`,
          );
        if (!response.body)
          throw new Error("Ollama returned no response stream");
        return this.readStream(response.body);
      },
    },
  };

  private async *readStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const chunk = (line: string) => {
      const item = JSON.parse(line);
      if (item.error) throw new Error(item.error);
      return {
        choices: [
          {
            delta: {
              content: item.message?.content ?? "",
              reasoning_content: item.message?.thinking ?? "",
            },
            finish_reason: item.done ? (item.done_reason ?? "stop") : null,
          },
        ],
      };
    };
    try {
      while (true) {
        const next = await reader.read();
        pending += decoder.decode(next.value, { stream: !next.done });
        let end: number;
        while ((end = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, end).trim();
          pending = pending.slice(end + 1);
          if (line) yield chunk(line);
        }
        if (next.done) break;
      }
      if (pending.trim()) yield chunk(pending);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

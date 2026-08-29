/**
 * Shared factory for pointing AI+ feature services (summarizer, rewriter,
 * writer, language detector, translator) at local OpenAI-compatible
 * gateways: desktop-local, android-local, and generic openai-compatible.
 *
 * These gateways all expose the standard /v1/chat/completions API, so the
 * feature services can talk to them with the plain OpenAI client — no
 * per-provider branches needed in every service.
 */

import OpenAI from "openai";

const LOCAL_PROVIDERS = new Set([
  "desktop-local",
  "android-local",
  "openai-compatible",
]);

const DEFAULT_ENDPOINTS: Record<string, string> = {
  "desktop-local": "http://127.0.0.1:11438",
  "android-local": "http://127.0.0.1:8765",
  "openai-compatible": "http://localhost:8000",
};

export interface LocalOpenAiClient {
  client: OpenAI;
  model: string;
}

/**
 * Returns an OpenAI client + model for local providers, or null when the
 * provider is not a local/OpenAI-compatible one (caller keeps its own
 * branch handling).
 */
export function createLocalOpenAiClient(
  provider: string,
  config: Record<string, any>,
): LocalOpenAiClient | null {
  if (!LOCAL_PROVIDERS.has(provider)) return null;

  const section: {
    endpoint?: string;
    model?: string;
  } = config[provider] || {};

  let endpoint = section.endpoint || DEFAULT_ENDPOINTS[provider] || "";
  if (!endpoint) return null;
  if (!endpoint.endsWith("/v1")) {
    endpoint = endpoint.replace(/\/$/, "") + "/v1";
  }

  return {
    client: new OpenAI({
      apiKey: "local",
      baseURL: endpoint,
      dangerouslyAllowBrowser: true,
    }),
    model: section.model || "local",
  };
}

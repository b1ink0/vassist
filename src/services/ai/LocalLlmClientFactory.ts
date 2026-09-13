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
import {
  DEFAULT_ENDPOINTS,
  normalizeOpenAIBaseUrl,
} from "../../config/serviceEndpoints";

const LOCAL_PROVIDERS = new Set([
  "desktop-local",
  "android-local",
  "openai-compatible",
]);

const LOCAL_ENDPOINTS: Record<string, string> = {
  "desktop-local": DEFAULT_ENDPOINTS.desktopLocal,
  "android-local": DEFAULT_ENDPOINTS.androidLocal,
  "openai-compatible": DEFAULT_ENDPOINTS.openaiCompatible,
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

  const endpoint = section.endpoint || LOCAL_ENDPOINTS[provider] || "";
  if (!endpoint) return null;

  return {
    client: new OpenAI({
      apiKey: "local",
      baseURL: normalizeOpenAIBaseUrl(endpoint, endpoint),
      dangerouslyAllowBrowser: true,
    }),
    model: section.model || "local",
  };
}

/**
 * Shared endpoint and port defaults for the desktop gateway and its private
 * workers.  Keep these values in code (rather than a second config file): the
 * persisted source of truth is the IndexedDB AI configuration.
 */

export const LOOPBACK_HOST = "127.0.0.1";
export const LOOPBACK_URL = `http://${LOOPBACK_HOST}`;
export const DESKTOP_BIND_HOST = "0.0.0.0";

export const EXTERNAL_SERVICE_ENDPOINTS = {
  openaiApi: "https://api.openai.com",
  huggingFace: "https://huggingface.co",
  ollamaCatalog: "https://ollama.com",
  ollamaRegistry: "https://registry.ollama.ai",
  npmRegistry: "https://registry.npmjs.org",
  github: "https://github.com",
} as const;

export const SERVICE_ROUTES = {
  root: "/",
  health: "/health",
  docs: "/docs",
  openai: {
    base: "/v1",
    models: "/v1/models",
    chatCompletions: "/v1/chat/completions",
    audioTranscriptions: "/v1/audio/transcriptions",
    audioSpeech: "/v1/audio/speech",
  },
  llamaServer: {
    models: "/models",
    loadModel: "/models/load",
    unloadModel: "/models/unload",
  },
  whisperCppInference: "/inference",
  supertonicSpeech: "/v1/tts",
  gptSovitsSpeech: "/tts",
} as const;

export const DEFAULT_SERVICE_PORTS: {
  server: number;
  llamaServer: number;
  gptSovits: number;
  fasterWhisper: number;
  supertonic: number;
  whisperCpp: number;
} = {
  server: 11438,
  llamaServer: 11439,
  gptSovits: 9880,
  fasterWhisper: 9881,
  supertonic: 9882,
  whisperCpp: 9883,
} as const;

export type DesktopInternalPorts = {
  llamaServer: number;
  gptSovits: number;
  fasterWhisper: number;
  supertonic: number;
  whisperCpp: number;
};

export type PartialDesktopInternalPorts =
  | Partial<DesktopInternalPorts>
  | null
  | undefined;

export const DEFAULT_ENDPOINTS: {
  androidLocal: string;
  desktopLocal: string;
  ollama: string;
  openaiCompatible: string;
  openaiApi: string;
} = {
  androidLocal: `http://${LOOPBACK_HOST}:8765`,
  desktopLocal: `${LOOPBACK_URL}:${DEFAULT_SERVICE_PORTS.server}`,
  ollama: "http://localhost:11434",
  openaiCompatible: "http://localhost:8000",
  openaiApi: EXTERNAL_SERVICE_ENDPOINTS.openaiApi,
} as const;

export function buildHttpEndpoint(
  host: string = LOOPBACK_HOST,
  port: number = DEFAULT_SERVICE_PORTS.server,
  protocol: "http" | "https" = "http",
): string {
  const normalizedHost =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${protocol}://${normalizedHost}:${port}`;
}

export function joinEndpointPath(endpoint: string, route: string): string {
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${normalizedEndpoint}${normalizedRoute}`;
}

export function normalizeOpenAIBaseUrl(
  endpoint: string | null | undefined,
  fallback: string,
): string {
  const resolved = (endpoint || fallback).trim() || fallback;
  const normalized = resolved.replace(/\/+$/, "");
  return normalized.endsWith(SERVICE_ROUTES.openai.base)
    ? normalized
    : joinEndpointPath(normalized, SERVICE_ROUTES.openai.base);
}

export function joinOpenAIBasePath(
  openAIBaseUrl: string,
  absoluteRoute: string,
): string {
  const routeWithoutVersion = absoluteRoute.startsWith(
    `${SERVICE_ROUTES.openai.base}/`,
  )
    ? absoluteRoute.slice(SERVICE_ROUTES.openai.base.length)
    : absoluteRoute;
  return joinEndpointPath(openAIBaseUrl, routeWithoutVersion);
}

export function isValidPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

export function resolveDesktopInternalPorts(
  ports: PartialDesktopInternalPorts,
): DesktopInternalPorts {
  return {
    llamaServer: isValidPort(ports?.llamaServer)
      ? ports.llamaServer
      : DEFAULT_SERVICE_PORTS.llamaServer,
    gptSovits: isValidPort(ports?.gptSovits)
      ? ports.gptSovits
      : DEFAULT_SERVICE_PORTS.gptSovits,
    fasterWhisper: isValidPort(ports?.fasterWhisper)
      ? ports.fasterWhisper
      : DEFAULT_SERVICE_PORTS.fasterWhisper,
    supertonic: isValidPort(ports?.supertonic)
      ? ports.supertonic
      : DEFAULT_SERVICE_PORTS.supertonic,
    whisperCpp: isValidPort(ports?.whisperCpp)
      ? ports.whisperCpp
      : DEFAULT_SERVICE_PORTS.whisperCpp,
  };
}

export function validateDesktopServicePorts(
  serverPort: unknown,
  internalPorts: PartialDesktopInternalPorts,
): string[] {
  const errors: string[] = [];
  if (!isValidPort(serverPort)) {
    errors.push(
      "Desktop Local Shared Server Port must be an integer between 1 and 65535",
    );
  }

  const labels: Array<[string, unknown]> = [
    [
      "llama-server",
      internalPorts?.llamaServer ?? DEFAULT_SERVICE_PORTS.llamaServer,
    ],
    ["GPT-SoVITS", internalPorts?.gptSovits ?? DEFAULT_SERVICE_PORTS.gptSovits],
    [
      "faster-whisper",
      internalPorts?.fasterWhisper ?? DEFAULT_SERVICE_PORTS.fasterWhisper,
    ],
    [
      "Supertonic",
      internalPorts?.supertonic ?? DEFAULT_SERVICE_PORTS.supertonic,
    ],
    [
      "whisper.cpp",
      internalPorts?.whisperCpp ?? DEFAULT_SERVICE_PORTS.whisperCpp,
    ],
  ];
  for (const [label, value] of labels) {
    if (!isValidPort(value)) {
      errors.push(
        `Desktop ${label} port must be an integer between 1 and 65535`,
      );
    }
  }

  const configured: Array<[string, number]> = [
    ["Shared Server", serverPort as number],
  ];
  for (const [label, value] of labels) {
    if (isValidPort(value)) configured.push([label, value]);
  }
  const seen = new Map<number, string>();
  for (const [label, value] of configured) {
    const previous = seen.get(value);
    if (previous)
      errors.push(
        `Desktop port ${value} is used by both ${previous} and ${label}`,
      );
    else seen.set(value, label);
  }
  return errors;
}

export const endpointForPort = (port: number): string =>
  buildHttpEndpoint(LOOPBACK_HOST, port);

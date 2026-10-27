export type SystemOneState = string | Record<string, unknown> | unknown[];

export interface SystemOneChoiceQuestion {
  type: "choice";
  instructions: SystemOneState;
  criteria: Record<string, string | null>;
}

export interface SystemOneScoreQuestion {
  type: "score";
  instructions: SystemOneState;
  criteria: string[];
}

export interface SystemOneNoulQuestion {
  type: "noul";
  instructions: SystemOneState;
  criteria?: {
    true?: string;
    false?: string;
  };
}

export type SystemOneQuestion =
  | SystemOneChoiceQuestion
  | SystemOneScoreQuestion
  | SystemOneNoulQuestion;

export interface SystemOneRequest {
  model?: string;
  /** Internal local-gateway hint; removed before forwarding upstream. */
  customModelsPath?: string;
  state: SystemOneState;
  questions: Record<string, SystemOneQuestion>;
  images?: string[];
  files?: string[];
}

export interface SystemOneChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SystemOneScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SystemOneNoulAnswer {
  type: "noul";
  noul: number;
}

export type SystemOneAnswer =
  | SystemOneChoiceAnswer
  | SystemOneScoreAnswer
  | SystemOneNoulAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: 0;
  };
}

export interface DecisionModelInfo {
  id: string;
  object?: string;
  created?: number;
  ownedBy?: string;
  architecture?: {
    inputModalities: string[];
    outputModalities: string[];
  };
  raw: Record<string, unknown>;
}

export interface DecisionClientOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class DecisionApiError extends Error {
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "DecisionApiError";
    this.status = status;
    this.body = body;
  }
}

function normalizeEndpoint(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new DecisionApiError("Decision API endpoint is required");
  }

  if (normalized.endsWith("/v1/systemone")) {
    return normalized.slice(0, -"/systemone".length);
  }

  if (normalized.endsWith("/v1")) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function validateProbabilityMap(
  value: unknown,
  fieldName: string,
): Record<string, number> {
  if (!isRecord(value)) {
    throw new DecisionApiError(`Decision response has invalid ${fieldName}`);
  }

  const entries = Object.entries(value);
  const result: Record<string, number> = {};
  for (const [key, item] of entries) {
    if (
      typeof item !== "number" ||
      !Number.isFinite(item) ||
      item < 0 ||
      item > 1
    ) {
      throw new DecisionApiError(
        `Decision response has invalid ${fieldName}.${key}`,
      );
    }
    result[key] = item;
  }
  return result;
}

function validateResponse(payload: unknown): SystemOneResponse {
  if (!isRecord(payload) || !isRecord(payload.answers)) {
    throw new DecisionApiError("Decision API returned an invalid response");
  }

  const answers: Record<string, SystemOneAnswer> = {};
  for (const [key, rawAnswer] of Object.entries(payload.answers)) {
    if (!isRecord(rawAnswer) || typeof rawAnswer.type !== "string") {
      throw new DecisionApiError(
        `Decision response has invalid answer: ${key}`,
      );
    }

    if (
      rawAnswer.type === "choice" &&
      typeof rawAnswer.choice === "string" &&
      typeof rawAnswer.confidence === "number"
    ) {
      answers[key] = {
        type: "choice",
        choice: rawAnswer.choice,
        probabilities: validateProbabilityMap(
          rawAnswer.probabilities,
          `${key}.probabilities`,
        ),
        confidence: rawAnswer.confidence,
      };
      continue;
    }

    if (
      rawAnswer.type === "score" &&
      typeof rawAnswer.score === "number" &&
      typeof rawAnswer.confidence === "number" &&
      isRecord(rawAnswer.legend)
    ) {
      const legend: Record<string, string> = {};
      for (const [legendKey, legendValue] of Object.entries(rawAnswer.legend)) {
        if (typeof legendValue !== "string") {
          throw new DecisionApiError(
            `Decision response has invalid ${key}.legend`,
          );
        }
        legend[legendKey] = legendValue;
      }
      answers[key] = {
        type: "score",
        score: rawAnswer.score,
        legend,
        probabilities: validateProbabilityMap(
          rawAnswer.probabilities,
          `${key}.probabilities`,
        ),
        confidence: rawAnswer.confidence,
      };
      continue;
    }

    if (
      rawAnswer.type === "noul" &&
      typeof rawAnswer.noul === "number" &&
      rawAnswer.noul >= 0 &&
      rawAnswer.noul <= 1
    ) {
      answers[key] = { type: "noul", noul: rawAnswer.noul };
      continue;
    }

    throw new DecisionApiError(`Decision response has invalid answer: ${key}`);
  }

  const response: SystemOneResponse = {
    model: typeof payload.model === "string" ? payload.model : "",
    answers,
  };

  if (
    isRecord(payload.usage) &&
    typeof payload.usage.input_tokens === "number" &&
    typeof payload.usage.output_tokens === "number"
  ) {
    response.usage = {
      input_tokens: payload.usage.input_tokens,
      output_tokens: 0,
    };
  }

  return response;
}

export class DecisionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: DecisionClientOptions) {
    this.baseUrl = normalizeEndpoint(options.endpoint);
    this.apiKey = options.apiKey?.trim() ?? "";
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 1500, 250), 60000);
  }

  async probeModels(signal?: AbortSignal): Promise<DecisionModelInfo[]> {
    const request: RequestInit = { method: "GET" };
    if (signal) request.signal = signal;
    const payload = await this.requestJson("/models", request);
    const rawModels = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.data)
        ? payload.data
        : isRecord(payload) && Array.isArray(payload.models)
          ? payload.models
          : [];

    return rawModels.filter(isRecord).map((model) => {
      const result: DecisionModelInfo = {
        id: typeof model.id === "string" ? model.id : "",
        raw: model,
      };
      if (typeof model.object === "string") result.object = model.object;
      if (typeof model.created === "number") result.created = model.created;
      if (typeof model.owned_by === "string") result.ownedBy = model.owned_by;
      if (isRecord(model.architecture)) {
        result.architecture = {
          inputModalities: readStringArray(model.architecture.input_modalities),
          outputModalities: readStringArray(
            model.architecture.output_modalities,
          ),
        };
      }
      return result;
    });
  }

  async decide(
    request: SystemOneRequest,
    signal?: AbortSignal,
  ): Promise<SystemOneResponse> {
    const requestInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    };
    if (signal) requestInit.signal = signal;
    return validateResponse(await this.requestJson("/systemone", requestInit));
  }

  private async requestJson(
    route: string,
    init: RequestInit,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = init.signal;
    const abortExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortExternal, { once: true });

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.apiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }

    try {
      const response = await fetch(`${this.baseUrl}${route}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = text;
        }
      }

      if (!response.ok) {
        const detail =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : response.statusText || "Request failed";
        throw new DecisionApiError(
          `Decision API request failed (${response.status}): ${detail}`,
          response.status,
          payload,
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof DecisionApiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new DecisionApiError(
          externalSignal?.aborted
            ? "Decision API request was cancelled"
            : `Decision API request timed out after ${this.timeoutMs} ms`,
        );
      }
      throw new DecisionApiError(
        error instanceof Error ? error.message : "Decision API request failed",
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortExternal);
    }
  }
}

/** Actual usage from a completed request; excludes unsent draft text. */
export interface ContextUsage {
  provider: string;
  model: string;
  backendId?: string;
  usedTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  contextLimit?: number;
}
export function readContextUsage(value: unknown): ContextUsage | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as Partial<ContextUsage>;
  if (
    typeof item.provider !== "string" ||
    typeof item.model !== "string" ||
    !Number.isSafeInteger(item.usedTokens) ||
    (item.usedTokens ?? 0) <= 0
  )
    return;
  return {
    provider: item.provider,
    model: item.model,
    usedTokens: item.usedTokens!,
    ...(typeof item.inputTokens === "number" &&
    Number.isSafeInteger(item.inputTokens) &&
    item.inputTokens >= 0
      ? { inputTokens: item.inputTokens }
      : {}),
    ...(typeof item.outputTokens === "number" &&
    Number.isSafeInteger(item.outputTokens) &&
    item.outputTokens >= 0
      ? { outputTokens: item.outputTokens }
      : {}),
    ...(typeof item.backendId === "string"
      ? { backendId: item.backendId }
      : {}),
    ...(Number.isSafeInteger(item.contextLimit) && item.contextLimit! > 0
      ? { contextLimit: item.contextLimit }
      : {}),
  };
}

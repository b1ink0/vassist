import type * as React from "react";

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const setConfigValueAtPath = <T extends object>(
  config: T,
  path: string,
  value: unknown,
): T => {
  const updated = { ...(config as Record<string, unknown>) };
  const parts = path.split(".");
  let current: Record<string, unknown> = updated;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!key) {
      continue;
    }
    const nextValue = current[key];
    if (
      nextValue &&
      typeof nextValue === "object" &&
      !Array.isArray(nextValue)
    ) {
      current[key] = { ...(nextValue as Record<string, unknown>) };
    } else {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }

  return updated as T;
};

export const resolveSetStateAction = <T>(
  action: React.SetStateAction<T>,
  previous: T,
): T => {
  if (typeof action === "function") {
    return (action as (prevState: T) => T)(previous);
  }
  return action;
};

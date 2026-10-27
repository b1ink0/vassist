export type XrWireValue =
  | null
  | boolean
  | number
  | string
  | { type: "undefined" }
  | { type: "date"; value: string }
  | { type: "asset"; id: string; mime: string; format: "blob" | "buffer" }
  | { type: "array"; value: XrWireValue[] }
  | { type: "record"; value: Array<[string, XrWireValue]> };

export async function encodeXrValue(
  value: unknown,
  register: (blob: Blob) => Promise<string> | string,
  depth = 0,
): Promise<XrWireValue> {
  if (depth > 40) throw new Error("XR data is nested too deeply.");
  if (value === undefined) return { type: "undefined" };
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date)
    return { type: "date", value: value.toISOString() };
  if (value instanceof Error)
    return encodeXrValue(
      { name: value.name, message: value.message },
      register,
      depth + 1,
    );
  if (value instanceof Blob)
    return {
      type: "asset",
      id: await register(value),
      mime: value.type,
      format: "blob",
    };
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return {
      type: "asset",
      id: await register(new Blob([new Uint8Array(bytes)])),
      mime: "application/octet-stream",
      format: "buffer",
    };
  }
  if (Array.isArray(value))
    return {
      type: "array",
      value: await Promise.all(
        value.map((item) => encodeXrValue(item, register, depth + 1)),
      ),
    };
  if (typeof value === "object")
    return {
      type: "record",
      value: await Promise.all(
        Object.entries(value).map(
          async ([key, item]) =>
            [key, await encodeXrValue(item, register, depth + 1)] as [
              string,
              XrWireValue,
            ],
        ),
      ),
    };
  throw new Error("Unsupported XR data type.");
}

export async function decodeXrValue(
  value: XrWireValue,
  resolve: (id: string, mime: string) => Promise<Blob>,
  depth = 0,
): Promise<unknown> {
  if (depth > 40) throw new Error("XR data is nested too deeply.");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return value;
  if (!value || typeof value !== "object") throw new Error("Invalid XR data.");
  switch (value.type) {
    case "undefined":
      return undefined;
    case "date": {
      const date = new Date(value.value);
      if (!Number.isFinite(date.getTime())) throw new Error("Invalid XR date.");
      return date;
    }
    case "asset": {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value.id))
        throw new Error("Invalid XR asset.");
      const blob = await resolve(value.id, value.mime);
      return value.format === "buffer" ? blob.arrayBuffer() : blob;
    }
    case "array":
      return Promise.all(
        value.value.map((item) => decodeXrValue(item, resolve, depth + 1)),
      );
    case "record": {
      const result: Record<string, unknown> = {};
      for (const [key, item] of value.value) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("Invalid XR property.");
        result[key] = await decodeXrValue(item, resolve, depth + 1);
      }
      return result;
    }
    default:
      throw new Error("Unsupported XR data encoding.");
  }
}

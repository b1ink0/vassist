import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { DefaultAIConfig } from "../src/config/aiConfig.ts";
import {
  buildLLMRequestParameters,
  getLLMProfileParameters,
  restoreLLMProfileParameters,
  validateLLMParameters,
  LLM_RUNTIME_REQUEST_KEYS,
} from "../src/config/llmParameters.ts";
import { LocalAIServer } from "../electron/server/http-server.ts";
import AIService from "../src/services/ai/AIService.ts";
import OllamaClient from "../src/services/ai/OllamaClient.ts";

const selected = {
  ...DefaultAIConfig["desktop-local"],
  model: "saved-model.gguf",
  contextSize: 1500000,
  maxTokens: 1000000,
  temperature: 0,
  gpuLayers: 0,
  threads: 0,
  topP: 0.8,
  topK: 64,
  seed: 0,
  llmEngine: "llama-server",
  llmBackend: "cpu",
  batchSize: 2048,
  ubatchSize: 512,
  cacheTypeK: "q8_0",
  cacheTypeV: "f16",
  flashAttention: "on",
};
assert.deepEqual(validateLLMParameters(selected as any), []);
const saved = JSON.parse(
  JSON.stringify({
    id: "saved",
    model: selected.model,
    ...getLLMProfileParameters(selected),
  }),
);
const restored = restoreLLMProfileParameters(
  saved,
  DefaultAIConfig["desktop-local"],
);
assert.equal(saved.model, selected.model);
assert.equal(restored.contextSize, 1500000);
assert.equal(restored.temperature, 0);
assert.equal(restored.gpuLayers, 0);
assert.equal(restored.llmEngine, "llama-server");
assert.equal(
  restoreLLMProfileParameters(
    { temperature: 0.2 },
    DefaultAIConfig["desktop-local"],
  ).topP,
  undefined,
);

const runtime = AIService._buildProviderRuntime("desktop-local", selected);
const request = AIService._prepareRequestBody(
  { provider: "desktop-local", config: runtime.config } as any,
  [],
);
assert.equal(request.llmContextSize, 1500000);
assert.equal(request.llmGpuLayers, 0);
assert.equal(request.llmBackend, "cpu");
assert.equal(request.llmFlashAttention, "on");
assert.equal(DefaultAIConfig["desktop-local"].flashAttention, "auto");
for (const flashAttention of ["auto", "on", "off"] as const) {
  assert.equal(
    buildLLMRequestParameters("desktop-local", { flashAttention })
      .llmFlashAttention,
    flashAttention,
  );
}
assert.equal(request.temperature, 0);
assert.equal(request.max_tokens, 1000000);
const remote = buildLLMRequestParameters("openai", selected as any);
assert.equal(remote.max_completion_tokens, 1000000);
assert.equal(remote.top_p, 0.8);
assert.equal(remote.top_k, undefined);
assert.equal(remote.llmContextSize, undefined);
assert.equal(
  buildLLMRequestParameters("openai", {
    ...selected,
    samplingEnabled: false,
  } as any).temperature,
  undefined,
);
assert.equal(
  AIService._resolveRemoteModelListUrl({
    provider: "openai",
    endpoint: "http://localhost:9999/v1",
  }),
  "http://localhost:9999/v1/models",
);

let launch: any;
let forwarded: any;
let completed = 0;
const server = new LocalAIServer({
  llamaProxy: {
    async ensureForRequest(options) {
      launch = options;
      return "active-model";
    },
    markRequestComplete() {
      completed++;
    },
    getEndpoint() {
      return "http://127.0.0.1:1";
    },
  },
});
server.config.llm.modelPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_url: unknown, options: RequestInit) => {
  forwarded = JSON.parse(options.body as string);
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
    { headers: { "Content-Type": "application/json" } },
  );
}) as typeof fetch;
try {
  let status = 0;
  await server.handleLlamaServerCompletion(
    {
      body: { ...request, model: "package.json", stream: false },
      on() {},
    } as any,
    {
      headersSent: false,
      writableEnded: false,
      status(value: number) {
        status = value;
        return this;
      },
      setHeader() {},
      write() {},
      end() {},
      json() {},
    } as any,
  );
  assert.equal(status, 200);
  assert.equal(launch.ctxSize, 1500000);
  assert.equal(launch.gpuLayers, 0);
  assert.equal(launch.threads, 0);
  assert.equal(launch.batchSize, 2048);
  assert.equal(launch.cacheTypeK, "q8_0");
  assert.equal(launch.flashAttention, "on");
  assert.equal(forwarded.temperature, 0);
  assert.equal(forwarded.model, "active-model");
  for (const key of LLM_RUNTIME_REQUEST_KEYS)
    assert.equal(forwarded[key], undefined);
  assert.equal(completed, 1);
  let missingStatus = 0;
  await server.handleLlamaServerCompletion(
    { body: { model: "missing-fixture.gguf" }, on() {} } as any,
    {
      status(value: number) {
        missingStatus = value;
        return this;
      },
      json() {},
    } as any,
  );
  assert.equal(missingStatus, 400);
  assert.equal(
    server.getNodeSamplingOptions({
      temperature: 0,
      top_p: 0.8,
      top_k: 64,
      min_p: 0.1,
      seed: 0,
      repeat_penalty: 1.2,
    }).seed,
    0,
  );
  assert.deepEqual(
    server.getNodeSamplingOptions({
      llmSamplingEnabled: false,
      temperature: 1,
      seed: 12,
    }),
    {},
  );

  let nativeBody: any;
  globalThis.fetch = (async (_url: unknown, options: RequestInit) => {
    nativeBody = JSON.parse(options.body as string);
    return new Response(
      '{"message":{"thinking":"reason","content":"hello"},"done":false}\n{"message":{"content":" world"},"done":true}',
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  }) as typeof fetch;
  const ollama = new OllamaClient("http://localhost:11434/v1", {
    contextSize: 1500000,
  });
  const stream = await ollama.chat.completions.create({
    model: "fixture",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0,
    max_tokens: 1000000,
  });
  let text = "";
  for await (const item of stream) text += item.choices[0]!.delta.content;
  assert.equal(text, "hello world");
  assert.equal(nativeBody.options.num_ctx, 1500000);
  assert.equal(nativeBody.options.num_predict, 1000000);
  assert.equal(nativeBody.options.temperature, 0);
  console.log(
    "PASS: large contexts/output, zero values, profile restoration, OpenAI payloads, native launch hints, Node sampling, and native Ollama streaming.",
  );
} finally {
  globalThis.fetch = originalFetch;
}

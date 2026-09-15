import { test } from "node:test";
import assert from "node:assert/strict";
import { GenerationBudget } from "../server/budget.ts";
import type { BudgetStorage } from "../server/budget.ts";
import { handle } from "../server/worker.ts";
import { demoBlueprint, localSceneResult, validateGenerationResult } from "../src/lib/blueprint.ts";

function state() {
  const data = new Map<string, number>();
  let previous: Promise<unknown> = Promise.resolve();
  const storage: BudgetStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async put(key, value) { data.set(key, value); },
    transaction<T>(callback: (storage: BudgetStorage) => Promise<T>) {
      const current = previous.then(() => callback(storage));
      previous = current.catch(() => undefined);
      return current;
    },
  };
  return { storage };
}
const reserve = () => new Request("https://budget.internal/reserve", { method: "POST" });
const access = "preview-fixture-with-at-least-32-characters";
const future = () => new Date(Date.now() + 60_000).toISOString();
const blueprintRequest = (token = access) => new Request("https://worldifact.test/api/blueprint", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-WORLDIFACT-Access": token },
  body: JSON.stringify({ prompt: "A small village", mode: "live" }),
});
function configured() {
  const env = {
    OPENAI_API_KEY: "test-only-provider-key",
    ENABLE_PAID_GENERATION: "true",
    GENERATION_ACCESS_TOKEN: access,
    GENERATION_REQUEST_LIMIT: "2",
    GENERATION_EXPIRES_AT: future(),
    GENERATION_LIMITER: { async limit() { return { success: true }; } },
  };
  const budget = new GenerationBudget(state(), env);
  return { ...env, GENERATION_BUDGET: {
    idFromName: (name: string) => name,
    get: () => budget,
  } };
}

test("global reservations are capped under concurrent clients and survive instance recreation", async () => {
  const saved = state();
  const env = { GENERATION_REQUEST_LIMIT: "3", GENERATION_EXPIRES_AT: future() };
  const budget = new GenerationBudget(saved, env);
  const responses = await Promise.all(Array.from({ length: 12 }, () => budget.fetch(reserve())));
  assert.equal(responses.filter((r) => r.status === 200).length, 3);
  assert.equal(responses.filter((r) => r.status === 429).length, 9);
  assert.equal((await new GenerationBudget(saved, env).fetch(reserve())).status, 429);
});

test("quota rejects expired or invalid configuration and storage failures", async () => {
  for (const settings of [
    { GENERATION_REQUEST_LIMIT: "0", GENERATION_EXPIRES_AT: future() },
    { GENERATION_REQUEST_LIMIT: "2", GENERATION_EXPIRES_AT: "2020-01-01T00:00:00Z" },
    { GENERATION_REQUEST_LIMIT: "NaN", GENERATION_EXPIRES_AT: future() },
  ]) assert.equal((await new GenerationBudget(state(), settings).fetch(reserve())).status, 429);
  const broken = state();
  broken.storage.transaction = async () => { throw new Error("private storage detail"); };
  const response = await new GenerationBudget(broken, {
    GENERATION_REQUEST_LIMIT: "2", GENERATION_EXPIRES_AT: future(),
  }).fetch(reserve());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private"));
});

test("invalid access and missing budget do not consume allowance or call the provider", async () => {
  const env = configured();
  let calls = 0;
  const provider = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  assert.equal((await handle(blueprintRequest("wrong"), env, provider)).status, 401);
  assert.equal((await handle(blueprintRequest(), { ...env, GENERATION_BUDGET: undefined }, provider)).status, 503);
  assert.equal((await handle(blueprintRequest(), { ...env, GENERATION_EXPIRES_AT: "2020-01-01" }, provider)).status, 503);
  assert.equal(calls, 0);
  const budget = env.GENERATION_BUDGET.get();
  assert.equal((await budget.fetch(reserve())).status, 200);
  assert.equal((await budget.fetch(reserve())).status, 200);
});

test("provider failures still consume the global ceiling; no automatic retries", async () => {
  const env = configured();
  let calls = 0;
  const provider = (async () => { calls++; return new Response("upstream-secret", { status: 500 }); }) as typeof fetch;
  assert.equal((await handle(blueprintRequest(), env, provider)).status, 502);
  assert.equal((await handle(blueprintRequest(), env, provider)).status, 502);
  const blocked = await handle(blueprintRequest(), env, provider);
  assert.equal(blocked.status, 429);
  assert.equal(calls, 2);
  assert.ok(!(await blocked.text()).includes("upstream-secret"));
});

test("health distinguishes readiness from evidence of a successful generation", async () => {
  const response = await handle(new Request("https://worldifact.test/api/health"), configured());
  const health = await response.json() as { mode: string; generationReady: boolean; accessRequired: boolean };
  assert.equal(health.mode, "READY");
  assert.equal(health.generationReady, true);
  assert.equal(health.accessRequired, true);
});

test("generation details identify exact content and usage without persisting access secrets", async () => {
  const blueprint = demoBlueprint("moon village");
  const provider = (async () => Response.json({
    status: "completed", model: "gpt-6-astra", id: "resp_fixture_123",
    usage: { input_tokens: 25, output_tokens: 50, total_tokens: 75 },
    output: [{ content: [{ type: "output_text", text: JSON.stringify(blueprint) }] }],
  })) as typeof fetch;
  const response = await handle(blueprintRequest(), configured(), provider);
  assert.equal(response.status, 200);
  const data = validateGenerationResult(await response.json());
  assert.equal(data.evidence?.totalTokens, 75);
  assert.equal(data.evidence?.providerResponseId, "resp_fixture_123");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(blueprint)));
  assert.equal(data.evidence?.blueprintSha256, Buffer.from(hash).toString("hex"));
  assert.ok(!JSON.stringify(data).includes(access));
  assert.ok(!JSON.stringify(data).includes("test-only-provider-key"));
  assert.throws(() => validateGenerationResult({ ...localSceneResult(blueprint), evidence: data.evidence }));
  assert.throws(() => validateGenerationResult({ ...data, evidence: { ...data.evidence, totalTokens: 99 } }));
});

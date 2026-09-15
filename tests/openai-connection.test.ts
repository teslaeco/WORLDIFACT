import test from "node:test";
import assert from "node:assert/strict";
import { checkDemoConfig, connectOpenAI, readSecretInputs, uploadWorkerSecrets, verifyModelAccess } from "../scripts/connect-openai.mjs";

const key = "sk-test-" + "a".repeat(40);
const access = "b".repeat(40);
const validConfig = () => ({ name: "worldifact", vars: {
  OPENAI_MODEL: "gpt-6-astra", ENABLE_PAID_GENERATION: "false",
  GENERATION_REQUEST_LIMIT: "0", GENERATION_EXPIRES_AT: "",
} });
const ok = () => Response.json({ id: "gpt-6-astra", object: "model" });

test("automatic connection is BLOCKED without a key and makes no external call", async () => {
  const unexpected = () => { throw new Error("Unexpected external call"); };
  const result = await connectOpenAI({}, { fetcher: unexpected, upload: unexpected });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.reason, /OPENAI_API_KEY/);
});

test("automation refuses paid or altered production configuration", () => {
  checkDemoConfig(validConfig());
  for (const [field, value] of [["ENABLE_PAID_GENERATION", "true"], ["GENERATION_REQUEST_LIMIT", "2"],
    ["GENERATION_EXPIRES_AT", "2026-10-01T00:00:00Z"], ["OPENAI_MODEL", "other-model"]]) {
    const config = validConfig();
    config.vars[field] = value;
    assert.throws(() => checkDemoConfig(config), /DEMO configuration/);
  }
  assert.throws(() => checkDemoConfig(null), /DEMO configuration/);
});

test("secret validation never includes rejected values or enables billing", () => {
  assert.deepEqual(readSecretInputs({ OPENAI_API_KEY: key }), { OPENAI_API_KEY: key });
  assert.deepEqual(readSecretInputs({ OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access }),
    { OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access });
  for (const invalid of [`Bearer ${key}`, `${key}\n`, `"${key}"`]) {
    assert.throws(() => readSecretInputs({ OPENAI_API_KEY: invalid }), (error) => {
      assert.ok(!error.message.includes(key)); return true;
    });
  }
  assert.throws(() => readSecretInputs({ OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: "short" }), /32-256/);
});

test("model access uses only a fixed read endpoint and refuses redirects", async () => {
  let calls = 0;
  await verifyModelAccess(key, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/models/gpt-6-astra");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return ok();
  });
  assert.equal(calls, 1);
});

test("failed model access never uploads secrets or exposes provider error text", async () => {
  let uploads = 0;
  const upload = () => { uploads++; };
  for (const fetcher of [async () => { throw new Error(key); },
    async () => new Response(key, { status: 401 }),
    async () => new Response(key, { status: 200 }),
    async () => Response.json({ id: "other", object: "model", secret: key })]) {
    await assert.rejects(connectOpenAI({ OPENAI_API_KEY: key }, { fetcher, upload }), (error) => {
      assert.ok(!error.message.includes(key)); return true;
    });
  }
  assert.equal(uploads, 0);
});

test("Worker synchronization uses stdin, not shell arguments, files or child secret environment", () => {
  const payload = { OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access };
  let calls = 0;
  uploadWorkerSecrets(payload, (command, args, options) => {
    calls++;
    assert.equal(command, process.execPath);
    assert.deepEqual(args.slice(1), ["secret", "bulk", "--name", "worldifact"]);
    assert.ok(!args.join(" ").includes(key));
    assert.equal(options.shell, false);
    assert.deepEqual(JSON.parse(options.input), payload);
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(options.env.GENERATION_ACCESS_TOKEN, undefined);
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, "test-cloudflare-token");
    return { status: 0 };
  }, { OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access, CLOUDFLARE_API_TOKEN: "test-cloudflare-token" });
  assert.equal(calls, 1);
  assert.throws(() => uploadWorkerSecrets(payload, () => ({ status: 1, stderr: key })), (error) => {
    assert.ok(!error.message.includes(key)); return true;
  });
});

test("successful simulated provisioning is CONFIGURED, never LIVE evidence", async () => {
  let uploaded;
  const result = await connectOpenAI({ OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access },
    { fetcher: async () => ok(), upload: (payload) => { uploaded = payload; } });
  assert.deepEqual(uploaded, { OPENAI_API_KEY: key, GENERATION_ACCESS_TOKEN: access });
  assert.equal(result.status, "CONFIGURED");
  assert.match(result.reason, /not LIVE/);
  assert.ok(!JSON.stringify(result).includes(key));
});

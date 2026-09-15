import { spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gpt-6-astra";
const MODEL_URL = `https://api.openai.com/v1/models/${MODEL}`;
const fail = (message) => { throw new Error(message); };

export function checkDemoConfig(config) {
  if (config?.name !== "worldifact" || config?.vars?.OPENAI_MODEL !== MODEL ||
      config.vars.ENABLE_PAID_GENERATION !== "false" ||
      config.vars.GENERATION_REQUEST_LIMIT !== "0" || config.vars.GENERATION_EXPIRES_AT !== "") {
    fail("Automatic releases require the reviewed WORLDIFACT DEMO configuration. Paid activation needs a separate approved release.");
  }
}

export function readSecretInputs(env) {
  const key = env.OPENAI_API_KEY || "";
  const access = env.GENERATION_ACCESS_TOKEN || "";
  if (!key) return null;
  if (!/^sk-[A-Za-z0-9_-]{20,2045}$/.test(key)) {
    fail("OPENAI_API_KEY has an invalid format. Use the secure production environment secret; its value is never logged.");
  }
  if (access && (access.length < 32 || access.length > 256 || /\s/.test(access))) {
    fail("GENERATION_ACCESS_TOKEN must contain 32-256 non-whitespace characters.");
  }
  return { OPENAI_API_KEY: key, ...(access ? { GENERATION_ACCESS_TOKEN: access } : {}) };
}

export async function verifyModelAccess(key, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(MODEL_URL, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
  } catch {
    fail("OpenAI model-access verification could not connect. No generation request was sent.");
  }
  if (!response.ok) {
    // Do not print the provider body, headers or arbitrary exception text.
    fail(`OpenAI model-access verification failed (HTTP ${response.status}). Check the key, project and model permission in the secure dashboard.`);
  }
  let model;
  try { model = await response.json(); }
  catch { fail("OpenAI returned invalid model metadata. No generation request was sent."); }
  if (model?.id !== MODEL || model?.object !== "model") {
    fail("OpenAI did not verify the approved Astra model. No generation request was sent.");
  }
}

export function uploadWorkerSecrets(payload, runner = spawnSync, env = process.env) {
  // Secrets go through stdin, never shell interpolation, argv, files or logs.
  const childEnv = { ...env };
  delete childEnv.OPENAI_API_KEY;
  delete childEnv.GENERATION_ACCESS_TOKEN;
  const result = runner(process.execPath, [
    resolve("node_modules/wrangler/bin/wrangler.js"), "secret", "bulk", "--name", "worldifact",
  ], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 60_000,
    shell: false, stdio: ["pipe", "pipe", "pipe"], env: childEnv,
  });
  if (result.error || result.status !== 0) {
    fail("Cloudflare secret synchronization failed. Check the production token permissions. Secret values and command output were suppressed.");
  }
}

export async function connectOpenAI(env, { fetcher = fetch, upload = uploadWorkerSecrets } = {}) {
  const payload = readSecretInputs(env);
  if (!payload) return { status: "BLOCKED", reason: "OPENAI_API_KEY is not configured in the GitHub production environment.", model: MODEL };
  await verifyModelAccess(payload.OPENAI_API_KEY, fetcher);
  upload(payload);
  return { status: "CONFIGURED", reason: "Model access verified and Worker secrets synchronized. This is not LIVE generation evidence.", model: MODEL };
}

async function main() {
  // The current JSONC config contains standard JSON. Fail closed on parse/config changes.
  checkDemoConfig(JSON.parse(await readFile("wrangler.jsonc", "utf8")));
  const result = await connectOpenAI(process.env);
  console.log(`OpenAI connection: ${result.status}. ${result.reason}`);
  if (result.status === "BLOCKED") console.log("::warning::OPENAI_API_KEY is missing. DEMO deployment continues; LIVE remains blocked.");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## OpenAI connection: ${result.status}\n\n${result.reason}\n\n` +
    "No paid generation was requested. Connecting a key does not enable paid generation. " +
    "A real LIVE pilot still needs an approved spending ceiling, expiry and preview access code.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("::error::OpenAI setup failed. Check the secure secret values, model permissions and DEMO configuration. No paid generation was requested; sensitive error details were suppressed.");
    process.exitCode = 1;
  });
}

import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gpt-6-astra";
const MODEL_URL = `https://api.openai.com/v1/models/${MODEL}`;
function fail(message: string): never { throw new Error(message); }
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

type SecretInputs = { OPENAI_API_KEY?: string; GENERATION_ACCESS_TOKEN?: string };
export type WorkerSecrets = { OPENAI_API_KEY: string; GENERATION_ACCESS_TOKEN?: string };
type ModelFetch = (url: string, options: RequestInit) => Promise<Response>;
type SecretRunner = (command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding & { input: string; env: NodeJS.ProcessEnv }) => { status: number | null; error?: Error; stderr?: string };
type ConnectionResult = { status: "BLOCKED" | "CONFIGURED"; reason: string; model: typeof MODEL };

export function checkDemoConfig(config: unknown) {
  if (!isRecord(config) || config.name !== "worldifact" || !isRecord(config.vars) ||
      config.vars.OPENAI_MODEL !== MODEL || config.vars.ENABLE_PAID_GENERATION !== "false" ||
      config.vars.PUBLIC_PILOT !== "false" || config.vars.ENABLE_ORACLE_JOBS !== "false" ||
      config.vars.GENERATION_REQUEST_LIMIT !== "0" || config.vars.GENERATION_EXPIRES_AT !== "") {
    fail("Automatic releases require the reviewed WORLDIFACT DEMO configuration. Paid activation needs a separate approved release.");
  }
}
export function readSecretInputs(env: SecretInputs): WorkerSecrets | null {
  const key = env.OPENAI_API_KEY || "", access = env.GENERATION_ACCESS_TOKEN || "";
  if (!key) return null;
  if (!/^sk-[A-Za-z0-9_-]{20,2045}$/.test(key) || /\s/.test(key)) fail("OPENAI_API_KEY has an invalid format. Use the secure production environment secret; its value is never logged.");
  if (access && (access.length < 32 || access.length > 256 || /\s/.test(access))) fail("GENERATION_ACCESS_TOKEN must contain 32-256 non-whitespace characters.");
  return { OPENAI_API_KEY: key, ...(access ? { GENERATION_ACCESS_TOKEN: access } : {}) };
}
export async function verifyModelAccess(key: string, fetcher: ModelFetch = fetch) {
  let response: Response;
  try { response = await fetcher(MODEL_URL, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }); }
  catch { fail("OpenAI model-access verification could not connect. No generation request was sent."); }
  if (!response.ok) fail(`OpenAI model-access verification failed (HTTP ${response.status}). Check the key, project and model permission in the secure dashboard.`);
  let model: unknown; try { model = await response.json(); } catch { fail("OpenAI returned invalid model metadata. No generation request was sent."); }
  if (!isRecord(model) || model.id !== MODEL || model.object !== "model") fail("OpenAI did not verify the approved Astra model. No generation request was sent.");
}
export function uploadWorkerSecrets(payload: WorkerSecrets, runner: SecretRunner = spawnSync, env: NodeJS.ProcessEnv = process.env) {
  const childEnv = { ...env }; delete childEnv.OPENAI_API_KEY; delete childEnv.GENERATION_ACCESS_TOKEN;
  const result = runner(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "secret", "bulk", "--name", "worldifact"], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 60_000, shell: false, stdio: ["pipe", "pipe", "pipe"], env: childEnv,
  });
  if (result.error || result.status !== 0) fail("Cloudflare secret synchronization failed. Check the production token permissions. Secret values and command output were suppressed.");
}
export async function connectOpenAI(env: SecretInputs, { fetcher = fetch, upload = uploadWorkerSecrets }: { fetcher?: ModelFetch; upload?: (payload: WorkerSecrets) => void } = {}): Promise<ConnectionResult> {
  const payload = readSecretInputs(env);
  if (!payload) return { status: "BLOCKED", reason: "OPENAI_API_KEY is not configured in the GitHub production environment.", model: MODEL };
  await verifyModelAccess(payload.OPENAI_API_KEY, fetcher); upload(payload);
  return { status: "CONFIGURED", reason: "Model access verified and Worker secrets synchronized. This is not LIVE generation evidence.", model: MODEL };
}
async function main() {
  checkDemoConfig(JSON.parse(await readFile("wrangler.jsonc", "utf8")));
  const result = await connectOpenAI(process.env);
  console.log(`OpenAI connection: ${result.status}. ${result.reason}`);
  if (result.status === "BLOCKED") console.log("::warning::OPENAI_API_KEY is missing. DEMO deployment continues; LIVE remains blocked.");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## OpenAI connection: ${result.status}\n\n${result.reason}\n\nNo paid generation was requested. Connecting a key does not enable paid generation. A real LIVE pilot still needs an approved hard ceiling, expiry and reviewed public/preview access policy.\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("::error::OpenAI setup failed. Check secure secrets, model permissions and DEMO configuration. No paid generation was requested; sensitive error details were suppressed."); process.exitCode = 1; });
}

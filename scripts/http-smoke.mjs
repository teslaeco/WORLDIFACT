import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const child = spawn(process.execPath, ["server/dev.ts"], {
  env: { ...process.env, OPENAI_API_KEY: "", ENABLE_PAID_GENERATION: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("server startup timeout")),
      5000,
    );
    child.stdout.once("data", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code) reject(new Error(`server exited ${code}`));
    });
  });
  const health = await fetch("http://127.0.0.1:8787/api/health").then((r) =>
    r.json(),
  );
  assert.equal(health.mode, "DEMO");
  const response = await fetch("http://127.0.0.1:8787/api/blueprint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:8787",
    },
    body: JSON.stringify({
      prompt: "Create a red rover village",
      mode: "demo",
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "DEMO");
  assert.equal(
    body.blueprint.objects.find((o) => o.kind === "rover").color,
    "#e85e55",
  );
  const reject = await fetch("http://127.0.0.1:8787/api/blueprint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://other.test",
    },
    body: JSON.stringify({ prompt: "village", mode: "live" }),
  });
  assert.equal(reject.status, 403);
  console.log(
    "PASS: real local HTTP health, DEMO blueprint and origin rejection. No paid API call.",
  );
} finally {
  child.kill();
}

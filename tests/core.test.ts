import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Texture,
} from "three";
import {
  demoBlueprint,
  localSceneResult,
  parseBlueprintJson,
  validateBlueprint,
  validateGenerationResult,
} from "../src/lib/blueprint.ts";
import {
  estimateCost,
  OBSERVED_QUOTES,
  PRODUCTION_PROFILES,
} from "../src/lib/manufacturing.ts";
import { readArchive, saveArchive } from "../src/lib/archive.ts";
import { handle } from "../server/worker.ts";
import {
  createDecorativeTerrain,
  createWorldObject,
  disposeObject,
  updateWorldObject,
} from "../src/lib/worldGeometry.ts";
const PREVIEW_TOKEN = "test-only-preview-code-with-more-than-32-characters";
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://worldifact.test/api/blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-WORLDIFACT-Access": PREVIEW_TOKEN, ...headers },
    body: JSON.stringify(body),
  });
const live = {
  OPENAI_API_KEY: "test-key-not-real",
  ENABLE_PAID_GENERATION: "true",
  GENERATION_ACCESS_TOKEN: PREVIEW_TOKEN,
  GENERATION_REQUEST_LIMIT: "2",
  GENERATION_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  GENERATION_BUDGET: {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => Response.json({ allowed: true, remaining: 1 }) }),
  },
  GENERATION_LIMITER: {
    async limit() {
      return { success: true };
    },
  },
};
const ok = () =>
  new Response(
    JSON.stringify({
      status: "completed",
      model: "gpt-6-astra",
      id: "resp_test_stub",
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify(demoBlueprint("village")),
            },
          ],
        },
      ],
    }),
  );
const makeFetch = (fn: () => Response | Promise<Response>) =>
  fn as typeof fetch;

test("demo changes biome, population and requested color without claiming AI", () => {
  const a = demoBlueprint("village with red rover and forest");
  assert.equal(a.objects.length, 14);
  assert.equal(a.objects.find((o) => o.kind === "rover")?.color, "#e85e55");
  assert.equal(demoBlueprint("moon").biome, "lunar");
});
test("schema rejects unsupported objects, duplicate IDs, nonfinite dimensions and extra payload", () => {
  for (const mutate of [
    (v: any) => (v.objects[0].kind = "script"),
    (v: any) => (v.objects[1].id = v.objects[0].id),
    (v: any) => (v.objects[0].scale = Infinity),
    (v: any) => (v.secret = "x"),
    (v: any) => (v.objects[0].url = "https://untrusted.test"),
  ]) {
    const b = demoBlueprint();
    mutate(b);
    assert.throws(() => validateBlueprint(b));
  }
});
test("generation provenance cannot be forged in saved or server results", () => {
  const demo = localSceneResult(demoBlueprint());
  assert.deepEqual(validateGenerationResult(demo), demo);
  assert.throws(() =>
    validateGenerationResult({ ...demo, mode: "LIVE" }),
  );
  assert.throws(() =>
    validateGenerationResult({
      ...demo,
      mode: "LIVE",
      provenance: "GENERATED",
      model: "another-model",
    }),
  );
  assert.throws(() => validateGenerationResult({ ...demo, extra: true }));
});
test("portable blueprint import validates structure, size and preserves local provenance", () => {
  const blueprint = demoBlueprint("village");
  assert.deepEqual(parseBlueprintJson(JSON.stringify(blueprint)), blueprint);
  assert.throws(() => parseBlueprintJson('{"broken":true}'), /invalid/);
  assert.throws(() => parseBlueprintJson("x".repeat(100_001)), /too large/);
  const local = localSceneResult(blueprint);
  assert.equal(local.mode, "DEMO");
  assert.equal(local.provenance, "MOCK");
  assert.equal(local.model, null);
});
test("scene objects update in place without rebuilding the renderer", () => {
  const before = demoBlueprint().objects[0];
  const group = createWorldObject(before);
  const after = {
    ...before,
    name: "Moved workshop",
    x: 12,
    z: -14,
    scale: 1.6,
    rotation: 90,
    color: "#ff0000",
  };
  updateWorldObject(group, after);
  assert.equal(group.name, after.name);
  assert.equal(group.position.x, 12);
  assert.equal(group.position.z, -14);
  assert.equal(group.scale.x, 1.6);
  assert.ok(Math.abs(group.rotation.y - Math.PI / 2) < 1e-8);
  const colors: string[] = [];
  group.traverse((child: any) => {
    if (!child.material) return;
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material])
      if (material.name === "worldifact-object-color")
        colors.push(`#${material.color.getHexString()}`);
  });
  assert.deepEqual([...new Set(colors)], ["#ff0000"]);
  disposeObject(group);
});
test("decorative terrain batches repeated meshes for mobile GPU work", () => {
  const objects = demoBlueprint("forest").objects.filter((o) =>
    ["tree", "rock"].includes(o.kind),
  );
  const terrain = createDecorativeTerrain(objects);
  const instanceMeshes = terrain.children.filter(
    (child) => child instanceof InstancedMesh,
  );
  assert.ok(objects.length > 3);
  assert.equal(instanceMeshes.length, terrain.children.length);
  assert.ok(instanceMeshes.length <= 3);
  assert.ok(
    instanceMeshes.reduce((sum, mesh: any) => sum + mesh.count, 0) >
      objects.length,
  );
  disposeObject(terrain);
});
test("renderer cleanup disposes shared GPU resources exactly once", () => {
  const root = new Group();
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const meshMaterial = new MeshBasicMaterial({ map: texture });
  const spriteMaterial = new SpriteMaterial({ map: texture });
  root.add(new Mesh(geometry, meshMaterial), new Sprite(spriteMaterial));
  const disposed = { geometry: 0, texture: 0, mesh: 0, sprite: 0 };
  geometry.addEventListener("dispose", () => disposed.geometry++);
  texture.addEventListener("dispose", () => disposed.texture++);
  meshMaterial.addEventListener("dispose", () => disposed.mesh++);
  spriteMaterial.addEventListener("dispose", () => disposed.sprite++);
  disposeObject(root);
  assert.deepEqual(disposed, { geometry: 1, texture: 1, mesh: 1, sprite: 1 });
});
test("archive survives reload, rejects corruption and caps storage", () => {
  let raw = "";
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  for (let i = 0; i < 35; i++)
    saveArchive(
      {
        mode: "DEMO",
        provenance: "MOCK",
        blueprint: demoBlueprint(),
        requestId: "test",
        model: null,
        limitation: "mock",
      },
      storage,
    );
  assert.equal(readArchive(storage).length, 30);
  const valid = JSON.parse(raw)[0];
  const invalid = {
    ...valid,
    result: { ...valid.result, mode: "LIVE" },
  };
  raw = JSON.stringify([...Array(30).fill(invalid), valid]);
  assert.equal(readArchive(storage).length, 1);
  raw = "broken";
  assert.deepEqual(readArchive(storage), []);
});
test("size is cubic and fixed batch fees amortize, independent of supplier labels", () => {
  const b = {
    baseMassG: 40,
    baseSizeMm: 100,
    sizeMm: 100,
    quantity: 1,
    ratePerKg: 100,
    setup: 10,
    finishPerPart: 2,
    shipping: 8,
    wastePercent: 0,
  };
  assert.equal(estimateCost(b).total, 24);
  assert.equal(estimateCost({ ...b, sizeMm: 200 }).massG, 320);
  assert.equal(estimateCost({ ...b, quantity: 10 }).unit, 7.8);
  assert.throws(() => estimateCost({ ...b, sizeMm: 0 }));
});
test("production profiles distinguish observed prices from blocked quotes", () => {
  const observed = new Map(OBSERVED_QUOTES.map((q) => [q.process, q.usd]));
  for (const profile of PRODUCTION_PROFILES) {
    if (profile.observedUsd === null) {
      assert.equal(profile.quoteStatus, "UNKNOWN/BLOCKED");
      assert.equal(profile.supplier, "Sculpteo");
    } else {
      assert.equal(profile.quoteStatus, "OBSERVED");
      assert.equal(profile.observedUsd, observed.get(profile.process));
    }
  }
  assert.deepEqual(
    new Set(
      PRODUCTION_PROFILES.filter((p) => p.observedUsd !== null).map(
        (p) => p.process,
      ),
    ),
    new Set(OBSERVED_QUOTES.map((q) => q.process)),
  );
  const wjp = PRODUCTION_PROFILES.find((p) => p.process.includes("Full Color"));
  assert.match(wjp?.assemblyClearance ?? "", /UNKNOWN/);
  assert.match(
    PRODUCTION_PROFILES.find((p) => p.process.includes("Prototyping Resin"))
      ?.suitability ?? "",
    /Not recommended/,
  );
});
test("no configured key produces explicitly labelled DEMO without network", async () => {
  let calls = 0;
  const r = await handle(
    request({ prompt: "village", mode: "live" }),
    {},
    makeFetch(() => {
      calls++;
      return ok();
    }),
  );
  assert.equal(calls, 0);
  assert.equal(((await r.json()) as { mode: string }).mode, "DEMO");
});
test("a key alone never enables paid generation", async () => {
  const r = await handle(request({ prompt: "village", mode: "live" }), {
    OPENAI_API_KEY: "test",
  });
  assert.equal(((await r.json()) as { mode: string }).mode, "DEMO");
});
test("health never advertises LIVE for an unapproved model or missing limiter", async () => {
  for (const env of [
    {
      OPENAI_API_KEY: "test",
      ENABLE_PAID_GENERATION: "true",
      OPENAI_MODEL: "unreviewed-model",
      GENERATION_LIMITER: live.GENERATION_LIMITER,
    },
    {
      OPENAI_API_KEY: "test",
      ENABLE_PAID_GENERATION: "true",
    },
  ]) {
    const r = await handle(new Request("https://worldifact.test/api/health"), env);
    const value = (await r.json()) as {
      mode: string;
      generationReady: boolean;
    };
    assert.equal(value.mode, "DEMO");
    assert.equal(value.generationReady, false);
  }
});
test("cross-origin and malformed image requests rejected", async () => {
  assert.equal(
    (
      await handle(
        request(
          { prompt: "village", mode: "live" },
          { Origin: "https://evil.test" },
        ),
        live,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handle(
        request({
          prompt: "village",
          mode: "live",
          image: "data:image/png;base64,dGVzdA==",
        }),
        live,
      )
    ).status,
    400,
  );
});
test("oversized requests rejected before model call", async () => {
  assert.equal(
    (await handle(request({ prompt: "x".repeat(1_600_000), mode: "demo" })))
      .status,
    413,
  );
});
test("paid endpoint fails closed without limiter", async () => {
  assert.equal(
    (
      await handle(request({ prompt: "village", mode: "live" }), {
        OPENAI_API_KEY: "test",
        ENABLE_PAID_GENERATION: "true",
      })
    ).status,
    503,
  );
});
test("rate limit prevents provider call", async () => {
  let called = false;
  const r = await handle(
    request({ prompt: "village", mode: "live" }),
    {
      ...live,
      GENERATION_LIMITER: {
        async limit() {
          return { success: false };
        },
      },
    },
    makeFetch(() => {
      called = true;
      return ok();
    }),
  );
  assert.equal(r.status, 429);
  assert.equal(called, false);
});
test("live response uses strict Responses format, server-only auth and validates a simulated LIVE envelope", async () => {
  let body: any;
  const r = await handle(
    request({ prompt: "village", mode: "live" }),
    live,
    (async (url: any, init: any) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.match(init.headers.Authorization, /Bearer test-key/);
      body = JSON.parse(init.body);
      return ok();
    }) as typeof fetch,
  );
  const data = (await r.json()) as { mode: string; provenance: string };
  assert.equal(data.mode, "LIVE");
  assert.equal(data.provenance, "GENERATED");
  assert.equal(body.model, "gpt-6-astra");
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.ok(!JSON.stringify(data).includes("test-key"));
});
test("provider failure cannot leak key or masquerade as a new scene", async () => {
  const r = await handle(
    request({ prompt: "village", mode: "live" }),
    live,
    makeFetch(() => new Response("secret-provider-error", { status: 500 })),
  );
  assert.equal(r.status, 502);
  const v = await r.text();
  assert.ok(!v.includes("secret-provider"));
  assert.ok(!v.includes("blueprint"));
});
test("incomplete and invalid model results rejected", async () => {
  for (const data of [
    { status: "incomplete" },
    {
      status: "completed",
      output: [{ content: [{ type: "output_text", text: '{"broken":true}' }] }],
    },
  ]) {
    const r = await handle(
      request({ prompt: "village", mode: "live" }),
      live,
      makeFetch(() => new Response(JSON.stringify(data))),
    );
    assert.equal(r.status, 502);
  }
});
test("refusal and timeout return bounded safe errors", async () => {
  const r = await handle(
    request({ prompt: "village", mode: "live" }),
    live,
    makeFetch(
      () =>
        new Response(
          JSON.stringify({
            status: "completed",
            model: "gpt-6-astra",
            output: [{ content: [{ type: "refusal" }] }],
          }),
        ),
    ),
  );
  assert.equal(r.status, 422);
  const timeout = await handle(
    request({ prompt: "village", mode: "live" }),
    live,
    makeFetch(() => {
      throw new DOMException("secret", "TimeoutError");
    }),
  );
  assert.match(await timeout.text(), /timed out/);
  assert.equal(timeout.status, 502);
});
test("unknown API routes and methods remain JSON errors", async () => {
  assert.equal(
    (await handle(new Request("https://worldifact.test/api/nope"))).status,
    404,
  );
  assert.equal(
    (await handle(new Request("https://worldifact.test/api/blueprint"))).status,
    405,
  );
});

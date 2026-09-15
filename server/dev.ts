import { createServer } from "node:http";
import { handle } from "./worker.ts";
const windows = new Map<string, { count: number; until: number }>();
createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 1_500_000) {
        res.writeHead(413);
        res.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const h = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) h.set(k, Array.isArray(v) ? v.join(",") : v);
    // Vite preserves the public origin. Forward only through the local dev proxy.
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: h,
      body: ["GET", "HEAD"].includes(req.method || "GET")
        ? undefined
        : Buffer.concat(chunks),
    });
    const response = await handle(request, {
      // This lightweight adapter is DEMO-only. Use dev:worker for the actual
      // Cloudflare bindings and persistent global quota after cost approval.
      ENABLE_PAID_GENERATION: "false",
      GENERATION_LIMITER: {
        async limit({ key }) {
          const now = Date.now();
          const w = windows.get(key);
          if (!w || w.until < now) {
            windows.set(key, { count: 1, until: now + 60000 });
            return { success: true };
          }
          w.count++;
          return { success: w.count <= 3 };
        },
      },
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Local service error");
  }
}).listen(8787, "127.0.0.1", () =>
  console.log(
    "WORLDIFACT local API on 127.0.0.1:8787. DEMO only; no paid provider calls.",
  ),
);

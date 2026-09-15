export interface BudgetEnv {
  GENERATION_REQUEST_LIMIT?: string;
  GENERATION_EXPIRES_AT?: string;
}
export interface BudgetStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: number): Promise<void>;
  transaction<T>(callback: (storage: BudgetStorage) => Promise<T>): Promise<T>;
}
export interface BudgetNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export function budgetSettings(env: BudgetEnv, now = Date.now()) {
  const limit = Number(env.GENERATION_REQUEST_LIMIT);
  const expiresAt = Date.parse(env.GENERATION_EXPIRES_AT || "");
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 10_000 &&
    Number.isFinite(expiresAt) && expiresAt > now
    ? { limit, expiresAt }
    : null;
}

// One named Durable Object serializes reservations across all clients/locations.
// Attempts are never refunded: a timeout can still have incurred provider cost.
// The counter persists across restarts, UTC days and deployments. Raising the
// absolute ceiling is an operator action; this class exposes no reset endpoint.
export class GenerationBudget {
  private storage: BudgetStorage;
  private env: BudgetEnv;
  constructor(state: { storage: BudgetStorage }, env: BudgetEnv) {
    this.storage = state.storage;
    this.env = env;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/reserve")
      return Response.json({ allowed: false }, { status: 404 });
    try {
      const result = await this.storage.transaction(async (storage) => {
        const settings = budgetSettings(this.env);
        if (!settings) return { allowed: false, reason: "disabled" };
        const used = (await storage.get<number>("reserved-attempts")) ?? 0;
        if (!Number.isSafeInteger(used) || used < 0)
          throw new Error("Invalid quota state");
        if (used >= settings.limit)
          return { allowed: false, reason: "exhausted" };
        await storage.put("reserved-attempts", used + 1);
        return { allowed: true, remaining: settings.limit - used - 1 };
      });
      return Response.json(result, {
        status: result.allowed ? 200 : 429,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ allowed: false }, { status: 503 });
    }
  }
}

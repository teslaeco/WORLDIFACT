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
  const expiresAt = Date.parse(env.GENERATION_EXPIRES_AT || '');
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 10_000 && Number.isFinite(expiresAt) && expiresAt > now
    ? { limit, expiresAt } : null;
}

// One named object retains the original cumulative counter across deployments.
// No reset/refund endpoint exists. A failed upstream call may still cost money.
export class GenerationBudget {
  private storage: BudgetStorage;
  private env: BudgetEnv;
  constructor(state: { storage: BudgetStorage }, env: BudgetEnv) {
    this.storage = state.storage;
    this.env = env;
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    if (request.method === 'GET' && path === '/status') {
      try {
        const used = (await this.storage.get<number>('reserved-attempts')) ?? 0;
        if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid allowance state');
        const settings = budgetSettings(this.env);
        const limit = Number(this.env.GENERATION_REQUEST_LIMIT);
        const validLimit = Number.isSafeInteger(limit) && limit >= 0 && limit <= 10_000 ? limit : 0;
        return reply({ used, limit: validLimit, remaining: settings ? Math.max(0, settings.limit - used) : 0,
          enabled: !!settings, expiresAt: settings ? new Date(settings.expiresAt).toISOString() : null });
      } catch { return reply({ error: 'Allowance unavailable' }, 503); }
    }
    if (request.method !== 'POST' || !['/reserve', '/reserve-studio'].includes(path)) return reply({ allowed: false }, 404);
    let jobId: string | null = null;
    if (path === '/reserve-studio') {
      try {
        const text = await request.text();
        if (text.length > 100) throw new Error('Invalid intent');
        const input = JSON.parse(text);
        if (!input || Object.keys(input).length !== 1 || typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.id)) throw new Error('Invalid intent');
        jobId = input.id;
      } catch { return reply({ allowed: false, reason: 'invalid' }, 400); }
    }
    try {
      const result = await this.storage.transaction(async storage => {
        // Check the receipt first, even when writes have since expired. A retry
        // must recover the old job rather than receive another paid reservation.
        if (jobId && await storage.get<number>(`studio-submitted:${jobId}`)) return { allowed: false, reason: 'already-submitted' };
        const settings = budgetSettings(this.env);
        if (!settings) return { allowed: false, reason: 'disabled' };
        const used = (await storage.get<number>('reserved-attempts')) ?? 0;
        if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid allowance state');
        if (used >= settings.limit) return { allowed: false, reason: 'exhausted' };
        await storage.put('reserved-attempts', used + 1);
        if (jobId) await storage.put(`studio-submitted:${jobId}`, 1);
        return { allowed: true, remaining: settings.limit - used - 1 };
      });
      return reply(result, result.allowed ? 200 : result.reason === 'already-submitted' ? 409 : 429);
    } catch { return reply({ allowed: false }, 503); }
  }
}

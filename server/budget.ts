import { historicalBudgetBoundary, historicalInternalPath } from './historicalDataBoundary.ts';

export interface BudgetEnv {
  GENERATION_REQUEST_LIMIT?: string;
  GENERATION_EXPIRES_AT?: string;
  ENABLE_APPROVED_FAST_TEST?: string;
  /** One-time seed backed by already-verified revenue; applied once in Durable Object storage. */
  FREE_SOL_SEED_JOBS?: string;
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
export type BudgetSettings =
  | { unlimited: true; limit: null; expiresAt: null }
  | { unlimited: false; limit: number; expiresAt: number };

export const APPROVED_FAST_TEST = 'fast-test-20260917-usd5';
export const FAST_TEST_END = Date.parse('2026-09-18T07:00:00Z');
const TRIAL_KEY = 'approved-fast-test-20260917-expires';

export function budgetSettings(env: BudgetEnv, now = Date.now()): BudgetSettings | null {
  if (env.GENERATION_REQUEST_LIMIT === 'unlimited' && (env.GENERATION_EXPIRES_AT ?? '') === '') {
    return { unlimited: true, limit: null, expiresAt: null };
  }
  const limit = Number(env.GENERATION_REQUEST_LIMIT);
  const expiresAt = Date.parse(env.GENERATION_EXPIRES_AT || '');
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 10_000 && Number.isFinite(expiresAt) && expiresAt > now
    ? { unlimited: false, limit, expiresAt } : null;
}
export function approvedFastSettings(env: BudgetEnv, until: unknown, now = Date.now()) {
  return env.ENABLE_APPROVED_FAST_TEST === 'true' && typeof until === 'number' && Number.isSafeInteger(until) && until > now && until <= FAST_TEST_END
    ? { unlimited: false as const, limit: 7, expiresAt: until } : null;
}
// Original counter and submitted IDs survive all releases. No reset or refund.
// In ongoing LIVE mode the counter is telemetry/idempotency evidence, not a cumulative customer quota.
export class GenerationBudget {
  private storage: BudgetStorage;
  private env: BudgetEnv;
  constructor(state: { storage: BudgetStorage }, env: BudgetEnv) { this.storage = historicalBudgetBoundary(state.storage); this.env = env; }
  async fetch(request: Request): Promise<Response> {
    const path = historicalInternalPath(request, ['/status']);
    const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    if (path === null) return reply({ allowed: false, error: 'Allowance version unavailable' }, 503);
    if (request.method === 'GET' && path === '/status') {
      try {
        const used = (await this.storage.get<number>('reserved-attempts')) ?? 0;
        if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid allowance state');
        const trial = approvedFastSettings(this.env, await this.storage.get<number>(TRIAL_KEY));
        const settings = trial || budgetSettings(this.env);
        if (settings?.unlimited) {
          return reply({ used, limit: null, remaining: null, enabled: true, expiresAt: null, unlimited: true, fastOnly: false });
        }
        const configured = Number(this.env.GENERATION_REQUEST_LIMIT);
        const limit = trial ? 7 : Number.isSafeInteger(configured) && configured >= 0 && configured <= 10_000 ? configured : 0;
        return reply({ used, limit, remaining: settings ? Math.max(0, settings.limit - used) : 0,
          enabled: !!settings, expiresAt: settings ? new Date(settings.expiresAt).toISOString() : null, fastOnly: !!trial });
      } catch { return reply({ error: 'Allowance unavailable' }, 503); }
    }
    const promoSeed = () => {
      const value = Number(this.env.FREE_SOL_SEED_JOBS ?? '0');
      return Number.isSafeInteger(value) && value >= 0 && value <= 10_000 ? value : 0;
    };
    const ensurePromoSeed = async (storage: BudgetStorage) => {
      if (await storage.get<number>('promo-seed-applied')) return;
      const seed = promoSeed();
      if (seed) await storage.put('promo-funded-jobs', ((await storage.get<number>('promo-funded-jobs')) ?? 0) + seed);
      await storage.put('promo-seed-applied', 1);
    };
    if (request.method === 'GET' && path === '/promo-status') {
      try {
        const result = await this.storage.transaction(async storage => {
          await ensurePromoSeed(storage);
          const funded = (await storage.get<number>('promo-funded-jobs')) ?? 0;
          const revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0;
          const used = (await storage.get<number>('promo-used-jobs')) ?? 0;
          if (![funded, revoked, used].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid promo state');
          const effective = Math.max(0, funded - revoked);
          return { funded, revoked, used, remaining: Math.max(0, effective - used) };
        });
        return reply(result);
      } catch { return reply({ error: 'Promo allowance unavailable' }, 503); }
    }
    if (request.method === 'POST' && path === '/promo-fund') {
      try {
        const text = await request.text();
        if (text.length > 512) throw new Error('Invalid promo funding');
        const input = JSON.parse(text) as { id?: unknown; jobs?: unknown };
        if (!input || typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{3,200}$/.test(input.id) ||
            !Number.isSafeInteger(input.jobs) || Number(input.jobs) < 1 || Number(input.jobs) > 10_000) throw new Error('Invalid promo funding');
        const result = await this.storage.transaction(async storage => {
          await ensurePromoSeed(storage);
          const markerKey = `promo-funded:${input.id}`;
          if (await storage.get<number>(markerKey)) {
            const funded = (await storage.get<number>('promo-funded-jobs')) ?? 0, revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0, used = (await storage.get<number>('promo-used-jobs')) ?? 0;
            return { funded: false, repeated: true, remaining: Math.max(0, Math.max(0, funded - revoked) - used) };
          }
          const funded = (await storage.get<number>('promo-funded-jobs')) ?? 0;
          const next = funded + Number(input.jobs);
          if (!Number.isSafeInteger(next) || next > 1_000_000) throw new Error('Promo funding overflow');
          await storage.put('promo-funded-jobs', next);
          await storage.put(markerKey, 1);
          const revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0, used = (await storage.get<number>('promo-used-jobs')) ?? 0;
          return { funded: true, repeated: false, remaining: Math.max(0, Math.max(0, next - revoked) - used) };
        });
        return reply(result);
      } catch { return reply({ funded: false }, 400); }
    }
    if (request.method === 'POST' && path === '/promo-revoke') {
      try {
        const text = await request.text();
        if (text.length > 512) throw new Error('Invalid promo revocation');
        const input = JSON.parse(text) as { id?: unknown; jobs?: unknown };
        if (!input || typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{3,200}$/.test(input.id) ||
            !Number.isSafeInteger(input.jobs) || Number(input.jobs) < 1 || Number(input.jobs) > 10_000) throw new Error('Invalid promo revocation');
        const result = await this.storage.transaction(async storage => {
          await ensurePromoSeed(storage);
          const markerKey = `promo-revoked:${input.id}`;
          if (await storage.get<number>(markerKey)) return { revoked: false, repeated: true };
          const revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0;
          const next = revoked + Number(input.jobs);
          if (!Number.isSafeInteger(next) || next > 1_000_000) throw new Error('Promo revocation overflow');
          await storage.put('promo-revoked-jobs', next);
          await storage.put(markerKey, 1);
          return { revoked: true, repeated: false };
        });
        return reply(result);
      } catch { return reply({ revoked: false }, 400); }
    }
    if (request.method === 'POST' && path === '/promo-reserve') {
      try {
        const text = await request.text();
        if (text.length > 256) throw new Error('Invalid promo reservation');
        const input = JSON.parse(text) as { id?: unknown };
        if (!input || typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id)) throw new Error('Invalid promo reservation');
        const result = await this.storage.transaction(async storage => {
          await ensurePromoSeed(storage);
          const markerKey = `promo-job:${input.id}`;
          if (await storage.get<number>(markerKey)) {
            const funded = (await storage.get<number>('promo-funded-jobs')) ?? 0, revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0, used = (await storage.get<number>('promo-used-jobs')) ?? 0;
            return { allowed: true, repeated: true, remaining: Math.max(0, Math.max(0, funded - revoked) - used) };
          }
          const funded = (await storage.get<number>('promo-funded-jobs')) ?? 0;
          const revoked = (await storage.get<number>('promo-revoked-jobs')) ?? 0;
          const used = (await storage.get<number>('promo-used-jobs')) ?? 0;
          const effective = Math.max(0, funded - revoked);
          if (![funded, revoked, used].every(value => Number.isSafeInteger(value) && value >= 0) || used >= effective) return { allowed: false, repeated: false, remaining: 0 };
          await storage.put('promo-used-jobs', used + 1);
          await storage.put(markerKey, 1);
          return { allowed: true, repeated: false, remaining: effective - used - 1 };
        });
        return reply(result, result.allowed ? 200 : 429);
      } catch { return reply({ allowed: false }, 400); }
    }

    // This is an INTERNAL Durable Object route. The public Worker separately
    // authenticates the installer and confirms the installed monetary guard.
    if (request.method === 'POST' && path === '/activate-approved-fast') {
      try {
        if (await request.text() !== APPROVED_FAST_TEST || this.env.ENABLE_APPROVED_FAST_TEST !== 'true' || Date.now() >= FAST_TEST_END)
          return reply({ activated: false }, 403);
        const result = await this.storage.transaction(async storage => {
          const existing = await storage.get<number>(TRIAL_KEY);
          if (existing !== undefined) return { activated: !!approvedFastSettings(this.env, existing), expiresAt: existing, repeated: true };
          // Consent adds ONE to the recorded six, never a fresh pool of seven.
          const used = await storage.get<number>('reserved-attempts');
          if (used !== 6) return { activated: false, reason: 'unexpected-counter' };
          const expiresAt = Math.min(Date.now() + 90 * 60_000, FAST_TEST_END);
          await storage.put(TRIAL_KEY, expiresAt);
          return { activated: true, expiresAt, repeated: false };
        });
        return reply(result, result.activated ? 200 : 409);
      } catch { return reply({ activated: false }, 503); }
    }
    if (request.method !== 'POST' || !['/reserve', '/reserve-studio'].includes(path)) return reply({ allowed: false }, 404);
    let jobId: string | null = null, profile: string | null = null;
    if (path === '/reserve-studio') {
      try {
        const text = await request.text();
        if (text.length > 160) throw new Error('Invalid intent');
        const input = JSON.parse(text);
        if (!input || !Object.keys(input).every(k => ['id', 'profile'].includes(k)) || typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.id)) throw new Error('Invalid intent');
        if (input.profile !== undefined && input.profile !== 'fast-draft-v1') throw new Error('Invalid profile');
        jobId = input.id; profile = input.profile ?? null;
      } catch { return reply({ allowed: false, reason: 'invalid' }, 400); }
    }
    try {
      const result = await this.storage.transaction(async storage => {
        if (jobId && await storage.get<number>(`studio-submitted:${jobId}`)) return { allowed: false, reason: 'already-submitted' };
        const trial = approvedFastSettings(this.env, await storage.get<number>(TRIAL_KEY));
        const settings = trial && jobId && profile === 'fast-draft-v1' ? trial : budgetSettings(this.env);
        if (!settings) return { allowed: false, reason: 'disabled' };
        const used = (await storage.get<number>('reserved-attempts')) ?? 0;
        if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid allowance state');
        if (!settings.unlimited && used >= settings.limit) return { allowed: false, reason: 'exhausted' };
        await storage.put('reserved-attempts', used + 1);
        if (jobId) await storage.put(`studio-submitted:${jobId}`, 1);
        return { allowed: true, remaining: settings.unlimited ? null : settings.limit - used - 1, unlimited: settings.unlimited };
      });
      return reply(result, result.allowed ? 200 : result.reason === 'already-submitted' ? 409 : 429);
    } catch { return reply({ allowed: false }, 503); }
  }
}

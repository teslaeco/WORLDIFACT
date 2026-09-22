import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBillingSecrets, uploadBillingSecrets, type BillingSecrets } from './connect-billing.ts';
import { CREDIT_PACK, STRIPE_API_VERSION } from '../server/billing.ts';

const origin = 'https://worldifact.xodobrox.workers.dev';
const webhookUrl = `${origin}/api/billing/webhook`;
const setupVersion = 'worldifact-stripe-v1';
const maximumResponseBytes = 256_000;
const replayWindowSeconds = 23 * 60 * 60;
const events = [
  'invoice.paid', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'checkout.session.completed',
  'checkout.session.async_payment_succeeded', 'checkout.session.expired',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated',
] as const;
const offers = [
  { kind: 'subscription', productId: 'prod_WORLDIFACTMembership1500V1', lookupKey: 'worldifact_membership_1500_usd_2999_month_v1', name: 'WORLDIFACT Membership — 1500 credits' },
  { kind: 'topup', productId: 'prod_WORLDIFACTTopup1500V1', lookupKey: 'worldifact_topup_1500_usd_2999_v1', name: 'WORLDIFACT Top-up — 1500 credits' },
] as const;
type Offer = typeof offers[number];
type Json = Record<string, unknown>;
type Stage = 'credentials' | 'account' | 'webhook preflight' | 'product preflight' | 'price preflight' | 'product creation' | 'price creation' | 'webhook creation' | 'secret synchronization';
type Dependencies = { fetcher?: typeof fetch; upload?: (payload: BillingSecrets) => void | Promise<void>; now?: () => number };
export class StripeSetupError extends Error {}
function fail(stage: Stage, reason: string): never { throw new StripeSetupError(`Stripe setup stopped during ${stage}: ${reason}`); }
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const validId = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,180}$`).test(value);
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^whsec_[A-Za-z0-9_]{16,256}$/.test(value);
const metadata = (account: string, kind: string) => ({ worldifact_setup: setupVersion, worldifact_account: account, worldifact_kind: kind, worldifact_credits: String(CREDIT_PACK.credits) });
const matchesMetadata = (value: unknown, expected: Record<string, string>) => Object.entries(expected).every(([key, content]) => object(value)[key] === content);
const addMetadata = (params: URLSearchParams, values: Record<string, string>) => { for (const [key, value] of Object.entries(values)) params.set(`metadata[${key}]`, value); };

async function readJson(response: Response, stage: Stage): Promise<Json> {
  if (Number(response.headers.get('Content-Length')) > maximumResponseBytes) { await response.body?.cancel(); fail(stage, 'Provider response exceeded the size limit.'); }
  const reader = response.body?.getReader();
  if (!reader) fail(stage, 'Provider returned an empty response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumResponseBytes) fail(stage, 'Provider response exceeded the size limit.');
      chunks.push(next.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(stage, 'Provider returned an invalid response.');
    return parsed as Json;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof StripeSetupError) throw error;
    fail(stage, 'Provider response could not be read. Sensitive details suppressed.');
  }
}

function validateProduct(product: Json, offer: Offer, account: string, stage: Stage) {
  if (product.object !== 'product' || product.id !== offer.productId || product.livemode !== true || product.active !== true || product.name !== offer.name || product.shippable !== false || !matchesMetadata(product.metadata, metadata(account, offer.kind))) {
    fail(stage, 'An existing or returned product does not match the approved offer. No existing product was changed.');
  }
}

function validatePrice(price: Json, offer: Offer, account: string, stage: Stage) {
  const recurring = object(price.recurring);
  if (price.object !== 'price' || !validId(price.id, 'price') || price.livemode !== true || price.active !== true || price.lookup_key !== offer.lookupKey || price.unit_amount !== CREDIT_PACK.amount || price.unit_amount_decimal !== String(CREDIT_PACK.amount) || price.currency !== 'usd' || price.billing_scheme !== 'per_unit' || price.transform_quantity != null || price.custom_unit_amount != null || price.tiers_mode != null || !matchesMetadata(price.metadata, metadata(account, offer.kind)) ||
    (offer.kind === 'subscription' ? price.type !== 'recurring' || recurring.interval !== 'month' || recurring.interval_count !== 1 || recurring.usage_type !== 'licensed' || recurring.trial_period_days != null : price.type !== 'one_time' || price.recurring != null)) {
    fail(stage, 'An existing or returned price does not match USD 29.99 for 1500 credits. No existing price was changed.');
  }
  validateProduct(object(price.product), offer, account, stage);
}

function validateWebhook(endpoint: Json, stage: Stage) {
  const enabled = endpoint.enabled_events;
  if (endpoint.object !== 'webhook_endpoint' || !validId(endpoint.id, 'we') || endpoint.url !== webhookUrl || endpoint.api_version !== STRIPE_API_VERSION || endpoint.livemode !== true || endpoint.application != null || endpoint.status !== 'enabled' || !Array.isArray(enabled) || enabled.length !== events.length || !events.every(event => enabled.includes(event))) {
    fail(stage, 'The webhook does not match the approved account endpoint, API version and events. No existing endpoint was changed.');
  }
}

/** Uses an existing live credential inside the deployment environment; never returns credentials. */
export async function setupStripe(env: NodeJS.ProcessEnv, dependencies: Dependencies = {}) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) fail('credentials', 'The STRIPE_SECRET_KEY production secret is missing or empty.');
  if (key.startsWith('pk_')) fail('credentials', 'The stored value is a publishable client key. Supply a live server API key in STRIPE_SECRET_KEY.');
  if (/^(?:sk|rk)_test_/.test(key)) fail('credentials', 'The stored value is a test-mode key. Supply a live account key for this production setup.');
  if (key.startsWith('sk_org_')) fail('credentials', 'Organization keys are not supported. Supply a live key for the intended Stripe account.');
  if (key.startsWith('whsec_')) fail('credentials', 'The stored value is a webhook signing secret. STRIPE_SECRET_KEY requires a live server API key.');
  if (!/^(?:sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(key)) fail('credentials', 'The stored value is not a complete supported live server API key. Check the secret value without printing it.');
  if (env.STRIPE_WEBHOOK_SECRET && !validSecret(env.STRIPE_WEBHOOK_SECRET)) fail('credentials', 'The supplied webhook signing secret has an invalid format.');
  const fetcher = dependencies.fetcher ?? fetch;
  const upload = dependencies.upload ?? (payload => uploadBillingSecrets(payload, undefined, env));
  const now = dependencies.now ?? Date.now;
  const request = async (path: string, stage: Stage, params?: URLSearchParams, idempotencyKey?: string, allowMissing = false): Promise<Json | null> => {
    try {
      const response = await fetcher(`https://api.stripe.com/v1${path}`, {
        method: params ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        ...(params ? { body: params.toString() } : {}),
      });
      if (allowMissing && response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); fail(stage, `Provider returned HTTP ${response.status}. Sensitive response details suppressed.`); }
      return await readJson(response, stage);
    } catch (error) {
      if (error instanceof StripeSetupError) throw error;
      fail(stage, 'The provider request failed or timed out. Sensitive details suppressed.');
    }
  };

  const account = (await request('/account', 'account'))!;
  if (account.object !== 'account' || !validId(account.id, 'acct') || account.charges_enabled !== true) fail('account', 'The live account is not ready to accept payments. Finish its Stripe requirements first.');
  const accountId = account.id;
  const webhookMetadata = metadata(accountId, 'billing');
  const webhookIdempotencyKey = `${setupVersion}-${accountId}-webhook`;
  const webhookParams = new URLSearchParams({ url: webhookUrl, api_version: STRIPE_API_VERSION, connect: 'false', description: 'WORLDIFACT billing' });
  for (const event of events) webhookParams.append('enabled_events[]', event);
  addMetadata(webhookParams, webhookMetadata);

  // Paginate before any writes so a matching endpoint cannot be hidden on a later page.
  const endpoints: Json[] = [];
  let cursor = '';
  for (let page = 0; ; page++) {
    if (page >= 10) fail('webhook preflight', 'Too many existing endpoints to inspect safely.');
    const query = new URLSearchParams({ limit: '100', ...(cursor ? { starting_after: cursor } : {}) });
    const list = (await request(`/webhook_endpoints?${query}`, 'webhook preflight'))!;
    if (list.object !== 'list' || !Array.isArray(list.data) || typeof list.has_more !== 'boolean' || list.data.length > 100) fail('webhook preflight', 'Provider returned an invalid endpoint list.');
    for (const value of list.data) {
      const endpoint = object(value);
      if (!validId(endpoint.id, 'we')) fail('webhook preflight', 'Provider returned an invalid endpoint identifier.');
      if (endpoint.url === webhookUrl) endpoints.push(endpoint);
    }
    if (!list.has_more) break;
    const next = object(list.data.at(-1)).id;
    if (!validId(next, 'we') || next === cursor) fail('webhook preflight', 'Provider endpoint pagination could not be verified.');
    cursor = next;
  }
  if (endpoints.length > 1) fail('webhook preflight', 'More than one endpoint already uses this URL. Review them without creating another.');
  const existingEndpoint = endpoints[0];
  if (existingEndpoint) {
    validateWebhook(existingEndpoint, 'webhook preflight');
    if (!env.STRIPE_WEBHOOK_SECRET) {
      const age = Math.floor(now() / 1000) - Number(existingEndpoint.created);
      if (!matchesMetadata(existingEndpoint.metadata, webhookMetadata) || existingEndpoint.description !== 'WORLDIFACT billing' || !Number.isSafeInteger(existingEndpoint.created) || age < 0 || age >= replayWindowSeconds) {
        fail('webhook preflight', 'An endpoint already exists. Its signing secret must be supplied securely; automatic duplication or rotation is refused.');
      }
    }
  } else if (env.STRIPE_WEBHOOK_SECRET) {
    fail('webhook preflight', 'A signing secret was supplied but its endpoint was not found.');
  }

  // Inspect both offers before creating anything. A malformed existing price is never replaced.
  const prepared: { offer: Offer; product: Json | null; price: Json | null }[] = [];
  for (const offer of offers) {
    const product = await request(`/products/${offer.productId}`, 'product preflight', undefined, undefined, true);
    if (product) validateProduct(product, offer, accountId, 'product preflight');
    const query = new URLSearchParams({ 'lookup_keys[]': offer.lookupKey, limit: '2', 'expand[]': 'data.product' });
    const list = (await request(`/prices?${query}`, 'price preflight'))!;
    if (list.object !== 'list' || !Array.isArray(list.data) || list.has_more !== false || list.data.length > 1) fail('price preflight', 'The lookup key did not identify a single approved price.');
    const price = list.data.length ? object(list.data[0]) : null;
    if (price) {
      validatePrice(price, offer, accountId, 'price preflight');
      if (!product) fail('price preflight', 'The price product was not found.');
    }
    prepared.push({ offer, product, price });
  }
  for (const item of prepared) {
    const { offer } = item;
    if (!item.product) {
      const params = new URLSearchParams({ id: offer.productId, name: offer.name, active: 'true', shippable: 'false' });
      addMetadata(params, metadata(accountId, offer.kind));
      item.product = (await request('/products', 'product creation', params, `${setupVersion}-${accountId}-${offer.kind}-product`))!;
      validateProduct(item.product, offer, accountId, 'product creation');
    }
    if (!item.price) {
      const params = new URLSearchParams({ product: offer.productId, lookup_key: offer.lookupKey, currency: 'usd', unit_amount: String(CREDIT_PACK.amount), billing_scheme: 'per_unit', active: 'true', 'expand[]': 'product' });
      if (offer.kind === 'subscription') { params.set('recurring[interval]', 'month'); params.set('recurring[interval_count]', '1'); params.set('recurring[usage_type]', 'licensed'); }
      addMetadata(params, metadata(accountId, offer.kind));
      item.price = (await request('/prices', 'price creation', params, `${setupVersion}-${accountId}-${offer.kind}-price`))!;
      validatePrice(item.price, offer, accountId, 'price creation');
    }
  }
  let endpoint = existingEndpoint;
  let signingSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    // A replay is bounded below Stripe's minimum 24-hour idempotency retention.
    // The identical response must identify the existing endpoint, never a replacement.
    if (existingEndpoint && Math.floor(now() / 1000) - Number(existingEndpoint.created) >= replayWindowSeconds) fail('webhook creation', 'The safe replay window elapsed. Supply the existing signing secret securely.');
    endpoint = (await request('/webhook_endpoints', 'webhook creation', webhookParams, webhookIdempotencyKey))!;
    validateWebhook(endpoint, 'webhook creation');
    if (existingEndpoint && endpoint.id !== existingEndpoint.id) fail('webhook creation', 'The replay did not return the existing endpoint. No secret was synchronized.');
    if (!matchesMetadata(endpoint.metadata, webhookMetadata) || !validSecret(endpoint.secret)) fail('webhook creation', 'The new signing secret could not be confirmed.');
    signingSecret = endpoint.secret;
  }
  const payload = readBillingSecrets({
    STRIPE_SECRET_KEY: key,
    STRIPE_WEBHOOK_SECRET: signingSecret,
    STRIPE_SUBSCRIPTION_PRICE_ID: prepared[0].price!.id as string,
    STRIPE_TOPUP_PRICE_ID: prepared[1].price!.id as string,
    STRIPE_CONFIG_SOURCE: 'github',
  })!;
  try { await upload(payload); } catch { fail('secret synchronization', 'Cloudflare did not confirm synchronization. Rerun this same setup within 23 hours; no secret value is printed.'); }
  return { status: 'configured_without_checkout_activation', subscriptionPriceId: payload.STRIPE_SUBSCRIPTION_PRICE_ID, topupPriceId: payload.STRIPE_TOPUP_PRICE_ID, webhookId: endpoint.id as string, payoutsEnabled: account.payouts_enabled === true };
}

export function stripeSetupErrorMessage(error: unknown) {
  return error instanceof StripeSetupError ? error.message : 'Stripe setup failed. Sensitive details suppressed.';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await setupStripe(process.env))); }
  catch (error) { console.error(stripeSetupErrorMessage(error)); process.exitCode = 1; }
}

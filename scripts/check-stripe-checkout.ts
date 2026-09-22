import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRIPE_API_VERSION } from '../server/billing.ts';

type Json = Record<string, unknown>;
type Dependencies = { fetcher?: typeof fetch };
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const id = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,180}$`).test(value);
const words = new Set(('a an the you your we our this that these those it its is are was were be been being can cannot could must should have has had do does did not no yes and or to of for from in on at with without before after when while if then only required requires require missing invalid valid set setting settings configured configuration configure enabled enable disabled disable available unavailable supported unsupported support please contact visit provide provided using use create creating creation checkout session subscription subscriptions customer customers customer\'s account accounts business name public information profile live test mode payment payments method methods card cards price prices currency amount quantity line items line_items recurring monthly active activate activation complete completed incomplete verified verification identity permissions permission restricted secret key api publishable billing tax address email default return success cancel url urls metadata parameter parameters unexpected error failed failure request requests currently yet dashboard stripe cannot allowed allow unable accessible need needs ensure first select selected total minimum maximum limit country countries product products setup detail details details. display statement descriptor terms service privacy policy agreement accepted accept acceptance access charge charges capabilities capability paused restricted organization session.').split(/\s+/));
const codes = new Set(['parameter_missing', 'parameter_unknown', 'parameter_invalid_empty', 'parameter_invalid_integer', 'parameters_exclusive', 'resource_missing', 'permission_denied', 'account_invalid', 'api_key_expired', 'idempotency_key_in_use', 'capability_not_active', 'action_blocked', 'payment_method_unactivated', 'payment_method_unsupported_type', 'livemode_mismatch', 'amount_too_small', 'amount_too_large', 'stripe_tax_inactive', 'customer_tax_location_invalid']);
const parameters = new Set(['customer', 'mode', 'currency', 'line_items', 'line_items[0][price]', 'line_items[0][quantity]', 'payment_method_types', 'payment_method_types[0]', 'allow_promotion_codes', 'success_url', 'cancel_url', 'expires_at', 'client_reference_id', 'metadata', 'subscription_data', 'business_profile[name]']);
const types = new Set(['invalid_request_error', 'authentication_error', 'permission_error', 'api_error', 'idempotency_error', 'rate_limit_error']);
class CheckoutCheckError extends Error {}
function fail(message: string): never { throw new CheckoutCheckError(message); }
function safeMessage(value: unknown) {
  if (typeof value !== 'string') return 'unclassified';
  // Split only at whitespace; embedded tokens, IDs, emails and URLs remain whole unknown words.
  return value.slice(0, 4000).split(/\s+/).slice(0, 100).map(token => {
    const word = token.toLowerCase().replace(/^[.,!?;:'"()[\]{}]+|[.,!?;:'"()[\]{}]+$/g, '');
    return words.has(word) ? word : '[redacted]';
  }).join(' ').replace(/(?:\[redacted\] ){2,}/g, '[redacted] ').slice(0, 1600);
}
async function readJson(response: Response): Promise<Json> {
  if (Number(response.headers.get('Content-Length')) > 256_000) { await response.body?.cancel(); fail('Provider response exceeded the size limit.'); }
  const reader = response.body?.getReader();
  if (!reader) fail('Provider response is empty.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > 256_000) fail('Provider response exceeded the size limit.'); chunks.push(next.value); }
    return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { await reader.cancel().catch(() => {}); fail('Provider response could not be parsed. Sensitive details suppressed.'); }
}

/** Opens and immediately expires an isolated unpaid checkout; never confirms payment or creates a customer directly. */
export async function checkStripeCheckout(env: NodeJS.ProcessEnv, dependencies: Dependencies = {}) {
  const key = env.STRIPE_SECRET_KEY?.trim(), run = env.GITHUB_RUN_ID, attempt = env.GITHUB_RUN_ATTEMPT;
  if (!key || !/^(?:sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(key)) fail('Checkout preflight requires a supported live STRIPE_SECRET_KEY.');
  if (!run || !/^\d{1,24}$/.test(run) || !attempt || !/^\d{1,6}$/.test(attempt)) fail('Checkout preflight requires GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT.');
  const requestKey = `worldifact-checkout-probe-v1-${run}-${attempt}`;
  const digest = createHash('sha256').update(requestKey).digest('hex');
  const probe = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const fetcher = dependencies.fetcher ?? fetch;
  const request = async (path: string, stage: string, params?: URLSearchParams, idempotency?: string) => {
    let response: Response;
    try { response = await fetcher(`https://api.stripe.com/v1${path}`, { method: params ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotency ? { 'Idempotency-Key': idempotency } : {}) }, ...(params ? { body: params.toString() } : {}) }); }
    catch { fail(`${stage}: provider request failed or timed out. Sensitive details suppressed.`); }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail(`${stage}: provider redirect rejected.`); }
    const body = await readJson(response);
    if (!response.ok) {
      const error = object(body.error), type = typeof error.type === 'string' && types.has(error.type) ? error.type : 'unclassified';
      const code = typeof error.code === 'string' && codes.has(error.code) ? error.code : 'unclassified';
      const parameter = typeof error.param === 'string' && parameters.has(error.param) ? error.param : 'unclassified';
      fail(`${stage}: HTTP ${response.status}; type=${type}; code=${code}; parameter=${parameter}; message=${safeMessage(error.message)}`);
    }
    return body;
  };
  let price: Json;
  if (env.STRIPE_SUBSCRIPTION_PRICE_ID) {
    if (!id(env.STRIPE_SUBSCRIPTION_PRICE_ID, 'price')) fail('Invalid configured subscription price ID.');
    price = await request(`/prices/${env.STRIPE_SUBSCRIPTION_PRICE_ID}`, 'price_read');
    if (price.id !== env.STRIPE_SUBSCRIPTION_PRICE_ID) fail('The returned subscription price does not match.');
  } else {
    const list = await request('/prices?lookup_keys[]=worldifact_membership_1500_usd_2999_month_v1&limit=2', 'price_lookup');
    if (list.object !== 'list' || list.has_more !== false || !Array.isArray(list.data) || list.data.length !== 1) fail('Exactly one approved subscription price is required.');
    price = object(list.data[0]);
    if (price.lookup_key !== 'worldifact_membership_1500_usd_2999_month_v1') fail('The subscription lookup key does not match.');
  }
  const recurring = object(price.recurring);
  if (!id(price.id, 'price') || price.object !== 'price' || price.livemode !== true || price.active !== true || price.unit_amount !== 2999 || price.currency !== 'usd' || price.type !== 'recurring' || price.billing_scheme !== 'per_unit' || price.transform_quantity != null || recurring.interval !== 'month' || recurring.interval_count !== 1 || recurring.usage_type !== 'licensed' || recurring.trial_period_days != null) fail('The approved live USD29.99 monthly price could not be verified.');
  const params = new URLSearchParams({ mode: 'subscription', 'line_items[0][price]': price.id, 'line_items[0][quantity]': '1', 'payment_method_types[0]': 'card', allow_promotion_codes: 'false', client_reference_id: probe, 'metadata[worldifact_probe]': probe, 'metadata[worldifact_kind]': 'subscription', 'metadata[worldifact_checkout_id]': probe, success_url: 'https://worldifact.xodobrox.workers.dev/account/credits?billing=processing', cancel_url: 'https://worldifact.xodobrox.workers.dev/account/credits?billing=cancelled' });
  // No worldifact_uid: expiration webhooks cannot associate this probe with an account ledger.
  const session = await request('/checkout/sessions', 'checkout_create', params, requestKey);
  if (!id(session.id, 'cs_live') || session.object !== 'checkout.session' || session.livemode !== true || session.mode !== 'subscription' || session.status !== 'open' || session.payment_status !== 'unpaid' || session.customer != null || object(session.metadata).worldifact_probe !== probe) fail('The isolated unpaid checkout could not be verified. No payment was submitted.');
  try {
    if (session.amount_total !== 2999 || session.currency !== 'usd' || session.client_reference_id !== probe || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) fail('The returned checkout offer could not be verified.');
  } finally {
    const expired = await request(`/checkout/sessions/${session.id}/expire`, 'checkout_expire', new URLSearchParams(), `${requestKey}-expire`);
    if (expired.id !== session.id || expired.object !== 'checkout.session' || expired.livemode !== true || expired.status !== 'expired' || expired.payment_status !== 'unpaid') fail('The probe checkout expiration could not be verified. No payment was submitted.');
  }
  return { status: 'checkout_verified_without_charge', amount: 2999, currency: 'USD', expired: true };
}
export function stripeCheckoutCheckErrorMessage(error: unknown) { return error instanceof CheckoutCheckError ? error.message : 'Checkout preflight failed. Sensitive details suppressed.'; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await checkStripeCheckout(process.env))); }
  catch (error) { console.error(stripeCheckoutCheckErrorMessage(error)); process.exitCode = 1; }
}

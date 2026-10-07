import { createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Owner-approved one-time read. No email or raw customer identifier is published.
export const TARGET_HASH = 'd8271adb1c72b0c8923c500661e0a83c10c9c20600d588ad2e90336701f7c417';
export const BRANCH = 'diagnostics/stripe-readonly-once-20261007';
export const BASE_SHA = '29b6b9af08d62baafddceb029652db321ec83273';
export const EXPIRES_AT = '2026-10-07T12:00:00.000Z';
export const SALES_START = '2026-09-14T00:00:00.000Z';
export const MAX_PAGES = 5;
export const PAGE_SIZE = 100;
export const MAX_RESPONSE_BYTES = 2_000_000;
const ORIGIN = 'https://api.stripe.com';
const API_VERSION = '2024-06-20'; // Match the existing production integration.
const AAD = Buffer.from('WORLDIFACT_STRIPE_READONLY_V1');
const RESOURCE_PREFIX = { customers: 'cus', subscriptions: 'sub', invoices: 'in' };
const SAFE_ERROR_CODES = new Set(['AUTHENTICATION_FAILED', 'PERMISSION_DENIED', 'RATE_LIMITED', 'PROVIDER_ERROR', 'NETWORK_FAILED', 'REDIRECT_REJECTED', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE', 'BOUND_EXCEEDED', 'INVALID_REQUEST', 'CONFIGURATION_FAILED']);
class DiagnosticError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new DiagnosticError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const id = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,180}$`).test(value) ? value : null;
const ref = (value, prefix) => id(typeof value === 'string' ? value : object(value).id, prefix);
const integer = value => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000 ? value : null;
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 4_102_444_800 ? value : null;
const currency = value => typeof value === 'string' && /^[a-z]{3}$/.test(value) ? value : null;
const enumeration = (value, allowed) => allowed.includes(value) ? value : 'unknown';
const boolean = value => typeof value === 'boolean' ? value : null;
const safeError = error => error instanceof DiagnosticError && SAFE_ERROR_CODES.has(error.code) ? error.code : 'PROVIDER_ERROR';
const subscriptionStates = ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'paused'];
const invoiceStates = ['draft', 'open', 'paid', 'uncollectible', 'void'];
const billingReasons = ['subscription_create', 'subscription_cycle', 'subscription_update', 'subscription_threshold', 'manual', 'upcoming', 'automatic_pending_invoice_item_invoice', 'quote_accept'];
const knownPrices = {
  price_1UKi3GBrIVB6dkxNm66OnDAr: 'pro',
  price_1UKi3UBrIVB6dkxNfojjhJsv: 'studio',
};
const knownLookups = {
  worldifact_membership_1500_usd_2999_month_v1: 'creator',
};

export function priceReport(value) {
  const p = object(value), recurring = object(p.recurring);
  return {
    // Unknown IDs and free-form product metadata are deliberately omitted.
    knownPlan: Object.hasOwn(knownPrices, p.id) ? knownPrices[p.id] : Object.hasOwn(knownLookups, p.lookup_key) ? knownLookups[p.lookup_key] : 'unknown',
    amountMinorUnits: integer(p.unit_amount), currency: currency(p.currency),
    interval: enumeration(recurring.interval, ['day', 'week', 'month', 'year']),
    intervalCount: integer(recurring.interval_count),
  };
}
export function subscriptionReport(value) {
  const s = object(value), items = object(s.items), pending = object(s.pending_update);
  return {
    id: id(s.id, 'sub'), status: enumeration(s.status, subscriptionStates),
    created: timestamp(s.created), currentPeriodStart: timestamp(s.current_period_start),
    currentPeriodEnd: timestamp(s.current_period_end), cancelAtPeriodEnd: boolean(s.cancel_at_period_end),
    canceledAt: timestamp(s.canceled_at), latestInvoiceId: ref(s.latest_invoice, 'in'),
    itemsComplete: items.has_more === false && Array.isArray(items.data) && items.data.length <= 20,
    items: Array.isArray(items.data) ? items.data.slice(0, 20).map(item => ({ quantity: integer(object(item).quantity), price: priceReport(object(item).price) })) : [],
    pendingUpdate: s.pending_update == null ? null : {
      expiresAt: timestamp(pending.expires_at),
      itemsComplete: Array.isArray(pending.subscription_items) && pending.subscription_items.length <= 20,
      items: Array.isArray(pending.subscription_items) ? pending.subscription_items.slice(0, 20).map(item => ({ quantity: integer(object(item).quantity), price: priceReport(object(item).price) })) : [],
    },
  };
}
export function invoiceReport(value) {
  const v = object(value), lines = object(v.lines), transitions = object(v.status_transitions);
  return {
    id: id(v.id, 'in'), subscriptionId: ref(v.subscription, 'sub'),
    created: timestamp(v.created), paidAt: timestamp(transitions.paid_at),
    status: enumeration(v.status, invoiceStates), billingReason: enumeration(v.billing_reason, billingReasons),
    amountPaidMinorUnits: integer(v.amount_paid), amountDueMinorUnits: integer(v.amount_due), amountRemainingMinorUnits: integer(v.amount_remaining),
    currency: currency(v.currency), paid: boolean(v.paid), paidOutOfBand: boolean(v.paid_out_of_band), attempted: boolean(v.attempted), attemptCount: integer(v.attempt_count),
    periodStart: timestamp(v.period_start), periodEnd: timestamp(v.period_end),
    linesComplete: lines.has_more === false && Array.isArray(lines.data) && lines.data.length <= 20,
    lines: Array.isArray(lines.data) ? lines.data.slice(0, 20).map(line => ({
      amountMinorUnits: integer(object(line).amount), currency: currency(object(line).currency),
      proration: boolean(object(line).proration), quantity: integer(object(line).quantity),
      price: priceReport(object(line).price),
    })) : [],
  };
}

async function readBoundedJson(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) { await response.body?.cancel().catch(() => {}); fail('RESPONSE_TOO_LARGE'); }
  const reader = response.body?.getReader();
  if (!reader) fail('INVALID_RESPONSE');
  let total = 0; const chunks = [];
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE');
      chunks.push(next.value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('INVALID_RESPONSE');
    return parsed;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof DiagnosticError) throw error;
    fail('INVALID_RESPONSE');
  }
}

export function createStripeReader(secret, fetcher = fetch) {
  if (typeof secret !== 'string' || !/^(?:sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(secret)) fail('CONFIGURATION_FAILED');
  let requests = 0;
  return async (resource, parameters = {}) => {
    if (!Object.hasOwn(RESOURCE_PREFIX, resource) || ++requests > 30) fail('INVALID_REQUEST');
    const allowed = resource === 'customers' ? ['limit', 'starting_after'] : resource === 'subscriptions' ? ['limit', 'starting_after', 'customer', 'status'] : ['limit', 'starting_after', 'customer', 'created[gte]', 'created[lte]'];
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) {
      if (!allowed.includes(key)) fail('INVALID_REQUEST');
      if (key === 'limit' && value !== PAGE_SIZE) fail('INVALID_REQUEST');
      if (key === 'starting_after' && !id(value, RESOURCE_PREFIX[resource])) fail('INVALID_REQUEST');
      if (key === 'customer' && !id(value, 'cus')) fail('INVALID_REQUEST');
      if (key === 'status' && value !== 'all') fail('INVALID_REQUEST');
      if (key.startsWith('created[') && timestamp(value) === null) fail('INVALID_REQUEST');
      params.set(key, String(value));
    }
    if (parameters.limit !== PAGE_SIZE) fail('INVALID_REQUEST');
    let response;
    try {
      response = await fetcher(`${ORIGIN}/v1/${resource}?${params}`, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': API_VERSION, Accept: 'application/json' },
      });
    } catch { fail('NETWORK_FAILED'); }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => {}); fail('REDIRECT_REJECTED'); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      fail(response.status === 401 ? 'AUTHENTICATION_FAILED' : response.status === 403 ? 'PERMISSION_DENIED' : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
    }
    const body = await readBoundedJson(response);
    if (body.object !== 'list' || !Array.isArray(body.data) || body.data.length > PAGE_SIZE || typeof body.has_more !== 'boolean') fail('INVALID_RESPONSE');
    for (const record of body.data) {
      if (!id(object(record).id, RESOURCE_PREFIX[resource]) || object(record).livemode !== true) fail('INVALID_RESPONSE');
    }
    if (body.has_more && body.data.length === 0) fail('INVALID_RESPONSE');
    return body;
  };
}

async function scan(read, resource, parameters, consume, stop = () => false) {
  let cursor, records = 0; const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await read(resource, { ...parameters, limit: PAGE_SIZE, ...(cursor ? { starting_after: cursor } : {}) });
    for (const record of body.data) {
      if (seen.has(record.id)) fail('INVALID_RESPONSE');
      seen.add(record.id); records++;
      consume(record);
    }
    if (stop()) return { complete: false, stoppedAfterMatch: true, recordsScanned: records };
    if (!body.has_more) return { complete: true, stoppedAfterMatch: false, recordsScanned: records };
    cursor = body.data.at(-1).id;
  }
  return { complete: false, stoppedAfterMatch: false, recordsScanned: records };
}

export async function collectReport(secret, { fetcher = fetch, now = new Date() } = {}) {
  const read = createStripeReader(secret, fetcher);
  const report = { schema: 'worldifact-stripe-readonly-v1', checkedAt: now.toISOString(), apiVersion: API_VERSION,
    owner: { found: false, subscriptions: [], invoices: [] },
    sales: { source: 'positive paid subscription invoices excluding explicit out-of-band payments; gross invoice amounts, not charges, refunds, net revenue or payouts', createdFrom: SALES_START, createdThrough: now.toISOString(), complete: false, paidSubscriptionInvoices: 0, otherCustomerPaidSubscriptionInvoices: 0, uniquePayingCustomers: 0, otherPayingCustomers: 0, byCurrency: {} },
    errors: [],
  };
  let customerId = null;
  try {
    report.customerLookup = await scan(read, 'customers', {}, customer => {
      if (createHash('sha256').update(customer.id).digest('hex') === TARGET_HASH) customerId = customer.id;
    }, () => customerId !== null);
    report.owner.found = customerId !== null;
  } catch (error) { report.errors.push({ stage: 'customer_lookup', code: safeError(error) }); }
  if (customerId) {
    try {
      report.owner.subscriptionCoverage = await scan(read, 'subscriptions', { customer: customerId, status: 'all' }, subscription => {
        if (ref(subscription.customer, 'cus') !== customerId) fail('INVALID_RESPONSE');
        report.owner.subscriptions.push(subscriptionReport(subscription));
      });
    } catch (error) { report.errors.push({ stage: 'owner_subscriptions', code: safeError(error) }); }
    try {
      report.owner.invoiceCoverage = await scan(read, 'invoices', { customer: customerId }, invoice => {
        if (ref(invoice.customer, 'cus') !== customerId) fail('INVALID_RESPONSE');
        report.owner.invoices.push(invoiceReport(invoice));
      });
    } catch (error) { report.errors.push({ stage: 'owner_invoices', code: safeError(error) }); }
  }
  const paidCustomers = new Set(), otherCustomers = new Set();
  try {
    const coverage = await scan(read, 'invoices', { 'created[gte]': Date.parse(SALES_START) / 1000, 'created[lte]': Math.floor(now.getTime() / 1000) }, invoice => {
      const reason = enumeration(invoice.billing_reason, billingReasons);
      if (invoice.status !== 'paid' || invoice.paid !== true || invoice.paid_out_of_band === true || integer(invoice.amount_paid) === null || invoice.amount_paid <= 0 || !ref(invoice.subscription, 'sub') || !reason.startsWith('subscription_')) return;
      const c = currency(invoice.currency), buyer = ref(invoice.customer, 'cus');
      if (!c || !buyer) fail('INVALID_RESPONSE');
      report.sales.paidSubscriptionInvoices++;
      paidCustomers.add(buyer);
      const other = createHash('sha256').update(buyer).digest('hex') !== TARGET_HASH;
      if (other) { report.sales.otherCustomerPaidSubscriptionInvoices++; otherCustomers.add(buyer); }
      if (!report.sales.byCurrency[c]) report.sales.byCurrency[c] = { amountPaidMinorUnits: 0, otherCustomerAmountPaidMinorUnits: 0 };
      report.sales.byCurrency[c].amountPaidMinorUnits += invoice.amount_paid;
      if (other) report.sales.byCurrency[c].otherCustomerAmountPaidMinorUnits += invoice.amount_paid;
      if (!Number.isSafeInteger(report.sales.byCurrency[c].amountPaidMinorUnits)) fail('BOUND_EXCEEDED');
    });
    Object.assign(report.sales, coverage);
  } catch (error) { report.errors.push({ stage: 'sales_invoices', code: safeError(error) }); }
  report.sales.uniquePayingCustomers = paidCustomers.size;
  report.sales.otherPayingCustomers = otherCustomers.size;
  return report;
}

export function encryptReport(report, publicPem) {
  const recipient = createPublicKey(publicPem);
  if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) fail('CONFIGURATION_FAILED');
  const plaintext = Buffer.from(JSON.stringify(report));
  if (plaintext.length > 1_500_000) fail('BOUND_EXCEEDED');
  const key = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const wrappedKey = publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
    return { schema: 'worldifact-encrypted-report-v1', cipher: 'AES-256-GCM', wrapping: 'RSA-OAEP-SHA256',
      aad: AAD.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      wrappedKey: wrappedKey.toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); plaintext.fill(0); }
}

export async function main(env = process.env, { fetcher = fetch, now = new Date(), output = value => process.stdout.write(value + '\n') } = {}) {
  try {
    if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== `refs/heads/${BRANCH}` || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_RUN_ATTEMPT !== '1' || env.DIAGNOSTIC_BEFORE !== BASE_SHA || now.getTime() >= Date.parse(EXPIRES_AT)) fail('CONFIGURATION_FAILED');
    const publicPem = await readFile('.github/stripe-diagnostic-recipient.pem', 'utf8');
    // Validate the public key before any Stripe request.
    const recipient = createPublicKey(publicPem);
    if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) fail('CONFIGURATION_FAILED');
    const report = await collectReport(env.STRIPE_SECRET_KEY?.trim(), { fetcher, now });
    const envelope = encryptReport(report, publicPem);
    await mkdir('.stripe-readonly-encrypted', { recursive: true, mode: 0o700 });
    await writeFile('.stripe-readonly-encrypted/report.enc.json', JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
    output('ENCRYPTED_DIAGNOSTIC_READY');
    return 0;
  } catch {
    output('DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED');
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();

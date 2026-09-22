import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const stripeNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_SUBSCRIPTION_PRICE_ID', 'STRIPE_TOPUP_PRICE_ID'] as const;
const paypalNames = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_MERCHANT_ID'] as const;
const inputNames = [...stripeNames, ...paypalNames, 'STRIPE_PREVIOUS_TOPUP_PRICE_IDS'] as const;
export type BillingSecrets = Record<string, string>;
type SecretRunner = (command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding & { input: string; env: NodeJS.ProcessEnv }) => { status: number | null; error?: Error; stderr?: string };
class BillingSetupError extends Error {}
const fail = (message: string): never => { throw new BillingSetupError(message); };
const priceId = (value: string) => /^price_[A-Za-z0-9]{1,180}$/.test(value);

/** Validate every provider before making any writes. Missing groups preserve existing Worker secrets. */
export function readBillingSecrets(env: NodeJS.ProcessEnv): BillingSecrets | null {
  const payload: BillingSecrets = {};
  for (const names of [stripeNames, paypalNames]) {
    const supplied = names.some(name => !!env[name]) || (names === stripeNames && !!env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS);
    if (!supplied) continue;
    const missing = names.filter(name => !env[name]);
    if (missing.length) fail(`Incomplete billing configuration. Add production secrets: ${missing.join(', ')}.`);
    for (const name of names) payload[name] = env[name]!;
  }
  if (payload.STRIPE_SECRET_KEY) {
    for (const [name, valid] of [
      ['STRIPE_SECRET_KEY', /^sk_live_[A-Za-z0-9_]{16,256}$/.test(payload.STRIPE_SECRET_KEY)],
      ['STRIPE_WEBHOOK_SECRET', /^whsec_[A-Za-z0-9_]{16,256}$/.test(payload.STRIPE_WEBHOOK_SECRET)],
      ['STRIPE_SUBSCRIPTION_PRICE_ID', priceId(payload.STRIPE_SUBSCRIPTION_PRICE_ID)],
      ['STRIPE_TOPUP_PRICE_ID', priceId(payload.STRIPE_TOPUP_PRICE_ID)],
    ] as const) if (!valid) fail(`Invalid ${name}. Check its production dashboard value; values are never logged.`);
    const previous = env.STRIPE_PREVIOUS_TOPUP_PRICE_IDS;
    if (previous) {
      const ids = previous.split(',').map(value => value.trim());
      if (previous.length > 1900 || ids.length > 10 || !ids.every(priceId) || new Set(ids).size !== ids.length) fail('Invalid STRIPE_PREVIOUS_TOPUP_PRICE_IDS. Use at most ten distinct comma-separated price IDs.');
      payload.STRIPE_PREVIOUS_TOPUP_PRICE_IDS = ids.join(',');
    }
    payload.STRIPE_MODE = 'live';
    payload.STRIPE_SUBSCRIPTION_INTERVAL = 'month';
  }
  if (payload.PAYPAL_CLIENT_ID) {
    for (const name of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']) {
      if (!/^[A-Za-z0-9_-]{10,512}$/.test(payload[name])) fail(`Invalid ${name}. Use the merchant REST API application credential.`);
    }
    if (!/^[A-Z0-9]{10,36}$/.test(payload.PAYPAL_WEBHOOK_ID)) fail('Invalid PAYPAL_WEBHOOK_ID. Use the merchant REST API webhook ID.');
    if (!/^[A-Z0-9]{13}$/.test(payload.PAYPAL_MERCHANT_ID)) fail('Invalid PAYPAL_MERCHANT_ID. Use the merchant account ID.');
    payload.PAYPAL_MODE = 'live';
  }
  if (!Object.keys(payload).length) return null;
  payload.ACCOUNT_LEDGER_MODE = 'live';
  payload.BILLING_PUBLIC_ORIGIN = 'https://worldifact.xodobrox.workers.dev';
  return payload;
}

export function uploadBillingSecrets(payload: BillingSecrets, runner: SecretRunner = spawnSync, env: NodeJS.ProcessEnv = process.env) {
  const childEnv = { ...env };
  for (const name of inputNames) delete childEnv[name];
  try {
    const result = runner(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk', '--name', 'worldifact'], {
      input: JSON.stringify(payload), encoding: 'utf8', timeout: 60_000, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'], env: childEnv,
    });
    if (result.error || result.status !== 0) throw new Error();
  } catch { fail('Cloudflare billing secret synchronization failed. Check production token permissions; sensitive output suppressed.'); }
}

export function connectBilling(env: NodeJS.ProcessEnv, upload: (payload: BillingSecrets) => void = uploadBillingSecrets) {
  const payload = readBillingSecrets(env);
  if (!payload) return 'No billing credentials supplied. Existing Worker secrets are preserved.';
  upload(payload);
  const providers = [payload.STRIPE_SECRET_KEY ? 'Stripe' : '', payload.PAYPAL_CLIENT_ID ? 'PayPal' : ''].filter(Boolean).join(', ');
  return `${providers} configuration synchronized. Checkout activation is unchanged; live payment acceptance remains unverified.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(connectBilling(process.env)); }
  catch (error) {
    console.error(error instanceof BillingSetupError ? error.message : 'Billing setup failed. Sensitive error details suppressed.');
    process.exitCode = 1;
  }
}

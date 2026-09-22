import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadBillingSecrets, type BillingSecrets } from './connect-billing.ts';
import { STRIPE_API_VERSION } from '../server/billing.ts';

const origin = 'https://worldifact.xodobrox.workers.dev';
const setupVersion = 'worldifact-portal-v1';
const maximumResponseBytes = 256_000;
const diagnosticCodes = new Set(['parameter_missing', 'parameter_unknown', 'parameter_invalid_empty', 'parameter_invalid_string_blank', 'resource_missing', 'permission_denied', 'idempotency_key_in_use']);
const diagnosticParameters = new Set([
  'business_profile', 'business_profile[privacy_policy_url]', 'business_profile[terms_of_service_url]',
  'features', 'features[customer_update][enabled]', 'features[invoice_history][enabled]', 'features[payment_method_update][enabled]',
  'features[subscription_update][enabled]', 'features[subscription_update][default_allowed_updates]', 'features[subscription_update][products]',
  'features[subscription_cancel][enabled]', 'features[subscription_cancel][mode]', 'features[subscription_cancel][proration_behavior]',
  'features[subscription_cancel][cancellation_reason][enabled]', 'features[subscription_cancel][cancellation_reason][options]',
  'login_page[enabled]', 'default_return_url', 'metadata',
]);
type Json = Record<string, unknown>;
type Stage = 'credentials' | 'account' | 'portal preflight' | 'portal creation' | 'secret synchronization';
type Dependencies = { fetcher?: typeof fetch; upload?: (payload: BillingSecrets) => void | Promise<void> };
class StripePortalError extends Error {}
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const validId = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,180}$`).test(value);
function fail(stage: Stage, message: string): never { throw new StripePortalError(`Stripe portal preparation stopped during ${stage}: ${message}`); }

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
    if (error instanceof StripePortalError) throw error;
    fail(stage, 'Provider response could not be read. Sensitive details suppressed.');
  }
}

function validatePortal(portal: Json, account: string, stage: Stage) {
  const features = object(portal.features), cancel = object(features.subscription_cancel), profile = object(portal.business_profile), metadata = object(portal.metadata);
  if (portal.object !== 'billing_portal.configuration' || !validId(portal.id, 'bpc') || portal.active !== true || portal.livemode !== true || portal.application != null || portal.is_default !== false ||
    metadata.worldifact_setup !== setupVersion || metadata.worldifact_account !== account || metadata.worldifact_kind !== 'membership_management' ||
    portal.default_return_url !== `${origin}/account/credits` || profile.privacy_policy_url !== `${origin}/privacy` || profile.terms_of_service_url !== `${origin}/terms` ||
    object(portal.login_page).enabled !== false || object(features.customer_update).enabled !== false || object(features.subscription_update).enabled !== false ||
    object(features.payment_method_update).enabled !== true || object(features.invoice_history).enabled !== true ||
    cancel.enabled !== true || cancel.mode !== 'at_period_end' || cancel.proration_behavior !== 'none' || object(cancel.cancellation_reason).enabled !== false || cancel.retention != null) {
    fail(stage, 'The owned portal does not match the reviewed cancellation policy. No existing configuration was changed.');
  }
}

/** Prepare a dedicated customer portal, without changing a default portal or enabling checkout. */
export async function prepareStripePortal(env: NodeJS.ProcessEnv, dependencies: Dependencies = {}) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key || !/^(?:sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(key)) fail('credentials', 'A complete live account server key is required in STRIPE_SECRET_KEY. Its value is never printed.');
  const fetcher = dependencies.fetcher ?? fetch;
  const upload = dependencies.upload ?? (payload => uploadBillingSecrets(payload, undefined, env));
  const request = async (path: string, stage: Stage, params?: URLSearchParams, idempotencyKey?: string): Promise<Json> => {
    try {
      const response = await fetcher(`https://api.stripe.com/v1${path}`, {
        method: params ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        ...(params ? { body: params.toString() } : {}),
      });
      if (!response.ok) {
        let diagnostic = '';
        if (response.status >= 400) {
          try {
            const error = object((await readJson(response, stage)).error);
            // Match exact public schema names only. Never print messages, arbitrary codes or values.
            const code = typeof error.code === 'string' && diagnosticCodes.has(error.code) ? error.code : '';
            const parameter = typeof error.param === 'string' && diagnosticParameters.has(error.param) ? error.param : '';
            diagnostic = [code, parameter].filter(Boolean).join('; ');
          } catch { /* Invalid or oversized error bodies retain only their safe HTTP status. */ }
        } else await response.body?.cancel();
        fail(stage, `Provider returned HTTP ${response.status}${diagnostic ? ` (${diagnostic})` : ''}. Sensitive response details suppressed.`);
      }
      return await readJson(response, stage);
    } catch (error) {
      if (error instanceof StripePortalError) throw error;
      fail(stage, 'The provider request failed or timed out. Sensitive details suppressed.');
    }
  };

  const account = await request('/account', 'account');
  if (account.object !== 'account' || !validId(account.id, 'acct') || account.charges_enabled !== true) fail('account', 'The live account is not ready to accept payments.');
  const owned: Json[] = [], seen = new Set<string>();
  let cursor = '';
  // Include inactive configurations so deactivation cannot silently create a replacement.
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ limit: '100', ...(cursor ? { starting_after: cursor } : {}) });
    const list = await request(`/billing_portal/configurations?${query}`, 'portal preflight');
    if (list.object !== 'list' || !Array.isArray(list.data) || typeof list.has_more !== 'boolean') fail('portal preflight', 'Provider returned an invalid configuration list.');
    for (const value of list.data) {
      const portal = object(value);
      if (!validId(portal.id, 'bpc') || seen.has(portal.id)) fail('portal preflight', 'Configuration pagination is ambiguous.');
      seen.add(portal.id);
      if (object(portal.metadata).worldifact_setup === setupVersion) owned.push(portal);
    }
    if (!list.has_more) break;
    const next = object(list.data.at(-1)).id;
    if (!validId(next, 'bpc') || next === cursor || page === 9) fail('portal preflight', 'The complete configuration list could not be verified.');
    cursor = next;
  }
  if (owned.length > 1) fail('portal preflight', 'Multiple owned configurations require operator review. No configuration was created or changed.');
  let portal = owned[0];
  if (portal) validatePortal(portal, account.id, 'portal preflight');
  else {
    // API-created configurations are dedicated and do not replace the account default.
    // https://docs.stripe.com/api/customer_portal/configurations/create
    const params = new URLSearchParams({
      default_return_url: `${origin}/account/credits`,
      'business_profile[privacy_policy_url]': `${origin}/privacy`,
      'business_profile[terms_of_service_url]': `${origin}/terms`,
      'features[customer_update][enabled]': 'false',
      'features[invoice_history][enabled]': 'true',
      'features[payment_method_update][enabled]': 'true',
      // In API 2024-06-20 these optional disabled objects require additional fields on CREATE.
      // Omit them and verify the documented disabled defaults in the returned configuration.
      'features[subscription_cancel][enabled]': 'true',
      'features[subscription_cancel][mode]': 'at_period_end',
      'features[subscription_cancel][proration_behavior]': 'none',
      'login_page[enabled]': 'false',
      'metadata[worldifact_setup]': setupVersion,
      'metadata[worldifact_account]': account.id,
      'metadata[worldifact_kind]': 'membership_management',
    });
    portal = await request('/billing_portal/configurations', 'portal creation', params, `${setupVersion}-${account.id}-create-v2`);
    validatePortal(portal, account.id, 'portal creation');
  }
  try { await upload({ STRIPE_BILLING_PORTAL_CONFIGURATION_ID: portal.id as string }); }
  catch { fail('secret synchronization', 'The portal ID could not be saved to Cloudflare. Sensitive details suppressed.'); }
  return { status: 'portal_configured_without_checkout_activation', configurationId: portal.id as string };
}

export function stripePortalErrorMessage(error: unknown) {
  return error instanceof StripePortalError ? error.message : 'Stripe portal preparation failed. Sensitive details suppressed.';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareStripePortal(process.env))); }
  catch (error) { console.error(stripePortalErrorMessage(error)); process.exitCode = 1; }
}

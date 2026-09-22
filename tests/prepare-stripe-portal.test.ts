import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStripePortal, stripePortalErrorMessage } from '../scripts/prepare-stripe-portal.ts';
import type { BillingSecrets } from '../scripts/connect-billing.ts';

const key = `rk_live_${'s'.repeat(32)}`;
const env = { STRIPE_SECRET_KEY: ` \n${key}\n ` };
const origin = 'https://worldifact.xodobrox.workers.dev';
type Json = Record<string, unknown>;
const object = (value: unknown) => value as Json;
function configuration(id = 'bpc_WorldifactV1'): Json {
  return {
    id, object: 'billing_portal.configuration', active: true, livemode: true, application: null, is_default: false,
    metadata: { worldifact_setup: 'worldifact-portal-v1', worldifact_account: 'acct_Merchant', worldifact_kind: 'membership_management' },
    default_return_url: `${origin}/account/credits`, business_profile: { privacy_policy_url: `${origin}/privacy`, terms_of_service_url: `${origin}/terms` }, login_page: { enabled: false },
    features: {
      customer_update: { enabled: false }, subscription_update: { enabled: false }, payment_method_update: { enabled: true }, invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none', cancellation_reason: { enabled: false } },
    },
  };
}

function fixture() {
  const portals: Json[] = [];
  const calls: { method: string; url: URL; params: URLSearchParams; idempotency: string | null }[] = [];
  const uploads: BillingSecrets[] = [];
  const state = { charges: true, failUpload: false, adverseCreateDefaults: false, unsafeUpdateResponse: false, staleUpdateResponse: false };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers), params = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(headers.get('Authorization'), `Bearer ${key}`);
    assert.equal(headers.get('Stripe-Version'), '2024-06-20');
    const method = init?.method ?? 'GET';
    calls.push({ method, url, params, idempotency: headers.get('Idempotency-Key') });
    if (url.pathname === '/v1/account' && method === 'GET') return Response.json({ object: 'account', id: 'acct_Merchant', charges_enabled: state.charges, email: 'private@example.test', profile: key });
    if (url.pathname.startsWith('/v1/billing_portal/configurations/')) {
      const stored = portals.find(value => value.id === url.pathname.split('/').at(-1))!;
      assert.ok(stored);
      if (method === 'GET') return Response.json(stored);
      assert.equal(method, 'POST');
      const portal = state.staleUpdateResponse ? structuredClone(stored) : stored;
      assert.match(headers.get('Idempotency-Key')!, /^worldifact-portal-v1-bpc_[A-Za-z0-9]+-disable-v1-(u|r|ur)$/);
      for (const [field, value] of params) {
        assert.equal(value, 'false');
        if (field === 'features[subscription_update][enabled]') object(object(portal.features).subscription_update).enabled = false;
        else if (field === 'features[subscription_cancel][cancellation_reason][enabled]') object(object(object(portal.features).subscription_cancel).cancellation_reason).enabled = false;
        else assert.fail('Unexpected configuration update');
      }
      return Response.json(state.unsafeUpdateResponse ? { ...portal, id: 'bpc_Unrelated' } : portal);
    }
    assert.equal(url.pathname, '/v1/billing_portal/configurations');
    if (method === 'GET') return Response.json({ object: 'list', data: portals, has_more: false });
    assert.equal(method, 'POST');
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.equal(headers.get('Idempotency-Key'), 'worldifact-portal-v1-acct_Merchant-create-v3');
    // stripe-node v16.0.0 reflects API 2024-06-20: these CREATE objects have required
    // nested fields even when disabled, unlike ConfigurationUpdateParams.
    for (const [present, required] of [
      ['features[subscription_update][enabled]', ['features[subscription_update][default_allowed_updates]', 'features[subscription_update][products]']],
      ['features[subscription_cancel][cancellation_reason][enabled]', ['features[subscription_cancel][cancellation_reason][options]']],
    ] as const) {
      if (params.has(present)) for (const field of required) if (!params.has(field)) return Response.json({ error: { code: 'parameter_missing', param: field, message: `sensitive diagnostic ${key}` } }, { status: 400 });
    }
    assert.equal(params.get('features[subscription_cancel][enabled]'), 'true');
    assert.equal(params.get('features[subscription_cancel][mode]'), 'at_period_end');
    assert.equal(params.get('features[subscription_cancel][proration_behavior]'), 'none');
    assert.equal(params.get('features[payment_method_update][enabled]'), 'true');
    assert.equal(params.get('login_page[enabled]'), 'false');
    assert.equal(params.has('is_default'), false);
    const portal = configuration();
    if (state.adverseCreateDefaults) {
      object(object(portal.features).subscription_update).enabled = true;
      object(object(object(portal.features).subscription_cancel).cancellation_reason).enabled = true;
    }
    portals.push(portal);
    return Response.json(portal);
  }) as typeof fetch;
  const upload = (payload: BillingSecrets) => {
    if (state.failUpload) throw new Error(`private synchronization diagnostic ${key}`);
    uploads.push(payload);
  };
  const dependencies = { fetcher, upload };
  return { portals, calls, uploads, state, dependencies, run: () => prepareStripePortal(env, dependencies), posts: () => calls.filter(call => call.method === 'POST') };
}

test('portal preparation creates one dedicated cancellation configuration and stores only its ID', async () => {
  const f = fixture();
  const result = await f.run();
  assert.deepEqual(result, { status: 'portal_configured_without_checkout_activation', configurationId: 'bpc_WorldifactV1' });
  assert.deepEqual(f.uploads, [{ STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_WorldifactV1' }]);
  assert.equal(f.posts().length, 1);
  assert.equal(f.portals.length, 1);
  for (const privateValue of [key, 'acct_Merchant', 'private@example.test']) assert.ok(!JSON.stringify(result).includes(privateValue));
  assert.ok(f.calls.every(call => ['/v1/account', '/v1/billing_portal/configurations'].includes(call.url.pathname)));
});

test('a failed Cloudflare synchronization resumes by reusing the owned portal without duplicating or modifying it', async () => {
  const f = fixture();
  f.state.failUpload = true;
  await assert.rejects(f.run(), error => {
    const message = stripePortalErrorMessage(error);
    assert.match(message, /secret synchronization/);
    assert.ok(!message.includes(key));
    return true;
  });
  assert.equal(f.portals.length, 1);
  f.state.failUpload = false;
  f.calls.length = 0;
  await f.run();
  assert.equal(f.posts().length, 0);
  assert.equal(f.portals.length, 1);
  assert.equal(f.uploads.length, 1);
});

test('incompatible, inactive, foreign-account or malformed owned portals require review before any write', async () => {
  const mutations = [
    (p: Json) => { p.active = false; }, (p: Json) => { p.livemode = false; }, (p: Json) => { p.application = 'ca_Other'; },
    (p: Json) => { p.is_default = 'true'; }, (p: Json) => { object(p.metadata).worldifact_account = 'acct_Other'; },
    (p: Json) => { object(object(p.features).subscription_cancel).enabled = false; },
    (p: Json) => { object(object(p.features).subscription_cancel).mode = 'immediately'; },
    (p: Json) => { object(object(p.features).subscription_cancel).proration_behavior = 'create_prorations'; },
    (p: Json) => { object(object(p.features).subscription_cancel).retention = { type: 'coupon_offer' }; },
    (p: Json) => { object(object(p.features).subscription_update).enabled = 'true'; },
    (p: Json) => { object(p.login_page).enabled = true; }, (p: Json) => { p.default_return_url = 'https://other.example'; },
  ];
  for (const mutate of mutations) {
    const f = fixture(), portal = configuration();
    mutate(portal); f.portals.push(portal);
    await assert.rejects(f.run(), /reviewed cancellation policy/);
    assert.equal(f.posts().length, 0);
    assert.equal(f.uploads.length, 0);
  }
});

test('unrelated account configurations remain untouched and duplicate owned configurations are rejected', async () => {
  const f = fixture(), unrelated = configuration('bpc_ExistingDefault');
  unrelated.metadata = {}; unrelated.is_default = true;
  const original = structuredClone(unrelated);
  f.portals.push(unrelated);
  await f.run();
  assert.deepEqual(f.portals[0], original);
  f.calls.length = 0;
  f.portals.push(configuration('bpc_Duplicate'));
  await assert.rejects(f.run(), /Multiple owned configurations/);
  assert.equal(f.posts().length, 0);
  assert.equal(f.uploads.length, 1);
});

test('all configuration pages are checked before creating, and ambiguous pagination cannot create a duplicate', async () => {
  const f = fixture();
  let pages = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/account') return f.dependencies.fetcher(input, init);
    assert.equal(init?.method, 'GET');
    pages++;
    if (pages === 1) return Response.json({ object: 'list', data: [{ ...configuration('bpc_Unrelated'), metadata: {} }], has_more: true });
    assert.equal(url.searchParams.get('starting_after'), 'bpc_Unrelated');
    return Response.json({ object: 'list', data: [configuration()], has_more: false });
  }) as typeof fetch;
  await prepareStripePortal(env, { ...f.dependencies, fetcher });
  assert.equal(pages, 2);
  assert.equal(f.uploads.length, 1);
  pages = 0;
  const loopFetcher = (async (input: string | URL | Request, init?: RequestInit) => String(input).endsWith('/account') ? f.dependencies.fetcher(input, init) : Response.json({ object: 'list', data: [configuration('bpc_Repeated')], has_more: true })) as typeof fetch;
  await assert.rejects(prepareStripePortal(env, { ...f.dependencies, fetcher: loopFetcher }), /pagination is ambiguous/);
  assert.equal(f.uploads.length, 1);
});

test('invalid keys and inactive live accounts fail before any provider configuration changes', async () => {
  const f = fixture();
  for (const value of ['', 'pk_live_private', `sk_test_${'x'.repeat(32)}`, `sk_org_${'x'.repeat(32)}`]) {
    await assert.rejects(prepareStripePortal({ STRIPE_SECRET_KEY: value }, f.dependencies), /credentials/);
    assert.equal(f.calls.length, 0);
  }
  f.state.charges = false;
  await assert.rejects(f.run(), /not ready to accept payments/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.posts().length, 0);
});

test('provider permission failures, redirects, malformed responses and transport errors never leak sensitive details', async () => {
  for (const produce of [
    () => Response.json({ error: key }, { status: 403 }),
    () => new Response(key, { status: 302, headers: { Location: 'https://untrusted.example' } }),
    () => new Response(key),
    () => new Response('x'.repeat(256_001)),
    () => new Response('', { headers: { 'Content-Length': '256001' } }),
    () => { throw new Error(key); },
  ]) {
    const f = fixture();
    let calls = 0;
    const fetcher = (async () => { calls++; return produce(); }) as typeof fetch;
    await assert.rejects(prepareStripePortal(env, { ...f.dependencies, fetcher }), error => {
      assert.ok(!stripePortalErrorMessage(error).includes(key));
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(f.uploads.length, 0);
  }
  assert.ok(!stripePortalErrorMessage(new Error(key)).includes(key));
});

test('pinned create schema requires complete disabled objects with explicit Emptyable arrays', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.configurationId, 'bpc_WorldifactV1');
  const portal = f.portals[0], cancel = object(object(portal.features).subscription_cancel);
  assert.equal(object(object(portal.features).subscription_update).enabled, false);
  assert.equal(object(cancel.cancellation_reason).enabled, false);
  const request = f.posts()[0];
  for (const field of ['features[subscription_update][default_allowed_updates]', 'features[subscription_update][products]', 'features[subscription_cancel][cancellation_reason][options]']) {
    assert.equal(request.params.get(field), '');
    const partial = new URLSearchParams(request.params);
    partial.delete(field);
    const response = await f.dependencies.fetcher('https://api.stripe.com/v1/billing_portal/configurations', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(1000),
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20', 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': request.idempotency! },
      body: partial.toString(),
    });
    assert.equal(response.status, 400);
    assert.equal(object(object(await response.json()).error).code, 'parameter_missing');
  }
  assert.equal(f.portals.length, 1);
});

test('only adverse disabled-feature defaults on a verified owned portal are normalized once and reused', async () => {
  for (const mode of ['create', 'existing-reasons', 'existing-update', 'existing-both']) {
    const f = fixture();
    if (mode === 'create') f.state.adverseCreateDefaults = true;
    else {
      const portal = configuration();
      if (mode !== 'existing-reasons') object(object(portal.features).subscription_update).enabled = true;
      if (mode !== 'existing-update') object(object(object(portal.features).subscription_cancel).cancellation_reason).enabled = true;
      f.portals.push(portal);
    }
    const result = await f.run();
    assert.deepEqual(result.normalizedFields, mode === 'existing-reasons' ? ['cancellation_reason.enabled'] : mode === 'existing-update' ? ['subscription_update.enabled'] : ['subscription_update.enabled', 'cancellation_reason.enabled']);
    assert.equal(f.posts().length, mode === 'create' ? 2 : 1);
    assert.equal(f.portals.length, 1);
    assert.deepEqual([...f.posts().at(-1)!.params.values()], result.normalizedFields!.map(() => 'false'));
    f.calls.length = 0;
    const repeated = await f.run();
    assert.equal(repeated.normalizedFields, undefined);
    assert.equal(f.posts().length, 0);
  }
});

test('normalization never repairs unrelated policy failures, unknown booleans or private field values', async () => {
  for (const mutate of [
    (p: Json) => { p.is_default = true; }, (p: Json) => { p.active = false; },
    (p: Json) => { object(p.metadata).worldifact_account = key; },
    (p: Json) => { p.default_return_url = key; },
    (p: Json) => { object(object(p.features).subscription_cancel).mode = key; },
    (p: Json) => { object(object(p.features).subscription_update).enabled = 'true'; },
  ]) {
    const f = fixture(), portal = configuration();
    object(object(object(portal.features).subscription_cancel).cancellation_reason).enabled = true;
    mutate(portal); f.portals.push(portal);
    await assert.rejects(f.run(), error => {
      const message = stripePortalErrorMessage(error);
      assert.match(message, /Mismatched fields:/);
      assert.ok(!message.includes(key));
      return true;
    });
    assert.equal(f.posts().length, 0);
    assert.equal(f.uploads.length, 0);
  }
  const f = fixture(), portal = configuration();
  object(object(portal.features).subscription_update).enabled = true;
  f.portals.push(portal); f.state.unsafeUpdateResponse = true;
  await assert.rejects(f.run(), /Mismatched fields: id/);
  assert.equal(f.posts().length, 1);
  assert.equal(f.uploads.length, 0);
});

test('a matching owned portal marked default by Stripe is reused without modification', async () => {
  const f = fixture(), portal = configuration();
  portal.is_default = true;
  f.portals.push(portal);
  const result = await f.run();
  assert.equal(result.configurationId, 'bpc_WorldifactV1');
  assert.equal(f.posts().length, 0);
  assert.deepEqual(f.uploads, [{ STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_WorldifactV1' }]);
  portal.is_default = 'true';
  await assert.rejects(f.run(), /Mismatched fields: is_default/);
  assert.equal(f.posts().length, 0);
});

test('a cached normalization response cannot override a fresh provider read showing the feature still enabled', async () => {
  const f = fixture(), portal = configuration();
  object(object(portal.features).subscription_update).enabled = true;
  f.portals.push(portal); f.state.staleUpdateResponse = true;
  await assert.rejects(f.run(), /Mismatched fields: subscription_update.enabled/);
  assert.equal(f.posts().length, 1);
  assert.equal(f.calls.at(-1)!.method, 'GET');
  assert.equal(f.calls.at(-1)!.url.pathname, '/v1/billing_portal/configurations/bpc_WorldifactV1');
  assert.equal(f.uploads.length, 0);
});

test('provider diagnostics expose only exact allowlisted codes and parameter names, never raw messages or arbitrary values', async () => {
  for (const error of [
    { code: 'parameter_missing', param: 'features[subscription_update][products]', message: key, extra: key },
    { code: key, param: key, message: key },
    { code: 'parameter_unknown', param: `features[${key}]`, message: key },
    { code: `parameter_missing${key}`, param: `features[subscription_update][products]${key}`, message: key },
  ]) {
    const f = fixture();
    const fetcher = (async () => Response.json({ error }, { status: 400 })) as typeof fetch;
    await assert.rejects(prepareStripePortal(env, { ...f.dependencies, fetcher }), value => {
      const message = stripePortalErrorMessage(value);
      assert.match(message, /HTTP 400/);
      assert.ok(!message.includes(key));
      if (error.code === 'parameter_missing') assert.match(message, /parameter_missing; features\[subscription_update\]\[products\]/);
      else if (error.code === 'parameter_unknown') assert.match(message, /\(parameter_unknown\)/);
      else assert.ok(!message.includes('parameter_missing'));
      return true;
    });
    assert.equal(f.uploads.length, 0);
  }
});

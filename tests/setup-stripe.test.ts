import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStripe, stripeSetupErrorMessage } from '../scripts/setup-stripe.ts';
import type { BillingSecrets } from '../scripts/connect-billing.ts';

const key = `sk_live_${'s'.repeat(32)}`;
const webhookSecret = `whsec_${'w'.repeat(32)}`;
const env = { STRIPE_SECRET_KEY: key, STRIPE_CONFIG_SOURCE: 'cloudflare' };
const webhookUrl = 'https://worldifact.xodobrox.workers.dev/api/billing/webhook';
type Json = Record<string, unknown>;
const asObject = (value: unknown) => value as Json;

function fixture(expectedKey = key) {
  const state = { now: Date.UTC(2026, 8, 22, 12), failUpload: false, charges: true, payouts: true };
  const products = new Map<string, Json>();
  const prices = new Map<string, Json>();
  const endpoints: Json[] = [];
  const cached = new Map<string, { body: string; response: Json }>();
  const calls: { method: string; path: string; params: URLSearchParams; idempotencyKey: string | null }[] = [];
  const uploads: BillingSecrets[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(headers.get('Authorization'), `Bearer ${expectedKey}`);
    assert.equal(headers.get('Stripe-Version'), '2024-06-20');
    const method = init?.method ?? 'GET';
    const params = new URLSearchParams(String(init?.body ?? ''));
    const idempotencyKey = headers.get('Idempotency-Key');
    calls.push({ method, path: url.pathname, params, idempotencyKey });
    if (method === 'GET') {
      assert.equal(idempotencyKey, null);
      if (url.pathname === '/v1/account') return Response.json({ object: 'account', id: 'acct_TestMerchant', charges_enabled: state.charges, payouts_enabled: state.payouts, email: 'never-log@example.test', business_profile: { private: key } });
      if (url.pathname === '/v1/webhook_endpoints') return Response.json({ object: 'list', data: endpoints.map(({ secret: _secret, ...endpoint }) => endpoint), has_more: false });
      if (url.pathname.startsWith('/v1/products/')) {
        const product = products.get(url.pathname.split('/').at(-1)!);
        return product ? Response.json(product) : Response.json({ error: { private: key } }, { status: 404 });
      }
      if (url.pathname === '/v1/prices') {
        assert.equal(url.searchParams.get('expand[]'), 'data.product');
        const price = prices.get(url.searchParams.get('lookup_keys[]')!);
        return Response.json({ object: 'list', data: price ? [price] : [], has_more: false });
      }
      assert.fail(`Unexpected read ${url.pathname}`);
    }
    assert.equal(method, 'POST');
    assert.ok(idempotencyKey?.startsWith('worldifact-stripe-v1-acct_TestMerchant-'));
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    const previous = cached.get(idempotencyKey!);
    if (previous) {
      assert.equal(params.toString(), previous.body, 'Replays must use precisely identical parameters');
      return Response.json(previous.response);
    }
    const metadata = Object.fromEntries([...params.entries()].flatMap(([name, value]) => name.startsWith('metadata[') ? [[name.slice(9, -1), value]] : []));
    let response: Json;
    if (url.pathname === '/v1/products') {
      const id = params.get('id')!;
      assert.equal(products.has(id), false);
      response = { object: 'product', id, active: params.get('active') === 'true', name: params.get('name'), shippable: params.get('shippable') === 'true', livemode: true, metadata };
      products.set(id, response);
    } else if (url.pathname === '/v1/prices') {
      assert.equal(params.get('expand[]'), 'product');
      const kind = metadata.worldifact_kind;
      response = { object: 'price', id: `price_${kind}2999`, active: params.get('active') === 'true', livemode: true, product: products.get(params.get('product')!), lookup_key: params.get('lookup_key'), unit_amount: Number(params.get('unit_amount')), unit_amount_decimal: params.get('unit_amount'), currency: params.get('currency'), billing_scheme: params.get('billing_scheme'), transform_quantity: null, custom_unit_amount: null, tiers_mode: null, type: kind === 'subscription' ? 'recurring' : 'one_time', recurring: kind === 'subscription' ? { interval: params.get('recurring[interval]'), interval_count: Number(params.get('recurring[interval_count]')), usage_type: params.get('recurring[usage_type]'), trial_period_days: null } : null, metadata };
      prices.set(response.lookup_key as string, response);
    } else if (url.pathname === '/v1/webhook_endpoints') {
      assert.equal(params.get('connect'), 'false');
      assert.equal(endpoints.length, 0, 'Never create a duplicate endpoint');
      response = { object: 'webhook_endpoint', id: 'we_SetupEndpoint', url: params.get('url'), api_version: params.get('api_version'), description: params.get('description'), application: null, created: Math.floor(state.now / 1000), livemode: true, status: 'enabled', enabled_events: params.getAll('enabled_events[]'), metadata, secret: webhookSecret };
      endpoints.push(response);
    } else assert.fail(`Unexpected mutation ${url.pathname}`);
    cached.set(idempotencyKey!, { body: params.toString(), response });
    return Response.json(response);
  }) as typeof fetch;
  const upload = (payload: BillingSecrets) => {
    if (state.failUpload) throw new Error(`Provider error containing ${key} and ${webhookSecret}`);
    uploads.push(payload);
  };
  const dependencies = { fetcher, upload, now: () => state.now };
  const posts = () => calls.filter(call => call.method === 'POST');
  return { state, products, prices, endpoints, cached, calls, uploads, dependencies, posts, run: (extra: NodeJS.ProcessEnv = {}) => setupStripe({ ...env, STRIPE_SECRET_KEY: expectedKey, ...extra }, dependencies) };
}

test('Stripe preparation creates exactly two fixed offers and one account webhook, storing secrets only in the server payload', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(f.products.size, 2);
  assert.equal(f.prices.size, 2);
  assert.equal(f.endpoints.length, 1);
  assert.equal(f.posts().length, 5);
  assert.deepEqual(result, { status: 'configured_without_checkout_activation', subscriptionPriceId: 'price_subscription2999', topupPriceId: 'price_topup2999', webhookId: 'we_SetupEndpoint', payoutsEnabled: true });
  assert.deepEqual(f.uploads, [{ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_SUBSCRIPTION_PRICE_ID: 'price_subscription2999', STRIPE_TOPUP_PRICE_ID: 'price_topup2999', STRIPE_MODE: 'live', STRIPE_SUBSCRIPTION_INTERVAL: 'month', ACCOUNT_LEDGER_MODE: 'live', BILLING_PUBLIC_ORIGIN: 'https://worldifact.xodobrox.workers.dev' }]);
  const endpoint = f.endpoints[0];
  assert.equal(endpoint.url, webhookUrl);
  assert.deepEqual(endpoint.enabled_events, ['invoice.paid', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated']);
  for (const price of f.prices.values()) {
    assert.equal(price.unit_amount, 2999);
    assert.equal(price.currency, 'usd');
    assert.equal(asObject(price.metadata).worldifact_credits, '1500');
  }
  const publicOutput = JSON.stringify(result);
  for (const privateValue of [key, webhookSecret, 'never-log@example.test', 'acct_TestMerchant']) assert.ok(!publicOutput.includes(privateValue));
  assert.ok(!Object.keys(f.uploads[0]).some(name => name.startsWith('ENABLE_') || name === 'ENFORCE_ACCOUNT_ENTITLEMENTS'));
  assert.ok(f.calls.every(call => !/checkout|customers|charges|payouts|transfers/.test(call.path)));
});

test('an interrupted secret upload resumes inside the idempotency window without duplicating prices or webhook', async () => {
  const f = fixture();
  f.state.failUpload = true;
  await assert.rejects(f.run(), error => {
    const message = stripeSetupErrorMessage(error);
    assert.match(message, /secret synchronization/);
    assert.ok(!message.includes(key) && !message.includes(webhookSecret));
    return true;
  });
  assert.equal(f.endpoints.length, 1);
  assert.equal(f.uploads.length, 0);
  f.state.failUpload = false;
  f.state.now += 60 * 60 * 1000;
  f.calls.length = 0;
  await f.run();
  assert.equal(f.products.size, 2);
  assert.equal(f.prices.size, 2);
  assert.equal(f.endpoints.length, 1);
  assert.deepEqual(f.posts().map(call => call.path), ['/v1/webhook_endpoints']);
  assert.equal(f.uploads[0].STRIPE_WEBHOOK_SECRET, webhookSecret);
});

test('old existing endpoints require their signing secret and are never automatically duplicated or rotated', async () => {
  const f = fixture();
  await f.run();
  f.calls.length = 0;
  f.state.now += 23 * 60 * 60 * 1000;
  await assert.rejects(f.run(), /signing secret must be supplied securely/);
  assert.equal(f.posts().length, 0);
  assert.equal(f.uploads.length, 1);
  f.state.now += 7 * 24 * 60 * 60 * 1000;
  await f.run({ STRIPE_WEBHOOK_SECRET: webhookSecret });
  assert.equal(f.posts().length, 0);
  assert.equal(f.uploads.length, 2);
});

test('foreign, duplicate and incompatible endpoints stop before creating other resources', async () => {
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.endpoints[0].metadata = {}; },
    (f: ReturnType<typeof fixture>) => { f.endpoints[0].api_version = 'wrong-version'; },
    (f: ReturnType<typeof fixture>) => { f.endpoints[0].enabled_events = ['*']; },
    (f: ReturnType<typeof fixture>) => { f.endpoints[0].status = 'disabled'; },
    (f: ReturnType<typeof fixture>) => { f.endpoints[0].application = 'ca_AnotherAccount'; },
    (f: ReturnType<typeof fixture>) => { f.endpoints.push({ ...f.endpoints[0], id: 'we_Duplicate' }); },
  ]) {
    const f = fixture();
    await f.run();
    mutation(f);
    f.calls.length = 0;
    f.products.clear();
    f.prices.clear();
    await assert.rejects(f.run(), /webhook preflight/);
    assert.equal(f.posts().length, 0);
    assert.equal(f.uploads.length, 1);
  }
});

test('invalid existing prices fail before any creation or secret synchronization', async () => {
  const mutations: ((price: Json) => void)[] = [
    price => { price.unit_amount = 3000; },
    price => { price.unit_amount_decimal = '2999.5'; },
    price => { price.currency = 'eur'; },
    price => { price.active = false; },
    price => { price.livemode = false; },
    price => { price.billing_scheme = 'tiered'; },
    price => { price.transform_quantity = { divide_by: 10, round: 'up' }; },
    price => { price.custom_unit_amount = { enabled: true }; },
    price => { price.tiers_mode = 'graduated'; },
    price => { asObject(price.recurring).interval = 'year'; },
    price => { asObject(price.recurring).interval_count = 2; },
    price => { asObject(price.recurring).usage_type = 'metered'; },
    price => { asObject(price.recurring).trial_period_days = 14; },
    price => { price.metadata = {}; },
    price => { price.product = 'prod_notExpanded'; },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    await f.run();
    mutate([...f.prices.values()][0]);
    f.calls.length = 0;
    await assert.rejects(f.run(), /price preflight/);
    assert.equal(f.posts().length, 0);
    assert.equal(f.uploads.length, 1);
  }
});

test('the second offer is checked before creating a missing first offer', async () => {
  const f = fixture();
  await f.run();
  const first = [...f.prices.keys()][0];
  f.prices.delete(first);
  asObject([...f.prices.values()][0]).currency = 'gbp';
  f.calls.length = 0;
  await assert.rejects(f.run(), /price preflight/);
  assert.equal(f.posts().length, 0);
});

test('live account and credential readiness are checked before any Stripe writes', async () => {
  const f = fixture();
  f.state.charges = false;
  await assert.rejects(f.run(), /live account is not ready/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.posts().length, 0);
  for (const value of ['', 'sk_test_private', 'rk_live_private', key.slice(0, 20) + '\n' + key.slice(20)]) {
    f.calls.length = 0;
    await assert.rejects(f.run({ STRIPE_SECRET_KEY: value }), /credentials/);
    assert.equal(f.calls.length, 0);
  }
  f.state.charges = true;
  f.state.payouts = false;
  assert.equal((await f.run()).payoutsEnabled, false);
});

test('standard and restricted live keys accept surrounding copy whitespace and store only the normalized credential', async () => {
  for (const value of [key, `rk_live_${'r'.repeat(32)}`]) {
    const f = fixture(value);
    const result = await f.run({ STRIPE_SECRET_KEY: ` \r\n\t${value}\n ` });
    assert.equal(f.uploads[0].STRIPE_SECRET_KEY, value);
    assert.equal(result.status, 'configured_without_checkout_activation');
    assert.ok(!JSON.stringify(result).includes(value));
  }
});

test('incorrect credential categories have fixed useful diagnostics without showing any submitted value', async () => {
  const cases = [
    ['', /missing or empty/],
    [' \n\t ', /missing or empty/],
    [`pk_live_${'p'.repeat(32)}`, /publishable client key/],
    [`pk_test_${'p'.repeat(32)}`, /publishable client key/],
    [`sk_test_${'t'.repeat(32)}`, /test-mode key/],
    [`rk_test_${'t'.repeat(32)}`, /test-mode key/],
    [`sk_org_${'o'.repeat(32)}`, /Organization keys/],
    [webhookSecret, /webhook signing secret/],
    ['WORLDIFACT production', /not a complete supported/],
    [`"${key}"`, /not a complete supported/],
    [key.slice(0, 20) + '\n' + key.slice(20), /not a complete supported/],
  ] as const;
  for (const [value, reason] of cases) {
    const f = fixture();
    await assert.rejects(f.run({ STRIPE_SECRET_KEY: value }), error => {
      const message = stripeSetupErrorMessage(error);
      assert.match(message, reason);
      if (value.trim()) assert.ok(!message.includes(value.trim()));
      assert.ok(!message.includes(key) && !message.includes(webhookSecret));
      return true;
    });
    assert.equal(f.calls.length, 0);
    assert.equal(f.uploads.length, 0);
  }
});

test('a restricted key rejected by Stripe permissions stops without mutations or secret synchronization', async () => {
  const restricted = `rk_live_${'r'.repeat(32)}`;
  let calls = 0;
  let uploads = 0;
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${restricted}`);
    return Response.json({ error: { message: `Private permission detail ${restricted}` } }, { status: 403 });
  }) as typeof fetch;
  await assert.rejects(setupStripe({ ...env, STRIPE_SECRET_KEY: restricted }, { fetcher, upload: () => { uploads++; } }), error => {
    const message = stripeSetupErrorMessage(error);
    assert.match(message, /HTTP 403/);
    assert.ok(!message.includes(restricted));
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(uploads, 0);
});

test('transport errors, redirects, malformed JSON and oversized provider bodies never expose sensitive data', async () => {
  for (const fetcher of [
    async () => { throw new Error(key); },
    async () => new Response(key, { status: 302, headers: { Location: 'https://untrusted.invalid/' } }),
    async () => new Response(key, { status: 401 }),
    async () => new Response(key, { status: 200 }),
    async () => new Response(JSON.stringify({ private: key.repeat(10_000) })),
    async () => new Response('{}', { headers: { 'Content-Length': '999999' } }),
  ]) {
    let uploads = 0;
    await assert.rejects(setupStripe(env, { fetcher: fetcher as typeof fetch, upload: () => { uploads++; } }), error => {
      const message = stripeSetupErrorMessage(error);
      assert.match(message, /Stripe setup stopped during account/);
      assert.ok(!message.includes(key) && !message.includes('untrusted.invalid'));
      return true;
    });
    assert.equal(uploads, 0);
  }
  assert.equal(stripeSetupErrorMessage(new Error(key)), 'Stripe setup failed. Sensitive details suppressed.');
});

test('webhook inspection follows bounded pagination and finds an existing endpoint on a later page', async () => {
  const f = fixture();
  await f.run();
  f.calls.length = 0;
  f.state.now += 24 * 60 * 60 * 1000;
  let pages = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/webhook_endpoints' && init?.method === 'GET') {
      pages++;
      if (pages === 1) return Response.json({ object: 'list', data: [{ id: 'we_Unrelated', url: 'https://example.test/billing' }], has_more: true });
      assert.equal(url.searchParams.get('starting_after'), 'we_Unrelated');
    }
    return f.dependencies.fetcher(input, init);
  }) as typeof fetch;
  await assert.rejects(setupStripe(env, { ...f.dependencies, fetcher }), /signing secret must be supplied securely/);
  assert.equal(pages, 2);
  assert.equal(f.posts().length, 0);
});

test('a replay returning another endpoint is refused before uploading any secret', async () => {
  const f = fixture();
  await f.run();
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await f.dependencies.fetcher(input, init);
    if (new URL(String(input)).pathname === '/v1/webhook_endpoints' && init?.method === 'POST') {
      return Response.json({ ...asObject(await response.json()), id: 'we_UnexpectedReplacement' });
    }
    return response;
  }) as typeof fetch;
  await assert.rejects(setupStripe(env, { ...f.dependencies, fetcher }), /replay did not return the existing endpoint/);
  assert.equal(f.uploads.length, 1);
});

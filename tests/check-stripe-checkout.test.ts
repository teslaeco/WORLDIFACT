import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStripeCheckout, stripeCheckoutCheckErrorMessage } from '../scripts/check-stripe-checkout.ts';

const key = `rk_live_${'private'.repeat(8)}`;
const env = { STRIPE_SECRET_KEY: key, GITHUB_RUN_ID: '35799999999', GITHUB_RUN_ATTEMPT: '1' };
type Json = Record<string, unknown>;
const price = () => ({ id: 'price_ApprovedMonthly', object: 'price', lookup_key: 'worldifact_membership_1500_usd_2999_month_v1', livemode: true, active: true, unit_amount: 2999, currency: 'usd', type: 'recurring', billing_scheme: 'per_unit', transform_quantity: null, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null } });
function fixture() {
  const calls: { path: string; method: string; params: URLSearchParams; idempotency: string | null }[] = [];
  const state = { price: price() as Json, session: {} as Json, expiration: {} as Json, error: null as Response | null };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers), params = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(init?.redirect, 'manual');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(headers.get('Authorization'), `Bearer ${key}`);
    assert.equal(headers.get('Stripe-Version'), '2024-06-20');
    const call = { path: url.pathname, method: init?.method ?? 'GET', params, idempotency: headers.get('Idempotency-Key') };
    calls.push(call);
    if (url.pathname === '/v1/prices') {
      assert.equal(url.searchParams.get('lookup_keys[]'), price().lookup_key);
      return Response.json({ object: 'list', has_more: false, data: [state.price] });
    }
    if (url.pathname === '/v1/prices/price_ApprovedMonthly') return Response.json(state.price);
    assert.equal(call.method, 'POST');
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    if (url.pathname === '/v1/checkout/sessions') {
      if (state.error) return state.error;
      const probe = params.get('metadata[worldifact_probe]');
      return Response.json({ id: 'cs_live_PrivateProbe', object: 'checkout.session', livemode: true, mode: 'subscription', status: 'open', payment_status: 'unpaid', customer: null, metadata: { worldifact_probe: probe }, amount_total: 2999, currency: 'usd', client_reference_id: probe, url: 'https://checkout.stripe.com/c/pay/cs_live_PrivateProbe', ...state.session });
    }
    assert.equal(url.pathname, '/v1/checkout/sessions/cs_live_PrivateProbe/expire');
    return Response.json({ id: 'cs_live_PrivateProbe', object: 'checkout.session', livemode: true, status: 'expired', payment_status: 'unpaid', ...state.expiration });
  }) as typeof fetch;
  return { calls, state, fetcher, run: (extra = {}) => checkStripeCheckout({ ...env, ...extra }, { fetcher }) };
}

test('preflight opens an isolated unpaid session and immediately expires it without account or payment mutations', async () => {
  const f = fixture();
  const result = await f.run();
  assert.deepEqual(result, { status: 'checkout_verified_without_charge', amount: 2999, currency: 'USD', expired: true });
  assert.deepEqual(f.calls.map(c => c.path), ['/v1/prices', '/v1/checkout/sessions', '/v1/checkout/sessions/cs_live_PrivateProbe/expire']);
  const create = f.calls[1], expire = f.calls[2];
  assert.equal(create.params.get('mode'), 'subscription');
  assert.equal(create.params.get('line_items[0][price]'), price().id);
  assert.equal(create.params.get('line_items[0][quantity]'), '1');
  assert.equal(create.params.get('payment_method_types[0]'), 'card');
  assert.equal(create.params.get('allow_promotion_codes'), 'false');
  assert.match(create.params.get('metadata[worldifact_probe]')!, /^[0-9a-f-]{36}$/);
  for (const name of ['customer', 'customer_email', 'payment_method', 'metadata[worldifact_uid]', 'subscription_data[metadata][worldifact_uid]', 'expires_at']) assert.equal(create.params.has(name), false);
  assert.equal(expire.params.size, 0);
  assert.equal(expire.idempotency, `${create.idempotency}-expire`);
  assert.ok(!JSON.stringify(result).includes('cs_live_'));
  const again = fixture(); await again.run();
  assert.equal(again.calls[1].params.toString(), create.params.toString());
  assert.equal(again.calls[1].idempotency, create.idempotency);
});

test('an explicit price is verified and incompatible prices cannot create checkout', async () => {
  const f = fixture(); await f.run({ STRIPE_SUBSCRIPTION_PRICE_ID: price().id });
  assert.equal(f.calls[0].path, '/v1/prices/price_ApprovedMonthly');
  for (const patch of [{ unit_amount: 3000 }, { currency: 'eur' }, { livemode: false }, { active: false }, { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }, { recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: 7 } }, { transform_quantity: { divide_by: 2 } }]) {
    const bad = fixture(); Object.assign(bad.state.price, patch);
    await assert.rejects(bad.run(), /price could not be verified/);
    assert.equal(bad.calls.length, 1);
  }
});

test('provider diagnostics retain useful fixed words and known fields without secrets, identities or URLs', async () => {
  for (const status of [400, 403]) {
    const f = fixture();
    f.state.error = Response.json({ error: { type: 'invalid_request_error', code: 'parameter_missing', param: 'business_profile[name]', message: `To use Checkout, you must set a business name. ${key} sk_live_short cus_Private price_Private private@example.test https://dashboard.stripe.com/private SECRETNAME` } }, { status });
    await assert.rejects(f.run(), error => {
      const message = stripeCheckoutCheckErrorMessage(error);
      assert.match(message, new RegExp(`checkout_create: HTTP ${status}`));
      assert.match(message, /type=invalid_request_error; code=parameter_missing; parameter=business_profile\[name\]/);
      assert.match(message, /to use checkout you must set a business name/);
      for (const privateValue of [key.toLowerCase(), 'sk_live_short', 'cus_private', 'price_private', 'private@example.test', 'https:', 'secretname']) assert.ok(!message.toLowerCase().includes(privateValue));
      return true;
    });
    assert.equal(f.calls.length, 2);
  }
  const f = fixture();
  f.state.error = Response.json({ error: { type: key, code: key, param: key, message: key } }, { status: 400 });
  await assert.rejects(f.run(), error => {
    assert.match(stripeCheckoutCheckErrorMessage(error), /type=unclassified; code=unclassified; parameter=unclassified; message=\[redacted\]/);
    return true;
  });
  assert.equal(stripeCheckoutCheckErrorMessage(new Error(key)), 'Checkout preflight failed. Sensitive details suppressed.');
});

test('an owned unpaid session with an incorrect offer is expired, while foreign or paid sessions are never modified', async () => {
  const incorrect = fixture(); incorrect.state.session.amount_total = 3000;
  await assert.rejects(incorrect.run(), /offer could not be verified/);
  assert.equal(incorrect.calls.at(-1)?.path.endsWith('/expire'), true);
  for (const patch of [{ customer: 'cus_Existing' }, { payment_status: 'paid' }, { metadata: { worldifact_probe: 'foreign' } }, { livemode: false }]) {
    const f = fixture(); f.state.session = patch;
    await assert.rejects(f.run(), /isolated unpaid checkout/);
    assert.equal(f.calls.length, 2);
  }
  const unexpired = fixture(); unexpired.state.expiration.status = 'open';
  await assert.rejects(unexpired.run(), /expiration could not be verified/);
});

test('redirects, oversized responses and transport details cannot expose credentials or proceed', async () => {
  const responses = [new Response(null, { status: 302, headers: { Location: `https://other.test/${key}` } }), new Response(key, { headers: { 'Content-Length': '256001' } }), new Response(key.repeat(5000))];
  for (const response of responses) {
    let calls = 0;
    const fetcher = (async () => { calls++; return response; }) as typeof fetch;
    await assert.rejects(checkStripeCheckout(env, { fetcher }), error => {
      assert.ok(!stripeCheckoutCheckErrorMessage(error).includes(key));
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(checkStripeCheckout(env, { fetcher: (async () => { throw new Error(key); }) as typeof fetch }), error => {
    assert.match(stripeCheckoutCheckErrorMessage(error), /request failed or timed out/);
    assert.ok(!stripeCheckoutCheckErrorMessage(error).includes(key));
    return true;
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { connectBilling, readBillingSecrets, uploadBillingSecrets } from '../scripts/connect-billing.ts';

const stripe = {
  STRIPE_SECRET_KEY: `sk_live_${'a'.repeat(32)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${'b'.repeat(32)}`,
  STRIPE_SUBSCRIPTION_PRICE_ID: 'price_monthly2999',
  STRIPE_TOPUP_PRICE_ID: 'price_topup3000',
};
const paypal = {
  PAYPAL_CLIENT_ID: 'paypal-client-identifier', PAYPAL_CLIENT_SECRET: 'paypal-private-credential',
  PAYPAL_WEBHOOK_ID: 'ABCDEFGHIJ123456', PAYPAL_MERCHANT_ID: 'ABCDE12345678',
};
const neverUpload = () => { assert.fail('No synchronization should occur'); };

test('absent billing credentials preserve Worker secrets without writes', () => {
  assert.equal(readBillingSecrets({}), null);
  assert.match(connectBilling({}, neverUpload), /preserved/);
});

test('partial provider groups are rejected before any synchronization', () => {
  for (const [env, missing] of [
    [{ STRIPE_SECRET_KEY: stripe.STRIPE_SECRET_KEY }, 'STRIPE_WEBHOOK_SECRET'],
    [{ ...stripe, PAYPAL_CLIENT_ID: paypal.PAYPAL_CLIENT_ID }, 'PAYPAL_CLIENT_SECRET'],
    [{ ...paypal, STRIPE_PREVIOUS_TOPUP_PRICE_IDS: 'price_old' }, 'STRIPE_SECRET_KEY'],
  ] as const) assert.throws(() => connectBilling(env, neverUpload), new RegExp(missing));
});

test('Stripe configuration uses the fixed live origin and monthly interval without activating checkout', () => {
  const payload = readBillingSecrets({ ...stripe, ENABLE_BILLING: 'true', ENABLE_PAYPAL_BILLING: 'true', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true' })!;
  assert.deepEqual(payload, { ...stripe, STRIPE_MODE: 'live', STRIPE_SUBSCRIPTION_INTERVAL: 'month', ACCOUNT_LEDGER_MODE: 'live', BILLING_PUBLIC_ORIGIN: 'https://worldifact.xodobrox.workers.dev' });
  assert.ok(!Object.keys(payload).some(name => name.startsWith('ENABLE_') || name === 'ENFORCE_ACCOUNT_ENTITLEMENTS'));
});

test('PayPal is an independent optional complete provider and can be synchronized with Stripe', () => {
  for (const env of [paypal, { ...stripe, ...paypal }]) {
    let uploads = 0;
    const status = connectBilling(env, payload => {
      uploads++;
      assert.equal(payload.PAYPAL_MODE, 'live');
      assert.equal(payload.PAYPAL_MERCHANT_ID, paypal.PAYPAL_MERCHANT_ID);
      assert.equal(payload.ACCOUNT_LEDGER_MODE, 'live');
    });
    assert.equal(uploads, 1);
    assert.match(status, /PayPal/);
    assert.match(status, /unverified/);
    for (const value of Object.values(env)) assert.ok(!status.includes(value));
  }
});

test('malformed secret validation names the field without exposing submitted values', () => {
  for (const [field, value, env] of [
    ['STRIPE_SECRET_KEY', `sk_test_${'c'.repeat(32)}`, stripe],
    ['STRIPE_WEBHOOK_SECRET', `${stripe.STRIPE_WEBHOOK_SECRET}\n`, stripe],
    ['STRIPE_SUBSCRIPTION_PRICE_ID', 'prod_wrongResource', stripe],
    ['STRIPE_TOPUP_PRICE_ID', 'https://private.invalid', stripe],
    ['PAYPAL_CLIENT_SECRET', 'private secret value', paypal],
    ['PAYPAL_WEBHOOK_ID', 'invalid-private-webhook', paypal],
    ['PAYPAL_MERCHANT_ID', 'invalid-private-merchant', paypal],
  ] as const) {
    assert.throws(() => connectBilling({ ...env, [field]: value }, neverUpload), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(field));
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
});

test('previous top-up IDs are validated and absence never requests deletion', () => {
  assert.equal(readBillingSecrets(stripe)!.STRIPE_PREVIOUS_TOPUP_PRICE_IDS, undefined);
  assert.equal(readBillingSecrets({ ...stripe, STRIPE_PREVIOUS_TOPUP_PRICE_IDS: 'price_old1, price_old2' })!.STRIPE_PREVIOUS_TOPUP_PRICE_IDS, 'price_old1,price_old2');
  for (const value of ['price_old,price_old', 'prod_wrong', Array.from({ length: 11 }, (_, i) => `price_old${i}`).join(',')]) {
    assert.throws(() => connectBilling({ ...stripe, STRIPE_PREVIOUS_TOPUP_PRICE_IDS: value }, neverUpload), /STRIPE_PREVIOUS_TOPUP_PRICE_IDS/);
  }
});

test('secret bulk upload uses captured stdin and removes credentials from child environment', () => {
  const payload = readBillingSecrets({ ...stripe, ...paypal })!;
  let writes = 0;
  uploadBillingSecrets(payload, (command, args, options) => {
    writes++;
    assert.equal(command, process.execPath);
    assert.deepEqual(args.slice(1), ['secret', 'bulk', '--name', 'worldifact']);
    assert.deepEqual(JSON.parse(options.input), payload);
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    for (const name of Object.keys({ ...stripe, ...paypal })) assert.equal(options.env[name], undefined);
    for (const secret of Object.values({ ...stripe, ...paypal })) assert.ok(!args.join(' ').includes(secret));
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, 'cloudflare-test-token');
    return { status: 0 };
  }, { ...stripe, ...paypal, CLOUDFLARE_API_TOKEN: 'cloudflare-test-token' });
  assert.equal(writes, 1);
});

test('failed provider command and thrown process errors cannot expose raw credential text', () => {
  const payload = readBillingSecrets(stripe)!;
  for (const runner of [
    () => ({ status: 1, stderr: stripe.STRIPE_SECRET_KEY }),
    () => ({ status: null, error: new Error(stripe.STRIPE_SECRET_KEY) }),
    () => { throw new Error(stripe.STRIPE_SECRET_KEY); },
  ]) {
    assert.throws(() => uploadBillingSecrets(payload, runner), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /sensitive output suppressed/);
      assert.ok(!error.message.includes(stripe.STRIPE_SECRET_KEY));
      return true;
    });
  }
});

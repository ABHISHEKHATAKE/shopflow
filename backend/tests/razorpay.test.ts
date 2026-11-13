import { hmacSha256, verifyCheckoutSignature, verifyWebhookSignature } from '../src/lib/razorpay';

describe('razorpay signatures', () => {
  const secret = 'test_secret';
  it('accepts a valid checkout signature', () => {
    const sig = hmacSha256('order_1|pay_1', secret);
    expect(verifyCheckoutSignature('order_1', 'pay_1', sig, secret)).toBe(true);
  });
  it('rejects a tampered checkout signature', () => {
    const sig = hmacSha256('order_1|pay_1', secret);
    expect(verifyCheckoutSignature('order_1', 'pay_2', sig, secret)).toBe(false);
  });
  it('verifies webhook bodies byte-for-byte', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = hmacSha256(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), sig, secret)).toBe(false);
  });
});

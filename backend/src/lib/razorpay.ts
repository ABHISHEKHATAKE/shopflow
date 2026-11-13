import crypto from 'crypto';

export function hmacSha256(data: string | Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  return safeEqual(hmacSha256(`${orderId}|${paymentId}`, secret), signature);
}

// Webhook signature: HMAC_SHA256(raw request body, webhook_secret)
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  return safeEqual(hmacSha256(rawBody, secret), signature);
}

export async function createRazorpayOrder(
  keyId: string,
  keySecret: string,
  amountPaise: number,
  receipt: string,
): Promise<{ id: string }> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

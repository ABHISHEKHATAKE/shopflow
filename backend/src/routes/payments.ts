import { Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env, isMockPayments } from '../config';
import { asyncHandler, HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { createRazorpayOrder, verifyCheckoutSignature, verifyWebhookSignature } from '../lib/razorpay';
import { requireAuth } from '../middleware/auth';
import { markPaid } from '../services/orderService';

export const paymentsRouter = Router();
export const webhookRouter = Router();

async function ownedPendingOrder(userId: number, id: number) {
  const order = await prisma.order.findFirst({ where: { id, userId } });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status !== 'PENDING_PAYMENT') throw new HttpError(409, `Order is ${order.status}`);
  return order;
}

// Step 1: create (or reuse) the gateway order for checkout.
paymentsRouter.post('/:orderId/create', requireAuth, asyncHandler(async (req, res) => {
  const order = await ownedPendingOrder(req.user!.id, Number(req.params.orderId));
  let gatewayOrderId = order.razorpayOrderId;
  if (!gatewayOrderId) {
    gatewayOrderId = isMockPayments
      ? `mock_order_${order.id}`
      : (await createRazorpayOrder(env.RAZORPAY_KEY_ID!, env.RAZORPAY_KEY_SECRET!, order.totalCents, `order_${order.id}`)).id;
    await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: gatewayOrderId } });
  }
  res.json({ mock: isMockPayments, keyId: env.RAZORPAY_KEY_ID ?? null, gatewayOrderId, amount: order.totalCents, currency: 'INR' });
}));

// Step 2: browser reports success. We trust the signature, never the browser.
paymentsRouter.post('/verify', requireAuth, asyncHandler(async (req, res) => {
  if (isMockPayments) throw new HttpError(400, 'Not available in mock mode');
  const b = z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  }).parse(req.body);
  if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, env.RAZORPAY_KEY_SECRET!)) {
    throw new HttpError(400, 'Invalid payment signature');
  }
  const order = await prisma.order.findFirst({ where: { razorpayOrderId: b.razorpay_order_id, userId: req.user!.id } });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json((await markPaid(order.id, b.razorpay_payment_id)).order);
}));

// Dev only: pretend the payment succeeded when no Razorpay keys are configured.
paymentsRouter.post('/:orderId/mock-pay', requireAuth, asyncHandler(async (req, res) => {
  if (!isMockPayments) throw new HttpError(404, 'Not found');
  const order = await ownedPendingOrder(req.user!.id, Number(req.params.orderId));
  res.json((await markPaid(order.id, `mock_pay_${order.id}`)).order);
}));

// Razorpay webhook. Needs the RAW body for signature checking (mounted with express.raw in app.ts).
webhookRouter.post('/razorpay', asyncHandler(async (req: Request, res: Response) => {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Webhook secret not configured');
  const signature = req.header('x-razorpay-signature') ?? '';
  const eventId = req.header('x-razorpay-event-id');
  if (!eventId || !verifyWebhookSignature(req.body as Buffer, signature, secret)) {
    throw new HttpError(400, 'Invalid webhook signature');
  }
  const event = JSON.parse((req.body as Buffer).toString('utf8'));

  // Idempotency: the primary key rejects a second delivery of the same event.
  try {
    await prisma.webhookEvent.create({ data: { id: eventId, type: event.event } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.json({ status: 'duplicate_ignored' });
    }
    throw e;
  }

  try {
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity as { id: string; order_id: string };
      const order = await prisma.order.findUnique({ where: { razorpayOrderId: payment.order_id } });
      if (order) await markPaid(order.id, payment.id);
    }
    res.json({ status: 'ok' });
  } catch (e) {
    // Let Razorpay retry: forget the event so the next delivery is processed.
    await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    logger.error({ err: e, eventId }, 'Webhook processing failed');
    throw e;
  }
}));

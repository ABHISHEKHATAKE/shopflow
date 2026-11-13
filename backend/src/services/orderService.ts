import { Prisma } from '@prisma/client';
import { env } from '../config';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import { canTransition, OrderStatus, releasesStock } from '../lib/orderStateMachine';
import { prisma } from '../lib/prisma';
import { expiryQueue, notificationQueue } from '../queues';

const orderInclude = { items: { include: { product: { select: { name: true } } } } };

/**
 * Turns the user's cart into an order and reserves stock.
 *
 * Overselling protection:
 *  1. Product rows are locked with SELECT ... FOR UPDATE inside one transaction,
 *     in sorted id order (consistent lock order avoids deadlocks).
 *  2. Stock is re-read AFTER the lock, so two buyers of the last item are serialised.
 *  3. A CHECK (stock >= 0) constraint is the last line of defence.
 *
 * Idempotency: the same Idempotency-Key from the same user returns the same order.
 */
export async function createOrder(userId: number, idempotencyKey?: string) {
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: orderInclude,
    });
    if (existing) return { order: existing, created: false };
  }

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const cart = await tx.cartItem.findMany({ where: { userId } });
        if (cart.length === 0) throw new HttpError(400, 'Cart is empty');

        const ids = cart.map((c) => c.productId).sort((a, b) => a - b);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);

        const products = await tx.product.findMany({ where: { id: { in: ids } } });
        const byId = new Map(products.map((p) => [p.id, p]));

        let totalCents = 0;
        const items: { productId: number; quantity: number; priceCents: number }[] = [];
        for (const line of cart) {
          const p = byId.get(line.productId);
          if (!p || !p.isActive) throw new HttpError(409, 'A product in your cart is no longer available');
          if (p.stock < line.quantity) {
            throw new HttpError(409, `Only ${p.stock} left of "${p.name}"`);
          }
          await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: line.quantity } } });
          totalCents += p.priceCents * line.quantity;
          items.push({ productId: p.id, quantity: line.quantity, priceCents: p.priceCents }); // price snapshot
        }

        const created = await tx.order.create({
          data: {
            userId,
            totalCents,
            idempotencyKey,
            expiresAt: new Date(Date.now() + env.ORDER_EXPIRY_MINUTES * 60_000),
            items: { create: items },
          },
          include: orderInclude,
        });
        await tx.cartItem.deleteMany({ where: { userId } });
        return created;
      },
      { timeout: 10_000 },
    );

    // Release the reservation automatically if the buyer never pays.
    await expiryQueue.add('expire', { orderId: order.id }, {
      delay: env.ORDER_EXPIRY_MINUTES * 60_000,
      jobId: `expire-${order.id}`,
    });
    return { order, created: true };
  } catch (e) {
    // Two concurrent requests with the same idempotency key: the loser reads the winner's order.
    if (idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: orderInclude,
      });
      if (existing) return { order: existing, created: false };
    }
    throw e;
  }
}

/** Moves an order to a new state under a row lock, enforcing the state machine. Restocks on cancel/expire. */
export async function transitionOrder(orderId: number, to: OrderStatus, extra: Prisma.OrderUpdateInput = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new HttpError(404, 'Order not found');

    const from = order.status as OrderStatus;
    if (!canTransition(from, to)) throw new HttpError(409, `Cannot move order from ${from} to ${to}`);

    if (releasesStock(to)) {
      for (const item of order.items) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
    }
    return tx.order.update({ where: { id: orderId }, data: { status: to, ...extra }, include: orderInclude });
  });
}

/**
 * Marks an order paid. Safe to call many times (client verify + webhook may both arrive).
 * A payment for an order that already expired is flagged so it can be refunded.
 */
export async function markPaid(orderId: number, paymentId: string) {
  const current = await prisma.order.findUnique({ where: { id: orderId } });
  if (!current) throw new HttpError(404, 'Order not found');
  if (current.status === 'PAID' || current.status === 'SHIPPED' || current.status === 'DELIVERED') {
    return { order: current, alreadyPaid: true };
  }
  if (current.status === 'EXPIRED' || current.status === 'CANCELLED') {
    logger.warn({ orderId, paymentId }, 'Payment received for a closed order: needs manual refund');
    throw new HttpError(409, 'Order is closed; payment will be refunded');
  }
  try {
    const order = await transitionOrder(orderId, 'PAID', { razorpayPaymentId: paymentId, paidAt: new Date() });
    await notificationQueue.add('order-paid', { orderId });
    return { order, alreadyPaid: false };
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {
      // Another request paid it between our read and our lock.
      const latest = await prisma.order.findUnique({ where: { id: orderId } });
      if (latest?.status === 'PAID') return { order: latest, alreadyPaid: true };
    }
    throw e;
  }
}

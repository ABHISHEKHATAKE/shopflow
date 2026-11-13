import { Worker } from 'bullmq';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { bullConnection } from '../lib/redis';
import { transitionOrder } from '../services/orderService';

export function startWorkers() {
  // Releases stock for orders that were never paid.
  const expiry = new Worker(
    'order-expiry',
    async (job) => {
      const { orderId } = job.data as { orderId: number };
      try {
        await transitionOrder(orderId, 'EXPIRED');
        logger.info({ orderId }, 'Order expired, stock released');
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) return; // already paid or cancelled
        throw e;
      }
    },
    { connection: bullConnection },
  );

  // Stand-in for "send confirmation email + generate invoice". Swap the log lines for Nodemailer/SES.
  const notifications = new Worker(
    'notifications',
    async (job) => {
      const { orderId } = job.data as { orderId: number };
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, items: { include: { product: true } } },
      });
      if (!order) return;
      const lines = order.items.map((i) => `${i.quantity} x ${i.product.name} @ ${(i.priceCents / 100).toFixed(2)}`);
      logger.info(
        { to: order.user.email, invoice: `INV-${order.id}`, total: (order.totalCents / 100).toFixed(2), lines },
        'Order confirmation email sent',
      );
    },
    { connection: bullConnection },
  );

  for (const w of [expiry, notifications]) {
    w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err: err.message }, 'Job failed'));
  }
  return [expiry, notifications];
}

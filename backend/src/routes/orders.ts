import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { createOrder, transitionOrder } from '../services/orderService';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const include = { items: { include: { product: { select: { name: true } } } } };

ordersRouter.post('/', asyncHandler(async (req, res) => {
  const key = req.header('Idempotency-Key') || undefined;
  const { order, created } = await createOrder(req.user!.id, key);
  res.status(created ? 201 : 200).json(order);
}));

ordersRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await prisma.order.findMany({ where: { userId: req.user!.id }, include, orderBy: { id: 'desc' } }));
}));

ordersRouter.get('/:id', asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: Number(req.params.id), userId: req.user!.id }, include });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json(order);
}));

ordersRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const owned = await prisma.order.findFirst({ where: { id, userId: req.user!.id } });
  if (!owned) throw new HttpError(404, 'Order not found');
  res.json(await transitionOrder(id, 'CANCELLED'));
}));

// Admin
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/orders', asyncHandler(async (_req, res) => {
  res.json(await prisma.order.findMany({ include: { ...include, user: { select: { email: true } } }, orderBy: { id: 'desc' }, take: 100 }));
}));

adminRouter.patch('/orders/:id/status', asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['SHIPPED', 'DELIVERED', 'CANCELLED']) }).parse(req.body);
  res.json(await transitionOrder(Number(req.params.id), status));
}));

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const cartRouter = Router();
cartRouter.use(requireAuth);

async function getCart(userId: number) {
  const items = await prisma.cartItem.findMany({ where: { userId }, include: { product: true }, orderBy: { id: 'asc' } });
  const totalCents = items.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0);
  return { items, totalCents };
}

cartRouter.get('/', asyncHandler(async (req, res) => res.json(await getCart(req.user!.id))));

// Sets the quantity for a product. Quantity 0 removes it.
cartRouter.put('/items', asyncHandler(async (req, res) => {
  const { productId, quantity } = z.object({
    productId: z.number().int(),
    quantity: z.number().int().min(0).max(20),
  }).parse(req.body);
  const userId = req.user!.id;

  if (quantity === 0) {
    await prisma.cartItem.deleteMany({ where: { userId, productId } });
  } else {
    const product = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new HttpError(404, 'Product not found');
    await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: { quantity },
      create: { userId, productId, quantity },
    });
  }
  res.json(await getCart(userId));
}));

cartRouter.delete('/', asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { userId: req.user!.id } });
  res.json({ items: [], totalCents: 0 });
}));

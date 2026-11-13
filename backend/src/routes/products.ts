import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth, requireRole } from '../middleware/auth';

export const productsRouter = Router();

// Cache invalidation by version bump: all cached list pages become unreachable at once.
const VERSION_KEY = 'products:version';
const bumpCache = () => redis.incr(VERSION_KEY);

productsRouter.get('/', asyncHandler(async (req, res) => {
  const q = z.object({
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  }).parse(req.query);

  const version = (await redis.get(VERSION_KEY)) ?? '0';
  const key = `products:${version}:${q.search ?? ''}:${q.page}:${q.limit}`;
  const cached = await redis.get(key);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(JSON.parse(cached));
  }

  const where = {
    isActive: true,
    ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { id: 'asc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.product.count({ where }),
  ]);
  const body = { items, total, page: q.page, pages: Math.ceil(total / q.limit) };
  await redis.set(key, JSON.stringify(body), 'EX', 60);
  res.setHeader('X-Cache', 'MISS');
  res.json(body);
}));

productsRouter.get('/:id', asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: Number(req.params.id), isActive: true } });
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
}));

const productBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  priceCents: z.number().int().positive(),
  stock: z.number().int().min(0),
  imageUrl: z.string().url().optional(),
});

productsRouter.post('/', requireAuth, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const product = await prisma.product.create({ data: productBody.parse(req.body) });
  await bumpCache();
  res.status(201).json(product);
}));

productsRouter.patch('/:id', requireAuth, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const product = await prisma.product.update({ where: { id: Number(req.params.id) }, data: productBody.partial().parse(req.body) });
  await bumpCache();
  res.json(product);
}));

productsRouter.delete('/:id', requireAuth, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.product.update({ where: { id: Number(req.params.id) }, data: { isActive: false } }); // soft delete keeps order history intact
  await bumpCache();
  res.status(204).end();
}));

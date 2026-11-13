import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { env } from '../config';
import { asyncHandler, HttpError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();
const REFRESH_TTL = 7 * 24 * 3600;

async function issueTokens(user: { id: number; role: string }) {
  const accessToken = jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, { subject: String(user.id), expiresIn: '15m' });
  const jti = randomUUID();
  const refreshToken = jwt.sign({}, env.JWT_REFRESH_SECRET, { subject: String(user.id), jwtid: jti, expiresIn: REFRESH_TTL });
  await redis.set(`refresh:${jti}`, String(user.id), 'EX', REFRESH_TTL);
  return { accessToken, refreshToken };
}

const publicUser = (u: { id: number; email: string; name: string; role: string }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
});

authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(80),
    password: z.string().min(8).max(100),
  }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, 'Email already registered');
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
  });
  res.status(201).json({ user: publicUser(user), ...(await issueTokens(user)) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ user: publicUser(user), ...(await issueTokens(user)) });
}));

// Refresh tokens rotate: each one works exactly once.
authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, 'Invalid refresh token');
  }
  const removed = await redis.del(`refresh:${payload.jti}`);
  if (!removed) throw new HttpError(401, 'Refresh token already used or revoked');
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) throw new HttpError(401, 'User not found');
  res.json({ user: publicUser(user), ...(await issueTokens(user)) });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  const payload = jwt.decode(refreshToken) as jwt.JwtPayload | null;
  if (payload?.jti) await redis.del(`refresh:${payload.jti}`);
  res.status(204).end();
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: publicUser(user) });
}));

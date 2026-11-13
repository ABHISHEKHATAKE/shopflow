import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';
import { HttpError } from '../lib/errors';

export interface AuthUser {
  id: number;
  role: 'CUSTOMER' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Missing token'));
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as unknown as { sub: string; role: AuthUser['role'] };
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

export function requireRole(role: AuthUser['role']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(new HttpError(403, 'Forbidden'));
    next();
  };
}

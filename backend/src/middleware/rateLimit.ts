import { NextFunction, Request, Response } from 'express';
import { redis } from '../lib/redis';

// Fixed-window limiter backed by Redis (shared across all server instances).
export function rateLimit(max: number, windowSeconds: number, name = 'api') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `rl:${name}:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) return res.status(429).json({ error: 'Too many requests, slow down' });
    } catch {
      /* if Redis is down, fail open rather than block all traffic */
    }
    next();
  };
}

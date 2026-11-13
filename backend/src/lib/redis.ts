import Redis from 'ioredis';
import { env } from '../config';

export const redis = new Redis(env.REDIS_URL);

// BullMQ gets plain connection options (it manages its own connections).
const u = new URL(env.REDIS_URL);
export const bullConnection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  password: u.password || undefined,
};

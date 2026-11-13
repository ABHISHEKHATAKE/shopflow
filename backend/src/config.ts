import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  ORDER_EXPIRY_MINUTES: z.coerce.number().default(15),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
export const isMockPayments = !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;

import { Queue } from 'bullmq';
import { bullConnection } from '../lib/redis';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false, // failed jobs stay in the "failed" set: acts as a dead-letter queue
};

export const expiryQueue = new Queue('order-expiry', { connection: bullConnection, defaultJobOptions });
export const notificationQueue = new Queue('notifications', { connection: bullConnection, defaultJobOptions });

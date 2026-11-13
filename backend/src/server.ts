import { app } from './app';
import { env } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startWorkers } from './queues/workers';

const workers = startWorkers();
const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (docs at /docs)`));

async function shutdown() {
  logger.info('Shutting down');
  server.close();
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config';
import { errorHandler } from './lib/errors';
import { logger } from './lib/logger';
import { rateLimit } from './middleware/rateLimit';
import { openapi } from './openapi';
import { authRouter } from './routes/auth';
import { cartRouter } from './routes/cart';
import { adminRouter, ordersRouter } from './routes/orders';
import { paymentsRouter, webhookRouter } from './routes/payments';
import { productsRouter } from './routes/products';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL }));
app.use(pinoHttp({ logger }));

// Webhooks need the untouched raw body for HMAC verification, so mount BEFORE express.json().
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.use('/api', rateLimit(Number(process.env.RATE_LIMIT_MAX || 300), 60));
app.use('/api/auth', rateLimit(Number(process.env.AUTH_RATE_LIMIT_MAX || 20), 60, 'auth'), authRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

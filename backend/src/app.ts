import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { BULL_BOARD_PATH, createAdminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { searchRouter } from './routes/search';
import { sendersRouter } from './routes/senders';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestLogger);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.use('/health', healthRouter);
  app.use(BULL_BOARD_PATH, createAdminRouter());
  app.use('/api/auth', authRouter);
  app.use('/api/senders', sendersRouter);
  app.use('/api/search', searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

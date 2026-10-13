import { Router } from 'express';
import { ok } from '../lib/http';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  ok(res, { status: 'ok', uptimeS: Math.round(process.uptime()) });
});

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import basicAuth from 'express-basic-auth';
import { Router } from 'express';
import { env } from '../config/env';
import { emailQueue } from '../queue/emailQueue';

export const BULL_BOARD_PATH = '/admin/queues';

/** Live queue dashboard (Bull Board), protected by HTTP basic auth. */
export function createAdminRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue, { readOnlyMode: false })],
    serverAdapter,
    options: { uiConfig: { boardTitle: 'ReachInbox Scheduler' } },
  });

  const router = Router();
  router.use(
    basicAuth({
      users: { [env.BULL_BOARD_USER]: env.BULL_BOARD_PASSWORD },
      challenge: true,
      realm: 'bull-board',
    }),
  );
  router.use(serverAdapter.getRouter());
  return router;
}

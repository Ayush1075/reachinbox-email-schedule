import { EmailStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { ok, parse } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { searchEmails } from '../services/search';

export const searchRouter = Router();
searchRouter.use(requireAuth);

const querySchema = z.object({
  q: z.string().trim().max(200).optional().transform((v) => v || undefined),
  /** One status or a comma-separated list. */
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.nativeEnum(EmailStatus))),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

searchRouter.get('/', async (req, res) => {
  const query = parse(querySchema, req.query);
  const { status, ...rest } = query;
  ok(res, await searchEmails({ ...rest, statuses: status, userId: currentUserId(req) }));
});

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
  status: z.nativeEnum(EmailStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

searchRouter.get('/', async (req, res) => {
  const query = parse(querySchema, req.query);
  ok(res, await searchEmails({ ...query, userId: currentUserId(req) }));
});

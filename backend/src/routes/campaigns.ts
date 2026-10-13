import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { ok, parse } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { cancelCampaign, createCampaign, getCampaignCounts } from '../services/campaigns';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

export const MAX_RECIPIENTS = 10_000;
const emailSchema = z.string().trim().toLowerCase().email();

const createCampaignSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().min(1, 'Body is required').max(50_000),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required').max(MAX_RECIPIENTS),
  startAt: z.coerce.date(),
  delayBetweenMs: z.coerce.number().int().min(0).max(60 * 60 * 1000),
  hourlyLimit: z.coerce.number().int().positive().max(100_000).nullish(),
  senderIds: z.array(z.string().uuid()).min(1, 'Select at least one sender'),
});

/** Normalise, validate and de-duplicate recipients (order preserved). */
function normaliseRecipients(raw: string[]) {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const r of raw) {
    const parsed = emailSchema.safeParse(r);
    if (!parsed.success) invalid.push(r);
    else if (!seen.has(parsed.data)) {
      seen.add(parsed.data);
      valid.push(parsed.data);
    }
  }
  return { valid, invalid };
}

campaignsRouter.post('/', async (req, res) => {
  const input = parse(createCampaignSchema, req.body);
  const { valid, invalid } = normaliseRecipients(input.recipients);
  if (invalid.length > 0) {
    throw AppError.badRequest(`${invalid.length} invalid recipient address(es)`, { invalid: invalid.slice(0, 20) });
  }
  const result = await createCampaign(currentUserId(req), { ...input, recipients: valid });
  ok(res, result, 201);
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

campaignsRouter.get('/', async (req, res) => {
  const { page, limit } = parse(listSchema, req.query);
  const userId = currentUserId(req);
  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      omit: { body: true },
    }),
    prisma.campaign.count({ where: { userId } }),
  ]);
  const counts = await getCampaignCounts(items.map((c) => c.id));
  ok(res, { items: items.map((c) => ({ ...c, counts: counts.get(c.id) ?? {} })), page, limit, total });
});

campaignsRouter.get('/:id', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: currentUserId(req) } });
  if (!campaign) throw AppError.notFound('Campaign not found');
  const counts = await getCampaignCounts([campaign.id]);
  ok(res, { ...campaign, counts: counts.get(campaign.id) ?? {} });
});

campaignsRouter.delete('/:id', async (req, res) => {
  ok(res, await cancelCampaign(currentUserId(req), req.params.id));
});

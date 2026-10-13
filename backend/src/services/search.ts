import { Client } from '@elastic/elasticsearch';
import { EmailStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { emailSenderSelect, toPublicEmail } from './emails';

/**
 * Elasticsearch is a *secondary* index for full-text search over emails.
 * Postgres stays the source of truth: every write here is best-effort, and
 * if ES is unreachable, search transparently falls back to Postgres ILIKE.
 * Search can degrade; it can never take the rest of the app down.
 */
export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5_000, maxRetries: 1 });
const INDEX = env.ELASTICSEARCH_INDEX;
const INDEX_BATCH = 500;

export async function ensureSearchIndex() {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (exists) return;
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          senderId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          userId: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
        },
      },
    });
    logger.info({ index: INDEX }, 'Created Elasticsearch index');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch unavailable at boot; search will use Postgres fallback');
  }
}

/** (Re)index emails by id. Never throws. */
export async function indexEmailJobs(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += INDEX_BATCH) {
    const batch = ids.slice(i, i + INDEX_BATCH);
    try {
      const rows = await prisma.emailJob.findMany({
        where: { id: { in: batch } },
        include: { campaign: { select: { userId: true } } },
      });
      if (rows.length === 0) continue;
      const operations = rows.flatMap((r) => [
        { index: { _index: INDEX, _id: r.id } },
        {
          recipient: r.recipient,
          subject: r.subject,
          body: r.body,
          status: r.status,
          senderId: r.senderId,
          campaignId: r.campaignId,
          userId: r.campaign.userId,
          scheduledAt: r.scheduledAt,
          sentAt: r.sentAt,
        },
      ]);
      const res = await es.bulk({ operations, refresh: false });
      if (res.errors) logger.warn({ count: rows.length }, 'Some Elasticsearch bulk index operations failed');
    } catch (err) {
      logger.warn({ err: (err as Error).message, count: batch.length }, 'Elasticsearch indexing skipped');
      return;
    }
  }
}

export async function indexEmailJobsByCampaign(campaignId: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.emailJob
      .findMany({
        where: { campaignId },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: INDEX_BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
      .catch(() => []);
    if (page.length === 0) return;
    await indexEmailJobs(page.map((p) => p.id));
    cursor = page[page.length - 1]!.id;
  }
}

export type SearchParams = {
  userId: string;
  q?: string | undefined;
  status?: EmailStatus | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page: number;
  limit: number;
};

export async function searchEmails(params: SearchParams) {
  try {
    return await searchElasticsearch(params);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch search failed; falling back to Postgres');
    return searchPostgres(params);
  }
}

async function searchElasticsearch({ userId, q, status, from, to, page, limit }: SearchParams) {
  const filter: object[] = [{ term: { userId } }];
  if (status) filter.push({ term: { status } });
  if (from || to) filter.push({ range: { scheduledAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } });

  const res = await es.search<{ scheduledAt: string }>({
    index: INDEX,
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    query: {
      bool: {
        filter,
        ...(q && {
          must: [
            {
              multi_match: {
                query: q,
                fields: ['recipient^3', 'subject^2', 'body'],
                type: 'bool_prefix',
                operator: 'and',
              },
            },
          ],
        }),
      },
    },
    sort: q ? ['_score', { scheduledAt: 'desc' }] : [{ scheduledAt: 'desc' }],
    _source: false,
  });

  const ids = res.hits.hits.map((h) => h._id).filter((id): id is string => typeof id === 'string');
  // Hydrate from Postgres so results always reflect the authoritative state.
  const rows = await prisma.emailJob.findMany({ where: { id: { in: ids } }, include: { sender: emailSenderSelect } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  return {
    items: ids.flatMap((id) => (byId.has(id) ? [toPublicEmail(byId.get(id)!)] : [])),
    page,
    limit,
    total,
    source: 'elasticsearch' as const,
  };
}

async function searchPostgres({ userId, q, status, from, to, page, limit }: SearchParams) {
  const where: Prisma.EmailJobWhereInput = {
    campaign: { userId },
    ...(status && { status }),
    ...((from || to) && { scheduledAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    ...(q && {
      OR: [
        { recipient: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.emailJob.findMany({
      where,
      include: { sender: emailSenderSelect },
      orderBy: { scheduledAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailJob.count({ where }),
  ]);
  return { items: rows.map(toPublicEmail), page, limit, total, source: 'postgres' as const };
}

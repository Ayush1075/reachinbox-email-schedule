import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_CAMPAIGN_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_CAMPAIGN = 5;
/** Uploads never used by a campaign are cleaned up after this long. */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

export const attachmentMeta = { id: true, filename: true, contentType: true, size: true } as const;
export type AttachmentMeta = Prisma.AttachmentGetPayload<{ select: typeof attachmentMeta }>;

export async function createAttachment(userId: string, input: { filename: string; contentType: string; data: Buffer }) {
  if (input.data.length === 0) throw AppError.badRequest('The file is empty');
  if (input.data.length > MAX_ATTACHMENT_BYTES) throw AppError.badRequest('Attachments are limited to 5 MB each');
  await prisma.attachment.deleteMany({
    where: { userId, campaignId: null, createdAt: { lt: new Date(Date.now() - ORPHAN_TTL_MS) } },
  });
  return prisma.attachment.create({
    data: { userId, filename: input.filename, contentType: input.contentType, size: input.data.length, data: new Uint8Array(input.data) },
    select: attachmentMeta,
  });
}

/** Attach uploaded files to a new campaign, inside its creation transaction. */
export async function claimAttachments(tx: Prisma.TransactionClient, userId: string, campaignId: string, ids: string[]) {
  if (ids.length === 0) return;
  if (ids.length > MAX_ATTACHMENTS_PER_CAMPAIGN) throw AppError.badRequest(`At most ${MAX_ATTACHMENTS_PER_CAMPAIGN} attachments per campaign`);
  const files = await tx.attachment.findMany({ where: { id: { in: ids }, userId, campaignId: null }, select: { size: true } });
  if (files.length !== ids.length) throw AppError.badRequest('One or more attachments are unknown or already used');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_CAMPAIGN_ATTACHMENT_BYTES) {
    throw AppError.badRequest('Attachments are limited to 10 MB per campaign');
  }
  await tx.attachment.updateMany({ where: { id: { in: ids } }, data: { campaignId } });
}

type CampaignFiles = { filename: string; contentType: string; content: Buffer }[];
const CACHE_LIMIT = 20;
const cache = new Map<string, CampaignFiles>();

/**
 * A campaign's attachments, for the worker. They never change once the
 * campaign exists, so each worker keeps the most recent campaigns' files in
 * memory instead of reading the blobs from Postgres for every recipient.
 */
export async function loadCampaignAttachments(campaignId: string): Promise<CampaignFiles> {
  const hit = cache.get(campaignId);
  if (hit) return hit;
  const rows = await prisma.attachment.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    select: { filename: true, contentType: true, data: true },
  });
  const files = rows.map((r) => ({ filename: r.filename, contentType: r.contentType, content: Buffer.from(r.data) }));
  cache.set(campaignId, files);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return files;
}

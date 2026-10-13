import express, { Router } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { ok } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { createAttachment, MAX_ATTACHMENT_BYTES } from '../services/attachments';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

/** Only these are ever served inline; everything else downloads, so an uploaded HTML/SVG can't run on this origin. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Upload one file as the raw request body (sent as application/octet-stream so
 * no body parser touches it). The name travels in `X-Filename` (URI-encoded)
 * and the real media type in `X-Content-Type`.
 */
attachmentsRouter.post('/', express.raw({ type: 'application/octet-stream', limit: MAX_ATTACHMENT_BYTES }), async (req, res) => {
  const header = req.get('x-filename');
  if (!header) throw AppError.badRequest('X-Filename header is required');
  let filename: string;
  try {
    filename = decodeURIComponent(header).replace(/[\\/\r\n"]/g, '_').trim().slice(0, 200);
  } catch {
    throw AppError.badRequest('X-Filename must be URI-encoded');
  }
  if (!filename) throw AppError.badRequest('X-Filename is empty');
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const contentType = (req.get('x-content-type') || 'application/octet-stream').split(';')[0]!.trim().toLowerCase();
  ok(res, await createAttachment(currentUserId(req), { filename, contentType, data }), 201);
});

attachmentsRouter.get('/:id', async (req, res) => {
  const file = await prisma.attachment.findFirst({ where: { id: req.params.id, userId: currentUserId(req) } });
  if (!file) throw AppError.notFound('Attachment not found');
  const inline = INLINE_TYPES.has(file.contentType);
  res.setHeader('Content-Type', inline ? file.contentType : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(file.data));
});

/** Removes an upload that hasn't been sent with a campaign yet. */
attachmentsRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.attachment.deleteMany({
    where: { id: req.params.id, userId: currentUserId(req), campaignId: null },
  });
  if (count === 0) throw AppError.notFound('Attachment not found or already sent');
  ok(res, { deleted: true });
});

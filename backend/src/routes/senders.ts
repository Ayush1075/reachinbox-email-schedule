import type { Sender } from '@prisma/client';
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { decrypt, encrypt } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { ok, parse } from '../lib/http';
import { HOUR_MS, hourWindowStart } from '../lib/time';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { verifySmtp } from '../services/mailer';
import { resolveSenderCap } from '../services/limits';
import { getCurrentWindowUsage } from '../services/rateLimiter';

export const sendersRouter = Router();
sendersRouter.use(requireAuth);

export function toPublicSender(s: Sender) {
  return {
    id: s.id,
    label: s.label,
    fromAddress: s.fromAddress,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    hourlyLimit: s.hourlyLimit,
    effectiveHourlyLimit: resolveSenderCap(s.hourlyLimit),
    isActive: s.isActive,
    createdAt: s.createdAt,
  };
}

sendersRouter.get('/', async (req, res) => {
  const senders = await prisma.sender.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { createdAt: 'asc' },
  });
  ok(res, senders.map(toPublicSender));
});

const smtpSchema = z.object({
  smtpHost: z.string().trim().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().min(1),
  smtpPass: z.string().min(1),
});

const createSenderSchema = smtpSchema.extend({
  label: z.string().trim().min(1).max(80),
  fromAddress: z.string().trim().toLowerCase().email(),
  hourlyLimit: z.coerce.number().int().positive().max(100_000).nullish(),
});

async function insertSender(userId: string, data: z.infer<typeof createSenderSchema>) {
  try {
    return await prisma.sender.create({
      data: { ...data, hourlyLimit: data.hourlyLimit ?? null, smtpPass: encrypt(data.smtpPass), userId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict(`A sender with address ${data.fromAddress} already exists`);
    }
    throw err;
  }
}

sendersRouter.post('/', async (req, res) => {
  const input = parse(createSenderSchema, req.body);
  try {
    await verifySmtp({
      host: input.smtpHost,
      port: input.smtpPort,
      secure: input.smtpSecure,
      user: input.smtpUser,
      pass: input.smtpPass,
    });
  } catch (err) {
    throw AppError.badRequest(`SMTP verification failed: ${(err as Error).message}`);
  }
  const sender = await insertSender(currentUserId(req), input);
  ok(res, toPublicSender(sender), 201);
});

/**
 * Current-hour quota per sender, read from the limiter's own Redis keys, plus
 * how many emails each sender currently has deferred by the hourly cap.
 */
sendersRouter.get('/quotas', async (req, res) => {
  const senders = await prisma.sender.findMany({ where: { userId: currentUserId(req) }, orderBy: { createdAt: 'asc' } });
  const ids = senders.map((s) => s.id);
  const [usage, deferred] = await Promise.all([
    getCurrentWindowUsage(ids).catch(() => new Map<string, number>()),
    prisma.emailJob.groupBy({
      by: ['senderId'],
      where: { senderId: { in: ids }, status: EmailStatus.RATE_LIMITED },
      _count: { _all: true },
    }),
  ]);
  const deferredBySender = new Map(deferred.map((d) => [d.senderId, d._count._all]));
  const windowStart = hourWindowStart(Date.now());
  ok(res, {
    windowStart: new Date(windowStart),
    windowEnd: new Date(windowStart + HOUR_MS),
    senders: senders.map((s) => ({
      senderId: s.id,
      label: s.label,
      fromAddress: s.fromAddress,
      isActive: s.isActive,
      used: usage.get(s.id) ?? 0,
      limit: resolveSenderCap(s.hourlyLimit),
      deferred: deferredBySender.get(s.id) ?? 0,
    })),
  });
});

/** A failed check is a normal result (reported to the user), not an API error. */
async function checkSmtp(config: Parameters<typeof verifySmtp>[0]) {
  const startedAt = performance.now();
  const latencyMs = () => Math.round(performance.now() - startedAt);
  try {
    await verifySmtp(config);
    return { ok: true as const, latencyMs: latencyMs() };
  } catch (err) {
    return { ok: false as const, latencyMs: latencyMs(), error: (err as Error).message };
  }
}

/** Checks SMTP credentials without saving anything. */
sendersRouter.post('/verify', async (req, res) => {
  const input = parse(smtpSchema, req.body);
  ok(res, await checkSmtp({ host: input.smtpHost, port: input.smtpPort, secure: input.smtpSecure, user: input.smtpUser, pass: input.smtpPass }));
});

async function findOwnSender(userId: string, id: string) {
  const sender = await prisma.sender.findFirst({ where: { id, userId } });
  if (!sender) throw AppError.notFound('Sender not found');
  return sender;
}

/** Checks a saved sender's stored credentials. */
sendersRouter.post('/:id/verify', async (req, res) => {
  const s = await findOwnSender(currentUserId(req), req.params.id);
  ok(res, await checkSmtp({ host: s.smtpHost, port: s.smtpPort, secure: s.smtpSecure, user: s.smtpUser, pass: decrypt(s.smtpPass) }));
});

/**
 * Edit label / hourly cap, or (de)activate. A deactivated sender can't be
 * picked for new campaigns; emails it already has scheduled still go out.
 */
sendersRouter.patch('/:id', async (req, res) => {
  const input = parse(
    z
      .object({
        label: z.string().trim().min(1).max(80).optional(),
        hourlyLimit: z.coerce.number().int().positive().max(100_000).nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, 'Nothing to update'),
    req.body,
  );
  await findOwnSender(currentUserId(req), req.params.id);
  const sender = await prisma.sender.update({ where: { id: req.params.id }, data: input });
  ok(res, toPublicSender(sender));
});

/** One-click demo sender: provisions a fresh Ethereal test mailbox. */
sendersRouter.post('/ethereal', async (req, res) => {
  const { hourlyLimit } = parse(
    z.object({ hourlyLimit: z.coerce.number().int().positive().max(100_000).nullish() }),
    req.body ?? {},
  );
  let account;
  try {
    account = await nodemailer.createTestAccount();
  } catch (err) {
    throw AppError.unavailable(`Could not create an Ethereal account: ${(err as Error).message}`);
  }
  const userId = currentUserId(req);
  const count = await prisma.sender.count({ where: { userId } });
  const sender = await insertSender(userId, {
    label: `Ethereal ${count + 1}`,
    smtpHost: account.smtp.host,
    smtpPort: account.smtp.port,
    smtpSecure: account.smtp.secure,
    smtpUser: account.user,
    smtpPass: account.pass,
    fromAddress: account.user.toLowerCase(),
    hourlyLimit: hourlyLimit ?? null,
  });
  ok(res, { ...toPublicSender(sender), etherealLogin: { user: account.user, pass: account.pass, web: account.web } }, 201);
});

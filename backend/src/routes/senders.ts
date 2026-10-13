import type { Sender } from '@prisma/client';
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { encrypt } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { ok, parse } from '../lib/http';
import { currentUserId, requireAuth } from '../middleware/requireAuth';
import { verifySmtp } from '../services/mailer';
import { resolveSenderCap } from '../services/limits';

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

const createSenderSchema = z.object({
  label: z.string().trim().min(1).max(80),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().min(1),
  smtpPass: z.string().min(1),
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

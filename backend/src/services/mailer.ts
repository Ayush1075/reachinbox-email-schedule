import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '@prisma/client';
import { decrypt } from '../lib/crypto';

/**
 * One pooled SMTP transport per sender, reused across jobs. The cache key
 * includes the row's credentials fingerprint so an edited sender gets a fresh
 * transport without a restart.
 */
const transports = new Map<string, { fingerprint: string; transport: Transporter }>();

function fingerprint(s: Sender) {
  return `${s.smtpHost}:${s.smtpPort}:${s.smtpSecure}:${s.smtpUser}:${s.smtpPass}`;
}

export function getTransport(sender: Sender): Transporter {
  const fp = fingerprint(sender);
  const cached = transports.get(sender.id);
  if (cached?.fingerprint === fp) return cached.transport;

  cached?.transport.close();
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: { user: sender.smtpUser, pass: decrypt(sender.smtpPass) },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  transports.set(sender.id, { fingerprint: fp, transport });
  return transport;
}

export type SendInput = {
  /** Stable per-email id; becomes the RFC 5322 Message-ID. */
  emailJobId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
};

export type SendResult = { messageId: string; previewUrl: string | null };

export async function sendEmail(sender: Sender, input: SendInput): Promise<SendResult> {
  const transport = getTransport(sender);
  const domain = input.from.split('@')[1] ?? 'reachinbox.local';
  const info = await transport.sendMail({
    from: { name: input.fromName, address: input.from },
    to: input.to,
    subject: input.subject,
    text: input.body,
    // Deterministic Message-ID: if a send were ever repeated, receiving
    // servers and clients can recognise it as the same message.
    messageId: `<${input.emailJobId}@${domain}>`,
    headers: { 'X-ReachInbox-Email-Id': input.emailJobId },
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: typeof preview === 'string' ? preview : null };
}

/** Opens and closes an SMTP session to validate credentials. */
export async function verifySmtp(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function closeAllTransports() {
  for (const { transport } of transports.values()) transport.close();
  transports.clear();
}

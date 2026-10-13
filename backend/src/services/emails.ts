import type { EmailJob, Sender } from '@prisma/client';

export type EmailWithSender = EmailJob & { sender: Pick<Sender, 'id' | 'label' | 'fromAddress'> };

export const emailSenderSelect = { select: { id: true, label: true, fromAddress: true } } as const;

/** Public shape of an email row (mirrored in frontend/src/types/api.ts). */
export function toPublicEmail(e: EmailWithSender) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    recipient: e.recipient,
    subject: e.subject,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    attempts: e.attempts,
    rescheduleCount: e.rescheduleCount,
    previewUrl: e.previewUrl,
    messageId: e.messageId,
    lastError: e.lastError,
    sender: { id: e.sender.id, label: e.sender.label, fromAddress: e.sender.fromAddress },
  };
}

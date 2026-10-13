import { env } from '../config/env';

/**
 * Hourly cap precedence:
 *   Sender.hourlyLimit → MAX_EMAILS_PER_HOUR_PER_SENDER → MAX_EMAILS_PER_HOUR
 *
 * A campaign may additionally request a lower per-sender rate
 * (Campaign.hourlyLimit). It can tighten the sender's ceiling, never raise it:
 * the sender cap protects the mailbox's reputation regardless of which
 * campaign is using it.
 */
export function resolveSenderCap(
  senderLimit: number | null | undefined,
  defaults: { perSender?: number | undefined; global: number } = {
    perSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    global: env.MAX_EMAILS_PER_HOUR,
  },
): number {
  return senderLimit ?? defaults.perSender ?? defaults.global;
}

export function resolveEffectiveLimit(
  senderLimit: number | null | undefined,
  campaignLimit: number | null | undefined,
  defaults?: { perSender?: number | undefined; global: number },
): number {
  const senderCap = resolveSenderCap(senderLimit, defaults);
  return campaignLimit ? Math.min(senderCap, campaignLimit) : senderCap;
}

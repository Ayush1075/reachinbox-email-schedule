/**
 * API contract — mirrors backend/src/types/api.ts and the backend's public
 * serializers (toPublicUser, toPublicSender, toPublicEmail, stats). Dates
 * arrive as ISO strings over JSON.
 */

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type Paginated<T> = { items: T[]; page: number; limit: number; total: number };

export type EmailStatus = 'SCHEDULED' | 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RATE_LIMITED' | 'CANCELLED';
export type CampaignStatus = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'PARTIALLY_FAILED' | 'CANCELLED';

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slack: { connected: boolean; teamName: string | null; channelName: string | null };
};

export type Sender = {
  id: string;
  label: string;
  fromAddress: string;
  smtpHost: string;
  smtpPort: number;
  hourlyLimit: number | null;
  effectiveHourlyLimit: number;
  isActive: boolean;
  createdAt: string;
};

export type Email = {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  rescheduleCount: number;
  previewUrl: string | null;
  messageId: string | null;
  lastError: string | null;
  sender: { id: string; label: string; fromAddress: string };
};

export type SenderQuota = { senderId: string; label: string; fromAddress: string; used: number; limit: number };

export type Stats = {
  scheduled: number;
  sentToday: number;
  failed: number;
  rateLimited: number;
  currentHour: { windowStart: string; windowEnd: string; used: number; limit: number; senders: SenderQuota[] };
};

export type CreateCampaignInput = {
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayBetweenMs: number;
  hourlyLimit?: number | null;
  senderIds: string[];
};

export type Campaign = {
  id: string;
  subject: string;
  startAt: string;
  delayBetweenMs: number;
  hourlyLimit: number | null;
  totalRecipients: number;
  status: CampaignStatus;
  plannedEndAt: string | null;
  createdAt: string;
};

export type CreateCampaignResult = {
  campaign: Campaign;
  plan: { endsAt: string; deferredByCap: number };
  enqueued: boolean;
};

export type SearchResult = Paginated<Email> & { source: 'elasticsearch' | 'postgres' };

export type SlackStatus = {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  connectedAt: string | null;
};

import { z } from 'zod';

/**
 * All runtime configuration lives here and is validated once at boot.
 * A missing or malformed variable crashes the process immediately with a
 * readable message instead of surfacing later as an obscure runtime error.
 *
 * Nothing in the codebase reads `process.env` directly — import `env` instead.
 */

// Load backend/.env when present (Node >= 20.12 ships this natively).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, containers, etc.).
}

const int = (def: number) => z.coerce.number().int().nonnegative().default(def);
const positiveInt = (def: number) => z.coerce.number().int().positive().default(def);
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalPositiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Infrastructure
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  // URLs
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  // Auth & secrets
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: positiveInt(168),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  GOOGLE_CLIENT_ID: z.string().min(1),

  // Slack (optional: the integration reports "not configured" when absent)
  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_REDIRECT_URI: optionalString,

  // Bull Board
  BULL_BOARD_USER: z.string().min(1).default('admin'),
  BULL_BOARD_PASSWORD: z.string().min(8, 'BULL_BOARD_PASSWORD must be at least 8 characters'),

  // Queue / worker
  QUEUE_NAME: z.string().default('email-send'),
  WORKER_CONCURRENCY: positiveInt(5),
  QUEUE_GLOBAL_RATE_MAX: positiveInt(50),
  QUEUE_GLOBAL_RATE_DURATION_MS: positiveInt(1000),
  JOB_ATTEMPTS: positiveInt(3),
  JOB_BACKOFF_MS: positiveInt(5000),
  REMOVE_ON_COMPLETE_AGE_S: positiveInt(24 * 3600),
  REMOVE_ON_FAIL_AGE_S: positiveInt(7 * 24 * 3600),
  ENQUEUE_CHUNK_SIZE: positiveInt(500),

  // Rate limiting
  MAX_EMAILS_PER_HOUR: positiveInt(200),
  MAX_EMAILS_PER_HOUR_PER_SENDER: optionalPositiveInt,
  MIN_DELAY_BETWEEN_EMAILS_MS: int(2000),

  // Reconciler (safety net, not the scheduler)
  RECONCILE_INTERVAL_MS: positiveInt(5 * 60 * 1000),
  /** A claim older than this with no live BullMQ job is considered abandoned. */
  STALE_CLAIM_MS: positiveInt(2 * 60 * 1000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // The logger depends on env, so this is the one place we write to stderr directly.
  console.error(`\nInvalid environment configuration:\n${issues}\n\nSee backend/.env.example.\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isSlackConfigured = Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);

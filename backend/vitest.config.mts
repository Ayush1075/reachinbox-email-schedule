import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    // Deterministic config for modules that import src/config/env.ts.
    // Integration tests talk to the docker-compose Redis/Postgres.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://reachinbox:reachinbox@localhost:5433/email_scheduler?schema=public',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      BULL_BOARD_PASSWORD: 'test-password',
      MAX_EMAILS_PER_HOUR: '200',
      MAX_EMAILS_PER_HOUR_PER_SENDER: '',
      MIN_DELAY_BETWEEN_EMAILS_MS: '0',
      // Isolated from the dev queue/index so tests never touch real data.
      QUEUE_NAME: 'email-send-test',
      ELASTICSEARCH_INDEX: 'emails-test',
    },
  },
});

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { signInWithEmail } from '../src/services/auth';
import { hashPassword, verifyPassword } from '../src/services/passwords';

const emails: string[] = [];
const freshEmail = () => {
  const email = `${randomUUID()}@test.local`;
  emails.push(email);
  return email;
};

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterz', hash)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('signInWithEmail', () => {
  it('creates an account on first use and signs in with the same password later', async () => {
    const email = freshEmail();
    const created = await signInWithEmail(email.toUpperCase(), 'password-123');
    expect(created.email).toBe(email);
    expect(created.googleId).toBeNull();

    const again = await signInWithEmail(email, 'password-123');
    expect(again.id).toBe(created.id);
  });

  it('rejects a wrong password', async () => {
    const email = freshEmail();
    await signInWithEmail(email, 'password-123');
    await expect(signInWithEmail(email, 'password-456')).rejects.toMatchObject({ status: 401 });
  });

  it('never sets a password on an account that signs in with Google', async () => {
    const email = freshEmail();
    await prisma.user.create({ data: { email, name: 'Google user', googleId: `test:${randomUUID()}` } });

    await expect(signInWithEmail(email, 'attacker-password')).rejects.toMatchObject({ status: 401 });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
  });
});

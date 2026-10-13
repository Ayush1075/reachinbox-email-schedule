/**
 * Seeds Ethereal SMTP senders so the app can send immediately.
 *
 *   npm run db:seed -- you@gmail.com [senderCount]
 *
 * The email should be the Google account you will sign in with. If you have
 * not signed in yet, a placeholder user is created and linked to your Google
 * identity on first login (matched by email).
 *
 * Ethereal accounts are created on the fly via nodemailer.createTestAccount();
 * nothing is ever delivered to a real inbox.
 */
import nodemailer from 'nodemailer';
import { prisma } from '../src/db/prisma';
import { encrypt } from '../src/lib/crypto';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const count = Number(process.argv[3] ?? 2);
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run db:seed -- <your-google-email> [senderCount=2]');
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, googleId: `pending:${email}`, name: email.split('@')[0] ?? email },
  });

  for (let i = 0; i < count; i++) {
    const account = await nodemailer.createTestAccount();
    const sender = await prisma.sender.create({
      data: {
        userId: user.id,
        label: `Ethereal ${i + 1}`,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpSecure: account.smtp.secure,
        smtpUser: account.user,
        smtpPass: encrypt(account.pass),
        fromAddress: account.user,
      },
    });
    console.log(`✔ Sender "${sender.label}" <${sender.fromAddress}>`);
    console.log(`  Ethereal inbox login: https://ethereal.email/login  user=${account.user}  pass=${account.pass}`);
  }

  console.log(`\nSeeded ${count} sender(s) for ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

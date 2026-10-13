import { MailShell } from '@/components/layout/MailShell';

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return <MailShell>{children}</MailShell>;
}

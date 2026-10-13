'use client';

import { useRouter } from 'next/navigation';
import { ScheduledTable } from '@/components/email/EmailTables';

export default function ScheduledPage() {
  const router = useRouter();
  return (
    <div className="p-6">
      <ScheduledTable onCompose={() => router.push('/dashboard/compose')} />
    </div>
  );
}

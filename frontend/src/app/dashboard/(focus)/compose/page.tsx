'use client';

import { useRouter } from 'next/navigation';
import { ComposeModal } from '@/components/email/ComposeModal';

export default function ComposePage() {
  const router = useRouter();
  return <ComposeModal open onClose={() => router.push('/dashboard/scheduled')} />;
}

import { Suspense } from 'react';
import { EmailReader } from '@/components/email/EmailReader';
import { Skeleton } from '@/components/ui/skeleton';

export default function EmailPage({ params }: PageProps<'/dashboard/emails/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-10 w-80" />}>
      {params.then(({ id }) => (
        <EmailReader id={id} />
      ))}
    </Suspense>
  );
}

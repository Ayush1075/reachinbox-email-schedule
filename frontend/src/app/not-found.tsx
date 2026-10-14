import Link from 'next/link';
import { OnbLogo } from '@/components/layout/OnbLogo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <OnbLogo />
      <div>
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">The link may be broken, or the email may have been deleted.</p>
      </div>
      <Button asChild className="rounded-full px-5">
        <Link href="/dashboard/scheduled">Back to your mailbox</Link>
      </Button>
    </main>
  );
}

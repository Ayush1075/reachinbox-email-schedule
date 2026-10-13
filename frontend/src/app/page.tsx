'use client';

import { GoogleLogin } from '@react-oauth/google';
import { CalendarClock, Gauge, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useGoogleLogin, useMe } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';

const features = [
  { icon: CalendarClock, text: 'Delayed jobs on BullMQ — no cron, survives restarts' },
  { icon: Gauge, text: 'Per-sender hourly limits, enforced atomically in Redis' },
  { icon: ShieldCheck, text: 'Exactly-once delivery, guarded at three layers' },
];

export default function LoginPage() {
  const router = useRouter();
  const me = useMe();
  const login = useGoogleLogin();
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (me.data) router.replace('/dashboard');
  }, [me.data, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[8px] border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[6px] bg-accent font-mono text-sm font-semibold text-white">R</div>
            <span className="text-base font-semibold">ReachInbox Scheduler</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">Schedule email campaigns that send once, on time, within limits.</p>

          <div className="mt-8 flex min-h-11 justify-center">
            {me.isPending || login.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : !clientConfigured ? (
              <p className="rounded-[8px] border border-warning/30 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code className="font-mono">frontend/.env.local</code> to enable Google sign-in.
              </p>
            ) : (
              <GoogleLogin
                width={336}
                text="continue_with"
                shape="rectangular"
                onSuccess={({ credential }) => {
                  if (!credential) return void toast.error('Google did not return a credential');
                  login.mutate(credential, {
                    onSuccess: () => router.replace('/dashboard'),
                    onError: (err) => toast.error(errorMessage(err)),
                  });
                }}
                onError={() => toast.error('Google sign-in was cancelled or failed')}
              />
            )}
          </div>

          <ul className="mt-8 space-y-2.5 border-t border-border pt-6">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-[13px] text-fg-muted">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

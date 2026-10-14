'use client';

import { Hash, Loader2, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { UserAvatar } from '@/components/layout/AccountMenu';
import { useSignOut } from '@/components/layout/useSignOut';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/useAuth';
import { useServerConfig } from '@/hooks/useConfig';
import { useHydrated } from '@/hooks/useHydrated';
import { startSlackInstall, useDisconnectSlack, useSlackStatus, useSlackTest } from '@/hooks/useSlackStatus';
import { errorMessage } from '@/lib/api';
import { ToggleGroupItem } from './ThemeChoice';
import { formatDateTime, formatDuration } from '@/lib/format';

export function SlackSection() {
  const { data, isPending } = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const test = useSlackTest();

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Slack alerts</CardTitle>
        <CardDescription>
          Get one message in a channel the moment a sender reaches its hourly limit, with how many emails were deferred and when sending resumes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !data ? (
          <Skeleton className="h-9 w-48" aria-label="Loading Slack status" />
        ) : !data.configured ? (
          <Alert>
            <AlertDescription>
              Slack isn&apos;t set up on this server. Add <code className="font-mono text-xs">SLACK_CLIENT_ID</code>,{' '}
              <code className="font-mono text-xs">SLACK_CLIENT_SECRET</code> and <code className="font-mono text-xs">SLACK_REDIRECT_URI</code> to the API
              environment to enable it.
            </AlertDescription>
          </Alert>
        ) : data.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-field px-4 py-3">
              <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="truncate">
                  Posting to <span className="font-mono">#{data.channelName?.replace(/^#/, '')}</span> in <span className="font-medium">{data.teamName}</span>
                </p>
                {data.connectedAt && <p className="text-xs text-muted-foreground">Connected {formatDateTime(data.connectedAt)}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(undefined, {
                    onSuccess: () => toast.success('Test notification sent', { description: 'Check your Slack channel.' }),
                    onError: (err) => toast.error('Slack rejected the message', { description: errorMessage(err) }),
                  })
                }
              >
                {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Send test notification
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" className="rounded-full text-destructive hover:text-destructive" disabled={disconnect.isPending}>
                    Disconnect
                  </Button>
                }
                title="Disconnect Slack?"
                description="Rate-limit alerts stop immediately. Sending is not affected, and you can reconnect any time."
                confirmLabel="Disconnect"
                onConfirm={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success('Slack disconnected'),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              />
            </div>
          </div>
        ) : (
          <Button className="rounded-full px-5" onClick={startSlackInstall}>
            <Hash aria-hidden />
            Connect Slack
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function DefaultsSection() {
  const { data } = useServerConfig();
  const rows = [
    { label: 'Minimum delay between emails', value: data ? formatDuration(data.minDelayBetweenEmailsMs) : undefined },
    { label: 'Default hourly limit per sender', value: data ? `${data.defaultHourlyLimit} emails` : undefined },
    { label: 'Maximum recipients per campaign', value: data?.maxRecipients.toLocaleString() },
  ];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Defaults</CardTitle>
        <CardDescription>Set by the server&apos;s environment. Each campaign and sender can tighten these, never loosen them.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-mono text-sm">{r.value ?? <Skeleton className="h-4 w-16" />}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Light is the default. System follows your device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="inline-flex w-fit rounded-full bg-field p-1">
          {THEMES.map((t) => (
            <ToggleGroupItem key={t.value} selected={hydrated && theme === t.value} onSelect={() => setTheme(t.value)}>
              {t.label}
            </ToggleGroupItem>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountSection() {
  const { data: user } = useMe();
  const { signOut, isPending } = useSignOut();
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="flex-row flex-wrap items-center justify-between gap-4">
        {user ? (
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar user={user} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-10 w-56" />
        )}
        <Button variant="outline" className="rounded-full" onClick={signOut} disabled={isPending}>
          <LogOut aria-hidden />
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}

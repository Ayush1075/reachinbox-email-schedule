'use client';

import { AtSign, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateEtherealSender, useQuotas, useSenders } from '@/hooks/useSenders';
import { errorMessage } from '@/lib/api';
import { AddSenderDialog } from './AddSenderDialog';
import { SenderCard } from './SenderCard';

export function SendersActions() {
  const create = useCreateEtherealSender();
  return (
    <>
      <Button
        variant="outline"
        className="rounded-full"
        disabled={create.isPending}
        onClick={() =>
          create.mutate(undefined, {
            onSuccess: (s) => toast.success(`Added ${s.label}`, { description: `${s.fromAddress} (Ethereal test mailbox)` }),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {create.isPending ? 'Creating…' : 'Add Ethereal sender'}
      </Button>
      <AddSenderDialog
        trigger={
          <Button className="rounded-full px-5">
            <Plus aria-hidden />
            Add sender
          </Button>
        }
      />
    </>
  );
}

export function SendersGrid() {
  const senders = useSenders();
  const quotas = useQuotas();
  const quotaById = new Map(quotas.data?.senders.map((q) => [q.senderId, q]));

  if (senders.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading senders">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!senders.data || senders.data.length === 0) {
    return (
      <div className="rounded-xl border">
        <EmptyState
          icon={AtSign}
          title="No senders yet"
          description="A sender is the mailbox emails go out from. Add your own SMTP account, or create a free Ethereal test mailbox."
        />
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {senders.data.map((s) => (
        <li key={s.id}>
          <SenderCard sender={s} quota={quotaById.get(s.id)} />
        </li>
      ))}
    </ul>
  );
}

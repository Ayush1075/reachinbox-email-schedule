import { WorkspacePage } from '@/components/layout/WorkspacePage';
import { SendersActions, SendersGrid } from '@/components/senders/SendersGrid';

export default function SendersPage() {
  return (
    <WorkspacePage
      title="Senders"
      description="Mailboxes your emails go out from, with each one's hourly limit and live usage."
      actions={<SendersActions />}
    >
      <SendersGrid />
    </WorkspacePage>
  );
}

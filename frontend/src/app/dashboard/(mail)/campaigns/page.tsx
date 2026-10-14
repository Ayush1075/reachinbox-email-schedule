import Link from 'next/link';
import { CampaignsTable } from '@/components/campaigns/CampaignsTable';
import { WorkspacePage } from '@/components/layout/WorkspacePage';
import { Button } from '@/components/ui/button';

export default function CampaignsPage() {
  return (
    <WorkspacePage
      title="Campaigns"
      description="Every send and scheduled batch, with live delivery progress."
      actions={
        <Button asChild className="rounded-full px-5">
          <Link href="/dashboard/compose">Compose</Link>
        </Button>
      }
    >
      <CampaignsTable />
    </WorkspacePage>
  );
}

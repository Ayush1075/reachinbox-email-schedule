import { QuotaPanel } from '@/components/dashboard/QuotaPanel';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { StatCards } from '@/components/dashboard/StatCards';
import { ThroughputChart } from '@/components/dashboard/ThroughputChart';
import { WorkspacePage } from '@/components/layout/WorkspacePage';

export default function OverviewPage() {
  return (
    <WorkspacePage title="Overview" description="Live delivery, quota and throughput. Updates every few seconds.">
      <StatCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <QuotaPanel />
        <ThroughputChart />
      </div>
      <RecentActivity />
    </WorkspacePage>
  );
}

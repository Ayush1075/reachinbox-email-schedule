import { StatCards } from '@/components/dashboard/StatCards';
import { PageHeader } from '@/components/layout/PageHeader';

export default function OverviewPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Overview" description="Live delivery and quota usage." />
      <StatCards />
    </div>
  );
}

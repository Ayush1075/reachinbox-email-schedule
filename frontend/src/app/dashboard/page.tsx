import { Suspense } from 'react';
import { Dashboard } from './Dashboard';
import { DashboardSkeleton } from './DashboardSkeleton';

export default function DashboardPage() {
  // Dashboard reads useSearchParams (tab in the URL); the Suspense boundary
  // lets the shell prerender while the URL-dependent part renders on the client.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

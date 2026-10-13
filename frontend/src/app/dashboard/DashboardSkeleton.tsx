import { Skeleton } from '@/components/legacy-ui/Skeleton';

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-[8px] border border-border bg-surface p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-8 h-96 rounded-[8px] border border-border bg-surface" />
      </div>
    </div>
  );
}

import Skeleton from './Skeleton';

interface DashboardSkeletonProps {
  metricCount?: number;
  widgetCount?: number;
  variant?: 'dashboard' | 'summary';
}

export default function DashboardSkeleton({
  metricCount = 4,
  widgetCount = 2,
  variant = 'dashboard',
}: DashboardSkeletonProps) {
  const isSummary = variant === 'summary';

  return (
    <div className={isSummary ? 'space-y-6' : 'space-y-5'} aria-label="Loading dashboard">
      <div className={isSummary ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4' : 'grid grid-cols-2 gap-3.5'}>
        {Array.from({ length: metricCount }).map((_, index) => (
          <div
            key={`dashboard-metric-skeleton-${index}`}
            className={
              isSummary
                ? 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
                : 'min-h-[90px] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm'
            }
          >
            <div className="flex h-full min-h-[58px] flex-col justify-between">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-4 rounded-md" />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-2 w-14 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {isSummary ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Array.from({ length: widgetCount }).map((_, index) => (
            <Skeleton key={`dashboard-widget-skeleton-${index}`} className="h-[340px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-6">
            <Skeleton className="h-[360px] rounded-2xl" />
          </div>
          <div className="space-y-4 xl:col-span-6">
            <Skeleton className="h-[170px] rounded-2xl" />
            <Skeleton className="h-[170px] rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

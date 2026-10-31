import type { ReactNode } from 'react';
import Skeleton from './Skeleton';

type DashboardSkeletonVariant = 'secretary' | 'dean' | 'vpaa' | 'program' | 'institutional';

export interface SecretaryDashboardLayout {
  queueRowCount: number;
  showDraftingProgress: boolean;
}

const DEFAULT_SECRETARY_LAYOUT: SecretaryDashboardLayout = {
  queueRowCount: 5,
  showDraftingProgress: true,
};

interface DashboardSkeletonProps {
  metricCount?: number;
  variant?: DashboardSkeletonVariant | 'dashboard' | 'summary';
  secretaryLayout?: SecretaryDashboardLayout;
}

function TextLine({ line = 'h-4', className = '' }: { line?: string; className?: string }) {
  return (
    <div className={`flex ${line} items-center`}>
      <Skeleton className={`h-2.5 rounded ${className}`} />
    </div>
  );
}

function PanelFrame({ className = '', children, action = true, subtitle = true, name }: {
  className?: string;
  children?: ReactNode;
  action?: boolean;
  subtitle?: boolean;
  name?: string;
}) {
  return (
    <section data-skeleton={name} className={`rounded-xl border border-border bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-40 rounded" />
          {subtitle && <TextLine line="mt-2 h-3.5" className="h-2.5 w-64 max-w-full" />}
        </div>
        {action && <Skeleton className="h-3 w-20 shrink-0 rounded" />}
      </div>
      {children}
    </section>
  );
}

function MetricCard() {
  return (
    <div className="flex h-full min-h-[90px] min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton className="mt-0.5 h-4 w-10 rounded" />
        <TextLine line="mt-1 h-3.5" className="w-4/5" />
        <TextLine line="mt-auto pt-0.5 h-4" className="h-2 w-3/5" />
      </div>
    </div>
  );
}

function TableRows({ rows, columns, name }: { rows: number; columns: number; name?: string }) {
  return (
    <div data-skeleton={name} className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Skeleton className={`h-3 rounded ${i % 2 ? 'w-32' : 'w-40'}`} />
          {Array.from({ length: columns - 1 }).map((__, c) => <Skeleton key={c} className="h-2.5 flex-1 rounded" />)}
        </div>
      ))}
    </div>
  );
}

function BarRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="flex justify-between gap-2">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-3 w-14 rounded" />
          </div>
          <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function GanttSkeleton() {
  return (
    <div data-skeleton="timetable" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-[118px] rounded-lg" />
        <Skeleton className="h-8 w-[196px] rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="ml-auto h-3 w-28 rounded" />
      </div>
      <div className="flex h-[420px] min-h-[220px] shrink-0 flex-col overflow-hidden rounded-lg border border-border xl:h-0 xl:flex-1">
        <Skeleton className="h-8 w-full shrink-0 rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex min-h-9 flex-1 items-center gap-3 border-t border-border px-2">
            <Skeleton className="h-2.5 w-20 shrink-0 rounded" />
            <Skeleton className="h-5 rounded-md" style={{ marginLeft: `${(i * 13) % 40}%`, width: `${18 + ((i * 7) % 16)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors DashboardContext and the KPI strip that open the role dashboards. */
function ContextAndKpis({ kpis }: { kpis: number }) {
  return (
    <>
      <div data-skeleton="context" className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white px-5 py-3.5">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="ml-auto h-9 w-36 rounded-md" />
      </div>
      <div data-skeleton="metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="relative min-h-[118px] rounded-xl border border-border bg-white p-4">
            <Skeleton className="absolute right-4 top-4 h-9 w-9 rounded-lg" />
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="mt-3 h-6 w-16 rounded" />
            <Skeleton className="mt-6 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </>
  );
}

/** Dean and VPAA: context, four KPIs, the full-width queue, then the status distribution beside its breakdown. */
function ReviewerSkeleton() {
  return (
    <div className="space-y-4 pb-8" aria-label="Loading dashboard" aria-busy="true">
      <ContextAndKpis kpis={4} />
      <PanelFrame name="queue-panel"><TableRows name="queue" rows={3} columns={3} /></PanelFrame>
      <PanelFrame name="breakdown" action={false}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-6">
          <div data-skeleton="status" className="flex items-center gap-5">
            <Skeleton className="h-[148px] w-[148px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-3 w-full rounded" />)}</div>
          </div>
          <BarRows rows={2} />
        </div>
      </PanelFrame>
    </div>
  );
}

/** Secretary: context, four KPIs, the work queue and the year-level breakdown. */
function RoleSkeleton({ queueRows, showBreakdown = true }: { queueRows: number; showBreakdown?: boolean }) {
  return (
    <div className="space-y-4 pb-8" aria-label="Loading dashboard" aria-busy="true">
      <ContextAndKpis kpis={4} />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <PanelFrame name="queue-panel" className={showBreakdown ? 'xl:col-span-7' : 'xl:col-span-12'}>
          <TableRows name="queue" rows={queueRows} columns={3} />
        </PanelFrame>
        {showBreakdown && <PanelFrame name="breakdown" action={false} className="xl:col-span-5"><BarRows rows={4} /></PanelFrame>}
      </div>
    </div>
  );
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <PanelFrame>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            <Skeleton className={`h-2.5 rounded ${index % 2 ? 'w-3/5' : 'w-4/5'}`} />
            <Skeleton className="ml-auto h-2.5 w-10 rounded" />
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function InstitutionalSkeleton() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12" aria-label="Loading dashboard" aria-busy="true">
      <div className="flex flex-col gap-4 xl:col-span-6">
        <div className="grid grid-cols-2 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => <MetricCard key={i} />)}
        </div>
        <div className="flex h-[420px] flex-col"><GanttSkeleton /></div>
      </div>
      <div className="flex flex-col gap-4 xl:col-span-6">
        <PanelSkeleton rows={5} />
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}

export default function DashboardSkeleton({ metricCount, variant = 'institutional', secretaryLayout = DEFAULT_SECRETARY_LAYOUT }: DashboardSkeletonProps) {
  const secretary = <RoleSkeleton queueRows={secretaryLayout.queueRowCount} showBreakdown={secretaryLayout.showDraftingProgress} />;
  if (variant === 'secretary' || variant === 'program' || variant === 'summary') return secretary;
  if (variant === 'dean' || variant === 'vpaa') return <ReviewerSkeleton />;
  if (metricCount && metricCount !== 4) return secretary;
  return <InstitutionalSkeleton />;
}

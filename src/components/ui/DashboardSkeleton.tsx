import { Fragment, type ReactNode } from 'react';
import Skeleton from './Skeleton';

type DashboardSkeletonVariant = 'secretary' | 'dean' | 'vpaa' | 'program' | 'institutional';
type DashboardTab = 'overview' | 'progress' | 'attentions' | 'activity';

export interface SecretaryDashboardLayout {
  queueRowCount: number;
  showDraftingProgress: boolean;
  showFacultyAssignment: boolean;
  showTimetable: boolean;
  readinessCheckCount: number;
}

const DEFAULT_SECRETARY_LAYOUT: SecretaryDashboardLayout = {
  queueRowCount: 6,
  showDraftingProgress: true,
  showFacultyAssignment: true,
  showTimetable: true,
  readinessCheckCount: 6,
};

interface DashboardSkeletonProps {
  metricCount?: number;
  variant?: DashboardSkeletonVariant | 'dashboard' | 'summary';
  secretaryLayout?: SecretaryDashboardLayout;
  tab?: DashboardTab;
  metrics?: ReactNode;
}

/*
 * Each block below mirrors the box model of the real component it stands in
 * for (same padding, radius, row heights and gaps), so the page does not jump
 * when data arrives. When a dashboard panel changes shape, change its twin here.
 */

const ROOT = 'space-y-4 pb-8';
/** Bordered row card shared by queue items, table rows, instructors and activity. */
const ROW_CARD = 'rounded-xl border border-border/70';
/** Tinted summary band at the top of a panel. */
const BAND = 'rounded-xl bg-parchment';

function TextLine({ line = 'h-4', className = '' }: { line?: string; className?: string }) {
  return (
    <div className={`flex ${line} items-center`}>
      <Skeleton className={`h-2.5 rounded ${className}`} />
    </div>
  );
}

/** Twin of the dashboard Panel: title, optional subtitle, optional header action. */
function PanelFrame({ className = '', children, action = true, subtitle = true, headerExtra = false, title, description, actionLabel }: {
  className?: string;
  children?: ReactNode;
  action?: boolean;
  subtitle?: boolean;
  headerExtra?: boolean;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-white p-5 ${className}`}>
      <div className={`mb-4 flex min-h-[28px] justify-between gap-3 ${subtitle ? 'items-start' : 'items-center'}`}>
        <div className="min-w-0 flex-1">
          {title ? <div className={`relative font-jakarta text-[15px] font-semibold leading-5 tracking-tight ${subtitle ? '' : 'truncate'}`}>
            <span className="invisible">{title}</span>
            <Skeleton className="absolute left-0 top-1/2 h-3 w-40 max-w-full -translate-y-1/2 rounded" />
          </div> : <TextLine line="h-5" className="h-3 w-40 max-w-full" />}
          {subtitle && (description ? <div className="relative mt-1 text-xs leading-snug">
            <span className="invisible">{description}</span>
            <Skeleton className="absolute left-0 top-1/2 h-2 w-56 max-w-full -translate-y-1/2 rounded" />
          </div> : <TextLine line="mt-1 h-[16.5px]" className="h-2 w-56 max-w-full" />)}
        </div>
        {(action || headerExtra) && <div className="flex shrink-0 items-center gap-2">
          {action && (actionLabel ? <span className={`relative -mr-1.5 inline-flex h-7 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md pl-2 pr-1 text-xs font-semibold ${subtitle ? '-mt-1' : ''}`}>
            <span className="invisible">{actionLabel}</span><span className="h-3.5 w-3.5" />
            <Skeleton className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded" />
          </span> : <TextLine line="h-7" className="w-20 shrink-0" />)}
          {headerExtra && <Skeleton className="h-7 w-7 rounded-md" />}
        </div>}
      </div>
      {children}
    </section>
  );
}

/** Twin of DashboardMetricCard: label, large value, detail, icon tile top-right. */
function MetricCard({ progress = false }: { progress?: boolean }) {
  return (
    <div className="flex h-full min-h-[90px] min-w-0 items-start gap-2 rounded-xl border border-border bg-white p-4">
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <TextLine line="h-[15px]" className="w-4/5" />
        <Skeleton className="mt-1.5 h-7 w-12 rounded" />
        <TextLine line="mt-auto h-5 pt-1.5" className="h-2 w-3/5" />
      </div>
      {progress ? <DonutRing size="h-8 w-8" /> : <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />}
    </div>
  );
}

function MetricStrip({ count, className }: { count: number; className: string }) {
  return (
    <div data-skeleton="metrics" className={`grid grid-cols-2 gap-2.5 md:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <MetricCard key={i} progress={i === 1} />)}
    </div>
  );
}

/** A ring the same thickness as the real donuts (inner radius 74%). */
function DonutRing({ size = 'h-32 w-32' }: { size?: string }) {
  return (
    <div className={`relative shrink-0 ${size}`}>
      <Skeleton className="h-full w-full rounded-full" />
      <div className="absolute inset-[13%] rounded-full bg-white" />
    </div>
  );
}

function DonutSkeleton({ legendRows }: { legendRows: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
      <div className="mx-auto"><DonutRing /></div>
      <div className="min-w-0 space-y-2.5">
        {Array.from({ length: legendRows }).map((_, i) => (
          <div key={i} className="flex h-4 items-center gap-2">
            <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
            <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-2/5' : 'w-1/2'}`} />
            <Skeleton className="ml-auto h-2.5 w-14 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Column headings, then one bordered row card per row, then an optional totals band. */
function TableSkeleton({ template, rows, cells, footer = false, minWidth, headings, headingLineHeight = 'leading-tight' }: {
  template: string;
  rows: number;
  cells: (row: number) => ReactNode[];
  footer?: boolean;
  minWidth?: string;
  headings?: string[];
  headingLineHeight?: string;
}) {
  const columns = cells(0).length;
  return (
    <div className={minWidth ? '-mx-1 overflow-x-auto px-1 sm:overflow-x-visible' : 'min-w-0'}>
      <div className={minWidth ? `${minWidth} sm:min-w-0` : ''}>
        <div className="grid gap-2 px-3 pb-2" style={{ gridTemplateColumns: template }}>
          {headings ? headings.map((label, i) => <div key={i} className={`relative text-[11px] font-bold ${headingLineHeight}`}>
            <span className="invisible">{label}</span>
            {label && <Skeleton className="absolute left-0 top-1/2 h-2 w-4/5 max-w-[72px] -translate-y-1/2 rounded" />}
          </div>) : Array.from({ length: columns }).map((_, i) => <TextLine key={i} line="h-[14px]" className="h-2 w-4/5 max-w-[72px]" />)}
        </div>
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className={`grid items-center gap-2 px-3 py-2.5 ${ROW_CARD}`} style={{ gridTemplateColumns: template }}>
              {cells(row).map((cell, col) => <div key={col} className="min-w-0">{cell}</div>)}
            </div>
          ))}
        </div>
        {footer && (
          <div className={`mt-2 grid gap-2 px-3 py-2.5 ${BAND}`} style={{ gridTemplateColumns: template }}>
            {Array.from({ length: columns }).map((_, i) => <TextLine key={i} className={i ? 'ml-auto w-5' : 'w-10'} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function BarCell() {
  return (
    <div className="flex h-6 items-center gap-2">
      <Skeleton className="h-1.5 flex-1 rounded-full" />
      <Skeleton className="h-2 w-7 shrink-0 rounded" />
    </div>
  );
}

function LegendStrip({ widths, lastRight = false }: { widths: string[]; lastRight?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
      {widths.map((width, i) => (
        <div key={i} className={lastRight && i === widths.length - 1 ? 'ml-auto' : ''}>
          <TextLine className={width} />
        </div>
      ))}
    </div>
  );
}

/** Sub-heading inside a panel: label on the left, caption on the right. */
function SubHeader({ className = '', left = 'w-28', right = 'w-24' }: { className?: string; left?: string; right?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <TextLine className={left} />
      <TextLine className={`h-2 ${right}`} />
    </div>
  );
}

/** Twin of InstructorWorkloadChart in its card layout. */
function InstructorCards({ rows }: { rows: number }) {
  return (
    <div className="min-w-0 space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 py-3 ${ROW_CARD}`}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center justify-between gap-3">
              <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-24' : 'w-28'}`} />
              <Skeleton className="h-2.5 w-14 shrink-0 rounded" />
            </div>
            <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Room code, usage bar, figure — one aligned row per room. */
function RoomUsageRows({ valueWidth = 'w-[4.5rem]' }: { valueWidth?: string }) {
  return (
    <div className="mt-3.5 space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid h-4 grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto] items-center gap-2.5">
          <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-12' : 'w-16'}`} />
          <Skeleton className="h-1.5 rounded-full" />
          <Skeleton className={`h-2.5 shrink-0 rounded ${valueWidth}`} />
        </div>
      ))}
    </div>
  );
}

/** Twin of the borderless stat tile: value above an icon-and-label line. */
function StatChipSkeleton() {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-xl bg-parchment/70 px-3 py-2.5">
      <Skeleton className="h-[18px] w-8 rounded" />
      <TextLine line="mt-1.5 h-[16.5px]" className="h-2 w-16 max-w-full" />
    </div>
  );
}

/** Twin of DashboardGantt: segmented toolbar, time axis, a day header, class lanes, legend. */
function GanttSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {[['Today', 'Week'], ['On-site', 'Online', 'Field']].map(labels => <div key={labels[0]} className="relative flex rounded-lg border border-border bg-parchment p-0.5">
          {labels.map(label => <span key={label} className="invisible h-7 rounded-md px-3 text-xs font-semibold">{label}</span>)}
          <Skeleton className="absolute inset-0 rounded-lg" />
        </div>)}
        <div className="relative">
          <select aria-hidden="true" disabled className="invisible h-8 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold">
            <option>By department</option>
          </select>
          <Skeleton className="absolute inset-0 rounded-lg" />
        </div>
        <span className="relative ml-auto rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium">
          <span className="invisible">0 classes in view</span>
          <span className="skeleton-shimmer absolute inset-0 animate-pulse rounded-full" />
        </span>
      </div>
      <div className="flex h-[420px] min-h-[220px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-white [container-type:inline-size] xl:h-0 xl:flex-1">
        <div className="flex h-11 shrink-0 items-center border-b border-border">
          <div className="flex h-full w-[112px] shrink-0 items-center border-r border-border/70 px-3 [@container(min-width:600px)]:w-[148px]">
            <Skeleton className="h-2.5 w-20 rounded" />
          </div>
          <div className="flex flex-1 items-center justify-between px-4">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-9 rounded" />)}
          </div>
        </div>
        <div className="flex h-10 shrink-0 items-center border-b border-border/70 bg-parchment">
          <div className="flex h-full w-[112px] shrink-0 flex-col justify-center gap-1.5 border-r border-border/70 px-3 [@container(min-width:600px)]:w-[148px]">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-2 w-12 rounded" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-[112px] shrink-0 border-r border-border/70 px-3 pt-7 [@container(min-width:600px)]:w-[148px]">
            <Skeleton className="h-2.5 w-14 rounded" />
          </div>
          <div className="min-w-0 flex-1 space-y-1 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="relative h-[62px]">
                <Skeleton className="absolute inset-y-0 rounded-md" style={{ left: `${(i * 17) % 34}%`, width: `${16 + ((i * 5) % 10)}%` }} />
                <Skeleton className="absolute inset-y-0 rounded-md" style={{ left: `${46 + ((i * 11) % 24)}%`, width: `${14 + ((i * 7) % 9)}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {['Lecture', 'Laboratory', 'Unassigned', 'Overlap'].map(label => (
          <div key={label} className="flex items-center gap-1.5 text-[11px] font-medium">
            <Skeleton className="h-3 w-5 rounded-[3px]" />
            <span className="relative">
              <span className="invisible">{label}</span>
              <span className="skeleton-shimmer absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 animate-pulse rounded" />
            </span>
          </div>
        ))}
        <span className="relative ml-auto text-[11px] font-medium">
          <span className="invisible">Select a class for details.</span>
          <span className="skeleton-shimmer absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 animate-pulse rounded" />
        </span>
      </div>
    </div>
  );
}

/** Icon circle plus two lines, on the tinted band used by every summary callout. */
function SummaryBand({ children, className = 'px-4 py-3.5', icon = 'h-10 w-10' }: { children: ReactNode; className?: string; icon?: string }) {
  return (
    <div className={`flex items-center gap-3.5 ${BAND} ${className}`}>
      <Skeleton className={`shrink-0 rounded-full ${icon}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function QueueSkeleton({ rows }: { rows: number }) {
  return (
    <PanelFrame title="Scheduling Work Queue" actionLabel="View all items" subtitle={false} className="xl:col-span-4">
      <SummaryBand>
        <div className="flex h-7 items-center gap-2">
          <Skeleton className="h-6 w-7 rounded" />
          <Skeleton className="h-2.5 w-32 rounded" />
        </div>
        <div className="mt-2.5 flex h-4 items-center gap-2.5">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: Math.max(1, rows) }).map((_, i) => <Skeleton key={i} className="h-1 flex-1 rounded-full" />)}
          </div>
          <Skeleton className="h-2 w-12 shrink-0 rounded" />
        </div>
      </SummaryBand>
      <div data-skeleton="queue-rows" className="mt-3 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 ${ROW_CARD}`}>
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <Skeleton className={`h-2.5 flex-1 rounded ${i % 2 ? 'max-w-[60%]' : 'max-w-[75%]'}`} />
            <Skeleton className="ml-auto h-6 w-6 shrink-0 rounded-full" />
            <span className="flex w-[76px] shrink-0 justify-end"><Skeleton className="h-7 w-16 rounded-md" /></span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

/** Overall completion band (ring + percentage), then one card per year level. */
function ProgressSkeleton() {
  return (
    <PanelFrame title="Department Drafting Progress" actionLabel="Open Schedule" subtitle={false} className="xl:col-span-4">
      <div className={`flex items-center gap-5 px-4 py-4 ${BAND}`}>
        <DonutRing size="h-24 w-24" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-[34px] w-20 rounded" />
          <Skeleton className="mt-2 h-3 w-36 max-w-full rounded" />
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`px-4 py-3.5 ${ROW_CARD}`}>
            <div className="flex h-5 items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-2.5 w-20 rounded" />
              <Skeleton className="ml-auto h-2.5 w-10 shrink-0 rounded" />
            </div>
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function WorkloadSkeleton() {
  return (
    <PanelFrame title="Instructor Assignment" actionLabel="Open Schedule Builder" subtitle={false} className="xl:col-span-4">
      <SubHeader className="mb-3" />
      <InstructorCards rows={6} />
    </PanelFrame>
  );
}

function RoomAssignmentSkeleton() {
  return (
    <PanelFrame title="Room Assignment" actionLabel="View rooms" subtitle={false}>
      <div className={`flex items-center gap-3.5 px-4 py-3.5 ${BAND}`}>
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-8 rounded" />
          <Skeleton className="mt-1.5 h-2.5 w-44 max-w-full rounded" />
        </div>
        <Skeleton className="h-4 w-4 shrink-0 rounded" />
      </div>
      <div className="mt-3 grid grid-cols-4 divide-x divide-border/70 rounded-xl bg-parchment/70 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-w-0 flex-col items-center px-2">
            <Skeleton className="h-[18px] w-7 rounded" />
            <Skeleton className="mt-1.5 h-[17px] w-12 max-w-full rounded" />
          </div>
        ))}
      </div>
      <SubHeader className="mt-4" left="w-20" right="w-28" />
      <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
      <RoomUsageRows />
      <TextLine line="mt-3 h-4" className="w-28" />
    </PanelFrame>
  );
}

function SubmissionOverviewSkeleton({ checks }: { checks: number }) {
  return (
    <PanelFrame title="Submission Overview" action={false} subtitle={false} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`flex items-start gap-3 px-3.5 py-3 ${BAND}`}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center justify-between gap-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-1.5 h-2 w-4/5 rounded" />
            <Skeleton className="mt-1.5 h-2 w-3/5 rounded" />
          </div>
        </div>
        <div className="flex items-start pt-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-0 flex-1">
              <Skeleton className="mx-auto h-6 w-6 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-2 w-12 rounded" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col border-t border-border/60 pt-3">
          <SubHeader left="w-20" right="w-20" />
          <div className="mt-1 flex h-7 items-center gap-2">
            <Skeleton className="h-1.5 flex-1 rounded-full" />
            <Skeleton className="h-2 w-7 shrink-0 rounded" />
          </div>
          <div className="mt-2 space-y-2">
            {Array.from({ length: checks }).map((_, i) => (
              <div key={i} className="flex h-4 items-center gap-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-3/5' : 'w-4/5'}`} />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </PanelFrame>
  );
}

function TimetableSkeleton({ variant }: { variant: 'secretary' | 'dean' | 'vpaa' }) {
  return (
    <section data-skeleton="timetable" className="flex min-h-0 min-w-0 flex-col xl:h-[640px]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {variant === 'vpaa' ? (
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-white p-5">
            <header className="flex shrink-0 flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="ml-auto h-7 w-[72px] rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-32 rounded-md" />
            </header>
            <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col">
              <GanttSkeleton />
            </div>
          </section>
        ) : (
          <PanelFrame title="Department Academic Timetable" description="Overview of department timetable." actionLabel="View full timetable" className="flex min-h-0 flex-1 flex-col" subtitle={variant === 'dean'} headerExtra={variant === 'secretary'}>
            {variant === 'dean' && <div className="mb-3 flex flex-wrap items-center gap-2">
              {['w-[140px]', 'w-[156px]', 'w-[160px]', 'w-[140px]'].map((width, i) => <Skeleton key={i} className={`h-8 rounded-lg ${width}`} />)}
              <Skeleton className="ml-auto h-7 w-7 rounded-md" />
            </div>}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <GanttSkeleton />
            </div>
          </PanelFrame>
        )}
      </div>
    </section>
  );
}

function SecretarySkeleton({ layout, tab, metrics }: { layout: SecretaryDashboardLayout; tab: DashboardTab; metrics?: ReactNode }) {
  if (tab === 'overview') return <>
    {metrics ?? <MetricStrip count={6} className="xl:grid-cols-6" />}
    {layout.showTimetable && <TimetableSkeleton variant="secretary" />}
  </>;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-12">
        <QueueSkeleton rows={layout.queueRowCount} />
        {layout.showDraftingProgress && <ProgressSkeleton />}
        {layout.showFacultyAssignment && <WorkloadSkeleton />}
      </div>
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <RoomAssignmentSkeleton />
        <SubmissionOverviewSkeleton checks={layout.readinessCheckCount} />
      </div>
    </>
  );
}

const DEAN_QUEUE_COLUMNS = 'minmax(0,1.25fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 80px';
const DEAN_OVERVIEW_COLUMNS = 'minmax(0,1.4fr) 54px 56px 60px 56px';

/** Summary/breakdown pairs of the Dean Progress tab, in DOM order. */
const DEAN_PROGRESS_CARDS = [
  { summary: 'Section Submission Overview', breakdown: 'Section Readiness', legendRows: 5, avatars: false },
  { summary: 'Instructor Workload Overview', breakdown: 'Instructor Workload Breakdown', legendRows: 4, avatars: true },
  { summary: 'Room Utilization Overview', breakdown: 'Room Utilization Breakdown', legendRows: 2, avatars: false },
];

/** Twin of the Progress summary chart: donut beside its legend in wide cards, stacked otherwise. */
function SummaryDonutSkeleton({ legendRows }: { legendRows: number }) {
  return (
    <div className="flex flex-1 items-center [container-type:inline-size]">
      <div className="grid w-full items-center justify-items-center gap-4 [&>div]:w-full [@container(min-width:20rem)]:grid-cols-[112px_minmax(0,1fr)] [@container(min-width:20rem)]:gap-6 [@container(min-width:38rem)]:[&>div]:grid [@container(min-width:38rem)]:[&>div]:grid-cols-2 [@container(min-width:38rem)]:[&>div]:gap-x-10 [@container(min-width:38rem)]:[&>div]:gap-y-2.5 [@container(min-width:38rem)]:[&>div>div]:!mt-0">
        <span className="mx-auto"><DonutRing size="h-28 w-28" /></span>
        <div className="min-w-0 space-y-2.5">
          {Array.from({ length: legendRows }).map((_, i) => (
            <div key={i} className="flex h-4 items-center gap-2">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-2/5' : 'w-1/2'}`} />
              <Skeleton className="ml-auto h-2.5 w-10 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Twin of the Progress breakdown rows: label line over a thin bar. */
function BreakdownRows({ avatars }: { avatars: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-2">
          {avatars && <Skeleton className="h-7 w-7 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center justify-between gap-3">
              <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-20' : 'w-28'}`} />
              <Skeleton className="h-2.5 w-14 shrink-0 rounded" />
            </div>
            <Skeleton className="mt-1 h-1 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeanSkeleton({ tab, metrics }: { tab: DashboardTab; metrics?: ReactNode }) {
  if (tab === 'overview') return <>
    {metrics ?? <MetricStrip count={6} className="xl:grid-cols-6" />}
    <TimetableSkeleton variant="dean" />
  </>;

  if (tab === 'progress') return (
    <div className="grid gap-4 xl:grid-flow-col xl:grid-cols-3 xl:grid-rows-[auto_auto]">
      {DEAN_PROGRESS_CARDS.map(({ summary, breakdown, legendRows, avatars }) => <Fragment key={summary}>
        <PanelFrame title={summary} description="Department totals by status." action={false} className="flex flex-col">
          <SummaryDonutSkeleton legendRows={legendRows} />
        </PanelFrame>
        <PanelFrame title={breakdown} description="Breakdown of the department records." actionLabel="View records" className="flex flex-col">
          <BreakdownRows avatars={avatars} />
          <div className="mt-auto pt-3"><div className="flex justify-between border-t border-border/60 pt-3"><TextLine className="w-28" /><TextLine className="w-12" /></div></div>
        </PanelFrame>
      </Fragment>)}
    </div>
  );

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-12">
        <PanelFrame title="Schedule Review Queue" description="Department schedule packages submitted for your review and approval." actionLabel="View all queue" className="xl:col-span-7">
          <TableSkeleton
            template={DEAN_QUEUE_COLUMNS}
            headings={['Schedule Package', 'Submitted By', 'Submitted On', 'Completion', 'Actions']}
            rows={3}
            cells={() => [
              <div className="flex items-center gap-1.5"><Skeleton className="h-3.5 w-3.5 shrink-0 rounded" /><Skeleton className="h-2.5 w-4/5 rounded" /></div>,
              <Skeleton className="h-2.5 w-4/5 rounded" />,
              <Skeleton className="h-2.5 w-4/5 rounded" />,
              <BarCell />,
              <div className="flex justify-end gap-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-6 rounded-md" />)}</div>,
            ]}
          />
          <LegendStrip widths={['w-16', 'w-28', 'w-14']} />
        </PanelFrame>

        <PanelFrame title="Schedule Review Overview" description="Overview of submitted schedule packages." action={false} className="xl:col-span-5">
          <TableSkeleton
            template={DEAN_OVERVIEW_COLUMNS}
            headings={['Schedule Package', 'Submitted', 'Ready for Review', 'Returned for Revision', 'Sections Included']}
            rows={3}
            footer
            cells={() => [
              <TextLine className="w-4/5" />,
              ...Array.from({ length: 4 }).map(() => <TextLine className="ml-auto w-5" />),
            ]}
          />
        </PanelFrame>
      </div>

    </>
  );
}

const VPAA_ATTENTION_COLUMNS = 'minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.9fr) 78px';
const VPAA_WORKFLOW_COLUMNS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,0.95fr) 92px';
const VPAA_BUILDING_COLUMNS = 'minmax(0,1.3fr) minmax(0,1fr) 64px 72px';

function VpaaSkeleton({ tab, metrics }: { tab: DashboardTab; metrics?: ReactNode }) {
  if (tab === 'overview') return <>
    {metrics ?? <MetricStrip count={7} className="xl:grid-cols-7" />}
    <TimetableSkeleton variant="vpaa" />
  </>;

  if (tab === 'activity') return (
    <PanelFrame title="Recent Administrative Activity" description="The institution's audit trail across scheduling, approvals and user management." actionLabel="Open activity log" className="flex flex-col">
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex items-start gap-2.5 px-3.5 py-3 ${ROW_CARD}`}>
            <Skeleton className="mt-0.5 h-[18px] w-28 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <TextLine line="h-[16.25px]" className="w-4/5" />
              <TextLine line="mt-0.5 h-[16.5px]" className="h-2 w-1/2" />
            </div>
            <TextLine line="h-[16.5px]" className="h-2 w-10" />
          </div>
        ))}
      </div>
    </PanelFrame>
  );

  if (tab === 'attentions') return (
    <div className="grid gap-4">
      <PanelFrame title="Requires Attention" description="Department packages the Deans have cleared for your final approval, longest-waiting first." actionLabel="View approval queue">
        <SummaryBand>
          <TextLine line="h-[18.75px]" className="h-3 w-64 max-w-full" />
          <TextLine line="mt-1 h-[15px]" className="w-72 max-w-full" />
        </SummaryBand>
        <div className="mt-3">
          <TableSkeleton
            template={VPAA_ATTENTION_COLUMNS}
            headings={['Department', 'Sections', 'Submitted', 'Waiting', '']}
            headingLineHeight="leading-normal"
            minWidth="min-w-[520px]"
            rows={3}
            cells={() => [
              <TextLine line="h-[19.5px]" className="w-4/5" />,
              <TextLine className="w-3/5" />,
              <TextLine className="w-3/5" />,
              <Skeleton className="h-5 w-full rounded-full" />,
              <Skeleton className="h-7 w-full rounded-md" />,
            ]}
          />
        </div>
      </PanelFrame>
    </div>
  );

  return (
    <>
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <PanelFrame title="Instructor Load Overview" description="Teaching load spread across all active instructors." actionLabel="View instructor loads" className="flex flex-col">
          <DonutSkeleton legendRows={4} />
          <div className="mt-auto pt-4"><TextLine className="w-36" /></div>
        </PanelFrame>
        <PanelFrame title="Institutional Readiness" description="Departments by approval stage." actionLabel="View readiness">
          <DonutSkeleton legendRows={6} />
        </PanelFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <PanelFrame title="Workflow · Department Scheduling Progress" description="Approval completion for every academic unit." actionLabel="View all departments" className="xl:col-span-6">
          <TableSkeleton
            template={VPAA_WORKFLOW_COLUMNS}
            headings={['Department', 'Completion', 'Approved / Total', 'Stage']}
            minWidth="min-w-[470px]"
            rows={6}
            cells={() => [
              <TextLine className="w-4/5" />,
              <BarCell />,
              <TextLine className="ml-auto w-12" />,
              <div className="flex justify-end"><Skeleton className="h-5 w-16 rounded-full" /></div>,
            ]}
          />
          <LegendStrip widths={['w-36', 'w-36', 'w-24']} lastRight />
        </PanelFrame>

        <PanelFrame title="Room Utilisation by Building" description="Share of campus operating hours each building is booked for." actionLabel="View all rooms" className="flex flex-col xl:col-span-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <StatChipSkeleton key={i} />)}
          </div>
          <div className="mt-3">
            <TableSkeleton
              template={VPAA_BUILDING_COLUMNS}
              headings={['Building', 'Utilisation', 'Rooms', 'Classes']}
              headingLineHeight="leading-normal"
              minWidth="min-w-[380px]"
              rows={4}
              cells={() => [
                <TextLine className="w-4/5" />,
                <BarCell />,
                <TextLine className="ml-auto w-10" />,
                <TextLine className="ml-auto w-6" />,
              ]}
            />
          </div>
        </PanelFrame>
      </div>

    </>
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

export default function DashboardSkeleton({ metricCount, variant = 'institutional', secretaryLayout = DEFAULT_SECRETARY_LAYOUT, tab = 'overview', metrics }: DashboardSkeletonProps) {
  const isOffice = variant === 'secretary' || variant === 'program' || variant === 'summary'
    || (variant !== 'dean' && variant !== 'vpaa' && !!metricCount && metricCount !== 4);
  if (!isOffice && variant !== 'dean' && variant !== 'vpaa') return <InstitutionalSkeleton />;

  const tabs: DashboardTab[] = ['overview', 'progress'];
  if (!isOffice) tabs.push('attentions');
  if (variant === 'vpaa') tabs.push('activity');

  return (
    <div className={`${ROOT} font-jakarta text-text`} aria-label="Loading dashboard" aria-busy="true">
      <div data-skeleton="tabs" aria-hidden="true" className="flex gap-6 border-b border-border">
        {tabs.map(key => <span key={key} className={`relative -mb-px flex shrink-0 items-center gap-1.5 rounded-sm px-0.5 pb-2.5 pt-1 text-[13px] ${tab === key ? 'font-semibold text-primary' : 'font-medium text-muted'}`}>
          {key.charAt(0).toUpperCase() + key.slice(1)}
          {tab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
        </span>)}
      </div>
      <div data-skeleton={`panel-${tab}`} className="space-y-4">
        {isOffice ? <SecretarySkeleton layout={secretaryLayout} tab={tab} metrics={metrics} />
          : variant === 'dean' ? <DeanSkeleton tab={tab} metrics={metrics} /> : <VpaaSkeleton tab={tab} metrics={metrics} />}
      </div>
    </div>
  );
}

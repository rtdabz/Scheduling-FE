import type { ReactNode } from 'react';
import WeeklyTimetableGrid from '../scheduling/WeeklyTimetableGrid';
import { slotCount } from '../../lib/timeGrid';
import Skeleton from './Skeleton';

type DashboardSkeletonVariant = 'secretary' | 'dean' | 'vpaa' | 'program' | 'institutional';

/**
 * What the secretary / program head dashboard will actually render, taken from
 * the same capability checks the page uses. Those checks decide how many tiles
 * and queue rows there are and which panels exist, so a fixed skeleton reflowed
 * the page the moment the data arrived.
 */
export interface SecretaryDashboardLayout {
  tileCount: number;
  /** The page's own responsive column classes for its tile row. */
  tileGridClassName: string;
  queueRowCount: number;
  showDraftingProgress: boolean;
  showFacultyAssignment: boolean;
  showTimetable: boolean;
  readinessCheckCount: number;
}

/** A full-capability account: every tile, queue row and panel. */
const DEFAULT_SECRETARY_LAYOUT: SecretaryDashboardLayout = {
  tileCount: 8,
  tileGridClassName: 'sm:grid-cols-4',
  queueRowCount: 6,
  showDraftingProgress: true,
  showFacultyAssignment: true,
  showTimetable: true,
  readinessCheckCount: 6,
};

interface DashboardSkeletonProps {
  metricCount?: number;
  variant?: DashboardSkeletonVariant | 'dashboard' | 'summary';
  /** Secretary variant only. */
  secretaryLayout?: SecretaryDashboardLayout;
}

function PanelFrame({ className = '', children, action = true }: { className?: string; children?: ReactNode; action?: boolean }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5"><Skeleton className="h-3 w-36" />{action && <Skeleton className="h-2.5 w-14" />}</div>
    {children}
  </section>;
}

function MetricCard({ className = '' }: { className?: string }) {
  // Same box as DashboardMetricCard: the detail line sits at the foot of the tile.
  return <div className={`flex h-full min-h-[90px] min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${className}`}><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><div className="flex min-w-0 flex-1 flex-col"><Skeleton className="h-5 w-10" /><Skeleton className="mt-1 h-3 w-4/5" /><Skeleton className="mt-auto h-2.5 w-3/5" /></div></div>;
}

/** Scheduling Work Queue: the attention band, then one line per queue row. */
function QueueSkeleton({ rows }: { rows: number }) {
  return <PanelFrame className="xl:col-span-4">
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5"><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><div><Skeleton className="h-5 w-8" /><Skeleton className="mt-1 h-2.5 w-28" /></div></div>
      <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
    </div>
    <div className="mt-1 divide-y divide-slate-100">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-2.5 py-2.5">
      <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
      <Skeleton className={`h-2.5 flex-1 ${i % 2 ? 'max-w-[60%]' : 'max-w-[75%]'}`} />
      <span className="flex w-7 shrink-0 justify-end"><Skeleton className="h-2.5 w-4" /></span>
      <span className="flex w-[68px] shrink-0 justify-end"><Skeleton className="h-[22px] w-14 rounded-md" /></span>
    </div>)}</div>
  </PanelFrame>;
}

/** Department Drafting Progress: donut, year-level bars, three totals and a button. No header link. */
function ProgressSkeleton() {
  return <PanelFrame action={false} className="flex flex-col xl:col-span-4">
    <div className="grid gap-5 sm:grid-cols-[144px_1fr] sm:items-center">
      <div className="relative mx-auto h-32 w-32"><Skeleton className="h-32 w-32 rounded-full" /><div className="absolute inset-[22%] rounded-full bg-white" /></div>
      <div className="flex h-[168px] flex-col justify-center gap-5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-2.5 w-[50px] shrink-0" /><Skeleton className="h-[7px] flex-1 rounded-full" /><Skeleton className="h-2 w-14 shrink-0" /></div>)}</div>
    </div>
    <div className="mt-auto border-t border-slate-100 pt-4">
      <div className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[42px] rounded-md" />)}</div>
      <Skeleton className="mt-3 h-[30px] w-full rounded-md" />
    </div>
  </PanelFrame>;
}

/** Instructor Assignment: caption row, then the five busiest instructors at 46px a line. */
function WorkloadSkeleton() {
  return <PanelFrame className="xl:col-span-4">
    <div className="flex items-center justify-between"><Skeleton className="h-2.5 w-28" /><Skeleton className="h-2 w-24" /></div>
    <div className="mt-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex h-[46px] items-center gap-2"><Skeleton className="h-7 w-7 shrink-0 rounded-full" /><Skeleton className="h-2.5 w-24 shrink-0" /><Skeleton className="h-[10px] flex-1 rounded-full" /><Skeleton className="h-2.5 w-8 shrink-0" /></div>)}</div>
  </PanelFrame>;
}

/** Room Assignment: status button, four stat chips, the usage chart and its link. */
function RoomAssignmentSkeleton() {
  return <PanelFrame>
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5"><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-5 w-8" /><Skeleton className="mt-1 h-2.5 w-44" /></div><Skeleton className="h-4 w-4 shrink-0" /></div>
    <div className="mt-3 grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-2"><Skeleton className="h-3.5 w-3.5" /><Skeleton className="h-3.5 w-6" /><Skeleton className="h-2 w-10" /></div>)}</div>
    <div className="mt-3.5 flex items-baseline justify-between"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-2 w-28" /></div>
    <div className="mt-2 flex h-[140px] flex-col justify-around py-1">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-2.5 w-[58px] shrink-0" /><Skeleton className="h-2 flex-1 rounded-full" /><Skeleton className="h-2 w-12 shrink-0" /></div>)}</div>
    <Skeleton className="mt-3 h-3.5 w-40" />
  </PanelFrame>;
}

/** Submission Overview: status band, the four milestones, readiness bar and checklist, then the button. No header link. */
function SubmissionOverviewSkeleton({ checks }: { checks: number }) {
  return <PanelFrame action={false} className="flex flex-1 flex-col">
    <div className="flex flex-1 flex-col gap-2.5">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2"><Skeleton className="h-8 w-8 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-7 rounded-full" /></div><Skeleton className="mt-1 h-2 w-4/5" /></div></div>
      <div className="flex items-start pt-0.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="min-w-0 flex-1"><Skeleton className="mx-auto h-6 w-6 rounded-full" /><Skeleton className="mx-auto mt-1.5 h-2 w-10" /></div>)}</div>
      <div className="flex flex-1 flex-col border-t border-slate-100 pt-2.5">
        <div className="flex items-baseline justify-between gap-2"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-2 w-14" /></div>
        <div className="mt-1 flex h-7 items-center gap-2"><Skeleton className="h-[9px] flex-1 rounded-full" /><Skeleton className="h-2 w-6 shrink-0" /></div>
        <div className="mt-2 space-y-1.5">{Array.from({ length: checks }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" /><Skeleton className={`h-2.5 ${i % 2 ? 'w-3/5' : 'w-4/5'}`} /></div>)}</div>
      </div>
      <Skeleton className="h-[26px] w-full rounded-md" />
    </div>
  </PanelFrame>;
}

function SecretaryTimetableSkeleton() {
  const scheduleCards = [
    { id: 'dashboard-grid-1', startSlot: 2, durationSlots: 4 },
    { id: 'dashboard-grid-2', startSlot: 8, durationSlots: 3 },
    { id: 'dashboard-grid-3', startSlot: 13, durationSlots: 4 },
  ];

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-4 w-32" /></div><Skeleton className="mt-1 h-2.5 w-20" /></div><div className="flex flex-wrap items-center gap-2"><Skeleton className="h-9 w-40 rounded-xl" /><Skeleton className="h-7 w-28 rounded-full" /><Skeleton className="h-9 w-36 rounded-xl" /></div></header><div className="overflow-hidden bg-slate-50/70 p-4"><WeeklyTimetableGrid days={['Loading']} slotCount={slotCount()} minWidth={0} getTimeLabel={() => ''} isLoading>{scheduleCards.map(card => <div key={card.id} className="z-10 flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 shadow-sm" style={{ gridColumn: 2, gridRow: `${card.startSlot + 2} / span ${card.durationSlots}` }}><div><Skeleton className="h-3 w-16" /><Skeleton className="mt-1.5 h-2.5 w-24" /><Skeleton className="mt-1 h-2 w-12" /></div><div className="mt-1 flex items-center gap-1"><Skeleton className="h-3.5 w-12 rounded-full" /><Skeleton className="h-3.5 w-12 rounded-full" /></div></div>)}</WeeklyTimetableGrid></div><footer className="flex items-center gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-3"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-3 w-14 rounded-full" /><Skeleton className="h-3 w-14 rounded-full" /></footer></section>;
}

function SecretarySkeleton({ layout }: { layout: SecretaryDashboardLayout }) {
  // Row for row the structure of SecretaryDashboardPage, driven by the layout
  // the page computed from its capabilities: the same tile count and column
  // classes, the same queue length, and only the panels the account will see.
  return <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard" aria-busy="true">
    <div data-skeleton="metrics" className={`grid grid-cols-2 gap-2.5 ${layout.tileGridClassName}`}>{Array.from({ length: layout.tileCount }).map((_, i) => <MetricCard key={i} />)}</div>
    <div className="grid gap-4 xl:grid-cols-12">
      <QueueSkeleton rows={layout.queueRowCount} />
      {layout.showDraftingProgress && <ProgressSkeleton />}
      {layout.showFacultyAssignment && <WorkloadSkeleton />}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {layout.showTimetable && <div className="min-w-0"><SecretaryTimetableSkeleton /></div>}
      <div className="flex min-w-0 flex-col gap-4">
        <RoomAssignmentSkeleton />
        <SubmissionOverviewSkeleton checks={layout.readinessCheckCount} />
      </div>
    </div>
  </div>;
}

/** Table shell used by the Dean's Review Queue and Review Overview panels. */
function TableSkeleton({ columns, rows = 5, footer = false }: { columns: number; rows?: number; footer?: boolean }) {
  const template = `minmax(0,1.4fr) repeat(${columns - 1}, minmax(0,1fr))`;
  return <div className="min-w-0">
    <div className="grid gap-2 border-b border-slate-100 pb-2" style={{ gridTemplateColumns: template }}>{Array.from({ length: columns }).map((_, i) => <Skeleton key={i} className="h-2 w-full max-w-[72px]" />)}</div>
    <div className="divide-y divide-slate-100">{Array.from({ length: rows }).map((_, row) => <div key={row} className="grid items-center gap-2 py-2.5" style={{ gridTemplateColumns: template }}>{Array.from({ length: columns }).map((_, col) => <Skeleton key={col} className={`h-2.5 ${col === 0 ? 'w-4/5' : 'w-3/5'}`} />)}</div>)}</div>
    {footer && <div className="grid gap-2 border-t border-slate-200 pt-2.5" style={{ gridTemplateColumns: template }}>{Array.from({ length: columns }).map((_, i) => <Skeleton key={i} className="h-2.5 w-2/5" />)}</div>}
  </div>;
}

/** Donut plus its legend rows — the Dean's readiness, workload and utilization panels. */
function DonutSkeleton({ legendRows = 4 }: { legendRows?: number }) {
  return <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
    <Skeleton className="mx-auto h-32 w-32 rounded-full" />
    <div className="space-y-2">{Array.from({ length: legendRows }).map((_, i) => <div key={i} className="flex items-start gap-2"><Skeleton className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-2.5 w-4/5" /><Skeleton className="mt-1 h-2 w-2/5" /></div></div>)}</div>
  </div>;
}

function DeanSkeleton() {
  return <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard"><div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 4 }).map((_, i) => <MetricCard key={i} />)}<MetricCard className="xl:col-span-2" /><MetricCard /></div><div className="grid gap-4 xl:grid-cols-12"><PanelFrame className="xl:col-span-4"><TableSkeleton columns={5} /><div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-2.5 w-20" />)}</div></PanelFrame><PanelFrame className="xl:col-span-4"><DonutSkeleton legendRows={5} /></PanelFrame><PanelFrame className="xl:col-span-4"><TableSkeleton columns={5} footer /></PanelFrame></div><div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0"><PanelFrame><div className="flex flex-wrap items-center gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-md" />)}<Skeleton className="ml-auto h-7 w-40 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div><div className="mt-3 grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div><div className="mt-3"><SecretaryTimetableSkeleton /></div></PanelFrame></div><div className="flex min-w-0 flex-col gap-4"><PanelFrame><DonutSkeleton /><div className="mt-3.5 border-t border-slate-100 pt-3"><Skeleton className="h-2.5 w-28" /><div className="mt-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex h-[46px] items-center gap-2"><Skeleton className="h-7 w-7 shrink-0 rounded-full" /><Skeleton className="h-2.5 w-24" /><Skeleton className="h-3 flex-1 rounded-full" /></div>)}</div></div></PanelFrame><PanelFrame><DonutSkeleton legendRows={2} /><Skeleton className="mt-3.5 h-3 w-40" /><Skeleton className="mt-2 h-[140px] w-full rounded" /></PanelFrame></div></div></div>;
}

/**
 * The campus peak-hour grid: a day column plus one cell per teaching hour.
 *
 * Six days and fourteen hours are the shape the server sends under the default
 * 07:00-20:30 operating window, so the block reserves the height the real table
 * takes rather than a generic bar.
 */
function HeatmapSkeleton({ days = 6, hours = 14 }: { days?: number; hours?: number }) {
  const template = `4rem repeat(${hours}, minmax(0,1fr))`;
  return <PanelFrame>
    <div className="space-y-1">
      <div className="grid gap-1" style={{ gridTemplateColumns: template }}>
        <Skeleton className="h-2 w-8" />
        {Array.from({ length: hours }).map((_, i) => <Skeleton key={i} className="h-2 w-full" />)}
      </div>
      {Array.from({ length: days }).map((_, row) => <div key={row} className="grid gap-1" style={{ gridTemplateColumns: template }}>
        <Skeleton className="h-2.5 w-8 self-center" />
        {Array.from({ length: hours }).map((_, col) => <Skeleton key={col} className="h-7 w-full rounded" />)}
      </div>)}
    </div>
    <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
      <Skeleton className="h-2.5 w-12" />
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-3 w-3 rounded-sm" />)}
      <Skeleton className="h-2.5 w-10" />
      <Skeleton className="ml-auto h-2.5 w-44" />
    </div>
  </PanelFrame>;
}

/**
 * Mirrors the VPAA dashboard's row order so the page does not reflow when the
 * real content arrives: header bar, decision KPIs, inventory strip, the
 * full-width approval queue, the workflow/utilisation row, the timetable beside
 * its three side panels, then the full-width peak-hour heatmap.
 */
function VpaaSkeleton() {
  return <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard">
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"><Skeleton className="h-10 w-10 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-3 w-44" /><Skeleton className="mt-1.5 h-2.5 w-56" /></div><Skeleton className="h-7 w-24 rounded-md" /><Skeleton className="h-7 w-28 rounded-md" /></div>

    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 4 }).map((_, i) => <MetricCard key={i} />)}<MetricCard className="xl:col-span-2" /></div>

    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <MetricCard key={i} />)}</div>

    <div className="grid gap-4">
      <PanelFrame><Skeleton className="h-14 w-full rounded-lg" /><div className="mt-3"><TableSkeleton columns={5} rows={4} /></div></PanelFrame>
    </div>

    <div className="grid gap-4 xl:grid-cols-12">
      <PanelFrame className="xl:col-span-6"><TableSkeleton columns={4} rows={6} /><div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5"><Skeleton className="h-2.5 w-24" /><Skeleton className="h-2.5 w-28" /></div></PanelFrame>
      <PanelFrame className="xl:col-span-6"><div className="grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}</div><div className="mt-3"><TableSkeleton columns={4} rows={4} /></div></PanelFrame>
    </div>

    <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0"><PanelFrame><div className="flex flex-wrap items-center gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-md" />)}<Skeleton className="ml-auto h-7 w-40 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div><div className="mt-3 grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div><div className="mt-3"><SecretaryTimetableSkeleton /></div></PanelFrame></div>
      {/* Faculty load, institutional readiness, then the activity trail that
          fills the column down to the timetable's foot. */}
      <div className="flex min-w-0 flex-col gap-4">
        <PanelFrame><DonutSkeleton legendRows={4} /><Skeleton className="mt-3.5 h-4 w-28" /></PanelFrame>
        <PanelFrame><DonutSkeleton legendRows={4} /></PanelFrame>
        <PanelFrame className="min-h-[220px] flex-1"><PanelRows rows={5} /></PanelFrame>
      </div>
    </div>

    <div className="grid gap-4">
      <HeatmapSkeleton />
    </div>
  </div>;
}

function PanelRows({ rows }: { rows: number }) {
  return <div className="divide-y divide-slate-100">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-start gap-2.5 py-2"><Skeleton className="h-4 w-20 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-2.5 w-4/5" /><Skeleton className="mt-1 h-2.5 w-3/5" /></div></div>)}</div>;
}

function TimetableSkeleton() {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3"><div className="flex items-center gap-2"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-4 w-48" /></div><div className="flex gap-2"><Skeleton className="h-7 w-20 rounded-lg" /><Skeleton className="h-7 w-20 rounded-lg" /></div></div><div className="grid grid-cols-[64px_1fr] overflow-hidden rounded-xl border border-slate-200"><div><Skeleton className="h-9 w-full rounded-none" />{Array.from({ length: 13 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-none border-t border-white" />)}</div><div><Skeleton className="h-9 w-full rounded-none" />{Array.from({ length: 13 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-none border-t border-white" />)}</div></div></div>;
}

function PanelSkeleton({ className = '', rows = 4 }: { className?: string; rows?: number }) {
  return <PanelFrame className={className}><div className="space-y-3">{Array.from({ length: rows }).map((_, index) => <div key={index} className="flex items-center gap-2"><Skeleton className="h-7 w-7 shrink-0 rounded-md" /><Skeleton className={`h-2.5 ${index % 2 ? 'w-3/5' : 'w-4/5'}`} /><Skeleton className="ml-auto h-2.5 w-10" /></div>)}</div></PanelFrame>;
}

function ProgramSkeleton() {
  return <div className="space-y-4" aria-label="Loading dashboard"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <MetricCard key={i} />)}</div><div className="grid gap-4 xl:grid-cols-5"><PanelSkeleton className="xl:col-span-2" /><PanelSkeleton className="xl:col-span-3" rows={4} /></div><div className="grid gap-4 xl:grid-cols-2"><PanelSkeleton rows={4} /><PanelSkeleton rows={4} /></div><TimetableSkeleton /><div className="grid gap-4 xl:grid-cols-2"><PanelSkeleton rows={4} /><PanelSkeleton rows={3} /></div></div>;
}

function InstitutionalSkeleton() {
  return <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12" aria-label="Loading dashboard"><div className="flex flex-col gap-4 xl:col-span-6"><div className="grid grid-cols-2 gap-3.5">{Array.from({ length: 4 }).map((_, i) => <MetricCard key={i} />)}</div><TimetableSkeleton /></div><div className="flex flex-col gap-4 xl:col-span-6"><PanelSkeleton rows={5} /><PanelSkeleton rows={4} /><PanelSkeleton rows={4} /></div></div>;
}

export default function DashboardSkeleton({ metricCount, variant = 'institutional', secretaryLayout = DEFAULT_SECRETARY_LAYOUT }: DashboardSkeletonProps) {
  if (variant === 'secretary') return <SecretarySkeleton layout={secretaryLayout} />;
  if (variant === 'dean') return <DeanSkeleton />;
  if (variant === 'vpaa') return <VpaaSkeleton />;
  if (variant === 'program' || variant === 'summary') return <ProgramSkeleton />;
  if (metricCount && metricCount !== 4) return <ProgramSkeleton />;
  return <InstitutionalSkeleton />;
}

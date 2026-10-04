import type { ReactNode } from 'react';
import WeeklyTimetableGrid from '../scheduling/WeeklyTimetableGrid';
import { slotCount } from '../../lib/timeGrid';
import Skeleton from './Skeleton';

type DashboardSkeletonVariant = 'secretary' | 'dean' | 'vpaa' | 'program' | 'institutional';

/**
 * Each variant mirrors its dashboard section for section: the same grids,
 * panel order, header furniture, chart heights and table column templates, so
 * the page does not reflow when the data replaces the placeholders. When a
 * dashboard's markup changes, change the matching variant here with it.
 */

/**
 * What the secretary / program head dashboard will actually render, taken from
 * the same capability checks the page uses. Those checks decide how many queue
 * rows there are and which panels exist.
 */
export interface SecretaryDashboardLayout {
  queueRowCount: number;
  showDraftingProgress: boolean;
  showFacultyAssignment: boolean;
  showTimetable: boolean;
  readinessCheckCount: number;
}

/** A full-capability account: every queue row and panel. */
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
  /** Secretary variant only. */
  secretaryLayout?: SecretaryDashboardLayout;
}

/** One line of text: the box takes the line height, the bar the glyph height. */
function TextLine({ line = 'h-4', className = '' }: { line?: string; className?: string }) {
  return (
    <div className={`flex ${line} items-center`}>
      <Skeleton className={`h-2.5 rounded ${className}`} />
    </div>
  );
}

/**
 * The dashboards' Panel: uppercase title (with an optional subtitle under it)
 * and an optional header link on the right.
 */
function PanelFrame({ className = '', children, action = true, subtitle = true }: {
  className?: string;
  children?: ReactNode;
  action?: boolean;
  subtitle?: boolean;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className={`mb-3 flex justify-between gap-2 border-b border-slate-100 pb-2.5 ${subtitle ? 'items-start' : 'items-center'}`}>
        <div className="min-w-0 flex-1">
          <TextLine className="w-40" />
          {subtitle && <TextLine line="mt-1 h-3.5" className="h-2 w-56 max-w-full" />}
        </div>
        {action && <TextLine className="h-2 w-20 shrink-0" />}
      </div>
      {children}
    </section>
  );
}

/** Same box as DashboardMetricCard: the detail line sits at the foot of the tile. */
function MetricCard() {
  return (
    <div className="flex h-full min-h-[90px] min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton className="mt-0.5 h-4 w-10 rounded" />
        <TextLine line="mt-1 h-3.5" className="w-4/5" />
        <TextLine line="mt-auto pt-0.5 h-4" className="h-2 w-3/5" />
      </div>
    </div>
  );
}

/**
 * The KPI strip: the decision KPI, the completion tile and the inventory tiles
 * share one grid (and one tile box), so every card sits on the same columns.
 */
function MetricStrip({ count, className }: { count: number; className: string }) {
  return (
    <div data-skeleton="metrics" className={`grid grid-cols-2 gap-2.5 md:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <MetricCard key={i} />)}
    </div>
  );
}

/** Donut ring with the white centre the readout sits on. */
function DonutRing() {
  return (
    <div className="relative mx-auto h-32 w-32">
      <Skeleton className="h-32 w-32 rounded-full" />
      <div className="absolute inset-[22%] rounded-full bg-white" />
    </div>
  );
}

/** Donut plus its legend: one dot, label and "value (share%)" line per slice. */
function DonutSkeleton({ legendRows }: { legendRows: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
      <DonutRing />
      <div className="min-w-0 space-y-2">
        {Array.from({ length: legendRows }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <Skeleton className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <TextLine line="h-3.5" className={i % 2 ? 'w-3/5' : 'w-4/5'} />
              <TextLine line="mt-0.5 h-4" className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A dashboard table: header labels, then rows on the page's own column
 * template. `cells` draws each row's cells so a progress-bar or action column
 * keeps its real height.
 */
function TableSkeleton({ template, rows, cells, footer = false }: {
  template: string;
  rows: number;
  cells: (row: number) => ReactNode[];
  footer?: boolean;
}) {
  const columns = cells(0).length;
  return (
    <div className="min-w-0">
      <div className="grid gap-2 border-b border-slate-100 pb-2" style={{ gridTemplateColumns: template }}>
        {Array.from({ length: columns }).map((_, i) => <TextLine key={i} line="h-3" className="h-2 w-4/5 max-w-[72px]" />)}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: template }}>
            {cells(row).map((cell, col) => <div key={col} className="min-w-0">{cell}</div>)}
          </div>
        ))}
      </div>
      {footer && (
        <div className="grid gap-2 border-t border-slate-200 pt-2.5" style={{ gridTemplateColumns: template }}>
          {Array.from({ length: columns }).map((_, i) => <TextLine key={i} className={i ? 'ml-auto w-5' : 'w-10'} />)}
        </div>
      )}
    </div>
  );
}

/** The inline progress bar the tables draw in a 24px-high cell. */
function BarCell() {
  return (
    <div className="flex h-6 items-center gap-2">
      <Skeleton className="h-[9px] flex-1 rounded-full" />
      <Skeleton className="h-2 w-6 shrink-0 rounded" />
    </div>
  );
}

/** Legend strip under a table: icon + label pairs on one line. */
function LegendStrip({ widths, lastRight = false }: { widths: string[]; lastRight?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5">
      {widths.map((width, i) => (
        <div key={i} className={lastRight && i === widths.length - 1 ? 'ml-auto' : ''}>
          <TextLine className={width} />
        </div>
      ))}
    </div>
  );
}

/** InstructorWorkloadChart: a 196px avatar/name/units column, then the bar, 46px a row. */
function WorkloadRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mt-3 min-w-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-[46px] items-center">
          <div className="flex w-[192px] shrink-0 items-center gap-2 pr-1">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-20' : 'w-24'}`} />
            <Skeleton className="ml-auto h-2.5 w-9 shrink-0 rounded" />
          </div>
          <Skeleton className="ml-1 mr-[26px] h-3 flex-1 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Room usage bar chart: 140px, five rows of code, bar and label. */
function RoomUsageChart() {
  return (
    <div className="mt-2 flex h-[140px] flex-col justify-around py-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-[56px] shrink-0 rounded" />
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-2 w-12 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

function StatChipSkeleton({ height = 'h-[66px]' }: { height?: string }) {
  return (
    <div className={`flex ${height} flex-col items-center justify-center gap-1 rounded-md border border-slate-100 bg-slate-50/60 p-2`}>
      <Skeleton className="h-3.5 w-3.5 rounded" />
      <Skeleton className="h-3.5 w-6 rounded" />
      <Skeleton className="h-2 w-14 max-w-full rounded" />
    </div>
  );
}

/**
 * DashboardGantt: the period / mode / rows / zoom controls, the timeline
 * viewport (420px, or the column's spare height on xl), and the legend.
 */
function GanttSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-[118px] rounded-lg" />
        <Skeleton className="h-8 w-[196px] rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="ml-auto h-3 w-28 rounded" />
      </div>
      <div className="flex h-[420px] min-h-[220px] shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 xl:h-0 xl:flex-1">
        <Skeleton className="h-8 w-full shrink-0 rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex min-h-9 flex-1 items-center gap-3 border-t border-slate-100 px-2">
            <Skeleton className="h-2.5 w-20 shrink-0 rounded" />
            <Skeleton className="h-5 rounded-md" style={{ marginLeft: `${(i * 13) % 40}%`, width: `${18 + ((i * 7) % 16)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-3 w-16 rounded" />)}
        <Skeleton className="ml-auto h-3 w-28 rounded" />
      </div>
    </div>
  );
}

/* ───────────────────────────── Secretary / Program Head ───────────────────────────── */

/** Scheduling Work Queue: the attention band, then one line per queue row. */
function QueueSkeleton({ rows }: { rows: number }) {
  return (
    <PanelFrame subtitle={false} className="xl:col-span-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div>
            <Skeleton className="h-5 w-8 rounded" />
            <Skeleton className="mt-1 h-2.5 w-28 rounded" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
      </div>
      <div className="mt-1 divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 py-2.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            <Skeleton className={`h-2.5 flex-1 rounded ${i % 2 ? 'max-w-[60%]' : 'max-w-[75%]'}`} />
            <span className="flex w-7 shrink-0 justify-end"><Skeleton className="h-2.5 w-4 rounded" /></span>
            <span className="flex w-[68px] shrink-0 justify-end"><Skeleton className="h-[22px] w-14 rounded-md" /></span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

/** Department Drafting Progress: donut, year-level bars, three totals and a button. No header link. */
function ProgressSkeleton() {
  return (
    <PanelFrame action={false} subtitle={false} className="flex flex-col xl:col-span-4">
      <div className="grid gap-5 sm:grid-cols-[144px_1fr] sm:items-center">
        <DonutRing />
        <div className="flex h-[168px] flex-col justify-center gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-[50px] shrink-0 rounded" />
              <Skeleton className="h-[7px] flex-1 rounded-full" />
              <Skeleton className="h-2 w-14 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[46px] rounded-md" />)}
        </div>
        <Skeleton className="mt-3 h-[30px] w-full rounded-md" />
      </div>
    </PanelFrame>
  );
}

/** Instructor Assignment: caption row, then the five busiest instructors. */
function WorkloadSkeleton() {
  return (
    <PanelFrame subtitle={false} className="xl:col-span-4">
      <div className="flex items-center justify-between">
        <TextLine line="h-[15px]" className="w-28" />
        <TextLine line="h-[14px]" className="h-2 w-24" />
      </div>
      <WorkloadRows />
    </PanelFrame>
  );
}

/** Room Assignment: status button, four stat chips, the usage chart and its link. */
function RoomAssignmentSkeleton() {
  return (
    <PanelFrame subtitle={false}>
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-8 rounded" />
          <Skeleton className="mt-1 h-2.5 w-44 max-w-full rounded" />
        </div>
        <Skeleton className="h-4 w-4 shrink-0 rounded" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => <StatChipSkeleton key={i} height="h-16" />)}
      </div>
      <div className="mt-3.5 flex items-center justify-between">
        <TextLine line="h-[15px]" className="w-20" />
        <TextLine line="h-[14px]" className="h-2 w-28" />
      </div>
      <RoomUsageChart />
      <TextLine line="mt-3 h-4" className="w-28" />
    </PanelFrame>
  );
}

/** Submission Overview: status band, the four milestones, readiness bar and checklist, then the button. No header link. */
function SubmissionOverviewSkeleton({ checks }: { checks: number }) {
  return (
    <PanelFrame action={false} subtitle={false} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-3.5 w-7 rounded-full" />
            </div>
            <Skeleton className="mt-1 h-2 w-4/5 rounded" />
          </div>
        </div>
        <div className="flex items-start pt-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-0 flex-1">
              <Skeleton className="mx-auto h-6 w-6 rounded-full" />
              <Skeleton className="mx-auto mt-1.5 h-2 w-10 rounded" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col border-t border-slate-100 pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-2 w-14 rounded" />
          </div>
          <div className="mt-1 flex h-7 items-center gap-2">
            <Skeleton className="h-[9px] flex-1 rounded-full" />
            <Skeleton className="h-2 w-6 shrink-0 rounded" />
          </div>
          <div className="mt-2 space-y-1.5">
            {Array.from({ length: checks }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                <Skeleton className={`h-2.5 rounded ${i % 2 ? 'w-3/5' : 'w-4/5'}`} />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-[26px] w-full rounded-md" />
      </div>
    </PanelFrame>
  );
}

/** DashboardTimetableGrid: header with the delivery toggle, today's column, the category legend. */
function SecretaryTimetableSkeleton() {
  const scheduleCards = [
    { id: 'dashboard-grid-1', startSlot: 2, durationSlots: 4 },
    { id: 'dashboard-grid-2', startSlot: 8, durationSlots: 3 },
    { id: 'dashboard-grid-3', startSlot: 13, durationSlots: 4 },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex h-6 items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
          <TextLine line="mt-1 h-4" className="w-20" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-[168px] rounded-xl" />
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-[34px] w-44 rounded-xl" />
        </div>
      </header>
      <div className="overflow-hidden bg-slate-50/70 p-4">
        <WeeklyTimetableGrid days={['Loading']} slotCount={slotCount()} minWidth={0} getTimeLabel={() => ''} isLoading>
          {scheduleCards.map((card) => (
            <div
              key={card.id}
              className="z-10 m-0.5 flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 shadow-sm"
              style={{ gridColumn: 2, gridRow: `${card.startSlot + 2} / span ${card.durationSlots}` }}
            >
              <div>
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="mt-1.5 h-2.5 w-24 rounded" />
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <Skeleton className="h-2 w-20 rounded" />
                <Skeleton className="h-3 w-5 rounded" />
              </div>
            </div>
          ))}
        </WeeklyTimetableGrid>
      </div>
      <footer className="flex items-center gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
        <TextLine className="w-16" />
        <TextLine className="w-14" />
        <TextLine className="w-14" />
      </footer>
    </section>
  );
}

function SecretarySkeleton({ layout }: { layout: SecretaryDashboardLayout }) {
  return (
    <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard" aria-busy="true">
      <MetricStrip count={6} className="xl:grid-cols-6" />
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
    </div>
  );
}

/* ───────────────────────────── Dean ───────────────────────────── */

const DEAN_QUEUE_COLUMNS = 'minmax(0,1.25fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 80px';
const DEAN_OVERVIEW_COLUMNS = 'minmax(0,1.4fr) 58px 62px 66px 62px';

function DeanSkeleton() {
  return (
    <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard" aria-busy="true">
      <MetricStrip count={6} className="xl:grid-cols-6" />

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Schedule Review Queue */}
        <PanelFrame className="xl:col-span-4">
          <TableSkeleton
            template={DEAN_QUEUE_COLUMNS}
            rows={3}
            cells={() => [
              <div className="flex items-center gap-1.5"><Skeleton className="h-3.5 w-3.5 shrink-0 rounded" /><Skeleton className="h-2.5 w-4/5 rounded" /></div>,
              <Skeleton className="h-2.5 w-4/5 rounded" />,
              <Skeleton className="h-2.5 w-4/5 rounded" />,
              <BarCell />,
              <div className="flex justify-end gap-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-6 rounded-md" />)}</div>,
            ]}
          />
          <LegendStrip widths={['w-16', 'w-28', 'w-14']} />
        </PanelFrame>

        {/* Section Submission Readiness */}
        <PanelFrame className="xl:col-span-4">
          <DonutSkeleton legendRows={5} />
        </PanelFrame>

        {/* Schedule Review Overview */}
        <PanelFrame action={false} className="xl:col-span-4">
          <TableSkeleton
            template={DEAN_OVERVIEW_COLUMNS}
            rows={3}
            footer
            cells={() => [
              <TextLine className="w-4/5" />,
              ...Array.from({ length: 4 }).map(() => <TextLine className="ml-auto w-5" />),
            ]}
          />
        </PanelFrame>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Like the page, the side column sets the desktop height, not the timetable. */}
        <div className="flex min-h-0 min-w-0 flex-col xl:[contain:size]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PanelFrame className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[26px] w-28 rounded-md" />)}
                <Skeleton className="ml-auto h-[30px] w-40 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => <StatChipSkeleton key={i} />)}
              </div>
              <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">
                <GanttSkeleton />
              </div>
            </PanelFrame>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Instructor Workload */}
          <PanelFrame className="flex flex-col">
            <DonutSkeleton legendRows={4} />
            <div className="mt-auto border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <TextLine line="h-[15px]" className="w-36" />
                <TextLine line="h-[14px]" className="h-2 w-24" />
              </div>
              <WorkloadRows />
            </div>
          </PanelFrame>

          {/* Room Utilization */}
          <PanelFrame action={false} className="flex flex-col">
            <DonutSkeleton legendRows={2} />
            <div className="mt-3.5 flex items-center justify-between">
              <TextLine line="h-[15px]" className="w-36" />
              <TextLine line="h-[14px]" className="h-2 w-20" />
            </div>
            <RoomUsageChart />
            <div className="mt-auto pt-3"><TextLine className="w-28" /></div>
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── VPAA ───────────────────────────── */

const VPAA_ATTENTION_COLUMNS = 'minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.9fr) 78px';
const VPAA_WORKFLOW_COLUMNS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,0.95fr) 92px';
const VPAA_BUILDING_COLUMNS = 'minmax(0,1.3fr) minmax(0,1fr) 64px 72px';

function VpaaSkeleton() {
  return (
    <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard" aria-busy="true">
      <MetricStrip count={7} className="xl:grid-cols-7" />

      {/* Requires Attention */}
      <div className="grid gap-4">
        <PanelFrame>
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <TextLine className="h-3 w-64 max-w-full" />
              <TextLine line="mt-0.5 h-3.5" className="w-72 max-w-full" />
            </div>
          </div>
          <div className="mt-3">
            <TableSkeleton
              template={VPAA_ATTENTION_COLUMNS}
              rows={3}
              cells={() => [
                <TextLine className="w-4/5" />,
                <TextLine className="w-3/5" />,
                <TextLine className="w-3/5" />,
                <Skeleton className="h-5 w-full rounded-full" />,
                <Skeleton className="h-6 w-full rounded-md" />,
              ]}
            />
          </div>
        </PanelFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Workflow · Department Scheduling Progress */}
        <PanelFrame className="xl:col-span-6">
          <TableSkeleton
            template={VPAA_WORKFLOW_COLUMNS}
            rows={6}
            cells={() => [
              <TextLine className="w-4/5" />,
              <BarCell />,
              <TextLine className="ml-auto w-12" />,
              <div className="flex justify-end"><Skeleton className="h-[18px] w-16 rounded-full" /></div>,
            ]}
          />
          <LegendStrip widths={['w-36', 'w-36', 'w-24']} lastRight />
        </PanelFrame>

        {/* Room Utilisation by Building */}
        <PanelFrame className="flex flex-col xl:col-span-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-[51px] flex-col items-center justify-center gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 p-2">
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-2 w-12 rounded" />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <TableSkeleton
              template={VPAA_BUILDING_COLUMNS}
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

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Like the page, the side column sets the desktop height, not the timetable. */}
        <div className="flex min-h-0 min-w-0 flex-col xl:[contain:size]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <header className="flex shrink-0 flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-[19px] w-14 rounded" />
                <Skeleton className="ml-auto h-[30px] w-40 rounded-md" />
                <Skeleton className="h-7 w-[72px] rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-28 rounded" />
              </header>
              <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col">
                <GanttSkeleton />
              </div>
            </section>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Instructor Load Overview */}
          <PanelFrame className="flex flex-col">
            <DonutSkeleton legendRows={4} />
            <div className="mt-auto pt-3"><TextLine className="w-36" /></div>
          </PanelFrame>

          {/* Institutional Readiness */}
          <PanelFrame>
            <DonutSkeleton legendRows={6} />
          </PanelFrame>

          {/* Recent Administrative Activity (compact rows) */}
          <PanelFrame className="flex min-h-[220px] flex-1 flex-col">
            <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-[18px] w-20 rounded-full" />
                    <Skeleton className="ml-auto h-2 w-10 rounded" />
                  </div>
                  <TextLine line="mt-1 h-[18px]" className={i % 2 ? 'w-3/5' : 'w-4/5'} />
                  <TextLine line="mt-0.5 h-4" className="h-2 w-1/2" />
                </div>
              ))}
            </div>
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Legacy institutional ───────────────────────────── */

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
  if (variant === 'secretary') return <SecretarySkeleton layout={secretaryLayout} />;
  if (variant === 'dean') return <DeanSkeleton />;
  if (variant === 'vpaa') return <VpaaSkeleton />;
  // The program head dashboard is the secretary page; its skeleton is too.
  if (variant === 'program' || variant === 'summary') return <SecretarySkeleton layout={secretaryLayout} />;
  if (metricCount && metricCount !== 4) return <SecretarySkeleton layout={secretaryLayout} />;
  return <InstitutionalSkeleton />;
}

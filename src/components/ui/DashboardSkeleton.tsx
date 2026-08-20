import type { ReactNode } from 'react';
import WeeklyTimetableGrid from '../scheduling/WeeklyTimetableGrid';
import { slotCount } from '../../lib/timeGrid';
import Skeleton from './Skeleton';

type DashboardSkeletonVariant = 'secretary' | 'program' | 'institutional';

interface DashboardSkeletonProps {
  metricCount?: number;
  variant?: DashboardSkeletonVariant | 'dashboard' | 'summary';
}

function PanelFrame({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5"><Skeleton className="h-3 w-36" /><Skeleton className="h-2.5 w-14" /></div>
    {children}
  </section>;
}

function MetricCard() {
  return <div className="min-h-[90px] rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start gap-2.5"><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-5 w-10" /><Skeleton className="mt-1 h-3 w-4/5" /><Skeleton className="mt-1.5 h-2.5 w-3/5" /></div></div></div>;
}

function QueueSkeleton() {
  return <PanelFrame className="xl:col-span-4"><div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5"><Skeleton className="h-9 w-9 rounded-full" /><div className="mr-auto"><Skeleton className="h-5 w-8" /><Skeleton className="mt-1 h-2.5 w-28" /></div><Skeleton className="h-5 w-16 rounded-full" /></div><div className="mt-1 divide-y divide-slate-100">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-2.5 py-2.5"><Skeleton className="h-7 w-7 shrink-0 rounded-md" /><Skeleton className="h-2.5 flex-1" /><Skeleton className="h-2.5 w-7" /><Skeleton className="h-5 w-16 rounded-md" /></div>)}</div></PanelFrame>;
}

function ProgressSkeleton() {
  return <PanelFrame className="flex flex-col xl:col-span-4"><div className="grid gap-5 sm:grid-cols-[144px_1fr] sm:items-center"><Skeleton className="mx-auto h-32 w-32 rounded-full" /><div className="h-[168px] space-y-5 pt-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-2 w-14" /><Skeleton className="h-2 flex-1 rounded-full" /><Skeleton className="h-2 w-12" /></div>)}</div></div><div className="mt-auto border-t border-slate-100 pt-4"><div className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}</div><Skeleton className="mt-3 h-8 w-full rounded-md" /></div></PanelFrame>;
}

function WorkloadSkeleton() {
  return <PanelFrame className="xl:col-span-4"><div className="flex items-center justify-between"><Skeleton className="h-2.5 w-28" /><Skeleton className="h-2 w-24" /></div><div className="mt-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex h-[46px] items-center gap-2"><Skeleton className="h-7 w-7 shrink-0 rounded-full" /><Skeleton className="h-2.5 w-28" /><Skeleton className="h-3 flex-1 rounded-full" /></div>)}</div></PanelFrame>;
}

function SecretaryTimetableSkeleton() {
  const scheduleCards = [
    { id: 'dashboard-grid-1', startSlot: 2, durationSlots: 4 },
    { id: 'dashboard-grid-2', startSlot: 8, durationSlots: 3 },
    { id: 'dashboard-grid-3', startSlot: 13, durationSlots: 4 },
  ];

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-4 w-32" /></div><Skeleton className="mt-1 h-2.5 w-20" /></div><div className="flex flex-wrap items-center gap-2"><Skeleton className="h-9 w-40 rounded-xl" /><Skeleton className="h-7 w-28 rounded-full" /><Skeleton className="h-9 w-36 rounded-xl" /></div></header><div className="overflow-hidden bg-slate-50/70 p-4"><WeeklyTimetableGrid days={['Loading']} slotCount={slotCount()} headerHeight={54} timeColumnWidth={88} slotHeight={24} minWidth={0} getTimeLabel={() => ''} isLoading>{scheduleCards.map(card => <div key={card.id} className="z-10 flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 shadow-sm" style={{ gridColumn: 2, gridRow: `${card.startSlot + 2} / span ${card.durationSlots}` }}><div><Skeleton className="h-3 w-16" /><Skeleton className="mt-1.5 h-2.5 w-24" /><Skeleton className="mt-1 h-2 w-12" /></div><div className="mt-1 flex items-center gap-1"><Skeleton className="h-3.5 w-12 rounded-full" /><Skeleton className="h-3.5 w-12 rounded-full" /></div></div>)}</WeeklyTimetableGrid></div><footer className="flex items-center gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-3"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-3 w-14 rounded-full" /><Skeleton className="h-3 w-14 rounded-full" /></footer></section>;
}

function SecretarySkeleton() {
  return <div className="space-y-4 pb-8 text-slate-800" aria-label="Loading dashboard"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Skeleton className="h-8 w-52" /><Skeleton className="mt-1 h-5 w-80 max-w-full" /></div></header><div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <MetricCard key={i} />)}</div><div className="grid gap-4 xl:grid-cols-12"><QueueSkeleton /><ProgressSkeleton /><WorkloadSkeleton /></div><div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0"><SecretaryTimetableSkeleton /></div><div className="flex min-w-0 flex-col gap-4"><PanelFrame><Skeleton className="h-14 w-full rounded-lg" /><div className="mt-3 grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div><Skeleton className="mt-3.5 h-3 w-full" /><Skeleton className="mt-2 h-[140px] w-full rounded" /><Skeleton className="mt-3 h-4 w-44" /></PanelFrame><PanelFrame className="flex-1"><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="mt-2.5 h-8 w-full" /><Skeleton className="mt-2.5 h-7 w-full" /><div className="mt-2 space-y-1.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-3.5 w-full" />)}</div><Skeleton className="mt-3 h-7 w-full rounded-md" /></PanelFrame></div></div></div>;
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

export default function DashboardSkeleton({ metricCount, variant = 'institutional' }: DashboardSkeletonProps) {
  if (variant === 'secretary') return <SecretarySkeleton />;
  if (variant === 'program' || variant === 'summary') return <ProgramSkeleton />;
  if (metricCount && metricCount !== 4) return <ProgramSkeleton />;
  return <InstitutionalSkeleton />;
}

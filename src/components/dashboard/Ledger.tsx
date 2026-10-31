import type { ReactNode } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { STAGE } from '../../lib/dashboardStage';


export interface StageSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * A single proportional bar split by stage, with its legend. Replaces the
 * per-panel donuts: one shape for "how is this group split", read left to right.
 */
export function StageBar({ segments, label, animate = false, size = 'md', className = '' }: {
  segments: StageSegment[];
  label: string;
  animate?: boolean;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const filled = segments.filter(segment => segment.value > 0);
  const summary = segments.map(segment => `${segment.value} ${segment.label}`).join(', ');

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${label}: ${summary}`}
        className={`flex w-full gap-[2px] overflow-hidden rounded-full bg-stage-idle ${size === 'md' ? 'h-3' : 'h-2'}`}
      >
        {total > 0 && filled.map((segment, index) => (
          <span
            key={segment.key}
            title={`${segment.label}: ${segment.value}`}
            className={`h-full origin-left ${animate ? 'animate-ledgerGrow motion-reduce:animate-none' : ''}`}
            style={{ flexGrow: segment.value, flexBasis: 0, backgroundColor: segment.color, animationDelay: animate ? `${index * 90}ms` : undefined }}
          />
        ))}
      </div>
      <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 ${size === 'md' ? 'mt-3' : 'mt-2.5'}`}>
        {segments.map(segment => (
          <li key={segment.key} className="flex items-center gap-1.5 text-[13px]">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
            <b className="font-semibold tabular-nums text-text">{segment.value.toLocaleString()}</b>
            <span className="text-muted">{segment.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A thin horizontal meter for one value out of 100. */
export function Meter({ value, color = STAGE.ready, label }: { value: number; color?: string; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="h-1.5 w-full overflow-hidden rounded-full bg-stage-idle"
    >
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

export type TagTone = 'approved' | 'ready' | 'waiting' | 'returned' | 'drafting' | 'done';

const TAG_TONES: Record<TagTone, string> = {
  approved: 'bg-primary/[0.07] text-primary',
  ready: 'bg-accent/15 text-stage-warnText',
  waiting: 'bg-stage-waiting/10 text-stage-waiting',
  returned: 'bg-stage-returned/10 text-stage-returned',
  drafting: 'bg-stage-idle/70 text-muted',
  done: 'bg-stage-done/10 text-stage-done',
};

export function StatusTag({ tone, children, title }: { tone: TagTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * The submission journey as a horizontal track: Drafting, Submitted, Dean,
 * VPAA. These really are sequential, so the steps carry numbers.
 */
export function MilestoneTrack({ milestones, titles, at, done, isReturned, compact = false }: {
  milestones: readonly string[];
  titles: Record<string, string>;
  at: number;
  done: number;
  isReturned: boolean;
  compact?: boolean;
}) {
  return (
    <ol className={`${compact ? '' : 'mt-6'} grid gap-2`} style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}>
      {milestones.map((milestone, i) => {
        const passed = i < done;
        const here = i === at && !passed;
        const bar = passed ? 'bg-stage-done' : here ? (isReturned ? 'bg-stage-returned' : 'bg-accent') : 'bg-stage-idle';
        return (
          <li key={milestone} className="min-w-0" aria-current={here ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${bar}`} />
            <div className="mt-2.5 flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  passed ? 'bg-stage-done text-white'
                  : here ? (isReturned ? 'bg-stage-returned text-white' : 'bg-primary text-white')
                  : 'bg-stage-idle text-muted'}`}
              >
                {passed ? <Check className="h-3 w-3" aria-hidden="true" /> : here && isReturned ? <RotateCcw className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`truncate text-[13px] ${here ? 'font-semibold text-primary' : passed ? 'text-stage-done' : 'text-muted'}`}>{milestone}</span>
            </div>
            {!compact && <p className="mt-0.5 hidden truncate pl-[26px] text-[12px] text-muted sm:block" title={titles[milestone]}>{titles[milestone]}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted">{children}</p>;
}

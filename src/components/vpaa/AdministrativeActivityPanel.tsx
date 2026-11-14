import { Panel } from './DashboardPrimitives';
import { formatPhilippineDate } from '../../lib/philippineTime';
import { relativeAge } from '../../lib/vpaaOverview';
import { humaniseEvent } from '../../lib/dashboardFormat';

export interface ActivityRow {
  id: string;
  event: string;
  category: string;
  actor: string | null;
  actorType?: 'user' | 'system' | 'unknown';
  occurredAt: string;
}

const CATEGORY_TONE: Record<string, string> = {
  schedule_workflow: 'bg-primary/10 text-primary',
  scheduling: 'bg-stage-waiting/10 text-stage-waiting',
  faculty_assignment: 'bg-stage-done/10 text-stage-done',
  user_management: 'bg-accent/[0.12] text-stage-warnText',
  authentication: 'bg-stage-idle/60 text-muted',
};

export default function AdministrativeActivityPanel({
  rows,
  loading,
  error,
  now,
  onOpen,
  className = '',
  compact = false,
}: {
  rows: ActivityRow[];
  loading: boolean;
  error: boolean;
  now: Date;
  onOpen: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Panel
      title="Recent Administrative Activity"
      subtitle={compact ? 'Scheduling, approvals and user management.' : "The institution's audit trail across scheduling, approvals and user management."}
      action="Open activity log"
      onAction={onOpen}
      className={`flex flex-col ${className}`}
    >
      {loading && <p className="py-6 text-center text-xs text-muted">Loading recent activity…</p>}
      {!loading && error && <p className="py-6 text-center text-xs text-muted">Activity could not be loaded.</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="py-6 text-center text-xs text-muted">No administrative activity recorded yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className={`space-y-2 ${compact ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
          {rows.map(row => {
            const badge = (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-tight ${CATEGORY_TONE[row.category] ?? CATEGORY_TONE.authentication}`}>
                {row.category.replace(/_/g, ' ')}
              </span>
            );
            const title = humaniseEvent(row.event);
            const when = formatPhilippineDate(row.occurredAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            if (compact) return (
              <li key={row.id} className="rounded-xl border border-border/70 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  {badge}
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-muted">{relativeAge(row.occurredAt, now)}</span>
                </div>
                <p className="mt-1 text-[13px] font-bold leading-snug text-text" title={title}>{title}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">{row.actor || (row.actorType === 'system' ? 'System' : 'Actor unavailable')} · {when}</p>
              </li>
            );

            return (
              <li key={row.id} className="flex items-start gap-2.5 rounded-xl border border-border/70 px-3.5 py-3">
                <span className="mt-0.5">{badge}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-text">{title}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">{row.actor || (row.actorType === 'system' ? 'System' : 'Actor unavailable')} · {when}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-muted">{relativeAge(row.occurredAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

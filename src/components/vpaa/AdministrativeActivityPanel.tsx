import { Panel } from './DashboardPrimitives';
import { formatPhilippineDate } from '../../lib/philippineTime';
import { relativeAge } from '../../lib/vpaaOverview';
import { humaniseEvent } from '../../lib/dashboardFormat';

/**
 * The institution's recent administrative trail.
 *
 * Sourced from `/activity-log`, the same audit feed the full Activity Log page
 * reads, rather than from notifications: notifications are addressed to a
 * recipient and are marked read, so they describe what this account has been
 * told, not what the institution did.
 */

export interface ActivityRow {
  id: string;
  event: string;
  category: string;
  actor: string | null;
  occurredAt: string;
}

const CATEGORY_TONE: Record<string, string> = {
  schedule_workflow: 'bg-violet-50 text-violet-700',
  scheduling: 'bg-sky-50 text-sky-700',
  faculty_assignment: 'bg-emerald-50 text-emerald-700',
  user_management: 'bg-amber-50 text-amber-800',
  authentication: 'bg-slate-100 text-slate-600',
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
  /** Narrow column placement: rows stack their badge above the headline and the
   *  list scrolls inside whatever height the panel is given. */
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
      {loading && <p className="py-6 text-center text-xs italic text-slate-400">Loading recent activity…</p>}
      {!loading && error && <p className="py-6 text-center text-xs italic text-slate-400">Activity could not be loaded.</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="py-6 text-center text-xs italic text-slate-400">No administrative activity recorded yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className={`divide-y divide-slate-100 ${compact ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
          {rows.map(row => {
            const badge = (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide ${CATEGORY_TONE[row.category] ?? CATEGORY_TONE.authentication}`}>
                {row.category.replace(/_/g, ' ')}
              </span>
            );
            const title = humaniseEvent(row.event);
            const when = formatPhilippineDate(row.occurredAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            /* Narrow column: the badge gets its own line beside the age instead of
               competing with the headline for the same 360px, which left the text
               wrapping mid-phrase. */
            if (compact) return (
              <li key={row.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  {badge}
                  <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-400">{relativeAge(row.occurredAt, now)}</span>
                </div>
                <p className="mt-1 text-[12px] font-bold leading-snug text-slate-700" title={title}>{title}</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{row.actor ?? 'System'} · {when}</p>
              </li>
            );

            return (
              <li key={row.id} className="flex items-start gap-2.5 py-2">
                <span className="mt-0.5">{badge}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold leading-tight text-slate-700">{title}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{row.actor ?? 'System'} · {when}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-slate-400">{relativeAge(row.occurredAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

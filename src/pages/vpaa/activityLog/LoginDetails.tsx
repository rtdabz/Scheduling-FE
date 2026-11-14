import { Link, useLocation } from 'react-router-dom';
import { Eye, ShieldAlert } from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import { formatDateTime, initials } from './activityLogModel';
import { failureReason, locationLabel, loginDetailsPath, LOGIN_STATUSES, loginUserName, loginUserRole, methodLabel, type LoginEntry } from './loginActivityModel';

/** Everything recorded about one sign-in attempt, used in the map side panel. */
export default function LoginDetails({ entry }: { entry: LoginEntry }) {
  const location = useLocation();
  const status = LOGIN_STATUSES[entry.status];
  const reason = failureReason(entry.reason);
  const rows: [string, string][] = [
    ['Location', locationLabel(entry.location)],
    ['IP address', entry.ip_address ?? 'Not recorded'],
    ['Device', `${entry.client.device} · ${entry.client.os}`],
    ['Browser', entry.client.browser],
    ['Date and time', formatDateTime(entry.occurred_at)],
    ['Method', methodLabel(entry.method)],
  ];
  if (reason) rows.push(['Failure reason', reason]);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3" aria-label={`Sign-in by ${loginUserName(entry)}`}>
      <header className="flex items-start gap-2.5">
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${entry.user?.name ? 'bg-[#F5E9EA] text-[#701522]' : 'bg-gray-100 text-gray-400'}`}>
          {entry.user?.name ? initials(entry.user.name) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{loginUserName(entry)}</p>
          <p className="truncate text-[11px] text-gray-500">{loginUserRole(entry)}</p>
        </div>
        <Badge tone={status.tone} dot>{status.label}</Badge>
      </header>
      <dl className="mt-2.5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd className="break-words font-medium text-gray-800 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {entry.location.is_proxy && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
          <ShieldAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          VPN, proxy or hosting network — the real location may differ.
        </p>
      )}
      <Link
        to={loginDetailsPath(entry.id)}
        state={{ from: `${location.pathname}${location.search}` }}
        className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#701522] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/30"
      >
        <Eye aria-hidden="true" className="h-3.5 w-3.5" /> View sign-in details
      </Link>
    </article>
  );
}

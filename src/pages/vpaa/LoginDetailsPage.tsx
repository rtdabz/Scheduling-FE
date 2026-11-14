import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CalendarClock, Globe2, Info, MapPinOff, MonitorSmartphone, ShieldAlert, UserRound } from 'lucide-react';
import api from '../../lib/api';
import Badge from '../../components/ui/Badge';
import { formatExact, initials } from './activityLog/activityLogModel';
import {
  failureReason, locationLabel, LOGIN_STATUSES, loginUserName, loginUserRole, methodLabel, type LoginEntry,
} from './activityLog/loginActivityModel';

// Leaflet is only downloaded when a sign-in actually has coordinates to show.
const SingleLoginMap = lazy(() => import('./activityLog/SingleLoginMap'));

type LoginDetailResponse = { data: LoginEntry; meta: { retention_days: number } };

const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
  private: { title: 'Signed in from a private network', body: 'The IP address belongs to an internal, campus or local network, so it cannot be placed on a public map.' },
  unavailable: { title: 'Location could not be determined', body: 'The geolocation provider had no reliable result for this IP address, or the lookup was unavailable at sign-in time.' },
  pending: { title: 'Location lookup in progress', body: 'The approximate location is still being resolved. Refresh in a moment.' },
  expired: { title: 'Location no longer retained', body: 'Location details are deleted after the retention period. The sign-in record itself is kept in the audit log.' },
};

/** Back target: the Activity Log view the VPAA came from (tab and filters kept), else the default log. */
const backTarget = (state: unknown) => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/activity-log') ? from : '/activity-log';
};

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span aria-hidden="true" className="text-[#701522]">{icon}</span>
        {title}
      </h2>
      <dl className="divide-y divide-gray-100">{children}</dl>
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13px]">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`break-words font-medium text-gray-900 ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}

export default function LoginDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const back = backTarget(location.state);
  const [response, setResponse] = useState<LoginDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<LoginDetailResponse>(`/activity-log/logins/${id}`);
      setResponse(result.data);
    } catch (loadError: unknown) {
      const status = axios.isAxiosError(loadError) ? loadError.response?.status : undefined;
      setError(status === 404
        ? { message: 'This sign-in record does not exist, or it is not a sign-in event.', notFound: true }
        : { message: 'The sign-in details could not be loaded. Check your connection, then try again.', notFound: false });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const entry = response?.data;
  const geo = entry?.location;
  const hasPin = geo?.status === 'resolved' && geo.latitude !== null && geo.longitude !== null;
  const coordinates = hasPin ? `${geo.latitude!.toFixed(2)}, ${geo.longitude!.toFixed(2)}` : null;

  const popupDetails = useMemo<[string, string][]>(() => {
    if (!geo || !hasPin) return [];
    return ([
      ['City', geo.city], ['Region', geo.region], ['Country', geo.country], ['Coordinates', coordinates],
    ] as [string, string | null][]).filter((row): row is [string, string] => Boolean(row[1]));
  }, [geo, hasPin, coordinates]);

  const backLink = (
    <Link to={back} className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-[#701522] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/30">
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to Activity Log
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-red-700">{error.message}</p>
          {!error.notFound && <button type="button" onClick={() => void load()} className="mt-3 text-sm font-bold text-[#701522] hover:underline">Try again</button>}
        </div>
      </div>
    );
  }

  if (loading || !entry || !geo) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading sign-in details">
        {backLink}
        <div className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    );
  }

  const status = LOGIN_STATUSES[entry.status];
  const reason = failureReason(entry.reason);
  const fallback = UNAVAILABLE_COPY[geo.status] ?? UNAVAILABLE_COPY.unavailable;

  return (
    <div className="space-y-4">
      {backLink}

      <header className={`flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 border-l-4 bg-white px-4 py-3.5 shadow-sm ${entry.status === 'failed' ? 'border-l-red-500' : 'border-l-[#701522]'}`}>
        <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${entry.user?.name ? 'bg-[#F5E9EA] text-[#701522]' : 'bg-gray-100 text-gray-400'}`}>
          {entry.user?.name ? initials(entry.user.name) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-jakarta text-lg font-bold text-gray-900">{loginUserName(entry)}</h1>
          <p className="text-xs text-gray-500">
            {loginUserRole(entry)} · {entry.status === 'failed' ? 'Sign-in attempt' : 'Signed in'} {formatExact(entry.occurred_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {geo.is_proxy && <Badge tone="accent" icon={<ShieldAlert className="h-3 w-3" />}>VPN or hosting network</Badge>}
          <Badge tone={status.tone} dot>{status.label}</Badge>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Section title="User" icon={<UserRound className="h-3.5 w-3.5" />}>
            <Field label="Full name" value={loginUserName(entry)} />
            <Field label="Role" value={loginUserRole(entry)} />
            {entry.user?.username && <Field label="Username" value={entry.user.username} />}
          </Section>

          <Section title="Sign-in" icon={<CalendarClock className="h-3.5 w-3.5" />}>
            <Field label="Status" value={<Badge tone={status.tone} dot>{status.label}</Badge>} />
            {reason && <Field label="Failure reason" value={reason} />}
            <Field label="Date and time" value={formatExact(entry.occurred_at)} />
            <Field label="Method" value={methodLabel(entry.method)} />
            <Field label="IP address" value={entry.ip_address ?? 'Not recorded'} mono />
          </Section>

          <Section title="Device" icon={<MonitorSmartphone className="h-3.5 w-3.5" />}>
            <Field label="Device" value={entry.client.device} />
            <Field label="Operating system" value={entry.client.os} />
            <Field label="Browser" value={entry.client.browser} />
          </Section>
        </div>

        <section aria-label="Geographical location" className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Globe2 aria-hidden="true" className="h-3.5 w-3.5 text-[#701522]" />
            Approximate location
          </h2>

          <div className="relative h-[24rem] bg-gray-50 lg:h-auto lg:min-h-[24rem] lg:flex-1">
            {hasPin ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-gray-100" aria-label="Loading map" />}>
                <SingleLoginMap latitude={geo.latitude!} longitude={geo.longitude!} failed={entry.status === 'failed'} details={popupDetails} />
              </Suspense>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-gray-200">
                  <MapPinOff aria-hidden="true" className="h-5 w-5 text-gray-400" />
                </span>
                <p className="mt-3 text-sm font-semibold text-gray-800">{fallback.title}</p>
                <p className="mt-1 max-w-sm text-xs text-gray-500">{fallback.body}</p>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-px border-t border-gray-200 bg-gray-100 sm:grid-cols-4">
            {([
              ['City', geo.city], ['Region', geo.region], ['Country', geo.country], ['Coordinates', coordinates],
            ] as [string, string | null][]).map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-2.5">
                <dt className="text-[11px] font-medium text-gray-500">{label}</dt>
                <dd className={`mt-0.5 truncate text-[13px] font-semibold ${value ? 'text-gray-900' : 'text-gray-400'} ${label === 'Coordinates' ? 'font-mono text-[12px]' : ''}`} title={value ?? undefined}>
                  {value ?? 'Not available'}
                </dd>
              </div>
            ))}
          </dl>

          <p className="flex items-start gap-2 border-t border-gray-100 bg-amber-50/50 px-4 py-2 text-[11px] leading-relaxed text-gray-600">
            <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
            <span>
              {hasPin ? `${locationLabel(geo)} is an estimate from the IP address, accurate to about the city level. ` : ''}
              VPNs, mobile data and campus networks may show the provider's location. WICARS never uses device GPS. Location details are kept for {response?.meta.retention_days ?? 90} days.
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}

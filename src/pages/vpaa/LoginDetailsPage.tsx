import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, BadgeCheck, Clock3, Crosshair, Globe2, Info, KeyRound, MapPinOff, Maximize2, MonitorSmartphone, Navigation, ShieldAlert, Target, UserRound, Wifi,
} from 'lucide-react';
import api from '../../lib/api';
import Badge from '../../components/ui/Badge';
import { formatExact, initials } from './activityLog/activityLogModel';
import {
  deviceLocationLabel, failureReason, LOCATION_SOURCES, locationLabel, locationSource, LOGIN_STATUSES, loginUserName, loginUserRole, methodLabel, type LoginEntry,
} from './activityLog/loginActivityModel';

// Leaflet is only downloaded when a sign-in actually has coordinates to show.
const SingleLoginMap = lazy(() => import('./activityLog/SingleLoginMap'));

type LoginDetailResponse = { data: LoginEntry; meta: { retention_days: number } };

/** Why nothing is mapped. In every case no device location was shared; the body explains the IP side. */
const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
  private: { title: 'Location unavailable', body: 'No device location was shared, and the IP address belongs to a private, campus or local network, so it cannot be placed on a public map.' },
  unavailable: { title: 'Location unavailable', body: 'No device location was shared, and the geolocation provider had no reliable result for this IP address.' },
  pending: { title: 'Location lookup in progress', body: 'The location is still being resolved. Refresh in a moment.' },
  expired: { title: 'Location no longer retained', body: 'Location details are deleted after the retention period. The sign-in record itself is kept in the audit log.' },
};

const SOURCE_ICONS = { device: Crosshair, ip: Wifi, none: MapPinOff } as const;

/** Back target: the Activity Log view the VPAA came from (tab and filters kept), else the default log. */
const backTarget = (state: unknown) => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/activity-log') ? from : '/activity-log';
};

function Card({ title, subtitle, icon, action, children, className = '', label }: {
  title: string; subtitle?: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string; label?: string;
}) {
  return (
    <section aria-label={label} className={`min-w-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-3">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#5A1220]/[0.06] text-[#5A1220] ring-1 ring-inset ring-[#5A1220]/10">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-2.5">
      <dt className="text-[12px] text-gray-500">{label}</dt>
      <dd className={`min-w-0 break-words text-[13px] font-medium text-gray-900 ${mono ? 'font-mono text-[12px] tabular-nums' : ''}`}>{value}</dd>
    </div>
  );
}

function MetaCell({ label, value, icon, mono = false, className = '' }: { label: string; value: string | null; icon: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 bg-white px-4 py-3 ${className}`}>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gray-400">
        <span aria-hidden="true" className="text-gray-400">{icon}</span>
        {label}
      </dt>
      <dd className={`mt-1 truncate text-[13px] font-semibold ${value ? 'text-gray-900' : 'font-medium text-gray-400'} ${mono && value ? 'font-mono text-[12.5px] tabular-nums' : ''}`} title={value ?? undefined}>
        {value ?? 'Not available'}
      </dd>
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
  const source = geo ? locationSource(geo) : 'none';
  // Device fix first; an IP estimate only when it actually resolved. Never a fabricated point.
  const pin = source === 'device' && geo?.device
    ? { latitude: geo.device.latitude, longitude: geo.device.longitude, digits: 5 }
    : source === 'ip' && geo?.latitude != null && geo.longitude != null
      ? { latitude: geo.latitude, longitude: geo.longitude, digits: 2 }
      : null;
  const latitude = pin ? pin.latitude.toFixed(pin.digits) : null;
  const longitude = pin ? pin.longitude.toFixed(pin.digits) : null;
  const accuracy = source === 'device' && geo?.device ? `± ${geo.device.accuracy_m.toLocaleString()} m` : source === 'ip' ? 'About city level (~5 km)' : null;
  const networkLocation = geo?.status === 'resolved' ? locationLabel(geo) : null;
  const devicePlace = geo ? deviceLocationLabel(geo) : null;

  const popupDetails = useMemo<[string, string][]>(() => (
    ([
      ['Device location', devicePlace], ['Latitude', latitude], ['Longitude', longitude], ['Accuracy', accuracy], ['ISP network location', networkLocation],
    ] as [string, string | null][]).filter((row): row is [string, string] => Boolean(row[1]))
  ), [devicePlace, latitude, longitude, accuracy, networkLocation]);

  const backLink = (
    <Link to={back} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold text-gray-500 transition-colors hover:text-[#5A1220] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/30">
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to Activity Log
    </Link>
  );

  if (error) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        {backLink}
        <div role="alert" className="rounded-2xl border border-gray-200/80 bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <span aria-hidden="true" className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-inset ring-red-600/10">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-red-700">{error.message}</p>
          {!error.notFound && <button type="button" onClick={() => void load()} className="mt-3 text-sm font-bold text-[#5A1220] hover:underline">Try again</button>}
        </div>
      </div>
    );
  }

  if (loading || !entry || !geo) {
    return (
      <div className="mx-auto max-w-7xl space-y-4" aria-busy="true" aria-label="Loading sign-in details">
        {backLink}
        <div className="h-24 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="h-36 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
            <div className="h-52 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
            <div className="h-36 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
          </div>
          <div className="h-[34rem] animate-pulse rounded-2xl border border-gray-200/80 bg-white" />
        </div>
      </div>
    );
  }

  const status = LOGIN_STATUSES[entry.status];
  const failed = entry.status === 'failed';
  const reason = failureReason(entry.reason);
  const fallback = UNAVAILABLE_COPY[geo.status] ?? UNAVAILABLE_COPY.unavailable;
  const sourceInfo = LOCATION_SOURCES[source];
  const SourceIcon = SOURCE_ICONS[source];
  // Opens the same recorded point on openstreetmap.org; zoom mirrors the in-page precision cap.
  const largerMapUrl = pin
    ? `https://www.openstreetmap.org/?mlat=${pin.latitude}&mlon=${pin.longitude}#map=${source === 'device' ? 17 : 11}/${pin.latitude}/${pin.longitude}`
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {backLink}

      <header className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${failed ? 'bg-red-500' : 'bg-gradient-to-r from-[#5A1220] via-[#5A1220] to-[#F5A623]'}`} />
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 ${entry.user?.name ? 'bg-[#5A1220] text-white ring-[#5A1220]/[0.08]' : 'bg-gray-100 text-gray-400 ring-gray-100/60'}`}>
            {entry.user?.name ? initials(entry.user.name) : '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">Login activity</p>
            <h1 className="truncate text-lg font-bold leading-tight text-gray-900">{loginUserName(entry)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />{loginUserRole(entry)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
                {failed ? 'Sign-in attempt' : 'Signed in'} {formatExact(entry.occurred_at)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {geo.is_proxy && <Badge tone="accent" icon={<ShieldAlert className="h-3 w-3" />}>VPN or hosting network</Badge>}
            <Badge tone={status.tone} dot className="px-2.5 py-1 text-xs">{status.label}</Badge>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="User Information" subtitle="Account that signed in" icon={<UserRound className="h-4 w-4" />}>
            <dl className="divide-y divide-gray-100">
              <Field label="Full name" value={loginUserName(entry)} />
              <Field label="Role" value={loginUserRole(entry)} />
              {entry.user?.username && <Field label="Username" value={entry.user.username} mono />}
            </dl>
          </Card>

          <Card title="Sign-In Details" subtitle="Authentication event" icon={<KeyRound className="h-4 w-4" />}>
            <dl className="divide-y divide-gray-100">
              <Field label="Status" value={<Badge tone={status.tone} dot>{status.label}</Badge>} />
              {reason && <Field label="Failure reason" value={<span className="text-red-700">{reason}</span>} />}
              <Field label="Date and time" value={formatExact(entry.occurred_at)} />
              <Field label="Method" value={methodLabel(entry.method)} />
              <Field label="IP address" value={entry.ip_address ?? 'Not recorded'} mono />
            </dl>
          </Card>

          <Card title="Device Information" subtitle="Reported by the browser" icon={<MonitorSmartphone className="h-4 w-4" />}>
            <dl className="divide-y divide-gray-100">
              <Field label="Device" value={entry.client.device} />
              <Field label="Operating system" value={entry.client.os} />
              <Field label="Browser" value={entry.client.browser} />
            </dl>
          </Card>
        </div>

        <Card
          label="Geographical location"
          title="Login Location"
          subtitle={sourceInfo.description}
          icon={<Globe2 className="h-4 w-4" />}
          className="flex flex-col"
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sourceInfo.tone} icon={<SourceIcon className="h-3 w-3" />}>{sourceInfo.label}</Badge>
              {largerMapUrl && (
                <a
                  href={largerMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-[#5A1220]/30 hover:text-[#5A1220] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/30"
                >
                  <Maximize2 aria-hidden="true" className="h-3 w-3" /> View larger map
                  <span className="sr-only"> (opens OpenStreetMap in a new tab)</span>
                </a>
              )}
            </div>
          )}
        >
          <div className="relative h-[22rem] bg-gray-50 sm:h-[26rem] lg:h-[30rem]">
            {pin ? (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-gray-100" aria-label="Loading map" />}>
                <SingleLoginMap
                  latitude={pin.latitude}
                  longitude={pin.longitude}
                  failed={failed}
                  precise={source === 'device'}
                  accuracyM={geo.device?.accuracy_m}
                  details={popupDetails}
                />
              </Suspense>
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#ffffff_0%,#f9fafb_70%)] px-6 py-12 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200">
                  <MapPinOff aria-hidden="true" className="h-6 w-6 text-gray-400" />
                </span>
                <p className="mt-4 text-sm font-semibold text-gray-800">{fallback.title}</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500">{fallback.body}</p>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-px border-t border-gray-200 bg-gray-100 min-[420px]:grid-cols-2 md:grid-cols-3">
            {source === 'device' && <MetaCell label="Device location" value={devicePlace ?? 'Place name not yet resolved'} icon={<Crosshair className="h-3 w-3" />} className="col-span-full" />}
            <MetaCell label="Latitude" value={latitude} mono icon={<Navigation className="h-3 w-3" />} />
            <MetaCell label="Longitude" value={longitude} mono icon={<Navigation className="h-3 w-3 rotate-90" />} />
            <MetaCell label="Accuracy" value={accuracy} icon={<Target className="h-3 w-3" />} />
            <MetaCell label="Location source" value={source === 'none' ? null : sourceInfo.label} icon={<SourceIcon className="h-3 w-3" />} />
            <MetaCell label="ISP network location" value={networkLocation} icon={<Wifi className="h-3 w-3" />} />
            <MetaCell label="Device fix time" value={geo.device?.captured_at ? formatExact(geo.device.captured_at) : null} icon={<Clock3 className="h-3 w-3" />} />
          </dl>

          <p className="flex items-start gap-2.5 border-t border-gray-100 bg-[#F5A623]/[0.06] px-4 py-2.5 text-[11px] leading-relaxed text-gray-600">
            <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
            <span>
              {source === 'device' && geo.device && `Shared by the user's browser at sign-in, accurate to about ${geo.device.accuracy_m.toLocaleString()} m. `}
              {source === 'ip' && `${locationLabel(geo)} is an estimate from the IP address, accurate to about the city level, not the user's exact physical location. `}
              The ISP network location is where the internet provider routes traffic: on mobile data it is often the carrier's hub city, not where the user is. VPNs and campus networks can do the same. Device location is recorded only when the user allows it in the browser. Location details are kept for {response?.meta.retention_days ?? 90} days.
            </span>
          </p>
        </Card>
      </div>
    </div>
  );
}

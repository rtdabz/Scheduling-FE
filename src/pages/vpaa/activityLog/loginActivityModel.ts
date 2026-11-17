import type { BadgeTone } from '../../../components/ui/Badge';
import { roleLabel } from '../../../lib/roles';

export type LoginLocationStatus = 'resolved' | 'private' | 'unavailable' | 'pending' | 'expired';

/** device = browser Geolocation fix; ip = city-level network estimate; none = nothing to map. */
export type LoginLocationSource = 'device' | 'ip' | 'none';

export type LoginEntry = {
  id: number;
  status: 'succeeded' | 'failed';
  reason: string | null;
  method: 'password' | 'google' | string | null;
  occurred_at: string;
  user: { id: number; name: string | null; username: string | null; role: string | null } | null;
  ip_address: string | null;
  client: { browser: string; os: string; device: string };
  location: {
    status: LoginLocationStatus;
    city: string | null;
    region: string | null;
    country: string | null;
    country_code: string | null;
    latitude: number | null;
    longitude: number | null;
    is_proxy: boolean | null;
    /** Optional on older API responses; treat a missing value as derived from `status`. */
    source?: LoginLocationSource;
    device?: {
      latitude: number; longitude: number; accuracy_m: number; captured_at: string | null;
      /** Place named from the device fix; null until reverse geocoding succeeds (absent on older API responses). */
      city?: string | null; region?: string | null; country?: string | null;
    } | null;
  };
};

export type LoginUserFacet = { id: number; name: string; username: string | null; role: string | null };

type SharedMeta = {
  summary: { failed: number; users: number };
  retention_days: number;
  facets: { users: LoginUserFacet[] };
};

export type LoginLocationsResponse = {
  data: LoginEntry[];
  meta: SharedMeta & { total: number; located: number; truncated: boolean; max_points: number };
};

export type LoginHistoryResponse = {
  data: LoginEntry[];
  meta: SharedMeta & { current_page: number; per_page: number; total: number; last_page: number };
};

export const EMPTY_LOGIN_FILTERS = { from: '', to: '', user_id: '', role: '', status: '' };
export type LoginFilters = typeof EMPTY_LOGIN_FILTERS;

/** Activity Log events that have a VPAA Login Details page. */
export const LOGIN_EVENTS = ['login_succeeded', 'login_failed'];

export const loginDetailsPath = (id: number | string) => `/activity-log/logins/${id}`;

/** Audit ID of a sign-in row in the combined Activity Log ("authentication:42" → 42), else null. */
export const loginAuditId = (entry: { id: string; source: string; event: string }): number | null => {
  if (entry.source !== 'authentication' || !LOGIN_EVENTS.includes(entry.event)) return null;
  const id = Number(entry.id.split(':')[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const loginParams = (filters: LoginFilters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));

export const LOGIN_STATUSES: Record<LoginEntry['status'], { label: string; tone: BadgeTone }> = {
  succeeded: { label: 'Successful', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

const FAILURE_REASONS: Record<string, string> = {
  invalid_password: 'Incorrect password',
  unknown_account: 'No matching account',
  account_disabled: 'Account disabled',
  role_unsupported: 'Role no longer supported',
  role_review_pending: 'Role awaiting review',
  email_mismatch: 'Google email mismatch',
};

export const failureReason = (reason: string | null) => (reason ? FAILURE_REASONS[reason] ?? reason.replace(/_/g, ' ') : null);

export const methodLabel = (method: string | null) => (method === 'google' ? 'Google sign-in' : method === 'password' ? 'Username and password' : 'Unknown method');

export const loginUserName = (entry: LoginEntry) =>
  entry.user?.name ?? (entry.user ? `User #${entry.user.id}` : 'Unknown account');

export const loginUserRole = (entry: LoginEntry) =>
  entry.user?.role ? roleLabel(entry.user.role) : entry.user ? 'Role not recorded' : 'No account matched';

const LOCATION_FALLBACK: Record<LoginLocationStatus, string> = {
  resolved: 'Location unavailable',
  private: 'Private or internal network',
  unavailable: 'Location unavailable',
  pending: 'Location lookup pending',
  expired: 'Location no longer retained',
};

/** City, region, country — skipping blanks and repeated names (e.g. "Singapore, Singapore"). */
export const locationLabel = (location: LoginEntry['location']) => {
  const parts = [location.city, location.region, location.country].filter((part, index, all): part is string =>
    Boolean(part) && all.indexOf(part) === index);
  return location.status === 'resolved' && parts.length ? parts.join(', ') : LOCATION_FALLBACK[location.status];
};

/** Place named from the device (GPS) fix, e.g. "Cagayan de Oro, Northern Mindanao, Philippines", or null. */
export const deviceLocationLabel = (location: LoginEntry['location']) => {
  const device = location.device;
  if (!device) return null;
  const parts = [device.city, device.region, device.country].filter((part, index, all): part is string =>
    Boolean(part) && all.indexOf(part) === index);
  return parts.length ? parts.join(', ') : null;
};

/** Where the user signed in from: the named device place when known, else the IP (ISP network) estimate. */
export const displayLocationLabel = (location: LoginEntry['location']) => deviceLocationLabel(location) ?? locationLabel(location);

export const LOCATION_SOURCES: Record<LoginLocationSource, { label: string; description: string; tone: BadgeTone }> = {
  device: { label: 'Precise device location', description: "Reported by the browser with the user's permission", tone: 'success' },
  ip: { label: 'Approximate network location', description: 'Estimated from the IP address, about city level', tone: 'warning' },
  none: { label: 'Location unavailable', description: 'No device or network location was available', tone: 'neutral' },
};

export const locationSource = (location: LoginEntry['location']): LoginLocationSource =>
  location.source ?? (location.device ? 'device'
    : location.status === 'resolved' && location.latitude !== null && location.longitude !== null ? 'ip' : 'none');

export type LocationGroup = {
  key: string;
  /** device = browser fix; ip = city-level network estimate. Never mixed within one pin. */
  source: Exclude<LoginLocationSource, 'none'>;
  latitude: number;
  longitude: number;
  label: string;
  entries: LoginEntry[];
  failed: number;
};

/** Coordinates to pin for a sign-in: the device fix when present, else a resolved IP estimate. */
export const mappedPoint = (location: LoginEntry['location']) => {
  const source = locationSource(location);
  if (source === 'device' && location.device) return { source, latitude: location.device.latitude, longitude: location.device.longitude } as const;
  if (source === 'ip' && location.latitude !== null && location.longitude !== null) return { source, latitude: location.latitude, longitude: location.longitude } as const;
  return null;
};

/**
 * One map pin per source and rounded coordinate (~1 km), so the overview stays neighbourhood-level
 * even for device fixes; the exact point is on each sign-in's Details page. Newest first within a pin.
 */
export const groupByLocation = (entries: LoginEntry[]): LocationGroup[] => {
  const groups = new Map<string, LocationGroup>();
  for (const entry of entries) {
    const point = mappedPoint(entry.location);
    if (!point) continue;
    const latitude = Number(point.latitude.toFixed(2));
    const longitude = Number(point.longitude.toFixed(2));
    const key = `${point.source}:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const label = point.source === 'device'
      ? deviceLocationLabel(entry.location) ?? `Device location near ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
      : locationLabel(entry.location);
    const group = groups.get(key) ?? { key, source: point.source, latitude, longitude, label, entries: [], failed: 0 };
    group.entries.push(entry);
    if (entry.status === 'failed') group.failed += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.entries.length - a.entries.length);
};

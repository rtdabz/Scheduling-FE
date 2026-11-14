import type { BadgeTone } from '../../../components/ui/Badge';
import { ROLE_LABELS, roleLabel } from '../../../lib/roles';

export type Actor = {
  id: number;
  name: string | null;
  username: string | null;
  role: string | null;
  provenance?: 'recorded' | 'recorded_subject' | 'unavailable';
};

export type ActivityEntry = {
  id: string;
  source: 'authentication' | 'scheduling';
  category: string;
  event: string;
  status: string;
  occurred_at: string;
  actor: Actor | null;
  actor_type?: 'user' | 'system' | 'unknown';
  department_id: number | null;
  semester_id: number | null;
  target: { type: string; id: number | null };
  metadata: Record<string, unknown>;
};

export type ActivitySummary = { total: number; approved: number; returned: number; rejected: number; failed: number; actors: number };
export type ActorFacet = { id: number; name: string | null; username: string | null; role: string | null };

export type ActivityResponse = {
  data: ActivityEntry[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    summary?: ActivitySummary;
    facets?: { actors: ActorFacet[] };
  };
};

export type Department = { id: number; department_code: string; department_name: string };
export type Semester = { id: number; academic_year: string; semester: string };

/** Category key → label and accent dot. Categories render as outlined tags so they never read as statuses. */
export const CATEGORIES: Record<string, { label: string; dot: string }> = {
  account_access: { label: 'Account & Access', dot: 'bg-sky-500' },
  institutional_setup: { label: 'Institutional Setup', dot: 'bg-stone-500' },
  academic_setup: { label: 'Academic Setup', dot: 'bg-indigo-500' },
  scheduling: { label: 'Scheduling', dot: 'bg-[#701522]' },
  approval: { label: 'Approval', dot: 'bg-teal-500' },
  instructor_assignment: { label: 'Instructor Assignment', dot: 'bg-violet-500' },
  room_request: { label: 'Room Requests', dot: 'bg-orange-500' },
  reports: { label: 'Reports', dot: 'bg-slate-400' },
};

export const STATUSES: Record<string, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Completed', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'success' },
  returned: { label: 'Returned', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** Roles as recorded when the event happened (matches the API `role` filter). */
export const ROLE_FILTER_OPTIONS: [string, string][] = [
  ...Object.entries(ROLE_LABELS),
  ['system', 'System'],
  ['unavailable', 'Identity not recorded'],
];

const EVENT_LABELS: Record<string, string> = {
  login_succeeded: 'Signed In',
  login_failed: 'Sign-in Failed',
  logout: 'Signed Out',
  password_reset: 'Password Reset',
  user_created: 'Account Created',
  user_updated: 'Account Updated',
  user_status_changed: 'Account Status Changed',
  user_archived: 'Account Archived',
  profile_updated: 'Profile Updated',
  invitation_sent: 'Invitation Sent',
  invitation_accepted: 'Invitation Accepted',
  google_linked: 'Google Account Linked',
  google_unlinked: 'Google Account Unlinked',
  institution_signatories_updated: 'Document Signatories Updated',
  schedule_semester_archived: 'Semester Archived',
  schedule_batch_deleted: 'Schedules Deleted',
  schedule_reset: 'Schedules Reset',
  schedule_batch_status_updated: 'Schedule Status Updated',
  schedule_conflicts_cleared: 'Conflicts Cleared',
  // Approval stage is part of the record; never collapse Dean and VPAA decisions into one label.
  schedule_returned_by_dean: 'Schedule Returned by Dean',
  schedule_returned_by_vpaa: 'Schedule Returned by VPAA',
  schedule_approved_by_dean: 'Schedule Approved by Dean',
  schedule_approved_by_vpaa: 'Schedule Approved by VPAA',
  instructor_assignment_released: 'Assignment Released',
  room_grant_ended: 'Room Grant Ended',
};

export const humanize = (value: string) =>
  value.replace(/^_+/, '').split('_').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const formatEventKey = (event: string) => EVENT_LABELS[event] ?? humanize(event);

export const TARGET_LABELS: Record<string, string> = {
  user: 'Account',
  department: 'Department',
  program: 'Program',
  room: 'Room',
  instructor: 'Instructor',
  designation: 'Designation',
  course: 'Course',
  semester: 'Semester',
  schedule: 'Class Schedule',
  schedule_split: 'Meeting Split',
  schedule_workflow: 'Section',
  schedule_recommendation: 'Recommendation',
  room_request: 'Room Request',
  institution_settings: 'Institution Settings',
};

const ARCHIVE_EVENT_VERBS: Record<string, string> = { record_restored: 'Restored', record_archived: 'Archived' };

export const entryLabel = (entry: Pick<ActivityEntry, 'event' | 'target'>): string => {
  const verb = ARCHIVE_EVENT_VERBS[entry.event];
  const target = TARGET_LABELS[entry.target.type];
  return verb && target ? `${target} ${verb}` : formatEventKey(entry.event);
};

export const categoryLabel = (category: string) => CATEGORIES[category]?.label ?? humanize(category);

export const targetLabel = (entry: ActivityEntry): string => {
  const name = typeof entry.metadata.label === 'string' ? ` — ${entry.metadata.label}` : '';
  return `${TARGET_LABELS[entry.target.type] ?? humanize(entry.target.type)}${entry.target.id ? ` #${entry.target.id}` : ''}${name}`;
};

export const actorName = (entry: Pick<ActivityEntry, 'actor' | 'actor_type'>) =>
  entry.actor?.name || (entry.actor_type === 'system' ? 'System' : 'Actor unavailable');

export const actorRoleLabel = (entry: Pick<ActivityEntry, 'actor' | 'actor_type'>) =>
  entry.actor?.role ? roleLabel(entry.actor.role) : entry.actor_type === 'system' ? 'Automated' : 'Role not recorded';

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

const MANILA = 'Asia/Manila';
export const formatDay = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: MANILA }).format(new Date(value));
export const formatTime = (value: string) => new Intl.DateTimeFormat('en-PH', { timeStyle: 'medium', timeZone: MANILA }).format(new Date(value));
export const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: MANILA }).format(new Date(value));
export const formatExact = (value: string) => new Intl.DateTimeFormat('en-PH', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: MANILA,
}).format(new Date(value));

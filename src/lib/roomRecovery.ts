import api from './api';
import { getStoredUser } from './storedUser';
import { roomReassignmentPage } from './notificationLink';
import type { ApiDepartmentRecord, ApiScheduleRecord, ApiSectionRecord, Semester, UserSummary, ScheduleSignatories } from '../pages/ClassSchedules/SchedulerPanel/types';
import { normalizeRole } from './roles';

export interface RecoveryCase { id: number; room_code: string; reason: string; trigger: string; semester_id: number; semester_label: string; meeting_count: number; schedule_ids: number[] }
export interface RecoveryRoom { id: number; room_code: string; room_type: string; status: string }
// temporarily_online: a face-to-face class awaiting room reassignment after closure or revoked borrowing access.
export interface RecoveryMeeting { id: number; course: string; section: string; room: string; day: string; start_time: string; end_time: string; mode?: string; temporarily_online?: boolean }
export interface RecoverySchedule extends RecoveryMeeting { meeting_type: string | null; status: string; needs_attention: boolean; room_status?: string | null; attention_reason?: string | null; required_room_type?: string | null; revision_required?: boolean; original_room?: string | null; displaced_at?: string | null; pending_transfer_id?: string | null; pending_transfer_status?: 'pending_dean' | 'pending_vpaa' | null }
export interface RecoveryData { cases: RecoveryCase[]; semester_id: number; pending_count?: number; room_tba_count?: number; semesters: { id: number; academic_year: string; semester: string; is_active?: boolean | number }[]; rooms: RecoveryRoom[]; new_rooms: RecoveryRoom[]; schedules: RecoverySchedule[]; transfers?: RoomTransferRequest[] }
export interface RecoveryRow { id: number; room_id: number | null; day: string; start_time: string; end_time: string; mode?: string }
// apply: every meeting is still a draft, so the reassignment applies immediately. approval: already submitted, so Dean and VPAA review it.
export type RecoveryWorkflow = 'apply' | 'approval';
export const recoveryGroupWorkflow = (group: { workflow?: RecoveryWorkflow }): RecoveryWorkflow => group.workflow === 'apply' ? 'apply' : 'approval';
export interface RecoveryPlan { plan_id: string; groups: { key: string; before: RecoveryRow[]; after: RecoveryRow[]; workflow?: RecoveryWorkflow }[]; meetings?: RecoveryMeeting[]; unresolved: { schedule_ids: number[]; reason: string; reason_code?: string }[]; search_limit_reached: boolean; expires_at: string }
export interface RoomTransferPlacement { room: string; day: string; start_time: string; end_time: string }
export interface RoomTransferRequest {
  signatories?: ScheduleSignatories | null;
  id: string; status: 'pending_dean' | 'pending_vpaa' | 'approved' | 'applied' | 'rejected_by_dean' | 'rejected_by_vpaa'; department_id?: number; department: string; semester_id: number;
  // Final approval also turns on Sunday classes for the department.
  enables_sunday?: boolean;
  semester_label: string; submitted_by: string; submitted_at: string; dean_reviewed_at?: string | null; reviewed_at: string | null; rejection_reason: string | null;
  preview_semester?: Semester; preview_department?: ApiDepartmentRecord; preview_users?: UserSummary[];
  schedule_ids: number[]; changes: { schedule_id: number; mode?: string; temporarily_online?: boolean; course: string; section: string; before: RoomTransferPlacement; after: RoomTransferPlacement; preview_schedule?: ApiScheduleRecord & { section: ApiSectionRecord } }[];
  // Every class of the affected sections with the proposal applied, printed like Schedule Approval.
  preview_schedules?: (ApiScheduleRecord & { section: ApiSectionRecord | null })[];
}
type RoomTransferChange = RoomTransferRequest['changes'][number];
// Linked online sessions are listed with the meeting they belong to.
export const roomTransferDetailChanges = (request: RoomTransferRequest) => request.changes;
export const isLinkedOnlineSession = (change: RoomTransferChange) => change.mode === 'online';
export const roomTransferMovedCount = (request: RoomTransferRequest) => request.changes.filter(change => !isLinkedOnlineSession(change)).length;
export const roomTransferClassLabel = (change: RoomTransferChange) => `${change.course} · ${change.section}${isLinkedOnlineSession(change) ? ' · Linked online session' : ''}`;
// What the request changes for one meeting, compared from its stored original and proposed placements.
export const roomTransferChangeLabel = (change: RoomTransferChange) => {
  const time = (row: RoomTransferPlacement) => `${row.day} ${row.start_time.slice(0, 5)} ${row.end_time.slice(0, 5)}`;
  const timeChanged = time(change.before) !== time(change.after);
  if (isLinkedOnlineSession(change)) return timeChanged ? 'Linked online session — time changed' : 'Linked online session — unchanged';
  // A class moved online by a room closure goes back to face-to-face in the approved room.
  const roomLabel = change.temporarily_online ? 'Returns face-to-face' : 'Room changed';
  const labels = [change.before.room !== change.after.room && roomLabel, timeChanged && 'Time changed'].filter(Boolean);
  return labels.length > 0 ? labels.join(' · ') : 'Unchanged';
};
// Lecture or laboratory as stored with the proposal, with the delivery mode; nothing is inferred when absent.
export const roomTransferSessionType = (change: RoomTransferChange) => {
  const meeting = change.preview_schedule?.meeting_type;
  const mode = ({ 'on-site': 'On-site', online: 'Online', field: 'Field' } as Record<string, string>)[change.mode ?? ''] ?? null;
  return [meeting === 'laboratory' ? 'Laboratory' : meeting === 'lecture' ? 'Lecture' : null, mode].filter(Boolean).join(' · ') || 'Not recorded';
};
export const ROOM_TRANSFER_STATUS_LABELS = {
  pending_dean: 'Pending Dean Approval', pending_vpaa: 'Pending VPAA Approval', approved: 'Approved', applied: 'Applied (before approval workflow)',
  rejected_by_dean: 'Rejected by Dean', rejected_by_vpaa: 'Rejected by VPAA',
};
export const roomTransferStatusClass = (status: RoomTransferRequest['status']) => status.startsWith('pending_') ? 'bg-amber-50 text-amber-900' : status.startsWith('rejected_') ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800';

// Rooms with a reassignment in progress, keyed by room code: classes that still need a replacement room
// (counted on the room they left) and classes in a transfer awaiting Dean or VPAA approval (source and destination).
export interface RoomReassignmentActivity { needs: number; pending: number }
export function roomReassignmentActivity(data: Pick<RecoveryData, 'schedules' | 'transfers'>): Record<string, RoomReassignmentActivity> {
  const needs = new Map<string, Set<number>>();
  const pending = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, room: string | null | undefined, id: number) => {
    if (!room) return;
    if (!map.has(room)) map.set(room, new Set());
    map.get(room)!.add(id);
  };
  for (const row of data.schedules) {
    if (!row.needs_attention) continue;
    const room = row.original_room ?? (row.temporarily_online || row.room === 'Room TBA' ? null : row.room);
    add(row.pending_transfer_id ? pending : needs, room, row.id);
  }
  for (const transfer of data.transfers ?? []) {
    if (!transfer.status.startsWith('pending_')) continue;
    for (const change of transfer.changes) {
      if (isLinkedOnlineSession(change)) continue;
      add(pending, change.before.room, change.schedule_id);
      add(pending, change.after.room, change.schedule_id);
    }
  }
  const result: Record<string, RoomReassignmentActivity> = {};
  for (const room of new Set([...needs.keys(), ...pending.keys()])) {
    result[room] = { needs: needs.get(room)?.size ?? 0, pending: pending.get(room)?.size ?? 0 };
  }
  return result;
}

export function recoveryLink(caseId?: number, semesterId?: number, roomId?: number): string {
  const stored = normalizeRole(getStoredUser()?.role);
  const role = stored === 'program_head' || stored === 'director' ? stored : 'secretary';
  const query = new URLSearchParams({ recovery: caseId ? String(caseId) : 'open' });
  if (semesterId) query.set('recovery_semester', String(semesterId));
  if (roomId) query.set('recovery_room', String(roomId));
  return `${roomReassignmentPage(role)}?${query}`;
}

export function recoveryError(error: unknown): string {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  return Object.values(data?.errors ?? {}).flat().join(' ') || data?.message || 'Unable to complete this request. Please retry.';
}

export const getRecovery = async (semester?: number, signal?: AbortSignal, schedules = false) => {
  const response = await api.get<RecoveryData>('/room-recovery', {
    params: { semester_id: semester || undefined, include_schedules: schedules ? 1 : 0 }, signal,
  });
  if (!response.data || !['cases', 'semesters', 'rooms', 'new_rooms', 'schedules'].every(key => Array.isArray(response.data[key as keyof RecoveryData]))) {
    throw new Error('Unexpected recovery response.');
  }
  return response;
};

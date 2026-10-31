import api from './api';
import { getStoredUser } from './storedUser';
import type { ApiDepartmentRecord, ApiScheduleRecord, ApiSectionRecord, Semester, UserSummary } from '../pages/ClassSchedules/SchedulerPanel/types';

export interface RecoveryCase { id: number; room_code: string; reason: string; trigger: string; semester_id: number; semester_label: string; meeting_count: number; schedule_ids: number[] }
export interface RecoveryRoom { id: number; room_code: string; room_type: string; status: string }
export interface RecoveryMeeting { id: number; course: string; section: string; room: string; day: string; start_time: string; end_time: string; mode?: string }
export interface RecoverySchedule extends RecoveryMeeting { meeting_type: string | null; status: string; needs_attention: boolean; room_status?: string | null; attention_reason?: string | null; required_room_type?: string | null; revision_required?: boolean; pending_transfer_id?: string | null; pending_transfer_status?: 'pending_dean' | 'pending_vpaa' | null }
export interface RecoveryData { cases: RecoveryCase[]; semester_id: number; pending_count?: number; semesters: { id: number; academic_year: string; semester: string; is_active?: boolean | number }[]; rooms: RecoveryRoom[]; new_rooms: RecoveryRoom[]; schedules: RecoverySchedule[]; transfers?: RoomTransferRequest[] }
export interface RecoveryRow { id: number; room_id: number | null; day: string; start_time: string; end_time: string }
export interface RecoveryPlan { plan_id: string; groups: { key: string; before: RecoveryRow[]; after: RecoveryRow[] }[]; meetings?: RecoveryMeeting[]; unresolved: { schedule_ids: number[]; reason: string; reason_code?: string }[]; search_limit_reached: boolean; expires_at: string }
export interface RoomTransferPlacement { room: string; day: string; start_time: string; end_time: string }
export interface RoomTransferRequest {
  id: string; status: 'pending_dean' | 'pending_vpaa' | 'approved' | 'applied' | 'rejected_by_dean' | 'rejected_by_vpaa'; department_id?: number; department: string; semester_id: number;
  // Final approval also turns on Sunday classes for the department.
  enables_sunday?: boolean;
  semester_label: string; submitted_by: string; submitted_at: string; dean_reviewed_at?: string | null; reviewed_at: string | null; rejection_reason: string | null;
  preview_semester?: Semester; preview_department?: ApiDepartmentRecord; preview_users?: UserSummary[];
  schedule_ids: number[]; changes: { schedule_id: number; mode?: string; course: string; section: string; before: RoomTransferPlacement; after: RoomTransferPlacement; preview_schedule?: ApiScheduleRecord & { section: ApiSectionRecord } }[];
  // Every class of the affected sections with the proposal applied, printed like Schedule Approval.
  preview_schedules?: (ApiScheduleRecord & { section: ApiSectionRecord | null })[];
}
type RoomTransferChange = RoomTransferRequest['changes'][number];
// Linked online sessions are listed with the meeting they belong to.
export const roomTransferDetailChanges = (request: RoomTransferRequest) => request.changes;
export const isLinkedOnlineSession = (change: RoomTransferChange) => change.mode === 'online';
export const roomTransferMovedCount = (request: RoomTransferRequest) => request.changes.filter(change => !isLinkedOnlineSession(change)).length;
export const roomTransferClassLabel = (change: RoomTransferChange) => `${change.course} · ${change.section}${isLinkedOnlineSession(change) ? ' · Linked online session' : ''}`;
export const ROOM_TRANSFER_STATUS_LABELS = {
  pending_dean: 'Pending Dean Approval', pending_vpaa: 'Pending VPAA Approval', approved: 'Approved', applied: 'Applied (before approval workflow)',
  rejected_by_dean: 'Rejected by Dean', rejected_by_vpaa: 'Rejected by VPAA',
};

export function recoveryLink(caseId?: number, semesterId?: number, roomId?: number): string {
  const role = getStoredUser()?.role === 'program_head' ? 'program_head' : 'secretary';
  const query = new URLSearchParams({ recovery: caseId ? String(caseId) : 'open' });
  if (semesterId) query.set('recovery_semester', String(semesterId));
  if (roomId) query.set('recovery_room', String(roomId));
  return `/${role}/schedule-management?${query}`;
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

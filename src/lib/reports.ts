import api from './api';
import type { RoomRequestStatus, RoomRequestWindow } from './roomRequests';
import {
  mapInitialData,
  type InitialDataResponse,
  type SchedulerCacheData,
} from '../pages/ClassSchedules/SchedulerPanel/hooks/initialDataMapper';

export interface ReportProgram {
  id: number;
  code: string;
  name: string;
  complete_section_count: number;
  instructor_count: number;
}

export interface ReportDepartment {
  id: number;
  code: string;
  name: string;
  /** Uploaded department logo (an image data URL), when one exists. */
  logo?: string | null;
  can_print_department: boolean;
  complete_section_count: number;
  instructor_count: number;
  programs: ReportProgram[];
}

/** An academic term holding VPAA-approved classes in the viewer's scope. */
export interface ReportTerm {
  id: number;
  academic_year: string;
  semester: string;
  is_active: boolean;
}

export interface ReportsOverview {
  /** The term the counts cover; null when they span every term. */
  semester?: ReportTerm | null;
  /** Terms with approved data, newest first. Absent from older API responses. */
  terms?: ReportTerm[];
  departments: ReportDepartment[];
}

export interface RoomReportSummary {
  total_rooms: number;
  total_laboratories: number;
  unavailable_rooms: number;
  rooms?: InitialDataResponse['rooms'];
  requests: {
    id: number;
    room_code: string | null;
    requester: string | null;
    requested_by: string | null;
    status: RoomRequestStatus;
    direction: 'sent' | 'received';
    owner_department: string | null;
    windows: RoomRequestWindow[];
  }[];
}

export interface ReportData extends SchedulerCacheData {
  roomSummary?: RoomReportSummary;
}

export const fetchReportsOverview = async (semesterId: number | null = null): Promise<ReportsOverview> =>
  (await api.get<ReportsOverview>('/reports', {
    params: semesterId === null ? undefined : { semester_id: semesterId },
  })).data;

/** The term a report opens on: the active term when it has approved data, otherwise the newest one. */
export const defaultReportTerm = (terms: ReportTerm[]): ReportTerm | null =>
  terms.find((term) => term.is_active) ?? terms[0] ?? null;

export const fetchReportData = async (
  departmentId: number,
  programId: number | null,
  semesterId: number | null = null,
): Promise<ReportData> => {
  const params: Record<string, number> = {};
  if (programId !== null) params.program_id = programId;
  if (semesterId !== null) params.semester_id = semesterId;
  const response = await api.get<InitialDataResponse & { room_summary?: RoomReportSummary }>(`/reports/departments/${departmentId}`, {
    params: Object.keys(params).length ? params : undefined,
  });

  return { ...mapInitialData(response.data, { isVpaa: true }), roomSummary: response.data.room_summary };
};

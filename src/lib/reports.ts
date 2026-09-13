import api from './api';
import type { ApiSemesterRecord } from '../pages/ClassSchedules/SchedulerPanel/types';
import {
  mapInitialData,
  type InitialDataResponse,
  type SchedulerCacheData,
} from '../pages/ClassSchedules/SchedulerPanel/hooks/initialDataMapper';

/** One program's printable totals for the active semester. */
export interface ReportProgram {
  id: number;
  code: string;
  name: string;
  /** Sections whose every meeting has cleared VPAA approval. */
  complete_section_count: number;
  /** Instructors carrying at least one approved class. */
  instructor_count: number;
}

export interface ReportDepartment {
  id: number;
  code: string;
  name: string;
  /** False for a Program Head, who may print only their own program. */
  can_print_department: boolean;
  complete_section_count: number;
  instructor_count: number;
  programs: ReportProgram[];
}

export interface ReportsOverview {
  active_semester: ApiSemesterRecord | null;
  departments: ReportDepartment[];
}

export const fetchReportsOverview = async (): Promise<ReportsOverview> =>
  (await api.get<ReportsOverview>('/reports')).data;

/**
 * Approved data for one department, or one of its programs, mapped into the
 * shape the existing Department Schedule and Teaching Load PDF builders read.
 */
export const fetchReportData = async (
  departmentId: number,
  programId: number | null,
): Promise<SchedulerCacheData> => {
  const response = await api.get<InitialDataResponse>(`/reports/departments/${departmentId}`, {
    params: programId === null ? undefined : { program_id: programId },
  });

  // The server has already scoped the rows, so nothing is filtered again here.
  return mapInitialData(response.data, { isVpaa: true });
};

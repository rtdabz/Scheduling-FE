import api from './api';
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
  can_print_department: boolean;
  complete_section_count: number;
  instructor_count: number;
  programs: ReportProgram[];
}

export interface ReportsOverview {
  departments: ReportDepartment[];
}

export const fetchReportsOverview = async (): Promise<ReportsOverview> =>
  (await api.get<ReportsOverview>('/reports')).data;

export const fetchReportData = async (
  departmentId: number,
  programId: number | null,
): Promise<SchedulerCacheData> => {
  const response = await api.get<InitialDataResponse>(`/reports/departments/${departmentId}`, {
    params: programId === null ? undefined : { program_id: programId },
  });

  return mapInitialData(response.data, { isVpaa: true });
};

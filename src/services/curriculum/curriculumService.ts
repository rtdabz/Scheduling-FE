import api from '../../lib/api';
import type { Curriculum, ApiCurriculum, CurriculumDetail, CurriculumCourseHours } from '../../types/curriculum';
import { mapApiCurriculum } from '../../types/curriculum';

export const curriculumService = {
  async getCurriculumList(departmentId?: number | null): Promise<Curriculum[]> {
    const url = departmentId ? `/curriculum?department_id=${departmentId}` : '/curriculum';
    const res = await api.get<ApiCurriculum[]>(url);
    return res.data.map(mapApiCurriculum);
  },

  async getActiveCurricula(departmentId: number): Promise<Curriculum[]> {
    const res = await api.get<ApiCurriculum[]>('/curriculum', {
      params: { department_id: departmentId, status: 'active' },
    });
    return res.data.map(mapApiCurriculum);
  },

  async assignCurriculumToYearLevel(payload: {
    semester_id: number;
    department_id: number;
    year_level: number;
    curriculum_id: number;
    section_ids?: number[];
  }): Promise<{ message: string; curriculum_id: number; section_ids: number[] }> {
    const res = await api.post('/sections/assign-curriculum', payload);
    return res.data;
  },

  /** Changes one section's curriculum; the server refuses while its classes belong to another. */
  async assignCurriculumToSection(
    sectionId: number | string,
    curriculumId: number
  ): Promise<{ curriculum_id: number | null; curriculum?: { id: number; name: string } | null }> {
    const res = await api.put(`/sections/${sectionId}`, { curriculum_id: curriculumId });
    return res.data;
  },

  async getCurriculumFull(id: number | string): Promise<CurriculumDetail> {
    const res = await api.get<CurriculumDetail>(`/curriculum/${id}/full`);
    return res.data;
  },

  async createCurriculum(data: Partial<Curriculum>): Promise<Curriculum> {
    const res = await api.post<ApiCurriculum>('/curriculum', data);
    return mapApiCurriculum(res.data);
  },

  async updateCurriculum(id: number, data: Partial<Curriculum>): Promise<Curriculum> {
    const res = await api.put<ApiCurriculum>(`/curriculum/${id}`, data);
    return mapApiCurriculum(res.data);
  },

  async deleteCurriculum(id: number): Promise<void> {
    await api.delete(`/curriculum/${id}`);
  },

  async duplicateCurriculum(id: number): Promise<Curriculum> {
    const res = await api.post<ApiCurriculum>(`/curriculum/${id}/duplicate`);
    return mapApiCurriculum(res.data);
  },

  async updateStatus(id: number, status: string): Promise<Curriculum> {
    const res = await api.patch<ApiCurriculum>(`/curriculum/${id}/status`, { status });
    return mapApiCurriculum(res.data);
  },

  async attachCourse(
    curriculumId: number | string,
    courseId: number,
    yearLevel: number,
    semester: number,
    replaceCourseId?: number
  ): Promise<void> {
    await api.post(`/curriculum/${curriculumId}/courses`, {
      course_id: courseId,
      year_level: yearLevel,
      semester,
      ...(replaceCourseId ? { replace_course_id: replaceCourseId } : {}),
    });
  },

  async attachCoursesBatch(
    curriculumId: number | string,
    courses: Array<{ course_id: number; year_level: number; semester: number }>
  ): Promise<void> {
    await api.post(`/curriculum/${curriculumId}/courses/batch`, { courses });
  },

  /**
   * Edit Hours per Unit for one course in this curriculum. Units are unchanged. A 409 with
   * `requires_confirmation` means draft classes exist; resend with `confirm_draft_changes`.
   */
  async updateCourseHours(
    curriculumId: number | string,
    courseId: number,
    payload:
      | { use_department_default: true; confirm_draft_changes?: boolean }
      | { lecture_minutes_per_unit: number; laboratory_minutes_per_unit: number; confirm_draft_changes?: boolean }
  ): Promise<{ message: string; course_id: number; hours: CurriculumCourseHours }> {
    const res = await api.put(`/curriculum/${curriculumId}/courses/${courseId}/hours`, payload);
    return res.data;
  },

  async detachCourse(curriculumId: number | string, courseId: number): Promise<void> {
    await api.delete(`/curriculum/${curriculumId}/courses/${courseId}`);
  },
};

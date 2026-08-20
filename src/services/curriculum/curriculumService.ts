import api from '../../lib/api';
import type { Curriculum, ApiCurriculum, CurriculumDetail } from '../../types/curriculum';
import { mapApiCurriculum } from '../../types/curriculum';

export const curriculumService = {
  async getCurriculumList(departmentId?: number | null): Promise<Curriculum[]> {
    const url = departmentId ? `/curriculum?department_id=${departmentId}` : '/curriculum';
    const res = await api.get<ApiCurriculum[]>(url);
    return res.data.map(mapApiCurriculum);
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

  async detachCourse(curriculumId: number | string, courseId: number): Promise<void> {
    await api.delete(`/curriculum/${curriculumId}/courses/${courseId}`);
  },
};

import api from '../../lib/api';
import type { Curriculum, ApiCurriculum, CurriculumDetail } from '../../types/curriculum';
import { mapApiCurriculum } from '../../types/curriculum';

export const curriculumService = {
  async getCurricula(departmentId?: number | null): Promise<Curriculum[]> {
    const url = departmentId ? `/curricula?department_id=${departmentId}` : '/curricula';
    const res = await api.get<ApiCurriculum[]>(url);
    return res.data.map(mapApiCurriculum);
  },

  async getCurriculumFull(id: number | string): Promise<CurriculumDetail> {
    const res = await api.get<CurriculumDetail>(`/curricula/${id}/full`);
    return res.data;
  },

  async createCurriculum(data: Partial<Curriculum>): Promise<Curriculum> {
    const res = await api.post<ApiCurriculum>('/curricula', data);
    return mapApiCurriculum(res.data);
  },

  async updateCurriculum(id: number, data: Partial<Curriculum>): Promise<Curriculum> {
    const res = await api.put<ApiCurriculum>(`/curricula/${id}`, data);
    return mapApiCurriculum(res.data);
  },

  async deleteCurriculum(id: number): Promise<void> {
    await api.delete(`/curricula/${id}`);
  },

  async duplicateCurriculum(id: number): Promise<Curriculum> {
    const res = await api.post<ApiCurriculum>(`/curricula/${id}/duplicate`);
    return mapApiCurriculum(res.data);
  },

  async updateStatus(id: number, status: string): Promise<Curriculum> {
    const res = await api.patch<ApiCurriculum>(`/curricula/${id}/status`, { status });
    return mapApiCurriculum(res.data);
  },

  async attachCourse(curriculumId: number | string, courseId: number, yearLevel: number, semester: number): Promise<void> {
    await api.post(`/curricula/${curriculumId}/courses`, {
      course_id: courseId,
      year_level: yearLevel,
      semester,
    });
  },

  async detachCourse(curriculumId: number | string, courseId: number): Promise<void> {
    await api.delete(`/curricula/${curriculumId}/courses/${courseId}`);
  },
};

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import type { Curriculum, CurriculumSemester, CurriculumCourse, Program } from '../../types/curriculum';
import type { CourseOption } from '../../components/curriculum/AddCourseForm';

type FullCurriculum = Curriculum & {
  department?: { id: number; department_code: string; department_name: string };
};

interface CurriculumDetailCacheData {
  curriculum: FullCurriculum;
  semesters: CurriculumSemester[];
}

interface BatchCreateCourseResult {
  row_id: string;
  status: 'success' | 'error';
  message?: string;
  course?: CourseOption;
}

interface ApiErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
}

export function useCurriculumDetail(id: string | undefined) {
  const { toast } = useToast();
  const cacheKey = id ? `curriculum:detail:${id}` : '';
  const cachedData = cacheKey ? getCachedData<CurriculumDetailCacheData>(cacheKey) : undefined;

  const [curriculum, setCurriculum] = useState<FullCurriculum | null>(
    cachedData?.curriculum ?? null
  );
  const [semesters, setSemesters] = useState<CurriculumSemester[]>(cachedData?.semesters ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedData && Boolean(id));
  const [isActivating, setIsActivating] = useState(false);

  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(1);
  const [removingCourseId, setRemovingCourseId] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [highlightedCourseId, setHighlightedCourseId] = useState<number | null>(null);

  const fetchCurriculum = useCallback(
    async (silent = false) => {
      if (!id || !cacheKey) return;
      const isCached = hasCachedData(cacheKey);
      if (!silent && !isCached) {
        setIsLoading(true);
      }
      try {
        const data = await loadCachedData<CurriculumDetailCacheData>(
          cacheKey,
          async () => {
            const res = await curriculumService.getCurriculumFull(id);
            return {
              curriculum: res.curriculum as FullCurriculum,
              semesters: res.semesters || [],
            };
          },
          silent
        );
        setCurriculum(data.curriculum);
        setSemesters(data.semesters || []);
      } catch {
        toast.error('Error', 'Failed to load curriculum details.');
      } finally {
        setIsLoading(false);
      }
    },
    [id, cacheKey, toast]
  );

  const fetchCourses = useCallback(async (departmentId?: number | null) => {
    try {
      const params = new URLSearchParams({ all: 'true' });
      if (departmentId) {
        params.set('department_id', String(departmentId));
      }
      const res = await api.get(`/courses?${params.toString()}`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setAllCourses(data);
    } catch {
      setAllCourses([]);
    }
  }, []);

  // A major's program decides which instructors may teach it, so the course
  // editor needs the department's programs to choose from.
  const fetchPrograms = useCallback(async (departmentId?: number | null) => {
    try {
      const params = departmentId ? `?department_id=${departmentId}` : '';
      const res = await api.get(`/programs${params}`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setPrograms(data);
    } catch {
      setPrograms([]);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchCurriculum();
    }
  }, [id, fetchCurriculum]);

  useEffect(() => {
    if (curriculum) {
      fetchCourses(curriculum.department_id);
      fetchPrograms(curriculum.department_id);
    }
  }, [curriculum, fetchCourses, fetchPrograms]);

  useEffect(() => {
    if (highlightedCourseId) {
      const timer = setTimeout(() => setHighlightedCourseId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedCourseId]);

  const addedCourseIds = useMemo(() => {
    const ids = new Set<number>();
    semesters.forEach((t) => t.courses.forEach((c) => ids.add(c.id)));
    return ids;
  }, [semesters]);

  const availableCourses = useMemo(() => {
    return allCourses.filter((c) => !addedCourseIds.has(c.id));
  }, [allCourses, addedCourseIds]);

  const overallStats = useMemo(() => {
    let totalCourses = 0;
    let totalLec = 0;
    let totalLab = 0;
    let totalUnits = 0;
    semesters.forEach((t) => {
      totalCourses += t.courses.length;
      totalLec += t.totals.lec;
      totalLab += t.totals.lab;
      totalUnits += t.totals.tu;
    });
    return { totalCourses, totalLec, totalLab, totalUnits };
  }, [semesters]);

  const yearLevelStats = useMemo(() => {
    const stats: Record<number, { courses: number; units: number; lec: number; lab: number }> = {
      1: { courses: 0, units: 0, lec: 0, lab: 0 },
      2: { courses: 0, units: 0, lec: 0, lab: 0 },
      3: { courses: 0, units: 0, lec: 0, lab: 0 },
      4: { courses: 0, units: 0, lec: 0, lab: 0 },
    };

    semesters.forEach((t) => {
      if (stats[t.year_level]) {
        stats[t.year_level].courses += t.courses.length;
        stats[t.year_level].units += t.totals.tu;
        stats[t.year_level].lec += t.totals.lec;
        stats[t.year_level].lab += t.totals.lab;
      }
    });

    return stats;
  }, [semesters]);

  const currentYearSemesters = useMemo(() => {
    const semNums = [1, 2, 3];

    return semNums.map((sem) => {
      const existing = semesters.find((t) => t.year_level === selectedYear && t.semester === sem);
      return (
        existing || {
          year_level: selectedYear,
          semester: sem,
          courses: [],
          totals: { lec: 0, lab: 0, tu: 0 },
        }
      );
    });
  }, [semesters, selectedYear]);

  const handleActivate = async () => {
    if (!id) return;
    setIsActivating(true);
    try {
      await curriculumService.updateStatus(Number(id), 'active');
      setCurriculum((prev) => (prev ? { ...prev, status: 'active' } : prev));
      invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
      toast.success('Activated', 'Curriculum is now active.');
    } catch {
      toast.error('Error', 'Failed to activate curriculum.');
    } finally {
      setIsActivating(false);
    }
  };

  const handleAddCourseToSemester = useCallback(
    async (
      coursesInput: Array<{
        rowId: string;
        courseCode: string;
        courseName: string;
        courseCategory: 'major' | 'minor';
        lecUnits: number;
        labUnits: number;
      }>,
      yearLevel: number,
      semester: number,
      onProgress?: (rowId: string, status: 'saving' | 'success' | 'error', errorMsg?: string) => void
    ) => {
      if (!id || !coursesInput || coursesInput.length === 0) return;

      const validRows = coursesInput
        .map((item) => ({
          ...item,
          trimmedCode: item.courseCode.trim(),
          trimmedName: item.courseName.trim(),
        }))
        .filter((item) => item.trimmedCode && item.trimmedName);

      if (validRows.length === 0) return;

      // Report "saving" progress for each row before sending the request
      if (onProgress) {
        for (const item of validRows) {
          onProgress(item.rowId, 'saving');
        }
      }

      try {
        const payload = validRows.map((item) => ({
          // Curriculum units stay academic units. Laboratory contact-hour
          // expansion belongs only to scheduling, not course data.
          units: (item.lecUnits ?? 0) + (item.labUnits ?? 0),
          row_id: item.rowId,
          course_code: item.trimmedCode,
          course_name: item.trimmedName,
          course_category: item.courseCategory,
          lecture_hours: item.lecUnits ?? 0,
          lab_hours: item.labUnits ?? 0,
          year_level: yearLevel,
          semester: semester,
        }));

        const res = await api.post(`/curriculum/${id}/courses/batch-create`, {
          courses: payload,
        });

        const results: BatchCreateCourseResult[] = res.data.results || [];
        const successfulNewCourses: CurriculumCourse[] = [];

        for (const resItem of results) {
          const rowId = resItem.row_id;
          const status = resItem.status;
          const errMsg = resItem.message;
          const courseData = resItem.course;

          if (status === 'success') {
            if (onProgress) {
              onProgress(rowId, 'success');
            }
            if (courseData) {
              // Add to allCourses catalog if not already in it
              const exists = allCourses.some((c) => c.id === courseData.id);
              if (!exists) {
                setAllCourses((prev) => [...prev, courseData]);
              }

              const payloadItem = validRows.find((item) => item.rowId === rowId);

              successfulNewCourses.push({
                id: courseData.id,
                code: courseData.course_code,
                title: courseData.course_name,
                category: (courseData.course_category || payloadItem?.courseCategory || 'major') as 'major' | 'minor',
                lec_units: courseData.lecture_hours,
                lab_units: courseData.lab_hours,
                total_units: courseData.units,
              });
            }
          } else {
            if (onProgress) {
              onProgress(rowId, 'error', errMsg || 'Failed to save course.');
            }
          }
        }

        const allFailed = results.length > 0 && results.every((r) => r.status === 'error');
        if (allFailed) {
          toast.error('Error', 'Failed to save courses. Please review individual row errors.');
        } else if (successfulNewCourses.length > 0) {
          setSemesters((prev) => {
            let next: CurriculumSemester[];
            const existingIndex = prev.findIndex((t) => t.year_level === yearLevel && t.semester === semester);
            if (existingIndex >= 0) {
              next = prev.map((t, idx) => {
                if (idx === existingIndex) {
                  const updatedCourses = [...t.courses, ...successfulNewCourses];
                  return {
                    ...t,
                    courses: updatedCourses,
                    totals: {
                      lec: updatedCourses.reduce((sum, c) => sum + c.lec_units, 0),
                      lab: updatedCourses.reduce((sum, c) => sum + c.lab_units, 0),
                      tu: updatedCourses.reduce((sum, c) => sum + c.total_units, 0),
                    },
                  };
                }
                return t;
              });
            } else {
              const newSemester: CurriculumSemester = {
                year_level: yearLevel,
                semester,
                courses: successfulNewCourses,
                totals: {
                  lec: successfulNewCourses.reduce((sum, c) => sum + c.lec_units, 0),
                  lab: successfulNewCourses.reduce((sum, c) => sum + c.lab_units, 0),
                  tu: successfulNewCourses.reduce((sum, c) => sum + c.total_units, 0),
                },
              };
              next = [...prev, newSemester];
            }
            if (cacheKey && curriculum) {
              setCachedData(cacheKey, { curriculum, semesters: next });
            }
            return next;
          });

          setHighlightedCourseId(successfulNewCourses[0].id);
          invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
          toast.success(
            'Courses Saved',
            `${successfulNewCourses.length} course${successfulNewCourses.length > 1 ? 's' : ''} saved successfully.`
          );
        }
      } catch (err: unknown) {
        const apiError = err as ApiErrorResponse;
        const globalErrMsg = apiError.response?.data?.message || 'Failed to save courses.';
        toast.error('Error', globalErrMsg);
        if (onProgress) {
          for (const item of validRows) {
            onProgress(item.rowId, 'error', globalErrMsg);
          }
        }
      }
    },
    [id, cacheKey, allCourses, curriculum, toast]
  );

  const handleRemoveCourse = useCallback(
    async (courseId: number, courseCode: string) => {
      if (!id) return;
      setIsRemoving(true);

      setSemesters((prev) => {
        const next = prev
          .map((t) => {
            const updatedCourses = t.courses.filter((c) => c.id !== courseId);
            return {
              ...t,
              courses: updatedCourses,
              totals: {
                lec: updatedCourses.reduce((sum, c) => sum + c.lec_units, 0),
                lab: updatedCourses.reduce((sum, c) => sum + c.lab_units, 0),
                tu: updatedCourses.reduce((sum, c) => sum + c.total_units, 0),
              },
            };
          })
          .filter((t) => t.courses.length > 0 || t.year_level === selectedYear);

        if (cacheKey && curriculum) {
          setCachedData(cacheKey, { curriculum, semesters: next });
        }
        return next;
      });

      setRemovingCourseId(null);

      try {
        await curriculumService.detachCourse(id, courseId);
        invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
        toast.success('Course Removed', `${courseCode} removed from curriculum.`);
      } catch {
        toast.error('Error', 'Failed to remove course.');
        fetchCurriculum(true);
      } finally {
        setIsRemoving(false);
      }
    },
    [id, selectedYear, cacheKey, curriculum, toast, fetchCurriculum]
  );

  const handleEditCourse = useCallback(
    async (data: {
      courseId: number;
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
      programId?: number | null;
    }) => {
      if (!id) return;
      const { courseId, courseCode, courseName, courseCategory, lecUnits, labUnits } = data;
      const programId = data.programId ?? null;
      // Curriculum total units are academic units. Do not use laboratory
      // scheduling/contact hours here.
      const totalUnits = lecUnits + labUnits;
      const normalizedCode = courseCode.replace(/\s+/g, ' ').trim().toUpperCase();
      const currentSemester = semesters.find((t) => t.courses.some((c) => c.id === courseId));
      const existingCourse = allCourses.find(
        (course) => course.course_code.replace(/\s+/g, ' ').trim().toUpperCase() === normalizedCode && course.id !== courseId
      );
      const existingCourseIsAlreadyAdded = existingCourse
        ? semesters.some((semester) => semester.courses.some((course) => course.id === existingCourse.id))
        : false;

      if (existingCourseIsAlreadyAdded) {
        toast.error('Error', `${normalizedCode} is already added to this curriculum.`);
        return;
      }

      if (existingCourse && currentSemester) {
        setSemesters((prev) => {
          const next = prev.map((semester) => {
            if (!semester.courses.some((course) => course.id === courseId)) {
              return semester;
            }

            const updatedCourses = semester.courses.map((course) =>
              course.id === courseId
                ? {
                    id: existingCourse.id,
                    code: existingCourse.course_code,
                    title: existingCourse.course_name,
                    category: (existingCourse.course_category || 'major') as 'major' | 'minor',
                    lec_units: existingCourse.lecture_hours,
                    lab_units: existingCourse.lab_hours,
                    total_units: existingCourse.units,
                  }
                : course
            );

            return {
              ...semester,
              courses: updatedCourses,
              totals: {
                lec: updatedCourses.reduce((sum, course) => sum + course.lec_units, 0),
                lab: updatedCourses.reduce((sum, course) => sum + course.lab_units, 0),
                tu: updatedCourses.reduce((sum, course) => sum + course.total_units, 0),
              },
            };
          });

          if (cacheKey && curriculum) {
            setCachedData(cacheKey, { curriculum, semesters: next });
          }

          return next;
        });

        try {
          await curriculumService.attachCourse(id, existingCourse.id, currentSemester.year_level, currentSemester.semester, courseId);
          invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
          toast.success('Course Updated', `${normalizedCode} linked successfully.`);
        } catch {
          toast.error('Error', 'Failed to update course.');
          fetchCurriculum(true);
        }

        return;
      }

      setSemesters((prev) => {
        const next = prev.map((t) => {
          const courseIdx = t.courses.findIndex((c) => c.id === courseId);
          if (courseIdx >= 0) {
            const updatedCourses = t.courses.map((c) =>
              c.id === courseId
                ? {
                    ...c,
                    code: courseCode,
                    title: courseName,
                    category: courseCategory,
                    lec_units: lecUnits,
                    lab_units: labUnits,
                    total_units: totalUnits,
                    program_id: programId,
                  }
                : c
            );
            return {
              ...t,
              courses: updatedCourses,
              totals: {
                lec: updatedCourses.reduce((sum, c) => sum + c.lec_units, 0),
                lab: updatedCourses.reduce((sum, c) => sum + c.lab_units, 0),
                tu: updatedCourses.reduce((sum, c) => sum + c.total_units, 0),
              },
            };
          }
          return t;
        });

        if (cacheKey && curriculum) {
          setCachedData(cacheKey, { curriculum, semesters: next });
        }
        return next;
      });

      setAllCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? {
                ...c,
                course_code: courseCode,
                course_name: courseName,
                lecture_hours: lecUnits,
                lab_hours: labUnits,
                units: totalUnits,
              }
            : c
        )
      );

      try {
        await api.put(`/courses/${courseId}`, {
          course_code: normalizedCode,
          course_name: courseName,
          course_category: courseCategory,
          lecture_hours: lecUnits,
          lab_hours: labUnits,
          units: totalUnits,
          room_type_required: labUnits > 0 ? 'laboratory' : 'lecture',
          program_id: programId,
        });
        invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
        toast.success('Course Updated', `${courseCode} updated successfully.`);
      } catch {
        toast.error('Error', 'Failed to update course.');
        fetchCurriculum(true);
      }
    },
    [id, cacheKey, curriculum, semesters, allCourses, toast, fetchCurriculum]
  );

  return {
    curriculum,
    semesters,
    isLoading,
    isActivating,
    availableCourses,
    programs,
    selectedYear,
    setSelectedYear,
    removingCourseId,
    setRemovingCourseId,
    isRemoving,
    highlightedCourseId,
    overallStats,
    yearLevelStats,
    currentYearSemesters,
    handleActivate,
    handleAddCourseToSemester,
    handleEditCourse,
    handleRemoveCourse,
  };
}

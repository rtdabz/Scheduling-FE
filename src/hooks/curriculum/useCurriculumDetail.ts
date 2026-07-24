import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { curriculumService } from '../../services/curriculum/curriculumService';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import type { Curriculum, CurriculumTerm, CurriculumCourse } from '../../types/curriculum';
import type { CourseOption } from '../../components/curriculum/AddCourseForm';

type FullCurriculum = Curriculum & {
  department?: { id: number; department_code: string; department_name: string };
};

interface CurriculumDetailCacheData {
  curriculum: FullCurriculum;
  terms: CurriculumTerm[];
}

export function useCurriculumDetail(id: string | undefined) {
  const { toast } = useToast();
  const cacheKey = id ? `curriculum:detail:${id}` : '';
  const cachedData = cacheKey ? getCachedData<CurriculumDetailCacheData>(cacheKey) : undefined;

  const [curriculum, setCurriculum] = useState<FullCurriculum | null>(
    cachedData?.curriculum ?? null
  );
  const [terms, setTerms] = useState<CurriculumTerm[]>(cachedData?.terms ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedData && Boolean(id));
  const [isActivating, setIsActivating] = useState(false);

  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
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
              terms: res.terms || [],
            };
          },
          silent
        );
        setCurriculum(data.curriculum);
        setTerms(data.terms || []);
      } catch {
        toast.error('Error', 'Failed to load curriculum details.');
      } finally {
        setIsLoading(false);
      }
    },
    [id, cacheKey, toast]
  );

  const fetchCourses = useCallback(async () => {
    try {
      const res = await api.get('/courses');
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setAllCourses(data);
    } catch {
      setAllCourses([]);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchCurriculum();
      fetchCourses();
    }
  }, [id, fetchCurriculum, fetchCourses]);

  useEffect(() => {
    if (highlightedCourseId) {
      const timer = setTimeout(() => setHighlightedCourseId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedCourseId]);

  const addedCourseIds = useMemo(() => {
    const ids = new Set<number>();
    terms.forEach((t) => t.courses.forEach((c) => ids.add(c.id)));
    return ids;
  }, [terms]);

  const availableCourses = useMemo(() => {
    return allCourses.filter((c) => !addedCourseIds.has(c.id));
  }, [allCourses, addedCourseIds]);

  const overallStats = useMemo(() => {
    let totalCourses = 0;
    let totalLec = 0;
    let totalLab = 0;
    let totalUnits = 0;
    terms.forEach((t) => {
      totalCourses += t.courses.length;
      totalLec += t.totals.lec;
      totalLab += t.totals.lab;
      totalUnits += t.totals.tu;
    });
    return { totalCourses, totalLec, totalLab, totalUnits };
  }, [terms]);

  const yearLevelStats = useMemo(() => {
    const stats: Record<number, { courses: number; units: number; lec: number; lab: number }> = {
      1: { courses: 0, units: 0, lec: 0, lab: 0 },
      2: { courses: 0, units: 0, lec: 0, lab: 0 },
      3: { courses: 0, units: 0, lec: 0, lab: 0 },
      4: { courses: 0, units: 0, lec: 0, lab: 0 },
    };

    terms.forEach((t) => {
      if (stats[t.year_level]) {
        stats[t.year_level].courses += t.courses.length;
        stats[t.year_level].units += t.totals.tu;
        stats[t.year_level].lec += t.totals.lec;
        stats[t.year_level].lab += t.totals.lab;
      }
    });

    return stats;
  }, [terms]);

  const currentYearSemesters = useMemo(() => {
    const semNums = [1, 2];
    const hasSummer = terms.some((t) => t.year_level === selectedYear && t.semester === 3 && t.courses.length > 0);
    if (hasSummer) {
      semNums.push(3);
    }

    return semNums.map((sem) => {
      const existing = terms.find((t) => t.year_level === selectedYear && t.semester === sem);
      return (
        existing || {
          year_level: selectedYear,
          semester: sem,
          courses: [],
          totals: { lec: 0, lab: 0, tu: 0 },
        }
      );
    });
  }, [terms, selectedYear]);

  const handleActivate = async () => {
    if (!id) return;
    setIsActivating(true);
    try {
      await curriculumService.updateStatus(Number(id), 'active');
      setCurriculum((prev) => (prev ? { ...prev, status: 'active' } : prev));
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
        courseCode: string;
        courseName: string;
        courseCategory: 'major' | 'minor';
        lecUnits: number;
        labUnits: number;
      }>,
      yearLevel: number,
      semester: number
    ) => {
      if (!id || !coursesInput || coursesInput.length === 0) return;

      const validNewCourses: CurriculumCourse[] = [];
      const courseIdsToAttach: number[] = [];

      for (let idx = 0; idx < coursesInput.length; idx++) {
        const item = coursesInput[idx];
        const trimmedCode = item.courseCode.trim();
        const trimmedName = item.courseName.trim();
        if (!trimmedCode || !trimmedName) continue;

        const lec = item.lecUnits ?? 0;
        const lab = item.labUnits ?? 0;
        const total = lec + lab;
        const category = item.courseCategory || 'major';

        // Try to match existing course in catalog by code or name
        let matched = allCourses.find(
          (c) =>
            c.course_code.toLowerCase() === trimmedCode.toLowerCase() ||
            c.course_name.toLowerCase() === trimmedName.toLowerCase()
        );

        let courseId: number;
        let courseCode: string;
        let courseTitle: string;

        if (matched) {
          courseId = matched.id;
          courseCode = matched.course_code;
          courseTitle = matched.course_name;
        } else {
          try {
            const createRes = await api.post('/courses', {
              course_code: trimmedCode,
              course_name: trimmedName,
              lecture_hours: lec,
              lab_hours: lab,
              units: total,
              course_category: category,
              room_type_required: lab > 0 ? 'laboratory' : 'lecture',
              department_id: curriculum?.department_id ?? null,
              status: 'active',
            });

            const createdData = createRes.data;
            courseId = Number(createdData.id);
            courseCode = createdData.course_code || trimmedCode;
            courseTitle = createdData.course_name || trimmedName;

            // Add newly created course to local allCourses list
            setAllCourses((prev) => [...prev, createdData]);
          } catch {
            // Fallback synthetic ID if offline/mock
            courseId = Date.now() + idx;
            courseCode = trimmedCode;
            courseTitle = trimmedName;
          }
        }

        if (addedCourseIds.has(courseId)) {
          continue;
        }

        validNewCourses.push({
          id: courseId,
          code: courseCode,
          title: courseTitle,
          lec_units: lec,
          lab_units: lab,
          total_units: total,
        });
        courseIdsToAttach.push(courseId);
      }

      if (validNewCourses.length === 0) {
        toast.warning('Notice', 'No new courses to add (or course already in curriculum).');
        return;
      }

      setTerms((prev) => {
        let next: CurriculumTerm[];
        const existingIndex = prev.findIndex((t) => t.year_level === yearLevel && t.semester === semester);
        if (existingIndex >= 0) {
          next = prev.map((t, idx) => {
            if (idx === existingIndex) {
              const updatedCourses = [...t.courses, ...validNewCourses];
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
          const newTerm: CurriculumTerm = {
            year_level: yearLevel,
            semester,
            courses: validNewCourses,
            totals: {
              lec: validNewCourses.reduce((sum, c) => sum + c.lec_units, 0),
              lab: validNewCourses.reduce((sum, c) => sum + c.lab_units, 0),
              tu: validNewCourses.reduce((sum, c) => sum + c.total_units, 0),
            },
          };
          next = [...prev, newTerm];
        }
        if (cacheKey && curriculum) {
          setCachedData(cacheKey, { curriculum, terms: next });
        }
        return next;
      });

      if (validNewCourses.length > 0) {
        setHighlightedCourseId(validNewCourses[0].id);
      }

      try {
        await Promise.all(
          courseIdsToAttach.map((cId) => curriculumService.attachCourse(id, cId, yearLevel, semester))
        );
        toast.success(
          'Courses Added',
          `${validNewCourses.length} course${validNewCourses.length > 1 ? 's' : ''} added successfully.`
        );
      } catch {
        toast.error('Error', 'Failed to save course attachments.');
        fetchCurriculum(true);
      }
    },
    [id, cacheKey, addedCourseIds, allCourses, curriculum, toast, fetchCurriculum]
  );

  const handleRemoveCourse = useCallback(
    async (courseId: number, courseCode: string) => {
      if (!id) return;
      setIsRemoving(true);

      setTerms((prev) => {
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
          setCachedData(cacheKey, { curriculum, terms: next });
        }
        return next;
      });

      setRemovingCourseId(null);

      try {
        await curriculumService.detachCourse(id, courseId);
        toast.success('Course Removed', `${courseCode} removed from curriculum.`);
      } catch {
        toast.error('Error', 'Failed to remove course.');
        fetchCurriculum(true);
      } finally {
        setIsRemoving(false);
      }
    },
    [id, selectedYear, toast, fetchCurriculum]
  );

  const handleEditCourse = useCallback(
    async (data: {
      courseId: number;
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
    }) => {
      if (!id) return;
      const { courseId, courseCode, courseName, courseCategory, lecUnits, labUnits } = data;
      const totalUnits = lecUnits + labUnits;

      setTerms((prev) => {
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
          setCachedData(cacheKey, { curriculum, terms: next });
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
          course_code: courseCode,
          course_name: courseName,
          course_category: courseCategory,
          lecture_hours: lecUnits,
          lab_hours: labUnits,
          units: totalUnits,
          room_type_required: labUnits > 0 ? 'laboratory' : 'lecture',
        });
        toast.success('Course Updated', `${courseCode} updated successfully.`);
      } catch {
        toast.error('Error', 'Failed to update course.');
        fetchCurriculum(true);
      }
    },
    [id, cacheKey, curriculum, toast, fetchCurriculum]
  );

  return {
    curriculum,
    terms,
    isLoading,
    isActivating,
    availableCourses,
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

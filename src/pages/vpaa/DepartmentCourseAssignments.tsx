import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Building2, CheckCircle2, ChevronLeft, ChevronRight, Save, Search, TriangleAlert } from 'lucide-react';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';

interface DepartmentOption {
  id: number;
  department_code: string;
  department_name: string;
}

interface CourseOption {
  id: number;
  course_code: string;
  course_name: string;
  course_category?: string | null;
  department_id?: number | null;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  department?: DepartmentOption | null;
  categories?: { id: number; name: string; description?: string | null }[];
  teaching_assignment?: {
    id: number;
    course_id: number;
    department_id: number;
    department?: DepartmentOption | null;
  } | null;
}

interface CourseTeachingAssignment {
  id: number;
  course_id: number;
  department_id: number;
}

interface PageData {
  courses: CourseOption[];
  departments: DepartmentOption[];
  assignments: CourseTeachingAssignment[];
}

type CourseTypeFilter = 'minor' | 'major' | 'gec' | 'all';
type CourseQuickFilter = CourseTypeFilter | 'laboratory' | 'field';
type AssignmentStatusFilter = 'all' | 'assigned' | 'unassigned';

const cacheKey = 'page:department-course-assignments';
const pageSize = 12;

const isGecCourse = (course: CourseOption): boolean => {
  const code = course.course_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.startsWith('GEE')) return false;
  if (hasCourseCategory(course, 'GEC')) return true;
  return code.startsWith('GEC');
};

const isSharedNoDepartmentCourse = (course: CourseOption): boolean => {
  const category = (course.course_category ?? '').toLowerCase();
  const code = course.course_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  return category === 'minor' && (code.startsWith('GEC') || code.startsWith('GEE'));
};

const hasCourseCategory = (course: CourseOption, name: string): boolean => {
  return (course.categories ?? []).some((category) => category.name.toLowerCase() === name.toLowerCase());
};

const isLaboratoryCourse = (course: CourseOption): boolean => (
  hasCourseCategory(course, 'Laboratory') || Number(course.lab_hours ?? 0) > 0
);

const isFieldCourse = (course: CourseOption): boolean => hasCourseCategory(course, 'Field');

const courseTypeLabel = (course: CourseOption): string => {
  if (isGecCourse(course)) return 'GEC';
  return (course.course_category ?? 'course').toUpperCase();
};

export default function DepartmentCourseAssignments() {
  const { toast } = useToast();
  const cached = getCachedData<PageData>(cacheKey);
  const [courses, setCourses] = useState<CourseOption[]>(cached?.courses ?? []);
  const [departments, setDepartments] = useState<DepartmentOption[]>(cached?.departments ?? []);
  const [assignments, setAssignments] = useState<CourseTeachingAssignment[]>(cached?.assignments ?? []);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [courseType, setCourseType] = useState<CourseQuickFilter>('minor');
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentStatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [savingCourseId, setSavingCourseId] = useState<number | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasCachedData(cacheKey));

  useEffect(() => {
    let active = true;
    setIsLoading(!hasCachedData(cacheKey));
    loadCachedData<PageData>(cacheKey, async () => {
      const [initialDataRes, assignmentsRes] = await Promise.all([
        api.get<{ courses?: CourseOption[]; departments?: DepartmentOption[] }>('/initial-data'),
        api.get<{ data: CourseTeachingAssignment[] }>('/course-teaching-assignments').catch(() => ({ data: { data: [] } })),
      ]);
      return {
        courses: Array.isArray(initialDataRes.data.courses) ? initialDataRes.data.courses : [],
        departments: Array.isArray(initialDataRes.data.departments) ? initialDataRes.data.departments : [],
        assignments: assignmentsRes.data.data ?? [],
      };
    }).then((data) => {
      if (!active) return;
      setCourses(data.courses);
      setDepartments(data.departments);
      setAssignments(data.assignments);
    }).catch(() => {
      if (active) toast.error('Error', 'Failed to load department course assignments.');
    }).finally(() => {
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [toast]);

  const assignmentMap = useMemo(() => {
    const map = new Map<number, number>();
    assignments.forEach((assignment) => map.set(Number(assignment.course_id), Number(assignment.department_id)));
    return map;
  }, [assignments]);

  useEffect(() => {
    const nextDrafts: Record<number, string> = {};
    courses.forEach((course) => {
      const assignedId = assignmentMap.get(course.id) ?? course.teaching_assignment?.department_id;
      nextDrafts[course.id] = assignedId ? String(assignedId) : '';
    });
    setDrafts(nextDrafts);
  }, [assignmentMap, courses]);

  useEffect(() => {
    setPageIndex(0);
    setSelectedCourseIds([]);
  }, [courseType, assignmentStatus, departmentFilter, search]);

  const updateAssignments = (nextAssignments: CourseTeachingAssignment[]) => {
    setAssignments(nextAssignments);
    setCachedData<PageData>(cacheKey, { courses, departments, assignments: nextAssignments });
  };

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...courses]
      .filter((course) => {
        const category = (course.course_category ?? '').toLowerCase();
        const assignedDepartmentId = assignmentMap.get(course.id) ?? course.teaching_assignment?.department_id ?? null;

        if (courseType === 'minor' && category !== 'minor') return false;
        if (courseType === 'major' && category !== 'major') return false;
        if (courseType === 'gec' && (category !== 'minor' || !isGecCourse(course))) return false;
        if (courseType === 'laboratory' && !isLaboratoryCourse(course)) return false;
        if (courseType === 'field' && !isFieldCourse(course)) return false;
        if (assignmentStatus === 'assigned' && !assignedDepartmentId) return false;
        if (assignmentStatus === 'unassigned' && assignedDepartmentId) return false;
        if (departmentFilter !== 'all') {
          const currentDepartmentFilterValue = isSharedNoDepartmentCourse(course)
            ? 'shared'
            : String(course.department_id ?? 'shared');
          if (currentDepartmentFilterValue !== departmentFilter) return false;
        }

        return !query
          || course.course_code.toLowerCase().includes(query)
          || course.course_name.toLowerCase().includes(query);
      })
      .sort((a, b) => a.course_code.localeCompare(b.course_code, undefined, { numeric: true }));
  }, [assignmentMap, assignmentStatus, courseType, courses, departmentFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / pageSize));
  const pagedCourses = filteredCourses.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
  const visibleIds = pagedCourses.map((course) => course.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCourseIds.includes(id));

  const saveCourse = async (courseId: number) => {
    const departmentId = Number(drafts[courseId] || 0);
    if (!departmentId) {
      toast.error('Required', 'Select a teaching department first.');
      return;
    }

    setSavingCourseId(courseId);
    try {
      const response = await api.post<{ data: CourseTeachingAssignment }>('/course-teaching-assignments', {
        course_id: courseId,
        department_id: departmentId,
      });
      updateAssignments([...assignments.filter((assignment) => Number(assignment.course_id) !== courseId), response.data.data]);
      toast.success('Saved', 'Teaching department assignment updated.');
    } catch {
      toast.error('Error', 'Failed to save teaching department assignment.');
    } finally {
      setSavingCourseId(null);
    }
  };

  const saveSelected = async () => {
    const departmentId = Number(bulkDepartmentId || 0);
    if (!departmentId || selectedCourseIds.length === 0) {
      toast.error('Required', 'Select courses and a teaching department.');
      return;
    }

    setIsBulkSaving(true);
    try {
      const responses = await Promise.all(selectedCourseIds.map((courseId) => (
        api.post<{ data: CourseTeachingAssignment }>('/course-teaching-assignments', {
          course_id: courseId,
          department_id: departmentId,
        })
      )));
      const saved = responses.map((response) => response.data.data);
      const savedIds = new Set(saved.map((assignment) => Number(assignment.course_id)));
      updateAssignments([...assignments.filter((assignment) => !savedIds.has(Number(assignment.course_id))), ...saved]);
      setDrafts((prev) => {
        const next = { ...prev };
        selectedCourseIds.forEach((courseId) => {
          next[courseId] = String(departmentId);
        });
        return next;
      });
      setSelectedCourseIds([]);
      toast.success('Saved', 'Selected courses were assigned.');
    } catch {
      toast.error('Error', 'Failed to save selected assignments.');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const selectedCount = selectedCourseIds.length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="p-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4e0a10]/10 text-[#4e0a10]">
                <BookOpen size={22} />
              </span>
              <div>
                <h1 className="font-display text-2xl font-black text-slate-950">Department Course Assignments</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Manage teaching department responsibilities for each course.</p>
              </div>
            </div>
            <div className="border border-[#C9952A]/30 bg-[#C9952A]/10 px-4 py-2 text-sm font-bold text-[#4e0a10]" style={{ borderRadius: 8 }}>
              {filteredCourses.length} courses shown
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_220px_1fr]">
            <select value={courseType} onChange={(e) => setCourseType(e.target.value as CourseQuickFilter)} className="border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A]" style={{ borderRadius: 8 }}>
              <option value="minor">Minor Courses</option>
              <option value="major">Major Courses</option>
              <option value="gec">GEC Courses</option>
              <option value="laboratory">Laboratory Courses</option>
              <option value="field">Field Courses</option>
              <option value="all">All Courses</option>
            </select>
            <select value={assignmentStatus} onChange={(e) => setAssignmentStatus(e.target.value as AssignmentStatusFilter)} className="border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A]" style={{ borderRadius: 8 }}>
              <option value="all">All statuses</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A]" style={{ borderRadius: 8 }}>
              <option value="all">All departments</option>
              <option value="shared">Shared / No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.department_code} - {department.department_name}</option>
              ))}
            </select>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..." className="w-full border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A]" style={{ borderRadius: 8 }} />
            </label>
          </div>
        </div>

        <div className="border-y border-slate-200 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm font-bold text-slate-600">{selectedCount} selected</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={bulkDepartmentId} onChange={(e) => setBulkDepartmentId(e.target.value)} className="min-w-0 border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A] sm:w-80" style={{ borderRadius: 8 }}>
                <option value="">Assign teaching department...</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.department_code} - {department.department_name}</option>
                ))}
              </select>
              <button type="button" onClick={saveSelected} disabled={!bulkDepartmentId || selectedCount === 0 || isBulkSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4e0a10] px-4 py-2 text-sm font-black text-white hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-40">
                <Save size={16} />
                Save Selected
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="w-12 px-4 py-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelectedCourseIds((prev) => e.target.checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id)))} className="h-4 w-4 rounded border-slate-300 text-[#4e0a10] focus:ring-[#C9952A]" />
                  </th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Current College</th>
                  <th className="px-4 py-3">Teaching Department</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}><td colSpan={6} className="px-4 py-5"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>
                  ))
                ) : pagedCourses.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-14 text-center text-sm font-bold text-slate-400">No courses found.</td></tr>
                ) : pagedCourses.map((course) => {
                  const assignedDepartmentId = assignmentMap.get(course.id) ?? course.teaching_assignment?.department_id ?? null;
                  const draftValue = drafts[course.id] ?? '';
                  const teachingDepartment = departments.find((department) => Number(department.id) === Number(assignedDepartmentId));
                  const currentDepartment = isSharedNoDepartmentCourse(course)
                    ? null
                    : course.department ?? departments.find((department) => Number(department.id) === Number(course.department_id));
                  const isSelected = selectedCourseIds.includes(course.id);
                  const hasChanges = String(assignedDepartmentId ?? '') !== draftValue;
                  const hasLab = isLaboratoryCourse(course);
                  const isField = isFieldCourse(course);

                  return (
                    <tr key={course.id} className="align-middle hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSelected} onChange={(e) => setSelectedCourseIds((prev) => e.target.checked ? [...prev, course.id] : prev.filter((id) => id !== course.id))} className="h-4 w-4 rounded border-slate-300 text-[#4e0a10] focus:ring-[#C9952A]" />
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <p className="font-black text-slate-950">{course.course_code}</p>
                        <p className="mt-0.5 text-sm font-medium text-slate-500">{course.course_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{courseTypeLabel(course)}</span>
                          {hasLab && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Laboratory</span>}
                          {isField && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">Field</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-600">
                        {currentDepartment ? `${currentDepartment.department_code} - ${currentDepartment.department_name}` : 'Shared / No department'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="mb-2 text-xs font-bold">
                          {teachingDepartment ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> {teachingDepartment.department_name}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700"><TriangleAlert size={14} /> No Teaching Department</span>
                          )}
                        </div>
                        <select value={draftValue} onChange={(e) => setDrafts((prev) => ({ ...prev, [course.id]: e.target.value }))} className="w-full min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#C9952A]">
                          <option value="">Select teaching department...</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>{department.department_code} - {department.department_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => saveCourse(course.id)} disabled={!draftValue || savingCourseId === course.id || !hasChanges} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4e0a10] px-3 py-2 text-sm font-black text-white hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-40">
                          <Save size={15} />
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-500">
              Page {pageIndex + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPageIndex((page) => Math.max(0, page - 1))} disabled={pageIndex === 0} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft size={16} />
                Previous
              </button>
              <button type="button" onClick={() => setPageIndex((page) => Math.min(totalPages - 1, page + 1))} disabled={pageIndex >= totalPages - 1} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

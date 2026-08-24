import React, { useState } from 'react';
import { CalendarDays, ChevronDown, Plus } from 'lucide-react';
import type { CurriculumCourse, CurriculumTerm, Program } from '../../types/curriculum';
import CourseTable from './CourseTable';
import AddCourseModal from './AddCourseModal';
import EditCourseModal, { type EditCourseFormData } from './EditCourseModal';

interface SemesterCardProps {
  term: CurriculumTerm;
  semesterTerms: CurriculumTerm[];
  selectedYear: number;
  selectedSemester: number;
  yearLevelStats: Record<number, { courses: number; units: number; lec: number; lab: number }>;
  onSelectYear: (year: number) => void;
  onSelectSemester: (semester: number) => void;
  highlightedCourseId: number | null;
  removingCourseId: number | null;
  isRemoving: boolean;
  canEdit?: boolean;
  programs?: Program[];
  onInitiateRemove: (courseId: number) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (courseId: number, courseCode: string) => void;
  onAddCourseToSemester: (
    courses: Array<{
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
  ) => Promise<void>;
  onEditCourse?: (data: EditCourseFormData) => Promise<void>;
}

const semesterLabels: Record<number, string> = {
  1: '1st Semester',
  2: '2nd Semester',
  3: 'Summer Term',
};

export default function SemesterCard({
  term,
  semesterTerms,
  selectedYear,
  selectedSemester,
  yearLevelStats,
  onSelectYear,
  onSelectSemester,
  highlightedCourseId,
  removingCourseId,
  isRemoving,
  canEdit = true,
  programs = [],
  onInitiateRemove,
  onCancelRemove,
  onConfirmRemove,
  onAddCourseToSemester,
  onEditCourse,
}: SemesterCardProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [editingCourse, setEditingCourse] = useState<CurriculumCourse | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleSaveCourses = async (
    courseRequests: Array<{
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
    try {
      await onAddCourseToSemester(courseRequests, yearLevel, semester, onProgress);
    } catch {
      // Handled per-row
    }
  };

  const handleSaveEditedCourse = async (data: EditCourseFormData) => {
    if (!onEditCourse) return;
    setIsEditing(true);
    try {
      await onEditCourse(data);
    } finally {
      setIsEditing(false);
      setEditingCourse(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Semester navigation and table actions */}
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="relative shrink-0">
            <span className="sr-only">Year level</span>
            <select
              value={selectedYear}
              onChange={(event) => onSelectYear(Number(event.target.value))}
              className="h-9 appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-xs font-bold text-[#4e0a10] shadow-sm outline-none transition-colors hover:border-[#C9952A] focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10 cursor-pointer"
            >
              {[1, 2, 3, 4].map((year) => (
                <option key={year} value={year}>
                  {year === 1 ? '1st' : year === 2 ? '2nd' : year === 3 ? '3rd' : '4th'} Year · {yearLevelStats[year]?.units || 0}u
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Semester">
            {semesterTerms.map((semesterTerm) => {
              const isSelected = semesterTerm.semester === selectedSemester;

              return (
                <button
                  key={semesterTerm.semester}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSelectSemester(semesterTerm.semester)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#4e0a10] text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-[#4e0a10]'
                  }`}
                >
                  <CalendarDays size={14} aria-hidden="true" />
                  <span>{semesterLabels[semesterTerm.semester] || `Semester ${semesterTerm.semester}`}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                      isSelected ? 'bg-[#C9952A] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {semesterTerm.totals.tu}u
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 px-1 sm:justify-end">
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
            <span>{term.courses.length} courses</span>
            <span>·</span>
            <span className="text-[#4e0a10] font-bold">{term.totals.tu} units</span>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#4e0a10] text-white hover:bg-[#C9952A] rounded-xl transition-all duration-200 cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              Add Course
            </button>
          )}
        </div>
      </div>

      {/* Course Table */}
      <CourseTable
        courses={term.courses}
        totals={term.totals}
        highlightedCourseId={highlightedCourseId}
        removingCourseId={removingCourseId}
        isRemoving={isRemoving}
        canEdit={canEdit}
        onInitiateEdit={(course) => setEditingCourse(course)}
        onInitiateRemove={onInitiateRemove}
        onCancelRemove={onCancelRemove}
        onConfirmRemove={onConfirmRemove}
      />

      {/* Add Course Modal */}
      {canEdit && (
        <AddCourseModal
          isOpen={isAddOpen}
          yearLevel={term.year_level}
          semester={term.semester}
          onClose={() => setIsAddOpen(false)}
          onSaveCourses={handleSaveCourses}
        />
      )}

      {/* Edit Course Modal */}
      {canEdit && (
        <EditCourseModal
          isOpen={Boolean(editingCourse)}
          course={editingCourse}
          isSubmitting={isEditing}
          programs={programs}
          onClose={() => setEditingCourse(null)}
          onSave={handleSaveEditedCourse}
        />
      )}
    </div>
  );
}

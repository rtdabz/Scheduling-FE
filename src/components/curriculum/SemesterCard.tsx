import React, { useState } from 'react';
import { Calendar, Plus } from 'lucide-react';
import type { CurriculumCourse, CurriculumTerm } from '../../types/curriculum';
import CourseTable from './CourseTable';
import AddCourseModal from './AddCourseModal';
import EditCourseModal, { type EditCourseFormData } from './EditCourseModal';
import type { CourseOption } from './AddCourseForm';

interface SemesterCardProps {
  term: CurriculumTerm;
  availableCourses: CourseOption[];
  highlightedCourseId: number | null;
  removingCourseId: number | null;
  isRemoving: boolean;
  canEdit?: boolean;
  onInitiateRemove: (courseId: number) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (courseId: number, courseCode: string) => void;
  onAddCourseToSemester: (
    courses: Array<{
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
    }>,
    yearLevel: number,
    semester: number
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
  availableCourses,
  highlightedCourseId,
  removingCourseId,
  isRemoving,
  canEdit = true,
  onInitiateRemove,
  onCancelRemove,
  onConfirmRemove,
  onAddCourseToSemester,
  onEditCourse,
}: SemesterCardProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [editingCourse, setEditingCourse] = useState<CurriculumCourse | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleSaveCourses = async (
    courseRequests: Array<{
      courseCode: string;
      courseName: string;
      courseCategory: 'major' | 'minor';
      lecUnits: number;
      labUnits: number;
    }>,
    yearLevel: number,
    semester: number
  ) => {
    setIsAdding(true);
    try {
      await onAddCourseToSemester(courseRequests, yearLevel, semester);
    } finally {
      setIsAdding(false);
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
      {/* Header */}
      <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Calendar size={16} className="text-[#C9952A]" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
            {semesterLabels[term.semester] || `Semester ${term.semester}`}
          </h3>
        </div>

        <div className="flex items-center gap-4">
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
          isSubmitting={isAdding}
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
          onClose={() => setEditingCourse(null)}
          onSave={handleSaveEditedCourse}
        />
      )}
    </div>
  );
}

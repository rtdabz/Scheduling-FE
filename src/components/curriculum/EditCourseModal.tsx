import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import Modal from '../ui/Modal';
import { ModalButton, ModalField, ModalNotice } from '../ui/ModalForm';
import { modalBody, modalControl, modalLabel } from '../ui/modalStyles';
import type { CurriculumCourse, Program } from '../../types/curriculum';
import { formatCourseName } from '../../lib/formatters';
import { programLabel } from '../../lib/programLabel';

export interface EditCourseFormData {
  courseId: number;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: number;
  labUnits: number;
  programId: number | null;
}

interface EditCourseModalProps {
  isOpen: boolean;
  course: CurriculumCourse | null;
  isSubmitting: boolean;
  programs?: Program[];
  onClose: () => void;
  onSave: (data: EditCourseFormData) => Promise<void>;
}

export default function EditCourseModal({
  isOpen,
  course,
  isSubmitting,
  programs = [],
  onClose,
  onSave,
}: EditCourseModalProps) {
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseCategory, setCourseCategory] = useState<'major' | 'minor'>('major');
  const [lecUnits, setLecUnits] = useState('');
  const [labUnits, setLabUnits] = useState('');
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (course && isOpen) {
      setCourseCode(course.code || '');
      setCourseName(course.title || '');
      const cat = String(course.category || '').toLowerCase().trim();
      setCourseCategory(cat === 'minor' ? 'minor' : 'major');
      setLecUnits(course.lec_units == null ? '' : String(course.lec_units).padStart(2, '0'));
      setLabUnits(course.lab_units == null ? '' : String(course.lab_units).padStart(2, '0'));
      setProgramId(course.program_id ? String(course.program_id) : '');
      setError(null);
    }
  }, [course, isOpen]);

  if (!isOpen || !course) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = courseCode.replace(/\s+/g, ' ').trim().toUpperCase();
    const formattedName = formatCourseName(courseName);

    if (!trimmedCode || !formattedName) {
      if (!trimmedCode && !formattedName) setError('Course Code and Course Name are required');
      else if (!trimmedCode) setError('Course Code is required');
      else setError('Course Name is required');
      return;
    }

    if (!lecUnits.trim() || !labUnits.trim()) {
      if (!lecUnits.trim() && !labUnits.trim()) setError('LEC Units and LAB Units are required');
      else if (!lecUnits.trim()) setError('LEC Units is required');
      else setError('LAB Units is required');
      return;
    }

    setError(null);

    await onSave({
      courseId: course.id,
      courseCode: trimmedCode,
      courseName: formattedName,
      courseCategory,
      lecUnits: Number(lecUnits),
      labUnits: Number(labUnits),
      programId: courseCategory === 'major' && programId ? Number(programId) : null,
    });

    onClose();
  };

  const totalUnits = (Number(lecUnits) || 0) + (Number(labUnits) || 0);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit Course"
      description="Update the course code, name, category, and units."
      icon={<Pencil size={18} />}
      closeOnOverlayClick={false}
      closeOnEscape={!isSubmitting}
      footer={<>
        <ModalButton onClick={onClose} disabled={isSubmitting}>Cancel</ModalButton>
        <ModalButton type="submit" form="edit-course-form" variant="primary" loading={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </ModalButton>
      </>}
    >
      <form id="edit-course-form" onSubmit={handleSubmit} className={modalBody}>
        {error && <ModalNotice tone="error" role="alert">{error}</ModalNotice>}

        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <ModalField label="Course Code" htmlFor="edit-course-code" required>
            <input
              id="edit-course-code"
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              onBlur={() => setCourseCode(courseCode.replace(/\s+/g, ' ').trim().toUpperCase())}
              placeholder="e.g. IT 101"
              className={`${modalControl()} font-semibold uppercase placeholder:normal-case`}
            />
          </ModalField>

          <ModalField label="Course Name" htmlFor="edit-course-name" required>
            <input
              id="edit-course-name"
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              onBlur={() => setCourseName(formatCourseName(courseName))}
              placeholder="e.g. Data Structures and Algorithms"
              className={modalControl()}
            />
          </ModalField>
        </div>

        <ModalField label="Category" htmlFor="edit-course-category">
          <select
            id="edit-course-category"
            value={courseCategory}
            onChange={(e) => setCourseCategory(e.target.value as 'major' | 'minor')}
            className={modalControl()}
          >
            <option value="major">Major Course</option>
            <option value="minor">Minor Course</option>
          </select>
        </ModalField>

        {courseCategory === 'major' && (
          <ModalField
            label="Program / Major"
            htmlFor="edit-course-program"
            hint="Once set, only instructors belonging to this program can be assigned to teach it."
          >
            <select
              id="edit-course-program"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className={modalControl()}
            >
              <option value="">Not program-specific</option>
              {programs.map((program) => (
                <option key={program.id} value={String(program.id)}>
                  {programLabel(program)}
                </option>
              ))}
            </select>
          </ModalField>
        )}

        <div className="grid grid-cols-3 gap-3">
          <ModalField label="LEC Units" htmlFor="edit-course-lec" required>
            <input
              id="edit-course-lec"
              type="number"
              min="0"
              max="99"
              step="1"
              value={lecUnits}
              onChange={(e) => setLecUnits(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="0"
              className={`${modalControl()} text-center font-semibold tabular-nums`}
            />
          </ModalField>

          <ModalField label="LAB Units" htmlFor="edit-course-lab" required>
            <input
              id="edit-course-lab"
              type="number"
              min="0"
              max="99"
              step="1"
              value={labUnits}
              onChange={(e) => setLabUnits(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="0"
              className={`${modalControl()} text-center font-semibold tabular-nums`}
            />
          </ModalField>

          <div>
            <span className={modalLabel}>Total Units</span>
            <div className="flex h-10 items-center justify-center rounded-lg bg-[#4e0a10]/10 px-2 text-sm font-bold tabular-nums text-[#4e0a10]">
              {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

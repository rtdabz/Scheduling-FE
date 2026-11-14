import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { ModalButton } from '../ui/ModalForm';
import { modalControl, modalLabel } from '../ui/modalStyles';
import { X, Plus, BookOpen, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import TableActionButton from '../ui/TableActionButton';
import { formatCourseName } from '../../lib/formatters';

export interface ManualCourseRowRequest {
  rowId: string;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: string;
  labUnits: string;
  error?: string;
  saveStatus?: 'idle' | 'saving' | 'success' | 'error';
}

type CoursePayload = {
  rowId: string;
  courseCode: string;
  courseName: string;
  courseCategory: 'major' | 'minor';
  lecUnits: number;
  labUnits: number;
};

interface AddCourseModalProps {
  isOpen: boolean;
  yearLevel: number;
  semester: number;
  onClose: () => void;
  onSaveCourses: (
    courses: CoursePayload[],
    yearLevel: number,
    semester: number,
    onProgress: (rowId: string, status: 'saving' | 'success' | 'error', errorMsg?: string) => void
  ) => Promise<void>;
}

const semesterNames: Record<number, string> = {
  1: '1st Semester',
  2: '2nd Semester',
  3: 'Summer',
};

const yearNames: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

const ROW_GRID = 'md:grid-cols-[1.5rem_7.5rem_minmax(0,1fr)_6.5rem_4rem_4rem_3rem_3.5rem]';

const MOBILE_LABEL = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 md:sr-only';

const emptyRow = (): ManualCourseRowRequest => ({
  rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  courseCode: '',
  courseName: '',
  courseCategory: 'major',
  lecUnits: '',
  labUnits: '',
  saveStatus: 'idle',
});

const normalizeCode = (code: string) => code.split(' ').filter(Boolean).join(' ').toUpperCase();

const missingFieldsError = (row: ManualCourseRowRequest): string | undefined => {
  const missing = [
    !row.courseCode.trim() && 'course code',
    !row.courseName.trim() && 'course name',
    !row.lecUnits.trim() && 'LEC units',
    !row.labUnits.trim() && 'LAB units',
  ].filter(Boolean) as string[];
  if (missing.length === 0) return undefined;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${missing.length === 1 ? 'is' : 'are'} required`;
};

const toPayload = (row: ManualCourseRowRequest): CoursePayload => ({
  rowId: row.rowId,
  courseCode: normalizeCode(row.courseCode),
  courseName: formatCourseName(row.courseName),
  courseCategory: row.courseCategory,
  lecUnits: Number(row.lecUnits),
  labUnits: Number(row.labUnits),
});

export default function AddCourseModal({
  isOpen,
  yearLevel,
  semester,
  onClose,
  onSaveCourses,
}: AddCourseModalProps) {
  const [rows, setRows] = useState<ManualCourseRowRequest[]>([emptyRow()]);

  const isSaving = rows.some((r) => r.saveStatus === 'saving');
  const allSuccessful = rows.length > 0 && rows.every((r) => r.saveStatus === 'success');

  useEffect(() => {
    if (isOpen) setRows([emptyRow()]);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !allSuccessful) return;
    const timer = setTimeout(onClose, 800);
    return () => clearTimeout(timer);
  }, [allSuccessful, isOpen, onClose]);

  if (!isOpen) return null;

  const patchRow = (rowId: string, patch: Partial<ManualCourseRowRequest>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const onProgress = (rowId: string, status: 'saving' | 'success' | 'error', errorMsg?: string) =>
    patchRow(rowId, { saveStatus: status, error: errorMsg });

  const handleAddRow = () => setRows((prev) => [...prev, emptyRow()]);

  const handleRemoveRow = (rowId: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : prev));

  const handleTextChange = (row: ManualCourseRowRequest, field: 'courseCode' | 'courseName', value: string) => {
    const updated = { ...row, [field]: value };
    patchRow(row.rowId, { [field]: value, error: row.error ? missingFieldsError(updated) : undefined });
  };

  const handleTextBlur = (row: ManualCourseRowRequest, field: 'courseCode' | 'courseName') =>
    patchRow(row.rowId, { [field]: field === 'courseName' ? formatCourseName(row.courseName) : normalizeCode(row.courseCode) });

  const handleUnitChange = (row: ManualCourseRowRequest, field: 'lecUnits' | 'labUnits', value: string) => {
    const digits = [...value].filter((ch) => ch >= '0' && ch <= '9').join('').slice(0, 2);
    const updated = { ...row, [field]: digits };
    patchRow(row.rowId, { [field]: digits, error: row.error ? missingFieldsError(updated) : undefined });
  };

  const handleRetryRow = async (row: ManualCourseRowRequest) => {
    const error = missingFieldsError(row);
    if (error) {
      patchRow(row.rowId, { error });
      return;
    }
    patchRow(row.rowId, { error: undefined, saveStatus: 'saving' });
    try {
      await onSaveCourses([toPayload(row)], yearLevel, semester, onProgress);
    } catch {
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (allSuccessful) {
      onClose();
      return;
    }

    const validatedRows = rows.map((r) => (r.saveStatus === 'success' ? r : { ...r, error: missingFieldsError(r) }));
    setRows(validatedRows);
    if (validatedRows.some((r) => r.saveStatus !== 'success' && r.error)) return;

    const rowsToSave = validatedRows.filter((r) => r.saveStatus !== 'success');
    if (rowsToSave.length === 0) return;

    setRows((prev) => prev.map((r) => (r.saveStatus !== 'success' ? { ...r, saveStatus: 'saving', error: undefined } : r)));
    try {
      await onSaveCourses(rowsToSave.map(toPayload), yearLevel, semester, onProgress);
    } catch {
    }
  };

  const pendingRows = rows.filter((r) => r.saveStatus !== 'success');
  const totalUnits = pendingRows.reduce((sum, r) => sum + (Number(r.lecUnits) || 0) + (Number(r.labUnits) || 0), 0);
  const pendingCount = pendingRows.length;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add Courses"
      description={`${yearNames[yearLevel] || `Year ${yearLevel}`} · ${semesterNames[semester] || `Semester ${semester}`}`}
      icon={<BookOpen size={18} />}
      size="wide"
      busy={isSaving}
      closeLabel="Close"
      closeOnOverlayClick={false}
      bodyClassName="flex flex-col"
    >
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={`${modalLabel} mb-0`}>Courses</span>
              <span className="text-xs text-slate-500">Lec and Lab are credit units</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className={`hidden gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid ${ROW_GRID}`}>
                <span>#</span>
                <span>Code <span className="text-red-500">*</span></span>
                <span>Course name <span className="text-red-500">*</span></span>
                <span>Category</span>
                <span className="text-center">Lec <span className="text-red-500">*</span></span>
                <span className="text-center">Lab <span className="text-red-500">*</span></span>
                <span className="text-center">Units</span>
                <span className="text-right">Actions</span>
              </div>

              <ul className="divide-y divide-slate-100">
                {rows.map((row, index) => {
                  const isLocked = row.saveStatus === 'success' || row.saveStatus === 'saving';
                  const n = index + 1;
                  const flagged = (value: string) => !!row.error && row.saveStatus !== 'error' && !value.trim();
                  const units = (Number(row.lecUnits) || 0) + (Number(row.labUnits) || 0);
                  return (
                    <li
                      key={row.rowId}
                      className={`grid grid-cols-6 items-start gap-x-3 gap-y-2 px-3 py-3 transition-colors ${ROW_GRID} ${
                        row.saveStatus === 'success' ? 'bg-emerald-50/50' : row.saveStatus === 'error' ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <span className="hidden h-10 items-center text-xs font-bold tabular-nums text-slate-400 md:flex">{n}</span>

                      <div className="order-1 col-span-3 md:order-none md:col-span-1">
                        <label htmlFor={`${row.rowId}-code`} className={MOBILE_LABEL}>Code <span className="text-red-500">*</span></label>
                        <input
                          id={`${row.rowId}-code`}
                          type="text"
                          value={row.courseCode}
                          disabled={isLocked}
                          onChange={(e) => handleTextChange(row, 'courseCode', e.target.value)}
                          onBlur={() => handleTextBlur(row, 'courseCode')}
                          placeholder="IT 101"
                          className={`${modalControl(flagged(row.courseCode))} font-semibold uppercase placeholder:normal-case`}
                        />
                      </div>

                      <div className="order-3 col-span-6 min-w-0 md:order-none md:col-span-1">
                        <label htmlFor={`${row.rowId}-name`} className={MOBILE_LABEL}>Course name <span className="text-red-500">*</span></label>
                        <input
                          id={`${row.rowId}-name`}
                          type="text"
                          value={row.courseName}
                          disabled={isLocked}
                          onChange={(e) => handleTextChange(row, 'courseName', e.target.value)}
                          onBlur={() => handleTextBlur(row, 'courseName')}
                          placeholder="e.g. Data Structures and Algorithms"
                          className={`${modalControl(flagged(row.courseName))}`}
                        />
                      </div>

                      <div className="order-2 col-span-3 md:order-none md:col-span-1">
                        <label htmlFor={`${row.rowId}-category`} className={MOBILE_LABEL}>Category</label>
                        <select
                          id={`${row.rowId}-category`}
                          value={row.courseCategory}
                          disabled={isLocked}
                          onChange={(e) => patchRow(row.rowId, { courseCategory: e.target.value as 'major' | 'minor' })}
                          className={`${modalControl()} px-2.5`}
                        >
                          <option value="major">Major</option>
                          <option value="minor">Minor</option>
                        </select>
                      </div>

                      {(['lecUnits', 'labUnits'] as const).map((field) => (
                        <div key={field} className="order-4 col-span-2 md:order-none md:col-span-1">
                          <label htmlFor={`${row.rowId}-${field}`} className={MOBILE_LABEL}>
                            {field === 'lecUnits' ? 'Lec' : 'Lab'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id={`${row.rowId}-${field}`}
                            type="text"
                            inputMode="numeric"
                            value={row[field]}
                            disabled={isLocked}
                            onChange={(e) => handleUnitChange(row, field, e.target.value)}
                            placeholder="0"
                            className={`${modalControl(flagged(row[field]))} px-2 text-center font-semibold tabular-nums`}
                          />
                        </div>
                      ))}

                      <div className="order-4 col-span-1 md:order-none">
                        <span className={MOBILE_LABEL}>Units</span>
                        <span className="flex h-10 items-center justify-center text-sm font-bold tabular-nums text-[#4e0a10]" title="Total units">
                          {units}
                        </span>
                      </div>

                      <div className="order-4 col-span-1 flex h-10 items-center justify-end self-end md:order-none md:self-start">
                        {row.saveStatus === 'saving' ? (
                          <LoadingSpinner size={16} className="animate-spin text-[#C9952A]" />
                        ) : row.saveStatus === 'success' ? (
                          <CheckCircle2 size={18} className="text-emerald-600" aria-label="Saved" />
                        ) : row.saveStatus === 'error' ? (
                          <TableActionButton label="Retry" aria-label={`Retry saving course ${n}`} variant="view" onClick={() => handleRetryRow(row)}>
                            <RefreshCw size={15} />
                          </TableActionButton>
                        ) : (
                          <TableActionButton label="Remove" aria-label={`Remove course ${n}`} variant="remove" onClick={() => handleRemoveRow(row.rowId)} disabled={rows.length <= 1}>
                            <X size={15} />
                          </TableActionButton>
                        )}
                      </div>

                      {row.error && (
                        <p className="order-5 col-span-6 flex items-center gap-1.5 text-xs font-semibold text-red-600 md:order-none md:col-start-2">
                          <AlertCircle size={13} className="shrink-0" />
                          {row.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={handleAddRow}
                disabled={allSuccessful || isSaving}
                className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-semibold text-[#8a5a12] transition hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus size={16} />
                Add another course
              </button>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <p className="text-xs text-slate-500">
              {allSuccessful
                ? 'All courses saved.'
                : `${pendingCount} course${pendingCount === 1 ? '' : 's'}, ${totalUnits} unit${totalUnits === 1 ? '' : 's'} to add`}
            </p>
            <div className="flex justify-end gap-2.5">
              <ModalButton onClick={onClose} disabled={isSaving}>Cancel</ModalButton>
              <ModalButton type="submit" variant="primary" loading={isSaving} disabled={allSuccessful}>
                {isSaving ? 'Saving...' : pendingCount === 1 ? 'Save course' : `Save ${pendingCount} courses`}
              </ModalButton>
            </div>
          </footer>
        </form>
    </Modal>
  );
}

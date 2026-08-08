import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Plus, Loader2 } from 'lucide-react';

export interface CourseOption {
  id: number;
  course_code: string;
  course_name: string;
  course_category?: 'major' | 'minor';
  units: number;
  lecture_hours: number;
  lab_hours: number;
}

interface AddCourseFormProps {
  availableCourses: CourseOption[];
  isAdding: boolean;
  onAddCourse: (courseId: number) => Promise<void>;
  onAddCourseWithTarget?: (courseId: number, yearLevel: number, term: number) => Promise<void>;
  initialYearLevel?: number;
  initialTerm?: number;
  showYearTermSelectors?: boolean;
  onCancel?: () => void;
}

export default function AddCourseForm({
  availableCourses,
  isAdding,
  onAddCourse,
  onAddCourseWithTarget,
  initialYearLevel = 1,
  initialTerm = 1,
  showYearTermSelectors = false,
  onCancel,
}: AddCourseFormProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [searchVal, setSearchVal] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [yearLevel, setYearLevel] = useState<number>(initialYearLevel);
  const [term, setTerm] = useState<number>(initialTerm);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setYearLevel(initialYearLevel);
    setTerm(initialTerm);
  }, [initialYearLevel, initialTerm]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = searchVal.trim()
    ? availableCourses.filter(
        (c) =>
          c.course_code.toLowerCase().includes(searchVal.toLowerCase()) ||
          c.course_name.toLowerCase().includes(searchVal.toLowerCase())
      ).slice(0, 40)
    : availableCourses.slice(0, 40);

  const selectedCourse = availableCourses.find((c) => c.id === selectedCourseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;
    if (showYearTermSelectors && onAddCourseWithTarget) {
      await onAddCourseWithTarget(selectedCourseId, yearLevel, term);
    } else {
      await onAddCourse(selectedCourseId);
    }
    setSelectedCourseId(null);
    setSearchVal('');
    setIsDropdownOpen(false);
  };

  return (
    <div className="bg-[#4e0a10]/[0.02] border-t border-[#C9952A]/20 p-4 font-sans">
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Optional Year Level & Term Selectors */}
        {showYearTermSelectors && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={yearLevel}
              onChange={(e) => setYearLevel(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-bold text-gray-700 outline-none focus:ring-1 focus:ring-[#C9952A]"
            >
              <option value={1}>Year 1</option>
              <option value={2}>Year 2</option>
              <option value={3}>Year 3</option>
              <option value={4}>Year 4</option>
            </select>

            <select
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-bold text-gray-700 outline-none focus:ring-1 focus:ring-[#C9952A]"
            >
              <option value={1}>1st Semester</option>
              <option value={2}>2nd Semester</option>
              <option value={3}>Summer Term</option>
            </select>
          </div>
        )}

        {/* Combobox Dropdown */}
        <div className="relative flex-1" ref={dropdownRef}>
          <div
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3.5 py-2 border border-gray-300 rounded-xl text-xs bg-white cursor-pointer hover:border-[#C9952A] transition-colors shadow-sm"
          >
            <span className={selectedCourse ? 'text-gray-900 font-bold' : 'text-gray-400'}>
              {selectedCourse
                ? `${selectedCourse.course_code} — ${selectedCourse.course_name}`
                : 'Select course to add to curriculum...'}
            </span>
            <Search size={14} className="text-gray-400" />
          </div>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
              <div className="p-2 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchVal}
                    onChange={(e) => setSearchVal(e.target.value)}
                    placeholder="Type course code or name..."
                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#C9952A]"
                    autoFocus
                  />
                  {searchVal && (
                    <button
                      type="button"
                      onClick={() => setSearchVal('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {filteredOptions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">
                    {availableCourses.length === 0
                      ? 'All available courses are already added'
                      : 'No courses match your search'}
                  </div>
                ) : (
                  filteredOptions.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between ${
                        selectedCourseId === course.id ? 'bg-[#C9952A]/10 font-bold' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-[#C9952A]/10 text-[#C9952A] px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                          {course.course_code}
                        </span>
                        <span className="text-gray-800">{course.course_name}</span>
                      </div>
                      <span className="text-gray-400 text-[10px] font-bold">{course.units}u</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Course Units Preview */}
        {selectedCourse && (
          <div className="flex items-center gap-3 text-xs text-gray-600 px-2 py-1 bg-gray-100 rounded-lg shrink-0">
            <span>Lec: <strong>{selectedCourse.lecture_hours}</strong></span>
            <span>Lab: <strong>{selectedCourse.lab_hours}</strong></span>
            <span className="text-[#4e0a10]">Total: <strong>{selectedCourse.units}u</strong></span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={!selectedCourseId || isAdding}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#4e0a10] hover:bg-[#C9952A] text-white text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-40 shadow-sm"
          >
            {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Course
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 border border-gray-200 text-gray-500 hover:bg-gray-100 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

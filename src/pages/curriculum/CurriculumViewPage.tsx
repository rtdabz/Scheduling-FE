import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export interface CurriculumMapCourse {
  id: string;
  courseCode: string;
  courseName: string;
  lec: number;
  lab: number;
  units: number;
  category: 'major' | 'gec' | 'gee' | 'pathfit' | 'nstp';
  yearLevel: number; // 1..4
  term: number; // 1 (1st Sem), 2 (2nd Sem), 3 (Summer)
  program: 'BSIT' | 'BSCS' | 'BSHM';
}

const PROGRAM_TARGET_UNITS: Record<string, number> = {
  BSIT: 144,
  BSCS: 140,
  BSHM: 148,
};

const CATEGORY_STYLES: Record<
  CurriculumMapCourse['category'],
  { border: string; bg: string; text: string; badge: string; label: string }
> = {
  major: {
    border: 'border-l-4 border-blue-500',
    bg: 'bg-blue-50/70',
    text: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    label: 'MAJOR',
  },
  gec: {
    border: 'border-l-4 border-emerald-500',
    bg: 'bg-emerald-50/70',
    text: 'text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'GEC',
  },
  gee: {
    border: 'border-l-4 border-purple-500',
    bg: 'bg-purple-50/70',
    text: 'text-purple-900',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    label: 'GEE',
  },
  pathfit: {
    border: 'border-l-4 border-orange-500',
    bg: 'bg-orange-50/70',
    text: 'text-orange-900',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    label: 'PATHFIT',
  },
  nstp: {
    border: 'border-l-4 border-yellow-500',
    bg: 'bg-yellow-50/70',
    text: 'text-yellow-900',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    label: 'NSTP',
  },
};

const INITIAL_MOCK_COURSES: CurriculumMapCourse[] = [
  // BSIT Year 1
  { id: '1', courseCode: 'IT 101', courseName: 'Introduction to Computing', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 1, program: 'BSIT' },
  { id: '2', courseCode: 'IT 102', courseName: 'Computer Programming 1', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 1, program: 'BSIT' },
  { id: '3', courseCode: 'GEC 1', courseName: 'Understanding the Self', lec: 3, lab: 0, units: 3, category: 'gec', yearLevel: 1, term: 1, program: 'BSIT' },
  { id: '4', courseCode: 'PATHFIT 1', courseName: 'Movement Competency Training', lec: 2, lab: 0, units: 2, category: 'pathfit', yearLevel: 1, term: 1, program: 'BSIT' },
  { id: '5', courseCode: 'NSTP 1', courseName: 'National Service Training Program 1', lec: 3, lab: 0, units: 3, category: 'nstp', yearLevel: 1, term: 1, program: 'BSIT' },

  { id: '6', courseCode: 'IT 103', courseName: 'Computer Programming 2', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 2, program: 'BSIT' },
  { id: '7', courseCode: 'IT 104', courseName: 'Data Structures & Algorithms', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 2, program: 'BSIT' },
  { id: '8', courseCode: 'GEC 2', courseName: 'Readings in Philippine History', lec: 3, lab: 0, units: 3, category: 'gec', yearLevel: 1, term: 2, program: 'BSIT' },
  { id: '9', courseCode: 'PATHFIT 2', courseName: 'Fitness Training', lec: 2, lab: 0, units: 2, category: 'pathfit', yearLevel: 1, term: 2, program: 'BSIT' },
  { id: '10', courseCode: 'NSTP 2', courseName: 'National Service Training Program 2', lec: 3, lab: 0, units: 3, category: 'nstp', yearLevel: 1, term: 2, program: 'BSIT' },

  // BSIT Year 2
  { id: '11', courseCode: 'IT 201', courseName: 'Database Management Systems 1', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 2, term: 1, program: 'BSIT' },
  { id: '12', courseCode: 'IT 202', courseName: 'Object-Oriented Programming', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 2, term: 1, program: 'BSIT' },
  { id: '13', courseCode: 'GEC 3', courseName: 'The Contemporary World', lec: 3, lab: 0, units: 3, category: 'gec', yearLevel: 2, term: 1, program: 'BSIT' },
  { id: '14', courseCode: 'PATHFIT 3', courseName: 'Individual/Dual Sports', lec: 2, lab: 0, units: 2, category: 'pathfit', yearLevel: 2, term: 1, program: 'BSIT' },

  { id: '15', courseCode: 'IT 203', courseName: 'Web Systems & Technologies', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 2, term: 2, program: 'BSIT' },
  { id: '16', courseCode: 'IT 204', courseName: 'Networking 1', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 2, term: 2, program: 'BSIT' },
  { id: '17', courseCode: 'GEC 4', courseName: 'Mathematics in the Modern World', lec: 3, lab: 0, units: 3, category: 'gec', yearLevel: 2, term: 2, program: 'BSIT' },
  { id: '18', courseCode: 'PATHFIT 4', courseName: 'Team Sports', lec: 2, lab: 0, units: 2, category: 'pathfit', yearLevel: 2, term: 2, program: 'BSIT' },

  { id: '19', courseCode: 'IT 205', courseName: 'Summer Industry Immersion', lec: 0, lab: 9, units: 3, category: 'major', yearLevel: 2, term: 3, program: 'BSIT' },

  // BSIT Year 3
  { id: '20', courseCode: 'IT 301', courseName: 'Systems Integration & Architecture', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 3, term: 1, program: 'BSIT' },
  { id: '21', courseCode: 'IT 302', courseName: 'Information Assurance & Security', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 3, term: 1, program: 'BSIT' },
  { id: '22', courseCode: 'GEE 1', courseName: 'Elective: Technopreneurship', lec: 3, lab: 0, units: 3, category: 'gee', yearLevel: 3, term: 1, program: 'BSIT' },

  { id: '23', courseCode: 'IT 303', courseName: 'Capstone Project 1', lec: 3, lab: 0, units: 3, category: 'major', yearLevel: 3, term: 2, program: 'BSIT' },
  { id: '24', courseCode: 'IT 304', courseName: 'Mobile Application Development', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 3, term: 2, program: 'BSIT' },
  { id: '25', courseCode: 'GEE 2', courseName: 'Elective: Data Science Basics', lec: 3, lab: 0, units: 3, category: 'gee', yearLevel: 3, term: 2, program: 'BSIT' },

  // BSIT Year 4
  { id: '26', courseCode: 'IT 401', courseName: 'Capstone Project 2', lec: 3, lab: 0, units: 3, category: 'major', yearLevel: 4, term: 1, program: 'BSIT' },
  { id: '27', courseCode: 'IT 402', courseName: 'System Administration & Maintenance', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 4, term: 1, program: 'BSIT' },
  { id: '28', courseCode: 'IT 403', courseName: 'On-the-Job Training / Internship (480 hrs)', lec: 0, lab: 18, units: 6, category: 'major', yearLevel: 4, term: 2, program: 'BSIT' },

  // BSCS Mock Courses
  { id: '101', courseCode: 'CS 101', courseName: 'Discrete Structures 1', lec: 3, lab: 0, units: 3, category: 'major', yearLevel: 1, term: 1, program: 'BSCS' },
  { id: '102', courseCode: 'CS 102', courseName: 'Programming Fundamentals', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 1, program: 'BSCS' },
  { id: '103', courseCode: 'CS 103', courseName: 'Object Oriented Programming', lec: 2, lab: 3, units: 3, category: 'major', yearLevel: 1, term: 2, program: 'BSCS' },
  { id: '104', courseCode: 'CS 201', courseName: 'Algorithms & Complexity', lec: 3, lab: 0, units: 3, category: 'major', yearLevel: 2, term: 1, program: 'BSCS' },
  { id: '105', courseCode: 'CS 301', courseName: 'Automata Theory & Formal Languages', lec: 3, lab: 0, units: 3, category: 'major', yearLevel: 3, term: 1, program: 'BSCS' },
];

export default function CurriculumViewPage() {
  const [selectedProgram, setSelectedProgram] = useState<'BSIT' | 'BSCS' | 'BSHM'>('BSIT');
  const [courses] = useState<CurriculumMapCourse[]>(INITIAL_MOCK_COURSES);

  // Popover detail modal for selected chip
  const [selectedChip, setSelectedChip] = useState<CurriculumMapCourse | null>(null);

  // Filter courses by active program
  const programCourses = useMemo(() => {
    return courses.filter((c) => c.program === selectedProgram);
  }, [courses, selectedProgram]);

  // Overall statistics for active program
  const stats = useMemo(() => {
    const totalCourses = programCourses.length;
    const totalUnits = programCourses.reduce((sum, c) => sum + c.units, 0);
    const targetUnits = PROGRAM_TARGET_UNITS[selectedProgram] || 144;
    const isComplete = totalUnits >= targetUnits;
    const missingUnits = Math.max(0, targetUnits - totalUnits);

    return {
      totalCourses,
      totalUnits,
      targetUnits,
      isComplete,
      missingUnits,
    };
  }, [programCourses, selectedProgram]);

  return (
    <div className="space-y-6 font-sans pb-12 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold mb-1">
            <span>Home</span>
            <ChevronRight size={12} />
            <span className="text-[#4e0a10] font-bold">Curriculum View</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1A1410] font-display">Curriculum View</h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            View program of study by year and term (CMO prescribed format)
          </p>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-3">
          {/* Program Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Program:</span>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value as 'BSIT' | 'BSCS' | 'BSHM')}
              className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white text-gray-800 outline-none focus:ring-2 focus:ring-[#C9952A] cursor-pointer shadow-xs"
            >
              <option value="BSIT">BSIT (Information Tech)</option>
              <option value="BSCS">BSCS (Computer Science)</option>
              <option value="BSHM">BSHM (Hospitality Mgmt)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-4 font-sans">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[#4e0a10]" />
            <span className="text-gray-500 font-semibold">Total Courses:</span>
            <span className="font-extrabold text-gray-900 text-sm">{stats.totalCourses}</span>
          </div>

          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#C9952A]" />
            <span className="text-gray-500 font-semibold">Total Units:</span>
            <span className="font-extrabold text-gray-900 text-sm">
              {stats.totalUnits} <span className="text-xs text-gray-400 font-medium">/ {stats.targetUnits}u</span>
            </span>
          </div>

          {/* Program Completion Check */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-semibold">Completion Check:</span>
            {stats.isComplete ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                <CheckCircle2 size={13} className="text-emerald-500" />
                Complete ({stats.totalUnits}u)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-800">
                <AlertCircle size={13} className="text-amber-500" />
                {stats.missingUnits} units missing
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-bold flex-wrap">
          <span className="text-gray-400 uppercase">Categories:</span>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">Major</span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">GEC</span>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">GEE</span>
          <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">PATHFIT</span>
          <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-200">NSTP</span>
        </div>
      </div>

      {/* Curriculum Map Grid Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden font-sans">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100/80 border-b border-gray-200 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                <th className="py-3.5 px-4 text-left w-36 sticky left-0 z-20 bg-slate-100 border-r border-gray-200">
                  Year Level
                </th>
                <th className="py-3.5 px-4 text-center w-1/3 sticky top-0 bg-slate-100 border-r border-gray-200">
                  1st Semester
                </th>
                <th className="py-3.5 px-4 text-center w-1/3 sticky top-0 bg-slate-100 border-r border-gray-200">
                  2nd Semester
                </th>
                <th className="py-3.5 px-4 text-center w-1/3 sticky top-0 bg-slate-100">
                  Summer Term
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {[1, 2, 3, 4].map((yearLevel) => (
                <tr key={yearLevel} className="hover:bg-slate-50/40 transition-colors">
                  {/* Sticky Row Label */}
                  <td className="p-4 font-extrabold text-slate-800 text-sm bg-slate-50 border-r border-gray-200 sticky left-0 z-10 align-top">
                    <div className="flex flex-col justify-between h-full">
                      <span>Year {yearLevel}</span>
                      <span className="text-[10px] font-semibold text-gray-400 mt-2 block">
                        {yearLevel === 1
                          ? 'Freshman'
                          : yearLevel === 2
                          ? 'Sophomore'
                          : yearLevel === 3
                          ? 'Junior'
                          : 'Senior'}
                      </span>
                    </div>
                  </td>

                  {/* 3 Term Columns: 1st Sem, 2nd Sem, Summer */}
                  {[1, 2, 3].map((term) => {
                    const cellCourses = programCourses.filter(
                      (c) => c.yearLevel === yearLevel && c.term === term
                    );
                    const cellUnits = cellCourses.reduce((sum, c) => sum + c.units, 0);

                    // Summer special check
                    const isSummerNoCourses = term === 3 && cellCourses.length === 0;

                    return (
                      <td key={term} className="p-3 align-top border-r border-gray-200 last:border-r-0">
                        {isSummerNoCourses ? (
                          <div className="h-full min-h-[140px] rounded-xl border border-gray-200 bg-gray-50/50 p-4 flex flex-col items-center justify-center text-center">
                            <Info className="w-5 h-5 text-gray-400 mb-1" />
                            <span className="text-xs font-semibold text-gray-400">No summer term</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">Not required for Year {yearLevel}</span>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 flex flex-col justify-between min-h-[160px] shadow-xs">
                            {/* Course Chips Stack */}
                            <div className="space-y-2">
                              {cellCourses.length === 0 ? (
                                <div className="p-4 text-center border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                                  No courses listed
                                </div>
                              ) : (
                                cellCourses.map((course) => {
                                  const style = CATEGORY_STYLES[course.category] || CATEGORY_STYLES.major;
                                  return (
                                    <button
                                      key={course.id}
                                      type="button"
                                      onClick={() => setSelectedChip(course)}
                                      className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between gap-2 shadow-2xs hover:shadow-sm hover:scale-[1.01] transition-all cursor-pointer ${style.border} ${style.bg} ${style.text}`}
                                    >
                                      <div className="min-w-0">
                                        <div className="font-extrabold text-xs tracking-tight truncate">
                                          {course.courseCode}
                                        </div>
                                        <div className="text-[10px] font-semibold opacity-80 truncate" title={course.courseName}>
                                          {course.courseName}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${style.badge}`}>
                                          {style.label}
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded bg-white/90 text-gray-800 text-[10px] font-bold border border-gray-200">
                                          {course.units}u
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>

                            {/* Cell Footer: Cell Unit Total */}
                            <div className="pt-2 border-t border-gray-100 flex justify-end text-xs font-semibold">
                              <span className="text-gray-500 font-bold text-[11px]">
                                Total: <strong className="text-gray-800">{cellUnits} units</strong>
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Course Detail Chip Popover Modal */}
      {selectedChip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 font-sans">
            {/* Popover Header */}
            <div className="p-5 bg-slate-50 border-b border-gray-200 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-extrabold uppercase border ${CATEGORY_STYLES[selectedChip.category]?.badge}`}>
                    {selectedChip.category.toUpperCase()}
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-base">{selectedChip.courseCode}</h3>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-1">{selectedChip.courseName}</p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedChip(null)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Popover Details */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center text-xs font-sans">
                <div>
                  <span className="text-gray-400 block font-semibold text-[10px] uppercase">Lec Hours</span>
                  <span className="font-extrabold text-slate-800 text-sm">{selectedChip.lec} hrs</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold text-[10px] uppercase">Lab Hours</span>
                  <span className="font-extrabold text-slate-800 text-sm">{selectedChip.lab} hrs</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-semibold text-[10px] uppercase">Total Units</span>
                  <span className="font-extrabold text-[#4e0a10] text-sm">{selectedChip.units} units</span>
                </div>
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  Placement: <strong>Year {selectedChip.yearLevel} — {selectedChip.term === 1 ? '1st Semester' : selectedChip.term === 2 ? '2nd Semester' : 'Summer Term'}</strong>
                </div>
                <div>Program: <strong>{selectedChip.program}</strong></div>
              </div>
            </div>

            {/* Popover Actions (Read-Only) */}
            <div className="p-4 bg-slate-50 border-t border-gray-200 flex justify-end items-center">
              <button
                type="button"
                onClick={() => setSelectedChip(null)}
                className="px-4 py-1.5 border border-gray-300 bg-white rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

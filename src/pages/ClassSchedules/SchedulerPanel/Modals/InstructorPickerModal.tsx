import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Search, Users, X } from "lucide-react";
import EmploymentBadge from "../EmploymentBadge";
import type { Faculty } from "../types";

const NO_PROGRAM = "__none__";
const ALL_PROGRAMS = "__all__";

interface InstructorPickerModalProps {
  faculties: Faculty[];
  selectedFacultyId: string;
  preferredDepartmentId?: number | null;
  preferredProgramId?: number | null;
  conflictFor: (facultyId: string) => string | null;
  onSelect: (facultyId: string) => void;
  onClose: () => void;
}

interface DepartmentTab {
  key: string;
  label: string;
  title: string;
  faculties: Faculty[];
}

const departmentKey = (faculty: Faculty) => String(faculty.departmentId ?? "none");
const programKey = (faculty: Faculty) => (faculty.programId != null ? String(faculty.programId) : NO_PROGRAM);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export default function InstructorPickerModal({
  faculties,
  selectedFacultyId,
  preferredDepartmentId,
  preferredProgramId,
  conflictFor,
  onSelect,
  onClose,
}: InstructorPickerModalProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const departments = useMemo<DepartmentTab[]>(() => {
    const groups = new Map<string, DepartmentTab>();
    for (const faculty of faculties) {
      const key = departmentKey(faculty);
      const group = groups.get(key) ?? {
        key,
        label: faculty.departmentCode || faculty.departmentName || "No Department",
        title: faculty.departmentName || faculty.departmentCode || "No Department",
        faculties: [],
      };
      group.faculties.push(faculty);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [faculties]);

  const [activeDepartment, setActiveDepartment] = useState(() => {
    const selected = faculties.find((faculty) => faculty.id === selectedFacultyId);
    if (selected) return departmentKey(selected);
    if (preferredDepartmentId != null && departments.some((tab) => tab.key === String(preferredDepartmentId))) {
      return String(preferredDepartmentId);
    }
    return departments[0]?.key ?? "";
  });
  const [activeProgram, setActiveProgram] = useState(() => {
    const selected = faculties.find((faculty) => faculty.id === selectedFacultyId);
    const preferred = selected ? programKey(selected) : preferredProgramId != null ? String(preferredProgramId) : ALL_PROGRAMS;
    return faculties.some((faculty) => departmentKey(faculty) === activeDepartment && programKey(faculty) === preferred)
      ? preferred
      : ALL_PROGRAMS;
  });

  useEffect(() => {
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const departmentTab = departments.find((tab) => tab.key === activeDepartment) ?? departments[0];

  const programs = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; count: number }>();
    for (const faculty of departmentTab?.faculties ?? []) {
      const key = programKey(faculty);
      const group = groups.get(key) ?? { key, label: faculty.programCode || "No Program", count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) =>
      left.key === NO_PROGRAM ? 1 : right.key === NO_PROGRAM ? -1 : left.label.localeCompare(right.label)
    );
  }, [departmentTab]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFaculties = useMemo(() => {
    const pool = normalizedQuery
      ? faculties.filter((faculty) => faculty.name.toLowerCase().includes(normalizedQuery))
      : (departmentTab?.faculties ?? []).filter(
          (faculty) => activeProgram === ALL_PROGRAMS || programKey(faculty) === activeProgram
        );
    return [...pool].sort((left, right) => left.name.localeCompare(right.name));
  }, [faculties, departmentTab, activeProgram, normalizedQuery]);

  const tabClass = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
      active ? "bg-[#4e0a10] text-white shadow-xs" : "bg-white text-gray-600 hover:bg-[#4e0a10]/10"
    }`;
  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
      active
        ? "border-[#C9952A] bg-[#C9952A]/15 text-[#7a4c08]"
        : "border-gray-200 bg-white text-gray-500 hover:border-[#C9952A]/60"
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] flex min-h-screen items-center justify-center bg-black/40 p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="instructor-picker-title"
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[#F7F4F0] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between gap-3 bg-[#4e0a10] px-5 py-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 shrink-0 text-[#C9952A]" />
            <div>
              <h3 id="instructor-picker-title" className="text-lg font-semibold leading-tight text-white">Select Instructor</h3>
              <p className="mt-0.5 text-sm text-amber-100/75">{faculties.length} eligible instructor{faculties.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close instructor selector"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-[#4e0a10]/10 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all instructors by name"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20"
            />
          </div>

          {!normalizedQuery && departments.length > 0 && (
            <>
              {departments.length > 1 && (
                <div role="tablist" aria-label="Departments" className="flex flex-wrap gap-1.5">
                  {departments.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={tab.key === departmentTab?.key}
                      title={tab.title}
                      onClick={() => { setActiveDepartment(tab.key); setActiveProgram(ALL_PROGRAMS); }}
                      className={tabClass(tab.key === departmentTab?.key)}
                    >
                      {tab.label}
                      <span className="ml-1.5 opacity-60">{tab.faculties.length}</span>
                    </button>
                  ))}
                </div>
              )}
              {programs.length > 1 && (
                <div role="tablist" aria-label="Programs" className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeProgram === ALL_PROGRAMS}
                    onClick={() => setActiveProgram(ALL_PROGRAMS)}
                    className={chipClass(activeProgram === ALL_PROGRAMS)}
                  >
                    All Programs
                  </button>
                  {programs.map((program) => (
                    <button
                      key={program.key}
                      type="button"
                      role="tab"
                      aria-selected={activeProgram === program.key}
                      onClick={() => setActiveProgram(program.key)}
                      className={chipClass(activeProgram === program.key)}
                    >
                      {program.label}
                      <span className="ml-1 opacity-60">{program.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <ul className="grid flex-1 grid-cols-1 content-start gap-2 overflow-y-auto px-5 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFaculties.length === 0 ? (
            <li className="col-span-full rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm font-semibold text-gray-500">
              {normalizedQuery ? "No instructor matches your search." : "No eligible instructor here."}
            </li>
          ) : visibleFaculties.map((faculty) => {
            const isSelected = faculty.id === selectedFacultyId;
            const conflict = conflictFor(faculty.id);
            const ceiling = faculty.unitCeiling ?? faculty.maxUnits;
            return (
              <li key={faculty.id}>
                <button
                  type="button"
                  onClick={() => onSelect(faculty.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-[#4e0a10] bg-[#4e0a10]/5 ring-1 ring-[#4e0a10]/30"
                      : "border-gray-100 bg-white hover:border-[#4e0a10]/30 hover:bg-[#4e0a10]/[0.03]"
                  }`}
                >
                  {faculty.profilePicture ? (
                    <img src={faculty.profilePicture} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-xs font-bold text-[#4e0a10]">
                      {initials(faculty.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-gray-800">{faculty.name}</span>
                      <EmploymentBadge type={faculty.employmentType} />
                      {conflict && (
                        <span title={conflict} className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                          <AlertTriangle className="h-3 w-3" />
                          Conflict
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">
                      {[faculty.departmentCode, faculty.programCode].filter(Boolean).join(" · ") || "No department"}
                      {faculty.assignedUnits != null && ceiling != null && ` · ${faculty.assignedUnits}/${ceiling} units`}
                    </span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-[#4e0a10]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

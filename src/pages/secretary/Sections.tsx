import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/ui/DataTable';
import ConfirmModal from '../../components/ui/ConfirmModal';
import TableActionButton from '../../components/ui/TableActionButton';
import {
  Pencil,
  Trash2,
  Plus,
  Filter,
  Users,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import SectionModal from './SectionModal';
import { yearLevelLabel } from '../../lib/semesterLabel';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import FilterBar from '../../components/ui/FilterBar';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}
interface Program { id: number; code: string; name: string | null; department_id: number; }

interface Semester {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
}

interface Section {
  id: number;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number;
  program_id: number | null;
  department: Department | null;
  semester_id: number;
  academic_semester: Semester | null;
  status: 'active' | 'inactive';
  createdAt?: string;
}

interface ApiSection {
  id: number;
  section_name: string;
  year_level: '1' | '2' | '3' | '4';
  semester: '1st' | '2nd' | 'summer';
  department_id: number;
  program_id: number | null;
  department?: Department | null;
  semester_id: number;
  academic_semester?: Semester | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface SectionsPageData {
  sections: Section[];
  departments: Department[];
  programs: Program[];
  semesters: Semester[];
}

const YEAR_LEVEL_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
] as const;

const mapApiSection =(s: ApiSection): Section => ({
  id: s.id,
  section_name: s.section_name,
  year_level: s.year_level,
  semester: s.semester,
  department_id: s.department_id,
  program_id: s.program_id ?? null,
  department: s.department || null,
  semester_id: s.semester_id,
  academic_semester: s.academic_semester || null,
  status: s.status || 'active',
  createdAt: s.created_at
});

export default function SecretarySections() {
  const { toast } = useToast();
  const user = getStoredUser();
  const sectionsCacheKey = `page:sections:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}:${user?.program_id ?? 'all'}`;
  const cachedSectionsData = getCachedData<SectionsPageData>(sectionsCacheKey);
  const [sections, setSections] = useState<Section[]>(cachedSectionsData?.sections ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedSectionsData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedSectionsData?.programs ?? []);
  const [semesters, setSemesters] = useState<Semester[]>(cachedSectionsData?.semesters ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(sectionsCacheKey));

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isSecretary = user?.role?.toLowerCase() === 'secretary';
  const isProgramHead = user?.role?.toLowerCase() === 'program_head';
  const canManageSections = hasStoredCapability('schedule.create') || ((isSecretary || isProgramHead) && (programs.length > 0 || user?.scheduling_ready !== false));

  const selectablePrograms = useMemo(
    () => (isProgramHead ? programs.filter((p) => Number(p.id) === Number(user?.program_id)) : programs),
    [programs, isProgramHead, user?.program_id],
  );

  const activeSemester = useMemo(() => semesters.find((t) => t.is_active) ?? semesters[0], [semesters]);

  const [yearLevelFilter, setYearLevelFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');

  // Sections in scope before the year-level filter, so each year button can show its count.
  const scopedSections = useMemo(() => {
    let list = sections;
    if (!isVpaa) {
      if (!user?.department_id) return [];
      list = list.filter(s => s.department_id !== null && Number(s.department_id) === Number(user.department_id));
    }

    if (isProgramHead && user?.program_id) {
      list = list.filter(s => s.program_id !== null && Number(s.program_id) === Number(user.program_id));
    }

    if (programFilter !== 'all') {
      list = list.filter(s => String(s.program_id) === programFilter);
    }

    return list;
  }, [sections, isVpaa, user?.department_id, user?.program_id, isProgramHead, programFilter]);

  const yearLevelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scopedSections.length, '1': 0, '2': 0, '3': 0, '4': 0 };
    scopedSections.forEach((s) => {
      const key = String(s.year_level);
      if (key in counts) counts[key] += 1;
    });
    return counts;
  }, [scopedSections]);

  const filteredSections = useMemo(
    () => (yearLevelFilter === 'all' ? scopedSections : scopedSections.filter(s => String(s.year_level) === yearLevelFilter)),
    [scopedSections, yearLevelFilter],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useLiveRefresh(['sections', 'departments', 'settings'], () => { void fetchData(true, true); });

  const fetchData = async (forceRefresh = false, silent = false) => {
    if (!silent) setIsLoading(forceRefresh || !hasCachedData(sectionsCacheKey));
    try {
      const data = await loadCachedData<SectionsPageData>(sectionsCacheKey, async () => {
        const [sectionsRes, deptsRes, semestersRes, programsRes] = await Promise.all([
          api.get<ApiSection[]>('/sections'),
          api.get<Department[]>('/departments'),
          api.get<Semester[]>('/semesters'),
          api.get<Program[]>('/programs')
        ]);
        return {
          sections: sectionsRes.data.map(mapApiSection),
          departments: deptsRes.data,
          semesters: semestersRes.data,
          programs: programsRes.data,
        };
      }, forceRefresh);
      setSections(data.sections);
      setDepartments(data.departments);
      setSemesters(data.semesters);
      setPrograms(data.programs);
    } catch {
      toast.error('Error', 'Failed to load sections, departments, and semesters data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (section: Section) => {
    setEditingId(section.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const triggerDeleteConfirmation = (id: number) => {
    setIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteSection = async () => {
    if (idToDelete !== null) {
      try {
        await api.delete(`/sections/${idToDelete}`);
        invalidateCacheGroups('sections', 'schedules', 'approvals', 'dashboards');
        setSections(prev => {
          const nextSections = prev.filter(s => s.id !== idToDelete);
          setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, programs, semesters });
          return nextSections;
        });
        toast.success('Deleted', 'Section deleted successfully');
      } catch (error) {
        toast.error('Delete Failed', apiErrorMessage(error, 'Failed to delete section.'));
      } finally {
        setIsDeleteModalOpen(false);
        setIdToDelete(null);
      }
    }
  };

  const handleSaveSingle = async (
    secName: string,
    yrLevel: '1' | '2' | '3' | '4',
    deptId: number, programId: number
  ) => {
    if (isEditMode && editingId !== null) {
      const payload = {
        section_name: secName,
        year_level: yrLevel,
        department_id: deptId,
        program_id: programId,
      };
      const res = await api.put<ApiSection>(`/sections/${editingId}`, payload);
      const updatedSection = mapApiSection(res.data);
      invalidateCacheGroups('sections', 'schedules', 'approvals', 'dashboards');
      setSections((prev) => {
        const nextSections = prev.map((s) => (s.id === editingId ? updatedSection : s));
        setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, programs, semesters });
        return nextSections;
      });
      toast.success('Updated', 'Section updated successfully');
    }
  };

  const handleSaveBatch = async (
    batchSections: Array<{ section_name: string; year_level: '1' | '2' | '3' | '4' }>,
    deptId: number, programId: number
  ) => {
    const batchPayload = {
      sections: batchSections.map((s) => ({
        section_name: s.section_name,
        year_level: s.year_level,
        department_id: deptId,
        program_id: programId,
      })),
    };
    const res = await api.post<{ message: string; sections: ApiSection[] }>('/sections/batch', batchPayload);
    const createdSections = res.data.sections.map(mapApiSection);
    invalidateCacheGroups('sections', 'schedules', 'approvals', 'dashboards');
    setSections((prev) => {
      const nextSections = [...createdSections, ...prev];
      setCachedData<SectionsPageData>(sectionsCacheKey, { sections: nextSections, departments, programs, semesters });
      return nextSections;
    });
    toast.success('Sections Saved', res.data.message || `${createdSections.length} sections created successfully.`);
  };

  const columns = useMemo<ColumnDef<Section>[]>(
    () => {
      const cols: ColumnDef<Section>[] = [
        {
          accessorKey: 'section_name',
          header: 'Section Name',
          cell: info => (
            <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
              {info.getValue() as string}
            </span>
          )
        },
        {
          accessorKey: 'year_level',
          header: 'Year Level',
          cell: info => <span className="font-bold text-gray-800">{yearLevelLabel(info.getValue() as string)}</span>
        }
      ];

      // Non-VPAA users only see their own department's sections, so the column would repeat one value.
      if (isVpaa) {
        cols.push({
          accessorKey: 'department',
          header: 'Department',
          cell: info => {
            const dept = info.getValue() as Department | null;
            return (
              <span className="text-gray-700 font-semibold text-xs">
                {dept ? `${dept.department_code} - ${dept.department_name}` : '—'}
              </span>
            );
          }
        });
      }

      if (canManageSections) {
        cols.push({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1.5">
              <div className="relative group/tooltip">
                <TableActionButton
                  label="Edit"
                  variant="edit"
                  onClick={() => handleEditClick(row.original)}
                >
                  <Pencil size={17} />
                </TableActionButton>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                  Edit
                </span>
              </div>
              <div className="relative group/tooltip">
                <TableActionButton
                  label="Delete"
                  variant="delete"
                  onClick={() => triggerDeleteConfirmation(row.original.id)}
                >
                  <Trash2 size={17} />
                </TableActionButton>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                  Delete
                </span>
              </div>
            </div>
          )
        });
      }

      return cols;
    },
    [canManageSections, isVpaa]
  );

  const table = useReactTable<Section>({
    data: filteredSections,
    columns,
    state: {
      sorting,
      pagination
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const sectionGuideSteps = useMemo(() => [
    { element: '#sections-year-tabs', action: 'click' as const, taskHint: 'Pick a year level to continue.', title: 'Browse by year level', description: 'Each button shows how many sections that year level has.', side: 'bottom' as const },
    { element: '#sections-add-button', action: 'click' as const, taskHint: 'Click Add Section to open the form.', title: 'Add a section', description: 'New sections are created from this page.', side: 'bottom' as const },
    { element: '#section-program-select', waitFor: '#section-form', action: 'select' as const, taskHint: 'Choose the program to continue.', title: 'Select a program', description: 'The section belongs to a program in your department.', side: 'bottom' as const },
    { element: '[data-tour="section-row-name"]', waitFor: '#section-form', action: 'input' as const, taskHint: 'Type a section name to continue.', title: 'Name the section', description: 'Use the official section code, e.g. BSIT 1A.', side: 'bottom' as const },
    { element: '[data-tour="section-row-year"]', waitFor: '#section-form', action: 'select' as const, taskHint: 'Choose the year level to continue.', title: 'Set the year level', description: 'Year level decides which courses the section takes.', side: 'bottom' as const },
    { element: '#section-form', action: 'submit' as const, taskHint: 'Click Save section to create it.', title: 'Save the section', description: 'Submit the form to create it. Great work — that is the whole flow.', side: 'top' as const },
  ].slice(0, canManageSections ? undefined : 1), [canManageSections]);
  useWorkflowGuide({ id: 'sections', isReady: true, steps: sectionGuideSteps, mission: 'Manage Sections' });

  return (
    <div>
      <FilterBar id="sections-toolbar" className="mb-6">
        <div id="sections-year-tabs" role="group" aria-label="Filter by year level" className="flex flex-wrap items-center gap-2">
          {YEAR_LEVEL_OPTIONS.map(({ value, label }) => {
            const isActive = yearLevelFilter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setYearLevelFilter(value);
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#5A1220] border-[#5A1220] text-white shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`min-w-[1.375rem] px-1.5 py-0.5 rounded-full text-[10px] leading-none text-center tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#C9952A]/15 text-[#9a7020]'
                  }`}
                >
                  {yearLevelCounts[value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectablePrograms.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-gray-400" />
              <select
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
                title="Filter by Program"
                className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
              >
                <option value="all">All Programs</option>
                {selectablePrograms.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.code}</option>
                ))}
              </select>
            </div>
          )}

          {canManageSections && (
            <button
              id="sections-add-button"
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
                setIsModalOpen(true);
              }}
              className="bg-[#5A1220] text-white px-5 py-2.5 rounded-xl hover:bg-[#410b15] hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs shadow-md cursor-pointer ml-auto sm:ml-0 whitespace-nowrap"
            >
              <Plus size={15} />
              <span>Add Section</span>
            </button>
          )}
        </div>
      </FilterBar>

      <WorkflowGuideButton guideId="sections" />
      <div id="sections-table" className="font-sans">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="sections"
          ariaLabel="Sections"
          emptyTitle="No sections found."
          emptyDescription={canManageSections ? 'Try another year level or add a new section.' : 'Try another year level.'}
          emptyState={
            !isLoading && sections.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center">
                <Users className="w-12 h-12 text-gray-300 mb-3" />
                <h3 className="text-base font-bold text-gray-800">No sections added yet</h3>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  {canManageSections
                    ? "Get started by adding your department's first section to begin scheduling."
                    : 'Your department has not added any sections yet.'}
                </p>
              </div>
            ) : undefined
          }
          cellClassName={(columnId) => (['section_name', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      <SectionModal
        isOpen={isModalOpen}
        isEditMode={isEditMode}
        editingSection={sections.find((s) => s.id === editingId)}
        activeSemester={activeSemester ?? null}
        departments={departments}
        programs={selectablePrograms}
        userDepartmentId={user?.department_id}
        isVpaa={isVpaa}
        onClose={() => setIsModalOpen(false)}
        onSaveSingle={handleSaveSingle}
        onSaveBatch={handleSaveBatch}
        existingSections={sections}
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        eyebrow="Delete Record"
        title="Delete Section"
        message="Are you sure you want to permanently delete this section? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeleteSection}
      />
    </div>
  );
}

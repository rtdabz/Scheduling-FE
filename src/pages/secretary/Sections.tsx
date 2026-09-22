import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/ui/DataTable';
import ConfirmModal from '../../components/ui/ConfirmModal';
import TableActionButton from '../../components/ui/TableActionButton';
import SearchInput from '../../components/ui/SearchInput';
import {
  Pencil,
  Trash2,
  Search,
  X,
  Plus,
  Layers,
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
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import SectionModal from './SectionModal';
import { yearLevelLabel } from '../../lib/semesterLabel';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

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

const mapApiSection = (s: ApiSection): Section => ({
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
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const sectionsCacheKey = `page:sections:${user?.role ?? 'user'}:${user?.department_id ?? 'all'}`;
  const cachedSectionsData = getCachedData<SectionsPageData>(sectionsCacheKey);
  const [sections, setSections] = useState<Section[]>(cachedSectionsData?.sections ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedSectionsData?.departments ?? []);
  const [programs, setPrograms] = useState<Program[]>(cachedSectionsData?.programs ?? []);
  const [semesters, setSemesters] = useState<Semester[]>(cachedSectionsData?.semesters ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(sectionsCacheKey));

  const isVpaa = user?.role?.toLowerCase() === 'vpaa';
  const isDean = user?.role?.toLowerCase() === 'dean';
  const isSecretary = user?.role?.toLowerCase() === 'secretary';
  const isProgramHead = user?.role?.toLowerCase() === 'program_head';
  const canManageSections = isVpaa || isSecretary || isProgramHead;

  const activeSemester = useMemo(() => semesters.find((t) => t.is_active) ?? semesters[0], [semesters]);

  const filteredSections = useMemo(() => {
    if (isVpaa) return sections;
    if (!user?.department_id) return [];
    return sections.filter(s => s.department_id !== null && Number(s.department_id) === Number(user.department_id));
  }, [sections, isVpaa, user?.department_id]);

  // Table States
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  // Modal states
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
        toast.success('Archived', 'Section archived successfully');
        toast.success('Deleted', 'Section deleted successfully');
      } catch {
        toast.error('Error', 'Failed to archive section');
        toast.error('Error', 'Failed to delete section');
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
        },
        {
          accessorKey: 'semester',
          header: 'Semester',
          cell: info => {
            const val = info.getValue() as string;
            return (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-200 font-sans">
                {val}
              </span>
            );
          }
        },
        {
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
        },
        {
          accessorKey: 'academic_semester',
          header: 'Academic Semester',
          cell: info => {
            const semester = info.getValue() as Semester | null;
            return (
              <span className="text-gray-700 font-semibold text-xs">
                {semester ? `A.Y. ${semester.academic_year} (${semester.semester})` : '—'}
              </span>
            );
          }
        },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: info => {
            const val = (info.getValue() as string) || 'active';
            const badgeColor = val === 'active'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200';
            return (
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {val}
              </span>
            );
          }
        }
      ];

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
                  variant="danger"
                  onClick={() => triggerDeleteConfirmation(row.original.id)}
                >
                  <Trash2 size={17} />
                </TableActionButton>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap">
                  Archive
                  Delete
                </span>
              </div>
            </div>
          )
        });
      }

      return cols;
    },
    [canManageSections]
  );

  const table = useReactTable<Section>({
    data: filteredSections,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const sectionGuideSteps = useMemo(() => [
    { element: '#sections-toolbar input[type="text"]', action: 'input' as const, taskHint: 'Type in the search box to continue.', title: 'Find a section', description: 'Search for a section by name or semester before scheduling.', side: 'bottom' as const },
    { element: '#sections-add-button', action: 'click' as const, taskHint: 'Click Add Section to open the form.', title: 'Add a section', description: 'New sections are created from this page.', side: 'bottom' as const },
    { element: '#section-program-select', waitFor: '#section-form', action: 'select' as const, taskHint: 'Choose the program to continue.', title: 'Select a program', description: 'The section belongs to a program in your department.', side: 'bottom' as const },
    { element: '[data-tour="section-row-name"]', waitFor: '#section-form', action: 'input' as const, taskHint: 'Type a section name to continue.', title: 'Name the section', description: 'Use the official section code, e.g. BSIT 1A.', side: 'bottom' as const },
    { element: '[data-tour="section-row-year"]', waitFor: '#section-form', action: 'select' as const, taskHint: 'Choose the year level to continue.', title: 'Set the year level', description: 'Year level decides which courses the section takes.', side: 'bottom' as const },
    { element: '#section-form', action: 'submit' as const, taskHint: 'Click Save section to create it.', title: 'Save the section', description: 'Submit the form to create it. Great work — that is the whole flow.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'sections', isReady: true, steps: sectionGuideSteps, mission: 'Manage Sections' });

  return (
    <div>
      {/* Top Bar Section */}
      <div id="sections-toolbar" className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <SearchInput
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search section name, semester, etc..."
          containerClassName="relative flex-1 sm:max-w-md"
        />
        {canManageSections && (
          <button
            id="sections-add-button"
            onClick={() => {
              setIsEditMode(false);
              setEditingId(null);
              setIsModalOpen(true);
            }}
            className="bg-[#4e0a10] text-white px-5 py-2.5 rounded-xl hover:bg-[#C9952A] transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm shadow-sm cursor-pointer"
          >
            <Plus size={18} />
            <span>Add Section</span>
          </button>
        )}
      </div>

      {/* Table Container */}
      <WorkflowGuideButton guideId="sections" />
      <div id="sections-table" className="font-sans">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="sections"
          ariaLabel="Sections"
          emptyTitle="No sections found."
          emptyDescription="Try adjusting your search criteria or add a new section."
          cellClassName={(columnId) => (['section_name', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      {/* Create / Edit Modal (Portal Isolated for 0-lag typing) */}
      <SectionModal
        isOpen={isModalOpen}
        isEditMode={isEditMode}
        editingSection={sections.find((s) => s.id === editingId)}
        activeSemester={activeSemester ?? null}
        departments={departments}
        programs={programs}
        userDepartmentId={user?.department_id}
        isVpaa={isVpaa}
        onClose={() => setIsModalOpen(false)}
        onSaveSingle={handleSaveSingle}
        onSaveBatch={handleSaveBatch}
        existingSections={sections}
      />

      <ConfirmModal isOpen={isDeleteModalOpen} eyebrow="Archive Record" title="Archive Section" message="This section will be hidden from active lists and can be restored from the Archive." confirmLabel="Archive" variant="danger" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={confirmDeleteSection} />
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
import LoadingSpinner from "../../components/ui/LoadingSpinner";

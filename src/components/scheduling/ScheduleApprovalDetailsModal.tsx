import { useMemo, useState, type ReactNode } from 'react';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import Modal from '../ui/Modal';
import SearchInput from '../ui/SearchInput';
import ScheduleMeetingsTable from './ScheduleMeetingsTable';
import { scheduleItemToTableRow, useScheduleTable, type ScheduleConflictState } from './scheduleTableColumns';
import type { ScheduleItem } from '../../pages/ClassSchedules/SchedulerPanel/types';

export interface ApprovalDetailFact {
  label: string;
  value: ReactNode;
}

export type RecalledSectionTone = 'revision' | 'pending' | 'approved' | 'returned';

export interface RecalledSectionDetail {
  id: string;
  name: string;
  /** Where the recalled section is now, in plain words, e.g. "Resubmitted · Pending Dean approval". */
  status: string;
  tone: RecalledSectionTone;
}

export interface ScheduleDetailsMeetings {
  /** Exactly the meetings the PDF prints for this entry; null while they load. */
  schedules: ScheduleItem[] | null;
  /** The entry's sections, for the section filter. */
  sections: Array<{ id: string; name: string }>;
  conflicts: ScheduleConflictState;
  /** Where the meetings come from, e.g. "As submitted" or "Current schedule". */
  sourceLabel: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Department, program, and version of the schedule; the dialog's description. */
  scheduleTitle: string;
  status: { label: string; badgeClassName: string };
  /** Short metadata shown beside the status: term and submission. */
  facts: ApprovalDetailFact[];
  /** e.g. "First submission" when there is no earlier version to compare. */
  versionLabel?: string | null;
  scope: {
    summary: string;
    /** Shown once, when recalled sections are not part of this approval. */
    exclusionNote?: string | null;
    recalled: RecalledSectionDetail[];
  };
  /** Conflict and rule findings; omitted when checks do not apply to this entry. */
  checks?: ReactNode;
  /** Source and incomplete-data notices that qualify the table. */
  notices?: ReactNode;
  meetings: ScheduleDetailsMeetings;
  changes?: { label: string; content: ReactNode; defaultOpen?: boolean } | null;
  inert?: boolean;
}

const TONE_CLASSES: Record<RecalledSectionTone, string> = {
  revision: 'bg-orange-100 text-orange-800 ring-orange-200',
  pending: 'bg-blue-100 text-blue-800 ring-blue-200',
  approved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  returned: 'bg-rose-100 text-rose-800 ring-rose-200',
};

const disclosureSummary = 'cursor-pointer select-none rounded text-xs font-bold text-[#4e0a10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]';

/** The meeting list for one entry: the shared Dean schedules table with search, section filter, and paging. */
function DetailsMeetingsTable({ meetings }: { meetings: ScheduleDetailsMeetings }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionId, setSectionId] = useState('All');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const allRows = useMemo(() => (meetings.schedules ?? []).map(scheduleItemToTableRow), [meetings.schedules]);
  // Filters narrow the list only; the package checked, printed, and approved stays the whole scope.
  const rows = useMemo(
    () => (sectionId === 'All' ? allRows : allRows.filter((row) => row.sectionId === sectionId)),
    [allRows, sectionId],
  );
  const table = useScheduleTable({
    rows,
    conflicts: meetings.conflicts,
    searchTerm,
    onSearchTermChange: setSearchTerm,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
  });
  const resetPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  return (
    <section aria-label="Schedules" className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:min-h-[18rem] lg:flex-1">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
        <SearchInput
          aria-label="Search schedules"
          value={searchTerm}
          onChange={(event) => { setSearchTerm(event.target.value); resetPage(); }}
          placeholder="Search course, section, room, instructor..."
          containerClassName="relative w-full sm:w-72"
          className="!py-2 !text-xs"
        />
        {meetings.sections.length > 1 && (
          <select
            aria-label="Section"
            value={sectionId}
            onChange={(event) => { setSectionId(event.target.value); resetPage(); }}
            className="h-9 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#4e0a10]"
          >
            <option value="All">All Sections</option>
            {meetings.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        )}
        <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-slate-500">{meetings.sourceLabel}</span>
      </div>
      <ScheduleMeetingsTable
        table={table}
        conflicts={meetings.conflicts}
        isLoading={meetings.schedules === null}
        ariaLabel="Schedule meetings"
        scrollAriaLabel="Schedule meetings table"
        emptyTitle={allRows.length === 0 ? 'No classes in this schedule.' : 'No classes match the search or section.'}
        emptyDescription={allRows.length === 0 ? '' : 'Clear the search or choose All Sections.'}
        className="flex min-h-0 flex-col lg:flex-1"
        scrollClassName="overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C9952A]"
      />
    </section>
  );
}

/**
 * Schedule details for Dean and VPAA review: the schedule's identity and approval scope, its blocking
 * findings, the meetings themselves, and, secondarily, changes from earlier versions.
 */
export default function ScheduleApprovalDetailsModal({
  isOpen, onClose, scheduleTitle, status, facts, versionLabel = null, scope, checks, notices, meetings, changes = null, inert = false,
}: Props) {
  const { recalled } = scope;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Schedule details"
      description={scheduleTitle}
      inert={inert}
      bodyClassName="lg:flex lg:flex-col"
    >
      <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1">
        <div className="space-y-1.5 text-xs">
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Status</dt>
              <dd>
                <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${status.badgeClassName}`}>
                  {status.label}
                </span>
              </dd>
            </div>
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 items-baseline gap-1">
                <dt className="font-semibold text-slate-500">{fact.label}:</dt>
                <dd className="break-words font-bold text-slate-800">{fact.value}</dd>
              </div>
            ))}
            {versionLabel && <div className="font-semibold text-slate-500">{versionLabel}</div>}
          </dl>

          <div role="group" aria-label="Approval scope" className="space-y-1">
            <p className="font-bold text-slate-800">{scope.summary}</p>
            {scope.exclusionNote && (
              <p className="flex items-center gap-1.5 font-semibold text-amber-800">
                <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {scope.exclusionNote}
              </p>
            )}
            {recalled.length > 0 && (
              <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
                <summary className={disclosureSummary}>Recalled sections ({recalled.length})</summary>
                <ul aria-label="Recalled sections" className="mt-1 divide-y divide-amber-200">
                  {recalled.map((section) => (
                    <li key={section.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                      <span className="font-bold text-slate-800">{section.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${TONE_CLASSES[section.tone]}`}>
                        {section.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        {checks && <section aria-label="Scheduling checks">{checks}</section>}
        {notices}

        <DetailsMeetingsTable meetings={meetings} />

        {changes && (
          <section aria-label="Changes">
            <details open={changes.defaultOpen} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <summary className={disclosureSummary}>{changes.label}</summary>
              <div className="mt-2">{changes.content}</div>
            </details>
          </section>
        )}
      </div>
    </Modal>
  );
}

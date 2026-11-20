import { useMemo, useState } from 'react';
import CourseCategoryBadge from '../CourseCategoryBadge';
import { TERM_LABELS, YEAR_LABELS } from '../../../lib/curriculumImport/normalize';
import type { ResolvedRow } from '../../../lib/curriculumImport/types';
import { TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW } from '../../ui/tableStyles';
import Badge from '../../ui/Badge';
import SearchInput from '../../ui/SearchInput';

type RecordFilter = 'all' | 'create' | 'reuse';

const FILTER_LABELS: Record<RecordFilter, string> = { all: 'All', create: 'New', reuse: 'Reused' };

const catalogText = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback);

/** Every course the import will save, by term, with whether it is created or an existing catalog course is reused. */
export default function ImportCoursesTable({ rows }: { rows: ResolvedRow[] }) {
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    all: rows.length,
    create: rows.filter((row) => row.catalog.action === 'create').length,
    reuse: rows.filter((row) => row.catalog.action === 'reuse').length,
  }), [rows]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = rows.filter((row) => (filter === 'all' || row.catalog.action === filter)
      && (!needle || `${row.code} ${row.title}`.toLowerCase().includes(needle)));
    const byTerm = new Map<string, { year: number; term: ResolvedRow['semester']; rows: ResolvedRow[] }>();
    for (const row of visible) {
      const key = `${row.year_level}-${row.semester}`;
      if (!byTerm.has(key)) byTerm.set(key, { year: row.year_level, term: row.semester, rows: [] });
      byTerm.get(key)!.rows.push(row);
    }
    return [...byTerm.values()].sort((a, b) => a.year - b.year || a.term - b.term);
  }, [rows, filter, query]);

  const shown = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="rounded-xl border border-border bg-white">
      {/* Sticks to the top of the dialog's single scroll area while the list scrolls past. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-t-xl border-b border-border bg-white/95 px-3 py-2 backdrop-blur-sm sm:h-12 sm:flex-nowrap">
        <SearchInput
          compact
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search code or title"
          aria-label="Search courses"
          containerClassName="relative min-w-[12rem] flex-1 sm:max-w-xs"
        />
        <span className="hidden text-xs tabular-nums text-muted md:inline" aria-hidden="true">
          {shown === rows.length ? `${rows.length} courses` : `${shown} of ${rows.length}`}
        </span>
        <div className="ml-auto inline-flex rounded-lg border border-border bg-parchment p-0.5" role="group" aria-label="Filter by course record">
          {(['all', 'create', 'reuse'] as RecordFilter[]).map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option)}
                className={`selection-indicator inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'shadow-sm' : 'border-transparent bg-transparent text-muted hover:bg-white hover:text-text'}`}
              >
                {FILTER_LABELS[option]}
                <span className={`selection-indicator-count min-w-[1.25rem] rounded px-1 text-center text-[11px] tabular-nums ${active ? '' : 'bg-black/[0.04] text-muted'}`}>{counts[option]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown === 0 ? (
        <p className="px-3 py-8 text-center text-[13px] text-muted">No courses match.</p>
      ) : (
        <table className="w-full table-fixed text-left text-[13px] max-sm:table-auto" aria-label="Courses in this import">
          <colgroup>
            <col className="w-28" />
            <col />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-36" />
          </colgroup>
          <thead className={`sticky top-12 z-10 max-sm:sr-only ${TABLE_HEAD}`}>
            <tr className={TABLE_HEAD_ROW}>
              <th scope="col" className="px-3 py-2">Code</th>
              <th scope="col" className="py-2 pr-3">Title</th>
              <th scope="col" className="py-2 pr-3 text-center">Lec / Lab / Units</th>
              <th scope="col" className="py-2 pr-3">Category</th>
              <th scope="col" className="py-2 pr-3">Record</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={`${group.year}-${group.term}`}>
              <tr>
                <th scope="rowgroup" colSpan={5} className="border-t border-border bg-parchment/70 px-3 py-1.5 text-left text-xs font-semibold text-text">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-0.5 rounded-full bg-accent" aria-hidden="true" />
                    {YEAR_LABELS[group.year]}, {TERM_LABELS[group.term]}
                  </span>
                  <span className="ml-2 font-medium tabular-nums text-muted">
                    {group.rows.length} {group.rows.length === 1 ? 'course' : 'courses'} · {group.rows.reduce((sum, row) => sum + row.total_credits, 0)} units
                  </span>
                </th>
              </tr>
              {group.rows.map((row) => {
                const reused = row.catalog.action === 'reuse';
                const course = row.catalog.course;
                const inactive = reused && course?.status !== 'active';
                return (
                  <tr key={row.row_id} className={TABLE_ROW}>
                    <th scope="row" className="truncate whitespace-nowrap px-3 py-1.5 font-semibold text-text">{reused ? catalogText(course?.code, row.code) : row.code}</th>
                    <td className="py-1.5 pr-3 leading-snug text-text">{reused ? catalogText(course?.title, row.title) : row.title}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-center tabular-nums text-muted" aria-label={`${row.lecture_units} lecture, ${row.lab_units} laboratory, ${row.total_credits} total units`}>
                      {row.lecture_units}<span className="px-1 text-gray-300">/</span>{row.lab_units}<span className="px-1 text-gray-300">/</span><span className="font-semibold text-text">{row.total_credits}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-text">{row.category ? <CourseCategoryBadge category={row.category} /> : <span className="text-muted">—</span>}</td>
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <Badge dot tone={reused ? 'brand' : row.catalog.action === 'create' ? 'success' : 'danger'}>
                          {reused ? 'Reused' : row.catalog.action === 'create' ? 'New' : 'Conflict'}
                        </Badge>
                        {inactive && <span className="text-[11px] text-muted">Inactive, stays inactive</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import Modal from "../../../../components/ui/Modal";
import DataTable from "../../../../components/ui/DataTable";
import { useDataTable } from "../../../../components/ui/useDataTable";
import { parseChangeDetail, type GenerationChange, type GenerationChangeItem } from "./generationChanges";
import { resolutionDetailsForChange } from "./resolutionDetailsData";
import SearchInput from "../../../../components/ui/SearchInput";

const ALL = "__all__";

const severityTone: Record<string, { icon: string; count: string; activeCount: string }> = {
  critical: { icon: "text-rose-600", count: "bg-rose-100 text-rose-700", activeCount: "bg-white/20 text-white" },
  warning: { icon: "text-amber-600", count: "bg-amber-100 text-amber-800", activeCount: "bg-white/20 text-white" },
};

const toneFor = (change: GenerationChange) => severityTone[change.severity] ?? severityTone.warning;
const isResolved = (change: GenerationChange) => Boolean(change.resolved || change.status === "resolved");

function ResolutionSummary({ change }: { change: GenerationChange }) {
  const details = resolutionDetailsForChange(change);
  // The per-class list below already shows each change applied, so skip that step here.
  const steps = details.steps.filter((step) => step.label !== "Change applied");

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        How this was resolved
      </p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-[8.5rem_1fr] sm:gap-x-3">
        {steps.map((step) => (
          <div key={step.label} className="contents">
            <dt className="text-[11px] font-black uppercase tracking-wide text-slate-500 sm:pt-0.5">{step.label}</dt>
            <dd className="text-sm font-semibold leading-relaxed text-slate-700">
              {step.text}
              {step.note && <span className="mt-0.5 block text-xs font-medium text-slate-500">{step.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-emerald-100 pt-2 text-xs font-bold text-emerald-800">{details.result}</p>
    </div>
  );
}

function ChangeRecords({
  items,
  onFocusClass,
}: {
  items: GenerationChangeItem[];
  onFocusClass: (item: GenerationChangeItem) => void;
}) {
  const columns = useMemo<ColumnDef<GenerationChangeItem>[]>(() => [
    {
      id: "class",
      header: "Class",
      meta: { cellClassName: "whitespace-nowrap" },
      cell: ({ row: { original: item } }) => (
        <>
          <span className="font-semibold text-gray-900">{item.section_name}</span>
          <span className="text-gray-400"> · </span>
          <span className="font-semibold text-gray-700">{item.course_code}</span>
        </>
      ),
    },
    { id: "day", header: "Day", meta: { cellClassName: "whitespace-nowrap" }, cell: ({ row }) => parseChangeDetail(row.original.detail).day ?? "—" },
    { id: "result", header: "Result", meta: { cellClassName: "font-semibold text-gray-900" }, cell: ({ row }) => parseChangeDetail(row.original.detail).result },
    { id: "reason", header: "Reason", meta: { cellClassName: "text-gray-500" }, cell: ({ row }) => parseChangeDetail(row.original.detail).reason ?? "—" },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right" },
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onFocusClass(row.original)}
          title="Show this class in the table"
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#4e0a10] hover:bg-[#4e0a10]/10 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
        >
          Show <ChevronRight className="h-3 w-3" />
        </button>
      ),
    },
  ], [onFocusClass]);
  const table = useDataTable({
    data: items,
    columns,
    pageSize: false,
    enableSorting: false,
    getRowId: (item, index) => `${item.section_id}-${item.course_id}-${index}`,
  });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      scrollClassName="overflow-visible"
      emptyTitle="No classes match your search."
      emptyDescription=""
    />
  );
}

export default function GenerationChangesModal({
  isOpen,
  onClose,
  changes,
  onFocusClass,
}: {
  isOpen: boolean;
  onClose: () => void;
  changes: GenerationChange[];
  onFocusClass: (item: GenerationChangeItem) => void;
}) {
  const [activeKind, setActiveKind] = useState<string>(() => changes[0]?.kind ?? ALL);
  const [query, setQuery] = useState("");

  const active = changes.find((change) => change.kind === activeKind) ?? changes[0];
  const total = changes.reduce((sum, change) => sum + change.items.length, 0);

  const needle = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!active) return [];
    if (!needle) return active.items;
    return active.items.filter((item) =>
      `${item.section_name} ${item.course_code} ${item.detail}`.toLowerCase().includes(needle),
    );
  }, [active, needle]);

  const focus = (item: GenerationChangeItem) => {
    onClose();
    onFocusClass(item);
  };

  return (
    <Modal
      appearance="workflow"
      icon={<ListChecks className="h-6 w-6" />}
      eyebrow="Schedule generation"
      isOpen={isOpen}
      onClose={onClose}
      title="Generation Changes"
      description={`${total} ${total === 1 ? "class was" : "classes were"} changed to complete the timetable. Review each change and how it was handled.`}
      size="lg"
      bodyClassName="flex min-h-0 flex-col"
      footer={(
        <button
          type="button"
          onClick={onClose}
          data-variant="primary"
          className="scheduler-dialog-button inline-flex min-h-10 items-center rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
        >
          Close
        </button>
      )}
    >
      {active && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
          <div role="tablist" aria-label="Change categories" className="flex flex-wrap gap-1.5">
            {changes.map((change) => {
              const selected = change.kind === active.kind;
              const tone = toneFor(change);
              return (
                <button
                  key={change.kind}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveKind(change.kind);
                    setQuery("");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#C9952A] ${
                    selected
                      ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <AlertTriangle className={`h-3.5 w-3.5 ${selected ? "text-white" : tone.icon}`} />
                  {change.title}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selected ? tone.activeCount : tone.count}`}>
                    {change.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div role="tabpanel" aria-label={active.title} className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {isResolved(active) ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Resolved</span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${toneFor(active).count}`}>Needs attention</span>
              )}
              {!isResolved(active) && active.description && (
                <span className="text-xs font-semibold text-slate-600">{active.description}</span>
              )}
            </div>

            {isResolved(active) && <ResolutionSummary change={active} />}

            <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  Affected classes
                  <span className="ml-1 text-slate-400">
                    {needle ? `${filteredItems.length} of ${active.items.length}` : active.items.length}
                  </span>
                </p>
                {active.items.length > 5 && (
                  <SearchInput
                    compact
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search section, course, day"
                    aria-label="Search affected classes"
                    containerClassName="relative w-56"
                  />
                )}
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                <ChangeRecords items={filteredItems} onFocusClass={focus} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

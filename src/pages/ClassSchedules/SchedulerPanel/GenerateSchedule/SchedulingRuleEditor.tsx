import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export type SchedulingRuleRow = {
  key: string;
  label: string;
  detail: string;
  value: ReactNode;
  onEdit?: () => void;
  onRemove: () => void;
};

type Props = {
  title: string;
  description: string;
  rows: SchedulingRuleRow[];
  emptyText: string;
  disabled?: boolean;
  saving?: boolean;
  children: ReactNode;
};

export default function SchedulingRuleEditor({
  title,
  description,
  rows,
  emptyText,
  disabled = false,
  saving = false,
  children,
}: Props) {
  return (
    <section className="flex min-h-0 flex-col border border-slate-200 bg-white p-2.5" style={{ borderRadius: 8 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-slate-950">{title}</h4>
          <p className="mt-0.5 text-xs font-semibold leading-4 text-slate-500">{description}</p>
        </div>
        {saving && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#4e0a10]" />}
      </div>

      <div className="mt-2">{children}</div>

      <div className="mt-2 border-t border-slate-200">
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs font-semibold text-slate-500">{emptyText}</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="grid items-center gap-2 border-b border-slate-100 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,auto)_auto]">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{row.label}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{row.detail}</p>
              </div>
              <div className="min-w-0 text-right text-xs font-black text-slate-700">{row.value}</div>
              <div className="flex justify-end gap-1">
                {row.onEdit && (
                  <button
                    type="button"
                    disabled={disabled || saving}
                    onClick={row.onEdit}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Edit ${row.label}`}
                    title="Edit rule"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={row.onRemove}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Remove ${row.label}`}
                  title="Remove rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

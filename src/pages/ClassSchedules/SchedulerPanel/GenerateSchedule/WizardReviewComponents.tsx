import { CheckCircle2 } from "lucide-react";

export function ReviewMetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-black text-slate-950">{value}</p>
    </div>
  );
}

export function ReviewMiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

export function SectionSummaryCard({
  name,
  subtitle,
  metrics,
}: {
  name: string;
  subtitle: string;
  metrics: { label: string; value: string | number }[];
}) {
  const metricGridClass = metrics.length >= 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-slate-950">{name}</h4>
          <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      </div>
      <div className={`mt-2 grid ${metricGridClass} gap-2 text-xs font-semibold text-slate-600`}>
        {metrics.map((metric) => (
          <ReviewMiniMetric key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
    </div>
  );
}

export function ReviewGroup({
  title,
  rows,
  emptyText,
  onEdit,
}: {
  title: string;
  rows: string[];
  emptyText: string;
  onEdit: () => void;
}) {
  return (
    <section className="min-h-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <h6 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h6>
        <button type="button" onClick={onEdit} className="text-xs font-black text-[#4e0a10] hover:underline">
          Edit
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 4).map((row) => (
            <li key={row} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800">
              {row}
            </li>
          ))}
          {rows.length > 4 && (
            <li className="px-3 py-1 text-xs font-bold text-slate-500">
              +{rows.length - 4} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

import { FileText } from "lucide-react";
import { useState } from "react";
import Modal from "../../../../components/ui/Modal";
import type { ResolutionDetails } from "./resolutionDetailsData";

export default function ResolutionDetailsButton({ details }: { details: ResolutionDetails }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
      >
        <FileText className="h-3 w-3" />
        Resolution Details
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Resolution Summary"
        description="How this scheduling recommendation was addressed."
        size="md"
        footer={(
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 items-center rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
          >
            Close
          </button>
        )}
      >
        <div className="grid gap-3 px-4 py-4 sm:px-5 sm:py-5">
          <SummaryField label="Recommendation" value={details.recommendation} />
          <SummaryField label="Original Issue" value={details.originalIssue} />
          <SummaryField label="Action Taken" value={details.actionTaken} />
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Changes Made</p>
            <ul className="mt-1.5 grid gap-1.5">
              {details.changesMade.map((change, index) => (
                <li key={`${change}-${index}`} className="text-sm font-semibold leading-relaxed text-slate-700">
                  {change}
                </li>
              ))}
            </ul>
          </div>
          <SummaryField label="Result/Outcome" value={details.result} />
        </div>
      </Modal>
    </>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}

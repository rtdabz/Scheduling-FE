import { CheckCircle2, FileText } from "lucide-react";
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
        description="What the generator found and how it was fixed."
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
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-base font-black leading-snug text-slate-900">{details.recommendation}</p>

            <ol className="mt-4 grid gap-4">
              {details.steps.map((step, index) => (
                <li key={step.label} className="relative flex gap-3">
                  {index < details.steps.length - 1 && (
                    <span aria-hidden className="absolute bottom-[-1rem] left-3 top-7 w-px bg-slate-200" />
                  )}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[11px] font-black text-[#4e0a10]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{step.label}</p>
                    {step.text && (
                      <p className="mt-0.5 text-sm font-semibold leading-relaxed text-slate-700">{step.text}</p>
                    )}
                    {step.items && (
                      <ul className="mt-0.5 grid gap-1">
                        {step.items.map((item, itemIndex) => (
                          <li key={`${item}-${itemIndex}`} className="text-sm font-semibold leading-relaxed text-slate-700">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {step.note && (
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{step.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 text-sm font-bold leading-relaxed text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {details.result}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}

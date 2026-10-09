import { useEffect, useRef, useState } from "react";
import api from "../../../../lib/api";
import type { AvailableSlot } from "./placementAlternativesModel";

export type SessionAlternative = {
  id: string;
  label: string;
  summary: string;
  reasons: string[];
  rows: NonNullable<AvailableSlot["group_rows"]>;
};

/** Mounted with the placement's request key, so edits discard stale witnesses. */
export default function SessionAlternatives({ payload, disabled, requiredDay, onStage }: {
  payload: Record<string, unknown> & { placement: Record<string, unknown> };
  disabled: boolean;
  requiredDay?: string | null;
  onStage: (option: SessionAlternative) => void;
}) {
  const [options, setOptions] = useState<SessionAlternative[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const load = async () => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await api.post<{ recommendations: SessionAlternative[] }>("/schedule-recommendations/available-slots", {
        ...payload, placement: { ...payload.placement, session_alternatives: true },
      }, { signal: controller.signal });
      if (!controller.signal.aborted) setOptions(response.data.recommendations);
    } catch {
      if (!controller.signal.aborted) setError("Session alternatives are unavailable. You can retry or adjust the class by hand.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <button type="button" disabled={disabled || busy} onClick={() => void load()}
      className="rounded-lg border border-[#c9952a]/40 bg-[#fff8e8] px-3 py-2 text-xs font-bold text-[#7a4c08] disabled:opacity-50">
      {busy ? "Checking session alternatives..." : "Check session alternatives"}
    </button>
    <p className="mt-2 text-xs text-slate-600">Check shorter Split meetings or an online Integrated lecture when the current shape has no placement. Selecting an option stages it for review before saving.</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {options?.length === 0 && !error && <p role="status" className="mt-2 text-sm text-slate-600">
      {requiredDay
        ? `Required Day restricts this class to ${requiredDay}. Two-day session alternatives need different days.`
        : "No additional session alternative was found under the current constraints."}
    </p>}
    {options?.map((option) => <div key={option.id} className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-sm font-bold">{option.label}</p>
      <p className="text-xs text-slate-600">{option.reasons.join(" ")} {option.summary}</p>
      <button type="button" disabled={disabled || busy} onClick={() => onStage(option)}
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-50">Stage {option.label}</button>
    </div>)}
  </section>;
}

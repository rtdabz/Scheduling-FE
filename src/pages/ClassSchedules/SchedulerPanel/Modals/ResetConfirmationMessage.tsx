import type { ResetConfirmationSummary } from "../../../../lib/scheduleReset";

/** Body of the "Permanently Delete Schedules" confirmation. */
export default function ResetConfirmationMessage({ summary }: { summary: ResetConfirmationSummary }) {
  return (
    <div className="space-y-3">
      {summary.changedNote && <p className="font-semibold text-amber-700">{summary.changedNote}</p>}
      <p>{summary.message}</p>
      {summary.crossDepartmentNote && <p>{summary.crossDepartmentNote}</p>}
    </div>
  );
}

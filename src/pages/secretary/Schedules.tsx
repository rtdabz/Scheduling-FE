import SchedulerPanel from "./SchedulerPanel";

export default function Schedules() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Schedules</p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <SchedulerPanel />
      </div>
    </div>
  );
}

import SchedulerPanel from "./SchedulerPanel";

export default function Schedules() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Schedules</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Schedules</h1>
        <p className="text-muted text-sm mt-1">
          Welcome to WICARS - Academic Scheduling System
        </p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <SchedulerPanel />
      </div>
    </div>
  );
}

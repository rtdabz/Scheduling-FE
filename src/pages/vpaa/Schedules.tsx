import SchedulerPanel from './SchedulerPanel';
import ScheduleViewer from './ScheduleViewer';

export default function Schedules() {
  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const isVpaa = user?.role?.toLowerCase() === 'vpaa';

  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Schedules</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Schedules</h1>
        <p className="text-muted text-sm mt-1">
          {isVpaa 
            ? "View and monitor academic schedules across all departments." 
            : "Welcome to WICARS — Academic Scheduling System"}
        </p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>
      
      <div className="mt-6 overflow-x-auto">
        {isVpaa ? <ScheduleViewer /> : <SchedulerPanel />}
      </div>
    </div>
  );
}

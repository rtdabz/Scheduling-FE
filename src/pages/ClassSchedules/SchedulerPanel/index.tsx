import TopBar from "./TopBar";
import FacultyPanel from "./FacultyPanel";
import SubjectBank from "./SubjectBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import { useScheduler } from "./hooks/useScheduler";

export default function SchedulerPanel() {
  const scheduler = useScheduler();

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">
      <TopBar {...scheduler} />

      <div className="flex flex-col lg:flex-row gap-6 w-full h-[700px] min-h-[600px] overflow-hidden">
        <FacultyPanel {...scheduler} />
        <SubjectBank {...scheduler} />
        <TimetableGrid {...scheduler} />
      </div>

      <DropModal {...scheduler} />
      <FacultyModal {...scheduler} />
    </div>
  );
}

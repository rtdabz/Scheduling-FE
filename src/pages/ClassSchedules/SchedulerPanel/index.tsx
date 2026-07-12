import TopBar from "./TopBar";
import FacultyPanel from "./FacultyPanel";
import SubjectBank from "./SubjectBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import TeachingLoad from "./TeachingLoad";
import { useScheduler } from "./hooks/useScheduler";

export default function SchedulerPanel() {
  const scheduler = useScheduler();

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onTeachingLoad={() => scheduler.setIsTeachingLoadOpen(true)}
      />

      <div className="flex flex-col lg:flex-row gap-6 w-full h-[700px] min-h-[600px] overflow-hidden">
        <FacultyPanel {...scheduler} />
        <SubjectBank {...scheduler} />
        <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
      </div>

      <DropModal {...scheduler} />
      <FacultyModal {...scheduler} />
      <ClearAllModal {...scheduler} />
      <RoomViewModal {...scheduler} />
      <PrintSchedule
        sections={scheduler.sections}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
      />
      <TeachingLoad
        faculties={scheduler.faculties}
        allSchedules={scheduler.schedules}
        subjects={scheduler.subjects}
        isTeachingLoadOpen={scheduler.isTeachingLoadOpen}
        setIsTeachingLoadOpen={scheduler.setIsTeachingLoadOpen}
        sections={scheduler.sections}
        activeTerm={scheduler.activeTerm}
        users={scheduler.users}
        departments={scheduler.departments}
        selectedSectionId={scheduler.selectedSectionId}
      />
    </div>
  );
}

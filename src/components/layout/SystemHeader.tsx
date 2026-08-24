import { Menu } from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';
import { academicYearLabel, semesterLabel } from '../../lib/termLabel';
import campusBg from '../../assets/campus-bg.jpg';
import UserProfileMenu from './UserProfileMenu';

interface HeaderTerm {
  academic_year?: string | null;
  semester?: string | null;
}

interface SystemHeaderProps {
  activeTerm: HeaderTerm | null;
  sidebarOpen?: boolean;
  onToggleSidebar: () => void;
}

export default function SystemHeader({ activeTerm, sidebarOpen = false, onToggleSidebar }: SystemHeaderProps) {
  return (
    <header className="relative z-50 flex min-h-[4.25rem] shrink-0 items-center justify-between gap-3 border-b border-l border-white/10 bg-[#4e0a10] px-3 py-3 text-white shadow-md sm:px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src={campusBg} alt="" className="h-full w-full object-cover object-center opacity-35 contrast-105 saturate-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/80 to-[#5A1220]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>
      <div className="relative z-10 flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" onClick={onToggleSidebar} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/20" aria-label="Toggle navigation menu" aria-controls="primary-navigation" aria-expanded={sidebarOpen}>
          <Menu className="h-4 w-4" />
        </button>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-2 sm:gap-3">
        {activeTerm && (
          <div className="hidden items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] shadow-sm sm:flex">
            <span className="font-semibold text-white/70">Active term</span>
            <span className="font-bold text-white">{semesterLabel(activeTerm.semester)}</span>
            <span className="font-semibold text-white/60">{academicYearLabel(activeTerm.academic_year)}</span>
          </div>
        )}
        <NotificationBell />
        <UserProfileMenu />
      </div>
    </header>
  );
}

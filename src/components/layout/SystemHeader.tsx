import { Menu } from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';
import { academicYearLabel, semesterLabel } from '../../lib/semesterLabel';
import UserProfileMenu from './UserProfileMenu';
import logo from '../../assets/logo.jpg';
import { HEADER_ICON_BUTTON } from './headerStyles';
interface HeaderSemester {
  academic_year?: string | null;
  semester?: string | null;
}

interface SystemHeaderProps {
  activeSemester: HeaderSemester | null;
  sidebarOpen?: boolean;
  onToggleSidebar: () => void;
}

export default function SystemHeader({ activeSemester, sidebarOpen = false, onToggleSidebar }: SystemHeaderProps) {
  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#4e0a10] px-3 text-white sm:px-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/80 to-[#5A1220]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      </div>
      <div className="relative z-10 flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={HEADER_ICON_BUTTON}
          aria-label="Toggle navigation menu"
          aria-controls="primary-navigation"
          aria-expanded={sidebarOpen}
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        {/* On phones the sidebar (and its brand block) is off-canvas, so the header carries the brand. */}
        <div className="flex min-w-0 items-center gap-2.5 md:hidden">
          <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-[#C9952A]/40" />
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap leading-none">
            <span className="bg-gradient-to-r from-white to-[#E8D5C4] bg-clip-text text-base font-extrabold tracking-wide text-transparent">TCC</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#C9952A]">Scheduling</span>
          </div>
        </div>

      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-2">
        {activeSemester && (
          <div
            className="mr-1 hidden h-8 items-center gap-2 rounded-full border border-white/20 bg-white/10 pl-2.5 pr-3 text-[11px] leading-none sm:flex"
            title="Active semester"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9952A]" aria-hidden="true" />
            <span className="sr-only">Active semester:</span>
            <span className="font-semibold text-white">{semesterLabel(activeSemester.semester)}</span>
            <span className="h-3 w-px bg-white/20" aria-hidden="true" />
            <span className="font-medium text-white/60">{academicYearLabel(activeSemester.academic_year)}</span>
          </div>
        )}
        <NotificationBell />
        <UserProfileMenu />
      </div>
    </header>
  );
}

import { TriangleAlert } from 'lucide-react';
import type { StoredUser } from '../../lib/storedUser';

export default function DepartmentSetupBanner({ user }: { user: StoredUser | null }) {
  const role = user?.role?.toLowerCase();
  if (user?.scheduling_ready !== false || (role !== 'secretary' && role !== 'program_head')) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800"
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        Your department has no program yet, so sections, schedules and course assignments cannot be created.
        Ask the VPAA to add a program to your department under Departments, then refresh this page.
      </span>
    </div>
  );
}

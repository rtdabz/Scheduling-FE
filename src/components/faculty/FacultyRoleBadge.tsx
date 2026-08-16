export type FacultyAdministrativeRole = 'dean' | 'secretary' | 'program_head';

interface FacultyRoleBadgeProps {
  role?: FacultyAdministrativeRole | null;
}

const ROLE_LABELS: Record<FacultyAdministrativeRole, string> = {
  dean: 'Dean',
  secretary: 'Secretary',
  program_head: 'Program Head',
};

export default function FacultyRoleBadge({ role }: FacultyRoleBadgeProps) {
  if (!role) return null;

  return (
    <span className="inline-flex w-fit items-center rounded-md border border-[#5A1220]/20 bg-[#5A1220]/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#5A1220]">
      {ROLE_LABELS[role]}
    </span>
  );
}

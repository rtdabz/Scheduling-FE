/**
 * Kept as a loose string rather than a union of three role names. Roles and
 * designations are both data — a new one must not need a type edit before it
 * can be displayed.
 */
export type FacultyAdministrativeRole = string;

interface FacultyRoleBadgeProps {
  /** A slugged value such as an account role; humanised for display. */
  role?: string | null;
  /** An already-human label (a designation name) shown verbatim. */
  label?: string | null;
  /** `gold` distinguishes a designation from the maroon account-role badge. */
  tone?: 'maroon' | 'gold';
  /** Appended in parentheses, e.g. the deload a designation carries. */
  hint?: string | null;
}

const TONES = {
  maroon: 'border-[#5A1220]/20 bg-[#5A1220]/5 text-[#5A1220]',
  gold: 'border-[#C9952A]/30 bg-[#C9952A]/10 text-[#8a6412]',
} as const;

/** `program_head` -> `Program Head`. Works for any value the server sends. */
const humanise = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function FacultyRoleBadge({
  role,
  label,
  tone = 'maroon',
  hint,
}: FacultyRoleBadgeProps) {
  const text = label?.trim() || (role ? humanise(role) : '');
  if (!text) return null;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${TONES[tone]}`}
    >
      {text}
      {hint && <span className="font-bold normal-case opacity-75">({hint})</span>}
    </span>
  );
}

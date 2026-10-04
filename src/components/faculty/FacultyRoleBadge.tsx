export type FacultyAdministrativeRole = string;

interface FacultyRoleBadgeProps {
  role?: string | null;
  label?: string | null;
  tone?: 'maroon' | 'gold';
  hint?: string | null;
  stacked?: boolean;
}

const TONES = {
  maroon: 'border-[#5A1220]/20 bg-[#5A1220]/5 text-[#5A1220]',
  gold: 'border-[#C9952A]/30 bg-[#C9952A]/10 text-[#8a6412]',
} as const;

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
  stacked = false,
}: FacultyRoleBadgeProps) {
  const text = label?.trim() || (role ? humanise(role) : '');
  if (!text) return null;

  if (stacked && hint) {
    return (
      <div className="flex flex-col items-start min-w-0 leading-tight">
        <span
          className={`inline-block max-w-full truncate whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${TONES[tone]}`}
          title={text}
        >
          {text}
        </span>
        <span className="mt-0.5 text-[10px] font-bold text-[#8a6412] whitespace-nowrap pl-0.5">
          {hint}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap truncate max-w-full ${TONES[tone]}`}
      title={text}
    >
      {text}
      {hint && <span className="font-bold normal-case opacity-75">({hint})</span>}
    </span>
  );
}

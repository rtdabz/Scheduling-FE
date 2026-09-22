type EmploymentType = "full-time" | "part-time" | null | undefined;

/** "Full-Time" / "Part-Time", or null when the record carries no type. */
export const employmentLabel = (type: EmploymentType): string | null =>
  type === "part-time" ? "Part-Time" : type === "full-time" ? "Full-Time" : null;

/**
 * Instructor option text for a native <select>, which cannot hold a badge:
 * "Name (Part-Time)", plus " - Conflict" when the assignment would clash.
 */
export const instructorOptionLabel = (name: string, type: EmploymentType, conflict = false): string => {
  const label = employmentLabel(type);
  return `${name}${label ? ` (${label})` : ""}${conflict ? " - Conflict" : ""}`;
};

export default function EmploymentBadge({ type, className = "" }: { type: EmploymentType; className?: string }) {
  const label = employmentLabel(type);
  if (!label) return null;

  return (
    <span
      className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        type === "part-time"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      } ${className}`}
    >
      {label}
    </span>
  );
}

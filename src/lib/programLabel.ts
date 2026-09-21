/**
 * A program is identified by its code *and* its major: one department can offer
 * BSED "Major in English" and BSED "Major in Mathematics" side by side. Every
 * place that prints a program therefore has to print the major too, so the
 * wording lives here instead of being re-invented per screen.
 */
export interface ProgramLike {
  code?: string | null;
  name?: string | null;
  major?: string | null;
}

const clean = (value?: string | null): string => (value ?? '').trim();

/** "Major in English", or null when the program has no major. */
export function programMajorLabel(program: ProgramLike | null | undefined): string | null {
  const major = clean(program?.major);

  return major === '' ? null : `Major in ${major}`;
}

/** The descriptive half: "Information Technology, Major in Web Development". */
export function programName(
  program: ProgramLike | null | undefined,
  fallback = 'Unnamed program'
): string {
  const name = clean(program?.name);
  const major = programMajorLabel(program);

  if (name === '') return major ?? fallback;

  return major === null ? name : `${name}, ${major}`;
}

/** The full label: "BSED — Bachelor of Secondary Education, Major in English". */
export function programLabel(
  program: ProgramLike | null | undefined,
  fallback = 'Unnamed program'
): string {
  const code = clean(program?.code);
  const name = programName(program, fallback);

  return code === '' ? name : `${code} — ${name}`;
}

export interface ProgramLike {
  code?: string | null;
  name?: string | null;
  major?: string | null;
}

const clean = (value?: string | null): string => (value ?? '').trim();

export function programMajorLabel(program: ProgramLike | null | undefined): string | null {
  const major = clean(program?.major);

  return major === '' ? null : `Major in ${major}`;
}

export function programName(
  program: ProgramLike | null | undefined,
  fallback = 'Unnamed program'
): string {
  const name = clean(program?.name);
  const major = programMajorLabel(program);

  if (name === '') return major ?? fallback;

  return major === null ? name : `${name}, ${major}`;
}

export function programLabel(
  program: ProgramLike | null | undefined,
  fallback = 'Unnamed program'
): string {
  const code = clean(program?.code);
  const name = programName(program, fallback);

  return code === '' ? name : `${code} — ${name}`;
}

import type { ScheduleItem, ScheduleSignatories } from "./types";

/** Current reviewers for unsigned drafts; recorded rows retain their own signature evidence. */
export interface CurrentLoadOfficials {
  preparedBy: string;
  preparedTitle?: string;
  verifiedBy: string;
  vpaaName: string;
  presidentName: string;
  presidentTitle: string;
}

const join = (names: Array<string | null | undefined>): string =>
  [...new Set(names.map((name) => name?.trim() ?? "").filter(Boolean))].join(" / ");

/**
 * The signature block of one instructor's load sheet. Approved rows sign with the officials recorded on
 * their submission when it was approved, so replacing or renaming the Dean, VPAA or President never
 * rewrites a past load. Unsigned drafts can use current reviewers; their preparer comes from the origin.
 */
export function loadSheetSignatories(
  schedules: ScheduleItem[],
  programId: number | string | null | undefined,
  current: CurrentLoadOfficials,
): CurrentLoadOfficials {
  const sets = [...new Set(schedules.map((schedule) => schedule.signatories).filter((set): set is ScheduleSignatories => Boolean(set)))];
  const useCurrent = schedules.length === 0 || (sets.length === 0 && schedules.every((schedule) => ["draft", "completed", "revision"].includes(schedule.status)));
  const missingRecorded = !useCurrent && schedules.some((schedule) => !schedule.signatories);
  const withCurrent = (recorded: Array<string | null | undefined>, now: string): string =>
    join(useCurrent ? [...recorded, now] : missingRecorded ? [...recorded, "Not recorded"] : recorded) || "Not recorded";

  const prepared = sets.flatMap((set) => set.prepared ?? []);
  const ownProgram = programId == null ? [] : prepared.filter((entry) => Number(entry.program_id) === Number(programId));
  const recordedTitle = sets.map((set) => set.approved?.title?.trim()).find(Boolean);

  const originNames = schedules.map((schedule) => schedule.creatorIdentity?.name || "Not recorded");
  const roleTitles: Record<string, string> = { program_head: "Program Head", secretary: "Program Head/Secretary", director: "Department Director", dean: "Dean", vpaa: "Vice-President for Academic Affairs" };
  const recordedPreparers = ownProgram.length ? ownProgram : prepared;
  const preparedTitle = useCurrent && schedules.length > 0
    ? join(schedules.map((schedule) => roleTitles[schedule.creatorIdentity?.role ?? ""] || "Schedule preparer"))
    : join(recordedPreparers.map((entry) => entry.title)) || (schedules.length === 0 ? current.preparedTitle : null) || "Schedule preparer";

  return {
    preparedBy: useCurrent && schedules.length > 0 ? join(originNames) : withCurrent(recordedPreparers.map((entry) => entry.name), current.preparedBy),
    preparedTitle,
    verifiedBy: withCurrent(sets.map((set) => set.reviewed?.name), current.verifiedBy),
    vpaaName: withCurrent(sets.map((set) => set.recommended?.name), current.vpaaName),
    presidentName: withCurrent(sets.map((set) => set.approved?.name), current.presidentName),
    presidentTitle: recordedTitle ?? (useCurrent ? current.presidentTitle : "Not recorded"),
  };
}

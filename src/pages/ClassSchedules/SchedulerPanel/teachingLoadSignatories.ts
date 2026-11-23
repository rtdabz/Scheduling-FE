import type { ScheduleItem, ScheduleSignatories } from "./types";

/** Current officials of the instructor's department; used for unsigned drafts and as the identity check for recorded ones. */
export interface CurrentLoadOfficials {
  preparedBy: string;
  preparedTitle?: string;
  verifiedBy: string;
  vpaaName: string;
  /** Account id of the active VPAA, so a recorded VPAA who is the same person prints under their current name. */
  vpaaUserId?: number | null;
  presidentName: string;
  presidentTitle: string;
}

export type LoadSheetSignatories = Omit<CurrentLoadOfficials, "vpaaUserId">;

const join = (names: Array<string | null | undefined>): string =>
  [...new Set(names.map((name) => name?.trim() ?? "").filter(Boolean))].join(" / ");

const UNSIGNED = ["draft", "completed", "revision"];

/** Honorifics and post-nominals that vary between records of the same person ("DR. X" vs "X, DM"). */
const AFFIXES = new Set(["DR", "ATTY", "ENGR", "PROF", "MR", "MS", "MRS", "HON", "DM", "DBM", "PHD", "EDD", "MA", "MSIT", "MIT", "MBA", "MPA", "MAED", "LPT", "CPA", "JR", "SR"]);
const corePersonName = (name: string | null | undefined): string =>
  (name ?? "").toUpperCase().replace(/[^A-ZÀ-ɏ\s]/g, " ").split(/\s+/).filter((token) => token && !AFFIXES.has(token)).join(" ");

/** Latest moment the workflow wrote this signature block; the newest block is the one in force. */
const recordedAt = (set: ScheduleSignatories): number => Math.max(0, ...[set.recorded_at, set.approved?.acted_at, set.recommended?.acted_at, set.reviewed?.acted_at]
  .map((stamp) => (stamp ? Date.parse(stamp) : 0))
  .filter((value) => Number.isFinite(value)));

/**
 * The signature block of one instructor's load sheet: exactly one official per line.
 *
 * - Only classes offered by the instructor's own department sign the sheet. A class lent by another
 *   department carries that department's Secretary and Dean, who do not sign this instructor's load.
 * - When the department's classes were approved on different submissions, the newest recorded block is
 *   used as a whole, so an older VPAA or President never appears beside the current one.
 * - The VPAA prints under the active account's exact name when the recorded VPAA is that same account,
 *   and the President under the institution setting when the recorded name is the same person.
 * - Unsigned drafts sign with the department's current officials; their preparer comes from the origin.
 */
export function loadSheetSignatories(
  schedules: ScheduleItem[],
  programId: number | string | null | undefined,
  current: CurrentLoadOfficials,
  homeDepartmentId?: number | string | null,
): LoadSheetSignatories {
  const { vpaaUserId, ...officials } = current;
  const home = homeDepartmentId == null
    ? schedules
    : schedules.filter((schedule) => Number(schedule.departmentId) === Number(homeDepartmentId));
  if (home.length === 0) return officials;

  const sets = [...new Set(home.map((schedule) => schedule.signatories).filter((set): set is ScheduleSignatories => Boolean(set)))];
  const latest = sets.reduce<ScheduleSignatories | null>((best, set) => (best === null || recordedAt(set) >= recordedAt(best) ? set : best), null);

  if (latest === null) {
    if (home.every((schedule) => UNSIGNED.includes(schedule.status))) {
      const roleTitles: Record<string, string> = { program_head: "Program Head", secretary: "Program Head/Secretary", director: "Department Director", dean: "Dean", vpaa: "Vice-President for Academic Affairs" };
      return {
        ...officials,
        preparedBy: join(home.map((schedule) => schedule.creatorIdentity?.name || "Not recorded")),
        preparedTitle: join(home.map((schedule) => roleTitles[schedule.creatorIdentity?.role ?? ""] || "Schedule preparer")),
      };
    }
    // Submitted rows whose officials were never recorded: today's officeholders did not sign them.
    return { preparedBy: "Not recorded", preparedTitle: "Schedule preparer", verifiedBy: "Not recorded", vpaaName: "Not recorded", presidentName: "Not recorded", presidentTitle: "Not recorded" };
  }

  const prepared = latest.prepared ?? [];
  const ownProgram = programId == null ? [] : prepared.filter((entry) => Number(entry.program_id) === Number(programId));
  const preparers = ownProgram.length ? ownProgram : prepared;

  const recommended = latest.recommended;
  const vpaaName = recommended && vpaaUserId != null && Number(recommended.user_id) === Number(vpaaUserId) && officials.vpaaName.trim()
    ? officials.vpaaName
    : recommended?.name;

  const approved = latest.approved;
  const samePresident = Boolean(approved?.name) && corePersonName(approved?.name) === corePersonName(officials.presidentName);

  return {
    preparedBy: join(preparers.map((entry) => entry.name)) || "Not recorded",
    preparedTitle: join(preparers.map((entry) => entry.title)) || "Schedule preparer",
    verifiedBy: latest.reviewed?.name?.trim() || "Not recorded",
    vpaaName: vpaaName?.trim() || "Not recorded",
    presidentName: (samePresident ? officials.presidentName : approved?.name)?.trim() || "Not recorded",
    presidentTitle: (samePresident ? officials.presidentTitle : approved?.title)?.trim() || "Not recorded",
  };
}

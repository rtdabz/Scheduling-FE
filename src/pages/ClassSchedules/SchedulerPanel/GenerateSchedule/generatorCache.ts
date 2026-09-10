/**
 * `dataCache` keys for the reference data the generator reads on open.
 *
 * The modal unmounts when it closes, so every reopen used to refetch the
 * curriculum list, the curriculum's course list, the scheduling rules and the
 * room list before the first step could render. These keys let those reads hit
 * the shared cache instead.
 *
 * Each key deliberately sits under a prefix that `lib/cacheGroups.ts` already
 * owns, so the mutations that change this data — a room edit, a course edit, a
 * curriculum change — evict the generator's copy without knowing it exists.
 * The one exception is the scheduling rules, which the generator itself
 * writes; that path updates the cache in place.
 */

/** Group: curriculum (`page:curriculum:`). */
export const activeCurriculaCacheKey = (departmentId: number): string =>
  `page:curriculum:active:${departmentId}`;

/** Group: courses (`page:courses:`). */
export const curriculumCoursesCacheKey = (
  departmentId: number,
  curriculumId: number,
): string => `page:courses:curriculum:${departmentId}:${curriculumId}`;

/** Group: schedules (`scheduler:`). Written through on PATCH. */
export const schedulingSettingsCacheKey = (sectionId: string): string =>
  `scheduler:scheduling-settings:${sectionId}`;

/** Group: rooms (`page:rooms:`). */
export const generatorRoomsCacheKey = (
  departmentId: number | null,
): string => `page:rooms:generator:${departmentId ?? "all"}`;

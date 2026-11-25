export const activeCurriculaCacheKey = (departmentId: number): string =>
  `page:curriculum:active:${departmentId}`;

export const curriculumCoursesCacheKey = (
  departmentId: number,
  curriculumId: number,
  actorScope = 'all',
): string => `page:courses:curriculum:v2:${actorScope}:${departmentId}:${curriculumId}`;

export const schedulingSettingsCacheKey = (sectionId: string): string =>
  `scheduler:scheduling-settings:${sectionId}`;

export const generatorRoomsCacheKey = (
  departmentId: number | null,
): string => `page:rooms:generator:${departmentId ?? "all"}`;

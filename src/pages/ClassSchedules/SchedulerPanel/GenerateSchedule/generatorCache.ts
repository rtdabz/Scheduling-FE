export const activeCurriculaCacheKey = (departmentId: number): string =>
  `page:curriculum:active:${departmentId}`;

export const curriculumCoursesCacheKey = (
  departmentId: number,
  curriculumId: number,
): string => `page:courses:curriculum:${departmentId}:${curriculumId}`;

export const schedulingSettingsCacheKey = (sectionId: string): string =>
  `scheduler:scheduling-settings:${sectionId}`;

export const generatorRoomsCacheKey = (
  departmentId: number | null,
): string => `page:rooms:generator:${departmentId ?? "all"}`;

export type ForcedDayAssignment = {
  course_id: number;
  day: string;
};

export type ForcedDayConcentration = {
  courseCount: number;
  day: string;
};

export function getForcedDayConcentration(
  savedRules: ForcedDayAssignment[],
  selectedCourseIds: number[],
  selectedDay: string,
): ForcedDayConcentration | null {
  const dayByCourseId = new Map<number, string>();

  for (const rule of savedRules) {
    const day = rule.day.trim();
    if (day) dayByCourseId.set(rule.course_id, day);
  }

  const pendingDay = selectedDay.trim();
  if (pendingDay) {
    for (const courseId of selectedCourseIds) dayByCourseId.set(courseId, pendingDay);
  }

  if (dayByCourseId.size < 2) return null;

  const days = new Set(dayByCourseId.values());
  if (days.size !== 1) return null;

  return {
    courseCount: dayByCourseId.size,
    day: days.values().next().value as string,
  };
}

import { describe, expect, it, vi } from "vitest";
import type { Course, Section } from "../types";
import type { CourseSetupConfig } from "./SetupCoursesStep";
import {
  applyCourseDefaults,
  compatibleRoomOptions,
  durationLabel,
  EMPTY_COURSE_DEFAULTS,
  integratedHybridMinutes,
  durationShape,
  formatHours,
  inferInitialCourseClassConfig,
  maxDurationMinutes,
  meetingParts,
  syncCourseConfigToSectionConfigs,
  type CourseClassConfig,
} from "./courseClassConfig";

describe("courseClassConfig", () => {
  const dummySections: Section[] = [
    {
      id: "sec-1",
      name: "BSIT 1A",
      yearLevel: 1,
      semester: "1st",
      departmentId: 1,
      semesterId: 1,
      status: "active",
    },
    {
      id: "sec-2",
      name: "BSIT 1B",
      yearLevel: 1,
      semester: "1st",
      departmentId: 1,
      semesterId: 1,
      status: "active",
    },
  ];

  const emptyConfigs: Record<string, CourseSetupConfig> = {
    "sec-1": {
      courseIds: ["c1", "c2", "c3"],
      splitCourseIds: [],
      gecSplitCourseIds: [],
    },
    "sec-2": {
      courseIds: ["c1", "c2", "c3"],
      splitCourseIds: [],
      gecSplitCourseIds: [],
    },
  };

  const lectureCourse: Course = {
    id: "c1",
    code: "IT 101",
    name: "Intro to Computing",
    units: 3,
    lectureHours: 3,
    labHours: 0,
    category: "major",
    semester: "1st",
    departmentId: 1,
    yearLevel: 1,
    roomTypeRequired: "lecture",
    status: "active",
  };

  // `lectureHours`/`labHours` hold units: 2 lecture + 1 laboratory = 3 units,
  // and one laboratory unit meets for three hours.
  const integratedCourse: Course = {
    id: "c2",
    code: "IT 103",
    name: "Integrated App Software",
    units: 3,
    lectureHours: 2,
    labHours: 1,
    category: "major",
    semester: "1st",
    departmentId: 1,
    yearLevel: 1,
    roomTypeRequired: "laboratory",
    status: "active",
  };

  const gecCourse: Course = {
    id: "c3",
    code: "GEC 1",
    name: "Understanding the Self",
    units: 3,
    lectureHours: 3,
    labHours: 0,
    category: "minor",
    semester: "1st",
    departmentId: 1,
    yearLevel: 1,
    roomTypeRequired: "lecture",
    status: "active",
  };

  const baseConfig: CourseClassConfig = {
    configuration: "regular",
    component: "lecture",
    delivery: "onsite",
    durationMinutes: 180,
    requiredDay: null,
    preferredRoomId: null,
    sectionScope: "all",
    selectedSectionIds: ["sec-1", "sec-2"],
  };

  it("formats hours correctly", () => {
    expect(formatHours(3)).toBe("3h");
    expect(formatHours(1.5)).toBe("1.5h");
    expect(formatHours(0)).toBe("0h");
  });

  it("infers Regular configuration for a pure lecture course", () => {
    const config = inferInitialCourseClassConfig(lectureCourse, emptyConfigs, dummySections, new Set());

    expect(config.configuration).toBe("regular");
    expect(config.component).toBe("lecture");
    expect(config.delivery).toBe("onsite");
    expect(config.durationMinutes).toBe(180);
    expect(durationLabel(config, lectureCourse)).toBe("3h");
    expect(config.requiredDay).toBeNull();
    expect(config.preferredRoomId).toBeNull();
    expect(config.sectionScope).toBe("all");
  });

  it("shows a lecture + lab course nobody configured as the one Regular meeting the Generator places", () => {
    const config = inferInitialCourseClassConfig(integratedCourse, emptyConfigs, dummySections, new Set());

    expect(config.configuration).toBe("regular");
    expect(durationShape(config)).toBe("single");
    expect(durationLabel(config, integratedCourse)).toBe("3h");
  });

  it("makes Integrated On-site a lecture and a laboratory, both face-to-face", () => {
    const config = { ...baseConfig, configuration: "integrated" as const, delivery: "onsite" as const };

    expect(durationShape(config)).toBe("integrated-onsite");
    expect(durationLabel(config, integratedCourse)).toBe("2h F2F + 3h F2F");
  });

  it("sends Integrated On-site as Integrated with an on-site lecture, and reads it back", () => {
    const onConfigChange = vi.fn();
    syncCourseConfigToSectionConfigs(
      integratedCourse,
      { ...baseConfig, configuration: "integrated", delivery: "onsite" },
      dummySections,
      emptyConfigs,
      onConfigChange,
    );

    const change = onConfigChange.mock.calls.find(([id]) => id === "sec-1")?.[1];
    expect(change.splitCourseIds).toEqual(["c2"]);
    expect(change.modesByCourseId).toEqual({ c2: "on-site" });

    const saved = Object.fromEntries(
      dummySections.map((s) => [s.id, { ...emptyConfigs[s.id], ...change }]),
    );
    const reopened = inferInitialCourseClassConfig(integratedCourse, saved, dummySections, new Set());
    expect(reopened.configuration).toBe("integrated");
    expect(reopened.delivery).toBe("onsite");
  });

  it("sizes each Integrated Hybrid session from the course and keeps them separate", () => {
    const config = { ...baseConfig, configuration: "integrated" as const, delivery: "hybrid" as const };

    expect(durationShape(config)).toBe("hybrid-laboratory");
    expect(durationLabel(config, integratedCourse)).toBe("2h Online + 3h F2F");
    expect(
      durationLabel(config, integratedCourse, {
        custom_lab_duration_override_enabled: true,
        custom_lab_duration_5_hours_enabled: true,
      }),
    ).toBe("2h Online + 5h F2F");
  });

  it("infers Split configuration when sections carry gecSplitCourseIds", () => {
    const splitConfigs: Record<string, CourseSetupConfig> = {
      "sec-1": { courseIds: ["c3"], splitCourseIds: [], gecSplitCourseIds: ["c3"] },
      "sec-2": { courseIds: ["c3"], splitCourseIds: [], gecSplitCourseIds: ["c3"] },
    };

    const config = inferInitialCourseClassConfig(gecCourse, splitConfigs, dummySections, new Set());

    expect(config.configuration).toBe("split");
    expect(config.delivery).toBe("onsite");
    expect(durationLabel(config, gecCourse)).toBe("1.5h + 1.5h");
    expect(config.sectionScope).toBe("all");
  });

  it("infers selected section scope when only one section has the override", () => {
    const partialConfigs: Record<string, CourseSetupConfig> = {
      "sec-1": { courseIds: ["c3"], splitCourseIds: [], gecSplitCourseIds: ["c3"] },
      "sec-2": { courseIds: ["c3"], splitCourseIds: [], gecSplitCourseIds: [] },
    };

    const config = inferInitialCourseClassConfig(gecCourse, partialConfigs, dummySections, new Set());

    expect(config.configuration).toBe("split");
    expect(config.sectionScope).toBe("selected");
    expect(config.selectedSectionIds).toEqual(["sec-1"]);
  });

  it("restores a saved duration, room and Required Day when Setup Courses reopens", () => {
    const savedConfigs: Record<string, CourseSetupConfig> = {
      "sec-1": {
        ...emptyConfigs["sec-1"],
        durationMinutesByCourseId: { c1: 120 },
        preferredRoomsByCourseId: { c1: "7" },
      },
      "sec-2": {
        ...emptyConfigs["sec-2"],
        durationMinutesByCourseId: { c1: 120 },
        preferredRoomsByCourseId: { c1: "7" },
      },
    };

    const config = inferInitialCourseClassConfig(lectureCourse, savedConfigs, dummySections, new Set(), "Saturday");

    expect(config.durationMinutes).toBe(120);
    expect(durationLabel(config, lectureCourse)).toBe("2h");
    expect(config.preferredRoomId).toBe("7");
    expect(config.requiredDay).toBe("Saturday");
  });

  it("caps a Split at the course's units and a single block at the larger Generator shape", () => {
    expect(maxDurationMinutes(gecCourse, "split")).toBe(180);
    expect(maxDurationMinutes(lectureCourse, "single")).toBe(180);
    // 2 h lecture + 3 h laboratory is longer than the 3-unit block.
    expect(maxDurationMinutes(integratedCourse, "single")).toBe(300);
  });

  it("syncs Split configuration to all section configs correctly", () => {
    const onConfigChange = vi.fn();

    syncCourseConfigToSectionConfigs(
      gecCourse,
      { ...baseConfig, configuration: "split" },
      dummySections,
      emptyConfigs,
      onConfigChange,
    );

    expect(onConfigChange).toHaveBeenCalledTimes(2);
    for (const sectionId of ["sec-1", "sec-2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, {
        splitCourseIds: [],
        gecSplitCourseIds: ["c3"],
        hybridSplitCourseIds: [],
        modesByCourseId: { c3: "on-site" },
        durationMinutesByCourseId: {},
        preferredRoomsByCourseId: {},
        componentMinutesByCourseId: {},
        preferredPeriodsByCourseId: {},
      });
    }
  });

  it("sends a custom duration and preferred room only to the targeted sections", () => {
    const onConfigChange = vi.fn();

    syncCourseConfigToSectionConfigs(
      lectureCourse,
      {
        ...baseConfig,
        durationMinutes: 120,
        preferredRoomId: "7",
        sectionScope: "selected",
        selectedSectionIds: ["sec-1"],
      },
      dummySections,
      emptyConfigs,
      onConfigChange,
    );

    expect(onConfigChange).toHaveBeenCalledWith("sec-1", expect.objectContaining({
      durationMinutesByCourseId: { c1: 120 },
      preferredRoomsByCourseId: { c1: "7" },
    }));
    expect(onConfigChange).not.toHaveBeenCalledWith("sec-2", expect.anything());
  });

  it("saves a field course's Preferred Meeting on every section, whatever the scope, and reads it back", () => {
    const onConfigChange = vi.fn();
    const fieldConfig: CourseClassConfig = {
      ...baseConfig,
      component: "field",
      preferredPeriods: ["morning", "afternoon"],
      sectionScope: "selected",
      selectedSectionIds: ["sec-1"],
    };

    syncCourseConfigToSectionConfigs(gecCourse, fieldConfig, dummySections, emptyConfigs, onConfigChange);

    for (const sectionId of ["sec-1", "sec-2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({
        preferredPeriodsByCourseId: { c3: ["morning", "afternoon"] },
      }));
    }

    const saved: Record<string, CourseSetupConfig> = {
      "sec-1": { ...emptyConfigs["sec-1"], preferredPeriodsByCourseId: { c3: ["morning", "afternoon"] } },
      "sec-2": { ...emptyConfigs["sec-2"], preferredPeriodsByCourseId: { c3: ["morning", "afternoon"] } },
    };
    expect(inferInitialCourseClassConfig(gecCourse, saved, dummySections, new Set()).preferredPeriods)
      .toEqual(["morning", "afternoon"]);

    // Clearing it removes it from every section.
    const cleared = vi.fn();
    syncCourseConfigToSectionConfigs(gecCourse, { ...fieldConfig, preferredPeriods: [] }, dummySections, saved, cleared);
    expect(cleared).toHaveBeenCalledWith("sec-2", expect.objectContaining({ preferredPeriodsByCourseId: {} }));
  });

  it("does not send a duration that equals the course's own, or one for a Hybrid shape", () => {
    const onConfigChange = vi.fn();
    const withStaleDuration: Record<string, CourseSetupConfig> = {
      "sec-1": { ...emptyConfigs["sec-1"], durationMinutesByCourseId: { c1: 120 } },
      "sec-2": { ...emptyConfigs["sec-2"], durationMinutesByCourseId: { c1: 120 } },
    };

    syncCourseConfigToSectionConfigs(lectureCourse, baseConfig, dummySections, withStaleDuration, onConfigChange);
    expect(onConfigChange).toHaveBeenCalledWith("sec-1", expect.objectContaining({ durationMinutesByCourseId: {} }));

    onConfigChange.mockClear();
    syncCourseConfigToSectionConfigs(
      integratedCourse,
      { ...baseConfig, configuration: "integrated", delivery: "hybrid", durationMinutes: 60 },
      dummySections,
      emptyConfigs,
      onConfigChange,
    );
    expect(onConfigChange).toHaveBeenCalledWith("sec-1", expect.objectContaining({ durationMinutesByCourseId: {} }));
  });

  it("syncs Integrated Hybrid configuration to selected sections only", () => {
    const onConfigChange = vi.fn();

    syncCourseConfigToSectionConfigs(
      integratedCourse,
      {
        ...baseConfig,
        configuration: "integrated",
        delivery: "hybrid",
        sectionScope: "selected",
        selectedSectionIds: ["sec-1"],
      },
      dummySections,
      emptyConfigs,
      onConfigChange,
    );

    // sec-1 is target -> splitCourseIds receives "c2" (hybrid)
    expect(onConfigChange).toHaveBeenCalledWith("sec-1", {
      splitCourseIds: ["c2"],
      gecSplitCourseIds: [],
      hybridSplitCourseIds: [],
      modesByCourseId: {},
      durationMinutesByCourseId: {},
      preferredRoomsByCourseId: {},
      componentMinutesByCourseId: {},
      preferredPeriodsByCourseId: {},
    });
    // sec-2 was already empty, so no change triggered
    expect(onConfigChange).not.toHaveBeenCalledWith("sec-2", expect.anything());
  });

  it("offers only rooms the Generator could place the course in", () => {
    const rooms = [
      { id: 1, room_code: "LEC 1", room_type: "lecture" },
      { id: 2, room_code: "LAB 1", room_type: "laboratory", allow_lecture_usage: false },
      { id: 3, room_code: "LAB 2", room_type: "laboratory", allow_lecture_usage: true },
      { id: 4, room_code: "GYM", room_type: "field" },
    ];

    expect(compatibleRoomOptions(lectureCourse, baseConfig, false, rooms).map((r) => r.room_code)).toEqual(["LEC 1", "LAB 2"]);
    expect(compatibleRoomOptions(integratedCourse, baseConfig, false, rooms).map((r) => r.room_code)).toEqual(["LAB 1", "LAB 2"]);
    expect(compatibleRoomOptions(lectureCourse, { ...baseConfig, delivery: "online" }, false, rooms)).toEqual([]);
    // A course already on the field list keeps its classrooms: clearing the
    // field room is how it goes back to being a regular class.
    expect(compatibleRoomOptions(lectureCourse, baseConfig, true, rooms).map((r) => r.room_code)).toEqual(["LEC 1", "LAB 2", "GYM"]);
    // Only a course whose record requires the field is limited to field rooms.
    expect(
      compatibleRoomOptions({ ...gecCourse, roomTypeRequired: "field" }, baseConfig, false, rooms).map((r) => r.room_code),
    ).toEqual(["GYM"]);
    // A minor may never use a laboratory, even one flagged for lecture use.
    // A lecture-only minor (PATHFIT, NSTP) may pick a field room, which makes
    // it a field course; with no preference it is a regular minor.
    expect(compatibleRoomOptions(gecCourse, baseConfig, false, rooms).map((r) => r.room_code)).toEqual(["LEC 1", "GYM"]);
    // Integrated Hybrid's only face-to-face session is its laboratory.
    expect(
      compatibleRoomOptions(integratedCourse, { configuration: "integrated", delivery: "hybrid" }, false, rooms).map((r) => r.room_code),
    ).toEqual(["LAB 1", "LAB 2"]);
  });

  it("derives Integrated Hybrid lengths from any course, not a fixed 2h + 3h", () => {
    const heavier: Course = { ...integratedCourse, id: "c9", units: 5, lectureHours: 3, labHours: 2 };
    const config = { ...baseConfig, configuration: "integrated" as const, delivery: "hybrid" as const };

    expect(meetingParts(config, heavier)).toEqual([
      { label: "Lecture", minutes: 180, mode: "Online" },
      { label: "Laboratory", minutes: 360, mode: "F2F" },
    ]);
  });

  it("uses and sends the Integrated Hybrid lengths the user chose", () => {
    const config = {
      ...baseConfig,
      configuration: "integrated" as const,
      delivery: "hybrid" as const,
      lectureMinutes: 90,
      laboratoryMinutes: 210,
    };
    const onConfigChange = vi.fn();

    expect(meetingParts(config, integratedCourse)).toEqual([
      { label: "Lecture", minutes: 90, mode: "Online" },
      { label: "Laboratory", minutes: 210, mode: "F2F" },
    ]);

    syncCourseConfigToSectionConfigs(integratedCourse, config, dummySections, emptyConfigs, onConfigChange);
    expect(onConfigChange).toHaveBeenCalledWith("sec-1", expect.objectContaining({
      splitCourseIds: ["c2"],
      componentMinutesByCourseId: { c2: { lecture: 90, laboratory: 210 } },
    }));

    // Back at the course's own lengths, nothing is sent.
    onConfigChange.mockClear();
    const saved: Record<string, CourseSetupConfig> = {
      "sec-1": { ...emptyConfigs["sec-1"], splitCourseIds: ["c2"], componentMinutesByCourseId: { c2: { lecture: 90, laboratory: 210 } } },
      "sec-2": { ...emptyConfigs["sec-2"], splitCourseIds: ["c2"], componentMinutesByCourseId: { c2: { lecture: 90, laboratory: 210 } } },
    };
    syncCourseConfigToSectionConfigs(
      integratedCourse,
      { ...config, lectureMinutes: 120, laboratoryMinutes: 180 },
      dummySections,
      saved,
      onConfigChange,
    );
    expect(onConfigChange).toHaveBeenCalledWith("sec-1", expect.objectContaining({ componentMinutesByCourseId: {} }));
  });

  describe("Default Settings", () => {
    const defaults = { ...EMPTY_COURSE_DEFAULTS };

    it("sets a lecture course's length, and keeps its own when the default does not fit", () => {
      const shorter = applyCourseDefaults(baseConfig, lectureCourse, { ...defaults, lectureMinutes: 120 });
      expect(shorter).toMatchObject({ applied: true, skipped: false });
      expect(shorter.config.durationMinutes).toBe(120);

      // Longer than the three units allow a week: the course keeps 3h.
      const longer = applyCourseDefaults(baseConfig, lectureCourse, { ...defaults, lectureMinutes: 240 });
      expect(longer).toMatchObject({ applied: false, skipped: true });
      expect(longer.config.durationMinutes).toBe(180);
    });

    it("needs whole slots per meeting for a Split", () => {
      const split = { ...baseConfig, configuration: "split" as const };
      expect(applyCourseDefaults(split, gecCourse, { ...defaults, lectureMinutes: 90 }).skipped).toBe(true);
      expect(applyCourseDefaults(split, gecCourse, { ...defaults, lectureMinutes: 120 }).config.durationMinutes).toBe(120);
    });

    it("sets each Integrated session, within the course's week", () => {
      const integrated = { ...baseConfig, configuration: "integrated" as const };

      const fits = applyCourseDefaults(integrated, integratedCourse, { ...defaults, laboratoryMinutes: 150 });
      expect(fits.applied).toBe(true);
      expect(integratedHybridMinutes(fits.config, integratedCourse)).toEqual({ lecture: 120, laboratory: 150 });

      // 2h lecture + 4h laboratory is past the 5h this course may meet.
      const tooLong = applyCourseDefaults(integrated, integratedCourse, { ...defaults, laboratoryMinutes: 240 });
      expect(tooLong.skipped).toBe(true);
      expect(integratedHybridMinutes(tooLong.config, integratedCourse)).toEqual({ lecture: 120, laboratory: 180 });
    });

    it("leaves field courses and blank defaults alone", () => {
      const field = { ...baseConfig, component: "field" as const };
      expect(applyCourseDefaults(field, gecCourse, { ...defaults, lectureMinutes: 60 })).toEqual({
        config: field,
        applied: false,
        skipped: false,
      });
      expect(applyCourseDefaults(baseConfig, lectureCourse, defaults).config.durationMinutes).toBe(180);
    });
  });

  it("shows Hybrid Split as one online and one face-to-face session", () => {
    const config = { ...baseConfig, configuration: "split" as const, delivery: "hybrid" as const };

    expect(meetingParts(config, gecCourse)).toEqual([
      { label: "Meeting 1", minutes: 90, mode: "Online" },
      { label: "Meeting 2", minutes: 90, mode: "F2F" },
    ]);
    expect(durationLabel(config, gecCourse)).toBe("1.5h Online + 1.5h F2F");
  });
});

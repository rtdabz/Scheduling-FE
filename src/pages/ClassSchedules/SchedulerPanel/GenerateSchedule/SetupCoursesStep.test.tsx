import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SetupCoursesStep from "./SetupCoursesStep";
import type { Course, Section } from "../types";

describe("SetupCoursesStep", () => {
  afterEach(cleanup);

  const mockCourses: Course[] = [
    {
      id: "c1",
      code: "IT 101",
      name: "Introduction to Computing",
      units: 3,
      lectureHours: 3,
      labHours: 0,
      category: "major",
      semester: "1st",
      departmentId: 1,
      yearLevel: 1,
      roomTypeRequired: "lecture",
      status: "active",
    },
    {
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
    },
  ];

  const mockSections: Section[] = [
    {
      id: "s1",
      name: "BSIT 1A",
      yearLevel: 1,
      semester: "1st",
      departmentId: 1,
      semesterId: 1,
      status: "active",
    },
    {
      id: "s2",
      name: "BSIT 1B",
      yearLevel: 1,
      semester: "1st",
      departmentId: 1,
      semesterId: 1,
      status: "active",
    },
  ];

  const mockConfigs = {
    s1: {
      courseIds: ["c1", "c2"],
      splitCourseIds: [],
      gecSplitCourseIds: [],
    },
    s2: {
      courseIds: ["c1", "c2"],
      splitCourseIds: [],
      gecSplitCourseIds: [],
    },
  };

  it("includes every course by default and excludes one when it is unchecked", () => {
    const onExcludedChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={vi.fn()}
        settings={null}
        onExcludedChange={onExcludedChange}
        actionsDisabled={false}
      />,
    );

    const it101 = screen.getByRole("checkbox", { name: "Include IT 101 in generation" }) as HTMLInputElement;
    expect(it101.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Include every course" }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(it101);
    expect(onExcludedChange).toHaveBeenLastCalledWith(["c1"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Include every course" }));
    expect(onExcludedChange).toHaveBeenLastCalledWith(["c1", "c2"]);
  });

  it("shows an excluded course as excluded", () => {
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={vi.fn()}
        settings={null}
        excludedCourseIds={["c1"]}
        actionsDisabled={false}
      />,
    );

    expect((screen.getByRole("checkbox", { name: "Include IT 101 in generation" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Excluded")).toBeDefined();
    expect(screen.getByText(/of 2 Courses included/).textContent).toContain("1");
  });

  it("renders the table with Regular, Split, Integrated checkboxes and Delivery Mode dropdown", () => {
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={vi.fn()}
        settings={{
          gec_split_schedule_override_enabled: true,
          major_lecture_split_schedule_override_enabled: true,
          lecture_lab_schedule_override_enabled: true,
        }}
        actionsDisabled={false}
      />,
    );

    // Column headers check
    expect(screen.getByRole("columnheader", { name: "Course" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Regular" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Split" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Integrated" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Delivery Mode" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Duration" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Configure" })).toBeDefined();

    // Checkboxes check
    const regularCheckboxes = screen.getAllByRole("checkbox", { name: /Regular/i });
    const splitCheckboxes = screen.getAllByRole("checkbox", { name: /Split/i });
    const integratedCheckboxes = screen.getAllByRole("checkbox", { name: /Integrated/i });

    expect(regularCheckboxes.length).toBe(2);
    expect(splitCheckboxes.length).toBe(2);
    expect(integratedCheckboxes.length).toBe(2);

    // IT 101 starts as Regular -> checked
    expect(regularCheckboxes[0].getAttribute("aria-checked")).toBe("true");
    expect(splitCheckboxes[0].getAttribute("aria-checked")).toBe("false");

    // IT 103 (lecture + lab) starts Regular: one full-length meeting in a laboratory
    // room. Integrated is optional. Split is never offered.
    expect(regularCheckboxes[1].getAttribute("aria-checked")).toBe("true");
    expect(integratedCheckboxes[1].getAttribute("aria-checked")).toBe("false");
    expect(integratedCheckboxes[1].hasAttribute("disabled")).toBe(false);
    expect(splitCheckboxes[1].hasAttribute("disabled")).toBe(true);
    // The Duration column shows the course's Total Hours, as before.
    expect(screen.queryByText("2h lecture + 1h laboratory")).toBeNull();
    // A laboratory session never meets online.
    expect(screen.getByRole("combobox", { name: "Delivery mode for IT 103" }).textContent).not.toContain("Online");

    // Delivery Mode dropdown options for Regular course IT 101
    const it101Select = screen.getByRole("combobox", { name: "Delivery mode for IT 101" });
    expect(it101Select).toBeDefined();
    expect(it101Select.textContent).toContain("On-Site");
    expect(it101Select.textContent).toContain("Online");

    // Once IT 103 is Integrated, its delivery is On-Site or Hybrid.
    fireEvent.click(integratedCheckboxes[1]);
    const it103Select = screen.getByRole("combobox", { name: "Delivery mode for IT 103" });
    expect(it103Select.textContent).toContain("On-Site");
    expect(it103Select.textContent).toContain("Hybrid");
  });

  it("toggles Split checkbox directly from the table and updates section configs", () => {
    const onConfigChange = vi.fn();

    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={{
          gec_split_schedule_override_enabled: true,
          major_lecture_split_schedule_override_enabled: true,
          lecture_lab_schedule_override_enabled: true,
        }}
        actionsDisabled={false}
      />,
    );

    // Click Split checkbox for IT 101
    const splitCheckbox = screen.getByRole("checkbox", { name: "Split for IT 101" });
    fireEvent.click(splitCheckbox);

    // Should sync to section configs
    expect(onConfigChange).toHaveBeenCalledWith("s1", {
      splitCourseIds: [],
      gecSplitCourseIds: ["c1"],
      hybridSplitCourseIds: [],
      modesByCourseId: { c1: "on-site" },
      preferredRoomsByCourseId: {},
    });
    expect(onConfigChange).toHaveBeenCalledWith("s2", {
      splitCourseIds: [],
      gecSplitCourseIds: ["c1"],
      hybridSplitCourseIds: [],
      modesByCourseId: { c1: "on-site" },
      preferredRoomsByCourseId: {},
    });

    // IT 101 dropdown should now offer On-Site | Hybrid | Online
    const it101Select = screen.getByRole("combobox", { name: "Delivery mode for IT 101" });
    expect(it101Select.textContent).toContain("On-Site");
    expect(it101Select.textContent).toContain("Hybrid");
    expect(it101Select.textContent).toContain("Online");

    // Duration should display two meetings
    expect(screen.getByText("1.5h + 1.5h")).toBeDefined();

    // Online Split: both meetings online, still a Split Session.
    onConfigChange.mockClear();
    fireEvent.change(it101Select, { target: { value: "online" } });
    expect(onConfigChange).toHaveBeenCalledWith("s1", expect.objectContaining({
      gecSplitCourseIds: ["c1"],
      hybridSplitCourseIds: [],
      modesByCourseId: { c1: "online" },
    }));
    expect(screen.getByText("1.5h Online + 1.5h Online")).toBeDefined();
  });

  it("changes delivery mode directly via table dropdown", () => {
    const onConfigChange = vi.fn();

    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={{
          lecture_lab_schedule_override_enabled: true,
        }}
        actionsDisabled={false}
      />,
    );

    // Choosing Integrated makes IT 103 lecture + lab, both on site.
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Integrated/i })[1]);
    expect(onConfigChange).toHaveBeenCalledWith("s1", {
      splitCourseIds: ["c2"],
      gecSplitCourseIds: [],
      hybridSplitCourseIds: [],
      modesByCourseId: { c2: "on-site" },
      preferredRoomsByCourseId: {},
    });

    // Hybrid moves only the lecture online: the on-site mode is dropped.
    const it103Select = screen.getByRole("combobox", { name: "Delivery mode for IT 103" });
    fireEvent.change(it103Select, { target: { value: "hybrid" } });

    expect(onConfigChange).toHaveBeenCalledWith("s1", {
      splitCourseIds: ["c2"],
      gecSplitCourseIds: [],
      hybridSplitCourseIds: [],
      modesByCourseId: {},
      preferredRoomsByCourseId: {},
    });
  });

  it("opens Configure sidebar on the right when Configure button is clicked and supports exceptions", () => {
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={vi.fn()}
        settings={null}
        actionsDisabled={false}
      />,
    );

    // Verify top toolbar with filter buttons and scope stats
    expect(screen.getByPlaceholderText(/Search course code or name/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^All/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Regular/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Split/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Integrated/i })).toBeDefined();

    const configButtons = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(configButtons[0]);

    // Right sidebar should appear
    expect(screen.getByRole("region", { name: /Configure IT 101/i })).toBeDefined();
    // IT 101 has no laboratory units, so there is no Lecture/Laboratory choice.
    expect(screen.queryByText("Class Component")).toBeNull();
    expect(screen.queryByRole("button", { name: /Laboratory Only/i })).toBeNull();

    // The class duration is the course's Total Hours, shown but not editable.
    expect(screen.queryByText(/Custom Time Duration/i)).toBeNull();
    expect(screen.queryByLabelText(/Duration in hours/i)).toBeNull();
    expect(screen.getByText("Total 3h / week")).toBeDefined();
    expect(screen.getByText(/From the course's Total Hours \(3h lecture\)/)).toBeDefined();

    // Configure applies to the course's existing sections; there is no Apply To choice.
    expect(screen.queryByText("Apply To")).toBeNull();
    expect(screen.queryByLabelText(/Selected Sections Only/i)).toBeNull();
  });

  const roomOptions = [
    { id: 7, room_code: "LEC 7", room_type: "lecture", building: "Main" },
    { id: 8, room_code: "LAB 8", room_type: "laboratory", allow_lecture_usage: false },
  ];

  it.each([false, true])("never offers Field rooms to a laboratory course (Integrated: %s)", (integrated) => {
    const lab = mockCourses.find((course) => course.labHours > 0)!;
    const onFieldCourseChange = vi.fn();
    render(<SetupCoursesStep courses={[lab]} sections={mockSections}
      configs={Object.fromEntries(mockSections.map((section) => [section.id, {
        ...mockConfigs.s1, splitCourseIds: integrated ? [lab.id] : [], modesByCourseId: { [lab.id]: "on-site" },
      }]))}
      settings={{ field_course_codes: [lab.code], preferred_room_options: [...roomOptions, { id: 9, room_code: "FIELD", room_type: "field" }] }}
      onConfigChange={vi.fn()} onFieldCourseChange={onFieldCourseChange} actionsDisabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const preference = screen.getByLabelText(/Preferred Room/i) as HTMLSelectElement;
    expect([...preference.options].map((option) => option.textContent)).toContain("LAB 8");
    expect(preference.textContent).not.toContain("FIELD");
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));
    expect(onFieldCourseChange).not.toHaveBeenCalled();
  });

  it("applies an optional Required Day and Preferred Room from Configure", () => {
    const onConfigChange = vi.fn();
    const onRequiredDayChange = vi.fn();

    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={{ preferred_room_options: roomOptions }}
        onRequiredDayChange={onRequiredDayChange}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[0]);

    const requiredDay = screen.getByLabelText(/Required Day/i) as HTMLSelectElement;
    expect(requiredDay.value).toBe("");
    fireEvent.change(requiredDay, { target: { value: "Saturday" } });

    // A lecture course is offered lecture rooms only.
    const room = screen.getByLabelText(/Preferred Room/i) as HTMLSelectElement;
    expect(room.textContent).toContain("LEC 7");
    expect(room.textContent).not.toContain("LAB 8");
    fireEvent.change(room, { target: { value: "7" } });

    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    expect(onRequiredDayChange).toHaveBeenCalledWith("c1", "Saturday");
    for (const sectionId of ["s1", "s2"]) {
      const change = onConfigChange.mock.calls.find(([id]) => id === sectionId)?.[1];
      expect(change).toMatchObject({ preferredRoomsByCourseId: { c1: "7" } });
      expect(change).not.toHaveProperty("durationMinutesByCourseId");
    }
  });

  it("holds a course with a Required Day to one Regular meeting", () => {
    const splitConfigs = {
      s1: { ...mockConfigs.s1, gecSplitCourseIds: ["c1"] },
      s2: { ...mockConfigs.s2, gecSplitCourseIds: ["c1"] },
    };
    const onConfigChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={[mockCourses[0]]}
        sections={mockSections}
        configs={splitConfigs}
        onConfigChange={onConfigChange}
        settings={{ forced_day_rules: [{ course_id: "c1" as unknown as number, day: "Saturday" }] }}
        actionsDisabled={false}
      />,
    );
    const split = screen.getByRole("checkbox", { name: "Split for IT 101" }) as HTMLButtonElement;
    expect(split.getAttribute("aria-checked")).toBe("false");
    expect(split.disabled).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Regular for IT 101" }).getAttribute("aria-checked")).toBe("true");

    // Saving from Configure drops the stale Split marker.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));
    expect(onConfigChange).toHaveBeenCalledWith("s1", expect.objectContaining({ gecSplitCourseIds: [] }));
  });

  it("saves a Split course given a Required Day in Configure as a Regular class", () => {
    const onConfigChange = vi.fn();
    const onRequiredDayChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={[mockCourses[0]]}
        sections={mockSections}
        configs={{
          s1: { ...mockConfigs.s1, gecSplitCourseIds: ["c1"] },
          s2: { ...mockConfigs.s2, gecSplitCourseIds: ["c1"] },
        }}
        onConfigChange={onConfigChange}
        settings={{}}
        onRequiredDayChange={onRequiredDayChange}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.change(screen.getByLabelText(/Required Day/i), { target: { value: "Saturday" } });
    expect(screen.getByText(/becomes a Regular class/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    expect(onRequiredDayChange).toHaveBeenCalledWith("c1", "Saturday");
    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({ gecSplitCourseIds: [] }));
    }
  });

  it("shows an Integrated course's lecture and laboratory hours, fixed", () => {
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={{
          s1: { ...mockConfigs.s1, splitCourseIds: ["c2"] },
          s2: { ...mockConfigs.s2, splitCourseIds: ["c2"] },
        }}
        onConfigChange={vi.fn()}
        settings={null}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[1]);

    expect(screen.queryByLabelText(/Lecture duration in hours/i)).toBeNull();
    expect(screen.queryByLabelText(/Laboratory duration in hours/i)).toBeNull();
    expect(screen.getByText("2h lecture Online + 1h laboratory Face to Face")).toBeDefined();
    expect(screen.getByText("Total 3h / week")).toBeDefined();
  });

  it("keeps Hybrid Split fixed", () => {
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={{
          s1: { ...mockConfigs.s1, gecSplitCourseIds: ["c1"], hybridSplitCourseIds: ["c1"] },
          s2: { ...mockConfigs.s2, gecSplitCourseIds: ["c1"], hybridSplitCourseIds: ["c1"] },
        }}
        onConfigChange={vi.fn()}
        settings={null}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[0]);

    expect(screen.queryByLabelText(/Duration in hours/i)).toBeNull();
    expect(screen.getByText("Hybrid Split · 1.5h meeting 1 Online + 1.5h meeting 2 Face to Face")).toBeDefined();
  });

  describe("Consecutive Days", () => {
    // Eight Total Hours, repeated in full on every day it meets.
    const clinical: Course = {
      id: "101",
      code: "NCM 101",
      name: "Clinical Duty",
      units: 8,
      lectureHours: 0,
      labHours: 8,
      category: "major",
      semester: "1st",
      departmentId: 1,
      yearLevel: 1,
      roomTypeRequired: "laboratory",
      status: "active",
    };
    const sections: Section[] = mockSections.map((section, index) => ({ ...section, id: String(index + 1) }));
    const configs = {
      "1": { courseIds: ["101"], splitCourseIds: [], gecSplitCourseIds: [] },
      "2": { courseIds: ["101"], splitCourseIds: [], gecSplitCourseIds: [] },
    };
    const savedRun = (dayCount: number) => [
      { course_id: 101, section_id: null, day_count: dayCount, preferred_start_day: null },
    ];

    it("is a Regular class's option in Configure, not a class type of its own", () => {
      const onConsecutiveDaysChange = vi.fn();
      const onRequiredDayChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={[clinical]}
          sections={sections}
          configs={configs}
          onConfigChange={vi.fn()}
          settings={{ forced_day_rules: [{ course_id: 101, day: "Monday" }] }}
          onRequiredDayChange={onRequiredDayChange}
          onConsecutiveDaysChange={onConsecutiveDaysChange}
          actionsDisabled={false}
        />,
      );

      expect(screen.queryByRole("checkbox", { name: /Consecutive Days for/ })).toBeNull();
      expect(screen.getByRole("checkbox", { name: "Regular for NCM 101" }).getAttribute("aria-checked")).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: /configure/i }));
      const requiredDay = screen.getByLabelText(/Required Day/i) as HTMLSelectElement;
      expect(requiredDay.value).toBe("Monday");

      fireEvent.click(screen.getByLabelText("Meet on several days a week"));
      // The Required Day cannot be combined with a run.
      expect((screen.getByLabelText(/Required Day/i) as HTMLSelectElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
      fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

      // Saved with the Required Day cleared, in one change.
      expect(onConsecutiveDaysChange).toHaveBeenCalledWith(
        "101",
        [{ course_id: 101, section_id: null, day_count: 2, preferred_start_day: "Monday", meeting_days: ["Monday", "Tuesday"] }],
        null,
      );
      expect(onRequiredDayChange).not.toHaveBeenCalled();
      expect(screen.getByText("2 days · Mon–Tue")).toBeDefined();
      expect(screen.getByText("8h/day × 2 days = 16h")).toBeDefined();
    });

    it("offers only the Preferred Days as meeting days and Required Days", () => {
      render(
        <SetupCoursesStep
          courses={[clinical]}
          sections={sections}
          configs={configs}
          onConfigChange={vi.fn()}
          settings={{ sunday_classes_enabled: false }}
          preferredDays={["Monday", "Tuesday"]}
          actionsDisabled={false}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /configure/i }));
      const requiredDay = screen.getByLabelText(/Required Day/i) as HTMLSelectElement;
      const option = (day: string) =>
        Array.from(requiredDay.options).find((item) => item.value === day) as HTMLOptionElement;
      expect(option("Monday").disabled).toBe(false);
      expect(option("Wednesday").disabled).toBe(true);

      fireEvent.click(screen.getByLabelText("Meet on several days a week"));
      const day = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
      expect(day("Monday").disabled).toBe(false);
      expect(day("Tuesday").disabled).toBe(false);
      for (const skipped of ["Wednesday", "Thursday", "Friday", "Saturday"]) {
        expect(day(skipped).disabled).toBe(true);
      }
    });

    it("repeats the Total Hours on every ticked day, with no divisibility limit", () => {
      const onConsecutiveDaysChange = vi.fn();
      const onConfigChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={[clinical]}
          sections={sections}
          configs={configs}
          onConfigChange={onConfigChange}
          settings={{ sunday_classes_enabled: false, consecutive_day_rules: savedRun(2) }}
          onConsecutiveDaysChange={onConsecutiveDaysChange}
          actionsDisabled={false}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /configure/i }));
      expect((screen.getByLabelText("Meet on several days a week") as HTMLInputElement).checked).toBe(true);
      expect(screen.queryByLabelText(/Duration in hours/i)).toBeNull();
      // Sunday classes are off, so the week ends on Saturday.
      expect(screen.queryByRole("checkbox", { name: "Sunday" })).toBeNull();

      // Eight hours on three days, formerly refused as indivisible, is 8 hours on each day.
      for (const day of ["Thursday", "Friday", "Saturday"]) {
        fireEvent.click(screen.getByRole("checkbox", { name: day }));
      }
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("8h/day × 3 days = 24h")).toBeDefined();
      expect(screen.getByText("Total 24h / week")).toBeDefined();
      const apply = screen.getByRole("button", { name: /Apply Configuration/i }) as HTMLButtonElement;
      expect(apply.disabled).toBe(false);

      fireEvent.click(screen.getByRole("checkbox", { name: "Saturday" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getAllByText("8h/day × 2 days = 16h").length).toBeGreaterThan(0);
      fireEvent.click(apply);

      expect(onConsecutiveDaysChange).toHaveBeenCalledWith(
        "101",
        [{
          course_id: 101,
          section_id: null,
          day_count: 2,
          preferred_start_day: "Thursday",
          meeting_days: ["Thursday", "Friday"],
        }],
        null,
      );
      for (const [, change] of onConfigChange.mock.calls) {
        expect(change).not.toHaveProperty("durationMinutesByCourseId");
      }
      expect(screen.getByText("8h/day × 2 days = 16h")).toBeDefined();
      expect(screen.getByText("2 days · Thu–Fri")).toBeDefined();
    });

    it("takes days that are not back-to-back and needs at least two", () => {
      const onConsecutiveDaysChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={[clinical]}
          sections={sections}
          configs={configs}
          onConfigChange={vi.fn()}
          settings={{ sunday_classes_enabled: false, consecutive_day_rules: savedRun(2) }}
          onConsecutiveDaysChange={onConsecutiveDaysChange}
          actionsDisabled={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /configure/i }));
      const apply = () => screen.getByRole("button", { name: /Apply Configuration/i }) as HTMLButtonElement;

      // A saved rule with no days is not applied until days are ticked.
      expect(apply().disabled).toBe(true);

      fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    expect(screen.getByRole("alert").textContent).toContain("Pick at least two days");
      expect(apply().disabled).toBe(true);

      fireEvent.click(screen.getByRole("checkbox", { name: "Wednesday" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(/Every section meets Monday, Wednesday/)).toBeDefined();
      fireEvent.click(apply());

      expect(onConsecutiveDaysChange).toHaveBeenCalledWith(
        "101",
        [{
          course_id: 101,
          section_id: null,
          day_count: 2,
          preferred_start_day: "Monday",
          meeting_days: ["Monday", "Wednesday"],
        }],
        null,
      );
      expect(screen.getByText("2 days · Mon, Wed")).toBeDefined();
    });

    it("drops the rule when the class goes back to one meeting a week", () => {
      const onConsecutiveDaysChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={[clinical]}
          sections={sections}
          configs={configs}
          onConfigChange={vi.fn()}
          settings={{ consecutive_day_rules: savedRun(3) }}
          onConsecutiveDaysChange={onConsecutiveDaysChange}
          actionsDisabled={false}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /configure/i }));
      fireEvent.click(screen.getByLabelText("Meet on several days a week"));
      fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

      expect(onConsecutiveDaysChange).toHaveBeenCalledWith("101", [], null);
      expect(screen.queryByText(/consecutive days/)).toBeNull();
    });
  });

  describe("Lecture and Laboratory Required Days", () => {
    const integratedConfigs = (pins?: Record<string, string>) => ({
      s1: {
        ...mockConfigs.s1,
        splitCourseIds: ["c2"],
        modesByCourseId: { c2: "on-site" as const },
        ...(pins ? { componentRequiredDaysByCourseId: { c2: pins } } : {}),
      },
      s2: {
        ...mockConfigs.s2,
        splitCourseIds: ["c2"],
        modesByCourseId: { c2: "on-site" as const },
        ...(pins ? { componentRequiredDaysByCourseId: { c2: pins } } : {}),
      },
    });

    it("sets each component's day for an Integrated course and keeps it Integrated", () => {
      const onConfigChange = vi.fn();
      const onRequiredDayChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={mockCourses}
          sections={mockSections}
          configs={integratedConfigs()}
          onConfigChange={onConfigChange}
          settings={{}}
          onRequiredDayChange={onRequiredDayChange}
          actionsDisabled={false}
        />,
      );

      fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[1]);
      expect(screen.queryByLabelText(/^Required Day/)).toBeNull();
      fireEvent.change(screen.getByLabelText("Lecture Required Day"), { target: { value: "Monday" } });
      fireEvent.change(screen.getByLabelText("Laboratory Required Day"), { target: { value: "Thursday" } });
      fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

      expect(onRequiredDayChange).not.toHaveBeenCalled();
      for (const sectionId of ["s1", "s2"]) {
        const change = onConfigChange.mock.calls.find(([id]) => id === sectionId)?.[1];
        expect(change).toMatchObject({
          splitCourseIds: ["c2"],
          modesByCourseId: { c2: "on-site" },
          componentRequiredDaysByCourseId: { c2: { lecture: "Monday", laboratory: "Thursday" } },
        });
      }
    });

    it("explains same-day and Preferred Day conflicts beside the controls", () => {
      render(
        <SetupCoursesStep
          courses={mockCourses}
          sections={mockSections}
          configs={integratedConfigs()}
          onConfigChange={vi.fn()}
          settings={{}}
          preferredDays={["Monday", "Tuesday", "Wednesday"]}
          actionsDisabled={false}
        />,
      );

      fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[1]);
      const laboratory = screen.getByLabelText("Laboratory Required Day") as HTMLSelectElement;
      const thursday = Array.from(laboratory.options).find((option) => option.value === "Thursday");
      expect(thursday?.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText("Lecture Required Day"), { target: { value: "Monday" } });
      fireEvent.change(laboratory, { target: { value: "Monday" } });
      expect(screen.getByRole("alert").textContent).toMatch(/different days/);
      expect((screen.getByRole("button", { name: /Apply Configuration/i }) as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(laboratory, { target: { value: "Tuesday" } });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows the component days on the course and clears them visibly when it returns to Regular", () => {
      const onConfigChange = vi.fn();
      render(
        <SetupCoursesStep
          courses={mockCourses}
          sections={mockSections}
          configs={integratedConfigs({ lecture: "Monday", laboratory: "Thursday" })}
          onConfigChange={onConfigChange}
          settings={{}}
          actionsDisabled={false}
        />,
      );

      expect(screen.getByText("Lecture: Monday · Laboratory: Thursday")).toBeDefined();

      fireEvent.click(screen.getByRole("checkbox", { name: "Regular for IT 103" }));

      expect(screen.getByRole("status").textContent).toMatch(/IT 103's Lecture and Laboratory Required Days were cleared/);
      for (const sectionId of ["s1", "s2"]) {
        // Regular is one full-length on-site meeting in a laboratory room.
        expect(onConfigChange).toHaveBeenCalledWith(
          sectionId,
          expect.objectContaining({ splitCourseIds: [], componentRequiredDaysByCourseId: {}, modesByCourseId: { c2: "on-site" } }),
        );
      }
    });

    it("keeps different section days unless a new day is chosen", () => {
      const onConfigChange = vi.fn();
      const configs = integratedConfigs();
      configs.s1 = { ...configs.s1, componentRequiredDaysByCourseId: { c2: { lecture: "Monday" } } } as typeof configs.s1;
      configs.s2 = { ...configs.s2, componentRequiredDaysByCourseId: { c2: { laboratory: "Friday" } } } as typeof configs.s2;
      render(
        <SetupCoursesStep
          courses={mockCourses}
          sections={mockSections}
          configs={configs}
          onConfigChange={onConfigChange}
          settings={{}}
          actionsDisabled={false}
        />,
      );

      expect(screen.getByText("Lecture/Lab days vary by section")).toBeDefined();
      fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[1]);
      expect(screen.getByText(/Sections use different days/)).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

      for (const [, change] of onConfigChange.mock.calls) {
        expect(change).not.toHaveProperty("componentRequiredDaysByCourseId");
      }
    });
  });
});

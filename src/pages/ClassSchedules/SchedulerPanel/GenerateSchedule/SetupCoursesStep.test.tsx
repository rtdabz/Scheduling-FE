import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("applies the Default Lecture Duration to every course without its own settings", () => {
    const onConfigChange = vi.fn();
    const onDefaultsChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={null}
        onDefaultsChange={onDefaultsChange}
        defaultsOpen
        actionsDisabled={false}
      />,
    );

    // Opened from the gear in the wizard header; a draft until Apply.
    fireEvent.change(screen.getByLabelText("Lecture Duration"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Defaults/ }));

    expect(onDefaultsChange).toHaveBeenCalledWith(expect.objectContaining({ lectureMinutes: 120 }));
    // IT 101 is a three-unit lecture course: 2h fits. IT 103 meets as a
    // laboratory and keeps its own length. Both sections get it at once.
    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(
        sectionId,
        expect.objectContaining({ durationMinutesByCourseId: { c1: 120 } }),
      );
    }
  });

  it("leaves a course with its own Configure settings out of the defaults", () => {
    const onConfigChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={null}
        customizedCourseIds={["c1"]}
        defaultsOpen
        actionsDisabled={false}
      />,
    );

    // Opened from the gear in the wizard header; a draft until Apply.
    fireEvent.change(screen.getByLabelText("Lecture Duration"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Defaults/ }));

    expect(onConfigChange).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ durationMinutesByCourseId: { c1: 120 } }),
    );
    expect(screen.getByText("Custom")).toBeDefined();
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

    // IT 103 (lecture + lab) starts as the one Regular meeting the Generator
    // places; Integrated is offered but not chosen.
    expect(regularCheckboxes[1].getAttribute("aria-checked")).toBe("true");
    expect(integratedCheckboxes[1].getAttribute("aria-checked")).toBe("false");
    expect(integratedCheckboxes[1].hasAttribute("disabled")).toBe(false);

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
      durationMinutesByCourseId: {},
      preferredRoomsByCourseId: {},
      componentMinutesByCourseId: {},
      preferredPeriodsByCourseId: {},
    });
    expect(onConfigChange).toHaveBeenCalledWith("s2", {
      splitCourseIds: [],
      gecSplitCourseIds: ["c1"],
      hybridSplitCourseIds: [],
      modesByCourseId: { c1: "on-site" },
      durationMinutesByCourseId: {},
      preferredRoomsByCourseId: {},
      componentMinutesByCourseId: {},
      preferredPeriodsByCourseId: {},
    });

    // IT 101 dropdown should now offer On-Site | Hybrid
    const it101Select = screen.getByRole("combobox", { name: "Delivery mode for IT 101" });
    expect(it101Select.textContent).toContain("On-Site");
    expect(it101Select.textContent).toContain("Hybrid");

    // Duration should display two meetings
    expect(screen.getByText("1.5h + 1.5h")).toBeDefined();
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
      durationMinutesByCourseId: {},
      preferredRoomsByCourseId: {},
      componentMinutesByCourseId: {},
      preferredPeriodsByCourseId: {},
    });

    // Hybrid moves only the lecture online: the on-site mode is dropped.
    const it103Select = screen.getByRole("combobox", { name: "Delivery mode for IT 103" });
    fireEvent.change(it103Select, { target: { value: "hybrid" } });

    expect(onConfigChange).toHaveBeenCalledWith("s1", {
      splitCourseIds: ["c2"],
      gecSplitCourseIds: [],
      hybridSplitCourseIds: [],
      modesByCourseId: {},
      durationMinutesByCourseId: {},
      preferredRoomsByCourseId: {},
      componentMinutesByCourseId: {},
      preferredPeriodsByCourseId: {},
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

    // Verify Custom Time Duration has number-only input prefilled with hours and hrs addon
    expect(screen.getByText(/Custom Time Duration/i)).toBeDefined();
    const durationInput = screen.getByLabelText(/Duration in hours/i) as HTMLInputElement;
    expect(durationInput).toBeDefined();
    expect(durationInput.type).toBe("number");
    expect(durationInput.value).toBe("3");
    expect(screen.getAllByText("hrs").length).toBeGreaterThan(0);

    // Select Selected Sections Only radio
    const selectedRadio = screen.getByLabelText(/Selected Sections Only/i);
    fireEvent.click(selectedRadio);

    // Exception section list should be visible
    expect(screen.getByText(/Sections \(2\/2\)/)).toBeDefined();
    expect(screen.getAllByText("BSIT 1A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BSIT 1B").length).toBeGreaterThan(0);
  });

  const roomOptions = [
    { id: 7, room_code: "LEC 7", room_type: "lecture", building: "Main" },
    { id: 8, room_code: "LAB 8", room_type: "laboratory", allow_lecture_usage: false },
  ];

  it("applies an optional Required Day, Preferred Room and custom duration from Configure", () => {
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

    fireEvent.change(screen.getByLabelText(/Duration in hours/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    expect(onRequiredDayChange).toHaveBeenCalledWith("c1", "Saturday");
    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({
        durationMinutesByCourseId: { c1: 120 },
        preferredRoomsByCourseId: { c1: "7" },
      }));
    }
    expect(screen.getByText("2h")).toBeDefined();
  });

  it("refuses a duration longer than the course carries", () => {
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

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[0]);
    fireEvent.change(screen.getByLabelText(/Duration in hours/i), { target: { value: "4" } });

    expect(screen.getByRole("alert").textContent).toContain("at most 3h a week");
    expect(
      (screen.getByRole("button", { name: /Apply Configuration/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lets the user set an Integrated Hybrid's lecture and laboratory lengths separately", () => {
    const onConfigChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={{
          s1: { ...mockConfigs.s1, splitCourseIds: ["c2"] },
          s2: { ...mockConfigs.s2, splitCourseIds: ["c2"] },
        }}
        onConfigChange={onConfigChange}
        settings={null}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[1]);

    // Starts at the course's own lengths: 2 lecture units, 1 laboratory unit.
    const lecture = screen.getByLabelText(/Lecture duration in hours/i) as HTMLInputElement;
    const laboratory = screen.getByLabelText(/Laboratory duration in hours/i) as HTMLInputElement;
    expect(lecture.value).toBe("2");
    expect(laboratory.value).toBe("3");

    // Too long for the week (the course carries at most 5 h).
    fireEvent.change(lecture, { target: { value: "3" } });
    expect(screen.getByRole("alert").textContent).toContain("at most 5h a week");
    expect((screen.getByRole("button", { name: /Apply Configuration/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(lecture, { target: { value: "1.5" } });
    fireEvent.change(laboratory, { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({
        componentMinutesByCourseId: { c2: { lecture: 90, laboratory: 210 } },
      }));
    }
    expect(screen.getByText(/Lecture 1\.5h Online/)).toBeDefined();
    expect(screen.getByText(/Laboratory 3\.5h F2F/)).toBeDefined();
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
    expect(screen.getByText(/Hybrid Split · two separate sessions/i)).toBeDefined();
  });

  it("sets a regular course's own Preferred Meeting in Configure", () => {
    const onConfigChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={mockCourses}
        sections={mockSections}
        configs={mockConfigs}
        onConfigChange={onConfigChange}
        settings={null}
        actionsDisabled={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /configure/i })[0]);
    const group = within(screen.getByRole("group", { name: /Preferred Meeting/i }));
    const boxes = group.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.labels?.[0]?.textContent)).toEqual(["Morning", "Afternoon", "Evening"]);
    // Closing time is 8:30 PM, so every period is open to a regular course.
    expect(boxes.every((box) => !box.checked && !box.disabled)).toBe(true);
    // No field course, so no warning.
    expect(screen.queryByText(/Field Courses cannot be scheduled/)).toBeNull();

    // Ticked out of order; saved in day order.
    fireEvent.click(group.getByRole("checkbox", { name: /Afternoon/ }));
    fireEvent.click(group.getByRole("checkbox", { name: /Morning/ }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({
        preferredPeriodsByCourseId: { c1: ["morning", "afternoon"] },
      }));
    }
  });

  it("warns about a field course in Evening sections and moves only that course in Configure", () => {
    const fieldCourse: Course = {
      ...mockCourses[0],
      id: "c3",
      code: "PATHFIT 1",
      name: "Movement Competency Training",
      units: 2,
      lectureHours: 2,
      category: "minor",
      roomTypeRequired: "field",
    };
    const onConfigChange = vi.fn();
    render(
      <SetupCoursesStep
        courses={[mockCourses[0], fieldCourse]}
        sections={mockSections}
        configs={{
          s1: { ...mockConfigs.s1, preferredTimeBlock: "evening" },
          s2: { ...mockConfigs.s2, preferredTimeBlock: "evening" },
        }}
        onConfigChange={onConfigChange}
        settings={null}
        actionsDisabled={false}
      />,
    );

    const warning = screen.getByText(/Field Courses cannot be scheduled beyond 5:00 PM/);
    expect(warning.textContent).toContain("Sections BSIT 1A and BSIT 1B are assigned to Evening");
    expect(warning.textContent).toContain("You can change this course’s preference to Morning or Afternoon in Configure.");
    // Only the field course is flagged.
    expect(screen.queryByText(/IT 101/, { selector: "span.font-black" })).toBeNull();

    // The warning's own Configure opens the field course.
    fireEvent.click(within(warning.closest("[role='alert']") as HTMLElement).getByRole("button", { name: /Configure/ }));
    const group = within(screen.getByRole("group", { name: /Preferred Meeting/i }));
    // A field course ends by 5:00 PM, so the Evening is shown but disabled.
    expect(group.getAllByRole("checkbox")).toHaveLength(3);
    expect((group.getByRole("checkbox", { name: /Evening/ }) as HTMLInputElement).disabled).toBe(true);
    expect((group.getByRole("checkbox", { name: /Morning/ }) as HTMLInputElement).disabled).toBe(false);
    expect(group.getByText(/Evening unavailable: field courses end by 5:00 PM/)).toBeDefined();

    fireEvent.click(group.getByRole("checkbox", { name: /Morning/ }));
    fireEvent.click(group.getByRole("checkbox", { name: /Afternoon/ }));
    // Once ticked, the warning in Configure goes away.
    expect(screen.queryAllByText(/Field Courses cannot be scheduled/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Apply Configuration/i }));

    for (const sectionId of ["s1", "s2"]) {
      expect(onConfigChange).toHaveBeenCalledWith(sectionId, expect.objectContaining({
        preferredPeriodsByCourseId: { c3: ["morning", "afternoon"] },
      }));
    }
  });
});

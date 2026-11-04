import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Curriculum } from "../../../../types/curriculum";
import type { Section } from "../types";

const { service, toast } = vi.hoisted(() => ({
  service: {
    getActiveCurricula: vi.fn(),
    assignCurriculumToSection: vi.fn(),
    assignCurriculumToYearLevel: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../../services/curriculum/curriculumService", () => ({ curriculumService: service }));
vi.mock("../../../../context/ToastContext", () => ({ useToast: () => ({ toast }) }));
vi.mock("../../../../lib/dataCache", () => ({
  getCachedData: () => undefined,
  hasCachedData: () => false,
  loadCachedData: (_key: string, load: () => Promise<unknown>) => load(),
}));

import YearLevelCurriculumSelector from "./YearLevelCurriculumSelector";

const curriculum = (id: number, name: string, programId: number | null): Curriculum => ({
  id, name, code: name.replace(" ", "-"), department_id: 6, program_id: programId,
  effective_school_year: "2026-2027", status: "active", description: null, courses_count: 12,
  created_at: "", updated_at: "",
});

const section = (id: string, name: string, curriculumId: number | null, curriculumName: string | null = null): Section => ({
  id, name, yearLevel: 1, semester: "1st", departmentId: 6, programId: 3,
  curriculumId, curriculumName, semesterId: 9, status: "active",
});

const renderFor = (target: Section, props: Partial<Parameters<typeof YearLevelCurriculumSelector>[0]> = {}) =>
  render(
    <YearLevelCurriculumSelector
      scope="section"
      departmentId={6}
      semesterId={9}
      yearLevel={1}
      sections={[target]}
      onApplied={vi.fn()}
      {...props}
    />,
  );

const select = () => document.getElementById("schedule-builder-curriculum-select") as HTMLSelectElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("section curriculum selector", () => {
  it("shows the saved curriculum and offers only curricula open to the section's program", async () => {
    service.getActiveCurricula.mockResolvedValue([
      curriculum(1, "BSIT 2020", 3),
      curriculum(2, "BSIT 2026", null),
      curriculum(3, "BSCS 2026", 4),
    ]);
    renderFor(section("10", "IT 1A", 1));

    await waitFor(() => expect(select().value).toBe("1"));
    const names = Array.from(select().options).map((option) => option.textContent ?? "");
    expect(names.some((name) => name.startsWith("BSIT 2020"))).toBe(true);
    expect(names.some((name) => name.startsWith("BSIT 2026"))).toBe(true);
    expect(names.some((name) => name.startsWith("BSCS 2026"))).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Applied to the section");
  });

  it("applies a change to the one section only", async () => {
    service.getActiveCurricula.mockResolvedValue([curriculum(1, "BSIT 2020", 3), curriculum(2, "BSIT 2026", 3)]);
    service.assignCurriculumToSection.mockResolvedValue({ curriculum_id: 2 });
    const onApplied = vi.fn();
    renderFor(section("10", "IT 1A", 1), { onApplied });

    await waitFor(() => expect(select().value).toBe("1"));
    fireEvent.change(select(), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply to section/ }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(2));
    expect(service.assignCurriculumToSection).toHaveBeenCalledWith("10", 2);
    expect(service.assignCurriculumToYearLevel).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Curriculum Assigned", 'IT 1A now follows "BSIT 2026".');
  });

  it("reports a refused change and keeps the saved curriculum", async () => {
    service.getActiveCurricula.mockResolvedValue([curriculum(1, "BSIT 2020", 3), curriculum(2, "BSIT 2026", 3)]);
    const message = "This change would leave existing classes in a different curriculum. Clear those classes first.";
    service.assignCurriculumToSection.mockRejectedValue({ response: { data: { message } } });
    const onApplied = vi.fn();
    renderFor(section("10", "IT 1A", 1), { onApplied, hasClasses: true });

    await waitFor(() => expect(select().value).toBe("1"));
    fireEvent.change(select(), { target: { value: "2" } });
    expect(screen.getByText(/nothing is removed automatically/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Apply to section/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Curriculum Not Assigned", message));
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("drops an unsaved choice when another section is selected", async () => {
    service.getActiveCurricula.mockResolvedValue([curriculum(1, "BSIT 2020", 3), curriculum(2, "BSIT 2026", 3)]);
    const { rerender } = renderFor(section("10", "IT 1A", 1));

    await waitFor(() => expect(select().value).toBe("1"));
    fireEvent.change(select(), { target: { value: "2" } });
    rerender(
      <YearLevelCurriculumSelector
        scope="section" departmentId={6} semesterId={9} yearLevel={1}
        sections={[section("11", "IT 1B", 1)]} onApplied={vi.fn()}
      />,
    );

    expect(select().value).toBe("1");
  });

  it("keeps a saved curriculum visible after it stops being offered", async () => {
    service.getActiveCurricula.mockResolvedValue([curriculum(2, "BSIT 2026", 3)]);
    renderFor(section("10", "IT 1A", 1, "BSIT 2018"));

    await waitFor(() => expect(select().value).toBe("1"));
    expect(select().selectedOptions[0].textContent).toBe("BSIT 2018 — not available");
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../../../../lib/api", () => ({
  default: { get, post, patch: vi.fn() },
}));

import { GenerationRunProvider, useGenerationRun } from "./useGenerationRun";

afterEach(cleanup);

const generatedSchedule = {
  id: 501,
  term_id: 1,
  department_id: 2,
  course_id: 20,
  section_id: 10,
  room_id: null,
  day: "Monday",
  start_time: "07:00:00",
  end_time: "10:00:00",
  mode: "on-site" as const,
  status: "draft" as const,
};

function Starter() {
  const run = useGenerationRun();

  return (
    <button
      type="button"
      onClick={() => void run.start({ year_level: 1 }, { yearLevel: 1, sectionCount: 2 })}
    >
      start
    </button>
  );
}

function Watcher() {
  const run = useGenerationRun();

  return (
    <>
      <span data-testid="status">{run.status}</span>
      <span data-testid="year">{run.meta?.yearLevel ?? "none"}</span>
      <span data-testid="rows">{run.result?.schedules?.length ?? 0}</span>
      <span data-testid="error">{run.errorMessage ?? ""}</span>
    </>
  );
}

describe("useGenerationRun", () => {
  beforeEach(() => {
    localStorage.clear();
    get.mockReset();
    post.mockReset();
    get.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/active-generation-run") {
        return Promise.resolve({ data: { run: null } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("keeps polling a queued run after the component that started it unmounts", async () => {
    post.mockResolvedValue({ data: { run_id: "run-1" } });
    let polls = 0;
    get.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/active-generation-run") {
        return Promise.resolve({ data: { run: null } });
      }
      if (url === "/schedule-recommendations/generation-runs/run-1") {
        polls += 1;
        return Promise.resolve({
          data:
            polls === 1
              ? { run_id: "run-1", status: "running", started_at: "2026-09-10T01:00:00Z" }
              : {
                  run_id: "run-1",
                  status: "completed",
                  result: { schedules: [generatedSchedule] },
                },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const { rerender } = render(
      <GenerationRunProvider departmentId={2} termId={1}>
        <Starter />
        <Watcher />
      </GenerationRunProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "start" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("running"));

    // Closing the generator unmounts the starter. The run must survive it:
    // this is exactly what the in-modal poll loop used to abort.
    rerender(
      <GenerationRunProvider departmentId={2} termId={1}>
        <Watcher />
      </GenerationRunProvider>,
    );

    await waitFor(
      () => expect(screen.getByTestId("status").textContent).toBe("completed"),
      { timeout: 4000 },
    );
    expect(screen.getByTestId("rows").textContent).toBe("1");
    // The id is held until the result is applied or dismissed, so a reload
    // before then still finds the finished run.
    expect(localStorage.getItem("wicars.generation-run.2.1")).toBe("run-1");
  });

  it("recovers an active run started before the panel was mounted", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/active-generation-run") {
        return Promise.resolve({
          data: {
            run: {
              run_id: "run-9",
              status: "running",
              year_level: 3,
              started_at: "2026-09-10T01:00:00Z",
            },
          },
        });
      }
      if (url === "/schedule-recommendations/generation-runs/run-9") {
        return Promise.resolve({
          data: { run_id: "run-9", status: "running", started_at: "2026-09-10T01:00:00Z" },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <GenerationRunProvider departmentId={2} termId={1}>
        <Watcher />
      </GenerationRunProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("running"));
    expect(screen.getByTestId("year").textContent).toBe("3");
  });

  it("reports a completed run that produced no timetable as a failure", async () => {
    localStorage.setItem("wicars.generation-run.2.1", "run-2");
    get.mockImplementation((url: string) => {
      if (url === "/schedule-recommendations/generation-runs/run-2") {
        return Promise.resolve({
          data: { run_id: "run-2", status: "completed", result: { schedules: [] } },
        });
      }
      return Promise.resolve({ data: { run: null } });
    });

    render(
      <GenerationRunProvider departmentId={2} termId={1}>
        <Watcher />
      </GenerationRunProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("failed"));
    expect(screen.getByTestId("error").textContent).toContain("without a timetable");
  });
});

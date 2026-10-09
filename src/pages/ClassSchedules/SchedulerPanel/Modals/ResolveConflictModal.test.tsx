import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ResolveConflictModal from "./ResolveConflictModal";

const apiGet = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("../../../../lib/api", () => ({ default: { get: apiGet } }));
vi.mock("../../../../context/ToastContext", () => ({ useToast: () => ({ toast }) }));
afterEach(cleanup);

it("offers manual guidance when the authorized search returns no placement suggestions", async () => {
  apiGet.mockImplementation((url: string) => Promise.resolve({ data: url === "/conflicts" ? {
    conflicts: [{
      id: "faculty_conflict:1:2", rule: "faculty_conflict", semester_id: 1,
      message: "The instructor has overlapping classes.", schedules: [],
      resolution_options: ["move_schedule", "reassign_instructor"],
    }],
  } : { options: [], resolutions: [] } }));
  render(<ResolveConflictModal isOpen onClose={vi.fn()} semesterId={1} departmentId={6} onResolved={vi.fn()} />);

  expect(await screen.findByText(/No placement suggestion is available here/)).toBeTruthy();
  expect(screen.getByText(/choose an instructor manually in Instructor Assignment/)).toBeTruthy();
  expect(screen.queryByText(/No conflict-free fix was found/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  expect(apiGet.mock.calls.some(([url]) => String(url).includes("instructor-assignments"))).toBe(false);
});

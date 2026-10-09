import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import api from "../../../../lib/api";
import SessionAlternatives, { type SessionAlternative } from "./SessionAlternatives";

vi.mock("../../../../lib/api", () => ({ default: { post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const payload = { section_id: 1, placement: { rows: [], selected_meeting: 0 } };
const option: SessionAlternative = { id: "split", label: "Split", summary: "Mon/Wed 07:00", reasons: ["Shorter meetings fit."], rows: [] };

it("requests only on demand and stages only an explicit selection", async () => {
  vi.mocked(api.post).mockResolvedValue({ data: { recommendations: [option] } });
  const onStage = vi.fn();
  render(<SessionAlternatives payload={payload} disabled={false} onStage={onStage} />);
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stage Split" }));
  expect(onStage).toHaveBeenCalledExactlyOnceWith(option);
  expect(api.post).toHaveBeenCalledExactlyOnceWith("/schedule-recommendations/available-slots",
    { ...payload, placement: { ...payload.placement, session_alternatives: true } }, { signal: expect.any(AbortSignal) });
});

it("shows empty, failed and retry states without changing a class", async () => {
  vi.mocked(api.post).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ data: { recommendations: [] } });
  const onStage = vi.fn();
  render(<SessionAlternatives payload={payload} disabled={false} onStage={onStage} />);
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  expect((await screen.findByRole("status")).textContent).toContain("No additional session alternative was found");
  expect(onStage).not.toHaveBeenCalled();
});

it("disables actions while checking and aborts stale placement requests", async () => {
  vi.mocked(api.post).mockReturnValue(new Promise(() => undefined));
  const { unmount } = render(<SessionAlternatives payload={payload} disabled={false} onStage={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  await waitFor(() => expect((screen.getByRole("button", { name: /Checking session/ }) as HTMLButtonElement).disabled).toBe(true));
  const signal = vi.mocked(api.post).mock.calls[0][2]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});

it("explains a Required Day only after a successful empty check", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({ data: { recommendations: [] } }).mockRejectedValueOnce(new Error("offline"));
  const onStage = vi.fn();
  render(<SessionAlternatives payload={payload} disabled={false} requiredDay="Monday" onStage={onStage} />);
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  expect((await screen.findByRole("status")).textContent).toContain("Required Day restricts this class to Monday");
  expect(screen.getByRole("status").textContent).toContain("Two-day session alternatives need different days");
  fireEvent.click(screen.getByRole("button", { name: "Check session alternatives" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("status")).toBeNull();
  expect(onStage).not.toHaveBeenCalled();
});

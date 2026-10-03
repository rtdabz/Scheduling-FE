import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CourseDefaultsSidebar from "./CourseDefaultsSidebar";
import { EMPTY_COURSE_DEFAULTS } from "./courseClassConfig";

const renderSidebar = (props: Partial<Parameters<typeof CourseDefaultsSidebar>[0]> = {}) => {
  const onApply = vi.fn();
  const onLabRoomTypeApply = vi.fn();
  render(
    <CourseDefaultsSidebar
      defaults={EMPTY_COURSE_DEFAULTS}
      summarize={() => ({ applied: 0, skipped: 0 })}
      customizedCount={0}
      onResetCustomized={vi.fn()}
      disabled={false}
      onClose={vi.fn()}
      onApply={onApply}
      onLabRoomTypeApply={onLabRoomTypeApply}
      {...props}
    />,
  );

  return { onApply, onLabRoomTypeApply };
};

describe("CourseDefaultsSidebar Default LAB Room Requirement", () => {
  afterEach(cleanup);

  it("saves a changed LAB room rule for the department on Apply", async () => {
    const { onApply, onLabRoomTypeApply } = renderSidebar();

    fireEvent.change(screen.getByLabelText("Default LAB Room Requirement"), { target: { value: "lecture" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply Defaults/ }));

    await waitFor(() => expect(onLabRoomTypeApply).toHaveBeenCalledWith("lecture"));
    expect(onApply).toHaveBeenCalled();
  });

  it("does not save the rule when it is unchanged", async () => {
    const { onApply, onLabRoomTypeApply } = renderSidebar({ labRoomType: "either" });

    expect((screen.getByLabelText("Default LAB Room Requirement") as HTMLSelectElement).value).toBe("either");
    fireEvent.click(screen.getByRole("button", { name: /Apply Defaults/ }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onLabRoomTypeApply).not.toHaveBeenCalled();
  });

  it("is hidden for a department without laboratories", () => {
    renderSidebar({ laboratoryEnabled: false });

    expect(screen.queryByLabelText("Default LAB Room Requirement")).toBeNull();
  });
});

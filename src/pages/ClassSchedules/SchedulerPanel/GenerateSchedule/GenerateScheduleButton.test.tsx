import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GenerateScheduleButton from "./GenerateScheduleButton";

describe("GenerateScheduleButton", () => {
  it("is always enabled and opens the generation workflow", () => {
    const onClick = vi.fn();

    render(<GenerateScheduleButton onClick={onClick} />);

    const button = screen.getByRole("button", { name: /generate/i });
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecommendedOptionList from "./RecommendedOptionList";

describe("RecommendedOptionList", () => {
  afterEach(cleanup);

  const items = [
    { key: "a", body: <p>Move to Room 204, same time.</p>, tag: <span>Best match</span> },
    { key: "b", body: <p>Move to Tuesday 10:00-11:30.</p> },
    { key: "c", body: <p>Move to Wednesday.</p>, disabledLabel: "Not on Monday (Force Day)" },
  ];

  it("numbers the options best first and applies the one chosen", () => {
    const onApply = vi.fn();
    render(<RecommendedOptionList label="Fixes" items={items} onApply={onApply} />);

    const options = within(screen.getByRole("list", { name: "Fixes" })).getAllByRole("listitem");
    expect(options).toHaveLength(3);
    expect(within(options[0]).getByText("Option 1")).toBeTruthy();
    expect(within(options[0]).getByText("Best match")).toBeTruthy();

    fireEvent.click(within(options[1]).getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith("b");
  });

  it("says why an option cannot be used and does not apply it", () => {
    const onApply = vi.fn();
    render(<RecommendedOptionList label="Fixes" items={items} onApply={onApply} />);

    const blocked = screen.getByRole("button", { name: "Not on Monday (Force Day)" }) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
  });

  it("marks an applied option as selected", () => {
    render(
      <RecommendedOptionList
        label="Fixes"
        items={[{ ...items[0], isApplied: true }]}
        onApply={() => undefined}
        applyLabel="Use this option"
      />,
    );

    expect(screen.getByText("Applied")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Selected" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Best match")).toBeNull();
  });

  it("holds every button while an apply is in flight", () => {
    render(<RecommendedOptionList label="Fixes" items={items.slice(0, 2)} onApply={() => undefined} isBusy busyKey="a" />);

    screen.getAllByRole("button").forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));
  });
});

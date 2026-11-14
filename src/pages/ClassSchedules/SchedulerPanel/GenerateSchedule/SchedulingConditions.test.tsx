import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarRange, Lock, Split } from "lucide-react";
import SchedulingConditions, { type SchedulingCondition } from "./SchedulingConditions";

afterEach(cleanup);

const warnings: SchedulingCondition[] = [
  { id: "split", tone: "warning", icon: Split, title: "Longer run time", text: "Splitting raises the search budget." },
  { id: "days", tone: "warning", icon: CalendarRange, title: "Preferred Days only", text: "Classes are limited to the Preferred Days." },
];
const locked: SchedulingCondition = { id: "locked", tone: "critical", icon: Lock, title: "Locked", text: "Recall the whole year level." };

const toggle = () => screen.getByRole("button", { name: /Scheduling conditions/ });

describe("SchedulingConditions", () => {
  it("renders nothing without active conditions", () => {
    const { container } = render(<SchedulingConditions conditions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("starts collapsed with the count, keeping every original message in the document", () => {
    render(<SchedulingConditions conditions={warnings} />);

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toContain("2");
    expect(screen.getByText("Splitting raises the search budget.").closest("[inert]")).not.toBeNull();
    expect(screen.getByText("Classes are limited to the Preferred Days.")).toBeTruthy();
  });

  it("expands and collapses again", () => {
    render(<SchedulingConditions conditions={warnings} />);

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Splitting raises the search budget.").closest("[inert]")).toBeNull();

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens by default when a condition is critical", () => {
    render(<SchedulingConditions conditions={[locked, ...warnings]} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().textContent).toContain("3");
  });

  it("opens when a critical condition appears later", () => {
    const { rerender } = render(<SchedulingConditions conditions={warnings} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    rerender(<SchedulingConditions conditions={[locked, ...warnings]} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });
});

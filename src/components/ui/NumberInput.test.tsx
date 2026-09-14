import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NumberInput from "./NumberInput";

function Harness({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberInput aria-label="units" value={value} onChange={(event) => setValue(Number(event.target.value))} />
      <output aria-label="state">{value}</output>
      <button type="button" onClick={() => setValue(21)}>load</button>
      <button type="button" onClick={() => setValue(0)}>reset</button>
    </>
  );
}

const input = () => screen.getByLabelText("units") as HTMLInputElement;

describe("NumberInput", () => {
  afterEach(cleanup);

  it("starts blank instead of showing 0", () => {
    render(<Harness initial={0} />);
    expect(input().value).toBe("");
  });

  it("never leaves a leading zero in front of what was typed", () => {
    render(<Harness initial={0} />);
    fireEvent.change(input(), { target: { value: "015" } });
    expect(input().value).toBe("15");
    expect(screen.getByLabelText("state").textContent).toBe("15");
  });

  it("keeps a deliberately typed 0 and reads an emptied field as 0", () => {
    render(<Harness initial={5} />);
    fireEvent.change(input(), { target: { value: "0" } });
    expect(input().value).toBe("0");
    fireEvent.change(input(), { target: { value: "" } });
    expect(input().value).toBe("");
    expect(screen.getByLabelText("state").textContent).toBe("0");
  });

  it("follows values set from outside, such as loading a record or resetting", () => {
    render(<Harness initial={0} />);
    fireEvent.click(screen.getByText("load"));
    expect(input().value).toBe("21");
    fireEvent.click(screen.getByText("reset"));
    expect(input().value).toBe("");
  });
});

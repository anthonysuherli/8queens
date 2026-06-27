import { describe, expect, it } from "vitest";
import { layoutColumn } from "./layout";

describe("layoutColumn", () => {
  it("evenly distributes ids down a column at a fixed x", () => {
    const placed = layoutColumn(["a", "b", "c"], 100, 400);
    expect(placed.map((p) => p.x)).toEqual([100, 100, 100]);
    expect(placed.map((p) => p.y)).toEqual([100, 200, 300]);
  });

  it("handles an empty column without dividing by zero", () => {
    expect(layoutColumn([], 50, 400)).toEqual([]);
  });
});

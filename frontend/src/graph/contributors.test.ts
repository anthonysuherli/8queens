import { describe, expect, it } from "vitest";
import { contributorColor, CONTRIBUTOR_RING, SYNTHESIZER_COLOR } from "./contributors";

describe("contributorColor", () => {
  it("returns a stable color per contributor", () => {
    const a = contributorColor("r0");
    expect(contributorColor("r0")).toBe(a);
  });
  it("gives distinct colors to distinct researchers", () => {
    expect(contributorColor("rA")).not.toBe(contributorColor("rB"));
  });
  it("uses the synthesizer color for the synthesizer", () => {
    expect(contributorColor("synthesizer")).toBe(SYNTHESIZER_COLOR);
  });
  it("draws researcher colors from the ring", () => {
    expect(CONTRIBUTOR_RING).toContain(contributorColor("r_first_fresh"));
  });
});

import { describe, expect, it } from "vitest";
import { describeLifecycle } from "./describe";
import type { TraceGap } from "./traceModel";

const gap: TraceGap = {
  id: "g1", question: "q", status: "dead", owner: "r1", coverage: "sparse",
  attempts: 2, reason: "insufficient", parentId: null, findingIds: ["f1"],
  lifecycle: [
    { kind: "opened" },
    { kind: "claimed", by: "r1" },
    { kind: "filled", coverage: "sparse" },
    { kind: "reopened", reason: "insufficient" },
    { kind: "dead", reason: "insufficient" },
  ],
};

describe("describeLifecycle", () => {
  it("phrases each lifecycle event, including reopen reason and dead", () => {
    expect(describeLifecycle(gap)).toEqual([
      "opened by planner",
      "claimed by r1",
      "verified sparse",
      "Critic reopened (insufficient)",
      "killed dead (insufficient)",
    ]);
  });

  it("labels a child gap as a Critic spawn", () => {
    const child: TraceGap = { ...gap, parentId: "g0", lifecycle: [{ kind: "opened" }] };
    expect(describeLifecycle(child)).toEqual(["spawned by Critic (sharpen)"]);
  });
});

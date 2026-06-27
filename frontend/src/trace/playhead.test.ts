import { describe, expect, it } from "vitest";
import { visibleAtPlayhead } from "./playhead";
import type { TraceFrame } from "./traceModel";

const frames: TraceFrame[] = [
  { t: 0, event: "phase", phase: "seeding", round: 0 },
  { t: 1, event: "gap_opened", gap_id: "g1" },
  { t: 2, event: "finding_merged", finding_id: "f1", gap_id: "g1" },
  { t: 3, event: "gap_opened", gap_id: "g2" },
];

describe("visibleAtPlayhead", () => {
  it("includes only nodes introduced up to and including the playhead", () => {
    expect(visibleAtPlayhead(frames, 1)).toEqual({ gaps: new Set(["g1"]), findings: new Set() });
    expect(visibleAtPlayhead(frames, 2)).toEqual({ gaps: new Set(["g1"]), findings: new Set(["f1"]) });
    expect(visibleAtPlayhead(frames, 99)).toEqual({ gaps: new Set(["g1", "g2"]), findings: new Set(["f1"]) });
  });
});

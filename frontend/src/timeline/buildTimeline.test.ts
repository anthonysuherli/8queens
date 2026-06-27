import { describe, expect, it } from "vitest";
import type { SocietyRunBundle } from "../api/types";
import { buildTimeline, cumulativeAt } from "./buildTimeline";

const BUNDLE: SocietyRunBundle = {
  meta: { topic: "t", run_id: "r", kb_id: "k", captured_at: "x", n_researchers: 2,
          max_rounds: 3, rounds: 1, finding_count: 3, gaps_done: 2, gaps_dead: 0, models: {} },
  frames: [
    { t: 0, event: "phase", phase: "seeding", round: 0 },
    { t: 10, event: "gap_opened", gap_id: "g1", question: "Q1", parent_id: null },
    { t: 20, event: "gap_opened", gap_id: "g2", question: "Q2", parent_id: null },
    { t: 30, event: "phase", phase: "researching", round: 1 },
    { t: 40, event: "gap_claimed", gap_id: "g1", claimed_by: "r1", role: "researcher" },
    { t: 50, event: "gap_claimed", gap_id: "g2", claimed_by: "r2", role: "researcher" },
    { t: 60, event: "finding_merged", finding_id: "f1", gap_id: "g1", title: "A", contributor: "r1" },
    { t: 70, event: "finding_merged", finding_id: "f2", gap_id: "g1", title: "B", contributor: "r1" },
    { t: 80, event: "finding_merged", finding_id: "f3", gap_id: "g2", title: "C", contributor: "r2" },
    { t: 85, event: "coverage", gap_id: null, coverage: "sparse", band1_hits: 1, overall: "sparse" },
    { t: 90, event: "phase", phase: "critiquing", round: 1 },
    { t: 100, event: "gap_filled", gap_id: "g1", coverage: "rich", finding_ids: ["f1", "f2"], status: "done" },
    { t: 110, event: "coverage", gap_id: null, coverage: "rich", band1_hits: 2, overall: "rich" },
    { t: 120, event: "phase", phase: "synthesizing", round: 1 },
    { t: 130, event: "report", report: "## r (finding_id: f1)", unanswered: [] },
  ],
  gaps: [], findings: {}, report: { markdown: "## r (finding_id: f1)", unanswered: [] },
};

describe("buildTimeline", () => {
  it("builds lanes planner, researchers (sorted), critic, synthesizer", () => {
    const m = buildTimeline(BUNDLE);
    expect(m.lanes.map((l) => l.id)).toEqual(["planner", "r1", "r2", "critic", "synthesizer"]);
    expect(m.lanes.map((l) => l.role)).toEqual(["planner", "researcher", "researcher", "critic", "synthesizer"]);
  });

  it("routes events to the right lanes", () => {
    const m = buildTimeline(BUNDLE);
    expect(m.events.filter((e) => e.laneId === "planner").length).toBe(2);
    expect(m.events.filter((e) => e.laneId === "r1" && e.kind === "finding").length).toBe(2);
    expect(m.events.filter((e) => e.laneId === "r2" && e.kind === "finding").length).toBe(1);
    expect(m.events.filter((e) => e.laneId === "critic" && e.kind === "grade").length).toBe(1);
    expect(m.events.filter((e) => e.laneId === "synthesizer").length).toBe(1);
    expect(m.totalFindings).toBe(3);
  });

  it("computes phase spans spanning the whole run", () => {
    const m = buildTimeline(BUNDLE);
    expect(m.phases.map((p) => p.phase)).toEqual(["seeding", "researching", "critiquing", "synthesizing"]);
    expect(m.phases[0].startIndex).toBe(0);
    expect(m.phases[3].endIndex).toBe(BUNDLE.frames.length);
  });

  it("cumulativeAt grows findings and climbs coverage with the playhead", () => {
    const m = buildTimeline(BUNDLE);
    expect(cumulativeAt(m, 6)).toMatchObject({ findings: 1, phase: "researching" });
    const mid = cumulativeAt(m, 9);
    expect(mid.findings).toBe(3);
    expect(mid.coverage).toBe("sparse");
    const end = cumulativeAt(m, 14);
    expect(end.findings).toBe(3);
    expect(end.coverage).toBe("rich");
    expect(end.phase).toBe("synthesizing");
    expect(end.latestFinding).toBe("C");
  });
});

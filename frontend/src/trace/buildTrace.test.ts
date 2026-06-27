import { describe, expect, it } from "vitest";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace, splitClaims, stripCitations } from "./buildTrace";

const BUNDLE: SocietyRunBundle = {
  meta: {
    topic: "t", run_id: "r", kb_id: "k", captured_at: "2026-06-27T00:00:00Z",
    n_researchers: 2, max_rounds: 3, rounds: 2, finding_count: 2,
    gaps_done: 1, gaps_dead: 1, models: { planner: "qwen-max" },
  },
  frames: [
    { t: 0, event: "phase", phase: "seeding", round: 0 },
    { t: 10, event: "gap_opened", gap_id: "g1", question: "reserves?", parent_id: null },
    { t: 20, event: "gap_opened", gap_id: "g2", question: "issuers?", parent_id: null },
    { t: 30, event: "phase", phase: "researching", round: 1 },
    { t: 40, event: "gap_claimed", gap_id: "g1", claimed_by: "r1", role: "researcher" },
    { t: 50, event: "finding_merged", finding_id: "f1", gap_id: "g1", title: "A", contributor: "r1" },
    { t: 60, event: "gap_filled", gap_id: "g1", coverage: "sparse", finding_ids: ["f1"], status: "verified" },
    { t: 70, event: "phase", phase: "critiquing", round: 1 },
    { t: 80, event: "gap_opened", gap_id: "g1", question: "reserves audited?", parent_id: null },
    { t: 90, event: "gap_claimed", gap_id: "g2", claimed_by: "r2", role: "researcher" },
    { t: 100, event: "finding_merged", finding_id: "f2", gap_id: "g2", title: "B", contributor: "r2" },
    { t: 110, event: "gap_filled", gap_id: "g2", coverage: "rich", finding_ids: ["f2"], status: "done" },
  ],
  gaps: [
    {
      gap_id: "g1", question: "reserves audited?", status: "dead", owner: "r1",
      coverage: "sparse", attempts: 2, reason: "insufficient", parent_id: null,
      finding_ids: ["f1"], created_at: "x", updated_at: "y",
    },
    {
      gap_id: "g2", question: "issuers?", status: "done", owner: "r2",
      coverage: "rich", attempts: 1, reason: null, parent_id: null,
      finding_ids: ["f2"], created_at: "x", updated_at: "y",
    },
  ],
  findings: {
    f1: { id: "f1", title: "A", content: "body a", category: "x", confidence: 0.7,
          provenance: [{ url: "https://sec.gov/a", domain: "sec.gov", query: "reserves" }] },
    f2: { id: "f2", title: "B", content: "body b", category: "x", confidence: 0.9, provenance: [] },
  },
  report: {
    markdown: "## Title\n\nReserves are audited (finding_id: f1). Issuers vary (finding_id: f2, f9).",
    unanswered: ["offshore issuers"],
  },
};

describe("stripCitations", () => {
  it("removes finding_id citations", () => {
    expect(stripCitations("foo (finding_id: f1) bar (finding_id: f2)")).toBe("foo bar");
  });
});

describe("splitClaims", () => {
  it("splits headings and per-citation prose, resolving ids against findings", () => {
    const claims = splitClaims(BUNDLE.report.markdown, BUNDLE.findings);
    expect(claims).toHaveLength(3);
    expect(claims[0]).toMatchObject({ kind: "heading", text: "## Title", findingIds: [] });
    expect(claims[1]).toMatchObject({ kind: "prose", findingIds: ["f1"], unresolvedIds: [] });
    expect(claims[2].findingIds).toEqual(["f2"]);
    expect(claims[2].unresolvedIds).toEqual(["f9"]);
  });
});

describe("buildTrace", () => {
  it("wires findings to their gaps, contributors, and sources", () => {
    const m = buildTrace(BUNDLE);
    expect(m.findings.f1.gapId).toBe("g1");
    expect(m.findings.f1.contributor).toBe("r1");
    expect(m.findings.f1.sources[0].domain).toBe("sec.gov");
  });

  it("derives gap lifecycle: reopen (with reason) and a dead terminal", () => {
    const m = buildTrace(BUNDLE);
    const kinds = m.gaps.g1.lifecycle.map((e) => e.kind);
    expect(kinds).toEqual(["opened", "claimed", "filled", "reopened", "dead"]);
    expect(m.gaps.g1.lifecycle.find((e) => e.kind === "reopened")?.reason).toBe("insufficient");
    expect(m.gaps.g1.status).toBe("dead");
  });

  it("derives a done terminal from the gap_filled done frame", () => {
    const m = buildTrace(BUNDLE);
    const kinds = m.gaps.g2.lifecycle.map((e) => e.kind);
    expect(kinds).toEqual(["opened", "claimed", "done"]);
    expect(m.gaps.g2.status).toBe("done");
  });
});

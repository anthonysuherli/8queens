# Trace view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard view that traces a report claim backward through findings → gaps → source URLs, over a recorded society run.

**Architecture:** A self-contained `frontend/src/trace/` module reads one committed JSON **run bundle** (frames + gaps + findings + report). A pure `buildTrace()` turns the bundle into a `TraceModel`; React panels (report / SVG derivation map / inspector / transport) render it. Entry is a `graph | trace` toggle in the existing `TopBar`. A standalone backend script records the bundle once; no shipped production code changes.

**Tech Stack:** React 18 + TypeScript (strict) + Vite 6 + Zustand + Vitest (node env). Backend recorder: Python 3.12, the existing qwen8 store/society modules.

**Spec:** [docs/superpowers/specs/2026-06-26-trace-view-design.md](../specs/2026-06-26-trace-view-design.md)

## Global Constraints

- **Type-check gate:** `npm run build` runs `tsc --noEmit` then `vite build`. Strict mode + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` — unused imports/bindings and non-returning switch arms **fail the build**. Run from `frontend/`.
- **Tests:** Vitest, **node environment, no DOM**. Tests live next to code as `*.test.ts`. Run `npm run test` from `frontend/`. Do NOT add jsdom; test pure logic only — never render React in a test.
- **Styling:** no CSS framework. Use the CSS variables in `frontend/src/styles/tokens.css` (`--bg0`,`--bg1`,`--bg2`,`--bg3`,`--line`,`--line-bright`,`--text`,`--text-dim`,`--text-faint`,`--accent`,`--accent-bright`,`--rich`=`#46d39a`,`--sparse`=`#f5a83c`,`--gap`=`#ef5b66`,`--font-mono`,`--font-body`,`--font-display`,`--radius`). Never hard-code colors.
- **No sigma/graphology in `trace/`.** The map is bespoke SVG; keep the module decoupled from the graph store.
- **Bundle is static JSON** imported directly — no network, so no live/mock parity to maintain.
- **Backend:** zero changes to shipped modules. The recorder is `scripts/capture_run.py`; its heavy `qwen8.*` imports stay **inside** functions so the module imports cleanly without keys/deps for testing. `from __future__ import annotations`; ruff line-length 100.

---

### Task 1: Wire + model types

**Files:**
- Modify: `frontend/src/api/types.ts` (append the bundle wire types)
- Create: `frontend/src/trace/traceModel.ts`

**Interfaces:**
- Produces (wire, in `api/types.ts`): `SocietyRunBundle`, `BundleMeta`, `BundleFrame`, `BundleGap`, `BundleFinding`, `BundleSource`. `Coverage` already exists in this file (`"rich" | "sparse" | "gap"`).
- Produces (model, in `trace/traceModel.ts`): `TraceModel`, `Claim`, `TraceFinding`, `TraceGap`, `GapEvent`, `GapEventKind`, `Source`, `TraceFrame`, `TraceGapStatus`.

- [ ] **Step 1: Append the bundle wire types to `frontend/src/api/types.ts`**

Add at the end of the file (after the existing society block):

```ts
// ---------------------------------------------------------------------------
// recorded run bundle (Trace view — see docs/sse-frames.md for frame shapes)

export interface BundleSource {
  url: string;
  domain: string;
  query: string;
}

export interface BundleFinding {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number | null;
  provenance: BundleSource[];
}

export interface BundleGap {
  gap_id: string;
  question: string;
  status: "open" | "claimed" | "verified" | "done" | "dead";
  owner: string | null;
  coverage: Coverage | null;
  attempts: number;
  reason: string | null;
  parent_id: string | null;
  finding_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface BundleFrame {
  t: number;
  event: string;
  [key: string]: unknown;
}

export interface BundleMeta {
  topic: string;
  run_id: string;
  kb_id: string;
  captured_at: string;
  n_researchers: number;
  max_rounds: number;
  rounds: number;
  finding_count: number;
  gaps_done: number;
  gaps_dead: number;
  models: Record<string, string>;
}

export interface SocietyRunBundle {
  meta: BundleMeta;
  frames: BundleFrame[];
  gaps: BundleGap[];
  findings: Record<string, BundleFinding>;
  report: { markdown: string; unanswered: string[] };
}
```

- [ ] **Step 2: Create `frontend/src/trace/traceModel.ts`**

```ts
/**
 * Derived model the Trace view renders. Built purely from a SocietyRunBundle by
 * buildTrace(). The bundle is the wire shape; this is the resolved, denormalized
 * shape the panels consume (claim → finding → gap → source already wired up).
 */

import type { BundleMeta, Coverage } from "../api/types";

export interface Source {
  url: string;
  domain: string;
  query: string;
}

export type GapEventKind = "opened" | "claimed" | "filled" | "reopened" | "done" | "dead";

export interface GapEvent {
  kind: GapEventKind;
  t?: number;
  by?: string;
  coverage?: Coverage;
  round?: number;
  reason?: string;
}

export type TraceGapStatus = "open" | "claimed" | "verified" | "done" | "dead";

export interface TraceGap {
  id: string;
  question: string;
  status: TraceGapStatus;
  owner: string | null;
  coverage: Coverage | null;
  attempts: number;
  reason: string | null;
  parentId: string | null;
  findingIds: string[];
  lifecycle: GapEvent[];
}

export interface TraceFinding {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number | null;
  gapId: string | null;
  contributor: string | null;
  sources: Source[];
}

export interface Claim {
  id: string;
  text: string;
  kind: "heading" | "prose";
  findingIds: string[];
  unresolvedIds: string[];
}

export interface TraceFrame {
  t: number;
  event: string;
  [key: string]: unknown;
}

export interface TraceModel {
  meta: BundleMeta;
  claims: Claim[];
  findings: Record<string, TraceFinding>;
  gaps: Record<string, TraceGap>;
  frames: TraceFrame[];
  unanswered: string[];
}
```

> Note: `Claim.kind` refines spec §6.3 (which listed `{id,text,findingIds,unresolvedIds}`) so the report pane can render headings without re-parsing. Everything else matches the spec verbatim.

- [ ] **Step 3: Type-check**

Run (from `frontend/`): `npm run build`
Expected: PASS (compiles; no unused-symbol errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/trace/traceModel.ts
git commit -m "feat(trace): bundle wire types + TraceModel types"
```

---

### Task 2: `buildTrace` — the pure model builder (TDD)

**Files:**
- Create: `frontend/src/trace/buildTrace.ts`
- Test: `frontend/src/trace/buildTrace.test.ts`

**Interfaces:**
- Consumes: `SocietyRunBundle` (Task 1), `TraceModel`/`Claim`/`GapEvent`/`TraceGap`/`TraceFinding`/`TraceFrame`/`Source` (Task 1).
- Produces: `buildTrace(bundle: SocietyRunBundle): TraceModel`; helpers `stripCitations(text: string): string` and `splitClaims(markdown: string, findings: Record<string, unknown>): Claim[]`.

- [ ] **Step 1: Write the failing test `frontend/src/trace/buildTrace.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- buildTrace`
Expected: FAIL — `buildTrace`/`splitClaims`/`stripCitations` not exported (module missing).

- [ ] **Step 3: Implement `frontend/src/trace/buildTrace.ts`**

```ts
/**
 * Pure: SocietyRunBundle → TraceModel. Three bundle layers reconciled —
 * frames give temporal lifecycle, gaps[] give terminal truth (dead/attempts/
 * reason), findings{} give source provenance. No I/O, no React.
 */

import type { BundleFrame, BundleGap, Coverage, SocietyRunBundle } from "../api/types";
import type { Claim, GapEvent, TraceFinding, TraceFrame, TraceGap, TraceModel } from "./traceModel";

const CITE = /\(finding_id:\s*([^)]+)\)/g;

export function stripCitations(text: string): string {
  return text.replace(/\s*\(finding_id:\s*[^)]+\)/g, "").trim();
}

function isHeading(block: string): boolean {
  return /^#{1,6}\s/.test(block.trim());
}

export function splitClaims(markdown: string, findings: Record<string, unknown>): Claim[] {
  const claims: Claim[] = [];
  let n = 0;
  for (const rawBlock of markdown.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (isHeading(block)) {
      claims.push({ id: `claim-${n++}`, text: block, kind: "heading", findingIds: [], unresolvedIds: [] });
      continue;
    }
    CITE.lastIndex = 0;
    let last = 0;
    let matched = false;
    let m: RegExpExecArray | null;
    while ((m = CITE.exec(block)) !== null) {
      matched = true;
      const end = m.index + m[0].length;
      const text = block.slice(last, end).trim();
      const ids = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      const findingIds = ids.filter((id) => id in findings);
      const unresolvedIds = ids.filter((id) => !(id in findings));
      if (text) claims.push({ id: `claim-${n++}`, text, kind: "prose", findingIds, unresolvedIds });
      last = end;
    }
    if (!matched) {
      claims.push({ id: `claim-${n++}`, text: block, kind: "prose", findingIds: [], unresolvedIds: [] });
    } else {
      const tail = block.slice(last).trim();
      if (tail) claims.push({ id: `claim-${n++}`, text: tail, kind: "prose", findingIds: [], unresolvedIds: [] });
    }
  }
  return claims;
}

function findingGapMap(frames: BundleFrame[], gaps: BundleGap[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of frames) {
    if (f.event === "finding_merged" && typeof f.finding_id === "string" && typeof f.gap_id === "string") {
      map[f.finding_id] = f.gap_id;
    }
  }
  for (const g of gaps) for (const fid of g.finding_ids) if (!(fid in map)) map[fid] = g.gap_id;
  return map;
}

function contributorMap(frames: BundleFrame[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of frames) {
    if (f.event === "finding_merged" && typeof f.finding_id === "string" && typeof f.contributor === "string") {
      map[f.finding_id] = f.contributor;
    }
  }
  return map;
}

function buildLifecycle(gapId: string, frames: BundleFrame[], gap: BundleGap): GapEvent[] {
  const events: GapEvent[] = [];
  let round = 0;
  let filledOnce = false;
  let sawDone = false;
  for (const f of frames) {
    if (f.event === "phase" && typeof f.round === "number") round = f.round;
    if (f.gap_id !== gapId) continue;
    if (f.event === "gap_opened") {
      events.push({
        kind: filledOnce ? "reopened" : "opened",
        t: f.t as number,
        round,
        reason: filledOnce ? gap.reason ?? undefined : undefined,
      });
    } else if (f.event === "gap_claimed") {
      events.push({ kind: "claimed", t: f.t as number, by: f.claimed_by as string, round });
    } else if (f.event === "gap_filled") {
      if (f.status === "done") {
        sawDone = true;
        events.push({ kind: "done", t: f.t as number, coverage: f.coverage as Coverage, round });
      } else {
        filledOnce = true;
        events.push({ kind: "filled", t: f.t as number, coverage: f.coverage as Coverage, round });
      }
    }
  }
  if (gap.status === "done" && !sawDone) {
    events.push({ kind: "done", coverage: gap.coverage ?? undefined });
  }
  if (gap.status === "dead") {
    events.push({ kind: "dead", coverage: gap.coverage ?? undefined, reason: gap.reason ?? undefined });
  }
  return events;
}

export function buildTrace(bundle: SocietyRunBundle): TraceModel {
  const claims = splitClaims(bundle.report.markdown, bundle.findings);
  const fgMap = findingGapMap(bundle.frames, bundle.gaps);
  const contribs = contributorMap(bundle.frames);

  const findings: Record<string, TraceFinding> = {};
  for (const [id, f] of Object.entries(bundle.findings)) {
    findings[id] = {
      id,
      title: f.title,
      content: f.content,
      category: f.category,
      confidence: f.confidence,
      gapId: fgMap[id] ?? null,
      contributor: contribs[id] ?? null,
      sources: f.provenance.map((p) => ({ url: p.url, domain: p.domain, query: p.query })),
    };
  }

  const gaps: Record<string, TraceGap> = {};
  for (const g of bundle.gaps) {
    gaps[g.gap_id] = {
      id: g.gap_id,
      question: g.question,
      status: g.status,
      owner: g.owner,
      coverage: g.coverage,
      attempts: g.attempts,
      reason: g.reason,
      parentId: g.parent_id,
      findingIds: g.finding_ids,
      lifecycle: buildLifecycle(g.gap_id, bundle.frames, g),
    };
  }

  const frames: TraceFrame[] = bundle.frames.map((f) => ({ ...f }));
  return { meta: bundle.meta, claims, findings, gaps, frames, unanswered: bundle.report.unanswered };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- buildTrace`
Expected: PASS (all assertions green).

- [ ] **Step 5: Type-check + commit**

```bash
npm run build
git add frontend/src/trace/buildTrace.ts frontend/src/trace/buildTrace.test.ts
git commit -m "feat(trace): buildTrace — bundle → TraceModel (claims, lifecycle, sources)"
```

---

### Task 3: View toggle plumbing + empty Trace view

**Files:**
- Modify: `frontend/src/state/store.ts` (add `view` + `setView` to `AppState` interface, initial value, action)
- Test: `frontend/src/state/view.test.ts`
- Modify: `frontend/src/panels/TopBar.tsx` (segmented toggle)
- Modify: `frontend/src/App.tsx` (render `<TraceView/>` when `view === "trace"`)
- Create: `frontend/src/trace/TraceView.tsx` (loads the fixture, builds the model, placeholder body)
- Create: `frontend/src/trace/fixtures/sample.json` (minimal hand-authored bundle to render against during dev)
- Create: `frontend/src/styles/trace.css`
- Modify: `frontend/src/main.tsx` (import `trace.css`)

**Interfaces:**
- Consumes: `buildTrace` (Task 2), `SocietyRunBundle` (Task 1).
- Produces: store `view: "graph" | "trace"` + `setView(v): void`; `TraceView` default export.

- [ ] **Step 1: Write the failing test `frontend/src/state/view.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { useStore } from "./store";

describe("view toggle", () => {
  it("defaults to graph and setView switches it", () => {
    expect(useStore.getState().view).toBe("graph");
    useStore.getState().setView("trace");
    expect(useStore.getState().view).toBe("trace");
    useStore.getState().setView("graph");
    expect(useStore.getState().view).toBe("graph");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- view`
Expected: FAIL — `view`/`setView` do not exist on the store.

- [ ] **Step 3: Add `view` + `setView` to the store**

In `frontend/src/state/store.ts`, in the `AppState` interface add (next to `society: SocietyState | null;` around line 100):

```ts
  view: "graph" | "trace";
```

and in the actions section of the interface (near `runSociety(...)` around line 131) add:

```ts
  setView(view: "graph" | "trace"): void;
```

In the `create<AppState>(...)` initializer (near `society: null,` around line 179) add:

```ts
  view: "graph",
```

and add the action implementation (place it near `setLastAction`, anywhere among the action definitions):

```ts
  setView(view) {
    set({ view });
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- view`
Expected: PASS.

- [ ] **Step 5: Create the minimal fixture `frontend/src/trace/fixtures/sample.json`**

```json
{
  "meta": {
    "topic": "What is the stablecoin regulatory landscape in 2026?",
    "run_id": "sample", "kb_id": "sample", "captured_at": "2026-06-27T00:00:00Z",
    "n_researchers": 2, "max_rounds": 3, "rounds": 1, "finding_count": 2,
    "gaps_done": 1, "gaps_dead": 0, "models": { "planner": "qwen-max" }
  },
  "frames": [
    { "t": 0, "event": "phase", "phase": "seeding", "round": 0 },
    { "t": 10, "event": "gap_opened", "gap_id": "g1", "question": "How are reserves audited?", "parent_id": null },
    { "t": 20, "event": "gap_opened", "gap_id": "g2", "question": "Who are the major issuers?", "parent_id": null },
    { "t": 30, "event": "phase", "phase": "researching", "round": 1 },
    { "t": 40, "event": "gap_claimed", "gap_id": "g1", "claimed_by": "r1", "role": "researcher" },
    { "t": 50, "event": "finding_merged", "finding_id": "f1", "gap_id": "g1", "title": "MiCA reserve attestation rules", "contributor": "r1" },
    { "t": 60, "event": "gap_filled", "gap_id": "g1", "coverage": "rich", "finding_ids": ["f1"], "status": "verified" },
    { "t": 70, "event": "gap_claimed", "gap_id": "g2", "claimed_by": "r2", "role": "researcher" },
    { "t": 80, "event": "finding_merged", "finding_id": "f2", "gap_id": "g2", "title": "Circle issues USDC under NYDFS", "contributor": "r2" },
    { "t": 90, "event": "gap_filled", "gap_id": "g2", "coverage": "rich", "finding_ids": ["f2"], "status": "done" },
    { "t": 100, "event": "report", "report": "## Stablecoin landscape 2026\n\nReserves face attestation requirements (finding_id: f1). Major issuers operate under emerging frameworks (finding_id: f2).", "unanswered": [] }
  ],
  "gaps": [
    { "gap_id": "g1", "question": "How are reserves audited?", "status": "done", "owner": "r1", "coverage": "rich", "attempts": 1, "reason": null, "parent_id": null, "finding_ids": ["f1"], "created_at": "2026-06-27T00:00:00Z", "updated_at": "2026-06-27T00:01:00Z" },
    { "gap_id": "g2", "question": "Who are the major issuers?", "status": "done", "owner": "r2", "coverage": "rich", "attempts": 1, "reason": null, "parent_id": null, "finding_ids": ["f2"], "created_at": "2026-06-27T00:00:00Z", "updated_at": "2026-06-27T00:01:00Z" }
  ],
  "findings": {
    "f1": { "id": "f1", "title": "MiCA reserve attestation rules", "content": "EU MiCA requires stablecoin issuers to hold fully-backed reserves with regular third-party attestation.", "category": "regulation", "confidence": 0.86, "provenance": [{ "url": "https://eur-lex.europa.eu/mica", "domain": "eur-lex.europa.eu", "query": "MiCA stablecoin reserve attestation" }] },
    "f2": { "id": "f2", "title": "Circle issues USDC under NYDFS", "content": "Circle issues USDC under NYDFS oversight, publishing monthly reserve reports.", "category": "issuer", "confidence": 0.9, "provenance": [{ "url": "https://www.circle.com/usdc", "domain": "circle.com", "query": "Circle USDC NYDFS reserves" }] }
  },
  "report": {
    "markdown": "## Stablecoin landscape 2026\n\nReserves face attestation requirements (finding_id: f1). Major issuers operate under emerging frameworks (finding_id: f2).",
    "unanswered": []
  }
}
```

- [ ] **Step 6: Create `frontend/src/trace/TraceView.tsx` (placeholder body that proves the model loads)**

```tsx
/**
 * Trace view shell. Loads the committed run bundle, builds the TraceModel once,
 * and (for now) confirms it rendered. Panels are added in later tasks.
 */

import { useMemo } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <div className="trace-stub">
        {model.claims.length} claims · {Object.keys(model.gaps).length} gaps ·{" "}
        {Object.keys(model.findings).length} findings
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add the toggle to `frontend/src/panels/TopBar.tsx`**

At the top of the `TopBar` component body (with the other `useStore` selectors, around line 18) add:

```tsx
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
```

In the returned JSX, immediately after `<GraphSearch />` (around line 51) insert:

```tsx
      <div className="tb-viewtoggle">
        <button
          className={`btn${view === "graph" ? " btn--active" : ""}`}
          onClick={() => setView("graph")}
        >
          graph
        </button>
        <button
          className={`btn${view === "trace" ? " btn--active" : ""}`}
          onClick={() => setView("trace")}
        >
          trace
        </button>
      </div>
```

- [ ] **Step 8: Route the view in `frontend/src/App.tsx`**

Add the import near the other panel imports:

```tsx
import TraceView from "./trace/TraceView";
```

Add the selector with the other `useStore` calls in `App`:

```tsx
  const view = useStore((s) => s.view);
```

Replace the `return (...)` shell block (lines 56-75) with:

```tsx
  return (
    <div className="shell">
      <TopBar />
      {view === "trace" ? (
        <TraceView />
      ) : (
        <div className="shell-main">
          <LeftRail />
          <div style={{ position: "relative", minWidth: 0 }}>
            <SocietyPanel />
            <GraphCanvas />
            {travel && <TravelHud />}
          </div>
          <Inspector />
        </div>
      )}
      <StatusBar />
      <FindingDrawer />
      <ConceptDocReader />
      <ReportOverlay />
      <AddNodeModal />
      <Toasts />
    </div>
  );
```

- [ ] **Step 9: Create `frontend/src/styles/trace.css`**

```css
.trace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px 1fr 336px;
  grid-template-rows: 1fr auto;
  gap: 1px;
  background: var(--line);
  overflow: hidden;
}
.trace > * { background: var(--bg1); }
.trace-badge {
  grid-column: 1 / -1;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}
.trace-stub { padding: 12px; color: var(--text-dim); font-family: var(--font-mono); }
```

- [ ] **Step 10: Import the stylesheet in `frontend/src/main.tsx`**

Add an import alongside the other `./styles/*.css` imports:

```tsx
import "./styles/trace.css";
```

- [ ] **Step 11: Verify build + manual check**

Run: `npm run test -- view` → PASS. Then `npm run build` → PASS.
Manual: `npm run dev`, click **trace** in the top bar — the graph is replaced by the badge + `2 claims · 2 gaps · 2 findings`. Click **graph** — the original dashboard returns intact.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/state/store.ts frontend/src/state/view.test.ts \
        frontend/src/panels/TopBar.tsx frontend/src/App.tsx \
        frontend/src/trace/TraceView.tsx frontend/src/trace/fixtures/sample.json \
        frontend/src/styles/trace.css frontend/src/main.tsx
git commit -m "feat(trace): view toggle + empty Trace shell loading the run bundle"
```

---

### Task 4: Report pane with clickable claims

**Files:**
- Create: `frontend/src/trace/ReportPane.tsx`
- Modify: `frontend/src/trace/TraceView.tsx` (hold `activeClaimId`, render `ReportPane`)
- Modify: `frontend/src/styles/trace.css` (claim styles)

**Interfaces:**
- Consumes: `TraceModel`/`Claim` (Task 1), `stripCitations` (Task 2), `renderMarkdown` from `../okf/markdown` (existing: `renderMarkdown(src: string): string`).
- Produces: `ReportPane` (named export) with props `{ model: TraceModel; activeClaimId: string | null; onSelectClaim: (id: string) => void }`.

- [ ] **Step 1: Create `frontend/src/trace/ReportPane.tsx`**

```tsx
/**
 * Left pane: the cited report. Heading claims render as markdown; prose claims
 * carrying a (finding_id: …) citation are clickable and drive the map.
 */

import { renderMarkdown } from "../okf/markdown";
import { stripCitations } from "./buildTrace";
import type { Claim, TraceModel } from "./traceModel";

interface Props {
  model: TraceModel;
  activeClaimId: string | null;
  onSelectClaim: (id: string) => void;
}

function ClaimLine({ claim, active, onSelect }: { claim: Claim; active: boolean; onSelect: () => void }) {
  if (claim.kind === "heading") {
    return <div className="trace-claim-h" dangerouslySetInnerHTML={{ __html: renderMarkdown(claim.text) }} />;
  }
  const cited = claim.findingIds.length > 0 || claim.unresolvedIds.length > 0;
  if (!cited) {
    return <p className="trace-claim-plain">{stripCitations(claim.text)}</p>;
  }
  return (
    <button
      type="button"
      className={`trace-claim${active ? " trace-claim--active" : ""}`}
      onClick={onSelect}
    >
      <span className="trace-claim-text">{stripCitations(claim.text)}</span>
      <span className="trace-claim-cites">
        {claim.findingIds.map((id) => (
          <span key={id} className="trace-cite">{id}</span>
        ))}
        {claim.unresolvedIds.map((id) => (
          <span key={id} className="trace-cite trace-cite--missing" title="cited id not found in this run">
            {id}?
          </span>
        ))}
      </span>
    </button>
  );
}

export function ReportPane({ model, activeClaimId, onSelectClaim }: Props) {
  return (
    <div className="trace-report">
      {model.claims.map((c) => (
        <ClaimLine
          key={c.id}
          claim={c}
          active={c.id === activeClaimId}
          onSelect={() => onSelectClaim(c.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire `ReportPane` into `TraceView` with `activeClaimId` state**

Replace the body of `frontend/src/trace/TraceView.tsx` with:

```tsx
/**
 * Trace view shell. Loads the committed run bundle, builds the TraceModel once,
 * and coordinates claim/node/playhead selection across the panes.
 */

import { useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { ReportPane } from "./ReportPane";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);

  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <ReportPane model={model} activeClaimId={activeClaimId} onSelectClaim={setActiveClaimId} />
      <div className="trace-stub">map → Task 5</div>
      <div className="trace-stub">inspector → Task 6</div>
    </div>
  );
}
```

- [ ] **Step 3: Add claim styles to `frontend/src/styles/trace.css`**

```css
.trace-report { padding: 14px; overflow-y: auto; font-family: var(--font-body); }
.trace-claim-h { color: var(--text); margin: 4px 0 10px; }
.trace-claim-plain { color: var(--text-dim); margin: 6px 0; }
.trace-claim {
  display: block; width: 100%; text-align: left; cursor: pointer;
  background: none; border: 1px solid transparent; border-radius: var(--radius);
  padding: 6px 8px; margin: 2px 0; color: var(--text); font: inherit;
}
.trace-claim:hover { border-color: var(--line-bright); }
.trace-claim--active { border-color: var(--accent); background: var(--accent-dim); }
.trace-claim-cites { display: inline-flex; gap: 4px; margin-left: 6px; vertical-align: middle; }
.trace-cite {
  font-family: var(--font-mono); font-size: 10px; color: var(--accent);
  border: 1px solid var(--line-bright); border-radius: 3px; padding: 0 4px;
}
.trace-cite--missing { color: var(--gap); border-color: var(--gap); }
```

- [ ] **Step 4: Verify build + manual check**

Run: `npm run build` → PASS.
Manual: in trace view, the report renders; clicking a cited sentence outlines it in amber (`--active`); its `finding_id` chips show; an unresolved id (none in `sample.json`, but verify the styling path holds) would show red with `?`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/trace/ReportPane.tsx frontend/src/trace/TraceView.tsx frontend/src/styles/trace.css
git commit -m "feat(trace): report pane with clickable cited claims"
```

---

### Task 5: SVG derivation map

**Files:**
- Create: `frontend/src/trace/layout.ts` (pure column layout)
- Test: `frontend/src/trace/layout.test.ts`
- Create: `frontend/src/trace/DerivationMap.tsx`
- Modify: `frontend/src/trace/TraceView.tsx` (compute the selected subgraph, render the map)
- Modify: `frontend/src/styles/trace.css` (map styles)

**Interfaces:**
- Consumes: `TraceModel`/`TraceGap`/`TraceFinding` (Task 1), `contributorColor` from `../graph/contributors` (existing: `contributorColor(id: string): string`).
- Produces: `layoutColumn(ids: string[], x: number, height: number): Placed[]` where `Placed = { id: string; x: number; y: number }`; `DerivationMap` (named export) with props `{ model: TraceModel; activeClaimId: string | null; selectedNodeId: string | null; onSelectNode: (n: SelectedNode) => void }` and exported type `SelectedNode = { kind: "finding" | "gap" | "source"; id: string }`.

- [ ] **Step 1: Write the failing test `frontend/src/trace/layout.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- layout`
Expected: FAIL — `layoutColumn` not exported.

- [ ] **Step 3: Implement `frontend/src/trace/layout.ts`**

```ts
/** Pure column layout for the derivation map. Deterministic, no DOM. */

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export function layoutColumn(ids: string[], x: number, height: number): Placed[] {
  if (ids.length === 0) return [];
  const step = height / (ids.length + 1);
  return ids.map((id, i) => ({ id, x, y: Math.round(step * (i + 1)) }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- layout`
Expected: PASS.

- [ ] **Step 5: Create `frontend/src/trace/DerivationMap.tsx`**

```tsx
/**
 * Center pane: a 4-column SVG derivation map (Claim · Findings · Gaps · Sources).
 * Selecting a claim lights the path claim→findings→gap→sources and dims the rest.
 */

import { useMemo } from "react";
import { contributorColor } from "../graph/contributors";
import { layoutColumn, type Placed } from "./layout";
import type { Coverage } from "../api/types";
import type { TraceModel } from "./traceModel";

export type SelectedNode = { kind: "finding" | "gap" | "source"; id: string };

interface Props {
  model: TraceModel;
  activeClaimId: string | null;
  selectedNodeId: string | null;
  onSelectNode: (n: SelectedNode) => void;
}

const W = 760;
const H = 460;
const COL = { claim: 70, finding: 280, gap: 500, source: 700 };

function coverageColor(c: Coverage | null): string {
  if (c === "rich") return "var(--rich)";
  if (c === "sparse") return "var(--sparse)";
  return "var(--gap)";
}

function bezier(a: Placed, b: Placed): string {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

export function DerivationMap({ model, activeClaimId, selectedNodeId, onSelectNode }: Props) {
  const view = useMemo(() => {
    const claim = activeClaimId ? model.claims.find((c) => c.id === activeClaimId) ?? null : null;
    const findingIds = claim ? claim.findingIds : Object.keys(model.findings);
    const gapIds = Array.from(
      new Set(findingIds.map((fid) => model.findings[fid]?.gapId).filter((g): g is string => !!g)),
    );
    const sourceKeys: string[] = [];
    for (const fid of findingIds) {
      (model.findings[fid]?.sources ?? []).forEach((s, i) => sourceKeys.push(`${fid}#${i}`));
    }
    return { claim, findingIds, gapIds, sourceKeys };
  }, [model, activeClaimId]);

  const claimPlaced = layoutColumn(view.claim ? [view.claim.id] : ["all"], COL.claim, H);
  const findingPlaced = layoutColumn(view.findingIds, COL.finding, H);
  const gapPlaced = layoutColumn(view.gapIds, COL.gap, H);
  const sourcePlaced = layoutColumn(view.sourceKeys, COL.source, H);

  const findingPos = new Map(findingPlaced.map((p) => [p.id, p]));
  const gapPos = new Map(gapPlaced.map((p) => [p.id, p]));
  const sourcePos = new Map(sourcePlaced.map((p) => [p.id, p]));

  const edges: Array<{ a: Placed; b: Placed }> = [];
  for (const fp of findingPlaced) {
    if (view.claim && claimPlaced[0]) edges.push({ a: claimPlaced[0], b: fp });
    const gid = model.findings[fp.id]?.gapId;
    const gp = gid ? gapPos.get(gid) : undefined;
    if (gp) edges.push({ a: fp, b: gp });
    (model.findings[fp.id]?.sources ?? []).forEach((_s, i) => {
      const sp = sourcePos.get(`${fp.id}#${i}`);
      if (sp) edges.push({ a: fp, b: sp });
    });
  }

  return (
    <svg className="trace-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <g className="trace-map-edges">
        {edges.map((e, i) => (
          <path key={i} d={bezier(e.a, e.b)} className="trace-edge" />
        ))}
      </g>
      {claimPlaced[0] && view.claim && (
        <g transform={`translate(${claimPlaced[0].x}, ${claimPlaced[0].y})`}>
          <circle r={9} className="trace-node trace-node--claim" />
          <text className="trace-node-label" x={14} y={4}>claim</text>
        </g>
      )}
      {findingPlaced.map((p) => {
        const f = model.findings[p.id];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "finding", id: p.id })}
          >
            <circle r={8} className="trace-node" style={{ fill: contributorColor(f?.contributor ?? "r0") }} />
            <text className="trace-node-label" x={12} y={4}>{f?.title.slice(0, 22) ?? p.id}</text>
          </g>
        );
      })}
      {gapPlaced.map((p) => {
        const g = model.gaps[p.id];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "gap", id: p.id })}
          >
            <rect x={-9} y={-9} width={18} height={18} rx={3} className="trace-node"
              style={{ fill: coverageColor(g?.coverage ?? null) }} />
            <text className="trace-node-label" x={14} y={4}>{g?.question.slice(0, 22) ?? p.id}</text>
          </g>
        );
      })}
      {sourcePlaced.map((p) => {
        const [fid, idx] = p.id.split("#");
        const src = model.findings[fid]?.sources[Number(idx)];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "source", id: p.id })}
          >
            <circle r={5} className="trace-node trace-node--source" />
            <text className="trace-node-label" x={10} y={3}>{src?.domain ?? "source"}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 6: Render the map in `TraceView` and add `selectedNode` state**

Replace `frontend/src/trace/TraceView.tsx` with:

```tsx
import { useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { DerivationMap, type SelectedNode } from "./DerivationMap";
import { ReportPane } from "./ReportPane";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  const selectClaim = (id: string) => {
    setActiveClaimId(id);
    setSelected(null);
  };

  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <ReportPane model={model} activeClaimId={activeClaimId} onSelectClaim={selectClaim} />
      <DerivationMap
        model={model}
        activeClaimId={activeClaimId}
        selectedNodeId={selected?.id ?? null}
        onSelectNode={setSelected}
      />
      <div className="trace-stub">inspector → Task 6</div>
    </div>
  );
}
```

- [ ] **Step 7: Add map styles to `frontend/src/styles/trace.css`**

```css
.trace-map { width: 100%; height: 100%; display: block; }
.trace-edge { fill: none; stroke: var(--line-bright); stroke-width: 1.5; opacity: 0.5; }
.trace-node { stroke: var(--bg0); stroke-width: 1.5; }
.trace-node--claim { fill: var(--accent); }
.trace-node--source { fill: var(--text-dim); }
.trace-node-label { fill: var(--text-dim); font-family: var(--font-mono); font-size: 10px; }
.trace-hit { cursor: pointer; }
.trace-hit:hover .trace-node-label { fill: var(--text); }
.trace-hit--sel .trace-node { stroke: var(--accent-bright); stroke-width: 2.5; }
```

- [ ] **Step 8: Verify build + manual check**

Run: `npm run test -- layout` → PASS. `npm run build` → PASS.
Manual: trace view shows all findings/gaps/sources when no claim is selected; clicking a claim collapses the map to that claim's subgraph with connector paths; clicking a node outlines it.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/trace/layout.ts frontend/src/trace/layout.test.ts \
        frontend/src/trace/DerivationMap.tsx frontend/src/trace/TraceView.tsx \
        frontend/src/styles/trace.css
git commit -m "feat(trace): SVG derivation map with claim-driven subgraph"
```

---

### Task 6: Detail inspector

**Files:**
- Create: `frontend/src/trace/describe.ts` (pure lifecycle phrasing)
- Test: `frontend/src/trace/describe.test.ts`
- Create: `frontend/src/trace/TraceInspector.tsx`
- Modify: `frontend/src/trace/TraceView.tsx` (render the inspector for the selected node)

**Interfaces:**
- Consumes: `TraceModel`/`TraceGap` (Task 1), `SelectedNode` (Task 5), `safeHref` from `../okf/markdown` (existing: `safeHref(url: string): string | null`).
- Produces: `describeLifecycle(gap: TraceGap): string[]`; `TraceInspector` (named export) with props `{ model: TraceModel; selected: SelectedNode | null }`.

- [ ] **Step 1: Write the failing test `frontend/src/trace/describe.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- describe`
Expected: FAIL — `describeLifecycle` not exported.

- [ ] **Step 3: Implement `frontend/src/trace/describe.ts`**

```ts
/** Pure: phrase a gap's lifecycle for the inspector. No DOM. */

import type { GapEvent, TraceGap } from "./traceModel";

function phrase(e: GapEvent, gap: TraceGap): string {
  switch (e.kind) {
    case "opened":
      return gap.parentId ? "spawned by Critic (sharpen)" : "opened by planner";
    case "claimed":
      return `claimed by ${e.by ?? "?"}`;
    case "filled":
      return `verified ${e.coverage ?? "?"}`;
    case "reopened":
      return `Critic reopened${e.reason ? ` (${e.reason})` : ""}`;
    case "done":
      return `done (${e.coverage ?? "rich"})`;
    case "dead":
      return `killed dead${e.reason ? ` (${e.reason})` : ""}`;
    default:
      return e.kind;
  }
}

export function describeLifecycle(gap: TraceGap): string[] {
  return gap.lifecycle.map((e) => phrase(e, gap));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- describe`
Expected: PASS.

- [ ] **Step 5: Create `frontend/src/trace/TraceInspector.tsx`**

```tsx
/**
 * Right pane: deep detail for the selected map node — a gap's full lifecycle
 * (Critic reason / attempts / dead), a finding's body, or a source's query.
 */

import { safeHref } from "../okf/markdown";
import { describeLifecycle } from "./describe";
import type { SelectedNode } from "./DerivationMap";
import type { TraceModel } from "./traceModel";

interface Props {
  model: TraceModel;
  selected: SelectedNode | null;
}

export function TraceInspector({ model, selected }: Props) {
  if (!selected) {
    return <div className="trace-insp"><p className="trace-insp-empty">select a node to inspect its derivation</p></div>;
  }

  if (selected.kind === "gap") {
    const g = model.gaps[selected.id];
    if (!g) return <div className="trace-insp" />;
    return (
      <div className="trace-insp">
        <div className="trace-insp-kind">gap</div>
        <div className="trace-insp-title">{g.question}</div>
        <div className="trace-insp-row">status <b>{g.status}</b> · attempts {g.attempts} · {g.coverage ?? "—"}</div>
        <ol className="trace-life">
          {describeLifecycle(g).map((line, i) => (
            <li key={i} className="trace-life-step">{line}</li>
          ))}
        </ol>
        {g.attempts > 1 && (
          <p className="trace-insp-note">reason shown is the final reopen reason (earlier reasons aren't recorded).</p>
        )}
      </div>
    );
  }

  if (selected.kind === "finding") {
    const f = model.findings[selected.id];
    if (!f) return <div className="trace-insp" />;
    return (
      <div className="trace-insp">
        <div className="trace-insp-kind">finding · {f.contributor ?? "?"}</div>
        <div className="trace-insp-title">{f.title}</div>
        <div className="trace-insp-row">{f.category}{f.confidence != null ? ` · conf ${f.confidence.toFixed(2)}` : ""}</div>
        <p className="trace-insp-body">{f.content}</p>
      </div>
    );
  }

  const [fid, idx] = selected.id.split("#");
  const src = model.findings[fid]?.sources[Number(idx)];
  if (!src) return <div className="trace-insp" />;
  const href = safeHref(src.url);
  return (
    <div className="trace-insp">
      <div className="trace-insp-kind">source</div>
      <div className="trace-insp-title">{src.domain}</div>
      <div className="trace-insp-row">query: <span className="trace-q">{src.query}</span></div>
      {href ? (
        <a className="trace-insp-link" href={href} target="_blank" rel="noreferrer">{src.url}</a>
      ) : (
        <span className="trace-insp-link">{src.url}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Render the inspector in `TraceView`**

In `frontend/src/trace/TraceView.tsx`, add the import:

```tsx
import { TraceInspector } from "./TraceInspector";
```

and replace the `<div className="trace-stub">inspector → Task 6</div>` line with:

```tsx
      <TraceInspector model={model} selected={selected} />
```

- [ ] **Step 7: Add inspector styles to `frontend/src/styles/trace.css`**

```css
.trace-insp { padding: 14px; overflow-y: auto; font-family: var(--font-body); }
.trace-insp-empty { color: var(--text-faint); font-family: var(--font-mono); font-size: 12px; }
.trace-insp-kind { font-family: var(--font-mono); font-size: 10px; color: var(--accent); text-transform: uppercase; }
.trace-insp-title { color: var(--text); margin: 4px 0 8px; font-size: 14px; }
.trace-insp-row { color: var(--text-dim); font-size: 12px; margin: 4px 0; }
.trace-insp-body { color: var(--text); font-size: 13px; line-height: 1.5; }
.trace-insp-note { color: var(--text-faint); font-size: 11px; font-style: italic; }
.trace-insp-link { color: var(--accent); font-size: 12px; word-break: break-all; }
.trace-q { color: var(--text); font-family: var(--font-mono); }
.trace-life { margin: 8px 0; padding-left: 16px; }
.trace-life-step { color: var(--text); font-size: 12px; margin: 3px 0; }
```

- [ ] **Step 8: Verify build + manual check**

Run: `npm run test -- describe` → PASS. `npm run build` → PASS.
Manual: clicking a gap node shows its lifecycle steps; clicking a finding shows its body + contributor; clicking a source shows the URL + the search query.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/trace/describe.ts frontend/src/trace/describe.test.ts \
        frontend/src/trace/TraceInspector.tsx frontend/src/trace/TraceView.tsx \
        frontend/src/styles/trace.css
git commit -m "feat(trace): detail inspector (gap lifecycle / finding / source)"
```

---

### Task 7: Transport (forward replay over frames)

**Files:**
- Create: `frontend/src/trace/playhead.ts` (pure: which nodes exist at a playhead index)
- Test: `frontend/src/trace/playhead.test.ts`
- Create: `frontend/src/trace/Transport.tsx`
- Modify: `frontend/src/trace/DerivationMap.tsx` (accept a `visible` filter)
- Modify: `frontend/src/trace/TraceView.tsx` (playhead state + auto-play; pass `visible` to the map)
- Modify: `frontend/src/styles/trace.css` (transport styles)

**Interfaces:**
- Consumes: `TraceFrame` (Task 1).
- Produces: `visibleAtPlayhead(frames: TraceFrame[], playhead: number): { gaps: Set<string>; findings: Set<string> }`; `Transport` (named export) props `{ count: number; playhead: number; playing: boolean; onSeek: (i: number) => void; onTogglePlay: () => void }`. `DerivationMap` gains an optional prop `visible?: { gaps: Set<string>; findings: Set<string> }`.

- [ ] **Step 1: Write the failing test `frontend/src/trace/playhead.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- playhead`
Expected: FAIL — `visibleAtPlayhead` not exported.

- [ ] **Step 3: Implement `frontend/src/trace/playhead.ts`**

```ts
/** Pure: the set of nodes that exist once frames[0..playhead] have played. */

import type { TraceFrame } from "./traceModel";

export function visibleAtPlayhead(
  frames: TraceFrame[],
  playhead: number,
): { gaps: Set<string>; findings: Set<string> } {
  const gaps = new Set<string>();
  const findings = new Set<string>();
  for (let i = 0; i <= playhead && i < frames.length; i += 1) {
    const f = frames[i];
    if (f.event === "gap_opened" && typeof f.gap_id === "string") gaps.add(f.gap_id);
    if (f.event === "finding_merged" && typeof f.finding_id === "string") findings.add(f.finding_id);
  }
  return { gaps, findings };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- playhead`
Expected: PASS.

- [ ] **Step 5: Create `frontend/src/trace/Transport.tsx`**

```tsx
/** Bottom transport: play / pause / step / scrub over the recorded frames. */

interface Props {
  count: number;
  playhead: number;
  playing: boolean;
  onSeek: (i: number) => void;
  onTogglePlay: () => void;
}

export function Transport({ count, playhead, playing, onSeek, onTogglePlay }: Props) {
  const max = Math.max(0, count - 1);
  return (
    <div className="trace-transport">
      <button className="btn" onClick={onTogglePlay}>{playing ? "❚❚" : "▶"}</button>
      <button className="btn" onClick={() => onSeek(Math.max(0, playhead - 1))}>‹ step</button>
      <input
        className="trace-scrub"
        type="range"
        min={0}
        max={max}
        value={Math.min(playhead, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <button className="btn" onClick={() => onSeek(Math.min(max, playhead + 1))}>step ›</button>
      <span className="trace-frame-count">{Math.min(playhead, max) + 1} / {count}</span>
    </div>
  );
}
```

- [ ] **Step 6: Add a `visible` filter to `DerivationMap`**

In `frontend/src/trace/DerivationMap.tsx`, add to `Props`:

```tsx
  visible?: { gaps: Set<string>; findings: Set<string> };
```

and update the `view` memo's finding selection to respect it. Replace the `view` memo body with:

```tsx
  const view = useMemo(() => {
    const claim = activeClaimId ? model.claims.find((c) => c.id === activeClaimId) ?? null : null;
    let findingIds = claim ? claim.findingIds : Object.keys(model.findings);
    if (visible) findingIds = findingIds.filter((fid) => visible.findings.has(fid));
    const gapIds = Array.from(
      new Set(findingIds.map((fid) => model.findings[fid]?.gapId).filter((g): g is string => !!g)),
    );
    const sourceKeys: string[] = [];
    for (const fid of findingIds) {
      (model.findings[fid]?.sources ?? []).forEach((_s, i) => sourceKeys.push(`${fid}#${i}`));
    }
    return { claim, findingIds, gapIds, sourceKeys };
  }, [model, activeClaimId, visible]);
```

and add `visible` to the destructured props: `export function DerivationMap({ model, activeClaimId, selectedNodeId, onSelectNode, visible }: Props) {`.

- [ ] **Step 7: Wire playhead state + auto-play into `TraceView`**

Replace `frontend/src/trace/TraceView.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { DerivationMap, type SelectedNode } from "./DerivationMap";
import { ReportPane } from "./ReportPane";
import { TraceInspector } from "./TraceInspector";
import { Transport } from "./Transport";
import { visibleAtPlayhead } from "./playhead";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const frameCount = model.frames.length;
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [playhead, setPlayhead] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (playhead >= frameCount - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setPlayhead((p) => p + 1), 600);
    return () => window.clearTimeout(id);
  }, [playing, playhead, frameCount]);

  const selectClaim = (id: string) => {
    setActiveClaimId(id);
    setSelected(null);
    setPlayhead(frameCount - 1);
  };

  const togglePlay = () => {
    if (!playing && playhead >= frameCount - 1) setPlayhead(0);
    setPlaying((p) => !p);
  };

  const visible = useMemo(() => visibleAtPlayhead(model.frames, playhead), [model.frames, playhead]);

  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <ReportPane model={model} activeClaimId={activeClaimId} onSelectClaim={selectClaim} />
      <DerivationMap
        model={model}
        activeClaimId={activeClaimId}
        selectedNodeId={selected?.id ?? null}
        onSelectNode={setSelected}
        visible={visible}
      />
      <TraceInspector model={model} selected={selected} />
      <div className="trace-transport-wrap">
        <Transport
          count={frameCount}
          playhead={playhead}
          playing={playing}
          onSeek={(i) => { setPlaying(false); setPlayhead(i); }}
          onTogglePlay={togglePlay}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add transport styles + grid row to `frontend/src/styles/trace.css`**

```css
.trace-transport-wrap { grid-column: 1 / -1; border-top: 1px solid var(--line); }
.trace-transport { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
.trace-scrub { flex: 1; }
.trace-frame-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }
```

- [ ] **Step 9: Verify build + manual check**

Run: `npm run test -- playhead` → PASS. `npm run build` → PASS.
Manual: pressing ▶ rewinds to 0 and builds the map up frame-by-frame; step ‹/› nudges one frame; scrub jumps; selecting a claim jumps to the end and shows that claim's full subgraph.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/trace/playhead.ts frontend/src/trace/playhead.test.ts \
        frontend/src/trace/Transport.tsx frontend/src/trace/DerivationMap.tsx \
        frontend/src/trace/TraceView.tsx frontend/src/styles/trace.css
git commit -m "feat(trace): transport — scrub/play the run forward over frames"
```

---

### Task 8: Capture script (records a real run bundle)

**Files:**
- Create: `scripts/__init__.py` (empty — makes `scripts` importable for the test)
- Create: `scripts/capture_run.py`
- Test: `tests/test_capture_bundle.py`

**Interfaces:**
- Consumes (lazily, inside `capture()` only): `qwen8.core.config.get_config`, `qwen8.society.run_society`, `qwen8.society.loop.bootstrap_society`, `qwen8.society.blackboard.list_gaps`, `qwen8.store.get_store`.
- Produces: `assemble_bundle(meta, frames, gaps_dicts, findings, report) -> dict`; `gap_to_dict(gap) -> dict`; `normalize_provenance(raw) -> list[dict]`; `async capture(topic, out_path, *, project, kb, content_cap) -> dict`.

- [ ] **Step 1: Write the failing test `tests/test_capture_bundle.py`**

```python
from __future__ import annotations

import json
from types import SimpleNamespace

from scripts.capture_run import assemble_bundle, gap_to_dict, normalize_provenance


def test_gap_to_dict_serializes_all_fields():
    g = SimpleNamespace(
        id="g1", question="q", status="dead", owner="r1", coverage="sparse",
        attempts=2, reason="insufficient", parent_id=None,
        finding_ids=["f1"], created_at="a", updated_at="b",
    )
    d = gap_to_dict(g)
    assert d == {
        "gap_id": "g1", "question": "q", "status": "dead", "owner": "r1",
        "coverage": "sparse", "attempts": 2, "reason": "insufficient",
        "parent_id": None, "finding_ids": ["f1"], "created_at": "a", "updated_at": "b",
    }


def test_normalize_provenance_coerces_entries():
    raw = [{"url": "https://x.com/a", "domain": "x.com", "query": "q"}, {"url": "https://y.com"}]
    out = normalize_provenance(raw)
    assert out[0] == {"url": "https://x.com/a", "domain": "x.com", "query": "q"}
    assert out[1] == {"url": "https://y.com", "domain": "", "query": ""}
    assert normalize_provenance(None) == []


def test_assemble_bundle_is_json_serializable_and_shaped():
    meta = {"topic": "t"}
    frames = [{"t": 0, "event": "phase", "phase": "seeding", "round": 0}]
    gap = SimpleNamespace(
        id="g1", question="q", status="done", owner="r1", coverage="rich",
        attempts=1, reason=None, parent_id=None, finding_ids=[], created_at="a", updated_at="b",
    )
    findings = {"f1": {"id": "f1", "title": "A", "content": "x", "category": "c",
                       "confidence": 0.5, "provenance": []}}
    report = {"markdown": "## r", "unanswered": []}
    bundle = assemble_bundle(meta, frames, [gap_to_dict(gap)], findings, report)
    assert set(bundle) == {"meta", "frames", "gaps", "findings", "report"}
    assert bundle["gaps"][0]["gap_id"] == "g1"
    json.dumps(bundle)  # must not raise
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from repo root): `python -m pytest tests/test_capture_bundle.py -v`
Expected: FAIL — `scripts.capture_run` does not exist.

- [ ] **Step 3: Create `scripts/__init__.py`** (empty file)

```python
```

- [ ] **Step 4: Implement `scripts/capture_run.py`**

```python
"""Record one society run into a Trace-view bundle JSON. Run once, with keys.

    python -m scripts.capture_run "What is the stablecoin landscape in 2026?" \
        frontend/src/trace/fixtures/sample.json

Heavy qwen8.* imports live INSIDE capture() so this module imports cleanly
(no keys/deps) for unit tests of the pure assembly helpers.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_provenance(raw: Any) -> list[dict]:
    out: list[dict] = []
    for p in raw or []:
        if isinstance(p, dict):
            out.append({
                "url": p.get("url", ""),
                "domain": p.get("domain", ""),
                "query": p.get("query", ""),
            })
    return out


def gap_to_dict(g: Any) -> dict:
    return {
        "gap_id": g.id,
        "question": g.question,
        "status": g.status,
        "owner": g.owner,
        "coverage": g.coverage,
        "attempts": g.attempts,
        "reason": g.reason,
        "parent_id": g.parent_id,
        "finding_ids": list(g.finding_ids or []),
        "created_at": g.created_at,
        "updated_at": g.updated_at,
    }


def assemble_bundle(meta: dict, frames: list[dict], gaps: list[dict],
                    findings: dict, report: dict) -> dict:
    return {
        "meta": meta,
        "frames": frames,
        "gaps": gaps,
        "findings": findings,
        "report": report,
    }


async def capture(
    topic: str,
    out_path: Path,
    *,
    project: str = "trace-demo",
    kb: str = "trace-demo",
    content_cap: int = 1500,
) -> dict:
    from qwen8.core.config import get_config
    from qwen8.society import run_society
    from qwen8.society.blackboard import list_gaps
    from qwen8.society.loop import bootstrap_society
    from qwen8.store import get_store

    cfg = get_config()
    store = get_store(db_path=None)
    org_id, project_id, kb_id = bootstrap_society(store, project_name=project, kb_name=kb)

    frames: list[dict] = []
    start = time.monotonic()

    async def record(name: str, data: dict) -> None:
        frames.append({"t": int((time.monotonic() - start) * 1000), "event": name, **data})

    result = await run_society(
        topic, org_id=org_id, project_id=project_id, kb_id=kb_id, cfg=cfg,
        on_event=record, store=store,
    )

    gaps = list_gaps(store, kb_id)
    fids = {fid for g in gaps for fid in (g.finding_ids or [])}
    findings: dict = {}
    for fid in fids:
        try:
            row = store.get_finding(kb_id, fid)
        except Exception:  # noqa: BLE001 — a pruned finding must not break capture
            continue
        findings[fid] = {
            "id": fid,
            "title": row.get("title", ""),
            "content": str(row.get("content", ""))[:content_cap],
            "category": row.get("category", ""),
            "confidence": row.get("confidence"),
            "provenance": normalize_provenance(row.get("provenance")),
        }

    report_frame = next((f for f in reversed(frames) if f["event"] == "report"), None)
    if report_frame is not None:
        report = {"markdown": report_frame.get("report", ""),
                  "unanswered": report_frame.get("unanswered", [])}
    else:
        report = {"markdown": result.report, "unanswered": result.unanswered}

    soc = cfg.society
    meta = {
        "topic": topic,
        "run_id": kb_id,
        "kb_id": kb_id,
        "captured_at": _now_iso(),
        "n_researchers": soc.n_researchers,
        "max_rounds": soc.max_rounds,
        "rounds": result.rounds,
        "finding_count": result.finding_count,
        "gaps_done": sum(1 for g in gaps if g.status == "done"),
        "gaps_dead": sum(1 for g in gaps if g.status == "dead"),
        "models": {
            "planner": getattr(soc, "planner_model", "qwen-max"),
            "researcher": getattr(soc, "researcher_model", "qwen-plus"),
            "critic": getattr(soc, "critic_model", "qwen-max"),
            "synthesizer": getattr(soc, "synthesizer_model", "qwen-max"),
        },
    }

    bundle = assemble_bundle(meta, frames, [gap_to_dict(g) for g in gaps], findings, report)
    out_path.write_text(json.dumps(bundle, indent=2))
    return bundle


def main() -> None:
    if len(sys.argv) < 3:
        print('usage: python -m scripts.capture_run "<topic>" <out.json>', file=sys.stderr)
        raise SystemExit(2)
    topic, out = sys.argv[1], Path(sys.argv[2])
    asyncio.run(capture(topic, out))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m pytest tests/test_capture_bundle.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/__init__.py scripts/capture_run.py tests/test_capture_bundle.py
git commit -m "feat(trace): standalone capture script for run bundles + assembly tests"
```

---

### Task 9: Record the demo fixture + polish

**Files:**
- Replace: `frontend/src/trace/fixtures/sample.json` (with a real captured run)
- Modify: `frontend/src/trace/TraceView.tsx` (only if pointing at a renamed fixture — otherwise none)

**Interfaces:** none new.

- [ ] **Step 1: Capture a real run (requires LLM + Tavily keys in the backend `.env`)**

From the repo root, with the venv active and keys set:

```bash
python -m scripts.capture_run \
  "What is the stablecoin regulatory landscape in 2026?" \
  frontend/src/trace/fixtures/sample.json
```

Pick a topic that produces at least one reopen and one `dead` gap so the negotiation is visible (try 1–2 topics and keep the richest run). Confirm the written JSON validates against the type:

- [ ] **Step 2: Verify the recorded fixture loads**

Run (from `frontend/`): `npm run build`
Expected: PASS (the new `sample.json` satisfies `SocietyRunBundle`; if `tsc` complains, a field is missing/mis-typed — fix the capture output, not the type).

- [ ] **Step 3: Manual acceptance against the success criteria (spec §10)**

`npm run dev`, trace view:
- click a report claim → its path lights through to source URLs;
- find a reopened gap → the inspector shows the **actual Critic reason**;
- find a `dead` gap → the inspector explains it;
- press ▶ → the map builds up over time.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/trace/fixtures/sample.json
git commit -m "feat(trace): record the demo run bundle fixture"
```

---

## Self-Review

**1. Spec coverage:**
- §4 bundle (3 layers) → Task 1 (types) + Task 8 (capture writes all three). ✓
- §5 recording, zero backend changes → Task 8 (standalone script, lazy imports). ✓
- §6 buildTrace (claim parse, chain resolution, lifecycle, one-reopen-reason limit) → Task 2 + the inspector note in Task 6. ✓
- §7 UI (report / SVG map / inspector / transport, coverage+contributor colors, badge) → Tasks 4–7 + the badge in Task 3. ✓
- §8 module layout + 4 surgical edits (types, store, TopBar, App) → Tasks 1, 3. ✓
- §9 offline/no-mock → static JSON import (Task 3). ✓
- §10 tests + success criteria → tested pure helpers (Tasks 2,5,6,7,8) + manual acceptance (Task 9). ✓
- §11 risks (unresolved citation, multiple reopens) → tested in Task 2; note in Task 6; content cap in Task 8. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete code. ✓

**3. Type consistency:** `SocietyRunBundle`/`BundleGap`/`BundleFinding` (Task 1) consumed verbatim by `buildTrace` (Task 2) and `capture` output (Task 8). `TraceModel`/`TraceGap`/`Claim`/`GapEvent` names identical across Tasks 1–7. `SelectedNode` defined in Task 5, imported by Tasks 6–7. `contributorColor`/`renderMarkdown`/`safeHref` signatures match the existing modules. Source key format `${fid}#${i}` is used consistently in `DerivationMap` (Task 5) and `TraceInspector` (Task 6). ✓

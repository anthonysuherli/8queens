# Agent-collaboration timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A forward-playing swimlane view (one lane per agent) where, as a playhead advances through the run's phases, gaps are posted, Researchers claim them and contribute findings, and a shared-brain meter grows `0 → N findings` with coverage climbing `gap → sparse → rich` — the "knowledge growing through the team's collaboration" story.

**Architecture:** A new self-contained `frontend/src/timeline/` module reads the SAME committed run bundle (`trace/fixtures/sample.json`) the trace view uses. A pure `buildTimeline()` turns the bundle's timestamped frames into per-agent lane events + phase spans; `cumulativeAt(model, playhead)` computes the growing brain state. A React/SVG-free DOM view renders lanes + a phase band + a brain meter + a "latest contribution" ticker, driven by the existing `Transport` (reused from `trace/`). Added as a third option in the existing `graph | trace | timeline` toggle.

**Tech Stack:** React 18 + TypeScript strict + Vite 6 + Zustand + Vitest (node env). Reuses `frontend/src/api/types.ts` (`SocietyRunBundle`), `frontend/src/graph/contributors.ts` (`contributorColor`), `frontend/src/trace/Transport.tsx`, and the design tokens.

## Global Constraints

- **Type-check gate:** from `frontend/`, `npm run build` (`tsc --noEmit` + `vite build`); strict + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`.
- **Tests:** Vitest **node env, no DOM**. `*.test.ts` next to code; `npm run test` from `frontend/`. Test pure logic only — never render React. (A pre-existing slow `src/api/society.test.ts` can time out under load; it passes in isolation — not a finding.)
- **Styling:** only `tokens.css` CSS variables (`--bg0..3`,`--line`,`--line-bright`,`--text`,`--text-dim`,`--text-faint`,`--accent`,`--accent-bright`,`--rich`=`#46d39a`,`--sparse`=`#f5a83c`,`--gap`=`#ef5b66`,`--font-mono`,`--font-body`,`--radius`). Never hard-code colors **except** the three agent-role brand colors defined in `buildTimeline.ts` (planner/critic/synthesizer), which mirror existing constants.
- **No `sigma`/`graphology`** under `frontend/src/timeline/`.
- Bundle is static JSON; no network, no live/mock parity.

---

### Task 1: Timeline model (pure) + tests

**Files:**
- Create: `frontend/src/timeline/timelineModel.ts`
- Create: `frontend/src/timeline/buildTimeline.ts`
- Test: `frontend/src/timeline/buildTimeline.test.ts`

**Interfaces:**
- Consumes: `SocietyRunBundle`, `BundleFrame`, `Coverage` from `../api/types`; `contributorColor` from `../graph/contributors`.
- Produces: `buildTimeline(bundle: SocietyRunBundle): TimelineModel`; `cumulativeAt(model: TimelineModel, playhead: number): CumulativeState`; the types `TimelineModel`, `TimelineLane`, `TimelineEvent`, `PhaseSpan`, `CoverageMark`, `CumulativeState`, `LaneRole`, `EventKind`.

- [ ] **Step 1: Create `frontend/src/timeline/timelineModel.ts`**

```ts
/** Types the agent-collaboration timeline renders, derived purely from a
 * SocietyRunBundle by buildTimeline(). */

import type { Coverage } from "../api/types";

export type LaneRole = "planner" | "researcher" | "critic" | "synthesizer";

export interface TimelineLane {
  id: string;
  role: LaneRole;
  label: string;
  color: string;
}

export type EventKind = "post-gap" | "claim" | "finding" | "grade" | "report";

export interface TimelineEvent {
  laneId: string;
  frameIndex: number;
  t: number;
  kind: EventKind;
  label: string;
  gapId?: string;
  findingId?: string;
  coverage?: Coverage;
}

export interface PhaseSpan {
  phase: string;
  round: number;
  startT: number;
  endT: number;
  startIndex: number;
  endIndex: number;
}

export interface CoverageMark {
  frameIndex: number;
  t: number;
  overall: Coverage;
}

export interface TimelineModel {
  lanes: TimelineLane[];
  events: TimelineEvent[];
  phases: PhaseSpan[];
  coverageMarks: CoverageMark[];
  totalFindings: number;
  durationT: number;
  frameCount: number;
}

export interface CumulativeState {
  findings: number;
  coverage: Coverage | null;
  phase: string | null;
  round: number;
  latestFinding: string | null;
}
```

- [ ] **Step 2: Write the failing test `frontend/src/timeline/buildTimeline.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- buildTimeline`
Expected: FAIL — `buildTimeline`/`cumulativeAt` not exported.

- [ ] **Step 4: Create `frontend/src/timeline/buildTimeline.ts`**

```ts
/** Pure: SocietyRunBundle → TimelineModel. Routes each timestamped frame into a
 * per-agent lane; derives phase spans + coverage marks; cumulativeAt() reports
 * the growing brain state at a playhead. No I/O, no React. */

import type { BundleFrame, Coverage, SocietyRunBundle } from "../api/types";
import { contributorColor } from "../graph/contributors";
import type {
  CoverageMark, CumulativeState, PhaseSpan, TimelineEvent, TimelineLane, TimelineModel,
} from "./timelineModel";

const PLANNER_COLOR = "#f5a83c";
const CRITIC_COLOR = "#ef5b66";
const SYNTH_COLOR = "#e5d96b";

function researcherIds(frames: BundleFrame[]): string[] {
  const ids: string[] = [];
  for (const f of frames) {
    let id: unknown;
    if (f.event === "gap_claimed") id = f.claimed_by;
    else if (f.event === "finding_merged") id = f.contributor;
    if (typeof id === "string" && id !== "planner" && id !== "synthesizer" && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids.sort();
}

function frameT(f: BundleFrame): number {
  return typeof f.t === "number" ? f.t : 0;
}

export function buildTimeline(bundle: SocietyRunBundle): TimelineModel {
  const frames = bundle.frames;
  const researchers = researcherIds(frames);
  const lanes: TimelineLane[] = [
    { id: "planner", role: "planner", label: "Planner", color: PLANNER_COLOR },
    ...researchers.map((id): TimelineLane => ({ id, role: "researcher", label: id, color: contributorColor(id) })),
    { id: "critic", role: "critic", label: "Critic", color: CRITIC_COLOR },
    { id: "synthesizer", role: "synthesizer", label: "Synthesizer", color: SYNTH_COLOR },
  ];

  const events: TimelineEvent[] = [];
  const coverageMarks: CoverageMark[] = [];
  const phaseStarts: Array<{ phase: string; round: number; t: number; index: number }> = [];

  frames.forEach((f, i) => {
    const t = frameT(f);
    switch (f.event) {
      case "phase":
        phaseStarts.push({ phase: String(f.phase), round: typeof f.round === "number" ? f.round : 0, t, index: i });
        break;
      case "gap_opened":
        events.push({ laneId: "planner", frameIndex: i, t, kind: "post-gap", label: String(f.question ?? "gap"), gapId: f.gap_id as string });
        break;
      case "gap_claimed":
        events.push({ laneId: String(f.claimed_by), frameIndex: i, t, kind: "claim", label: "claimed", gapId: f.gap_id as string });
        break;
      case "finding_merged":
        events.push({ laneId: String(f.contributor), frameIndex: i, t, kind: "finding", label: String(f.title ?? "finding"), findingId: f.finding_id as string, gapId: f.gap_id as string });
        break;
      case "gap_filled":
        if (f.status === "done") {
          events.push({ laneId: "critic", frameIndex: i, t, kind: "grade", label: "done", gapId: f.gap_id as string, coverage: f.coverage as Coverage });
        }
        break;
      case "coverage":
        if (f.overall) coverageMarks.push({ frameIndex: i, t, overall: f.overall as Coverage });
        break;
      case "report":
        events.push({ laneId: "synthesizer", frameIndex: i, t, kind: "report", label: "cited report" });
        break;
      default:
        break;
    }
  });

  const durationT = frames.reduce((m, f) => Math.max(m, frameT(f)), 0);
  const phases: PhaseSpan[] = phaseStarts.map((p, idx) => {
    const next = phaseStarts[idx + 1];
    return {
      phase: p.phase, round: p.round, startT: p.t, endT: next ? next.t : durationT,
      startIndex: p.index, endIndex: next ? next.index : frames.length,
    };
  });

  const totalFindings = events.filter((e) => e.kind === "finding").length;
  return { lanes, events, phases, coverageMarks, totalFindings, durationT, frameCount: frames.length };
}

export function cumulativeAt(model: TimelineModel, playhead: number): CumulativeState {
  const findingEvents = model.events.filter((e) => e.kind === "finding" && e.frameIndex <= playhead);
  const cov = model.coverageMarks.filter((c) => c.frameIndex <= playhead).pop();
  const ph = model.phases.filter((p) => p.startIndex <= playhead).pop();
  const last = findingEvents[findingEvents.length - 1];
  return {
    findings: findingEvents.length,
    coverage: cov ? cov.overall : null,
    phase: ph ? ph.phase : null,
    round: ph ? ph.round : 0,
    latestFinding: last ? last.label : null,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- buildTimeline`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check + full suite + commit**

```bash
npm run build
npm run test -- buildTimeline buildTrace layout describe playhead view
git add frontend/src/timeline/timelineModel.ts frontend/src/timeline/buildTimeline.ts frontend/src/timeline/buildTimeline.test.ts
git commit -m "feat(timeline): buildTimeline — bundle frames → per-agent lanes + brain growth"
```

---

### Task 2: Three-way view toggle + empty Timeline shell

**Files:**
- Modify: `frontend/src/state/store.ts` (widen `view` + `setView` to include `"timeline"`)
- Modify: `frontend/src/state/view.test.ts` (assert the timeline toggle)
- Modify: `frontend/src/panels/TopBar.tsx` (third toggle button)
- Modify: `frontend/src/App.tsx` (render `<TimelineView/>` when `view === "timeline"`)
- Create: `frontend/src/timeline/TimelineView.tsx` (loads bundle, builds model, placeholder)
- Create: `frontend/src/styles/timeline.css`
- Modify: `frontend/src/main.tsx` (import `timeline.css`)

**Interfaces:**
- Consumes: `buildTimeline` (Task 1), `SocietyRunBundle`.
- Produces: store `view: "graph" | "trace" | "timeline"`; `TimelineView` default export.

- [ ] **Step 1: Widen the store `view` type**

In `frontend/src/state/store.ts`, change the interface field `view: "graph" | "trace";` to:

```ts
  view: "graph" | "trace" | "timeline";
```

and the action signature `setView(view: "graph" | "trace"): void;` to:

```ts
  setView(view: "graph" | "trace" | "timeline"): void;
```

The initializer value (`view: "graph",`) and the action impl (`setView(view) { set({ view }); }`) are unchanged.

- [ ] **Step 2: Extend `frontend/src/state/view.test.ts`**

Add a third assertion inside the existing test body, after the existing graph/trace checks:

```ts
    useStore.getState().setView("timeline");
    expect(useStore.getState().view).toBe("timeline");
    useStore.getState().setView("graph");
    expect(useStore.getState().view).toBe("graph");
```

- [ ] **Step 3: Run the test**

Run: `npm run test -- view`
Expected: PASS.

- [ ] **Step 4: Add the third toggle button in `frontend/src/panels/TopBar.tsx`**

In the `.tb-viewtoggle` block, after the `trace` button, add:

```tsx
        <button
          className={`btn${view === "timeline" ? " btn--active" : ""}`}
          onClick={() => setView("timeline")}
        >
          timeline
        </button>
```

- [ ] **Step 5: Create `frontend/src/timeline/TimelineView.tsx` (placeholder)**

```tsx
/** Agent-collaboration timeline: forward-playing swimlanes + brain growth.
 * Reads the same committed run bundle as the trace view. */

import { useMemo } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTimeline } from "./buildTimeline";
import rawBundle from "../trace/fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TimelineView() {
  const model = useMemo(() => buildTimeline(bundle), []);
  return (
    <div className="timeline">
      <div className="tl-badge">
        recorded run · {bundle.meta.topic} · {model.lanes.length} agents · {model.totalFindings} findings
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Route the view in `frontend/src/App.tsx`**

Add the import near the other view imports:

```tsx
import TimelineView from "./timeline/TimelineView";
```

Change the view branch from `{view === "trace" ? (<TraceView />) : (<graph shell>)}` to a three-way:

```tsx
      {view === "trace" ? (
        <TraceView />
      ) : view === "timeline" ? (
        <TimelineView />
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
```

- [ ] **Step 7: Create `frontend/src/styles/timeline.css`**

```css
.timeline {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg1);
  overflow: hidden;
}
.tl-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}
```

- [ ] **Step 8: Import the stylesheet in `frontend/src/main.tsx`**

Add alongside the other `./styles/*.css` imports:

```tsx
import "./styles/timeline.css";
```

- [ ] **Step 9: Verify + commit**

```bash
npm run test -- view
npm run build
git add frontend/src/state/store.ts frontend/src/state/view.test.ts frontend/src/panels/TopBar.tsx \
        frontend/src/App.tsx frontend/src/timeline/TimelineView.tsx frontend/src/styles/timeline.css frontend/src/main.tsx
git commit -m "feat(timeline): three-way view toggle + empty Timeline shell"
```

Manual (controller): `npm run dev`, the top bar shows `graph | trace | timeline`; clicking `timeline` shows the badge; the other two views are intact.

---

### Task 3: Timeline UI — phase band, agent lanes, brain meter, transport

**Files:**
- Modify: `frontend/src/timeline/TimelineView.tsx` (full UI + playhead/auto-play)
- Modify: `frontend/src/styles/timeline.css` (lane / phase / meter / ticker / transport styles)

**Interfaces:**
- Consumes: `buildTimeline`/`cumulativeAt` (Task 1), `TimelineModel`/`TimelineEvent`/`TimelineLane` (Task 1), `Transport` from `../trace/Transport`.
- Produces: the finished `TimelineView`.

- [ ] **Step 1: Replace `frontend/src/timeline/TimelineView.tsx` with the full view**

```tsx
/** Agent-collaboration timeline: a forward-playing swimlane per agent over the
 * recorded run. As the playhead advances, events appear in lanes and the
 * shared-brain meter (findings + coverage) grows. Reuses the trace Transport. */

import { useEffect, useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { Transport } from "../trace/Transport";
import { buildTimeline, cumulativeAt } from "./buildTimeline";
import type { TimelineEvent, TimelineLane } from "./timelineModel";
import rawBundle from "../trace/fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;
const COV_COLOR: Record<string, string> = { rich: "var(--rich)", sparse: "var(--sparse)", gap: "var(--gap)" };

export default function TimelineView() {
  const model = useMemo(() => buildTimeline(bundle), []);
  const frameCount = model.frameCount;
  const [playhead, setPlayhead] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (playhead >= frameCount - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setPlayhead((p) => p + 1), 120);
    return () => window.clearTimeout(id);
  }, [playing, playhead, frameCount]);

  const togglePlay = () => {
    if (!playing && playhead >= frameCount - 1) setPlayhead(0);
    setPlaying((p) => !p);
  };

  const cur = cumulativeAt(model, playhead);
  const pct = (t: number) => (model.durationT ? (t / model.durationT) * 100 : 0);
  const headT = model.events.length ? playheadT(model, playhead) : 0;
  const headPct = pct(headT);
  const brainPct = model.totalFindings ? (cur.findings / model.totalFindings) * 100 : 0;

  const byLane = (laneId: string): TimelineEvent[] =>
    model.events.filter((e) => e.laneId === laneId && e.frameIndex <= playhead);

  return (
    <div className="timeline">
      <div className="tl-badge">
        recorded run · {bundle.meta.topic} · phase <b>{cur.phase ?? "—"}</b> · round {cur.round}
      </div>

      <div className="tl-phaseband">
        {model.phases.map((p, i) => (
          <div
            key={i}
            className={`tl-phase tl-phase--${p.phase}${cur.phase === p.phase && cur.round === p.round ? " tl-phase--active" : ""}`}
            style={{ width: `${pct(p.endT) - pct(p.startT)}%` }}
          >
            {p.phase}
          </div>
        ))}
      </div>

      <div className="tl-lanes">
        {model.lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} events={byLane(lane.id)} pct={pct} headPct={headPct} />
        ))}
      </div>

      <div className="tl-brain">
        <div className="tl-brain-head">
          <span>shared brain</span>
          <span className="tl-brain-count">{cur.findings} / {model.totalFindings} findings</span>
          <span className="tl-cov" style={{ color: cur.coverage ? COV_COLOR[cur.coverage] : "var(--text-faint)" }}>
            coverage: {cur.coverage ?? "—"}
          </span>
        </div>
        <div className="tl-brain-bar">
          <div className="tl-brain-fill" style={{ width: `${brainPct}%`, background: cur.coverage ? COV_COLOR[cur.coverage] : "var(--line-bright)" }} />
        </div>
        <div className="tl-ticker">{cur.latestFinding ? `+ ${cur.latestFinding}` : "…"}</div>
      </div>

      <div className="tl-transport">
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

function playheadT(model: ReturnType<typeof buildTimeline>, playhead: number): number {
  let t = 0;
  for (const e of model.events) if (e.frameIndex <= playhead) t = Math.max(t, e.t);
  for (const p of model.phases) if (p.startIndex <= playhead) t = Math.max(t, p.startT);
  return t;
}

function LaneRow({ lane, events, pct, headPct }: {
  lane: TimelineLane;
  events: TimelineEvent[];
  pct: (t: number) => number;
  headPct: number;
}) {
  return (
    <div className="tl-row">
      <div className="tl-lane-label" style={{ color: lane.color }}>
        <span className="tl-dot" style={{ background: lane.color }} />
        {lane.label}
      </div>
      <div className="tl-track">
        <div className="tl-head" style={{ left: `${headPct}%` }} />
        {events.map((e, i) => {
          if (e.kind === "finding") {
            return <span key={i} className="tl-finding" style={{ left: `${pct(e.t)}%`, background: lane.color }} />;
          }
          const cls = e.kind === "post-gap" ? "tl-chip tl-chip--gap"
            : e.kind === "claim" ? "tl-chip tl-chip--claim"
            : e.kind === "grade" ? "tl-chip tl-chip--grade"
            : "tl-chip tl-chip--report";
          const text = e.kind === "post-gap" ? "gap" : e.kind === "claim" ? "claim" : e.kind === "grade" ? "done" : "report";
          return <span key={i} className={cls} style={{ left: `${pct(e.t)}%`, borderColor: lane.color }} title={e.label}>{text}</span>;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `frontend/src/styles/timeline.css` with the full styles**

```css
.timeline {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg1);
  overflow: hidden;
}
.tl-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}
.tl-phaseband { display: flex; height: 26px; border-bottom: 1px solid var(--line); }
.tl-phase {
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 10px; color: var(--text-faint);
  border-right: 1px solid var(--line); background: var(--bg0); min-width: 0; overflow: hidden;
}
.tl-phase--active { color: var(--bg0); background: var(--accent); font-weight: 500; }
.tl-lanes { flex: 1; min-height: 0; overflow-y: auto; }
.tl-row { display: grid; grid-template-columns: 130px 1fr; align-items: center; height: 44px; border-bottom: 1px solid var(--line); }
.tl-lane-label { display: flex; align-items: center; gap: 6px; padding: 0 10px; font-family: var(--font-mono); font-size: 12px; }
.tl-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.tl-track { position: relative; height: 100%; border-left: 1px solid var(--line); overflow: hidden; }
.tl-head { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent-bright); opacity: 0.7; }
.tl-finding { position: absolute; top: 50%; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; border-radius: 50%; opacity: 0.7; }
.tl-chip {
  position: absolute; top: 50%; transform: translateY(-50%);
  font-family: var(--font-mono); font-size: 9px; padding: 1px 5px; border-radius: 3px;
  border: 1px solid var(--line-bright); color: var(--text); background: var(--bg2); white-space: nowrap;
}
.tl-chip--gap { color: var(--accent); }
.tl-chip--grade { color: var(--rich); }
.tl-chip--report { color: var(--text); }
.tl-brain { padding: 8px 12px; border-top: 1px solid var(--line); background: var(--bg2); }
.tl-brain-head { display: flex; align-items: baseline; gap: 14px; font-size: 12px; color: var(--text-dim); }
.tl-brain-count { color: var(--text); font-family: var(--font-mono); }
.tl-cov { font-family: var(--font-mono); margin-left: auto; }
.tl-brain-bar { height: 12px; background: var(--bg0); border-radius: var(--radius); overflow: hidden; margin: 5px 0; }
.tl-brain-fill { height: 100%; transition: width 120ms linear; }
.tl-ticker { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-transport { border-top: 1px solid var(--line); }
```

- [ ] **Step 3: Verify build + trace/timeline tests**

Run: `npm run build` → PASS. Then `npm run test -- buildTimeline view buildTrace` → green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/timeline/TimelineView.tsx frontend/src/styles/timeline.css
git commit -m "feat(timeline): phase band + agent lanes + growing brain meter + transport"
```

Manual (controller): `npm run dev` → `timeline` view → press play → phases highlight left-to-right, findings dots accumulate in the researcher lanes, the brain meter climbs `0 → 204` and coverage goes `gap → sparse → rich`, the ticker shows finding titles landing.

---

## Self-Review

**1. Spec coverage:** phase band (Task 3) ✓; agent lanes with claims + accumulating findings (Task 3, `LaneRow`) ✓; shared-brain meter + coverage climb (Task 3) ✓; latest-contribution ticker (Task 3) ✓; forward play/scrub (Task 3 reuses `Transport`) ✓; new view + toggle (Task 2) ✓; pure model TDD (Task 1) ✓; reuses bundle + `contributorColor` + tokens, no new API/backend ✓.

**2. Placeholder scan:** no "TBD"/vague steps; every code step is complete.

**3. Type consistency:** `TimelineModel`/`TimelineEvent`/`TimelineLane`/`CumulativeState` defined in Task 1 `timelineModel.ts`, consumed by `buildTimeline.ts` (Task 1) and `TimelineView.tsx` (Tasks 2–3). `Transport` props (`count`/`playhead`/`playing`/`onSeek`/`onTogglePlay`) match `frontend/src/trace/Transport.tsx`. `cumulativeAt(model, playhead)` signature identical across model + view. `view` union widened consistently in the interface field, the action signature, `TopBar`, and `App`.

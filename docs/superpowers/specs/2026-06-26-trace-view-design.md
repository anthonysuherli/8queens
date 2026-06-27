# qwen8 — Trace view: a backward-provenance explorer
## Authoritative Design Specification

**Status:** Approved in brainstorming → ready for an implementation plan
**Feature:** A new dashboard view that answers *"why did the report say this, and how was it derived?"* by drilling from any cited report claim down through findings → gaps → source URLs, over a **recorded** society run (offline-safe).
**Primary purpose:** Hackathon demo showcase (Agent Society track) — demo-polished but every element is real recorded data.
**Repo:** `~/Repositories/8star/qwen8` · frontend `frontend/` (React 18 + TS strict + Vite 6 + Zustand + sigma/graphology)
**License:** AGPL-3.0
**Builds on:** [`2026-06-22-qwen8-agent-society-design.md`](2026-06-22-qwen8-agent-society-design.md) (the society engine + the frozen SSE frame contract in [`docs/sse-frames.md`](../../sse-frames.md)).

---

## 1. Summary

qwen8's agents do not message each other — they coordinate through a shared blackboard, and the "negotiation" is a **gap state-machine** (`open → claimed → verified → done | reopen | dead`). The existing dashboard shows this *live and ephemerally* (the coverage meter + gap list in `frontend/src/panels/SocietyPanel.tsx`). This feature adds a separate, *controllable* **Trace view** that makes a finished run legible **backward from its conclusion**: select a claim in the cited report and watch the evidence that produced it light up — the findings that ground it, the gap each finding answered, *who* claimed that gap and *why the Critic reopened or killed it*, down to the exact source URL and search query.

The view is fed by a **recorded run bundle** (one JSON file) rather than a live stream, which makes it offline-robust for the demo and removes any live/mock divergence. It touches **no shipped production code**: the bundle is produced by a one-time standalone capture script, and the UI is a self-contained `frontend/src/trace/` module gated behind a `graph | trace` toggle.

---

## 2. Goal & non-goals

**Goal.** Given a recorded society run, let a viewer:
1. Read the real cited report; click any claim carrying a `(finding_id: …)` citation.
2. See an animated **derivation map** (Claim · Findings · Gaps · Sources) light the selected claim's subgraph and dim the rest.
3. Open a **detail inspector** on any node to see the deep "why": a gap's full lifecycle including the Critic's actual reopen `reason` and `attempts`; a finding's content/category/confidence; a source's URL + the exact search `query`.
4. Optionally **scrub** the run forward (play/pause/step) to watch the negotiation build up over time.

**Non-goals (explicitly out of MVP).**
- **No live trace.** The existing `SocietyPanel` remains the live surface. (Live trace is §13.)
- **No backend production changes.** No new/edited routes, no engine changes. (Recording is a standalone script reading the store directly.)
- **No reuse of the sigma/graphology graph** for the map — see §7.2 for why a bespoke SVG layered layout wins for "why".
- **No new persistence.** The bundle is a committed fixture, not a DB table.

---

## 3. Decisions locked (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Backward-provenance** is the centerpiece lens (report → evidence), time secondary | Matches "trace why the result was the result and how it is derived". |
| D2 | **Recorded-run fed**, bundle-only for MVP | "Doesn't have to be live"; offline-robust; no live/mock split. |
| D3 | **Layered map + detail inspector** (brainstorm Option A) | Reads as a *derivation*; folds deep detail in on click. |
| D4 | **Bespoke SVG** for the map, not sigma | Deterministic columnar layout + easy path animation; avoids sigma's force positions and reserved `type` attribute. |
| D5 | Entry as a **`graph \| trace` mode toggle** in `TopBar`, not a separate route | Surgical; existing dashboard untouched. |
| D6 | **Zero backend production changes**; recording via a standalone script | Cleanest footprint; reuses the store seam. |
| D7 | Include a lightweight **scrubber** (forward replay) as a secondary control | Satisfies "controllable to explore the flow". |

---

## 4. The run bundle — the recorded artifact (data contract)

The bundle is the single source of truth for the view. It carries **three layers** because no single qwen8 surface has all of it:

| Layer | Source of truth | Why it's needed / what only it has |
|---|---|---|
| `frames[]` | the live `on_event` SSE stream, captured verbatim + relative `t` | the *temporal narrative*: phase/round structure, `gap_claimed` (who/when), reopens (a **repeat** `gap_opened` for a filled gap), child spawns (`gap_opened` with `parent_id`). |
| `gaps[]` | `qwen8.society.blackboard.list_gaps(store, kb_id)` at run end | the *terminal truth the frames drop*: `dead` status (**emits no frame** — see `roles.py::Critic.review`), `attempts`, the reopen `reason` (`sharpen`/`insufficient`), `parent_id`. |
| `findings{}` | `store.get_finding(kb_id, id)` per finding | **source provenance** (`url`/`domain`/`query`) + body content; *not present in any SSE frame*. |

### 4.1 Schema (mirrored as a TS type in `frontend/src/api/types.ts`)

```jsonc
{
  "meta": {
    "topic": "What is the stablecoin regulatory landscape in 2026?",
    "run_id": "…", "kb_id": "…",
    "captured_at": "2026-06-26T…Z",
    "n_researchers": 2, "max_rounds": 3,
    "rounds": 2, "finding_count": 9, "gaps_done": 4, "gaps_dead": 1,
    "models": { "planner": "qwen-max", "researcher": "qwen-plus",
                "critic": "qwen-max", "synthesizer": "qwen-max" }
  },
  "frames": [
    { "t": 0,    "event": "phase",       "phase": "seeding", "round": 0 },
    { "t": 1180, "event": "gap_opened",  "gap_id": "g1", "question": "…", "parent_id": null },
    { "t": 9100, "event": "gap_claimed", "gap_id": "g1", "claimed_by": "r1", "role": "researcher" },
    { "t": 14300,"event": "finding_merged", "finding_id": "f_2c1", "gap_id": "g1", "title": "…", "contributor": "r1" }
    // … all 11 frozen frame types, verbatim, in emit order, each stamped with t (ms since run start)
  ],
  "gaps": [
    { "gap_id": "g1", "question": "…", "status": "done", "owner": "r1",
      "coverage": "rich", "attempts": 2, "reason": "insufficient",
      "parent_id": null, "finding_ids": ["f_2c1","f_9a4"],
      "created_at": "…", "updated_at": "…" }
  ],
  "findings": {
    "f_2c1": { "id": "f_2c1", "title": "…", "content": "…", "category": "…",
               "confidence": 0.86,
               "provenance": [ { "url": "https://sec.gov/…", "domain": "sec.gov",
                                 "query": "stablecoin reserve attestation" } ] }
  },
  "report": { "markdown": "## … (finding_id: f_2c1) …", "unanswered": ["…", "…dead question…"] }
}
```

Notes:
- `frames` types are exactly the 11 frozen events (`docs/sse-frames.md`); we add only `t`. We do **not** reshape any frame.
- The report markdown is the **real** Synthesizer output with inline `(finding_id: …)` citations (per `roles.py::_SYNTH_PROMPT`; format confirmed in `frontend/src/api/mock.ts::streamSociety`). This is the spine of the backward trace.
- `report.unanswered` already merges the model's unanswered list with `dead` gap questions (`roles.py::Synthesizer.run`).

---

## 5. Recording — a standalone capture script (zero backend changes)

`scripts/capture_run.py` (new; backend-side, run **once** with keys):

1. Bootstrap a fresh KB via `bootstrap_society(store, project_name, kb_name)` (`qwen8/society/loop.py`).
2. Call `run_society(topic, …, on_event=record, store=store)` **in-process**, where `record(name, data)` appends `{ "t": <ms since start>, "event": name, **data }` to a list. (In-process is simpler and more robust for authoring a fixture than HTTP-driving `/society/start`+`/stream`; the timestamp uses `time.monotonic()` in the script — never in shipped code.)
3. After it returns: `gaps = list_gaps(store, kb_id)` (full `Gap` fields incl. `attempts`/`reason`/`parent_id`); for every `finding_id` referenced, `store.get_finding(kb_id, fid)` for provenance + content.
4. Assemble the bundle (§4.1) and write `frontend/src/trace/fixtures/<slug>.json`.

**Why not reuse existing surfaces (rejected alternatives):**
- The `?replay=1` endpoint (`routes_society.py::replay_events`) reconstructs only gaps+findings from the DB and **emits a stub report** (`"(replayed from saved run)"`) — it loses rounds, phases, claim timing, reopen reasons, and the real cited report. Unusable for "why".
- `/society/state` (`_state_snapshot`) returns gaps **without** `attempts`/`reason`/`parent_id`. Reading `list_gaps` directly avoids extending the route.
- A server-side frame "tee" would add production surface for what is fundamentally a one-time demo artifact.

Requires LLM + Tavily keys + network at **capture** time only. The committed fixture then demos fully offline — mirroring the repo's existing degraded/replay ethos (`93df96f`).

---

## 6. Derivation model — one pure function

`frontend/src/trace/buildTrace.ts` exports `buildTrace(bundle: SocietyRunBundle): TraceModel` — pure, side-effect free, unit-tested under Vitest (node env, matching repo convention).

### 6.1 Claim parsing
- Split `report.markdown` into **claim segments**: contiguous text up to and including its trailing citation group(s). A claim with no citation renders as plain prose and is **not** a drill target.
- Extract ids with `/\(finding_id:\s*([^)]+)\)/g`, splitting the inner capture on commas to support `(finding_id: a, b)`.
- For each claim record `findingIds` (present in `findings{}`) and `unresolvedIds` (cited but absent — rendered as "unresolved citation", never crashes).

### 6.2 Chain resolution (claim → finding → gap → source)
- **finding → gap:** prefer the `finding_merged` frame map (`finding_id → gap_id`); fall back to `gaps[].finding_ids`.
- **gap lifecycle:** fold the ordered `frames` for that `gap_id` into a `GapEvent[]` — `opened` (planner if `parent_id == null`, else critic child), `claimed` (with `by` + the enclosing `round`/`phase` from the preceding `phase` frame), `filled` (coverage), a `reopened` event each time a `gap_opened` recurs after a `gap_filled`. Overlay the **terminal** `status`/`attempts`/`reason`/`owner` from `gaps[]`. (`band1_hits` is intentionally not carried through the bundle — `status`/`attempts`/`coverage`/`reason` convey the "why" without it.)
- **finding → sources:** `findings[id].provenance` → `Source[]`.

### 6.3 Output types (`frontend/src/trace/traceModel.ts`)
```ts
interface Source { url: string; domain: string; query: string }
type GapEventKind = "opened" | "claimed" | "filled" | "reopened" | "done" | "dead";
interface GapEvent { kind: GapEventKind; t?: number; by?: string; coverage?: Coverage;
                     round?: number; reason?: string }
interface TraceGap { id: string; question: string;
                     status: "open"|"claimed"|"verified"|"done"|"dead";
                     owner: string | null; coverage: Coverage | null;
                     attempts: number; reason: string | null; parentId: string | null;
                     findingIds: string[]; lifecycle: GapEvent[] }
interface TraceFinding { id: string; title: string; content: string; category: string;
                         confidence: number | null; gapId: string | null;
                         contributor: string | null; sources: Source[] }
interface Claim { id: string; text: string; findingIds: string[]; unresolvedIds: string[] }
interface TraceFrame { t: number; event: string; [k: string]: unknown }
interface TraceModel {
  meta: SocietyRunBundle["meta"];
  claims: Claim[];
  findings: Record<string, TraceFinding>;
  gaps: Record<string, TraceGap>;
  frames: TraceFrame[];            // ordered, for the scrubber
  unanswered: string[];
}
```

**Known limitation (documented, acceptable):** if a gap is reopened more than once, `gaps[].reason` holds only the *last* reopen reason; earlier reopen reasons aren't recoverable from frames. The lifecycle still shows the correct number of reopens (from frame recurrence); only the per-reopen reason text collapses to the final one. Noted in the inspector copy.

---

## 7. UI — the Trace view

### 7.1 Layout (`frontend/src/trace/TraceView.tsx`)
A full-surface view replacing the graph canvas when `view === "trace"`:

- **Left — report pane** (`ReportPane.tsx`): the markdown report via the existing `frontend/src/okf/markdown.ts` renderer; each cited claim is a clickable highlight. Selecting a claim sets the active claim (and sets the scrubber playhead to the end so the full subgraph is available).
- **Center — derivation map** (`DerivationMap.tsx`): bespoke **SVG**, four columns — **Claim · Findings · Gaps · Sources**. On claim-select, animate bezier connectors claim→findings→gap→sources and dim everything off-path. Encoding:
  - lifecycle/coverage color: `rich`/`done` green, `sparse`/`reopened` amber, `gap`/`dead` red (reuse the app's existing coverage treatment — the `coverage-fill--rich|sparse|gap` classes / `tokens.css` variables used by `SocietyPanel`).
  - contributor tint on each gap = the claiming researcher (`frontend/src/graph/contributors.ts::contributorColor`).
- **Right — detail inspector** (`TraceInspector.tsx`): click any node →
  - **gap:** full lifecycle timeline (`claimed r1 → verified sparse → Critic reopened (insufficient, attempt 2) → done`), `reason`, `attempts`, terminal `status` (incl. an explicit **`dead`** explanation).
  - **finding:** title, content, category, confidence, contributor.
  - **source:** `url` (click-through), `domain`, the exact search `query`.
- **Bottom — transport** (`Transport.tsx`): play / pause / step / scrub over `frames[]`. A `playhead` index gates which map nodes are visible (a node appears once its introducing frame index ≤ playhead). Claim-select and scrub share one `TraceModel`; they are independent controls over the same data.

### 7.2 Why SVG, not sigma (D4)
The existing graph is force-directed (`graphology` + ForceAtlas2) with non-deterministic positions and sigma's reserved `type` attribute (`frontend/CLAUDE.md` gotchas). A "why" trace wants a fixed left-to-right **derivation** reading order and animatable connector paths — a small bespoke SVG layered layout delivers both with less code than bending sigma, and keeps the `trace/` module fully decoupled from the graph store.

### 7.3 Aesthetic
Dark instrument panel — amber annunciators, IBM Plex Mono/Sans — strictly via the CSS variables in `frontend/src/styles/tokens.css`; no hard-coded colors. A **"recorded run · \<topic\> · \<captured_at\>"** provenance badge (echoes the existing "MOCK DATA" badge) keeps the demo honest: every element is real recorded data; the only dramatization is path-draw / scrub **pacing** — never fabricated content.

---

## 8. Module layout & wiring

```
frontend/src/trace/
  traceModel.ts          types (§6.3)
  buildTrace.ts          pure: bundle → TraceModel (claim/citation parsing, chain resolution)
  buildTrace.test.ts     Vitest unit tests (§10)
  TraceView.tsx          mode shell (report | map | inspector | transport)
  ReportPane.tsx         markdown report w/ clickable claims
  DerivationMap.tsx      SVG 4-column map + animated connectors
  TraceInspector.tsx     detail panel for the selected node
  Transport.tsx          play / pause / step / scrub
  fixtures/<slug>.json   the recorded run bundle (committed)
scripts/capture_run.py   the recorder (backend; run once with keys)
```

Edits to existing files (surgical):
- `frontend/src/api/types.ts` — add `SocietyRunBundle` (+ its sub-shapes) mirroring §4.1. No invented fields.
- `frontend/src/state/store.ts` — add `view: "graph" | "trace"` (default `"graph"`) + `setView`. No change to existing society/graph state.
- `frontend/src/panels/TopBar.tsx` — a `graph | trace` segmented toggle bound to `view`/`setView`.
- `frontend/src/App.tsx` — render `<TraceView/>` when `view === "trace"`, else the existing shell (`SocietyPanel` + `GraphCanvas` + …) unchanged.

The bundle is imported as static JSON (`import bundle from "./fixtures/<slug>.json"`), so the view has **no network path** and therefore no live/mock branch to keep in parity (§9).

---

## 9. Offline / mock parity

The existing app maintains a live impl + a `mock.ts` impl per endpoint (`frontend/CLAUDE.md`). The Trace view sidesteps this entirely: it reads a **committed JSON fixture**, identical online and offline. There is nothing to mock and nothing to drift. (A future live-capture path, §13, would be the only thing needing a mock companion.)

---

## 10. Testing & success criteria

**Unit (`buildTrace.test.ts`, Vitest node env):** against a small hand-authored bundle —
- claim parsing extracts the correct `findingIds` (incl. a multi-id `(finding_id: a, b)` and an unresolved id);
- each finding resolves to its gap (via frame map, and via the `gaps[]` fallback);
- a gap reopened once yields exactly one `reopened` lifecycle event and terminal `status: "done"`;
- a `dead` gap (present in `gaps[]`, absent from any `gap_filled→done` frame) is surfaced with `status: "dead"`;
- a cited-but-missing finding id degrades to `unresolvedIds` without throwing.

**Type-check gate:** `npm run build` (`tsc --noEmit`, strict `noUnusedLocals`/`noUnusedParameters`) passes.

**Visual acceptance (manual):** load the fixture → click a claim → the path lights through to source URLs → the inspector shows a **reopened gap's actual Critic reason** and at least one **`dead`** gap with its explanation → the scrubber builds the map up over time.

**Offline-first:** the whole view works with the engine down (pure fixture).

---

## 11. Risks & edge cases

- **Hallucinated citation id.** Model cites an id not in `findings{}` → `unresolvedIds`, rendered as "unresolved citation". Covered by a test.
- **Report with no citations.** Degenerate but possible (e.g. partial-report fallback in `Synthesizer.run`). The pane renders prose; the map shows the gap/finding layers seeded from `gaps[]`/`frames[]` with no claim column active. Capture a *good* run for the demo fixture; handle the degenerate case without crashing.
- **Multiple reopens collapse to last reason** (§6.3) — disclosed in the inspector.
- **Bundle size.** A run's finding bodies could be large; trim `content` to a reasonable cap in the capture script (e.g. first ~1–2k chars) to keep the committed fixture small. The inspector shows the trimmed body.
- **Curate the demo fixture.** Pick a topic that produces at least one reopen and one `dead` gap so the "negotiation" is visible. Capture more than one if useful; ship one canonical.

---

## 12. Build sequence (milestones)

1. **Bundle type + sample fixture** — add `SocietyRunBundle` to `types.ts`; hand-author a tiny `fixtures/sample.json` to unblock the model + tests. → verify: `tsc` compiles.
2. **`buildTrace` + tests** — pure model, all §10 unit tests green. → verify: `npm run test`.
3. **View shell + toggle** — `view` flag in store, `TopBar` toggle, `App` routing, empty `TraceView`. → verify: toggle switches surfaces; existing dashboard intact.
4. **Report pane + claim selection** — render report, clickable claims, active-claim state.
5. **Derivation map (SVG)** — 4 columns, claim-driven path highlight + dimming; coverage/contributor colors.
6. **Inspector** — gap lifecycle (reopen reason / attempts / dead), finding, source detail.
7. **Transport** — playhead over `frames[]`; map builds up over time.
8. **Capture script** — `scripts/capture_run.py`; record a real curated run → replace `sample.json` with the real fixture. → verify: visual acceptance (§10).
9. **Polish** — provenance badge, animation pacing, aesthetic pass via `tokens.css`.

Milestones 1–7 need no keys and no engine (work entirely against the hand-authored fixture); only M8 needs LLM+Tavily.

---

## 13. Out of scope / future

- **Live trace.** Drive the map from a live `runSociety` stream. Frames lack provenance + `dead`/`attempts`/`reason`, so a live trace is necessarily partial (no source layer, no Critic-reason detail) unless paired with end-of-run store reads. Would also need a mock companion (§9). Deferred.
- **Multi-run comparison / library.** Out.
- **Extending `_state_snapshot`** to carry `attempts`/`reason`/`parent_id` — only worth it if live trace lands; avoided here.

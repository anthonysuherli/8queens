# 8queens — Society SSE Frame Contract (FROZEN at M3)

This is the authoritative wire contract for the society event stream. It is
frozen so the frontend (`society.ts` consumer + the `SocietyEvent` discriminated
union + the full-parity mock) and the backend (`routes_society.py::/society/stream`)
build against one source of truth. Do NOT add, rename, or reshape a frame without
updating this file and both ends.

## Endpoints (all under the existing prefix `/api/projects/{p}/kbs/{k}/`)

- `POST /api/projects/{p}/kbs/{k}/society/start` — body `{topic, n_researchers?, max_rounds?}` → `{kb_id, run_id}`.
- `GET  /api/projects/{p}/kbs/{k}/society/stream?run_id=...` — **SSE**, the named-event frames below (preferred live mechanism).
- `GET  /api/projects/{p}/kbs/{k}/society/state?run_id=...` — snapshot fallback `{nodes, edges, gaps[status,claimed_by], coverage, contributors, report}`; the frontend diffs snapshots.

## Frame wire format

Each frame is `event: <name>\ndata: <json>\n\n` (SSE named events). Node/edge
payloads match the `/graph` wire shape (`id/type/label/properties/grounded_in/created_at`;
edges add `source/target/relation`); IDs are stable + unique (the graph is `multi`+`directed`).

## The 11 frozen frames

| `event:` | `data` JSON payload |
|---|---|
| `phase` | `{ "phase": "seeding"\|"researching"\|"critiquing"\|"synthesizing", "round": int }` |
| `node_added` | `{ "id": str, "type": str, "label": str, "properties": {...}, "grounded_in": [str], "created_at": iso, "contributor": str, "role": "researcher"\|"synthesizer" }` |
| `edge_added` | `{ "id": str, "source": str, "target": str, "relation": str, "properties": {...}, "grounded_in": [str], "created_at": iso }` |
| `finding_merged` | `{ "finding_id": str, "gap_id": str, "title": str, "contributor": str }` |
| `gap_opened` | `{ "gap_id": str, "question": str, "parent_id": str\|null }` |
| `gap_claimed` | `{ "gap_id": str, "claimed_by": str, "role": "researcher" }` |
| `gap_filled` | `{ "gap_id": str, "coverage": "rich"\|"sparse"\|"gap", "finding_ids": [str], "status": "verified"\|"done" }` |
| `coverage` | `{ "gap_id": str\|null, "coverage": "rich"\|"sparse"\|"gap", "band1_hits": int, "overall": "rich"\|"sparse"\|"gap" }` |
| `report` | `{ "report": str (markdown), "unanswered": [str] }` |
| `done` | `{ "run_id": str, "rounds": int, "finding_count": int, "gaps_done": int, "gaps_dead": int }` |
| `error` | `{ "error": str, "fatal": bool }` |

## Additive frames (not part of the frozen 11; consumers may ignore)

| `event:` | `data` JSON payload |
|---|---|
| `budget` | `{ "used": int, "max": int\|null, "phase": "seeding"\|"researching"\|"critiquing"\|"synthesizing", "round": int }` |

`budget` is emitted once after each phase finishes, reading the ai_gateway
kill-switch counter (`max` = `cfg.society.max_llm_calls_per_run`). Phases run
sequentially, so frame-to-frame deltas are exact per-role LLM-call costs
(researchers `gather` concurrently and are reported as one phase). Named SSE
events are opt-in per listener, so old consumers are unaffected. Replay mode
(`?replay=1`) does not emit `budget` — there is no live counter to report.

## Mock-parity rule (mandatory)

TS is strict (`noUnusedLocals`/`noUnusedParameters`). `mock.ts` auto-engages on
network failure and a "MOCK DATA" badge appears in `StatusBar`. The mock MUST
replay a canned run emitting exactly these 11 frames; `types.ts` adds a
`SocietyEvent` discriminated union with one member per `event:` above, plus a
`contributor` field. CORS: a route exception that returns a 500 carries no CORS
header and silently flips the client to mock — society route handlers must wrap
in try/except returning `JSONResponse` so 500s carry CORS headers.

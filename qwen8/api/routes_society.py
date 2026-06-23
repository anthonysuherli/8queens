"""Society routes — the blackboard loop over a named-event SSE protocol.

    POST /api/projects/{p}/kbs/{k}/society/start  (X-Society-Secret gate)
        {topic, n_researchers?, max_rounds?} ──► {kb_id, run_id}
            │ spawns run_society(...) as an asyncio task feeding a Queue
            ▼
    GET  /api/projects/{p}/kbs/{k}/society/stream?run_id=...   (SSE)
        event: phase|node_added|edge_added|finding_merged|gap_opened|
               gap_claimed|gap_filled|coverage|report|done|error
        data:  <json>                              (frozen 8.2 schema)
    GET  /api/projects/{p}/kbs/{k}/society/state?run_id=...    (snapshot fallback)
        {nodes, edges, gaps[gap_id,question,status,claimed_by,coverage],
         coverage, contributors, report}  (spec §8.2; derived from gaps+findings)

Mirrors routes_explore._events: run_society feeds an asyncio.Queue via an
on_event callback; the stream route drains it. Handlers are wrapped in
try/except → JSONResponse so 500s carry CORS headers (Starlette's CORS
middleware does not attach them to unhandled 500s).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from qwen8.api.deps import resolve_kb_or_404
from qwen8.core.config import get_config, get_settings
from qwen8.society import run_society
from qwen8.store.sqlite import SQLiteStore

router = APIRouter(prefix="/api/projects/{project}/kbs/{kb}")


class StartBody(BaseModel):
    topic: str
    n_researchers: int | None = None
    max_rounds: int | None = None


class _Run:
    """One in-flight (or finished) society run: its event queue + buffered frames."""

    def __init__(self, run_id: str, kb_id: str) -> None:
        self.run_id = run_id
        self.kb_id = kb_id
        self.queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        self.task: asyncio.Task | None = None
        self.events: list[tuple[str, dict]] = []  # replayed for late subscribers
        self.done = False


# Process-local registry. Single-writer SQLite + one uvicorn worker → safe.
_RUNS: dict[str, _Run] = {}


def _sse_named(name: str, data: dict) -> str:
    """One SSE frame: event: <name>\\ndata: <json>\\n\\n (frozen §8.2 wire shape)."""
    return f"event: {name}\ndata: {json.dumps(data)}\n\n"


def _check_secret(provided: str | None) -> tuple[int, str] | None:
    """Return (status_code, error_msg) if the write gate rejects, else None."""
    expected = get_settings().society_secret
    if not expected:
        return (401, "QWEN8_SOCIETY_SECRET is not configured; write routes are disabled")
    if provided is None:
        return (401, "missing X-Society-Secret header")
    if provided != expected:
        return (403, "invalid X-Society-Secret")
    return None


@router.post("/society/start")
async def society_start(
    project: str,
    kb: str,
    body: StartBody,
    x_society_secret: str | None = Header(default=None),
) -> JSONResponse:
    try:
        rejection = _check_secret(x_society_secret)
        if rejection is not None:
            status, msg = rejection
            return JSONResponse(status_code=status, content={"error": msg})

        ctx, store = resolve_kb_or_404(project, kb)
        cfg = get_config()  # FULL AppConfig — roles read cfg.search/cfg.tiers/cfg.exploration + cfg.society.*
        n_researchers = body.n_researchers if body.n_researchers is not None else cfg.society.n_researchers
        max_rounds = body.max_rounds if body.max_rounds is not None else cfg.society.max_rounds

        run_id = uuid.uuid4().hex
        run = _Run(run_id, ctx.kb_id)
        _RUNS[run_id] = run

        async def on_event(name: str, data: dict) -> None:
            await run.queue.put((name, data))

        async def drive() -> None:
            try:
                await run_society(
                    body.topic,
                    org_id=ctx.org_id,
                    project_id=ctx.project_id,
                    kb_id=ctx.kb_id,
                    cfg=cfg,
                    n_researchers=n_researchers,
                    max_rounds=max_rounds,
                    on_event=on_event,
                    store=store,  # same SQLiteStore the route resolved + seeded
                )
            except Exception as exc:  # noqa: BLE001 — surface as terminal frame
                await run.queue.put(("error", {"error": str(exc), "fatal": True}))
            finally:
                run.done = True
                await run.queue.put(None)  # sentinel: drain loop stops here

        run.task = asyncio.create_task(drive())
        return JSONResponse(content={"kb_id": ctx.kb_id, "run_id": run_id})
    except Exception as exc:  # noqa: BLE001 — 500 must still carry CORS headers
        return JSONResponse(status_code=500, content={"error": str(exc)})


async def replay_events(store, kb_id: str, *, interval: float = 0.6):
    """Re-emit a completed run's gaps+findings as named SSE frames, no live LLM/Tavily.

    Ordering per gap: gap_opened → gap_claimed → finding_merged* → gap_filled →
    coverage; then a final report + done. The brain IS the recording. Uses A1's
    `_sse_named(name, data)` helper (there is NO bare `_sse`)."""
    from qwen8.society.blackboard import list_gaps

    gaps = list_gaps(store, kb_id)
    findings_done = 0
    for g in gaps:
        yield _sse_named("gap_opened", {
            "gap_id": g.id, "question": g.question, "parent_id": g.parent_id,
        })
        if interval:
            await asyncio.sleep(interval)
        yield _sse_named("gap_claimed", {
            "gap_id": g.id, "claimed_by": g.owner or "researcher-0", "role": "researcher",
        })
        if interval:
            await asyncio.sleep(interval)
        for fid in (g.finding_ids or []):
            try:
                row = store.get_finding(kb_id, fid)
                title = row.get("title", "")
            except Exception:  # noqa: BLE001 — a pruned finding id must not break replay
                title = ""
            yield _sse_named("finding_merged", {
                "finding_id": fid, "gap_id": g.id, "title": title,
                "contributor": g.owner or "researcher-0",
            })
            findings_done += 1
            if interval:
                await asyncio.sleep(interval)
        yield _sse_named("gap_filled", {
            "gap_id": g.id, "coverage": g.coverage or "gap",
            "finding_ids": list(g.finding_ids or []),
            "status": "done" if g.status == "done" else "verified",
        })
        yield _sse_named("coverage", {
            "gap_id": g.id, "coverage": g.coverage or "gap",
            "band1_hits": g.band1_hits, "overall": g.coverage or "gap",
        })
        if interval:
            await asyncio.sleep(interval)

    yield _sse_named("report", {"report": "(replayed from saved run)", "unanswered": []})
    gaps_done = sum(1 for g in gaps if g.status == "done")
    gaps_dead = sum(1 for g in gaps if g.status == "dead")
    yield _sse_named("done", {
        "run_id": "replay", "rounds": 0, "finding_count": findings_done,
        "gaps_done": gaps_done, "gaps_dead": gaps_dead,
    })


@router.get("/society/stream")
async def society_stream(project: str, kb: str, request: Request) -> Any:
    try:
        # --- NEW (D4): offline replay branch — re-emit a saved run, no live LLM ---
        if request.query_params.get("replay"):
            ctx, store = resolve_kb_or_404(project, kb)
            db = request.query_params.get("db")
            interval = float(request.query_params.get("interval") or 0.6)
            replay_store = SQLiteStore(db_path=db) if db else store
            return StreamingResponse(
                replay_events(replay_store, ctx.kb_id, interval=interval),
                media_type="text/event-stream",
            )
        # --- existing A1 live path (UNCHANGED): _RUNS lookup + run.queue drain ---
        run_id = request.query_params.get("run_id")
        run = _RUNS.get(run_id or "")
        if run is None:
            return JSONResponse(status_code=404, content={"error": f"unknown run_id: {run_id}"})

        async def gen() -> AsyncIterator[str]:
            # Replay buffered frames for late subscribers, then drain live.
            for name, data in list(run.events):
                yield _sse_named(name, data)
            if run.done and run.queue.empty():
                return  # already finished; nothing left to drain
            while True:
                item = await run.queue.get()
                if item is None:
                    break
                name, data = item
                run.events.append((name, data))
                yield _sse_named(name, data)

        return StreamingResponse(gen(), media_type="text/event-stream")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})


def _state_snapshot(store: Any, kb_id: str, run: _Run | None) -> dict:
    """Spec §8.2 snapshot {nodes, edges, gaps, coverage, contributors, report}.

    Reconstructed from the blackboard (gaps + findings) so the snapshot-diff
    path and D5's pre-warm verify (d['gaps']) both work even when the in-process
    registry is stale or was lost after a restart.
    """
    from qwen8.society.blackboard import list_gaps

    gaps = list_gaps(store, kb_id)
    nodes: list[dict] = []
    edges: list[dict] = []
    contributors: set[str] = set()
    gaps_out: list[dict] = []

    for g in gaps:
        # gap → question node (mirrors Planner's synthesized node_added frame)
        nodes.append({
            "id": g.id,
            "type": "question",
            "label": g.question,
            "properties": {"status": g.status, "coverage": g.coverage},
            "grounded_in": [],
            "created_at": g.created_at,
            "contributor": "planner",
            "role": "researcher",
        })
        if g.owner:
            contributors.add(g.owner)
        gaps_out.append({
            "gap_id": g.id,
            "question": g.question,
            "status": g.status,
            "claimed_by": g.owner,
            "coverage": g.coverage,
        })
        # each finding → finding node + answers-edge (mirrors Researcher's frames)
        for fid in (g.finding_ids or []):
            try:
                f = store.get_finding(kb_id, fid)
                title = f.get("title", "") if isinstance(f, dict) else ""
                props = {
                    "category": f.get("category") if isinstance(f, dict) else None,
                    "confidence": f.get("confidence") if isinstance(f, dict) else None,
                }
            except Exception:  # noqa: BLE001 — pruned finding id must not break snapshot
                title, props = "", {}
            nodes.append({
                "id": fid,
                "type": "finding",
                "label": title,
                "properties": props,
                "grounded_in": [fid],
                "created_at": g.updated_at,
                "contributor": g.owner or "researcher",
                "role": "researcher",
            })
            edges.append({
                "id": f"{fid}->{g.id}",
                "source": fid,
                "target": g.id,
                "relation": "answers",
                "properties": {},
                "grounded_in": [fid],
                "created_at": g.updated_at,
            })

    # Overall coverage: worst non-null gap coverage, else None.
    _rank: dict[str, int] = {"gap": 0, "sparse": 1, "rich": 2}
    covs = [g.coverage for g in gaps if g.coverage]
    overall = min(covs, key=lambda c: _rank.get(c, 0)) if covs else None

    # Report only when the run is done (else null).
    report = None
    if run is not None and run.done:
        report = next((d.get("report") for name, d in run.events if name == "report"), None)

    return {
        "nodes": nodes,
        "edges": edges,
        "gaps": gaps_out,
        "coverage": overall,
        "contributors": sorted(contributors),
        "report": report,
    }


@router.get("/society/state")
async def society_state(project: str, kb: str, request: Request) -> JSONResponse:
    try:
        ctx, store = resolve_kb_or_404(project, kb)
        run_id = request.query_params.get("run_id")
        run = _RUNS.get(run_id or "")
        return JSONResponse(content=_state_snapshot(store, ctx.kb_id, run))
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})

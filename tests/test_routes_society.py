"""Routes-society unit tests (TestClient — no live keys, no real LLM calls).

Three scenarios:
(a) /society/start WITHOUT the secret header is rejected (401/403) when a
    secret is configured.
(b) WITH the secret, monkeypatched run_society pushes a couple of frames via
    on_event then returns a SocietyResult — /society/stream emits those named
    frames and a terminal `done` event.
(c) /society/state returns §8.2 keys {nodes, edges, gaps, coverage,
    contributors, report}; a seeded gap + finding appear in `gaps` with
    `status` and `claimed_by`.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import os
import sys
import tempfile
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from qwen8.society.blackboard import claim_gap, complete_gap, create_gaps
from qwen8.store import get_store

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SECRET = "test-secret-xyz"


def _make_store():
    """Return a fresh in-memory-equivalent SQLiteStore under a tempdir."""
    d = tempfile.mkdtemp()
    path = os.path.join(d, ".qwen8", "qwen8.db")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return get_store(db_path=path)


def _make_app(monkeypatch, store):
    """Build a fresh FastAPI app instance with the society router, isolated env."""
    monkeypatch.setenv("QWEN8_SOCIETY_SECRET", _SECRET)
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-fake")
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "sk-fake")

    # Patch the startup assertion that checks the real DB path so we can use a
    # tempdir store.  Also clear module caches so settings re-read the env.
    import qwen8.core.config as cfg
    cfg.get_settings.cache_clear()
    cfg.get_config.cache_clear()

    # Patch resolve_kb_or_404 in the routes module to return (ctx, store).
    from qwen8.core.agent.state import TenantContext
    ctx = TenantContext(
        user_id="test-user",
        org_id="local",
        project_id="proj1",
        kb_id="kb1",
        thread_id="thread1",
        access_token="fake-token",
    )

    # Patch _assert_startup_invariants so main.py loads without a real DB.
    monkeypatch.setattr("qwen8.api.main._assert_startup_invariants", lambda: None)

    # Reload routes_society so _RUNS starts fresh and settings are re-read.
    sys.modules.pop("qwen8.api.routes_society", None)
    import qwen8.api.routes_society as rs
    rs._RUNS.clear()

    # Patch the deps resolver on the freshly reloaded module.
    rs.resolve_kb_or_404 = lambda project, kb: (ctx, store)

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="qwen8-test")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(rs.router)
    return app, rs, ctx


# ---------------------------------------------------------------------------
# (a) Secret gate — missing / wrong header
# ---------------------------------------------------------------------------


def test_secret_gate_missing_header(monkeypatch):
    store = _make_store()
    app, _, _ = _make_app(monkeypatch, store)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/projects/demo/kbs/demo/society/start",
            json={"topic": "test"},
            # NO X-Society-Secret header
        )
    assert resp.status_code in (401, 403), f"expected 401/403, got {resp.status_code}"
    assert "error" in resp.json()


def test_secret_gate_wrong_header(monkeypatch):
    store = _make_store()
    app, _, _ = _make_app(monkeypatch, store)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            "/api/projects/demo/kbs/demo/society/start",
            json={"topic": "test"},
            headers={"X-Society-Secret": "totally-wrong"},
        )
    assert resp.status_code in (401, 403), f"expected 401/403, got {resp.status_code}"
    body = resp.json()
    assert "error" in body


# ---------------------------------------------------------------------------
# (b) Start + stream — monkeypatched run_society emits known frames
# ---------------------------------------------------------------------------


def _make_mock_run_society(kb_id: str):
    """Return an async mock that emits phase + gap_opened + done via on_event."""

    async def _fake(topic, *, org_id, project_id, kb_id, cfg, n_researchers=2,
                    max_rounds=3, max_attempts=1, spawn_budget=4, on_event=None, store=None):
        from qwen8.society.loop import SocietyResult

        if on_event:
            await on_event("phase", {"phase": "seeding", "round": 0})
            await on_event("gap_opened", {"gap_id": "g1", "question": "What is X?", "parent_id": None})
            await on_event("done", {
                "run_id": kb_id, "rounds": 1, "finding_count": 0,
                "gaps_done": 0, "gaps_dead": 0,
            })
        return SocietyResult(
            topic=topic, kb_id=kb_id, report="# Report", unanswered=[],
            gaps=[], rounds=1, finding_count=0,
        )

    return _fake


def test_start_and_stream_with_correct_secret(monkeypatch):
    store = _make_store()
    app, rs, ctx = _make_app(monkeypatch, store)

    monkeypatch.setattr("qwen8.api.routes_society.run_society", _make_mock_run_society(ctx.kb_id))

    with TestClient(app, raise_server_exceptions=False) as client:
        # Step 1: start
        start_resp = client.post(
            "/api/projects/demo/kbs/demo/society/start",
            json={"topic": "stablecoin regulation 2026"},
            headers={"X-Society-Secret": _SECRET},
        )
    assert start_resp.status_code == 200, start_resp.text
    body = start_resp.json()
    assert "run_id" in body
    assert "kb_id" in body
    run_id = body["run_id"]

    # Step 2: drain the background task before streaming
    # The background asyncio.Task was created inside the TestClient context;
    # we need to run the event loop to let it complete.
    # Use a fresh event loop run to drain any pending coroutines.
    async def _drain():
        run = rs._RUNS.get(run_id)
        if run and run.task:
            try:
                await asyncio.wait_for(run.task, timeout=5.0)
            except (asyncio.TimeoutError, Exception):
                pass

    asyncio.run(_drain())

    # Step 3: stream — collect all frames
    with TestClient(app, raise_server_exceptions=False) as client:
        stream_resp = client.get(
            f"/api/projects/demo/kbs/demo/society/stream?run_id={run_id}",
            headers={"Accept": "text/event-stream"},
        )
    assert stream_resp.status_code == 200

    # Parse SSE frames: "event: <name>\ndata: <json>\n\n"
    raw = stream_resp.text
    frames: list[tuple[str, dict]] = []
    for block in raw.strip().split("\n\n"):
        lines = block.strip().splitlines()
        name = None
        data = None
        for line in lines:
            if line.startswith("event: "):
                name = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        if name and data is not None:
            frames.append((name, data))

    event_names = [f[0] for f in frames]
    assert "phase" in event_names, f"missing phase frame; got {event_names}"
    assert "gap_opened" in event_names, f"missing gap_opened frame; got {event_names}"
    assert "done" in event_names, f"missing done frame; got {event_names}"

    # done must be the terminal frame (last named event)
    assert event_names[-1] == "done", f"done should be last; got {event_names}"


# ---------------------------------------------------------------------------
# (c) /society/state — §8.2 shape, gaps carry status + claimed_by
# ---------------------------------------------------------------------------


def test_society_state_shape_and_gaps(monkeypatch):
    store = _make_store()
    app, rs, ctx = _make_app(monkeypatch, store)

    # Seed a gap in the store
    ids = create_gaps(store, ctx.kb_id, ctx.project_id, ["What is stablecoin regulation?"])
    gap_id = ids[0]

    # Claim it so owner/claimed_by is set
    claim_gap(store, ctx.kb_id, owner="r1")

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get("/api/projects/demo/kbs/demo/society/state")

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # §8.2 snapshot keys must all be present
    for key in ("nodes", "edges", "gaps", "coverage", "contributors", "report"):
        assert key in data, f"missing key {key!r} in state response"

    # gaps list must carry required fields
    assert len(data["gaps"]) == 1
    gap_out = data["gaps"][0]
    assert "status" in gap_out
    assert "claimed_by" in gap_out
    assert "gap_id" in gap_out
    assert "question" in gap_out
    assert gap_out["status"] == "claimed"
    assert gap_out["claimed_by"] == "r1"

    # nodes must contain a question node for the gap
    node_ids = {n["id"] for n in data["nodes"]}
    assert gap_id in node_ids

    # contributors derived from owners
    assert "r1" in data["contributors"]


# ---------------------------------------------------------------------------
# (c-extra) /society/state with a finding attached to a gap
# ---------------------------------------------------------------------------


def test_society_state_with_finding(monkeypatch):
    store = _make_store()
    app, rs, ctx = _make_app(monkeypatch, store)

    # Seed a gap and insert a finding
    ids = create_gaps(store, ctx.kb_id, ctx.project_id, ["What is CBDC?"])
    gap_id = ids[0]

    # Insert a finding directly into the store
    finding_rows = [{
        "org_id": ctx.org_id,
        "kb_id": ctx.kb_id,
        "title": "CBDC Overview",
        "content": "Central bank digital currency overview.",
        "category": "regulatory",
        "confidence": 0.9,
        "tags": [],
        "provenance": [],
        "embedding": [0.0] * 1536,
    }]

    async def _insert():
        return await store.insert_findings(finding_rows)

    finding_ids = asyncio.run(_insert())
    fid = finding_ids[0]

    # Complete the gap with the finding id
    g = claim_gap(store, ctx.kb_id, owner="r2")
    complete_gap(store, g.id, [fid], coverage="rich", band1_hits=3, status="done")

    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get("/api/projects/demo/kbs/demo/society/state")

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # There should be both a question node and a finding node
    node_types = {n["type"] for n in data["nodes"]}
    assert "question" in node_types
    assert "finding" in node_types

    # And an edge connecting them
    assert len(data["edges"]) >= 1
    edge = data["edges"][0]
    assert edge["relation"] == "answers"
    assert edge["source"] == fid
    assert edge["target"] == gap_id

    # Coverage should be "rich" (only one gap, it has coverage="rich")
    assert data["coverage"] == "rich"

"""TDD tests for the ?replay=1 degraded-demo mode (D4).

Seeded a file-backed temp DB (never :memory:) with done/verified gaps + findings via
the store + blackboard fns, then drives replay_events and asserts named frames come
out IN ORDER with no network call.  interval=0.0 keeps the test fast.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile

import pytest

from queens8.store.sqlite import SQLiteStore
from queens8.society.blackboard import create_gaps, complete_gap
from queens8.api.routes_society import replay_events


def _drain(agen):
    async def go():
        return [x async for x in agen]
    return asyncio.run(go())


def test_replay_reemits_named_frames_offline():
    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "queens8.db")
    store = SQLiteStore(db_path=db_path)
    kb_id, project_id, org_id = "kb1", "p1", "local"

    # one finding the replayed gap will reference
    fid = asyncio.run(store.insert_findings([{
        "org_id": org_id, "kb_id": kb_id, "title": "T",
        "content": "body", "category": "fact", "confidence": 0.9,
        "tags": [], "provenance": [], "embedding": [0.0] * 1536,
    }]))[0]

    # create_gaps takes list[str] (the question text), NOT list[dict] — S1 inserts
    # each element directly into the `question` column.
    gid = create_gaps(store, kb_id, project_id, ["Q1?"])[0]
    complete_gap(store, gid, [fid], coverage="rich", band1_hits=1, status="done")

    frames = _drain(replay_events(store, kb_id, interval=0.0))
    events = [f.split("event: ", 1)[1].split("\n", 1)[0] for f in frames]

    assert "gap_opened" in events
    assert "gap_claimed" in events
    assert "finding_merged" in events
    assert "gap_filled" in events
    assert events[-1] == "done"
    # the finding_merged frame carries the real finding id from the DB
    merged = [f for f in frames if f.startswith("event: finding_merged")][0]
    payload = json.loads(merged.split("data: ", 1)[1].strip())
    assert payload["finding_id"] == fid


def test_replay_frame_ordering_per_gap():
    """Per-gap ordering: gap_opened → gap_claimed → finding_merged* → gap_filled → coverage."""
    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "queens8.db")
    store = SQLiteStore(db_path=db_path)
    kb_id, project_id, org_id = "kb2", "p2", "local"

    fid = asyncio.run(store.insert_findings([{
        "org_id": org_id, "kb_id": kb_id, "title": "Finding A",
        "content": "body", "category": "fact", "confidence": 0.8,
        "tags": [], "provenance": [], "embedding": [0.0] * 1536,
    }]))[0]

    gid = create_gaps(store, kb_id, project_id, ["What is X?"])[0]
    complete_gap(store, gid, [fid], coverage="sparse", band1_hits=2, status="verified")

    frames = _drain(replay_events(store, kb_id, interval=0.0))
    events = [f.split("event: ", 1)[1].split("\n", 1)[0] for f in frames]

    # Find the indices for this gap's lifecycle frames
    idx_opened = events.index("gap_opened")
    idx_claimed = events.index("gap_claimed")
    idx_merged = events.index("finding_merged")
    idx_filled = events.index("gap_filled")
    idx_coverage = events.index("coverage")
    idx_report = events.index("report")
    idx_done = events.index("done")

    assert idx_opened < idx_claimed < idx_merged < idx_filled < idx_coverage
    assert idx_coverage < idx_report < idx_done


def test_replay_final_frames_are_report_then_done():
    """report must immediately precede done as the last two frames."""
    tmp = tempfile.mkdtemp()
    db_path = os.path.join(tmp, "queens8.db")
    store = SQLiteStore(db_path=db_path)
    kb_id, project_id, org_id = "kb3", "p3", "local"

    gid = create_gaps(store, kb_id, project_id, ["Empty gap?"])[0]
    complete_gap(store, gid, [], coverage="gap", band1_hits=0, status="done")

    frames = _drain(replay_events(store, kb_id, interval=0.0))
    events = [f.split("event: ", 1)[1].split("\n", 1)[0] for f in frames]

    assert events[-1] == "done"
    assert events[-2] == "report"

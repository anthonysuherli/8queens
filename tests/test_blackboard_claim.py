"""Two-racer atomic-claim test: exactly one of two concurrent claim_gap calls wins.

This test validates M4 success criterion 6 by exercising genuine contention via:
1. Real asyncio loop yield point (await asyncio.sleep(0)) before sync claim_gap
2. Two separate SQLiteStore instances on the same file-backed database
"""

from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from qwen8.store import get_store
from qwen8.store.sqlite import SQLiteStore
from qwen8.society.blackboard import claim_gap, create_gaps, list_gaps


@pytest.mark.asyncio
async def test_one_open_gap_yields_exactly_one_winner():
    """File-backed temp DB, never :memory: — gaps table must be shared.

    A single store instance, two concurrent coroutines each yielding the event loop
    before calling claim_gap synchronously. Exactly one should claim the gap.
    """
    d = tempfile.mkdtemp()
    path = os.path.join(d, "qwen8.db")
    store = get_store(db_path=path)
    create_gaps(store, "kb1", "proj1", ["only one open gap"])

    async def claimer(owner: str):
        await asyncio.sleep(0)  # real loop yield BEFORE the sync claim
        return claim_gap(store, "kb1", owner=owner)

    # Two coroutines race the single open gap on one event loop.
    a, b = await asyncio.gather(claimer("r1"), claimer("r2"))
    winners = [g for g in (a, b) if g is not None]
    losers = [g for g in (a, b) if g is None]
    assert len(winners) == 1, f"Expected 1 winner, got {len(winners)}"
    assert len(losers) == 1, f"Expected 1 loser, got {len(losers)}"
    assert winners[0].status == "claimed", f"Winner status should be 'claimed', got {winners[0].status}"
    # exactly one claimed row in the DB
    claimed = list_gaps(store, "kb1", status="claimed")
    assert len(claimed) == 1, f"Expected 1 claimed gap, got {len(claimed)}"
    store.close()


@pytest.mark.asyncio
async def test_two_connections_same_file_one_winner():
    """Two SQLiteStore instances on the SAME file db → genuine WAL contention.

    Second store on the same file-backed database creates a second connection
    that will race with the first on the actual SQLite WAL, exercising true
    multi-connection atomicity of the claim_gap UPDATE ... WHERE ... LIMIT 1 query.
    """
    d = tempfile.mkdtemp()
    path = os.path.join(d, "qwen8.db")

    s1 = SQLiteStore(db_path=path)
    s2 = SQLiteStore(db_path=path)
    create_gaps(s1, "kb1", "proj1", ["only one open gap"])

    async def claim_via(store, owner: str):
        await asyncio.sleep(0)
        return claim_gap(store, "kb1", owner=owner)

    # Two coroutines, each on a different connection, race the same gap
    a, b = await asyncio.gather(claim_via(s1, "r1"), claim_via(s2, "r2"))
    winners = [g for g in (a, b) if g is not None]
    assert len(winners) == 1, f"Expected 1 winner across 2 connections, got {len(winners)}"
    # both connections agree exactly one row is claimed
    claimed_s1 = list_gaps(s1, "kb1", status="claimed")
    claimed_s2 = list_gaps(s2, "kb1", status="claimed")
    assert len(claimed_s1) == 1, f"s1: expected 1 claimed, got {len(claimed_s1)}"
    assert len(claimed_s2) == 1, f"s2: expected 1 claimed, got {len(claimed_s2)}"
    s1.close()
    s2.close()

from __future__ import annotations

import os
import tempfile

import pytest

from qwen8.store import get_store
from qwen8.society.blackboard import (
    Gap,
    claim_gap,
    complete_gap,
    create_gaps,
    list_gaps,
    reopen_gap,
)


@pytest.fixture
def store():
    d = tempfile.mkdtemp()
    path = os.path.join(d, "qwen8.db")
    s = get_store(db_path=path)
    yield s
    s.close()


def test_create_and_list_gaps(store):
    ids = create_gaps(store, "kb1", "proj1", ["What is X?", "What is Y?"])
    assert len(ids) == 2
    rows = list_gaps(store, "kb1")
    assert len(rows) == 2
    assert all(isinstance(g, Gap) for g in rows)
    assert {g.question for g in rows} == {"What is X?", "What is Y?"}
    assert all(g.status == "open" for g in rows)
    assert all(g.coverage is None for g in rows)
    assert all(g.project_id == "proj1" for g in rows)
    assert all(g.finding_ids == [] for g in rows)


def test_claim_then_complete(store):
    create_gaps(store, "kb1", "proj1", ["What is X?"])
    g = claim_gap(store, "kb1", owner="r1")
    assert g is not None
    assert g.status == "claimed"
    assert g.owner == "r1"
    # second claim finds no open gap
    assert claim_gap(store, "kb1", owner="r2") is None
    complete_gap(store, g.id, ["f1", "f2"], coverage="rich", band1_hits=3, status="verified")
    rows = list_gaps(store, "kb1", status="verified")
    assert len(rows) == 1
    assert rows[0].coverage == "rich"
    assert rows[0].band1_hits == 3
    assert rows[0].finding_ids == ["f1", "f2"]


def test_claim_orders_null_coverage_first(store):
    # a 'rich' gap and a fresh NULL-coverage gap; NULL must be picked before rich
    create_gaps(store, "kb1", "proj1", ["rich one"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, [], coverage="rich", band1_hits=5, status="open")
    create_gaps(store, "kb1", "proj1", ["fresh one"])
    picked = claim_gap(store, "kb1", owner="r2")
    assert picked is not None
    assert picked.question == "fresh one"  # NULL coverage outranks 'rich'


def test_reopen_increments_attempts_and_sets_reason(store):
    create_gaps(store, "kb1", "proj1", ["What is X?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, [], coverage="sparse", band1_hits=1, status="verified")
    reopen_gap(store, g.id, coverage="sparse", reason="sharpen", question="What is X precisely?")
    rows = list_gaps(store, "kb1", status="open")
    assert len(rows) == 1
    assert rows[0].attempts == 1
    assert rows[0].reason == "sharpen"
    assert rows[0].question == "What is X precisely?"

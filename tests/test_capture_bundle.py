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

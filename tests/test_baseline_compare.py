"""Baseline-compare harness (scripts/baseline_compare.py) — P1 track requirement.

Guards:
  (a) pure metric helpers: domain extraction, coverage summary, markdown render;
  (b) run_single_agent persists engine findings exactly like the Researcher
      (rendered content, normalized provenance, completed exploration row);
  (c) probe_coverage bands a real file-backed store (never :memory:);
  (d) generate_probes dedups + caps the LLM's question list;
  (e) compare() isolates the two KBs and writes the json + md artifacts.
"""

from __future__ import annotations

import json
import os
import tempfile
from types import SimpleNamespace

import pytest

from queens8.core.exploration.models import Finding
from queens8.store import get_store
from scripts import baseline_compare as bc


def _finding(title: str, url: str) -> Finding:
    return Finding(
        exploration_id="exp1",
        project_id="proj1",
        category="fact",
        title=title,
        content={"summary": f"body of {title}"},
        confidence=0.8,
        provenance=[{"url": url, "query": "q"}],
    )


@pytest.fixture
def store():
    d = tempfile.mkdtemp()
    s = get_store(db_path=os.path.join(d, "queens8.db"))
    yield s
    s.close()


# ---------------------------------------------------------------------------
# (a) pure helpers
# ---------------------------------------------------------------------------


def test_domains_dedup_and_normalize():
    """Unique registrable hosts: lowercased, www-stripped, malformed skipped."""
    rows = [
        {"provenance": [{"url": "https://www.Example.com/a", "query": "q"}]},
        {"provenance": [{"url": "https://example.com/b"}, {"url": "https://other.org/c"}]},
        {"provenance": [{"query": "no url"}, "not-a-dict", {"url": ""}]},
        {"provenance": []},
        {},  # no provenance key at all
    ]
    assert bc.domains_from_findings(rows) == ["example.com", "other.org"]


def test_coverage_summary_counts_bands():
    covs = [
        {"question": "q1", "coverage": "rich", "band1_hits": 4},
        {"question": "q2", "coverage": "sparse", "band1_hits": 1},
        {"question": "q3", "coverage": "gap", "band1_hits": 0},
        {"question": "q4", "coverage": "rich", "band1_hits": 3},
    ]
    s = bc.coverage_summary(covs)
    assert (s["rich"], s["sparse"], s["gap"]) == (2, 1, 1)
    assert s["mean_band1_hits"] == pytest.approx(2.0)


def test_coverage_summary_empty_probes():
    s = bc.coverage_summary([])
    assert (s["rich"], s["sparse"], s["gap"]) == (0, 0, 0)
    assert s["mean_band1_hits"] == 0.0


def test_render_comparison_md_has_metrics_and_survives_zero_calls():
    result = {
        "topic": "test topic",
        "probes": ["q1", "q2"],
        "single": {
            "findings": 5, "distinct_titles": 4, "unique_domains": 3,
            "llm_calls": 0, "wall_seconds": 10.0,
            "coverage": {"rich": 0, "sparse": 1, "gap": 1, "mean_band1_hits": 0.5},
        },
        "society": {
            "findings": 20, "distinct_titles": 15, "unique_domains": 9,
            "llm_calls": 40, "wall_seconds": 300.0,
            "coverage": {"rich": 2, "sparse": 0, "gap": 0, "mean_band1_hits": 3.5},
            "rounds": 2, "gaps_done": 3, "gaps_dead": 1,
        },
    }
    md = bc.render_comparison_md(result)
    assert "test topic" in md
    assert "| Findings persisted | 5 | 20 |" in md
    assert "| Distinct finding titles | 4 | 15 |" in md
    assert "0.50" in md  # society findings/llm-call = 20/40
    assert "n/a" in md  # single side has llm_calls=0 → no ratio
    # methodology disclosures — counts are raw, probe 0 is the topic, calls asymmetric
    assert "Probe 0 is the raw topic" in md
    assert "no cross-exploration dedup" in md
    assert "no synthesis stage" in md


def test_distinct_title_count_normalizes_and_skips_blank():
    rows = [{"title": "  Foo Bar "}, {"title": "foo  bar"}, {"title": "Baz"}, {"title": ""}, {}]
    assert bc.distinct_title_count(rows) == 2


def test_slugify_topic():
    assert bc.slugify("The State of Open-Weight LLMs, 2026!") == "the-state-of-open-weight-llms-2026"
    assert len(bc.slugify("x" * 200)) <= 40


# ---------------------------------------------------------------------------
# (b) single-agent runner mirrors the Researcher's persistence
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_single_agent_persists_and_completes(monkeypatch, store):
    async def fake_run_exploration(prompt, *, exploration_id, project_id, kb_id, cfg,
                                   lens="explore", on_progress=None, on_narration=None):
        return [_finding("F1", "https://a.com/1"), _finding("F2", "https://b.com/2")]

    async def fake_embed_batch(texts):
        return [[0.1] * 1536 for _ in texts]

    monkeypatch.setattr(bc, "run_exploration", fake_run_exploration)
    monkeypatch.setattr(bc, "embed_batch", fake_embed_batch)
    # Poison the counter so the ==0 assertion proves reset_llm_calls is load-bearing.
    import queens8.core.clients.ai_gateway as ag
    monkeypatch.setattr(ag, "_LLM_CALLS", 7)

    org_id, project_id = store.resolve_project("p", create=True)
    kb_id = store.resolve_kb(org_id, project_id, "kb-single", create=True)

    from queens8.core.config import get_config
    out = await bc.run_single_agent(
        store, org_id=org_id, project_id=project_id, kb_id=kb_id,
        topic="t", cfg=get_config(),
    )

    assert len(out["finding_ids"]) == 2
    assert out["llm_calls"] == 0, "counter was reset and nothing hit the gateway"
    assert out["wall_seconds"] >= 0

    row = store.get_finding(kb_id, out["finding_ids"][0])
    assert row["title"] == "F1"
    assert isinstance(row["content"], str) and "body of F1" in row["content"]
    assert row["provenance"] and row["provenance"][0]["url"] == "https://a.com/1"

    status, fid_json = store._conn.execute(
        "SELECT status, finding_ids FROM explorations"
    ).fetchone()
    assert status == "completed"
    assert set(json.loads(fid_json)) == set(out["finding_ids"])


@pytest.mark.asyncio
async def test_run_single_agent_empty_exploration(monkeypatch, store):
    async def fake_run_exploration(prompt, **kw):
        return []

    monkeypatch.setattr(bc, "run_exploration", fake_run_exploration)
    org_id, project_id = store.resolve_project("p", create=True)
    kb_id = store.resolve_kb(org_id, project_id, "kb-empty", create=True)

    from queens8.core.config import get_config
    out = await bc.run_single_agent(
        store, org_id=org_id, project_id=project_id, kb_id=kb_id,
        topic="t", cfg=get_config(),
    )
    assert out["finding_ids"] == []
    assert store.count_findings(kb_id) == 0


@pytest.mark.asyncio
async def test_run_single_agent_failure_stamps_exploration(monkeypatch, store):
    """The except path must mark the row failed — update_exploration silently
    drops unknown kwargs, so a typo there would strand rows as 'running'."""

    async def boom(prompt, **kw):
        raise RuntimeError("tavily down")

    monkeypatch.setattr(bc, "run_exploration", boom)
    org_id, project_id = store.resolve_project("p", create=True)
    kb_id = store.resolve_kb(org_id, project_id, "kb-fail", create=True)

    from queens8.core.config import get_config
    with pytest.raises(RuntimeError, match="tavily down"):
        await bc.run_single_agent(
            store, org_id=org_id, project_id=project_id, kb_id=kb_id,
            topic="t", cfg=get_config(),
        )

    status, error = store._conn.execute(
        "SELECT status, error FROM explorations"
    ).fetchone()
    assert status == "failed"
    assert "tavily down" in error


# ---------------------------------------------------------------------------
# (c) probe coverage over a real store
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_probe_coverage_bands_seeded_and_empty_kbs(monkeypatch, store):
    vec = [0.1] * 1536

    async def fake_embed_text(text):
        return vec

    monkeypatch.setattr(bc, "embed_text", fake_embed_text)

    org_id, project_id = store.resolve_project("p", create=True)
    kb_id = store.resolve_kb(org_id, project_id, "kb-cov", create=True)
    await store.insert_findings([{
        "org_id": org_id, "kb_id": kb_id, "title": "T", "content": "body",
        "category": "fact", "confidence": 0.9, "tags": [],
        "provenance": [{"url": "https://a.com", "query": "q"}], "embedding": vec,
    }])

    from queens8.core.config import get_config
    covs = await bc.probe_coverage(store, kb_id=kb_id, probes=["q1"], cfg=get_config())
    assert covs == [{"question": "q1", "coverage": "sparse", "band1_hits": 1}]

    empty_kb = store.resolve_kb(org_id, project_id, "kb-cov-empty", create=True)
    covs = await bc.probe_coverage(store, kb_id=empty_kb, probes=["q1"], cfg=get_config())
    assert covs[0]["coverage"] == "gap"
    assert covs[0]["band1_hits"] == 0


# ---------------------------------------------------------------------------
# (d) probe generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_probes_dedups_and_caps(monkeypatch):
    class _Resp:
        questions = [
            type("Q", (), {"question": "  What is A?  "})(),
            type("Q", (), {"question": "what is a?"})(),  # dup after normalize
            type("Q", (), {"question": ""})(),  # blank dropped
            type("Q", (), {"question": "What is B?"})(),
            type("Q", (), {"question": "What is C?"})(),
        ]

    from queens8.core.config import get_config

    async def fake_sc(**kwargs):
        assert "my topic" in kwargs["user"]
        # Probes must NOT come from the society's planner model — that would
        # draw the eval rubric from the distribution the society optimizes.
        assert kwargs["model"] == get_config().agent.model
        return _Resp()

    monkeypatch.setattr(bc, "structured_completion", fake_sc)
    probes = await bc.generate_probes("my topic", cfg=get_config(), k=2)
    assert probes == ["What is A?", "What is B?"]


# ---------------------------------------------------------------------------
# (e) full compare orchestration
# ---------------------------------------------------------------------------


def _env_store(monkeypatch):
    d = tempfile.mkdtemp()
    path = os.path.join(d, "queens8.db")
    monkeypatch.setenv("QUEENS8_DB_PATH", path)
    monkeypatch.setenv("QUEENS8_BACKEND", "local")
    from queens8.store import _local_stores
    _local_stores.clear()
    return get_store(db_path=path)


@pytest.mark.asyncio
async def test_compare_isolates_kbs_and_writes_artifacts(monkeypatch, tmp_path):
    _env_store(monkeypatch)

    vec = [0.1] * 1536

    async def fake_embed_text(text):
        return vec

    async def fake_embed_batch(texts):
        return [vec for _ in texts]

    async def fake_run_exploration(prompt, **kw):
        return [_finding("S1", "https://single.com/1")]

    async def fake_run_society(topic, *, org_id, project_id, kb_id, cfg,
                               n_researchers, max_rounds, max_attempts,
                               spawn_budget, on_event=None, store=None):
        # compare() must run the society on the SAME knobs it reports.
        assert n_researchers == cfg.society.n_researchers
        assert max_rounds == cfg.society.max_rounds
        assert max_attempts == cfg.society.max_attempts
        assert spawn_budget == cfg.society.spawn_budget
        await store.insert_findings([
            {"org_id": org_id, "kb_id": kb_id, "title": f"M{i}", "content": "b",
             "category": "fact", "confidence": 0.9, "tags": [],
             "provenance": [{"url": f"https://soc{i}.com", "query": "q"}],
             "embedding": vec}
            for i in range(2)
        ])
        return SimpleNamespace(topic=topic, kb_id=kb_id, report="r", unanswered=[],
                               gaps=[], rounds=1, finding_count=2)

    async def fake_generate_probes(topic, *, cfg, k=6):
        return ["probe q1"]

    monkeypatch.setattr(bc, "embed_text", fake_embed_text)
    monkeypatch.setattr(bc, "embed_batch", fake_embed_batch)
    monkeypatch.setattr(bc, "run_exploration", fake_run_exploration)
    monkeypatch.setattr(bc, "run_society", fake_run_society)
    monkeypatch.setattr(bc, "generate_probes", fake_generate_probes)

    out_json = tmp_path / "compare.json"
    result = await bc.compare("isolation topic", project="iso-test", out_path=out_json)

    assert result["single"]["findings"] == 1
    assert result["society"]["findings"] == 2
    assert result["single"]["unique_domains"] == 1
    assert result["society"]["unique_domains"] == 2
    # probe 0 is always the raw topic, ahead of the generated rubric
    assert result["probes"] == ["isolation topic", "probe q1"]
    assert result["single"]["kb"] != result["society"]["kb"]
    assert result["society"]["rounds"] == 1
    assert result["single"]["distinct_titles"] == 1
    assert result["society"]["distinct_titles"] == 2

    saved = json.loads(out_json.read_text())
    assert saved["single"]["findings"] == 1
    md = out_json.with_suffix(".md").read_text()
    assert "| Findings persisted | 1 | 2 |" in md


@pytest.mark.asyncio
async def test_compare_refuses_prepopulated_kb(monkeypatch, tmp_path):
    """Deterministic KB names + find-or-create bootstrap would silently mix a
    rerun's metrics into stale rows — compare() must fail fast instead."""
    store = _env_store(monkeypatch)

    async def no_network(*a, **kw):
        raise AssertionError("guard must fire before any LLM/search call")

    monkeypatch.setattr(bc, "generate_probes", no_network)
    monkeypatch.setattr(bc, "run_exploration", no_network)
    monkeypatch.setattr(bc, "run_society", no_network)

    org_id, project_id = store.resolve_project("guard-test", create=True)
    kb_id = store.resolve_kb(org_id, project_id, "single-guard-topic", create=True)
    await store.insert_findings([{
        "org_id": org_id, "kb_id": kb_id, "title": "stale", "content": "b",
        "category": "fact", "confidence": 0.9, "tags": [], "provenance": [],
        "embedding": [0.1] * 1536,
    }])

    with pytest.raises(RuntimeError, match="pre-populated"):
        await bc.compare("guard topic", project="guard-test",
                         out_path=tmp_path / "guard.json")


@pytest.mark.asyncio
async def test_compare_requires_local_store(monkeypatch, tmp_path):
    monkeypatch.setattr(bc, "get_store", lambda db_path=None: SimpleNamespace())
    with pytest.raises(RuntimeError, match="local"):
        await bc.compare("t", out_path=tmp_path / "x.json")

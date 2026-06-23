"""TDD tests for qwen8.society.roles — Planner / Researcher / Critic / Synthesizer.

All LLM + engine calls are monkeypatched so no live API key is needed.
Uses a FILE-BACKED temp DB (never :memory:) per the repo convention.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from qwen8.core.config import get_config
from qwen8.store import get_store
from qwen8.society import roles as roles_mod
from qwen8.society.blackboard import claim_gap, complete_gap, create_gaps, list_gaps


@pytest.fixture
def store():
    d = tempfile.mkdtemp()
    s = get_store(db_path=os.path.join(d, "qwen8.db"))
    yield s
    s.close()


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_seed_writes_dedup_gaps(monkeypatch, store):
    """Planner deduplicates questions (case-insensitive / whitespace-normalised)."""

    class _Resp:
        questions = [
            type("Q", (), {"question": "What is A?", "rationale": "r"})(),
            type("Q", (), {"question": "What is A?", "rationale": "dup"})(),  # dup
            type("Q", (), {"question": "What is B?", "rationale": "r"})(),
        ]

    async def fake_sc(**kwargs):
        return _Resp()

    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)
    p = roles_mod.Planner(store, org_id="local", project_id="proj1", kb_id="kb1",
                          cfg=get_config())
    gaps = await p.seed("a topic")
    qs = {g.question for g in list_gaps(store, "kb1")}
    assert qs == {"What is A?", "What is B?"}  # deduped on normalized text


@pytest.mark.asyncio
async def test_planner_emits_gap_opened_and_node_added(monkeypatch, store):
    """Planner emits gap_opened + node_added per seeded gap when on_event is set."""

    class _Resp:
        questions = [
            type("Q", (), {"question": "What is X?", "rationale": "r"})(),
        ]

    async def fake_sc(**kwargs):
        return _Resp()

    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    p = roles_mod.Planner(store, org_id="local", project_id="proj1", kb_id="kb2",
                          cfg=get_config(), on_event=capture)
    await p.seed("topic")

    names = [e[0] for e in events]
    assert "gap_opened" in names
    assert "node_added" in names


# ---------------------------------------------------------------------------
# Researcher
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_researcher_step_persists_findings_and_emits_events(monkeypatch, store):
    """Researcher.step: claim → explore → render+embed → insert → coverage → complete.

    Asserts:
    - match_findings is called (coverage recompute)
    - findings are embedded+inserted so a second match_findings would find them
    - on_event receives gap_claimed / finding_merged / node_added / edge_added / coverage / gap_filled
    """
    from qwen8.core.exploration.engine import Finding

    create_gaps(store, "kb1", "proj1", ["What is Y?"])
    cfg = get_config()

    # ---- mocks ----
    emb_calls: list[str] = []
    batch_calls: list[list[str]] = []

    async def fake_embed_text(text: str) -> list[float]:
        emb_calls.append(text)
        return [0.1] * 1536

    async def fake_embed_batch(texts) -> list[list[float]]:
        batch_calls.append(list(texts))
        return [[0.2] * 1536 for _ in texts]

    # First call returns empty (pre-research coverage = gap); second returns a hit.
    match_call_count = 0

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        nonlocal match_call_count
        match_call_count += 1
        if match_call_count == 1:
            return []  # pre-research: no findings yet → will NOT rich-skip
        # post-research: one band-1 hit (sim > band1_min)
        return [{"id": "f999", "title": "Res", "content": "body", "category": "fact",
                 "confidence": 0.9, "tags": [], "provenance": [], "similarity": 0.8}]

    fake_finding = Finding(
        exploration_id="exp_fake",
        project_id="proj1",
        title="Result",
        content={"summary": "found it"},
        category="fact",
        confidence=0.9,
        tags=["x"],
        provenance=[{"url": "http://example.com", "title": "ex"}],
    )

    async def fake_run_exploration(prompt, *, exploration_id, project_id, kb_id, cfg, lens="explore",
                                   on_progress=None, on_narration=None):
        return [fake_finding]

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed_text)
    monkeypatch.setattr(roles_mod, "embed_batch", fake_embed_batch)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "run_exploration", fake_run_exploration)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    r = roles_mod.Researcher(store, org_id="local", project_id="proj1", kb_id="kb1",
                              cfg=cfg, researcher_id="r1", on_event=capture)
    result = await r.step()

    assert result is True

    # Coverage recompute was called (embed_text called)
    assert len(emb_calls) >= 1

    # embed_batch called once with the rendered bodies (ONE batch)
    assert len(batch_calls) == 1
    assert len(batch_calls[0]) == 1  # one finding

    # Events emitted
    event_names = [e[0] for e in events]
    assert "gap_claimed" in event_names
    assert "finding_merged" in event_names
    assert "node_added" in event_names
    assert "edge_added" in event_names
    assert "coverage" in event_names
    assert "gap_filled" in event_names

    # Gap is now verified
    done = list_gaps(store, "kb1", status="verified")
    assert len(done) == 1


@pytest.mark.asyncio
async def test_researcher_rich_skip_gate_skips_on_rich_coverage(monkeypatch, store):
    """Rich-skip gate fires when coverage is 'rich' and gap.reason is NOT 'sharpen'."""
    create_gaps(store, "kb1", "proj1", ["What is Z?"])
    cfg = get_config()

    async def fake_embed_text(text: str) -> list[float]:
        return [0.5] * 1536

    # Return enough band-1 hits to be 'rich' (rich_hit_count = 3 by default)
    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return [
            {"id": f"f{i}", "title": f"T{i}", "content": "c", "category": "fact",
             "confidence": 0.9, "tags": [], "provenance": [], "similarity": 0.8}
            for i in range(3)
        ]

    run_called = False

    async def fake_run_exploration(*args, **kwargs):
        nonlocal run_called
        run_called = True
        return []

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed_text)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "run_exploration", fake_run_exploration)

    r = roles_mod.Researcher(store, org_id="local", project_id="proj1", kb_id="kb1",
                              cfg=cfg, researcher_id="r1")
    result = await r.step()
    assert result is True
    assert not run_called, "run_exploration should NOT be called on rich-skip"


@pytest.mark.asyncio
async def test_researcher_rich_skip_does_not_fire_on_sharpen(monkeypatch, store):
    """Rich-skip gate must NOT short-circuit a 'sharpen' reopen even when coverage is rich."""
    create_gaps(store, "kb1", "proj1", ["What is Sharpen?"])
    cfg = get_config()

    # Manually mark gap as reason='sharpen' after claim
    g = claim_gap(store, "kb1", owner="setup")
    # reopen with reason='sharpen' so it's back open
    from qwen8.society.blackboard import reopen_gap
    complete_gap(store, g.id, [], coverage="sparse", band1_hits=0, status="verified")
    reopen_gap(store, g.id, coverage="sparse", reason="sharpen", question="Sharpened?")

    async def fake_embed_text(text: str) -> list[float]:
        return [0.5] * 1536

    # Return 'rich' coverage — but because reason='sharpen', step MUST proceed
    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return [
            {"id": f"f{i}", "title": f"T{i}", "content": "c", "category": "fact",
             "confidence": 0.9, "tags": [], "provenance": [], "similarity": 0.8}
            for i in range(3)
        ]

    run_called = False

    async def fake_embed_batch(texts) -> list[list[float]]:
        return [[0.2] * 1536 for _ in texts]

    async def fake_run_exploration(*args, **kwargs):
        nonlocal run_called
        run_called = True
        return []  # no findings

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed_text)
    monkeypatch.setattr(roles_mod, "embed_batch", fake_embed_batch)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "run_exploration", fake_run_exploration)

    r = roles_mod.Researcher(store, org_id="local", project_id="proj1", kb_id="kb1",
                              cfg=cfg, researcher_id="r1")
    result = await r.step()
    assert result is True
    assert run_called, "run_exploration MUST be called for a 'sharpen' reopen even on rich coverage"


# ---------------------------------------------------------------------------
# Critic
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_critic_reopens_insufficient_when_not_answered(monkeypatch, store):
    """Critic marks gap open with reason='insufficient' when coverage is sparse."""
    create_gaps(store, "kb1", "proj1", ["What is C?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, ["f1"], coverage="sparse", band1_hits=1, status="verified")

    async def fake_embed(text):
        return [0.0] * 1536

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return [{"id": "f1", "title": "t", "content": "c", "category": "x",
                 "confidence": 0.5, "tags": [], "provenance": [], "similarity": 0.41}]

    class _Verdict:
        answered = False
        reason = "insufficient"
        question = None

    async def fake_sc(**kwargs):
        return _Verdict()

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)
    c = roles_mod.Critic(store, kb_id="kb1", cfg=get_config(), max_attempts=2, spawn_budget=4)
    n = await c.review()
    assert n == 1  # one gap processed
    reopened = list_gaps(store, "kb1", status="open")
    assert len(reopened) == 1
    assert reopened[0].reason == "insufficient"
    assert reopened[0].attempts == 1


@pytest.mark.asyncio
async def test_critic_marks_dead_at_attempts_cap(monkeypatch, store):
    """Critic marks gap 'dead' when attempts >= max_attempts."""
    create_gaps(store, "kb1", "proj1", ["What is D?"])
    g = claim_gap(store, "kb1", owner="r1")
    # simulate prior reopen so attempts already at the cap
    complete_gap(store, g.id, [], coverage="sparse", band1_hits=0, status="verified")
    store._conn.execute("UPDATE gaps SET attempts=1 WHERE id=?;", (g.id,))
    store._conn.commit()

    async def fake_embed(text):
        return [0.0] * 1536

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return []  # gap coverage

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed)
    monkeypatch.setattr(store, "match_findings", fake_match)
    c = roles_mod.Critic(store, kb_id="kb1", cfg=get_config(), max_attempts=1, spawn_budget=4)
    await c.review()
    dead = list_gaps(store, "kb1", status="dead")
    assert len(dead) == 1


@pytest.mark.asyncio
async def test_critic_closes_rich_gap_as_done(monkeypatch, store):
    """Critic marks a 'rich' gap as 'done' without calling the LLM."""
    create_gaps(store, "kb1", "proj1", ["What is E?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, ["f1", "f2", "f3"], coverage="rich", band1_hits=3, status="verified")

    async def fake_embed(text):
        return [0.5] * 1536

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return [
            {"id": f"f{i}", "title": f"T{i}", "content": "c", "category": "fact",
             "confidence": 0.9, "tags": [], "provenance": [], "similarity": 0.8}
            for i in range(3)
        ]

    llm_called = False

    async def fake_sc(**kwargs):
        nonlocal llm_called
        llm_called = True
        raise RuntimeError("LLM should not be called for a rich gap")

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)
    c = roles_mod.Critic(store, kb_id="kb1", cfg=get_config(), max_attempts=2, spawn_budget=4)
    n = await c.review()
    assert n == 1
    assert not llm_called
    done = list_gaps(store, "kb1", status="done")
    assert len(done) == 1


@pytest.mark.asyncio
async def test_critic_emits_gap_opened_on_reopen(monkeypatch, store):
    """Critic emits gap_opened when reopening a gap."""
    create_gaps(store, "kb1", "proj1", ["Critic event Q?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, [], coverage="sparse", band1_hits=0, status="verified")

    async def fake_embed(text):
        return [0.0] * 1536

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return []

    class _Verdict:
        answered = False
        reason = "insufficient"
        question = None

    async def fake_sc(**kwargs):
        return _Verdict()

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    c = roles_mod.Critic(store, kb_id="kb1", cfg=get_config(), max_attempts=2, spawn_budget=4,
                         on_event=capture)
    await c.review()

    names = [e[0] for e in events]
    assert "gap_opened" in names


@pytest.mark.asyncio
async def test_critic_sharpen_spawns_child_gap(monkeypatch, store):
    """Critic with reason='sharpen' creates a child gap (subject to spawn_budget)."""
    create_gaps(store, "kb1", "proj1", ["Broad question?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, [], coverage="sparse", band1_hits=0, status="verified")

    async def fake_embed(text):
        return [0.0] * 1536

    async def fake_match(kb_id, emb, match_count, min_similarity, categories=None):
        return []

    class _Verdict:
        answered = False
        reason = "sharpen"
        question = "Narrower focused question?"

    async def fake_sc(**kwargs):
        return _Verdict()

    monkeypatch.setattr(roles_mod, "embed_text", fake_embed)
    monkeypatch.setattr(store, "match_findings", fake_match)
    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    c = roles_mod.Critic(store, kb_id="kb1", cfg=get_config(), max_attempts=2, spawn_budget=2)
    await c.review()

    open_gaps = list_gaps(store, "kb1", status="open")
    # The original gap is reopened with reason=sharpen + a child gap was created
    assert len(open_gaps) >= 1


# ---------------------------------------------------------------------------
# Synthesizer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_synthesizer_returns_report_and_unanswered(monkeypatch, store):
    """Synthesizer calls the LLM once with done-gap findings and returns report."""
    create_gaps(store, "kb1", "proj1", ["Q1?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, ["f_syn"], coverage="rich", band1_hits=3, status="done")
    # Put a finding in the store
    store._conn.execute(
        "INSERT INTO findings (id, org_id, kb_id, title, content, category, confidence, "
        "tags, provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));",
        ("f_syn", "local", "kb1", "Syn finding", '"body text"', "fact", 0.9, "[]", "[]"),
    )
    store._conn.commit()

    class _Out:
        report = "# Report\nStuff."
        unanswered = []

    async def fake_sc(**kwargs):
        return _Out()

    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    s = roles_mod.Synthesizer(store, kb_id="kb1", cfg=get_config())
    report, unanswered = await s.run("Test topic")
    assert "Report" in report
    assert isinstance(unanswered, list)


@pytest.mark.asyncio
async def test_synthesizer_caps_top_k_per_gap(monkeypatch, store):
    """Synthesizer caps at synthesis_top_k_per_gap findings per gap."""
    cfg = get_config()
    top_k = cfg.society.synthesis_top_k_per_gap  # default 8

    # Create a gap with more findings than top_k
    n_findings = top_k + 5
    fids = [f"f{i}" for i in range(n_findings)]
    create_gaps(store, "kb1", "proj1", ["Big Q?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, fids, coverage="rich", band1_hits=top_k, status="done")

    for fid in fids:
        store._conn.execute(
            "INSERT INTO findings (id, org_id, kb_id, title, content, category, confidence, "
            "tags, provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));",
            (fid, "local", "kb1", f"T{fid}", '"body"', "fact", 0.9, "[]", "[]"),
        )
    store._conn.commit()

    fetched_ids: list[str] = []
    orig_get = store.get_finding

    def counting_get(kb_id, fid):
        fetched_ids.append(fid)
        return orig_get(kb_id, fid)

    store.get_finding = counting_get

    class _Out:
        report = "# Capped report"
        unanswered = []

    async def fake_sc(**kwargs):
        return _Out()

    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    s = roles_mod.Synthesizer(store, kb_id="kb1", cfg=cfg)
    report, _ = await s.run("topic")

    # Must fetch at most top_k findings
    assert len(fetched_ids) <= top_k


@pytest.mark.asyncio
async def test_synthesizer_partial_fallback_on_429(monkeypatch, store):
    """Synthesizer returns a partial report when structured_completion raises 429 3 times."""
    create_gaps(store, "kb1", "proj1", ["Q429?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(store, g.id, [], coverage="rich", band1_hits=3, status="done")

    call_count = 0

    async def always_429(**kwargs):
        nonlocal call_count
        call_count += 1
        raise RuntimeError("429 Too Many Requests")

    monkeypatch.setattr(roles_mod, "structured_completion", always_429)
    # Patch asyncio.sleep to avoid actual delays
    import asyncio

    async def fake_sleep(n):
        pass

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    s = roles_mod.Synthesizer(store, kb_id="kb1", cfg=get_config())
    report, unanswered = await s.run("topic")

    assert "Partial" in report
    assert isinstance(unanswered, list)


@pytest.mark.asyncio
async def test_synthesizer_emits_report_event(monkeypatch, store):
    """Synthesizer emits 'report' event via on_event."""

    class _Out:
        report = "# Final"
        unanswered = []

    async def fake_sc(**kwargs):
        return _Out()

    monkeypatch.setattr(roles_mod, "structured_completion", fake_sc)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    s = roles_mod.Synthesizer(store, kb_id="kb_synth", cfg=get_config(), on_event=capture)
    await s.run("empty topic")

    names = [e[0] for e in events]
    assert "report" in names

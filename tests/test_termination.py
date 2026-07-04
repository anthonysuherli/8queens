"""TDD tests for queens8.society.loop termination pathologies.

Tests three critical termination scenarios:
  (1) Perpetually-sparse: gaps never reach rich, defeated by attempts cap + guard (c)
  (2) Always-spawn-child: Critic spawns infinitely, defeated by spawn_budget + guard (c)
  (3) Kill-switch: gaps never converge & rounds unbounded, ONLY llm_calls() counter
      can halt (the REAL guard (d))

All roles are monkeypatched deterministic fakes; no network calls.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from queens8.core.config import get_config
from queens8.store import get_store
from queens8.society import loop as loop_mod
from queens8.society.blackboard import (
    claim_gap,
    complete_gap,
    create_gaps,
    list_gaps,
    reopen_gap,
)


def _seed_env(monkeypatch):
    """Create a temp DB and wire the env."""
    d = tempfile.mkdtemp()
    path = os.path.join(d, "queens8.db")
    monkeypatch.setenv("QUEENS8_DB_PATH", path)
    # Clear cached store so monkeypatched env is used
    from queens8.store import _local_stores
    _local_stores.clear()
    return get_store(db_path=path)


@pytest.mark.asyncio
async def test_perpetually_sparse_halts(monkeypatch):
    """Perpetually-sparse gaps (never reach rich) halt via attempts cap + guard (c)."""
    store = _seed_env(monkeypatch)

    class FakePlanner:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, on_event=None):
            self.store, self.kb_id, self.project_id = store, kb_id, project_id

        async def seed(self, topic):
            create_gaps(self.store, self.kb_id, self.project_id, ["never-rich"])
            return []

    class FakeResearcher:
        def __init__(
            self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None
        ):
            self.store, self.kb_id, self.rid = store, kb_id, researcher_id

        async def step(self):
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            complete_gap(
                self.store, g.id, ["f"], coverage="sparse", band1_hits=1, status="verified"
            )
            return True

    class FakeCritic:
        def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
            self.store, self.kb_id, self.max_attempts, self.spawn_budget = (
                store,
                kb_id,
                max_attempts,
                spawn_budget,
            )

        async def review(self):
            gs = list_gaps(self.store, self.kb_id, status="verified")
            for g in gs:
                if g.attempts >= self.max_attempts:
                    complete_gap(
                        self.store,
                        g.id,
                        g.finding_ids,
                        coverage="sparse",
                        band1_hits=1,
                        status="dead",
                    )
                else:
                    reopen_gap(self.store, g.id, coverage="sparse", reason="insufficient")
            return len(gs)

    class FakeSynth:
        def __init__(self, store, *, kb_id, cfg, on_event=None):
            pass

        async def run(self, topic):
            return "partial", ["never-rich"]

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", FakeResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    res = await loop_mod.run_society(
        "t",
        org_id="local",
        project_id="p",
        kb_id="kb1",
        cfg=get_config(),
        n_researchers=2,
        max_rounds=5,
        max_attempts=1,
        spawn_budget=4,
    )
    # The gap reaches 'dead' (attempts cap) and the loop halts well inside max_rounds
    assert res.rounds <= 5
    assert any(g.status == "dead" for g in res.gaps)
    assert not any(g.status in ("open", "claimed", "verified") for g in res.gaps)


@pytest.mark.asyncio
async def test_always_spawn_child_halts(monkeypatch):
    """Critic spawns infinitely, defeated by spawn_budget + guard (c)."""
    store = _seed_env(monkeypatch)

    class FakePlanner:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, on_event=None):
            self.store, self.kb_id, self.project_id = store, kb_id, project_id

        async def seed(self, topic):
            create_gaps(self.store, self.kb_id, self.project_id, ["root"])
            return []

    class FakeResearcher:
        def __init__(
            self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None
        ):
            self.store, self.kb_id, self.rid = store, kb_id, researcher_id

        async def step(self):
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            complete_gap(
                self.store, g.id, ["f"], coverage="sparse", band1_hits=1, status="verified"
            )
            return True

    class FakeCritic:
        def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
            self.store, self.kb_id, self.max_attempts, self.spawn_budget = (
                store,
                kb_id,
                max_attempts,
                spawn_budget,
            )

        async def review(self):
            gs = list_gaps(self.store, self.kb_id, status="verified")
            for g in gs:
                # Always try to spawn a child AND mark this dead at the cap
                if self.spawn_budget > 0:
                    create_gaps(self.store, self.kb_id, g.project_id, [f"child-{g.id}"])
                    self.spawn_budget -= 1
                complete_gap(
                    self.store,
                    g.id,
                    g.finding_ids,
                    coverage="sparse",
                    band1_hits=1,
                    status="dead",
                )
            return len(gs)

    class FakeSynth:
        def __init__(self, store, *, kb_id, cfg, on_event=None):
            pass

        async def run(self, topic):
            return "partial", []

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", FakeResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    res = await loop_mod.run_society(
        "t",
        org_id="local",
        project_id="p",
        kb_id="kb1",
        cfg=get_config(),
        n_researchers=2,
        max_rounds=10,
        max_attempts=1,
        spawn_budget=4,
    )
    # spawn_budget (4) caps total children; loop halts (max_rounds backstop holds)
    assert res.rounds <= 10
    # no more than the original gap + spawn_budget children were ever created
    # (some may remain "open" if spawned late in the run)
    assert len(res.gaps) <= 1 + 4
    # at least the root gap should be dead (Critic marks all verified gaps dead)
    assert any(g.status == "dead" for g in res.gaps)


@pytest.mark.asyncio
async def test_kill_switch_counter_halts(monkeypatch):
    """The REAL kill-switch: when ai_gateway.llm_calls() >=
    cfg.society.max_llm_calls_per_run the loop stops gracefully even though the
    gaps never converge. We monkeypatch the LLM seam to count up (like the
    counter does for real) and pin max_llm_calls_per_run low so it must trip.
    """
    import queens8.core.clients.ai_gateway as ag

    store = _seed_env(monkeypatch)

    # Fakes never reach 'rich'/'dead', so only the counter can halt the loop.
    class FakePlanner:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, on_event=None):
            self.store, self.kb_id, self.project_id = store, kb_id, project_id

        async def seed(self, topic):
            ag._LLM_CALLS += 1  # simulate the Planner's one LLM call
            create_gaps(self.store, self.kb_id, self.project_id, ["never-resolves"])
            return []

    class FakeResearcher:
        def __init__(
            self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None
        ):
            self.store, self.kb_id, self.rid = store, kb_id, researcher_id

        async def step(self):
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            ag._LLM_CALLS += 5  # simulate the engine fan-out (counted by the real counter)
            complete_gap(
                self.store, g.id, ["f"], coverage="sparse", band1_hits=1, status="verified"
            )
            return True

    class FakeCritic:
        def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
            self.store, self.kb_id, self.spawn_budget = store, kb_id, spawn_budget

        async def review(self):
            gs = list_gaps(self.store, self.kb_id, status="verified")
            for g in gs:
                ag._LLM_CALLS += 1  # Critic's one LLM call
                # Reopen forever — never dead, never rich; only the counter saves us
                reopen_gap(self.store, g.id, coverage="sparse", reason="insufficient")
            return len(gs)

    class FakeSynth:
        def __init__(self, store, *, kb_id, cfg, on_event=None):
            pass

        async def run(self, topic):
            return "partial (kill-switch)", []

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", FakeResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    cfg = get_config()
    monkeypatch.setattr(cfg.society, "max_llm_calls_per_run", 10)  # trip quickly

    res = await loop_mod.run_society(
        "t",
        org_id="local",
        project_id="p",
        kb_id="kb1",
        cfg=cfg,
        n_researchers=2,
        max_rounds=1000,
        max_attempts=99,
        spawn_budget=99,
    )
    # The gaps never converge and max_rounds is effectively unbounded — the ONLY
    # thing that can halt this is the llm_calls() >= max_llm_calls_per_run check.
    assert ag.llm_calls() >= 10
    assert res.rounds < 1000  # stopped far before the round bound
    assert res.report == "partial (kill-switch)"  # Synthesizer still emits a partial

"""TDD tests for qwen8.society.loop — run_society + SocietyResult + bootstrap_society.

Guards tested:
  (a) nominal run completes and returns a SocietyResult with all done gaps
  (b) kill-switch: llm_calls() >= max_llm_calls_per_run halts gracefully
  (c) max_rounds termination
  (d) monotonic progress scalar halts a perpetually-sparse run
  (e) bootstrap_society resolves org/project/kb ids

All role classes and the LLM counter are monkeypatched so no network calls occur.
"""
from __future__ import annotations

import asyncio
import os
import tempfile

import pytest

from qwen8.core.config import get_config
from qwen8.store import get_store
from qwen8.society import loop as loop_mod
from qwen8.society.blackboard import create_gaps, list_gaps


# ---------------------------------------------------------------------------
# Shared fake roles
# ---------------------------------------------------------------------------


class FakePlanner:
    def __init__(self, store, *, org_id, project_id, kb_id, cfg, on_event=None):
        self.store = store
        self.kb_id = kb_id
        self.project_id = project_id

    async def seed(self, topic):
        create_gaps(self.store, self.kb_id, self.project_id, ["q1", "q2"])
        return list_gaps(self.store, self.kb_id, status="open")


class FakeResearcher:
    def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
        self.store = store
        self.kb_id = kb_id
        self.rid = researcher_id

    async def step(self):
        from qwen8.society.blackboard import claim_gap, complete_gap
        g = claim_gap(self.store, self.kb_id, owner=self.rid)
        if g is None:
            return False
        complete_gap(self.store, g.id, ["f1"], coverage="rich", band1_hits=3,
                     status="verified")
        return True


class FakeCritic:
    def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
        self.store = store
        self.kb_id = kb_id
        self.spawn_budget = spawn_budget

    async def review(self):
        gs = list_gaps(self.store, self.kb_id, status="verified")
        for g in gs:
            from qwen8.society.blackboard import complete_gap
            complete_gap(self.store, g.id, g.finding_ids, coverage="rich",
                         band1_hits=3, status="done")
        return len(gs)


class FakeSynth:
    def __init__(self, store, *, kb_id, cfg, on_event=None):
        pass

    async def run(self, topic):
        return "## report\n(finding_id: f1) ok", ["none-dead"]


def _patch_roles(monkeypatch):
    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", FakeResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)


def _make_store(monkeypatch):
    d = tempfile.mkdtemp()
    path = os.path.join(d, "qwen8.db")
    monkeypatch.setenv("QWEN8_DB_PATH", path)
    # Clear cached store so monkeypatched env is used
    from qwen8.store import _local_stores
    _local_stores.clear()
    store = get_store(db_path=path)
    return store, path


# ---------------------------------------------------------------------------
# (a) Nominal run completes, returns populated SocietyResult with done gaps
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_society_terminates_and_returns_result(monkeypatch):
    store, _path = _make_store(monkeypatch)
    _patch_roles(monkeypatch)

    res = await loop_mod.run_society(
        "a topic",
        org_id="local",
        project_id="proj1",
        kb_id="kb1",
        cfg=get_config(),
        n_researchers=2,
        max_rounds=3,
        max_attempts=1,
        spawn_budget=4,
        store=store,
    )

    assert res.topic == "a topic"
    assert res.kb_id == "kb1"
    assert "report" in res.report
    assert res.rounds >= 1
    # All gaps should be done — loop terminated on "no open/claimed/verified"
    statuses = {g.status for g in res.gaps}
    assert statuses == {"done"}, f"unexpected statuses: {statuses}"
    assert len(res.gaps) == 2
    assert isinstance(res.unanswered, list)
    assert isinstance(res.finding_count, int)


# ---------------------------------------------------------------------------
# (b) Kill-switch: llm_calls() >= max_llm_calls_per_run halts gracefully
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_kill_switch_halts_when_llm_calls_exceed_cap(monkeypatch):
    store, _path = _make_store(monkeypatch)

    # A researcher that bumps a counter and never completes gaps (so the loop
    # could run forever) — the kill-switch should cut it short.
    call_count = {"n": 0}

    class SlowResearcher:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.rid = researcher_id

        async def step(self):
            from qwen8.society.blackboard import claim_gap
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            call_count["n"] += 1
            # Don't complete it — leave it claimed so _has_active stays True
            return True

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", SlowResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    # Make llm_calls() return a huge number immediately after reset, simulating
    # a previous high-spend run that should trip the guard.
    import qwen8.core.clients.ai_gateway as gw_mod

    original_llm_calls = gw_mod.llm_calls

    def _over_cap():
        # Return value > max_llm_calls_per_run (120) so the guard trips at round-top
        return 999

    monkeypatch.setattr(gw_mod, "llm_calls", _over_cap)
    monkeypatch.setattr(gw_mod, "reset_llm_calls", lambda: None)

    cfg = get_config()
    res = await loop_mod.run_society(
        "kill-switch topic",
        org_id="local",
        project_id="proj2",
        kb_id="kb2",
        cfg=cfg,
        n_researchers=1,
        max_rounds=10,
        max_attempts=5,
        spawn_budget=10,
        store=store,
    )

    # The loop should have stopped before running researchers (kill-switch at round-top)
    assert res.rounds == 0, f"expected 0 rounds (kill-switch at top), got {res.rounds}"
    assert res.topic == "kill-switch topic"
    assert isinstance(res.report, str)


# ---------------------------------------------------------------------------
# (c) max_rounds termination
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_max_rounds_terminates(monkeypatch):
    store, _path = _make_store(monkeypatch)

    # Researcher claims gaps but never progresses coverage, Critic never closes
    # gaps → loop should hit max_rounds (or the no-progress scalar first).
    class SparseResearcher:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.rid = researcher_id

        async def step(self):
            from qwen8.society.blackboard import claim_gap, complete_gap
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            # Complete as verified (sparse, band1_hits=0) — Critic won't close it as done
            complete_gap(self.store, g.id, [], coverage="sparse", band1_hits=0,
                         status="verified")
            return True

    class NoCritic:
        def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.spawn_budget = spawn_budget

        async def review(self):
            # Reopen all verified gaps so there's always active work
            from qwen8.society.blackboard import reopen_gap
            gs = list_gaps(self.store, self.kb_id, status="verified")
            for g in gs:
                reopen_gap(self.store, g.id, coverage="sparse", reason="insufficient")
            return len(gs)

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", SparseResearcher)
    monkeypatch.setattr(loop_mod, "Critic", NoCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    res = await loop_mod.run_society(
        "max-rounds topic",
        org_id="local",
        project_id="proj3",
        kb_id="kb3",
        cfg=get_config(),
        n_researchers=1,
        max_rounds=2,
        max_attempts=99,
        spawn_budget=0,
        store=store,
    )

    assert res.rounds <= 2, f"expected <= 2 rounds, got {res.rounds}"


# ---------------------------------------------------------------------------
# (d) Monotonic progress scalar halts a perpetually-sparse run
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_progress_scalar_halts(monkeypatch):
    store, _path = _make_store(monkeypatch)

    # Researcher claims + completes as verified (band1_hits=0, sparse)
    # Critic reopens immediately → same state each round → no progress
    class StuckResearcher:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.rid = researcher_id

        async def step(self):
            from qwen8.society.blackboard import claim_gap, complete_gap
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            complete_gap(self.store, g.id, [], coverage="sparse", band1_hits=0,
                         status="verified")
            return True

    class AlwaysReopenCritic:
        def __init__(self, store, *, kb_id, cfg, max_attempts, spawn_budget, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.spawn_budget = spawn_budget

        async def review(self):
            from qwen8.society.blackboard import reopen_gap
            gs = list_gaps(self.store, self.kb_id, status="verified")
            for g in gs:
                reopen_gap(self.store, g.id, coverage="sparse", reason="insufficient")
            return len(gs)

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", StuckResearcher)
    monkeypatch.setattr(loop_mod, "Critic", AlwaysReopenCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    res = await loop_mod.run_society(
        "no-progress topic",
        org_id="local",
        project_id="proj4",
        kb_id="kb4",
        cfg=get_config(),
        n_researchers=1,
        max_rounds=50,   # big limit so only the scalar can stop it
        max_attempts=99,
        spawn_budget=0,
        store=store,
    )

    # The no-progress guard (c) should have fired after 2 rounds at most
    # (first round sets last_progress; second detects no change and stops).
    assert res.rounds <= 3, f"expected <=3 rounds from no-progress guard, got {res.rounds}"


# ---------------------------------------------------------------------------
# (e) bootstrap_society resolves org/project/kb ids
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bootstrap_resolves_project_and_kb(monkeypatch):
    store, _path = _make_store(monkeypatch)

    org_id, project_id, kb_id = loop_mod.bootstrap_society(
        store, project_name="demo", kb_name="demo"
    )
    assert org_id == "local"
    assert project_id
    assert kb_id

    # Calling again with same names returns the SAME ids (idempotent resolve)
    org2, proj2, kb2 = loop_mod.bootstrap_society(
        store, project_name="demo", kb_name="demo"
    )
    assert org2 == org_id
    assert proj2 == project_id
    assert kb2 == kb_id


# ---------------------------------------------------------------------------
# (f) on_event hook receives phase frames
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_on_event_receives_phase_frames(monkeypatch):
    store, _path = _make_store(monkeypatch)
    _patch_roles(monkeypatch)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    res = await loop_mod.run_society(
        "event topic",
        org_id="local",
        project_id="proj5",
        kb_id="kb5",
        cfg=get_config(),
        n_researchers=1,
        max_rounds=3,
        store=store,
        on_event=capture,
    )

    phase_names = [e[0] for e in events]
    assert "phase" in phase_names
    assert "done" in phase_names

    # There should be a seeding and a synthesizing phase
    phase_values = [e[1]["phase"] for e in events if e[0] == "phase"]
    assert "seeding" in phase_values
    assert "synthesizing" in phase_values


# ---------------------------------------------------------------------------
# (g) SocietyResult has all required fields
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_society_result_fields(monkeypatch):
    store, _path = _make_store(monkeypatch)
    _patch_roles(monkeypatch)

    res = await loop_mod.run_society(
        "fields topic",
        org_id="local",
        project_id="proj6",
        kb_id="kb6",
        cfg=get_config(),
        store=store,
    )

    assert hasattr(res, "topic")
    assert hasattr(res, "kb_id")
    assert hasattr(res, "report")
    assert hasattr(res, "unanswered")
    assert hasattr(res, "gaps")
    assert hasattr(res, "rounds")
    assert hasattr(res, "finding_count")
    assert res.topic == "fields topic"
    assert res.kb_id == "kb6"


# ---------------------------------------------------------------------------
# (h) Researcher fault isolation — one researcher raising does not abort the run
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_researcher_failure_is_non_fatal(monkeypatch):
    """A transient exception in one researcher must not abort the round or the run.

    Scenario: 2 researchers, 2 gaps. The first researcher always raises on step();
    the second researcher works normally. The run must complete (return a
    SocietyResult), emit at least one non-fatal error frame, and leave the gaps
    reachable by the Synthesizer.
    """
    store, _path = _make_store(monkeypatch)
    emitted: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        emitted.append((name, data))

    class BrokenResearcher:
        """Always raises after claiming a gap — simulates a 429/network error."""

        def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.rid = researcher_id
            self.researcher_id = researcher_id

        async def step(self):
            from qwen8.society.blackboard import claim_gap
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            raise RuntimeError("simulated 429 / network error")

    # r1 = broken, r2 = working. We need n_researchers=2 so _drain runs both.
    call_count = {"r2_steps": 0}

    class WorkingResearcher:
        def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            self.store = store
            self.kb_id = kb_id
            self.rid = researcher_id

        async def step(self):
            from qwen8.society.blackboard import claim_gap, complete_gap
            g = claim_gap(self.store, self.kb_id, owner=self.rid)
            if g is None:
                return False
            complete_gap(self.store, g.id, ["f1"], coverage="rich", band1_hits=3,
                         status="verified")
            call_count["r2_steps"] += 1
            return True

    # Alternate which class is instantiated based on researcher_id.
    class SelectiveResearcher:
        def __new__(cls, store, *, org_id, project_id, kb_id, cfg, researcher_id, on_event=None):
            if researcher_id == "r1":
                return BrokenResearcher(store, org_id=org_id, project_id=project_id,
                                        kb_id=kb_id, cfg=cfg, researcher_id=researcher_id,
                                        on_event=on_event)
            return WorkingResearcher(store, org_id=org_id, project_id=project_id,
                                     kb_id=kb_id, cfg=cfg, researcher_id=researcher_id,
                                     on_event=on_event)

    monkeypatch.setattr(loop_mod, "Planner", FakePlanner)
    monkeypatch.setattr(loop_mod, "Researcher", SelectiveResearcher)
    monkeypatch.setattr(loop_mod, "Critic", FakeCritic)
    monkeypatch.setattr(loop_mod, "Synthesizer", FakeSynth)

    # Must not raise despite one researcher always failing.
    res = await loop_mod.run_society(
        "fault isolation topic",
        org_id="local",
        project_id="proj7",
        kb_id="kb7",
        cfg=get_config(),
        n_researchers=2,
        max_rounds=3,
        store=store,
        on_event=capture,
    )

    assert isinstance(res, loop_mod.SocietyResult), "run_society must return a result"
    assert res.topic == "fault isolation topic"

    # A non-fatal error frame must have been emitted for the broken researcher.
    error_frames = [(n, d) for n, d in emitted if n == "error" and not d.get("fatal", True)]
    assert error_frames, "expected at least one non-fatal error frame from the broken researcher"

    # The working researcher must have made progress (gaps completed by it or Critic).
    done_gaps = [g for g in res.gaps if g.status == "done"]
    assert done_gaps, "at least one gap should have been completed by the working researcher"

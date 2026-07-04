"""Budget SSE frames — additive frame over the frozen §8.2 set.

Guards:
  (a) one `budget` frame follows every `phase` frame, carrying the phase that
      just finished, its round, and the kill-switch cap;
  (b) `used` mirrors the ai_gateway counter (per-phase deltas = per-role cost,
      exact because phases are sequential) and is non-decreasing;
  (c) `max` is cfg.society.max_llm_calls_per_run.
"""

from __future__ import annotations

import pytest

import queens8.core.clients.ai_gateway as ag
from queens8.core.config import get_config
from queens8.society import loop as loop_mod
from tests.test_loop import (
    FakePlanner,
    FakeResearcher,
    _make_store,
    _patch_roles,
)


async def _run(store, capture) -> None:
    await loop_mod.run_society(
        "t", org_id="local", project_id="p", kb_id="kb1",
        cfg=get_config(), on_event=capture, store=store,
    )


@pytest.mark.asyncio
async def test_budget_frame_follows_every_phase(monkeypatch):
    _patch_roles(monkeypatch)
    store, _ = _make_store(monkeypatch)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    await _run(store, capture)

    phases = [d["phase"] for n, d in events if n == "phase"]
    budgets = [d for n, d in events if n == "budget"]
    assert len(budgets) == len(phases), "one budget frame per phase frame"
    assert [b["phase"] for b in budgets] == phases, "budget carries the finished phase"

    cap = get_config().society.max_llm_calls_per_run
    assert all(b["max"] == cap for b in budgets)
    used = [b["used"] for b in budgets]
    assert used == sorted(used), f"used must be non-decreasing: {used}"
    assert all(b["round"] >= 0 for b in budgets)


class _SpendingPlanner(FakePlanner):
    async def seed(self, topic):
        ag._LLM_CALLS += 3
        return await super().seed(topic)


class _SpendingResearcher(FakeResearcher):
    async def step(self):
        stepped = await super().step()
        if stepped:
            ag._LLM_CALLS += 2
        return stepped


@pytest.mark.asyncio
async def test_budget_used_mirrors_counter_per_phase(monkeypatch):
    _patch_roles(monkeypatch)
    monkeypatch.setattr(loop_mod, "Planner", _SpendingPlanner)
    monkeypatch.setattr(loop_mod, "Researcher", _SpendingResearcher)
    monkeypatch.setattr(ag, "_LLM_CALLS", 0)  # auto-restored after the test
    store, _ = _make_store(monkeypatch)

    events: list[tuple[str, dict]] = []

    async def capture(name: str, data: dict) -> None:
        events.append((name, data))

    await _run(store, capture)

    by_phase = {d["phase"]: d["used"] for n, d in events if n == "budget"}
    assert by_phase["seeding"] == 3, "planner spent 3"
    assert by_phase["researching"] == 7, "two gaps drained at 2 calls each"
    assert by_phase["critiquing"] == 7, "fake critic spends nothing"
    assert by_phase["synthesizing"] == 7, "fake synthesizer spends nothing"

"""Society coordination loop + termination.

    Planner.seed → [round: gather(Researcher.step ×N) → Critic.review] → Synthesizer.run

Termination (after each round) — any ONE of these halts within bounded calls:
  (a) no rows in open/claimed/verified,
  (b) round >= max_rounds,
  (c) a full sweep made no improvement on the monotonic progress scalar
      progress = (#done) * 1000 + Σ band1_hits over open/verified gaps,
  (d) the REAL kill-switch: `ai_gateway.llm_calls() >= cfg.society.max_llm_calls_per_run`
      (a module-level counter incremented around every role + engine LLM call,
      zeroed by `reset_llm_calls()` at the start of each run). Checked both at the
      top of each round and inside the per-researcher drain so a fan-out that
      blows the budget mid-round stops gracefully.
Plus: per-gap `attempts >= max_attempts → dead` (in Critic) and a global spawn_budget.
When the kill-switch trips the loop stops gracefully and the Synthesizer emits a
partial report. There is NO round-count proxy — the counter is the ground truth.

SSE: all 11 frozen frames (§8.2) are emitted via an optional `on_event` hook;
`node_added`/`edge_added` are synthesized from gaps + findings (KG stays OFF).
Additive 12th frame `budget` {used, max, phase, round} follows each finished
phase — phases run sequentially, so frame-to-frame deltas are exact per-role
LLM-call costs (researchers gather concurrently and are reported as one phase).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable

from queens8.society.blackboard import Gap, list_gaps
from queens8.society.roles import Critic, Planner, Researcher, Synthesizer


@dataclass
class SocietyResult:
    topic: str
    kb_id: str
    report: str
    unanswered: list[str]
    gaps: list[Gap]
    rounds: int
    finding_count: int


def bootstrap_society(store, *, project_name: str, kb_name: str) -> tuple[str, str, str]:
    """Resolve (org_id, project_id, kb_id) via the Store seam (org_id='local')."""
    org_id, project_id = store.resolve_project(project_name, create=True)
    kb_id = store.resolve_kb(org_id, project_id, kb_name, create=True)
    return org_id, project_id, kb_id


def _progress(store, kb_id: str) -> int:
    """Monotonic progress scalar: a newly-done gap dominates; band1_hits captures
    within-band gains so a real sparse→still-sparse hit-count gain isn't read as
    'no progress'."""
    gaps = list_gaps(store, kb_id)
    done = sum(1 for g in gaps if g.status == "done")
    band1 = sum(g.band1_hits for g in gaps if g.status in ("open", "verified"))
    return done * 1000 + band1


def _has_active(store, kb_id: str) -> bool:
    gaps = list_gaps(store, kb_id)
    return any(g.status in ("open", "claimed", "verified") for g in gaps)


async def run_society(
    topic: str,
    *,
    org_id: str,
    project_id: str,
    kb_id: str,
    cfg,
    n_researchers: int = 2,
    max_rounds: int = 3,
    max_attempts: int = 1,
    spawn_budget: int = 4,
    on_event: Callable[[str, dict], Awaitable[None]] | None = None,
    store=None,
) -> SocietyResult:
    """Drive the blackboard loop to convergence; return a SocietyResult.

    The live graph IS the blackboard: `node_added`/`edge_added` SSE frames are
    SYNTHESIZED from gaps + findings (the KG stays OFF for the demo). All 11
    frozen frames (§8.2 / docs/sse-frames.md) are emitted via `on_event`; every
    emit is guarded so callers without a hook still work. `store` is the API
    route's resolved SQLiteStore; when None, the cached singleton is resolved so
    a process sharing QUEENS8_DB_PATH lands on the identical DB.
    """
    from queens8.core.clients.ai_gateway import llm_calls, reset_llm_calls
    from queens8.store import get_store

    if store is None:
        store = get_store(db_path=None)

    findings_before = store.count_findings(kb_id)
    max_calls = cfg.society.max_llm_calls_per_run
    reset_llm_calls()  # real per-run kill-switch counter starts at 0

    async def _emit(name: str, data: dict) -> None:
        if on_event:
            await on_event(name, data)

    def _over_budget() -> bool:
        return max_calls is not None and llm_calls() >= max_calls

    async def _emit_budget(phase: str, round_: int) -> None:
        # Additive frame (not in the frozen 11): one per finished phase. Phases
        # run sequentially, so deltas between frames are exact per-role costs.
        await _emit("budget", {"used": llm_calls(), "max": max_calls,
                               "phase": phase, "round": round_})

    try:
        # --- Planner.seed → phase(seeding) + gap_opened/node_added per gap -----
        await _emit("phase", {"phase": "seeding", "round": 0})
        planner = Planner(store, org_id=org_id, project_id=project_id, kb_id=kb_id,
                          cfg=cfg, on_event=on_event)
        await planner.seed(topic)
        await _emit_budget("seeding", 0)

        rounds = 0
        last_progress = -1
        while True:
            if rounds >= max_rounds:
                break
            if not _has_active(store, kb_id):
                break
            if _over_budget():  # kill-switch: stop gracefully, let Synth emit partial
                break

            rounds += 1
            await _emit("phase", {"phase": "researching", "round": rounds})

            researchers = [
                Researcher(store, org_id=org_id, project_id=project_id, kb_id=kb_id,
                           cfg=cfg, researcher_id=f"r{i + 1}", on_event=on_event)
                for i in range(n_researchers)
            ]

            async def _drain(r: Researcher) -> None:
                # Each researcher drains gaps until claim returns None; stop early
                # if the kill-switch trips mid-round. A transient exception in one
                # researcher is non-fatal: emit an error frame and stop this
                # researcher while the others continue.
                try:
                    while not _over_budget() and await r.step():
                        pass
                except Exception as exc:  # noqa: BLE001 — peer failure is non-fatal
                    rid = getattr(r, "researcher_id", "unknown")
                    await _emit("error", {"error": f"researcher {rid}: {exc}", "fatal": False})

            await asyncio.gather(*[_drain(r) for r in researchers])
            await _emit_budget("researching", rounds)

            await _emit("phase", {"phase": "critiquing", "round": rounds})
            critic = Critic(store, kb_id=kb_id, cfg=cfg, max_attempts=max_attempts,
                            spawn_budget=spawn_budget, on_event=on_event)
            await critic.review()
            spawn_budget = critic.spawn_budget  # carry the decremented budget forward
            await _emit_budget("critiquing", rounds)

            # Guard (c): no improvement on the monotonic scalar across a full sweep.
            prog = _progress(store, kb_id)
            if prog == last_progress:
                break
            last_progress = prog

        await _emit("phase", {"phase": "synthesizing", "round": rounds})
        synth = Synthesizer(store, kb_id=kb_id, cfg=cfg, on_event=on_event)
        report, unanswered = await synth.run(topic)
        await _emit_budget("synthesizing", rounds)

        gaps = list_gaps(store, kb_id)
        findings_after = store.count_findings(kb_id)
        gaps_done = sum(1 for g in gaps if g.status == "done")
        gaps_dead = sum(1 for g in gaps if g.status == "dead")
        await _emit("done", {
            "run_id": kb_id,
            "rounds": rounds,
            "finding_count": findings_after - findings_before,
            "gaps_done": gaps_done,
            "gaps_dead": gaps_dead,
        })
        return SocietyResult(
            topic=topic,
            kb_id=kb_id,
            report=report,
            unanswered=unanswered,
            gaps=gaps,
            rounds=rounds,
            finding_count=findings_after - findings_before,
        )
    except Exception as exc:  # noqa: BLE001 — surface a terminal error frame
        await _emit("error", {"error": str(exc), "fatal": True})
        raise

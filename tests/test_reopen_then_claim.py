"""S4: Sharpen-reopen forces researcher re-run (does not short-circuit on rich).

Proves that a 'sharpen' reopen changes the question and forces the Researcher
to re-run exploration instead of short-circuiting at the rich-skip gate
(the 6.3 LOW fix).
"""
from __future__ import annotations

import os
import tempfile

import pytest

from queens8.core.config import get_config
from queens8.core.exploration.models import Finding
from queens8.store import get_store
from queens8.society import roles as roles_mod
from queens8.society.blackboard import claim_gap, complete_gap, create_gaps, reopen_gap


@pytest.mark.asyncio
async def test_sharpen_reopen_reruns_exploration(monkeypatch):
    """File-backed temp DB. Seed a gap, complete it as 'rich', then reopen
    it with reason='sharpen' and a new question. Assert that Researcher.step()
    re-runs exploration (does not short-circuit on rich coverage) and passes
    the new question to run_exploration.
    """
    d = tempfile.mkdtemp()
    store = get_store(db_path=os.path.join(d, "queens8.db"))
    create_gaps(store, "kb1", "proj1", ["Broad question?"])
    g = claim_gap(store, "kb1", owner="r1")
    complete_gap(
        store,
        g.id,
        ["f0"],
        coverage="rich",
        band1_hits=5,
        status="verified",
    )
    # Critic sharpen-reopens: question changes, reason='sharpen', back to open.
    reopen_gap(
        store,
        g.id,
        coverage="rich",
        reason="sharpen",
        question="Narrow question?",
    )

    calls = {"explored": 0, "prompts": []}

    async def fake_run_exploration(prompt, *, exploration_id, project_id, kb_id, cfg, **kw):
        calls["explored"] += 1
        calls["prompts"].append(prompt)
        # Assert the sharpened question is passed, not the broad one
        assert (
            prompt == "Narrow question?"
        ), f"Expected 'Narrow question?', got '{prompt}'"
        return [
            Finding(
                exploration_id=exploration_id,
                project_id=project_id,
                kb=kb_id,
                category="x",
                title="new finding",
                content={"k": "v"},
                confidence=0.8,
            )
        ]

    vec = [0.5] + [0.0] * 1535

    async def fake_embed_text(text):
        return vec

    async def fake_embed_batch(texts):
        return [vec for _ in texts]

    monkeypatch.setattr(roles_mod, "run_exploration", fake_run_exploration)
    monkeypatch.setattr(roles_mod, "embed_text", fake_embed_text)
    monkeypatch.setattr(roles_mod, "embed_batch", fake_embed_batch)

    r = roles_mod.Researcher(
        store,
        org_id="local",
        project_id="proj1",
        kb_id="kb1",
        cfg=get_config(),
        researcher_id="r1",
    )
    did = await r.step()
    assert did is True
    # The rich-skip gate did NOT short-circuit — exploration actually ran.
    assert calls["explored"] == 1, f"Expected 1 exploration, got {calls['explored']}"
    store.close()

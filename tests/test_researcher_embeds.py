"""S4: Researcher embed-to-vec_findings round-trip test.

Proves that findings returned by run_exploration are actually embedded,
inserted into vec_findings, and retrievable via match_findings with correct
banding (criterion 5 / Risk: "researcher findings never embedded").
"""
from __future__ import annotations

import os
import tempfile

import pytest

from queens8.core.config import get_config
from queens8.core.exploration.models import Finding
from queens8.store import get_store
from queens8.society import roles as roles_mod
from queens8.society.blackboard import create_gaps


@pytest.mark.asyncio
async def test_researcher_step_embeds_into_vec_findings(monkeypatch):
    """File-backed temp DB. Mock run_exploration + embed fns. Assert findings
    land embedded in vec_findings via match_findings returning them with
    similarity >= band1_min (proving vectors were inserted).
    """
    d = tempfile.mkdtemp()
    store = get_store(db_path=os.path.join(d, "queens8.db"))
    create_gaps(store, "kb1", "proj1", ["What is the capital of France?"])

    # Engine returns dict-content, UNEMBEDDED Finding objects.
    async def fake_run_exploration(prompt, *, exploration_id, project_id, kb_id, cfg, **kw):
        return [
            Finding(
                exploration_id=exploration_id,
                project_id=project_id,
                kb=kb_id,
                category="geo",
                title="Paris is the capital",
                content={"fact": "Paris is the capital of France"},
                confidence=0.9,
            ),
        ]

    # Deterministic non-zero embedding so vec_distance_cosine yields high
    # similarity for the same query vector (band-1 rich).
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

    # The finding must be searchable: match_findings returns it with high
    # similarity (>= band1_min). This proves vectors were actually inserted
    # into vec_findings.
    hits = await store.match_findings("kb1", vec, 10, 0.0)
    assert len(hits) >= 1
    titles = [h["title"] for h in hits]
    assert "Paris is the capital" in titles
    # cosine of identical normalized vectors ~= 1.0 -> band-1 (>= band1_min
    # default 0.55)
    assert max(h["similarity"] for h in hits) >= get_config().tiers.band1_min
    store.close()

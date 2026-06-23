"""End-to-end test for qwen8.society.loop — the M5 live criterion (criterion 4).

Marked @pytest.mark.live and skipped unless DashScope + Tavily keys are present.
Runs a real open-domain run_society() and asserts:
  - Terminates within max_rounds
  - Report cites findings (grounded synthesis)
  - At least one gap reached done/rich

This test is SKIPPED in CI (no keys), but runs by hand at M5 to verify the whole
pipeline end-to-end.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from qwen8.core.config import get_config
from qwen8.store import get_store
from qwen8.society.loop import bootstrap_society, run_society

_LIVE = bool(os.environ.get("AI_GATEWAY_API_KEY") and os.environ.get("TAVILY_API_KEY"))


@pytest.mark.live
@pytest.mark.skipif(not _LIVE, reason="needs DashScope + Tavily keys")
@pytest.mark.asyncio
async def test_society_end_to_end_real_question():
    """Real open-domain run that produces a cited report and terminates within
    max_rounds and max_llm_calls_per_run.
    """
    d = tempfile.mkdtemp()
    path = os.path.join(d, "qwen8.db")
    os.environ["QWEN8_DB_PATH"] = path
    # Clear cached store so env is used
    from qwen8.store import _local_stores
    _local_stores.clear()
    store = get_store(db_path=path)
    org_id, project_id, kb_id = bootstrap_society(store, project_name="e2e", kb_name="e2e")

    res = await run_society(
        "What is the regulatory and competitive landscape for stablecoin issuers in 2026?",
        org_id=org_id,
        project_id=project_id,
        kb_id=kb_id,
        cfg=get_config(),
        n_researchers=2,
        max_rounds=3,
        max_attempts=1,
        spawn_budget=4,
    )

    # Criterion 4: terminated within max_rounds.
    assert res.rounds <= 3
    # The report cites finding ids (the synthesis is grounded).
    assert "(finding_id:" in res.report
    # Criterion 5: findings persisted; at least one sub-question reached rich/done.
    assert res.finding_count > 0
    assert any(g.status == "done" for g in res.gaps)

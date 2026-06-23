"""TDD tests for synopsis rewire: text_completion replaces langchain chat_model."""

from __future__ import annotations

import os
import tempfile

import pytest


@pytest.mark.asyncio
async def test_build_uses_text_completion_not_langchain(monkeypatch):
    import qwen8.core.agent.synopsis as syn
    from qwen8.core.config import get_config

    captured = {}

    async def fake_text_completion(*, model, system, user, **kw):
        captured["model"] = model
        return 'prose before [{"topic": "X", "gloss": "g"}] prose after'

    monkeypatch.setattr(syn, "text_completion", fake_text_completion)
    out = await syn._build([{"title": "t", "category": "c"}], get_config().synopsis)
    assert out == [{"topic": "X", "gloss": "g"}]
    assert captured["model"] == get_config().synopsis.model  # qwen-flash


def test_no_langchain_import():
    import inspect

    import qwen8.core.agent.synopsis as syn

    src = inspect.getsource(syn)
    assert "chat_model" not in src
    assert "langchain" not in src and "anthropic" not in src


@pytest.mark.asyncio
async def test_maybe_rebuild_synopsis_writes_row():
    """maybe_rebuild_synopsis writes a kb_synopsis row using a file-backed DB."""
    import qwen8.core.agent.synopsis as syn
    from qwen8.core.config import get_config
    from qwen8.store.sqlite import SQLiteStore

    # Use a temp file-backed DB (never :memory:)
    tmp_dir = tempfile.mkdtemp()
    db_path = os.path.join(tmp_dir, "qwen8_test.db")

    store = SQLiteStore(db_path)
    oid, pid = store.resolve_project("test_synopsis", create=True)
    kb = store.resolve_kb(oid, pid, "test_synopsis", create=True)

    # Insert enough findings to trigger a rebuild (>= rebuild_delta=15)
    findings = [
        {
            "kb_id": kb,
            "title": f"Fact {i}",
            "content": f"body {i}",
            "category": "snapshot",
            "confidence": 0.9,
            "tags": [],
            "provenance": [],
        }
        for i in range(20)
    ]
    await store.insert_findings(findings)

    # Monkeypatch text_completion to avoid live API call
    async def fake_text_completion(*, model, system, user, **kw):
        return '[{"topic": "Overview", "gloss": "Key facts about the topic."}]'

    old_tc = syn.text_completion
    syn.text_completion = fake_text_completion  # type: ignore[attr-defined]
    try:
        await syn.maybe_rebuild_synopsis(kb, org_id=oid, store=store)
    finally:
        syn.text_completion = old_tc

    row = store.load_synopsis(kb)
    assert row is not None, "synopsis row should exist after rebuild"
    content = row.get("content") or []
    assert len(content) >= 1, f"expected at least 1 entry, got {content}"

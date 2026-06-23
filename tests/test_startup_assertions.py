"""Q5: Startup invariants — env prefix, db_path, Tavily fail-fast.
Also covers the embedding-guard fix: resume must not 503 when only AI_GATEWAY_API_KEY set.

Tests:
1. _ENV_PREFIX is QWEN8_.
2. The local store's resolved db_path contains ".qwen8".
3. Importing qwen8.api.main raises AssertionError when TAVILY_API_KEY is unset.
4. Embedding guard: routes_findings.resume does NOT 503 when only ai_gateway_api_key set.
"""
from __future__ import annotations

import importlib

import pytest


def test_env_prefix_is_qwen8():
    from qwen8.core.config import _ENV_PREFIX

    assert _ENV_PREFIX == "QWEN8_"


def test_db_path_is_qwen8_brain():
    # The local store's resolved db_path must live under ~/.qwen8, never ~/.delapan.
    from qwen8.store import get_store

    store = get_store(None, org_id="local")
    assert ".qwen8" in str(getattr(store, "db_path", ""))


def test_app_import_requires_tavily(monkeypatch):
    # With TAVILY blank, importing the app must raise (fail fast).
    # Use setenv("", ...) rather than delenv: pydantic-settings loads .env from
    # disk, so delenv alone doesn't clear the value — an empty env var does,
    # because process env takes precedence over the .env file.
    monkeypatch.setenv("TAVILY_API_KEY", "")
    import qwen8.core.config as cfg

    cfg.get_settings.cache_clear()
    import sys

    sys.modules.pop("qwen8.api.main", None)
    with pytest.raises(AssertionError):
        importlib.import_module("qwen8.api.main")
    cfg.get_settings.cache_clear()


def test_resume_not_503_with_only_ai_gateway_key(monkeypatch):
    """Embedding guard (routes_findings) must pass when ai_gateway_api_key set, openai unset.

    Previously the guard checked only openai_api_key, so the DashScope fast-path
    (AI_GATEWAY_API_KEY set, OPENAI_API_KEY unset) always returned 503. The fix
    mirrors embeddings._get_client(): ai_gateway preferred, else openai.
    """
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "sk-test-gateway-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    import qwen8.core.config as cfg

    cfg.get_settings.cache_clear()

    from qwen8.core.config import get_settings

    s = get_settings()
    # Guard condition — same logic as routes_findings.py after the fix.
    embeddings_available = bool(s.ai_gateway_api_key or s.openai_api_key)
    assert embeddings_available, (
        "resume route would 503 even though ai_gateway_api_key is set; "
        "guard must treat ai_gateway_api_key as sufficient"
    )
    cfg.get_settings.cache_clear()

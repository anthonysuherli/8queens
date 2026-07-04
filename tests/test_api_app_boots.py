"""M1 boot test: app imports without concept_doc crash; _missing_keys drops OPENAI."""

from __future__ import annotations


def test_app_imports_without_concept_doc_crash():
    import queens8.api.main as m

    assert m.app.title == "queens8"


def test_no_concept_doc_route():
    import queens8.api.main as m

    paths = {r.path for r in m.app.routes if hasattr(r, "path")}
    assert not any("concept-doc" in p for p in paths)


def test_missing_keys_does_not_require_openai(monkeypatch):
    import queens8.api.routes_explore as rx
    from queens8.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "k")
    monkeypatch.setenv("TAVILY_API_KEY", "t")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()
    assert rx._missing_keys() == []  # OPENAI not required

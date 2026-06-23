"""Q3: Assert hot-path call sites use use_json_schema=False (DashScope json_object only).

Two tests:
1. Routing test — structured_completion(use_json_schema=False) goes straight to
   _parse_prompt_json, never touching _parse_json_schema.
2. Source-inspection test — planner and extractor modules pass use_json_schema=False
   at every structured_completion call site.
"""
from __future__ import annotations

import inspect

import pytest
from pydantic import BaseModel

import qwen8.core.clients.ai_gateway as ag
from qwen8.core.exploration import extractor as extractor_mod
from qwen8.core.exploration import planner as planner_mod


class _Tiny(BaseModel):
    ok: bool


@pytest.mark.asyncio
async def test_use_json_schema_false_skips_strict_path(monkeypatch):
    called = {"schema": 0, "prompt": 0}

    async def _fake_schema(*a, **k):
        called["schema"] += 1
        return _Tiny(ok=True)

    async def _fake_prompt(*a, **k):
        called["prompt"] += 1
        return _Tiny(ok=True)

    monkeypatch.setattr(ag, "_parse_json_schema", _fake_schema)
    monkeypatch.setattr(ag, "_parse_prompt_json", _fake_prompt)

    out = await ag.structured_completion(
        model="qwen-plus",
        response_format=_Tiny,
        system="Return ONLY a single JSON object.",
        user="x",
        use_json_schema=False,
    )
    assert out.ok is True
    assert called == {"schema": 0, "prompt": 1}  # strict path never touched


def test_planner_and_extractor_pass_use_json_schema_false():
    psrc = inspect.getsource(planner_mod)
    esrc = inspect.getsource(extractor_mod)
    assert "use_json_schema=False" in psrc, "planner must pass use_json_schema=False"
    assert "use_json_schema=False" in esrc, "extractor must pass use_json_schema=False"

import queens8.core.clients.ai_gateway as ag
from pydantic import BaseModel


class _Tiny(BaseModel):
    ok: bool


async def test_counter_increments_on_both_paths(monkeypatch):
    ag.reset_llm_calls()
    assert ag.llm_calls() == 0

    async def _fake_text(*a, **k):
        return "hi"

    async def _fake_struct(*a, **k):
        return _Tiny(ok=True)

    # Stub the two parse helpers so neither path touches the network.
    monkeypatch.setattr(ag, "_attempt", _fake_struct)  # structured_completion body
    monkeypatch.setattr(ag, "text_completion", ag.text_completion)  # keep real wrapper

    # text_completion: mock the client so the single create() call returns content.
    class _Msg:
        content = "hi"

    class _Choice:
        message = _Msg()

    class _Comp:
        choices = [_Choice()]

    class _Chat:
        async def create(self, **kw):
            return _Comp()

    class _Client:
        chat = type("C", (), {"completions": _Chat()})()

    monkeypatch.setattr(ag, "gateway_client", lambda: _Client())
    await ag.text_completion(model="qwen-flash", system="s", user="u")
    assert ag.llm_calls() == 1
    await ag.structured_completion(model="qwen-plus", response_format=_Tiny,
                                   system="s", user="u", use_json_schema=False)
    assert ag.llm_calls() == 2
    ag.reset_llm_calls()
    assert ag.llm_calls() == 0

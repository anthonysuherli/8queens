import qwen8.core.clients.embeddings as emb_mod


class _FakeData:
    def __init__(self, index, embedding):
        self.index = index
        self.embedding = embedding


class _FakeResp:
    def __init__(self, n_offset, n):
        self.data = [_FakeData(i, [float(n_offset + i)] * 4) for i in range(n)]


class _FakeEmbeddings:
    def __init__(self):
        self.calls = []

    async def create(self, *, model, input, dimensions):
        self.calls.append(len(input))
        return _FakeResp(sum(self.calls[:-1]), len(input))


class _FakeClient:
    def __init__(self):
        self.embeddings = _FakeEmbeddings()


async def test_embed_batch_chunks_at_10(monkeypatch):
    fake = _FakeClient()
    monkeypatch.setattr(emb_mod, "_get_client", lambda: fake)
    out = await emb_mod.embed_batch([f"t{i}" for i in range(25)])
    assert len(out) == 25
    assert fake.embeddings.calls == [10, 10, 5]  # ≤10 per call, input order preserved

# OKF concept-doc reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, OKF-style concept-doc reader drawer to the delapan-fe control panel that renders any knowledge-graph entity as a frontmatter + markdown document, with a hybrid body (deterministic by default, optional one-pass LLM synthesis cached into node properties).

**Architecture:** The reader is a derived view over data already on the client (graphology node attrs, edges, cached findings). Deterministic assembly is pure frontend (`src/okf/conceptDoc.ts`). Synthesis adds one backend endpoint (`POST …/graph/nodes/{id}/concept-doc`) that runs `text_completion` and returns prose; the frontend persists that prose into the node's `properties` under an `okf_` namespace via the existing node-PATCH pipeline. A shared FNV-1a `grounded_hash` detects staleness.

**Tech Stack:** Backend — Python 3.11, FastAPI, pydantic, AI Gateway (`openai` SDK), pytest. Frontend — React 18 + TypeScript (strict), Zustand, graphology/sigma.js, Vitest.

**Spec:** `frontend/docs/superpowers/specs/2026-06-21-okf-concept-doc-reader-design.md`

## Global Constraints

- **Repos:** frontend work in `frontend/` (git repo, branch `main`); backend work in `backend/` (git repo, branch `master`; symlink to `~/projects/delapan`). The parent `delapan-ai/` is **not** a git repo. All commands below assume cwd = `delapan-ai/`.
- **`grounded_hash` MUST be byte-identical across languages.** Algorithm: FNV-1a 32-bit (offset `0x811c9dc5`, prime `0x01000193`) over the UTF-8 bytes of the sorted finding ids joined with `,`, rendered as 8-char lowercase hex. Verified vectors (use these in tests): `["f01","f25"]` → `f6fd8219`; `["f25","f01"]` → `f6fd8219`; `["a","b","c"]` → `7a8f5e87`; `[]` → `811c9dc5`; `["x"]` → `fd0c5087`.
- **Never hardcode a knob.** The synthesis model/temperature/max_tokens live in an `okf` config section, overridable via `config.yaml` and `DLP_OKF__*`.
- **Cached prose lives only in node `properties`** under keys `okf_doc`, `okf_doc_description`, `okf_doc_model`, `okf_doc_built_at`, `okf_doc_grounded_hash`. These keys are hidden from the Properties section of the doc.
- **Read-only / derived.** The reader never writes findings or edges; the only write it triggers is persisting the `okf_*` properties after synthesis (through the existing PATCH command, so it rides undo/redo).
- **Mock parity is mandatory.** Any endpoint added to `src/api/client.ts` gets a matching `src/api/mock.ts` implementation.
- **Style:** backend uses `from __future__ import annotations`, type hints, ruff line-length 100. Frontend is TS strict (`noUnusedLocals`/`noUnusedParameters`) — no unused imports/bindings; `npm run build` is the type-check gate.

### Before you start — branch each repo

```bash
git -C frontend checkout -b feat/okf-concept-doc-reader
git -C backend  checkout -b feat/okf-concept-doc
```

---

### Task 1: OKF config knob (backend)

**Files:**
- Modify: `backend/delapan/core/config.py` (add `OKFConfig`; register on `AppConfig`)
- Modify: `backend/config.yaml` (add `okf:` block)
- Test: `backend/tests/test_okf_config.py`

**Interfaces:**
- Produces: `delapan.core.config.OKFConfig` with `model: str`, `temperature: float`, `max_tokens: int`; reachable as `get_config().okf`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_okf_config.py`:

```python
from delapan.core.config import AppConfig, OKFConfig


def test_okf_defaults_present():
    cfg = AppConfig()
    assert cfg.okf.model == "anthropic/claude-sonnet-4.6"
    assert cfg.okf.temperature == 0.3
    assert cfg.okf.max_tokens == 900


def test_okf_config_is_a_model():
    okf = OKFConfig(model="x/y", temperature=0.1, max_tokens=100)
    assert okf.model == "x/y"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd backend && pytest tests/test_okf_config.py -v)`
Expected: FAIL with `ImportError: cannot import name 'OKFConfig'`.

- [ ] **Step 3: Add `OKFConfig` and register it**

In `backend/delapan/core/config.py`, add this class immediately after `class NarrationConfig(BaseModel):` block (near line 291):

```python
class OKFConfig(BaseModel):
    """OKF concept-doc synthesis: one gateway pass that rewrites an entity's
    grounded findings into a readable prose document. Model is an AI Gateway
    dot slug."""

    model: str = "anthropic/claude-sonnet-4.6"
    temperature: float = 0.3
    max_tokens: int = 900
```

Then in `class AppConfig(BaseModel):` (near line 388, after the `concepts` field), add:

```python
    okf: OKFConfig = Field(default_factory=OKFConfig)
```

- [ ] **Step 4: Add the `okf:` block to `config.yaml`**

Append to `backend/config.yaml` (after the `narration:` block):

```yaml
# OKF concept-doc synthesis: one gateway pass that rewrites an entity's grounded
# findings into a readable prose document — the reader's "synthesize" action.
# Prose quality matters here, so this is NOT the cheap narration model.
okf:
  model: anthropic/claude-sonnet-4.6   # gateway dot-slug
  temperature: 0.3
  max_tokens: 900
```

- [ ] **Step 5: Run test to verify it passes**

Run: `(cd backend && pytest tests/test_okf_config.py -v)`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git -C backend add delapan/core/config.py config.yaml tests/test_okf_config.py
git -C backend commit -m "feat(okf): add okf config section for concept-doc synthesis"
```

---

### Task 2: concept-doc synthesis core (backend)

**Files:**
- Create: `backend/delapan/core/agent/concept_doc.py`
- Test: `backend/tests/test_concept_doc.py`

**Interfaces:**
- Consumes: `get_config().okf` (Task 1); `text_completion` from `delapan.core.clients.ai_gateway`; `read_graph` from `delapan.core.knowledge_graph.service`; `Store.get_kg_node(kb_id, node_id) -> dict | None`, `Store.get_finding(kb_id, fid) -> dict`.
- Produces:
  - `grounded_hash(ids: list[str]) -> str`
  - `async synthesize_concept_doc(store, kb_id: str, node_id: str) -> dict` returning keys `description, body_markdown, model, built_at, grounded_hash`. Raises `LookupError(node_id)` when the node is absent.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_concept_doc.py`:

```python
import pytest

from delapan.core.agent import concept_doc


def test_grounded_hash_known_vectors():
    assert concept_doc.grounded_hash(["f01", "f25"]) == "f6fd8219"
    assert concept_doc.grounded_hash(["f25", "f01"]) == "f6fd8219"  # order-independent
    assert concept_doc.grounded_hash(["a", "b", "c"]) == "7a8f5e87"
    assert concept_doc.grounded_hash([]) == "811c9dc5"


class _FakeStore:
    def get_kg_node(self, kb_id, node_id):
        if node_id == "missing":
            return None
        return {"id": node_id, "type": "concept", "label": "CSM",
                "properties": {}, "grounded_in": ["f1"], "created_at": "2026-06-18T00:00:00Z"}

    def get_finding(self, kb_id, fid):
        return {"id": fid, "title": "CSM is unearned profit",
                "content": {"fact": "deferred to P&L"}, "confidence": 0.9}


@pytest.mark.asyncio
async def test_synthesize_shape(monkeypatch):
    async def fake_completion(**kwargs):
        return "The unearned profit under IFRS 17.\n---\n## Overview\nThe CSM defers gains."

    monkeypatch.setattr(concept_doc, "text_completion", fake_completion)
    monkeypatch.setattr(concept_doc, "read_graph", lambda *a, **k: {"nodes": [], "edges": []})

    doc = await concept_doc.synthesize_concept_doc(_FakeStore(), "kb", "n1")
    assert doc["description"] == "The unearned profit under IFRS 17."
    assert doc["body_markdown"].startswith("## Overview")
    assert doc["grounded_hash"] == concept_doc.grounded_hash(["f1"])
    assert doc["model"]  # came from config
    assert doc["built_at"]


@pytest.mark.asyncio
async def test_synthesize_missing_node(monkeypatch):
    monkeypatch.setattr(concept_doc, "read_graph", lambda *a, **k: {"nodes": [], "edges": []})
    with pytest.raises(LookupError):
        await concept_doc.synthesize_concept_doc(_FakeStore(), "kb", "missing")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd backend && pytest tests/test_concept_doc.py -v)`
Expected: FAIL with `ModuleNotFoundError: No module named 'delapan.core.agent.concept_doc'`.

- [ ] **Step 3: Write the implementation**

Create `backend/delapan/core/agent/concept_doc.py`:

```python
"""OKF concept-doc synthesis: an entity's grounded findings + relations → a
readable prose document, via one AI-Gateway pass.

    node + grounded findings + 1-hop relations ─► text_completion ─► {description, body}

`grounded_hash` is the staleness key shared verbatim with the frontend
(`src/okf/conceptDoc.ts`): FNV-1a 32-bit over the sorted, comma-joined grounded
finding ids. The reader recomputes it to tell whether a cached doc still matches
the node's evidence.
"""

from __future__ import annotations

from datetime import datetime, timezone

from delapan.core.clients.ai_gateway import text_completion
from delapan.core.config import get_config
from delapan.core.knowledge_graph.service import read_graph
from delapan.store import Store

_SYSTEM = """\
You write encyclopedia-style concept documents for a knowledge base. Given an \
entity, its known facts (findings), and its relationships, write a clear, neutral \
article. Ground every statement ONLY in the supplied findings — invent nothing and \
cite no source that was not given. Output exactly two parts separated by a line \
containing only '---':
1) a single-sentence description (plain text, no markdown),
2) the article body in markdown (use ## headings and short paragraphs; no \
frontmatter, no title)."""


def grounded_hash(ids: list[str]) -> str:
    """FNV-1a 32-bit hex over the sorted, comma-joined ids. MUST match the TS
    `groundedHash` in delapan-fe."""
    key = ",".join(sorted(ids)).encode("utf-8")
    h = 0x811C9DC5
    for b in key:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def _finding_brief(f: dict) -> str:
    return f"- {f.get('title', '')}: {f.get('content', '')}"


async def synthesize_concept_doc(store: Store, kb_id: str, node_id: str) -> dict:
    """One gateway pass over a node's grounded findings + 1-hop relations.

    Returns {description, body_markdown, model, built_at, grounded_hash}.
    Raises LookupError(node_id) when the node is absent. The caller gates on the
    LLM key and maps exceptions to HTTP status."""
    node = store.get_kg_node(kb_id, node_id)
    if node is None:
        raise LookupError(node_id)

    grounded = node.get("grounded_in") or []
    findings: list[dict] = []
    for fid in grounded:
        try:
            findings.append(store.get_finding(kb_id, fid))
        except Exception:  # noqa: BLE001 — a missing finding simply isn't briefed
            continue

    graph = read_graph(store, kb_id, focus=node_id, depth=1)
    label_by_id = {n.get("id"): n.get("label") for n in graph.get("nodes") or []}
    rels: list[str] = []
    for e in graph.get("edges") or []:
        src, tgt, rel = e.get("source_node_id"), e.get("target_node_id"), e.get("relation")
        if src == node_id and tgt in label_by_id:
            rels.append(f"{node.get('label')} {rel} {label_by_id[tgt]}")
        elif tgt == node_id and src in label_by_id:
            rels.append(f"{label_by_id[src]} {rel} {node.get('label')}")

    user = (
        f"Entity: {node.get('label')} (type: {node.get('type')})\n\n"
        "Findings:\n"
        + ("\n".join(_finding_brief(f) for f in findings) or "(none)")
        + "\n\nRelationships:\n"
        + ("\n".join(f"- {r}" for r in rels) or "(none)")
    )

    cfg = get_config().okf
    raw = await text_completion(
        model=cfg.model,
        system=_SYSTEM,
        user=user,
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )
    description, sep, body = raw.partition("\n---\n")
    if not sep:  # model skipped the separator — treat the whole reply as body
        description, body = "", raw
    return {
        "description": description.strip(),
        "body_markdown": body.strip(),
        "model": cfg.model,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "grounded_hash": grounded_hash(grounded),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `(cd backend && pytest tests/test_concept_doc.py -v)`
Expected: PASS (4 passed). If `test_synthesize_*` error with "async def not natively supported", confirm `pytest-asyncio` is installed (it is via `.[dev]`) and that the repo's `pyproject.toml` sets `asyncio_mode = "auto"`; if not, the `@pytest.mark.asyncio` markers above handle it.

- [ ] **Step 5: Commit**

```bash
git -C backend add delapan/core/agent/concept_doc.py tests/test_concept_doc.py
git -C backend commit -m "feat(okf): concept-doc synthesis + shared grounded_hash"
```

---

### Task 3: concept-doc endpoint (backend)

**Files:**
- Modify: `backend/delapan/api/routes_kg.py` (add the POST route + imports)
- Test: `backend/tests/test_route_concept_doc.py`

**Interfaces:**
- Consumes: `synthesize_concept_doc` (Task 2); `resolve_kb_or_404`; `get_settings().ai_gateway_api_key`.
- Produces: `POST /api/projects/{project}/kbs/{kb}/graph/nodes/{node_id}/concept-doc` → `200 {description, body_markdown, model, built_at, grounded_hash}`; `503 {"error": "llm unavailable"}` when no AI Gateway key; `404` when the node is absent.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_route_concept_doc.py`:

```python
from types import SimpleNamespace

from fastapi.testclient import TestClient

from delapan.api import routes_kg
from delapan.api.main import app

URL = "/api/projects/p/kbs/k/graph/nodes/n1/concept-doc"


def test_concept_doc_503_without_key(monkeypatch):
    monkeypatch.setattr(routes_kg, "get_settings", lambda: SimpleNamespace(ai_gateway_api_key=None))
    res = TestClient(app).post(URL)
    assert res.status_code == 503
    assert res.json() == {"error": "llm unavailable"}


def test_concept_doc_200(monkeypatch):
    monkeypatch.setattr(routes_kg, "get_settings", lambda: SimpleNamespace(ai_gateway_api_key="k"))
    monkeypatch.setattr(
        routes_kg, "resolve_kb_or_404",
        lambda project, kb: (SimpleNamespace(kb_id="kb", org_id="o"), object()),
    )

    async def fake_synth(store, kb_id, node_id):
        return {"description": "d", "body_markdown": "## b", "model": "m",
                "built_at": "2026-06-21T00:00:00Z", "grounded_hash": "f6fd8219"}

    monkeypatch.setattr(routes_kg, "synthesize_concept_doc", fake_synth)
    res = TestClient(app).post(URL)
    assert res.status_code == 200
    assert res.json()["grounded_hash"] == "f6fd8219"


def test_concept_doc_404(monkeypatch):
    monkeypatch.setattr(routes_kg, "get_settings", lambda: SimpleNamespace(ai_gateway_api_key="k"))
    monkeypatch.setattr(
        routes_kg, "resolve_kb_or_404",
        lambda project, kb: (SimpleNamespace(kb_id="kb", org_id="o"), object()),
    )

    async def fake_synth(store, kb_id, node_id):
        raise LookupError(node_id)

    monkeypatch.setattr(routes_kg, "synthesize_concept_doc", fake_synth)
    res = TestClient(app).post(URL)
    assert res.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd backend && pytest tests/test_route_concept_doc.py -v)`
Expected: FAIL — the POST returns 405/404 (route not registered) so the assertions fail.

- [ ] **Step 3: Add the route**

In `backend/delapan/api/routes_kg.py`, add imports near the top (after the existing `from fastapi import ...` line):

```python
from fastapi.responses import JSONResponse

from delapan.core.agent.concept_doc import synthesize_concept_doc
```

Then add this route at the end of the node-mutations section (after `delete_node`, before the edge section):

```python
@router.post("/nodes/{node_id}/concept-doc")
async def concept_doc(project: str, kb: str, node_id: str) -> JSONResponse:
    if not get_settings().ai_gateway_api_key:
        return JSONResponse(status_code=503, content={"error": "llm unavailable"})
    ctx, store = resolve_kb_or_404(project, kb)
    try:
        doc = await synthesize_concept_doc(store, ctx.kb_id, node_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=f"node not found: {node_id}") from exc
    return JSONResponse(doc)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `(cd backend && pytest tests/test_route_concept_doc.py -v)`
Expected: PASS (3 passed).

- [ ] **Step 5: Full backend gate**

Run: `(cd backend && pytest tests/test_okf_config.py tests/test_concept_doc.py tests/test_route_concept_doc.py -v && ruff check delapan/core/agent/concept_doc.py delapan/api/routes_kg.py delapan/core/config.py)`
Expected: all tests PASS, ruff reports no errors.

- [ ] **Step 6: Commit**

```bash
git -C backend add delapan/api/routes_kg.py tests/test_route_concept_doc.py
git -C backend commit -m "feat(okf): POST graph/nodes/{id}/concept-doc endpoint"
```

---

### Task 4: markdown subset renderer (frontend)

**Files:**
- Create: `frontend/src/okf/markdown.ts`
- Test: `frontend/src/okf/markdown.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(src: string): string` — returns sanitized HTML. HTML in the input is escaped first; only headings, bold, italic, inline code, fenced code, links (`http`/`https`/`mailto` only, `target="_blank" rel="noreferrer"`), and ordered/unordered lists are emitted.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/okf/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings and paragraphs", () => {
    const html = renderMarkdown("## Title\n\nHello world.");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<p>Hello world.</p>");
  });

  it("renders bold, italic, and inline code", () => {
    const html = renderMarkdown("a **b** c *d* e `f`");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>d</em>");
    expect(html).toContain("<code>f</code>");
  });

  it("renders safe links and drops javascript: urls", () => {
    expect(renderMarkdown("[ok](https://x.com)")).toContain('href="https://x.com"');
    expect(renderMarkdown("[ok](https://x.com)")).toContain('rel="noreferrer"');
    expect(renderMarkdown("[bad](javascript:alert(1))")).not.toContain("javascript:");
  });

  it("escapes raw HTML in the source", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd frontend && npx vitest run src/okf/markdown.test.ts)`
Expected: FAIL — cannot resolve `./markdown`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/okf/markdown.ts`:

```ts
/**
 * Compact, dependency-free markdown→sanitized-HTML renderer for the OKF reader.
 * The source is HTML-escaped FIRST, then a small block/inline grammar reintroduces
 * a known, safe tag set — so LLM prose (untrusted) can never inject markup.
 * Supported: #..###### headings, **bold**, *italic*, `code`, ```fences```,
 * [text](url) links (http/https/mailto only), and -, *, 1. lists.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHref(url: string): string | null {
  const u = url.trim();
  return /^(https?:|mailto:)/i.test(u) ? u : null;
}

/** Inline pass. `text` is already HTML-escaped. */
function inline(text: string): string {
  let out = text.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

const BLOCK_START = /^(#{1,6})\s|^\s*[-*]\s|^\s*\d+\.\s|^```/;

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src ?? "").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      html.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i += 1;
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeList();
      i += 1;
      continue;
    }

    closeList();
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !BLOCK_START.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  closeList();
  return html.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `(cd frontend && npx vitest run src/okf/markdown.test.ts)`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C frontend add src/okf/markdown.ts src/okf/markdown.test.ts
git -C frontend commit -m "feat(okf): compact sanitizing markdown renderer"
```

---

### Task 5: concept-doc builder (frontend)

**Files:**
- Create: `frontend/src/okf/conceptDoc.ts`
- Test: `frontend/src/okf/conceptDoc.test.ts`

**Interfaces:**
- Consumes: `graph` from `../graph/graphStore`; `Finding` from `../api/types`; `FindingCacheEntry` (type) from `../state/store`.
- Produces:
  - `groundedHash(ids: string[]): string` (FNV-1a, matches backend)
  - `buildConceptDoc(nodeId: string, findingCache: Record<string, FindingCacheEntry>): ConceptDoc | null`
  - exported types `ConceptDoc`, `ConceptDocFrontmatter`, `ConceptDocRelation`, `ConceptDocFindingBlock`, `ConceptDocSource`, `ConceptDocProse`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/okf/conceptDoc.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { graph } from "../graph/graphStore";
import type { Finding } from "../api/types";
import type { FindingCacheEntry } from "../state/store";
import { buildConceptDoc, groundedHash } from "./conceptDoc";

function addNode(id: string, nodeType: string, label: string, grounded: string[], properties: Record<string, unknown> = {}) {
  graph.addNode(id, {
    label, nodeType, properties, grounded_in: grounded, created_at: "2026-06-18T00:00:00Z",
    x: 0, y: 0, size: 4, color: "#fff",
  });
}

function ready(f: Finding): FindingCacheEntry {
  return { status: "ready", data: f };
}

const F1: Finding = {
  id: "f1", title: "CSM is unearned profit", content: "Day-one gains are deferred. More detail.",
  category: "ifrs17", confidence: 0.9, tags: ["ifrs17", "profit"],
  provenance: [{ url: "https://ifrs.org/a", domain: "ifrs.org", query: "csm" }], created_at: "2026-06-18T00:00:00Z",
};

beforeEach(() => graph.clear());

describe("groundedHash", () => {
  it("matches the shared FNV-1a vectors", () => {
    expect(groundedHash(["f01", "f25"])).toBe("f6fd8219");
    expect(groundedHash(["f25", "f01"])).toBe("f6fd8219");
    expect(groundedHash(["a", "b", "c"])).toBe("7a8f5e87");
    expect(groundedHash([])).toBe("811c9dc5");
  });
});

describe("buildConceptDoc", () => {
  it("maps frontmatter, findings, sources and related (both directions)", () => {
    addNode("a", "concept", "Contractual service margin", ["f1"]);
    addNode("b", "concept", "Variable fee approach", []);
    addNode("c", "concept", "Insurance contract", []);
    graph.addEdgeWithKey("e1", "a", "b", { label: "measured under", relation: "measured under", properties: {}, grounded_in: [], created_at: "", size: 1, color: "#fff" });
    graph.addEdgeWithKey("e2", "c", "a", { label: "contains", relation: "contains", properties: {}, grounded_in: [], created_at: "", size: 1, color: "#fff" });

    const doc = buildConceptDoc("a", { f1: ready(F1) })!;
    expect(doc.frontmatter.type).toBe("concept");
    expect(doc.frontmatter.title).toBe("Contractual service margin");
    expect(doc.frontmatter.tags).toEqual(["ifrs17", "profit"]);
    expect(doc.frontmatter.resource).toBe("https://ifrs.org/a");
    expect(doc.findings).toHaveLength(1);
    expect(doc.sources).toHaveLength(1);
    const rels = doc.related.map((r) => `${r.direction}:${r.relation}:${r.neighborId}`);
    expect(rels).toContain("out:measured under:b");
    expect(rels).toContain("in:contains:c");
  });

  it("hides okf_ properties and reports staleness", () => {
    addNode("a", "concept", "X", ["f1"], { topic: "keep", okf_doc: "## body", okf_doc_grounded_hash: groundedHash(["f1"]) });
    const fresh = buildConceptDoc("a", { f1: ready(F1) })!;
    expect(Object.keys(fresh.properties)).toEqual(["topic"]);
    expect(fresh.prose).not.toBeNull();
    expect(fresh.stale).toBe(false);

    graph.setNodeAttribute("a", "properties", { okf_doc: "## body", okf_doc_grounded_hash: "deadbeef" });
    const stale = buildConceptDoc("a", { f1: ready(F1) })!;
    expect(stale.stale).toBe(true);
  });

  it("returns null for an unknown node", () => {
    expect(buildConceptDoc("nope", {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd frontend && npx vitest run src/okf/conceptDoc.test.ts)`
Expected: FAIL — cannot resolve `./conceptDoc`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/okf/conceptDoc.ts`:

```ts
/**
 * Pure derivation: one knowledge-graph entity → an OKF concept document.
 * Reads the module-level graphology instance plus a snapshot of the finding
 * cache; introduces no IO. The reader component renders the returned shape.
 */

import type { Finding } from "../api/types";
import { graph } from "../graph/graphStore";
import type { FindingCacheEntry } from "../state/store";

export interface ConceptDocFrontmatter {
  type: string;
  title: string;
  description: string;
  tags: string[];
  resource: string | null;
  timestamp: string;
  id: string;
}

export interface ConceptDocRelation {
  relation: string;
  direction: "out" | "in";
  neighborId: string;
  neighborLabel: string;
  neighborType: string;
}

export interface ConceptDocFindingBlock {
  id: string;
  title: string;
  content: string;
  confidence: number;
  domains: string[];
}

export interface ConceptDocSource {
  url: string;
  domain: string;
  query: string;
}

export interface ConceptDocProse {
  description: string;
  bodyMarkdown: string;
  model: string;
  builtAt: string;
  groundedHash: string;
}

export interface ConceptDoc {
  frontmatter: ConceptDocFrontmatter;
  properties: Record<string, unknown>;
  findings: ConceptDocFindingBlock[];
  related: ConceptDocRelation[];
  sources: ConceptDocSource[];
  prose: ConceptDocProse | null;
  stale: boolean;
}

/** FNV-1a 32-bit hex over the sorted, comma-joined ids. MUST match the Python
 * `grounded_hash` in delapan (core/agent/concept_doc.py). */
export function groundedHash(ids: string[]): string {
  const key = [...ids].sort().join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function ledeSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const m = clean.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : clean).trim().slice(0, 240);
}

export function buildConceptDoc(
  nodeId: string,
  findingCache: Record<string, FindingCacheEntry>,
): ConceptDoc | null {
  if (!graph.hasNode(nodeId)) return null;
  const a = graph.getNodeAttributes(nodeId);
  const groundedIds = a.grounded_in;

  const readyFindings: Finding[] = groundedIds
    .map((id) => findingCache[id])
    .filter((e): e is { status: "ready"; data: Finding } => !!e && e.status === "ready")
    .map((e) => e.data);

  const findings: ConceptDocFindingBlock[] = readyFindings.map((f) => ({
    id: f.id,
    title: f.title,
    content: f.content,
    confidence: f.confidence,
    domains: [...new Set(f.provenance.map((p) => p.domain))],
  }));

  const tags = [...new Set(readyFindings.flatMap((f) => f.tags))];

  const sourceMap = new Map<string, ConceptDocSource>();
  for (const f of readyFindings) {
    for (const p of f.provenance) {
      if (!sourceMap.has(p.url)) sourceMap.set(p.url, { url: p.url, domain: p.domain, query: p.query });
    }
  }
  const sources = [...sourceMap.values()];

  const top = [...readyFindings].sort((x, y) => y.confidence - x.confidence)[0];
  const resource = top?.provenance[0]?.url ?? null;

  const propDesc =
    typeof a.properties.description === "string"
      ? a.properties.description
      : typeof a.properties.summary === "string"
        ? a.properties.summary
        : null;
  const description = propDesc ?? ledeSentence(top?.content ?? "");

  const timestamp =
    [a.created_at, ...readyFindings.map((f) => f.created_at)].filter(Boolean).sort().slice(-1)[0] ??
    a.created_at;

  const related: ConceptDocRelation[] = [];
  graph.forEachOutEdge(nodeId, (_e, attrs, _src, target) => {
    if (!graph.hasNode(target)) return;
    const t = graph.getNodeAttributes(target);
    related.push({ relation: attrs.relation, direction: "out", neighborId: target, neighborLabel: t.label, neighborType: t.nodeType });
  });
  graph.forEachInEdge(nodeId, (_e, attrs, source) => {
    if (!graph.hasNode(source)) return;
    const t = graph.getNodeAttributes(source);
    related.push({ relation: attrs.relation, direction: "in", neighborId: source, neighborLabel: t.label, neighborType: t.nodeType });
  });

  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.properties)) {
    if (!k.startsWith("okf_")) properties[k] = v;
  }

  let prose: ConceptDocProse | null = null;
  if (typeof a.properties.okf_doc === "string" && a.properties.okf_doc.length > 0) {
    prose = {
      description: String(a.properties.okf_doc_description ?? ""),
      bodyMarkdown: a.properties.okf_doc,
      model: String(a.properties.okf_doc_model ?? ""),
      builtAt: String(a.properties.okf_doc_built_at ?? ""),
      groundedHash: String(a.properties.okf_doc_grounded_hash ?? ""),
    };
  }
  const stale = prose !== null && prose.groundedHash !== groundedHash(groundedIds);

  const frontmatter: ConceptDocFrontmatter = {
    type: a.nodeType,
    title: a.label,
    description: (prose && !stale && prose.description) || description,
    tags,
    resource,
    timestamp,
    id: nodeId,
  };

  return { frontmatter, properties, findings, related, sources, prose, stale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `(cd frontend && npx vitest run src/okf/conceptDoc.test.ts)`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C frontend add src/okf/conceptDoc.ts src/okf/conceptDoc.test.ts
git -C frontend commit -m "feat(okf): pure concept-doc builder + groundedHash"
```

---

### Task 6: API wiring — type, client, mock (frontend)

**Files:**
- Modify: `frontend/src/api/types.ts` (add `ConceptDocResponse`)
- Modify: `frontend/src/api/client.ts` (add `synthesizeConceptDoc`)
- Modify: `frontend/src/api/mock.ts` (add `mockApi.synthesizeConceptDoc`)
- Test: `frontend/src/api/concept-doc.test.ts`

**Interfaces:**
- Consumes: `groundedHash` (Task 5).
- Produces: `ConceptDocResponse { description; body_markdown; model; built_at; grounded_hash }`; `synthesizeConceptDoc(project, kb, nodeId): Promise<ConceptDocResponse>`; `mockApi.synthesizeConceptDoc(project, kb, nodeId)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/concept-doc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockApi, resetMockDb } from "./mock";
import { groundedHash } from "../okf/conceptDoc";

describe("mockApi.synthesizeConceptDoc", () => {
  it("returns a canned doc with a matching grounded_hash", async () => {
    resetMockDb();
    const res = await mockApi.synthesizeConceptDoc("delapan", "rag-ecosystem", "c_finding");
    expect(res.body_markdown.length).toBeGreaterThan(0);
    expect(res.description.length).toBeGreaterThan(0);
    // c_finding is grounded in ["f01","f25"] in the mock dataset
    expect(res.grounded_hash).toBe(groundedHash(["f01", "f25"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd frontend && npx vitest run src/api/concept-doc.test.ts)`
Expected: FAIL — `mockApi.synthesizeConceptDoc is not a function`.

- [ ] **Step 3: Add the wire type**

In `frontend/src/api/types.ts`, add after the `Finding` interface block:

```ts
export interface ConceptDocResponse {
  description: string;
  body_markdown: string;
  model: string;
  built_at: string;
  grounded_hash: string;
}
```

- [ ] **Step 4: Add the client method**

In `frontend/src/api/client.ts`, add `ConceptDocResponse` to the `import { ... } from "./types"` list, then add this endpoint after `deleteNode`:

```ts
export function synthesizeConceptDoc(
  project: string,
  kb: string,
  nodeId: string,
): Promise<ConceptDocResponse> {
  return call(
    () =>
      http(`${kbPath(project, kb)}/graph/nodes/${encodeURIComponent(nodeId)}/concept-doc`, {
        method: "POST",
      }),
    () => mockApi.synthesizeConceptDoc(project, kb, nodeId),
  );
}
```

- [ ] **Step 5: Add the mock**

In `frontend/src/api/mock.ts`, add `type ConceptDocResponse` to the import block from `./types`, add the import `import { groundedHash } from "../okf/conceptDoc";` near the top, then add this method inside the `mockApi` object (after `deleteNode`):

```ts
  async synthesizeConceptDoc(project: string, kb: string, nodeId: string): Promise<ConceptDocResponse> {
    const data = getKb(project, kb);
    const node = data.nodes.get(nodeId);
    if (!node) throw new ApiError(404, `unknown node: ${nodeId}`);
    return {
      description: `${node.label} — a ${node.type} in this knowledge base.`,
      body_markdown:
        `## Overview\n\n${node.label} is a ${node.type} grounded in ` +
        `${node.grounded_in.length} finding(s). This is a mock synthesized article ` +
        `shown when no live engine is connected.\n`,
      model: "mock/echo",
      built_at: new Date().toISOString(),
      grounded_hash: groundedHash(node.grounded_in),
    };
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `(cd frontend && npx vitest run src/api/concept-doc.test.ts)`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git -C frontend add src/api/types.ts src/api/client.ts src/api/mock.ts src/api/concept-doc.test.ts
git -C frontend commit -m "feat(okf): concept-doc API type, client, and mock parity"
```

---

### Task 7: store wiring + hotkey + Inspector button (frontend)

**Files:**
- Modify: `frontend/src/state/store.ts` (state + actions)
- Modify: `frontend/src/state/useHotkeys.ts` (`R` opens reader; `Esc` closes it)
- Modify: `frontend/src/panels/Inspector.tsx` (Read button)
- Test: `frontend/src/state/openConcept.test.ts`

**Interfaces:**
- Produces on the store: state `openConceptNodeId: string | null`, `conceptBackStack: string[]`; actions `openConcept(id: string | null): void`, `navigateConcept(id: string): void`, `conceptBack(): void`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/state/openConcept.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { graph } from "../graph/graphStore";
import { useStore } from "./store";

function addNode(id: string) {
  graph.addNode(id, { label: id, nodeType: "concept", properties: {}, grounded_in: [], created_at: "", x: 0, y: 0, size: 4, color: "#fff" });
}

beforeEach(() => {
  graph.clear();
  useStore.setState({ openConceptNodeId: null, conceptBackStack: [] });
});

describe("concept reader navigation", () => {
  it("opens, navigates with a back-stack, and pops back", () => {
    addNode("a");
    addNode("b");
    const s = useStore.getState();

    s.openConcept("a");
    expect(useStore.getState().openConceptNodeId).toBe("a");
    expect(useStore.getState().conceptBackStack).toEqual([]);

    s.navigateConcept("b");
    expect(useStore.getState().openConceptNodeId).toBe("b");
    expect(useStore.getState().conceptBackStack).toEqual(["a"]);

    s.conceptBack();
    expect(useStore.getState().openConceptNodeId).toBe("a");
    expect(useStore.getState().conceptBackStack).toEqual([]);

    s.openConcept(null);
    expect(useStore.getState().openConceptNodeId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `(cd frontend && npx vitest run src/state/openConcept.test.ts)`
Expected: FAIL — `openConcept` is not a function / type errors.

- [ ] **Step 3: Add state + actions to the store**

In `frontend/src/state/store.ts`:

(a) In `interface AppState`, after `openFindingId: string | null;` add:

```ts
  openConceptNodeId: string | null;
  conceptBackStack: string[];
```

(b) In the same interface, after `openFinding(id: string | null): void;` add:

```ts
  openConcept(id: string | null): void;
  navigateConcept(id: string): void;
  conceptBack(): void;
```

(c) In the `create(...)` initial state object, after `openFindingId: null,` add:

```ts
  openConceptNodeId: null,
  conceptBackStack: [],
```

(d) In `loadScope`, inside the `set({ ... })` that resets selection (the block containing `openFindingId: null,`), add:

```ts
      openConceptNodeId: null,
      conceptBackStack: [],
```

(e) Add the three action implementations after the `openFinding(id) { ... }` method:

```ts
  openConcept(nodeId) {
    if (nodeId && graph.hasNode(nodeId)) {
      graph.getNodeAttributes(nodeId).grounded_in.forEach((id) => get().fetchFinding(id));
    }
    set({ openConceptNodeId: nodeId, conceptBackStack: [] });
  },

  navigateConcept(nodeId) {
    if (!graph.hasNode(nodeId)) return;
    graph.getNodeAttributes(nodeId).grounded_in.forEach((id) => get().fetchFinding(id));
    const cur = get().openConceptNodeId;
    set({
      openConceptNodeId: nodeId,
      conceptBackStack: cur ? [...get().conceptBackStack, cur] : get().conceptBackStack,
    });
  },

  conceptBack() {
    const stack = get().conceptBackStack;
    if (!stack.length) {
      set({ openConceptNodeId: null });
      return;
    }
    const prev = stack[stack.length - 1];
    if (graph.hasNode(prev)) {
      graph.getNodeAttributes(prev).grounded_in.forEach((id) => get().fetchFinding(id));
    }
    set({ openConceptNodeId: prev, conceptBackStack: stack.slice(0, -1) });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `(cd frontend && npx vitest run src/state/openConcept.test.ts)`
Expected: PASS (1 test).

- [ ] **Step 5: Add the `R` hotkey and `Esc` close**

In `frontend/src/state/useHotkeys.ts`, in the non-travel `switch (e.key)`:

(a) In the `case "Escape":` chain, add the reader BEFORE `openFindingId` (so Esc closes the reader first):

```ts
        case "Escape":
          if (s.addNodeOpen) s.setAddNodeOpen(false);
          else if (s.openConceptNodeId) s.openConcept(null);
          else if (s.openFindingId) s.openFinding(null);
          else if (s.edgeDraft) s.clearEdgeDraft();
          else if (s.connectFrom) s.cancelConnect();
          else s.clearSelection();
          return;
```

(b) Add a new case after the `case "e": case "E":` block:

```ts
        case "r":
        case "R": {
          if (s.selectedNodes.length === 1) s.openConcept(s.selectedNodes[0]);
          return;
        }
```

- [ ] **Step 6: Add the Read button to the Inspector**

In `frontend/src/panels/Inspector.tsx`, inside `function NodeInspector({ id })`, add the store hook near the existing `const startConnect = useStore((s) => s.startConnect);`:

```tsx
  const openConcept = useStore((s) => s.openConcept);
```

Then in the `<div className="ins-actions">` block, add a Read button before the connect button:

```tsx
        <button className="btn" onClick={() => openConcept(id)}>
          read <span className="kbd">R</span>
        </button>
```

- [ ] **Step 7: Type-check gate**

Run: `(cd frontend && npm run build)`
Expected: `tsc --noEmit` passes (no unused-binding or type errors), then vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git -C frontend add src/state/store.ts src/state/useHotkeys.ts src/panels/Inspector.tsx src/state/openConcept.test.ts
git -C frontend commit -m "feat(okf): store actions, R hotkey, and Inspector read button"
```

---

### Task 8: the reader drawer component (frontend)

**Files:**
- Create: `frontend/src/panels/ConceptDocReader.tsx`
- Modify: `frontend/src/App.tsx` (mount the reader)
- Modify: `frontend/src/styles/panels.css` (append reader styles)

**Interfaces:**
- Consumes: `buildConceptDoc`, `ConceptDoc` (Task 5); `renderMarkdown` (Task 4); `synthesizeConceptDoc` (Task 6); `setNodeProperties` (existing); store actions (Task 7); `typeColor`, `graph`.

- [ ] **Step 1: Write the component**

Create `frontend/src/panels/ConceptDocReader.tsx`:

```tsx
/**
 * OKF concept-doc reader: a derived, read-only drawer that renders a graph
 * entity as an OKF document. Deterministic body by default; an optional one-pass
 * LLM synthesis (cached into the node's okf_* properties) renders as prose.
 * Related-concept links re-point the same drawer (with a back-stack).
 */

import { useEffect, useState } from "react";
import * as api from "../api/client";
import { typeColor } from "../graph/colors";
import { graph } from "../graph/graphStore";
import { buildConceptDoc, type ConceptDoc } from "../okf/conceptDoc";
import { renderMarkdown } from "../okf/markdown";
import { setNodeProperties } from "../state/mutations";
import { useStore } from "../state/store";

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ConceptDocReader() {
  const nodeId = useStore((s) => s.openConceptNodeId);
  const findingCache = useStore((s) => s.findingCache);
  const graphVersion = useStore((s) => s.graphVersion);
  const openConcept = useStore((s) => s.openConcept);
  const navigateConcept = useStore((s) => s.navigateConcept);
  const conceptBack = useStore((s) => s.conceptBack);
  const backStack = useStore((s) => s.conceptBackStack);
  const fetchFinding = useStore((s) => s.fetchFinding);
  const openFinding = useStore((s) => s.openFinding);
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);
  const mode = useStore((s) => s.mode);
  const pushToast = useStore((s) => s.pushToast);
  void graphVersion; // re-derive on graph mutations (e.g. after synthesize persists)

  const [synthesizing, setSynthesizing] = useState(false);
  const [view, setView] = useState<"notes" | "prose">("notes");

  useEffect(() => {
    if (nodeId && graph.hasNode(nodeId)) {
      graph.getNodeAttributes(nodeId).grounded_in.forEach(fetchFinding);
    }
  }, [nodeId, fetchFinding]);

  const doc = nodeId ? buildConceptDoc(nodeId, findingCache) : null;
  const hasFreshProse = !!doc?.prose && !doc.stale;

  useEffect(() => {
    setView(hasFreshProse ? "prose" : "notes");
  }, [nodeId, hasFreshProse]);

  if (!nodeId || !doc) return null;
  const fm = doc.frontmatter;
  const canSynthesize = mode === "live" && doc.findings.length > 0 && !synthesizing;

  const synthesize = async () => {
    if (!project || !kb || !graph.hasNode(nodeId)) return;
    setSynthesizing(true);
    try {
      const res = await api.synthesizeConceptDoc(project, kb, nodeId);
      const props = {
        ...graph.getNodeAttributes(nodeId).properties,
        okf_doc: res.body_markdown,
        okf_doc_description: res.description,
        okf_doc_model: res.model,
        okf_doc_built_at: res.built_at,
        okf_doc_grounded_hash: res.grounded_hash,
      };
      await setNodeProperties(nodeId, props, "synthesize concept doc");
      setView("prose");
    } catch (err) {
      pushToast("error", `synthesize failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSynthesizing(false);
    }
  };

  const synthDisabledTitle =
    mode === "mock"
      ? "needs the live engine + an LLM key"
      : doc.findings.length === 0
        ? "no grounded findings to synthesize from"
        : "";

  return (
    <>
      <div className="drawer-veil" onClick={() => openConcept(null)} />
      <div className="drawer okf-reader">
        <div className="drawer-head">
          <div className="okf-head-left">
            {backStack.length > 0 && (
              <button className="drawer-close" onClick={() => conceptBack()} title="back">
                ←
              </button>
            )}
            <span className="type-chip" style={{ borderColor: typeColor(fm.type), color: typeColor(fm.type) }}>
              {fm.type}
            </span>
            <h3 className="okf-title">{fm.title}</h3>
          </div>
          <button className="drawer-close" onClick={() => openConcept(null)} title="close (Esc)">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {fm.description && <p className="okf-lede">{fm.description}</p>}

          <div className="drawer-meta">
            <span className="mono">{fm.timestamp ? new Date(fm.timestamp).toLocaleDateString() : "—"}</span>
            {fm.resource && (
              <a className="mono" href={fm.resource} target="_blank" rel="noreferrer">
                {host(fm.resource)} ↗
              </a>
            )}
            {fm.tags.map((t) => (
              <span key={t} className="drawer-tag">
                {t}
              </span>
            ))}
          </div>

          <div className="okf-toolbar">
            {doc.prose && (
              <div className="okf-switch">
                <button className={view === "notes" ? "btn btn--on" : "btn"} onClick={() => setView("notes")}>
                  notes
                </button>
                <button className={view === "prose" ? "btn btn--on" : "btn"} onClick={() => setView("prose")}>
                  article
                </button>
              </div>
            )}
            <button className="btn" disabled={!canSynthesize} onClick={() => void synthesize()} title={synthDisabledTitle}>
              {synthesizing ? (
                <>
                  <span className="spin" /> synthesizing…
                </>
              ) : doc.prose ? (
                "↻ re-synthesize"
              ) : (
                "✨ synthesize"
              )}
            </button>
          </div>

          {doc.stale && doc.prose && (
            <div className="okf-stale">cached article may be stale — evidence changed since it was written</div>
          )}

          {view === "prose" && doc.prose ? (
            <div className="okf-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.prose.bodyMarkdown) }} />
          ) : (
            <DeterministicBody doc={doc} onOpenFinding={openFinding} />
          )}

          {doc.related.length > 0 && (
            <div className="sect">
              <h2 className="sect-title">
                Related concepts <span className="sect-aux">{doc.related.length}</span>
              </h2>
              {doc.related.map((r, i) => (
                <button key={`${r.neighborId}-${i}`} className="ins-endpoint" onClick={() => navigateConcept(r.neighborId)}>
                  <span className="okf-rel mono">{r.direction === "out" ? r.relation : `← ${r.relation}`}</span>
                  <span className="type-dot" style={{ background: typeColor(r.neighborType) }} />
                  {r.neighborLabel}
                  <span className="arrow" style={{ marginLeft: "auto" }}>
                    →
                  </span>
                </button>
              ))}
            </div>
          )}

          {doc.sources.length > 0 && (
            <div className="sect">
              <h2 className="sect-title">
                Sources <span className="sect-aux">{doc.sources.length}</span>
              </h2>
              {doc.sources.map((s, i) => (
                <a key={`${s.url}-${i}`} className="prov-item" href={s.url} target="_blank" rel="noreferrer">
                  <div className="prov-domain">{s.domain} ↗</div>
                  <div className="prov-query">query: {s.query}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DeterministicBody({
  doc,
  onOpenFinding,
}: {
  doc: ConceptDoc;
  onOpenFinding: (id: string) => void;
}) {
  const props = Object.entries(doc.properties);
  return (
    <>
      {props.length > 0 && (
        <div className="sect">
          <h2 className="sect-title">Properties</h2>
          <table className="okf-props">
            <tbody>
              {props.map(([k, v]) => (
                <tr key={k}>
                  <td className="okf-prop-k">{k}</td>
                  <td>{typeof v === "string" ? v : JSON.stringify(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="sect">
        <h2 className="sect-title">
          What we know <span className="sect-aux">{doc.findings.length}</span>
        </h2>
        {doc.findings.length === 0 && <div className="placeholder">no grounded findings loaded yet</div>}
        {doc.findings.map((f) => (
          <button key={f.id} className="okf-finding" onClick={() => onOpenFinding(f.id)}>
            <div className="okf-finding-title">{f.title}</div>
            <div className="okf-finding-body">{f.content}</div>
            <div className="ev-meta">
              <span>{f.confidence.toFixed(2)}</span>
              <span>{f.domains.join(" · ") || "no sources"}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Mount the reader in `App.tsx`**

In `frontend/src/App.tsx`, add the import next to the other panel imports:

```tsx
import { ConceptDocReader } from "./panels/ConceptDocReader";
```

Then add it to the rendered tree, right after `<FindingDrawer />`:

```tsx
      <FindingDrawer />
      <ConceptDocReader />
```

- [ ] **Step 3: Append reader styles**

Append to `frontend/src/styles/panels.css` (fallbacks keep it safe if a token is absent):

```css
/* ── OKF concept-doc reader ─────────────────────────────────────────── */
.okf-reader { width: min(640px, 94vw); }
.okf-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.okf-title { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.okf-lede { font-size: 14px; line-height: 1.5; margin: 0 0 10px; }
.okf-toolbar { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.okf-switch { display: flex; gap: 4px; }
.btn--on { outline: 1px solid var(--accent, #d9a441); }
.okf-stale { font-size: 11px; color: var(--accent, #d9a441); margin: 4px 0 8px; }
.okf-rel { min-width: 108px; font-size: 10px; color: var(--text-faint, #8a8a8a); }
.okf-props { width: 100%; font-size: 12px; }
.okf-props td { padding: 2px 0; vertical-align: top; }
.okf-prop-k { color: var(--text-faint, #8a8a8a); padding-right: 12px; white-space: nowrap; }
.okf-finding { display: block; width: 100%; text-align: left; cursor: pointer; color: inherit;
  border: none; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
  background: rgba(127, 127, 127, 0.08); }
.okf-finding:hover { background: rgba(127, 127, 127, 0.16); }
.okf-finding-title { font-weight: 600; font-size: 13px; margin-bottom: 3px; }
.okf-finding-body { font-size: 12px; color: var(--text-faint, #8a8a8a); margin-bottom: 6px; line-height: 1.45; }
.okf-prose { font-size: 13px; line-height: 1.55; }
.okf-prose h2 { font-size: 14px; margin: 14px 0 6px; }
.okf-prose h3 { font-size: 13px; margin: 12px 0 4px; }
.okf-prose p { margin: 0 0 8px; }
.okf-prose ul, .okf-prose ol { margin: 0 0 8px 18px; }
.okf-prose code { font-family: var(--font-mono, monospace); font-size: 12px; }
.okf-prose pre { overflow: auto; padding: 8px; border-radius: 6px; background: rgba(127, 127, 127, 0.14); }
```

- [ ] **Step 4: Type-check + full frontend test gate**

Run: `(cd frontend && npm run build && npm run test)`
Expected: `tsc --noEmit` passes; vite build succeeds; all Vitest suites pass (existing undo/redo + the new okf/state/api suites).

- [ ] **Step 5: Manual smoke (mock mode — no backend needed)**

Run: `(cd frontend && VITE_USE_MOCK=1 npm run dev)`, open `http://localhost:5173`. Verify:
1. Select a node (e.g. "Finding"); the Inspector shows a `read` button. Click it (or press `R`).
2. The reader drawer opens: type chip + title, lede, tags, Properties, "What we know" findings, Related concepts, Sources.
3. Click a Related concept → the drawer re-points to it; a `←` back button appears and returns to the prior concept.
4. Click `✨ synthesize` → an `article`/`notes` toggle appears and the prose view renders the mock markdown. (In mock mode the button is enabled because the mock client serves it; in live mode with no LLM key the backend returns 503 and a toast surfaces.)
5. `Esc` closes the reader.

- [ ] **Step 6: Commit**

```bash
git -C frontend add src/panels/ConceptDocReader.tsx src/App.tsx src/styles/panels.css
git -C frontend commit -m "feat(okf): concept-doc reader drawer"
```

---

## Self-Review

**Spec coverage:**
- §2/§4 frontmatter mapping + body assembly → Task 5 (`buildConceptDoc`) + tests.
- §5 layout/interaction (Read button, `R`, back-stack, synthesize toggle, read-only) → Tasks 7–8.
- §6 deterministic data flow → Tasks 5, 8.
- §7 endpoint + synthesis + `okf_` caching + `grounded_hash` → Tasks 1–3 (backend), Task 8 (persist via `setNodeProperties`).
- §8 markdown renderer → Task 4.
- §9 keyless/offline + mock parity → Task 3 (503), Task 6 (mock), Task 8 (disabled button + toast).
- §10 file list → covered across all tasks.
- §12 error handling (missing findings, ungrounded entity, synthesize failure, stale) → builder filters non-ready findings, empty-state placeholder, toast on failure, `stale` flag + banner.
- §13 testing → unit tests for builder, markdown, grounded_hash parity (both languages, same vectors), backend route, mock parity.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions.

**Type consistency:** `grounded_hash`/`groundedHash` identical algorithm + verified shared vectors. `ConceptDocResponse` keys (`description, body_markdown, model, built_at, grounded_hash`) match the backend return dict (Task 2) and the mock (Task 6). `okf_*` property keys identical in builder (Task 5), reader persist (Task 8), and hidden-key filter (Task 5). Store action names (`openConcept`, `navigateConcept`, `conceptBack`) match across store (Task 7), hotkeys (Task 7), Inspector (Task 7), and reader (Task 8).

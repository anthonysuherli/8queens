# qwen8 — Agent Society with a Shared Brain
## Authoritative Design Specification

**Status:** Reviewed (3 adversarial lenses applied) → implementation-ready
**Target hackathon:** Global AI Hackathon Series with Qwen Cloud (Devpost: qwencloud-hackathon.devpost.com)
**Primary track:** Agent Society
**Submission deadline:** 2026-07-09, 2:00pm PT (judging Jul 10–31). Aim to submit by 2026-07-08 EOD as a buffer.
**Repo:** `~/Repositories/8star/qwen8` (sibling of `delapan-ai`, `br8n`)
**License:** AGPL-3.0

---

## 1. Title + Summary

**qwen8** is an open-domain deep-research *agent society* in which role-specialized Qwen agents collaborate not by passing messages but by reading and writing a single **shared brain** — a deduplicated, embedded findings store plus an incremental knowledge graph, both vendored from the delapan engine. The brain's own **coverage signal** (`rich` / `sparse` / `gap`, computed by the existing `assess_coverage` heuristic) is the coordination medium: it is a *blackboard*. A Planner (qwen-max) decomposes a research question into sub-questions posted as open "gaps"; a pool of Researchers (qwen-plus) atomically claim the worst-covered open gap, run the vendored `plan→search→crawl→extract→merge` exploration pipeline over Tavily, embed their findings and write them to the shared brain; a Critic (qwen-max) adversarially re-bands each gap against fresh findings and either closes it or re-opens it; a Synthesizer (qwen-max, with qwen-long as an opt-in for huge contexts) writes a cited report once coverage is `rich`. The society converges when no gaps remain open. Everything runs as a containerized FastAPI service on Alibaba Cloud ECS in Singapore, consuming Qwen exclusively through DashScope's OpenAI-compatible endpoint, with a sigma.js dashboard visualizing the shared brain growing and roles claiming gaps live.

**The honest novelty (read this before Section 2/3).** The delapan engine already ships `core/exploration/deepen.py::run_deepen` — a *single-agent* gap-following loop (decompose → per-round fan-out → an LLM `critique()` returning a `coverage` float + `next_facets` → terminate on `min_rounds`/`done`/coverage). qwen8's society is the **multi-agent generalization** of that precursor. The genuine delta is three concrete things: **(a)** N concurrent *competing* researchers (vs deepen's single semaphore-bounded facet fan-out), **(b)** a *persisted, queryable* gap state-machine (`open/claimed/verified/done/dead` in a SQL table) as the coordination substrate (vs deepen's in-memory facet list), and **(c)** per-gap coverage *banding* (`rich`/`sparse`/`gap` from `assess_coverage`) as the *scheduling key* the researchers compete on (vs deepen's scalar coverage float). We disclose this lineage on purpose: it converts a "a judge will notice deepen.py exists" gotcha into a credible engineering-depth story.

---

## 2. Problem & Why an Agent Society

**The deep-research problem.** Single-shot LLM "research" answers are unverifiable, non-reusable, and blind to their own gaps. A serious open-domain research question (e.g. "What is the regulatory and competitive landscape for stablecoin issuers in 2026?") needs: decomposition into tractable sub-questions, parallel multi-source web research, deduplication of overlapping evidence, adversarial verification against sources, and a synthesis that cites every claim — and it needs to *know what it still doesn't know*.

**Why a society, and why a blackboard.** The delapan engine already has the rare property that the knowledge store can grade its own coverage: `band_findings` buckets vector-search hits into similarity bands, and `assess_coverage` returns a `rich` / `sparse` / `gap` verdict (`delapan/core/agent/preamble.py`). That verdict is exactly the negotiation signal a multi-agent system needs. Instead of an elaborate message-passing protocol, agents coordinate *through the artifact they are building*:

- The shared brain **is** the blackboard. Sub-questions are gap rows; the coverage verdict on each is public state.
- Researchers do not talk to each other. They **compete** for the worst-covered open gap; the database arbitrates who wins each claim (mechanism in Section 6.1 — and it is *not* the WAL-serialization story the draft told; see that section).
- The society **converges** measurably: when every gap is `done` (re-graded `rich`) or exhausted, work stops. There is a hard, observable termination condition, not a vibe (Section 6.3).

`deepen.py` already proves the *single-agent* form of this loop works inside delapan; qwen8 promotes it to a multi-agent blackboard. This is the literal thesis of the Agent Society track — role specialization, task division, negotiation — expressed in the smallest honest mechanism: a shared, self-grading knowledge substrate with a persisted gap state-machine.

---

## 3. Track & Judging-Rubric Fit

Primary track: **Agent Society**. Secondary capability to *name as a strength* (not file as a second submission — the rules require each submission be unique): **MemoryAgent** (findings are persistent, embedded, deduplicated cross-turn memory; preamble + coverage banding is literal recall-with-a-verdict).

| Criterion (weight) | How qwen8 scores |
|---|---|
| **Technical Depth & Engineering — 30%** | A real engineered DAG (`plan→search→crawl→extract→evaluate→merge` in `exploration/engine.py`) behind a clean `Store` Protocol seam; an *atomic* gap-claiming primitive (a single conditional `UPDATE gaps SET status='claimed' … WHERE id=(SELECT … WHERE status='open' … LIMIT 1)`, arbitrated by `cursor.rowcount`, executed on one shared connection in one event-loop thread — see 6.1 for why that, not WAL, is the arbiter); sqlite-vec embedded vector store with write-time dedup (`FindingMerger`); incremental KG builder; config split (secrets in `.env` via pydantic `Settings`, knobs in `config.yaml`/`AppConfig`, precedence defaults<yaml<env, `QWEN8_<SECTION>__<FIELD>` overrides); Qwen/DashScope wired as the single OpenAI-compatible LLM+embedding client — point the Alibaba-Cloud-proof code file here. Lineage from `deepen.py` is disclosed as the single-agent precursor we generalized. |
| **Innovation & AI Creativity — 30%** | The headline novelty: **coordination through a self-grading shared brain**, with the three-part delta over `deepen.py` named explicitly (Section 1): N competing researchers, a persisted queryable gap state-machine, and coverage *banding* as the scheduling key. Coverage banding (`rich`/`sparse`/`gap`) is both the always-on "what we know" readout *and* the negotiation medium agents compete over. No message bus, no central scheduler — the brain *is* the substrate. |
| **Problem Value & Impact — 25%** | Anchor to a concrete deliverable: enter one research question → get a reusable, deduplicated, *cited* knowledge base plus a synthesis, with an honest coverage verdict you can trust, instead of a one-shot answer. Less re-research, persistent institutional memory, auditable citations. Demonstrate on a real open-domain question end to end. |
| **Presentation & Documentation — 15%** | Cheapest points to fully capture: pristine README with run instructions, the architecture diagram (Section 4, *rendered to `docs/architecture.svg`* per 13.4), the AGPL-3.0 `LICENSE` file, the `<3:00` demo video (script to ~2:40, **pre-warmed run** so it converges on camera — see 9.3 + M9), and an optional build-journey blog post for the separate Blog Post Award ($500+$500). |

**Submission checklist (from the authoritative /rules page):**
1. Public OSS repo with a `LICENSE` file (AGPL-3.0) and run instructions.
2. **Proof of Alibaba Cloud** = a *link to a code file* in the repo demonstrating Alibaba Cloud use → point at `qwen8/core/clients/ai_gateway.py` + `qwen8/core/config.py` (DashScope config) and the deploy files (`Dockerfile`, `deploy/`).
3. Architecture diagram (Section 4 — rendered to `docs/architecture.svg`/`.png` for upload, render step in 13.4).
4. Demo video `< 3:00`, public on **YouTube** (decision: YouTube — it is on both the rules and marketing source lists; avoid Facebook/Youku-only). Show the deployment running live *inside* the video via a **pre-warmed run** (9.3) to satisfy the marketing-page interpretation; keep the longer single-take proof-of-deployment recording as a **separate artifact**, not the judged video.
5. Text description of features.
6. Track selection = Agent Society.
7. *(Optional)* blog post link for Blog Post Award eligibility.

---

## 4. Architecture Overview

The system is a single FastAPI process. The browser (or a `curl`) hits the API; the API drives a **blackboard loop** that fans out role coroutines on one event loop; all roles read/write **one shared brain** (findings + KG behind the `Store` seam); the brain's heavy lifting (LLM, embeddings, web) goes out over HTTPS to **DashScope (Qwen)** and **Tavily**. The sigma.js frontend subscribes to a society event stream and renders the brain growing. **All routes are prefixed `/api/projects/{p}/kbs/{k}/…`** — the society endpoints are mounted under that same prefix so the frontend's hardcoded `kbPath` is untouched (Section 8.2).

```
                          ┌──────────────────────────────────────────────────────────────────┐
                          │              Alibaba Cloud (Singapore, ap-southeast-1)             │
                          │                                                                    │
  ┌────────────┐   HTTP   │  ┌────────────────────────── ECS instance ─────────────────────┐ │
  │  Browser / │  + SSE   │  │            qwen8 FastAPI / uvicorn  (:8001, host 0.0.0.0)     │ │
  │   judge    │◄────────►│  │   (uvicorn CLI forces host 0.0.0.0; main() hardcodes 127.x)   │ │
  │  (sigma.js │          │  │                                                               │ │
  │ dashboard) │          │  │   POST /api/projects/{p}/kbs/{k}/society/start                │ │
  └────────────┘          │  │   GET  /api/projects/{p}/kbs/{k}/society/stream  (SSE)        │ │
                          │  │   GET  /api/projects/{p}/kbs/{k}/society/state                │ │
                          │  │   GET  /api/projects/{p}/kbs/{k}/graph /…/graph/stats         │ │
                          │  │   GET  /api/projects/{p}/kbs/{k}/findings  /…/resume          │ │
                          │  │   GET  /api/projects   ·   GET /health                        │ │
                          │  │            │                          ▲                       │ │
                          │  │            ▼                          │ events (SSE queue)    │ │
                          │  │   ┌─────────────────── BLACKBOARD LOOP (run_society) ───────┐ │ │
                          │  │   │  Planner ─seed→ gaps(open)                               │ │ │
                          │  │   │     ▲                                                    │ │ │
                          │  │   │     │ reopen(reason) / spawn child   claim (atomic)      │ │ │
                          │  │   │  Critic ◄── verified ── Researcher ×N ──────────────┐    │ │ │
                          │  │   │     │ done                    │ run_exploration      │    │ │ │
                          │  │   │     ▼                         ▼  + embed + insert    │    │ │ │
                          │  │   │  Synthesizer (when no open/claimed/verified gaps)    │    │ │ │
                          │  │   └──────────────────────────────┬───────────────────────┘   │ │ │
                          │  │                                   │ read/write                │ │
                          │  │   ┌─────────────── SHARED BRAIN (Store seam) ──────────────┐  │ │
                          │  │   │  findings + vec_findings  (dedup, 1536-dim embeddings)  │  │ │
                          │  │   │  kg_nodes / kg_edges / kg_schemas   (incremental KG)    │  │ │
                          │  │   │  kb_synopsis · explorations · gaps (NEW table)          │  │ │
                          │  │   │     SQLite + sqlite-vec  →  /data/qwen8.db (local disk) │  │ │
                          │  │   └─────────────────────────────────────────────────────────┘  │ │
                          │  └───────────────────────────────────────────────────────────────┘ │
                          │                 │ outbound HTTPS                  │ outbound HTTPS   │
                          │                 ▼                                 ▼                  │
                          │   ┌──────────────────────────────┐                                  │
                          │   │  DashScope (Model Studio)     │   (Qwen = Alibaba-managed svc)   │
                          │   │  dashscope-intl.aliyuncs.com  │                                  │
                          │   │  qwen-max/plus/long +         │                                  │
                          │   │  text-embedding-v4 @1536      │                                  │
                          │   └──────────────────────────────┘                                  │
                          └────────────────────────────────────────────────│───────────────────┘
                                                                            ▼
                                                              ┌──────────────────────────┐
                                                              │  Tavily API (3rd party)  │
                                                              │  search + extract        │
                                                              └──────────────────────────┘
```

**Three reused seams carry the whole society** (no new heavy machinery):
1. **Coverage read** — `select_preamble(query, *, store, kb_id, depth)` → `(xml, Coverage)` and the underlying `band_findings(rows, cfg.tiers)` + `assess_coverage(bands, cfg.tiers)` (`agent/preamble.py`; both require a `TiersConfig`).
2. **Research write** — `run_exploration(prompt, *, exploration_id, project_id, kb_id, cfg, on_progress=None, on_narration=None, lens='explore')` → `list[Finding]` *(unpersisted, unembedded)*, preceded by `store.create_exploration(org_id, kb_id, prompt)` and followed by the render→embed→`store.insert_findings(rows)` sequence (`exploration/engine.py`, `store/base.py`, `mcp/server.py`). **`project_id` is required, has no default** — Section 6.2 threads it.
3. **Graph read/write** — `read_graph(store, kb_id, focus=None, depth, node_cap, edge_cap)`; `store.upsert_kg_nodes(kb_id, nodes)` / `store.upsert_kg_edges(kb_id, edges)`. *(KG extraction is OFF for the demo — Section 11/Section 12 budget — so this is a synthesis-time convenience, not a hot path.)*

---

## 5. The Shared Brain — Vendored delapan Engine

qwen8 **vendors** (copies + renames) the deep-research spine from `delapan-ai/backend/delapan/`, following the documented br8n fork contract (copy file → rename `delapan.*` → `qwen8.*`; never cross-import; keep standalone; drop chat-graph / `/v1` / HTML / cloud). The br8n *backend package* does not exist on disk, so the precedent is the rule set, not an executed example.

**The loopback HTTP API already exists and is reused, not built.** `delapan/api/` ships a working FastAPI app (`main.py` mounts `health`, `projects`, `kg`, `findings`, `explore` routers; CORS is already added). The cloud `/v1`, `/agent`, `/internal` surfaces are the only HTTP surfaces *absent* from open-core. We **vendor the `api/` package** (Tier 6 below) and add one new router; we do not reimplement the read contract.

### 5.1 Vendor order (leaves → roots)

Copy in this order so every file's internal imports already exist when it lands. All sources under `delapan/`, targets under `qwen8/`.

**Tier 0 — config + store seam**
1. `core/config.py` — pydantic `Settings` + `AppConfig`. *Rename env prefix + config-file env var + `.env` resolution — see 5.3. Change model-name defaults to Qwen — see 5.6 (load-bearing: non-Qwen defaults silently 404).*
2. `store/base.py` — the `Store` Protocol (zero imports).
3. `store/sqlite.py` — `SQLiteStore`; `_SCHEMA` declares vec0 tables `findings/vec_findings/kb_synopsis/explorations/kg_nodes/vec_kg_nodes/kg_edges/kg_schemas` at `float[1536]`. *Rename `_default_db_path()` → `~/.qwen8/qwen8.db` and the `DELAPAN_DB_PATH` env read → `QWEN8_DB_PATH`. **Add the `gaps` table + index to `_SCHEMA`** (Section 6.1) — since we are already editing this file for the db-path rename, the "zero delapan edits" justification for reaching `store._conn` no longer applies; baking the table into `_SCHEMA` removes the private-attr reach.*
4. `store/__init__.py` — `get_store()` / `active_backend()` (caches one `SQLiteStore` per `db_path` in `_local_stores`); **do not copy** the lazy Supabase + cloud branches' targets (the `store/supabase.py` and `clients/supabase.py` modules are absent on disk; the lazy imports stay but are never hit when cloud is unconfigured).

**Tier 1 — clients**
5. `core/clients/__init__.py` (docstring only)
6. `core/clients/ai_gateway.py` — `structured_completion` + `text_completion`; the single LLM seam. Built on `AsyncOpenAI(api_key=..., base_url=...)`.
7. `core/clients/embeddings.py` — `embed_text` / `embed_batch`; passes `dimensions=emb.dim` (1536). **Add ≤10-per-call chunking to `embed_batch`** (Section 7.3).
8. `core/clients/tavily.py` — `search` / `extract` (lazy `AsyncTavilyClient`).
9. *(Dropped)* `core/clients/anthropic.py` — `chat_model` factory used **only** by `synopsis.py::_build`. Rewired off, not vendored (see 5.4 + 5.5).

**Tier 2 — agent state + stable layers**
10. `core/agent/__init__.py` (empty)
11. `core/agent/state.py` — keep `TenantContext` (needed by the api/ routes, KG builder, tenancy); the chat-only `Message`/`MessagePart`/`StreamEvent`/`SlashInvocation` types are dead weight and may be trimmed (verified: no vendored module imports them).
12. `core/agent/synopsis.py` — KB synopsis spine: `load_synopsis` / `maybe_rebuild_synopsis` / `schedule_rebuild`. **`_build` rewired off langchain — see 5.5.**
13. `core/agent/preamble.py` — `band_findings(rows, cfg)` / `assess_coverage(bands, cfg)` / `render_preamble` / `select_preamble` → `(xml, "rich"|"sparse"|"gap")`.

**Tier 3 — exploration (the deep-research pipeline)**
14. `core/exploration/models.py` — `SearchQuery`/`ExplorationPlan`/`RawFinding`/`FindingBatch`/`ExtractionResult`/`Source`/`Finding`. **Note: `Finding.content` is `dict`, `Finding.project_id` is required, the engine returns findings with NO embedding.**
15. `core/exploration/merger.py` — fuzzy dedupe + confidence (pure).
16. `core/exploration/planner.py`
17. `core/exploration/extractor.py`
18. `core/exploration/evaluator.py` — reflection critic.
19. `core/exploration/narrator.py`
20. `core/exploration/engine.py` — `run_exploration` + `ingest_pages`.
21. `core/exploration/deepen.py` — `run_deepen` autonomous gap-following loop. *Vendored as the disclosed single-agent precursor (Section 1) and to back the optional MCP `deepen` tool; the society loop does NOT call it.*
22. `core/exploration/__init__.py` — re-exports.

**Tier 4 — knowledge graph (shared-brain artifact)**
23. `core/knowledge_graph/__init__.py`
24. `core/knowledge_graph/models.py` — `KGNodeExtract`/`KGEdgeExtract`/`KGExtraction`.
25. `core/knowledge_graph/extractor.py`
26. `core/knowledge_graph/schema.py` — intent ontology.
27. `core/knowledge_graph/service.py` — `read_graph` / `kg_stats` / `kg_schema` / `get|set_kg_intent` / `kg_digest` / `focus_subgraph` (pure reads).
28. `core/knowledge_graph/builder.py` — `build_graph` + `schedule_kg_update` (fire-and-forget). *KG extraction is OFF for the demo — `schedule_kg_update` is gated on an approved intent schema and no-ops without one, so leaving it unconfigured is the demo default.*

**Tier 5 — MCP interface (Claude-Code tap-in)**
29. `mcp/__init__.py`
30. `mcp/banner.py` — rename banner string.
31. `mcp/tenancy.py` — `resolve_tenant` / `resolve_store`.
32. `mcp/server.py` — `FastMCP('qwen8')` with tools `resume` / `search` / `explore` / `projects`. **`_render_content` + `_normalize_provenance` live here — the canonical render→embed→insert reference the Researcher mirrors (Section 6.2).** *The `deepen` MCP tool is OUT of MVP scope: `run_deepen(topic, *, cfg, exploration_cfg, project_id, kb_id, on_round, coverage_probe, …)` has a different signature than `explore` (it needs `exploration_cfg`, `project_id`, and injected `on_round`/`coverage_probe` callbacks for persistence+coverage), so "wrap it like explore" is wrong — skip it.*

**Tier 6 — loopback HTTP API (the demo surface — EXISTS, reused)**
33. `api/__init__.py`
34. `api/deps.py` — `resolve_kb_or_404(project, kb) -> (TenantContext, Store)`.
35. `api/health.py` — `GET /health`.
36. `api/routes_projects.py` — `GET /api/projects`.
37. `api/routes_findings.py` — list/get/delete findings under `/api/projects/{p}/kbs/{k}/findings`.
38. `api/routes_kg.py` — graph read/write under `/api/projects/{p}/kbs/{k}/graph`. **The top-level `from delapan.core.agent.concept_doc import synthesize_concept_doc` (line 26) must be PHYSICALLY DELETED along with the `/concept-doc` handler** — it is a module-level import, so merely "not mounting the route" still crashes app startup. See 5.4 + Section 10.
39. `api/routes_explore.py` — the single-shot explore SSE; **`_missing_keys()` must be edited** to require only `(DashScope/AI_GATEWAY key) + TAVILY_API_KEY`, dropping `OPENAI_API_KEY` (5.4). Its `_run_and_persist` is the canonical `create_exploration → run_exploration(project_id=…) → render → embed_batch → insert_findings → update_exploration` reference the Researcher reuses (Section 6.2).
40. `api/main.py` — `FastAPI` app + CORS. **Must be MODIFIED**: register the new `routes_society` router; add the deployed frontend origin (or `*` for the demo window) to `cors_origins`; rename the FastAPI title to `qwen8`. The `main()` here hardcodes `host=127.0.0.1` — leave it; the Dockerfile's uvicorn CLI forces `--host 0.0.0.0` (Section 9.1).

Copy `config.yaml` alongside and rename its loader env vars (5.3) + set every model name to Qwen (5.6).

### 5.2 Import-rename rules (apply to every vendored file)

- Replace every `from delapan.` / `import delapan.` with `from qwen8.` / `import qwen8.` — **111 import sites in the engine package (verified count)** plus the lazy imports inside `store/__init__.py` and `mcp/tenancy.py`. Covers `core.*`, `store.*`, `mcp.*`, `api.*`.
- **Keep all return-shape dict keys byte-identical** (`finding_count_at_build`, `similarity`, etc.) — they are load-bearing across the `Store` seam and the frontend contract.
- Rename `FastMCP('delapan')` → `FastMCP('qwen8')`, the `delapan_*` tool names, the banner, and the FastAPI title.
- The `SQLiteStore` synthetic `org_id='local'` may stay.

### 5.3 Config renames (config.py + config.yaml) — completeness is a correctness requirement

Missing any one of these leaves qwen8 silently reading delapan's `config.yaml` and `~/.delapan/delapan.db`, cross-polluting brains.

- `config.py` `_ENV_PREFIX`: `DLP_` → `QWEN8_` (this re-points nested overrides `QWEN8_<SECTION>__<FIELD>`).
- `DELAPAN_CONFIG_FILE` → `QWEN8_CONFIG_FILE`.
- `Settings` aliases `DELAPAN_BACKEND` / `DELAPAN_DB_PATH` → `QWEN8_BACKEND` / `QWEN8_DB_PATH`.
- `store/sqlite.py` `_default_db_path()`: `~/.delapan/delapan.db` → `~/.qwen8/qwen8.db`, and its `os.environ.get("DELAPAN_DB_PATH")` → `QWEN8_DB_PATH`.
- `config.py` `.env` + `config.yaml` path resolution → qwen8's repo root (`Path(__file__).resolve().parents[2]` already points at the package root; verify it lands on the qwen8 repo root, not delapan's).
- Preserve precedence: defaults < `config.yaml` < env.
- `Settings` `cors_origins` env alias `CORS_ORIGINS` → `QWEN8_CORS_ORIGINS`, so the deployed frontend/ECS origin is added at `docker run` time (`-e QWEN8_CORS_ORIGINS=…`, Section 9.2) without a code change.
- **Startup assertion (Risks + M1 verify):** on boot, log the resolved `store.db_path` and `assert ".qwen8" in db_path`; assert `_ENV_PREFIX == "QWEN8_"`. A clean import says nothing about whether the *running process* reads delapan's config — this runtime check does.

### 5.4 What is dropped

- **Cloud tier** — `store/supabase.py`, `clients/supabase.py` (absent on disk; their lazy imports are never reached when cloud is unconfigured — no code edit needed beyond not copying absent files). `supabase`/`asyncpg`/`pyjwt`/`argon2` deps are omitted from pyproject (13.x).
- **Chat agent** — there is no `agent/graph.py` on disk; nothing to drop, nothing to vendor.
- **`/v1` + `/agent` + `/internal` deploy surfaces** — not on disk in open-core. The loopback `/api/*` surface DOES exist and is reused (Tier 6).
- **HTML/report generator** — not on disk. *(This is why `jinja2` is likely dead weight — see 13.1; drop it from pyproject unless an import check proves a vendored module needs it.)*
- **`core/memory/`** — only stale `.pyc`, no source, no importers — exclude entirely.
- **`OPENAI_API_KEY` requirement** — `routes_explore.py::_missing_keys()` (lines 54–62) requires `TAVILY_API_KEY` **AND** `AI_GATEWAY_API_KEY` **AND** `OPENAI_API_KEY`. DashScope replaces OpenAI entirely, and the recommended fast path never sets `OPENAI_API_KEY`, so the vendored route (and any society route mirroring it) would emit `missing required keys: OPENAI_API_KEY` and run nothing. **Edit `_missing_keys()` in the vendored `routes_explore.py` to require only the gateway/DashScope key + `TAVILY_API_KEY`.** Verified in M2/M3 (Section 11 criterion 3) and listed in Risks (Section 13).
- **`concept_doc` route** — physically delete the top-level import + `/concept-doc` handler from the vendored `routes_kg.py` (5.1 item 38). The `okf` config section + `OKFConfig` can stay as inert config (harmless) or be trimmed; the *import* is what must go.
- **langchain coupling** — see 5.5.

### 5.5 The synopsis langchain drop (precise)

Verified: `synopsis.py::_build` does `llm = chat_model(cfg.model); resp = await llm.ainvoke([{"role":"user","content": …}])` (imports `chat_model` from `clients/anthropic.py`, line 17), then **parses free-form prose**: `json.loads(text[text.find("[") : text.rfind("]")+1])` and filters to dicts. Because `_build` consumes free-form prose (it brackets-out a JSON array from whatever text comes back, with a `try/except` fallback to `[]`), **`text_completion` is the correct rewire**:

> Rewrite `synopsis._build` to call `qwen8.core.clients.ai_gateway.text_completion(model=cfg.model, system=…, user=_build_prompt(...))`, returning the response text, then keep the existing bracket-extraction parse. Drop the `from …clients.anthropic import chat_model` import. Drop `clients/anthropic.py`, `anthropic`, `langchain-core`, `langchain-anthropic` from deps.

`text_completion` has no fallback_model/retry, but synopsis regen is already fire-and-forget and degrades to `[]` on parse failure, so this is acceptable. **Do not mark M1 done on import-success alone** — add a smoke test (M1 verify) that `maybe_rebuild_synopsis` produces a valid `kb_synopsis` row on DashScope. *(If, contrary to the verification above, `_build` is later changed to depend on structured output, switch to `structured_completion(..., use_json_schema=False)` instead.)*

### 5.6 config.py model-name defaults — every knob must be Qwen (load-bearing)

`config.py` bakes **non-Qwen gateway dot-slugs** as defaults on every model field. If `config.yaml` omits *any one* knob, the config.py default wins and DashScope 404s on an unknown model. We therefore **change the vendored `config.py` defaults to Qwen bare names** (and mirror them in `config.yaml`), so a missing yaml key can never resurrect a non-Qwen slug. The full enumeration (verified against the live `config.py`):

| Config section.field | delapan default (must change) | qwen8 value |
|---|---|---|
| `exploration.planner_model` | `anthropic/claude-sonnet-4.6` | `qwen-flash` |
| `exploration.extraction_model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` |
| `exploration.extraction_fallback_model` | `openai/gpt-5.4-mini` | `qwen-flash` |
| `exploration.evaluation_model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` |
| `deepen.decompose_model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` |
| `deepen.critic_model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` |
| `narration.model` | `google/gemini-2.5-flash` | `qwen-flash` |
| `knowledge_graph.extraction_model` | `anthropic/claude-sonnet-4.6` | `qwen-max` *(KG off for demo)* |
| `knowledge_graph.extraction_fallback_model` | `openai/gpt-5.4-mini` | `qwen-plus` |
| `concepts.extract_model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` |
| `synopsis.model` | `claude-haiku-4-5` | `qwen-flash` |
| `okf.model` | `anthropic/claude-sonnet-4.6` | `qwen-plus` *(concept-doc route dropped; inert)* |
| `embedding.model` | **`text-embedding-3-small`** | **`text-embedding-v4`** |
| `embedding.dim` | `1536` *(already correct)* | `1536` |
| `agent.model` / `agent.fast_model` | `claude-sonnet-4-6` / `claude-haiku-4-5` | *(chat agent not vendored — inert; set to `qwen-plus`/`qwen-flash` so the grep below stays clean)* |

**`embedding.model` defaults to `text-embedding-3-small` and MUST be overridden** — `embedding.dim` already defaults to 1536, but the model name does not. Society role models (Planner/Critic/Synthesizer) come from a new `SocietyConfig` (Section 7.5), also Qwen.

**Two acceptance checks (Section 11):**
- `assert "/" not in resolved_name` for every model field at startup (catches an un-overridden gateway slug like `anthropic/…`).
- A grep gate: `grep -nE "anthropic/|openai/|google/|gpt-|claude-|gemini-" config.yaml` returns **zero** hits (a judge grepping `config.yaml` must see no non-Qwen model string), alongside the `grep delapan` import gate.

---

## 6. The Society Module (NEW code)

The society module is the only genuinely new code. It is small: ~5 files, one new table, one index, five gap functions. Roles call the vendored engine for all heavy lifting and run at most one Qwen prompt of their own.

### 6.1 Gap/task data model + atomic claiming

**One new SQLite table `gaps`, baked into `store/sqlite.py::_SCHEMA`** (we are already editing that file for the db-path rename, so this is the clean place — it removes the `store._conn` private-attr reach the draft proposed and guarantees the table lives on the same cached connection the loop uses):

```sql
CREATE TABLE IF NOT EXISTS gaps (
  id          TEXT PRIMARY KEY,
  kb_id       TEXT NOT NULL,
  project_id  TEXT NOT NULL,              -- threaded into run_exploration (required, no default)
  parent_id   TEXT,                       -- self-FK: gap this was spawned/reopened from
  question    TEXT NOT NULL,              -- the run_exploration prompt AND the coverage query
  reason      TEXT,                       -- last reopen reason: NULL | 'sharpen' | 'insufficient'
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','claimed','verified','done','dead')),
  owner       TEXT,                       -- researcher id holding the claim
  coverage    TEXT,                       -- 'rich' | 'sparse' | 'gap' | NULL (last band)
  band1_hits  INTEGER NOT NULL DEFAULT 0, -- count of band-1 (rich) match hits at last recompute
  attempts    INTEGER NOT NULL DEFAULT 0,
  finding_ids TEXT,                       -- JSON list of merged finding ids
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gaps_kb_status ON gaps(kb_id, status, coverage);
```

**Status lifecycle:** `open` → `claimed` (researcher) → `verified` (findings landed) → `[Critic]` `done` | `open` (reopen, `attempts++`, `reason` set) ; → `dead` when `attempts >= max_attempts` and still not `rich`.

**Atomic claim — what actually makes it safe (the draft got this wrong).** Verified against the source: `SQLiteStore` holds **one** long-lived `sqlite3.Connection` (`check_same_thread=False`), and every `async def` store method runs a **synchronous** `self._conn.execute(...)` with **no `run_in_executor`/`to_thread`** (zero thread offload in `sqlite.py`). So `asyncio.gather` over N `Researcher.step()` coroutines does **not** produce concurrent DB writes: they run on one event-loop thread, and each store call blocks that thread until it returns. The claim is atomic for one reason only — it is a **single `UPDATE … WHERE id=(SELECT … LIMIT 1)` executed on one connection in one thread**, and **`cursor.rowcount` arbitrates** the winner. **WAL + `busy_timeout=5000` are belt-and-suspenders for the *background* synopsis/KG fire-and-forget writes (which may run on a different thread), NOT the cross-coroutine claim arbiter.** The real concurrency in the system is the **in-flight Tavily/DashScope HTTP `await`s** inside `run_exploration` overlapping across researchers — *not* DB parallelism, and not the CPU-bound `FindingMerger` (which blocks the loop).

```sql
UPDATE gaps SET status='claimed', owner=?, updated_at=?
WHERE id = (
  SELECT id FROM gaps
  WHERE kb_id=? AND status='open'
  ORDER BY
    CASE coverage WHEN 'gap' THEN 0 WHEN 'sparse' THEN 1 WHEN 'rich' THEN 2 ELSE 0 END,
    attempts ASC, created_at ASC
  LIMIT 1
);
-- then: assert cursor.rowcount == 1; commit; SELECT the claimed row.
```

> **Invariant (correctness-critical):** there must be **no `await` between the claim's read-modify and its `commit`**. The `UPDATE` + `commit` is a single synchronous sequence on the shared connection; an `await` inserted between them would yield the event loop to another coroutine that could observe partial state. `claim_gap` does only sync `self._conn.execute(...)` + `self._conn.commit()` — no `await` inside.

> **NULL handling is load-bearing:** freshly seeded gaps have `coverage=NULL`. The `CASE` maps `NULL → 0` (same rank as `gap`) so unexplored questions are picked up *first*; an unhandled `NULL` would sort them last and starve new work.

This *is* the negotiation: researchers never message each other; they compete for the worst-covered open gap and the DB arbitrates (coverage rank → fewest attempts → oldest).

> **Test design (M4):** `test_blackboard_claim` must be made *meaningful*, not trivially-passing. Either (a) insert an explicit `await asyncio.sleep(0)` yield point inside the test harness between seeding and the two `claim_gap` calls to prove the single-statement `UPDATE` is still atomic under a real loop yield, **or** (b) open a *second* `SQLiteStore` on the same **file-backed** `db_path` (never `:memory:` — see 6.4 note) to exercise genuine two-connection WAL contention. Assert exactly one claim wins and the other returns `None`. Also add a test that the claim still holds if a store method is later moved to a thread pool.

### 6.2 Role classes — models, prompts, tools

All roles use DashScope bare model names (Section 7). Roles use `structured_completion` with `use_json_schema=False` (DashScope has no `json_schema` mode — see Section 7).

**Planner** — model **qwen-max** (low-frequency, runs once; quality matters for decomposition).
- `def __init__(self, store, *, org_id, project_id, kb_id, cfg)`
- `async def seed(self, topic: str) -> list[Gap]` — one `structured_completion` call; writes `status='open', coverage=NULL` gaps via `create_gaps` (each carries `project_id`). Dedupe output on normalized question text before insert (cheap guard against duplicate gaps wasting researcher slots).
- **Prompt:** *"Decompose this research topic into 4–8 INDEPENDENT, atomic sub-questions, each answerable from a few web sources. Return a single JSON object `{"questions":[{"question": ..., "rationale": ...}]}`. No overlap, no compound questions."*
- Tools: store only.

**Researcher** — model **qwen-plus** (the engine's own planner/extractor/evaluator run under this). N = 2 for the demo (Section 11/12).
- `def __init__(self, store, *, org_id, project_id, kb_id, cfg, researcher_id: str)`
- `async def step(self) -> bool` — claim, research, persist, verify. The **worked path** (must match the real engine signatures + the `mcp/server.py` render→embed→insert sequence):

```python
async def step(self) -> bool:
    gap = claim_gap(self.store, self.kb_id, owner=self.researcher_id)  # sync; no await inside
    if gap is None:
        return False

    # Coverage recompute (the scheduling signal + the rich-skip gate).
    emb = await embed_text(gap.question)
    rows = await self.store.match_findings(
        self.kb_id, emb, self.cfg.search.match_count, self.cfg.search.min_similarity,
    )
    bands = band_findings(rows, self.cfg.tiers)          # needs TiersConfig
    cov = assess_coverage(bands, self.cfg.tiers)         # 'rich'|'sparse'|'gap'

    # Rich-skip budget gate — but DO NOT short-circuit a 'sharpen' reopen
    # (the question changed; old findings' band is stale). See the LOW fix in 6.3.
    if cov == "rich" and gap.reason != "sharpen":
        complete_gap(self.store, gap.id, gap.finding_ids or [],
                     coverage=cov, band1_hits=len(bands[1]), status="verified")
        return True

    # Research: create the exploration ROW first (run_exploration needs a real id
    # AND project_id, both required, no defaults).
    exp_id = self.store.create_exploration(self.org_id, self.kb_id, gap.question)
    findings = await run_exploration(
        gap.question,
        exploration_id=exp_id,
        project_id=self.project_id,    # REQUIRED — no default on the engine signature
        kb_id=self.kb_id,
        cfg=self.cfg.exploration,
        lens="explore",
    )

    # Embed + insert — the engine returns UNEMBEDDED Findings whose `content` is a
    # dict. Mirror mcp/server.py: render each dict to a markdown BODY, embed the
    # bodies in ONE batch, build rows with the EXACT insert_findings key set.
    ids = []
    if findings:
        rows_ins, bodies = [], []
        for f in findings:
            body = _render_content(f.content)          # vendored from mcp/server.py
            rows_ins.append({
                "org_id": self.org_id,
                "kb_id": self.kb_id,
                "title": f.title,
                "content": body,                        # = the rendered body string
                "category": f.category,
                "confidence": float(f.confidence) if f.confidence is not None else None,
                "tags": list(f.tags or []),
                "provenance": _normalize_provenance(f.provenance),
            })
            bodies.append(body)
        embeddings = await embed_batch(bodies)          # ≤10/call chunking inside
        for row, e in zip(rows_ins, embeddings):
            row["embedding"] = e
        ids = await self.store.insert_findings(rows_ins)

    self.store.update_exploration(exp_id, status="completed",
                                  completed_at=_now_iso(), finding_ids=ids)

    # Recompute coverage AFTER the new findings land, for the gap's banded state.
    emb2 = await embed_text(gap.question)
    rows2 = await self.store.match_findings(
        self.kb_id, emb2, self.cfg.search.match_count, self.cfg.search.min_similarity)
    bands2 = band_findings(rows2, self.cfg.tiers)
    cov2 = assess_coverage(bands2, self.cfg.tiers)
    complete_gap(self.store, gap.id, ids, coverage=cov2,
                 band1_hits=len(bands2[1]), status="verified")
    return True
```

- Runs **no LLM prompt of its own** beyond what the vendored pipeline does.
- Tools: exploration engine + store.
- > **Critical build-time bug to avoid (the engine does NOT embed):** `run_exploration` returns `Finding` objects with **no embedding** and **`content` as a `dict`** (verified `models.py`). The Researcher MUST `_render_content(f.content)` → `embed_batch(bodies)` → rows with `content=body` + `embedding`, or `vec_findings` stays empty, coverage never sees the new findings, the Critic reopens forever, and everything caps out as `dead`. Use `embed_batch` (one call, ≤10-chunked) — not `embed_text` per finding.

**Critic** — model **qwen-max** (adversarial verdict = trust artifact).
- `def __init__(self, store, *, kb_id, cfg, max_attempts: int = 2, spawn_budget: int)`
- `async def review(self) -> int` — for each `verified` gap, recompute coverage from a *fresh* `match_findings` (same snippet: `emb = await embed_text(gap.question); rows = await store.match_findings(kb_id, emb, cfg.search.match_count, cfg.search.min_similarity); bands = band_findings(rows, cfg.tiers); cov = assess_coverage(bands, cfg.tiers)`). If `rich` → `done`. If `attempts >= max_attempts` → `dead`. Else `reopen_gap(reason=…)` (`status='open'`, `attempts++`) and *optionally* one Qwen call. The Qwen call decides between two reopen reasons:
  - **`'sharpen'`** — the question itself was too broad/wrong; emit a sharper `question` (and optionally a child gap with `parent_id` set, subject to the **global spawn budget**). The new question means the Researcher must re-run exploration (it will NOT short-circuit on stale findings — see 6.3 LOW fix).
  - **`'insufficient'`** — the question is fine, sources are just thin; keep the same question, let the Researcher try again.
- **Prompt:** *"Given this sub-question and the titles+snippets of findings gathered, is it sufficiently answered? Return a single JSON object `{"answered": bool, "reason": "sharpen"|"insufficient", "question": <sharper question or null>}`. If `sharpen`, provide a narrower question."*
- Tools: store (+ exploration via reopened gaps next round).

**Synthesizer** — model **qwen-max** primary (stronger reasoning; the role-mapping recommendation). **qwen-long is the opt-in** for genuinely huge contexts only, *not* the default — qwen-long's ~60K TPM cap is dangerous when the Synthesizer's whole job is to stuff all `done` gaps' findings into one prompt, which can 429 mid-demo on the climactic "report appears" beat.
- `def __init__(self, store, *, kb_id, cfg)`
- `async def run(self, topic: str) -> str` — fires once no `open`/`claimed`/`verified` gaps remain. Pulls `done` gaps' findings via `store.get_finding`, **caps input by selecting top-K findings per gap by confidence/similarity** (never dump all), runs one Qwen call to write a grounded cited answer with a **429 backoff + a 'partial report' fallback** so the demo never hard-fails, and optionally `upsert_kg_nodes`/`upsert_kg_edges` (off for demo) to record synthesized concepts (`grounded_in: list[finding_id]`).
- **Prompt:** *"Write a cited synthesis answering the root topic. Use ONLY the provided findings; cite each claim with `(finding_id: ...)`. List any sub-questions that remain dead/unanswered. Return a JSON object with `report` (markdown) and `unanswered` (list)."*
- Tools: store + KG.

### 6.3 Coordination loop + termination

`async def run_society(topic: str, *, org_id: str, project_id: str, kb_id: str, cfg: AppConfig, n_researchers: int = 2, max_rounds: int = 3, max_attempts: int = 1, spawn_budget: int = 4, on_event: Callable[[str, dict], Awaitable[None]] | None = None, store=None) -> SocietyResult`

*(Demo defaults: `n_researchers=2, max_rounds=3, max_attempts=1` per the token budget in Section 12. `org_id/project_id/kb_id` are resolved by the bootstrap in Section 6.5 before the loop runs.)* **`cfg` is the full `AppConfig`** — roles dereference `cfg.search`/`cfg.tiers`/`cfg.exploration`/`cfg.society`, so passing a bare `SocietyConfig` would `AttributeError`. **`on_event(name, data)`** is the optional hook (guarded `if on_event:`) the role bodies call to emit the eleven §8.2 SSE frames; **`store`** is the API route's already-resolved `SQLiteStore` (when `None`, `run_society` resolves the cached singleton via `QWEN8_DB_PATH` — the route and the loop MUST share one DB file, else the stream and the brain desync).

1. **Seed.** `Planner.seed(topic)` writes initial `open` gaps.
2. **Round loop.** `asyncio.gather()` over `N` `Researcher.step()` coroutines, each draining gaps until `claim_gap` returns `None`. They self-distribute via the atomic claim. Findings flow back via `insert_findings` + `complete_gap(status='verified')`. (`run_exploration` is IO-bound — the overlap is the in-flight **Tavily/DashScope HTTP awaits** across researchers; the lone shared DB connection and the CPU-bound `FindingMerger` serialize on the one event-loop thread. This is overlapping crawls, *not* multi-process parallelism — do not claim the latter.)
3. **Critique.** `Critic.review()` re-bands every `verified` gap → `done` or reopen (`attempts++`, `reason` set), possibly spawning child gaps (bounded by `spawn_budget`).
4. **Termination check** (after each round): stop if **(a)** no rows in `open`/`claimed`/`verified`, **OR (b)** `round >= max_rounds`, **OR (c)** a full sweep produced **no improvement on the monotonic progress scalar**.
   - **"Improvement" is defined on a monotonic scalar**, NOT on band-change (which can read a real `sparse→still-sparse` hit-count gain as "no progress" and halt prematurely): `progress = (# gaps in 'done') * 1000 + Σ band1_hits over open/verified gaps`. The `*1000` makes a newly-`done` gap dominate; the `band1_hits` sum captures within-band gains. Guard (c) fires only when `progress` is unchanged across a full sweep.
   - **Child-gap spawning is subject to a global `spawn_budget`** (default 4) decremented on each spawn, so a Critic that always wants a child cannot defeat guard (c) by keeping "something reopened" perpetually true.
   - **`attempts >= max_attempts → dead`** is the per-gap backstop for permanently-`sparse` questions (sources just don't exist).
   - Guards (b), (c), and the attempts cap are **mandatory and independent** — any one halts the loop within bounded LLM calls.
5. **Synthesize.** `Synthesizer.run(topic)` once the loop exits → `SocietyResult`.

> **LOW fix — rich↔reopen oscillation:** the Researcher's rich-skip gate (6.2) must NOT short-circuit when `gap.reason == 'sharpen'` — a sharpen-reopen changed the question, so the old findings' band is stale; the Researcher runs fresh exploration on the new question. Without this, a Critic that reopens a band-`rich`-but-judged-insufficient gap and the Researcher's gate ping-pong until the attempts cap, wasting attempts. Covered by a `test_reopen_then_claim` case (asserts new exploration runs after a `sharpen` reopen).

### 6.4 New files + key signatures

Under `qwen8/society/`:
- `__init__.py` — re-exports `run_society`, `Gap`, `SocietyResult`.
- `blackboard.py` — `Gap` dataclass; `GapStatus = Literal['open','claimed','verified','done','dead']`; the five gap functions operating on `store._conn` + `commit` (each a **single statement + commit, no `await` between** — the gaps table itself is created by `_SCHEMA` in `sqlite.py`, so there is no `ensure_gaps_schema` and no private-attr-only setup path):
  - `create_gaps(store, kb_id, project_id, gaps) -> list[str]`
  - `claim_gap(store, kb_id, owner) -> Gap | None` (atomic conditional UPDATE + rowcount check; sync; no await inside)
  - `complete_gap(store, gap_id, finding_ids, *, coverage, band1_hits, status) -> None`
  - `reopen_gap(store, gap_id, *, coverage, reason, question=None, parent_id=None) -> None`
  - `list_gaps(store, kb_id, status=None) -> list[Gap]`
- `roles.py` — `Planner` / `Researcher` / `Critic` / `Synthesizer` + their `_PROMPT` constants (signatures in 6.2).
- `loop.py` — `run_society` + termination logic + **`SocietyResult` dataclass**:
  ```python
  @dataclass
  class SocietyResult:
      topic: str
      kb_id: str
      report: str                 # the Synthesizer's cited markdown (or partial)
      unanswered: list[str]       # dead/unanswered sub-questions
      gaps: list[Gap]             # final gap rows (status/coverage/attempts)
      rounds: int                 # rounds executed
      finding_count: int          # total findings persisted this run
  ```
- `prompts.py` — *(optional)* the four prompt templates if `roles.py` grows long.

> **Singleton/`:memory:` gotcha (LOW fix):** `get_store()` caches one `SQLiteStore` per `db_path` in `_local_stores`. Because the `gaps` table is in `_SCHEMA`, any store on the same **file** DB has it. But a `:memory:` DB is per-connection — if a test or a stray route builds a second store, an in-memory `gaps` table diverges from the loop's. **Tests must use a file-backed temp DB, never `:memory:`**, and `run_society` asserts its `store` is the cached singleton for the resolved `db_path`. The gaps table living in the *same db file* as a vendored delapan brain is the second cross-pollution surface (after config) — the 5.3 startup `assert ".qwen8" in db_path` covers it.

### 6.5 Project/KB bootstrap (the engine needs org_id + project_id, not just kb_id)

`run_exploration` and `create_exploration` need `org_id` + `project_id`, which `kb_id` alone doesn't supply. Before the loop, the society resolves them via the Store seam (SQLiteStore's synthetic `org_id='local'`):

```python
org_id, project_id = store.resolve_project(project_name, create=True)   # ('local', <pid>)
kb_id = store.resolve_kb(org_id, project_id, kb_name, create=True)
```

`POST /…/society/start` takes `{topic, kb?, n_researchers?, max_rounds?}`; the route's `resolve_kb_or_404`-style dependency (or a create variant) yields the `TenantContext` (`org_id`, `project_id`, `kb_id`), which `run_society` threads into the Planner/Researcher/Critic and into each gap row's `project_id`.

---

## 7. Qwen Cloud Integration

Both client modules already use `AsyncOpenAI(api_key=..., base_url=...)`, so the swap is a base_url + key + model-name change — **no SDK swap**.

> **External-fact caveat (applies to all of Section 7):** the specific DashScope numbers below — `text-embedding-v4` being the only 1536-dim model, the ≤10-text batch cap, `qwen-max` 120 RPM / 100K TPM, and the 1M-token/model/90d free quota — are **external Alibaba facts not verifiable from code**. They are **"verify at session time"** via `GET https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models` + the DashScope pricing/limits page. The **day-1 smoke test (Section 11 criterion 3) is a HARD GATE before any vendoring effort is sunk** (Section 12 / M0). The ≤10 embed chunking stays regardless — it is harmless if the true cap is higher.

### 7.1 Endpoint, env vars, region

- **Base URL:** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (Singapore/International — the region with free quota; US/Beijing/HK keys and URLs are not interchangeable — verify at session time).
- **API key env var:** `DASHSCOPE_API_KEY` (minted at `dashscope-intl.console.aliyun.com`, Singapore region).
- **Model names are bare strings** — no `provider/` prefix.

### 7.2 Role → model mapping (defaults baked into config.py per 5.6)

| Role / call site | DashScope model | Config knob |
|---|---|---|
| Engine planner (per explore) | `qwen-flash` | `exploration.planner_model` |
| Extractor (researcher core) | `qwen-plus` | `exploration.extraction_model` |
| Extractor fallback | `qwen-flash` | `exploration.extraction_fallback_model` |
| Evaluator (reflection) | `qwen-plus` | `exploration.evaluation_model` |
| Deepen decompose + critic *(MCP tool out of MVP)* | `qwen-plus` | `deepen.decompose_model`, `deepen.critic_model` |
| Narration (throwaway) | `qwen-flash` | `narration.model` |
| KG extraction *(OFF for demo)* | `qwen-max` | `knowledge_graph.extraction_model` |
| KG extraction fallback | `qwen-plus` | `knowledge_graph.extraction_fallback_model` |
| Concepts extract | `qwen-plus` | `concepts.extract_model` |
| Society Planner | `qwen-max` | `society.planner_model` |
| Society Critic | `qwen-max` | `society.critic_model` |
| Society Synthesizer | `qwen-max` (opt-in `qwen-long`) | `society.synthesizer_model` |
| **Embeddings** | `text-embedding-v4`, `dimensions=1536` | `embedding.model` / `embedding.dim` |

### 7.3 Precise client/config edits

**`config.py`** — change every model default to Qwen (5.6 table). For the provider credentials, the recommended approach is the **zero-client-change fast path**: set `AI_GATEWAY_API_KEY=<dashscope key>` and `AI_GATEWAY_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1` in `.env`. Both `ai_gateway.gateway_client()` and `embeddings._get_client()` already read base_url+key from settings, so they need **no edit** for the swap. *(An explicit `dashscope_*` Settings pair is only worthwhile if you want the Vercel AI Gateway available side-by-side — not needed for the hackathon; Open Q resolved in favor of the fast path.)*

**`ai_gateway.py`** — the one required behavioral change is structured output: **DashScope OpenAI-compat supports `response_format={"type":"json_object"}` ONLY — no `json_schema`** (verify at session time). Two constraints on `json_object` mode: (1) the messages must contain the literal word `json` (the system prompts already say "Return ONLY a single JSON object …" — satisfied), and (2) thinking/reasoning mode is mutually exclusive with structured output. The strict `_parse_json_schema` path will 400 and fall through to `_parse_prompt_json` via the existing try/except — works as-is but wastes one round-trip per call. **Decision: pass `use_json_schema=False` on the hot structured paths** (planner/extractor/society roles) to skip the wasted call.

**`embeddings.py`** — `_get_client()` needs no change under the fast path; keep `dimensions=emb.dim` (=1536). **Required fix:** `embed_batch` currently sends the whole list in **one** `create()` call (verified — no chunking). Add a loop that slices `texts` into groups of ≤10, calls `embeddings.create` per group, and concatenates in input order. Without this, any ingest batch >10 chunks 400s **if** the ≤10 cap holds (verify at session time; harmless insurance if it doesn't).

**`config.yaml`** — set every model name to its Qwen value per the 5.6 table (mirroring the config.py defaults so neither source can resurrect a non-Qwen slug), set `reasoning_effort: null` everywhere it feeds a structured-output call (thinking mode breaks `json_object`; the omit-based code drops the param when `None`), and **pin `exploration.search_mode: tavily`** (not `auto`) so web research can never silently hand off to a non-existent host agent and return `[]` (Section 13 / Open Q closed).

### 7.4 The sqlite-vec dimension implication

`store/sqlite.py` `_SCHEMA` hardcodes `vec0(... embedding float[1536])` as **literal text** (not parameterized by `config.embedding.dim`), at two declarations (`vec_findings`, `vec_kg_nodes`). vec0 virtual tables **cannot ALTER** their declared dimension — changing it means DROP + CREATE + re-embed the whole KB. **Decision: standardize on `text-embedding-v4` at `dimensions=1536`** so the existing schema is preserved with **zero migration**. The claim that v4 is the *only* DashScope model emitting 1536-dim, and that v3 maxes at 1024, are **external facts to verify at session time** (criterion 3 hard gate). **Pre-decided fallback:** if v4@1536 is unavailable or not honored, the brain's whole embedding dimension changes — that is a DROP+CREATE on `_SCHEMA`'s two `float[1536]` literals plus a re-embed, which is why the day-1 embedding smoke test gates everything. The whole shared brain must standardize on one embedding model — vectors from different models/dims are incomparable.

### 7.5 SocietyConfig (NEW config section)

Add a `SocietyConfig` pydantic model to `config.py` (and a `society:` block to `config.yaml`), in `AppConfig` as `society`:

```python
class SocietyConfig(BaseModel):
    planner_model: str = "qwen-max"
    critic_model: str = "qwen-max"
    synthesizer_model: str = "qwen-max"     # qwen-long is opt-in for huge contexts only
    temperature: float = 0.2
    reasoning_effort: str | None = None      # null — thinking mode breaks json_object
    n_researchers: int = 2                   # DEMO default
    max_rounds: int = 3                      # DEMO default
    max_attempts: int = 1                    # DEMO default
    spawn_budget: int = 4                    # global child-gap spawn cap
    synthesis_top_k_per_gap: int = 8         # cap findings fed to the Synthesizer
    kg_extraction_enabled: bool = False      # OFF for demo (most qwen-max-hungry)
    max_llm_calls_per_run: int = 120         # per-run kill-switch (graceful stop)
```

Env overrides use the `QWEN8_SOCIETY__<FIELD>` form (e.g. `QWEN8_SOCIETY__N_RESEARCHERS=2`, `QWEN8_SOCIETY__MAX_ROUNDS=3`). The role classes (6.2) read models from `cfg.society.*`; the loop reads `n_researchers`/`max_rounds`/`max_attempts`/`spawn_budget` defaults from here. `max_llm_calls_per_run` is the per-run kill-switch — and it is a **real monotonic counter, not a round-count proxy**: implemented in `qwen8.core.clients.ai_gateway` as a module-level count with `reset_llm_calls()` / `llm_calls()`, incremented at the top of **both** `structured_completion` and `text_completion` (so it captures the engine's internal extractor/evaluator/planner calls too). `run_society` calls `reset_llm_calls()` at start and tests `llm_calls() >= cfg.society.max_llm_calls_per_run` at round-top and inside the per-researcher drain; on trip the loop stops gracefully and the Synthesizer emits a partial report.

---

## 8. Frontend Demo (sigma.js)

The `delapan-ai/frontend` is React 18 (TS strict, `noUnusedLocals`/`noUnusedParameters`) + Vite 6 + Zustand + sigma.js/graphology. **Honest reuse:** qwen8 reuses the read endpoints and the entire graph canvas/Zustand/undo stack unchanged; the **society SSE event protocol is NET-NEW on both ends**, and `society.ts`, `ReportOverlay`, `contributors.ts`, the persistent coverage meter, and gap markers do **not** exist yet (verified: `api/` has only `client.ts`/`types.ts`/`mock.ts`; `panels/` has `ConceptDocReader` but no `ReportOverlay`; `graph/` has no `contributors.ts`). This is real build work, not "~90% additive config flip."

### 8.1 What is genuine reuse vs net-new

- **Genuine reuse (zero/low code):** the graph canvas + reducers, Zustand store, undo/redo, the read endpoints (`/graph`, `/stats`, `/schema`, `/findings`, `/synopsis`, `/resume`, `/projects`), and `okf/markdown.ts`. `client.ts` defaults `BASE` to `http://127.0.0.1:8001` and hardcodes `kbPath = /api/projects/{p}/kbs/{k}` — because qwen8 mounts `/society/*` under that **same** prefix (8.2), pointing the frontend at qwen8 is `VITE_API_BASE` (or the Vite proxy) with no kbPath change.
- **Net-new (M7a/M7b):** `src/api/society.ts` (SSE consumer), a full-parity strict-TS mock, `types.ts` additions (`SocietyEvent` union + `contributor`), `contributors.ts` + contributor coloring, gap markers, the persistent coverage meter, and `ReportOverlay`.

### 8.2 Backend API contract — society routes under the SAME prefix

qwen8 reuses the existing prefixed read endpoints and adds **one new SSE endpoint + a polling fallback, all under `/api/projects/{p}/kbs/{k}/`** so the frontend's `kbPath` is untouched. (The existing read SSE — `routes_explore.py` — emits a **flat `{phase, detail}`** shape; the society stream is a *new* named-event protocol, produced by `run_society` feeding an `asyncio.Queue` the route drains, exactly the queue pattern `routes_explore._events` uses.)

**Endpoints (real prefixed paths):**
- `POST /api/projects/{p}/kbs/{k}/society/start` — body `{topic, n_researchers?, max_rounds?}` → `{kb_id, run_id}`.
- `GET /api/projects/{p}/kbs/{k}/society/stream?run_id=...` — **SSE**, named-event frames (preferred live mechanism).
- `GET /api/projects/{p}/kbs/{k}/society/state?run_id=...` — snapshot fallback `{nodes, edges, gaps[status,claimed_by], coverage, contributors, report}`, **reconstructed from the blackboard (gaps + findings)** so it survives a process restart and matches the frame mapping below; the frontend diffs snapshots.
- Existing read endpoints unchanged: `GET /api/projects/{p}/kbs/{k}/graph`, `/graph/stats`, `/graph/schema`, `/findings`, `/synopsis`, `/resume`, and `GET /api/projects`.

**SSE frame schema (NET-NEW — frozen as a contract artifact at end of M6, per Section 12).** Each frame is `event: <name>\ndata: <json>\n\n`. Node/edge payloads match the `/graph` wire shape (`id/type/label/properties/grounded_in/created_at`; edges add `source/target/relation`); IDs are stable + unique (the graph is `multi`+`directed`). **`node_added`/`edge_added` are SYNTHESIZED by `run_society` from the blackboard, not the KG** (KG extraction is OFF for the demo): each gap → a `question` node, each persisted finding → a `finding` node + an `answers` edge to its gap. All eleven frames are emitted from the role bodies through the `on_event` hook (6.3) — so "the graph grows live" is driven by gaps opening and findings landing, which is the on-thesis view of the shared brain.

| `event:` | `data` JSON payload |
|---|---|
| `phase` | `{ "phase": "seeding"|"researching"|"critiquing"|"synthesizing", "round": int }` |
| `node_added` | `{ "id": str, "type": str, "label": str, "properties": {...}, "grounded_in": [str], "created_at": iso, "contributor": str, "role": "researcher"|"synthesizer" }` |
| `edge_added` | `{ "id": str, "source": str, "target": str, "relation": str, "properties": {...}, "grounded_in": [str], "created_at": iso }` |
| `finding_merged` | `{ "finding_id": str, "gap_id": str, "title": str, "contributor": str }` |
| `gap_opened` | `{ "gap_id": str, "question": str, "parent_id": str|null }` |
| `gap_claimed` | `{ "gap_id": str, "claimed_by": str, "role": "researcher" }` |
| `gap_filled` | `{ "gap_id": str, "coverage": "rich"|"sparse"|"gap", "finding_ids": [str], "status": "verified"|"done" }` |
| `coverage` | `{ "gap_id": str|null, "coverage": "rich"|"sparse"|"gap", "band1_hits": int, "overall": "rich"|"sparse"|"gap" }` |
| `report` | `{ "report": str (markdown), "unanswered": [str] }` |
| `done` | `{ "run_id": str, "rounds": int, "finding_count": int, "gaps_done": int, "gaps_dead": int }` |
| `error` | `{ "error": str, "fatal": bool }` |

**Mock parity is mandatory** (TS strict; `mock.ts` auto-engages on network failure). M7a adds `src/api/society.ts` + a full-parity mock that can replay a canned run, and extends `types.ts` with a `SocietyEvent` discriminated union (one member per `event:` above) + `contributor`. The auto-mock can silently mask a down qwen8 (a "MOCK DATA" badge appears in `StatusBar`) — watch for it or surface it loudly during the demo.

**CORS — already solved upstream; just extend it.** `api/main.py` already adds `CORSMiddleware` allowing `localhost:5173`/`127.0.0.1:5173` + `cors_origins` (verified). Do NOT re-add CORS. Two real, narrower issues: (1) Starlette's `CORSMiddleware` does **not** attach headers to **unhandled 500s** (so a route exception reads as a network error and silently flips the client to mock) — wrap society/route handlers in try/except returning `JSONResponse` so 500s carry CORS headers; (2) the ECS public-IP origin won't be in the allow-list — add it (or `*` for the demo window) to `cors_origins`, or prefer the Vite proxy for the demo.

---

## 9. Alibaba Cloud Deployment

**Recommended primary: Alibaba Cloud ECS, `ap-southeast-1` (Singapore).** It matches the Qwen-intl region (low latency to dashscope-intl), is on the recommended-services list, gives a persistent local disk that suits single-writer SQLite, keeps the always-on society loop trivially alive, needs no VPC/NAS plumbing, and produces the most legible proof video. Instance: 1× burstable `ecs.t6`/`ecs.e`-family, ~1–2 vCPU / 2–4 GB, Ubuntu 22.04, ~40 GB system disk; public IP; security group ingress 80/443 (or app port). **See the security note in 9.4 — `/society/start` is an unauthenticated quota-burning POST; do not leave write routes open to `0.0.0.0/0`.**

*Fallback:* SAE with the same image, a NAS volume mounted at the SQLite path, **pinned to exactly 1 replica**, exposed via EIP/NLB. *(NFS advisory locking is fragile for SQLite — never >1 replica; OSS cannot host a live `.db`.)* Function Compute is viable (custom container, SSE supported, `CAPort=9000`, AMD64-only, NAS-only persistence) but the weakest hackathon fit.

### 9.1 Dockerfile sketch

```dockerfile
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY qwen8 ./qwen8
COPY config.yaml ./
RUN pip install --no-cache-dir '.[local]'        # fastapi…+ sqlite-vec; NO langchain/supabase
ENV QWEN8_DB_PATH=/data/qwen8.db
VOLUME /data
EXPOSE 8001
# api/main.main() binds 127.0.0.1 — the uvicorn CLI overrides host to 0.0.0.0:
CMD ["uvicorn", "qwen8.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
```
Build for **linux/amd64** (`docker buildx build --platform linux/amd64 ...`) — the dev machine is Apple Silicon, Alibaba runtimes are AMD64.

### 9.2 SQLite persistence

Store the brain on the instance's local disk at `/data/qwen8.db`, bind-mounted:
```
docker run -d --name qwen8 -p 80:8001 -v /data:/data \
  -e AI_GATEWAY_API_KEY=<dashscope key> \
  -e AI_GATEWAY_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1 \
  -e TAVILY_API_KEY=... \
  -e QWEN8_DB_PATH=/data/qwen8.db \
  -e QWEN8_SOCIETY_SECRET=<shared secret>  \
  <acr>/qwen8:demo
```
A real POSIX filesystem → SQLite WAL + locking behave normally and survive restarts. The "shared brain" is simply all role coroutines in this one process hitting this one file. Back up by copying `/data/qwen8.db`.

### 9.3 Deploy + proof-of-deployment capture

**Deploy:** (1) create Alibaba Cloud International account, add payment method, activate Model Studio at `dashscope-intl.console.aliyun.com`, mint an *-intl* API key **days early** (real-name/billing verification can block activation for days — this is a front-loaded week-1 task, see M-A1). (2) Create an ACR namespace in `ap-southeast-1`; `docker buildx build --platform linux/amd64 -t <acr>/qwen8:demo .`; push. (3) Create the ECS instance; SSH in; install Docker; `docker login` ACR; `docker pull`; `docker run` (above). (4) Verify `curl http://<ECS_PUBLIC_IP>/health`.

**Proof video (single screen, no cuts) — the SEPARATE proof-of-deployment artifact, NOT the <3:00 judged video:**
- Show the ECS console: the instance, its public IP, region `ap-southeast-1`.
- SSH in and `docker logs -f qwen8` so the society-loop logs stream live.
- In a second pane, `curl -H 'X-Society-Secret: <secret>' http://<ECS_PUBLIC_IP>/api/projects/demo/kbs/demo/society/start -d '{"topic":"..."}'` — the request lands on the Alibaba endpoint and the matching log line appears.
- Let a log line show an outbound DashScope/Qwen call **and** a Tavily call, proving the full path.
- Optionally show a browser hitting the public IP / the sigma.js dashboard growing.

**The <3:00 judged video uses a PRE-WARMED run** (M9): a real society run takes minutes (Tavily crawls + LLM rounds) and does not fit live in <3:00. Seed the brain beforehand so the on-camera run converges fast (the "already rich → skip exploration" gate helps), time-compress crawl waits, and show the deployment live *inside* the same <3:00 cut to satisfy the marketing-page interpretation. This ties: client request → Alibaba-hosted endpoint → backend logs → Qwen. The **terminal-demo-video** skill can script the proof recording reproducibly. **Also** include the code-file link (`qwen8/core/clients/ai_gateway.py` + `qwen8/core/config.py`) in the Devpost "Proof of Alibaba Cloud" field.

### 9.4 Security + teardown (hard checklist items)

- **`POST /society/start` is an unauthenticated, quota-burning, money-spending endpoint** exposed to the internet for the demo window — anyone can trigger paid LLM+Tavily calls. **Mitigation (required):** gate the society *write* routes behind a shared-secret header (`X-Society-Secret`, env `QWEN8_SOCIETY_SECRET`) **or** restrict the security group so the app port accepts `/society/start` only from your IP, while leaving the read routes open for a judge to browse. The per-run kill-switch (`max_llm_calls_per_run`, 7.5) caps the blast radius of any single triggered run.
- **STOP/release ECS + EIP after the demo** — a hard checklist item (M9/M10), not an afterthought, to avoid burning credits idle.

---

## 10. Repo Layout — `~/Repositories/8star/qwen8`

```
qwen8/
├─ LICENSE                         # AGPL-3.0
├─ README.md                       # run instructions + architecture diagram (image)
├─ pyproject.toml                  # AUTHORED FRESH (not copied): name=qwen8, packages=['qwen8'];
│                                  #   deps: fastapi, uvicorn[standard], httpx, openai,
│                                  #   tavily-python, mcp, pydantic, pydantic-settings, pyyaml;
│                                  #   [local]=sqlite-vec.  NO langchain/anthropic/supabase/asyncpg.
│                                  #   jinja2 only if an import check proves it's needed (HTML dropped).
├─ config.yaml                     # AppConfig knobs — ALL model names Qwen; embedding.model=text-embedding-v4;
│                                  #   embedding.dim:1536; search_mode:tavily; reasoning_effort:null; society: {...}
├─ Dockerfile
├─ .env.example                    # AI_GATEWAY_API_KEY(=DashScope key), AI_GATEWAY_BASE_URL,
│                                  #   TAVILY_API_KEY, QWEN8_DB_PATH, QWEN8_SOCIETY_SECRET
├─ docs/
│  ├─ design-spec.md               # this document
│  └─ architecture.svg             # the Section-4 diagram, rendered (Mermaid → CLI, see 13.4)
├─ deploy/
│  ├─ run.sh                       # docker buildx + push + ECS docker run
│  └─ proof-of-deployment.md       # recording script (terminal-demo-video beats)
├─ qwen8/
│  ├─ __init__.py
│  ├─ core/
│  │  ├─ config.py                 # Settings + AppConfig (+ SocietyConfig); env prefix QWEN8_; Qwen defaults
│  │  ├─ clients/
│  │  │  ├─ __init__.py
│  │  │  ├─ ai_gateway.py          # structured_completion / text_completion  [Alibaba-proof file]
│  │  │  ├─ embeddings.py          # embed_text / embed_batch (≤10/call chunking)
│  │  │  └─ tavily.py              # search / extract
│  │  ├─ agent/
│  │  │  ├─ __init__.py
│  │  │  ├─ state.py               # TenantContext (chat-only types trimmed)
│  │  │  ├─ synopsis.py            # _build rewired to ai_gateway.text_completion (langchain dropped)
│  │  │  └─ preamble.py            # band_findings / assess_coverage / select_preamble
│  │  ├─ exploration/
│  │  │  ├─ __init__.py  models.py  merger.py  planner.py  extractor.py
│  │  │  ├─ evaluator.py  narrator.py  engine.py  deepen.py   # deepen = disclosed precursor
│  │  └─ knowledge_graph/
│  │     ├─ __init__.py  models.py  extractor.py  schema.py  service.py  builder.py
│  ├─ store/
│  │  ├─ __init__.py                # get_store() / active_backend() (cloud branch never hit)
│  │  ├─ base.py                    # Store Protocol
│  │  └─ sqlite.py                  # SQLiteStore; _SCHEMA float[1536] + gaps table; ~/.qwen8/qwen8.db
│  ├─ society/                      # ← NEW CODE (the only new module)
│  │  ├─ __init__.py                # re-exports run_society, Gap, SocietyResult
│  │  ├─ blackboard.py              # Gap, GapStatus, 5 gap fns (gaps table is in _SCHEMA)
│  │  ├─ roles.py                   # Planner / Researcher / Critic / Synthesizer
│  │  ├─ loop.py                    # run_society + SocietyResult + termination
│  │  └─ prompts.py                 # (optional) prompt templates
│  ├─ api/                          # ← VENDORED (Tier 6) — the demo surface, EXISTS in delapan
│  │  ├─ __init__.py
│  │  ├─ deps.py                    # resolve_kb_or_404
│  │  ├─ health.py                  # GET /health
│  │  ├─ main.py                    # FastAPI app; CORS already present (+ deployed origin); register society router
│  │  ├─ routes_projects.py         # GET /api/projects
│  │  ├─ routes_findings.py         # /api/projects/{p}/kbs/{k}/findings
│  │  ├─ routes_kg.py               # /…/graph  — concept_doc import + /concept-doc handler PHYSICALLY DELETED
│  │  ├─ routes_explore.py          # /…/explore (SSE) — _missing_keys() edited (drop OPENAI_API_KEY)
│  │  └─ routes_society.py          # NEW: /…/society/start, /…/society/stream (SSE), /…/society/state
│  └─ mcp/
│     ├─ __init__.py  banner.py  tenancy.py
│     └─ server.py                  # FastMCP('qwen8'); resume/search/explore/projects (NO deepen tool)
├─ frontend/                        # adapted sigma.js dashboard (fork of delapan-ai/frontend)
│  └─ src/
│     ├─ api/{client.ts, types.ts, mock.ts, society.ts}      # society.ts + types/mock additions NET-NEW
│     ├─ graph/{GraphCanvas.tsx, build.ts, colors.ts, layout.ts, contributors.ts}  # contributors.ts NET-NEW
│     ├─ state/store.ts
│     ├─ panels/{LeftRail.tsx, ReportOverlay.tsx}            # ReportOverlay NET-NEW
│     └─ App.tsx
└─ tests/
   ├─ test_blackboard_claim.py      # meaningful race (file-backed DB; yield point OR 2nd connection)
   ├─ test_researcher_embeds.py     # findings land in vec_findings → coverage sees them
   ├─ test_reopen_then_claim.py     # 'sharpen' reopen → Researcher re-runs exploration (no rich-skip)
   └─ test_termination.py           # perpetually-sparse + Critic-always-spawns-child → loop halts bounded
```

> **`routes_kg.py` (physical edit, not "don't mount"):** line 26 is a **module-top-level** `from delapan.core.agent.concept_doc import synthesize_concept_doc`. `api/main.py` imports the router, which executes that import — so an absent `concept_doc.py` crashes the **whole app at startup**, not just one route. The import + the `/concept-doc` handler MUST be deleted from the vendored file (recommended), or `concept_doc.py` + the `okf` config section must be fully vendored. Recommendation: delete. Also drop the frontend `ConceptDocReader` call path.

---

## 11. MVP Scope + Success Criteria

**In scope:** 1 Planner, 2 Researchers (demo), 1 Critic, 1 Synthesizer; the blackboard gap loop; the vendored engine running entirely on Qwen/DashScope; the `gaps` table (in `_SCHEMA`) + atomic claim; the vendored `api/` read contract + the new `routes_society.py`; the sigma.js demo (live growth + gap claiming + coverage meter + report overlay); Alibaba Cloud ECS deployment + proof recording; AGPL-3.0 repo; `<3:00` demo video; rendered architecture diagram.

**Out of scope:** >2–3 researchers; elaborate negotiation protocols (beyond coverage-ranked claiming); KG extraction during a run (OFF for demo); auth / multi-tenant beyond the shared-secret write gate; domain tuning; true multi-process parallelism (Postgres `Store`); the chat agent / `/v1` / HTML report surfaces; cloud Supabase tier; the MCP `deepen` tool.

**Verifiable success criteria:**
1. A fresh `qwen8/pyproject.toml` (name=qwen8, packages=['qwen8']): `pip install -e .[local]` succeeds and `python -c "import qwen8"` imports clean (no residual `delapan.*` import; no langchain/anthropic/supabase pulled).
2. `grep -rE "from delapan|import delapan" qwen8/` returns **zero** import hits; `grep -nE "anthropic/|openai/|google/|gpt-|claude-|gemini-" config.yaml` returns **zero** model-string hits.
3. **DashScope smoke test (HARD GATE, day-1 / early-M2 before vendoring is sunk):** `GET /compatible-mode/v1/models` lists the chosen bare names; `structured_completion` with `use_json_schema=False` returns valid JSON; `embed_batch` of 25 texts returns 25 × **1536-dim** vectors with no 400; an end-to-end mini run is token-measured against the Section-12 budget.
4. `run_society("<open-domain question>", org_id='local', project_id=…, kb_id=…, n_researchers=2, max_rounds=3)` runs to completion, terminating on "all gaps done/dead" or a guard before exceeding `max_rounds` or `max_llm_calls_per_run`.
5. After a run, `match_findings` returns non-empty banded results (proves embeddings persisted via the render→embed path) and `assess_coverage` reports `rich` on ≥1 sub-question.
6. `test_blackboard_claim`: two `Researcher.step()` coroutines racing one open gap → exactly one gets it, the other gets `None`; the test is non-trivial (yield point or second connection).
7. `GET /…/society/stream` emits the named-event frame sequence (8.2); the sigma.js dashboard renders nodes/edges appearing, a gap going `claimed → filled`, the coverage meter moving, and the report overlay opening.
8. `curl http://<ECS_PUBLIC_IP>/health` returns 200 from the deployed container; `docker logs` show outbound DashScope + Tavily calls; `/society/start` rejects requests missing the shared secret.
9. Repo has a visible `LICENSE` (AGPL-3.0); `docs/architecture.svg` exists; the `<3:00` judged video is public on YouTube; the separate proof-of-deployment recording exists.
10. Startup assertions pass: resolved `db_path` contains `.qwen8`; every resolved model name has no `/`; `TAVILY_API_KEY` set (fail fast, loud).

---

## 12. Build Sequence / Milestones

Sized to the **2026-07-09** deadline (~17 days of runway from a 2026-06-22 start; submit by 2026-07-08). **17 days is aggressive for this scope.** Two long-lead external risks are front-loaded into week 1, *in parallel* with M0/M1, because either can block for days. M5 (society end-to-end) is the schedule's true risk peak and gets **3+ days of buffer after it**, not 1. The SSE frame schema is **frozen as a contract artifact at the end of M6** so frontend (M7) and backend can parallelize.

| # | Milestone | Verify |
|---|---|---|
| **M-A1** *(week-1, parallel)* | **Alibaba account + Model Studio activation + intl key.** Create account, add payment, activate DashScope-intl, mint key. (Can block for days on real-name/billing verification — start day 1.) | Key works against `dashscope-intl`; criterion 3 smoke test green. |
| **M-A2** *(week-1, parallel)* | **Throwaway hello-world FastAPI on ECS** — de-risk the AMD64 buildx + ACR + ECS + security-group toolchain BEFORE the app is ready. | `curl http://<IP>/health` 200 from a 10-line FastAPI container built `linux/amd64`. |
| **M0** | Scaffold repo: `git init`; **author `qwen8/pyproject.toml` from scratch** (name=qwen8, packages=['qwen8']; exact deps in Section 10; NO langchain/anthropic/supabase/asyncpg; jinja2 only if needed); `LICENSE` (AGPL-3.0), `.env.example`, dirs. | `pip install -e .[local] && python -c "import qwen8"` clean; `git log` shows init. |
| **M1** | Vendor Tier 0–6 (config→store→clients→agent→exploration→KG→MCP→**api/**) with import-rename (111 sites) + config renames (5.3) + **Qwen model defaults (5.6)**; add `gaps` table to `_SCHEMA`; rewire `synopsis._build` off langchain (5.5); edit `_missing_keys()` (drop OPENAI); delete `concept_doc` import + route. | `python -c "import qwen8.api.main, qwen8.core.exploration, qwen8.store, qwen8.core.knowledge_graph"` clean; `grep -rE "from delapan|import delapan" qwen8/`=0; startup `assert ".qwen8" in db_path` + no-`/`-in-model-name pass; synopsis smoke test produces a `kb_synopsis` row on DashScope. |
| **M2** | DashScope cutover: `config.yaml` all-Qwen names + `reasoning_effort: null` + `search_mode: tavily`; `embed_batch` ≤10 chunking; `use_json_schema=False` on hot paths; `SocietyConfig` added; `.env` with DashScope+Tavily keys. | Criterion 3 hard gate passes; `TAVILY_API_KEY` fail-fast assertion; token-budget mini-run recorded. |
| **M3** | Engine end-to-end on Qwen: `create_exploration → run_exploration(project_id=…) → render→embed→insert_findings → match_findings` non-empty. **Freeze the SSE frame schema (8.2) as a contract artifact here** so M7 can start against the mock. | Criterion 5 on a single query (no society yet); frame-schema doc committed. |
| **M4** | Society module: `blackboard.py` (5 fns + atomic claim, gaps in `_SCHEMA`), `roles.py`, `loop.py` + `SocietyResult` + termination + spawn budget + kill-switch. | `test_blackboard_claim` (meaningful) + `test_researcher_embeds` + `test_reopen_then_claim` pass (criteria 6, 5). |
| **M5** *(RISK PEAK — 3+ days buffer after)* | `run_society` end to end (2 researchers, 1 critic, 1 synthesizer) → cited report; termination guards on real web research with reopens. | Criterion 4 + `test_termination` (perpetually-sparse + always-spawn-child) pass; report cites finding ids; within `max_llm_calls_per_run`. |
| **M6** | API: `routes_society.py` (`/…/society/start`, `/…/society/stream` SSE emitting the 11 named frames from a queue fed by `run_society`, `/…/society/state`) under the `/api/projects/{p}/kbs/{k}` prefix; extend `cors_origins`; 500-handler wrapping; shared-secret write gate. | `curl /…/society/start` then `/…/society/stream` shows the named-frame sequence (criterion 7 backend); missing-secret rejected. |
| **M7a** | Frontend client: `society.ts` SSE consumer + full-parity strict-TS mock (replays a canned run) + `types.ts` `SocietyEvent` union + `contributor`. | `npm run build` green; mock renders a canned run end-to-end. |
| **M7b** | Frontend live-viz: contributor coloring (`contributors.ts`), graph-grows-live, gap markers (`claimed → filled`), persistent coverage meter, `ReportOverlay`. *(Cut contributor coloring to stretch if time-tight; a static-but-real demo must always be shippable.)* | Each feature demonstrably animates against local qwen8 (criterion 7 full). |
| **M8** | Dockerize + Alibaba ECS deploy (build `linux/amd64`, ACR push, ECS run, security-group write gate). *(Toolchain already de-risked by M-A2.)* | Criterion 8: `curl http://<IP>/health` 200; logs show DashScope+Tavily; secret-gate enforced. |
| **M9** | Submission assets: render `docs/architecture.svg` (13.4); README; `<3:00` PRE-WARMED video (YouTube); separate proof-of-deployment recording (terminal-demo-video); Devpost text + track + code-file link; optional blog post. **STOP/release ECS checklist.** | Criterion 9; dry-run the Devpost form; video timed ≤2:50; ECS stopped. |
| **M10** | Buffer + submit by 2026-07-08 EOD. | Devpost submission confirmation. |

Critical path: **M1→M2→M3→M4→M5** (the engine + society core), with **M-A1/M-A2 running in parallel from day 1**. M7a/M7b run against the frozen frame schema (M3) and the mock, unblocking before M6 lands. M8 is low-risk because M-A2 already proved the toolchain.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Researcher findings never embedded** (engine returns unembedded `Finding`s; `content` is a `dict`) → coverage blind, Critic reopens forever, all `dead`. *(Most likely build-time bug.)* | Mirror `mcp/server.py`: `_render_content(f.content)` → `embed_batch(bodies)` → rows with `content=body`+`embedding` (6.2). Covered by `test_researcher_embeds` (criterion 5). |
| **`run_exploration` called wrong** — `project_id` is required (no default); the exploration row must exist first. | `create_exploration(org_id, kb_id, q)` → `run_exploration(q, exploration_id=exp_id, project_id=project_id, kb_id=kb_id, cfg=…)`; thread `project_id` into every gap row + the bootstrap (6.2/6.5). |
| **config.py non-Qwen defaults silently 404** — a missing `config.yaml` knob resurrects an `anthropic/…`/`openai/…`/`text-embedding-3-small` default. | Change the vendored config.py defaults to Qwen (5.6) AND mirror in config.yaml; startup `assert "/" not in model_name`; grep gate on config.yaml (criterion 2). |
| **`_missing_keys()` requires OPENAI_API_KEY** → vendored explore/society routes refuse to run on the DashScope fast path. | Edit `_missing_keys()` to require only (DashScope/AI_GATEWAY key)+TAVILY (5.4); verified M2/M3. |
| **`concept_doc` top-level import crashes the whole app at startup** (not just one route). | Physically delete the import + `/concept-doc` handler from vendored `routes_kg.py` (Section 10). |
| **Config-rename incompleteness** → qwen8 silently reads delapan's `config.yaml` / `~/.delapan/delapan.db`, cross-polluting brains (the gaps table is a 2nd collision surface). | Exhaustive rename checklist (5.3); startup `assert ".qwen8" in db_path`; gaps table keyed in `_SCHEMA` on the cached singleton; tests use file-backed temp DBs. |
| **Atomic-claim mis-justified** (WAL is not the arbiter) → a reviewer catches the overclaim. | Single-statement `UPDATE…WHERE id=(SELECT…LIMIT 1)` + `rowcount` on one connection/one thread is the arbiter; no `await` between claim and commit; WAL/busy_timeout are belt-and-suspenders for background synopsis/KG writes (6.1). |
| **DashScope has no `json_schema`** → strict path 400s, wasting a round-trip + quota. | `use_json_schema=False` on hot structured paths; system prompts already contain "json". |
| **`reasoning_effort` (thinking) conflicts with `json_object`**. | `reasoning_effort: null` for every structured call in `config.yaml`; omit-based code drops the param. |
| **text-embedding-v4 batch cap (≤10, unverified)** → ingest >10 chunks may 400. | Mandatory ≤10-chunk loop in `embed_batch`; smoke-test 25 texts (criterion 3). Harmless if the real cap is higher. |
| **1536-dim lock-in / v4 availability (external, unverified)** — `_SCHEMA` literal `float[1536]`; non-1536 model means DROP+CREATE+re-embed. | HARD GATE day-1 smoke test confirms v4@1536; pre-decided fallback = schema DROP+CREATE+re-embed if it fails. |
| **Region/key mismatch** — non-intl URL or non-Singapore key → 401/403, zero free quota. | Pin `dashscope-intl` base URL + Singapore-minted key; verify M-A1/M2. |
| **`search_mode='auto'` silently returns `[]`** with no host agent → society "converges" to an empty report on camera. | Pin `search_mode: tavily` in config.yaml; fail-fast assert `TAVILY_API_KEY` set (7.3, criterion 10). |
| **Token/quota exhaustion on the free tier** (multi-agent fan-out is hundreds of calls). | DEMO defaults `n_researchers=2/max_rounds=3/max_attempts=1`, KG extraction OFF; `max_llm_calls_per_run` kill-switch; token budget (13.2) verified M2/M3; small paid top-up budgeted if the smoke run says so. |
| **Synthesizer 429 on the climactic beat** (qwen-long 60K TPM stuffing all findings). | Default Synthesizer to **qwen-max**; cap input to top-K per gap (`synthesis_top_k_per_gap`); 429 backoff + partial-report fallback (6.2). |
| **Reopen/child-gap infinite loop** on permanently-`sparse` questions; band-only "no progress" halts prematurely. | Monotonic progress scalar (`done*1000 + Σband1_hits`), global `spawn_budget`, `attempts>=max_attempts→dead`, `max_rounds` (6.3). |
| **rich↔reopen oscillation** — Critic reopens a band-rich-but-insufficient gap; Researcher's rich-skip re-verifies it. | Reopen carries a `reason`; on `'sharpen'` the Researcher skips the rich gate and re-runs (6.3 LOW fix); `test_reopen_then_claim`. |
| **Frontend society protocol is net-new on both ends** (no `society.ts`/`ReportOverlay`/`contributors.ts`; flat-phase explore SSE ≠ named society frames). | Split M7a (client+mock+types) / M7b (live-viz); freeze frame schema at M3; demote the "~90% reuse" claim (Section 8). |
| **Unhandled 500 carries no CORS header** → client silently flips to mock (CORS itself already exists upstream). | Don't re-add CORS; add deployed origin to `cors_origins`; wrap routes in try/except→`JSONResponse`; prefer Vite proxy (8.2). |
| **Frontend auto-mock masks a down qwen8** (silent "MOCK DATA" flip). | Empty base + Vite proxy; watch the StatusBar badge; surface loudly during the demo. |
| **FastAPI `main()` binds 127.0.0.1** → unreachable on public IP. | Dockerfile uvicorn CLI forces `--host 0.0.0.0`. |
| **AMD64-only Alibaba runtimes** vs Apple Silicon dev box. | `docker buildx --platform linux/amd64`; de-risked by M-A2. |
| **Billing/real-name verification can block Model Studio activation for days.** | Front-loaded as M-A1, day 1, in parallel. |
| **Public `/society/start` is an unauthenticated quota-burning endpoint.** | Shared-secret header (`QWEN8_SOCIETY_SECRET`) or IP allow-list on write routes; `max_llm_calls_per_run`; STOP/release ECS (9.4). |
| **`langchain` rewire returns prose that breaks downstream parse.** | Verified `_build` consumes free-form prose (brackets out a JSON array) → `text_completion` is correct; M1 smoke test on `maybe_rebuild_synopsis`. |
| **Live society run doesn't fit in <3:00 / 429s on camera.** | PRE-WARMED run + degraded/replay mode (13.3); proof-of-deployment is a separate longer artifact (9.3). |
| **Video >3:00 invalidates submission.** | Script to ~2:40; time the cut (M9). |
| **Public OSS repo not submission-ready** (delapan backend is a symlink to a private repo). | qwen8 is a fresh standalone public repo with its own AGPL-3.0 `LICENSE`; no symlinks into private repos. |

### 13.1 pyproject from scratch (M0)

Author `qwen8/pyproject.toml` fresh (do NOT copy delapan's, which is keyed to `delapan` with required `anthropic`/`langchain-core`/`langchain-anthropic` + cloud extras). `[project] name = "qwen8"`; `tool.setuptools`/hatch `packages = ["qwen8"]`. Dependencies: `fastapi`, `uvicorn[standard]`, `httpx`, `openai`, `tavily-python`, `mcp`, `pydantic`, `pydantic-settings`, `pyyaml`. `[project.optional-dependencies] local = ["sqlite-vec"]`. **Explicitly NO** `langchain-core`/`langchain-anthropic`/`anthropic`/`supabase`/`asyncpg`/`pyjwt`/`argon2`. **`jinja2`** was required by delapan only for the (dropped) HTML report path — **omit it, then run `grep -rn "jinja2\|from jinja2\|import jinja2" qwen8/`; add it back only if a vendored module actually imports it.** Verify: `pip install -e .[local] && python -c "import qwen8"`.

### 13.2 Token / cost budget (DEMO defaults; verify the per-call averages at M2/M3)

Per-run estimate with DEMO defaults `n_researchers=2, max_rounds=3, max_attempts=1, KG extraction OFF`. Per-call token figures are rough placeholders to be replaced by the M2/M3 measured smoke run; the structure is what matters for the kill-switch.

| Call site | model | calls/run (est.) | avg tokens (in+out, est.) | notes |
|---|---|---|---|---|
| Planner.seed | qwen-max | 1 | ~2K | one decomposition |
| Engine planner (per gap explore) | qwen-flash | ~6–10 | ~1.5K | 1 per gap × researchers, per round (rich-skip trims) |
| Extractor (per crawled page) | qwen-plus | ~30–60 | ~3K | the bulk of the budget; `max_pages` caps it |
| Evaluator (reflection) | qwen-plus | ~10–20 | ~2K | batched critic |
| Narration | qwen-flash | ~30 | ~0.3K | throwaway, cheap |
| Critic.review (per verified gap) | qwen-max | ~6–12 | ~2K | 1 per verified gap per round |
| Synthesizer.run | qwen-max | 1 | ~10–20K | top-K capped input; the rate-limit risk beat |
| Embeddings | text-embedding-v4 | ~10–20 batches | n/a (separate quota) | ≤10 texts/call |

Rough total per run: **~100–200 LLM calls**, low-hundreds-of-K tokens, dominated by `qwen-plus` extraction. **`max_llm_calls_per_run` (default 120) is the hard kill-switch** — a shared counter around every role + engine LLM call; tripping it stops the loop gracefully and the Synthesizer emits a partial report. Budget check: one demo run + 2–3 dry runs should fit the free 1M-token/model/90d quota *if* extraction stays on `qwen-plus` and `qwen-max` is reserved for Planner/Critic/Synthesizer; if the M2/M3 measured run says otherwise, buy a small paid top-up early. **Verify against quota at M2/M3, not at submission time.**

### 13.3 Degraded / replay demo mode (insurance)

Every live success criterion needs DashScope + Tavily + ECS + frontend working simultaneously; a 429 or Tavily flake during the recording window would sink the demo. Insurance:
- **Replay a saved run from the SQLite DB.** A `--replay <db>` mode (or a `?replay=1` query on `/society/stream`) reads a completed run's `gaps` + `findings` + KG rows from `/data/qwen8.db` and re-emits the named SSE frames on a timer, so the dashboard animates a real prior run with no live LLM/Tavily calls. The brain *is* the recording.
- **Fallback to the existing explore SSE.** The vendored `routes_explore.py` flat-phase stream works today; if the society stream stalls, the "graph grows live" beat can be shown via a single `explore` run as a backstop.
- A pre-recorded video clip of a known-good run is the final backstop for the judged <3:00 video.

### 13.4 Architecture-diagram render step (Section 4 ASCII → image)

The rubric wants an uploadable image. Author the Section-4 diagram as a **Mermaid** `flowchart` in `docs/architecture.mmd` and render with the Mermaid CLI: `mmdc -i docs/architecture.mmd -o docs/architecture.svg` (and a `.png` for Devpost upload). This is a concrete M9 step, not "render somehow." Keep the ASCII version in this spec as the source of truth; the Mermaid is a faithful transcription.

---

## 14. Open Questions for the User

Most of the draft's open questions are now **resolved decisions** (folded into the spec). The few remaining are genuine session-time verifications or product calls.

**Resolved (decisions taken; listed so you can override):**
- **Synthesizer model →** **qwen-max** primary, qwen-long opt-in only (rate-limit safety; 6.2/7.2).
- **Provider config →** zero-code fast path (DashScope key into `AI_GATEWAY_*`); no side-by-side Vercel gateway (7.3).
- **Gap persistence →** `gaps` table baked into `_SCHEMA` (no `store._conn` private-attr reach) (6.1/6.4).
- **langchain →** drop; rewire `synopsis._build` to `text_completion` (verified it consumes free-form prose) (5.5).
- **Interfaces →** both vendored: MCP for Claude-Code tap-in, HTTP (`api/`) for the demo; the MCP `deepen` tool is OUT (6.2/Tier 5).
- **concept_doc →** physically delete the import + route from `routes_kg.py` (5.4/Section 10).
- **Researchers for the demo →** 2 (token budget; 13.2).
- **Devpost proof framing →** satisfy both: code-file link in the Devpost field + deployment shown live inside the PRE-WARMED <3:00 video; the longer single-take proof-of-deployment recording is a separate artifact (9.3).
- **Video host →** YouTube (9.3 / checklist item 4).
- **`search_mode` →** pinned to `tavily` + fail-fast `TAVILY_API_KEY` assertion (7.3/13).

**Still genuinely open (session-time or product calls):**
1. **DashScope model availability + caps (HARD GATE, day-1).** Confirm the bare aliases (`qwen-max`/`qwen-plus`/`qwen-long`/`qwen-flash`) and `text-embedding-v4@1536` exist on `dashscope-intl` and return OpenAI-compatible chat+embeddings; confirm the ≤10 batch cap, RPM/TPM, and the 1M/90d quota numbers. Decide whether to pin specific snapshots (e.g. `qwen3-max`/`qwen3.5-*`) or use bare aliases. **This gates the entire Qwen-exclusive requirement** — resolve before vendoring (criterion 3 / M-A1).
2. **Blog Post Award.** Will you pursue the separate Blog Post Award ($500+$500)? (Affects M9 scope only.)
3. **NEW — paid top-up contingency.** If the M2/M3 measured token run shows a single thorough demo run + dry runs would exhaust the free `qwen-max` quota, are you OK pre-buying a small paid DashScope top-up to de-risk the recording window? (Default assumption: yes, small top-up acceptable.)
4. **NEW — `qwen-plus` extraction quality.** The whole researcher pipeline (planner/extractor/evaluator) runs on `qwen-plus` to conserve `qwen-max` quota. If extraction quality on real open-domain pages is visibly weak at M3, the fix is to promote `exploration.extraction_model` to `qwen-max` — which materially raises the token budget. Confirm the budget can absorb that trade if needed.

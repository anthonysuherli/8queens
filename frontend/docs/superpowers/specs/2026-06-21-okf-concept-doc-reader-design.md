# OKF concept-doc reader — design spec

- **Date:** 2026-06-21
- **Status:** approved design, ready for implementation planning
- **Repos touched:** `delapan-fe` (frontend, primary) + `delapan` (backend, one new endpoint)
- **Topic:** Borrow Google's Open Knowledge Format (OKF) *information presentation* into delapan as a human-readable, cross-linked concept-doc reader over the knowledge graph.

## 1. Summary

Add a **concept-doc reader**: a dedicated, article-width drawer in the sigma.js
control panel that renders any knowledge-graph **entity (node)** as an
**OKF-style concept document** — OKF-vocabulary frontmatter plus a free-markdown
body — with clickable navigation between related concepts so the KB reads like a
wiki.

The body is **hybrid**: a deterministic markdown assembly by default (instant,
free, works keyless and in mock mode), upgradable on demand to **LLM-synthesized
prose** (one pass, cached). The reader is **read-only and fully derived**; the
existing `Inspector` remains the editing surface.

## 2. Background — OKF and how it maps to delapan

Google Cloud's Open Knowledge Format (announced 2026-06-12) represents a
knowledge base as a directory of Markdown files, one *concept* per file, each
with YAML frontmatter — one required field (`type`) plus optional `title`,
`description`, `resource`, `tags`, `timestamp` — followed by a free-form Markdown
body. Its pitch is solving the "context assembly problem": any agent can read any
producer's knowledge without a custom integration.

delapan already has OKF's *capabilities* in a richer, DB-backed shape — Findings,
the `<preamble>`, the KG, the sigma graph. What it lacks is OKF's **human-readable
concept-doc presentation idiom**: today, to read an entity you click a node and
get raw findings in a provenance drawer; there is no "read this concept as a
written page" view. This feature borrows exactly that idiom.

Field mapping (OKF concept ← delapan entity):

| OKF field | Required | delapan source |
|---|---|---|
| `type` | ✓ | `node.nodeType` |
| `title` | — | `node.label` |
| `description` | — | deterministic: lede sentence of the highest-confidence grounded finding, or a `description`/`summary` node property if present; synthesized: LLM one-liner |
| `tags` | — | deduped union of grounded findings' `tags` |
| `resource` | — | canonical = the first provenance URL of the highest-confidence grounded finding; the remainder render under **Sources** |
| `timestamp` | — | latest of `node.created_at` and grounded findings' `created_at` |
| `id` *(delapan extra; OKF permits extra fields)* | — | `node.id` |

## 3. Scope

**In scope**
- A per-entity OKF concept-doc reader drawer in `delapan-fe` (approach "B").
- Deterministic, client-side doc assembly from data already loaded (node attrs,
  edges, cached findings).
- Optional one-pass LLM synthesis of prose, behind one new backend endpoint,
  cached into node properties.
- Cross-concept navigation with a back-stack.
- Read-only presentation.

**Out of scope (future)**
- OKF file **export/import** (bundle of `.md` files) — this is presentation, not
  interoperability.
- A standalone static "wiki" HTML site (approach "C"), and a per-KB overview/
  index doc.
- An editable concept doc (write-back to findings).
- OKF's two-pass "draft → enrich" authoring loop (one pass is enough for MVP).
- Aligning the internal `Finding`/frontmatter model to OKF vocabulary.

## 4. Concept-doc structure

One entity renders as one `ConceptDoc`. Frontmatter per the table in §2. Body, in
deterministic mode, is assembled in this fixed order:

1. **Lede** — the `description` rendered as a sentence.
2. **Properties** — if `node.properties` is non-empty, a compact definition list
   (`key — value`). Keys in the machine-managed `okf_` namespace (see §7) are
   excluded from display.
3. **What we know** — one subsection per grounded finding: `### {finding.title}`,
   body = the finding's `content`, with a caption showing confidence and the
   deduped source domains. (Mirrors today's `EvidenceList` data.)
4. **Related concepts** — from the node's edges, both directions:
   `{relation} → {neighbor label}`. Each is a live link that re-points the reader
   to that neighbor's doc.
5. **Sources** — deduped provenance (domain ↗ + originating query) across all
   grounded findings, footnote-style.

In **synthesized mode**, sections (1) and (3) are replaced by the cached
`{description, body_markdown}`; sections (2) Properties, (4) Related, and (5)
Sources stay deterministic regardless.

## 5. Reader layout and interaction

- **Surface.** A right-side overlay drawer reusing `FindingDrawer`'s veil +
  drawer pattern, but article-width, in the dark instrument-panel theme
  (amber/cyan annunciators, IBM Plex Mono/Sans, tokens from `tokens.css`).
- **Opening.** A `📖 Read` button in the `Inspector` header (shown when exactly
  one node is selected) and an `R` hotkey open the reader for the selected node.
- **Cross-link navigation.** Clicking a Related concept re-points the *same*
  drawer to that neighbor's doc and pushes the prior concept onto a back-stack; a
  back affordance pops it. Optionally also re-selects/flies the canvas to that
  node (selection only for MVP; fly is a nice-to-have).
- **Synthesize toggle.** A `✨ synthesize` control toggles the body between
  *assembled notes* (deterministic) and *prose article* (cached LLM). When a
  cached, non-stale article exists, the drawer opens in prose mode by default
  with an "assembled notes" toggle and a `↻ re-synthesize` affordance.
- **Read-only.** Everything is derived; editing remains in the `Inspector`.

## 6. Data flow

**Deterministic (no backend change):**

```
node + edges + cached findings ─► buildConceptDoc(nodeId) ─► ConceptDoc ─► <ConceptDocReader>
```

All inputs are already client-side. `buildConceptDoc` is a pure, side-effect-free
derivation. Grounded findings are pulled through the existing
`fetchFinding`/`findingCache` (same as `EvidenceList`); the reader requests any
missing finding ids on open and renders incrementally.

**Synthesize:**

```
click synthesize ─► POST …/graph/nodes/{id}/concept-doc ─► LLM pass
   ─► {description, body_markdown, model, built_at, grounded_hash}
   ─► persist into node.properties (okf_*) via existing node-PATCH (optimistic + undo)
   ─► reader re-derives ─► prose mode
```

## 7. Backend endpoint and synthesis

**Route** (added to the existing KG router in `delapan/api/routes_kg.py`, prefix
`/api/projects/{project}/kbs/{kb}/graph`):

```
POST /graph/nodes/{node_id}/concept-doc
```

- No request body. The server loads the node, its grounded findings, and its
  1-hop relations from the `Store`.
- Runs **one** LLM pass via `delapan/core/clients/ai_gateway.text_completion`,
  prompting for: a one-line `description` and a prose markdown `body`, grounded
  **only** in the supplied findings (no outside facts, no invented citations).
- Synthesis logic lives in a new `delapan/core/agent/concept_doc.py`
  (`async def synthesize_concept_doc(store, kb_id, node_id) -> dict`), keeping the
  route thin.

**Response 200:**

```json
{
  "description": "string",
  "body_markdown": "string",
  "model": "string",
  "built_at": "ISO-8601 string",
  "grounded_hash": "string"
}
```

**Errors:** `503 {"error": "llm unavailable"}` when no LLM key is configured
(mirrors the keyless pattern in `routes_findings.py::resume`); `404` when the node
is not found in the KB.

**Caching location (decision ①).** The frontend persists the response into the
node's `properties` under an `okf_` namespace — `okf_doc` (= `body_markdown`),
`okf_doc_description`, `okf_doc_model`, `okf_doc_built_at`, `okf_doc_grounded_hash`
— through the *existing* node-PATCH mutation pipeline (`setNodeProperties` →
`PATCH /graph/nodes/{id}`). This needs **no schema migration**, rides the
optimistic + undo/redo machinery, survives reload, and fits delapan's free-form
`properties` model. These `okf_` keys are hidden from the Properties section (§4).
A dedicated store column/table is the cleanup path if properties get noisy; it is
explicitly deferred.

**Staleness.** `grounded_hash` is computed over the node's grounded-finding ids so
the frontend can detect drift. Definition (identical in TS and Python to avoid
algorithm skew): **FNV-1a 32-bit** over `sorted(grounded_in).join(",")`, rendered
as lowercase hex. On open, the reader recomputes the hash from the node's current
`grounded_in`; if it differs from `okf_doc_grounded_hash`, the doc is flagged
"may be stale · ↻ re-synthesize" but still shown.

## 8. Markdown rendering (decision ②)

Prose mode is real markdown (LLM output) and a finding's `content` may be
markdown-ish, so the reader needs a renderer. Use a **compact in-repo markdown
subset** in `src/okf/markdown.ts` supporting headings, bold/italic, inline code
and code blocks, links, ordered/unordered lists, and paragraphs, emitting
**sanitized** output (escape HTML, allow only the generated tag set; links get
`rel="noreferrer"` and `target="_blank"`). LLM prose is treated as untrusted.
This avoids adding dependencies to a deliberately lean frontend. Pulling in
`marked` + `DOMPurify` is the considered alternative and is rejected for MVP.

## 9. Keyless / offline behavior

- Deterministic mode always works — no key, no network.
- With no LLM key, or in mock mode (`VITE_USE_MOCK=1` / auto-fallback), the
  `synthesize` control is disabled with an explanatory tooltip.
- Mock parity is mandatory: `src/api/client.ts` and `src/api/mock.ts` both
  implement the synthesize call; the mock returns a canned `ConceptDocResponse`.

## 10. Components and files

**Frontend (`delapan-fe`)**

| File | Change |
|---|---|
| `src/okf/conceptDoc.ts` | new — `buildConceptDoc(nodeId): ConceptDoc` (pure) + `groundedHash(ids): string` (FNV-1a) |
| `src/okf/markdown.ts` | new — compact sanitizing markdown-subset renderer |
| `src/okf/conceptDoc.test.ts` | new — Vitest for the pure builder |
| `src/panels/ConceptDocReader.tsx` | new — the drawer component |
| `src/panels/Inspector.tsx` | edit — add the `📖 Read` button on single-node selection |
| `src/state/store.ts` | edit — `openConceptNodeId`, back-stack, open/close + synthesize actions |
| `src/state/useHotkeys.ts` | edit — `R` opens the reader for the selected node |
| `src/api/types.ts` | edit — `ConceptDocResponse` wire type |
| `src/api/client.ts` | edit — `synthesizeConceptDoc(project, kb, nodeId)` |
| `src/api/mock.ts` | edit — mock `synthesizeConceptDoc` (canned doc) |
| `src/App.tsx` | edit — mount `<ConceptDocReader />` |
| `src/styles/panels.css` | edit — reader styles (reuse drawer rules) |

**Backend (`delapan`)**

| File | Change |
|---|---|
| `delapan/api/routes_kg.py` | edit — `POST /graph/nodes/{node_id}/concept-doc` |
| `delapan/core/agent/concept_doc.py` | new — `synthesize_concept_doc(...)` + `grounded_hash(ids)` (FNV-1a, must match the TS impl) |
| `tests/…` | new — keyless 503 test + stub-LLM smoke test |

## 11. Data shapes (frontend)

```ts
interface ConceptDocFrontmatter {
  type: string;            // node.nodeType
  title: string;           // node.label
  description: string;     // lede or synthesized one-liner
  tags: string[];          // deduped union of grounded findings' tags
  resource: string | null; // canonical top source url
  timestamp: string;       // ISO; latest created_at
  id: string;              // node.id
}
interface ConceptDocRelation {
  relation: string;
  direction: "out" | "in";
  neighborId: string;
  neighborLabel: string;
  neighborType: string;
}
interface ConceptDocFindingBlock {
  id: string; title: string; content: string;
  confidence: number; domains: string[];
}
interface ConceptDocSource { url: string; domain: string; query: string }
interface ConceptDocProse {
  description: string; bodyMarkdown: string;
  model: string; builtAt: string; groundedHash: string;
}
interface ConceptDoc {
  frontmatter: ConceptDocFrontmatter;
  properties: Record<string, unknown>;     // node.properties minus okf_* keys
  findings: ConceptDocFindingBlock[];       // may fill in as findings load
  related: ConceptDocRelation[];
  sources: ConceptDocSource[];
  prose: ConceptDocProse | null;            // from okf_* node properties
  stale: boolean;                           // prose present && hash mismatch
}

interface ConceptDocResponse {              // POST …/concept-doc 200 body
  description: string;
  body_markdown: string;
  model: string;
  built_at: string;
  grounded_hash: string;
}
```

## 12. Error handling

- **Missing findings.** A grounded id that fails to load renders an inline
  "unavailable" block (as `EvidenceList` does); the doc still renders.
- **Ungrounded entity.** No grounded findings → "What we know" shows a placeholder;
  frontmatter, Properties, and Related still render. `synthesize` is disabled
  (nothing to ground prose in).
- **Synthesize failure / 503.** Surface a toast; the reader stays in deterministic
  mode. The optimistic property write rolls back on PATCH failure per the existing
  command pattern.
- **Stale prose.** Shown with a "may be stale" annunciator + `↻ re-synthesize`;
  never silently hidden.

## 13. Testing

- **`buildConceptDoc` (Vitest, pure):** frontmatter mapping; tag dedup; canonical
  `resource` selection (highest-confidence finding's top source); related-concept
  extraction in **both** edge directions; `okf_*` keys excluded from Properties;
  `groundedHash` determinism and order-independence; `stale` computation.
- **`markdown.ts` (Vitest):** rendering of each supported construct; HTML escaping
  / sanitization of hostile input.
- **Backend (pytest):** keyless `503`; a stub-LLM smoke test asserting the response
  shape and that `grounded_hash` matches the TS algorithm for a known id set.
- **Mock parity:** offline mode renders deterministic docs and a canned synthesized
  doc without a backend.

## 14. Open questions

None blocking. Deferred niceties (not required for MVP): fly-to-node on
cross-link; a per-KB overview/index doc; graduating prose cache from node
properties to a dedicated store field.

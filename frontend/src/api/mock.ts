/**
 * In-memory mock backend.
 *
 *   client.ts ──(mock mode / live unreachable)──▶ mockApi ──▶ db (mutable)
 *
 * Serves the exact same shapes as the live contract, including mutations,
 * so the whole control panel is demoable standalone. Pure TS — no DOM.
 */

import { groundedHash } from "../okf/conceptDoc";
import {
  ApiError,
  type ConceptDocResponse,
  type EdgeSpec,
  type ExploreEvent,
  type Finding,
  type FindingsResponse,
  type GraphEdge,
  type GraphNode,
  type GraphQuery,
  type GraphResponse,
  type GraphSchema,
  type GraphStats,
  type NodePatch,
  type NodeSpec,
  type ProjectsResponse,
  type ResumeResponse,
  type Synopsis,
} from "./types";

// ---------------------------------------------------------------------------
// dataset authoring helpers

let now = Date.parse("2026-06-10T08:00:00Z");
function ts(): string {
  now += 61_000;
  return new Date(now).toISOString();
}

function node(
  id: string,
  type: string,
  label: string,
  grounded: string[] = [],
  properties: Record<string, unknown> = {},
): GraphNode {
  return { id, type, label, properties, grounded_in: grounded, created_at: ts() };
}

let edgeSeq = 0;
function edge(
  source: string,
  relation: string,
  target: string,
  grounded: string[] = [],
  properties: Record<string, unknown> = {},
): GraphEdge {
  edgeSeq += 1;
  return {
    id: `e_${edgeSeq}`,
    source,
    target,
    relation,
    properties,
    grounded_in: grounded,
    created_at: ts(),
  };
}

function finding(
  id: string,
  title: string,
  content: string,
  category: string,
  confidence: number,
  tags: string[],
  provenance: Array<[url: string, query: string]>,
): Finding {
  return {
    id,
    title,
    content,
    category,
    confidence,
    tags,
    provenance: provenance.map(([url, query]) => ({
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      query,
    })),
    created_at: ts(),
  };
}

// ---------------------------------------------------------------------------
// primary KB: delapan / rag-ecosystem  (~40 nodes, ~70 edges, 25 findings)

const FINDINGS_RAG: Finding[] = [
  finding(
    "f01",
    "Findings are the atomic unit of delapan knowledge",
    "Every piece of ingested knowledge in delapan is normalized into a 'finding': a titled, categorized chunk of text with a confidence score, tags, and provenance back to source URLs. Graph nodes and edges never store raw evidence — they reference finding ids via grounded_in.",
    "architecture",
    0.95,
    ["findings", "grounding", "schema"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "delapan finding unit of knowledge"]],
  ),
  finding(
    "f02",
    "Findings are deduplicated semantically before insert",
    "New findings are embedded and compared against the existing corpus with cosine similarity; near-duplicates above the dedup threshold are merged rather than inserted, keeping the KB compact as exploration repeats over the same sources.",
    "architecture",
    0.88,
    ["dedup", "embeddings", "ingest"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "semantic dedup threshold cosine"]],
  ),
  finding(
    "f03",
    "Preamble assembly is the always-on read path",
    "Tapping a KB assembles a <preamble> block: synopsis topics plus the findings most relevant to the query, ordered by similarity and confidence. The preamble is what downstream agents actually consume — the graph is the reasoning layer above it.",
    "architecture",
    0.92,
    ["preamble", "resume", "read-path"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/vision.md", "preamble assembly coverage"]],
  ),
  finding(
    "f04",
    "Coverage banding grades every resume as rich, sparse, or gap",
    "Each /resume call returns a coverage verdict computed from match counts and similarity bands: 'rich' means the KB can answer, 'sparse' means partial grounding, 'gap' means exploration is needed. The banding logic is shared verbatim with the br8n fork.",
    "architecture",
    0.9,
    ["coverage", "banding", "verdict"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "coverage rich sparse gap banding"]],
  ),
  finding(
    "f05",
    "pgvector stores embeddings inside Postgres",
    "pgvector adds a vector column type plus ivfflat/hnsw indexes to PostgreSQL, letting similarity search live next to relational data. delapan uses it through Supabase so findings, graph tables, and embeddings share one database.",
    "retrieval",
    0.97,
    ["pgvector", "postgres", "vector-search"],
    [["https://github.com/pgvector/pgvector", "pgvector postgres extension hnsw"]],
  ),
  finding(
    "f06",
    "Supabase bundles Postgres, pgvector, and an API gateway",
    "Supabase ships managed PostgreSQL with the pgvector extension enabled by default, plus auth and PostgREST. This makes it a common single-stop backend for RAG systems that want SQL and vector recall without separate infrastructure.",
    "ecosystem",
    0.93,
    ["supabase", "postgres", "hosting"],
    [["https://supabase.com/docs/guides/ai", "supabase pgvector ai vectors"]],
  ),
  finding(
    "f07",
    "FastAPI serves delapan's /v1 deploy surface",
    "The engine exposes its KB read/write operations as a FastAPI app: typed pydantic models, async handlers, and SSE streaming for long-running exploration jobs. The same routers back both the MCP server and the HTTP deploy surface.",
    "architecture",
    0.91,
    ["fastapi", "api", "sse"],
    [["https://fastapi.tiangolo.com/", "fastapi async sse streaming"]],
  ),
  finding(
    "f08",
    "Tavily is a search API purpose-built for agents",
    "Tavily exposes web search and page extraction tuned for LLM consumption — cleaned content, source scoring, and rate limits sized for agentic loops. delapan's explore pipeline uses it for the search and crawl phases.",
    "ecosystem",
    0.89,
    ["tavily", "search", "agents"],
    [["https://tavily.com/", "tavily search api for llm agents"]],
  ),
  finding(
    "f09",
    "Agentic exploration runs plan → search → crawl → extract → merge",
    "When coverage comes back 'gap', the explore pipeline plans sub-queries, fans out web searches, crawls the best hits, extracts candidate findings with an LLM, and merges them through dedup. Progress streams to the caller as SSE phase events.",
    "architecture",
    0.94,
    ["explore", "pipeline", "gap-fill"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "explore pipeline plan search crawl extract merge"]],
  ),
  finding(
    "f10",
    "The knowledge graph is grounded, typed, and verb-phrased",
    "delapan's reasoning layer is a typed property graph: nodes carry a type and label, edges carry free verb-phrase relations ('stores vectors in', 'forked from'). Every node and edge lists the finding ids that ground it, so claims are auditable.",
    "architecture",
    0.93,
    ["knowledge-graph", "grounding", "relations"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "typed nodes verb phrase relations grounded"]],
  ),
  finding(
    "f11",
    "Schema drift is detected by diffing intent vs emergent ontology",
    "The engine records the schema the user intended (node types and relations) and continuously derives the emergent schema from what the graph actually contains. Types present in the graph but absent from intent are flagged as drift and offered for reshaping.",
    "architecture",
    0.86,
    ["schema", "drift", "ontology"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "schema drift intent emergent"]],
  ),
  finding(
    "f12",
    "The synopsis is a compact topic index rebuilt after ingest",
    "After explore runs merge, delapan distills the findings corpus into a synopsis: a short list of topics with one-line glosses, stamped with the finding count at build time. It is the cheap always-loaded summary that fronts the KB.",
    "architecture",
    0.88,
    ["synopsis", "topics", "summary"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/technical-overview.md", "synopsis topics gloss rebuild"]],
  ),
  finding(
    "f13",
    "sigma.js renders large graphs on WebGL",
    "sigma.js v3 draws nodes and edges as WebGL programs, comfortably handling tens of thousands of elements where SVG renderers stall. It reads its data from a graphology Graph instance and re-renders reactively on graph events.",
    "graph-viz",
    0.96,
    ["sigma.js", "webgl", "rendering"],
    [["https://www.sigmajs.org/", "sigma js webgl graph rendering"]],
  ),
  finding(
    "f14",
    "graphology is the data layer beneath sigma",
    "graphology provides the Graph data structure — typed multigraphs, attribute storage, and an event emitter — plus a standard library of algorithms and layouts. sigma.js is deliberately render-only and delegates all graph state to graphology.",
    "graph-viz",
    0.95,
    ["graphology", "data-structure", "javascript"],
    [["https://graphology.github.io/", "graphology graph data structure library"]],
  ),
  finding(
    "f15",
    "ForceAtlas2 is a continuous force-directed layout from Gephi",
    "ForceAtlas2 balances attraction along edges against degree-weighted repulsion, with LinLog and gravity options. The 2014 PLoS ONE paper by Jacomy, Venturini, Heymann and Bastian describes it as a layout for network exploration rather than aesthetics.",
    "graph-viz",
    0.94,
    ["forceatlas2", "layout", "gephi"],
    [["https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679", "forceatlas2 continuous layout paper"]],
  ),
  finding(
    "f16",
    "Gephi Lite is the reference sigma + graphology application",
    "Gephi Lite, maintained by OuestWare for the Gephi community, is a browser-based network exploration tool built on sigma.js and graphology — the same stack delapan's control panel uses. It validates the stack for editing-capable graph UIs.",
    "graph-viz",
    0.9,
    ["gephi-lite", "ouestware", "stack"],
    [["https://gephi.org/gephi-lite/", "gephi lite browser sigma graphology"]],
  ),
  finding(
    "f17",
    "Neo4j Bloom popularized the canvas + inspector pattern",
    "Bloom established the now-standard interaction loop for graph front-ends: select an element on the canvas, inspect and edit it in a side panel. Notably, Bloom has no undo stack — destructive edits are guarded by confirmation dialogs instead.",
    "graph-viz",
    0.84,
    ["neo4j-bloom", "inspector", "ux"],
    [["https://neo4j.com/docs/bloom-user-guide/current/", "neo4j bloom edit inspector undo"]],
  ),
  finding(
    "f18",
    "Node-anchored travel beats free flight for graph tasks",
    "A controlled VR study of graph navigation found edge-constrained, node-to-node jumping outperformed free flight by roughly 2-5x on path-following and neighborhood tasks: anchoring to the structure keeps users oriented. This motivates hop-based travel modes over free camera movement.",
    "graph-viz",
    0.81,
    ["navigation", "travel", "study"],
    [["https://ieeexplore.ieee.org/document/8797751", "graph navigation vr node anchored jump vs free flight"]],
  ),
  finding(
    "f19",
    "Ego-network views reduce overload during traversal",
    "Dimming everything outside the current node's immediate neighborhood — the ego bubble — is a long-standing technique for keeping local structure legible while traversing dense graphs, used by Bloom, Kumu, and most graph exploration tools.",
    "graph-viz",
    0.85,
    ["ego-network", "focus", "traversal"],
    [["https://kumu.io/docs/focus", "kumu focus ego network dimming"]],
  ),
  finding(
    "f20",
    "Claude Code consumes delapan through MCP skills",
    "delapan ships as a Claude Code plugin: skills markdown drives /delapan:* slash commands which call an in-process MCP server (python -m delapan.mcp.server). The agent taps the KB for preambles before answering repo questions.",
    "ecosystem",
    0.92,
    ["claude-code", "mcp", "plugin"],
    [["https://docs.anthropic.com/en/docs/claude-code/mcp", "claude code mcp plugin skills"]],
  ),
  finding(
    "f21",
    "Anthropic positions Claude Code as an agentic coding harness",
    "Claude Code is Anthropic's CLI agent for software work: tool use, MCP client support, and plugin skills. Its MCP client is the integration point third-party engines like delapan target rather than bespoke APIs.",
    "ecosystem",
    0.9,
    ["anthropic", "claude-code", "agents"],
    [["https://www.anthropic.com/claude-code", "anthropic claude code agentic cli"]],
  ),
  finding(
    "f22",
    "br8n is a hard fork of the delapan engine",
    "br8n copies delapan's core engine modules (config, clients, findings, kbs, preamble, synopsis, monitoring) with imports renamed, then repurposes them for dev-context capture. It shares the Supabase schema for its cloud tier and adds a free local SQLite tier.",
    "architecture",
    0.96,
    ["br8n", "fork", "lineage"],
    [["https://github.com/delapan-ai/br8n/blob/main/CLAUDE.md", "br8n fork delapan engine imports renamed"]],
  ),
  finding(
    "f23",
    "sqlite-vec brings vector search to embedded SQLite",
    "sqlite-vec is a small C extension adding vector storage and brute-force KNN to SQLite. br8n uses it for its zero-infrastructure local tier — the same findings/recall model as pgvector but in a single file database.",
    "retrieval",
    0.87,
    ["sqlite-vec", "embedded", "local-first"],
    [["https://github.com/asg017/sqlite-vec", "sqlite-vec extension vector knn"]],
  ),
  finding(
    "f24",
    "SSE is the streaming transport for explore progress",
    "Server-Sent Events fit one-directional progress streams: a plain HTTP response of 'data:' frames, native EventSource support, and trivial proxying. delapan streams explore phase events (planning, searching, crawling, extracting, merging) over SSE.",
    "architecture",
    0.89,
    ["sse", "streaming", "transport"],
    [["https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events", "server sent events streaming progress"]],
  ),
  finding(
    "f25",
    "Provenance keeps every claim one click from its source",
    "Each finding records the URLs it was extracted from, the domain, and the search query that surfaced it. Because graph elements ground into findings, any node or edge in the reasoning layer can be audited back to the open web in two hops.",
    "architecture",
    0.91,
    ["provenance", "audit", "trust"],
    [["https://github.com/delapan-ai/delapan/blob/main/docs/vision.md", "provenance url domain query audit"]],
  ),
];

const NODES_RAG: GraphNode[] = [
  // concepts
  node("c_finding", "concept", "Finding", ["f01", "f25"], { definition: "atomic unit of evidence", plural: "findings" }),
  node("c_preamble", "concept", "Preamble", ["f03"], { role: "always-on read path" }),
  node("c_coverage", "concept", "Coverage banding", ["f04"], { verdicts: "rich | sparse | gap" }),
  node("c_dedup", "concept", "Semantic dedup", ["f02"], { method: "cosine similarity vs corpus" }),
  node("c_kg", "concept", "Knowledge graph", ["f10"], { kind: "typed property graph" }),
  node("c_embedding", "concept", "Vector embedding", ["f05"], { space: "dense float vectors" }),
  node("c_rag", "concept", "Retrieval-augmented generation", [], { abbreviation: "RAG" }),
  node("c_agentic", "concept", "Agentic exploration", ["f09"], { phases: "plan, search, crawl, extract, merge" }),
  node("c_synopsis", "concept", "Synopsis", ["f12"], { shape: "topics + glosses" }),
  node("c_drift", "concept", "Schema drift", ["f11"], { signal: "graph type missing from intent" }),
  node("c_ego", "concept", "Ego network", ["f19"], { aka: "ego bubble" }),
  node("c_prov", "concept", "Provenance", ["f25"], { fields: "url, domain, query" }),
  node("c_conf", "concept", "Confidence scoring", ["f01"], { range: "0..1" }),
  node("c_travel", "concept", "Node-anchored travel", ["f18"], { evidence: "2-5x over free flight" }),
  // technologies
  node("t_pgvector", "technology", "pgvector", ["f05"], { language: "C", indexes: "ivfflat, hnsw" }),
  node("t_supabase", "technology", "Supabase", ["f06"], { category: "managed Postgres platform" }),
  node("t_fastapi", "technology", "FastAPI", ["f07"], { language: "Python" }),
  node("t_tavily", "technology", "Tavily Search API", ["f08"], { audience: "LLM agents" }),
  node("t_sigma", "technology", "sigma.js", ["f13"], { version: "v3", renderer: "WebGL" }),
  node("t_graphology", "technology", "graphology", ["f14"], { role: "graph data structure" }),
  node("t_fa2", "technology", "ForceAtlas2", ["f15"], { origin: "Gephi" }),
  node("t_claude", "technology", "Claude Code", ["f20", "f21"], { vendor: "Anthropic" }),
  node("t_sqlitevec", "technology", "sqlite-vec", ["f23"], { footprint: "single-file" }),
  node("t_postgres", "technology", "PostgreSQL", [], { license: "PostgreSQL License" }),
  node("t_webgl", "technology", "WebGL", ["f13"], {}),
  node("t_sse", "technology", "Server-Sent Events", ["f24"], { transport: "HTTP" }),
  // people
  node("p_mjacomy", "person", "Mathieu Jacomy", ["f15"], { affiliation: "Aalborg University TANT-lab" }),
  node("p_plique", "person", "Guillaume Plique", ["f14"], { affiliation: "Sciences Po médialab" }),
  node("p_ajacomy", "person", "Alexis Jacomy", ["f16"], { affiliation: "OuestWare" }),
  node("p_venturini", "person", "Tommaso Venturini", ["f15"], { field: "controversy mapping" }),
  // companies
  node("o_anthropic", "company", "Anthropic", ["f21"], { hq: "San Francisco" }),
  node("o_supabase", "company", "Supabase Inc.", ["f06"], {}),
  node("o_neo4j", "company", "Neo4j", ["f17"], { product: "graph database" }),
  node("o_ouestware", "company", "OuestWare", ["f16"], { hq: "Nantes" }),
  node("o_tavily", "company", "Tavily", ["f08"], {}),
  node("o_medialab", "company", "Sciences Po médialab", [], { kind: "research lab" }),
  // projects — NOTE: 'project' is intentionally absent from the intent schema → drift demo
  node("j_delapan", "project", "delapan", ["f01", "f09"], { meaning: "Indonesian for eight" }),
  node("j_br8n", "project", "br8n", ["f22"], { focus: "dev context capture" }),
  node("j_gephilite", "project", "Gephi Lite", ["f16"], { runtime: "browser" }),
  node("j_bloom", "project", "Neo4j Bloom", ["f17"], { note: "no undo stack" }),
];

const EDGES_RAG: GraphEdge[] = [
  // delapan core
  edge("j_delapan", "builds", "c_kg", ["f10"]),
  edge("j_delapan", "normalizes evidence into", "c_finding", ["f01"]),
  edge("j_delapan", "persists vectors with", "t_pgvector", ["f05"]),
  edge("j_delapan", "deploys on", "t_supabase", ["f06"]),
  edge("j_delapan", "serves its API via", "t_fastapi", ["f07"]),
  edge("j_delapan", "searches the web with", "t_tavily", ["f08", "f09"]),
  edge("j_delapan", "streams progress over", "t_sse", ["f24"]),
  edge("j_delapan", "deduplicates with", "c_dedup", ["f02"]),
  edge("j_delapan", "assembles", "c_preamble", ["f03"]),
  edge("j_delapan", "grades recall with", "c_coverage", ["f04"]),
  edge("j_delapan", "distills", "c_synopsis", ["f12"]),
  edge("j_delapan", "runs", "c_agentic", ["f09"]),
  edge("j_delapan", "watches for", "c_drift", ["f11"]),
  // br8n lineage
  edge("j_br8n", "forked from", "j_delapan", ["f22"]),
  edge("j_br8n", "adds a local tier via", "t_sqlitevec", ["f22", "f23"]),
  edge("j_br8n", "shares schema with", "t_supabase", ["f22"]),
  edge("j_br8n", "captures context into", "c_kg", ["f22"]),
  // findings machinery
  edge("c_finding", "is embedded as", "c_embedding", ["f02"]),
  edge("c_finding", "carries", "c_prov", ["f25"]),
  edge("c_finding", "is weighted by", "c_conf", ["f01"]),
  edge("c_preamble", "summarizes", "c_finding", ["f03"]),
  edge("c_coverage", "grades", "c_preamble", ["f04"]),
  edge("c_dedup", "compares", "c_embedding", ["f02"]),
  edge("c_kg", "grounds into", "c_finding", ["f10", "f25"]),
  edge("c_kg", "drifts via", "c_drift", ["f11"]),
  edge("c_kg", "is navigated through", "c_ego", ["f19"]),
  edge("c_synopsis", "indexes", "c_finding", ["f12"]),
  edge("c_conf", "ranks findings inside", "c_preamble", ["f03"]),
  edge("c_prov", "traces", "c_finding", ["f25"]),
  // RAG concepts
  edge("c_rag", "retrieves", "c_finding", ["f03"]),
  edge("c_rag", "relies on", "c_embedding", ["f05"]),
  edge("c_agentic", "extends", "c_rag", ["f09"]),
  edge("c_agentic", "feeds new", "c_finding", ["f09"]),
  edge("c_agentic", "crawls via", "t_tavily", ["f08"]),
  edge("c_agentic", "rebuilds", "c_synopsis", ["f12"]),
  edge("c_travel", "constrains hops to", "c_ego", ["f18", "f19"]),
  edge("c_travel", "outperforms free flight in", "c_kg", ["f18"]),
  // storage stack
  edge("t_pgvector", "extends", "t_postgres", ["f05"]),
  edge("t_pgvector", "stores", "c_embedding", ["f05"]),
  edge("t_supabase", "hosts", "t_postgres", ["f06"]),
  edge("t_supabase", "bundles", "t_pgvector", ["f06"]),
  edge("t_sqlitevec", "mirrors", "t_pgvector", ["f23"]),
  edge("t_fastapi", "emits", "t_sse", ["f07", "f24"]),
  // viz stack
  edge("t_sigma", "renders", "c_kg", ["f13"]),
  edge("t_sigma", "draws with", "t_webgl", ["f13"]),
  edge("t_sigma", "reads state from", "t_graphology", ["f13", "f14"]),
  edge("t_graphology", "models", "c_kg", ["f14"]),
  edge("t_fa2", "positions", "c_kg", ["f15"]),
  edge("t_fa2", "ships as a plugin of", "t_graphology", ["f14", "f15"]),
  // people
  edge("p_mjacomy", "authored", "t_fa2", ["f15"]),
  edge("p_mjacomy", "researched at", "o_medialab", ["f15"]),
  edge("p_plique", "maintains", "t_graphology", ["f14"]),
  edge("p_plique", "engineers at", "o_medialab", ["f14"]),
  edge("p_ajacomy", "created", "t_sigma", ["f16"]),
  edge("p_ajacomy", "co-founded", "o_ouestware", ["f16"]),
  edge("p_venturini", "co-authored", "t_fa2", ["f15"]),
  edge("p_venturini", "studies", "c_kg", []),
  // companies
  edge("o_supabase", "develops", "t_supabase", ["f06"]),
  edge("o_ouestware", "maintains", "t_sigma", ["f16"]),
  edge("o_ouestware", "builds", "j_gephilite", ["f16"]),
  edge("o_neo4j", "sells", "j_bloom", ["f17"]),
  edge("o_anthropic", "ships", "t_claude", ["f21"]),
  edge("o_tavily", "operates", "t_tavily", ["f08"]),
  edge("o_medialab", "incubated", "t_sigma", ["f16"]),
  // ecosystem projects
  edge("j_gephilite", "renders with", "t_sigma", ["f16"]),
  edge("j_gephilite", "models graphs with", "t_graphology", ["f16"]),
  edge("j_bloom", "visualizes", "c_kg", ["f17"]),
  edge("j_bloom", "pioneered inspector editing for", "c_kg", ["f17"]),
  edge("j_bloom", "competes with", "j_delapan", ["f17"]),
  edge("t_claude", "taps into", "j_delapan", ["f20"]),
  edge("t_claude", "drives", "c_agentic", ["f20", "f21"]),
];

const SCHEMA_RAG: GraphSchema = {
  intent: {
    node_types: {
      concept: "abstract ideas and mechanisms of the domain",
      technology: "software, libraries, protocols",
      person: "researchers and maintainers",
      company: "organizations and labs",
    },
    relations: [
      "builds",
      "extends",
      "stores",
      "renders",
      "maintains",
      "authored",
      "competes with",
    ],
  },
  emergent: {
    node_types: {
      concept: "abstract ideas and mechanisms of the domain",
      technology: "software, libraries, protocols",
      person: "researchers and maintainers",
      company: "organizations and labs",
      project: "named software projects and products", // drift: not in intent
    },
    relations: [
      "builds",
      "extends",
      "stores",
      "renders",
      "maintains",
      "authored",
      "competes with",
      "forked from",
      "grounds into",
      "taps into",
    ],
  },
};

const SYNOPSIS_RAG: Synopsis = {
  content: [
    { topic: "Findings & grounding", gloss: "Evidence-first units with provenance; the graph cites them." },
    { topic: "Preamble & coverage", gloss: "Always-on read path graded rich / sparse / gap per query." },
    { topic: "Explore pipeline", gloss: "Plan → search → crawl → extract → merge, streamed over SSE." },
    { topic: "Storage stack", gloss: "Supabase Postgres with pgvector; sqlite-vec on the br8n local tier." },
    { topic: "Graph viz stack", gloss: "sigma.js v3 + graphology + ForceAtlas2 — the Gephi Lite lineage." },
    { topic: "Navigation research", gloss: "Node-anchored travel and ego bubbles beat free camera flight." },
  ],
  built_at: ts(),
  finding_count_at_build: FINDINGS_RAG.length,
};

// ---------------------------------------------------------------------------
// secondary KB: br8n / dev-context (small, shows the switcher working)

const FINDINGS_BR8N: Finding[] = [
  finding(
    "bf1",
    "br8n captures workspace snapshots per repo+branch",
    "A capture records branch, open files, cursor positions, and a diff stat plus a one-line hypothesis of intent. Snapshots land in the session KB keyed by repo and branch.",
    "architecture",
    0.92,
    ["capture", "session"],
    [["https://github.com/delapan-ai/br8n/blob/main/CLAUDE.md", "br8n capture snapshot branch"]],
  ),
  finding(
    "bf2",
    "The activity KG links repos, branches, files, and tasks",
    "br8n builds a cross-repo work graph: which repos were touched, on which branches, which files, and the tasks behind them — queryable as 'what was I working on'.",
    "architecture",
    0.88,
    ["activity", "knowledge-graph"],
    [["https://github.com/delapan-ai/br8n/blob/main/CLAUDE.md", "br8n activity knowledge graph cross repo"]],
  ),
  finding(
    "bf3",
    "Instant resume replays a coverage-graded card",
    "Pickup assembles the same preamble + coverage verdict as delapan, scoped to the current repo and branch, so an agent can resume where the human left off.",
    "architecture",
    0.9,
    ["resume", "coverage"],
    [["https://github.com/delapan-ai/br8n/blob/main/CLAUDE.md", "br8n pickup resume coverage"]],
  ),
  finding(
    "bf4",
    "The iOS companion reads the same cloud tier",
    "A SwiftUI app surfaces journey timelines and capture cards from the shared Supabase schema; the local SQLite tier stays device-side.",
    "ecosystem",
    0.78,
    ["ios", "swiftui"],
    [["https://github.com/delapan-ai/br8n/tree/main/ios-app", "br8n ios swiftui companion"]],
  ),
];

const NODES_BR8N: GraphNode[] = [
  node("b_br8n", "project", "br8n", ["bf1"], { tier: "local + cloud" }),
  node("b_capture", "concept", "Context capture", ["bf1"], {}),
  node("b_activity", "concept", "Activity KG", ["bf2"], {}),
  node("b_resume", "concept", "Instant resume", ["bf3"], {}),
  node("b_session", "concept", "Session KB", ["bf1"], { scope: "repo + branch" }),
  node("b_sqlite", "technology", "sqlite-vec", ["bf1"], {}),
  node("b_supabase", "technology", "Supabase", ["bf4"], {}),
  node("b_ios", "technology", "SwiftUI companion", ["bf4"], { platform: "iOS" }),
  node("b_delapan", "project", "delapan", [], { relation: "upstream" }),
];

const EDGES_BR8N: GraphEdge[] = [
  edge("b_br8n", "performs", "b_capture", ["bf1"]),
  edge("b_br8n", "maintains", "b_activity", ["bf2"]),
  edge("b_br8n", "offers", "b_resume", ["bf3"]),
  edge("b_capture", "writes into", "b_session", ["bf1"]),
  edge("b_resume", "reads from", "b_session", ["bf3"]),
  edge("b_activity", "spans beyond", "b_session", ["bf2"]),
  edge("b_br8n", "stores locally in", "b_sqlite", ["bf1"]),
  edge("b_br8n", "syncs cloud tier to", "b_supabase", ["bf4"]),
  edge("b_ios", "reads", "b_supabase", ["bf4"]),
  edge("b_br8n", "forked from", "b_delapan", []),
  edge("b_session", "scoped like", "b_delapan", ["bf3"]),
];

const SCHEMA_BR8N: GraphSchema = {
  intent: {
    node_types: {
      concept: "capture/resume mechanisms",
      technology: "storage and client tech",
      project: "repos and products",
    },
    relations: ["performs", "reads", "writes into", "forked from"],
  },
  emergent: {
    node_types: {
      concept: "capture/resume mechanisms",
      technology: "storage and client tech",
      project: "repos and products",
    },
    relations: ["performs", "maintains", "offers", "writes into", "reads from", "spans beyond", "stores locally in", "syncs cloud tier to", "reads", "forked from", "scoped like"],
  },
};

const SYNOPSIS_BR8N: Synopsis = {
  content: [
    { topic: "Capture", gloss: "Workspace snapshots with intent hypothesis per repo+branch." },
    { topic: "Activity graph", gloss: "Cross-repo rollup of work: repos, branches, files, tasks." },
    { topic: "Resume", gloss: "Coverage-graded pickup cards, same banding as delapan." },
  ],
  built_at: ts(),
  finding_count_at_build: FINDINGS_BR8N.length,
};

// ---------------------------------------------------------------------------
// mutable database

interface KbData {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  findings: Map<string, Finding>;
  schema: GraphSchema;
  synopsis: Synopsis | null;
  seq: number;
}

function kbData(nodes: GraphNode[], edges: GraphEdge[], findings: Finding[], schema: GraphSchema, synopsis: Synopsis): KbData {
  return {
    nodes: new Map(nodes.map((n) => [n.id, { ...n, properties: { ...n.properties }, grounded_in: [...n.grounded_in] }])),
    edges: new Map(edges.map((e) => [e.id, { ...e, properties: { ...e.properties }, grounded_in: [...e.grounded_in] }])),
    findings: new Map(findings.map((f) => [f.id, f])),
    schema,
    synopsis,
    seq: 0,
  };
}

interface MockDb {
  kbs: Map<string, KbData>; // key: `${project}/${kb}`
}

function freshDb(): MockDb {
  return {
    kbs: new Map([
      ["delapan/rag-ecosystem", kbData(NODES_RAG, EDGES_RAG, FINDINGS_RAG, SCHEMA_RAG, SYNOPSIS_RAG)],
      ["br8n/dev-context", kbData(NODES_BR8N, EDGES_BR8N, FINDINGS_BR8N, SCHEMA_BR8N, SYNOPSIS_BR8N)],
    ]),
  };
}

let db = freshDb();

/** Test hook: reset the in-memory database to the pristine dataset. */
export function resetMockDb(): void {
  db = freshDb();
}

function getKb(project: string, kb: string): KbData {
  const data = db.kbs.get(`${project}/${kb}`);
  if (!data) throw new ApiError(404, `unknown kb: ${project}/${kb}`);
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// endpoint implementations (mirror client signatures exactly)

export const mockApi = {
  async getProjects(): Promise<ProjectsResponse> {
    return {
      projects: [
        {
          project: "delapan",
          project_id: "proj_delapan",
          kbs: [{ kb: "rag-ecosystem", kb_id: "kb_rag", last_activity: "2026-06-10T18:42:00Z" }],
        },
        {
          project: "br8n",
          project_id: "proj_br8n",
          kbs: [{ kb: "dev-context", kb_id: "kb_devctx", last_activity: "2026-06-08T11:03:00Z" }],
        },
      ],
    };
  },

  async getGraph(project: string, kb: string, query: GraphQuery = {}): Promise<GraphResponse> {
    const data = getKb(project, kb);
    let nodes = [...data.nodes.values()];
    let edges = [...data.edges.values()];

    if (query.focus && data.nodes.has(query.focus)) {
      const depth = query.depth ?? 2;
      const keep = new Set<string>([query.focus]);
      let frontier = [query.focus];
      for (let d = 0; d < depth; d += 1) {
        const next: string[] = [];
        for (const e of edges) {
          for (const [a, b] of [[e.source, e.target], [e.target, e.source]] as const) {
            if (frontier.includes(a) && !keep.has(b)) {
              keep.add(b);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    }

    if (query.node_cap !== undefined && nodes.length > query.node_cap) {
      nodes = nodes.slice(0, query.node_cap);
      const ids = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }
    if (query.edge_cap !== undefined && edges.length > query.edge_cap) {
      edges = edges.slice(0, query.edge_cap);
    }

    // deep-ish copies so callers can't mutate the db by accident
    return {
      nodes: nodes.map((n) => ({ ...n, properties: { ...n.properties }, grounded_in: [...n.grounded_in] })),
      edges: edges.map((e) => ({ ...e, properties: { ...e.properties }, grounded_in: [...e.grounded_in] })),
    };
  },

  async getStats(project: string, kb: string): Promise<GraphStats> {
    const data = getKb(project, kb);
    const by_type: Record<string, number> = {};
    const by_relation: Record<string, number> = {};
    for (const n of data.nodes.values()) by_type[n.type] = (by_type[n.type] ?? 0) + 1;
    for (const e of data.edges.values()) by_relation[e.relation] = (by_relation[e.relation] ?? 0) + 1;
    return { node_count: data.nodes.size, edge_count: data.edges.size, by_type, by_relation };
  },

  async getSchema(project: string, kb: string): Promise<GraphSchema> {
    return getKb(project, kb).schema;
  },

  async createNodes(project: string, kb: string, nodes: NodeSpec[]): Promise<{ ids: string[] }> {
    const data = getKb(project, kb);
    const ids = nodes.map((spec) => {
      data.seq += 1;
      const id = `mn_${data.seq}_${Math.random().toString(36).slice(2, 7)}`;
      data.nodes.set(id, {
        id,
        type: spec.type,
        label: spec.label,
        properties: { ...(spec.properties ?? {}) },
        grounded_in: [...(spec.grounded_in ?? [])],
        created_at: new Date().toISOString(),
      });
      return id;
    });
    return { ids };
  },

  async patchNode(project: string, kb: string, id: string, patch: NodePatch): Promise<{ node: GraphNode }> {
    const data = getKb(project, kb);
    const existing = data.nodes.get(id);
    if (!existing) throw new ApiError(404, `unknown node: ${id}`);
    if (patch.label !== undefined) existing.label = patch.label;
    if (patch.type !== undefined) existing.type = patch.type;
    if (patch.properties !== undefined) existing.properties = { ...patch.properties };
    if (patch.grounded_in !== undefined) existing.grounded_in = [...patch.grounded_in];
    return { node: { ...existing, properties: { ...existing.properties }, grounded_in: [...existing.grounded_in] } };
  },

  async deleteNode(project: string, kb: string, id: string): Promise<{ deleted: boolean; removed_edge_ids: string[] }> {
    const data = getKb(project, kb);
    if (!data.nodes.has(id)) throw new ApiError(404, `unknown node: ${id}`);
    data.nodes.delete(id);
    const removed: string[] = [];
    for (const [eid, e] of data.edges) {
      if (e.source === id || e.target === id) {
        data.edges.delete(eid);
        removed.push(eid);
      }
    }
    return { deleted: true, removed_edge_ids: removed };
  },

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

  async createEdges(project: string, kb: string, edges: EdgeSpec[]): Promise<{ inserted: number }> {
    const data = getKb(project, kb);
    let inserted = 0;
    for (const spec of edges) {
      if (!data.nodes.has(spec.source) || !data.nodes.has(spec.target)) {
        throw new ApiError(422, `edge endpoints must exist: ${spec.source} -> ${spec.target}`);
      }
      data.seq += 1;
      const id = `me_${data.seq}_${Math.random().toString(36).slice(2, 7)}`;
      data.edges.set(id, {
        id,
        source: spec.source,
        target: spec.target,
        relation: spec.relation,
        properties: { ...(spec.properties ?? {}) },
        grounded_in: [...(spec.grounded_in ?? [])],
        created_at: new Date().toISOString(),
      });
      inserted += 1;
    }
    return { inserted };
  },

  async deleteEdge(project: string, kb: string, id: string): Promise<{ deleted: boolean }> {
    const data = getKb(project, kb);
    if (!data.edges.delete(id)) throw new ApiError(404, `unknown edge: ${id}`);
    return { deleted: true };
  },

  async getFindings(project: string, kb: string, params: { category?: string; limit?: number } = {}): Promise<FindingsResponse> {
    const data = getKb(project, kb);
    let list = [...data.findings.values()];
    if (params.category) list = list.filter((f) => f.category === params.category);
    if (params.limit !== undefined) list = list.slice(0, params.limit);
    return { count: list.length, findings: list };
  },

  async getFinding(project: string, kb: string, id: string): Promise<Finding> {
    const data = getKb(project, kb);
    const f = data.findings.get(id);
    if (!f) throw new ApiError(404, `unknown finding: ${id}`);
    return f;
  },

  async deleteFinding(project: string, kb: string, id: string): Promise<{ deleted: boolean }> {
    const data = getKb(project, kb);
    if (!data.findings.delete(id)) throw new ApiError(404, `unknown finding: ${id}`);
    return { deleted: true };
  },

  async getSynopsis(project: string, kb: string): Promise<Synopsis | null> {
    return getKb(project, kb).synopsis;
  },

  async getResume(project: string, kb: string, query: string, _depth?: number): Promise<ResumeResponse> {
    const data = getKb(project, kb);
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);
    const matched = [...data.findings.values()].filter((f) => {
      const hay = `${f.title} ${f.content} ${f.tags.join(" ")}`.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    });
    const coverage = matched.length >= 5 ? "rich" : matched.length >= 2 ? "sparse" : "gap";
    const top = matched.slice(0, 4);
    const preamble = [
      `<preamble kb="${project}/${kb}" coverage="${coverage}">`,
      ...(data.synopsis?.content.slice(0, 3).map((t) => `• ${t.topic} — ${t.gloss}`) ?? []),
      ...(top.length ? ["", "Matched findings:"] : []),
      ...top.map((f) => `[${f.confidence.toFixed(2)}] ${f.title}`),
      "</preamble>",
    ].join("\n");
    return { preamble, coverage };
  },

  async *explore(project: string, kb: string, body: { prompt: string; max_findings?: number }): AsyncGenerator<ExploreEvent> {
    const data = getKb(project, kb);
    yield { phase: "planning", message: `decomposing "${body.prompt}" into sub-queries` };
    await sleep(550);
    yield { phase: "searching", message: "fanning out 3 web searches via Tavily" };
    await sleep(700);
    yield { phase: "crawling", message: "crawling 5 top-ranked pages" };
    await sleep(700);
    yield { phase: "extracting", message: "extracting candidate findings" };
    await sleep(650);
    yield { phase: "merging", message: "deduplicating against corpus" };
    await sleep(500);
    // synthesize one real finding so the demo visibly grows
    data.seq += 1;
    const id = `mf_${data.seq}`;
    const created: Finding = {
      id,
      title: `Explored: ${body.prompt.slice(0, 64)}`,
      content: `Mock exploration result for "${body.prompt}". In live mode this would be an LLM-extracted finding merged through semantic dedup.`,
      category: "exploration",
      confidence: 0.62,
      tags: ["mock", "explore"],
      provenance: [{ url: "https://example.com/mock", domain: "example.com", query: body.prompt }],
      created_at: new Date().toISOString(),
    };
    data.findings.set(id, created);
    yield { phase: "completed", finding_ids: [id], count: 1 };
  },
};

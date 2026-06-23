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

/** Finding `content` is typed `string`, but the live API can deliver a free-form
 * object. Coerce to readable text — string as-is, an object's values joined,
 * anything else stringified — so downstream string ops never throw. */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    return Object.values(content as Record<string, unknown>)
      .filter((v) => v != null && v !== "")
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n\n");
  }
  return content == null ? "" : String(content);
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
    content: contentToText(f.content),
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
  const description = propDesc ?? ledeSentence(contentToText(top?.content));

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

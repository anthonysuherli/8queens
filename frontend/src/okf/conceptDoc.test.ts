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

  it("coerces non-string finding content without crashing", () => {
    // The live API can deliver `content` as an object (free-form finding dict),
    // even though the wire type says string. The builder must not assume string.
    const objFinding = {
      ...F1,
      id: "f2",
      content: { summary: "Day-one gains are deferred.", note: "see IFRS 17.43" },
    } as unknown as Finding;
    addNode("a", "concept", "X", ["f2"]);
    const doc = buildConceptDoc("a", { f2: ready(objFinding) })!;
    expect(doc.findings).toHaveLength(1);
    expect(typeof doc.findings[0].content).toBe("string");
    expect(doc.findings[0].content).toContain("Day-one gains are deferred.");
    expect(typeof doc.frontmatter.description).toBe("string");
    expect(doc.frontmatter.description).toContain("Day-one gains are deferred.");
  });
});

/**
 * Pure derivations: local graph tallies + tolerant schema-shape extraction.
 */

import { graph } from "../graph/graphStore";

export function localByType(): Record<string, number> {
  const out: Record<string, number> = {};
  graph.forEachNode((_, attrs) => {
    out[attrs.nodeType] = (out[attrs.nodeType] ?? 0) + 1;
  });
  return out;
}

export function localByRelation(): Record<string, number> {
  const out: Record<string, number> = {};
  graph.forEachEdge((_, attrs) => {
    out[attrs.relation] = (out[attrs.relation] ?? 0) + 1;
  });
  return out;
}

export function localRelationNames(): string[] {
  return Object.keys(localByRelation()).sort();
}

/**
 * The contract types schema intent/emergent as opaque objects. Tolerantly
 * pull node-type names out of the common shapes:
 *   {node_types: {name: desc}} | {node_types: ["name"]} | {name: desc} | ["name"]
 */
export function extractNodeTypes(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const obj = schema as Record<string, unknown>;
  const source = obj.node_types ?? obj.nodeTypes ?? obj.types ?? obj.entities ?? obj;
  if (Array.isArray(source)) {
    return source
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? String((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).type ?? "")
            : "",
      )
      .filter(Boolean);
  }
  if (source && typeof source === "object") {
    return Object.keys(source as Record<string, unknown>).filter((k) => k !== "relations");
  }
  return [];
}

export function knownTypes(intentSchema: unknown, emergentSchema: unknown): string[] {
  const set = new Set<string>([
    ...Object.keys(localByType()),
    ...extractNodeTypes(intentSchema),
    ...extractNodeTypes(emergentSchema),
  ]);
  if (set.size === 0) ["concept", "technology", "person", "company"].forEach((t) => set.add(t));
  return [...set].sort();
}

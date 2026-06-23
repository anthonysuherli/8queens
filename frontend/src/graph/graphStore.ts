/**
 * The single mutable graphology instance behind the whole app.
 *
 *   API data ──build──▶ graph ◀──commands (optimistic mutations)
 *                        │
 *                        ├─▶ sigma (auto via graphology events)
 *                        └─▶ React panels (via graphTouched → store.graphVersion)
 *
 * Domain attributes on nodes: label, nodeType, properties, grounded_in,
 * created_at — plus render attrs x, y, size, color. ("type" is reserved by
 * sigma for the render program, hence nodeType.)
 */

import Graph from "graphology";

export interface NodeAttrs {
  label: string;
  nodeType: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface EdgeAttrs {
  label: string; // sigma renders this; mirrors relation
  relation: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
  size: number;
  color: string;
}

export const graph = new Graph<NodeAttrs, EdgeAttrs>({ multi: true, type: "directed" });

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notify React-side subscribers that domain data on the graph changed. */
export function graphTouched(): void {
  listeners.forEach((fn) => fn());
}

export function onGraphTouched(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Degree-driven node size, recomputed after structural changes. */
export function nodeSize(degree: number): number {
  return 4 + Math.sqrt(degree) * 2.4;
}

export function refreshNodeSizes(ids?: string[]): void {
  const update = (id: string) => {
    if (graph.hasNode(id)) graph.setNodeAttribute(id, "size", nodeSize(graph.degree(id)));
  };
  if (ids) ids.forEach(update);
  else graph.forEachNode(update);
}

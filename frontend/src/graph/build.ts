/**
 * GraphResponse ──▶ graphology attributes (clear + rebuild on KB switch).
 */

import type { GraphResponse } from "../api/types";
import { typeColor, EDGE_COLOR } from "./colors";
import { graph, graphTouched, refreshNodeSizes } from "./graphStore";
import { runLayout } from "./layout";

export function buildGraph(data: GraphResponse): void {
  graph.clear();
  for (const n of data.nodes) {
    graph.addNode(n.id, {
      label: n.label,
      nodeType: n.type,
      properties: n.properties ?? {},
      grounded_in: n.grounded_in ?? [],
      created_at: n.created_at,
      x: NaN,
      y: NaN,
      size: 4,
      color: typeColor(n.type),
    });
  }
  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    graph.addEdgeWithKey(e.id, e.source, e.target, {
      label: e.relation,
      relation: e.relation,
      properties: e.properties ?? {},
      grounded_in: e.grounded_in ?? [],
      created_at: e.created_at,
      size: 1.4,
      color: EDGE_COLOR,
    });
  }
  refreshNodeSizes();
  runLayout();
  graphTouched();
}

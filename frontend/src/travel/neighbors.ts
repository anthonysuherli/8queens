/**
 * Stable, screen-angle-ordered neighbor list for the current travel node.
 * The same ordering feeds the hotkey badges AND the keyboard handler, so
 * "press 3" always matches the badge labeled 3.
 */

import { graph } from "../graph/graphStore";
import { sigmaRef } from "../graph/sigmaRef";

export function orderedNeighbors(current: string): string[] {
  if (!graph.hasNode(current)) return [];
  const project = (id: string): { x: number; y: number } => {
    const attrs = graph.getNodeAttributes(id);
    const sigma = sigmaRef.current;
    // viewport space if sigma is live (so angles match the screen), else graph space
    return sigma ? sigma.graphToViewport({ x: attrs.x, y: attrs.y }) : { x: attrs.x, y: -attrs.y };
  };
  const center = project(current);
  return graph
    .neighbors(current)
    .map((id) => {
      const p = project(id);
      // angle measured clockwise from 12 o'clock — badge 1 is "up"
      const angle = (Math.atan2(p.x - center.x, -(p.y - center.y)) + Math.PI * 2) % (Math.PI * 2);
      return { id, angle };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((n) => n.id);
}

export function hopKeyLabel(index: number): string | null {
  if (index < 9) return String(index + 1);
  if (index === 9) return "0";
  return null; // beyond 10 neighbors: arrow keys + click only
}

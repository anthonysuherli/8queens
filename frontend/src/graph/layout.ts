/**
 * Deterministic seeding + bounded ForceAtlas2 runs (no perpetual jiggle).
 */

import forceAtlas2 from "graphology-layout-forceatlas2";
import { graph } from "./graphStore";

/** Small deterministic PRNG so the same KB lands in the same shape. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed positions for any node that doesn't have one yet. */
export function seedPositions(): void {
  const radius = Math.sqrt(graph.order) * 10 + 10;
  graph.forEachNode((id, attrs) => {
    if (Number.isFinite(attrs.x) && Number.isFinite(attrs.y)) return;
    const rand = mulberry32(hash(id));
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.35 + rand() * 0.65);
    graph.setNodeAttribute(id, "x", Math.cos(angle) * r);
    graph.setNodeAttribute(id, "y", Math.sin(angle) * r);
  });
}

/** Run FA2 for a fixed number of iterations, then stop. */
export function runLayout(iterations = 320): void {
  if (graph.order === 0) return;
  seedPositions();
  const settings = forceAtlas2.inferSettings(graph);
  forceAtlas2.assign(graph, {
    iterations,
    settings: { ...settings, adjustSizes: false, slowDown: settings.slowDown ?? 1 },
  });
}

/** Spot for a freshly created node: near an anchor, with a touch of jitter. */
export function placeNear(anchorId: string | null): { x: number; y: number } {
  const rand = Math.random;
  if (anchorId && graph.hasNode(anchorId)) {
    const { x, y } = graph.getNodeAttributes(anchorId);
    return { x: x + (rand() - 0.5) * 30, y: y + (rand() - 0.5) * 30 };
  }
  if (graph.order === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  graph.forEachNode((_, a) => {
    sx += a.x;
    sy += a.y;
  });
  return { x: sx / graph.order + (rand() - 0.5) * 40, y: sy / graph.order + (rand() - 0.5) * 40 };
}

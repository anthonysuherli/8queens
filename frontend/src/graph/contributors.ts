/**
 * Contributor → color. Each researcher (and the synthesizer) claims a stable
 * hue so the live graph shows WHO discovered each node. Distinct from typeColor
 * (which colors by entity type); contributor coloring is the society overlay.
 */

export const CONTRIBUTOR_RING = ["#f5a83c", "#58c4f6", "#46d39a", "#ef7bac", "#b18cfa"];
export const SYNTHESIZER_COLOR = "#e5d96b";

const assigned = new Map<string, string>();

export function contributorColor(contributorId: string): string {
  if (contributorId === "synthesizer") return SYNTHESIZER_COLOR;
  let color = assigned.get(contributorId);
  if (!color) {
    color = CONTRIBUTOR_RING[assigned.size % CONTRIBUTOR_RING.length];
    assigned.set(contributorId, color);
  }
  return color;
}

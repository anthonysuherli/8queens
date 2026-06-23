/**
 * Type → color mapping, consistent everywhere (canvas, legend, chips).
 * Known base types get fixed instrument hues; unknown types claim the next
 * free hue from the fallback ring, stable for the session.
 */

const BASE_COLORS: Record<string, string> = {
  concept: "#58c4f6",
  technology: "#f5a83c",
  person: "#ef7bac",
  company: "#46d39a",
  project: "#b18cfa",
};

const FALLBACK_RING = ["#7adfd4", "#e5d96b", "#fa8c64", "#9aa8f7", "#c9e07a", "#e08fe2"];

const assigned = new Map<string, string>();

export function typeColor(type: string): string {
  const base = BASE_COLORS[type];
  if (base) return base;
  let color = assigned.get(type);
  if (!color) {
    color = FALLBACK_RING[assigned.size % FALLBACK_RING.length];
    assigned.set(type, color);
  }
  return color;
}

export const DIM_NODE = "#222b38";
export const DIM_EDGE = "#161d27";
export const EDGE_COLOR = "#2c3a4d";
export const ACCENT = "#f5a83c";
export const VISITED_MIX = 0.45;

/** Mix a hex color toward white (amount 0..1) — used for the explored tint. */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

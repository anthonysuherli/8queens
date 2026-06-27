/** Pure column layout for the derivation map. Deterministic, no DOM. */

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export function layoutColumn(ids: string[], x: number, height: number): Placed[] {
  if (ids.length === 0) return [];
  const step = height / (ids.length + 1);
  return ids.map((id, i) => ({ id, x, y: Math.round(step * (i + 1)) }));
}

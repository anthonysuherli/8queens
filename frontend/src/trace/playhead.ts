/** Pure: the set of nodes that exist once frames[0..playhead] have played. */

import type { TraceFrame } from "./traceModel";

export function visibleAtPlayhead(
  frames: TraceFrame[],
  playhead: number,
): { gaps: Set<string>; findings: Set<string> } {
  const gaps = new Set<string>();
  const findings = new Set<string>();
  for (let i = 0; i <= playhead && i < frames.length; i += 1) {
    const f = frames[i];
    if (f.event === "gap_opened" && typeof f.gap_id === "string") gaps.add(f.gap_id);
    if (f.event === "finding_merged" && typeof f.finding_id === "string") findings.add(f.finding_id);
  }
  return { gaps, findings };
}

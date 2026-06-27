/** Pure: phrase a gap's lifecycle for the inspector. No DOM. */

import type { GapEvent, TraceGap } from "./traceModel";

function phrase(e: GapEvent, gap: TraceGap): string {
  switch (e.kind) {
    case "opened":
      return gap.parentId ? "spawned by Critic (sharpen)" : "opened by planner";
    case "claimed":
      return `claimed by ${e.by ?? "?"}`;
    case "filled":
      return `verified ${e.coverage ?? "?"}`;
    case "reopened":
      return `Critic reopened${e.reason ? ` (${e.reason})` : ""}`;
    case "done":
      return `done (${e.coverage ?? "rich"})`;
    case "dead":
      return `killed dead${e.reason ? ` (${e.reason})` : ""}`;
    default:
      return e.kind;
  }
}

export function describeLifecycle(gap: TraceGap): string[] {
  return gap.lifecycle.map((e) => phrase(e, gap));
}

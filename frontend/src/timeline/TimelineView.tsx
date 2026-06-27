/** Agent-collaboration timeline: forward-playing swimlanes + brain growth.
 * Reads the same committed run bundle as the trace view. */

import { useMemo } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTimeline } from "./buildTimeline";
import rawBundle from "../trace/fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TimelineView() {
  const model = useMemo(() => buildTimeline(bundle), []);
  return (
    <div className="timeline">
      <div className="tl-badge">
        recorded run · {bundle.meta.topic} · {model.lanes.length} agents · {model.totalFindings} findings
      </div>
    </div>
  );
}

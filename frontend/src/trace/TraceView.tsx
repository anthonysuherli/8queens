/**
 * Trace view shell. Loads the committed run bundle, builds the TraceModel once,
 * and (for now) confirms it rendered. Panels are added in later tasks.
 */

import { useMemo } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <div className="trace-stub">
        {model.claims.length} claims · {Object.keys(model.gaps).length} gaps ·{" "}
        {Object.keys(model.findings).length} findings
      </div>
    </div>
  );
}

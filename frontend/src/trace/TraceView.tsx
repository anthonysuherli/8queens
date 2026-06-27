/**
 * Trace view shell. Loads the committed run bundle, builds the TraceModel once,
 * and coordinates claim/node/playhead selection across the panes.
 */

import { useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { ReportPane } from "./ReportPane";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);

  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <ReportPane model={model} activeClaimId={activeClaimId} onSelectClaim={setActiveClaimId} />
      <div className="trace-stub">map → Task 5</div>
      <div className="trace-stub">inspector → Task 6</div>
    </div>
  );
}

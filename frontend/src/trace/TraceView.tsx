import { useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { DerivationMap, type SelectedNode } from "./DerivationMap";
import { ReportPane } from "./ReportPane";
import { TraceInspector } from "./TraceInspector";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  const selectClaim = (id: string) => {
    setActiveClaimId(id);
    setSelected(null);
  };

  return (
    <div className="trace">
      <div className="trace-badge">
        recorded run · {model.meta.topic} · {model.meta.captured_at.slice(0, 10)}
      </div>
      <ReportPane model={model} activeClaimId={activeClaimId} onSelectClaim={selectClaim} />
      <DerivationMap
        model={model}
        activeClaimId={activeClaimId}
        selectedNodeId={selected?.id ?? null}
        onSelectNode={setSelected}
      />
      <TraceInspector model={model} selected={selected} />
    </div>
  );
}

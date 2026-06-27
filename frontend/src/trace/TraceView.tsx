import { useEffect, useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { buildTrace } from "./buildTrace";
import { DerivationMap, type SelectedNode } from "./DerivationMap";
import { ReportPane } from "./ReportPane";
import { TraceInspector } from "./TraceInspector";
import { Transport } from "./Transport";
import { visibleAtPlayhead } from "./playhead";
import rawBundle from "./fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;

export default function TraceView() {
  const model = useMemo(() => buildTrace(bundle), []);
  const frameCount = model.frames.length;
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [playhead, setPlayhead] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (playhead >= frameCount - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setPlayhead((p) => p + 1), 600);
    return () => window.clearTimeout(id);
  }, [playing, playhead, frameCount]);

  const selectClaim = (id: string) => {
    setActiveClaimId(id);
    setSelected(null);
    setPlayhead(frameCount - 1);
  };

  const togglePlay = () => {
    if (!playing && playhead >= frameCount - 1) setPlayhead(0);
    setPlaying((p) => !p);
  };

  const visible = useMemo(() => visibleAtPlayhead(model.frames, playhead), [model.frames, playhead]);

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
        visible={visible}
      />
      <TraceInspector model={model} selected={selected} />
      <div className="trace-transport-wrap">
        <Transport
          count={frameCount}
          playhead={playhead}
          playing={playing}
          onSeek={(i) => { setPlaying(false); setPlayhead(i); }}
          onTogglePlay={togglePlay}
        />
      </div>
    </div>
  );
}

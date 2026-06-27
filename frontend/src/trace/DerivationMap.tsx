/**
 * Center pane: a 4-column SVG derivation map (Claim · Findings · Gaps · Sources).
 * Selecting a claim lights the path claim→findings→gap→sources and dims the rest.
 */

import { useMemo } from "react";
import { contributorColor } from "../graph/contributors";
import { layoutColumn, type Placed } from "./layout";
import type { Coverage } from "../api/types";
import type { TraceModel } from "./traceModel";

export type SelectedNode = { kind: "finding" | "gap" | "source"; id: string };

interface Props {
  model: TraceModel;
  activeClaimId: string | null;
  selectedNodeId: string | null;
  onSelectNode: (n: SelectedNode) => void;
  visible?: { gaps: Set<string>; findings: Set<string> };
}

const W = 760;
const H = 460;
const COL = { claim: 70, finding: 280, gap: 500, source: 700 };

function coverageColor(c: Coverage | null): string {
  if (c === "rich") return "var(--rich)";
  if (c === "sparse") return "var(--sparse)";
  return "var(--gap)";
}

function bezier(a: Placed, b: Placed): string {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

export function DerivationMap({ model, activeClaimId, selectedNodeId, onSelectNode, visible }: Props) {
  const view = useMemo(() => {
    const claim = activeClaimId ? model.claims.find((c) => c.id === activeClaimId) ?? null : null;
    let findingIds = claim ? claim.findingIds : Object.keys(model.findings);
    if (visible) findingIds = findingIds.filter((fid) => visible.findings.has(fid));
    const gapIds = Array.from(
      new Set(findingIds.map((fid) => model.findings[fid]?.gapId).filter((g): g is string => !!g)),
    );
    const sourceKeys: string[] = [];
    for (const fid of findingIds) {
      (model.findings[fid]?.sources ?? []).forEach((_s, i) => sourceKeys.push(`${fid}#${i}`));
    }
    return { claim, findingIds, gapIds, sourceKeys };
  }, [model, activeClaimId, visible]);

  const claimPlaced = layoutColumn(view.claim ? [view.claim.id] : [], COL.claim, H);
  const findingPlaced = layoutColumn(view.findingIds, COL.finding, H);
  const gapPlaced = layoutColumn(view.gapIds, COL.gap, H);
  const sourcePlaced = layoutColumn(view.sourceKeys, COL.source, H);

  const gapPos = new Map(gapPlaced.map((p) => [p.id, p]));
  const sourcePos = new Map(sourcePlaced.map((p) => [p.id, p]));

  const edges: Array<{ a: Placed; b: Placed }> = [];
  for (const fp of findingPlaced) {
    if (view.claim && claimPlaced[0]) edges.push({ a: claimPlaced[0], b: fp });
    const gid = model.findings[fp.id]?.gapId;
    const gp = gid ? gapPos.get(gid) : undefined;
    if (gp) edges.push({ a: fp, b: gp });
    (model.findings[fp.id]?.sources ?? []).forEach((_s, i) => {
      const sp = sourcePos.get(`${fp.id}#${i}`);
      if (sp) edges.push({ a: fp, b: sp });
    });
  }

  return (
    <svg className="trace-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <g className="trace-map-edges">
        {edges.map((e, i) => (
          <path key={i} d={bezier(e.a, e.b)} className="trace-edge" />
        ))}
      </g>
      {claimPlaced[0] && view.claim && (
        <g transform={`translate(${claimPlaced[0].x}, ${claimPlaced[0].y})`}>
          <circle r={9} className="trace-node trace-node--claim" />
          <text className="trace-node-label" x={14} y={4}>claim</text>
        </g>
      )}
      {findingPlaced.map((p) => {
        const f = model.findings[p.id];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "finding", id: p.id })}
          >
            <circle r={8} className="trace-node" style={{ fill: contributorColor(f?.contributor ?? "r0") }} />
            <text className="trace-node-label" x={12} y={4}>{f?.title.slice(0, 22) ?? p.id}</text>
          </g>
        );
      })}
      {gapPlaced.map((p) => {
        const g = model.gaps[p.id];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "gap", id: p.id })}
          >
            <rect x={-9} y={-9} width={18} height={18} rx={3} className="trace-node"
              style={{ fill: coverageColor(g?.coverage ?? null) }} />
            <text className="trace-node-label" x={14} y={4}>{g?.question.slice(0, 22) ?? p.id}</text>
          </g>
        );
      })}
      {sourcePlaced.map((p) => {
        const [fid, idx] = p.id.split("#");
        const src = model.findings[fid]?.sources[Number(idx)];
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            className={`trace-hit${selectedNodeId === p.id ? " trace-hit--sel" : ""}`}
            onClick={() => onSelectNode({ kind: "source", id: p.id })}
          >
            <circle r={5} className="trace-node trace-node--source" />
            <text className="trace-node-label" x={10} y={3}>{src?.domain ?? "source"}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Agent-collaboration timeline: a forward-playing swimlane per agent over the
 * recorded run. As the playhead advances, events appear in lanes and the
 * shared-brain meter (findings + coverage) grows. Reuses the trace Transport. */

import { useEffect, useMemo, useState } from "react";
import type { SocietyRunBundle } from "../api/types";
import { Transport } from "../trace/Transport";
import { buildTimeline, cumulativeAt } from "./buildTimeline";
import type { TimelineEvent, TimelineLane } from "./timelineModel";
import rawBundle from "../trace/fixtures/sample.json";

const bundle = rawBundle as unknown as SocietyRunBundle;
const COV_COLOR: Record<string, string> = { rich: "var(--rich)", sparse: "var(--sparse)", gap: "var(--gap)" };

export default function TimelineView() {
  const model = useMemo(() => buildTimeline(bundle), []);
  const frameCount = model.frameCount;
  const [playhead, setPlayhead] = useState(frameCount - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (playhead >= frameCount - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setPlayhead((p) => p + 1), 120);
    return () => window.clearTimeout(id);
  }, [playing, playhead, frameCount]);

  const togglePlay = () => {
    if (!playing && playhead >= frameCount - 1) setPlayhead(0);
    setPlaying((p) => !p);
  };

  const cur = cumulativeAt(model, playhead);
  const pct = (t: number) => (model.durationT ? (t / model.durationT) * 100 : 0);
  const headT = model.events.length ? playheadT(model, playhead) : 0;
  const headPct = pct(headT);
  const brainPct = model.totalFindings ? (cur.findings / model.totalFindings) * 100 : 0;

  const byLane = (laneId: string): TimelineEvent[] =>
    model.events.filter((e) => e.laneId === laneId && e.frameIndex <= playhead);

  return (
    <div className="timeline">
      <div className="tl-badge">
        recorded run · {bundle.meta.topic} · phase <b>{cur.phase ?? "—"}</b> · round {cur.round}
      </div>

      <div className="tl-phaseband">
        {model.phases.map((p, i) => (
          <div
            key={i}
            className={`tl-phase tl-phase--${p.phase}${cur.phase === p.phase && cur.round === p.round ? " tl-phase--active" : ""}`}
            style={{ width: `${pct(p.endT) - pct(p.startT)}%` }}
          >
            {p.phase}
          </div>
        ))}
      </div>

      <div className="tl-lanes">
        {model.lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} events={byLane(lane.id)} pct={pct} headPct={headPct} />
        ))}
      </div>

      <div className="tl-brain">
        <div className="tl-brain-head">
          <span>shared brain</span>
          <span className="tl-brain-count">{cur.findings} / {model.totalFindings} findings</span>
          <span className="tl-cov" style={{ color: cur.coverage ? COV_COLOR[cur.coverage] : "var(--text-faint)" }}>
            coverage: {cur.coverage ?? "—"}
          </span>
        </div>
        <div className="tl-brain-bar">
          <div className="tl-brain-fill" style={{ width: `${brainPct}%`, background: cur.coverage ? COV_COLOR[cur.coverage] : "var(--line-bright)" }} />
        </div>
        <div className="tl-ticker">{cur.latestFinding ? `+ ${cur.latestFinding}` : "…"}</div>
      </div>

      <div className="tl-transport">
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

function playheadT(model: ReturnType<typeof buildTimeline>, playhead: number): number {
  let t = 0;
  for (const e of model.events) if (e.frameIndex <= playhead) t = Math.max(t, e.t);
  for (const p of model.phases) if (p.startIndex <= playhead) t = Math.max(t, p.startT);
  return t;
}

function LaneRow({ lane, events, pct, headPct }: {
  lane: TimelineLane;
  events: TimelineEvent[];
  pct: (t: number) => number;
  headPct: number;
}) {
  return (
    <div className="tl-row">
      <div className="tl-lane-label" style={{ color: lane.color }}>
        <span className="tl-dot" style={{ background: lane.color }} />
        {lane.label}
      </div>
      <div className="tl-track">
        <div className="tl-head" style={{ left: `${headPct}%` }} />
        {events.map((e) => {
          if (e.kind === "finding") {
            return <span key={`${e.frameIndex}-${e.kind}`} className="tl-finding" style={{ left: `${pct(e.t)}%`, background: lane.color }} />;
          }
          const cls = e.kind === "post-gap" ? "tl-chip tl-chip--gap"
            : e.kind === "claim" ? "tl-chip tl-chip--claim"
            : e.kind === "grade" ? "tl-chip tl-chip--grade"
            : "tl-chip tl-chip--report";
          const text = e.kind === "post-gap" ? "gap" : e.kind === "claim" ? "claim" : e.kind === "grade" ? "done" : "report";
          return <span key={`${e.frameIndex}-${e.kind}`} className={cls} style={{ left: `${pct(e.t)}%`, borderColor: lane.color }} title={e.label}>{text}</span>;
        })}
      </div>
    </div>
  );
}

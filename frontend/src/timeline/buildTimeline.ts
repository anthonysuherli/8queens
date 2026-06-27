/** Pure: SocietyRunBundle → TimelineModel. Routes each timestamped frame into a
 * per-agent lane; derives phase spans + coverage marks; cumulativeAt() reports
 * the growing brain state at a playhead. No I/O, no React. */

import type { BundleFrame, Coverage, SocietyRunBundle } from "../api/types";
import { contributorColor } from "../graph/contributors";
import type {
  CoverageMark, CumulativeState, PhaseSpan, TimelineEvent, TimelineLane, TimelineModel,
} from "./timelineModel";

const PLANNER_COLOR = "#f5a83c";
const CRITIC_COLOR = "#ef5b66";
const SYNTH_COLOR = "#e5d96b";

function researcherIds(frames: BundleFrame[]): string[] {
  const ids: string[] = [];
  for (const f of frames) {
    let id: unknown;
    if (f.event === "gap_claimed") id = f.claimed_by;
    else if (f.event === "finding_merged") id = f.contributor;
    if (typeof id === "string" && id !== "planner" && id !== "synthesizer" && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids.sort();
}

function frameT(f: BundleFrame): number {
  return typeof f.t === "number" ? f.t : 0;
}

export function buildTimeline(bundle: SocietyRunBundle): TimelineModel {
  const frames = bundle.frames;
  const researchers = researcherIds(frames);
  const lanes: TimelineLane[] = [
    { id: "planner", role: "planner", label: "Planner", color: PLANNER_COLOR },
    ...researchers.map((id): TimelineLane => ({ id, role: "researcher", label: id, color: contributorColor(id) })),
    { id: "critic", role: "critic", label: "Critic", color: CRITIC_COLOR },
    { id: "synthesizer", role: "synthesizer", label: "Synthesizer", color: SYNTH_COLOR },
  ];

  const events: TimelineEvent[] = [];
  const coverageMarks: CoverageMark[] = [];
  const phaseStarts: Array<{ phase: string; round: number; t: number; index: number }> = [];

  frames.forEach((f, i) => {
    const t = frameT(f);
    switch (f.event) {
      case "phase":
        phaseStarts.push({ phase: String(f.phase), round: typeof f.round === "number" ? f.round : 0, t, index: i });
        break;
      case "gap_opened":
        events.push({ laneId: "planner", frameIndex: i, t, kind: "post-gap", label: String(f.question ?? "gap"), gapId: f.gap_id as string });
        break;
      case "gap_claimed":
        events.push({ laneId: String(f.claimed_by), frameIndex: i, t, kind: "claim", label: "claimed", gapId: f.gap_id as string });
        break;
      case "finding_merged":
        events.push({ laneId: String(f.contributor), frameIndex: i, t, kind: "finding", label: String(f.title ?? "finding"), findingId: f.finding_id as string, gapId: f.gap_id as string });
        break;
      case "gap_filled":
        if (f.status === "done") {
          events.push({ laneId: "critic", frameIndex: i, t, kind: "grade", label: "done", gapId: f.gap_id as string, coverage: f.coverage as Coverage });
        }
        break;
      case "coverage":
        if (f.overall) coverageMarks.push({ frameIndex: i, t, overall: f.overall as Coverage });
        break;
      case "report":
        events.push({ laneId: "synthesizer", frameIndex: i, t, kind: "report", label: "cited report" });
        break;
      default:
        break;
    }
  });

  const durationT = frames.reduce((m, f) => Math.max(m, frameT(f)), 0);
  const phases: PhaseSpan[] = phaseStarts.map((p, idx) => {
    const next = phaseStarts[idx + 1];
    return {
      phase: p.phase, round: p.round, startT: p.t, endT: next ? next.t : durationT,
      startIndex: p.index, endIndex: next ? next.index : frames.length,
    };
  });

  const totalFindings = events.filter((e) => e.kind === "finding").length;
  return { lanes, events, phases, coverageMarks, totalFindings, durationT, frameCount: frames.length };
}

export function cumulativeAt(model: TimelineModel, playhead: number): CumulativeState {
  const findingEvents = model.events.filter((e) => e.kind === "finding" && e.frameIndex <= playhead);
  const cov = model.coverageMarks.filter((c) => c.frameIndex <= playhead).pop();
  const ph = model.phases.filter((p) => p.startIndex <= playhead).pop();
  const last = findingEvents[findingEvents.length - 1];
  return {
    findings: findingEvents.length,
    coverage: cov ? cov.overall : null,
    phase: ph ? ph.phase : null,
    round: ph ? ph.round : 0,
    latestFinding: last ? last.label : null,
  };
}

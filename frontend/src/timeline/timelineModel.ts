/** Types the agent-collaboration timeline renders, derived purely from a
 * SocietyRunBundle by buildTimeline(). */

import type { Coverage } from "../api/types";

export type LaneRole = "planner" | "researcher" | "critic" | "synthesizer";

export interface TimelineLane {
  id: string;
  role: LaneRole;
  label: string;
  color: string;
}

export type EventKind = "post-gap" | "claim" | "finding" | "grade" | "report";

export interface TimelineEvent {
  laneId: string;
  frameIndex: number;
  t: number;
  kind: EventKind;
  label: string;
  gapId?: string;
  findingId?: string;
  coverage?: Coverage;
}

export interface PhaseSpan {
  phase: string;
  round: number;
  startT: number;
  endT: number;
  startIndex: number;
  endIndex: number;
}

export interface CoverageMark {
  frameIndex: number;
  t: number;
  overall: Coverage;
}

export interface TimelineModel {
  lanes: TimelineLane[];
  events: TimelineEvent[];
  phases: PhaseSpan[];
  coverageMarks: CoverageMark[];
  totalFindings: number;
  durationT: number;
  frameCount: number;
}

export interface CumulativeState {
  findings: number;
  coverage: Coverage | null;
  phase: string | null;
  round: number;
  latestFinding: string | null;
}

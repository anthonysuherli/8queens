/**
 * Derived model the Trace view renders. Built purely from a SocietyRunBundle by
 * buildTrace(). The bundle is the wire shape; this is the resolved, denormalized
 * shape the panels consume (claim → finding → gap → source already wired up).
 */

import type { BundleMeta, Coverage } from "../api/types";

export interface Source {
  url: string;
  domain: string;
  query: string;
}

export type GapEventKind = "opened" | "claimed" | "filled" | "reopened" | "done" | "dead";

export interface GapEvent {
  kind: GapEventKind;
  t?: number;
  by?: string;
  coverage?: Coverage;
  round?: number;
  reason?: string;
}

export type TraceGapStatus = "open" | "claimed" | "verified" | "done" | "dead";

export interface TraceGap {
  id: string;
  question: string;
  status: TraceGapStatus;
  owner: string | null;
  coverage: Coverage | null;
  attempts: number;
  reason: string | null;
  parentId: string | null;
  findingIds: string[];
  lifecycle: GapEvent[];
}

export interface TraceFinding {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number | null;
  gapId: string | null;
  contributor: string | null;
  sources: Source[];
}

export interface Claim {
  id: string;
  text: string;
  kind: "heading" | "prose";
  findingIds: string[];
  unresolvedIds: string[];
}

export interface TraceFrame {
  t: number;
  event: string;
  [key: string]: unknown;
}

export interface TraceModel {
  meta: BundleMeta;
  claims: Claim[];
  findings: Record<string, TraceFinding>;
  gaps: Record<string, TraceGap>;
  frames: TraceFrame[];
  unanswered: string[];
}

/**
 * Wire types for the delapan engine API. THE CONTRACT IS LAW — these mirror
 * the backend response shapes exactly; do not add invented fields here.
 */

export interface KbInfo {
  kb: string;
  kb_id: string;
  last_activity: string | null;
}

export interface ProjectInfo {
  project: string;
  project_id: string;
  kbs: KbInfo[];
}

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphQuery {
  focus?: string;
  depth?: number;
  node_cap?: number;
  edge_cap?: number;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  by_type: Record<string, number>;
  by_relation: Record<string, number>;
}

export interface GraphSchema {
  intent: Record<string, unknown> | null;
  emergent: Record<string, unknown>;
}

export interface NodeSpec {
  type: string;
  label: string;
  properties?: Record<string, unknown>;
  grounded_in?: string[];
}

export interface NodePatch {
  label?: string;
  type?: string;
  properties?: Record<string, unknown>;
  grounded_in?: string[];
}

export interface EdgeSpec {
  source: string;
  target: string;
  relation: string;
  properties?: Record<string, unknown>;
  grounded_in?: string[];
}

export interface Provenance {
  url: string;
  domain: string;
  query: string;
}

export interface Finding {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number;
  tags: string[];
  provenance: Provenance[];
  created_at: string;
}

export interface FindingsResponse {
  count: number;
  findings: Finding[];
}

export interface ConceptDocResponse {
  description: string;
  body_markdown: string;
  model: string;
  built_at: string;
  grounded_hash: string;
}

export interface SynopsisTopic {
  topic: string;
  gloss: string;
}

export interface Synopsis {
  content: SynopsisTopic[];
  built_at: string;
  finding_count_at_build: number;
}

export type Coverage = "rich" | "sparse" | "gap";

export interface ResumeResponse {
  preamble: string;
  coverage: Coverage;
}

export type ExplorePhase =
  | "planning"
  | "searching"
  | "crawling"
  | "extracting"
  | "merging"
  | "completed"
  | "error";

export interface ExploreEvent {
  phase: ExplorePhase;
  message?: string;
  finding_ids?: string[];
  count?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// society SSE protocol (NET-NEW — mirrors the frozen 8.2 frame schema)

export interface Contributor {
  id: string; // researcher id ("r0", "r1") or "synthesizer"
  role: "researcher" | "synthesizer";
}

export interface SocietyPhaseEvent {
  event: "phase";
  phase: "seeding" | "researching" | "critiquing" | "synthesizing";
  round: number;
}

export interface SocietyNodeAddedEvent {
  event: "node_added";
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
  contributor: string;
  role: "researcher" | "synthesizer";
}

export interface SocietyEdgeAddedEvent {
  event: "edge_added";
  id: string;
  source: string;
  target: string;
  relation: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
}

export interface SocietyFindingMergedEvent {
  event: "finding_merged";
  finding_id: string;
  gap_id: string;
  title: string;
  contributor: string;
}

export interface SocietyGapOpenedEvent {
  event: "gap_opened";
  gap_id: string;
  question: string;
  parent_id: string | null;
}

export interface SocietyGapClaimedEvent {
  event: "gap_claimed";
  gap_id: string;
  claimed_by: string;
  role: "researcher";
}

export interface SocietyGapFilledEvent {
  event: "gap_filled";
  gap_id: string;
  coverage: Coverage;
  finding_ids: string[];
  status: "verified" | "done";
}

export interface SocietyCoverageEvent {
  event: "coverage";
  gap_id: string | null;
  coverage: Coverage;
  band1_hits: number;
  overall: Coverage;
}

export interface SocietyReportEvent {
  event: "report";
  report: string;
  unanswered: string[];
}

export interface SocietyDoneEvent {
  event: "done";
  run_id: string;
  rounds: number;
  finding_count: number;
  gaps_done: number;
  gaps_dead: number;
}

export interface SocietyErrorEvent {
  event: "error";
  error: string;
  fatal: boolean;
}

/** Additive frame (not in the frozen 11): kill-switch countdown, one per
 *  finished phase. Frame-to-frame deltas are exact per-role LLM-call costs. */
export interface SocietyBudgetEvent {
  event: "budget";
  used: number;
  max: number | null;
  phase: "seeding" | "researching" | "critiquing" | "synthesizing";
  round: number;
}

export type SocietyEvent =
  | SocietyPhaseEvent
  | SocietyNodeAddedEvent
  | SocietyEdgeAddedEvent
  | SocietyFindingMergedEvent
  | SocietyGapOpenedEvent
  | SocietyGapClaimedEvent
  | SocietyGapFilledEvent
  | SocietyCoverageEvent
  | SocietyReportEvent
  | SocietyDoneEvent
  | SocietyErrorEvent
  | SocietyBudgetEvent;

export interface StartSocietyResponse {
  kb_id: string;
  run_id: string;
}

// ---------------------------------------------------------------------------
// recorded run bundle (Trace view — see docs/sse-frames.md for frame shapes)

export interface BundleSource {
  url: string;
  domain: string;
  query: string;
}

export interface BundleFinding {
  id: string;
  title: string;
  content: string;
  category: string;
  confidence: number | null;
  provenance: BundleSource[];
}

export interface BundleGap {
  gap_id: string;
  question: string;
  status: "open" | "claimed" | "verified" | "done" | "dead";
  owner: string | null;
  coverage: Coverage | null;
  attempts: number;
  reason: string | null;
  parent_id: string | null;
  finding_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface BundleFrame {
  t: number;
  event: string;
  [key: string]: unknown;
}

export interface BundleMeta {
  topic: string;
  run_id: string;
  kb_id: string;
  captured_at: string;
  n_researchers: number;
  max_rounds: number;
  rounds: number;
  finding_count: number;
  gaps_done: number;
  gaps_dead: number;
  models: Record<string, string>;
}

export interface SocietyRunBundle {
  meta: BundleMeta;
  frames: BundleFrame[];
  gaps: BundleGap[];
  findings: Record<string, BundleFinding>;
  report: { markdown: string; unanswered: string[] };
}

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

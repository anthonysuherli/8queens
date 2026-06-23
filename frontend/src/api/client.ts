/**
 * Single typed client for the delapan engine API.
 *
 *   UI ──▶ client.* ──▶ live fetch (VITE_API_BASE)
 *                  └──▶ mockApi    (VITE_USE_MOCK=1, or live unreachable)
 *
 * ALL fetch logic lives here so contract fixes are one-file. Auto-fallback:
 * a network-level failure (backend down) flips the session to mock mode and
 * notifies listeners; HTTP errors (4xx/5xx) surface as ApiError instead.
 */

import { mockApi } from "./mock";
import {
  ApiError,
  type ConceptDocResponse,
  type EdgeSpec,
  type ExploreEvent,
  type Finding,
  type FindingsResponse,
  type GraphNode,
  type GraphQuery,
  type GraphResponse,
  type GraphSchema,
  type GraphStats,
  type NodePatch,
  type NodeSpec,
  type ProjectsResponse,
  type ResumeResponse,
  type Synopsis,
} from "./types";

const env = import.meta.env as Record<string, string | undefined>;
const BASE = env.VITE_API_BASE ?? "http://127.0.0.1:8001";

export type ApiMode = "live" | "mock";

let mode: ApiMode = env.VITE_USE_MOCK === "1" ? "mock" : "live";
const modeListeners = new Set<(mode: ApiMode) => void>();

export function getApiMode(): ApiMode {
  return mode;
}

export function onApiModeChange(listener: (mode: ApiMode) => void): () => void {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

function setMode(next: ApiMode): void {
  if (mode === next) return;
  mode = next;
  modeListeners.forEach((l) => l(next));
}

/** fetch throws TypeError on network failure — that (and only that) triggers fallback. */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.text();
      if (body) detail = body.slice(0, 300);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function call<T>(live: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (mode === "mock") return mock();
  try {
    return await live();
  } catch (err) {
    if (isNetworkError(err)) {
      setMode("mock");
      return mock();
    }
    throw err;
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (!entries.length) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

const kbPath = (project: string, kb: string) =>
  `/api/projects/${encodeURIComponent(project)}/kbs/${encodeURIComponent(kb)}`;

// ---------------------------------------------------------------------------
// endpoints

export function getProjects(): Promise<ProjectsResponse> {
  return call(() => http("/api/projects"), () => mockApi.getProjects());
}

export function getGraph(project: string, kb: string, query: GraphQuery = {}): Promise<GraphResponse> {
  return call(
    () => http(`${kbPath(project, kb)}/graph${qs({ ...query })}`),
    () => mockApi.getGraph(project, kb, query),
  );
}

export function getStats(project: string, kb: string): Promise<GraphStats> {
  return call(() => http(`${kbPath(project, kb)}/graph/stats`), () => mockApi.getStats(project, kb));
}

export function getSchema(project: string, kb: string): Promise<GraphSchema> {
  return call(() => http(`${kbPath(project, kb)}/graph/schema`), () => mockApi.getSchema(project, kb));
}

export function createNodes(project: string, kb: string, nodes: NodeSpec[]): Promise<{ ids: string[] }> {
  return call(
    () => http(`${kbPath(project, kb)}/graph/nodes`, { method: "POST", body: JSON.stringify({ nodes }) }),
    () => mockApi.createNodes(project, kb, nodes),
  );
}

export function patchNode(project: string, kb: string, id: string, patch: NodePatch): Promise<{ node: GraphNode }> {
  return call(
    () =>
      http(`${kbPath(project, kb)}/graph/nodes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    () => mockApi.patchNode(project, kb, id, patch),
  );
}

export function deleteNode(
  project: string,
  kb: string,
  id: string,
): Promise<{ deleted: boolean; removed_edge_ids: string[] }> {
  return call(
    () => http(`${kbPath(project, kb)}/graph/nodes/${encodeURIComponent(id)}`, { method: "DELETE" }),
    () => mockApi.deleteNode(project, kb, id),
  );
}

export function synthesizeConceptDoc(
  project: string,
  kb: string,
  nodeId: string,
): Promise<ConceptDocResponse> {
  return call(
    () =>
      http(`${kbPath(project, kb)}/graph/nodes/${encodeURIComponent(nodeId)}/concept-doc`, {
        method: "POST",
      }),
    () => mockApi.synthesizeConceptDoc(project, kb, nodeId),
  );
}

export function createEdges(project: string, kb: string, edges: EdgeSpec[]): Promise<{ inserted: number }> {
  return call(
    () => http(`${kbPath(project, kb)}/graph/edges`, { method: "POST", body: JSON.stringify({ edges }) }),
    () => mockApi.createEdges(project, kb, edges),
  );
}

export function deleteEdge(project: string, kb: string, id: string): Promise<{ deleted: boolean }> {
  return call(
    () => http(`${kbPath(project, kb)}/graph/edges/${encodeURIComponent(id)}`, { method: "DELETE" }),
    () => mockApi.deleteEdge(project, kb, id),
  );
}

export function getFindings(
  project: string,
  kb: string,
  params: { category?: string; limit?: number } = {},
): Promise<FindingsResponse> {
  return call(
    () => http(`${kbPath(project, kb)}/findings${qs({ ...params })}`),
    () => mockApi.getFindings(project, kb, params),
  );
}

export function getFinding(project: string, kb: string, id: string): Promise<Finding> {
  return call(
    () => http(`${kbPath(project, kb)}/findings/${encodeURIComponent(id)}`),
    () => mockApi.getFinding(project, kb, id),
  );
}

export function deleteFinding(project: string, kb: string, id: string): Promise<{ deleted: boolean }> {
  return call(
    () => http(`${kbPath(project, kb)}/findings/${encodeURIComponent(id)}`, { method: "DELETE" }),
    () => mockApi.deleteFinding(project, kb, id),
  );
}

export function getSynopsis(project: string, kb: string): Promise<Synopsis | null> {
  return call(() => http(`${kbPath(project, kb)}/synopsis`), () => mockApi.getSynopsis(project, kb));
}

/** May reject with ApiError(503) when embeddings are unavailable. */
export function getResume(project: string, kb: string, query: string, depth?: number): Promise<ResumeResponse> {
  return call(
    () => http(`${kbPath(project, kb)}/resume${qs({ query, depth })}`),
    () => mockApi.getResume(project, kb, query, depth),
  );
}

// ---------------------------------------------------------------------------
// explore (SSE)

async function* liveExplore(
  project: string,
  kb: string,
  body: { prompt: string; max_findings?: number },
): AsyncGenerator<ExploreEvent> {
  const res = await fetch(`${BASE}${kbPath(project, kb)}/explore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, res.statusText);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data) as ExploreEvent;
      } catch {
        // skip malformed frames rather than aborting the stream
      }
    }
  }
}

export async function* explore(
  project: string,
  kb: string,
  body: { prompt: string; max_findings?: number },
): AsyncGenerator<ExploreEvent> {
  if (mode === "mock") {
    yield* mockApi.explore(project, kb, body);
    return;
  }
  let stream: AsyncGenerator<ExploreEvent>;
  try {
    stream = liveExplore(project, kb, body);
    // force the initial fetch so network failures trigger fallback
    const first = await stream.next();
    if (first.done) return;
    yield first.value;
  } catch (err) {
    if (isNetworkError(err)) {
      setMode("mock");
      yield* mockApi.explore(project, kb, body);
      return;
    }
    throw err;
  }
  yield* stream;
}

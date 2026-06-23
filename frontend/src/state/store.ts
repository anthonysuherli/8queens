/**
 * Central zustand store: scope, selection, travel, toasts, undo wiring.
 *
 *   boot ─▶ projects ─▶ loadScope ─▶ buildGraph ─▶ sigma
 *   commands ─▶ graphTouched ─▶ graphVersion++ ─▶ React panels re-derive
 */

import { create } from "zustand";
import * as api from "../api/client";
import type {
  Finding,
  GraphSchema,
  GraphStats,
  ProjectInfo,
  Synopsis,
} from "../api/types";
import { buildGraph } from "../graph/build";
import { graph, onGraphTouched } from "../graph/graphStore";
import { clearAliases } from "./commands";
import { undoManager, type Command } from "./undo";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
  undoable?: boolean;
}

export interface TravelState {
  current: string;
  visited: Set<string>;
  visitedEdges: Set<string>;
  trail: Array<{ id: string; label: string }>;
  neighborIndex: number;
  hop: { from: string; to: string; startedAt: number } | null;
}

export type FindingCacheEntry =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Finding };

const SCOPE_KEY = "delapan.scope";

interface AppState {
  mode: api.ApiMode;
  booting: boolean;
  bootError: string | null;
  projects: ProjectInfo[];
  project: string | null;
  kb: string | null;
  loadingGraph: boolean;
  graphVersion: number;
  stats: GraphStats | null;
  schema: GraphSchema | null;
  synopsis: Synopsis | null;
  findingCache: Record<string, FindingCacheEntry>;
  selectedNodes: string[];
  selectedEdges: string[];
  openFindingId: string | null;
  openConceptNodeId: string | null;
  conceptBackStack: string[];
  connectFrom: string | null;
  edgeDraft: { source: string; target: string } | null;
  addNodeOpen: boolean;
  lastAction: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  toasts: Toast[];
  travel: TravelState | null;
  flyTo: { nodeId: string; at: number } | null;

  boot(): Promise<void>;
  setScope(project: string, kb: string): Promise<void>;
  loadScope(): Promise<void>;
  refreshStats(): void;
  selectNode(id: string, additive?: boolean): void;
  selectEdge(id: string, additive?: boolean): void;
  clearSelection(): void;
  runCmd(cmd: Command, opts?: { undoToast?: boolean }): Promise<boolean>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  pushToast(kind: Toast["kind"], text: string, undoable?: boolean): void;
  dismissToast(id: number): void;
  fetchFinding(id: string): void;
  openFinding(id: string | null): void;
  openConcept(id: string | null): void;
  navigateConcept(id: string): void;
  conceptBack(): void;
  startConnect(sourceId: string): void;
  cancelConnect(): void;
  proposeEdge(targetId: string): void;
  clearEdgeDraft(): void;
  setAddNodeOpen(open: boolean): void;
  requestFly(nodeId: string): void;
  enterTravel(startId?: string): void;
  exitTravel(): void;
  beginHop(targetId: string): void;
  teleport(nodeId: string): void;
  setNeighborIndex(index: number): void;
  setLastAction(text: string): void;
}

let toastSeq = 0;

function loadSavedScope(): { project: string; kb: string } | null {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { project?: string; kb?: string };
    if (typeof parsed.project === "string" && typeof parsed.kb === "string") {
      return { project: parsed.project, kb: parsed.kb };
    }
  } catch {
    /* corrupt storage — ignore */
  }
  return null;
}

export const useStore = create<AppState>((set, get) => ({
  mode: api.getApiMode(),
  booting: true,
  bootError: null,
  projects: [],
  project: null,
  kb: null,
  loadingGraph: false,
  graphVersion: 0,
  stats: null,
  schema: null,
  synopsis: null,
  findingCache: {},
  selectedNodes: [],
  selectedEdges: [],
  openFindingId: null,
  openConceptNodeId: null,
  conceptBackStack: [],
  connectFrom: null,
  edgeDraft: null,
  addNodeOpen: false,
  lastAction: "—",
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  toasts: [],
  travel: null,
  flyTo: null,

  async boot() {
    set({ booting: true, bootError: null });
    try {
      const { projects } = await api.getProjects();
      set({ projects, mode: api.getApiMode() });
      const saved = loadSavedScope();
      const valid =
        saved &&
        projects.some((p) => p.project === saved.project && p.kbs.some((k) => k.kb === saved.kb))
          ? saved
          : null;
      const first = projects[0];
      const scope = valid ?? (first && first.kbs[0] ? { project: first.project, kb: first.kbs[0].kb } : null);
      if (!scope) {
        set({ booting: false, bootError: "no projects available" });
        return;
      }
      set({ project: scope.project, kb: scope.kb });
      await get().loadScope();
      set({ booting: false });
    } catch (err) {
      set({ booting: false, bootError: err instanceof Error ? err.message : String(err) });
    }
  },

  async setScope(project, kb) {
    if (get().project === project && get().kb === kb) return;
    localStorage.setItem(SCOPE_KEY, JSON.stringify({ project, kb }));
    set({ project, kb });
    await get().loadScope();
  },

  async loadScope() {
    const { project, kb } = get();
    if (!project || !kb) return;
    set({
      loadingGraph: true,
      selectedNodes: [],
      selectedEdges: [],
      travel: null,
      connectFrom: null,
      edgeDraft: null,
      openFindingId: null,
      openConceptNodeId: null,
      conceptBackStack: [],
      findingCache: {},
    });
    undoManager.clear();
    clearAliases();
    try {
      const [graphRes, statsRes, schemaRes, synopsisRes] = await Promise.allSettled([
        api.getGraph(project, kb),
        api.getStats(project, kb),
        api.getSchema(project, kb),
        api.getSynopsis(project, kb),
      ]);
      if (graphRes.status === "rejected") throw graphRes.reason;
      buildGraph(graphRes.value);
      set({
        stats: statsRes.status === "fulfilled" ? statsRes.value : null,
        schema: schemaRes.status === "fulfilled" ? schemaRes.value : null,
        synopsis: synopsisRes.status === "fulfilled" ? synopsisRes.value : null,
        mode: api.getApiMode(),
        lastAction: `loaded ${project}/${kb} — ${graphRes.value.nodes.length} nodes, ${graphRes.value.edges.length} edges`,
      });
    } catch (err) {
      get().pushToast("error", `failed to load graph: ${err instanceof Error ? err.message : err}`);
    } finally {
      set({ loadingGraph: false });
    }
  },

  refreshStats() {
    const { project, kb } = get();
    if (!project || !kb) return;
    api
      .getStats(project, kb)
      .then((stats) => set({ stats }))
      .catch(() => {
        /* stats refresh is best-effort */
      });
  },

  selectNode(id, additive = false) {
    if (!additive) {
      set({ selectedNodes: [id], selectedEdges: [] });
      return;
    }
    const current = get().selectedNodes;
    set({
      selectedNodes: current.includes(id) ? current.filter((n) => n !== id) : [...current, id],
    });
  },

  selectEdge(id, additive = false) {
    if (!additive) {
      set({ selectedEdges: [id], selectedNodes: [] });
      return;
    }
    const current = get().selectedEdges;
    set({
      selectedEdges: current.includes(id) ? current.filter((e) => e !== id) : [...current, id],
    });
  },

  clearSelection() {
    set({ selectedNodes: [], selectedEdges: [] });
  },

  async runCmd(cmd, opts = {}) {
    try {
      await undoManager.run(cmd);
      set({
        lastAction: cmd.label,
        selectedNodes: get().selectedNodes.filter((id) => graph.hasNode(id)),
        selectedEdges: get().selectedEdges.filter((id) => graph.hasEdge(id)),
      });
      if (opts.undoToast) get().pushToast("success", cmd.label, true);
      get().refreshStats();
      return true;
    } catch (err) {
      get().pushToast("error", `${cmd.label} failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  },

  async undo() {
    try {
      const label = await undoManager.undo();
      if (label) {
        set({
          lastAction: `undid: ${label}`,
          selectedNodes: get().selectedNodes.filter((id) => graph.hasNode(id)),
          selectedEdges: get().selectedEdges.filter((id) => graph.hasEdge(id)),
        });
        get().refreshStats();
      }
    } catch (err) {
      get().pushToast("error", `undo failed: ${err instanceof Error ? err.message : err}`);
    }
  },

  async redo() {
    try {
      const label = await undoManager.redo();
      if (label) {
        set({
          lastAction: `redid: ${label}`,
          selectedNodes: get().selectedNodes.filter((id) => graph.hasNode(id)),
          selectedEdges: get().selectedEdges.filter((id) => graph.hasEdge(id)),
        });
        get().refreshStats();
      }
    } catch (err) {
      get().pushToast("error", `redo failed: ${err instanceof Error ? err.message : err}`);
    }
  },

  pushToast(kind, text, undoable = false) {
    toastSeq += 1;
    const id = toastSeq;
    set({ toasts: [...get().toasts, { id, kind, text, undoable }] });
    window.setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 5000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  fetchFinding(id) {
    const { project, kb, findingCache } = get();
    if (!project || !kb || findingCache[id]) return;
    set({ findingCache: { ...get().findingCache, [id]: { status: "loading" } } });
    api
      .getFinding(project, kb, id)
      .then((data) =>
        set({ findingCache: { ...get().findingCache, [id]: { status: "ready", data } } }),
      )
      .catch((err) =>
        set({
          findingCache: {
            ...get().findingCache,
            [id]: { status: "error", message: err instanceof Error ? err.message : String(err) },
          },
        }),
      );
  },

  openFinding(id) {
    if (id) get().fetchFinding(id);
    set({ openFindingId: id });
  },

  openConcept(nodeId) {
    if (nodeId && graph.hasNode(nodeId)) {
      graph.getNodeAttributes(nodeId).grounded_in.forEach((id) => get().fetchFinding(id));
    }
    set({ openConceptNodeId: nodeId, conceptBackStack: [] });
  },

  navigateConcept(nodeId) {
    if (!graph.hasNode(nodeId)) return;
    graph.getNodeAttributes(nodeId).grounded_in.forEach((id) => get().fetchFinding(id));
    const cur = get().openConceptNodeId;
    set({
      openConceptNodeId: nodeId,
      conceptBackStack: cur ? [...get().conceptBackStack, cur] : get().conceptBackStack,
    });
  },

  conceptBack() {
    const stack = get().conceptBackStack;
    if (!stack.length) {
      set({ openConceptNodeId: null });
      return;
    }
    const prev = stack[stack.length - 1];
    if (graph.hasNode(prev)) {
      graph.getNodeAttributes(prev).grounded_in.forEach((id) => get().fetchFinding(id));
    }
    set({ openConceptNodeId: prev, conceptBackStack: stack.slice(0, -1) });
  },

  startConnect(sourceId) {
    set({ connectFrom: sourceId, edgeDraft: null });
  },

  cancelConnect() {
    set({ connectFrom: null, edgeDraft: null });
  },

  proposeEdge(targetId) {
    const source = get().connectFrom;
    if (!source || source === targetId) return;
    set({ edgeDraft: { source, target: targetId } });
  },

  clearEdgeDraft() {
    set({ edgeDraft: null, connectFrom: null });
  },

  setAddNodeOpen(open) {
    set({ addNodeOpen: open });
  },

  requestFly(nodeId) {
    set({ flyTo: { nodeId, at: Date.now() } });
  },

  enterTravel(startId) {
    const start =
      startId ??
      get().selectedNodes[0] ??
      // default: the highest-degree node — the natural "hub" starting point
      graph.nodes().reduce<string | null>((best, id) => {
        if (best === null) return id;
        return graph.degree(id) > graph.degree(best) ? id : best;
      }, null);
    if (!start || !graph.hasNode(start)) {
      get().pushToast("error", "no node to start travel from");
      return;
    }
    set({
      travel: {
        current: start,
        visited: new Set([start]),
        visitedEdges: new Set(),
        trail: [{ id: start, label: graph.getNodeAttributes(start).label }],
        neighborIndex: 0,
        hop: null,
      },
      selectedNodes: [start],
      selectedEdges: [],
      connectFrom: null,
      edgeDraft: null,
      lastAction: "entered travel mode — number keys hop, arrows aim, Esc exits",
    });
    get().requestFly(start);
  },

  exitTravel() {
    if (!get().travel) return;
    set({ travel: null, lastAction: "exited travel mode" });
  },

  beginHop(targetId) {
    const travel = get().travel;
    if (!travel || travel.hop || !graph.hasNode(targetId)) return;
    if (!graph.areNeighbors(travel.current, targetId)) return;
    const hop = { from: travel.current, to: targetId, startedAt: Date.now() };
    set({ travel: { ...travel, hop } });
    window.setTimeout(() => {
      const t = get().travel;
      if (!t || t.hop !== hop) return;
      if (!graph.hasNode(targetId)) {
        set({ travel: { ...t, hop: null } });
        return;
      }
      const visited = new Set(t.visited).add(targetId);
      const visitedEdges = new Set(t.visitedEdges);
      for (const e of graph.edges(hop.from, targetId)) visitedEdges.add(e);
      for (const e of graph.edges(targetId, hop.from)) visitedEdges.add(e);
      set({
        travel: {
          current: targetId,
          visited,
          visitedEdges,
          trail: [...t.trail, { id: targetId, label: graph.getNodeAttributes(targetId).label }],
          neighborIndex: 0,
          hop: null,
        },
        selectedNodes: [targetId],
        selectedEdges: [],
        lastAction: `hopped to "${graph.getNodeAttributes(targetId).label}"`,
      });
    }, 290);
  },

  teleport(nodeId) {
    const travel = get().travel;
    if (!travel || travel.hop || !graph.hasNode(nodeId)) return;
    set({
      travel: { ...travel, current: nodeId, neighborIndex: 0 },
      selectedNodes: [nodeId],
      selectedEdges: [],
      lastAction: `jumped back to "${graph.getNodeAttributes(nodeId).label}"`,
    });
    get().requestFly(nodeId);
  },

  setNeighborIndex(index) {
    const travel = get().travel;
    if (!travel) return;
    set({ travel: { ...travel, neighborIndex: index } });
  },

  setLastAction(text) {
    set({ lastAction: text });
  },
}));

// ---------------------------------------------------------------------------
// wiring: graph mutations → version bump; undo stack → flags; api mode → badge

onGraphTouched(() => {
  useStore.setState((s) => ({ graphVersion: s.graphVersion + 1 }));
});

undoManager.subscribe(() => {
  useStore.setState({
    canUndo: undoManager.canUndo,
    canRedo: undoManager.canRedo,
    undoLabel: undoManager.undoLabel,
    redoLabel: undoManager.redoLabel,
  });
});

api.onApiModeChange((mode) => {
  useStore.setState({ mode });
  if (mode === "mock") {
    useStore.getState().pushToast("info", "engine unreachable — switched to built-in mock data");
  }
});

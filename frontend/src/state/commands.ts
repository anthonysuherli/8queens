/**
 * Mutation commands: optimistic local apply ──▶ API call ──▶ rollback on fail.
 *
 * Each factory returns a Command whose invert() is the exact inverse. Because
 * the API mints fresh ids when an element is re-created (undo of a delete),
 * an alias registry maps stale ids → their live replacements; every command
 * resolves ids through it at execute/invert time.
 *
 * Contract wrinkle: POST /graph/edges returns only {inserted}, no ids — new
 * edge ids are recovered by refetching the graph and matching
 * (source, target, relation) against edges we don't know locally yet.
 */

import * as api from "../api/client";
import type { EdgeSpec, NodePatch, NodeSpec } from "../api/types";
import { EDGE_COLOR, typeColor } from "../graph/colors";
import { graph, graphTouched, refreshNodeSizes } from "../graph/graphStore";
import { placeNear } from "../graph/layout";
import type { Command } from "./undo";

export interface KbCtx {
  project: string;
  kb: string;
}

// ---------------------------------------------------------------------------
// id aliasing (stale id → replacement after delete/undo cycles)

const aliases = new Map<string, string>();

export function resolveId(id: string): string {
  let current = id;
  let hops = 0;
  while (aliases.has(current) && hops < 100) {
    current = aliases.get(current)!;
    hops += 1;
  }
  return current;
}

function alias(oldId: string, newId: string): void {
  if (oldId !== newId) aliases.set(oldId, newId);
}

export function clearAliases(): void {
  aliases.clear();
}

// ---------------------------------------------------------------------------
// local graph helpers

interface SavedEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  created_at: string;
}

function addLocalNode(id: string, spec: NodeSpec, pos: { x: number; y: number }): void {
  graph.addNode(id, {
    label: spec.label,
    nodeType: spec.type,
    properties: { ...(spec.properties ?? {}) },
    grounded_in: [...(spec.grounded_in ?? [])],
    created_at: new Date().toISOString(),
    x: pos.x,
    y: pos.y,
    size: 4,
    color: typeColor(spec.type),
  });
  graphTouched();
}

function addLocalEdge(id: string, spec: EdgeSpec): void {
  graph.addEdgeWithKey(id, spec.source, spec.target, {
    label: spec.relation,
    relation: spec.relation,
    properties: { ...(spec.properties ?? {}) },
    grounded_in: [...(spec.grounded_in ?? [])],
    created_at: new Date().toISOString(),
    size: 1.4,
    color: EDGE_COLOR,
  });
  refreshNodeSizes([spec.source, spec.target]);
  graphTouched();
}

function captureEdge(edgeId: string): SavedEdge {
  const attrs = graph.getEdgeAttributes(edgeId);
  return {
    id: edgeId,
    source: graph.source(edgeId),
    target: graph.target(edgeId),
    relation: attrs.relation,
    properties: { ...attrs.properties },
    grounded_in: [...attrs.grounded_in],
    created_at: attrs.created_at,
  };
}

function restoreEdgeLocally(saved: SavedEdge, newId: string): void {
  addLocalEdge(newId, {
    source: saved.source,
    target: saved.target,
    relation: saved.relation,
    properties: saved.properties,
    grounded_in: saved.grounded_in,
  });
}

/**
 * POST /graph/edges gives back no ids — refetch the graph and match each spec
 * to an edge we don't have locally (newest created_at wins on ties).
 */
async function resolveNewEdgeIds(ctx: KbCtx, specs: EdgeSpec[]): Promise<string[]> {
  const res = await api.getGraph(ctx.project, ctx.kb);
  const claimed = new Set<string>();
  return specs.map((spec) => {
    const match = res.edges
      .filter(
        (e) =>
          !claimed.has(e.id) &&
          !graph.hasEdge(e.id) &&
          e.source === spec.source &&
          e.target === spec.target &&
          e.relation === spec.relation,
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!match) {
      throw new Error(
        `created edge ${spec.source} -[${spec.relation}]-> ${spec.target} but could not recover its id`,
      );
    }
    claimed.add(match.id);
    return match.id;
  });
}

let tempSeq = 0;
const tempId = (prefix: string) => `__tmp_${prefix}_${(tempSeq += 1)}`;

// ---------------------------------------------------------------------------
// commands

export function createNodeCommand(
  ctx: KbCtx,
  spec: NodeSpec,
  anchorId: string | null,
): { cmd: Command; currentId: () => string | null } {
  let id: string | null = null;
  const pos = placeNear(anchorId);

  const cmd: Command = {
    label: `add node "${spec.label}"`,
    async execute() {
      const tmp = tempId("n");
      addLocalNode(tmp, spec, pos);
      try {
        const { ids } = await api.createNodes(ctx.project, ctx.kb, [spec]);
        const newId = ids[0];
        if (!newId) throw new Error("API returned no id for created node");
        // swap temp key for the real id
        graph.dropNode(tmp);
        addLocalNode(newId, spec, pos);
        if (id) alias(id, newId); // redo after undo: old captured id is stale
        id = newId;
      } catch (err) {
        if (graph.hasNode(tmp)) graph.dropNode(tmp);
        graphTouched();
        throw err;
      }
    },
    async invert() {
      if (!id) return;
      const live = resolveId(id);
      const saved = graph.hasNode(live) ? graph.getNodeAttributes(live) : null;
      if (saved) {
        graph.dropNode(live);
        graphTouched();
      }
      try {
        await api.deleteNode(ctx.project, ctx.kb, live);
      } catch (err) {
        if (saved) addLocalNode(live, nodeSpecFromAttrs(saved), { x: saved.x, y: saved.y });
        throw err;
      }
    },
  };
  return { cmd, currentId: () => (id ? resolveId(id) : null) };
}

function nodeSpecFromAttrs(attrs: {
  label: string;
  nodeType: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
}): NodeSpec {
  return {
    type: attrs.nodeType,
    label: attrs.label,
    properties: { ...attrs.properties },
    grounded_in: [...attrs.grounded_in],
  };
}

function applyLocalNodePatch(id: string, patch: NodePatch): void {
  if (patch.label !== undefined) graph.setNodeAttribute(id, "label", patch.label);
  if (patch.type !== undefined) {
    graph.setNodeAttribute(id, "nodeType", patch.type);
    graph.setNodeAttribute(id, "color", typeColor(patch.type));
  }
  if (patch.properties !== undefined) graph.setNodeAttribute(id, "properties", { ...patch.properties });
  if (patch.grounded_in !== undefined) graph.setNodeAttribute(id, "grounded_in", [...patch.grounded_in]);
  graphTouched();
}

export function patchNodeCommand(ctx: KbCtx, nodeId: string, patch: NodePatch, label?: string): Command {
  let before: NodePatch = {};
  return {
    label: label ?? "edit node",
    async execute() {
      const id = resolveId(nodeId);
      const attrs = graph.getNodeAttributes(id);
      before = {};
      if (patch.label !== undefined) before.label = attrs.label;
      if (patch.type !== undefined) before.type = attrs.nodeType;
      if (patch.properties !== undefined) before.properties = { ...attrs.properties };
      if (patch.grounded_in !== undefined) before.grounded_in = [...attrs.grounded_in];

      applyLocalNodePatch(id, patch);
      try {
        await api.patchNode(ctx.project, ctx.kb, id, patch);
      } catch (err) {
        applyLocalNodePatch(id, before);
        throw err;
      }
    },
    async invert() {
      const id = resolveId(nodeId);
      applyLocalNodePatch(id, before);
      try {
        await api.patchNode(ctx.project, ctx.kb, id, before);
      } catch (err) {
        applyLocalNodePatch(id, patch);
        throw err;
      }
    },
  };
}

interface SavedNode {
  id: string;
  label: string;
  nodeType: string;
  properties: Record<string, unknown>;
  grounded_in: string[];
  x: number;
  y: number;
}

export function deleteNodeCommand(ctx: KbCtx, nodeId: string): Command {
  let savedNode: SavedNode | null = null;
  let savedEdges: SavedEdge[] = [];

  return {
    label: "delete node",
    async execute() {
      const id = resolveId(nodeId);
      const attrs = graph.getNodeAttributes(id);
      savedNode = {
        id,
        label: attrs.label,
        nodeType: attrs.nodeType,
        properties: { ...attrs.properties },
        grounded_in: [...attrs.grounded_in],
        x: attrs.x,
        y: attrs.y,
      };
      savedEdges = graph.edges(id).map(captureEdge);
      this.label = `delete node "${attrs.label}"`;

      graph.dropNode(id); // drops incident edges too
      graphTouched();
      try {
        await api.deleteNode(ctx.project, ctx.kb, id);
      } catch (err) {
        addLocalNode(id, nodeSpecFromAttrs(savedNode), { x: savedNode.x, y: savedNode.y });
        for (const e of savedEdges) restoreEdgeLocally(e, e.id);
        throw err;
      }
    },
    async invert() {
      if (!savedNode) return;
      const { ids } = await api.createNodes(ctx.project, ctx.kb, [nodeSpecFromAttrs(savedNode)]);
      const newId = ids[0];
      alias(savedNode.id, newId);
      addLocalNode(newId, nodeSpecFromAttrs(savedNode), { x: savedNode.x, y: savedNode.y });

      if (savedEdges.length) {
        const specs: EdgeSpec[] = savedEdges.map((e) => ({
          source: resolveId(e.source),
          target: resolveId(e.target),
          relation: e.relation,
          properties: e.properties,
          grounded_in: e.grounded_in,
        }));
        await api.createEdges(ctx.project, ctx.kb, specs);
        const newEdgeIds = await resolveNewEdgeIds(ctx, specs);
        savedEdges.forEach((saved, i) => {
          alias(saved.id, newEdgeIds[i]);
          restoreEdgeLocally(saved, newEdgeIds[i]);
        });
      }
    },
  };
}

export function createEdgeCommand(ctx: KbCtx, spec: EdgeSpec): { cmd: Command; currentId: () => string | null } {
  let id: string | null = null;

  const cmd: Command = {
    label: `connect "${spec.relation}"`,
    async execute() {
      const resolved: EdgeSpec = { ...spec, source: resolveId(spec.source), target: resolveId(spec.target) };
      const tmp = tempId("e");
      addLocalEdge(tmp, resolved);
      try {
        await api.createEdges(ctx.project, ctx.kb, [resolved]);
        graph.dropEdge(tmp);
        const [newId] = await resolveNewEdgeIds(ctx, [resolved]);
        addLocalEdge(newId, resolved);
        if (id) alias(id, newId);
        id = newId;
      } catch (err) {
        if (graph.hasEdge(tmp)) {
          graph.dropEdge(tmp);
          refreshNodeSizes([resolved.source, resolved.target]);
          graphTouched();
        }
        throw err;
      }
    },
    async invert() {
      if (!id) return;
      const live = resolveId(id);
      const saved = graph.hasEdge(live) ? captureEdge(live) : null;
      if (saved) {
        graph.dropEdge(live);
        refreshNodeSizes([saved.source, saved.target]);
        graphTouched();
      }
      try {
        await api.deleteEdge(ctx.project, ctx.kb, live);
      } catch (err) {
        if (saved) restoreEdgeLocally(saved, live);
        throw err;
      }
    },
  };
  return { cmd, currentId: () => (id ? resolveId(id) : null) };
}

export function deleteEdgeCommand(ctx: KbCtx, edgeId: string): Command {
  let saved: SavedEdge | null = null;

  return {
    label: "delete edge",
    async execute() {
      const id = resolveId(edgeId);
      saved = captureEdge(id);
      this.label = `delete edge "${saved.relation}"`;
      graph.dropEdge(id);
      refreshNodeSizes([saved.source, saved.target]);
      graphTouched();
      try {
        await api.deleteEdge(ctx.project, ctx.kb, id);
      } catch (err) {
        restoreEdgeLocally(saved, id);
        throw err;
      }
    },
    async invert() {
      if (!saved) return;
      const spec: EdgeSpec = {
        source: resolveId(saved.source),
        target: resolveId(saved.target),
        relation: saved.relation,
        properties: saved.properties,
        grounded_in: saved.grounded_in,
      };
      await api.createEdges(ctx.project, ctx.kb, [spec]);
      const [newId] = await resolveNewEdgeIds(ctx, [spec]);
      alias(saved.id, newId);
      restoreEdgeLocally(saved, newId);
    },
  };
}

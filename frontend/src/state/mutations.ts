/**
 * High-level edit actions called from components — each builds inverse
 * commands, runs them through the undo stack, and handles selection updates.
 */

import type { EdgeSpec, NodeSpec } from "../api/types";
import { graph } from "../graph/graphStore";
import {
  createEdgeCommand,
  createNodeCommand,
  deleteEdgeCommand,
  deleteNodeCommand,
  patchNodeCommand,
  type KbCtx,
} from "./commands";
import { useStore } from "./store";
import { composite, type Command } from "./undo";

function ctx(): KbCtx | null {
  const { project, kb } = useStore.getState();
  return project && kb ? { project, kb } : null;
}

export async function addNode(spec: NodeSpec): Promise<void> {
  const c = ctx();
  if (!c) return;
  const store = useStore.getState();
  const anchor = store.selectedNodes[0] ?? null;
  const { cmd, currentId } = createNodeCommand(c, spec, anchor);
  const ok = await store.runCmd(cmd);
  const id = currentId();
  if (ok && id) {
    useStore.setState({ selectedNodes: [id], selectedEdges: [] });
    store.requestFly(id);
  }
}

export async function renameNode(id: string, label: string): Promise<void> {
  const c = ctx();
  if (!c) return;
  await useStore.getState().runCmd(patchNodeCommand(c, id, { label }, `rename node to "${label}"`));
}

export async function setNodeType(id: string, type: string): Promise<void> {
  const c = ctx();
  if (!c) return;
  await useStore.getState().runCmd(patchNodeCommand(c, id, { type }, `set type to "${type}"`));
}

export async function setNodeProperties(
  id: string,
  properties: Record<string, unknown>,
  label = "edit properties",
): Promise<void> {
  const c = ctx();
  if (!c) return;
  await useStore.getState().runCmd(patchNodeCommand(c, id, { properties }, label));
}

export async function createEdge(spec: EdgeSpec): Promise<void> {
  const c = ctx();
  if (!c) return;
  const store = useStore.getState();
  const { cmd, currentId } = createEdgeCommand(c, spec);
  const ok = await store.runCmd(cmd);
  const id = currentId();
  if (ok && id && !store.travel) {
    useStore.setState({ selectedEdges: [id], selectedNodes: [] });
  }
}

/**
 * The contract has no PATCH for edges — editing relation/properties is
 * implemented as delete + re-create, composed into a single undo step.
 */
export async function replaceEdge(
  edgeId: string,
  changes: Partial<Pick<EdgeSpec, "relation" | "properties">>,
): Promise<void> {
  const c = ctx();
  if (!c || !graph.hasEdge(edgeId)) return;
  const attrs = graph.getEdgeAttributes(edgeId);
  const spec: EdgeSpec = {
    source: graph.source(edgeId),
    target: graph.target(edgeId),
    relation: changes.relation ?? attrs.relation,
    properties: changes.properties ?? { ...attrs.properties },
    grounded_in: [...attrs.grounded_in],
  };
  const del = deleteEdgeCommand(c, edgeId);
  const { cmd: add, currentId } = createEdgeCommand(c, spec);
  const store = useStore.getState();
  const ok = await store.runCmd(
    composite(`edit edge "${spec.relation}"`, [del, add]),
  );
  const id = currentId();
  if (ok && id && !store.travel) {
    useStore.setState({ selectedEdges: [id], selectedNodes: [] });
  }
}

export async function deleteElements(nodeIds: string[], edgeIds: string[]): Promise<void> {
  const c = ctx();
  if (!c || (nodeIds.length === 0 && edgeIds.length === 0)) return;
  const store = useStore.getState();

  // never delete the node the travel avatar is standing on
  if (store.travel && nodeIds.includes(store.travel.current)) {
    store.exitTravel();
  }

  // edges first: deleting a node cascades to its edges server-side, so a
  // selected edge incident to a selected node must go before the node does
  const cmds: Command[] = [
    ...edgeIds.filter((id) => graph.hasEdge(id)).map((id) => deleteEdgeCommand(c, id)),
    ...nodeIds.filter((id) => graph.hasNode(id)).map((id) => deleteNodeCommand(c, id)),
  ];
  if (!cmds.length) return;

  const label =
    cmds.length === 1
      ? cmds[0].label
      : `delete ${nodeIds.length ? `${nodeIds.length} node(s)` : ""}${
          nodeIds.length && edgeIds.length ? " + " : ""
        }${edgeIds.length ? `${edgeIds.length} edge(s)` : ""}`;
  await store.runCmd(cmds.length === 1 ? cmds[0] : composite(label, cmds), { undoToast: true });
}

export async function deleteSelection(): Promise<void> {
  const { selectedNodes, selectedEdges } = useStore.getState();
  await deleteElements(selectedNodes, selectedEdges);
}

export async function bulkSetProperty(nodeIds: string[], key: string, value: unknown): Promise<void> {
  const c = ctx();
  if (!c || !key) return;
  const cmds = nodeIds
    .filter((id) => graph.hasNode(id))
    .map((id) => {
      const merged = { ...graph.getNodeAttributes(id).properties, [key]: value };
      return patchNodeCommand(c, id, { properties: merged });
    });
  if (!cmds.length) return;
  await useStore
    .getState()
    .runCmd(composite(`set ${key} on ${cmds.length} node(s)`, cmds));
}

/**
 * Sigma.js v3 canvas: reducers for hover/selection/travel states, click
 * routing (select / multi-select / connect / hop), camera choreography, and
 * the DOM overlay layer (reticle, avatar, hotkey badges, relation popover).
 */

import { useEffect, useReducer, useRef, useState } from "react";
import Sigma from "sigma";
import { EdgeArrowProgram, EdgeRectangleProgram } from "sigma/rendering";
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { useStore } from "../state/store";
import { createEdge } from "../state/mutations";
import { orderedNeighbors, hopKeyLabel } from "../travel/neighbors";
import { localRelationNames } from "../state/derive";
import { drawNodeHover, drawNodeLabel } from "./canvasDraw";
import { ACCENT, DIM_EDGE, DIM_NODE, lighten, VISITED_MIX } from "./colors";
import { graph, onGraphTouched, type EdgeAttrs, type NodeAttrs } from "./graphStore";
import { sigmaRef, type AppSigma } from "./sigmaRef";

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<string | null>(null);
  const [sigma, setSigma] = useState<AppSigma | null>(null);

  const selectedNodes = useStore((s) => s.selectedNodes);
  const selectedEdges = useStore((s) => s.selectedEdges);
  const travel = useStore((s) => s.travel);
  const connectFrom = useStore((s) => s.connectFrom);
  const edgeDraft = useStore((s) => s.edgeDraft);
  const flyTo = useStore((s) => s.flyTo);
  const loadingGraph = useStore((s) => s.loadingGraph);
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);

  // --- create sigma once -----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      zIndex: true,
      defaultEdgeType: "arrow",
      edgeProgramClasses: { arrow: EdgeArrowProgram, line: EdgeRectangleProgram },
      labelFont: '"IBM Plex Sans", sans-serif',
      labelSize: 12,
      labelWeight: "500",
      labelColor: { color: "#94a5b8" },
      labelRenderedSizeThreshold: 5,
      edgeLabelFont: '"IBM Plex Mono", monospace',
      edgeLabelSize: 10,
      edgeLabelColor: { color: "#8fa3bb" },
      defaultDrawNodeLabel: drawNodeLabel,
      defaultDrawNodeHover: drawNodeHover,
      minCameraRatio: 0.03,
      maxCameraRatio: 5,
      stagePadding: 40,

      nodeReducer: (node, data): Partial<NodeDisplayData> => {
        const s = useStore.getState();
        const out: Partial<NodeDisplayData> = { ...data };
        const t = s.travel;

        if (t) {
          const focus = t.hop ? t.hop.to : t.current;
          const isCurrent = node === t.current || node === t.hop?.to;
          const isNeighbor = graph.areNeighbors(focus, node) || graph.areNeighbors(t.current, node);
          const isVisited = t.visited.has(node);
          if (isCurrent) {
            out.size = data.size * 1.35;
            out.zIndex = 3;
            out.forceLabel = true;
          } else if (isNeighbor) {
            out.zIndex = 2;
            out.forceLabel = true;
            if (isVisited) out.color = lighten(data.color, VISITED_MIX);
          } else if (isVisited) {
            out.color = lighten(data.color, VISITED_MIX * 0.6);
            out.label = "";
            out.zIndex = 1;
          } else {
            out.color = DIM_NODE;
            out.label = "";
            out.zIndex = 0;
          }
          return out;
        }

        if (s.selectedNodes.includes(node)) {
          out.highlighted = true;
          out.size = data.size * 1.2;
          out.zIndex = 3;
        }
        if (node === s.connectFrom) {
          out.highlighted = true;
          out.zIndex = 3;
        }
        const hover = hoverRef.current;
        if (hover && node !== hover && !graph.areNeighbors(hover, node) && !s.selectedNodes.includes(node)) {
          out.color = DIM_NODE;
          out.label = "";
          out.zIndex = 0;
        }
        return out;
      },

      edgeReducer: (edge, data): Partial<EdgeDisplayData> => {
        const s = useStore.getState();
        const out: Partial<EdgeDisplayData> = { ...data, label: "" };
        const t = s.travel;
        const [src, tgt] = graph.extremities(edge);

        if (t) {
          const touchesCurrent = src === t.current || tgt === t.current;
          const isHopEdge =
            t.hop && ((src === t.hop.from && tgt === t.hop.to) || (src === t.hop.to && tgt === t.hop.from));
          if (touchesCurrent || isHopEdge) {
            out.color = ACCENT;
            out.size = data.size * 1.5;
            out.zIndex = 2;
            out.label = graph.getEdgeAttributes(edge).label;
          } else if (t.visitedEdges.has(edge)) {
            out.color = lighten(DIM_EDGE, 0.28);
            out.zIndex = 1;
          } else {
            out.color = DIM_EDGE;
            out.zIndex = 0;
          }
          return out;
        }

        if (s.selectedEdges.includes(edge)) {
          out.color = ACCENT;
          out.size = data.size * 1.7;
          out.zIndex = 3;
          out.label = graph.getEdgeAttributes(edge).label;
        }
        const hover = hoverRef.current;
        if (hover) {
          if (src === hover || tgt === hover) {
            out.color = lighten(data.color, 0.25);
            out.zIndex = 2;
            out.label = graph.getEdgeAttributes(edge).label;
          } else if (!s.selectedEdges.includes(edge)) {
            out.color = DIM_EDGE;
          }
        }
        return out;
      },
    });

    // --- event routing ---------------------------------------------------------
    instance.on("clickNode", ({ node, event }) => {
      const s = useStore.getState();
      const shift = (event.original as MouseEvent).shiftKey;
      if (s.connectFrom && node !== s.connectFrom && !s.travel) {
        s.proposeEdge(node);
        return;
      }
      if (s.travel) {
        if (node !== s.travel.current && graph.areNeighbors(s.travel.current, node)) {
          s.beginHop(node);
        }
        return;
      }
      s.selectNode(node, shift);
    });

    instance.on("clickEdge", ({ edge, event }) => {
      const s = useStore.getState();
      if (s.travel || s.connectFrom) return;
      s.selectEdge(edge, (event.original as MouseEvent).shiftKey);
    });

    instance.on("clickStage", () => {
      const s = useStore.getState();
      if (s.edgeDraft) {
        s.clearEdgeDraft();
        return;
      }
      if (s.connectFrom) {
        s.cancelConnect();
        return;
      }
      if (!s.travel) s.clearSelection();
    });

    instance.on("enterNode", ({ node }) => {
      hoverRef.current = node;
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
      instance.refresh({ skipIndexation: true });
    });

    instance.on("leaveNode", () => {
      hoverRef.current = null;
      if (containerRef.current) containerRef.current.style.cursor = "";
      instance.refresh({ skipIndexation: true });
    });

    sigmaRef.current = instance;
    setSigma(instance);
    return () => {
      sigmaRef.current = null;
      instance.kill();
      setSigma(null);
    };
  }, []);

  // re-evaluate reducers when interaction state changes
  useEffect(() => {
    sigma?.refresh({ skipIndexation: true });
  }, [sigma, selectedNodes, selectedEdges, travel, connectFrom]);

  // domain data changed (mutations, rebuild) → full refresh
  useEffect(() => {
    if (!sigma) return;
    return onGraphTouched(() => sigma.refresh());
  }, [sigma]);

  // camera: fly-to requests (search, new node, travel enter/teleport)
  useEffect(() => {
    if (!sigma || !flyTo || !graph.hasNode(flyTo.nodeId)) return;
    const data = sigma.getNodeDisplayData(flyTo.nodeId);
    if (!data) return;
    const camera = sigma.getCamera();
    void camera.animate(
      { x: data.x, y: data.y, ratio: Math.min(camera.ratio, 0.5) },
      { duration: 500 },
    );
  }, [sigma, flyTo]);

  // camera: follow travel hops
  const hop = travel?.hop ?? null;
  useEffect(() => {
    if (!sigma || !hop) return;
    const data = sigma.getNodeDisplayData(hop.to);
    if (data) void sigma.getCamera().animate({ x: data.x, y: data.y }, { duration: 280 });
  }, [sigma, hop]);

  // camera: reset when switching KB
  useEffect(() => {
    sigma?.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
  }, [sigma, project, kb]);

  const classes = ["cv"];
  if (travel) classes.push("cv--travel");
  if (connectFrom && !edgeDraft) classes.push("cv--connecting");

  return (
    <div className={classes.join(" ")}>
      <div ref={containerRef} className="cv-stage" />
      <div className="cv-vignette" />
      <span className="cv-frame cv-frame--tl" />
      <span className="cv-frame cv-frame--tr" />
      <span className="cv-frame cv-frame--bl" />
      <span className="cv-frame cv-frame--br" />
      {connectFrom && !edgeDraft && (
        <div className="cv-hint">
          connect: click a target node — <span className="kbd">Esc</span> cancels
        </div>
      )}
      {travel && !travel.hop && (
        <div className="cv-hint">
          travel: <span className="kbd">1-9</span> hop · <span className="kbd">←→</span> aim ·{" "}
          <span className="kbd">Enter</span> go · <span className="kbd">Esc</span> exit
        </div>
      )}
      {sigma && <CanvasOverlays sigma={sigma} />}
      {loadingGraph && (
        <div className="cv-loading">
          <span className="spin" /> loading graph…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOM overlays positioned via sigma's coordinate conversion

function CanvasOverlays({ sigma }: { sigma: AppSigma }) {
  const [, bump] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    sigma.on("afterRender", bump);
    return () => {
      sigma.off("afterRender", bump);
    };
  }, [sigma]);

  return (
    <div className="cv-overlays">
      <SelectionReticle sigma={sigma} />
      <TravelLayer sigma={sigma} />
      <RelationPopover sigma={sigma} />
    </div>
  );
}

function nodeViewport(sigma: AppSigma, id: string): { x: number; y: number } | null {
  if (!graph.hasNode(id)) return null;
  const attrs = graph.getNodeAttributes(id);
  return sigma.graphToViewport({ x: attrs.x, y: attrs.y });
}

function SelectionReticle({ sigma }: { sigma: AppSigma }) {
  const selectedNodes = useStore((s) => s.selectedNodes);
  const travel = useStore((s) => s.travel);
  const primary = selectedNodes[selectedNodes.length - 1];
  if (travel || !primary) return null;
  const pos = nodeViewport(sigma, primary);
  if (!pos) return null;
  // sigma's default itemSizesReference is "screen": rendered radius ≈ size / sqrt(ratio)
  const display = sigma.getNodeDisplayData(primary);
  const ratio = Math.max(sigma.getCamera().ratio, 0.01);
  const side = Math.min(Math.max(((display?.size ?? 6) * 2) / Math.sqrt(ratio) + 16, 26), 90);
  return (
    <div className="reticle" style={{ left: pos.x, top: pos.y, width: side, height: side }}>
      <i />
    </div>
  );
}

function TravelLayer({ sigma }: { sigma: AppSigma }) {
  const travel = useStore((s) => s.travel);
  const beginHop = useStore((s) => s.beginHop);
  const [animPos, setAnimPos] = useState<{ x: number; y: number } | null>(null);
  const hop = travel?.hop ?? null;

  // hop animation: lerp the avatar along the edge in graph space (~270ms eased)
  useEffect(() => {
    if (!hop || !graph.hasNode(hop.from) || !graph.hasNode(hop.to)) {
      setAnimPos(null);
      return;
    }
    const from = graph.getNodeAttributes(hop.from);
    const to = graph.getNodeAttributes(hop.to);
    const started = performance.now();
    const duration = 270;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const k = ease(t);
      setAnimPos({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hop]);

  if (!travel) return null;

  const avatarGraphPos =
    animPos ??
    (graph.hasNode(travel.current)
      ? { x: graph.getNodeAttributes(travel.current).x, y: graph.getNodeAttributes(travel.current).y }
      : null);
  const avatarPos = avatarGraphPos ? sigma.graphToViewport(avatarGraphPos) : null;

  const neighbors = travel.hop ? [] : orderedNeighbors(travel.current);

  return (
    <>
      {avatarPos && <div className="avatar" style={{ left: avatarPos.x, top: avatarPos.y }} />}
      {neighbors.map((id, i) => {
        const pos = nodeViewport(sigma, id);
        if (!pos) return null;
        const label = hopKeyLabel(i);
        return (
          <button
            key={id}
            className={`hopkey${i === travel.neighborIndex ? " hopkey--aim" : ""}`}
            style={{ left: pos.x, top: pos.y - 16 }}
            title={graph.getNodeAttributes(id).label}
            onClick={() => beginHop(id)}
          >
            {label ?? "·"}
          </button>
        );
      })}
    </>
  );
}

function RelationPopover({ sigma }: { sigma: AppSigma }) {
  const edgeDraft = useStore((s) => s.edgeDraft);
  const clearEdgeDraft = useStore((s) => s.clearEdgeDraft);
  const [relation, setRelation] = useState("");

  useEffect(() => {
    setRelation("");
  }, [edgeDraft]);

  if (!edgeDraft) return null;
  const pos = nodeViewport(sigma, edgeDraft.target);
  if (!pos) return null;

  const sourceLabel = graph.hasNode(edgeDraft.source)
    ? graph.getNodeAttributes(edgeDraft.source).label
    : edgeDraft.source;
  const targetLabel = graph.hasNode(edgeDraft.target)
    ? graph.getNodeAttributes(edgeDraft.target).label
    : edgeDraft.target;

  const submit = () => {
    const rel = relation.trim();
    if (!rel) return;
    void createEdge({ source: edgeDraft.source, target: edgeDraft.target, relation: rel });
    clearEdgeDraft();
  };

  return (
    <div className="relpop" style={{ left: pos.x, top: pos.y }}>
      <div className="relpop-title">
        <b>{sourceLabel}</b> —relation→ <b>{targetLabel}</b>
      </div>
      <div className="relpop-form">
        <input
          className="inp"
          autoFocus
          placeholder="verb phrase, e.g. depends on"
          value={relation}
          list="relation-suggestions"
          onChange={(e) => setRelation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") clearEdgeDraft();
          }}
        />
        <button className="btn btn--accent" onClick={submit}>
          link
        </button>
      </div>
      <datalist id="relation-suggestions">
        {localRelationNames().map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}

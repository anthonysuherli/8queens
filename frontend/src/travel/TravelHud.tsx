/**
 * Journey log HUD: discovery counter, hop breadcrumbs (click = jump back).
 */

import { useStore } from "../state/store";
import { graph } from "../graph/graphStore";

export function TravelHud() {
  const travel = useStore((s) => s.travel);
  const teleport = useStore((s) => s.teleport);
  const graphVersion = useStore((s) => s.graphVersion);
  void graphVersion; // re-render when the graph changes under us

  if (!travel) return null;

  const total = graph.order;
  const explored = travel.visited.size;
  const pct = total ? Math.round((explored / total) * 100) : 0;

  return (
    <div className="hud">
      <div className="hud-head">
        <span className="hud-title">Journey</span>
        <span className="hud-counter">
          {explored}/{total} explored
        </span>
      </div>
      <div className="hud-progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="hud-trail">
        {travel.trail.map((stop, i) => {
          const here = i === travel.trail.length - 1 && stop.id === travel.current;
          return (
            <button
              key={`${stop.id}-${i}`}
              className={`hud-stop${stop.id === travel.current ? " hud-stop--here" : ""}`}
              onClick={() => stop.id !== travel.current && teleport(stop.id)}
              title={graph.hasNode(stop.id) ? "jump back here" : "node no longer exists"}
              disabled={!graph.hasNode(stop.id)}
            >
              <span className="hud-stop-n">{i + 1}</span>
              <span className="hud-stop-label">{stop.label}</span>
              {here && <span style={{ marginLeft: "auto" }}>◉</span>}
            </button>
          );
        })}
      </div>
      <div className="hud-foot">{travel.trail.length - 1} hops this journey</div>
    </div>
  );
}

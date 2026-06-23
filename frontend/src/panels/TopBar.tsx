/**
 * Top bar: wordmark, label search (flies the camera), mode/action buttons.
 */

import { useMemo, useState } from "react";
import { typeColor } from "../graph/colors";
import { graph, graphTouched } from "../graph/graphStore";
import { runLayout } from "../graph/layout";
import { useStore } from "../state/store";

interface Match {
  id: string;
  label: string;
  type: string;
}

export function TopBar() {
  const travel = useStore((s) => s.travel);
  const enterTravel = useStore((s) => s.enterTravel);
  const exitTravel = useStore((s) => s.exitTravel);
  const setAddNodeOpen = useStore((s) => s.setAddNodeOpen);
  const startConnect = useStore((s) => s.startConnect);
  const cancelConnect = useStore((s) => s.cancelConnect);
  const connectFrom = useStore((s) => s.connectFrom);
  const selectedNodes = useStore((s) => s.selectedNodes);
  const setLastAction = useStore((s) => s.setLastAction);
  const pushToast = useStore((s) => s.pushToast);

  const toggleConnect = () => {
    if (connectFrom) {
      cancelConnect();
      return;
    }
    const source = selectedNodes[0];
    if (!source) {
      pushToast("info", "select a node first, then connect");
      return;
    }
    startConnect(source);
  };

  return (
    <header className="tb">
      <div className="tb-brand">
        <span className="tb-wordmark">
          DELAPAN<span className="tb-eight">_8</span>
        </span>
        <span className="tb-sub">knowledge graph control</span>
      </div>

      <GraphSearch />

      <div className="tb-actions">
        <button className="btn" onClick={() => setAddNodeOpen(true)} title="Add a node">
          + node
        </button>
        <button
          className={`btn${connectFrom ? " btn--active" : ""}`}
          onClick={toggleConnect}
          title="Draw an edge from the selected node (E)"
        >
          ⌁ connect <span className="kbd">E</span>
        </button>
        <button
          className="btn"
          title="Re-run ForceAtlas2 layout"
          onClick={() => {
            runLayout(200);
            graphTouched();
            setLastAction("re-ran layout (200 iterations)");
          }}
        >
          ⟲ layout
        </button>
        <span className="tb-divider" />
        <button
          className={`btn btn--accent${travel ? " btn--active" : ""}`}
          onClick={() => (travel ? exitTravel() : enterTravel())}
          title="Toggle travel mode (T)"
        >
          ➤ travel <span className="kbd">T</span>
        </button>
      </div>
    </header>
  );
}

function GraphSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(0);
  const graphVersion = useStore((s) => s.graphVersion);

  const matches = useMemo<Match[]>(() => {
    void graphVersion;
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Match[] = [];
    graph.forEachNode((id, attrs) => {
      if (out.length >= 8) return;
      if (attrs.label.toLowerCase().includes(q)) {
        out.push({ id, label: attrs.label, type: attrs.nodeType });
      }
    });
    return out;
  }, [query, graphVersion]);

  const pick = (m: Match) => {
    const s = useStore.getState();
    if (s.travel) {
      s.teleport(m.id);
    } else {
      s.selectNode(m.id);
    }
    s.requestFly(m.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="tb-search">
      <span className="tb-search-icon">⌕</span>
      <input
        id="graph-search"
        className="inp"
        placeholder="search labels…  ( / )"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHot(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHot((h) => Math.min(h + 1, matches.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHot((h) => Math.max(h - 1, 0));
          }
          if (e.key === "Enter" && matches[hot]) pick(matches[hot]);
        }}
      />
      {open && matches.length > 0 && (
        <div className="tb-search-results">
          {matches.map((m, i) => (
            <button
              key={m.id}
              className={`tb-search-row${i === hot ? " tb-search-row--hot" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
            >
              <span className="type-dot" style={{ background: typeColor(m.type) }} />
              {m.label}
              <span className="tb-search-type">{m.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

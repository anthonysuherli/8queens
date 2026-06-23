/**
 * Left rail: scope switcher, live stats + type legend, schema (intent vs
 * emergent + drift), synopsis topics, coverage probe, explore launcher.
 */

import { useMemo, useState } from "react";
import * as api from "../api/client";
import { ApiError, type Coverage, type ExplorePhase } from "../api/types";
import { typeColor } from "../graph/colors";
import { graph } from "../graph/graphStore";
import { extractNodeTypes, localByRelation, localByType } from "../state/derive";
import { useStore } from "../state/store";

export function LeftRail() {
  return (
    <aside className="lr">
      <ScopeSection />
      <StatsSection />
      <SchemaSection />
      <SynopsisSection />
      <CoverageProbe />
      <ExploreSection />
    </aside>
  );
}

// ---------------------------------------------------------------------------

function ScopeSection() {
  const projects = useStore((s) => s.projects);
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);
  const setScope = useStore((s) => s.setScope);

  const current = projects.find((p) => p.project === project);
  const kbInfo = current?.kbs.find((k) => k.kb === kb);

  return (
    <section className="sect">
      <h2 className="sect-title">Scope</h2>
      <div className="lr-scope">
        <div className="lr-scope-row">
          <label>project</label>
          <select
            className="inp"
            value={project ?? ""}
            onChange={(e) => {
              const next = projects.find((p) => p.project === e.target.value);
              const firstKb = next?.kbs[0];
              if (next && firstKb) void setScope(next.project, firstKb.kb);
            }}
          >
            {projects.map((p) => (
              <option key={p.project_id} value={p.project}>
                {p.project}
              </option>
            ))}
          </select>
        </div>
        <div className="lr-scope-row">
          <label>kb</label>
          <select
            className="inp"
            value={kb ?? ""}
            onChange={(e) => {
              if (project) void setScope(project, e.target.value);
            }}
          >
            {(current?.kbs ?? []).map((k) => (
              <option key={k.kb_id} value={k.kb}>
                {k.kb}
              </option>
            ))}
          </select>
        </div>
        {kbInfo?.last_activity && (
          <div className="lr-kb-meta">last activity {new Date(kbInfo.last_activity).toLocaleString()}</div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function StatsSection() {
  const stats = useStore((s) => s.stats);
  const graphVersion = useStore((s) => s.graphVersion);

  const { byType, byRelation, order, size } = useMemo(() => {
    void graphVersion;
    return { byType: localByType(), byRelation: localByRelation(), order: graph.order, size: graph.size };
  }, [graphVersion]);

  const nodeTotal = stats?.node_count ?? order;
  const edgeTotal = stats?.edge_count ?? size;
  const capped = order < nodeTotal || size < edgeTotal;

  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const maxType = typeEntries[0]?.[1] ?? 1;
  const relEntries = Object.entries(byRelation)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <section className="sect">
      <h2 className="sect-title">
        Graph <span className="sect-aux">{capped ? `showing ${order}/${nodeTotal}` : "live"}</span>
      </h2>
      <div className="lr-stats-counts">
        <div className="lr-counter">
          <b>{nodeTotal}</b>
          <span>nodes</span>
        </div>
        <div className="lr-counter">
          <b>{edgeTotal}</b>
          <span>edges</span>
        </div>
      </div>
      <div className="lr-legend">
        {typeEntries.map(([type, count]) => (
          <div key={type}>
            <div className="lr-legend-row">
              <span className="type-dot" style={{ background: typeColor(type) }} />
              {type}
              <span className="lr-legend-count">{count}</span>
            </div>
            <div
              className="lr-legend-bar"
              style={{ width: `${(count / maxType) * 100}%`, background: typeColor(type) }}
            />
          </div>
        ))}
        {typeEntries.length === 0 && <div className="placeholder">empty graph</div>}
      </div>
      {relEntries.length > 0 && (
        <div className="lr-relations">
          {relEntries.map(([rel, count]) => (
            <span key={rel} className="lr-relation">
              {rel} <i>×{count}</i>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function SchemaSection() {
  const schema = useStore((s) => s.schema);
  const graphVersion = useStore((s) => s.graphVersion);

  const intentTypes = useMemo(() => extractNodeTypes(schema?.intent), [schema]);
  const emergentTypes = useMemo(() => extractNodeTypes(schema?.emergent), [schema]);
  const graphTypes = useMemo(() => {
    void graphVersion;
    return Object.keys(localByType());
  }, [graphVersion]);

  if (!schema) {
    return (
      <section className="sect">
        <h2 className="sect-title">Schema</h2>
        <div className="placeholder">no schema available</div>
      </section>
    );
  }

  const hasIntent = schema.intent !== null && intentTypes.length > 0;
  const observed = [...new Set([...emergentTypes, ...graphTypes])];
  const drifted = hasIntent ? observed.filter((t) => !intentTypes.includes(t)) : [];

  const chip = (type: string, drift: boolean) => (
    <span
      key={type}
      className={`type-chip${drift ? " lr-drift" : ""}`}
      style={drift ? undefined : { borderColor: typeColor(type), color: typeColor(type) }}
    >
      <span className="type-dot" style={{ background: drift ? "var(--red)" : typeColor(type) }} />
      {type}
    </span>
  );

  return (
    <section className="sect">
      <h2 className="sect-title">
        Schema <span className="sect-aux">{hasIntent ? "intent vs emergent" : "emergent only"}</span>
      </h2>
      <div className="lr-schema-grid">
        {hasIntent && (
          <div className="lr-schema-block">
            <h4>intent</h4>
            <div className="lr-schema-types">{intentTypes.map((t) => chip(t, false))}</div>
          </div>
        )}
        <div className="lr-schema-block">
          <h4>emergent</h4>
          <div className="lr-schema-types">{observed.map((t) => chip(t, drifted.includes(t)))}</div>
        </div>
      </div>
      {drifted.length > 0 && (
        <div className="lr-drift-note">
          ⚠ drift: {drifted.join(", ")} in graph but not in intent schema
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function SynopsisSection() {
  const synopsis = useStore((s) => s.synopsis);

  return (
    <section className="sect">
      <h2 className="sect-title">
        Synopsis
        {synopsis && <span className="sect-aux">{synopsis.finding_count_at_build} findings</span>}
      </h2>
      {!synopsis && <div className="placeholder">not built yet</div>}
      {synopsis?.content.map((t) => (
        <div key={t.topic} className="lr-topic">
          <b>{t.topic}</b>
          <span>{t.gloss}</span>
        </div>
      ))}
      {synopsis && (
        <div className="lr-synopsis-meta">built {new Date(synopsis.built_at).toLocaleString()}</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

type ProbeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; coverage: Coverage; preamble: string }
  | { kind: "error"; message: string };

function CoverageProbe() {
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ProbeState>({ kind: "idle" });

  const probe = async () => {
    if (!project || !kb || !query.trim()) return;
    setState({ kind: "loading" });
    try {
      const res = await api.getResume(project, kb, query.trim());
      setState({ kind: "done", coverage: res.coverage, preamble: res.preamble });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? "embeddings unavailable (503) — engine can't band coverage right now"
          : err instanceof Error
            ? err.message
            : String(err);
      setState({ kind: "error", message });
    }
  };

  return (
    <section className="sect">
      <h2 className="sect-title">Coverage probe</h2>
      <div className="lr-probe-form">
        <input
          className="inp"
          placeholder="can the KB answer…?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void probe()}
        />
        <button className="btn" onClick={() => void probe()} disabled={state.kind === "loading"}>
          {state.kind === "loading" ? <span className="spin" /> : "probe"}
        </button>
      </div>
      {state.kind === "done" && (
        <div className="lr-verdict">
          <div className={`lr-verdict-band ${state.coverage}`}>
            {state.coverage}
            <small>
              {state.coverage === "rich" && "KB can answer"}
              {state.coverage === "sparse" && "partial grounding"}
              {state.coverage === "gap" && "needs exploration"}
            </small>
          </div>
          <pre className="lr-preamble">{state.preamble}</pre>
        </div>
      )}
      {state.kind === "error" && <div className="lr-probe-err">{state.message}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------

const PHASES: ExplorePhase[] = ["planning", "searching", "crawling", "extracting", "merging", "completed"];

interface ExploreRun {
  phase: ExplorePhase | null;
  message: string;
  error: string | null;
  running: boolean;
}

function ExploreSection() {
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);
  const pushToast = useStore((s) => s.pushToast);
  const refreshStats = useStore((s) => s.refreshStats);
  const [prompt, setPrompt] = useState("");
  const [run, setRun] = useState<ExploreRun>({ phase: null, message: "", error: null, running: false });

  const start = async () => {
    if (!project || !kb || !prompt.trim() || run.running) return;
    setRun({ phase: null, message: "", error: null, running: true });
    try {
      for await (const event of api.explore(project, kb, { prompt: prompt.trim() })) {
        if (event.phase === "error") {
          setRun({ phase: "error", message: "", error: event.message ?? "exploration failed", running: false });
          return;
        }
        setRun({ phase: event.phase, message: event.message ?? "", error: null, running: event.phase !== "completed" });
        if (event.phase === "completed") {
          pushToast("success", `explore merged ${event.count ?? event.finding_ids?.length ?? 0} new finding(s)`);
          refreshStats();
          api.getSynopsis(project, kb).then((synopsis) => useStore.setState({ synopsis })).catch(() => undefined);
        }
      }
    } catch (err) {
      setRun({ phase: "error", message: "", error: err instanceof Error ? err.message : String(err), running: false });
    }
  };

  const reached = run.phase ? PHASES.indexOf(run.phase) : -1;

  return (
    <section className="sect" style={{ borderBottom: "none" }}>
      <h2 className="sect-title">Explore</h2>
      <div className="lr-probe-form">
        <input
          className="inp"
          placeholder="gap-fill from the web…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void start()}
        />
        <button className="btn btn--accent" onClick={() => void start()} disabled={run.running}>
          {run.running ? <span className="spin" /> : "run"}
        </button>
      </div>
      {(run.phase || run.error) && (
        <div className="lr-explore-log">
          {PHASES.map((phase, i) => {
            if (reached < i && phase !== "completed") {
              return (
                <div key={phase} className="lr-phase">
                  <span className="lr-phase-tick">·</span>
                  {phase}
                </div>
              );
            }
            const active = reached === i && run.running;
            const done = reached > i || (reached === i && !run.running);
            if (phase === "completed" && reached < i) return null;
            return (
              <div
                key={phase}
                className={`lr-phase${active ? " lr-phase--active" : done ? " lr-phase--done" : ""}`}
              >
                <span className="lr-phase-tick">{active ? "▸" : done ? "✓" : "·"}</span>
                {phase}
                {active && run.message ? ` — ${run.message}` : ""}
              </div>
            );
          })}
          {run.error && (
            <div className="lr-phase lr-phase--error">
              <span className="lr-phase-tick">✕</span>
              {run.error}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

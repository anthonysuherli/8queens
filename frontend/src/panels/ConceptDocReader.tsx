/**
 * OKF concept-doc reader: a derived, read-only drawer that renders a graph
 * entity as an OKF document. Deterministic body by default; an optional one-pass
 * LLM synthesis (cached into the node's okf_* properties) renders as prose.
 * Related-concept links re-point the same drawer (with a back-stack).
 */

import { useEffect, useState } from "react";
import * as api from "../api/client";
import { typeColor } from "../graph/colors";
import { graph } from "../graph/graphStore";
import { buildConceptDoc, type ConceptDoc } from "../okf/conceptDoc";
import { renderMarkdown, safeHref } from "../okf/markdown";
import { setNodeProperties } from "../state/mutations";
import { useStore } from "../state/store";

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ConceptDocReader() {
  const nodeId = useStore((s) => s.openConceptNodeId);
  const findingCache = useStore((s) => s.findingCache);
  const graphVersion = useStore((s) => s.graphVersion);
  const openConcept = useStore((s) => s.openConcept);
  const navigateConcept = useStore((s) => s.navigateConcept);
  const conceptBack = useStore((s) => s.conceptBack);
  const backStack = useStore((s) => s.conceptBackStack);
  const fetchFinding = useStore((s) => s.fetchFinding);
  const openFinding = useStore((s) => s.openFinding);
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);
  const mode = useStore((s) => s.mode);
  const pushToast = useStore((s) => s.pushToast);
  void graphVersion; // re-derive on graph mutations (e.g. after synthesize persists)

  const [synthesizing, setSynthesizing] = useState(false);
  const [view, setView] = useState<"notes" | "prose">("notes");

  useEffect(() => {
    if (nodeId && graph.hasNode(nodeId)) {
      graph.getNodeAttributes(nodeId).grounded_in.forEach(fetchFinding);
    }
  }, [nodeId, fetchFinding]);

  const doc = nodeId ? buildConceptDoc(nodeId, findingCache) : null;
  const hasFreshProse = !!doc?.prose && !doc.stale;

  useEffect(() => {
    setView(hasFreshProse ? "prose" : "notes");
  }, [nodeId, hasFreshProse]);

  if (!nodeId || !doc) return null;
  const fm = doc.frontmatter;
  const canSynthesize = mode === "live" && doc.findings.length > 0 && !synthesizing;

  const synthesize = async () => {
    if (!project || !kb || !graph.hasNode(nodeId)) return;
    setSynthesizing(true);
    try {
      const res = await api.synthesizeConceptDoc(project, kb, nodeId);
      const props = {
        ...graph.getNodeAttributes(nodeId).properties,
        okf_doc: res.body_markdown,
        okf_doc_description: res.description,
        okf_doc_model: res.model,
        okf_doc_built_at: res.built_at,
        okf_doc_grounded_hash: res.grounded_hash,
      };
      await setNodeProperties(nodeId, props, "synthesize concept doc");
      setView("prose");
    } catch (err) {
      pushToast("error", `synthesize failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSynthesizing(false);
    }
  };

  const synthDisabledTitle =
    mode === "mock"
      ? "needs the live engine + an LLM key"
      : doc.findings.length === 0
        ? "no grounded findings to synthesize from"
        : "";

  return (
    <>
      <div className="drawer-veil" onClick={() => openConcept(null)} />
      <div className="drawer okf-reader">
        <div className="drawer-head">
          <div className="okf-head-left">
            {backStack.length > 0 && (
              <button className="drawer-close" onClick={() => conceptBack()} title="back">
                ←
              </button>
            )}
            <span className="type-chip" style={{ borderColor: typeColor(fm.type), color: typeColor(fm.type) }}>
              {fm.type}
            </span>
            <h3 className="okf-title">{fm.title}</h3>
          </div>
          <button className="drawer-close" onClick={() => openConcept(null)} title="close (Esc)">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {fm.description && <p className="okf-lede">{fm.description}</p>}

          <div className="drawer-meta">
            <span className="mono">{fm.timestamp ? new Date(fm.timestamp).toLocaleDateString() : "—"}</span>
            {fm.resource && safeHref(fm.resource) && (
              <a className="mono" href={safeHref(fm.resource)!} target="_blank" rel="noreferrer">
                {host(fm.resource)} ↗
              </a>
            )}
            {fm.tags.map((t) => (
              <span key={t} className="drawer-tag">
                {t}
              </span>
            ))}
          </div>

          <div className="okf-toolbar">
            {doc.prose && (
              <div className="okf-switch">
                <button className={view === "notes" ? "btn btn--on" : "btn"} onClick={() => setView("notes")}>
                  notes
                </button>
                <button className={view === "prose" ? "btn btn--on" : "btn"} onClick={() => setView("prose")}>
                  article
                </button>
              </div>
            )}
            <button className="btn" disabled={!canSynthesize} onClick={() => void synthesize()} title={synthDisabledTitle}>
              {synthesizing ? (
                <>
                  <span className="spin" /> synthesizing…
                </>
              ) : doc.prose ? (
                "↻ re-synthesize"
              ) : (
                "✨ synthesize"
              )}
            </button>
          </div>

          {doc.stale && doc.prose && (
            <div className="okf-stale">cached article may be stale — evidence changed since it was written</div>
          )}

          {view === "prose" && doc.prose ? (
            <div className="okf-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.prose.bodyMarkdown) }} />
          ) : (
            <DeterministicBody doc={doc} onOpenFinding={openFinding} />
          )}

          {doc.related.length > 0 && (
            <div className="sect">
              <h2 className="sect-title">
                Related concepts <span className="sect-aux">{doc.related.length}</span>
              </h2>
              {doc.related.map((r, i) => (
                <button key={`${r.neighborId}-${i}`} className="ins-endpoint" onClick={() => navigateConcept(r.neighborId)}>
                  <span className="okf-rel mono">{r.direction === "out" ? r.relation : `← ${r.relation}`}</span>
                  <span className="type-dot" style={{ background: typeColor(r.neighborType) }} />
                  {r.neighborLabel}
                  <span className="arrow" style={{ marginLeft: "auto" }}>
                    →
                  </span>
                </button>
              ))}
            </div>
          )}

          {doc.sources.length > 0 && (
            <div className="sect">
              <h2 className="sect-title">
                Sources <span className="sect-aux">{doc.sources.length}</span>
              </h2>
              {doc.sources.map((s, i) => (
                <a key={`${s.url}-${i}`} className="prov-item" href={safeHref(s.url) ?? "#"} target="_blank" rel="noreferrer">
                  <div className="prov-domain">{s.domain} ↗</div>
                  <div className="prov-query">query: {s.query}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DeterministicBody({
  doc,
  onOpenFinding,
}: {
  doc: ConceptDoc;
  onOpenFinding: (id: string) => void;
}) {
  const props = Object.entries(doc.properties);
  return (
    <>
      {props.length > 0 && (
        <div className="sect">
          <h2 className="sect-title">Properties</h2>
          <table className="okf-props">
            <tbody>
              {props.map(([k, v]) => (
                <tr key={k}>
                  <td className="okf-prop-k">{k}</td>
                  <td>{typeof v === "string" ? v : JSON.stringify(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="sect">
        <h2 className="sect-title">
          What we know <span className="sect-aux">{doc.findings.length}</span>
        </h2>
        {doc.findings.length === 0 && <div className="placeholder">no grounded findings loaded yet</div>}
        {doc.findings.map((f) => (
          <button key={f.id} className="okf-finding" onClick={() => onOpenFinding(f.id)}>
            <div className="okf-finding-title">{f.title}</div>
            <div className="okf-finding-body">{f.content}</div>
            <div className="ev-meta">
              <span>{f.confidence.toFixed(2)}</span>
              <span>{f.domains.join(" · ") || "no sources"}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

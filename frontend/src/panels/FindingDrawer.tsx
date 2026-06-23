/**
 * Finding detail drawer: full content + provenance links back to the web.
 * Deleting a finding is confirm-guarded (the contract has no way to recreate
 * one, so it can't ride the undo stack).
 */

import * as api from "../api/client";
import { useStore } from "../state/store";

export function FindingDrawer() {
  const openFindingId = useStore((s) => s.openFindingId);
  const findingCache = useStore((s) => s.findingCache);
  const openFinding = useStore((s) => s.openFinding);
  const pushToast = useStore((s) => s.pushToast);
  const project = useStore((s) => s.project);
  const kb = useStore((s) => s.kb);

  if (!openFindingId) return null;
  const entry = findingCache[openFindingId];

  const remove = async () => {
    if (!project || !kb) return;
    if (!window.confirm("Delete this finding? This cannot be undone (findings have no re-create API).")) {
      return;
    }
    try {
      await api.deleteFinding(project, kb, openFindingId);
      const cache = { ...useStore.getState().findingCache };
      delete cache[openFindingId];
      useStore.setState({ findingCache: cache, lastAction: `deleted finding ${openFindingId}` });
      openFinding(null);
      pushToast("info", "finding deleted — graph elements that cited it now show it as unavailable");
    } catch (err) {
      pushToast("error", `delete failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <>
      <div className="drawer-veil" onClick={() => openFinding(null)} />
      <div className="drawer">
        <div className="drawer-head">
          {entry?.status === "ready" ? <h3>{entry.data.title}</h3> : <h3>Finding {openFindingId}</h3>}
          <button className="drawer-close" onClick={() => openFinding(null)} title="close (Esc)">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          {(!entry || entry.status === "loading") && (
            <div className="drawer-meta">
              <span className="spin" /> loading…
            </div>
          )}
          {entry?.status === "error" && <div className="lr-probe-err">{entry.message}</div>}
          {entry?.status === "ready" && (
            <>
              <div className="drawer-meta">
                <span className="type-chip" style={{ borderColor: "var(--cyan)", color: "var(--cyan)" }}>
                  {entry.data.category}
                </span>
                <span className="mono">conf {entry.data.confidence.toFixed(2)}</span>
                <span>{new Date(entry.data.created_at).toLocaleDateString()}</span>
                {entry.data.tags.map((t) => (
                  <span key={t} className="drawer-tag">
                    {t}
                  </span>
                ))}
              </div>
              <div className="drawer-content">{entry.data.content}</div>
              <div className="drawer-prov">
                <h4>Provenance · {entry.data.provenance.length}</h4>
                {entry.data.provenance.map((p, i) => (
                  <a key={i} className="prov-item" href={p.url} target="_blank" rel="noreferrer">
                    <div className="prov-domain">{p.domain} ↗</div>
                    <div className="prov-query">query: {p.query}</div>
                  </a>
                ))}
                {entry.data.provenance.length === 0 && (
                  <div className="placeholder">no provenance recorded</div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="drawer-actions">
          <button className="btn btn--danger" onClick={() => void remove()}>
            ✕ delete finding
          </button>
        </div>
      </div>
    </>
  );
}

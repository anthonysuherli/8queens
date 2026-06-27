/**
 * Right pane: deep detail for the selected map node — a gap's full lifecycle
 * (Critic reason / attempts / dead), a finding's body, or a source's query.
 */

import { safeHref } from "../okf/markdown";
import { describeLifecycle } from "./describe";
import type { SelectedNode } from "./DerivationMap";
import type { TraceModel } from "./traceModel";

interface Props {
  model: TraceModel;
  selected: SelectedNode | null;
}

export function TraceInspector({ model, selected }: Props) {
  if (!selected) {
    return <div className="trace-insp"><p className="trace-insp-empty">select a node to inspect its derivation</p></div>;
  }

  if (selected.kind === "gap") {
    const g = model.gaps[selected.id];
    if (!g) return <div className="trace-insp" />;
    return (
      <div className="trace-insp">
        <div className="trace-insp-kind">gap</div>
        <div className="trace-insp-title">{g.question}</div>
        <div className="trace-insp-row">status <b>{g.status}</b> · attempts {g.attempts} · {g.coverage ?? "—"}</div>
        <ol className="trace-life">
          {describeLifecycle(g).map((line, i) => (
            <li key={i} className="trace-life-step">{line}</li>
          ))}
        </ol>
        {g.attempts > 1 && (
          <p className="trace-insp-note">reason shown is the final reopen reason (earlier reasons aren't recorded).</p>
        )}
      </div>
    );
  }

  if (selected.kind === "finding") {
    const f = model.findings[selected.id];
    if (!f) return <div className="trace-insp" />;
    return (
      <div className="trace-insp">
        <div className="trace-insp-kind">finding · {f.contributor ?? "?"}</div>
        <div className="trace-insp-title">{f.title}</div>
        <div className="trace-insp-row">{f.category}{f.confidence != null ? ` · conf ${f.confidence.toFixed(2)}` : ""}</div>
        <p className="trace-insp-body">{f.content}</p>
      </div>
    );
  }

  const [fid, idx] = selected.id.split("#");
  const src = model.findings[fid]?.sources[Number(idx)];
  if (!src) return <div className="trace-insp" />;
  const href = safeHref(src.url);
  return (
    <div className="trace-insp">
      <div className="trace-insp-kind">source</div>
      <div className="trace-insp-title">{src.domain}</div>
      <div className="trace-insp-row">query: <span className="trace-q">{src.query}</span></div>
      {href ? (
        <a className="trace-insp-link" href={href} target="_blank" rel="noreferrer">{src.url}</a>
      ) : (
        <span className="trace-insp-link">{src.url}</span>
      )}
    </div>
  );
}

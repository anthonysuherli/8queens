/**
 * Report overlay: shows the Synthesizer's cited markdown report once a society
 * run produces one. Mirrors ConceptDocReader's drawer-veil + renderMarkdown
 * (untrusted prose is HTML-escaped first by renderMarkdown).
 */

import { useState } from "react";
import { renderMarkdown } from "../okf/markdown";
import { useStore } from "../state/store";

export function ReportOverlay() {
  const society = useStore((s) => s.society);
  const [dismissed, setDismissed] = useState(false);
  const report = society?.report ?? null;

  if (!report || dismissed) return null;

  return (
    <>
      <div className="drawer-veil" onClick={() => setDismissed(true)} />
      <div className="drawer okf-reader">
        <div className="drawer-head">
          <h3 className="okf-title">Society report</h3>
          <button className="drawer-close" onClick={() => setDismissed(true)} title="close">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <div className="okf-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} />
          {society && society.unanswered.length > 0 && (
            <div className="sect">
              <h2 className="sect-title">
                Unanswered <span className="sect-aux">{society.unanswered.length}</span>
              </h2>
              <ul>
                {society.unanswered.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

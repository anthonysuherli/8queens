/**
 * Left pane: the cited report. Heading claims render as markdown; prose claims
 * carrying a (finding_id: …) citation are clickable and drive the map.
 */

import { renderMarkdown } from "../okf/markdown";
import { stripCitations } from "./buildTrace";
import type { Claim, TraceModel } from "./traceModel";

interface Props {
  model: TraceModel;
  activeClaimId: string | null;
  onSelectClaim: (id: string) => void;
}

function ClaimLine({ claim, active, onSelect }: { claim: Claim; active: boolean; onSelect: () => void }) {
  if (claim.kind === "heading") {
    return <div className="trace-claim-h" dangerouslySetInnerHTML={{ __html: renderMarkdown(claim.text) }} />;
  }
  const cited = claim.findingIds.length > 0 || claim.unresolvedIds.length > 0;
  if (!cited) {
    return <p className="trace-claim-plain">{stripCitations(claim.text)}</p>;
  }
  return (
    <button
      type="button"
      className={`trace-claim${active ? " trace-claim--active" : ""}`}
      onClick={onSelect}
    >
      <span className="trace-claim-text">{stripCitations(claim.text)}</span>
      <span className="trace-claim-cites">
        {claim.findingIds.map((id) => (
          <span key={id} className="trace-cite">{id}</span>
        ))}
        {claim.unresolvedIds.map((id) => (
          <span key={id} className="trace-cite trace-cite--missing" title="cited id not found in this run">
            {id}?
          </span>
        ))}
      </span>
    </button>
  );
}

export function ReportPane({ model, activeClaimId, onSelectClaim }: Props) {
  return (
    <div className="trace-report">
      {model.claims.map((c) => (
        <ClaimLine
          key={c.id}
          claim={c}
          active={c.id === activeClaimId}
          onSelect={() => onSelectClaim(c.id)}
        />
      ))}
    </div>
  );
}

/**
 * Pure: SocietyRunBundle → TraceModel. Three bundle layers reconciled —
 * frames give temporal lifecycle, gaps[] give terminal truth (dead/attempts/
 * reason), findings{} give source provenance. No I/O, no React.
 */

import type { BundleFrame, BundleGap, Coverage, SocietyRunBundle } from "../api/types";
import type { Claim, GapEvent, TraceFinding, TraceFrame, TraceGap, TraceModel } from "./traceModel";

const CITE = /\(finding_id:\s*([^)]+)\)/g;

export function stripCitations(text: string): string {
  return text.replace(/\s*\(finding_id:\s*[^)]+\)/g, "").trim();
}

function isHeading(block: string): boolean {
  return /^#{1,6}\s/.test(block.trim());
}

export function splitClaims(markdown: string, findings: Record<string, unknown>): Claim[] {
  const claims: Claim[] = [];
  let n = 0;
  for (const rawBlock of markdown.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (isHeading(block)) {
      claims.push({ id: `claim-${n++}`, text: block, kind: "heading", findingIds: [], unresolvedIds: [] });
      continue;
    }
    CITE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    // Collect all citation matches first so we can attach trailing text to the last one.
    const citeMatches: RegExpExecArray[] = [];
    while ((m = CITE.exec(block)) !== null) citeMatches.push(m);
    if (citeMatches.length === 0) {
      claims.push({ id: `claim-${n++}`, text: block, kind: "prose", findingIds: [], unresolvedIds: [] });
    } else {
      for (let i = 0; i < citeMatches.length; i++) {
        const cm = citeMatches[i];
        const end = cm.index + cm[0].length;
        const text = block.slice(last, end).trim();
        const ids = cm[1].split(",").map((s) => s.trim()).filter(Boolean);
        const findingIds = ids.filter((id) => id in findings);
        const unresolvedIds = ids.filter((id) => !(id in findings));
        if (text) claims.push({ id: `claim-${n++}`, text, kind: "prose", findingIds, unresolvedIds });
        last = end;
      }
      // Emit any trailing text after the last citation. If it's only inert
      // punctuation/whitespace, absorb it silently; otherwise it's its own
      // uncited prose claim (false provenance if we attributed it to the last citation).
      const tail = block.slice(last).trim();
      if (tail && !/^[\s.,;:!?]*$/.test(tail)) {
        claims.push({ id: `claim-${n++}`, text: tail, kind: "prose", findingIds: [], unresolvedIds: [] });
      }
    }
  }
  return claims;
}

function findingGapMap(frames: BundleFrame[], gaps: BundleGap[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of frames) {
    if (f.event === "finding_merged" && typeof f.finding_id === "string" && typeof f.gap_id === "string") {
      map[f.finding_id] = f.gap_id;
    }
  }
  for (const g of gaps) for (const fid of g.finding_ids) if (!(fid in map)) map[fid] = g.gap_id;
  return map;
}

function contributorMap(frames: BundleFrame[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of frames) {
    if (f.event === "finding_merged" && typeof f.finding_id === "string" && typeof f.contributor === "string") {
      map[f.finding_id] = f.contributor;
    }
  }
  return map;
}

function buildLifecycle(gapId: string, frames: BundleFrame[], gap: BundleGap): GapEvent[] {
  const events: GapEvent[] = [];
  let round = 0;
  let filledOnce = false;
  let sawDone = false;
  for (const f of frames) {
    if (f.event === "phase" && typeof f.round === "number") round = f.round;
    if (f.gap_id !== gapId) continue;
    if (f.event === "gap_opened") {
      events.push({
        kind: filledOnce ? "reopened" : "opened",
        t: f.t as number,
        round,
        reason: filledOnce ? gap.reason ?? undefined : undefined,
      });
    } else if (f.event === "gap_claimed") {
      events.push({ kind: "claimed", t: f.t as number, by: f.claimed_by as string, round });
    } else if (f.event === "gap_filled") {
      if (f.status === "done") {
        sawDone = true;
        events.push({ kind: "done", t: f.t as number, coverage: f.coverage as Coverage, round });
      } else {
        filledOnce = true;
        events.push({ kind: "filled", t: f.t as number, coverage: f.coverage as Coverage, round });
      }
    }
  }
  if (gap.status === "done" && !sawDone) {
    events.push({ kind: "done", coverage: gap.coverage ?? undefined });
  }
  if (gap.status === "dead") {
    events.push({ kind: "dead", coverage: gap.coverage ?? undefined, reason: gap.reason ?? undefined });
  }
  return events;
}

export function buildTrace(bundle: SocietyRunBundle): TraceModel {
  const claims = splitClaims(bundle.report.markdown, bundle.findings);
  const fgMap = findingGapMap(bundle.frames, bundle.gaps);
  const contribs = contributorMap(bundle.frames);

  const findings: Record<string, TraceFinding> = {};
  for (const [id, f] of Object.entries(bundle.findings)) {
    findings[id] = {
      id,
      title: f.title,
      content: f.content,
      category: f.category,
      confidence: f.confidence,
      gapId: fgMap[id] ?? null,
      contributor: contribs[id] ?? null,
      sources: f.provenance.map((p) => ({ url: p.url, domain: p.domain, query: p.query })),
    };
  }

  const gaps: Record<string, TraceGap> = {};
  for (const g of bundle.gaps) {
    gaps[g.gap_id] = {
      id: g.gap_id,
      question: g.question,
      status: g.status,
      owner: g.owner,
      coverage: g.coverage,
      attempts: g.attempts,
      reason: g.reason,
      parentId: g.parent_id,
      findingIds: g.finding_ids,
      lifecycle: buildLifecycle(g.gap_id, bundle.frames, g),
    };
  }

  const frames: TraceFrame[] = bundle.frames.map((f) => ({ ...f }));
  return { meta: bundle.meta, claims, findings, gaps, frames, unanswered: bundle.report.unanswered };
}

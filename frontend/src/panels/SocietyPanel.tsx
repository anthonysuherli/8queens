/**
 * Society control surface: launch a run, watch the persistent coverage meter
 * and the gap markers (open → claimed → filled) advance live. Gap rows are
 * tinted by the claiming researcher's contributor color.
 */

import { useState } from "react";
import { contributorColor } from "../graph/contributors";
import { useStore } from "../state/store";

const COVERAGE_PCT: Record<string, number> = { gap: 12, sparse: 55, rich: 100 };

export function SocietyPanel() {
  const society = useStore((s) => s.society);
  const runSociety = useStore((s) => s.runSociety);
  const [topic, setTopic] = useState("");

  const overall = society?.overall ?? null;
  const pct = overall ? COVERAGE_PCT[overall] : 0;
  const gaps = society ? Object.entries(society.gaps) : [];
  const budgetPct = society?.budget?.max
    ? Math.min(100, (society.budget.used / society.budget.max) * 100)
    : 0;

  return (
    <div className="society-panel">
      <div className="society-launch">
        <input
          className="inp"
          placeholder="research question…"
          value={topic}
          disabled={society?.running}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && topic.trim() && !society?.running) void runSociety(topic.trim());
          }}
        />
        <button
          className="btn btn--accent"
          disabled={!topic.trim() || society?.running}
          onClick={() => void runSociety(topic.trim())}
        >
          {society?.running ? "running…" : "convene society"}
        </button>
      </div>

      {society && (
        <>
          <div className="society-status mono">
            phase: <b>{society.phase}</b> · round {society.round} · findings {society.findingCount}
          </div>
          <div className="coverage-meter" title={`overall coverage: ${overall ?? "—"}`}>
            <div className={`coverage-fill coverage-fill--${overall ?? "none"}`} style={{ width: `${pct}%` }} />
            <span className="coverage-label">{overall ?? "no coverage yet"}</span>
          </div>
          {society.budget && (
            <div
              className="coverage-meter"
              title="LLM-call kill-switch: the run stops gracefully at the cap"
            >
              <div
                className={`budget-fill${budgetPct > 80 ? " budget-fill--hot" : ""}`}
                style={{ width: `${budgetPct}%` }}
              />
              <span className="coverage-label">
                LLM calls {society.budget.used}/{society.budget.max ?? "∞"}
              </span>
            </div>
          )}
          <div className="gap-list">
            {gaps.map(([id, g]) => (
              <div key={id} className={`gap-row gap-row--${g.status}`}>
                <span
                  className="gap-dot"
                  style={{ background: g.claimedBy ? contributorColor(g.claimedBy) : "#3a4757" }}
                />
                <span className="gap-q">{g.question}</span>
                <span className="gap-status mono">
                  {g.status}
                  {g.coverage ? ` · ${g.coverage}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

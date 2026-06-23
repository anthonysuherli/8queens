/**
 * Bottom status bar: connection state, last action, undo/redo controls.
 */

import { useStore } from "../state/store";

export function StatusBar() {
  const mode = useStore((s) => s.mode);
  const lastAction = useStore((s) => s.lastAction);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undoLabel = useStore((s) => s.undoLabel);
  const redoLabel = useStore((s) => s.redoLabel);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  return (
    <footer className="sb">
      <span className="sb-conn">
        <span className={`sb-dot${mode === "mock" ? " sb-dot--mock" : ""}`} />
        {mode === "live" ? "live api" : "offline"}
      </span>
      {mode === "mock" && <span className="sb-mock-badge">MOCK DATA</span>}
      <span className="sb-action">
        last: <b>{lastAction}</b>
      </span>
      <span className="sb-history">
        <button
          className="btn"
          disabled={!canUndo}
          onClick={() => void undo()}
          title={undoLabel ? `undo: ${undoLabel} (⌘Z)` : "nothing to undo"}
        >
          ⤺ undo
        </button>
        <button
          className="btn"
          disabled={!canRedo}
          onClick={() => void redo()}
          title={redoLabel ? `redo: ${redoLabel} (⌘⇧Z)` : "nothing to redo"}
        >
          ⤻ redo
        </button>
      </span>
    </footer>
  );
}

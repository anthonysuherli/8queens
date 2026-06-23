/**
 * Toast stack. Destructive actions skip confirm dialogs BECAUSE undo exists —
 * the toast carries an Undo button instead.
 */

import { useStore } from "../state/store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  const undo = useStore((s) => s.undo);
  const canUndo = useStore((s) => s.canUndo);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast-text">{t.text}</span>
          {t.undoable && canUndo && (
            <button
              className="btn btn--accent"
              onClick={() => {
                dismissToast(t.id);
                void undo();
              }}
            >
              undo
            </button>
          )}
          <button className="toast-x" onClick={() => dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Global keyboard map.
 *
 *   ⌘/Ctrl+Z / +Shift+Z / +Y   undo / redo
 *   T                          toggle travel    E   connect from selection
 *   Del/Backspace              delete selection /   focus search
 *   travel: 1-9,0 hop · arrows aim · Enter go · Esc exit
 */

import { useEffect } from "react";
import { deleteSelection } from "./mutations";
import { useStore } from "./store";
import { orderedNeighbors } from "../travel/neighbors";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      // undo/redo — but never steal native text-undo from inputs
      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) void s.redo();
        else void s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        if (typing) return;
        e.preventDefault();
        void s.redo();
        return;
      }
      if (typing || mod) return;

      // travel-mode navigation
      if (s.travel) {
        const t = s.travel;
        if (e.key === "Escape") {
          s.exitTravel();
          return;
        }
        if (t.hop) return; // mid-hop: ignore nav input
        const neighbors = orderedNeighbors(t.current);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          if (neighbors.length) s.setNeighborIndex((t.neighborIndex + 1) % neighbors.length);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          if (neighbors.length) {
            s.setNeighborIndex((t.neighborIndex - 1 + neighbors.length) % neighbors.length);
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const target = neighbors[t.neighborIndex] ?? neighbors[0];
          if (target) s.beginHop(target);
          return;
        }
        if (/^[0-9]$/.test(e.key)) {
          const index = e.key === "0" ? 9 : Number(e.key) - 1;
          const target = neighbors[index];
          if (target) s.beginHop(target);
          return;
        }
        if (e.key.toLowerCase() === "t") {
          s.exitTravel();
          return;
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          if (s.addNodeOpen) s.setAddNodeOpen(false);
          else if (s.openConceptNodeId) s.openConcept(null);
          else if (s.openFindingId) s.openFinding(null);
          else if (s.edgeDraft) s.clearEdgeDraft();
          else if (s.connectFrom) s.cancelConnect();
          else s.clearSelection();
          return;
        case "t":
        case "T":
          s.enterTravel();
          return;
        case "e":
        case "E": {
          const source = s.selectedNodes[0];
          if (s.connectFrom) s.cancelConnect();
          else if (source) s.startConnect(source);
          return;
        }
        case "r":
        case "R": {
          if (s.selectedNodes.length === 1) s.openConcept(s.selectedNodes[0]);
          return;
        }
        case "Delete":
        case "Backspace":
          e.preventDefault();
          void deleteSelection();
          return;
        case "/":
          e.preventDefault();
          document.getElementById("graph-search")?.focus();
          return;
        default:
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Shell: top bar / [left rail | canvas | inspector] / status bar.
 */

import { useEffect } from "react";
import { GraphCanvas } from "./graph/GraphCanvas";
import { AddNodeModal } from "./panels/AddNodeModal";
import { ConceptDocReader } from "./panels/ConceptDocReader";
import { FindingDrawer } from "./panels/FindingDrawer";
import { Inspector } from "./panels/Inspector";
import { LeftRail } from "./panels/LeftRail";
import { StatusBar } from "./panels/StatusBar";
import { Toasts } from "./panels/Toasts";
import { TopBar } from "./panels/TopBar";
import { useStore } from "./state/store";
import { useHotkeys } from "./state/useHotkeys";
import { TravelHud } from "./travel/TravelHud";

export default function App() {
  const booting = useStore((s) => s.booting);
  const bootError = useStore((s) => s.bootError);
  const boot = useStore((s) => s.boot);
  const travel = useStore((s) => s.travel);

  useHotkeys();

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting || bootError) {
    return (
      <div className="boot">
        <div className="boot-wordmark">
          DELAPAN<span>_8</span>
        </div>
        {bootError ? (
          <>
            <div className="boot-err">{bootError}</div>
            <button className="btn btn--accent" onClick={() => void boot()}>
              retry
            </button>
          </>
        ) : (
          <div className="boot-line">
            <span className="spin" /> connecting to engine…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="shell">
      <TopBar />
      <div className="shell-main">
        <LeftRail />
        <div style={{ position: "relative", minWidth: 0 }}>
          <GraphCanvas />
          {travel && <TravelHud />}
        </div>
        <Inspector />
      </div>
      <StatusBar />
      <FindingDrawer />
      <ConceptDocReader />
      <AddNodeModal />
      <Toasts />
    </div>
  );
}

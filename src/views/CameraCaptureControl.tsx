import { useEffect, useRef, useState, type ReactNode } from "react";
import { HOLD_MS } from "@/lib/hold-burst";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CameraCaptureControl({ mode, recording, disabled, onCapture, onHold, left, right, ar = false, vertical = false }: {
  mode: "photo" | "video"; recording: boolean; disabled: boolean; onCapture: () => void;
  /** Photo mode: holding the shutter starts a multiple shot (true) that lasts until the finger lifts (false). */
  onHold?: (holding: boolean) => void;
  left?: ReactNode; right?: ReactNode; ar?: boolean; vertical?: boolean;
}) {
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const canHold = mode === "photo" && !!onHold && !disabled;
  const release = () => {
    window.clearTimeout(holdTimer.current);
    if (held.current) onHold?.(false);
  };
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!recording) { setSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  const label = mode === "photo" ? `Scatta foto${ar ? " AR" : ""}` : recording ? "Termina e salva" : `Avvia registrazione${ar ? " AR" : ""}`;
  return <div className={`camera-capture-dock${vertical ? " is-vertical" : ""}`} data-camera-controls>
    <div className="camera-capture-status" role="status" hidden={(ar || mode === "photo") && !recording}>
      {recording ? <><span className="camera-rec-dot" />REC · {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</> : mode === "photo" ? "FOTO" : "VIDEO"}
    </div>
    <div className={`camera-capture-row${vertical ? " is-vertical" : ""}`}>
      <div className="camera-capture-side">{left}</div>
      <Button variant="ghost" size="icon" disabled={disabled}
        onClick={() => { if (held.current) { held.current = false; return; } onCapture(); }}
        onPointerDown={(e) => {
          if (!canHold || (e.pointerType === "mouse" && e.button !== 0)) return;
          held.current = false;
          window.clearTimeout(holdTimer.current);
          holdTimer.current = window.setTimeout(() => { held.current = true; onHold?.(true); }, HOLD_MS);
        }}
        onPointerUp={release} onPointerCancel={release} onPointerLeave={release}
        onContextMenu={(e) => { if (onHold) e.preventDefault(); }} aria-label={label} title={label}
        className="camera-shutter" data-no-ui-click data-recording={recording} data-mode={mode}>
        {recording ? <Square className="camera-stop" /> : <span className="camera-shutter-core" />}
      </Button>
      <div className="camera-capture-side">{right}</div>
    </div>
    {!ar && <span className="camera-capture-label">{mode === "photo" ? (onHold ? "Scatta · tieni premuto per il multiplo" : "Scatta") : recording ? "Termina e salva" : "Registra"}</span>}
  </div>;
}

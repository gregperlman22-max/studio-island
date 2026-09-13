import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TravelPocView, type AvatarPose } from "../src/poc/travel/TravelPocView";
import { routeById, ROUTES } from "../src/poc/travel/routes";

/**
 * POC harness for the guided-travel gate. Separate entry point — it does not
 * touch the demo app, IslandScene, or anything shipped.
 *
 * Everything is driveable by URL so captures are deterministic:
 *   ?route=a|b  &p=0..1  &pose=front|back|none  &steer=-1..1  &hud=0|1  &ui=0|1
 */

function useParams() {
  const q = new URLSearchParams(location.search);
  return {
    route: q.get("route") ?? "a",
    p: Number(q.get("p") ?? "0.15"),
    pose: (q.get("pose") ?? "front") as AvatarPose,
    steer: Number(q.get("steer") ?? "0"),
    hud: q.get("hud") !== "0",
    ui: q.get("ui") !== "0",
  };
}

function Poc() {
  const init = useParams();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<TravelPocView | null>(null);
  const [p, setP] = useState(init.p);
  const [steer, setSteer] = useState(init.steer);
  const [routeId, setRouteId] = useState(init.route);
  const [pose, setPose] = useState<AvatarPose>(init.pose);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new TravelPocView({
      route: routeById(init.route), progress: init.p, steer: init.steer,
      pose: init.pose, hud: init.hud,
    });
    viewRef.current = view;
    view.init(host).then(() => {
      setReady(true);
      (window as unknown as Record<string, unknown>).__pocReady = true;
      (window as unknown as Record<string, unknown>).__pocSprites = () => view.sprites;
      (window as unknown as Record<string, unknown>).__pocSet = (o: Record<string, unknown>) =>
        view.set(o as never);
    });
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.set({ route: routeById(routeId), progress: p, steer, pose });
  }, [routeId, p, steer, pose]);

  // Arrow keys / A-D walk, so the illusion can be judged in motion by hand.
  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => { held.add(e.key); };
    const up = (e: KeyboardEvent) => { held.delete(e.key); };
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let dp = 0, ds = 0;
      if (held.has("ArrowUp") || held.has("w")) dp += 0.12 * dt;
      if (held.has("ArrowDown") || held.has("s")) dp -= 0.12 * dt;
      if (held.has("ArrowLeft") || held.has("a")) ds -= 0.7 * dt;
      if (held.has("ArrowRight") || held.has("d")) ds += 0.7 * dt;
      if (dp) setP((v) => Math.max(0, Math.min(0.985, v + dp)));
      if (ds) setSteer((v) => Math.max(-1, Math.min(1, v + ds)));
      raf = requestAnimationFrame(tick);
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    raf = requestAnimationFrame(tick);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {init.ui && ready && (
        <div style={panel}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {ROUTES.map((r) => (
              <button key={r.id} onClick={() => setRouteId(r.id)} style={btn(routeId === r.id)}>
                {r.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["front", "back", "none"] as AvatarPose[]).map((x) => (
              <button key={x} onClick={() => setPose(x)} style={btn(pose === x)}>{x}</button>
            ))}
          </div>
          <label style={lbl}>progress {p.toFixed(2)}
            <input type="range" min={0} max={0.985} step={0.005} value={p}
              onChange={(e) => setP(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
          <label style={lbl}>steer {steer.toFixed(2)}
            <input type="range" min={-1} max={1} step={0.02} value={steer}
              onChange={(e) => setSteer(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>↑↓ walk · ←→ steer</div>
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  position: "absolute", left: 12, bottom: 12, width: 230, padding: 12,
  borderRadius: 12, background: "rgba(255,252,245,0.94)", border: "2px solid #23201c",
  fontFamily: "system-ui, sans-serif", fontSize: 12, boxShadow: "0 4px 0 #23201c",
};
const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
  border: on ? "2px solid #23201c" : "1px solid #c6b89a", background: on ? "#ffd98a" : "#fff",
});
const lbl: React.CSSProperties = { display: "block", marginTop: 6, fontWeight: 700 };

createRoot(document.getElementById("root")!).render(<Poc />);

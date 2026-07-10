import { useEffect, useRef, useState } from "react";
import {
  BUILD_CATEGORIES,
  getBuildItemsByCategory,
  type BuildCategory,
  type BuildItemDef,
} from "../content/buildItems";
import { applyBuildEvent } from "../build-engine/engine";
import { listSaveSlots, loadFromSlot, SAVE_SLOTS, saveToSlot, type SaveSlot } from "../build-engine/saves";
import { EMPTY_BUILD_STATE, type BuildEvent, type BuildState } from "../build-engine/types";
import { BuildSceneRenderer } from "./BuildSceneRenderer";
import { buildRegion } from "./layout";

/**
 * FreeBuildScene — the free-build island's React host (Session 5).
 *
 * Owns the state loop the engine architecture demands: the Pixi view emits
 * BuildEvents; THIS component applies them through the pure reducer and
 * passes the new state back down (state-in/events-out). Fully offline —
 * placements live in React state and the three local-storage save slots.
 *
 * DOM chrome: a bottom palette drawer (4 sandtray category tabs, drag a chip
 * onto the island to place), a saves panel (My Island 1/2/3), and Sail Home.
 */

const INK = "#23201c";
const CATEGORY_LABELS: Record<BuildCategory, string> = {
  structures: "Structures",
  nature: "Nature",
  figures: "Friends",
  comfort: "Comfort",
};
const CATEGORY_SWATCH: Record<BuildCategory, string> = {
  structures: "#c98a4b",
  nature: "#7cbf6b",
  figures: "#f2b8c6",
  comfort: "#f4d36b",
};

export interface FreeBuildSceneProps {
  /** Sail-home completed — the host returns to the main island. */
  onExit: () => void;
  reducedMotion?: boolean;
  className?: string;
}

let placementCounter = 0;
const nextPlacementId = (): string =>
  `p-${Date.now().toString(36)}-${(placementCounter++).toString(36)}`;

export function FreeBuildScene({ onExit, reducedMotion, className }: FreeBuildSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<BuildSceneRenderer | null>(null);
  const stateRef = useRef<BuildState>(EMPTY_BUILD_STATE);

  const [buildState, setBuildState] = useState<BuildState>(EMPTY_BUILD_STATE);
  const [phase, setPhase] = useState<"arriving" | "building" | "departing">("arriving");
  const [category, setCategory] = useState<BuildCategory>("structures");
  const [drag, setDrag] = useState<{ item: BuildItemDef; x: number; y: number } | null>(null);
  const [slots, setSlots] = useState(() => listSaveSlots());

  stateRef.current = buildState;

  // The engine loop: event → pure reducer → state back into the view.
  const handleEvent = (event: BuildEvent) => {
    const next = applyBuildEvent(stateRef.current, event, buildRegion);
    if (next !== stateRef.current) setBuildState(next);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prefersReduced =
      reducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ??
      false;
    const renderer = new BuildSceneRenderer({
      container: el,
      reducedMotion: prefersReduced,
      onEvent: handleEvent,
      onReady: () => renderer.playSail("arrive", () => setPhase("building")),
    });
    rendererRef.current = renderer;
    void renderer.init();
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
    // Mount once — reducedMotion is read at init time (same as IslandScene).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State flows INTO the view whenever it changes (diffed there — echoes of
  // our own events are display no-ops).
  useEffect(() => {
    rendererRef.current?.setState(buildState);
  }, [buildState]);

  // ── Palette drag-to-place ─────────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const cell = rendererRef.current?.cellFromClient(e.clientX, e.clientY) ?? null;
      if (cell) {
        handleEvent({
          type: "place",
          placement: { id: nextPlacementId(), itemId: drag.item.id, cell, rotation: 0 },
        });
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.item.id]);

  const sailHome = () => {
    if (phase !== "building") return;
    setPhase("departing");
    rendererRef.current?.playSail("depart", onExit);
  };

  const save = (slot: SaveSlot) => {
    saveToSlot(slot, stateRef.current);
    setSlots(listSaveSlots());
  };
  const load = (slot: SaveSlot) => {
    const loaded = loadFromSlot(slot);
    if (!loaded) return;
    setBuildState(loaded);
    rendererRef.current?.reset(loaded); // load-save is the one full rebuild
  };

  const building = phase === "building";

  return (
    <div
      ref={containerRef}
      className={className}
      data-scene="free-build"
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}
    >
      {building && (
        <>
          {/* Sail Home — top right, mirrors the main island's Exit. */}
          <button type="button" onClick={sailHome} aria-label="Sail home" style={pillBtn({ top: 16, right: 16 })}>
            ⛵ Sail Home
          </button>

          {/* Save slots — top left. */}
          <div style={{ position: "absolute", top: 16, left: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {SAVE_SLOTS.map((slot) => {
              const info = slots.find((s) => s.slot === slot);
              return (
                <div key={slot} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={slotLabel}>
                    {info ? `${info.name} · ${info.itemCount}` : `My Island ${slot} · empty`}
                  </span>
                  <button type="button" style={miniBtn} onClick={() => save(slot)} aria-label={`Save to slot ${slot}`}>
                    Save
                  </button>
                  <button
                    type="button"
                    style={{ ...miniBtn, opacity: info ? 1 : 0.4 }}
                    disabled={!info}
                    onClick={() => load(slot)}
                    aria-label={`Load slot ${slot}`}
                  >
                    Load
                  </button>
                </div>
              );
            })}
          </div>

          {/* Palette drawer — bottom. */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              background: "rgba(251,247,239,0.95)", borderTop: `3px solid ${INK}`,
              padding: "8px 10px 10px", fontFamily: "system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {BUILD_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    ...tabBtn,
                    background: category === c ? CATEGORY_SWATCH[c] : "#fff",
                    fontWeight: category === c ? 800 : 600,
                  }}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b5a44", alignSelf: "center" }}>
                drag onto the island · tap a placed item to rotate or remove
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {getBuildItemsByCategory(category).map((item) => (
                <div
                  key={item.id}
                  role="button"
                  aria-label={`Place ${item.name}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDrag({ item, x: e.clientX, y: e.clientY });
                  }}
                  style={{ ...chip, borderColor: CATEGORY_SWATCH[item.category] }}
                >
                  <span
                    style={{
                      display: "inline-block", width: 14, height: 14, borderRadius: 4,
                      background: CATEGORY_SWATCH[item.category], border: `2px solid ${INK}`,
                    }}
                  />
                  {item.name}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Drag ghost following the pointer. */}
      {drag && (
        <div
          style={{
            position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%, -120%)",
            pointerEvents: "none", zIndex: 50, padding: "6px 10px", borderRadius: 8,
            background: CATEGORY_SWATCH[drag.item.category], border: `3px solid ${INK}`,
            fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 800, color: INK,
          }}
        >
          {drag.item.name}
        </div>
      )}
    </div>
  );
}

const pillBtn = (pos: React.CSSProperties): React.CSSProperties => ({
  position: "absolute", ...pos, padding: "10px 18px", borderRadius: 999,
  border: `3px solid ${INK}`, background: "#fff", color: INK,
  fontFamily: "system-ui, sans-serif", fontSize: 16, fontWeight: 800,
  cursor: "pointer", boxShadow: `0 4px 0 ${INK}`, zIndex: 10,
});

const miniBtn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 8, border: `2px solid ${INK}`,
  background: "#fff", color: INK, fontFamily: "system-ui, sans-serif",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
};

const slotLabel: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: INK,
  background: "rgba(251,247,239,0.9)", padding: "4px 8px", borderRadius: 8,
  border: `2px solid ${INK}`, minWidth: 130,
};

const tabBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 999, border: `2px solid ${INK}`,
  color: INK, fontSize: 13, cursor: "pointer",
};

const chip: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  padding: "8px 12px", borderRadius: 10, border: "3px solid",
  background: "#fff", color: INK, fontSize: 13, fontWeight: 700,
  cursor: "grab", userSelect: "none", touchAction: "none",
};

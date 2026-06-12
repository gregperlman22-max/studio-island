import { forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import type { IslandSceneHandle, IslandSceneProps } from "./types";

/**
 * IslandScene — Milestone 1 stub.
 *
 * The full PixiJS renderer lands in Milestone 2 (terrain + zones) and
 * Milestone 3 (avatar + movement). This stub exists so the contract
 * compiles, the demo harness mounts, and host integration can be wired
 * end-to-end against real props and callbacks.
 *
 * It renders a labelled placeholder that reflects the current theme
 * palette and zone list so changes to props are visible immediately.
 */
export const IslandScene = forwardRef<IslandSceneHandle, IslandSceneProps>(
  function IslandScene(props, ref) {
    const {
      themePack,
      zones,
      layout,
      avatars,
      mode,
      audioEnabled,
      onReady,
      onZoneTap,
      className,
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(
      ref,
      (): IslandSceneHandle => ({
        setVolume: () => {},
        duck: () => {},
        walkLocalAvatarTo: () => {},
        resize: () => {},
      }),
      [],
    );

    useEffect(() => {
      // Milestone 1: no real preload yet — fire onReady on next tick
      // so host integration code paths can be exercised.
      const id = window.setTimeout(() => onReady?.(), 0);
      return () => window.clearTimeout(id);
    }, [onReady]);

    const { palette } = themePack;

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: `linear-gradient(180deg, ${palette.skyTop} 0%, ${palette.skyBottom} 60%, ${palette.water} 100%)`,
          color: palette.ink,
          overflow: "hidden",
          fontFamily: "inherit",
        }}
        data-mode={mode}
        data-audio={audioEnabled ? "on" : "off"}
        data-theme={themePack.key}
      >
        <div
          style={{
            position: "absolute",
            inset: 16,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(zones.length, 3)}, 1fr)`,
            gap: 12,
            alignContent: "center",
          }}
        >
          {zones.map((z) => (
            <button
              key={z.key}
              onClick={() => onZoneTap?.(z.key)}
              disabled={!z.unlocked}
              style={{
                background: palette.land,
                border: `2px solid ${palette.foliage}`,
                borderRadius: 16,
                padding: "18px 14px",
                textAlign: "left",
                cursor: z.unlocked ? "pointer" : "not-allowed",
                opacity: z.unlocked ? 1 : 0.55,
                color: palette.ink,
                boxShadow: `0 4px 0 ${palette.foliageShadow}`,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {z.displayName}
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{z.skinName}</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
                {z.unlocked ? "Tap to visit" : "Locked"}
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.6)",
            color: palette.ink,
          }}
        >
          island-scene · M1 stub · {themePack.displayName} · {avatars.length} avatar
          {avatars.length === 1 ? "" : "s"} · grid {layout.grid.w}×{layout.grid.h}
        </div>
      </div>
    );
  },
);

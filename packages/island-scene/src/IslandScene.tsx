import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { IslandSceneHandle, IslandSceneProps, ScenePhase } from "./types";
import { SceneRenderer } from "./render/SceneRenderer";
import { readMutePreference } from "./render/AudioService";

/**
 * IslandScene — PixiJS renderer wrapper (two-mode: world map + zone interior).
 *
 * Thin lifecycle/prop bridge: it owns no world data. The SceneRenderer (plain
 * TS) owns the scene graph; props flow in, callbacks out. When `currentZone`
 * is set the renderer shows that zone's interior and this component overlays an
 * accessible Exit button that fires `onZoneExit`.
 */
export const IslandScene = forwardRef<IslandSceneHandle, IslandSceneProps>(
  function IslandScene(props, ref) {
    const {
      themePack,
      zones,
      layout,
      avatars,
      mode,
      currentZone,
      zoneViewActive,
      audioEnabled,
      reducedMotion,
      hideTextLabels,
      onReady,
      onError,
      onLoadProgress,
      onZoneTap,
      onZoneExit,
      onActivityEnter,
      onObjectInteract,
      onAvatarMove,
      onAvatarSelect,
      onPhaseChange,
      className,
    } = props;

    // Mode 2 shows when a zone is active and not explicitly suppressed.
    const effectiveZone = zoneViewActive === false ? null : currentZone ?? null;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<SceneRenderer | null>(null);
    // The child's global mute toggle, seeded from the persisted preference so
    // the icon is right before the renderer has even mounted.
    const [muted, setMuted] = useState<boolean>(() => readMutePreference());
    /**
     * Which screen the child is actually on (issue #5).
     *
     * Before this, the zoom buttons were conditional on `!inZone` only, so
     * they stayed up over the avatar picker and the boat cinematic — screens
     * with nothing to zoom, where on a phone they also sat over the card
     * corner and the Continue button. Seeded to "arrival" because that is
     * what the renderer starts in; it corrects itself on the first frame.
     */
    const [phase, setPhase] = useState<ScenePhase>("arrival");

    const cbRef = useRef({ onReady, onError, onLoadProgress, onZoneTap, onActivityEnter, onZoneExit, onObjectInteract, onAvatarMove, onAvatarSelect, onPhaseChange });
    cbRef.current = { onReady, onError, onLoadProgress, onZoneTap, onActivityEnter, onZoneExit, onObjectInteract, onAvatarMove, onAvatarSelect, onPhaseChange };

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const prefersReduced =
        reducedMotion ??
        (typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ??
        false;

      const renderer = new SceneRenderer({
        container: el,
        reducedMotion: prefersReduced,
        hideTextLabels: !!hideTextLabels,
        audioEnabled,
        onReady: () => cbRef.current.onReady?.(),
        onError: (e) => cbRef.current.onError?.(e),
        onLoadProgress: (p) => cbRef.current.onLoadProgress?.(p),
        onZoneTap: (k) => cbRef.current.onZoneTap?.(k),
        onActivityEnter: (k) => cbRef.current.onActivityEnter?.(k),
        onZoneExit: () => cbRef.current.onZoneExit?.(),
        onObjectInteract: (id, z) => cbRef.current.onObjectInteract?.(id, z),
        onAvatarMove: (id, p) => cbRef.current.onAvatarMove?.(id, p),
        onAvatarSelect: (key) => cbRef.current.onAvatarSelect?.(key),
        onPhaseChange: (p) => {
          setPhase(p);
          cbRef.current.onPhaseChange?.(p);
        },
      });
      rendererRef.current = renderer;

      renderer
        .init(themePack, layout, zones, avatars, effectiveZone)
        .catch((e) => cbRef.current.onError?.(e as Error));

      const ro = new ResizeObserver(() => renderer.resize());
      ro.observe(el);

      return () => {
        ro.disconnect();
        renderer.destroy();
        rendererRef.current = null;
      };
      // Mount once — reducedMotion/hideTextLabels are read at init time.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      rendererRef.current?.setTheme(themePack);
    }, [themePack]);
    useEffect(() => {
      rendererRef.current?.setZones(zones);
    }, [zones]);
    useEffect(() => {
      rendererRef.current?.setLayout(layout);
    }, [layout]);
    useEffect(() => {
      rendererRef.current?.setAvatars(avatars);
    }, [avatars]);
    useEffect(() => {
      rendererRef.current?.setCurrentZone(effectiveZone);
    }, [effectiveZone]);
    useEffect(() => {
      rendererRef.current?.setAudioEnabled(audioEnabled);
    }, [audioEnabled]);

    useImperativeHandle(
      ref,
      (): IslandSceneHandle => ({
        // Volume ducking is a later refinement; mute is the live control.
        setVolume: () => {},
        duck: () => {},
        isMuted: () => rendererRef.current?.isMuted() ?? muted,
        setMuted: (m: boolean) => {
          if (rendererRef.current && rendererRef.current.isMuted() !== m) {
            rendererRef.current.toggleMute();
          }
          setMuted(m);
        },
        walkLocalAvatarTo: (position) =>
          rendererRef.current?.walkLocalAvatarTo(position),
        resize: () => rendererRef.current?.resize(),
      }),
      [muted],
    );

    const toggleMute = () => {
      const next = rendererRef.current ? rendererRef.current.toggleMute() : !muted;
      setMuted(next);
    };

    const inZone = !!effectiveZone;
    /**
     * World-navigation chrome belongs to the world map only.
     *
     * Zoom pans an island the child cannot see from the picker or the boat, so
     * it goes away on both. Mute deliberately does NOT: a child may well want
     * to silence the arrival cinematic, and taking that away to tidy the
     * corner would be the wrong trade (issue #5 raises this explicitly).
     */
    const showZoom = phase === "world";

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        data-mode={mode}
        data-phase={phase}
        data-zone={effectiveZone ?? ""}
        data-audio={audioEnabled ? "on" : "off"}
        data-theme={themePack.key}
      >
        {/* Bottom-right controls: zoom (world map only) above an always-on
            mute toggle. Kept clear of the top-right Exit + the in-scene exit. */}
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {showZoom && (
            <>
              <button type="button" aria-label="Zoom in" style={zoomBtn} onClick={() => rendererRef.current?.zoomBy(1.25)}>+</button>
              <button type="button" aria-label="Zoom out" style={zoomBtn} onClick={() => rendererRef.current?.zoomBy(0.8)}>−</button>
            </>
          )}
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            style={zoomBtn}
            onClick={toggleMute}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>

        {inZone && (
          <button
            type="button"
            onClick={() => onZoneExit?.()}
            aria-label="Exit to island"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              padding: "10px 18px",
              borderRadius: 999,
              border: "3px solid #23201c",
              background: "#fff",
              color: "#23201c",
              fontFamily: "system-ui, sans-serif",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 0 #23201c",
            }}
          >
            ← Exit
          </button>
        )}
      </div>
    );
  },
);

const zoomBtn: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 14,
  border: "3px solid #23201c",
  background: "#fff",
  color: "#23201c",
  fontSize: 26,
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "0 4px 0 #23201c",
};

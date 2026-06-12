import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { IslandSceneHandle, IslandSceneProps } from "./types";
import { SceneRenderer } from "./render/SceneRenderer";

/**
 * IslandScene — PixiJS renderer wrapper.
 *
 * Milestone 2: terrain from `layout`, six zones placed + interactive, live
 * theme-pack palette swapping, decorations, and the reserved picture-frame
 * anchor. Avatars render as position markers; the layered compositor and
 * tap-to-move arrive in Milestone 3.
 *
 * This component is a thin lifecycle/prop bridge: it owns no world data. The
 * SceneRenderer (plain TS) owns the scene graph; props flow in, callbacks out.
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
      reducedMotion,
      hideTextLabels,
      onReady,
      onError,
      onLoadProgress,
      onZoneTap,
      onObjectInteract,
      onAvatarMove,
      className,
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<SceneRenderer | null>(null);

    // Latest callbacks live in a ref so prop changes never re-init Pixi.
    const cbRef = useRef({
      onReady,
      onError,
      onLoadProgress,
      onZoneTap,
      onObjectInteract,
      onAvatarMove,
    });
    cbRef.current = {
      onReady,
      onError,
      onLoadProgress,
      onZoneTap,
      onObjectInteract,
      onAvatarMove,
    };

    // Mount the renderer once. Initial props seed the first build; subsequent
    // changes are handled by the targeted effects below.
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
        onReady: () => cbRef.current.onReady?.(),
        onError: (e) => cbRef.current.onError?.(e),
        onLoadProgress: (p) => cbRef.current.onLoadProgress?.(p),
        onZoneTap: (k) => cbRef.current.onZoneTap?.(k),
        onObjectInteract: (id, z) => cbRef.current.onObjectInteract?.(id, z),
      });
      rendererRef.current = renderer;

      renderer
        .init(themePack, layout, zones, avatars)
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

    useImperativeHandle(
      ref,
      (): IslandSceneHandle => ({
        // Audio lands in Milestone 4; these stay no-ops until then.
        setVolume: () => {},
        duck: () => {},
        walkLocalAvatarTo: (position) =>
          rendererRef.current?.walkLocalAvatarTo(position),
        resize: () => rendererRef.current?.resize(),
      }),
      [],
    );

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
        data-audio={audioEnabled ? "on" : "off"}
        data-theme={themePack.key}
      />
    );
  },
);

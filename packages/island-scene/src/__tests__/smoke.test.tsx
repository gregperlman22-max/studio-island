// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";

/**
 * Mount smoke test. jsdom has no WebGL, so the SceneRenderer (Pixi) is
 * mocked — this verifies the React wrapper's contract: it mounts without
 * error, initializes exactly one renderer with the given props, exposes its
 * data attributes, and tears the renderer down on unmount.
 */

const rendererInstances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
vi.mock("../render/SceneRenderer", () => ({
  SceneRenderer: class {
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
    resize = vi.fn();
    setTheme = vi.fn();
    setZones = vi.fn();
    setLayout = vi.fn();
    setAvatars = vi.fn();
    setCurrentZone = vi.fn();
    walkLocalAvatarTo = vi.fn();
    zoomBy = vi.fn();
    constructor() {
      rendererInstances.push(this as never);
    }
  },
}));

// IslandScene must load AFTER the mock is registered.
const { IslandScene } = await import("../IslandScene");

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no ResizeObserver.
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("IslandScene mount smoke", () => {
  it("mounts, initializes one renderer, and destroys it on unmount", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);

    act(() => {
      root.render(
        <IslandScene
          themePack={sproutPack}
          zones={[...sampleZones]}
          layout={sampleLayout}
          avatars={[
            {
              id: "local",
              isLocal: true,
              position: sampleLayout.spawnPoint,
              config: {
                species: "bunny",
                bodyColor: "#f3c1d6",
                accessoryKey: "none",
                displayColor: "#c47b9a",
              },
            },
          ]}
          mode="play"
          audioEnabled={false}
          reducedMotion
        />,
      );
    });

    expect(rendererInstances).toHaveLength(1);
    const renderer = rendererInstances[0];
    expect(renderer.init).toHaveBeenCalledTimes(1);
    const wrapper = el.querySelector("[data-mode]") as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.dataset.mode).toBe("play");
    expect(wrapper.dataset.theme).toBe("sprout");
    expect(wrapper.dataset.zone).toBe("");

    act(() => root.unmount());
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });
});

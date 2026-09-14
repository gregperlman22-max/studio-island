import { useMemo, useRef, useState } from "react";
import {
  FreeBuildScene,
  IslandScene,
  themePacks,
  sampleLayout,
  sampleZones,
  ACCESSORY_KEYS,
  SPECIES,
  avatarImageUrl,
  type AccessoryKey,
  type AvatarConfig,
  type AvatarInstance,
  type IslandSceneHandle,
  type SceneMode,
  type ScenePhase,
  type Species,
  type ThemePackKey,
  type ZoneKey,
} from "../src";
// The demo lives INSIDE the package, so the review-capture hook below reads the
// renderer's own layout model directly rather than going through the public
// API. Nothing here is part of the published contract.
import { roomFit } from "../src/render/treehouseModel";
import {
  TABLE,
  dioramaStage,
  layoutChoiceCards,
  questRoomFit,
  EC1_CHOICES,
} from "../src/quest/questTableModel";

/**
 * Free-build island ferry stop: a dinghy decoration beside Welcome Dock,
 * added HOST-side (spread onto the locked layout — defaultLayout.ts itself
 * is untouched) using the existing decorations + onObjectInteract pattern.
 * Cell (38, 41) is walkable beach just west of the dock.
 */
/**
 * Review-capture hooks — DEV HARNESS ONLY, never part of the product.
 *
 * Screenshots and recordings of a Pixi canvas are only worth reviewing if they
 * are deterministic, so the harness can be driven by URL:
 *
 *   ?avatar=otter                 skip the picker with that Island Friend
 *   ?zone=treehouse_hideaway      open straight into that interior
 *   ?panel=0                      hide the dev-tools button
 *
 * and `window.__ec1` reports where the Quest Table's affordances actually are,
 * computed with the SAME pure model the renderer draws from — so if the layout
 * moves, the capture follows it instead of silently missing.
 */
const REVIEW = new URLSearchParams(
  typeof location === "undefined" ? "" : location.search,
);
/** The shipped room painting, treehouse-hideaway.webp. */
const ROOM_ART = { w: 2000, h: 1125 };

function installCaptureHook() {
  if (typeof window === "undefined") return;
  const geom = (questOpen: boolean) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fit = questOpen ? questRoomFit : roomFit;
    const img = fit(ROOM_ART.w, ROOM_ART.h, w, h);
    return { img, w, h };
  };
  (window as unknown as Record<string, unknown>).__ec1 = {
    /** Centre of the painted table — the tap that picks the Quest Table up. */
    table: () => {
      const { img } = geom(false);
      return { x: img.x + TABLE.cx * img.w, y: img.y + TABLE.cy * img.h };
    },
    /** Centre of choice card `i`, with the table already open. */
    card: (i: number) => {
      const { img, w, h } = geom(true);
      const cards = layoutChoiceCards(img, w, h, EC1_CHOICES.map((c) => c.id));
      const c = cards[i];
      return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : null;
    },
    /** Centre of the diorama stage, for framing a recording. */
    stage: () => {
      const { img } = geom(true);
      const st = dioramaStage(img);
      return { x: st.cx, y: st.cy };
    },
  };
}
installCaptureHook();

const DINGHY_ID = "dinghy-to-build-island";
const layoutWithDinghy = {
  ...sampleLayout,
  decorations: [
    ...(sampleLayout.decorations ?? []),
    { id: DINGHY_ID, kind: "dinghy boat", position: { x: 38, y: 41 }, scale: 1.4 },
  ],
};

/**
 * Demo harness. The island is full-screen (the child-facing product view).
 * All developer controls live behind a single floating button so they never
 * intrude on the scene — open it to drive theme / avatar / toggles for review.
 */
export function DemoApp() {
  const [open, setOpen] = useState(false);
  const showDevButton = REVIEW.get("panel") !== "0";
  const [themeKey, setThemeKey] = useState<ThemePackKey>("sprout");
  const [mode, setMode] = useState<SceneMode>("studio");
  // Default ON so the scratch voice files are exercised on review (the in-scene
  // 🔊 button toggles the persisted child mute on top of this host enable).
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hideTextLabels, setHideTextLabels] = useState(false);
  const [lockLighthouse, setLockLighthouse] = useState(false);
  const [currentZone, setCurrentZone] = useState<ZoneKey | null>(
    (REVIEW.get("zone") as ZoneKey | null) ?? null,
  );
  /** Which screen the child is on, reported by the scene (issue #5). The hint
   *  below is world-map guidance and is wrong everywhere else. */
  const [phase, setPhase] = useState<ScenePhase>("arrival");
  /** "main" = the guided island; "build" = the free-build island. */
  const [scene, setScene] = useState<"main" | "build">("main");

  // The avatar choice is intentionally NOT persisted: the picker shows on every
  // fresh page load so the child picks their island friend each visit. `imageUrl`
  // starts undefined → the selection screen always runs before the cinematic.
  const [avatarCfg, setAvatarCfg] = useState<AvatarConfig>(() => ({
    species: "bunny",
    bodyColor: "#f3c1d6",
    accessoryKey: "scarf",
    displayColor: "#c47b9a",
    // ?avatar=<key> seeds the pick so a capture lands on the same screen every
    // run. Without it this stays undefined and the picker runs as normal.
    imageUrl: avatarImageUrl(REVIEW.get("avatar") ?? "") ?? undefined,
  }));

  const [log, setLog] = useState<string[]>([]);
  const sceneRef = useRef<IslandSceneHandle>(null);

  const themePack = themePacks[themeKey];

  const zones = useMemo(
    () =>
      sampleZones.map((z) => ({
        ...z,
        skinName: themePack.zoneSkins[z.key]?.skinName ?? z.skinName,
        unlocked: z.key === "lighthouse_point" ? !lockLighthouse : z.unlocked,
      })),
    [themePack, lockLighthouse],
  );

  const avatars = useMemo<AvatarInstance[]>(
    () => [
      {
        id: "local",
        isLocal: true,
        position: sampleLayout.spawnPoint,
        label: "Maple Ranger",
        config: avatarCfg,
      },
    ],
    [avatarCfg],
  );

  const append = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} · ${line}`, ...l].slice(0, 20));

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) =>
    setAvatarCfg((c) => ({ ...c, [k]: v }));

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {scene === "build" ? (
        <FreeBuildScene
          reducedMotion={reducedMotion}
          onExit={() => {
            append("sail home → main island");
            // Remounting IslandScene replays the boat arrival — that IS the
            // sail-back; the avatar pick is preserved via avatarCfg.imageUrl.
            setScene("main");
          }}
        />
      ) : (
      <IslandScene
        key={reducedMotion ? "rm" : "full"}
        ref={sceneRef}
        themePack={themePack}
        zones={zones}
        layout={layoutWithDinghy}
        avatars={avatars}
        mode={mode}
        currentZone={currentZone}
        audioEnabled={audioEnabled}
        reducedMotion={reducedMotion}
        hideTextLabels={hideTextLabels}
        onPhaseChange={(p: ScenePhase) => { setPhase(p); append(`onPhaseChange(${p})`); }}
        onReady={() => append("onReady")}
        onLoadProgress={(p) => append(`onLoadProgress(${p.toFixed(2)})`)}
        onZoneTap={(z: ZoneKey) => { append(`onZoneTap(${z}) → enter`); setCurrentZone(z); }}
        onZoneExit={() => { append("onZoneExit → world"); setCurrentZone(null); }}
        onAvatarSelect={(key: string) => {
          append(`onAvatarSelect(${key})`);
          // Reflect the choice for THIS session only (no persistence) so the
          // chosen friend rides along; a page reload starts the picker again.
          setAvatarCfg((c) => ({ ...c, imageUrl: avatarImageUrl(key) ?? undefined }));
        }}
        onActivityEnter={(z: ZoneKey) => append(`onActivityEnter(${z})`)}
        onObjectInteract={(id) => {
          append(`onObjectInteract(${id})`);
          // The dinghy beside Welcome Dock ferries to the free-build island.
          if (id === DINGHY_ID) setScene("build");
        }}
        onAvatarMove={(id, p) => append(`onAvatarMove(${id}, ${p.x},${p.y})`)}
        onError={(e) => append(`onError: ${e.message}`)}
      />
      )}

      {/* Floating dev-tools toggle — the only chrome over the scene. */}
      {showDevButton && (
      <button
        onClick={() => setOpen((o) => !o)}
        title="Developer controls"
        aria-label="Developer controls"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          width: 56,
          height: 56,
          borderRadius: 999,
          border: "3px solid #23201c",
          background: "#ffffff",
          color: "#23201c",
          fontSize: 26,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 4px 0 #23201c",
          zIndex: 10,
        }}
      >
        {open ? "×" : "⚙"}
      </button>
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 12,
            width: 260,
            maxHeight: "calc(100vh - 80px)",
            overflowY: "auto",
            padding: 14,
            borderRadius: 14,
            background: "rgba(251,247,239,0.94)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            backdropFilter: "blur(6px)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6b5a44" }}>
            island-scene · dev harness (not part of the product UI)
          </p>

          <Section title="Theme pack">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(themePacks) as ThemePackKey[]).map((k) => (
                <button key={k} onClick={() => setThemeKey(k)} style={pill(themeKey === k)}>
                  {themePacks[k].displayName}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Mode">
            <div style={{ display: "flex", gap: 6 }}>
              {(["studio", "play", "session"] as SceneMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)} style={box(mode === m)}>
                  {m}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Zone view (Mode 2)">
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b5a44" }}>
              Active: <strong>{currentZone ? `Mode 2 · ${currentZone}` : "Mode 1 · world map"}</strong>
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {zones.map((z) => (
                <button
                  key={z.key}
                  onClick={() => { append(`enter zone view → ${z.key}`); setCurrentZone(z.key); }}
                  style={box(currentZone === z.key)}
                >
                  {z.displayName}
                </button>
              ))}
              <button onClick={() => { append("exit zone view → world"); setCurrentZone(null); }} style={box(currentZone === null)}>
                ← World map
              </button>
            </div>
          </Section>

          <Section title="Animal">
            <Picker label="Species" value={avatarCfg.species} options={SPECIES} onChange={(v) => set("species", v as Species)} />
            <Picker label="Accessory" value={avatarCfg.accessoryKey} options={ACCESSORY_KEYS} onChange={(v) => set("accessoryKey", v as AccessoryKey)} />
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <Swatch label="Body color" value={avatarCfg.bodyColor} onChange={(v) => set("bodyColor", v)} />
              <Swatch label="Display color" value={avatarCfg.displayColor} onChange={(v) => set("displayColor", v)} />
            </div>
          </Section>

          <Section title="Toggles">
            <Toggle label="Audio enabled" checked={audioEnabled} onChange={setAudioEnabled} />
            <Toggle label="Reduced motion" checked={reducedMotion} onChange={setReducedMotion} />
            <Toggle label="Hide text labels" checked={hideTextLabels} onChange={setHideTextLabels} />
            <Toggle label="Lock Lighthouse" checked={lockLighthouse} onChange={setLockLighthouse} />
          </Section>

          <Section title="Imperative handle">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => sceneRef.current?.walkLocalAvatarTo({ x: 27, y: 9 })} style={btn}>Walk → north</button>
              <button onClick={() => sceneRef.current?.walkLocalAvatarTo(sampleLayout.spawnPoint)} style={btn}>Walk → dock</button>
            </div>
          </Section>

          <Section title="Event log">
            <ol style={{ paddingLeft: 16, fontSize: 11, color: "#3b2a1a", margin: 0 }}>
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </Section>
        </div>
      )}

      {/* Minimal hint for first-time reviewers — WORLD MAP ONLY.
          It used to be always-on, which meant a child on the avatar picker or
          the boat cinematic was told to "tap a zone to visit" on a screen with
          no zones, and on a phone it sat over the picker's Continue button
          (issue #5, host half). The scene reports its phase now, so the hint
          can simply not be there. */}
      {phase === "world" && scene === "main" && (
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(20,16,10,0.5)",
          color: "#fff",
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        Tap to walk · tap a zone to visit · drag to look around
      </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>{title}</label>
      {children}
    </section>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ fontSize: 12, display: "grid", gridTemplateColumns: "72px 1fr", alignItems: "center", gap: 8, marginBottom: 6 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6 }}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 26, border: "none", background: "none" }} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: active ? "2px solid #3b2a1a" : "1px solid #c6b89a",
  background: active ? "#fff" : "transparent",
  cursor: "pointer",
  fontSize: 12,
});

const box = (active: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 8,
  border: active ? "2px solid #3b2a1a" : "1px solid #c6b89a",
  background: active ? "#fff" : "transparent",
  cursor: "pointer",
  fontSize: 12,
});

const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #c6b89a",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

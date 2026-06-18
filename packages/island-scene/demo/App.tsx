import { useMemo, useRef, useState } from "react";
import {
  IslandScene,
  themePacks,
  sampleLayout,
  sampleZones,
  ACCESSORY_KEYS,
  SPECIES,
  type AccessoryKey,
  type AvatarConfig,
  type AvatarInstance,
  type IslandSceneHandle,
  type SceneMode,
  type Species,
  type ThemePackKey,
  type ZoneKey,
} from "../src";
// TEMP (scale-tweaker): baseline scales for the live size panel. Remove this
// import together with the ScaleTweaker panel once final scales are baked.
import { LANDMARK_ART, BOAT_ART } from "../src/render/zones";

/**
 * Demo harness. The island is full-screen (the child-facing product view).
 * All developer controls live behind a single floating button so they never
 * intrude on the scene — open it to drive theme / avatar / toggles for review.
 */
export function DemoApp() {
  const [open, setOpen] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemePackKey>("sprout");
  const [mode, setMode] = useState<SceneMode>("studio");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hideTextLabels, setHideTextLabels] = useState(false);
  const [lockLighthouse, setLockLighthouse] = useState(false);
  const [currentZone, setCurrentZone] = useState<ZoneKey | null>(null);

  const [avatarCfg, setAvatarCfg] = useState<AvatarConfig>({
    species: "bunny",
    bodyColor: "#f3c1d6",
    accessoryKey: "scarf",
    displayColor: "#c47b9a",
  });

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
      <IslandScene
        key={reducedMotion ? "rm" : "full"}
        ref={sceneRef}
        themePack={themePack}
        zones={zones}
        layout={sampleLayout}
        avatars={avatars}
        mode={mode}
        currentZone={currentZone}
        audioEnabled={audioEnabled}
        reducedMotion={reducedMotion}
        hideTextLabels={hideTextLabels}
        onReady={() => append("onReady")}
        onLoadProgress={(p) => append(`onLoadProgress(${p.toFixed(2)})`)}
        onZoneTap={(z: ZoneKey) => { append(`onZoneTap(${z}) → enter`); setCurrentZone(z); }}
        onZoneExit={() => { append("onZoneExit → world"); setCurrentZone(null); }}
        onActivityEnter={(z: ZoneKey) => append(`onActivityEnter(${z})`)}
        onObjectInteract={(id) => append(`onObjectInteract(${id})`)}
        onAvatarMove={(id, p) => append(`onAvatarMove(${id}, ${p.x},${p.y})`)}
        onError={(e) => append(`onError: ${e.message}`)}
      />

      {/* Floating dev-tools toggle — the only chrome over the scene. */}
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

      {/* TEMP: live landmark/boat scale tweaker — REMOVE once scales are baked. */}
      <ScaleTweaker sceneRef={sceneRef} />

      {/* Minimal always-on hint for first-time reviewers. */}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TEMP — Live scale tweaker. Throwaway dev panel: drag each control to resize a
// landmark (or the boat) in real time, base-pinned, then hit "Copy values" and
// paste the numbers back so they can be baked into LANDMARK_ART / BOAT_ART.
// DELETE this whole block (and its <ScaleTweaker/> render + the LANDMARK_ART/
// BOAT_ART import) once the final scales are locked in.
// ─────────────────────────────────────────────────────────────────────────
const SHOW_SCALE_TWEAKER = true;

type TweakId = ZoneKey | "boat";
const TWEAK_ITEMS: { id: TweakId; label: string; base: number }[] = [
  { id: "lighthouse_point", label: "lighthouse", base: LANDMARK_ART.lighthouse_point.scale },
  { id: "treehouse_hideaway", label: "treehouse", base: LANDMARK_ART.treehouse_hideaway.scale },
  { id: "art_hut", label: "art-hut", base: LANDMARK_ART.art_hut.scale },
  { id: "arcade_cove", label: "arcade", base: LANDMARK_ART.arcade_cove.scale },
  { id: "campfire_circle", label: "campfire", base: LANDMARK_ART.campfire_circle.scale },
  { id: "calm_beach", label: "calm-beach", base: LANDMARK_ART.calm_beach.scale },
  { id: "welcome_dock", label: "welcome-dock", base: LANDMARK_ART.welcome_dock.scale },
  { id: "boat", label: "boat", base: BOAT_ART.scale },
];

function ScaleTweaker({ sceneRef }: { sceneRef: React.RefObject<IslandSceneHandle | null> }) {
  const [open, setOpen] = useState(true);
  const [scales, setScales] = useState<Record<string, number>>(() =>
    Object.fromEntries(TWEAK_ITEMS.map((it) => [it.id, it.base])),
  );
  const [copied, setCopied] = useState(false);

  if (!SHOW_SCALE_TWEAKER) return null;

  const apply = (id: TweakId, v: number) => {
    setScales((s) => ({ ...s, [id]: v }));
    if (id === "boat") sceneRef.current?.devSetBoatScale?.(v);
    else sceneRef.current?.devSetLandmarkScale?.(id as ZoneKey, v);
  };

  const copy = () => {
    const text = TWEAK_ITEMS.map((it) => `${it.label} (${it.id}): ${scales[it.id].toFixed(4)}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 250,
        padding: 12,
        borderRadius: 12,
        background: "rgba(255,247,235,0.96)",
        border: "2px dashed #c0392b",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        fontFamily: "system-ui, sans-serif",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 12, color: "#c0392b" }}>TEMP · scale tweaker</strong>
        <button onClick={() => setOpen((o) => !o)} style={{ ...btn, padding: "2px 8px" }}>
          {open ? "hide" : "show"}
        </button>
      </div>
      {open && (
        <>
          <p style={{ margin: "6px 0 10px", fontSize: 10, color: "#8a6d4f" }}>
            Drag to resize live (base-pinned). Throwaway — will be removed.
          </p>
          {TWEAK_ITEMS.map((it) => (
            <label key={it.id} style={{ display: "block", fontSize: 11, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{it.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#6b5a44" }}>
                  {scales[it.id].toFixed(4)}
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={it.id === "boat" ? 0.6 : 1.5}
                step={0.005}
                value={scales[it.id]}
                onChange={(e) => apply(it.id, parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </label>
          ))}
          <button onClick={copy} style={{ ...btn, width: "100%", marginTop: 4 }}>
            {copied ? "✓ Copied!" : "Copy current values"}
          </button>
        </>
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

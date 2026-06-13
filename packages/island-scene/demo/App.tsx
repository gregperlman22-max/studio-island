import { useMemo, useRef, useState } from "react";
import {
  IslandScene,
  themePacks,
  sampleLayout,
  sampleZones,
  ACCESSORY_KEYS,
  BODY_TONES,
  HAIR_STYLES,
  OUTFIT_KEYS,
  type AccessoryKey,
  type AvatarConfig,
  type AvatarInstance,
  type BodyTone,
  type HairStyle,
  type IslandSceneHandle,
  type OutfitKey,
  type SceneMode,
  type ThemePackKey,
  type ZoneKey,
} from "../src";

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
  const [lockHollow, setLockHollow] = useState(true);

  const [avatarCfg, setAvatarCfg] = useState<AvatarConfig>({
    bodyTone: "warm-mid",
    hairStyle: "tuft",
    hairColor: "#5b3a1f",
    outfitKey: "overalls",
    accessoryKey: "satchel",
    displayColor: "#c47b58",
  });

  const [log, setLog] = useState<string[]>([]);
  const sceneRef = useRef<IslandSceneHandle>(null);

  const themePack = themePacks[themeKey];

  const zones = useMemo(
    () =>
      sampleZones.map((z) => ({
        ...z,
        skinName: themePack.zoneSkins[z.key]?.skinName ?? z.skinName,
        unlocked: z.key === "worry_hollow" ? !lockHollow : z.unlocked,
      })),
    [themePack, lockHollow],
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
        audioEnabled={audioEnabled}
        reducedMotion={reducedMotion}
        hideTextLabels={hideTextLabels}
        onReady={() => append("onReady")}
        onLoadProgress={(p) => append(`onLoadProgress(${p.toFixed(2)})`)}
        onZoneTap={(z: ZoneKey) => append(`onZoneTap(${z})`)}
        onObjectInteract={(id) => append(`onObjectInteract(${id})`)}
        onAvatarMove={(id, p) => append(`onAvatarMove(${id}, ${p.x},${p.y})`)}
        onError={(e) => append(`onError: ${e.message}`)}
      />

      {/* Floating dev-tools toggle — the only chrome over the scene. */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Developer controls"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: "none",
          background: "rgba(20,16,10,0.55)",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
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

          <Section title="Avatar">
            <Picker label="Body" value={avatarCfg.bodyTone} options={BODY_TONES} onChange={(v) => set("bodyTone", v as BodyTone)} />
            <Picker label="Hair" value={avatarCfg.hairStyle} options={HAIR_STYLES} onChange={(v) => set("hairStyle", v as HairStyle)} />
            <Picker label="Outfit" value={avatarCfg.outfitKey} options={OUTFIT_KEYS} onChange={(v) => set("outfitKey", v as OutfitKey)} />
            <Picker label="Accessory" value={avatarCfg.accessoryKey} options={ACCESSORY_KEYS} onChange={(v) => set("accessoryKey", v as AccessoryKey)} />
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <Swatch label="Hair color" value={avatarCfg.hairColor} onChange={(v) => set("hairColor", v)} />
              <Swatch label="Display color" value={avatarCfg.displayColor} onChange={(v) => set("displayColor", v)} />
            </div>
          </Section>

          <Section title="Toggles">
            <Toggle label="Audio enabled" checked={audioEnabled} onChange={setAudioEnabled} />
            <Toggle label="Reduced motion" checked={reducedMotion} onChange={setReducedMotion} />
            <Toggle label="Hide text labels" checked={hideTextLabels} onChange={setHideTextLabels} />
            <Toggle label="Lock Worry Hollow" checked={lockHollow} onChange={setLockHollow} />
          </Section>

          <Section title="Imperative handle">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => sceneRef.current?.walkLocalAvatarTo({ x: 33, y: 20 })} style={btn}>Walk → Garden</button>
              <button onClick={() => sceneRef.current?.walkLocalAvatarTo(sampleLayout.spawnPoint)} style={btn}>Walk → spawn</button>
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

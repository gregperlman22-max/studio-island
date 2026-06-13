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

export function DemoApp() {
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
    setLog((l) => [`${new Date().toLocaleTimeString()} · ${line}`, ...l].slice(0, 24));

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) =>
    setAvatarCfg((c) => ({ ...c, [k]: v }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "100vh" }}>
      <aside
        style={{
          padding: 16,
          borderRight: "1px solid #d8cfbe",
          background: "#fbf7ef",
          overflowY: "auto",
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 18 }}>island-scene</h1>
        <p style={{ fontSize: 12, color: "#6b5a44" }}>
          Milestone 3 · avatar + tap-to-move
        </p>
        <p style={{ fontSize: 12, color: "#3b2a1a", background: "#fff3dc", padding: "8px 10px", borderRadius: 8 }}>
          Tap the island to walk. Tap a zone to walk to its entrance, then it
          fires <code>onZoneTap</code>.
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
            <button onClick={() => sceneRef.current?.walkLocalAvatarTo({ x: 13, y: 5 })} style={btn}>Walk → (13,5)</button>
            <button onClick={() => sceneRef.current?.walkLocalAvatarTo(sampleLayout.spawnPoint)} style={btn}>Walk → spawn</button>
            <button onClick={() => sceneRef.current?.duck(true)} style={btn}>Duck</button>
            <button onClick={() => sceneRef.current?.resize()} style={btn}>Resize</button>
          </div>
        </Section>

        <Section title="Event log">
          <ol style={{ paddingLeft: 16, fontSize: 11, color: "#3b2a1a", margin: 0 }}>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </Section>
      </aside>

      <main style={{ position: "relative" }}>
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
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
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

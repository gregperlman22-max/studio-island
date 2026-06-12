import { useMemo, useRef, useState } from "react";
import {
  IslandScene,
  themePacks,
  sampleLayout,
  sampleZones,
  type AvatarInstance,
  type IslandSceneHandle,
  type SceneMode,
  type ThemePackKey,
  type ZoneKey,
} from "../src";

const baseAvatar: AvatarInstance = {
  id: "local",
  isLocal: true,
  position: sampleLayout.spawnPoint,
  label: "Maple Ranger",
  config: {
    bodyTone: "warm-mid",
    hairStyle: "tuft",
    hairColor: "#5b3a1f",
    outfitKey: "overalls",
    accessoryKey: "satchel",
    displayColor: "#c47b58",
  },
};

export function DemoApp() {
  const [themeKey, setThemeKey] = useState<ThemePackKey>("sprout");
  const [mode, setMode] = useState<SceneMode>("studio");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hideTextLabels, setHideTextLabels] = useState(false);
  const [lockHollow, setLockHollow] = useState(true);
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

  // Stable array identity so prop-diff effects don't rebuild every render.
  const avatars = useMemo(() => [baseAvatar], []);

  const append = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} · ${line}`, ...l].slice(0, 24));

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
          Milestone 2 · terrain + zones + theme swap
        </p>

        <Section title="Theme pack">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(themePacks) as ThemePackKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setThemeKey(k)}
                style={pill(themeKey === k)}
              >
                {themePacks[k].displayName}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#8a7a60", marginTop: 8 }}>
            Drift is a palette-only stub (no art this phase).
          </p>
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

        <Section title="Toggles">
          <Toggle label="Audio enabled" checked={audioEnabled} onChange={setAudioEnabled} />
          <Toggle label="Reduced motion" checked={reducedMotion} onChange={setReducedMotion} />
          <Toggle label="Hide text labels" checked={hideTextLabels} onChange={setHideTextLabels} />
          <Toggle label="Lock Worry Hollow" checked={lockHollow} onChange={setLockHollow} />
          <p style={{ fontSize: 11, color: "#8a7a60", marginTop: 4 }}>
            Reduced-motion toggle re-mounts the scene (read at init).
          </p>
        </Section>

        <Section title="Imperative handle">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => sceneRef.current?.duck(true)} style={btn}>Duck</button>
            <button onClick={() => sceneRef.current?.duck(false)} style={btn}>Restore</button>
            <button onClick={() => sceneRef.current?.resize()} style={btn}>Resize</button>
          </div>
          <p style={{ fontSize: 11, color: "#8a7a60", marginTop: 6 }}>
            Audio + tap-to-move arrive in later milestones.
          </p>
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
        {/* reducedMotion in the key so toggling it cleanly re-inits the scene */}
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
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
        {title}
      </label>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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

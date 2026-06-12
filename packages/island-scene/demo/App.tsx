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

const sampleAvatar: AvatarInstance = {
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
  const [log, setLog] = useState<string[]>([]);
  const sceneRef = useRef<IslandSceneHandle>(null);

  const themePack = themePacks[themeKey];
  const zones = useMemo(
    () =>
      sampleZones.map((z) => ({
        ...z,
        skinName: themePack.zoneSkins[z.key]?.skinName ?? z.skinName,
      })),
    [themePack],
  );

  const append = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} · ${line}`, ...l].slice(0, 20));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh" }}>
      <aside
        style={{
          padding: 16,
          borderRight: "1px solid #d8cfbe",
          background: "#fbf7ef",
          overflowY: "auto",
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 18 }}>island-scene</h1>
        <p style={{ fontSize: 12, color: "#6b5a44" }}>Milestone 1 · demo harness</p>

        <section style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Theme pack</label>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {(Object.keys(themePacks) as ThemePackKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setThemeKey(k)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: themeKey === k ? "2px solid #3b2a1a" : "1px solid #c6b89a",
                  background: themeKey === k ? "#fff" : "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {themePacks[k].displayName}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Mode</label>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {(["studio", "play", "session"] as SceneMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: mode === m ? "2px solid #3b2a1a" : "1px solid #c6b89a",
                  background: mode === m ? "#fff" : "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
            />{" "}
            Audio enabled
          </label>
        </section>

        <section style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Imperative handle</label>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={() => sceneRef.current?.duck(true)}  style={btn}>Duck</button>
            <button onClick={() => sceneRef.current?.duck(false)} style={btn}>Restore</button>
            <button
              onClick={() => sceneRef.current?.walkLocalAvatarTo({ x: 12, y: 4 })}
              style={btn}
            >
              Walk to (12,4)
            </button>
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Event log</label>
          <ol style={{ paddingLeft: 16, fontSize: 11, color: "#3b2a1a" }}>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </section>
      </aside>

      <main style={{ position: "relative" }}>
        <IslandScene
          ref={sceneRef}
          themePack={themePack}
          zones={zones}
          layout={sampleLayout}
          avatars={[sampleAvatar]}
          mode={mode}
          audioEnabled={audioEnabled}
          onReady={() => append("onReady")}
          onZoneTap={(z: ZoneKey) => append(`onZoneTap(${z})`)}
          onObjectInteract={(id) => append(`onObjectInteract(${id})`)}
          onAvatarMove={(id, p) => append(`onAvatarMove(${id}, ${p.x},${p.y})`)}
          onLoadProgress={(p) => append(`onLoadProgress(${p.toFixed(2)})`)}
          onError={(e) => append(`onError: ${e.message}`)}
        />
      </main>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #c6b89a",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

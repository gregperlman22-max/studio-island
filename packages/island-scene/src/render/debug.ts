/**
 * Dev-only diagnostics. `import.meta.env.DEV` is statically replaced at build
 * time, so production bundles compile these calls down to a no-op — the
 * child-facing console stays silent while the dev harness keeps its full
 * wiring trace (transitions, guide opens, idle-anim checks).
 */
export const debugLog: (...args: unknown[]) => void = import.meta.env.DEV
  ? // eslint-disable-next-line no-console
    console.info.bind(console)
  : () => {};

import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Engage Island — Therapist-directed therapeutic islands" },
      {
        name: "description",
        content:
          "A clinician's Studio for designing safe, engaging therapeutic island experiences for child clients.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <IslandMark />
          <span className="font-display text-lg font-semibold tracking-tight">Engage Island</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            to="/auth"
            className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-20">
        <section className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-foreground">
              For clinicians
            </p>
            <h1 className="font-display text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
              A calm, professional Studio for therapeutic islands.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Design a private island world, curate the therapeutic activities you trust, and
              prepare it for the children you work with — without ever holding identifying
              information.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Get started
              </Link>
              <Link
                to="/auth"
                className="rounded-lg border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
              >
                I already have an account
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No client names, emails, or dates of birth — ever. Clients are represented only by an
              opaque code.
            </p>
          </div>
          <div className="relative">
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm">
              <IslandIllustration />
            </div>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Therapist-directed",
              body: "You choose the theme, zones, and activities. The product never pushes content to a child without you.",
            },
            {
              title: "No identifiers",
              body: "Residents are opaque codes with only an age band and curated interests. No free text, anywhere.",
            },
            {
              title: "Built for practice",
              body: "Designed with clinicians at Croton Children and Family Counseling.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function IslandMark() {
  return (
    <div
      className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 18c3-4 6-4 9-4s6 0 9 4" strokeLinecap="round" />
        <path d="M12 14V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function IslandIllustration() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      <defs>
        <radialGradient id="sky" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="oklch(0.95 0.03 75)" />
          <stop offset="100%" stopColor="oklch(0.88 0.04 60)" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.05 200)" />
          <stop offset="100%" stopColor="oklch(0.6 0.08 220)" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#sky)" />
      <circle cx="320" cy="80" r="40" fill="oklch(0.93 0.08 80)" opacity="0.9" />
      <ellipse cx="200" cy="320" rx="170" ry="60" fill="url(#sea)" />
      <ellipse cx="200" cy="290" rx="130" ry="40" fill="oklch(0.85 0.05 80)" />
      <ellipse cx="200" cy="280" rx="110" ry="30" fill="oklch(0.75 0.08 95)" />
      <path d="M140 270 Q170 200 190 270 Z" fill="oklch(0.55 0.1 145)" />
      <path d="M200 270 Q230 180 260 270 Z" fill="oklch(0.5 0.1 150)" />
      <rect x="180" y="240" width="8" height="20" fill="oklch(0.4 0.05 50)" />
      <rect x="240" y="245" width="6" height="18" fill="oklch(0.4 0.05 50)" />
      <circle cx="100" cy="120" r="14" fill="oklch(0.92 0.02 80)" opacity="0.7" />
      <circle cx="120" cy="110" r="20" fill="oklch(0.94 0.02 80)" opacity="0.7" />
    </svg>
  );
}

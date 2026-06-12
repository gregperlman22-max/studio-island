import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/studio/")({
  head: () => ({ meta: [{ title: "Studio — Engage Island" }] }),
  component: StudioHome,
});

function StudioHome() {
  const { data: profile } = useProfile();

  const { data: island } = useQuery({
    queryKey: ["my-island", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("islands")
        .select("id, name, theme_pack_id, enabled_activity_ids, created_at")
        .eq("owner_profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const greeting = greet(profile?.full_name ?? "there");

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Studio
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
          {greeting}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Design a private island for your clients. Choose a theme, curate the activities you
          trust, and shape the avatar that greets them.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card
          title="Your island"
          value={island ? island.name : "Not created yet"}
          hint={island ? "Open Island Studio to keep shaping it." : "Start with a theme."}
        />
        <Card
          title="Active activities"
          value={String(island?.enabled_activity_ids?.length ?? 0)}
          hint="Toggle activities per zone in Island Studio."
        />
        <Card
          title="Practice role"
          value={profile?.role === "admin" ? "Admin + Therapist" : "Therapist"}
          hint={profile?.approved ? "Approved" : "Pending approval"}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-8">
        {!island ? (
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Create your island</h2>
              <p className="mt-1 max-w-xl text-muted-foreground">
                You haven't created your island yet. Open the Island Studio to choose a theme and
                set up your six zones.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/studio/island">Open Island Studio</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Keep going</h2>
              <p className="mt-1 max-w-xl text-muted-foreground">
                Your island is set up. Continue tuning zones, activities, and your avatar.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/studio/activities">Browse activities</Link>
              </Button>
              <Button asChild>
                <Link to="/studio/island">Open Island Studio</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function greet(name: string) {
  const hour = new Date().getHours();
  const tod = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${tod}, ${name.split(" ")[0]}.`;
}

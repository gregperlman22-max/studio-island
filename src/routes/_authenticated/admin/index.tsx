import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Engage Island" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { data: profile, isLoading } = useProfile();

  const therapists = useQuery({
    queryKey: ["admin-therapists", profile?.practice_id],
    enabled: !!profile && profile.role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, approved, created_at")
        .eq("practice_id", profile!.practice_id!);
      if (error) throw error;
      return data;
    },
  });

  const islandCount = useQuery({
    queryKey: ["admin-islands", profile?.practice_id],
    enabled: !!profile && profile.role === "admin",
    queryFn: async () => {
      const { count, error } = await supabase
        .from("islands")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const events = useQuery({
    queryKey: ["admin-events", profile?.practice_id],
    enabled: !!profile && profile.role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_log")
        .select("id, event_type, zone_key, payload, occurred_at, actor_id, actor_type")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!profile || profile.role !== "admin") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-muted-foreground">Only practice admins can view this page.</p>
        <Link to="/studio" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Practice overview</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Therapists" value={therapists.data?.length ?? 0} />
        <Stat label="Islands created" value={islandCount.data ?? 0} />
        <Stat label="Recent events" value={events.data?.length ?? 0} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-xl font-semibold">Therapists</h2>
        <div className="mt-4 divide-y divide-border">
          {therapists.data?.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{t.full_name ?? "—"}</p>
                <p className="text-xs capitalize text-muted-foreground">{t.role}</p>
              </div>
              <Badge variant={t.approved ? "default" : "secondary"}>
                {t.approved ? "Approved" : "Pending"}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-xl font-semibold">Recent activity</h2>
        <div className="mt-4 space-y-3">
          {events.data?.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No events yet.</p>
          )}
          {events.data?.map((e) => (
            <div key={e.id} className="flex items-start justify-between rounded-lg border border-border bg-background p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{e.event_type.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {e.actor_type}
                  {e.zone_key ? ` · ${e.zone_key}` : ""}
                </p>
              </div>
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}

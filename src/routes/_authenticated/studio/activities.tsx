import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/studio/activities")({
  head: () => ({ meta: [{ title: "Activity Library — Engage Island" }] }),
  component: ActivityLibrary,
});

type Activity = {
  id: string;
  zone_id: string;
  title: string;
  description: string;
  therapeutic_targets: string[];
  modalities: string[];
  engagement_loop: string;
  age_bands: string[];
};

function ActivityLibrary() {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("all");
  const [age, setAge] = useState("all");

  const data = useQuery({
    queryKey: ["activity-library"],
    queryFn: async () => {
      const [acts, zones] = await Promise.all([
        supabase.from("activities").select("*").order("title"),
        supabase.from("zones").select("id, key, display_name"),
      ]);
      if (acts.error) throw acts.error;
      if (zones.error) throw zones.error;
      return { activities: acts.data as Activity[], zones: zones.data };
    },
  });

  const targets = useMemo(
    () => Array.from(new Set(data.data?.activities.flatMap((a) => a.therapeutic_targets) ?? [])).sort(),
    [data.data],
  );

  const filtered = (data.data?.activities ?? []).filter(
    (a) =>
      (q === "" || a.title.toLowerCase().includes(q.toLowerCase()) || a.description.toLowerCase().includes(q.toLowerCase())) &&
      (target === "all" || a.therapeutic_targets.includes(target)) &&
      (age === "all" || a.age_bands.includes(age)),
  );

  const zoneName = (zoneId: string) => data.data?.zones.find((z) => z.id === zoneId)?.display_name ?? "";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Library</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Activity Library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Browse all available therapeutic activities. To enable them on your island, head to Island
          Studio.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs">Search</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activities…" />
        </div>
        <div className="w-48">
          <Label className="text-xs">Therapeutic target</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {targets.map((t) => <SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Age band</Label>
          <Select value={age} onValueChange={setAge}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="sprout">Sprout (5–8)</SelectItem>
              <SelectItem value="explorer">Explorer (9–12)</SelectItem>
              <SelectItem value="drift">Drift (13+)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((a) => (
          <article key={a.id} className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {zoneName(a.zone_id)}
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold">{a.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.therapeutic_targets.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t.replaceAll("_", " ")}</Badge>
              ))}
              {a.modalities.map((m) => (
                <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
              ))}
              <Badge className="text-xs">{a.engagement_loop}</Badge>
              {a.age_bands.map((b) => (
                <Badge key={b} variant="outline" className="text-xs capitalize">{b}</Badge>
              ))}
            </div>
          </article>
        ))}
        {filtered.length === 0 && !data.isLoading && (
          <p className="text-sm italic text-muted-foreground">No activities match these filters.</p>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, logEvent } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/studio/island")({
  head: () => ({ meta: [{ title: "Island Studio — Engage Island" }] }),
  component: IslandStudio,
});

type ThemePack = {
  id: string;
  key: string;
  display_name: string;
  age_band_label: string;
  description: string;
  palette: { primary?: string; secondary?: string; accent?: string; background?: string; ink?: string };
  is_available: boolean;
  companion_register: { tone?: string };
};
type Zone = { id: string; key: string; display_name: string; description: string; sort_order: number };
type ZoneSkin = { id: string; zone_id: string; theme_pack_id: string; skin_name: string; skin_description: string };
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
type Island = {
  id: string;
  owner_profile_id: string;
  name: string;
  theme_pack_id: string | null;
  enabled_activity_ids: string[];
  avatar_config: { title?: string; nature?: string; color?: string } | null;
};

const AVATAR_TITLES = ["Captain", "Doctor", "Ranger", "Scout", "Keeper", "Navigator"];
const AVATAR_NATURES = ["Maple", "River", "Juniper", "Heron", "Spruce", "Meadow"];
const AVATAR_COLORS = ["#c47b58", "#6d8e7a", "#e8c468", "#7c8aa6", "#bfa5c9", "#9cc7b3"];

function IslandStudio() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  const refData = useQuery({
    queryKey: ["studio-ref"],
    queryFn: async () => {
      const [packs, zones, skins, activities] = await Promise.all([
        supabase.from("theme_packs").select("*").order("display_name"),
        supabase.from("zones").select("*").order("sort_order"),
        supabase.from("zone_skins").select("*"),
        supabase.from("activities").select("*").eq("is_active", true).order("title"),
      ]);
      if (packs.error) throw packs.error;
      if (zones.error) throw zones.error;
      if (skins.error) throw skins.error;
      if (activities.error) throw activities.error;
      return {
        packs: packs.data as ThemePack[],
        zones: zones.data as Zone[],
        skins: skins.data as ZoneSkin[],
        activities: activities.data as Activity[],
      };
    },
  });

  const islandQ = useQuery({
    queryKey: ["my-island", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("islands")
        .select("*")
        .eq("owner_profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Island | null;
    },
  });

  const createIsland = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("No profile");
      const packs = refData.data?.packs ?? [];
      const defaultPack = packs.find((p) => p.key === "sprout") ?? packs[0];
      const { data, error } = await supabase
        .from("islands")
        .insert({
          owner_profile_id: profile.id,
          name: `${(profile.full_name ?? "My").split(" ")[0]}'s Island`,
          theme_pack_id: defaultPack?.id ?? null,
          enabled_activity_ids: [],
          avatar_config: { title: "Ranger", nature: "Maple", color: AVATAR_COLORS[0] },
        })
        .select("*")
        .single();
      if (error) throw error;
      await logEvent({
        practice_id: profile.practice_id!,
        event_type: "island_created",
        payload: { island_id: data.id },
      });
      return data as Island;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-island"] });
      toast.success("Island created.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (refData.isLoading || islandQ.isLoading) {
    return <p className="text-muted-foreground">Loading Studio…</p>;
  }

  const ref = refData.data!;
  const island = islandQ.data;

  if (!island) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center">
        <h1 className="font-display text-3xl font-semibold">Welcome to Island Studio</h1>
        <p className="mt-3 text-muted-foreground">
          Create your island to start shaping its theme, zones, activities, and avatar.
        </p>
        <Button
          size="lg"
          className="mt-6"
          onClick={() => createIsland.mutate()}
          disabled={createIsland.isPending}
        >
          {createIsland.isPending ? "Creating…" : "Create my island"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Island Studio
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">
          {island.name}
        </h1>
      </header>

      <ThemeSection island={island} packs={ref.packs} practiceId={profile!.practice_id!} />
      <ZoneMapSection island={island} zones={ref.zones} skins={ref.skins} packs={ref.packs} />
      <ActivitiesSection
        island={island}
        zones={ref.zones}
        activities={ref.activities}
        practiceId={profile!.practice_id!}
      />
      <AvatarSection island={island} practiceId={profile!.practice_id!} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ThemeSection({
  island,
  packs,
  practiceId,
}: {
  island: Island;
  packs: ThemePack[];
  practiceId: string;
}) {
  const queryClient = useQueryClient();
  const setTheme = useMutation({
    mutationFn: async (pack: ThemePack) => {
      const { error } = await supabase
        .from("islands")
        .update({ theme_pack_id: pack.id })
        .eq("id", island.id);
      if (error) throw error;
      await logEvent({
        practice_id: practiceId,
        event_type: "theme_changed",
        payload: { island_id: island.id, theme_pack_key: pack.key },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-island"] });
      toast.success("Theme updated.");
    },
  });

  return (
    <Section title="Theme pack" description="Sets the visual register and tone across every zone.">
      <div className="grid gap-4 md:grid-cols-3">
        {packs.map((p) => {
          const selected = island.theme_pack_id === p.id;
          const disabled = !p.is_available;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || setTheme.isPending}
              onClick={() => setTheme.mutate(p)}
              className={cn(
                "group relative overflow-hidden rounded-xl border-2 p-5 text-left transition",
                selected
                  ? "border-primary bg-accent/40"
                  : "border-border bg-background hover:border-primary/40",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-xl font-semibold">{p.display_name}</h3>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {p.age_band_label}
                  </p>
                </div>
                {disabled && <Badge variant="secondary">Coming soon</Badge>}
                {selected && !disabled && <Badge>Selected</Badge>}
              </div>
              <div className="mt-4 flex gap-1.5">
                {Object.values(p.palette ?? {})
                  .filter(Boolean)
                  .slice(0, 5)
                  .map((c, i) => (
                    <span
                      key={i}
                      className="h-7 w-7 rounded-full border border-border"
                      style={{ backgroundColor: c as string }}
                    />
                  ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{p.description}</p>
              {p.companion_register?.tone && (
                <p className="mt-3 text-xs italic text-muted-foreground">
                  Companion register: {p.companion_register.tone}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function ZoneMapSection({
  island,
  zones,
  skins,
  packs,
}: {
  island: Island;
  zones: Zone[];
  skins: ZoneSkin[];
  packs: ThemePack[];
}) {
  const pack = packs.find((p) => p.id === island.theme_pack_id);
  const skinFor = (zoneId: string) =>
    skins.find((s) => s.zone_id === zoneId && s.theme_pack_id === island.theme_pack_id);

  const zoneColor = (idx: number) => {
    const colors = Object.values(pack?.palette ?? {}).filter(Boolean) as string[];
    return colors[idx % Math.max(colors.length, 1)] ?? "#c47b58";
  };

  return (
    <Section title="Zone map" description="A preview of your six zones with the selected theme's skins. Real 2.5D scene comes in a later phase.">
      <div className="grid gap-4 md:grid-cols-3">
        {zones.map((z, idx) => {
          const skin = skinFor(z.id);
          return (
            <div
              key={z.id}
              className="overflow-hidden rounded-xl border border-border bg-background"
            >
              <div
                className="relative h-28"
                style={{
                  background: `linear-gradient(135deg, ${zoneColor(idx)} 0%, ${zoneColor(idx + 1)} 100%)`,
                }}
              >
                <ZoneGlyph zoneKey={z.key} />
              </div>
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {z.display_name}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold">
                  {skin?.skin_name ?? "—"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {skin?.skin_description ?? z.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ZoneGlyph({ zoneKey }: { zoneKey: string }) {
  const glyph: Record<string, string> = {
    calm_cove: "M10 80 Q60 40 110 80 T210 80",
    build_beach: "M30 80 L70 50 L110 80 L150 50 L190 80",
    campfire: "M100 30 L110 80 L90 80 Z",
    worry_hollow: "M60 30 Q100 90 140 30",
    garden: "M40 80 Q70 30 100 80 Q130 30 160 80",
    field_guide_meadow: "M30 70 L60 50 L90 70 L120 50 L150 70 L180 50",
  };
  return (
    <svg viewBox="0 0 220 110" className="absolute inset-0 h-full w-full opacity-40">
      <path d={glyph[zoneKey] ?? ""} stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ActivitiesSection({
  island,
  zones,
  activities,
  practiceId,
}: {
  island: Island;
  zones: Zone[];
  activities: Activity[];
  practiceId: string;
}) {
  const queryClient = useQueryClient();
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [loopFilter, setLoopFilter] = useState<string>("all");

  const allTargets = useMemo(
    () => Array.from(new Set(activities.flatMap((a) => a.therapeutic_targets))).sort(),
    [activities],
  );
  const allLoops = useMemo(
    () => Array.from(new Set(activities.map((a) => a.engagement_loop))).sort(),
    [activities],
  );

  const toggleActivity = useMutation({
    mutationFn: async (input: { activity: Activity; enabled: boolean }) => {
      const current = island.enabled_activity_ids ?? [];
      const next = input.enabled
        ? Array.from(new Set([...current, input.activity.id]))
        : current.filter((id) => id !== input.activity.id);
      const { error } = await supabase
        .from("islands")
        .update({ enabled_activity_ids: next })
        .eq("id", island.id);
      if (error) throw error;
      const zoneKey = zones.find((z) => z.id === input.activity.zone_id)?.key ?? null;
      await logEvent({
        practice_id: practiceId,
        event_type: input.enabled ? "activity_enabled" : "activity_disabled",
        zone_key: zoneKey,
        activity_id: input.activity.id,
        payload: { island_id: island.id },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-island"] }),
  });

  const isEnabled = (id: string) => island.enabled_activity_ids?.includes(id) ?? false;
  const matches = (a: Activity) =>
    (targetFilter === "all" || a.therapeutic_targets.includes(targetFilter)) &&
    (loopFilter === "all" || a.engagement_loop === loopFilter);

  return (
    <Section title="Activities" description="Toggle the activities you want available in each zone of your island.">
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="w-48">
          <Label className="text-xs">Filter by target</Label>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {allTargets.map((t) => (
                <SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label className="text-xs">Filter by loop</Label>
          <Select value={loopFilter} onValueChange={setLoopFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All loops</SelectItem>
              {allLoops.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-8">
        {zones.map((zone) => {
          const zoneActs = activities.filter((a) => a.zone_id === zone.id && matches(a));
          return (
            <div key={zone.id}>
              <h3 className="font-display text-lg font-semibold">{zone.display_name}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{zone.description}</p>
              {zoneActs.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">No activities match filters.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {zoneActs.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold">{a.title}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
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
                      </div>
                      <Switch
                        checked={isEnabled(a.id)}
                        onCheckedChange={(v) => toggleActivity.mutate({ activity: a, enabled: v })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AvatarSection({ island, practiceId }: { island: Island; practiceId: string }) {
  const queryClient = useQueryClient();
  const current = island.avatar_config ?? {};
  const [title, setTitle] = useState(current.title ?? "Ranger");
  const [nature, setNature] = useState(current.nature ?? "Maple");
  const [color, setColor] = useState(current.color ?? AVATAR_COLORS[0]);
  const [name, setName] = useState(island.name);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("islands")
        .update({ name, avatar_config: { title, nature, color } })
        .eq("id", island.id);
      if (error) throw error;
      await logEvent({
        practice_id: practiceId,
        event_type: "avatar_updated",
        payload: { island_id: island.id, title, nature, color },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-island"] });
      toast.success("Saved.");
    },
  });

  return (
    <Section title="Avatar" description="The placeholder avatar your future clients will see in the Studio's zone map.">
      <div className="grid gap-6 md:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div
            className="grid h-32 w-32 place-items-center rounded-full text-3xl font-bold text-white shadow-inner"
            style={{ backgroundColor: color }}
          >
            {title[0]}{nature[0]}
          </div>
          <p className="text-sm font-medium">{title} {nature}</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Island name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Select value={title} onValueChange={setTitle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVATAR_TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nature word</Label>
              <Select value={nature} onValueChange={setNature}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVATAR_NATURES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Pick ${c}`}
                  className={cn(
                    "h-9 w-9 rounded-full border-2 transition",
                    color === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save avatar"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

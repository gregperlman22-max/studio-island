import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, logEvent } from "@/lib/profile";
import { FREQUENCIES, type FrequencyKey, detectLikelyName } from "@/lib/residents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Copy, AlertTriangle, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/residents/$id")({
  head: () => ({ meta: [{ title: "Resident — Engage Island" }] }),
  component: ResidentDetail,
});

type Resident = {
  id: string;
  resident_code: string;
  age_band: string;
  status: "draft" | "active" | "archived";
  interests: string[];
  created_at: string;
  practice_id: string;
};

function ResidentDetail() {
  const { id } = Route.useParams();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const residentQ = useQuery({
    queryKey: ["resident", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("residents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Resident | null;
    },
  });

  const interestsQ = useQuery({
    queryKey: ["interest-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interest_options")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const islandQ = useQuery({
    queryKey: ["my-island", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("islands")
        .select("id, enabled_activity_ids")
        .eq("owner_profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const activitiesQ = useQuery({
    queryKey: ["activities-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, title, description, zone_id, therapeutic_targets, modalities, engagement_loop, age_bands");
      if (error) throw error;
      return data;
    },
  });

  const zonesQ = useQuery({
    queryKey: ["zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("zones").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const assignmentsQ = useQuery({
    queryKey: ["assignments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, activity_id, frequency, frequency_note, status, created_at")
        .eq("resident_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: Resident["status"]) => {
      const { error } = await supabase.from("residents").update({ status }).eq("id", id);
      if (error) throw error;
      await logEvent({
        practice_id: residentQ.data!.practice_id,
        event_type: "resident_status_changed",
        payload: { resident_id: id, resident_code: residentQ.data!.resident_code, status },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resident", id] });
      toast.success("Status updated.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateInterests = useMutation({
    mutationFn: async (next: string[]) => {
      const { error } = await supabase.from("residents").update({ interests: next }).eq("id", id);
      if (error) throw error;
      await logEvent({
        practice_id: residentQ.data!.practice_id,
        event_type: "resident_interests_updated",
        payload: { resident_id: id, resident_code: residentQ.data!.resident_code, interests: next },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resident", id] });
      toast.success("Interests updated.");
    },
  });

  const copyCode = async () => {
    if (!residentQ.data) return;
    await navigator.clipboard.writeText(residentQ.data.resident_code);
    toast.success("Code copied.");
  };

  if (residentQ.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!residentQ.data)
    return (
      <div className="rounded-xl border border-border bg-card p-8">
        <p>Resident not found.</p>
        <Link to="/studio/residents" className="mt-2 inline-block text-primary underline">
          Back to residents
        </Link>
      </div>
    );

  const r = residentQ.data;
  const interestByKey = new Map((interestsQ.data ?? []).map((i) => [i.key, i]));
  const enabledIds = new Set(islandQ.data?.enabled_activity_ids ?? []);
  const islandActivities = (activitiesQ.data ?? []).filter(
    (a) => enabledIds.has(a.id) && a.age_bands.includes(r.age_band),
  );

  return (
    <div className="space-y-6">
      <Link
        to="/studio/residents"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to residents
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resident code
            </p>
            <div className="mt-1 flex items-center gap-3">
              <p className="font-mono text-3xl font-bold tracking-tight">{r.resident_code}</p>
              <Button size="sm" variant="outline" onClick={copyCode}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="capitalize">{r.age_band}</Badge>
              <Badge
                variant={r.status === "active" ? "default" : r.status === "draft" ? "secondary" : "outline"}
                className="capitalize"
              >
                {r.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                · enrolled {format(new Date(r.created_at), "MMM d, yyyy")}
              </span>
            </div>
          </div>
          <StatusControls
            current={r.status}
            onChange={(s) => setStatus.mutate(s)}
            pending={setStatus.isPending}
          />
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Interests</h2>
        <p className="text-sm text-muted-foreground">Tap to toggle. Max 5.</p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {(interestsQ.data ?? []).map((opt) => {
            const sel = r.interests.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                disabled={updateInterests.isPending || (!sel && r.interests.length >= 5)}
                onClick={() => {
                  const next = sel
                    ? r.interests.filter((k) => k !== opt.key)
                    : [...r.interests, opt.key];
                  updateInterests.mutate(next);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition",
                  sel ? "border-primary bg-accent/40" : "border-border hover:border-primary/40",
                  !sel && r.interests.length >= 5 && "opacity-40",
                )}
              >
                <span className="text-xl">{opt.emoji_or_icon_key}</span>
                <span className="text-[10px] font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <AssignmentsPanel
        resident={r}
        islandActivities={islandActivities}
        zones={zonesQ.data ?? []}
        assignments={assignmentsQ.data ?? []}
        interestByKey={interestByKey}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["assignments", id] });
          qc.invalidateQueries({ queryKey: ["assignment-counts"] });
        }}
        practiceId={r.practice_id}
        islandReady={!!islandQ.data}
      />
    </div>
  );
}

function StatusControls({
  current,
  onChange,
  pending,
}: {
  current: "draft" | "active" | "archived";
  onChange: (s: "draft" | "active" | "archived") => void;
  pending: boolean;
}) {
  const [confirm, setConfirm] = useState<null | "active" | "archived" | "draft">(null);
  return (
    <div className="flex flex-wrap gap-2">
      {current !== "active" && (
        <Button size="sm" disabled={pending} onClick={() => setConfirm("active")}>
          Activate
        </Button>
      )}
      {current === "active" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm("draft")}>
          Move to draft
        </Button>
      )}
      {current !== "archived" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm("archived")}>
          Archive
        </Button>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change status?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "archived"
                ? "Archived residents are hidden from default lists."
                : `Resident will be marked ${confirm}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onChange(confirm);
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type Activity = {
  id: string;
  title: string;
  description: string;
  zone_id: string;
  therapeutic_targets: string[];
  modalities: string[];
  engagement_loop: string;
  age_bands: string[];
};

function AssignmentsPanel({
  resident,
  islandActivities,
  zones,
  assignments,
  onChanged,
  practiceId,
  islandReady,
}: {
  resident: Resident;
  islandActivities: Activity[];
  zones: { id: string; key: string; display_name: string }[];
  assignments: {
    id: string;
    activity_id: string;
    frequency: string;
    frequency_note: string | null;
    status: "assigned" | "completed" | "expired";
    created_at: string;
  }[];
  interestByKey: Map<string, any>;
  onChanged: () => void;
  practiceId: string;
  islandReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activityById = new Map(islandActivities.map((a) => [a.id, a]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: "completed" | "expired"; activity_id: string }) => {
      const { error } = await supabase
        .from("assignments")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
      const zoneKey = zoneById.get(activityById.get(input.activity_id)?.zone_id ?? "")?.key ?? null;
      await logEvent({
        practice_id: practiceId,
        event_type: input.status === "completed" ? "assignment_completed" : "assignment_expired",
        zone_key: zoneKey,
        activity_id: input.activity_id,
        payload: {
          assignment_id: input.id,
          resident_id: resident.id,
          resident_code: resident.resident_code,
        },
      });
    },
    onSuccess: () => {
      onChanged();
      toast.success("Updated.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Assignments</h2>
        <Button onClick={() => setOpen(true)} disabled={!islandReady}>
          Assign activity
        </Button>
      </div>
      {!islandReady && (
        <p className="mt-2 text-xs text-muted-foreground">
          Create your island in Island Studio before assigning activities.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {assignments.length === 0 && (
          <p className="text-sm italic text-muted-foreground">No assignments yet.</p>
        )}
        {assignments.map((a) => {
          const act = activityById.get(a.activity_id);
          const zone = act ? zoneById.get(act.zone_id) : null;
          return (
            <div
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{act?.title ?? "Unknown activity"}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {zone && <Badge variant="outline">{zone.display_name}</Badge>}
                  <Badge variant="secondary">{labelFreq(a.frequency)}</Badge>
                  <Badge
                    variant={a.status === "assigned" ? "default" : a.status === "completed" ? "outline" : "outline"}
                    className="capitalize"
                  >
                    {a.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {format(new Date(a.created_at), "MMM d")}
                  </span>
                </div>
                {a.frequency_note && (
                  <p className="mt-2 text-xs text-muted-foreground">{a.frequency_note}</p>
                )}
              </div>
              {a.status === "assigned" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateStatus.mutate({ id: a.id, status: "completed", activity_id: a.activity_id })
                    }
                  >
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateStatus.mutate({ id: a.id, status: "expired", activity_id: a.activity_id })
                    }
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AssignDialog
        open={open}
        onOpenChange={setOpen}
        resident={resident}
        islandActivities={islandActivities}
        zones={zones}
        practiceId={practiceId}
        onCreated={onChanged}
      />
    </section>
  );
}

function labelFreq(k: string) {
  return FREQUENCIES.find((f) => f.key === k)?.label ?? k;
}

function AssignDialog({
  open,
  onOpenChange,
  resident,
  islandActivities,
  zones,
  practiceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  resident: Resident;
  islandActivities: Activity[];
  zones: { id: string; key: string; display_name: string }[];
  practiceId: string;
  onCreated: () => void;
}) {
  const [activityId, setActivityId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<FrequencyKey>("weekly");
  const [note, setNote] = useState("");
  const [targetFilter, setTargetFilter] = useState<string>("all");

  const allTargets = useMemo(
    () => Array.from(new Set(islandActivities.flatMap((a) => a.therapeutic_targets))).sort(),
    [islandActivities],
  );

  const filtered = islandActivities.filter(
    (a) => targetFilter === "all" || a.therapeutic_targets.includes(targetFilter),
  );

  const grouped = zones
    .map((z) => ({ zone: z, items: filtered.filter((a) => a.zone_id === z.id) }))
    .filter((g) => g.items.length > 0);

  const likelyName = note ? detectLikelyName(note) : null;

  const create = useMutation({
    mutationFn: async () => {
      if (!activityId) throw new Error("Pick an activity");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("assignments")
        .insert({
          resident_id: resident.id,
          activity_id: activityId,
          assigned_by_profile_id: userData.user.id,
          frequency,
          frequency_note: note.trim() || null,
          status: "assigned",
        })
        .select("id")
        .single();
      if (error) throw error;
      const zoneKey =
        zones.find((z) => z.id === islandActivities.find((a) => a.id === activityId)?.zone_id)?.key ??
        null;
      await logEvent({
        practice_id: practiceId,
        event_type: "assignment_created",
        zone_key: zoneKey,
        activity_id: activityId,
        payload: {
          assignment_id: data.id,
          resident_id: resident.id,
          resident_code: resident.resident_code,
          frequency,
        },
      });
    },
    onSuccess: () => {
      toast.success("Activity assigned.");
      onCreated();
      onOpenChange(false);
      setActivityId(null);
      setNote("");
      setFrequency("weekly");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign activity</DialogTitle>
          <DialogDescription>
            Only activities enabled on your island for {resident.age_band} are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
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

          {grouped.length === 0 ? (
            <Alert>
              <AlertDescription>
                No matching activities are enabled on your island. Enable some in Island Studio
                first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ zone, items }) => (
                <div key={zone.id}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {zone.display_name}
                  </p>
                  <div className="space-y-1.5">
                    {items.map((a) => {
                      const sel = activityId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setActivityId(a.id)}
                          className={cn(
                            "w-full rounded-lg border-2 p-3 text-left transition",
                            sel ? "border-primary bg-accent/40" : "border-border hover:border-primary/40",
                          )}
                        >
                          <p className="font-medium">{a.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.therapeutic_targets.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t.replaceAll("_", " ")}
                              </Badge>
                            ))}
                            <Badge className="text-[10px]">{a.engagement_loop}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Note to self (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              Do not include client names or identifying details — refer to the resident by code.
            </p>
            {likelyName && (
              <Alert className="mt-2 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  "{likelyName}" looks like a name. Please remove identifying details before saving.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!activityId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

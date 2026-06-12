import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, logEvent } from "@/lib/profile";
import { AGE_BANDS, type AgeBandKey } from "@/lib/residents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Copy, RefreshCw, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/residents/new")({
  head: () => ({ meta: [{ title: "Enroll resident — Engage Island" }] }),
  component: NewResident,
});

function NewResident() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ageBand, setAgeBand] = useState<AgeBandKey | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [residentId, setResidentId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

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

  const create = useMutation({
    mutationFn: async () => {
      if (!profile || !ageBand) throw new Error("Missing data");
      const { data, error } = await supabase
        .from("residents")
        .insert({
          practice_id: profile.practice_id!,
          created_by_profile_id: profile.id,
          age_band: ageBand,
          interests,
          status: "draft",
        })
        .select("id, resident_code")
        .single();
      if (error) throw error;
      await logEvent({
        practice_id: profile.practice_id!,
        event_type: "resident_enrolled",
        payload: { resident_id: data.id, resident_code: data.resident_code, age_band: ageBand },
      });
      return data;
    },
    onSuccess: (data) => {
      setResidentId(data.id);
      setCode(data.resident_code);
      setStep(3);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const regen = useMutation({
    mutationFn: async () => {
      if (!residentId) throw new Error("No resident");
      const { data: nc, error: rpcErr } = await supabase.rpc("generate_resident_code");
      if (rpcErr) throw rpcErr;
      const { data, error } = await supabase
        .from("residents")
        .update({ resident_code: nc as unknown as string })
        .eq("id", residentId)
        .select("resident_code")
        .single();
      if (error) throw error;
      await logEvent({
        practice_id: profile!.practice_id!,
        event_type: "resident_code_regenerated",
        payload: { resident_id: residentId, resident_code: data.resident_code },
      });
      return data.resident_code;
    },
    onSuccess: (c) => setCode(c),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleInterest = (key: string) => {
    setInterests((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 5 ? prev : [...prev, key],
    );
  };

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Code copied.");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Studio · Step {step} of 3
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Enroll a resident
        </h1>
      </header>

      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <Lock className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Do not enter names, dates of birth, or other identifying details anywhere in this flow.
        </AlertDescription>
      </Alert>

      <div className="rounded-2xl border border-border bg-card p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold">Choose an age band</h2>
            <div className="grid gap-3">
              {AGE_BANDS.map((b) => {
                const selected = ageBand === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    disabled={!b.available}
                    onClick={() => setAgeBand(b.key)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border-2 p-4 text-left transition",
                      selected ? "border-primary bg-accent/40" : "border-border hover:border-primary/40",
                      !b.available && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div>
                      <p className="font-display text-lg font-semibold">{b.label}</p>
                      <p className="text-sm text-muted-foreground">{b.range}</p>
                    </div>
                    {!b.available && <Badge variant="secondary">Coming soon</Badge>}
                    {selected && <Check className="h-5 w-5 text-primary" />}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button disabled={!ageBand} onClick={() => setStep(2)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Pick up to 5 interests</h2>
              <p className="text-sm text-muted-foreground">
                Helps tune their island. Tap to select — no text input.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(interestsQ.data ?? []).map((opt) => {
                const sel = interests.includes(opt.key);
                const disabled = !sel && interests.length >= 5;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleInterest(opt.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition",
                      sel ? "border-primary bg-accent/40" : "border-border hover:border-primary/40",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className="text-2xl">{opt.emoji_or_icon_key}</span>
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{interests.length} / 5 selected</p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                disabled={interests.length === 0 || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creating…" : "Create resident"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && code && (
          <div className="space-y-5 text-center">
            <h2 className="font-display text-xl font-semibold">Resident code</h2>
            <p className="text-sm text-muted-foreground">
              Paste this code into the client's chart in your EHR now. This is the only link
              between this resident and your client, and it lives in your records, not here.
            </p>
            <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-accent/30 px-6 py-8">
              <p className="font-mono text-3xl font-bold tracking-tight">{code}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={copyCode}>
                <Copy className="mr-1.5 h-4 w-4" /> Copy code
              </Button>
              <Button variant="outline" onClick={() => regen.mutate()} disabled={regen.isPending}>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Regenerate
              </Button>
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={() =>
                  navigate({ to: "/studio/residents/$id", params: { id: residentId! } })
                }
              >
                Done — open resident
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

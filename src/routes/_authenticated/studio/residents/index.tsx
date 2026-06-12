import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Lock, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/residents/")({
  head: () => ({ meta: [{ title: "Residents — Engage Island" }] }),
  component: ResidentsPage,
});

type ResidentRow = {
  id: string;
  resident_code: string;
  age_band: string;
  status: "draft" | "active" | "archived";
  interests: string[];
  created_at: string;
};

function ResidentsPage() {
  const { data: profile } = useProfile();
  const [statusFilter, setStatusFilter] = useState<string>("active_or_draft");

  const residentsQ = useQuery({
    queryKey: ["residents", profile?.id, statusFilter],
    enabled: !!profile?.id,
    queryFn: async () => {
      let q = supabase
        .from("residents")
        .select("id, resident_code, age_band, status, interests, created_at")
        .eq("created_by_profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (statusFilter === "active_or_draft") {
        q = q.in("status", ["draft", "active"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter as "draft" | "active" | "archived");
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as ResidentRow[];
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

  const assignmentCounts = useQuery({
    queryKey: ["assignment-counts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("resident_id, status")
        .eq("assigned_by_profile_id", profile!.id);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.status === "assigned") {
          map.set(row.resident_id, (map.get(row.resident_id) ?? 0) + 1);
        }
      }
      return map;
    },
  });

  const interestByKey = new Map((interestsQ.data ?? []).map((i) => [i.key, i]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Studio
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Residents</h1>
        </div>
        <Button asChild>
          <Link to="/studio/residents/new">
            <Plus className="mr-1 h-4 w-4" /> Enroll resident
          </Link>
        </Button>
      </header>

      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <Lock className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Residents are identified only by code. Keep the code-to-client mapping in your EHR
          chart — never enter names here.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <div className="w-56">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active_or_draft">Active & draft</SelectItem>
              <SelectItem value="draft">Draft only</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {residentsQ.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : residentsQ.data && residentsQ.data.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {residentsQ.data.map((r) => {
            const active = assignmentCounts.data?.get(r.id) ?? 0;
            return (
              <Link
                key={r.id}
                to="/studio/residents/$id"
                params={{ id: r.id }}
                className="block rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-semibold tracking-tight">
                      {r.resident_code}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="capitalize">{r.age_band}</Badge>
                      <Badge
                        variant={r.status === "active" ? "default" : r.status === "draft" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {r.status}
                      </Badge>
                      <Badge variant="secondary">{active} active</Badge>
                    </div>
                  </div>
                  <p className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1 text-xl">
                  {r.interests.map((k) => (
                    <span key={k} title={interestByKey.get(k)?.label ?? k}>
                      {interestByKey.get(k)?.emoji_or_icon_key ?? "•"}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">No residents yet.</p>
          <Button asChild className="mt-4">
            <Link to="/studio/residents/new">Enroll your first resident</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

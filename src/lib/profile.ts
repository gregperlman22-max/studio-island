import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  role: "admin" | "therapist" | "parent" | "child";
  practice_id: string | null;
  approved: boolean;
};

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile | null> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, practice_id, approved")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export async function logEvent(input: {
  practice_id: string;
  event_type: string;
  zone_key?: string | null;
  activity_id?: string | null;
  payload?: Record<string, unknown>;
}) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from("event_log").insert({
    practice_id: input.practice_id,
    actor_type: "therapist",
    actor_id: userData.user.id,
    event_type: input.event_type,
    zone_key: input.zone_key ?? null,
    activity_id: input.activity_id ?? null,
    payload: (input.payload ?? {}) as never,
  });
}

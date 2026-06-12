export const AGE_BANDS = [
  { key: "sprout", label: "Sprout", range: "Ages 5–8", available: true },
  { key: "explorer", label: "Explorer", range: "Ages 9–12", available: true },
  { key: "drift", label: "Drift", range: "Ages 13+", available: false },
] as const;

export type AgeBandKey = (typeof AGE_BANDS)[number]["key"];

export const FREQUENCIES = [
  { key: "once", label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "2x_week", label: "2× / week" },
  { key: "3x_week", label: "3× / week" },
  { key: "weekly", label: "Weekly" },
  { key: "open", label: "Open / no schedule" },
] as const;

export type FrequencyKey = (typeof FREQUENCIES)[number]["key"];

const SAFE_CAPITALIZED_WORDS = new Set([
  "I","I'm","I've","I'll","I'd",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
  "January","February","March","April","May","June","July","August","September","October","November","December",
  "Sprout","Explorer","Drift",
  "Calm","Cove","Worry","Hollow","Build","Beach","Campfire","Garden","Field","Guide","Meadow",
  "EHR","CBT","DBT","ACT","ADHD","OCD","ASD","PTSD",
]);

export function detectLikelyName(text: string): string | null {
  const tokens = text.split(/\s+/);
  for (const raw of tokens) {
    const word = raw.replace(/[^\p{L}']/gu, "");
    if (word.length < 2) continue;
    if (!/^[A-Z][a-z]+$/.test(word)) continue;
    if (SAFE_CAPITALIZED_WORDS.has(word)) continue;
    // first word of a sentence is often capitalized too
    if (raw === tokens[0]) continue;
    return word;
  }
  return null;
}

export function describeEvent(eventType: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const code = (p.resident_code as string) ?? "";
  switch (eventType) {
    case "resident_enrolled":
      return `Therapist enrolled resident ${code}`;
    case "resident_status_changed":
      return `Resident ${code} status changed to ${p.status}`;
    case "resident_interests_updated":
      return `Updated interests for resident ${code}`;
    case "resident_code_regenerated":
      return `Regenerated code for resident ${code}`;
    case "assignment_created":
      return `Assigned activity to resident ${code}`;
    case "assignment_completed":
      return `Marked assignment complete for ${code}`;
    case "assignment_expired":
      return `Canceled assignment for ${code}`;
    case "island_created":
      return "Therapist created their island";
    case "theme_changed":
      return "Theme pack changed";
    case "activity_enabled":
      return "Activity enabled on island";
    case "activity_disabled":
      return "Activity disabled on island";
    case "avatar_updated":
      return "Avatar updated";
    default:
      return eventType.replaceAll("_", " ");
  }
}

# Engage Island — Phase 1 Build Plan

## Scope
Therapist-facing platform shell: auth, full database schema, Studio mode (island customization), Admin view. No client-facing experience, no game rendering, no AI.

## Step 1 — Enable Lovable Cloud
Provision Supabase (database + auth + storage).

## Step 2 — Design system
Warm, calm professional palette in `src/styles.css`:
- Background: soft warm off-white (oklch warm neutral)
- Foreground: deep warm charcoal
- Primary accent: a single warm terracotta/clay tone
- Muted/card surfaces: subtle warm beige
- Rounded radius ~0.75rem, generous spacing
- Inter or system sans for body, serif accent for headings (one warm sans pairing)

## Step 3 — Database migration (one migration, RLS-first)

Enums:
- `app_role`: admin, therapist, parent, child
- `resident_status`: draft, active, archived
- `assignment_status`: assigned, completed, expired
- `actor_type`: therapist, resident, system

Tables:
1. `practices` — id, name, created_at. Seed Croton.
2. `profiles` — id (auth user FK), full_name, role, practice_id, approved bool, created_at
3. `user_roles` — separate table per security rules (id, user_id, role, unique)
4. `theme_packs` — seed Sprout, Explorer, Drift (Drift unavailable)
5. `zones` — seed 6 zones
6. `zone_skins` — seed 18 (6 zones × 3 packs)
7. `activities` — seed ~10
8. `islands` — unique on owner_profile_id
9. `residents` — ONLY opaque fields (resident_code, age_band, interests[], status). No identifiers.
10. `assignments`
11. `event_log` — append-only (INSERT-only policies, no UPDATE/DELETE)

Helper functions:
- `has_role(uuid, app_role)` SECURITY DEFINER
- `get_user_practice_id(uuid)` SECURITY DEFINER
- `generate_resident_code()` returns text like "pebble-otter-7"
- Trigger on `auth.users` insert → creates profile; first user becomes admin + approved

RLS policies as specified (therapists scoped to own island/own-created residents within practice; admins scoped across practice; everyone reads reference tables; event_log insert-only for therapists, read for admins).

GRANTs to authenticated/service_role on every public table.

## Step 4 — Auth integration
- Browser supabase client (already provided by Cloud)
- `/auth` page: email/password login + signup
- `onAuthStateChange` wired in `__root.tsx`
- `_authenticated/route.tsx` managed gate (already exists from integration)

## Step 5 — Routing
- `/` landing page (public): hero, login CTA
- `/auth` login/signup
- `/_authenticated/studio` therapist+admin
- `/_authenticated/studio/island` island studio editor
- `/_authenticated/studio/activities` activity library
- `/_authenticated/admin` admin only (role check in route)

## Step 6 — Studio UI
- Dashboard: greet user, island status card, CTA
- Island Studio:
  - Theme pack selector (3 cards w/ palette swatches; Drift disabled)
  - Zone map (6 illustrated cards in a grid — pure CSS/SVG, no canvas)
  - Activity curation per zone with toggle switches + filter chips
  - Avatar editor: 2 dropdowns + color picker, stored in avatar_config
- Activity Library: filterable list

Each meaningful action calls a server fn that updates the island AND inserts into event_log.

## Step 7 — Admin UI
- Therapist list (count + approval)
- Island count
- Recent event_log feed (last 50)

## Step 8 — Server functions
- `getMyIsland`, `createIsland`, `updateIslandTheme`, `toggleActivity`, `updateAvatar`
- `listThemePacks`, `listZones`, `listActivities`, `listZoneSkins`
- `adminListTherapists`, `adminListRecentEvents`, `adminApproveTherapist`
- All use `requireSupabaseAuth`; admin fns check `has_role`

## Step 9 — Verification
1. Inspect residents table columns → confirm only opaque fields
2. Query pg_policies for event_log → confirm no UPDATE/DELETE policies
3. Create second therapist account → confirm RLS blocks reading first therapist's island

## Out of scope (not built)
Child/parent UI, AI companion, realtime, crisis detection, voice, notifications, scene rendering, resident enrollment UI.

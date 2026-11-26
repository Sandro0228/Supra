# Supra — path to a commercially ready product

This document is updated as work lands. Section 0 is the current status and the backlog; the rest is the original
plan, findings and risk register.

## 0. Status and what's next (2026-11-26)

### Done
- **Privacy and sharing (P0A):** server-made guest links, draft/publish/revoke/rotate, privacy presets, organiser preview, backoff, counts-only telemetry (006); Latin/Georgian name matching (007).
- **RSVP (008):** one link per household, answers flow into the plan.
- **Safety (P0B, P1D):** trash with 30-day restore (009); saving from two tabs never overwrites newer work (010); version history with restore points (013).
- **Plans and account (P0B):** free up to 40 guests, event pass 79 ₾, Pro 99 ₾/month, pricing page, launch passes (011); account page and privacy page (012).
- **Big weddings (P1B):** partial redraws, one Tab stop per table, table search with zoom.
- **Safer import (P1C):** preview, column mapping, duplicates, seats, Georgian CSV.
- **Redesign, direction A** ("a calm table, warm guests"), nine steps: shared theme, sentence-case labels, the guest's seat reveal, RSVP thank-you, landing, event cards with ⋯ menu, planner top bar, selection toolbar, pricing/account/privacy.
- **Signed-in home:** account menu behind an initials button; greeting, the next wedding and its next step; a framed space for the feast painting; a checklist with a progress ring and invitation replies on each card; recent replies and quick actions (copy link, place cards, invitations); a sample wedding to explore (A4).
- **Guest filters (C1):** without a seat, bride's/groom's side, group, allergies, combined with the guest search.

### Waiting on the owner
- `supportEmail` in `config.js` (how to buy a pass until online payment exists).
- pg_cron schedules for `supra_purge_trash()` and `supra_purge_rsvp_contacts()`.
- The feast painting: generate it from the prompt in `docs/ART.md`, save as `new-art/feast.png`.
- Who runs Supra and from where (privacy page, terms).
- Terms of service text.
- A TBC or Bank of Georgia merchant account with test credentials (bank checkout).

### Next, in small steps (one PR each)
Signed-in home (in order):
1. **Feast painting:** convert and add `art/feast.webp` once the owner has generated it.

Planner and pages:
- **B2** accessibility pass of account, pricing and privacy.
- **B3** phone planner priorities.
- **C2** list view.
- **C3** simpler drawings when zoomed far out.
- **C4** minimap.
- **C5** seating-rules list with "show me".
- **C6** select several guests at once.
- **D1** ESLint in the test run.
- **D2** reuse unchanged table drawings in big plans.

New features (owner's ideas, 2026-11-26; propose a PR split before starting):
- **F1 Guest photo wall (paid add-on):** during the wedding guests open their link, take photos with the phone camera, the photos go to the couple's album and guests can see it. Needs Supabase Pro (Storage; about 2 GB per wedding after shrinking photos on the phone), uploads allowed only through the guest link with a rate limit, the couple hides/deletes and downloads all, a keep-time rule, a new `entitlements` kind, privacy page and consent. About 6–8 PRs.
- **F2 Invitation card designer:** several designs, own text or suggested texts (fixed en/ka texts first, AI suggestions later), print/PDF, each household's RSVP QR on its card. Confirm who designs them (the couple, or guests too). About 4–6 PRs.

Needs owner input first:
- **E1** bank checkout.
- **E2** terms page.

## 1. Architecture findings

| Area | What exists today |
|---|---|
| Front end | Static site, no build step: `index.html` + `dash.js` (landing, sign-in, Your events, account); `app.html` + ES modules in `js/` (planner `/edit/:id`, guest page `/e/:token`, RSVP `/r/:token`); `pricing.html`, `privacy.html`. Plain ES2020, no framework, string-template rendering; shared state in `appState` (`js/core.js`). |
| Shared code | `theme.css` (design tokens), `i18n.js` (≈990 keys, EN/KA), `names.js` (gender guess from names), `brand.js/.css` (logo), `assets.js` + `img/*.webp` (drawings as cached files). |
| Hosting | Vercel static, `vercel.json` clean URLs + rewrites `/edit/*`, `/e/*`, `/r/*` → `/app`, `/account` → `/`. Auto-deploy from `main`. |
| Auth | Supabase Auth, email + password (email confirmation currently off), optional magic link. Session in supabase-js local storage. |
| Database | One table `public.events` (owner uuid, name, type, event_date, `slug` = guest-link token, `data` jsonb = whole plan, `guest_page` bool, lookup settings). RLS: owner-only select/insert/update/delete. |
| Server logic | Postgres functions only (no API server): guests call `public_plan`, `find_seat`, `rsvp_get`, `rsvp_answer`; owners use share, trash, restore-point and account functions. Migrations 002–013 are additive. |
| Saving | Whole-plan update debounced 1.5 s with a version precondition (010); draft copy in localStorage; version history (013). |
| Tests | `tests/sql` (Postgres 16 + Supabase stub; privacy and authorization, all migrations), `tests/e2e` (Python Playwright against a supabase-js stand-in; 166 tests in 27 files). No linter/typecheck/build yet (D1 proposes ESLint). |
| Design tokens | One shared `theme.css` (design direction A) with light/dark via `data-theme` + `prefers-color-scheme`; the event's own plan palettes in `PALETTES`. |

## 2. Risk register

| # | Risk | Likelihood | Impact | Current state | Phase |
|---|---|---|---|---|---|
| R1 | Guest enumeration through 3-letter prefix search, “many” status and search-as-you-type | High | High | ✅ Submit-only search, full-name default, generic outcomes (006) | **P0A** |
| R2 | Guest link can't be revoked/rotated; 10-char token (~51 bits) chosen by the client | Medium | High | ✅ Server-made 128-bit token; rotate and revoke (006) | **P0A** |
| R3 | New events publish immediately with layout and drawings | High | Medium | ✅ New events start as private drafts (006) | **P0A** |
| R4 | Organiser cannot see exactly what is public before publishing | High | Medium | ✅ Organiser preview while still a draft (006) | **P0A** |
| R5 | Rate limit is flat (30/10 min); no backoff; IP stored in clear | Medium | Medium | ✅ Backoff, per-link cap, hashed addresses kept 1 day (006) | **P0A** |
| R6 | Different wording/latency for “not found”, “wrong code”, “too many” | Medium | Medium | ✅ One wording and ~250 ms response for every outcome (006) | **P0A** |
| R7 | One-click delete of a whole wedding plan, no restore | Medium | High | ✅ Trash with 30-day restore, delete for good only from the trash after typing the name (009) | P0B |
| R8 | Last-write-wins between two tabs/devices silently loses work | Medium | High | ✅ Version precondition on save; organiser chooses which version to keep (010) | P1D |
| R9 | 300+ guest plans: ~1 000 focusable SVG nodes, heavy DOM | High | Medium | ✅ Partial redraws, one Tab stop per table, table search with zoom (2026-11-26); 500 guests: typing 572→33 ms, selecting a seat 164→88 ms | P1B |
| R10 | Import with no preview/undo; Georgian round-trip not verified for CSV | Medium | Medium | ✅ Preview, column mapping, duplicates, seats, undo; Georgian CSV/UTF-16 and export round trip tested (2026-11-26) | P1C |
| R11 | Colour-only side indicators in the header | High | Low | ✅ 2026-11-26: "Bride 7 · Groom 7" next to the dots | P2 |
| R12 | Console logging of raw error objects | Low | Medium | ✅ `logSafe` logs only an error code; no raw objects | **P0A** |

## 3. Schema and API changes

All changes are additive, `create … if not exists` / `create or replace`, and keep existing links working.

**Migration 006 — share lifecycle and privacy (P0A)**
- `events`: `share_status` (`draft` | `published` | `revoked`, default `draft`), `share_expires_at`, `share_published_at`, `show_layout` (default false). Existing rows are backfilled to keep today's behaviour (published ⇔ `guest_page`, layout on).
- Insert trigger: server-generated 128-bit link token (22 url-safe chars), `draft`, Balanced preset. The client can no longer pick the token.
- Update trigger: the token and the code hash can only change through the owner functions; `guest_page` is kept in sync with `share_status` for older clients.
- `share_links` history (event, sha-256 of each token, created/retired) for audit; owner-readable.
- `lookup_stats` (event, hour, outcome, count) — the only lookup telemetry. No IPs, names or queries.
- `seat_lookups.client` stores sha-256(ip ‖ token), kept 1 day.
- Owner functions (all check `owner = auth.uid()`): `publish_guest_page(event, expires)`, `unpublish_guest_page`, `revoke_guest_link`, `rotate_guest_link → token`, `set_guest_privacy(event, mode, mates, layout)`, `apply_privacy_preset(event, preset, pin)`, `preview_public_plan(event)`, `preview_find_seat(event, query)`.
- Public functions: `public_plan(token)` and `find_seat(token, query, code)` answer only for published, unexpired links; generic statuses; exponential backoff; ~250 ms constant-ish response time.

**Rollback (006):** the new columns/tables can stay (nothing reads them in older clients). To restore 005 behaviour, re-run `005_table_people.sql` and `004_seat_choice.sql` (they replace the two public functions), then `drop trigger events_share_defaults, events_share_guard on public.events`.

Later migrations (all landed): 007 name skeleton, 008 RSVP, 009 trash, 010 plan version, 011 entitlements, 012 account deletion, 013 version history. Still open: `audit_log`, account settings (names for the greeting), bank checkout callback.

## 4. Staged implementation plan

Each stage is one reviewable commit (or a few), tests included.

1. **P0A-1 Database** — migration 006, SQL tests (unpublished, revoked, expired, wrong code, backoff, exact match, generic outcomes, authorization, token immutability, defaults). ✅ this round
2. **P0A-2 Share panel** — status badge, publish/unpublish/expiry, rotate/revoke with confirmations, presets (Open needs explicit confirmation), organiser preview, semantic preview link. ✅ this round
3. **P0A-3 Guest page** — submit-only search, empty/short validation (`aria-invalid`, live), generic no-match, retry-after on rate limit, layout-off card. ✅ this round
4. **P0B** — ✅ (2026-11-24, migration 009) soft delete + trash (30 days), typed confirmation; ✅ (2026-11-26) overflow menu (⋯ on event cards); ✅ (2026-11-24, migration 011) entitlements: free up to 40 guests, event pass 79 ₾, Pro 99 ₾/month, pricing page, launch passes for existing events; ✅ (2026-11-24, migration 012) account page (password, sign out everywhere, plans, download all data, delete account) and privacy page; next: bank checkout (TBC / Bank of Georgia), terms of service; entitlement interface; audit events.
5. **P1A** — ✅ (2026-11-26) card metadata (guest page, plan, seated, free seats, last edited); ✅ (2026-11-26) next step on the signed-in home; ✅ (2026-11-26) checklist on cards; ✅ (2026-11-26) sample wedding (`event.sample`, its own card label, skipped by the home hero).
6. **P1B** — ✅ (2026-11-26) partial redraws, roving-tabindex seats, search-and-zoom with tables, perf fixture (`tests/e2e/bigplan.py`); still to do: minimap, level-of-detail, list view.
7. **P1C** — ✅ (2026-11-26) import preview/mapping/validation/duplicates/undo; ✅ (2026-11-27) guest filters (C1); still to do: multi-select; conflict queue.
8. **P1D** — ✅ (2026-11-24, migration 010) optimistic concurrency: a server-side plan `version` precondition and a "which version to keep" prompt (no field-level merge). ✅ (2026-11-24, migration 013) version history + restore points (History in the Event panel).
9. **P2** — ✅ (2026-11-26) contrast of every theme colour checked (AA), sentence-case labels, choice icons on RSVP; ✅ (2026-11-26) side counts in words in the planner top bar (B1, R11); still to do: remaining WCAG 2.2 AA pass (B2), mobile organiser priorities (B3), full device/AT matrix.

## 4b. Deferred code work (agreed 2026-11-17, do when no feature is in progress)
Do these between features, not during one, because each touches almost every line:
1. ✅ (2026-11-17) **ES modules.** Turn `js/*.js` (plain scripts sharing one scope) into real modules with explicit `import`/`export`, so each file declares what it uses. Shared mutable state (`S`, `sel`, `MODE`, …) moves into one state object.
2. ✅ (2026-11-17) **Readable formatting.** Reformat the dense one-line code (e.g. with Prettier) so diffs and reviews are easier. Do it in its own commit with no other change.
3. ✅ (2026-11-17) **Lighter guest pages.** On a slow 3G phone the guest page is usable after 2.9 s instead of 8.5 s, the RSVP page after 3.5 s; RSVP downloads 527 KB instead of 1.5 MB. `assets.js` (1.1 MB of embedded images) loads on the guest and RSVP pages too. Serve the images as separate cached files and load only what a page needs (risk R9-adjacent; matters for guests on phones at the venue).
Good moments: after RSVP M4, or before the launch work (pricing, payments).

## 5. Test matrix (P0A)

| Scenario | SQL | E2E |
|---|---|---|
| New event is draft, unguessable token, Balanced preset | ✔ | ✔ |
| Draft / unpublished link → generic “unavailable” | ✔ | ✔ |
| Published → lookup works; expired → unavailable | ✔ | |
| Revoked link never works again; rotate gives a new token, old token dead | ✔ | ✔ |
| Wrong / missing code → `code` status; no guest data | ✔ | ✔ |
| Exact mode: partial name finds nothing; full name (either order) finds | ✔ | ✔ |
| No-match and not-published answer with the same wording | ✔ | ✔ |
| Backoff after 8 misses (10 s doubling, max 5 min); 60/10 min per client; 1 500/h per link | ✔ | ✔ (message + retry time) |
| Another user cannot publish/rotate/revoke/preview/change privacy | ✔ | |
| Token and code hash cannot be changed by a direct table update | ✔ | |
| Layout off → no tables/drawings in public response | ✔ | ✔ |
| Telemetry rows hold counts only (no IP, name, query) | ✔ | |
| Organiser preview shows exactly the public payload while draft | ✔ | ✔ |
| Empty search → “Enter your name” + focus; 1–2 letters → “Type at least 3 letters” | | ✔ |
| Search runs only on submit (no autocomplete payloads) | | ✔ |
| Preview link is `<a target="_blank" rel="noopener noreferrer">` | | ✔ |
| Open preset requires explicit confirmation | | ✔ |
| Existing published events keep working after the migration | ✔ (backfill) | live check |

There is no build step, linter or type checker in this repository; “build passes” means the static files load without console errors in the browser tests. Adding ESLint/TypeScript checking is proposed for P0B.

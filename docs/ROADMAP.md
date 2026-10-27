# Supra — path to a commercially ready product

Status: P0A in progress (this document is updated as phases land).

## 1. Architecture findings

| Area | What exists today |
|---|---|
| Front end | Static site, no build step: `index.html` + `dash.js` (landing, sign-in, dashboard); `app.html` + `app.js` (planner at `/edit/:id`, guest page at `/e/:slug`). Plain ES2020, no framework, string-template rendering, one global plan object `S`. |
| Shared code | `i18n.js` (≈490 keys, EN/KA), `names.js` (gender guess from names), `brand.js/.css` (logo), `assets.js` (embedded illustrations). |
| Hosting | Vercel static, `vercel.json` clean URLs + rewrites `/edit/*`, `/e/*` → `/app`. Auto-deploy from `main`. |
| Auth | Supabase Auth, email + password (email confirmation currently off), optional magic link. Session in supabase-js local storage. |
| Database | One table `public.events` (owner uuid, name, type, event_date, `slug` = guest-link token, `data` jsonb = whole plan, `guest_page` bool, lookup settings). RLS: owner-only select/insert/update/delete. |
| Server logic | Postgres functions only (no API server): `public_plan(slug)`, `find_seat(slug, query, pin)` (anon), `set_guest_lookup(...)` (owner). Rate-limit log `seat_lookups` (anon has no access). Migrations 002–005 are additive `create or replace`. |
| Saving | Whole-plan `update events set data=…` debounced 1.5 s; draft copy in localStorage; last write wins. |
| Tests | `tests/sql` (Postgres 16 + Supabase stub; privacy/authorization of the public functions), `tests/e2e` (Python Playwright against a supabase-js stand-in; ≈50 tests: auth races, guest page, editor a11y, l10n, PDF, arrange, gender). No linter/typecheck/build exists (no build step). |
| Design tokens | CSS custom properties per page (`--bg --panel --ink --muted --line --accent --soft`), light/dark via `data-theme` + `prefers-color-scheme`; plan palettes in `PALETTES`. |

## 2. Risk register

| # | Risk | Likelihood | Impact | Current state | Phase |
|---|---|---|---|---|---|
| R1 | Guest enumeration through 3-letter prefix search, “many” status and search-as-you-type | High | High | Prefix default, debounced live search | **P0A** |
| R2 | Guest link can't be revoked/rotated; 10-char token (~51 bits) chosen by the client | Medium | High | Slug fixed for life, client-generated | **P0A** |
| R3 | New events publish immediately with layout and drawings | High | Medium | `guest_page` defaults to true | **P0A** |
| R4 | Organiser cannot see exactly what is public before publishing | High | Medium | Preview only works once published | **P0A** |
| R5 | Rate limit is flat (30/10 min); no backoff; IP stored in clear | Medium | Medium | `seat_lookups.client` = raw IP | **P0A** |
| R6 | Different wording/latency for “not found”, “wrong code”, “too many” | Medium | Medium | Distinct statuses, no padding | **P0A** |
| R7 | One-click delete of a whole wedding plan, no restore | Medium | High | Inline confirm | P0B |
| R8 | Last-write-wins between two tabs/devices silently loses work | Medium | High | Debounced full-plan overwrite | P1D |
| R9 | 300+ guest plans: ~1 000 focusable SVG nodes, heavy DOM | High | Medium | Every seat is a button | P1B |
| R10 | Import with no preview/undo; Georgian round-trip not verified for CSV | Medium | Medium | Direct import | P1C |
| R11 | Colour-only side indicators in the header | High | Low | Pink/blue dots | P2 |
| R12 | Console logging of raw error objects | Low | Medium | `console.error(err)` in 5 places | **P0A** |

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

Later phases: `events.deleted_at` + `purge_after` (P0B), `event_versions` (P1D), `audit_log`, `account_settings`, entitlement table (P0B).

## 4. Staged implementation plan

Each stage is one reviewable commit (or a few), tests included.

1. **P0A-1 Database** — migration 006, SQL tests (unpublished, revoked, expired, wrong code, backoff, exact match, generic outcomes, authorization, token immutability, defaults). ✅ this round
2. **P0A-2 Share panel** — status badge, publish/unpublish/expiry, rotate/revoke with confirmations, presets (Open needs explicit confirmation), organiser preview, semantic preview link. ✅ this round
3. **P0A-3 Guest page** — submit-only search, empty/short validation (`aria-invalid`, live), generic no-match, retry-after on rate limit, layout-off card. ✅ this round
4. **P0B** — soft delete + trash (30 days), typed confirmation, overflow menu; account/security/data/legal/pricing shells; entitlement interface; audit events.
5. **P1A** — onboarding checklist, sample event (isolated, flagged), card metadata (Draft/Published, guests seated, last edited).
6. **P1B** — minimap, search-and-zoom, table navigator, level-of-detail, roving-tabindex seats, list view; perf fixtures 50/300/500/1 000.
7. **P1C** — import preview/mapping/validation/duplicates/undo; filters; multi-select; conflict queue.
8. **P1D** — explicit save states, version history + restore points, optimistic concurrency (`updated_at` precondition + merge prompt).
9. **P2** — WCAG 2.2 AA pass, non-colour category labels, mobile organiser priorities, full device/AT matrix.

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

# Supra — wedding seating planner

Plan who sits where, with every guest drawn at their seat. Couples sign in, build their floor plan, and share a "find my seat" page with guests.

Plain static site (no build step) + [Supabase](https://supabase.com) for sign-in and storage. Hosted on [Vercel](https://vercel.com).

## Files
| File | What it is |
|---|---|
| `index.html`, `dash.js` | Landing page, sign-in, and "My events" |
| `app.html`, `app.js` | The planner (`/edit/<id>`) and the public guest page (`/e/<code>`) |
| `assets.js` | All illustrations, embedded |
| `brand/`, `brand.js`, `brand.css` | Supra logo (light and dark-surface versions), emblem, favicon PNGs; the shared logo helper and theme switching |
| `favicon.svg`, `favicon.ico` | Browser icon (emblem on warm ivory) |
| `i18n.js` | English and Georgian text |
| `config.js` | Your Supabase URL and public key |
| `supabase/schema.sql` | Database table and access rules |
| `supabase/002_guest_lookup.sql` | Private guest search (run after `schema.sql`) |
| `supabase/003_public_looks.sql` | Guest page shows each seated guest's drawing (no names) |
| `tests/` | Database tests (`tests/sql/run.sh`) and browser tests (`python3 tests/e2e/run_all.py`) |
| `vercel.json` | Clean URLs for `/edit/…` and `/e/…` |

## One-time setup
1. **Supabase**: create a project, open **SQL Editor**, run `supabase/schema.sql`, then `supabase/002_guest_lookup.sql` and `supabase/003_public_looks.sql`.
2. **Supabase → Authentication → URL Configuration**: set **Site URL** to your Vercel address (e.g. `https://supra.vercel.app`) and add `https://supra.vercel.app/**` to **Redirect URLs**.
3. Put the **Project URL** and **anon public key** (Project Settings → API) in `config.js`.
4. **Vercel**: Add New → Project → import this GitHub repo → Deploy. No settings needed.

Optional: enable Google sign-in under Authentication → Providers, then set `googleSignIn: true` in `config.js`.

## Privacy
Each plan is readable only by its owner (row-level security). The guest page never downloads the guest list. It gets the room layout: table names and each seated guest's drawing, without names and asks the server for one name at a time:

- at least 3 letters, matching the start of a first or last name (or the full name only, if the owner chooses);
- at most 5 matches, each with only the name, drawing, table and seat; tablemates' names only if the owner turns that on;
- an optional invitation code, stored hashed;
- limited to 30 searches per visitor per 10 minutes and 1,500 per guest page per hour.

Meals, allergies, groups, notes, seating rules and the waiting list are never sent to the guest page.

## Tests
- Database: `tests/sql/run.sh -h <host> -p <port> -U postgres` against an empty Postgres 15+.
- Browser: `pip install playwright && python3 -m playwright install chromium`, then `python3 tests/e2e/run_all.py`. The tests use a stand-in for Supabase, so they need no account.

# Supra — wedding seating planner

Plan who sits where, with every guest drawn at their seat. Couples sign in, build their floor plan, and share a "find my seat" page with guests.

Plain static site (no build step) + [Supabase](https://supabase.com) for sign-in and storage. Hosted on [Vercel](https://vercel.com).

## Files
| File | What it is |
|---|---|
| `index.html`, `dash.js` | Landing page, sign-in, and "My events" |
| `app.html`, `app.js` | The planner (`/edit/<id>`) and the public guest page (`/e/<code>`) |
| `assets.js` | All illustrations, embedded |
| `i18n.js` | English and Georgian text |
| `config.js` | Your Supabase URL and public key |
| `supabase/schema.sql` | Database table, access rules, guest-page function |
| `vercel.json` | Clean URLs for `/edit/…` and `/e/…` |

## One-time setup
1. **Supabase**: create a project, open **SQL Editor**, paste `supabase/schema.sql`, Run.
2. **Supabase → Authentication → URL Configuration**: set **Site URL** to your Vercel address (e.g. `https://supra.vercel.app`) and add `https://supra.vercel.app/**` to **Redirect URLs**.
3. Put the **Project URL** and **anon public key** (Project Settings → API) in `config.js`.
4. **Vercel**: Add New → Project → import this GitHub repo → Deploy. No settings needed.

Optional: enable Google sign-in under Authentication → Providers, then set `googleSignIn: true` in `config.js`.

## Privacy
Each plan is readable only by its owner (row-level security). The guest page reads a separate copy that holds only names, looks and tables, and only while the owner keeps the guest page switched on.

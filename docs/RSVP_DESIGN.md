# RSVP: design

Status: **agreed** (2026-11-17). M1–M4 are built and tested (database, guest page `/r/<token>`, Invitations tab, answers in the plan); M5 (automatic email) waits for a domain. M4 notes: household allergies are listed per household in the caterer summary, not copied onto one guest; RSVP markers show on screen only, never in exported PNG/PDF plans. M3 notes: groups of more than 12 guests get one invitation per person; the Email button opens the couple's mail app (automatic email is M5).

## Goal
The couple sends each invited family a personal link by WhatsApp, Viber, SMS or email. On that link the family says who is coming, plus meal choices, allergies and a message. They can change their answer as often as they like until the deadline, which defaults to 24 hours before the wedding. The couple sees live totals and every change, and the answers flow into the seating plan.

## Decisions taken
- **One invitation per household** (family, couple or single person). It names its members, who are guests in the plan, and can allow extra unnamed people ("+1").
- **Channels:** WhatsApp, Viber and SMS open the couple's own app with the message ready (free). Email is sent automatically by Supra.
- **Questions:** who is coming (per person, so the number of people follows), meal choice, allergies, and a message to the couple.
- **Changing your mind:** allowed any number of times until the deadline. The server enforces the lock, not only the page.

## 1. What the guest sees: `/r/<token>`
A new light page (`rsvp.html` + `rsvp.js`). No sign-in: the unguessable link is the key.

```
┌───────────────────────────────┐
│        Nino & Giorgi          │
│   Saturday 12 June 2027 · 18:00│
│   Restaurant Iveria, Tbilisi ↗ │   ← map link
│                               │
│  Dear Beridze family,         │
│  will you join us?            │
│                               │
│  [drawing] Lasha    ● Coming  ○ Can't │
│            Meal: [Meat ▾]             │
│  [drawing] Teona    ● Coming  ○ Can't │
│            Meal: [Fish ▾]             │
│  + Add a guest (1 more allowed)       │
│                               │
│  Allergies  [______________]  │
│  Message to the couple [____] │
│                               │
│  [   Send our answer   ]      │
│  You can change it until      │
│  11 June, 18:00.              │
└───────────────────────────────┘
```

- **After answering:** "Thank you! 2 of you are coming." It shows the current answer, a **Change answer** button and **Add to calendar** (.ics).
- **Changing their mind:** the same link, any time before the deadline. Every change is logged for the couple.
- **After the deadline:** the answer is read-only. "Answers are closed. Please contact Nino & Giorgi directly."
- **If the couple turned the link off or deleted the invitation:** a neutral "This invitation is no longer active."
- **Language:** each invitation has a language (KA/EN) and the guest can switch.
- **Later (phase 2):** once the seating plan is published, the same personal link also shows "Your table: Table 4", so nobody needs to type their name at the entrance.

## 2. What the couple sees
**Event panel (new fields):** start time, venue name, address or map link, and the RSVP deadline (defaults to 24 h before the start; can be changed or switched off).

**New "Invitations" tab** next to Event / Guests / Share:

```
Coming 182 · Can't come 20 · No answer 41 households      [Remind all without answer]

Search…   [All ▾] [No answer] [Coming] [Can't come]

Beridze family   2/2 coming    WhatsApp  Viber  SMS  Email  ⋯
Lomidze, Giorgi  no answer     WhatsApp  Viber  SMS  Email  ⋯
Gelashvili fam.  can't come    "Sorry, we'll be abroad"

Recent changes
  Teona Beridze → can't come       2 h ago
  Lomidze family → 3 coming        yesterday
```

- **Creating invitations:**
  - **One per group:** households come from the existing guest `group` field.
  - Or select guests and choose **Make invitation**.
  - Each invitation has a name ("Beridze family"), members, extra people allowed (0–5), phone, email and language.
- **Sending:**
  - **WhatsApp:** `https://wa.me/<phone>?text=<message>` opens WhatsApp with the message ready.
  - **Viber:** `viber://forward?text=<message>`. Viber cannot prefill a message to a given number, so the couple picks the contact.
  - **SMS:** `sms:<phone>?&body=<message>`.
  - **Email:** sent by Supra (milestone 5).
  - **Copy link:** for anything else.
  - Each invitation records "sent via WhatsApp, 3 Nov", so the couple knows who has been invited.
- **The message** is a template the couple can edit, in KA and EN: "Dear {household}, we'd love you to celebrate with us on {date}. Please let us know by {deadline}: {link}".
- **On the plan:** guests who can't come get a "can't come" badge on their seat and in the guest list. They are **not** removed automatically; the couple decides (one click: "move everyone who can't come to the waiting list").
- **Answers in the plan:** meal choices and allergies from answers are copied into the guests (shown as "3 new answers applied"), so the caterer summary and place cards use them. Extra people a family adds arrive in the waiting list with their names.

## 3. Database (migration `008_rsvp.sql`)
Guest answers live in **their own tables**, never inside the plan (`events.data`). A guest answering can never overwrite the couple's edits, and the plan never contains phone numbers.

```
events (new columns)
  starts_at        timestamptz          -- date + time, Asia/Tbilisi by default
  venue_name       text
  venue_map_url    text
  rsvp_deadline    timestamptz          -- null = starts_at - 24 h
  rsvp_open        boolean default true

invites                                   -- RLS: owner of the event only
  id uuid, event_id uuid → events (cascade)
  token text unique                       -- server-made, 128-bit; owner can rotate
  name text                               -- "Beridze family"
  members text[]                          -- plan guest ids
  extra_allowed int (0–5)
  phone text, email text, lang text
  sent jsonb                              -- [{via:'whatsapp', at}]
  answer jsonb                            -- {members:{gid:{coming,meal}}, extras:[{name,meal}], allergies, message}
  coming_count int                        -- kept in sync by the server
  answered_at, updated_at, applied_at timestamptz
  status text: 'pending' | 'answered' | 'revoked'

invite_log                                -- every answer and change, for "Recent changes"
  invite_id, at, coming_before, coming_after
```

**Functions:**
- **For guests (anon):**
  - `rsvp_get(token)` returns only that household: the couple's names, date, time, venue, deadline, the members' names and drawings, and their current answer. Nothing about other guests, and no phone or email.
  - `rsvp_answer(token, answer)` validates the shape: members must belong to the invitation, extras ≤ `extra_allowed`, meal from the allowed list, text lengths capped. It rejects answers after the deadline, when RSVP is closed, or when the invitation is revoked. It's rate-limited per link and per network address.
- **For the owner (each checks `owner = auth.uid()`):** create, update and delete an invitation; rotate its link; mark one as sent; `rsvp_summary(event)`; `invite_changes(event)`.
- **Tests:** guests see only their own household; no phone or email leaks; the deadline is enforced on the server; answers can't add members or exceed extras; other users are blocked; rate limits work.

## 4. Privacy
- Phone numbers and emails are personal data. Only the couple can read them; they are never sent to any guest page, and they are deleted automatically 90 days after the event (plus a "Delete contact details now" button).
- The RSVP page shows the names and drawings of that household's own members only.
- The privacy policy (roadmap P0B) has to mention RSVP contact data before launch.

## 5. Build order (each one is a separate pull request with tests)
| # | Milestone | Rough size |
|---|---|---|
| M1 | Migration 008: tables, guest and owner functions, SQL tests; mock support | 2–3 sessions |
| M2 | Guest page `/r/<token>` in EN/KA, phone-first, with browser tests | 2–3 sessions |
| M3 | Event time/venue/deadline fields; Invitations tab: create, contacts, WhatsApp/Viber/SMS/copy, statuses, totals, recent changes | 3–4 sessions |
| M4 | Answers into the plan: badges, meals/allergies, extras to the waiting list, caterer summary | 2 sessions |
| M5 | Email: Supabase Edge Function + Resend, own domain (SPF/DKIM), reminders | 2 sessions + domain setup |
| Later | Same link shows the guest's table on the wedding day; WhatsApp Business API for automatic sending (paid) | — |

At about 2 h/day this is roughly 3 weeks. M1–M4 work with no paid services and no domain.

## Decided on 2026-11-17
1. The deadline defaults to 24 h before the start; the couple can move it or switch it off.
2. Extra unnamed people: set per invitation (0–5, 0 by default); the family types their names and they go to the waiting list.
3. "Can't come" guests are flagged on their seat; one button moves them all to the waiting list.
4. Email domain: decided before M5. M1–M4 do not need one.

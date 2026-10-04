# Alchemist Detailing — website and booking platform

Read this first, then `docs/18-handoff-and-booking-plan-2026-10-03.md` for where the work stands, then `docs/19-portal-architecture-and-ai-plan-2026-10-04.md` for the whole-portal architecture, build phases and the AI plan (AI features are PROPOSED until the owner approves).

## What this is

The website and booking/account platform for **Alchemist Detailing**, a car detailing business in Parker, Texas, run by its owner (mostly solo for now). The owner is not a developer: explain things in plain words, show results, and ask him whenever a decision is his.

- **Front end:** static HTML, CSS and vanilla JavaScript in `site/`, no build step yet. WebGL for the hero, the service-card pictures and the foam wash.
- **Back end:** Supabase (Postgres 17, Auth, Storage, Edge Functions). Migration 001 is applied to the live project and fully tested.
- **Look:** a premium automotive brand, "Nike-level presentation + Aston Martin-style motion". Black and charcoal about 75%, warm off-white about 20%, gold about 5%. The owner's standing instruction: professional and attractive, gold accents in every design, and ask questions when needed.

## Latest owner decisions (doc 20)

- AI for staff only, under $10/month; customer AI later.
- The **200+ gold rule**: bookings above $200 show gold in admin; their reviews shine gold. Details G-1 to G-5 are open.
- Admin morning view: all bookings and team availability. Time off needs one week's notice.
- Goal: 4–8 clients a day, 20+ a week, mostly mobile. Capacity question V-1 must be asked before the admin phase.

## Owner decisions, round 12 (doc 21)

- Launch volume is about 10 details a week, solo. 3–4 rigs later (capacity per rig is a future change, not now).
- Gold is earned after payment: recorded payments of $200+ (extras count). Needs a staff "Record payment" action that only records. G-6 to G-9 are open.
- Loyalty discounts after X washes: a future feature. Do not build or invent X.
- One-week time-off notice is a house rule; owner and manager approve and can override.
- First AI features approved (staff only, under $10/month): request triage, reply drafts, morning summary.

## How to work with the owner now (doc 22)

The owner has stopped the question rounds and wants **Claude Code to ask whatever it needs**. Use the list in `docs/22-owner-answers-round-13-and-open-questions-2026-10-04.md`: ask one phase's questions at a time, in plain words, with a recommendation. Settled in doc 22: gold belongs to the booking (gold review) and the customer (Gold client); tips don't count; only the owner records payments, whoever did the job takes payment; the team member enters time off and the owner or a manager approves; the calendar notice box is approved. Parked: Gold client perks beyond gold reviews, loyalty discounts, customer AI, rigs.

## Rules that always apply

1. **Never invent business facts:** no phone numbers, prices, services, hours, reviews, testimonials, customer counts or features. The booking phone number is **(945) 361-7551**.
2. **Never fabricate reviews or "customer results".** Those sections wait for real ones.
3. **Don't silently resolve contradictions** between docs. Say what each says, which is newer, and ask. Don't treat an open decision as decided.
4. **"Do NOT invent features."** If something useful isn't specified, mark it PROPOSED and ask.
5. **Browser input is untrusted.** The database re-checks everything: prices, times, ownership and roles. The website only displays what the database returns.
6. **The owner's home address is private.** The public area is "Parker, Texas". His address is sent only with a confirmed "Come to us" booking.
7. **Supabase safety:** never run destructive SQL on the live project without the owner's explicit OK. Never work around Supabase's confirmation prompts. Use the test project for experiments.
8. **Unbooked services stay off the booking.** Perfect Finish Sealant and Steam Cleaning have no minutes set yet, so the database refuses them (`not_bookable_yet`). Unpriced services (bundle tiers, ceramic, wax, plastic or rubber care, restorations) are not offered at all.

## Repository layout

| Path | What |
| --- | --- |
| `site/` | The website: `index.html`, `css/alchemist.css`, `js/hero-gl.js` (hero and still pictures), `js/foam.js` (the scroll-controlled wash), `js/app.js` (menu, routing, page logic), `js/config.js` (Supabase URL and publishable key), `img/` |
| `brand/` | The owner's logo (`logo-source.png`), the redrawn AD monogram (`ad-mark.svg`, path data), metallic cut-outs, and the scripts that made them |
| `supabase/migrations/` | Migration 001, six files, applied to both projects |
| `supabase/functions/` | Edge Functions: `admin-create-team-account`, `cleanup-unattached-photos` |
| `db-tests/` | The Migration 001 test suites: 472 checks, plus 6,480 price combinations |
| `docs/` | Every decision, audit and report, numbered in order (01 to 22), plus the owner's design and animation direction |
| `tools/` | `build_artifact.py` (single-file preview), `shoot.py` (screenshots with Playwright) |

## Previewing the site

- Serve the folder, for example `npx serve site` or `python3 -m http.server 8080 --directory site`, then open http://localhost:8080. Opening `index.html` straight from disk also works.
- Pages are hash routes: `#home`, `#services`, `#book`, `#appointments`, `#reviews`, `#tips`, `#faq`, `#about`, `#contact`, `#account`. `#services-exterior` and similar scroll to a group. Only plain tokens: a claude.ai preview strips anything else.
- `?noadapt` keeps the foam at full quality (it otherwise lowers its resolution on slow devices).
- `window.__alchemist.goTo(p)` scrolls the wash to progress `p` (0 to 1), for screenshots.
- Reduced motion and no-WebGL both fall back to showing the services directly. Test both.

## Supabase

| | Live | Test |
| --- | --- | --- |
| Name | Alchemist Detailing | Alchemist Test |
| Project ref | `efpzprranvgujkblnwdj` (us-east-1) | `wlmostaetntbpmfgyjst` (ca-central-1) |
| State | Migration 001 applied; no customer or test data | Migration 001 plus test data; the sandbox |

**What the website may call** (errors are SQLSTATE P0001: `message` = code, `detail` = text to show, `hint` = field):

- **Signed-out visitors:**
  - `get_public_settings()`
  - `quote_booking(p jsonb)`
  - `get_calendar(p_from, p_days, p_duration, p_location)`
  - `get_availability(p_date, p_duration, p_location)`
  - `email_allowed(p text)`
- **Tables visitors can read:** `services`, `vehicle_types`, `form_options`, `bundle_parts`, `service_includes`, `addon_rules`, `service_type_prices`, `service_zip_codes`.
- **Signed-in users:**
  - `submit_booking(p jsonb)`: needs a text-confirmed phone.
  - `my_bookings()`
  - `update_my_profile(first, last)`
  - `delete_my_vehicle(id)`
  - their own `vehicles` rows
- **Staff functions** are listed in `supabase/migrations/…05_m001_access_and_storage.sql`.
- **Photos:** private bucket `vehicle-photos`, path `<user id>/<uuid>.<jpg|jpeg|png|webp>`, 8 MB each, up to 6 per booking.

**Before launch** (none done yet):
- Twilio Verify for text codes.
- An email sender (custom SMTP) for email codes.
- A bot check (CAPTCHA) on code requests.
- Authenticator-app MFA for admin and manager.
- An hourly Cron running `cleanup-unattached-photos`.
- Optional: leaked-password protection.
- Run `bootstrap_admin` after the owner's first sign-in.

**Values the owner still owes:**
- X-4: bundle tiers.
- X-5: what Steam Cleaning can be added to.
- X-7: sealant and steam minutes.
- X-8: buffer and travel minutes.
- X-25: which stains hold the price.
- His private address.
- Three borderline ZIP codes: 75072, 75407 and 75042.

## Design system (in `site/css/alchemist.css`)

- **Tokens:** `--bg #050505`, `--gold #d8a640`, `--gold-hi #f6d28a`, `--ink #f3eee4`, `--ink-2 #c8c1b4`, `--muted #8b8478`; gradients `--gold-grad` and `--gold-text`.
- **Fonts:** Cinzel (display, uppercase), Manrope (interface), Cormorant Garamond italic (the logo tagline "Our chemicals make your car shine like gold ✦").
- **Shared pieces:**
  - `.shine`: the gold light sweep.
  - `.btn-gold` and `.btn-glass`.
  - The glass `.topbar` with the page name in the middle.
  - The smoked-glass `.menu`, items staggered 28 ms.
  - `.svc-card` with `data-enter` up, side, grow or fade.
  - `.price-card`.
  - The `.veil` gold transition into booking.
- **One major animation per section.** Gold is a material, not a paint job. Respect `prefers-reduced-motion`.

## Working agreements

- Show the owner results he can open: screenshots, a local or Vercel preview link.
- Record each set of owner answers as the next numbered doc in `docs/`.
- Keep payments outside the app: he charges in person on a Square reader.

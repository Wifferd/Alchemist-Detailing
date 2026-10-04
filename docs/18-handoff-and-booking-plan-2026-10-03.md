# Handoff and booking-app plan (Oct 3, 2026, 8:45 PM Central)

Where the project stands, what was decided tonight, and the plan for the next two pieces of work. Written when the work moved from a claude.ai chat to Claude Code.

## Where things stand

| Area | Status | Details |
| --- | --- | --- |
| Database (Migration 001) | Done, live | Six migration files, 472 tests and all 6,480 price combinations passing. Applied to the live and test projects (docs 13 and 15). |
| Homepage | First design pass done | Glass bar, side menu, live hero, "The Alchemist Standard", the scroll-controlled foam wash, service cards, Why Alchemist, How booking works, closing call to action, footer (doc 16). |
| Services page | Done | Full menu, prices and inclusions, word for word from the database seed. |
| Booking app | Next | Plan below. Nothing written yet. |
| Design upgrade | After booking | Waits for the owner's photos and videos (plan below). |
| Account, appointments, admin, team, reviews, tips, FAQ, about, light mode | Not started | Placeholder pages that say "coming soon". |
| Hosting | Not started | Plan: GitHub repository, deployed on Vercel. |

The homepage preview was published as a claude.ai artifact ("Alchemist Detailing"). This repository is now the source of truth.

## Decided tonight (doc 17)

- **Booking steps:** 01 Contact, 02 Vehicle, 03 Location, 04 Service, 05 Date and time, 06 Summary, then Request sent.
- **Summary screen:** yes. One screen to check everything, with Edit links, before Send Request.
- **Payment:** in person after the detail. Card on the Square reader, Apple Pay or tap to pay, cash, or Zelle. Nothing is charged online.
- **Order of work:** booking app first, then the design upgrade.
- **Pictures:** the owner's own photos and videos of his work.

## Booking app plan

### Shape

- **Route and layout:** route `#book`. One large centred rounded container on the dark background, with the glass bar kept.
- **Progress indicator:** `01 ── 02 ── 03 ── 04 ── 05 ── 06` at the top, the active step in gold, labels under the numbers on wide screens.
- **Inputs:** rounded text fields. Choices like vehicle type, condition, stains and damage are slightly squarer cards or chips; selected ones get gold text and a gold glow.
- **Service cards:** a selected card lifts and shows "✓ SELECTED" in gold, and a gold glow runs once around its border. No constant pulsing.
- **Navigation:** Back and Continue in a sticky glass bar at the bottom on phones. Changing step slides the content.
- **Errors:** next to the field, saying what's wrong and how to fix it. Each error scrolls into view.
- **Copy for errors:** use the database's `detail` text where it has one.

### Data layer: one interface, two modes

`site/js/booking-data.js` exposes the same functions in both modes:

- **Live mode.** Used when `window.ALCHEMIST_CONFIG` exists and supabase-js loads:
  - Load `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js`, or bundle it once a build step exists. Audit item F-70 asks for bundling or an integrity hash.
  - Create the client with the publishable key.
- **Preview mode.** Used for claude.ai previews and offline, which can't reach Supabase:
  - The same rules, worked out in the browser from a copy of the seed.
  - Clearly labeled "Preview: nothing is sent".
  - Any 6-digit code is accepted.
  - The receipt has a made-up reference in the real format `AD-XXXXXXXX`: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.

| Function | Live | Preview |
| --- | --- | --- |
| `settings()` | rpc `get_public_settings` | Seed values: starts 600–1140 min, latest end 1200, 30-minute steps, 1–60 days ahead, 24-hour hold, phone, "Parker, Texas", 10 miles, the mobile note |
| `menu()` | Select from the eight public tables | Copy of the seed in `supabase/migrations/20261003200002_m001_roles_triggers_menu.sql` |
| `sendPhoneCode(phone)` | `auth.signInWithOtp({ phone: '+1…' })` | Wait, then succeed |
| `verifyPhoneCode(phone, code)` | `auth.verifyOtp({ phone, token, type: 'sms' })` | Any 6 digits |
| `emailAllowed(email)` | rpc `email_allowed` | A short throwaway-domain list |
| `sendEmailCode(email)` / `verifyEmailCode` | `auth.updateUser({ email })`, then `verifyOtp({ email, token, type: 'email_change' })` | Simulated |
| `quote(p)` | rpc `quote_booking` | A line-for-line port of `quote_booking`: rounding, included steam, add-on rules, pending reasons, bundle suggestion |
| `calendar(from, days, duration, loc)` | rpc `get_calendar` | `open_starts` rules with made-up existing jobs, some days full |
| `times(date, duration, loc)` | rpc `get_availability` | Same |
| `uploadPhoto(file)` / `removePhoto(name)` | Storage `vehicle-photos`, `<uid>/<uuid>.<ext>` | Object URLs |
| `submit(p)` | rpc `submit_booking` | Basic checks, then a receipt |
| `signOut()` | `auth.signOut()` after sending (audit, flow step 7) | Reset |

Check preview prices against the real function on the test project. For example, run `select public.quote_booking('{"location_type":"mobile","exterior":"ext_basic","interior":"int_deluxe"}')` and compare a matrix of combinations.

### Steps in detail

**01 · Contact**
- **Fields:** first name (required), last name (optional), phone (required, US) and email (optional).
  - Names follow `is_valid_name`: letters, spaces, hyphens, apostrophes and periods; 1 to 40 characters.
  - Phones follow `normalize_phone`.
- **Phone code:** "Send code", then a 6-digit code field, then confirmed. Confirming signs the customer in, which step 02's photo uploads need.
- **Email code:** if an email is given, check it with `email_allowed`, then send an email code, with "Skip, contact me by phone".
  - Email codes need the custom SMTP (before launch). Until then, live mode should let the customer skip.
- **Spam field:** a hidden `website` field, off-screen, with `tabindex -1` and `aria-hidden`. Bots fill it.
- **Signed-in customers:** show "Signed in as …" with the name from the profile.

**02 · Vehicle**
- **Saved vehicles:** for signed-in customers with saved vehicles, show "YOUR VEHICLES" cards plus "+ Add vehicle". Guests have none.
- **The vehicle:**
  - Year (optional, 4 digits), make (required), model (required), color (optional).
  - Type, as cards: Sedan, Coupe, Convertible, Crossover, SUV, Minivan, Truck, Large SUV, Van, Other.
  - "Not sure? Type here" switches to a required description.
- **Size:** Standard or XL. The help text uses the owner's examples: minivans and some modified trucks, such as a Raptor. With XL, the price is confirmed by the owner before the appointment.
- **Chips from `form_options`:** condition, stains (heavy stains hold the price), damage and modifications.
  - Damage: "No known damage" can't be combined with others. Unknown or Other need a note, and send the request to Review.
  - Modifications never add a fee.
- **Photos:** optional, up to 6, JPEG, PNG or WebP, 8 MB each. Strip location data before upload by re-encoding through a canvas (audit F-52).

**03 · Location**
- **"We come to you":**
  - Within about 10 miles of Parker. Show the mobile note: "For mobile service, we use your outdoor water faucet and a power outlet."
  - Show the mobile percentages: 2.5% on basic services and add-ons, 7% on deluxe services and bundles.
  - Ask for the street address and ZIP. Check the ZIP against `service_zip_codes` as they type.
  - Outside the area: "We come to you within about 10 miles of Parker, Texas. For other areas, call (945) 361-7551."
- **"Come to us":** Parker, Texas. "We send the address with your confirmation."

**04 · Service**
- **Choices:** a bundle, or an exterior and/or an interior service, as large cards with live prices from the quote (mobile included).
- **Bundle suggestion:** when the quote returns a `suggestion`, show it, for example "Signature Combo saves you $9.99", with a Switch button. Never switch on its own (round 8).
- **Add-ons:** sealant and steam can't be booked online yet (no minutes). Say so, and point to the notes field or the phone.
- **Notes:** "Anything we should know?" goes into `special_request`, max 1,000 characters, no links.
- **Price summary:** lines, mobile, bundle savings and total, plus about how long the job takes.
  - When the price is pending (XL, heavy stains), show "We confirm the price before your appointment" instead of a total.

**05 · Date and time**
- **Service summary:** the chosen service at the top with "Change", so the customer can change service and see availability update (design notes item 23).
- **Calendar:**
  - A month view that moves left and right.
  - Available days are selectable; full days get a subdued gold stripe; days outside the window are dimmed.
  - Selecting a day expands a gold circle and fades in the start times below it.
- **Times:** start times as chips, plus "Can't find a time? Call (945) 361-7551."

**06 · Summary**
- **Sections:** contact, vehicle, location, service, date and time, notes and photos, each with Edit.
- **Price:** service value, bundle savings, mobile and the total (or "price confirmed by us").
- **Payment line:** "You pay in person after your detail: card, Apple Pay or tap to pay, cash, or Zelle."
- **Hold line:** "Sending holds this time for 24 hours while we review your request. We'll contact you to confirm."
- **Button:** a gold "Send Request" with the gold light transition.

**Request sent**
- **Shown:** reference, "Request received", date, time and place, and when the hold ends.
- **What happens next:** we review and contact you; for Come to us, the address comes with the confirmation.
- **Then:** sign the guest out.
- **Errors from `submit_booking`** return to the right step by `hint`:
  - `first_name`, `last_name`, `phone`: step 01.
  - `vehicle_*`, `modifications`, `conditions`, `stains`, `damage`, `damage_note`, `photos`: step 02.
  - `location_type`, `address`, `address_zip`: step 03.
  - `services`, `bundle`, `exterior`, `interior`, `addons`, `special_request`: step 04.
  - `service_date`, `start_min`: step 05. For `slot_unavailable`, clear the time and reload times.
- **Repeats:** send a `request_id` (a UUID made once per attempt) so a repeat returns the first booking.

## Design upgrade plan (after booking)

The owner wants many more animations, more realism, and a more expensive look. Do these one section at a time, keeping one major animation per section:

1. **Real photos and video:** the owner is sending his own. Grade them to the black-and-gold palette. Use them for the hero (one per visit), the service cards, the service pages and an "Our work" section. Compress video for the web (H.264 and WebM, a still frame shown while it loads).
2. **Opening:** the AD monogram draws itself in gold light, then the hero fades in.
3. **Weighted smooth scrolling** with parallax layers. Consider Lenis plus GSAP ScrollTrigger, now that npm is available.
4. **Headlines:** letters rise in one by one as a line of gold light passes across them.
5. **Cursor glint:** a gold glint follows the cursor across cards and buttons, like light on polished paint.
6. **A scene for each section:**
   - Protection: water beading up and rolling off paint.
   - Interior: a door closing into a lit cabin.
   - Reviews: a gold reveal when real reviews exist.
7. **The wash:** more realistic foam and water.
8. **Light mode ("luxury showroom"):** warm off-white, soft grey, charcoal text, gold accents.

## Launch checklist

- Booking app working end to end on the test project. Supabase's test phone numbers allow it without real texts.
- The before-launch Supabase setup listed in CLAUDE.md.
- Values the owner still owes (CLAUDE.md).
- A GitHub repository and a Vercel deployment, with the owner's domain.
- Final checks on desktop and phone: reduced motion, keyboard, contrast, performance.

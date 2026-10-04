# Alchemist Detailing — Migration 001 Audit & Completion Plan

Oct 3, 2026 · @Mumin Baig

Migration 001 is a sound foundation, but it cannot ship as written. It stops before a booking is saved, has no access rules, and its pricing model predates the current menu. Nothing has been applied to Supabase yet, so every correction can be made in the draft itself with no data at risk.

## 1. Project Status

Alchemist Detailing is a new build, and its database exists only as a 374-line draft of Migration 001 that has never been applied.

| Item | Status |
| --- | --- |
| Migration 001 draft | 374 lines, received Oct 3, 2026. Stops inside `submit_booking` after the large-vehicle surcharge, before anything is saved. |
| Test run | The written part runs cleanly on a scratch Postgres 16 with Supabase's roles stubbed. The visible part of `submit_booking` compiles. |
| Website | One-file HTML prototype with a preview mode and a Supabase mode. No sign-up, account or staff pages yet. |
| Supabase | One project ("Wiffy Wash"): empty, Postgres 17.6, Canada (Central) region, free plan. |
| Old website | "Wiffed\_ Detailing" on Vercel. Being replaced; reference only. It saved everything in each visitor's own browser, so there is no old data to move. |

Supabase defaults that shape every design choice below (checked on the live project):

- New tables give signed-out visitors and signed-in users full read and write rights. Row-level security (RLS) is the only lock.
- A Supabase trigger switches RLS on for every new table. With no policies, RLS blocks everyone, including the website.
- Anyone can run a new database function until access is revoked.
- Outside users cannot create objects in the public schema. Transactions run at READ COMMITTED.
- Free projects pause after 7 days of low activity, and this one was asleep. A live booking site needs the Pro plan or steady traffic.

Because Migration 001 has never run anywhere, it can be corrected in place. No corrective migration, no data migration and no backward compatibility are needed.

Decided on Oct 3, over seven rounds: the menu and prices, service times, vehicle types and add-on rules; mobile pricing of 2.5% or 7% extra, within 10 miles of Parker; and an extra cost you set yourself for XL vehicles and stains. Also decided: roles admin, manager (tier 2) and detailer (tier 1); a 24-hour hold on unapproved requests; a phone number on every account and booking, with email optional; text and email codes to verify them, guests included; team accounts created only by the admin; jobs assigned by the admin and managers; start times from 10 AM to 7 PM with every job done by 8 PM; 2 driveway cars and 1 mobile job at a time; your number on the booking page and your address kept private; the "$200 gold rule" dropped. Details are in Section 17. The corrected plan for your approval is in Sections 6 to 14 and 18 to 20.

Severity scale: **CRITICAL** blocks launch or exposes data · **HIGH** serious risk or wrong core behavior · **MEDIUM** likely bug or gap · **LOW** hardening · **INFORMATIONAL** context. Findings are numbered F-01 to F-73 and referenced in Sections 16 and 18. Sections 2, 3, 4 and 17 hold the four categories: A already written, B incomplete, C not yet written, D business decisions. No migration SQL is written here; a few short expressions are quoted for precision.

## 2. What Actually Exists

Category A, already written: the draft defines 4 types, 11 tables, 12 functions (one unfinished) and 13 triggers, plus one row of settings, and every written part runs.

**Types**

| Type | Values |
| --- | --- |
| `user_role` | customer, team\_tier\_1, team\_tier\_2, admin |
| `appointment_status` | requested, under\_review, needs\_information, approved, confirmed, in\_progress, completed, cancelled, refunded, partially\_refunded |
| `intake_queue` | requests, review, spam |
| `service_kind` | exterior, interior, bundle, plastic, rubber, specialty |

**Tables**

| Table | Holds | Notable rules |
| --- | --- | --- |
| `profiles` | One row per login: role, name, phone, email, active flag, soft delete | Role defaults to customer; names reject links and emoji |
| `business_settings` | One row: hours 10:00–19:00, 30-minute steps, capacity 1, bookable 1–60 days ahead, America/Chicago, shop address, damage options that trigger review | Seeded with these defaults; the draft marks the 7 PM finish as an assumption |
| `blocked_days` | Closed dates with a reason | — |
| `services` | Catalog: code, kind, name, description, level, price in cents, minutes, bundle components, quote-only, active, sort | Empty: no menu seeded |
| `vehicles` | Customers' saved vehicles, soft delete | Text rejects links and emoji |
| `appointments` | Reference, contact snapshot, vehicle snapshot, conditions, damage, review reasons, photo paths, shop or mobile, date, start minute, duration, status, queue, money in cents | End time and final total are computed columns; indexed by date, customer and status |
| `appointment_items` | Name, price and minutes of each line, copied at booking | — |
| `appointment_events` | Status history with a customer-visible note | — |
| `appointment_assignments` | Staff assigned to a booking | One row per booking and person |
| `notifications` | In-app notices per person | Indexed by recipient, newest first |
| `audit_log` | Who changed what, with before and after copies | — |

**Functions**

| Function | What it does | Runs with |
| --- | --- | --- |
| `is_clean_text` | Rejects links and emoji | Caller's rights |
| `looks_like_junk` | Flags keyboard mash, one-character values and 4+ repeated characters | Caller's rights |
| `app_role`, `is_admin`, `is_team` | Read the caller's role from `profiles` (active, not deleted) | Owner's rights, fixed search path |
| `touch_updated_at` | Stamps `updated_at` | Caller's rights |
| `handle_new_user` | Creates a profile at sign-up; never takes a role from sign-up data | Owner's rights, fixed search path |
| `on_appointment_change` | Writes status history and in-app notices | Owner's rights, fixed search path |
| `audit_changes` | Writes the audit trail | Owner's rights, fixed search path |
| `get_availability` | Open start times for a date and a job length | Owner's rights, fixed search path |
| `get_calendar` | Open or full, per day, for up to 62 days | Owner's rights, fixed search path |
| `submit_booking` | The booking entry point (unfinished, Section 3) | Owner's rights, fixed search path |

"Owner's rights" means `SECURITY DEFINER`: the function bypasses RLS, so it must check everything itself. The fixed search path is `public, pg_temp`.

**Triggers:** `updated_at` stamps on 5 tables; profile creation on every new login; history and notices on every booking insert or status change; the audit trail on `profiles`, `services`, `business_settings`, `blocked_days`, `appointments` and `appointment_assignments`.

## 3. What Is Incomplete

Category B, incomplete: only `submit_booking` is partly written. It validates and prices a request, then stops before saving it.

What the written part does, in order:

1. **Spam trap.** If the hidden `website` field is filled, it logs the email and returns a fake reference. Nothing is saved (verified).
2. **Contact.** Signed-in customers use their profile; guests use what they typed. A first name, a phone with at least 10 digits and an email are required.
3. **Vehicle.** A saved vehicle must belong to the caller. Otherwise make and model are required, or a description when "Not sure" is chosen.
4. **Limits.** At most 12 modifications, 15 conditions and 6 photos. Photos need a signed-in customer and must sit in that customer's own folder.
5. **Checks.** Vehicle type and damage come from fixed lists. Links and emoji are rejected. Descriptions, notes, requests and addresses are capped at 1,000 characters.
6. **Location.** Shop or mobile; mobile needs an address.
7. **Price and length.** Either a bundle or exterior and interior levels, plus extras. Prices and minutes come only from the catalog.
8. **Slot.** Locks the date, then re-checks the chosen start time for the length it computed.
9. **Triage.** Junk-looking vehicle text, or a damage option listed in settings, sends the request to the review queue with reasons.
10. **Surcharge.** Looks up a percentage in `vehicle_size_rules` and applies it.

It stops after step 10. Still to write in this function:

- storing the mobile fee as $0, for staff to set after review (the column exists)
- the booking reference
- saving the appointment and its line items
- returning the reference, status and totals to the website

The website expects `{ ref }` back and reads two error forms: `slot_unavailable` and `invalid_input: <message>`.

## 4. What Has Not Yet Been Written

Category C, not yet written: fourteen pieces are missing, and without the first five the website can neither book nor protect its data.

| # | Missing piece | Why it's needed | Without it |
| --- | --- | --- | --- |
| 1 | Vehicle size rules table | `submit_booking` and the website both read it | Every booking fails with a database error; the website disables booking and shows its placeholder prices |
| 2 | Service catalog seed | Bookings are priced from it | Every service is rejected as unknown |
| 3 | RLS on every table, with policies | The only lock on Supabase tables | Either everything is public or everything is blocked |
| 4 | Explicit privileges for tables and functions | Supabase's defaults grant everything | Security rests on RLS alone |
| 5 | Vehicle-photo bucket and storage policies | The website uploads to `vehicle-photos` | Uploads fail, or photos become public |
| 6 | A price quote function | One pricing routine for the screen and the booking | Website and database disagree on totals (F-64) |
| 7 | The 24-hour hold, decided today | Unapproved requests must release their slot | Requests hold slots until someone acts |
| 8 | Abuse controls for guest requests | The booking function is open to anyone | One script can block the calendar (F-27) |
| 9 | Staff actions: approve, confirm, decline, reschedule, cancel, assign | Requests need a way forward | Every status change is a manual database edit |
| 10 | Customer actions: edit profile, manage vehicles, cancel a request | Accounts need self-service | Same |
| 11 | Sign-up and contact sync with Auth | Phone-first accounts, decided today | Profiles have no phone (F-35) |
| 12 | First-admin setup and role changes | Someone must be admin | Only a raw database edit can make you admin |
| 13 | Account deletion and anonymization | Deleting a customer is blocked today | Deletion requests can't be honored (F-55) |
| 14 | Tests | Prove the access rules, pricing and double-booking protection | An unverified launch |

Items 9, 10 and 13 can be split between Migration 001 and later migrations; Section 18 proposes the split.

## 5. Current Database Architecture

&#91;embedded content: database map · 11 tables, 3 missing pieces\]

The website reaches the database four ways: the booking function, the availability functions, photo storage, and direct reads of five tables (services, size rules, settings, profiles, vehicles). Only the booking function writes bookings, and it stops before saving; the dashed parts don't exist yet.

The corrected design (Section 18) adds vehicle types, pricing rules, job requests, review requests and a blocked email-domain list. The map will be redrawn once you approve the plan.

## 6. Booking Flow Audit

The booking path has the right shape — one database function, prices from the catalog, a locked re-check — but it ends before saving, and its contact rules now contradict today's decisions.

| Step | Website (prototype) | Database (draft) | Findings |
| --- | --- | --- | --- |
| 1. Contact | Guests type name, phone and email; signed-in customers see their profile, with no fields | Guests: first name, 10+ digit phone and email required. Signed-in: profile values win | F-02, F-03 |
| 2. Vehicle | Saved vehicles, or make, model, year, color and type; "Not sure? Type here"; modifications, condition, damage; photos for signed-in customers | A saved vehicle must be the caller's; make and model, or a description; type and damage checked | F-06 |
| 3. Service | Build your own (Levels 1–4) or Bundles; plastic and rubber extras; running total | A bundle or levels, never both; extras; catalog prices and minutes | F-64, F-65 |
| 4. Location | Come to us, or We come to you with an address | Shop or mobile; address required for mobile; mobile fee $0 until staff set it | — |
| 5. Date and time | 28-day calendar from tomorrow; start times for the website's own job length | `get_calendar` and `get_availability`; the booking recomputes the length | F-66 |
| 6. Review and send | Uploads photos, then calls `submit_booking` | Unfinished: nothing is saved | F-01 |
| 7. Confirmation | Shows the reference and "Request received" | Not written | F-01 |

**Findings**

- **F-01 · CRITICAL** — `submit_booking` stops before saving the appointment, its line items or a reference, so no booking can be completed. The remainder is listed in Section 3.
- **F-02 · HIGH** — Every booking requires an email ("a valid email is required"). Today's decision makes email optional for accounts, so phone-only customers would be rejected. Keep the phone required; accept a missing email from account holders, and from guests too (decided Oct 3: email is optional for everyone).
- **F-03 · MEDIUM** — A signed-in customer missing a required profile field sees no field to fill. Phone is guaranteed once F-35 is fixed, because every account is created with one; first name is not. The error appears only at the final step, and the account page doesn't exist yet. Options: (a) the booking asks for the missing field and saves it to the profile through a function; (b) sign-up collects it; (c) both. Recommended: both. Today, an empty profile field is silently filled from typed guest details, and the website sends whatever guest details remain from an earlier draft, unseen by the customer.
- **F-04 · LOW** — Nothing guards against a repeated submit. A retry after a lost response is refused as "That time was just taken" — by the customer's own booking. Recommended: a request ID from the browser, stored once.
- **F-05 · LOW** — Malformed values (a bad date, time or vehicle ID) raise raw database errors. A malformed vehicle ID is parsed before the spam trap runs, so a bot sending one gets an error instead of the fake success (verified); bad dates and times are parsed after the trap. Recommended: explicit input checks and stable error codes.
- **F-06 · LOW** — Conditions and modifications accept any clean text, while type and damage must come from fixed lists. Make, model, year and color have no length limit.
- **F-07 · INFORMATIONAL** — The prototype asks for contact details first; the brief lists service first. The brief said "such as", so the order isn't locked. No change proposed now.

**Corrected booking flow — PROPOSED, REQUIRES APPROVAL**

1. The customer picks the location first. "We come to you" is for addresses within 10 miles of Parker, with a note that you need their outdoor water and power. "Come to us" shows only Parker, Texas; your address comes with your confirmation.
2. They pick services and vehicle, including its size (Standard or XL) and any stains. The quote function prices it in cents, mobile percentage included, and returns its length (Section 7). XL vehicles, and stains that need review, get no price until you set the extra cost.
3. They pick a day and one of the open start times between 10 AM and 7 PM; only times where the job is done by 8 PM are offered. Or they call the number on the booking page instead. This works the same for "Come to us" and mobile.
4. Guests enter their name and phone, and confirm the phone with a 6-digit text code. If they add an email, they confirm it with an email code too. Account holders are already signed in. Photos upload only after this step.
5. `submit_booking` re-checks everything: a confirmed phone, the caps, the prices and rules, the service area, and the time under the date lock.
6. It saves the booking and its lines, sets the 24-hour hold, picks the lane (Requests, Review or Spam) and returns the reference, status and totals.
7. Guests are signed out after sending, so the next person on a shared device can't see their booking (proposed).
8. You or a manager approve it, decline it or change the time. For XL vehicles or stains, you set the extra cost, and the customer gets the full price right away. Approval makes the hold permanent. A confirmed "Come to us" booking shows that customer your address and time (proposed).

## 7. Pricing Audit

The draft gets the principle right — the database prices every booking from its own catalog, in whole cents — but its model cannot express today's menu.

**Current menu (owner, Oct 3, 2026)**

| Service | Type | Price | Minutes (provisional) | Mobile (split proposed, X-23) | Notes |
| --- | --- | --- | --- | --- | --- |
| Exterior Basic | Exterior | $49.99 | 60 | +2.5% | Snow-foam pre-wash, wheels and tires, glass, hand wash and dry |
| Exterior Deluxe | Exterior | $94.99 | 90 | +7% | Everything in Basic, plus Hydro Foam sealant, gloss and water beading |
| Interior Basic | Interior | $59.99 | 60 | +2.5% | The brief listed $39.99, the old site's price; the owner's list replaces it |
| Interior Deluxe | Interior | $134.99 | 120 | +7% | Everything in Basic, plus deep steam or shampoo; steam included |
| Signature Combo | Bundle | $99.99 | 120 | +7% | Exterior Basic + Interior Basic ($109.98 separately) |
| Full Detail Bundle | Bundle | $209.99 | 210 | +7% | Exterior Deluxe + Interior Deluxe ($229.98 separately); steam included |
| Perfect Finish Sealant | Add-on | $44.99 / $54.99 / $64.99 | Not set | +2.5% | Car, Coupe, Sedan / SUV, Minivan, Crossover / Truck, Large SUV. Van, Convertible and Other not set. Needs an exterior service |
| Steam Cleaning | Add-on | $49.99 | Not set | +2.5% | Can't be booked alone; "Included" at $0 with Interior Deluxe |
| Larger vehicles | Adjustment | +5–10% | — | — | An extra cost you set for XL vehicles, with 5–10% as your guide; no price shown until you set it |
| Modifications | — | $0 | — | — | Recorded for preparation only |

Not yet priced, so not bookable: the four-tier bundle system; semi-ceramic coating wash; Koch-Chemie wax; Koch-Chemie Ceramic Effect; additional paint protection; Plastic Care (Basic, Deluxe, Alchemist Restoration); Rubber Care Basic; Alchemy Rubber Restoration; full-day deep interior restoration; seat-removal interior restoration; full steam or extraction restoration; advanced rubber and plastic restoration; future ceramic coating. Only the sealant and steam cleaning still need durations (X-7).

What already works:

- The browser cannot submit a price: prices and minutes come only from `services`.
- Money is stored in whole cents, and the total is a computed column.
- `appointment_items` and the booking's value, savings, surcharge and fee columns keep each booking's price after the menu changes, once the save is written.

**Findings**

- **F-08 · CRITICAL** — `vehicle_size_rules` is read by `submit_booking` and by the website but never created. Every booking would fail with a database error. The website would then disable booking ("Booking is unavailable right now") and keep showing its built-in placeholder prices.
- **F-09 · HIGH** — No catalog rows are seeded, so every service is rejected as unknown.
- **F-10 · HIGH** — The size adjustment doesn't match the menu. The draft applies one percentage per vehicle type to the whole discounted subtotal, add-ons included. The menu needs rates that vary by size and service, a rule for whether add-ons already priced by size (the sealant) also get a percentage (D-02), and a rule for "Not sure" vehicles (D-03).
- **F-11 · MEDIUM** — The catalog holds one price per service, so the sealant's three size prices can't be stored. Options: a price per vehicle category for size-priced services, or one catalog row per size.
- **F-12 · MEDIUM** — Vehicle categories disagree. The menu names Sedan, Coupe, Crossover, SUV, Minivan, Truck, Large SUV and Van. The draft and prototype use Sedan, Coupe, SUV, Truck, Minivan, Crossover, Convertible, Van and Other: no Large SUV, and no price tier for Convertible or Other.
- **F-13 · MEDIUM** — Add-on rules are missing. Nothing stops charging Steam Cleaning on top of Interior Deluxe or the Full Detail Bundle, which include it. The draft also requires a main service on every booking, so a standalone steam booking is impossible, and nothing ties the sealant to a wash. The database must enforce whichever rules you choose (D-04).
- **F-14 · MEDIUM** — The service kinds don't fit the menu: `plastic` and `rubber` are unpriced, and the sealant and steam have no kind. Replace them with a general add-on kind; keep unpriced services inactive or quote-only.
- **F-15 · LOW** — Bundle components are plain text codes, not references, and the booking doesn't check they exist or are active. A bundle with a missing part is refused with the misleading "That time was just taken"; one with a retired part is priced from it. Nothing ensures a bundle costs less than its parts.
- **F-16 · LOW** — The stored "final" total excludes the mobile fee until staff set it, and nothing marks a total as an estimate. The website already says the price is confirmed after review; the data should say so too.
- **F-17 · INFORMATIONAL** — The size adjustment depends on the type the customer picks, and a blank type is priced as "Other". Staff confirm on site.
- **F-18 · INFORMATIONAL** — A comment on `service_value_cents` mentions a "$200 gold rule". Owner decision: drop it, so the comment goes.

**Corrected pricing design — PROPOSED, REQUIRES APPROVAL**

The database prices every booking in cents through one quote function, which the website also calls to show prices (fixes F-64).

1. Services at menu price. A bundle replaces its two parts at the bundle price; the difference shows as the bundle saving.
2. Add-ons: the sealant at its price for the vehicle type; steam at $49.99, or "Included" at $0 when Interior Deluxe is in the booking, on its own or inside the Full Detail Bundle. Add-ons can't be booked alone, and the sealant needs an exterior service.
3. Mobile: each line gets its mobile percentage, rounded to the cent. Basic services and add-ons get 2.5%; Deluxe services and both bundles get 7% (decided Oct 3). Distance doesn't change the price, and "Come to us" bookings pay no mobile percentage. The percentages are settings, to change once you have your own water and power.
4. Extra cost, set by you only (decided Oct 3): the website shows the normal price, with no estimate for bigger vehicles. If the customer picks XL, or a stain option that needs review, the booking shows no price until you enter the extra cost; then the customer sees the full price right away. For any other booking you can still add an extra cost after you see the car, and you tell the customer right away. Proposed: the extra cost is an amount you enter, separate from the mobile percentage.
5. Length: each service's minutes. A bundle uses its own minutes, by default its two parts added together; an included add-on adds no time. A service with no minutes set can't be booked (F-25, F-66).

Services are identified by stable codes such as `ext_basic`, never by their position in a list (F-65). Size-priced add-ons get a price per vehicle type (F-11), the add-on kind replaces the unpriced plastic and rubber kinds (F-14), and bundle parts become real references (F-15). Each booking keeps its own copy of its lines and totals, so later price changes never alter it.

## 8. Availability & Double-Booking Audit

Double-booking protection is correct for new requests; the gaps are the 24-hour hold, staff changes, travel time and a few edge cases.

How the draft decides a start time is open:

1. Hours 10:00 to 19:00, with every job finished by close; 30-minute steps; one job at a time; bookable 1 to 60 days ahead; Central time.
2. A start time is open if fewer than `capacity` bookings overlap it. Spam-queue, cancelled and refunded bookings don't count; everything else does, including the review queue.
3. `submit_booking` locks the date, then re-checks the chosen time for the length it computed itself. Two requests for the same day run one after the other, and the second sees the first.
4. Times are stored as a local date plus minutes after midnight, so daylight-saving changes never shift a booking.

Verified on the scratch database: a 2-hour job tomorrow has 15 start times (10:00 to 17:00); one long review-queue request blocks the whole day; moving it to spam frees the day. The lock is correct under the project's READ COMMITTED setting (checked live), as long as the booking is saved inside the same function call.

**Findings**

- **F-19 · MEDIUM** — The 24-hour hold decided today isn't modeled. Unapproved requests (requested, under review, needs information) block their slot until someone changes the status. Needs: a hold-expiry time on each request, availability that ignores expired holds, and a rule for approving a request whose slot was taken meanwhile (D-06).
- **F-20 · MEDIUM** — Every path that creates or moves a booking must take the same date lock and re-check: staff reschedules, approvals after a lapsed hold, admin edits. None exists yet. A direct table update would skip the check, so schedule changes must go through functions.
- **F-21 · MEDIUM** — There's no travel or buffer time. With one detailer, a mobile job ending at 12:00 and a shop job starting at 12:00 both fit. Decide the buffer per location type (D-13).
- **F-22 · LOW** — The same hours apply every day, and days off exist only as blocked dates. The draft itself marks the 7 PM finish as an assumption (D-13).
- **F-23 · LOW** — If same-day booking is ever enabled, start times already past are offered (verified: at 11:03, the 10:00 to 11:00 times were offered).
- **F-24 · LOW** — `get_calendar` runs one count per slot per day, about 500 queries for a 28-day view, and anyone can call it. Rewrite it as a single query.
- **F-25 · LOW** — Service minutes default to 0. A bookable service saved without a length shows no times when booked alone, and reserves no time when combined with another service, so the calendar is under-booked.
- **F-26 · INFORMATIONAL** — Capacity is one number for the whole business. Per-detailer schedules aren't modeled, which is fine for a solo business.

**Corrected design — PROPOSED, REQUIRES APPROVAL**

Open times come from your hours and how many jobs fit at once, not from staff schedules: a shift is the job's own time block (decided Oct 3).

| Rule | Value now | How the database applies it |
| --- | --- | --- |
| Days open | Every day | The admin adds closed dates to `blocked_days` |
| Start times | 10:00 AM to 7:00 PM, every 30 minutes (decided Oct 3) | Settings |
| Latest finish | 8:00 PM (decided Oct 3) | Start + length must end by 8:00 PM; buffers apply between jobs |
| Booking window | 1 to 60 days ahead | Settings |
| "Come to us" (driveway) jobs at once | 2 | Setting |
| Mobile jobs at once | 1 (approved Oct 3) | Setting |
| Driveway and mobile at the same time | Not while you're mostly solo (approved Oct 3) | A switch you turn on when you have staff |
| People per job | Several people can work one car; one person handles up to 2 driveway cars or 1 mobile job (decided Oct 3) | Assignment checks |
| Mobile service area | Within 10 miles of Parker; distance doesn't change the price (decided Oct 3) | Proposed: a list of ZIP codes within about 10 miles, which the admin can edit. You still see every address before approving |
| Buffer and travel time | Not set yet (X-8) | Settings per location type; 0 until set |
| Hold on a new request | 24 hours, adjustable | A hold-expiry time on each request |

What takes up time on the calendar:

- Confirmed and in-progress jobs, always.
- New requests, including Review and "needs information", until their 24-hour hold lapses.
- Never: spam, declined, cancelled or completed jobs.

Every path that adds or moves a job locks the date, then re-checks the limits, as the draft's booking function already does. That covers a new request, approving a request whose hold lapsed, a time change, and moving a request out of Spam (F-19, F-20). Assigning an employee also checks, under the same lock, that they aren't overbooked. One person can work up to 2 driveway cars at once, or 1 mobile job, never both, and several people can work one car (decided Oct 3). When people are added to finish faster, staff can shorten the booked time (proposed).

The calendar is computed in one query, never offers past times, and shares its rules with the booking function, so what the customer sees is what the database accepts (F-21 to F-24, F-26).

## 9. Spam/Abuse Audit

One script can block every bookable day within minutes; the 24-hour hold limits how long a block lasts, not how often it can be repeated.

How an unverified request moves through the system:

1. The website's public key lets anyone call `submit_booking` directly, skipping the page and its hidden spam field.
2. Any plausible name, a 10-digit number and an email-shaped string pass. None is verified.
3. The request lands in the normal or review queue and holds its slot. With one job at a time, each request removes its hours from the calendar. A long enough request blocks a whole day (verified with a full-day test request), so somewhere between a few dozen and a few hundred requests fill the 60-day window, depending on service lengths (D-01).
4. Every request sends an in-app notice to every admin.
5. With the 24-hour hold, each block lapses after a day, and the next run creates it again.

**Findings**

- **F-27 · HIGH** — Unverified requests can exhaust the calendar (above).
- **F-28 · MEDIUM** — The hidden-field spam trap only catches bots that fill in the form; direct API callers skip it. Keep it as a filter, not a control.
- **F-29 · MEDIUM** — Anyone can book under someone else's phone and email, and staff would then call or text that person.
- **F-30 · MEDIUM** — One in-app notice per admin per request, with no cap, so a flood buries real requests.
- **F-31 · MEDIUM · CONFLICT** — Requests caught by the spam trap are invisible: a fake success and one log line with the email. The intended behavior is a separate queue the team can inspect.
- **F-32 · LOW · CONFLICT** — A "Not sure" request with a plausible description goes to the normal queue. The brief routes uncertain or unidentified vehicles to review.
- **F-33 · LOW** — One-character models (Tesla 3, S, X, Y; Mazda 3, 6) count as junk and go to review (verified).
- **F-34 · LOW** — Every spam-trap hit writes an audit row, with no limit.

**Options for stopping calendar abuse (F-27)**

| Option | How it works | What it stops | Cost and trade-offs |
| --- | --- | --- | --- |
| A. Per-phone caps | The database limits open requests per phone number and per day | Repeats from one number | Free; an attacker can rotate fake numbers |
| B. Phone verification | A guest enters a texted 6-digit code before the request holds a slot, using the same SMS provider phone-first accounts need | Fake numbers; booking under someone else's number | A per-text cost; one extra step for guests |
| C. Bot challenge | Cloudflare Turnstile or hCaptcha, checked by an Edge Function that then calls the database; direct calls are closed | Scripts | An Edge Function in front of booking; a little friction |
| D. Only verified requests hold slots | Unverified requests are saved but hold nothing until verified or approved | Calendar blocking entirely | Two people can request the same time, and staff choose |
| E. Accounts required | Only phone-verified accounts can book | Most abuse | Removes guest booking, which the brief requires |

Supabase's built-in CAPTCHA protects sign-up and sign-in, not database functions, so guest booking needs its own check (option C).

**DECIDED (Oct 3) — design PROPOSED, REQUIRES APPROVAL:** everyone who books confirms their phone with a text code first, guests included. That is option B, with option A's caps, the hidden spam field and a bot check on every code request. Because every request is verified, option D's rule holds on its own.

1. A guest enters their phone and gets a 6-digit text code. Entering it signs them in to a password-free login that Supabase keeps for that number. If they create an account later, their past bookings are already theirs (closes F-39).
2. `submit_booking` accepts only signed-in users whose phone is confirmed. Signed-out visitors can read the menu and open times, and nothing else.
3. Caps the admin can change: 3 open requests per customer and 5 new requests a day per customer (proposed values). Sending the same request twice within 10 minutes returns the first booking instead of a copy (F-04).
4. Supabase's bot check (Cloudflare Turnstile or hCaptcha) guards every code request, and Supabase's rate limits cap codes per number and per hour. Twilio Verify's country settings allow only US numbers, so nobody can run up costs on overseas texts (F-38). The project-wide hourly text limit is tuned so a script can neither run up costs nor lock out real customers for long.
5. A request with the hidden spam field filled in is saved to Spam and holds no time.
6. New-request notices go to managers and the admin; with verified senders, a flood is far less likely (F-30).

What's left of F-27: someone with many real phones could still hold times, 24 hours each, at the cost of a code per number. Booking under someone else's number is no longer possible, because the code goes to that phone (closes F-29).

**Representing suspicious submissions (F-31, F-32)**

| Lane | What lands there | Holds time? | Who sees it |
| --- | --- | --- | --- |
| Requests | Normal requests, including vehicles marked "Unidentified / Not sure" | Yes, for 24 hours until approved | Managers and admin in full; detailers see open jobs without contact details |
| Review | Damage marked Unknown or Other, junk-looking text, and anything staff move there | Yes, like other requests | Managers and admin decide; any staff member can request a review |
| Spam | Hidden-field hits, and anything staff mark as spam | No | Managers and admin |

**DECIDED (Oct 3):** three lanes — Requests, Review and Spam. Proposed: all three stay in `appointments`, in the draft's `queue` column. No separate spam log is needed, because only verified, signed-in users can submit. Staff can move a request between lanes; moving one out of Spam re-checks its time. Spam is kept until a retention period is chosen. This closes F-31; D-07 resolves F-32.

**Short model names (F-33):** accept a one-character model when the make is a known make, or keep a short-model list per make (for example Tesla 3, S, X, Y). Keep the keyboard-mash and repeated-character checks. The junk check only sorts requests between queues; abuse protection comes from options A to D, so this change doesn't weaken it.

## 10. Authentication Audit

Phone-first accounts with optional email, decided today, need three things the draft lacks: the phone taken from Auth, email made optional, and an SMS provider.

What already works:

- A profile is created automatically at sign-up, and the role always starts as customer. The draft never reads a role from sign-up data, which closes the most common Supabase privilege escalation.
- The website reads the session from Supabase Auth. Browser storage holds the unsent draft (contact details included), preview-mode submissions and Supabase's own sign-in session; none of it is the source of truth.

**Findings**

- **F-35 · HIGH** — The sign-up trigger copies the phone only from sign-up metadata. Supabase phone sign-up stores the verified number on the login record itself, so every phone-registered profile would have no phone. Take the phone from the login record, as the email already is, and store one format: Supabase keeps numbers without the leading "+".
- **F-36 · MEDIUM** — The profile's phone and email are copies that never update. Customers add their email later by design, so bookings would carry missing or stale contact details. Sync both from Auth when they change.
- **F-37 · MEDIUM** — Phone sign-in needs an SMS provider (Twilio, MessageBird, Vonage or TextLocal) set up in Supabase Auth, billed per text. This is a launch dependency, not migration code ([Supabase: Phone Login](https://supabase.com/docs/guides/auth/phone-login)).
- **F-38 · MEDIUM** — Anyone can make the site send paid texts by requesting codes in bulk ("SMS pumping"). Turn on Supabase's CAPTCHA for sign-in and keep its rate limits before launch ([Supabase: features](https://supabase.com/docs/guides/getting-started/features)).
- **F-39 · MEDIUM** — Linking past guest bookings to a new account isn't designed. It must match a verified phone, never typed contact details, or one person could pull another's history into their account.
- **F-40 · MEDIUM** — There is no way to create the first admin or change anyone's role except editing the database by hand. Needs a one-time owner setup and an admin-only role change.
- **F-41 · LOW** — Staff and admin accounts have no second factor. Recommended: multi-factor sign-in for admin and manager (D-17).

**Corrected design — PROPOSED, REQUIRES APPROVAL**

| Who | Signs in with | Phone checked by | Email |
| --- | --- | --- | --- |
| Customer with an account | Phone and password | A 6-digit text code at sign-up and password reset | Optional; checked with a 6-digit email code |
| Guest | A text code, no password | A 6-digit text code when booking from a new device | Optional; checked separately with an email code if given |
| Manager or detailer | Phone and password, on an account the admin creates | A text code at first sign-in | Optional, as for customers |
| Admin (you) | Phone and password | A text code at sign-up | Optional |

- Profiles take the phone and email from Supabase Auth, never from typed form data, and only once confirmed (fixes F-35 and F-36). Numbers are stored the way Supabase stores them: a 1 followed by the 10-digit US number, with no plus sign.
- Input checks, as agreed Oct 3 (exact character rules proposed): names allow letters, spaces, hyphens, apostrophes and periods, and block keyboard mashing, long runs of one letter, digits, other symbols and swear words. Last names are optional. An email is accepted only once it receives its code, and throwaway-email services are blocked using a public list.
- Only the admin creates team accounts, through a small server function that holds Supabase's admin key and sets the role. Role changes are admin-only (closes F-40).
- Your own admin account: you sign up on the site, then a one-time setup step makes that account the admin.
- Launch setup, outside the migration: Twilio Verify for texts (X-11), an email-sending service for email codes, and the bot check's keys (F-37, F-38).
- Multi-factor sign-in for admin and manager stays open (D-17, F-41).

**Also needed — PROPOSED, REQUIRES APPROVAL**

- Text-code sign-in stays on for guests, and Supabase then lets any phone account sign in with a text code alone, yours included. A stolen phone or a hijacked number would open the admin account. Proposed: an authenticator-app code as a second step for admin and manager accounts, checked inside every staff function (D-17, X-19).
- Supabase Auth must have phone confirmations on, or phone sign-ups count as confirmed without any text. The team-account function never marks a phone as confirmed itself. W-16 tests both.
- A guest who later creates an account already has a login, so creating the account means confirming the phone with a code, then setting a password. Making a former guest a team member promotes their existing login instead of creating a second one.

## 11. Authorization Audit

Roles come from the database rather than the login token, which is right, but the draft can't tell a manager from a detailer, and nothing yet says what either may do.

Roles decided Oct 3: customer, detailer (tier 1), manager (tier 2) and admin (you). The draft's customer, team\_tier\_1, team\_tier\_2 and admin are renamed to match.

What already works:

- Every role check reads `profiles` and requires an active, non-deleted account, so deactivating staff takes effect immediately.
- Owner-rights functions pin their search path, and outside users can't create objects in `public` (checked on the live project).

**Findings**

- **F-42 · HIGH** — Replace the two tier roles with your three named roles: admin, manager and detailer. `is_team()` treats both tiers the same, so every staff permission would apply to both. Per-role permissions were approved on Oct 3; the matrix follows.
- **F-43 · MEDIUM** — No explicit privileges. By default anyone can write every table and run every function, so security rests on RLS alone. Revoke writes on booking tables, grant only the reads each role needs, and set function access one by one. Tested on the updated\_at trigger: a trigger keeps firing after access to its function is revoked. `is_clean_text` must stay callable by signed-in users while customers edit vehicle and profile rows directly, because those tables' checks call it.
- **F-44 · MEDIUM** — No staff actions exist (approve, confirm, reschedule, cancel, assign, set fees, notes), and no customer actions (edit profile, manage vehicles, cancel a request). Each must check the caller's role inside the function.
- **F-45 · LOW** — Owner-rights functions use the search path `public, pg_temp`. That's safe today, but an empty search path with schema-qualified names is stricter.
- **F-46 · LOW** — `is_clean_text`, `looks_like_junk` and `touch_updated_at` have no fixed search path, which Supabase's linter flags. Low risk, because they run with the caller's rights.
- **F-47 · INFORMATIONAL** — In policies, call helpers as `(select public.is_admin())` so Postgres evaluates them once per query instead of once per row.
- **F-48 · INFORMATIONAL** — The live project's one advisor warning is about a Supabase-installed helper, `rls_auto_enable`. Calling it from outside just errors, and revoking that access is safe (tested; [Supabase linter](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).

**Permission matrix — APPROVED Oct 3.** Rows or cells marked "proposed" were added afterwards and still need your OK.

| Capability | Customer | Detailer | Manager | Admin |
| --- | --- | --- | --- | --- |
| Own profile, vehicles and bookings | Yes | Yes | Yes | Yes |
| Request a review; log own hours (Migration 002) | — | Yes | Yes | Yes |
| Take an open job | — | Asks for it | Assigns directly | Assigns directly |
| See open jobs | — | Yes, without customer contact details or photos (photos: proposed) | Yes | Yes |
| Jobs assigned to them, with contact, address and photos (proposed) | — | Yes | Yes | Yes |
| Approve or decline new requests; set times | — | — | Yes | Yes |
| Assign jobs; approve job requests | — | — | Yes | Yes |
| Make Review decisions; see Spam | — | — | Yes | Yes |
| Set the extra cost on a booking, for XL size or stains (decided Oct 3: you only) | — | — | — | Yes |
| Cancel a confirmed appointment | — | — | — | Yes |
| Create team accounts; change roles, prices and settings; read the audit log | — | — | — | Yes |

An open job is a confirmed booking with nobody assigned yet.

## 12. RLS Design

Booking data is written only through database functions and read through narrow policies, so nothing a browser sends can change ownership, role, price or status.

- **F-49 · CRITICAL** — No table has RLS or a single policy (verified: RLS is off on all 11 tables, and Supabase's default grants give signed-out visitors every table right). Under Supabase's defaults, anyone with the website's public key could read and write every table, contact details and the audit log included. On this project, the auto-enable trigger would instead block every read, the website's menu included.
- **F-50 · MEDIUM** — A plain "own rows" policy on `appointments` would show customers internal triage fields: the queue and the review reasons. Customers should read bookings through a function that returns customer-facing columns only. A view doesn't solve this: a plain view skips RLS because it runs with its owner's rights, and a security-invoker view needs direct read access to the table, which exposes the triage columns.

Principles:

1. Revoke Supabase's default table rights, then grant back only what each role reads or edits.
2. No direct insert, update or delete on booking tables (`appointments`, `appointment_items`, `appointment_events`, `appointment_assignments`, `audit_log`). Functions do every write and check the caller.
3. Customers reach rows only through their own login ID. Staff reach rows by role, per the matrix in Section 11.
4. Signed-out visitors read only the menu, open times and display settings. Booking needs a signed-in user with a confirmed phone, guests included (Section 9).
5. No hard deletes from the browser. Deletions are soft, or done by an admin function.

**Per-table design — PROPOSED, REQUIRES APPROVAL.** Staff rights follow the approved matrix in Section 11. Each customer and staff cell answers read · add · edit · delete, in that order.

| Table | Customer: read · add · edit · delete | Staff: read · add · edit · delete | Admin only | Writes only through functions? | Ownership rule | Attack paths closed |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | Own row · No, created at sign-up · Own first and last name only · No, deletion function | Managers: customers and team; detailers: own row only · No · No · No | Role and active flags; creating team accounts | Yes for role and flags; phone and email synced from Auth once confirmed | Row ID equals login ID | Self-promotion to admin; reading other customers' details; unverified contact details |
| `vehicles` | Own · Own · Own, owner fixed · No, soft delete by edit | None: each job carries its own copy of the vehicle · No · No · No | Hard delete, inside the deletion function | No: direct and column-limited | Owner equals login ID on every add and edit | Reading or editing another's vehicle (F-67) |
| Catalog: `services`, vehicle types, bundle parts, add-on rules, prices by vehicle type (new) | Active rows · No · No · No | Active rows · No · No · No | Every write; services are retired, never deleted | Optional | — | Price tampering |
| `business_settings` | Display fields through a function, never your address · No · No · No | Managers: all · No · No · No | Edit | Optional | — | Learning the triage rules or your home address; changing capacity or hours (F-68) |
| `blocked_days` | Through availability only | Managers: all · No · No · No | Add, edit, delete | Optional | — | Closing every day; reading private reasons |
| Blocked email domains (new) | Through the email-check function only | Same | Edit | Optional | — | Reading or editing the list |
| `appointments` | Own, customer columns only, through a function · Through `submit_booking` · No; customer changes come in Migration 002 · No | Detailers: assigned jobs in full, open jobs through a function without contact details; managers: all · No · Through functions, per Section 11 · No | Cancel confirmed jobs | Yes, every write | Customer ID equals login ID; assignment for detailers | Guessing references; reading others' addresses; changing status or price; moving a booking around the lock |
| `appointment_items` | Lines of own bookings · No · No · No | As their bookings · No · No · No | — | Yes: `submit_booking` only | Through the booking | Editing a price after booking |
| `appointment_events` | History of own bookings · No · No · No | As their bookings · No · No · No | — | Yes: trigger only | Through the booking | Forging history |
| `appointment_assignments` | None, or the assigned person's first name through a function | Detailers: own; managers: all, written through functions | All | Yes | — | Self-assigning to read customer data |
| Job requests (new) | None | Detailers: own, created through a function; managers: all, decided through a function | All | Yes | Requester equals login ID | Granting yourself a job |
| Review requests (new) | None | Requester: own; managers: all; created and resolved through functions | All | Yes | Requester equals login ID | Hiding or forging a review request |
| `notifications` | Own · No · Mark own as read · No | Same, own only | — | Created by functions and triggers only | Recipient equals login ID | Reading or forging notices |
| `audit_log` | None | None | Read only; purged per D-12 once a period is set | Yes: triggers and functions | — | Erasing tracks; exposing personal data |
| Storage `vehicle-photos` | Section 13 | Section 13 | Section 13 | Section 13 | Folder name equals login ID | Section 13 |

**Function access**

| Function | Signed out | Signed in | Note |
| --- | --- | --- | --- |
| Menu, quote, `get_availability`, `get_calendar`, email check | Yes | Yes | Return no personal data |
| `submit_booking` | No | Yes, with a confirmed phone | Checks everything itself |
| My bookings | No | Yes | Own rows, customer columns only; a confirmed "Come to us" booking also shows your address |
| Open jobs for detailers (new) | No | Staff | No customer contact details |
| Staff actions: approve, decline, set time, assign, job and review requests, lanes, booking prices | No | Staff | Each checks the caller's role against Section 11 |
| Admin actions: cancel, roles, settings; team accounts | No | Admin | Team accounts are created by a server-side function holding Supabase's admin key |
| Role helpers | No | Yes | Used only in policies limited to signed-in users; the public menu's policies never call them, so signed-out visitors get no errors |
| `is_clean_text` | No | Yes, while customers edit rows directly | Table checks call it (tested) |
| `looks_like_junk` | No | No | Used inside the booking function |
| Trigger functions | No | No | Triggers still fire (tested on the updated\_at trigger) |

Every policy will be tested as a signed-out visitor, a guest, customer A, customer B, a detailer, a manager and an admin before Migration 001 counts as complete.

## 13. Storage Design

Vehicle photos belong in one private bucket, with a folder per customer, shown only through short-lived signed links.

Requirements already in the draft and prototype:

- Photos are optional: up to 6 per booking, 8 MB each, images only.
- Only signed-in users can attach photos. Guests count, because they sign in with their text code.
- `submit_booking` accepts only paths in the caller's own folder and rejects "..".

| Aspect | Proposed design |
| --- | --- |
| Bucket | `vehicle-photos`, private, never public; 8 MB per file; JPEG, PNG and WebP; no HEIC (proposed): Chrome and Firefox can't show it, and iPhones usually convert photos to JPEG when uploading through a website |
| Path | `<login ID>/<random ID>.<extension>`, as the prototype and the booking check already do |
| Ownership | The folder name is the owner; policies compare it with the login ID |
| Upload | Signed-in customers and verified guests, into their own folder only; staff none in Migration 001 (before-and-after photos can come later) |
| Read | Everyone views photos through signed links that expire within minutes. Owners see their own files; managers and admin see photos on any booking; detailers only on jobs assigned to them, not on open jobs (proposed). A database helper matches each file to a booking the viewer may see, for viewing and for signed links |
| Delete | Owners delete files not yet attached to a booking, checked by the same helper. Nobody can overwrite a file. Attached files stay as evidence of condition and damage. Admins delete any file; old files are purged per the retention decision |
| Link to bookings | Photos attach to bookings, not to saved vehicles; paths are stored on the appointment. At booking, check each file exists and belongs to the customer. A separate photo table, or a per-vehicle gallery, can wait |
| Abuse | Bucket size and type limits; a per-customer file cap; cleanup of files never attached, run on a schedule through Supabase's storage API (deleting database rows would leave the files behind); location data stripped |

**Findings**

- **F-51 · HIGH** — The bucket and its policies don't exist, so uploads fail. Created carelessly as a public bucket, customer photos — plates, homes, interiors — would be visible to anyone with a link.
- **F-52 · MEDIUM** — The prototype uploads the original file. Phone photos often carry GPS coordinates, which for a home visit means the customer's address. Strip location data before upload, by re-encoding in the browser, or on the server.
- **F-53 · LOW** — Photos upload before the booking is sent, so abandoned or failed bookings leave orphaned files. Needs a scheduled cleanup.
- **F-54 · LOW** — The booking checks a photo path's folder, but not that the file exists or is an image, so stored paths can point at nothing.

**DECIDED (Oct 3, D-11):** photos are never public, and staff see them only on bookings they have a reason to work on, per the read rule above. Still open: how long photos are kept. Files never attached to a booking are deleted after 24 hours (proposed, F-53).

## 14. Data Integrity Audit

Keys and price snapshots are well chosen; the gaps are deletion rules, a few missing checks, and audit copies that keep personal data indefinitely.

| Link | When the target is deleted | Effect today |
| --- | --- | --- |
| `profiles.id` → Auth login | Cascade | Deleting a login deletes its profile, if nothing below blocks it |
| `vehicles.owner_id` → `profiles` | No action | Blocks deleting any customer with a saved vehicle (verified) |
| `appointments.customer_id` → `profiles` | Set empty | The booking survives without its account |
| `appointments.vehicle_id` → `vehicles` | No action | Blocks deleting a vehicle used in a booking |
| `appointment_items.appointment_id` → `appointments` | Cascade | Lines go with their booking |
| `appointment_items.service_id` → `services` | No action | A sold service can only be retired, never deleted (correct) |
| `appointment_events.appointment_id` → `appointments` | Cascade | History goes with its booking |
| `appointment_assignments.appointment_id` → `appointments` | Cascade | Assignments go with their booking |
| `appointment_assignments` employee and assigner → `profiles` | No action | Blocks deleting staff with assignments |
| `notifications` recipient and booking → `profiles`, `appointments` | Cascade | Notices go with their owner or booking |

**Findings**

- **F-55 · MEDIUM** — Saved vehicles block deleting a customer, and assignments block deleting staff. **PROPOSED — REQUIRES APPROVAL**, with no blanket cascade:
  1. Deletion runs through a function, started by the customer or by an admin.
  2. It anonymizes rather than erases business records. The profile's name, phone and email are cleared and the profile is marked deleted; vehicles are soft-deleted. Bookings keep service, price, date and status, while contact details, address and photos are cleared per the retention decision (D-12).
  3. Foreign keys are set deliberately: a booking's vehicle link is emptied when a vehicle is removed, because the booking's own vehicle snapshot keeps the history; "assigned by" is emptied; staff are deactivated, never deleted.
  4. The login is removed last, by an admin action or an Edge Function holding the service key, after the profile is anonymized.
- **F-56 · MEDIUM** — `audit_log` keeps full before-and-after copies of profiles and bookings — names, phones, emails, addresses — with no time limit, so anonymization stays incomplete. Decide a retention period, and log changed fields without contact details.
- **F-57 · LOW** — Missing checks: the start minute within the day and on the 30-minute grid; a length above 0 for main services; money never negative; an address on every mobile booking; both parts named on every bundle; vehicle types limited to the category list.
- **F-58 · LOW** — Eight foreign keys have no index (`vehicles.owner_id`, `appointments.vehicle_id`, `appointment_items.appointment_id` and `service_id`, `appointment_events.appointment_id`, `appointment_assignments.employee_id` and `assigned_by`, `notifications.related_appointment_id`), which slows joins and deletes as data grows.
- **F-59 · LOW** — The settings' time zone isn't validated, so a typo would break availability for everyone.
- **F-60 · LOW** — Reference generation isn't written. The spam trap's fake references use 6 hex characters, about 16.8 million values. Real references need a longer random code and a retry on collision, and must never be the only key to look up a booking.
- **F-61 · INFORMATIONAL** — Vehicle changes aren't audited, while profile changes are.
- **F-62 · INFORMATIONAL** — The status list includes refunded and partially refunded, though payments are deferred. Leave them unused for now.
- **F-63 · INFORMATIONAL** — The migration can't run twice: a second run fails at its first line and rolls back cleanly (verified). Apply it through Supabase's migration tooling so it's recorded; a SQL Editor run isn't tracked.

**DECIDED (Oct 3, D-12):** your answer agrees with F-55's direction; the details in F-55 are still proposed. Business records stay, profile details are removed or anonymized once no longer needed, and nothing cascades by default. The retention period is still open.

Historical pricing is designed correctly: line items keep name, price and minutes; the booking keeps value, savings, surcharge and fee; the total is computed. Once the save is written, later price changes can't alter past bookings.

## 15. Prototype ↔ Database Mismatches

The website relies on four things the database doesn't do, and two of them can show a customer the wrong price or book the wrong service.

| ID | Severity | The website assumes | The database actually | Fix |
| --- | --- | --- | --- | --- |
| F-64 | MEDIUM | Adding dollar amounts gives a clean total | Works in whole cents. With today's menu, 23 of 80 combinations display broken totals, such as Exterior Basic + Interior Deluxe as "$184.98000000000002"; the Signature Combo's saving shows as "$9.990000000000009". A 5% adjustment on $49.99 shows $2 on screen against $2.50 in the database | A quote function returns line items and totals in cents; the site only formats them |
| F-65 | MEDIUM | A service's code is "ext\_", "int\_" or "bundle\_" plus its list position, and add-on codes are fixed | Looks services up by their stored code | Use catalog codes end to end; never reuse or rename a code; retire with `active = false` |
| F-66 | MEDIUM | Add-ons take 20 and 15 minutes | Uses each service's stored minutes | Take the job length from the quote function |
| F-67 | MEDIUM | Every vehicle it can read belongs to the user | Staff can read many customers' vehicles | Filter by owner, and enforce it in policy |
| F-68 | LOW | It can read the whole settings row | That row includes triage rules and capacity | Expose display fields only |
| F-69 | LOW | Service names and descriptions are safe to insert as page code | Only the admin can edit them (decided Oct 3) | Escape all catalog text before display |
| F-70 | LOW | The Supabase library from a public CDN is trustworthy | Not involved | Bundle the library, or pin it with an integrity hash |
| F-71 | LOW | The menu has Levels 1–4 ($30–$190), four bundles at a placeholder 10% off, and plastic and rubber add-ons. These built-in prices show on every page load until the catalog arrives, or for good if it fails | Today's menu has two tiers a side, two bundles, sealant by size, and steam | Frontend phase |
| F-72 | INFORMATIONAL | Guests must give an email | Email is optional for everyone, guests included (decided Oct 3) | Frontend phase |
| F-73 | INFORMATIONAL | Dark theme only | The brief mentions light mode "where already specified"; no specification was found | Frontend phase |

What F-65 means in practice:

1. If the seeded codes don't follow the "ext\_1" pattern, every booking is rejected.
2. Hiding, reordering or adding a service shifts positions. A customer can then book a different service, at a different price, from the one on screen — silently, whenever the shifted code exists.
3. The website pairs Bundle N with Exterior N and Interior N, while the database prices a bundle from its stored components.
4. Add-on codes are hard-coded, so any catalog change breaks them.

Already consistent: the spam field's name, both error forms, shop or mobile, the damage and vehicle-type lists, the 6-photo limit, the photo path, and photos for signed-in customers only. Database work for Migration 001: the quote function (F-64, F-66), owner-only vehicle reads in policy (F-67) and display-only settings (F-68). The rest belongs to the frontend phase.

## 16. Security Findings

Three issues block launch on security grounds: no access rules, an open calendar, and no private photo storage.

| Severity | ID | Issue | Section |
| --- | --- | --- | --- |
| CRITICAL | F-49 | No RLS or policies on any table | 12 |
| HIGH | F-27 | Anyone can fill the calendar with unverified requests | 9 |
| HIGH | F-51 | No private photo bucket or storage policies | 13 |
| HIGH | F-42 | Manager and detailer can't be told apart, and permissions are undefined | 11 |
| HIGH | F-35 | Phone-registered profiles would have no phone | 10 |
| MEDIUM | F-43 | Default privileges let anyone write tables and run functions | 11 |
| MEDIUM | F-29 | Bookings made under someone else's phone and email | 9 |
| MEDIUM | F-28, F-30 | Spam trap bypassed by direct calls; notice flood | 9 |
| MEDIUM | F-38 | Paid texts triggered by anyone (SMS pumping) | 10 |
| MEDIUM | F-39 | Guest-to-account linking could expose another person's bookings | 10 |
| MEDIUM | F-40 | No safe path to create an admin or change roles | 10 |
| MEDIUM | F-50 | Customers would see internal triage fields | 12 |
| MEDIUM | F-52 | Photos carry customers' home locations | 13 |
| MEDIUM | F-56 | The audit log keeps personal data indefinitely | 14 |
| MEDIUM | F-67 | Staff accounts would list every customer's vehicles | 15 |
| LOW | F-24 | The calendar function can be used to load the database | 8 |
| LOW | F-41 | No multi-factor sign-in for staff | 10 |
| LOW | F-45, F-46 | Search-path hardening | 11 |
| LOW | F-60 | Guessable booking references | 14 |
| LOW | F-69 | Script injection through catalog text | 15 |
| LOW | F-70 | Library loaded from a CDN without an integrity check | 15 |

Already right: roles never come from the login token or sign-up data; the database computes every price; saved vehicles and photo paths are checked against the caller; owner-rights functions pin their search path; outside users can't create database objects; and a spam trap exists.

## 17. Business Decisions Required

Most decisions are made, over seven rounds on Oct 3. None of the open items below blocks writing Migration 001. The tables are built to take any answer to X-4 and X-25, so those answers only change values. The corrected plan is in Sections 6 to 14 and 18 to 20, ready for your approval.

**Decided — first round, Oct 3, 2026**

| Decision | Answer | Effect on Migration 001 |
| --- | --- | --- |
| Current service menu | Your price list in Section 7 is current; unpriced services stay unbookable | Seed the catalog from it |
| Role mapping | Admin (you), manager (tier 2), detailer (tier 1), plus customer | Rename the roles; give each its own permissions |
| $200 gold rule | Dropped | Remove the comment |
| Unapproved requests | Hold their slot for 24 hours, then release it | Hold expiry in availability |
| Phone | Required on every booking | The booking keeps phone mandatory |
| Accounts | Created with a phone number; anyone without one must add it; email optional. Round 2 switched to email and password; round 3 restored phone accounts | Phone taken from Auth; email optional on account holders' bookings |

**Decided — second round, Oct 3, 2026**

| ID | Decision | Effect on Migration 001 |
| --- | --- | --- |
| D-01 | Durations, provisional: Exterior Basic 60 min, Exterior Deluxe 90, Interior Basic 60, Interior Deluxe 120. A bundle takes its two parts added together, adjustable per bundle. Sealant and steam: not set. | Seed these minutes and store bundle minutes per bundle. Sealant and steam stay unbookable until they have a time (X-7). |
| D-02 | Larger vehicles pay 5–10%, set per vehicle type from the admin side; the rates aren't chosen yet. The rate applies to the booking subtotal, extras included, after bundle savings. | A rate per vehicle type, editable by admin. Proposed: a type with no rate shows its price as "to be confirmed". |
| D-03 | Vehicle types: Sedan, Coupe, Crossover, SUV, Minivan, Truck, Large SUV, Van, Convertible, Other. Sealant: Car, Coupe or Sedan $44.99; SUV, Minivan or Crossover $54.99; Truck or Large SUV $64.99; Van, Convertible and Other not set. "Not sure" gets no guessed rate or tier; staff confirm the price after seeing the vehicle. | Add Large SUV and price the sealant per vehicle type. Proposed: unset sealant prices also show as "to be confirmed". |
| D-04 | Steam can't be booked alone; it's added to an eligible service (which ones: X-5). Sealant needs an exterior service. With Interior Deluxe, steam shows "Included", costs nothing and can't be added twice. | Add-on rules live in the quote function. The Full Detail Bundle contains Interior Deluxe, so the same rule applies there. |
| D-05 | Layers: the hidden spam field, server-side rate limits, repeat-request throttling, server-side checks, and a bot check only when necessary (X-9). Submitting never confirms an appointment; only approved appointments hold time permanently. | Section 9's options A and C (when needed), plus 24-hour holds. Texted codes (option B) are dropped. |
| D-06 | The hold length is adjustable. When a hold lapses, the time opens again and the customer can request again. The request's status afterwards, and whether the customer is told: not decided. | Each request gets a hold-expiry time, and availability ignores lapsed holds. No automatic status change yet. |
| D-07 | "Not sure" doesn't mean Review. It's marked "Unidentified / Not sure" and goes to Review only for another reason: concerning damage, an unusual vehicle, unclear service needs or another judgment call. It holds a slot like any pending request. | Replaces the brief's rule and closes F-32. Staff can move a request to Review by hand. |
| D-08 | Spam is kept and viewable. The staff screens are Requests, Review and Spam. How long spam is kept: not decided. | A spam list separate from requests, with no automatic purge until a period is set. Who sees it: X-3. |
| D-09 | Guests give a first name, phone and email; the last name is optional. | Guest booking checks. |
| D-10 | Roles: detailer (tier 1), manager (tier 2), admin. Detailers do the day-to-day work on appointments but can't cancel or make Review decisions. Managers add Review of complex jobs, unusual vehicles, damage and complicated mods. Admin does everything, including cancelling, refunds, credits, settings and staff. Any employee can request an admin review with a message. | Rename the roles; redraw the Section 11 matrix once X-3 is answered. Refunds and credits wait for payments, which the draft defers. |
| D-11 | Photos are seen by employees with legitimate access to that appointment: the assigned staff, plus authorized senior staff and admins. Never public. How long they're kept: not decided. | Storage rules follow appointment access. |
| D-12 | Deleting an account keeps business records: appointments and their history, payment, refund and credit records, and needed audit records. Profile details are removed or anonymized once no longer needed. Retention period: not decided. | The anonymizing design in W-14. |
| D-13 | Open every day. The earliest start is 10:00 AM, and every job, buffer included, finishes by 7:00 PM. Bookings 1–60 days ahead, adjustable. Several jobs can run at once when enough team members and space are free, and no employee is double-booked. Buffer and travel time are adjustable but not set (X-8). | No overlapping assignments per employee. The capacity model waits on X-2. |
| D-16 | Damage marked Unknown or Other goes to Review. Known damage (paint, dents, scratches and the rest) is shown to staff but doesn't force Review. | Review triggers: Unknown and Other. |
| D-18 | Use the existing empty project after confirming it's still empty. No Pro plan or other charges for now. | Apply there. Free projects pause after 7 days without activity. |
| D-19 | No texting at launch ($0 budget). Customers and staff sign in with email and password. | Email sign-in needs an email-sending service before launch. Supabase's built-in sender only reaches your own team, 2 emails an hour ([Supabase: SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). |
| Menu | "Deep Detail $159.99" is retired. Standalone services are Basic (Level 1) and Deluxe (Level 2); the four tiers are bundles. The prototype's four standalone levels and placeholder prices are wrong. | Seed only today's menu. Bundle tiers wait on X-4. |

Round 3 replaces D-19 (sign-in) and narrows D-10 (detailer rights). D-09 (guest email) and D-05's texted codes reopen for guests as X-12. Round 4 settles the rest of this table: text codes for everyone who books (D-05, D-09), managers and the admin see Spam (D-08), and D-13's jobs at once come from Section 8's limits (X-2, then X-15).

Residual risk (F-27, F-29) after round 4: guests verify their phone by text too, so fake contact details can't hold times, and nobody can book under someone else's number. Someone with many real phones could still hold times, 24 hours each, at the cost of a code per number (Section 9).

**Decided — third round, Oct 3, 2026**

| Topic | Decision | Effect on Migration 001 |
| --- | --- | --- |
| Accounts | Every account, customer or staff, has a phone number; email is optional. This replaces round 2's email-and-password sign-in and closes X-1. | The sign-up trigger takes the phone from Auth (F-35's fix); email stays optional. |
| Verification | Phone numbers are verified by a text code. Emails are verified by a 6-digit code sent to the inbox. Names and emails are checked so junk and fake domains don't get through. | Needs an SMS provider again (X-11) and an email-sending service. Proposed: sign in with phone and password, with a text code only at sign-up and password reset. Checks per X-13. |
| Team accounts | Only the admin creates team accounts for managers and detailers. | An admin-only account-creation function, run server-side. |
| Job assignments | The admin and managers assign jobs ("sites") to employees. An assignment is the permission to go. | Only admin and manager can write assignments. |
| Detailer rights | Detailers can only request reviews and request to take on an appointment, then call a manager, or the admin as a last resort. | Take requests and review requests become records that managers act on. Closes X-3; manager rights move to X-17. |
| Hours | Employees log hours on their shifts. Logging starts when the wash starts; setup beforehand isn't logged. | Proposed: record arrival and wash start separately. Federal wage rules can count setup that's integral to the job as paid work time ([29 CFR 790.8](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-790/section-790.8)). Migration 002, unless shifts set the open times (X-15). |
| Extra work | If a customer asks for more work during a job, the extra labor is charged afterwards. If the employee has to leave for another shift and the work isn't done, there's no charge. | Charges only for completed extra work (X-16). Proposed for Migration 002 with hours logging. |

**Decided — fourth round, Oct 3, 2026**

| Topic | Decision | Effect |
| --- | --- | --- |
| Guests | Guests verify their phone by text. Email is optional; a guest who gives one verifies it separately with an email code. | Booking needs a signed-in user with a confirmed phone (Section 9). Closes X-12. |
| Name and email checks | Block obvious junk in names; accept any email that receives its code; block throwaway-email services. | Input checks (Section 10). Closes X-13. |
| Shifts | A shift is the job's own time block. The detailer starts it at the site by sending a photo on the website, for approval by a manager or you (proposed); no location check. | Migration 002. Closes X-14. |
| Open times | Customers pick from open times or contact you instead. The driveway fits 2 cars; while you're mostly solo, 2 driveway jobs or 1 mobile job, never both at once. | Availability (Section 8). Closes X-15. |
| Booking-page number | (945) 361-7551, the number the old site used | A display setting. Settles the phone part of X-10. |
| Extra work | Charged at the menu price or a price the customer agreed to first. You charge it on your Square reader and record it in the app. | Migration 002; payments stay outside the app. Closes X-16. |
| Filming | You film with the customer's permission and keep the videos on your phone and your page, to send later. | Migration 002: proposed: a filming-permission note on each job; no video storage in the app. |
| Staff rights | The proposed permission table is approved. | Section 11. Closes X-17. |

**Decided — fifth round, Oct 3, 2026**

| Topic | Decision | Effect |
| --- | --- | --- |
| People per job | One person can work up to 2 driveway cars at once, or 1 mobile job, never both. Several people can work one car, for example a very dirty one, to finish faster. | Closes X-18. Assignments allow several people per job. Proposed: staff can shorten the booked time when they add people. |
| Larger vehicles | You judge the upcharge yourself, car by car. Minivans count as big, and so do some modified trucks, such as a Raptor. Wide cars that only have wheel spacers don't. | Replaces D-02's automatic rates by vehicle type, and makes X-6 moot. Proposed: the website shows base prices with a note that larger vehicles may cost 5–10% more, and you set the percentage when you approve. |
| Admin sign-in | A second step with an authenticator-app code for admin and manager accounts. | Closes X-19 (W-05, W-09). |
| Your address | Never shown. The site shows Parker, Texas as the general area. | Closes X-20. |
| Driveway jobs | Only for people who contact your number. The booking starts with the location choice, so you decide who gets your address. | Proposed: driveway jobs aren't booked online. You or a manager enter them in the admin side, so they block the calendar like any other job. |
| Mobile price | Mobile costs more on every detail, and more again depending on the service and what you need to bring. | Amounts open (X-21). |

**Decided — sixth round, Oct 3, 2026**

| Topic | Decision | Effect |
| --- | --- | --- |
| Mobile price | Mobile adds 2.5% on smaller services and 7% on larger detailing bundles and services. Distance doesn't change the price. | The quote adds the percentage per line (Section 7). Which services count as smaller is proposed (X-23). Closes X-21. |
| Service area | Mobile jobs only within 10 miles of Parker. | Proposed: a ZIP-code list the admin can edit (Section 8). |
| Water and power | You use the customer's water and power for now, and clients see a note saying so. The mobile percentages stay the same until you have your own. | A note on the mobile option; the percentages are settings. Closes X-22. |
| "Come to us" | Customers can choose your driveway online. You confirm and send the address and timing. | Bookable online as a request; your address stays private until you confirm. Replaces round 5's proposal of phone-only driveway jobs. Timing: X-24. |
| Upcharges | Every upcharge is told to the customer as soon as possible. | The booking shows the new total and you contact the customer right away. Automatic text updates would add text costs, so they wait (Section 19). |
| Website design | Fluid animations; professional, sleek and clean; gold accents throughout, per the project instructions. | Frontend phase. |

**Decided — seventh round, Oct 3, 2026**

| Topic | Decision | Effect |
| --- | --- | --- |
| Mobile split | Basic services and add-ons +2.5%; Deluxe services and both bundles +7%. | Closes X-23. |
| Times | Customers pick from the times offered, for "Come to us" as well as mobile: a day, start times from 10 AM to 7 PM, and only times where the job fits. No job runs past 8 PM. | Replaces round 2's 7 PM finish (D-13). Closes X-24. Section 8. |
| Price shown | The normal price, with no estimate for bigger vehicles. A customer who picks XL size gets no price until you enter the extra cost. | Replaces round 5's 5–10% note. Section 7. |
| Stains | The booking form includes stain options. | The list, and which options hold the price: X-25. |
| Order of work | Database first. The website comes right after: as high-end and fancy as possible, with fluid animations, professional, sleek and clean, with gold accents. | Frontend phase (Section 19). |

**Still open**

| ID | Question | Blocks |
| --- | --- | --- |
| X-25 | Stain options. Proposed: light, heavy, pet, food or drink, grease or oil, ink or dye, and other. Which should hold the price until you set an extra cost, like XL? Proposed: heavy stains. | Values only |
| X-11 | Text-code budget: about 6¢ per code with Twilio Verify ($0.05 per successful check plus $0.0083 per US text, [Twilio](https://www.twilio.com/en-us/verify/pricing)); 200 codes a month is about $12. How much a month, and should auto-refill stay on? With it off, codes stop when the balance runs out. | Launch: SMS setup |
| X-9 | Proposed: the bot check guards every code request from day one, as Supabase recommends for paid texts ([Supabase: Phone Login](https://supabase.com/docs/guides/auth/phone-login)). Booking itself needs none, since only verified users can book. | Auth settings, not the migration |
| X-4 | Bundles Tier 1 to 4: what each contains and costs, and whether Signature Combo and Full Detail Bundle are two of them. | Values only. Until then, only the two priced bundles are bookable. |
| X-5 | Which services Steam Cleaning can be added to. | Values only. |
| X-7 | How long the sealant and steam cleaning take. | Values only. Both stay unbookable until set. |
| X-8 | Buffer minutes between driveway jobs, and travel time for mobile jobs. | A setting, needed before launch. |
| X-10 | Instagram (the old site showed @Wiffed\_), and which old-site features come back. | Site settings and later phases. |
| Later | Retention for spam, photos and deleted accounts; what a lapsed hold does to the request, and whether the customer is told. | Migration 002 or launch settings. |

Sections 6 to 14 and 18 to 20 show the corrected design, updated through round 7. Parts marked "proposed" still need your OK.

## 18. Required Migration 001 Completion Work

Seventeen work items complete Migration 001, in this order — PROPOSED, REQUIRES APPROVAL. The database is empty and the draft was never applied, so no item has a backward-compatibility concern. Items that wait on a setting (an X number) can be built now and filled in when the answer arrives.

| # | Work item | Why (findings) | What changes | Waits on | Placement |
| --- | --- | --- | --- | --- | --- |
| W-01 | Roles | F-42 | Roles become customer, detailer, manager and admin, with one helper per check | — | 001 |
| W-02 | Catalog model | F-11, F-13 to F-15, F-25, F-65 | Stable service codes; an add-on kind; bundles made of any list of parts; rules for what a service includes (steam in Interior Deluxe) and what an add-on needs; a mobile percentage per service; vehicle types and an XL size choice; stain options, each marked if it holds the price for review; sealant prices by vehicle type; minutes above 0, or not bookable | X-4, X-5, X-25 (values only) | 001 |
| W-03 | Seed and settings | F-08, F-09, F-12 | Today's menu, minutes and mobile percentages (Section 7); the ten vehicle types; sealant prices; stain options; Sealant and Steam unbookable until they have minutes. Settings: every day, start times 10 AM to 7 PM, every job done by 8 PM, 1 to 60 days ahead, 24-hour holds, 2 driveway jobs or 1 mobile job and never both, the 10-mile ZIP list, Review only for Unknown or Other damage (D-16), (945) 361-7551 on the booking page, Parker, Texas as the public area, and your address stored privately | X-7, X-8 | 001 |
| W-04 | Quote function | F-10, F-16, F-64, F-66 | One pricing routine for the screen and the booking: line items, mobile percentages, totals in cents and minutes; no price for XL vehicles or stains that need review until you set the extra cost | W-02, W-03 | 001 |
| W-05 | Accounts and verification | F-35, F-36, F-39 to F-41 | Phone and email copied from Auth once confirmed; name, phone and email checks; blocked email domains; admin-only role changes; owner setup; the server function that creates team accounts or promotes an existing login; a code-then-password path for former guests; the authenticator-app step for admin and manager | — | 001, plus one Edge Function |
| W-06 | Finish `submit_booking` | F-01 to F-06, F-18, F-27 to F-29, F-31, F-33, F-34, F-60 | Signed-in callers with a confirmed phone only; location first, with the 10-mile check for mobile; the quote; caps per customer and repeat protection; hidden-field hits to Spam; Review for Unknown or Other damage and junk text; the short-model fix (Tesla 3, S, X, Y); a random reference with retry; saves the booking and its lines; returns reference, status and totals; stable error codes | W-04, W-05 | 001 |
| W-07 | Availability | F-19 to F-24, F-26 | Start times 10 AM to 7 PM with every job done by 8 PM; driveway and mobile limits; buffers; 24-hour hold expiry; closed dates; a one-query calendar; no past times; the date lock on every path | X-8 for buffer minutes | 001 |
| W-08 | Statuses | F-62 | Requested, needs information, confirmed, in progress, completed, declined, cancelled. Refunded statuses wait for payments; "approved" folds into confirmed; the Review lane replaces "under review" | — | 001 |
| W-09 | Staff actions | F-20, F-44 | Approve, decline, set time, cancel (admin only), move between lanes, assign and unassign within each person's limit with several people per job allowed, job requests, review requests, and the extra cost (admin only). Each checks the role per Section 11 and the second sign-in step | W-01, W-07 | 001 |
| W-10 | Notices | F-30 | In-app notices for new requests, job requests and review requests; for customers, when a booking is confirmed or its price is set or changes | W-09 | 001 |
| W-11 | Privileges | F-43, F-48 | Revoke default rights; grants per table, column and function | W-01 | 001 |
| W-12 | RLS | F-47, F-49, F-50, F-67, F-68 | Policies per Section 12; any policy that calls a role helper applies to signed-in users only; customer bookings, open jobs and display settings served through functions; your address shown only on the customer's own confirmed "Come to us" booking | W-11 | 001 |
| W-13 | Photo storage | F-51 to F-54 | The private bucket and policies per Section 13, with a helper that matches files to bookings the viewer may see; no overwrites; file checks at booking; scheduled cleanup of unattached files through the storage API | W-12 | 001, plus a scheduled Edge Function |
| W-14 | Deletion and audit retention | F-55, F-56 | Foreign-key rules, audit minimization, the anonymizing function | Retention periods | 001; self-service deletion in 002 |
| W-15 | Integrity hardening | F-45, F-46, F-57 to F-59, F-61 | Checks, indexes, a time-zone check, empty search paths | — | 001 |
| W-16 | Tests | All | Every role against every table and function, a signed-out visitor included; phone confirmations on; simultaneous bookings for one slot; driveway and mobile limits; the 8 PM limit; the 10-mile check; XL and stain holds; every menu combination priced, mobile and not; hold expiry; caps; advisors clean. Run on Postgres 17 with real Supabase Auth and Storage: a separate free test project or Supabase's local test setup, with test phone numbers | W-01 to W-15 | 001 gate |
| W-17 | Apply | F-63 | Through Supabase's migration tooling, to the existing project once it's confirmed empty | W-16, your sign-off | 001 |

Migration 002 then adds the job-day features: a detailer starts a shift by sending a photo from the site for approval (by a manager or the admin, proposed); hours run from the wash start; extra work at the menu price or a price the customer agreed to; a note on each job that the customer allowed filming (proposed); and customer self-service (cancel, reschedule, delete account). Payments stay on your Square reader, outside the app. Website changes from Section 15 follow in the frontend phase.

## 19. What Should NOT Be Added Yet

These stay out of Migration 001, either because they belong to the job-day work in Migration 002 or because they haven't been decided.

- Payments, refunds and credits: you charge in person on your Square reader. Recording amounts due comes in Migration 002.
- Shift starts by photo and their approval, hours logging, extra-work charges and filming permission: Migration 002.
- Customer self-service (cancel, reschedule, delete account): Migration 002.
- Storing videos in the app: your videos stay on your phone and your page.
- Text or email updates about bookings, beyond the verification codes.
- Booking or pricing for unpriced services: the bundle tiers beyond the two priced bundles, ceramic and wax services, plastic and rubber care, restorations. They stay unbookable until priced.
- Staff working-hour schedules: not needed, because a shift is the job's own time block.
- Coupons, gift cards and loyalty rewards; the "$200 gold rule" is dropped.
- Multiple locations, and reporting or analytics tables.
- Any frontend redesign waits for the frontend phase, right after the database: a high-end, fancy design with fluid animations, professional, sleek and clean, with gold accents. The website fixes in Section 15 come then too.

## 20. Migration 002 Prerequisites

Migration 002 starts only when all six conditions below are met.

1. You approve this plan, including the parts marked "proposed".
2. Work items W-01 to W-15 are written and reviewed.
3. Migration 001 runs cleanly on a fresh database, and a second run fails and rolls back without changes.
4. The W-16 tests pass, and Supabase's security and performance advisors show no warnings, or you accept each remaining one in writing.
5. A guest booking and an account booking complete end to end on a separate free test project or Supabase's local test setup, text code included. Supabase's test phone numbers make this possible without sending real texts.
6. You sign off on the finished Migration 001, and it is applied through Supabase's migration tooling.

## Sources

- [Supabase: Phone Login](https://supabase.com/docs/guides/auth/phone-login)
- [Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase: Features, including CAPTCHA protection](https://supabase.com/docs/guides/getting-started/features)
- [Supabase database linter: SECURITY DEFINER function callable by anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

**What this doc is for:** a check-up of your website's database plan, called Migration 001, before anything is built. It shows what's written, what's unfinished or missing, every problem found by severity, and the questions only you can answer. Your next step: answer the open questions in [Section 17](#m1g34md11na.43615), in chat or as comments here, and I'll use your answers to finish Migration 001.

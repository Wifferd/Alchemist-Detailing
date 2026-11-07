# Alchemist Detailing — website and booking platform

Read this first, then `docs/18-handoff-and-booking-plan-2026-10-03.md` for where the work stands, then `docs/19-portal-architecture-and-ai-plan-2026-10-04.md` for the whole-portal architecture, build phases and the AI plan (AI features are PROPOSED until the owner approves). Docs 23 and 24 hold the owner's phase 1 answers (Oct 5): read them before touching prices, conditions or the service area.

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

## Phase 1 answers (docs 23 and 24, Oct 5)

- Two bundles for launch; the owner's four-tier menu is a future idea, recorded in doc 23, not built.
- **Conditions and fees (Migration 002):** a mandatory "what's the car like" choice with any interior service: None, Pet hair $15, Excessive dirt / mud / sand $10, Spills / food / light stains $10, Heavy or set-in stains $30, Other (note required, goes to Review). Interior Deluxe and Full Detail include the $10 and $15 ones, never heavy stains. No fees on exterior-only bookings; bugs, tar and the like go in the notes. Odor is retired. Nothing in the old stain list holds the price any more.
- Steam Cleaning: 30 min, only with an interior service that doesn't include it. The sealant is **WetGloss** (Koch-Chemie), 30 min, "lasts several weeks".
- Buffers: 10 min after a mobile job, 0 after a driveway job (`business_settings`).
- The public area stays Parker, Texas; the 10-mile circle is measured from the owner's home. ZIPs 75072, 75407 and 75042 are in (owner's "okay with all of these"; confirm once).
- Migration 002 (five files, `20261005090001…090005`) is applied to **both** projects (live on Oct 5, 2026 with the owner's OK, doc 32); 37 passing checks in `db-tests/m002_tests_conditions.sql`.
- Migration 003 (`20261005210001_m003_weekly_hours.sql`, doc 32): `weekly_closures` (ISO weekday, minutes) and `open_starts` skips them; Mon–Thu closed 4–8 PM, Fri closed 12–5 PM; hours stay 10 AM–7 PM, jobs end by 8 PM. Applied to both projects; 25 checks in `db-tests/m003_tests_hours.sql` (one DO block: top-level `set role` hangs the Supabase MCP, so tests run as DO blocks with `execute 'set local role …'`). `get_public_settings()` now returns `weekly_closures`.

## Final design run (Oct 10, docs 32)

- Twelve packages: motion system, landing page, water/foam/light realism (hero-gl.js, foam.js), the owner's six canvas designs (Alchemist's Table, Ritual, Bead Test on #services; the Transmutation before/after slider on #gallery, hidden in live mode until a before photo exists; the Gold client card in #account for a completed $200+ booking; Gold reviews as certificates on #reviews), phone, booking and account, light mode, secondary pages, staff consoles, accessibility/performance and launch files. Concept chosen: "Showroom light" (the car under studio light).
- supabase-js 2.49.4 is self-hosted at `site/js/vendor/supabase-js-2.49.4.js` since Nov 6 (doc 45: a slow jsDelivr froze the whole site), with the same pinned SRI hash (`sha384-rwykjm…`, first checked against the jsDelivr file on Oct 10). If the supabase-js version changes, replace the file and recompute the hash, or the browser refuses the script and live booking stops.
- Price breakdowns never show the bundle saving as a minus line: the bundle line already carries the bundle price, so the saving is a note (`.pr-note`) and the column adds up to the total (fixed in `ui.js` and `admin.js`).
- Hours appear in the footer, Contact, the FAQ and the LD+JSON `openingHoursSpecification`: Mon–Thu 10–4, Fri 10–12 and 5–8, Sat–Sun 10–8. Change them in all four if Migration 003's rows change.
- Owner decisions of Oct 11 (doc 33): domain alchemydetails.com, but he said "Not yet" to the $11.25 quote (replaced on Nov 4 by **thealchemistdetailing.com**, which he bought himself; doc 41); calendars start on Monday and the booking calendar shows the neighbouring months' days in grey with their month (`.cal-other`); the pinned wash keeps its length; codes and booking messages move to **email through Resend** (his choice). Done Oct 11 (doc 34): the site signs customers and staff in with a 6-digit email code (`D.sendCode` / `D.verifyCode`: signInWithOtp + verifyOtp type email; staff screens pass createUser: false); booking step 01 asks for the email (with the code) and a required, unconfirmed mobile phone (`contact_phone` in the booking payload, kept on `profiles.contact_phone`). Migration 004 and the email-based `admin-create-team-account` are on the **test project only** (31 of 31 tests); live needs the owner's OK. Codes can't be sent until his Resend account, a verified domain, Supabase custom SMTP and the Magic link / Confirm sign up templates with `{{ .Token }}` exist (doc 34 steps); Supabase's built-in sender only reaches the Supabase team's own addresses. Oct 12: the deployed sites passed a sandbox browser check (doc 34, "Checked on the deployed sites"): customer sends and code checks were answered inside the browser, team sign-ins went to Supabase for real (422 otp_disabled, nothing sent). The Supabase MCP `apply_migration` times out on long migrations and holds any text containing a delete for a confirmation nobody can answer: apply in parts, and avoid replacing functions whose body deletes rows. The same hold stops `db-tests/m005_tests_guest_booking.sql`, which contains `delete from tst.results` (as do m003's and m004's suites): it can't run through the MCP as written.
- Oct 12 (doc 35): the jump after the foam on iPhone is fixed. The old settle() shrank the wash section and scrolled back in one frame under a finger, and iOS undid the scroll (WebKit bug 310358), so the page leapt 2,464 px. Now the pin lets go when the rinse has cleared the screen (--wash-release .85, section length unchanged at 380vh/430vh, the timeline spread over it), and the extra length goes back only through pinFold's free/trim/rest/hide/now paths; on iOS a rest fold needs a proof that no finger is on the glass (scrollend, or a lift on a still page). Tested with an iPhone-emulating harness (125 runs, including the reviewers' edge cases); the owner then confirmed it fixed on his iPhone. Same day he said he will buy the domain and get a **Twilio** account after his next wash (no purchase or account yet; the domain was bought on Nov 4, doc 41). Twilio texts, which Resend can't: sign-in text codes through Twilio Verify (Supabase supports it; about $0.05 per successful code plus the SMS fee; no A2P 10DLC registration), booking texts through Twilio Messaging (needs A2P 10DLC registration: sole proprietor about $4.50 brand + $15 vetting + $2/month, approval in days). He chose **"Text codes only"** (doc 36): sign-in is by text code again (the email switch, adf094f, reverted; the "Not you?" fix kept; the optional email hidden by `config.js` `emailCodes: false` until an email sender exists; `admin-create-team-account` back to phone, redeployed to test as v3). Booking confirmations are decided later; Resend isn't needed for now. Live needs no database change for text codes (it never got Migration 004); test keeps 004, which accepts either. Codes can't be sent until he connects Twilio Verify in Supabase (doc 36 steps).
- Oct 12 (doc 37): **guest booking until Twilio**. The owner asked to "keep the guest only until i get the twillio". Migration 005 adds:
  - `business_settings.guest_booking` (on; read through `get_public_settings`);
  - `submit_guest_booking(p)` for anon: name and phone as typed, no code, no saved vehicle, no photos; the account path's rules, per-phone limits, and caps of 12 guest bookings an hour (declined/cancelled don't count; Spam has its own 12) and 25 waiting, all under one lock (`pg_advisory_xact_lock(7305, 0)`);
  - the `office` schema, not served by the API: the `office.requests` view and `office.confirm/decline/cancel/set_extra_cost(ref…)`, which the owner runs from the SQL Editor because the Admin page needs a text code.

  The site shows the guest step 01 whenever the flag is on and nobody with a confirmed phone is signed in (`booking.js` `guest()`; the Account page says accounts are coming soon). The honeypot value is kept in the contact state (`c.website`), since step 01 is gone from the page by Send. The preview takes `?guest=0` for the text-code flow (`tools/shoot_account.py` uses it). To turn guests off once Twilio Verify works: `update public.business_settings set guest_booking = false where id = 1;`. Nothing alerts the owner to new requests yet, and a request's time is held 24 hours.
- Oct 11: the work photos (`site/img/work/`) were never in git until commit d0397df: the old `.gitignore` rule `work/` (meant for the raw photo folder at the top of the repo) matched them too, so the deployed sites answered 404 for every photo from Oct 5 to Oct 11. The rule is `/work/` now. Before adding a folder of site files, check `git status --ignored site/`.
- Nov 4 (doc 42): Supabase's free plan paused **both** projects after a quiet week (the owner resumed live; test resumed with his OK). `.github/workflows/keep-database-awake.yml` calls `get_public_settings` on both four times a day (his choice over Pro at $25/month; it runs only from main, and GitHub turns it off after 60 days without repository activity: Actions, Enable workflow). On the site's own addresses (`config.js` `deployed`: thealchemistdetailing.com and `*.vercel.app`) a database that doesn't answer is an outage, not a preview (`data.js` `isDown`): booking and account show "call (945) 361-7551" with a Call button (`U.outage`, `.bk-down`), admin and team say the database can't be reached, the Gallery hides the before/after; local copies and claude.ai previews keep the preview.
- Nov 4 (doc 43): the owner signs in to **Admin with an email and password** (`data.js` `staffPasswordSignIn`, `admin.js` `passwordSignIn`; "Use a text code instead" keeps the phone form), then his authenticator app (aal2). Migration 006 (`m006_staff_needs_authenticator`) makes `is_staff()` need aal2 for managers and the admin too (it checked the role only, so a password alone reached assigned bookings and notices); 24 checks in `db-tests/m006_tests_staff_mfa.sql`. `mfaEnroll` clears a half-done setup first. The login is made in the Supabase dashboard; "Allow new users to sign up" is to be turned off at Supabase until Twilio (his choice). Customers still get no sign-in (guest booking). The Team page is unchanged (text code). His login is made admin by the bootstrap rule by email (live's `bootstrap_admin` takes only a phone).
- Nov 6–7 (doc 45): **live bug fixes.** The owner: "It's already live and public, fix all bugs immediately". Three sweeps (database calls against live, real requests on test with four throwaway Sweep accounts, a real browser on test) led to round 1 (931b7f7) and round 2 (5a266a3) on `main`. Live now has Migration 006 (doc 43), 007s (`my_jobs`, booking tables read by managers only; version 20261106212500) and 007 parts 3–5 (`staff_availability`, the guest repeat by request id, `office.requests` in words; versions 20261107002002, …002022, …002053). Six questions for the owner and the test-project tidy-up list are in doc 45.
- Nov 7 (doc 46): the owner answered doc 45's six questions **"Yes to all"**. Live (after the page, 1f8b477) got Migration 007 part 6 (an anonymized booking's review is hidden; version 20261107043010) and Migration 008: part 1 `start_booking` only on the job's day, `complete_booking` on that day or later (Parker's date; …043024); part 2 no API role reads `business_settings.shop_address` (column grants on the other 28 columns, `shop_address_on_file()` for the admin; …043038); part 3 `my_bookings` gives a manager no address and returns each booking's `conditions` (…043050). The page: Start/Complete by day, "The owner sets the price first" for a manager, "Other" says we confirm the price, the call note ends "The note is kept in the booking history." Tests: `db-tests/m008_tests.sql` (40). **A new `business_settings` column needs its own `grant select (column) … to authenticated`** to be readable by staff.
- Nov 7 (doc 47): **the team's door and "Are you sure?".** The owner couldn't get back to the Admin page. The menu got "Requests · Team" only while a team login is signed in on that browser (admin/manager → `#admin-requests`, detailer → `#team` as "My jobs"; since doc 49 only the detailer's "My jobs" stays in the list; `app.js` `showDoor`, `D.staffSession`, `D.onAuth`, `D.hasStoredLogin`, no request for a visitor); `#account` shows a team login a card with Open Requests; `vercel.json` sends /admin and /requests to `/#admin-requests` and /team to `/#team` (307); a quiet "Team sign-in" footer link. On the Admin page, Confirm opens "Are you sure?" in place: Go back where Confirm was, "Yes, I'm sure" far below and ready after 700 ms (`askSure`, `SURE_WAIT`). Answered (doc 48): the test request AD-M4JAFDVQ stays (don't cancel it), detailers keep "My jobs", the footer link stays.
- Nov 7 (doc 49): **"Switch sides".** The owner amended doc 48's answer 2: "2 make manager and admine see “switch sides” bottom of the left menu button". The admin and an active manager get `#switchSide`, the last item of the menu (in `.menu-foot`, under the phone number) instead of "Requests · Team": on the website it goes to the Admin screen last open in the tab (else `#admin-requests`, tag "Requests"), on `#admin`/`#team` back to the website page last open (else `#home`, tag "Website"). Memory is in-page only (`app.js` `side`, `note`; the `hashchange` `oldURL` catches Admin screens changed by `replaceState`). Detailers keep "My jobs · Team" to `#team`. The menu's bottom padding (with `env(safe-area-inset-bottom)`) is now on `.menu-foot`, so a scrolled menu ends below its last item.
- `data.js` `init()` gives the database 8 s plus a 1.5 s grace, then one more try with 10 s, before it falls back to the preview (a headless check once saw the test site land in the preview although the database answered 200 in under a second: a busy page ran the timer first).

## Phase 2 answers (doc 26, Oct 5)

- Customer account: profile, vehicles and bookings only. **No online cancel or reschedule**: customers contact the owner; the account shows the phone number for that.
- The booking app (`site/js/data.js`, `ui.js`, `booking.js`) is built and runs in preview mode in the claude.ai artifact and in live mode against Supabase; `tools/shoot_booking.py` walks it for screenshots.
- Phase 3 (`site/js/admin.js`, route `#admin`, sub-screens `#admin-requests` etc.): manager/admin gate with phone code + authenticator (TOTP enrolment and challenge through supabase-js), Morning view, Requests lanes with Confirm / Decline / Ask for info / Change time / Set price (admin) / Assign / Move lane / Cancel, Calendar (week/day, closed days, the owner's note = `business_settings.customer_notice`, Migration 002 part 4), Customers, Team (roles, active, create account through the Edge Function), Settings (read-only), Log. Preview mode shows clearly labelled example data. Not yet tested in live mode.
- Design upgrade with the owner's photos (doc 31): `site/img/work/` (web versions only; originals in his Google Drive), photo hero, photos on three service cards, the "Our work" strip and lightbox. Videos still owed (under 10 MB each). No interior photo yet.
- Phase 7 content (`site/js/content.js`): Tips, FAQ and About (doc 30) were approved as written by the owner on Oct 5 (doc 32), so the Draft banner is off (`SHOW_DRAFT_BANNER = false`); the FAQ repeats only database facts, and its hours answer follows Migration 003. Design pass (doc 29): modern black and gold, Jost headlines, motion (letter rise, section reveals, pointer glint, hero parallax), light "showroom" mode via `data-theme="light"` (menu toggle, remembered in localStorage).
- Phase 5 (`site/js/reviews.js`, Migration 002 part 5): `reviews` table and `submit_review`, `public_reviews`, `review_set_status`, `review_reply`; a customer reviews a completed booking from Appointments; the owner approves, hides and replies from the console's Reviews tab; first name + last initial; $200+ is gold; `business_settings.google_reviews_url` for the Google link. No invented reviews, ever. 18 checks in `db-tests/m002_tests_reviews.sql`.
- Phase 4 (`site/js/team.js`, route `#team`): a detailer's assigned jobs (no prices, no customer contact details, doc 28), open jobs to ask for (`open_jobs`, `request_job`), "Ask the owner" (`request_review`), customer photos through signed URLs. Start/complete stay with the owner (Migration 001).
- Phase 2 (`site/js/account.js`): `#account` (phone-code sign-in, name, saved vehicles, sign out) and `#appointments` (upcoming and past from `my_bookings`, with the phone number for cancellations). `tools/shoot_account.py` walks it. Not yet tested in live mode (texting isn't set up).

## Hosting (Oct 5; domain Nov 4; allowlist Nov 6)

- Two Vercel projects on the Wiffy_Washes team, both linked to the GitHub repo, root directory `site/`, no build step, redeployed on every push to `main`:
  - **https://thealchemistdetailing.com** → the live Supabase project (real bookings). The owner bought it in the Vercel dashboard on Nov 4 (team Wiffy Washes, 1 year, auto-renew on, Vercel's nameservers; doc 41). www.thealchemistdetailing.com forwards to it (308, a project-domain setting), and `vercel.json` forwards the old **alchemist-detailing.vercel.app** to it (308, a host rule; path, query and #page kept). This container's network proxy refuses the new host (403), so check it with the Vercel MCP `web_fetch_vercel_url` or through a deployment's own URL.
  - **https://alchemist-detailing-test.vercel.app** → the test Supabase project (practice bookings).
- `config.js` is an allowlist (doc 45): only thealchemistdetailing.com, www.thealchemistdetailing.com and alchemist-detailing.vercel.app use LIVE. Every other address (the test site, previews, branch builds, each deployment's own URL, localhost and file://) uses TEST, and `?project=test` forces TEST anywhere. On TEST the staff and account pages show a "Test project" strip (`U.modeBanner`). Off the public domain, `vercel.json` sends `X-Robots-Tag: noindex, nofollow` (the test site sends it; the domain doesn't) and `index.html` adds a noindex tag.
- After a push, check that both projects deployed the new commit (Vercel MCP `list_deployments`, `githubCommitSha`). The GitHub hook has missed pushes (Oct 11, and two in a row on Oct 12); then deploy each project with `create_deployment`, target production, gitSource `{type: github, org: Wifferd, repo: Alchemist-Detailing, ref: main, sha}`. The second build can sit in INITIALIZING for a minute while the first one runs.

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
8. **Unpriced services stay off the booking.** Bundle tiers, ceramic, wax, plastic or rubber care and restorations are not offered at all. WetGloss on a Van, Convertible or Other vehicle has no price yet, so the quote holds the price. (Steam and WetGloss have minutes since Migration 002 and are bookable.)

## Repository layout

| Path | What |
| --- | --- |
| `site/` | The website: `index.html`, `css/alchemist.css`, `js/hero-gl.js` (hero water, beads and the gold studio light; also the still "art" scenes), `js/foam.js` (the wash: scroll-driven, left to right, finishes once and never rewinds; the pin lets go when the rinse has cleared the screen, at `--wash-release` .85 of its timeline, and the section gives its pinned length back only when no finger can be on the glass: `pinFold` and the `rest` gate, doc 35), `js/services.js` (the owner's Alchemist's Table, Ritual and Bead Test on #services), `js/app.js` (menu, routing, page logic, motion), `js/config.js` (Supabase URL and publishable key), `img/` (work photos, `cannon.webp`, `art/` textures, `og.jpg`), launch files (`404.html`, icons, `site.webmanifest`, `robots.txt`, `sitemap.xml`, `vercel.json` with security headers) |
| `brand/` | The owner's logo (`logo-source.png`), the redrawn AD monogram (`ad-mark.svg`, path data), metallic cut-outs, and the scripts that made them |
| `supabase/migrations/` | Migrations 001 (six files), 002 (five, dated 20261005), 003 (weekly hours), 005 (guest booking), 006 (staff need the authenticator), 007s (detailer jobs), 007 parts 3–6 and 008 (doc 46: the day rule, the address closed, `my_bookings`), on both projects; 004 (email sign-in) on test only |
| `supabase/functions/` | Edge Functions: `admin-create-team-account`, `cleanup-unattached-photos` |
| `db-tests/` | Migration 001 suites (472 checks, 6,480 price combinations), Migration 002 suites (`m002_tests_conditions.sql`, `m002_tests_pricing.sql`, `m002_tests_reviews.sql`) and `m003_tests_hours.sql` |
| `docs/` | Every decision, audit and report, numbered in order (01 to 24), plus the owner's design and animation direction |
| `.github/workflows/` | `keep-database-awake.yml`: reads `get_public_settings` from both Supabase projects four times a day so the free plan doesn't pause them (doc 42) |
| `tools/` | `build_artifact.py` (single-file preview), `shoot.py` and `shoot_booking.py` / `shoot_account.py` / `shoot_admin.py` / `shoot_team.py` (screenshots with Playwright; `SHOOT_THEME=light` for the booking walk), `make_icons.py` and `make_og.py` (regenerate the icons and the social image) |

## Previewing the site

- Serve the folder, for example `npx serve site` or `python3 -m http.server 8080 --directory site`, then open http://localhost:8080. Opening `index.html` straight from disk also works.
- Pages are hash routes: `#home`, `#services`, `#book`, `#appointments`, `#reviews`, `#tips`, `#faq`, `#about`, `#contact`, `#account`. `#services-exterior` and similar scroll to a group. Only plain tokens: a claude.ai preview strips anything else.
- `?noadapt` keeps the foam at full quality (it otherwise lowers its resolution on slow devices).
- `window.__alchemist.goTo(p)` scrolls the wash to progress `p` below 0.85 (the release, `--wash-release`), for screenshots; `p` of 0.85 or more finishes and folds the wash at once and puts the cards at the top, so the tail (the water film and drops drying) can't be shot that way.
- Reduced motion and no-WebGL both fall back to showing the services directly. Test both.

## Supabase

| | Live | Test |
| --- | --- | --- |
| Name | Alchemist Detailing | Alchemist Test |
| Project ref | `efpzprranvgujkblnwdj` (us-east-1) | `wlmostaetntbpmfgyjst` (ca-central-1) |
| State | Migrations 001–003, 005, 006, 007s, 007 parts 3–6 (docs 45, 46), 008 (doc 46) | Live's, plus 004; test data and the sweeps' leftovers (docs 45, 46); the sandbox |

**What the website may call** (errors are SQLSTATE P0001: `message` = code, `detail` = text to show, `hint` = field):

- **Signed-out visitors:**
  - `get_public_settings()`
  - `quote_booking(p jsonb)`
  - `get_calendar(p_from, p_days, p_duration, p_location)`
  - `get_availability(p_date, p_duration, p_location)`
  - `email_allowed(p text)`
- **Tables visitors can read:** `services`, `vehicle_types`, `form_options`, `bundle_parts`, `service_includes`, `addon_rules`, `service_type_prices`, `service_zip_codes`.
- **Visitors, while `guest_booking` is on (Migration 005, doc 37):** `submit_guest_booking(p jsonb)` (adds `phone`; no `vehicle_id`, no `photos`). Since Migration 007 part 4, a repeat is found by `request_id` alone: the same phone gets the first receipt, another phone is refused (`wrong_state`, hint `request_id`).
- **Signed-in users:**
  - `submit_booking(p jsonb)`: needs a text-confirmed phone. Since Migration 002, `conditions` is required with an interior service (`none` or codes from `form_options`), `other` needs `special_request`, and `quote_booking` takes `conditions` too (fee lines carry `"condition": true`).
  - `my_bookings()`
  - `update_my_profile(first, last)`
  - `delete_my_vehicle(id)`
  - their own `vehicles` rows
- **Staff functions** are listed in `supabase/migrations/…05_m001_access_and_storage.sql`. Since doc 45: `my_jobs(p_from)` for staff (Migration 007s: a detailer's assigned jobs, no prices or customer contact details; the booking tables are read by managers and the admin only), and `staff_availability(p_id, p_date, p_duration)` for managers and the admin (part 3: Change time's free starts under the staff rule).
- **Photos:** private bucket `vehicle-photos`, path `<user id>/<uuid>.<jpg|jpeg|png|webp>`, 8 MB each, up to 6 per booking.

**Before launch** (none done yet):
- Twilio Verify for text codes.
- An email sender (custom SMTP) for email codes.
- A bot check (CAPTCHA) on code requests.
- Authenticator-app MFA for admin and manager.
- An hourly Cron running `cleanup-unattached-photos`.
- Optional: leaked-password protection.
- Run `bootstrap_admin` after the owner's first sign-in.

**Values the owner still owes:** none from phase 1 (all answered in docs 23 and 24). Next: the phase 2 questions in doc 22. Migrations 002 and 003 are live (doc 32). Still owed by the owner: the texting service, an interior photo, the Google reviews link. (The domain is bought: thealchemistdetailing.com, doc 41.)

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

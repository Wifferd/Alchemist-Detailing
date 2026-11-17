# 53. The new menu, the first-time price, the 4-week pop-up and the Products guide (Nov 17, 2026)

Branch `new-menu` in the worktree (live `main` 8698fcd + the "Not sure" fix). Nothing is pushed, nothing is deployed,
and the live database is untouched. Migration 011 is on the **test** project only.

## The owner's words (Nov 16-17)

- "Go live with fixes and learn from this".
- "4 weeks after account is made, pop up notification showing the promo".
- "Make an admin sided description of what products to use and the order", with his list: "Prewash is green star.
  Contact is gentle snow foam. Interior STRONG APAC is green star. Wheels is brake buster. I have terminator and
  carpetbomber. Pol star for leathers and plastics. Exclusive rubber dressing with gummifix. S0.03 hydrophobic finish",
  and his buy list (Magic Wheel Cleaner, Multi Star N, Reactive Rust Remover, Quick & Shine, Top Star...).
- Later the same day: "greenstar prewash, change it. you tell me if carpet bomber should be sprayed and agitated or in
  the extractor, i have an extractor, wet vac is when i spray green star diluted onto the floor and vacuum when dirt is
  kinda stuck. idk bout dilution".
- "I have nothing registered we can do everything right now but tell me what the costs are" (the costs are answered
  separately, not in this doc).

## His decisions, as built

**Sizes** (by rows): Car (sedan, hatchback or wagon, coupe, convertible); SUV or crossover, 2 rows; 3 rows or pickup;
Minivan. Van, Other and "Not sure": we confirm the price (the request goes to Review).

| Service | Car | 2 rows | 3 rows or pickup | Minivan |
|---|---|---|---|---|
| Basic Wash | $50 | $55 | $55 | $55 |
| Hand Wash | $75 | $80 | $80 | $80 |
| Inside & Out ("Best value") | $100 | $115 | $125 | $135 |
| Full Detail | $165 | $190 | $215 | $235 |
| Interior Clean | $75 | $85 | $90 | $100 |
| Interior Detail | $125 | $145 | $165 | $185 |

Inside & Out saves $50 / $50 / $45 / $45 against a Hand Wash and an Interior Clean; the Full Detail saves $35 / $35 /
$30 / $30 against a Hand Wash and an Interior Detail. Shown as a note, never a minus line.

Add-ons, one price for every size: Wheels & Tire Shine $20 (Basic Wash only), Gloss wax foam $20 (Basic Wash, Hand Wash,
Inside & Out), Engine bay clean $50, Clear film (PPF) care $15 (with a wash), Leather care $35 (Inside & Out, Interior
Clean; already in the Full Detail and Interior Detail), Stain and spill removal $40 (up to 5 spots, with an inside part).

"What's the inside like?" with any inside part: None; Some pet hair +$30; A lot of pet hair +$60 (one of the two); Heavy
dirt, mud or sand +$40; Other (a note, we price it). "Stains or spills? Add Stain and spill removal ($40) below." and
"If what we find is different from what you chose, we'll tell you the price before we start, and you choose: we add it,
or we do what you booked without it." No mobile fee anywhere.

**First-time price:** the first Basic Wash is $35 (car) or $40 (the other sizes), one per phone number and one per
address, until February 17, 2027 (the date is `business_settings.first_visit_offer_ends_on`; he can change it).

**Pop-up:** a signed-in customer whose account is 28 days old and who has no booking yet sees the offer once a day.

**Products guide:** an Admin screen with the steps and products for every service, add-on and inside answer.

**Booking reopened** with the new menu.

## What was built

### Database (Migration 011, test project; details in the build's `db-report.md`)

Ten files, `supabase/migrations/20261117090001…090010_m011_*.sql`: new tables `size_groups`, `service_size_rates`,
`addon_allowed_with`; the 15 new services, rates and rules; `quote_core` (prices and minutes by size, one shared visit of
32 minutes when a wash and an inside service are booked apart, add-on limits, one pet-hair answer); `quote_booking` with
the "if first visit" price; `save_booking` deciding the offer under phone and address locks; the receipt and
`office.requests` with the offer; `get_first_visit_offer()` and `my_first_visit_offer()`; the switch that retires the old
menu with `active = false` and sets `mobile_pct = 0`. 125 of 125 checks in `db-tests/m011_tests_menu.sql`.

### Website

- `site/js/data.js`: loads the sizes, the rates, the add-on limits, the inside answers' pairs and descriptions, every
  answer (retired ones too, for older bookings' labels); the preview's menu and quote now mirror `quote_core` and the
  first-time price (checked against the test database's own answers); `firstVisitOffer()`, `myFirstVisitOffer()`.
- `site/js/ui.js`: whole dollars ($50, not $50.00); the price breakdown names the new-customer line and its regular
  price, says when a request was saved at the regular price, hides a $0 mobile line, words for the held price
  ("Vans, unusual vehicles and “Not sure” are priced by us"), "Price for this vehicle" for the owner's amount on a held
  vehicle; `dayFit` (which days a job of that length fits); `offerFine` (the small print).
- `site/js/booking.js`: step 02 type tiles by size, each naming its size, no XL choice for a new vehicle; step 03 "the
  same price as coming to us"; step 04 in three groups (Washes, Inside and out, Inside only?), the database's price and
  time for this vehicle on each card, the gold line on the Basic Wash card, the saving note, "Best value", the Full
  Detail's "not included" line, "Weekends only" where the hours say so; the new inside question; add-ons with their
  reason when they can't go ("Goes with the Basic Wash", "Already in the Full Detail"); step 05 says when no day is long
  enough; the receipt keeps the offer for a reload.
- `site/index.html` and `site/js/services.js`: the gold launch line, the offer and its small print, the size switch
  (remembered on the device), every card, the Table (twelve elements, Hw + Id → Au), the Ritual's words, the Bead Test
  about the Full Detail's sealant foam (PROPOSED: he hasn't chosen its new subject), the home cards ("Car $50"), the
  LD+JSON price range ($50 - $235), the old links (#book-ed) opening Services.
- `site/js/account.js`: the Full Detail's Au seal for the new code too; the pop-up (`offerPopup`).
- `site/js/admin.js`: the "New-customer price" tag in Requests and the Calendar, the regular price under the line, the
  "Price for this vehicle" panel for a held vehicle, the type and size on each booking, the offer settings in Settings,
  the new **Products** screen (`#admin-guide`, admin and managers), example data on the new menu.
- `site/js/guide.js` (new): the Products guide's content and its read-only screen.
- `site/js/team.js`, `site/js/content.js`: examples and labels on the new menu; the FAQ (no mobile fee; prices; the
  first-time price; "What's the inside like?"; times), Tips and About's products.
- `site/js/config.js`: booking open (`BOOKING_CLOSED = false`, the switch kept).
- `tools/shoot_booking.py`, `tools/shoot_account.py`: walk the new codes.
- `CLAUDE.md`: rule 8 rewritten; the new menu, offer, pop-up and guide described.

## How it was checked (Nov 17)

This container's network refuses the test project's host (a 403 from the egress proxy), so a browser here can't reach
the test database. The browser walks therefore ran in **preview mode** (the database cut off, as `tools/shoot_booking.py`
always does), and the same bookings were sent to the **test database** through the Supabase tools, as a guest, in one
block that rolls itself back (nothing was left behind, no alert sent):

| Booking | Test database | Site (preview), phone 390 × 844 and desktop 1440 × 900 |
|---|---|---|
| Car Basic Wash, first time | quote $35 "if first visit"; saved with the offer, $35, 92 min, line 3500/5000 | card "New customers: your first Basic Wash is $35"; summary and receipt "Basic Wash, new-customer price $35" |
| The same phone again (typed differently) | quote still shows $35 (the quote can't know); saved at $50 without the offer | receipt $50 with "The new-customer price is for a first visit only…" |
| 3-row Full Detail, some pet hair, stain removal | $285, 511 min | $285; "Weekends only"; the saving a note; one pet answer at a time |
| Minivan Interior Clean | $100, 157 min | $100; Wheels & Tire Shine greyed "Goes with the Basic Wash" |
| "Not sure" vehicle, Hand Wash | no total, `size_price`, 111 min (the longest size), Review lane | "Price confirmed before your appointment" |

Also: the Services size switch (3 rows: Full Detail $215, saving $30, Basic Wash offer $40; remembered after a reload),
the home cards, the pop-up (`?offerpopup`: shows, Esc closes, not again that day), `#admin-guide` (21 sections) and the
Requests tag. 27 of 27 checks on each screen size; no page errors. Light theme and reduced motion looked at on Services.

## Still for the owner

From the database step (C1-C17 in the design): a held vehicle price goes to Review (C1); the public quote shows the
first-time price "if first visit" and the saved request decides (C2, privacy); the Hand Wash card promises tire shine
and Inside & Out a dash protectant, which he doesn't own yet (C3); Basic Wash holds 92 minutes, the Hand Wash 91 (C6); XL
hidden on new bookings (C8); staff-entered bookings get the offer by the same rule (C9); the Bead Test's new subject
(C10); inside fees with the Full Detail and Interior Detail too (C11); which statuses use up the offer (C12); the 2-row
Full Detail ($190) is not gold on its own (C15). The Products guide's own 15 questions are at the end of its screen.

## Going live (not done)

1. Live, read-only first, then Migration 011's ten parts in order (the build's `db-report.md`, section 6), part 10 at
   the same sitting as the deploy; only with his OK (CLAUDE.md rule 7).
2. Merge `new-menu` into `main`, push, check both Vercel projects deployed the commit.
3. Only with his go-ahead for that step: `update public.business_settings set guest_booking = true where id = 1;` on live.

## Lessons

- **Syntax-check every file after a scripted edit, before a walk.** One missing bracket in `guide.js`, added by a
  one-line `sed`, stopped the whole Admin page (`missing ) after argument list`); the phone walk found it only because
  it timed out. `node -e "new (require('vm').Script)(…)"` on every `site/js/*.js` now runs before each walk.
- **A new grid area goes into every rule that redefines the grid.** The booking cards' new lines (offer, saving, not
  included) laid out fine on a desktop and fell into a narrow side column on a phone, whose media query has its own
  `grid-template-areas`. Search for every `grid-template-areas` of a component before adding a child.
- **Find out early whether the browser can reach the database.** The test project's host is refused here, so the
  walks used the preview, whose quote was first checked line for line against the test database's answers for the same
  inputs, and the bookings themselves were run against the database in a rolled-back block. The two together cover what
  one live walk would have.
- **Walks need real-looking names.** The name rule refuses "Test" as a last name; the walk stalled on step 01.
- **Prices still typed by hand drift.** The LD+JSON range, the FAQ's prices and times and a few notes repeat the menu;
  CLAUDE.md lists them, and they were checked against `service_size_rates` this time.
- **The MCP's held words shape the database work** (no replacing a function whose text says "delete"): the offer moved
  into `save_booking` instead of `read_booking_details`.

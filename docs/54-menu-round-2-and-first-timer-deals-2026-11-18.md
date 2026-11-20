# 54. Menu round 2: new prices, three First Timer Deals and the new booking order (Nov 18-19, 2026)

Branch `menu-v2` in the worktree `/home/user/fix-wt/menu2` (main 4b2df4b, Migration 011 live on both projects).
Nothing is pushed, nothing is deployed, and the live database is untouched. Migration 012 is on the **test** project
only (commit 72d27dd, the database report); the site is the next commit on the same branch.

## The owner's words (Nov 18, verbatim)

"Basic wash is now 109.99 eith the same thing as the descriptions it already has / Lets charge more, 89.99 for hand
wash / Scale inside and out to something higher based off these two / Samw with full detail / Also add on the top
"First time? Checkout First Timer Deals!" With a basic tier cleaning inside and one for outside and on for both at a
low price. / Change service selecting to first slide when booking and second slide is date, them do the rest"

His answers to our questions the same day:

- Basic Wash price: "$59.99 (Recommended)". We had pointed out that $109.99 would cost more than the Hand Wash.
  The descriptions stay as they are.
- Bundles: "Keep the same savings (Recommended)".
- Deals: "Basic / Clean / both (Recommended)".
- Booking step 1: "Size buttons on step 1 (Recommended)".

## His decisions, as built

**Prices** (car / 2 rows / 3 rows or pickup / minivan). Minutes and descriptions are unchanged.

| Service | Car | 2 rows | 3 rows or pickup | Minivan |
|---|---|---|---|---|
| Basic Wash | $59.99 | $64.99 | $64.99 | $64.99 |
| Hand Wash | $89.99 | $94.99 | $94.99 | $94.99 |
| Inside & Out | $114.99 | $129.99 | $139.99 | $149.99 |
| Full Detail | $179.99 | $204.99 | $229.99 | $249.99 |
| Interior Clean | $75 | $85 | $90 | $100 |
| Interior Detail | $125 | $145 | $165 | $185 |

- Inside & Out still saves $50 / $50 / $45 / $45 against a Hand Wash and an Interior Clean.
- The Full Detail still saves $35 / $35 / $30 / $30 against a Hand Wash and an Interior Detail.
- Add-ons and the inside answers are unchanged.
- A Full Detail on a 2-row vehicle or larger is now gold on its own (the $200+ rule).

**First Timer Deals.** Each deal is for a first visit only: one per phone number and one per address. They end
February 17, 2027 (the database's date). A customer gets at most one.

| Deal | What is booked | Car | 2 rows, 3 rows or pickup, minivan |
|---|---|---|---|
| Outside | a Basic Wash alone | $35 | $40 |
| Inside | an Interior Clean alone | $49.99 | $59.99 |
| Outside + inside | the Basic Wash and the Interior Clean together | $79.99 | $94.99 |

**Booking order.** 01 Service, 02 Date and time, then the rest: 03 Contact, 04 Vehicle, 05 Summary.

## What changed on the site

- **Money with cents everywhere.** `U.money()` already printed cents and dropped only ".00" ($59.99, $75); only its
  comment was wrong. Every seed, the saving notes, the home cards, the Table and the LD+JSON range
  ("$59.99 - $249.99") carry the new figures.
- **Banner "First time? Check out First Timer Deals!"** at the top of Home (over the hero, under the top bar, taking no
  room) and of Services (first line of the page head). It links to `#services-deals`.
  - It shows only while `get_first_visit_offer` says the deals run.
  - On Home it is asked once, just after the hero's first frame, apart from the menu's figures. Those still wait for
    the wash. The walk checked it is on screen within 2 s, with no scroll (review B1).
- **The Services section `#svc-deals`**, under the size switch. It has three cards: the deal's name, its services
  (linked to their groups), the price for the size shown, every size, "After your first visit: $X" and
  "Book this deal" (`#book-dealout`, `#book-dealin`, `#book-dealboth`). The small print sits under them.
- **Price-card lines.** On the Services page, the Basic Wash and Interior Clean cards carry "First Timer Deal: your first one is $35" (or
  $49.99), linking to the section.
- **The booking, in the new order:**
  - **01** has the size (Car / SUV or crossover, 2 rows / 3 rows or pickup / Minivan / Van, other or not sure), where
    (with the ZIP check), the deal chips for the size, the services and the add-ons.
    - A chip sets exactly its services and lets a bundle go (review S1).
    - The pair line reads "With your Basic Wash: both for $79.99, first visit".
  - **02** is the date step, unchanged.
  - **03** is the contact, plus the street address for a mobile detail.
  - **04** is the vehicle: the type within the chosen size, "Not sure? Type here", the inside question, damage, notes
    and photos.
  - **05** is the Summary.
- **Re-fit.** An inside answer or "Not sure" can change the price and the length after the time is picked:
  - The price is quoted again and the held day's times are checked again.
  - Step 04 then says either "Your time still fits..." / "The price is now $X", or "With what you chose, the job
    takes about 2 h 28 min, so 2:00 PM on Monday, ... no longer fits. Pick another time." with "Pick a new time".
  - When no day is long enough, it gives the phone number instead.
  - Continue on 03 and 04, and Send, wait for that check before deciding.
- **Price lines.**
  - A deal on two services reads as one line, "First Timer Deal: Basic Wash + Interior Clean $79.99", so the column
    still adds up.
  - A quote says "After your first visit: Basic Wash $59.99 + Interior Clean $75."
  - A saved booking (receipt, Appointments) says "Regular prices when booked: ..." (review S3).
  - The "first visit only" note after a reload sits under the deal's own services (review S4).
- **The pop-up** shows the three deals for the remembered size, each with its own Book link.
- **The console.**
  - The tag "First Timer Deal" ("Deal" in the week columns).
  - The detail names the deal, and "First Timer Deal for the two: $79.99 (regular $134.99)".
  - Settings has a row per deal.
  - The example data uses the new prices.
- **The FAQ.**
  - The costs answer is built from the database's rates (review S11).
  - "Are there First Timer Deals?" replaces "Is there a new-customer price?". A visitor who had the old question open
    finds the new one closed, once.
  - "How do I book?" and Home's "How booking works" follow the new order (review B3).
- **Preview mode** mirrors the database exactly: 78 of 78 quotes equal TEST's `quote_booking`. That covers every
  service and pair for every size, van, other and "Not sure", plus add-ons and inside answers. `?nooffer` previews the
  site with the offer over (for screenshots only).

## Contradictions, and what was chosen

- **Basic Wash price.** His first words said "$109.99"; his newer answer the same day said "$59.99". Built with
  $59.99.
- **"Cars with normal road dirt."** It is in the approved Nov 17 small print of the Basic Wash price (spec.md,
  content.js, index.html). Spec 2 (newer) leaves it out.
  - Both versions are recorded here.
  - The site keeps it on the Outside deal only ("Outside: cars with normal road dirt.").
  - **Question for the owner:** does it also apply to Inside and Outside + inside?
- **Banner wording.** He wrote "Checkout First Timer Deals!"; the spec says "Check out First Timer Deals!". Built
  with the spec's.
- **Street address.** The spec lists it after the inside answers; it is built with the contact (03), as one short
  "about you" step. The ZIP stays on 01, so the service-area answer comes before a day is picked.
- **Deal names.** "Outside", "Inside" and "Outside + inside" are our words for his "one for outside, one for inside
  and one for both". They live in the database, so he can rename them.
- **Pairs that no longer get a first-visit price.** Under Migration 011, a Basic Wash booked with any inside service
  got $35 off. Now only the exact pairs get a deal: Basic Wash + Interior Detail and Hand Wash + Interior Clean pay the
  regular price.

## Open points for the owner (PROPOSED, not built)

1. **Guest repeat deals.** A guest's phone is not confirmed until Twilio. With "Come to us" (no address to check) and
   a different phone, the same person can get another deal, now worth up to **$70** (a minivan's Outside + inside:
   $164.99 regular against $94.99; the first version of this doc said $55, which was wrong). The database verifier
   (Nov 19) found two more ways for a guest: a mobile address that doesn't read as a street (no address key), and the
   same street written another way ("Cedar Bend 405" against "405 Cedar Bend"). Require anything more? A possible
   rule, if he wants one: no deal on a mobile request whose address can't be read (`save_booking`: `if r.location_type
   = 'mobile' and v_key is null then v_offer := false;`), with a matching line on the quote. Until he answers, this is
   accepted as it is, in writing, here; part 6 should not go live without his answer or his OK to this paragraph.
2. **A returning visitor.** Signed out, they are quoted the Both price ($79.99) with no Inside & Out suggestion
   (the database drops it when the deal is cheaper), then saved at the regular $134.99, which is $20 more than Inside
   & Out at $114.99, with the Hand Wash in it. The same for 2 rows ($149.99 against $129.99). The customer sees the
   regular price on the receipt with the "first visit only" note, but nothing points to Inside & Out. Two ways, his
   pick (the database must not swap the services by itself):
   - (a) the quote keeps the suggestion beside the deal, marked as the "not your first visit" choice, and step 01
     says "Not your first visit? Inside & Out is $114.99, with the Hand Wash" (a change to `quote_booking` and the
     preview); or
   - (b) the receipt of a request saved at the regular price says "Inside & Out would have been $114.99. Call (945)
     361-7551 to switch."
   Recommended: (a), since it tells the customer before they send.
3. **"Launch prices while we earn our first reviews."** Kept; with the prices raised, does he want it gone?
4. **"Cars with normal road dirt."** On Inside and Outside + inside too? (See above.)
5. **The inside question's place.** It now comes after the date, which is what can force a re-fit (a lot of pet hair
   adds 45-60 minutes). The alternative: ask it on step 01 under the inside service.

## The verifiers' round (Nov 19) and what was fixed

Two verifiers read branch `menu-v2` at b767905 (database and security; site and clarity). Neither found a database
defect. The site verifier found one blocking bug and six clarity problems; all are fixed in the site, and nothing in
Migration 012 changed (its six files are byte for byte those of 72d27dd).

- **B-1 (blocking): the FAQ's deals answer was garbled** ("...cars with normal road dirt.99, Interior Clean $75.").
  content.js cut "After your first visit: ..." out of the small print with a pattern that stopped at the first full
  stop, which was the one inside "$59.99". `U.dealsFine` now takes a fifth argument that leaves the regular prices out,
  and the FAQ uses it. The answer now ends "...Outside: cars with normal road dirt. Offer ends February 17, 2027."
- **S-1: "Book this deal" and the pop-up's Book lost the size.** When a deal or a service link opens the booking with
  no size chosen, the booking starts from the size the page showed (`ad-size` on this device; the Services switch, the
  pop-up and step 01 keep it). Step 01 now opens with one line naming what the link picked: "First Timer Deal: Outside +
  inside picked (Basic Wash + Interior Clean). Prices are for: 3 rows or pickup. Not your size? Choose another below.",
  or "... Choose your size to see your price." when no size is known.
- **S-2: with the Outside + inside deal chosen, the two cards didn't add up** ($35 + $49.99 shown, $79.99 total). Each
  card now shows its share of the deal, as the database splits it: Basic Wash $35, Interior Clean $44.99 "with your
  Basic Wash, first visit · then $75", and "Together, first visit: both for $79.99" once, on the Interior Clean card.
  The gold line under the price says only "First Timer Deal" (with the deal's name for the pair), never the price a
  second time.
- **S-3: "saves you $X for the same two services" was untrue** when the services differ (a Basic Wash; the bundles
  have the Hand Wash). The line now says "Inside & Out is $20 less, with the Hand Wash in place of the Basic Wash."
  ("Full Detail is $5 less, ..." for the Interior Detail). With the bundle's own two services it still says "saves you
  $50 for the same two services."
- **S-4: the deal disappeared silently on step 04.** When "Not sure" (or another held price) ends a deal the date step
  had, the re-fit line says: "First Timer Deals are for the four listed sizes; with “Not sure” we confirm the price
  before your appointment."
- **S-5:** the three "Book this deal" links are named for screen readers ("Book the Outside + inside deal").
- **S-6 (optional, done):** a deal chip that leaves an add-on off says so in the step's status line ("Leather care is
  left off: it goes with the Inside & Out or Interior Clean.").

Database notes from the verifier, not changed:

- **TEST is paused** (`INACTIVE`; every tool call answers "Database is possibly not accessible"). Restoring it is the
  owner's call (or his OK to us). Before any live apply: restore it, re-run `m012_tests_deals.sql` (expect 106 of 106),
  `m011_tests_menu.sql` (136 of 136) and the report's hash checks. Meanwhile both suites were run on a throwaway local
  Postgres 16 with every migration 001-012: 136 of 136, and 105 of 106 (A15 needs an existing booking without the
  deal; the local copy has none, TEST has 136; not a defect).
- **A staff booking takes the staff member's customer lock**, not the customer's (`staff_create_booking`, as in m011).
  A staff booking and the same account's own booking at the same moment with two different phones could both get a
  deal, only for an account with no text-confirmed phone, which live can't have (only TEST's Migration 004 email
  accounts). Not fixed: `staff_create_booking` differs between the projects (004 is test only), so replacing it would
  need two versions; worth doing with the next change to that function.
- **The receipt and `office.requests` read the deal's name when they are read**, so renaming a deal later renames it on
  old receipts too. The deal's code is stored on the booking, so the record itself is exact.
- The preview's own `submit()` checks a deal per phone only (not per address). Preview only; it never reaches the
  database.

## How it was checked (Nov 19)

- This container's network refuses the Supabase hosts, so the browser walks ran in preview mode (database cut off).
- The preview's quotes were compared with TEST's `quote_booking` for the same 78 inputs (equal).
- The walk ran on phone (390 x 844) and desktop (1440 x 900), dark and light, once with reduced motion and once
  without WebGL. It covered:
  - Home's banner on arrival and with the offer over.
  - Services' section, sizes and card lines.
  - A full guest booking with the Both deal, the receipt and its reload.
  - A second booking with the same phone (the regular price and its note).
  - The re-fit: a Monday 2:00 PM Interior Clean plus "A lot of pet hair" no longer fits; a weekend price-only change
    keeps the time.
  - Deep links (`#book-bw`, `#book-io`, `#book-dealboth`, `#book-dealin`, the retired `#book-ed`), and a deal link
    over another request (it asks).
  - "Van, other or not sure", the keyboard, the pop-up and the console.
- Result: 60 of 60 checks in each of the five walks (300 in all), no page errors, and no sideways scroll at 360 and
  390 px. The preview's `get_first_visit_offer` also equals TEST's answer.
- `tools/shoot_booking.py` and `tools/shoot_account.py` walk the new order.
- Not checked again: the guest, account and staff save paths on TEST. The database step's 106 checks cover them, and
  the test project stopped answering the tools during this site step.
- Details and screenshots are in the build's `site-report2.md`.
- After the verifiers' fixes: the five walks again (300 of 300), a new walk of every fix (22 checks each at 390 phone,
  1440 desktop and 360 phone: 66 of 66), the 360 px width check on steps 01-05, the verifier's own 24 scripts (no page
  errors), and `node --check` on every `site/js` file.

## Lessons

- **A hidden part can't be scrolled to.** `#services-deals` appears only once the database answers, so the router now
  waits for it to show (up to 4 s, and only if the page hasn't moved) before it scrolls.
- **Name the steps, never number them.** booking.js had about 46 bare step numbers; they are now `S_SERVICE` ...
  `S_SUMMARY`, and `grep -nE "(step|n|editFrom|from) *[!=<>]=* *[0-9]|(go|show|flag|validate)\([0-9]" booking.js`
  prints nothing.
- **Read a check's state, not its promise.** The re-fit reads the request itself (times loaded, start kept or lost),
  and a second caller of the same day's times waits for the first fetch (`w.loading`). A check still on its way can
  then never read as "no longer fits".
- **Never cut a sentence at "the next full stop" when it holds money.** "$59.99" has a full stop of its own. Build the
  shorter text instead of cutting the longer one (B-1).
- **Two cards chosen together must add up to the total.** A card that shows a service's price alone is right only while
  it is alone; with a two-service deal each card shows its share (S-2).
- **The database orders add-ons.** `json_text_array` makes them distinct and sorts them; the preview now does the same,
  or its lines come out in another order.

## Merged release (Nov 19)

Branch `release-nov19` joins this branch with `light-home` (doc 55). Two verifiers walked the merge in preview mode.
They found one bug that stops the release and five smaller ones from this branch. All were already on `menu-v2`, and
all are now fixed:

- **Blocking: booking step 01 scrolled sideways on phones.** At 390 px and narrower the service cards came out wider
  than the screen (408 px on a 390 px phone). Their right edges were cut off, "SELECTED" touched the edge, and a finger
  could pan the page. The cause was the size prices: each kept to one line, and with the "Selected" column the card
  needed about 370-380 px inside a 336 px column. On phones the column may now shrink, the small price lines wrap, and
  "every size" stacks in one column. Before and after a size is picked the page is now exactly the screen's width at
  390, 360 and 320. `smoke.py` had caught it (2 FAILs). Our own walks had not: they compared against `innerWidth`,
  which a phone browser stretches to fit the page. The walks now compare against `clientWidth`, as `smoke.py` does.
- **The Services gold line was hard to read in light mode** (about 1.7:1, dark gold on the dark photo). It keeps the
  showroom gold there, and both themes now get a smoked glass under it. That measures 9:1 typical and 6:1 at the
  photo's brightest spot (dark was 3.6:1 there). Home's line still follows the theme: dark gold on the ivory hero.
- **On short phones the Home line covered the tip of the monogram's star** (iPhone SE 375 x 667, and Safari with its
  toolbar showing). On phones up to 720 px tall it now sits a little higher and slimmer, between the top bar and the
  star. On short windows wider than a phone (a 1366 x 768 laptop) the hero's words start a little lower instead. That
  happens whether or not the line shows, so nothing moves when it arrives. Checked at 16 sizes in both themes: no
  overlap.
- **The line arrived with a quick pop.** It now arrives the hero's calm way (doc 55): it fades in and settles.
- **Print:** Home's floating line is left off the printout, because the deals section prints the offer. Deal cards no
  longer split across pages.
- **Light mode: the chosen deal chip in booking step 01** now keeps its gold fill, so you no longer have to spot the
  border to see which one is chosen.
- **"First time? Start here." now floats in letter by letter** like every other heading on Services. Its look is
  unchanged.

Checked after the fixes, in preview mode:

- `smoke.py`: 72 of 72 ok.
- Booking step 01 (`#book` and the three deal links) at 390, 360 and 320: page width equals screen width every time.
- The menu walk (`walk.py`, phone light): 60 of 60.
- Services contrast, measured from screenshots: light 8.2:1 typical and 5.1:1 worst; dark 9.0:1 typical and 6.2:1
  worst.
- Print: Home's line hidden; the Services line printed in the print ink.
- The chosen chip in light: gold fill.
- The banner still lands on `#services-deals` (6 of 6).

## Live (Nov 20, 2026)

The owner wrote "Push". Merged with the light-mode Home and calm-motion work (doc 55) as branch `release-nov19`, pushed to
`main` as 4a6b531; both Vercel projects built it (READY).

- Read-only pre-checks on live: no m012; every function Migration 012 replaces had the pre-012 md5. `submit_booking`
  and `staff_create_booking` differ from TEST because live never got Migration 004; both still end in
  `read_booking_details` -> `lock_day` -> `save_booking`, as does `submit_guest_booking`. Appointments: 3, none with
  the first-time price (unchanged after).
- Parts 1-5 applied one by one, then the push, then part 6. Parts 1 and 2 were sent with their long header comments
  trimmed (the SQL is identical; the function md5s prove it).
- Post-checks: all eleven function md5s and the `office.requests` view md5 equal TEST's; three deals on; as anon:
  car Basic Wash $35, car Both $79.99 with no Inside & Out suggestion, 2-row Both $94.99, car Inside $49.99, Hand Wash
  $89.99, Inside & Out $114.99, Full Detail $179.99; `get_first_visit_offer` active to 2027-02-17 with three deals.
- The live page serves "First time? Check out First Timer Deals!".
- Not done: the m011/m012 suites were not re-run on TEST first, because TEST is paused and the account is at its two
  free active projects (the suites passed on TEST on Nov 19 before it paused, and 105 of 106 on a local copy, the one
  miss needing data the copy lacks). No test booking on live.

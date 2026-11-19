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
- **Price-card lines.** The Basic Wash and Interior Clean cards carry "First Timer Deal: your first one is $35" (or
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
   a different phone, the same person can get another deal, now worth up to $55. Require anything more?
2. **A returning visitor.** Signed out, they are quoted the Both price ($79.99) with no Inside & Out suggestion, then
   saved at the regular $134.99, which is more than Inside & Out at $114.99. Should we add a quiet line ("Not your
   first visit? Inside & Out is $114.99 with the fuller Hand Wash")?
3. **"Launch prices while we earn our first reviews."** Kept; with the prices raised, does he want it gone?
4. **"Cars with normal road dirt."** On Inside and Outside + inside too? (See above.)
5. **The inside question's place.** It now comes after the date, which is what can force a re-fit (a lot of pet hair
   adds 45-60 minutes). The alternative: ask it on step 01 under the inside service.

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

## Lessons

- **A hidden part can't be scrolled to.** `#services-deals` appears only once the database answers, so the router now
  waits for it to show (up to 4 s, and only if the page hasn't moved) before it scrolls.
- **Name the steps, never number them.** booking.js had about 46 bare step numbers; they are now `S_SERVICE` ...
  `S_SUMMARY`, and `grep -nE "(step|n|editFrom|from) *[!=<>]=* *[0-9]|(go|show|flag|validate)\([0-9]" booking.js`
  prints nothing.
- **Read a check's state, not its promise.** The re-fit reads the request itself (times loaded, start kept or lost),
  and a second caller of the same day's times waits for the first fetch (`w.loading`). A check still on its way can
  then never read as "no longer fits".
- **The database orders add-ons.** `json_text_array` makes them distinct and sorts them; the preview now does the same,
  or its lines come out in another order.

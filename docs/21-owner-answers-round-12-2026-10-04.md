# Owner answers, round 12 (Oct 4, 2026)

Answers to the questions at the end of doc 20. Recorded as given, then what each means. This round changes some of doc 20; where it does, this doc is newer.

## 1. Volume and capacity (answers V-1, V-4 in part)

Owner: "Because I'm just one person right now, let's keep the amounts lower and scale higher and increase bookings for mobile and maybe make 3-4 rigs for detailing. I think right now I could do 10 details a week."

- **DECIDED (now):** the owner is solo. Realistic volume is about **10 details a week**. Keep the current Migration 001 capacity rules (one mobile job at a time, or two driveway jobs) for launch.
- **DECIDED (later):** grow bookings, mostly mobile, and possibly **3–4 rigs** (a rig = a detailer plus equipment working a job).
- **Supersedes doc 20 (as understood):** "4–8 clients a day, 20+ a week" is the **scale-up target**, not the launch number. Say so if that is wrong.
- **PROPOSED (design only, do not build now):** make capacity configurable by the number of active rigs, so growing from 1 to 4 is a setting, not a rewrite. Concretely, a `rigs` concept (name, active) with `get_availability` and `get_calendar` allowing one mobile job per available rig. Build this when the owner adds a second rig.
- Still OPEN: V-4 (does buffer and travel time count toward a day; same as X-8).

## 2. The 200+ gold rule and loyalty (answers G-1 to G-5)

Owner: "$200 bundles or a payment $200+, and it turns gold after they have paid. It doesn't matter whether they have gotten a $170 bundle (example) and then stain removal too, meaning after a payout of $200+ they have the gold features. Customers should get perks like gold reviews and higher loyalty, also add some loyalty features where discounts can be applied after X amount of washes in the future, not now."

- **DECIDED:** gold is earned **after payment**, based on what the customer **actually paid**, not on the quoted price. Extras added on the day (for example stain removal on top of a $170 bundle) count toward the $200. A $200+ bundle also qualifies.
- **DECIDED:** gold customers get **gold reviews** and **higher loyalty** perks.
- **DECIDED (not now):** loyalty discounts after **X washes**, in the future. **Do not build now.** Do not invent X or the discount; ask when the owner wants it.
- **Consequences (PROPOSED):**
  - Payments happen in person (card, tap, cash, Zelle), so the app cannot see them. Staff need a **"Record payment"** action: amount paid, method, who recorded it. It only *records*; nothing is charged. This is a new database function and table (`payments`), Migration 002.
  - Gold is set when recorded payments for a booking reach **$200 or more** (threshold in `business_settings.gold_threshold_cents`, default 20000). Replaces the earlier "price above $200" wording in doc 20.
  - Gold shows on the admin side as a **gold booking** once paid, and on the customer's review for that booking.
  - Add a **completed-jobs count** per customer now (a plain count the database can already derive), so the future loyalty rule has data from day one.
- **OPEN (new):**
  - G-6: Does gold belong to the **booking** (this one job paid $200+) or the **customer** (all their payments added up reach $200 over time)? The owner's wording "after a payout of $200+ they have the gold features" and "customers should get perks" could mean either. Recommended: the booking earns a gold review, and the customer becomes a **Gold client** after any one booking reaches $200 (customer-level perks). Confirm.
  - G-7: Which perks does a Gold client get besides gold reviews (priority sorting in the request list, a thank-you note, early access to times)? Propose, owner picks. No discounts until the loyalty feature is specified.
  - G-8: Tips: do tips count toward the $200? (Proposal: no, services only.)
  - G-9: Who may record a payment: owner and managers only, or detailers too? (Proposal: owner and managers; detailers can mark "paid in person" for approval.)

## 3. Time off (answers V-2, V-3)

Owner: "House rule, I'll add it to the website when noticed. Yes, I can override, me and manager approve it."

- **DECIDED:** the one-week notice is a **house rule**, not enforced by the database. No hard block.
- **DECIDED:** the owner and the manager approve time off and can override the notice. So:
  - A time-off entry is a **request** that the owner or manager **approves** (admin and manager only).
  - The screen shows a warning when less than 7 days' notice is given; approval is the override. Record who approved.
- **Website notice (as understood):** when time off is approved and affects bookable time, the owner will add a notice on the website. PROPOSED: a small "notice" setting in the admin (text and dates) shown on the booking calendar, so he does not need a developer. Confirm if that is what he meant.
- **Still unclear (OPEN):** V-3 part two, who can *enter* the request: the team member, or only the owner/manager. Recommended: the team member enters it, the owner or manager approves.

## 4. AI first features

Owner: "Yes, do you mean moving to Claude Code?"

- Clarification: the question was only which AI features to build first (request triage, reply drafts, the morning summary). The answer "yes" is taken as **approved for those three**, to be built in the AI phase (phase 6 of doc 19, staff only, under $10 a month).
- Moving to Claude Code is a separate step. The handoff folder is ready for it; see START-HERE.md.

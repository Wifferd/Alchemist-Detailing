# Owner answers, round 11 (Oct 4, 2026)

Answers to the three questions at the end of doc 19. Recorded as the owner gave them, then what each one means for the build.

## 1. AI (answers Q-AI1, Q-AI2)

Owner: "I will approve AI for only staff for now with an option to add for customers later and the budget is under $10 per month."

- **DECIDED:** AI for staff only (Tier 1 in doc 19). Customer-facing AI (Tier 2: AI-8 to AI-10) is **not** built now, but the design must keep the door open: no staff-only assumptions inside the shared Edge Function pattern, and a separate `ai_customer_enabled` switch that stays off.
- **DECIDED:** budget **under $10 per month**. Enforced in the Edge Function (hard stop at the cap, a warning at 80%), logged in `ai_runs`.
- Build consequences (PROPOSED, follows from the budget): use the smallest capable model for each task, short prompts, small `max_tokens`, one summary per request instead of repeated calls, cache the morning digest, photo notes only when staff tap "Analyze photos". Which Tier 1 features to build first is still open (recommended: AI-1 triage, AI-3 reply drafts, AI-5 morning digest).

## 2. The "$200+ gold rule" (answers Q-A3)

Owner: "Lets call it the 200+ gold rule. The functionality would be if we have an appointment above $200, that account that leaves a review will shine in gold as a design, and it should appear as gold on the admin side as a gold booking. You can mess with it and see what benefits you could add on."

- **DECIDED (settles the contradiction in doc 19, 7.3):** the rule is **kept**, named the **200+ gold rule**. The audit's "dropped" note is superseded.
- **Meaning (as understood):**
  1. A booking whose price is above $200 is a **gold booking**, shown in gold on the admin side.
  2. A review left for a gold booking is shown in gold ("shines") on the public Reviews page.
- **Needs confirming (OPEN):**
  - G-1: Above $200 means the **total price** (after mobile percentage and bundle savings)? Is exactly $200 gold or not?
  - G-2: Bookings whose price is still pending (XL, heavy stains): gold when the final price is set above $200?
  - G-3: Gold reviews on the public page: is it fine that this hints the customer spent a lot? (Proposal: show a gold style only, never an amount, and no label saying "over $200".)
  - G-4: The gold is attached to the **booking**, not the account; a customer with one $250 job and one $80 job gets a gold review only for the $250 job. Right?
  - G-5: Does a cancelled or declined booking ever count? (Proposal: only completed jobs.)
- **Benefits worth adding (PROPOSED, nothing built until approved):**
  - A **Gold client** marker on a customer once they have a gold booking: admin sees a small gold crest next to the name in Requests and Customers, for faster, warmer service.
  - **Gold summary in the morning view:** "3 gold bookings today, $X" (admin only).
  - **Priority hold:** gold clients' requests sorted to the top of the Requests lane (sorting only; the 24-hour hold is unchanged).
  - **AI-3 reply drafts** use a warmer tone template for gold clients (owner still edits and sends).
  - A one-time gold "thank you" line on the Request sent / review request text. Not a discount.
  - Reviews page: gold reviews pinned first, with gold shine animation (one effect, respects reduced motion).
  - Do **not** add: public spend amounts, automatic discounts, or tiers the owner has not approved.
- **Data (PROPOSED, Migration 002):** `appointments.is_gold` set by a trigger when the final total passes the threshold and by the staff price action; threshold stored in `business_settings` (`gold_threshold_cents`, default 20000), not hard-coded; `reviews.is_gold` copied from the appointment when the review is created so it cannot be changed by the customer.

## 3. Admin morning view, team availability, volume (answers Q-D1; part of Q-T)

Owner: "Each morning I'd like to see all my booking and team availability. I need a notice prior by a week for each person if they are to be unavailable. For now, I'd like 4-8 clients per day and at least 20 per week, most of them should be mobile using their water and power."

- **DECIDED (morning view contents):** all bookings (today and ahead) and team availability. The rest of the PROPOSED morning view in doc 19 (lanes, price-pending items, gold count) stays as a proposal.
- **DECIDED (time off):** each team member must give **at least one week's notice** before being unavailable.
- **DECIDED (targets):** **4–8 clients per day, at least 20 per week, mostly mobile** (customer's water and power).
- **Build consequences (PROPOSED):**
  - New `team_unavailability` table (person, date or range, reason, entered_by, created_at) and a staff action to add or remove it. The database refuses an entry less than 7 days ahead unless an admin overrides.
  - Admin "morning view": a day timeline with each person's jobs and a clear Available / Off / Booked marker, plus the next 7 days at a glance.
  - A weekly counter on the admin dashboard against the 20-job goal and a daily counter against 4–8 (display only, no automatic action).
- **Conflict to settle before the admin phase (OPEN, do not decide):**
  - V-1: Migration 001 allows **one mobile job at a time** (or two driveway jobs), jobs start 10 AM–7 PM and finish by 8 PM. With mostly mobile work, that is at most about 4–5 jobs per day for 2-hour details and fewer for long ones, so **8 per day needs a second detailer working mobile jobs at the same time, or shorter jobs**. Should capacity grow with the number of available team members (for example one mobile job per available detailer)? That would be a database change (Migration 002) to `get_availability` and `get_calendar`.
  - V-2: Is the week's notice a hard rule the system enforces, or a house rule the owner checks? What about sickness or emergencies? (Proposal: admin can override with a reason, logged.)
  - V-3: Who enters time off: the person themselves, or only the owner/manager? Does the owner approve it?
  - V-4: Does buffer and travel time (X-8, still owed) count against the daily total?

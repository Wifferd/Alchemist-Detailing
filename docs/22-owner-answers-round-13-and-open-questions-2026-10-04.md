# Owner answers, round 13, and the open-questions list for Claude Code (Oct 4, 2026)

The owner asked to stop the question rounds here. **From now on Claude Code asks the owner what it needs, one phase at a time, in plain words, with a recommendation.** Section 2 is the starting list.

## 1. Answers to doc 21

| # | Question | Answer |
| --- | --- | --- |
| G-6 | Gold belongs to the booking or the customer? | "Yes, you are assuming right": a booking paid $200+ earns a gold review, and the customer becomes a **Gold client** with customer-level perks from then on. **DECIDED.** |
| G-7 | Which Gold client perks beyond gold reviews? | **TBD.** Work on everything else; keep this for a future upgrade. Build only gold reviews and the Gold client marker for now. No other perks, no discounts. |
| G-8 | Do tips count toward $200? | **No. Services only.** DECIDED. |
| G-9 | Who records payments? | **Only the owner records payments.** DECIDED. See the note below. |
| V-3 | Who enters time off? | **The team member enters it; the owner or a manager approves.** DECIDED. |
| Notice box | An admin notice box shown on the booking calendar | **Approved.** DECIDED. |

**Note on G-9.** The owner read "record payment" as the quote or the final amount due, and said that if it meant *taking* payment, it is **whoever did the job**. Recorded as two separate things:
- **Taking payment in person** (card reader, tap, cash, Zelle): done by **whoever did the job**.
- **Recording the amount paid in the system** (the final amount, which sets gold): **only the owner**.
- Claude Code should ask how a detailer tells the owner what was collected (suggestion: a "collected on site" note on the job that the owner turns into the recorded payment).

Also confirmed by "you are assuming right": the capacity and volume reading in doc 21 (about 10 details a week now; 4–8 a day and 20+ a week is the later target) stands.

## 2. Open questions Claude Code should ask, in order of when they matter

**Before the booking app (phase 1)**
- X-4 bundle tiers, X-5 what Steam Cleaning can be added to, X-7 sealant and steam minutes, X-8 buffer and travel minutes, X-25 which stains hold the price.
- The owner's private address (used only with a confirmed "Come to us" booking).
- ZIP codes 75072, 75407 and 75042: in or out of the mobile area?
- Photos and videos for the design upgrade (not needed for booking).

**Before account and appointments (phase 2)**
- Q-A1 what else belongs in a customer's account.
- Q-A2 can customers cancel or reschedule online, with a cutoff or a fee?

**Before the admin console (phase 3)**
- Q-D2 which admin actions should be one tap (confirm at the requested time, decline with a reason).
- Calendar notice box: wording, and whether it also blocks dates or is display only.
- V-4 whether buffer and travel time count toward a day.

**Before the detailer view (phase 4)**
- Q-T1 what a detailer needs at the job, Q-T2 what a detailer must not see (phone, price, notes), Q-T3 before and after photos and extra-cost requests.
- How a detailer reports what was collected on site (see the G-9 note).

**Before migration 002 and reviews (phase 5)**
- Q-R1 to Q-R5: who may post, approval first, owner replies, first names only, link to Google reviews.
- Gold details already settled: threshold $200 of recorded service payments; Gold client marker; gold review.
- Q-N1 which texts or emails the system sends, and when.
- Q-P1 how long customer data and photos are kept; can a customer ask to delete theirs.

**Before AI (phase 6)**
- Brand voice for drafted replies (Claude proposes three samples).
- Confirm the monthly cap under $10 and the warning at 80%.

**Before content pages (phase 7)**
- Who writes Tips, FAQ and About, and whether the owner wants to edit them in the portal.

**Parked (do not build, do not ask until the owner raises them)**
- Loyalty discounts after X washes. Keep only the completed-jobs count.
- Gold client perks beyond gold reviews (G-7).
- Customer-facing AI.
- Capacity per rig and 3–4 rigs.

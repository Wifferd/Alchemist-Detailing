# 32. The owner's answers for the final run (Oct 5, 2026)

Answers to the "what is left" list (doc 31 follow-up), and what was done with them.

| # | Topic | The owner said | Done |
|---|-------|----------------|------|
| 1 | Texting service | "I need time." | Waiting. Sign-in codes and confirmations stay untested in live mode. |
| 2 | Migration 002 on the live project | "OK." | Applied to live on Oct 5, 2026 (all five parts). Live and test now match. |
| 3 | Photos | "OK." | Waiting for an interior photo and more cars. |
| 4 | Draft Tips, FAQ, About | "Keep them how they are on the preview, I like them." | The wording is frozen as it stands. The "draft" banners stay until he says to remove them. |
| 5 | Hours | "10am–7pm daily, but keep 12–5 blocked on Friday for Jummah prayer, and Mon through Thu 4–8 blocked." | Migration 003 (`weekly_closures`): open 10 AM–7 PM every day; Mon–Thu nothing may run 4–8 PM (so the last start is such that the job ends by 4 PM); Friday nothing 12–5 PM. Applied to test (25 of 25 tests pass) and to live. |
| 6 | Custom domain | "YES, custom like that." | alchemistdetailing.com and alchemist-detailing.com are taken. Available (Vercel, per year): alchemydetails.com $11.25 (matches the Instagram handle alchemy_details), alchemistdetailingtx.com $11.25, thealchemistdetailing.com $11.25, alchemistdetails.com $11.25, alchemistdetailing.net $13.50, alchemistdetailing.us $7.99, alchemistdetailing.co $29.99. Waiting for his pick; he buys, or approves the Vercel quote, and Claude Code connects it. |
| 7–10 | Live test, design pass, staff features, launch checklist | "OK." | The design pass and launch checklist ran as the final run (this session). Live test and the "running late" / start-complete features wait on texting. |

Also: "Hit up the best possible designs and animations you can do right now, this is the final run."

## Hours, as the database now holds them

`business_settings`: first start 10:00 AM, last start 7:00 PM, jobs end by 8:00 PM, 30-minute grid (unchanged).

`weekly_closures` (ISO weekday, 1 = Monday):

| Weekday | Closed | Reason (staff only) |
|---------|--------|---------------------|
| Mon, Tue, Wed, Thu | 4:00 PM – 8:00 PM | Not available 4 to 8 PM |
| Fri | 12:00 PM – 5:00 PM | Jummah prayer |

A start time is offered only when the whole job fits outside the closures. Examples: a 60-minute job on a Monday can start up to 3:00 PM; on a Friday up to 11:00 AM and again from 5:00 PM to 7:00 PM; on a Saturday any time from 10:00 AM to 7:00 PM. Staff cannot book into a closure either. The admin can change the rows in `weekly_closures` (same access as closed days); the admin console shows them under Settings.

## The owner's own designs (Oct 10, 2026)

He sent a design canvas, "Alchemist Web Design Ideas" (https://claude.ai/artifact/66WQwuFdDtctzZ77TqHzba), with six sections and said "use some of these designs": 1 The Alchemist's Table (the menu as a periodic table of elements, with a side panel per element), 2 The Bead Test (bare paint vs WetGloss, two panels with a gold seam, prices by vehicle type), 3 The Transmutation (a before/after slider; no before photos yet, so it stays hidden on the live site until a pair exists), 4 The Ritual (five expanding panels: snow foam, wheels, hand wash, hand dry, seal), 5 The Gold client card (in Account, for a customer with a completed $200+ detail), 6 Gold reviews as assay certificates (the Reviews page). Every price, time and process step in them was checked against the database on Oct 10, 2026 and matches. The three illustration images in the canvas are renders (water film, beads, foam), used as textures only, never captioned as our work. The final design run builds them.

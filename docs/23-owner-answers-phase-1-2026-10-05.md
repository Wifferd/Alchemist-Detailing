# Owner answers, phase 1 (Oct 5, 2026)

First answers given directly to Claude Code, to the phase 1 list in doc 22. Recorded as given; follow-up questions at the end. Nothing here is built yet unless marked.

## Answers

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| X-4 | Bundle tiers | **Two bundles for now** (Signature Combo, Full Detail). The owner has a four-tier menu in mind for later; see "Future tier menu" below. Bundles are made up on site already. | DECIDED for launch; tiers are FUTURE |
| X-5 | What Steam Cleaning can be added to | **Any interior job that doesn't already include steam.** No exterior-only booking can add steam. Today that means Interior Basic and Signature Combo (Interior Deluxe and Full Detail include it). | DECIDED. Needs the `addon_rules` row changed from `any_main` to `interior`. |
| X-7 | Add-on minutes | **Steam Cleaning 30 minutes maximum. Sealant 30 minutes.** | DECIDED. Needs `duration_min` set on both add-ons. |
| — | Sealant name | The product is **WetGloss**, not "Perfect Finish Sealant". | DECIDED. Rename in the database and on the site. Open: does "lasts about 8 to 12 weeks; don't wash for about 24 hours" still describe WetGloss? |
| X-8 | Buffer and travel minutes | **Mobile: 10 minutes maximum. At home: none**, because the listed job times already include extra. Must be easy to change later. | DECIDED. `mobile_buffer_min = 10`, `shop_buffer_min = 0` (already a settings row, so it is changeable). |
| X-25 | Which stains hold the price | Not answered in this round. | OPEN, asked again |
| — | Service area | The owner's base is **around Collin College in Wylie**, ZIP given as **75002**. He wants a **10-mile radius until he gets a rig**. | See the contradiction below. |
| — | Borderline ZIPs 75072, 75407, 75042 | Not answered as such; the radius center may have moved, so the whole list is re-checked once the center is confirmed. | OPEN |
| — | Private address | **Received.** It is kept out of this repository on purpose (CLAUDE.md rule 6). It goes only into `business_settings.shop_address`, with the owner's OK for the live project. | **Stored** in the live project's settings on Oct 5 (owner's OK). |

## Contradiction to settle: where is "home"?

- The site, CLAUDE.md and `business_settings.public_area` all say **Parker, Texas**, and the ZIP list in Migration 001 was drawn 10 miles around Parker's center.
- The owner now says his base is **around Collin College in Wylie** and gives ZIP **75002**. 75002 is the Allen / Parker ZIP; Collin College's Wylie campus is in 75098. The private address he gave fits Parker.

Nothing is changed until he confirms: (a) the public area name shown to customers, and (b) the point the 10-mile radius is measured from. Once confirmed, the ZIP list is recomputed from that point.

## Future tier menu (owner's thoughts, NOT built, NOT priced in the database)

Recorded word for word in substance. These prices and times differ from the current menu (for example Exterior Basic is $49.99 today). The owner said "let's do 2 for now", so the current menu stands until he decides otherwise.

**Interior**

| Tier | Name | Includes | Price | Time |
| --- | --- | --- | --- | --- |
| 1 | Basic | Vacuum and wipe-down | $25–35 | 1 h |
| 2 | Premium | Vacuum, wipe-downs, scrubbing with brushes | $50 | 1 h 30 |
| 3 | Deluxe | Vacuum, deeper scrubbing, some steam; for soiled cars | $89.99 | 2 h |
| 4 | Golden Hour | Deep clean and vacuum, extraction, steam, leather conditioner, rubber and plastics | $129.99 | 4 h+ |

**Exterior**

| Tier | Name | Includes | Price | Time |
| --- | --- | --- | --- | --- |
| 1 | Basic | Water pre-wash and contact wash | $20 | 30 min |
| 2 | Premium | Soap pre-wash, contact wash, basic wheel clean | $44.99 | 1 h |
| 3 | Deluxe | Soap pre-wash, contact wash, tire glaze, wheel deep clean | $59.99 | 1 h 30 |
| 4 | Alchemy Wash | Soap pre-wash, contact wash, tire glaze, full wheel cleaning, engine bay, hydro sealant | $109.99 | 2 h+ |

All times are set higher than usual on purpose, to leave room.

## Design

The owner asked whether the designs get better later. Yes: the design upgrade is planned after the booking app (doc 18, "Design upgrade plan") and uses his own photos and videos.

## Follow-up questions (asked Oct 5)

1. Public area and radius center: Parker or Wylie? (see above)
2. X-25: which stains hold the price. Today only "Heavy stains" does.
3. WetGloss: keep the description "lasts about 8 to 12 weeks; don't wash for about 24 hours"?
4. OK to write the add-on minutes, the steam rule, the WetGloss name and the 10-minute mobile buffer to the **test** project now, and to **live** once checked?
5. OK to store the private address in the live project's settings?

## Done on Oct 5 after the owner's OK

- Test project: Migration 002 part 1 applied (`20261005090001_m002_owner_phase1_answers.sql`): steam 30 min and interior-only, WetGloss name and 30 min, mobile buffer 10 min. **Live: not yet.**
- Live project: the private address stored in `business_settings.shop_address`.
- Site: the sealant is now called WetGloss on the home and services pages. Its description still says "8 to 12 weeks" pending the owner's answer (retailers quote about 3 to 6 weeks).
- Owner's reading of "home": the radius is measured from his home address; the public area name was not restated. Follow-up: confirm "Parker, Texas" stays as the public name.
- Owner's new direction on conditions (pet hair and the like): a mandatory "what's the car like" step with a None option and an Other option, where some conditions add a fee that depends on the service chosen. This is a pricing change and needs a proposal he approves before Migration 002 part 2.

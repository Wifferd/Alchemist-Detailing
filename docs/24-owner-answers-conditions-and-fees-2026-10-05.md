# Owner answers: conditions, fees and loose ends (Oct 5, 2026)

Second round of direct answers to Claude Code. Follows doc 23.

## Settled

| Topic | Decision | Status |
| --- | --- | --- |
| WetGloss text | "Spray-on sealant for gloss and water beading, added after a wash with an exterior service. Lasts several weeks, depending on weather and washing." (Retailers quote about 3 to 6 weeks; the old "8 to 12 weeks" and the 24-hour line are dropped.) | DECIDED. On the site and in the test project. |
| Price survey | The owner wants a one-page comparison of what nearby detailers charge, to decide from. Claude never sets prices. | In progress |
| Public area | Stays **Parker, Texas**. The 10-mile circle is measured from the owner's home. | DECIDED |
| Borderline ZIPs 75072, 75407, 75042 | The owner answered "okay with all of these", read as **all three in**. | DECIDED, confirm once |

## Conditions and fees (replaces "which stains hold the price", X-25)

The owner's direction: a **mandatory** "what's the car like" choice in the booking, with **None** and **Other**, where some conditions add a fee that depends on the service chosen. Fees apply to **interior** jobs only.

| Condition | Fee | Included in | Notes |
| --- | --- | --- | --- |
| None | $0 | — | Can't be combined with others |
| Pet hair | $15 | Interior Deluxe, Full Detail | |
| Excessive dirt / mud / sand (interior) | $10 | Interior Deluxe, Full Detail | |
| Spills, food or drink, light stains | $10 | Interior Deluxe, Full Detail | |
| Heavy stains (grease, oil, ink, mold or mildew, set-in stains) | **$30** | — (always charged) | Shown with the owner's line: "If your car's condition is similar to the one listed, you may select it. If the selection turns out to be inaccurate, you will be charged $30." |
| Other (describe it) | Set by the owner | — | Goes to the Review lane |
| Odor | **Removed** from the fee list | — | Not a selectable fee. A customer can mention it in the notes. |

**Exterior:** no condition fees. Common exterior problems (bugs, tar, heavy brake dust, mud) are either handled by the service itself or go in the notes as a request, which the owner prices himself and may charge a lot for. Exterior-only bookings don't show the interior condition list.

**Notes field:** a free "anything else we should know" box, which the owner wants near the end. Plan: keep it on the Summary step (06) and also offer it right after the condition choice in step 02, since that is where people think of it. One field, shown twice.

**"Heavy stains" no longer holds the price.** It is a fixed $30 line. Nothing in the menu holds the price now except XL vehicles and an unpriced sealant size (Van, Convertible, Other), as before.

## What this changes in the build

- **Migration 002, part 2:** a fee per condition (`form_options.price_cents`), which services include which conditions (new table `condition_includes`), condition fees in `quote_booking` (with the 2.5% / 7% mobile rule, as for add-ons), `submit_booking` refusing a booking with no condition choice when an interior service is chosen, and "none" exclusive. Tests added to `db-tests/`. Test project first, then live with the owner's OK.
- **Booking step 02:** the mandatory condition cards with fees and "Included" badges, the heavy-stain line, Other with a required note, and the notes box.
- The old `holds_price` on Heavy stains is turned off.

## Still open

- The three ZIPs: confirm "all in" was the meaning.
- The mobile percentage on condition fees: proposal is 2.5% (the "basic and add-on" rate). PROPOSED.

## Done on Oct 5 (test project only)

- Migration 002 part 2 applied to the test project: `supabase/migrations/20261005090002_m002_condition_fees.sql`.
- `db-tests/m002_tests_conditions.sql`: 37 checks, all passing on the test project.
- `db-tests/m002_tests_pricing.sql` (from `gen_pricing_matrix_m002.py`): 3,360 combinations (2 locations × 10 service choices × 4 add-on sets × 7 condition sets × 3 vehicle types × 2 sizes). The database's answers and the independent model have the same fingerprint, `9b285321c1f1a02a6d72a701903bfd26`; 864 impossible combinations are refused as expected.
- WetGloss description updated on the site and in the test project.
- **Live project: Migration 002 not applied.** Needs the owner's OK after the booking app runs end to end on test.

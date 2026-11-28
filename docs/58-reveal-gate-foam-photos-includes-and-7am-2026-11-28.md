# 58. The Reveal, the stop at it, thicker foam and the first interior photos (Nov 24 to 28, 2026; LIVE Nov 28)

All of this is on the branch `claude/zen-fermat-59sjyv` (commits f4b93f0, 1495e15, 1811827, 562dc0f). **None of it is on
`main` or live**: the owner's standing instruction is still "Dont go live till its ready to Push" (doc 56).

## LIVE (Nov 28, 2026): the owner said "Go live with everything"

Everything below is live. Done in this order, each step checked before the next:

1. Read-only checks on live: last migration 013 (`20261127212034`), `first_start_min` 600, no Hand Wash include row, `main`
   still at `caf15d9` (the branch was 11 commits ahead, a fast-forward).
2. **Migration 014** applied to live (`m014_hand_wash_includes_tire_shine`): the Hand Wash includes Wheels & Tire Shine; the
   add-on's rate is still 2000 cents in every size. Anon quotes on live after it: Inside & Out 11499, Full Detail 17999,
   Hand Wash + Gloss wax 10999, Basic Wash + Wheels & Tire Shine 5500 (the $35 first-visit price + $20).
3. **Migration 015** applied to live (`m015_open_from_7am`): `first_start_min` 420. `db-tests/m015_tests_open_from_7am.sql`
   run on live as anon: PASSED (8 checks); `get_public_settings()` returns 420 / 1140 / 1200.
4. `main` fast-forwarded `caf15d9` to `0ff2204` (the whole branch). Both Vercel projects built it: live
   `dpl_GpCjre4iQzQL1Nu62kfj6jmPCyc7`, test `dpl_CQavwnm3zQ3vRBBgtRZQMJQkPfAk` (READY). The served home page has `#revealBtn`,
   `js/reveal.js`, "Mon-Thu 7 AM" and the LD+JSON `07:00`; no "Keep scrolling", no "10 AM".
5. The test database is still paused (doc 56): Migrations 014 and 015 are NOT on it. The site's preview mirrors them.

What the owner accepted by saying "everything" (my defaults, not his words): the speckled photo is the BEFORE and the smooth one
the AFTER; 7 AM applies to every day including weekends; Gloss wax foam with the Full Detail stays greyed ("Goes with ...")
and does not say Included; the footer is out of the page until Reveal is pressed on Home; "Services & prices" plays the
Reveal; the two dashed "Next pair" tiles now show on the live Gallery. **Not yet tried on a real iPhone.**

**Rollback.** Site: promote the previous production deployments, live `dpl_3haG1hrBKYzeSMnge23WZdVcsfZs` and test
`dpl_DLgcC9rfQPrmxF74UeQwzzjHAQ6T` (both `main` at `caf15d9`). Database, only on the owner's word:
`update public.business_settings set first_start_min = 600 where id = 1;` (the text on the old site says 10 AM) and, if wanted,
remove the one include row (`service_includes`: Hand Wash, Wheels & Tire Shine).

## 1. What the owner asked for (Nov 24)

- Undo the scroll-driven wash. When a visitor reaches Services on Home, "Services" shows in gold and a thin, ghostly
  "Reveal" sits under it with its light withering off in every direction on a constant. Pressing it plays the foam
  "smoothly and quick" and reveals the services.
- "Make the screen stop when you're on the reveal button where you can't scroll past it."
- Thick, "hyper realistic" foam.
- He considered a video made elsewhere (Higgsfield, Claude Motion) and then said "leave that": the foam stays live code.
  (Claude Motion is coded animation of text, charts and shapes, with no video-generation model: it can't make realistic
  foam. A prompt for a video generator was written in the chat; it is not used.)
- The five photos he put in Drive ("Alchemist detailing"): use them in the Gallery, not on Home.

## 2. The Reveal (foam.js, reveal.js, app.js, alchemist.css, index.html)

- `foam.js` no longer reads the scroll. `AlchemistWash.start(...)` returns `{ play, finish, done, live, refresh, state,
  debug }`. `play()` runs the same timeline on a clock, `DURATION_MS` 2800 (the `T` segments were tightened: cannon in
  0 to .10, spray .10 to .52, rinse .56 to .87, drops dry .84 to .985). A slow frame moves the clock by 50 ms at most. The
  shader is compiled with one unseen draw at start, so the first frame of the press is not the slow one. The pin, the fold
  and the iOS "rest" proofs for scripted scrolls are gone (`rest` stays: the router's cuts still ask it).
- Checks: `?washspeed=0.25` plays at a quarter speed; `?washat=0.5` holds the wash at that moment (stills).
- The stage is one `100lvh` screen (the doc 55 toolbar fix stays). The title block has "What we do", the gold Services,
  the four kinds and the button `#revealBtn`. `reveal.js` sets the title's arrival (`.pre` then `.in`: it rises, one pass of
  the shared light crosses Services) and draws the specks on `#revealDust` (letters sampled from the page, constant
  emission, a rush outward on the press). Under reduced motion, without WebGL or without JavaScript the title and the
  button are not shown and the services are simply there.
- `app.js` `pressReveal()`: brings the stage to the top of the screen if it is not there, then plays. "Services & prices"
  (hero) scrolls to the stage and presses it. A key into the cards before the press shows them at once. After the wash the
  focus goes to the services heading. The row's gold light waits for `washend`.
- Gone from `app.js`: `washPin`, `washSpare`, `landY`, `washOver`, `foldNow`, `progressTo`. The saved place of Home is
  just `{ y }` now. `window.__alchemist` has `wash`, `start`, `press`. **`tools/qa/wash.py`, `wash_probe.js` and
  `wash_compare.py` describe the old scroll wash and are out of date.**

## 3. The stop at Reveal (the gate)

- From the moment the visitor reaches the stage (coming down, the stage more than 40% on the screen) until Reveal is
  pressed, `html.wash-gate` leaves everything after `#wash` on Home, and the footer, out of the page (`display: none`), so
  the page ends at the stage. No script moves the scroll, so none of the iOS scripted-scroll trouble (doc 35) applies.
  Up is free (scrolling back above the stage lets it go). A single jump over the stage from above (End, the scrollbar) is
  brought back to it. Never gated without a Reveal (no WebGL, less motion), after the press or off Home.
- Checked at 1280 x 800 and 390 x 844: wheel steps, a 5,000 px fling, End, Space and up. **Not tried on a real iPhone.**
- Known cost: until Reveal is pressed a visitor at the stage cannot reach the footer (hours, phone). The top bar's Call
  button is still there. The owner can choose to keep the footer visible.

## 4. The foam

Denser, fatter masses, bare gaps filled, wrapped lighting and a warm cream palette instead of grey-blue, fewer and varied
pin-point highlights. A thick creamy blanket in dark and light. Tried and dropped: stronger bubble domes and cell walls
(they drew a cracked-tile net). **Not photoreal.** The owner's own photos (Drive) show what real thick foam looks like: a
smooth, heavy cloak with long drips hanging at the edges and no visible bubbles. A next step would be to smooth the
body and lengthen the drips toward that.

Nov 28 pass, against the owner's real foam photos: the surface is smoother (gentler slopes and bubble domes, a thicker body so
fewer thin spots show black), the white pin-point highlights are almost gone, a very soft broad dapple was added, and the
bare gaps are filled. Dark and light checked at two moments of the wash. It reads as a smooth cream cloak now; what is left
of the real thing is its long drips and its absolute smoothness. Next step if the owner wants more: a different foam body
(a height field instead of overlapping blobs) or a clip made elsewhere.

## 5. The first interior photos (Gallery)

- Five frames the owner screen-recorded from a video (rotated, black bars, the caption "Reasons why you should book with
  me" over the left edge). The caption is in the same place in all five, so the pixels that are white in every frame were
  filled in from the surroundings (OpenCV inpaint) and the frames rotated and cropped to the video area: about 2342 x
  1320 each, nearly the whole frame. Originals (without the caption) would be sharper.
- In `site/img/work/` as `foam-front`, `foam-wheel`, `seat-front`, `seat-rear`, `trunk` at 600 and 1200 px WebP, listed in
  `gallery.js` `PHOTOS` (13 now). Interior (3) shows as a filter again. Captions are plain descriptions: Thick foam, Front
  seats, Foam on the wheel, Back seat, Trunk. No claims about the job or the car's make.
- `foam-wheel` shows a house and a driveway behind the car (kids' bikes). The owner was asked whose they are and said to
  use the photos; he has not said whether to blur that background.

## 6. The first before / after pair (Gallery, the Transmutation)

- Two close-ups of one panel of white paint from the same spot (the sun glint is in the same place), sent by the owner in
  the chat as 1086 x 1448 portraits, made into `paint-before` and `paint-after` (600 and 1200 px WebP). `gallery.js`
  `PAIRS` now holds that pair (`beforeAlt`, `afterAlt` carry the alt text, so the two close-ups are not Gallery tiles); the
  old placeholder pair (the BMW, no before photo) is gone, so the section now shows on the live site too.
- **Which is before and which is after is the owner's to confirm.** The speckled one (small yellowish spots all over) was set
  as the BEFORE and the smooth, glossy one as the AFTER: that was a reading of the pictures, not something he said. If it is
  the other way round, swap `before` and `after` in `PAIRS`.
- The two dashed "Next pair" tiles (Wheels, Interior) were part of the owner's design and now show live as well: keep them
  or drop `NEXT`?

## 7. "Included" on the booking page's add-ons (Migration 014, written, NOT applied)

- The owner (Nov 26): with the Inside & Out or Full Detail chosen, Wheels & Tire Shine, Leather care and one other add-on are
  greyed out but do not say "Included".
- What the live database says (read-only query, Nov 26): `service_includes` holds only Leather care in the Full Detail and the
  Interior Detail. `addon_allowed_with`: Wheels & Tire Shine with the Basic Wash only; Gloss wax foam with the Basic Wash, Hand
  Wash and Inside & Out; Leather care with the Inside & Out and Interior Clean. So: Inside & Out greys only Wheels & Tire
  Shine (reason "Goes with the Basic Wash"); Full Detail greys Wheels & Tire Shine and Gloss wax foam (same kind of reason)
  and Leather care (which does say Included). The page says "Included" only where `service_includes` says so
  (`booking.js` `includedCodes`, bundle parts counted).
- Fix, one data row: **the Hand Wash includes Wheels & Tire Shine** (the owner's own Services-page words: "The Hand Wash
  already has it"). `supabase/migrations/20261128090001_m014_hand_wash_includes_tire_shine.sql` (idempotent insert),
  `db-tests/m014_tests_includes.sql` (3 read-only checks), and the preview's seed (`data.js` `includes`) mirrors it. Checked in the
  preview: Inside & Out, Full Detail and Hand Wash now show "Included, already in the ...". No price or time changes.
- **Not applied to either database**: TEST is paused (doc 56), live needs the owner's "push".
- Still greyed without "Included": **Gloss wax foam with the Full Detail** ("Goes with the Basic Wash, Hand Wash or Inside &
  Out"). The Full Detail has its own water-repellent sealant foam; whether that counts as the gloss wax foam, so the page may
  say "Included", is the owner's call. (Not recorded as included: that would be a business fact he has not given.)

## 8. Bookings open from 7 AM (Migration 015, written, NOT applied)

- The owner (Nov 26): "Make bookings open from 7am". `business_settings.first_start_min` goes from 600 to 420 (live
  read-only check: first 600, last 1140, latest end 1200, step 30; closures Mon to Thu 16:00 to 20:00, Fri 12:00 to 17:00).
  Nothing else moves: starts every 30 minutes, last start 7 PM, jobs end by 8 PM, same closures. The days read Mon to Thu
  7 AM to 4 PM, Fri 7 AM to 12 PM and 5 to 8 PM, Sat and Sun 7 AM to 8 PM.
- `supabase/migrations/20261128090002_m015_open_from_7am.sql` (one update) and `db-tests/m015_tests_open_from_7am.sql` (8
  read-only checks). **Not applied to either database**: TEST is paused, live needs the owner's "push".
- The four typed copies of the hours changed on the branch (CLAUDE.md lists them): the footer and the LD+JSON in
  `index.html`, the week and the FAQ's "How far ahead can I book?" in `content.js`; the preview's seed too (`data.js`
  `first_start_min: 420`). Checked in the preview: 7:00 AM is offered on every day with nothing booked.
- Assumed: 7 AM on every day, weekends included. Until the migration is applied the live booking page still starts at 10 AM
  while the branch's text says 7 AM: the text and the database go live together.

## 9. Twilio (corrected Nov 28)

Twilio Verify has been connected on live since Nov 26 (the owner did it; doc 57 and the Nov 28 handoff). An earlier version
of this section said nothing was connected: that was wrong. Sign-ups are still off in Supabase until the owner's go-live steps
(doc 57). This doc changes nothing about that.

## 10. Open for the owner

1. Real iPhone check of the Reveal, the foam and the stop.
2. "Services & prices" presses Reveal for the visitor: keep, or only scroll there?
3. Keep the footer out of the page until Reveal is pressed, or keep it visible?
4. Blur or keep the house behind the wheel photo? Better originals of the five photos if he has them.
5. Doc 56's questions are still open.
6. Confirm before / after (section 6), and the "Next pair" tiles.
7. Does the Full Detail's sealant foam count as the Gloss wax foam (say "Included")? (section 7)
8. 7 AM on weekends too? (section 8)

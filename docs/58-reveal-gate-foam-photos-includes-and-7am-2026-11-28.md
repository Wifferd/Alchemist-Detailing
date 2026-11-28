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

## 11. The owner's answers (Nov 28, after going live)

Answers to the numbered questions of the previous reply ("3 no, 4 yes, 5 later"):

3. **Gloss wax foam with the Full Detail: do NOT say "Included".** It stays greyed with its reason ("Goes with the Basic Wash,
   Hand Wash or Inside & Out"). Nothing to change: that is what is live.
4. **7 AM on weekends too: yes.** Migration 015 applies to every day, as live.
5. **The gold-liquid reveal and the Alchemist name: later.** Not built, not decided. The idea (doc 58's chat of Nov 27): a second
   reveal behind a hidden `?reveal=gold` link to compare with the foam, only worth doing if the alchemy theme stays.

Still not answered in words: the paint pair's order (the speckled photo is BEFORE; "go live with everything" accepted it, but he
has not said it is right), the real iPhone test of the Reveal, the page stop and the foam, and whether to keep the footer out of
the page until Reveal is pressed.

## 12. Before / after and the photos above the services (Nov 28; LIVE on the owner's "Push", main 48afb17)

- The owner (Nov 28): "The white side is the after" (so the paint pair is right as set: speckled BEFORE, smooth AFTER), and "the
  before and after and photos should be higher on the home page so they're seen before the services".
- Home's order is now: hero, Standard, **Before / after** (the Transmutation slider, `#homeTm`), **Our work** photos (`#work`, moved
  from after the wash), then the **Services stage with Reveal**, then Why and the rest. `gallery.js` `mountHome()` builds the
  slider into `#homeTmBox` once the data layer has answered (the Gallery keeps its own). The page stop at Reveal is unchanged:
  what is before the stage is always visible, and only what is after it waits for the press, so the photos are no longer hidden
  from a visitor who never presses Reveal.
- Checked at 1280 x 900 and 390 x 844: the slider and the photos show, the page stops at the stage (y 3925 of 3925 on desktop),
  Reveal plays, scrolling on works. The dock (Call and Book Now on phones) is on in the new sections, as it is between the other
  sections.
- Open: the dashed "Next pair" tiles under the slider now also show on Home. Keep, or hide them on Home?
- **Live record:** the owner said "Push" after seeing the order described. `main` fast-forwarded `8fb4b3b` to `48afb17` (site-only,
  no database change). Rollback: promote the previous production deployments (the builds of `0ff2204`, live
  `dpl_GpCjre4iQzQL1Nu62kfj6jmPCyc7`, test `dpl_CQavwnm3zQ3vRBBgtRZQMJQkPfAk`; the notes-only builds after it show the same site).
- The "Next pair" tiles were NOT answered before the push, so they show on Home as built. Still to ask: keep or hide on Home.

## 13. The owner's iPhone feedback (Nov 28; LIVE on "Push it asap", main 90102cd)

Tried on his iPhone: "Leave them" (the dashed Next pair tiles stay), "reveal works". Then: the foam doesn't feel thick; the water that
sprays it is too fast and too strong; it should spray it with foam dripping off, making the animation longer; and the section in
his screenshot (The Alchemist Standard) should get "a glow on the words and gold dripping for the texts".

- **Foam and rinse (`foam.js`).** `DURATION_MS` 2800 to 5800 (measured press to done: about 6.0 s headless: foam built by about 2.5 s,
  the rinse about 2.5 s to 5.1 s, drops dry to 5.9 s). The water is much softer: the bright crest, the film, the sheen, the
  runoff streaks and the bend of the foam at the front are roughly halved or less. The foam is no longer swept along by the
  water: behind the water line it thins over a long stretch (the fade is spread over about 0.6 of the screen height), slides
  down, and breaks into vertical runs that run down and leave (a stretched noise carried down as the line moves). Longer drips
  hang from the masses (45% of them, longer). Thickness: broader, softer dollops of relief (a low-frequency fold term, slopes
  up) so the cloak reads as heavy. Judged on stills only (`?washat=`), not on a real device.
- **The Standard (`gilt.js`, `alchemist.css`).** The gold phrase glows as its light settles (after the existing pass of light,
  `em.au-lit:not(.au-run)`), the promise line glows after it, the rest has a faint warmth, and it rests at a soft glow (no pulsing:
  the light stays the design's one repeating light). `gilt.js` draws gold drips on a canvas over the text: a bead swells under
  a word, stretches a thread, lets go, falls and fades; up to 9 at a time, a new one every 0.35 to 1.15 s, bigger under bigger
  words, most from the gold phrase and the promise line; only while the section is on the screen, after its entrance (3.2 s) and
  with the tab visible. Not under reduced motion (the glow is simply there). Light mode: no glow (it only smudges on cream), the drips
  in the deep gold. Checked at 1280 x 900 (dark and light) and 390 x 844.
- Open: is the drip too much, too little, or the right amount? (Rates and sizes are two lines in `gilt.js`: `spawn` and `frame`.)

## 14. "A lot less bubbly ... dripping blobs ... ripples" (Nov 28; LIVE on "Push it asap", main 90102cd)

The owner, after seeing section 13's version: close to thick foam; **a lot less bubbly, because on real foam you don't see bubbles;
make dripping blobs of foam, because when it is thick it makes ripples.**

- **No bubbles (`foam.js` shader).** Removed: both Voronoi bubble lattices (the medium and the fine one), their domes, walls and
  thin-film tint, the pin-point and window sparkles, the loose bubble discs around the edges, the glassy highlight on the
  flying globs. The body is a matte, heavy cream (a faint satin sheen only). Cheaper to draw too (two `vor` calls fewer per pixel).
- **Ripples.** Soft ridges that follow the outline of each mass (bands of equal thickness: `cos(F.g*8 + ...)` pushes the normal
  along the thickness gradient), ridges that run down where it flows, and the big slow folds over them. A first try with tight
  bands looked like a contour map; the final frequency is low (about one band across a pile) and the amplitude small.
- **Dripping blobs.** The drip chains are chunkier (fat bulb at the end of each, 40% of the masses). Once the water line has
  passed, each drip carries on as a blob of its own (drawn through the in-flight path, so the melt and the fade do not take it):
  it runs down faster than the rest and off the screen, in the same warm cream as the body (smaller on a narrow phone).
- Checked on stills (`?washat=`) in dark and light, at 1280 x 800 and 390 x 844 (the lighter phone shader), the full run
  (about 5.9 s) and the page stop. Not on a real device.

**Live record (sections 13 and 14).** The owner said "Push it asap". `main` fast-forwarded `34b4403` to `90102cd` (site only, no database
change). Rollback: promote the previous production deployments, the builds of `48afb17` (live `dpl_rskF6eoZGB58932EX1swNfQbC3dn`,
test `dpl_4vfFp3rzpmsmRUC3RNPiwfeK9FKB`; the notes-only build of `34b4403` after it serves the same site). Not yet seen on a real
iPhone: the foam (no bubbles, ripples, dripping blobs, about 6 s), the gold glow and drips on The Standard.

## 15. The gold drips, rebuilt to sit in the letters (Nov 28, on the branch, NOT live)

The owner, on the live version of section 13: "put a lot more work into the dripping effect, it should stay flush with the text and
not be a whole animation on top of the text, and only the gold texts."

- **Only the gold words drip** (`gilt.js`): the gold phrase (only once its light has settled: `em.au-lit` and not `.au-run`), the
  promise line and the label. The white sentence and the grey list never drip.
- **Flush with the letters.** A drip no longer starts at a random point on a line. Each gold letter is drawn off screen in the same
  font and the lowest points of its ink are found (cached per letter and font); the drip starts there, a hair inside the ink, as wide
  as that stroke (a wider flare where it leaves the letter), in the exact colour of that text, with a soft glow like the text's.
  Baseline from `fontBoundingBoxAscent`, each letter's position from a `Range` per character.
- **Room.** It stays in the room under its own line: the thread and the fall are limited by the distance to the next block of text,
  so a drip never crosses into the next line.
- **Life of a drip.** The gold swells under the letter, stretches into a thread (slowly, then more and more) with a bulb at its end, the
  neck thins; then 60% let go (a pinch, the bulb falls a short way and fades, the stub draws back into the letter) and 40% simply draw
  back in after a short hold. Up to 6 at a time, one every 0.7 to 2 s.
- Checked on close-ups at 1280 x 900 (dark and light) and 390 x 844. Not on a real iPhone. The glyph probe uses the page's font
  string, so a font that loads late is re-measured (`document.fonts.ready` clears the cache).

## 16. One piece of bright gold, and water that looks like water (Nov 28, on the branch, NOT live)

The owner, on section 15: "Yes but it shouldn't have two different parts, I want it to be a bright saturated gold color on golden
text that drips, also the droplets on the main page need to be more realistic, maybe smaller and scattered and more water looking."

- **The gold (`alchemist.css`, `gilt.js`).** The Standard's gold words (the gold phrase, the promise line) were the pale `--gold-hi`; they are
  the bright, saturated brand gold `--gold` now (the light pass's gradient too, and the reduced-motion style). A drip is drawn as
  ONE outline (the thread and its bulb a single shape) in that exact colour, with only a faint darkening toward the edges of
  the same hue: no separate bead, highlight dot or rim. Bulbs capped at 17% of the text size. In light mode `--gold` is the
  deeper gold, the drips match.
- **Droplets (`hero-gl.js`).** The five layers of beads (hero, the Services stage, the art stills) are smaller and more scattered:
  the largest drops are about 55 px on a computer (were about 90) and fewer (density .55 to .26), the middle layers smaller and
  fewer, the fine layers more numerous (more mist). Shading toward water: the interior shows 24% of the paint through it, the dark
  rim is thinner (.85 to .58; on cream .6 to .38) and the white ring on cream is about a third as strong (.45 to .16).
  Parameters are in `layer()` (`sc` is the grid scale: a bigger number is a smaller drop).
- Checked: the hero at 1280 x 800 (dark, light) and 390 x 844, the Services stage, the Services page, the gold in light mode. Not
  on a real iPhone.


## 17. One flat colour, letter by letter (Nov 28, on the branch, NOT live)

The owner, on section 16: "Make the gold drips on text one single color that's connected to the text, so animate each letter
individually and then place the text."

- **One colour (`gilt.js`).** A drip is a flat fill in the exact colour of the letter it hangs from: the gradient and edge
  darkening are gone, so thread, bulb and letter read as one gold. It starts a hair inside the letter's ink, so it is joined to
  it, and carries the same soft glow as the text.
- **Letter by letter.** When the section's entrance has played (3.2 s after it shows) every gold letter, in reading order
  (the label, the gold phrase, the promise line), swells a short thread from its own foot, 45 ms after the one before, and
  draws it back in. Thread lengths and bulbs vary a little so it does not read as a row of beads. Then the text simply stands and
  the slow ambient drips (a few at a time, some fall) carry on. The wave plays once per visit to the page; nothing runs
  under reduced motion.
- Checked at 1280 x 900 (dark), 390 x 844 and light mode (it starts a little later there); no page errors. Not on a real iPhone.
  Backup of the previous script: none in the repo (git history has it).

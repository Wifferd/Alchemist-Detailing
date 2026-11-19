# 54. Light mode: Home turns white and gold (Nov 19, 2026)

Branch `light-home` in a worktree, based on live `main` 4b2df4b. Nothing is pushed, nothing is deployed, and no
database was touched.

## The owner's words (Nov 19)

- "Another fix, home page doesnt turn white and gold in white mode".

## What it reverses

Since the polish round of Nov 5 (`7521da8`, doc 39) the Home hero stayed the black showroom in both themes, and over
it the light theme kept the smoked-glass bar (`3cdfa37`). Doc 39 question 8 asked the owner to keep it black or go
back to a light hero; no doc records an answer until now. His Nov 19 words settle it for Home: in light mode the hero
follows the theme.

## As built (`3302c17`, then the contrast fix in the next commit)

- The hero shader paints its studio preset in light mode (ivory paint under a white softbox, the warm bar faint in
  it) and follows the theme toggle live (`hero-gl.js`'s theme observer; `app.js` no longer forces the black preset).
- The hero takes the studio's tokens: the words in ink, Detailing in deep gold ink, Book Now's polished gold, the
  "Services & prices" glass in frosted ivory on a gold hairline, a deeper gold wordmark with a warm gold sheen, ivory
  halos and an ivory clearing behind the words, and a foot that fades into the cream page (no black band).
- The top bar is the ivory glass over the hero from the first paint; the smoked-glass rules over Home are gone.
- No WebGL, no script or reduced motion: an ivory still with a white-and-gold stripe.
- Dark mode is unchanged.
- Contrast on the real hero paint (luminance about .90 to .95): the small words 5.8:1 and up; the wordmark (display
  type, 3:1 floor) 3.7 to 3.9:1 at its lightest stop and about 3.4:1 where the warm sheen peaks on it.

## Left as it was (the owner's call)

- **The Services page header** keeps its dark photo in light mode, with the ivory bar over it.
- **Below the hero**, Home still shows dark photographs (the service cards, Our work, the gallery) and the wash shows
  grey foam and the black foam gun in light mode. The photos are real work photos; the wash is not part of this fix.

## Questions for the owner

1. Should the Services page top turn white and gold in light mode too, or keep the dark photo? *Recommendation:* ask
   him on the preview before this goes live; changing it now would decide for him.
2. The light wordmark is a deeper, more bronze gold so it reads on white. Happy with it on his phone?

## Round 2: the wash's white strip and calmer motion (Nov 19)

### The owner's words

- "Also lets fix how when we scroll on the foam cannon there is a white box of the next portion, it countinues into
  the other stuff but it feels out of place for the small white space, slow down the text pop ups they come up to fast
  and do letters floating up into place. Adjust everything for visual pleasure and calm motions so the user feels like
  the website is premuim".

### 1. The white strip under the wash (fixed, CSS only)

- **Cause.** The wash's stage was `100svh` tall (the small viewport). Once a visitor scrolls, iPhone Safari and
  Android Chrome shrink their toolbars and the screen grows to the large viewport, so the pinned stage stopped about
  86 px above the bottom of an iPhone 13's screen for the whole pin. That strip showed the plain page: cream in the
  light theme (his "white box of the next portion", the same cream as the sections after it), a black band in the
  dark. The foam and the foam gun were cut off along it. Not the pin, fold, release or rest-gate logic.
- **Fix.** The stage is `100lvh` tall now; the section's height is `--wash-h` (430vh, 380vh on a phone) plus
  `100lvh - 100svh` (behind `@supports (height: 1lvh)`), so the pinned length that `foam.js` measures (the section
  less its stage) is exactly what it was. The "scroll" hint sits above where a phone's toolbar comes back. On a
  computer lvh = svh: nothing changes. `foam.js` is untouched.
- **Why earlier checks missed it.** Playwright and `tools/qa/wash.py` have no collapsing toolbar (svh = lvh there).
  The check here rewrites every `svh` in the stylesheet to the small viewport (664 px) on a 390 x 750 screen: before,
  the strip (the page's cream, (250, 245, 239), from 664 px down) in every frame of the pin; after, foam to the foot of
  the screen and the whole foam gun, both themes, and the stage meets "Why Alchemist" exactly at the release.

### 2. Headings float up letter by letter

- Every display heading that set line by line (the section heads on Home and Services, the page titles, the Ritual's
  and the Bead Test's heads, the Services plates' titles, "Shine like gold") now floats up letter by letter: each
  letter fades in as it rises .38em into place, 1.1 s each, 34 ms apart (closer in a long heading, so the last starts
  within 520 ms: a heading lands within about 1.7 s). Over 24 letters or 3 lines it goes word by word, 70 ms apart.
  On a computer each letter also comes into focus from a 3 px blur; never on a phone (a blur per letter costs a
  picture per letter per frame there).
- Screen readers keep one copy (the whole text, `sr-only`; the letters `aria-hidden`), lines never break inside a
  word (each line is the browser's own, laid out before the split), and each letter box keeps the width it had in the
  whole heading, kerning included, so nothing moves when the heading becomes whole text again: measured on Home at
  1440 and 390 wide, every letter within 0.12 px, the heading's height unchanged. Gold headings paint the metal in each
  letter (it runs top to bottom, so it looks the same). Once per heading per visit, as it enters the screen, one at a
  time; a heading seen this session stays set.
- Not split: the wash's "Choose your finish" (the rinse drives it), the Standard's statement (a sentence: it keeps
  its lines, calmer), body text, buttons, cards, the menu, booking and the staff consoles. The hero's ALCHEMIST keeps
  its own letters (the owner's, Oct 23), calmer: 1.25 s each, 50 ms apart, a softer tilt (-28 degrees) and blur
  (5 px, none on a phone).

### 3. One calm motion system

- Two new curves for everything that arrives as a page is read: `--ease-glide` cubic-bezier(.33, 1, .68, 1) for
  movement (half its way at a fifth of its time; the old unveil curve was half there at a tenth) and `--ease-fade`
  cubic-bezier(.4, 0, .2, 1) for opacity (half seen at a third of its time). The "pop" came from fading on an
  out-curve: a block was half visible 60 ms after it started.
- Longer tokens: heading lines 1.3 s, 140 ms apart (was 800 / 90); blocks 1 s, 14 px, 70 ms apart and 110 ms on the
  public pages (was 600 ms, 18 px, 60 / 90); fades 900 ms; rules and the footer's hairline 1.4 s.
- Blocks and heads start a little later, where the eye is: 20% in view, above the screen's lowest tenth (was 15%,
  8%).
- Also calmer: the hero's lines (1.4 s, their delays spread out), the Standard's card, the gallery's tiles, the
  Services plates' captions, the menu (the panel .7 s, its words .7 s and 40 ms apart from 180 ms, its hairlines
  .9 s), a page's arrival after the cut (fade 640 ms, rise 760 ms; the cut out and the beat of black are as they were).
  Booking, account and the consoles keep their quick feedback.
- One major animation per section still holds: a heading's letters are its head's entrance, as its lines were.
- Reduced motion: nothing is split or held; every heading, block and the hero are simply there (unchanged rules).
  No JavaScript and print: whole text.

### Checks (Nov 19)

- `node --check` on `app.js`; no regex lookbehind in `site/`.
- Doc 35's harness, `tools/qa/wash.py site ios,chromium,desk all` against `wash_baseline.txt`: 33 of 33 ok, 0 undos,
  0 jumps (the baseline's own `leave_mid` and `theme` jumps don't happen on this build, as before).
- The same harness with the svh rewrite (a collapsed Safari toolbar), `ios` and `chromium`, fling, slow, hold, decay,
  back_rest and theme: 12 of 12 with 0 undos, 0 jumps.
- Hard rule 5 (`tools/qa/budget.py`, a 390 x 844 phone at 4x CPU, traced, against a4f9fc0 exported, walks
  interleaved): Services, 3 walks each, long tasks [1, 0, 0] before and [0, 0, 2] after; the after walk's two are a
  58 ms frame where the Bundles plate's title sets and a 142 ms commit wait for the Bead Test's live moment (the
  SwiftShader GPU wait of the Nov 6 notes, 104 ms at the Ritual in a before walk). Home, 4 walks each: [35, 27, 27, 30]
  before, [38, 40, 25, 24] after (medians 28.5 and 31.5) with the machine busier during the after walks (calib 24 to
  55 ms against 20 to 44); the main thread is busier while letters move (about 12.5 s to 14 s a walk: style, layout,
  paint and compositing of the letter boxes over the longer arrivals). The traced tasks that run the heads' own code
  (`arrive`, the split) are 30 to 66 ms frames whose script is 6 to 12 ms; none is the split itself. Read: no new long
  task from the splitting; the longer, per-letter arrivals add some frame work that this sandbox's SwiftShader
  exaggerates. Worth a look on the owner's iPhone.
- Reduced motion, phone and desk, both themes: nothing split, every heading and block in view visible at once, the
  wash a plain section. No WebGL (blocked in the page): the wash a plain section, the heads set, no errors.
- `back_walk.py owner` (phone dark) and `all` (desk light): every check PASS (the page's longer arrival after the cut
  changes no landing). `heads.py` at 1440 and 390, both themes: the seven centred heads all set and within 0.02 px.
- Not changed: `foam.js` (its comment at line 142 still says the section is "100svh + the pin" tall; it is 100lvh +
  the pin now, a comment only, left so the file stays untouched).

### Questions for the owner

3. Do the letters now float in the way he pictured, and is the pace right on his iPhone (each heading lands in about
   1.7 s)? *Recommendation:* look at Home and the FAQ in both themes on the preview; the tokens make it a one-line
   change faster or slower.
4. Does the wash now run to the bottom of his iPhone's screen in Safari with no strip, and does it hand over to "Why
   Alchemist" cleanly? (The emulation here can't be his phone.) If he still sees a thin line at the wash's foot as it
   lets go (doc 39, question 32), the next step is a soft fade on the foam's bottom edge.

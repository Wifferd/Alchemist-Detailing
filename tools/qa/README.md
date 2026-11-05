# QA kit

Checks for the design build, kept in the repo so a reset session can't lose them. Python with Playwright for
Python, plus bash. Run everything from the repo root (`/home/user/alchemist-detailing`). Nothing here changes
`site/`, talks to Supabase or deploys anything: every page runs in preview mode (the kit refuses requests to
`*.supabase.co`).

**The deployed-host mode** (`QA_DEPLOYED=1`, any script that uses `qalib`): the same local server, opened as the real
domain, `thealchemistdetailing.com`, which Chromium maps to it (`--host-resolver-rules`), with `*.supabase.co` sent to a
closed port. `config.js` then says `deployed`, so a database that can't be reached shows the outage notes (doc 42:
`D.isDown`, `U.outage`, `.bk-down`) instead of the preview, as the live site would. On 127.0.0.1 a panel never sees
them. `capture.py` waits up to 45 s for a page's loading note to go:

```bash
QA_DEPLOYED=1 CAP_ROUTES=book,account,appointments,gallery,admin,team CAP_MAX=2 python3 tools/qa/capture.py site $S/deployed
```

The browser is found by `qalib.chrome()`: `QA_CHROME` or `SHOOT_CHROME` if set, otherwise the Chromium in
`/opt/pw-browsers` (this sandbox's Playwright is newer than its browsers, so Playwright's own path doesn't exist).
WebGL runs in SwiftShader (no GPU here).

## The scripts

| Script | What it does |
| --- | --- |
| `capture.py <site_dir> <out_dir>` | Screens of every route, slice by slice down each page |
| `wash.py <site_dir> <mode> <scenario\|all>` | The iPhone-emulating scroll harness for the foam wash and page changes |
| `back_walk.py <site_dir\|url> <phone\|desk\|n360> <dark\|light> <scenario\|all> [out_dir]` | The Back button walks |
| `smoke.py <site_dir\|url>` | Every route at desk and phone widths 360/390/440: errors, pictures, requests, sideways scroll |
| `check_site.sh <out_dir> [wash]` | All of the checks in one go |
| `wash_compare.py <baseline> <results>...` | Compares `wash.py` lines with the baseline |
| `make_baseline.sh <scratch_dir> [commit]` | Writes `wash_baseline.txt` from the live site (main, 6dbb2c7) |
| `selftest.sh <scratch_dir>` | Shows the harness catches the real doc 35 bug on the commit before its fix |
| `qalib.py`, `wash_probe.js` | Shared code: the server, the browser, sizes and routes; the in-page probe and iPhone shim |

## Exact commands

```bash
cd /home/user/alchemist-detailing
S=/tmp/claude-0/-home-user-Wiffy-Washes/1269846c-45af-5403-b968-77651bd5652d/scratchpad/polish   # any scratch folder

# every check (about 10 minutes without the wash, about 35 with it)
tools/qa/check_site.sh $S/check
tools/qa/check_site.sh $S/check wash

# screens (all routes, dark and light, desk and phone; or narrowed)
python3 tools/qa/capture.py site $S/screens
CAP_ROUTES=home,faq CAP_THEMES=dark CAP_SIZES=phone CAP_MAX=6 python3 tools/qa/capture.py site $S/screens

# the wash harness: one scenario, a list, or all; one mode, a list, or all
python3 tools/qa/wash.py site ios fling
python3 tools/qa/wash.py site ios,chromium,desk all

# the Back walks
python3 tools/qa/back_walk.py site phone dark owner $S/back
python3 tools/qa/back_walk.py site desk light all $S/back

# the baseline (only when the live site changes) and the self-test
tools/qa/make_baseline.sh $S/baseline
tools/qa/selftest.sh $S/selftest
```

## capture.py

Names files `{theme}-{size}-{route}-NN.png`. NN 00 is the first screen; each next one is a screen further down,
at most `CAP_MAX` (default 12). On home: the hero after its intro, the screens down to the wash, the wash at three
points of its timeline (`window.__alchemist.goTo`), the services once it is over, then the screens after it.
Filters: `CAP_ROUTES` (comma list: home, services, services-exterior, -interior, -protection, -bundles, gallery,
reviews, tips, faq, about, contact, book, account, appointments, admin, team, 404), `CAP_THEMES=dark,light`,
`CAP_SIZES=desk,phone` (1440x900; 390x844 touch at 2x). Each screen waits for the fonts, the pictures in view and
the entrances in view.

## wash.py

The doc 35 bug: on iOS a script's scroll made while a finger is on the glass is undone at the finger's next move
(WebKit bug 310358). The old wash shrank its section and scrolled back in one frame; under a finger the scroll-back
was undone and the page leapt about 2,400 px after the foam.

Input is real touch through CDP (`Input.dispatchTouchEvent`): drags, and flings with a momentum tail. On desk it is
the mouse wheel (with a trackpad-like momentum) and clicks.

**Modes:**
- `ios`: an iPhone on iOS 26.1 or earlier: `navigator.platform` iPhone, no `scrollend`, no scroll anchoring,
  `CSS.supports('overflow-anchor')` false. `wash_probe.js` tracks the fingers down and undoes any page scroll made
  under one (`window.scrollTo/scroll/scrollBy`, element `scrollTo/scroll/scrollBy/scrollIntoView`, `scrollTop`
  writes and `focus()`) at that finger's next move, and counts the undos. A flick's momentum is the engine's own:
  it starts in the page as the finger lifts, with a hidden thumb on the glass (the thumb that catches a fling is
  never reported to the page, the strictest case). Its touch and pointer events are stopped before the page hears
  them.
- `chromium`: a Chromium phone: the same touch input, the engine's own flings, no undo.
- `desk`: a computer, 1440x900.

A hidden thumb that lands and lifts without moving is a tap to the browser. `wash_probe.js` keeps its click (and the
mouse events before it) from the page for 400 ms after its last touch, so it never follows a link under the thumb (a
router jump that used to be scored as a wash jump). The run line's `taps` counts the events it kept (a tap is about three: mousedown, mouseup, click).

The harness's own scrolls (setup, the emulated momentum) run inside `__qa.own()` and are never counted. It never
calls the page's own `progressTo` either, since that folds a finished wash.

**Scenarios:**

| Scenario | What it does |
| --- | --- |
| `fling` | Flicks through the wash and past it |
| `slow` | Slow drags: each stroke with the finger down all the way, lifted on a still page |
| `hold` | The finger rests 2.5 s at the release, then goes on |
| `decay` | A fling with a long slow tail across the release; a thumb rests on it 1.2 s, then drags |
| `back_rest` | Through the wash to the cards, a rest, then back up to the top |
| `leave` | Leaves home through the menu after the wash (the FAQ must be at its top), then comes back home (the cards where they were) |
| `leave_mid` | Leaves mid-wash, comes back (home where it was left), then finishes the wash |
| `second` | Two links in one cut: the FAQ from the menu, then the logo (home) in the black |
| `theme` | The Light/Dark switch mid-wash and after it |
| `touchcut_faq` | A finger touches and drags in the black after tapping the FAQ: the FAQ must land at its top with the wash's progress unchanged |
| `touchcut_home` | The same on the way back to home, which must land where it was left |

On desk, the drag in the black is a mouse press and drag, which the site takes as "end the cut now".

**Each run prints one JSON line:**
- `err`: undos plus jumps.
- `worst`: the largest jump, in px.
- `undos`.
- `jumps`.
- `bad`: landing or wash checks that failed; `why` lists them.
- `wash`: its state at the end (`p`, finished, folded, and how it folded).
- `land`: the scrollY at the end.
- `ms`.

When something goes wrong the line also carries `jump` (the first jumps: the block, its move, the scroll, the
page's own scrolls and the undos in that frame), `under` (the page's scrolls made under a finger, with what the
page itself knew of the finger then) and `pageerrors`. `WASH_TRACE=1` adds `trace`: the frames after each undo.
A jump is a move of over 400 px, in one frame, of the block in the middle of the screen, that the visitor's input
doesn't explain: the change in its screen position, less the scroll the input made (the scroll minus the page's
own scrolls and the undos). In practice that is a layout change no scroll made up for, or an undo. A pinned stage
counts as holding still. Scroll counts as the input's while a harness gesture is on (from its first event to
800 ms after the page has settled) or within 700 ms of an input event. A busy page in SwiftShader scrolls on its
compositor before its own events for that input arrive. Frames hidden by a cut through black, a view transition
or a view swap aren't judged.

**Speed:** to keep a run under about 3 minutes in SwiftShader, wash.py draws at 1x pixel density (`WASH_DPR=2` for
2x) and lets the foam adapt its resolution (no `?noadapt`). On desk the page draws at about 3 to 6 frames a second
here, so wheel ticks are sent as they come rather than one per page frame. A run is about 30 to 130 s.

**Taps:** a tap waits until its target holds still and nothing covers it, for 3 s at most. On a phone, the menu's
panel slides shut over the bar's logo for about 0.75 s. A place is read only once the top bar is back: a small
move up brings it back, as a visitor does to reach the menu, and moves the page a little.

## back_walk.py

| Walk | What it checks |
| --- | --- |
| `owner` | The owner's example: home, through the wash, tap Interior, Services a long way down, a little up (the bar and Back come back), Back. Home must be at the same scrollY (less what the wash gave back meanwhile) with the Interior card at the same screen position within 2 px |
| `chain` | Home (Bundles card), a Services group, the FAQ with a question open, Contact. Then Back three times (each page where it was left, the question still open) and Forward |
| `reload` | Home a little down, the FAQ further down, a reload (the FAQ where it was), Back (home where it was) |
| `direct` | The FAQ opened directly: Back is visible and goes to the top of home. Home opened directly: Back is not visible (by its computed visibility and opacity, not its hidden attribute) |

Sizes: `phone` 390x844, `n360` 360x780 (touch, 2x), `desk` 1440x900. The walk prints PASS/FAIL lines, then
BACK_DONE.

## check_site.sh

Prints `ok`, `FAIL` or `env` lines, then `CHECK_DONE`. An `env` line is a request this sandbox refused: the proxy
refusing jsDelivr or a Google Fonts file, or its certificate. That isn't the site's fault.

It runs, in order:
1. `node --check` on every `site/js` file.
2. `tools/build_artifact.py`.
3. The walks: `tools/shoot_booking.py` (guest desktop, guest phone, guest phone light, text codes with
   `SHOOT_QUERY=&guest=0`), `shoot_account.py`, `shoot_admin.py` and `shoot_team.py`.
4. `smoke.py`.
5. With `wash`: all 33 wash runs compared with `wash_baseline.txt`, then `back_walk.py owner` on phone and desk.

A wash line is ok when its err, worst and bad are each 0 or no more than the baseline's.

The older walks open the site from disk and make their own browsers. check_site.sh hands them (and the kit) a
Chromium wrapper (`<out_dir>/chrome`) that sends `*.supabase.co` to a closed local port, so no walk can reach
the live project.

## The baseline and the self-test

`wash_baseline.txt` holds every scenario that exists on the live site (main, 6dbb2c7, exported with
`git archive`), run in all three modes. The cut and Back scenarios (`second`, `touchcut_faq`, `touchcut_home`)
don't exist there, so their lines are the absolute pass: err 0, worst 0, undos 0, bad 0.

The live site has one real jump of its own, in `leave_mid` and `theme` in every mode. Opening the menu mid-wash sets
`overflow: hidden` on the page, and the pinned stage drops back by however far the wash has gone (931 px on the
phone, 1,257 to 1,607 px on desk), behind the menu's panel. The design build doesn't do this: its menu holds the
page another way. The baseline keeps those lines as measured, so they allow no more than that.

`selftest.sh` finds the doc 35 fix in the history (27ac46c, "The wash no longer jumps the page on iPhone") and
exports its parent (7950b92). It runs `fling`, `back_rest` and `decay` in mode `ios` on that site and on HEAD. The
old site must show undos or a jump over 400 px; HEAD must show none.

## Results on Nov 4, 2026 (design-build-wip at 471ab00)

**Self-test.** On 7950b92 (before the fix):
- `fling`: 1 undo. In four more runs the jump showed too: 2,354 to 2,363 px.
- `back_rest`: 1 undo and a 2,352 px jump.
- `decay`: 1 undo and a 2,357 px jump.

On HEAD all three are 0.

**The full check with the wash.** 133 lines ok, 0 FAIL, and 1 env line (jsDelivr refused by the proxy).

**One intermittent failure on HEAD: `ios theme`.** It failed once in five runs, with 60 undos. The case:
- The page was starved in SwiftShader: its main thread ran at about 3 frames a second after the light theme.
- A flick lifted with no scroll event in the 150 ms before the lift.
- `foam.js` `rest.proven()` took the lift for a lift on a still page and began the 40 px creep, while the momentum
  (and the hidden thumb) had already started.
- `rest`'s own-scroll filter (`ours()`, within 1.5 px of its own positions) then took the undo's scroll for its
  own, so the creep went on and its watchdog never ran.

On a real iPhone that needs a frame gap of 150 ms or more right after a flick. That code is off limits for design
work (doc 35), so this is a finding for the owner, not a change made here.

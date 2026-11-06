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
| `heads.py <site_dir> <out_dir> [label]` | The seven centred headings (the owner's Nov 5 answer): each title's offset from its column's centre, and a shot |
| `budget.py <route> <site_a> <site_b> [walks] [out_dir]` | Hard rule 5's long tasks: a first visit on a phone (390x844, CPU slowed 4x) walked down a page, two sites in turn, each long task placed and (with a trace) split by cause |
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

# the long-task budget: Services on the live site (main, exported) against the working tree, 6 walks each, traced
mkdir -p $S/live && git archive origin/main site | tar -x -C $S/live   # (once: the live site, b07fced on Nov 6)
BUDGET_TRACE=1 BUDGET_WAIT=2.5 BUDGET_LABELS=live,head python3 tools/qa/budget.py services $S/live/site site 6 $S/budget

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

**Options:** `WASH_THEME=light` opens the page in the light theme (every scenario but `theme`, which switches from
dark itself; the line then carries `"theme": "light"`). `WASH_FOLD=1` adds `after` once the run is scored: a wash the
run left unfolded must still fold. Unless it is already creeping, a visitor's finger drags 40 px, holds still 200 ms
and lifts on a still page (on iOS the lift `rest.proven()` trusts, 400 ms later), then up to 20 s: `after` gives
`fold`, how, the steps, whether it touched, the seconds, and the run's undos, jumps and worst in total. A wash that
ends a scenario unfolded is normal on iOS: after a fling the page last heard a lift and then the momentum's scroll,
so nothing proves the glass free until the next lift. `WASH_CPU=2` slows the page's CPU 2x through CDP
(`Emulation.setCPUThrottlingRate`) once it has loaded, for the scenario and `after` (the line carries `cpu`). It slows
the page's own work, not SwiftShader's drawing in the GPU process, so on its own it starves no frames here; with
the whole browser held to one core (`taskset -c 0 python3 tools/qa/wash.py ...`) it does: about 10 frames a second
at 1.5x, 7 to 8 at 2x, 6 at 4x (12.7 on one core alone). Every line carries `fps`, the page's frames a second
during the scenario. None of these options is on in `check_site.sh` (the baseline has none).

**Taps:** a tap waits until its target holds still and nothing covers it, for 3 s at most. On a phone, the menu's
panel slides shut over the bar's logo for about 0.75 s. A place is read only once the top bar is back: a small
move up brings it back, as a visitor does to reach the menu, and moves the page a little.

## heads.py

The owner's Nov 5 answer, "Centre all seven": Home's 'Choose your finish' head (`svc`), the Ritual's and the Bead
Test's heads (`ritual`, `bead`) and the four Services photo plates' captions (`exterior`, `interior`, `bundles`,
`protection`) are centred at every width, the short note or line under the title. For each width (1440x900,
1024x768, 440x956, 390x844, 360x780; 440 and under are touch phones) and theme it opens Home (the wash finished,
the cards up) and Services, brings each head on screen, waits until it has set (its lines whole, its plate's
moment over, 14 s at most: `set`, `waited`), then prints one JSON line and writes `{label}-{head}-{width}-{theme}.png`
(a plate: the whole plate). `off` is the title's worst line's offset from its column's centre in px (the head's own
content box; a plate's box for a plate), `lines` every line's, `lead` and `leadLines` the same for the note or the
plate's line. A line's centre is its glyphs': the text's box less the tracking after its last letter. PASS when
|off| <= 2. Filters: `HEADS_WIDTHS`, `HEADS_THEMES`, `HEADS_ONLY=svc,bead`; `HEADS_REDUCE=1` for reduced motion,
`HEADS_NOGL=1` for WebGL off (the shots take `-rm`, `-nogl`).

```bash
python3 tools/qa/heads.py site $S/heads after
HEADS_REDUCE=1 HEADS_WIDTHS=1440,390 python3 tools/qa/heads.py site $S/heads after
```

## budget.py

Hard rule 5: on a 390x844 phone with the CPU slowed 4x, no new long task over 50 ms. Each walk is a first visit in a
fresh browser (no cache, no storage): the page a visitor opens (no `?noadapt`), its fonts and the pictures in view
settled, `BUDGET_IDLE` (2.5 s) for its opening, then a visitor's pace down to its foot: a 330 px drag lifted on a
still finger (no fling, so both sites scroll the same distances), 0.75 s of reading, again. The two sites are walked
in turn (A B B A A B ...), so they share the machine's load; `BUDGET_WAIT=2.5` waits (90 s at most) before each walk
for the 1-minute load average to fall under 2.5. Each walk line gives the load at its start and end, `calib` (a fixed
loop's time in the page: about 16-20 ms on a quiet machine at 4x; more means the machine was busy), the opening's
long tasks and the walk's, each walk's as `ms@scrollY:block` (the block across the middle of the screen).

**Read it like this.** The number that counts is the walk's long tasks from the page's own `longtask` observer, what
the earlier panels counted. With `BUDGET_TRACE=1` the summary adds the trace's view, which is stricter: tasks over
50 ms that are not garbage collection (the observer leaves V8's GC out, and it also misses some of the commit waits
below), tasks over 30 ms (the ones a busier machine pushes over 50), the main thread's busy time, and the commit
waits. Each traced task over 30 ms is split by self time into script, gc, style, layout, prepaint, paint, composite,
animate, intersect, scroll, input, frame, decode, gpu and task, with its busiest events and the elements they name.
Compare traced walks with traced walks: the trace has a cost of its own.

**This sandbox's GPU is SwiftShader**, the CPU drawing for the GPU, on the same four cores as the page. Drawing that a
phone's GPU does in a few ms takes 50 to 250 ms here: a live WebGL picture at plate size about 220 ms, a first
drawing of a panel with big pictures and a wide blurred shadow 100 ms or more. The page's main thread doesn't run that
work, but it waits for it: a frame's commit waits for its raster, and the raster waits behind the GPU process
(`LayerTreeHost::WaitForCommitCompletion` in the trace, `commit waits` in the summary: [ms in all, how many over
30 ms, the longest]). So in this harness a moment that keeps the GPU busy, or a big first drawing just as something
comes on, shows as a long task. `BUDGET_TRACE=keep` keeps the trace; `BUDGET_CATS=viz,gpu.service,skia` and
`BUDGET_TRACE_FROM=<scrollY>` show the GPU process's side (its `SkiaOutputSurfaceImplOnGpu::SwapBuffers`) for a part
of the page; `BUDGET_TRACE=inval` adds which elements were invalidated and why.

Other options: `BUDGET_RATE` (the slow-down), `BUDGET_THEME=light`, `BUDGET_ONLY=a|b` (one site), `BUDGET_QUERY`
(`?noadapt`: every live scene at full quality, as the screenshot checks open the pages), `BUDGET_DUMP='js'` (a value
read from the page at the end, kept in the walk's JSON).

```bash
BUDGET_TRACE=1 BUDGET_WAIT=2.5 BUDGET_LABELS=live,head python3 tools/qa/budget.py services $S/live/site site 6 $S/budget
BUDGET_TRACE=keep BUDGET_TRACE_FROM=8300 BUDGET_CATS=viz,gpu.service,skia BUDGET_ONLY=b python3 tools/qa/budget.py services $S/live/site site 2 $S/budget-gpu
```

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

## The starved-frame slide after the owner's Nov 5 OK (Nov 6, 2026)

The owner approved one condition in rule (b): `&& t - s.tLift >= 400` (a lift counts once 400 ms have passed with
no scroll). Mode `ios`, `WASH_FOLD=1`, one run at a time; load = the 1-minute load average as each run started.

**The doc 35 set** (fling, slow, hold, decay and back_rest in both themes; theme from dark), the two sites
interleaved run by run:
- After (3cdfa37 plus the rule; from the 61st run on, the whole working tree with the centred heads): 125 runs at
  load 0.72 to 8.51 (median 3.58; 92 under 4), 29 to 47 fps. 0 undos, 0 jumps, worst 0, every wash folded (35 by
  the scenario's end, back_rest and theme; the other 90 after `after`'s lift).
- Before (1f2863f, `git archive`): 110 runs at load 2.08 to 7.92 (median 3.58), 27.5 to 46 fps. One slide:
  `back_rest` dark at load 3.29 and 28 fps, 15 undos (no scroll for 295 ms before the lift, the creep 152 ms
  after it).

**Starved on purpose** (the browser held to one core, `taskset -c 0`, and `WASH_CPU`; the load averages there,
1.6 to 5.5, are mostly the harness's own queue on that core):

| One core and | fps | Before (1f2863f) | After (the rule) |
| --- | --- | --- | --- |
| no throttle | 12.7 | theme: 0 undos (1 run) | |
| CPU 1.5x | 7.6 to 10.4 | 5 of 6 slid: theme 3 of 3 (60 undos each), back_rest dark 2 of 2 (14, 19), back_rest light 0 of 1 | 0 of 7: theme 0 of 4, back_rest 0 of 3 |
| CPU 2x | 6.9 to 8.4 | theme 60 undos, back_rest 22 | back_rest 0; theme 2 of 2 slid, 60 undos each |
| CPU 4x | about 6 | theme 60 undos | theme 60 undos |

In every slide: no jump (worst 0), and the wash still folded. Before, the creep began 151 to 249 ms after the lift.
After, it began 416 to 457 ms after it, in `theme` only (the light theme's heavy frames): the page had heard no
scroll for 0.86 to 2 s before the lift and none in the 400 ms after it. So the wait closes the slide for a page
that stalls up to 400 ms after a flick; a longer stall still slides. Two of those runs started under load 4 (3.85
at 2x, 3.95 at 4x), on the starved core. That is for the owner's iPhone check, not a change here: the one condition
is the only foam.js change allowed.

**Nothing else moved.** Modes `chromium` and `desk`, every scenario once with `WASH_FOLD=1` (load 1.4 to 3.9): 22
runs, 0 undos, 0 jumps, every wash folded. `back_walk.py owner` on phone and desk: PASS. The full check with the
wash on the working tree: 133 lines ok, 0 FAIL, 1 env line (jsDelivr refused by the proxy); its 33 wash lines all
err 0.

## The Services budget (Nov 6, 2026)

`budget.py services`, live (origin/main, b07fced) against the design build, the two interleaved; load = the 1-minute
load average at each walk's start and end (the walks' own load: one browser at a time, nothing else running).

**Before** (99b2de4, 6 walks each, traced, load 0.61 to 3.05): live 0 long tasks in every walk; the design build
1, 1, 3, 3, 1, 1 (10; 7 over 100 ms, the longest 176 ms), every one between scrollY 8,754 and 9,384, where the Bundles
end and the Protection plate comes on.

**What caused them**, each toggled on a copy, 3 or 4 walks a toggle:
- Protection's live bead moment. In this sandbox each of its pictures is about 220 ms of SwiftShader work in the GPU
  process (`SkiaOutputSurfaceImplOnGpu::SwapBuffers`), back to back for its 3.6 s: the page's frames starve and its
  commits wait. No moment: 0, 1, 0. The moment with its first picture only: 1, 0, 0 (the one at the Interior).
  Backdrop blur off (2, 3, 1) and the photo drawn ahead (3, 2, 1) changed nothing.
- With the moment ended early, the Bead Test panel's first drawing as it rises (two 1400x900 pictures, two stills
  under soft-light, a 90 px blurred shadow): commit waits of 150 to 250 ms at scrollY 9,318 to 9,384 in 6 of 10 walks
  (and in 1 of 3 with no moment at all). Gone (the longest wait 4 to 8 ms) with no box shadows at all, with no shadow
  on the panel (44 ms at most), with no shadow on the Book buttons, with the chapter bar's script off, and with the
  panel a layer of its own from the start. Unchanged with blend modes, filters, masks, will-change, the scroll
  timeline drifts, the backdrop blur, the fonts, eager pictures, the rinse, the cabin, the Table's moment, the chapter
  bar's shadow, the seam's and badge's glow or text shadows off.
- Smaller (40 to 58 ms frames): the Interior cabin's words and full stops lit on the main thread (inline spans, a
  colour animation); the slow-device verdict's own frame (52 to 77 ms: the canvas removed, the photo and the titles
  set in one frame); two price cards and their figures released in one frame under a plate's title.
- Not kept: the scroll timeline drifts run only near the screen (main thread 7.3 s a walk either way).

**After** (the fixes in app.js and alchemist.css, 8 walks each, traced, `BUDGET_WAIT=2`, load 1.34 to 3.14, median
2.0): live 0 in every walk; the design build 0, 0, 1, 1, 0, 0, 0, 0 (2; none over 100 ms, the longest 70 ms), the
longest commit wait 19 ms (before: 150 to 250 ms). The same tree alone, 4 walks: 1. Before the last two fixes (the
verdict's frame, one card a frame), two interleaved runs: 1 in 6 against live's 2 in 6 (both live's own opening frame
at the Table), and 4 in 6 against live's 0 in 6. What is left is a frame of 51 to 77 ms at a moment's turn (the Protection
plate's photo and titles coming in, the Bundles plate's title setting, the Interior's cards, once a 47 ms commit wait
at the Ritual): the design's frames carry more than live's (per second of the walk, style 1.6x, paint 1.35x,
animation 1.9x), so a busier machine still pushes a few over 50 ms. In this sandbox the Protection plate shows its
quick path (the photo up from black, the title rising); `?noadapt` plays the live beading as before.

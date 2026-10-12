# 35. The end of the wash on phones (Oct 12, 2026)

The owner sent an iPhone screen recording of the home page (in the Claude app's preview): "after the foam disappears it lags and goes down the page".

## What was wrong

1. **The jump.** When the wash ended (progress 0.995), the old `settle()` shrank the wash section from 380vh to one screen, which removed 2,464 px on his phone. In the same animation frame it scrolled the page back by the same amount, so nothing would move. On an iPhone that frame came while a finger or a fling was still moving the page. iOS undoes a script's scroll made under a finger (WebKit bug 310358), and it never tells the page about a touch that catches a fling. So the shrink stuck and the scroll-back didn't. The page leapt 2,464 px to the end of "Our work" and "How booking works", over a grey, not-yet-painted screen.
2. **The lag.** The rinse clears the screen at about 82% of the pin, but the pin held until 100%. That left about 440 px of scrolling on his phone (about 530 px on a 900 px computer screen) where nothing on screen moved.

**How we know:**
- Frame by frame in the recording, at the jump frame (10.21 s), the iOS scroll bar gets 1.329 times longer. That is what a page 2,464 px shorter predicts (1.328). Its position shows the scroll position wasn't moved back.
- The first painted frame after 0.34 s of grey matches the shrunk page at an unchanged scroll position.
- In Chromium with an imitation of the iPhone's behaviour, the old code jumped 2,464 px in all five test scenarios.

The facts the fix rests on, from WebKit's source for each Safari release and these reports: WebKit bugs 310358, 310087, 307475 and 255193, TanStack Virtual issue 1307, and the virtua library's iOS notes.
- A script's scroll under a finger is undone on every iOS version.
- During a fling it lands, but on iOS 26 and earlier it stops the fling.
- `scrollend` exists from iOS 26.2.
- On iOS 26 and earlier, and inside a frame, a large programmatic scroll can show blank tiles for a moment (WebKit bug 310087).

## The fix (site/js/foam.js, site/js/app.js, site/css/alchemist.css)

**The pin lets go when the rinse has cleared the screen.**
- That point is `--wash-release: .85` of the wash's timeline.
- The section keeps its length: 380vh on phones, 430vh on computers, the owner's "4 scrolls". The timeline is spread over that same length, so the foam is moving until the cards rise. Each phase takes about 18% more scrolling than before; the dead stretch is gone.
- The last film of water and the drops dry while the stage scrolls away, driven by the scroll or an 800 ms clock, whichever is ahead.
- An alternative was to keep each phase's scrolling and make the section 15% shorter. It wasn't taken, because it would change the length the owner approved.

**Finishing changes no size and scrolls nothing.** The section gives its extra length back (`pinFold`) only in ways nothing on screen can show:
- **free:** the whole pin is below the screen, so no scroll is needed.
- **trim:** on the way back up, the part of the pin below the screen is cut.
- **rest:** a measured scroll-back, done only at a moment that proves no finger can be on the glass (`rest.proven()`). The proofs are:
  - a `scrollend` after the last scroll (iOS 26.2+, Chrome, Firefox);
  - the last finger lifting off a still page;
  - on a computer without `scrollend`, 300 ms without scrolling or input.
  
  On iOS 17 to 26.1 only the lift counts. A thumb resting on a fling's slow tail is invisible to the page, and the review found that the earlier "slow tail" proof could fire under such a thumb. On iOS 26 and earlier, and inside a frame, the scroll-back goes 40 px per frame (bug 310087).
- **hide:** when leaving home, with no scroll; the remembered home position is corrected.
- **now:** for a click or a key: Explore Services, the logo's scroll to the top, keyboard focus into the cards, and the screenshot tool's `goTo`.

**Safety checks on every scroll-back:**
- Each scroll-back is measured and verified to within 1 px, or put back.
- When the section is wholly above the screen, the page is scrolled first, and nothing changes size unless that scroll took.
- On iOS, a watchdog puts the length back if the browser undoes the scroll anyway.
- Lengths are whole CSS pixels, so nothing ends up a third of a pixel off.

**Everywhere but iOS, the length goes at the release, as before.** A script's scroll under a finger sticks on those engines. On iOS a visitor who turns straight back up, without a pause the page can prove, scrolls back through the pinned cards (up to about 2.8 phone screens), then the page carries on. The wash never plays backwards. This is the trade-off for never jumping.

**Other changes:**
- The top bar's frosted blur comes back when the drops have dried (the `washend` event).
- If the wash can't start once the visitor is already in it, the services show in the stage (`.wash.static`) instead of the section collapsing under them.
- A lost WebGL context finishes the wash where it is.

## Checks (local Chromium; no real iPhone here)

- **Before review:** a frame-by-frame harness ran 80 times. That covered 13 gesture scenarios, each with:
  - iPhone emulations of iOS 27, iOS 26.2+ and iOS 17 to 26.1, including fingers the page never hears;
  - a Chromium phone;
  - a computer with a wheel;
  
  plus Explore Services, `goTo`, keyboard focus, the End key and no WebGL.
- **After the review fixes:** the same 80 runs, plus 45 of the reviewers' edge cases:
  - a thumb resting on a fling's tail;
  - nudges;
  - creeps interrupted by a touch;
  - rotation, theme, context loss;
  - the logo tap with the fold pending.
- **Result:** no frame anywhere shows anything on screen moving because of the fold. The only flagged frames are the home view's own 10 px entrance animation after returning to home.
- **Dead scroll after the rinse:** 0 to 28 px (was about 440).
- **Probes:**
  - at 3x pixel density the fold moves the page by whole pixels;
  - `overflow-anchor` is restored after two changes in one frame;
  - a resize keeps the folded section;
  - a `scrollend` that shares the last scroll's timestamp is accepted.
- **Preview:** the single-file build parses all 13 scripts.
- **Review:** four independent reviewers (iPhone edge cases, regressions, real-rendering visuals, code quality) and one verifier: 26 findings, 18 confirmed (merged into 11), all fixed except two stale doc lines, which this doc and CLAUDE.md now cover.

## For the owner to try on the test site (alchemist-detailing-test.vercel.app)

- Flick quickly through the wash: once the foam is off, the cards move right away and the page carries on smoothly, with no jump and no grey screen.
- Do it again slowly with the finger down the whole time.
- Stop right after the cards appear, wait a moment, then scroll back up: the page goes straight back up to "The Alchemist Standard".
- Flick past the cards and straight back up without stopping: the cards stay on screen for a while, then the page carries on (expected on iPhone).

## Owner's check (Oct 12)

The owner tried it on his iPhone and confirmed: "Issue is fixed."

# Doc 50: the design build takes the live site's Nov 4-7 changes (Nov 7-8, 2026)

## Why the merge

The design build (Look C, "Hypercar", docs 39, 40 and 44) was made on the branch `design-build-wip` while the live site on `main` kept changing. By the evening of Nov 7, `main` was 44 commits ahead of the point where the two split (`b07fced`), and those commits hold the owner's own Nov 6 and 7 decisions. The owner can only judge one complete preview: the new look with everything the live site already does. So the live work was merged into the design build before the owner's iPhone look (doc 39, question 2, and its go-live step 4).

The merge is on the local branch `design-merge` (started from `design-build-wip` at `55635e4`, merged with `main` at `0afdc60`). Nothing was pushed: `main` and `design-build-wip` on GitHub are unchanged, and nothing is live. The design build still goes live only on the owner's separate OK after they check it on their iPhone.

Commits: `7801d62` (the merge itself), then four follow-ups from the review rounds: `ed09b90`, `c89b157`, `0a1ee15` and `fcbc156`. Each commit body lists its changes.

## What each side brought

**From `main` (`0afdc60`, live, every behaviour binding):**

- The live bug fixes of doc 45 (Parker's date on Admin and Team, Change time, the Morning lists, Assign, note labels, the text-code messages).
- The owner's six answers (doc 46): Start and Complete on the job's day, the owner sets prices, the shop address for the admin only, "Other" says the price is confirmed wherever a total shows, `my_bookings` with conditions (the front end for Migrations 007 and 008).
- The team door and the "Are you sure?" step before Confirm on the Admin page (docs 47 and 48): "My jobs" for a detailer, the Account page's team card, the footer's "Team sign-in", the /admin, /requests and /team addresses.
- "Switch sides" at the bottom of the menu for the admin and managers (doc 49).
- The Nov 4 domain answer (thealchemistdetailing.com everywhere, doc 41) and "keep my number there": when online booking can't reach the database, the pages give the phone number (`data.js` `isDown`, `U.outage`, `.bk-down`, doc 42).
- `config.js`'s live/test allowlist: only thealchemistdetailing.com, its www address and alchemist-detailing.vercel.app talk to the live project; every preview and branch build uses the test project. The Test project strip (`U.modeBanner`).
- supabase-js served from the site itself (`site/js/vendor/supabase-js-2.49.4.js`, same SRI hash), and the head rule that keeps every address but the domain out of search.
- The e2e report.

**From the design build (`55635e4`):** Look C (Archivo, the owner's brighter gold, centred headings), the Back button and the top bar (doc 40), the floating menu with its short-screen scroller, the booking's build sheet, receipt, pour and finger guards (no scroll under a finger when a database answer arrives late), the Account page's next card and progress line, the Admin rows and the crew list, the Services long-task budget, panels p01 to p15, and the QA kit in `tools/qa`.

## How the twelve conflicted files were settled

The rule: where the two sides differ in logic, `main` wins; where they differ in how something looks, the design wins unless that would lose something `main` does. Twelve files conflicted (47 hunks); `CLAUDE.md` and the rest merged on their own. Below, every resolution that changed how something looks or behaves compared with one side or the other is named.

### `site/js/booking.js` (15 hunks)

- `main`'s logic throughout: its quote re-check in `go()` (back to step 04 with the database's error if there is still no quote), `syncWhen()`, `loadTimes` with the kept start time and its note, the date-step checks, Parker's "today", the "Other" price wording ("Price confirmed…" in the bottom bar's total too), `signedInHere`, the guest-only email row, and a refused start time (`slot_unavailable`) keeping the chosen day. What booking sends, checks and prices is `main`'s.
- **Changed from the design:** its own way of handling a day that fills up while the customer is booking (`fit`, `lost`, `refit`, `dropDay`) is gone, replaced by `main`'s. A chosen day that turns full is no longer dropped: it stays chosen and says "No start times left that day…". `main`'s words show in the design's quiet gold-dot line (`.bk-lost`) above the times, and the line under the times keeps "Can't find a time? Call (945) 361-7551." (follow-ups `ed09b90`, `c89b157`).
- **Changed from `main`:** a refused start time's reason shows once, in that gold-dot line, now marked as an error (red text and dot, both themes: `.bk-lost.has-error`), instead of in `main`'s message line under the times. When the page has not moved since Send, step 05 comes back, the heading down to the reason comes into view under the bar and the first start time takes the focus, as `main` does. If a finger, a wheel or a scroll happened since Send, the reason is only marked and nothing moves (the design's finger guard; `fcbc156`).
- Kept from the design: the guard that drops a price answer for a choice that changed meanwhile (`STALE`). `main` has nothing of its own there. In the merge, such an answer no longer sends the page back to step 04; with no price at all, `main`'s move back to the service step happens only if the page stayed still, otherwise the date step is redrawn in place with no scroll (`ed09b90`).
- `pickDay` gained a third argument so `syncWhen`'s re-check of a chosen day never pours or scrolls; `loadTimes` returns whether fresh times arrived, so the design's reveal runs only then. `main`'s state changes are the same.
- The receipt's "held until" shows the hold in Parker's time zone with its name (`main`), with no-break spaces so "Nov 9" and "10:00 PM CST" never split (`c89b157`, `0a1ee15`).

### `site/js/app.js` (5 hunks)

- The design's router and menu, with `main`'s door block (`showDoor`, `note`, `markDoor`, `checkDoor`, `SCREEN`, `ADMIN_ONLY`), its auth listener, and Switch sides' memory (noted on each render and from `hashchange`'s `oldURL`, as the first thing the design's handler does). `main`'s second `let menuOpen` was dropped.
- `main`'s "the menu opens at its top" is kept, written as `if (menu.scrollTop) menu.scrollTop = 0` with the other reads, so the tap still does no layout work (the design's rule).
- **Changed from the design:** while Switch sides shows (the admin, a manager), the design's short-screen list stays at its top, so the close button and Home are in view (doc 49); visitors keep the design's scroll to the current page (`c89b157`). `main`'s guard for a page without `#switchSide` is kept, so a stale cached page opens its menu instead of failing (`0a1ee15`).
- The menu foot rises one 28 ms step after Account (the design's timing); only while the detailer's "My jobs" shows does it wait one more step, so the two never rise together (`ed09b90`, `fcbc156`).
- The foam wash wiring is untouched.

### `site/js/admin.js` (6 hunks)

- `main`'s logic in the design's rows: Parker's date (`bizToday() - 30`), `onFail`, fresh lists on each screen change, the "Earlier, not finished", "Waiting on the customer" and team-asks sections, the calendar opening a booking in place, the address row for the admin only (a manager sees "Private: not shown here"). The design's crew list ("Team today") comes first, then Earlier, then Today; Tomorrow uses the design's day rows.
- **Changed from `main`:** the calendar's narrow column says "Gold" (the design's short label) instead of "Gold detail"; every `history.replaceState(null, …)` that `main` added keeps `history.state` instead, because the design's Back button reads its trail from there.
- "Are you sure?": the gold line that fills "Yes, I'm sure" during its 700 ms wait shows again (the design's button reflection had hidden it; reduced motion still draws no line). Its summary keeps no line starting with a middle dot, keeps "11:30 AM (Parker time)" and "F-150" whole, and its labels take the design's card label style; under 400 px only the spacing narrows, so the When line stays on one line at 390 px and "Yes, I'm sure" stays in view, as on `main` (`ed09b90`, `c89b157`, `0a1ee15`).

### `site/js/account.js` (4 hunks)

- The Test project strip (`U.modeBanner`) with the design's "The past details are examples." The design's "Accounts are coming soon" screen shows the same strip in its pill on the test database.
- `main`'s phone line ("(not confirmed)", "None on file") inside the design's profile; `main`'s hold time in Parker's zone and the "Other" price note inside the design's appointment card.
- The review form: `main`'s (one press sends one review; the hint says "No links or emoji."), plus the design's reload after sending.
- The team card's name is in the design's title face (`ed09b90`).

### `site/js/data.js`, `ui.js`, `team.js`, `reviews.js`

Both sides kept. `main`'s new words on screen in `admin.js`, `team.js`, `account.js` and `ui.js` take the design's curly apostrophes and quotes ("Yes, I'm sure", "couldn't", "car's"); `data.js`'s messages stay straight, as on both branches.

### `site/index.html` (4 hunks)

- The design's head script with `main`'s hostname test (no search listing except the domain).
- `main`'s "My jobs" door in the design's menu, its Team tag inside the word, so it rises with "My jobs".
- Switch sides is the last thing in the menu's foot, after the design's light-mode switch and phone number.
- The footer keeps both the design's "Payment in person" and `main`'s "Team sign-in". It shows on every page, the Admin and Team pages' one-line footer included (doc 48 answer 3, "Keep it"; a follow-up that hid it there was undone in `fcbc156`).

### `site/css/alchemist.css` (5 conflicts; six places settled)

- Switch sides, the team tag, the footer link and `.acct-who` in Look C's tokens (caps font, label spacing, rounded corners, mouse-only hover; frosted ivory glass in the light theme). The footer link's underline is a new token (`--fine-underline`, the design's grey at 40%), with no `color-mix` (iOS 15).
- The menu's bottom room moved into `.menu-foot`, as doc 49 did: 24 px plus the home bar by default, the design's 16 px plus the home bar on screens under 780 px tall and 22 px on the floating desktop panel, with Switch sides keeping doc 49's 24 px below it through its own margin (`c89b157`).
- A past hold in the calendar fades (`main`) and keeps the design's gold border.

### `tools/shoot_admin.py`, `tools/shoot_team.py`

Both kept (the light theme from the design, the preview's unreachable database from `main`).

### Not touched

`foam.js` differs from `main` only by what the design already had: its gold colour and the owner's 400 ms wait in `rest.proven()` (doc 44). `config.js`, `vercel.json`, `site/js/vendor/` and everything under `supabase/` are exactly `main`'s. No database, Supabase or Vercel change; no regex lookbehind in `site/`.

## The checks and their results

All on `fcbc156`, in preview mode or against recorded test answers; the live project was never contacted. The machine has 4 CPUs shared with other work, so timings are noted with their load.

- **The full check, with the wash** (`tools/qa/check_site.sh … wash`, 28.5 minutes, load 1.0 to 7.8, the peak from the script's own three wash runs): **133 lines ok, 0 FAIL, 0 env.** That covers `node --check` on all 15 scripts, the single-file preview (1,847 KB), seven walks (booking as a guest on a computer, on a phone and in light, the text-code booking, Account, Admin, Team), every smoke line at 360, 390, 440 px and on a computer, 33 wash runs (11 cases on the iPhone harness, Chromium and a computer: every one with 0 errors, 0 undos, 0 bad frames, 0 px worst jump, at or better than the recorded baseline), and the Back walks (Home came back at exactly the scroll it was left at: 1,536 px on a phone, 1,673 px on a computer). The env line the README expects (jsDelivr refused) is gone because supabase-js is now served by the site itself.
- **Hard rule 4, the long-task budget** (`tools/qa/budget.py`, a 390 × 844 phone, CPU slowed 4x, the design tip `55635e4` and the merge taking turns, 6 walks each, one browser at a time):
  - Services: 0 long tasks in every walk on both (load 2.0 to 3.7).
  - Home: the design tip 59 tasks (21 over 100 ms, longest 956 ms), the merge 52 (20 over 100 ms, longest 677 ms), load 2.3 to 4.1, at the same places on both (the opening, the Standard, Why, the wash frames, Our work). The machine was busy (calibration up to 98 ms), which inflates both sides alike. No new task.
  - Book: the same one task as the booking opens, in 3 of 6 walks on the tip (longest 246 ms) and 4 of 6 on the merge (longest 253 ms), load 1.6 to 3.0. No new task.
- **Switch sides gate** from `main` (`preview_gate.py`, 94 checks a run): at 360 × 640 dark, 0 failures; the menu does not scroll at 360 × 640, 390 × 844 or 1280 × 900, and Switch sides sits at 567 to 615 px of a 640 px screen. Earlier runs, before `c89b157`, failed only the "24 px below Switch sides" checks; that room is back.
- **Recorded live-mode replays** (test answers replayed for a visitor, a customer, a detailer, a manager and the admin): no request reached the live project in any run.
- **Every line `main` added** since `b07fced` was looked for in the merged files: none is missing from `data.js`, `CLAUDE.md` or the four shoot scripts; every other miss was read by hand and is a curly-quote change or the design's form of the same behaviour, listed above.
- **Review rounds:** the first found 20 points and confirmed 7 (2 major: the missing gold line on "Yes, I'm sure", the lost quiet line for a start time that no longer fits; 5 minor), all fixed in `ed09b90`. The later rounds' findings are fixed in `c89b157`, `0a1ee15` and `fcbc156`. Points that were checked and found not to come from the merge (the design's own phone rows hiding a pending request's hold, the conditions note the design removed from step 02 in `8a4e29b`) stay as they were.

## Left open

- **Not checked on an iPhone:** everything above was tested in Chromium with software graphics. Switch sides and the team tag in Look C, the red gold-dot note at step 05 and the "Are you sure?" line are new to the owner's eyes.
- **The Back trail through the Admin page:** keeping `history.state` in `main`'s new `replaceState` calls was not walked with `tools/qa/back_walk.py` on the Admin screens.
- **The visitor's Services page reads the public menu** (prices, services, vehicle types) from the database, so `main`'s live replay check "a visitor made no request with the menu" counts those reads on Services. It is the design's own behaviour (the same on `55635e4`), public reads only, nothing about sign-in or profiles.
- **Gate script and the design's top bar:** at 360 × 640 light with reduced motion, `main`'s unmodified gate stopped after Sign out on `#account`, because the design's bar had gone away on the scroll and the menu button was off screen. A copy that first scrolls up 120 px, as a visitor would, ran all 94 checks. The gate needs that step for the design build.
- **Unused CSS:** the design's `.bk-lost` is in use again; nothing else of the replaced day-handling is left on screen.
- `design-merge` is not on GitHub. For the owner's preview it has to become `design-build-wip` there (a push, which this work did not do).

## Open for the owner

1. **Doc 49's question ("pin Switch sides to the bottom edge of the menu?") is answered by the new design.** In the design build the list of pages scrolls inside the menu and its foot stays on screen, so Switch sides shows as soon as the menu opens, on a small phone and on a computer (measured at 360 × 640, 390 × 844 and 1280 × 900). On the live site it is still below the edge until the design goes live. *Recommendation:* make no separate change to the live site; let the design build answer it when it goes live, and the owner checks it in the iPhone look (open the menu while signed in as the admin).
2. **One more thing to look at in the iPhone check (doc 39, question 2):** sign in as the admin on the preview (with `?project=test`), open the menu (Switch sides at the foot), press Confirm on a practice request (the gold line filling "Yes, I'm sure"), and, as a customer, pick a start time and see how a time that no longer fits is shown (a quiet line with a gold dot above the times). *Recommendation:* yes, it adds about a minute to the five-minute look and covers every piece the merge restyled.

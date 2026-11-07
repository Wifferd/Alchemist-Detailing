# Doc 45: the live bug fixes (Nov 6–7, 2026)

## The owner's words

- Nov 6, about 18:37 UTC: "Double check if we have any requests". The Admin page's request list came back empty, whatever was in the database. It read each booking with its assigned team member's name, but the assignments table points at the team table twice (who does the job, and who assigned it), so the database couldn't tell which link to follow and answered with an error (PGRST201). The read now names the link. Fixed in **41ecdcd**, pushed at 18:43 UTC.
- About 18:45 UTC: "It's already live and public, fix all bugs immediately".

## What was done, in short

- **Three sweeps** looked for bugs at the same time (below). Many bugs were found by two of them.
- **Round 1** went to `main` as **931b7f7** on Nov 6, about 21:25 UTC. **Migration 007s** went to the live database at about the same time.
- **Round 2** went to `main` as **5a266a3** on Nov 7, about 00:20 UTC. **Migration 007 parts 3, 4 and 5** went to the live database right after it.
- **Migration 007 part 6** is on the test project only. It waits for the owner's decision.
- **Six questions** are open for the owner, each with a recommendation (end of this doc).

## The three sweeps

1. **The static sweep** compared every database call the site makes with the live database (reading only), plus the deploy settings. It confirmed 36 findings (none blocking) and refuted 4.
2. **The request sweep** sent real requests to the **test** project, signed in as four throwaway "Sweep" accounts: an admin, a manager, a detailer and a customer.
   - First it compared the live and test databases object by object: functions, columns, rules, triggers, the `office.requests` view and more. They match, apart from Migration 004 (test only) and one leftover test helper.
   - It confirmed 41 findings (1 blocking) and refuted 1.
   - Its fixes were made on a separate branch, started from 41ecdcd. By the time they were ready, `main` had round 1, so in round 2 they were moved onto `main` by hand.
3. **The browser sweep** ran in a second cloud session, in a real Chromium browser, against the test project only. Every run would have stopped at the first request to the live project; none went there. It found 3 bugs. Its report is `docs/e2e-report-2026-11-06.md`.

## What was wrong, and what changed

### Booking, and the Account and Reviews pages

Commits: round 1 **9bf91ea** and **b9b830c**, merged in **c6aefcc**; round 2 **497ceb3** and **34f5a1e**.

- **A service or place change kept a time that no longer fit.** After picking a time, a change of service (or mobile/shop) kept the old days, start times and chosen time. Send then failed with "That time was just taken", which wasn't true.
  - Now step 05 reloads when the job length or the place changes, and keeps the chosen time only if it still fits.
  - When it drops the time, it says "The service length or place changed: please pick a start time again."
- **After "That time was just taken", step 05 showed "Checking times…" forever.** Now the day stays, its times load again and the reason shows under them.
- **An edit, then a jump ahead with the step bar, lost the price.** Step 05 showed a script error and no times; the Summary showed no service or price. Now the page works the price out again first.
  - Step 05 with no service chosen says "Choose a service first."
  - The Summary shows the start time the re-check kept.
- **Notes with an emoji, "<3" or a word like "home.co" were refused, and the page jumped to step 04,** where the notes field isn't.
  - Now the page checks the database's own rule (102 of 102 test texts agree) and says what to change, on the right field.
  - The check covers notes, make, model, colour, description, damage note, address, saved vehicles and reviews.
- **Names the database accepts were refused:** the iPhone's curly apostrophe (D’Andre, O’Brien) and letters such as Nguyễn or Łukasz. Fixed. Names now leave the page in one standard form.
- **A dropped connection showed a JavaScript error.** Now: "Something went wrong. Please try again, or call (945) 361-7551."
- **The bookable days followed the visitor's own clock.** Now they follow Parker's date, and "Held until" names its time zone.
- **A lost reply, then a corrected phone number, made a second booking** for the same request. Now the database refuses the resend (Migration 007 part 4), and the Summary says: "This request was already sent. Call (945) 361-7551 to change the phone number."
- **Someone signed in to Admin who booked from #book was signed out of Admin,** and their login email showed as the customer's. Now only a phone confirmed on that page fills the form or is signed out after Send.
- **Saving a vehicle** with a year outside 1900–2100, or a make that looks like a web address, said "Something went wrong". Now it names the field.
- **Account:** "confirmed ✓" shows only for a confirmed phone.
- **Reviews:** the page no longer tells visitors to "Sign in to your account" while guest booking is on, because accounts are off.

### The Admin page

Commits: **41ecdcd**; round 1 **9bf91ea**, **e1f24d7** and **b7e2034**; round 2 **7d1b2c7**, **1cf8060**, **133855a**, **211aac5** and **5a266a3**.

- **The request list was empty** (above, 41ecdcd).
- **Confirmed bookings two or more days ahead couldn't be opened,** so they couldn't be cancelled, moved, assigned or priced. The request sweep called this blocking. Now a booking opens on its calendar week with its card and buttons, and Customers opens the next booking.
- **Change time offered only the customers' times:** never today, never the booking's own time, and not the times next to it. Now:
  - a "Keep" button for the current start;
  - an "Other start time" box, on the hour or half hour (the database takes only those);
  - the free times come from `staff_availability` (Migration 007 part 3), the staff rule the database checks on Save;
  - a new length asks for the times again, and Save waits for them.
- **Buttons the database always refuses were offered,** such as Assign on a request or Move lane on a confirmed booking. Each now shows only where it works.
- **The team's messages went nowhere.** "Ask the owner" and "Ask for this job" reached no screen. Morning now has a "From the team" section.
- **The page never reloaded.** New requests appeared only after a full page reload. Now there is a Refresh link, every visit reads the lists again, and a tab left open reads them again after a minute away.
- **Ask for info, Decline and Cancel suggested the customer was told.** Nothing is sent: texting isn't set up, and a guest has no account. Now each says "No text is sent from here. Call or text …", and the note field says the customer can read it if they booked with an account.
- **The Log read "update · appointments" for everything.** Now it is in words, with who did it.
- **Morning:**
  - Spam requests no longer count as jobs today or tomorrow, or under "Needs you".
  - The "in review" tile counts only requests waiting in the Review lane.
  - New sections: "Earlier, not finished" and "Waiting on the customer".
- **The Calendar showed Spam requests and lapsed holds as if they took the time.** Spam is hidden now, and a lapsed hold is dimmed.
- **Money boxes:** Set price read "1,200" as $1.00, and Extra cost read "12,50" as $1,250. Both now take only real amounts.
- **Managers:**
  - Settings no longer reads the owner's address, and shows "Shop address: Private: not shown here".
  - A manager who types #admin-team or #admin-log is told only the admin sees it.
- **Smaller fixes:**
  - review reasons in words;
  - the owner's email in place of a blank name;
  - Change role isn't offered on an admin, and asks first;
  - History starts with "Request received";
  - Close day warns about bookings left on that day;
  - typed text in "Note to customers" and "Google reviews link" no longer vanishes on a redraw;
  - the Assign list survives Refresh;
  - a stray word "null" is gone;
  - "Add a team member" says plainly that the new login can't sign in until texting works.

### The Team page

Commits: round 1 **9bf91ea** and **e1f24d7**; round 2 **8ba63c5**.

- **A detailer's jobs now come from `my_jobs`** (Migration 007s), with no prices and no customer contact details.
- **The owner or a manager saw every confirmed booking as "My jobs".** Now only their own.
- **A manager or the owner at the first sign-in step saw empty lists.** Now they are sent to the authenticator step.
- **Errors were hidden as "None right now".** They are shown now.
- **Open jobs** listed condition fees as services and didn't mark included lines. Fixed.
- **Customer photos stopped loading after 10 minutes.** Their links are now renewed after 8 minutes, and once when a picture fails to load.
- **"Done recently" showed the 10 oldest jobs.** Now the newest come first.

### Sign-in

Commits: round 1 **166a3b9** and **9bf91ea**, merged in **c6aefcc**; round 2 **497ceb3** and **8ba63c5**.

- **Text-code sign-in showed Supabase's raw "Unsupported phone provider",** because Twilio isn't connected yet (doc 36). Now: "Text codes aren't working yet. Please call (945) 361-7551." Too many code requests get a plain line too.
- **On #team and #admin, a code request can't make a new login** once texting works, and an unknown number reads "No team account uses that number."
- **Sign-out ends only this browser's session,** not every device's.

### The database and privacy

Commits: round 1 **9bf91ea** (Migration 007s and its tests); round 2 **e31016b** (Migration 007 parts 3 to 6 and their tests).

- **Doc 28 says detailers see no prices and no customer phone number or email.** Only the Team page's own column list kept those out. A detailer could read the phone, email and prices of their assigned jobs with a plain API call. Migration 007s closes this. Nobody could use the gap on live: it had no detailer accounts (none on Nov 7 either).
- **Change time and the guest resend** were fixed in the database too (parts 3 and 4, next section).
- **The owner's list in the SQL Editor** (`office.requests`) now says why a price is still to be set, keeps "(XL)" for a vehicle described in words, and shows the conditions in words (part 5).
- **Still open:** managers can read the owner's address through the API, and the review of an anonymized booking stays public. Both are the owner's decisions (end of this doc).

### Website setup

Commits: round 1 **9bf91ea**; round 2 **ba76805** and **eacba85**.

- **Practice bookings could land in the owner's real requests.** Every Vercel address other than the main test one, and every local copy, used the live database: previews, branch builds, each deployment's own link and the screenshot tools.
  - Round 1 sent every test-project address to the test database.
  - Round 2 made `config.js` an allowlist. Only thealchemistdetailing.com, www.thealchemistdetailing.com and alchemist-detailing.vercel.app use the live database; every other address uses the test one.
  - The screenshot tools now block Supabase, so they stay in preview mode.
- **The staff and account pages say "Test project"** when they use the test database. This matters because the live project's own deployment links now use the test database too.
- **A slow jsDelivr froze the whole site:** no menu, no pages, no booking. supabase-js 2.49.4 is now served by the site itself (`site/js/vendor/`), with the same pinned SRI hash.
- **The test site could be listed by search engines.** Now every address but the public domain carries "noindex": a tag in `index.html`, and the `X-Robots-Tag` header from `vercel.json`.
- **The early connection to Supabase** now has `crossorigin`, so the browser can reuse it.

## What changed in the live database

All four are non-destructive: none contains a delete, drop or truncate.

| Migration | What it does | On live |
|-----------|--------------|---------|
| **007s** (`20261106090001_m007s_detailer_jobs.sql`) | A new function, `my_jobs(p_from)`: a detailer's assigned jobs, without prices or customer contact details. The read rules on the bookings, their lines and their history are narrowed in place to managers and the admin ("Bookings: managers", "Booking lines: managers", "Booking history: managers"). | Nov 6, about 21:25 UTC (version `20261106212500`) |
| **007 part 3** (`20261106204729_m007_staff_availability.sql`) | A new function, `staff_availability(p_id, p_date, p_duration)`: the free starts for moving a booking, under the staff rule (today included, the booking itself not in the way, its own start kept). Managers and the admin only. | Nov 7 (version `20261107002002`) |
| **007 part 5** (`20261106204817_m007_office_requests_words.sql`) | Replaces the `office.requests` view with the same 17 columns, names, order and types. It only changes what the words say. | Nov 7 (version `20261107002022`) |
| **007 part 4** (`20261106204758_m007_guest_repeat_by_request.sql`) | Replaces `submit_guest_booking`. Only the repeat check changes: a request is found by its id alone. The same phone gets the first receipt as before; another phone is refused. | Nov 7 (version `20261107002053`) |

- **Already there before:** Migration 006 (doc 43, version `20261104204230`).
- **Applied after the new site was up** (5a266a3 was ready on the live project at 00:19 UTC; the parts went in from 00:20). Without part 3 the Admin page falls back to the customers' times, and only the new booking page shows part 4's refusal well.
- **The request sweep's own parts 1 and 2 were dropped.** They repeated 007s, and part 2 would have failed on live, where the rules were already renamed. On the test project, 007s is recorded as that sweep's two versions (`20261106202331` and `20261106202335`), with the same function.
- **Part 6** (`20261106204823_m007_reviews_follow_anonymize.sql`) is on the **test project only**. When a booking's personal details are removed, it hides that booking's review and names it "A customer". PROPOSED: the owner decides (question 4 below). Live had no reviews on Nov 7, so applying it would change no rows now.
- **Checked on Nov 7, reading only:** on live and test, `my_jobs`, `staff_availability`, `submit_guest_booking` and `office.requests` have byte-identical definitions (same md5). Live's three booking read rules are the managers-only ones, and live has no review trigger.

## How it was checked

- **The static sweep's re-check:**
  - the fix walk passed 17 of 17;
  - a second fix round (e1f24d7) followed;
  - a final risk scan of the changes found nothing risky.
- **The request sweep, on the test project:**
  - every bug was reproduced with real requests before and after its fix;
  - a **replay harness** ran the site in Chrome in live mode, with every request to Supabase answered by the test database's real answer to that exact request; requests to the live project were blocked, and none was made.
- **The browser sweep, on the test project:**
  - Round 1: 7 guest bookings and an out-of-area check, each receipt matching the database's reply, plus 68 page loads at 360, 390, 440 and 1280 px and 16 more in the light theme with reduced motion.
  - Round 2, on the merged code (c6aefcc): 7 more guest bookings, then the Admin page signed in as the Sweep admin and manager (password and authenticator). Every screen at 1280 and 390 px, and the actions on Sweep bookings: Confirm, Decline, Ask for info, Set price, Move lane, Assign, Change time, Start, Complete and Cancel.
- **Round 2's review:**
  - 21 fixes were moved onto `main` by hand; 11 of `main`'s own fixes were kept where both had one; 3 things were dropped.
  - Then an adversarial review with five lenses: booking, Admin, deploy, things that used to work, and the fixes themselves.
  - Its first round confirmed 11 of 12 findings and its second 2 of 2. All 13 were handled. One, the managers' access to the address, was fixed in the wording only: the database part is the owner's decision.
  - A third round found nothing.
- **One near miss, caught by the re-check:** a first version of the new text check used a regular-expression feature that iPhones on iOS 15 (Safari before 16.4) can't read, which would have stopped the whole site there. It was rewritten, and no site script uses that feature now.
- **The final gate passed:**
  - every site script parses;
  - the single-file preview builds;
  - the booking, admin, team and account preview walks finish at 390 × 844 and 1280 × 900;
  - the live-mode replay passed: booking, the slot refusal, the service change, the step-bar jump, the guest repeat, Admin as admin and as manager, Change time, and the Team page as a detailer.
- **Database tests on the test project:**
  - `db-tests/m007s_tests.sql`: 24 of 24. Before 007s, the same detailer read 4 bookings with 2 phone numbers, 2 emails, 4 totals and 4 line prices.
  - `db-tests/m007_tests.sql`: 37 of 37.
  - `db-tests/m005_tests_guest_booking.sql`, first block: 26 of 26, including the new refusal. Its `delete from tst.results` line was swapped for a label change in that run only, because the Supabase tool holds any delete for a confirmation; the file is unchanged.
- **The deploys:**
  - Both Vercel projects deployed 931b7f7 (Nov 6, 21:24 UTC) and 5a266a3 (Nov 7, 00:19 UTC), both READY.
  - On the live domain, `config.js` is the new allowlist.
  - The self-hosted `site/js/vendor/supabase-js-2.49.4.js` is served byte-identical to the repository and matches the pinned SRI hash.
  - The public domain sends no `X-Robots-Tag`; the test site sends `X-Robots-Tag: noindex, nofollow`.

## Still open for the owner

These questions were sent to the owner. No answer yet. Nothing below has been changed.

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | **Start and Complete work on any day.** In the browser check, a job booked for Fri Nov 13 was started and completed on Nov 6. A mis-tap could mark a future job done. Limit them to the job's own day? | **Yes: Start only on the job's own day, and Complete on that day or later (Parker time),** so a job finished late can still be closed the next day. Today `complete_booking` also takes a confirmed job that was never started. This is a database change (`start_booking` and `complete_booking`): test project first, then live with his OK. |
| 2 | **A manager sees "Set the price first" but has no Set price button.** Setting prices is the admin's (doc 28: only the owner sets a price). | **Keep prices with the owner, and change the manager's line to "The owner sets the price first".** A wording change on the page only. |
| 3 | **The "Other" condition shows a firm total** on the Summary and the receipt while the request waits in the Review lane, though the choice says "We price it". A customer may read it as final. | **Say the price is to be confirmed** for a booking with "Other", as the site already does for XL and WetGloss on a Van ("We confirm the price before your appointment"). A page change. |
| 4 | **Part 6: the review of a customer whose details are removed.** Hide it, or keep the words public as "A customer"? | **Hide it** (part 6 as written). Someone who asks to be removed most likely wants their words gone too. Live had no reviews on Nov 7, so nothing would change at once. |
| 5 | **May managers read the owner's home address?** The database allows it today (an old rule from Migration 001); the page now never asks for it and says it is private. Live had no manager accounts on Nov 7. | **No: the admin only** (house rule 6: the address is private). That is a migration on live, with his OK, before the first manager account is made. |
| 6 | **The wording on Ask for info, Decline and Cancel:** "No text is sent from here. Call or text … This only records it." The field below now says the customer can read the note if they booked with an account. | **Drop "This only records it."** and end with "The note is kept in the booking history." A page change. |

## Smaller notes (nothing planned)

- **A reused request id gets the first receipt, even if that booking was cancelled.** This matters only if an id were ever reused, and the site makes a new one every time.
- **The Log and History show times on the viewer's clock.** That is right for the owner in Texas.
- **Change time takes only starts on the hour or half hour,** because the database allows only those. Any start for staff (such as 1:15 PM) would be a database change. PROPOSED, only if he wants it.
- **Guests can't leave a review while accounts are off.** Another way, such as the Google reviews link once he has one, is his call. PROPOSED.

## To tidy on the test project later

The sweeps left these on the test project ("Alchemist Test") only:

- **the `http` extension**, used to send the sweep's requests from the database;
- **the `sweep` schema:** its helper functions (`call`, `login`, `login_aal2`, `totp`, `claims`, `enroll_totp`, `bk`, `try_details`) and 15 scratch tables (the `tok_*` token tables, `ids_*`, `rc3_*`, `re_notes`, `adminskeptic_lb`). It is closed to the API;
- **the four Sweep accounts** (admin, manager, detailer, customer); the admin and the manager have authenticator factors. Their sign-in details are not in the repository;
- **their practice bookings:** 49 with the first name Sweep on Nov 7 (14 requested, 1 waiting for information, 1 confirmed, 3 completed, 2 declined, 28 cancelled);
- **the fixture booking AD-FFBQ6BW7,** changed by the final gate: 90 minutes, with an extra cost of $1,200.

The request sweep also found an older leftover there, from before the sweeps: the helper `public.zz_m005_review_headers()` (only the service role can run it).

The Supabase tool holds any delete for a confirmation nobody here can answer. So do the tidy-up from the SQL Editor, or when someone can answer the prompt.

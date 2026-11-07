# Doc 46: the owner's answers to doc 45 (Nov 7, 2026)

## The owner's words

Nov 7, 2026 (UTC; the evening of Nov 6 in Parker), to the six questions at the end of doc 45: "Yes to all".

So each of doc 45's six recommendations is now decided and built:

| # | Decided | Where |
|---|---------|-------|
| 1 | **A job is started only on its own day, and completed on that day or later** (Parker's date). A job finished late can still be closed the next day. A confirmed job that was never started can still be completed. | Database (Migration 008 part 1) and the Admin page |
| 2 | **A manager sees "The owner sets the price first"** on a booking whose price is still to be set. The admin, who has Set price, keeps "Set the price first". | Admin page |
| 3 | **A booking with the "Other" condition says the price is to be confirmed:** "We confirm the price before your appointment", as for XL. The price lines stay, with a note: "Menu price so far: $X. You chose “Other” for the car's condition, so we confirm the final price before your appointment." | Booking page (step 04, the totals, step 05, the Summary, the receipt); the Appointments page while the request waits (Migration 008 part 3 returns the conditions) |
| 4 | **The review of a customer whose details are removed is hidden** and named "A customer". | Database (Migration 007 part 6) |
| 5 | **Nobody reads the owner's home address through the website's connection to the database**, managers included. | Database (Migration 008 parts 2 and 3) and the Admin page's Settings |
| 6 | **Ask for info, Decline and Cancel** now say "No text is sent from here. Call or text … The note is kept in the booking history." ("This only records it." is gone.) | Admin page |

## What changed on the Admin page

- **Start** shows only on the job's own day. On an earlier day, a short line says "Start opens on Sat, Nov 7." instead. **Complete** shows for a started job on its day or later.
- **One step beyond the question, worth knowing:** a confirmed job whose day has passed can't be started any more, so it now shows **Complete** with the line "Not started on its day (…): complete it if it was done, or change its time." Before, Complete appeared only for a started job.
- If the page and the database ever disagree (for example a phone with a wrong clock), the database refuses in plain words: "This job is on Sun, Nov 8. Start it on that day." or "This job is on Sun, Nov 8. It can be completed on that day or later." The year is added when it isn't this year.
- **Settings** asks the database "is an address on file?" (`shop_address_on_file()`, the admin only) and shows "On file", "Not set" or "Couldn't check right now". It never reads the address. A manager sees "Shop address: Private: not shown here", as before.

## What changed in the live database

All four went on after the new page was live (1f8b477, READY on both Vercel projects, and the live domain served the new `admin.js`). None deletes anything.

| Migration | What it does | Live version |
|-----------|--------------|--------------|
| **007 part 6** (`20261106204823_m007_reviews_follow_anonymize.sql`) | A trigger: when a booking's personal details are removed, its review is hidden and named "A customer". Live had 0 reviews and 0 anonymized bookings, so no row changed. | `20261107043010` |
| **008 part 1** (`20261107120001_m008_start_complete_on_the_day.sql`) | `start_booking` and `complete_booking` as before, plus the day rule. | `20261107043024` |
| **008 part 2** (`20261107120002_m008_address_admin_only.sql`) | The signed-in roles may read every settings column except `shop_address` (column grants instead of the whole table); visitors read none, as before. Adds `shop_address_on_file()` for the admin. It stops without changing anything if the settings columns aren't the 28 expected. | `20261107043038` |
| **008 part 3** (`20261107120003_m008_my_bookings.sql`) | `my_bookings` as before, with two changes: a manager's own "Come to us" booking never carries the owner's address (a reviewer found this way around part 2), and each booking carries its conditions. | `20261107043050` |

- **Checked on live after applying** (reading only): the five functions have exactly the same text as on the test project (same md5); `start_booking`, `complete_booking`, `my_bookings` and `shop_address_on_file` can be called by signed-in users only; the trigger is there; signed-in users can't select `shop_address` but can select the other columns; the admin can still update the settings (the calendar note, the Google reviews link).
- **For later migrations:** a new column on `business_settings` needs its own `grant select (column) on public.business_settings to authenticated` to be readable by staff, and part 2's column check would stop a re-run.
- **The owner's address** is still set from the SQL Editor only, and still reaches a customer on their own confirmed "Come to us" booking (`my_bookings`). A guest booking has no account, so the owner sends the address by hand.

## How it was checked

A workflow built it on the branch `owner-answers-46`, test project only, then reviewed it adversarially (database, page and end-to-end lenses), fixed what the reviewers confirmed and ran a final gate.

- **Database tests:** `db-tests/m008_tests.sql`, 40 of 40 on the test project:
  - the day rule both ways;
  - the column privileges for every role;
  - `shop_address_on_file` per role;
  - a manager's own booking without the address (a check that swapped the old `my_bookings` back in showed the leak, then the new one closed it);
  - the conditions in `my_bookings`.
- **Older suites:** three older suites started or completed bookings days ahead (`m001_tests_staff.sql`, `m001_tests_x_review.sql`, `m002_tests_reviews.sql`). Each now moves the booking to today first. On a local Postgres with every migration, the full m001–m003 chain gives the same result with and without Migration 008: 501 pass, and the same 30 older failures, which come from Migration 001-era expectations, not from this change.
- **Through the real API on the test project** (the Sweep accounts):
  - a manager's select of the address, or `select=*`, or a filter on it, is refused (403);
  - the Admin page's settings columns still load;
  - the admin's calendar-note update still works;
  - `shop_address_on_file` answers the admin and refuses everyone else.
- **Reviews:** three findings were confirmed and handled:
  - the manager's own booking (part 3);
  - the Appointments page couldn't see "Other" (part 3 returns the conditions);
  - the page had to go live before part 2 (it did).
- **The final gate passed:**
  - every site script parses;
  - no regular-expression lookbehind;
  - the preview builds;
  - the booking, admin, team and account walks at 390 × 844 and 1280 × 900;
  - a live-mode replay against the test database:
    - Start refused for a future job, in the database's words;
    - the manager's price line;
    - Settings for the admin and the manager;
    - a guest booking with "Other" through the receipt.
- **Practice bookings:** the test requests the checks made were cancelled (AD-XD2VJWD8, AD-MEFVNJVZ).

## To tidy on the test project (adds to doc 45's list)

- `sweep.tok_o6`: five Sweep access tokens from this run (expired at 04:10 UTC on Nov 7). The Supabase tool held the update that would have blanked them for a confirmation.

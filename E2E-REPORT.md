# Live end-to-end check, test project (Nov 6, 2026)

Branch `live-e2e-fixes`. Every run used the site served locally (`python3 -m http.server --directory site`) at
`/?project=test`, in Playwright Chromium. Each run checked that `ALCHEMIST_CONFIG.supabaseUrl` was
`wlmostaetntbpmfgyjst` and would have aborted on any request to the live project (`efpzprranvgujkblnwdj`). No
request went to live.

## Bugs found and fixed

### 1. Changing the service after picking a time kept a time that no longer fits (fixed, b9b830c)

- **Steps:** book a 1-hour Exterior Basic at "Come to us", pick a Wednesday at 3 PM (the last start before the
  4 PM closure), go to the Summary, press Edit on Service, switch to Interior Deluxe (3 hours in total), Continue.
- **What happened:** step 05 still showed the 1-hour start times with 3 PM chosen. The Summary said "Wednesday,
  November 11 at 3 PM · about 3 h". Send failed with "That time was just taken. Please choose another time."
  (`submit_guest_booking` 400 `slot_unavailable`), which isn't true: the job ran into the closed hours. The same
  happened when switching between mobile and shop, and when jumping straight to the Summary with the step bar.
- **Fix (`booking.js`):** step 05 remembers what its calendar and times were checked for (the job length and
  mobile or shop). When that changes it reloads the calendar and the chosen day's times. It keeps the chosen time
  only if it still fits. Send (or a jump to the Summary) sends the customer back to step 05 if the time wasn't
  checked again.
- **Proved in the browser:** 3 PM is now cleared and the times run 10 AM to 1 PM for the 3-hour job. A 10 AM pick
  stays chosen through the same change. A step-bar jump to the Summary, then Send, goes back to step 05 with
  "Choose one of the start times shown". A normal booking afterwards (Sweep Regress, AD-28RD86FN) went through.

### 2. Team sign-in showed "Unsupported phone provider" (fixed, 166a3b9)

- **Steps:** `#team`, type a phone number, press Send code.
- **What happened:** Supabase answered 400 `phone_provider_disabled`, because text codes aren't connected yet
  (doc 36), and the page showed its raw English: "Unsupported phone provider".
- **Fix (`data.js` `sendPhoneCode`):** for `phone_provider_disabled`, `otp_disabled` and `sms_send_failed` the
  page now says "Text codes aren't working yet. Please call (945) 361-7551." Other errors are shown as before.
- **Proved:** the same run now shows the new message.

## Guest bookings sent (test project)

All of these got a 200 answer and a receipt. In every one, the receipt's reference, day, time, place and price
matched the `submit_guest_booking` reply. The price on the receipt matched the last quote and the step 04
breakdown. All phones are `(555) 555-02xx`.

| Ref | Device | What | Checked |
| --- | --- | --- | --- |
| AD-JE4NSAN7 | phone, started from #home | Exterior Basic, sedan, mobile 75002, Sat 10 AM | $49.99 + mobile $1.25 = $51.24; no condition fees on exterior-only |
| AD-K84HDC5K | desktop | Interior Basic + Steam, truck, pet hair + spills, shop, Fri, last start | Fri times 10, 10:30, 5–6:30 PM (closed 12–5); $134.98; ends at 8 PM |
| AD-HYATVGBT | phone | Interior Deluxe, crossover, heavy stains + pet hair, mobile 75072, Mon, last start | Steam and pet hair "Included", heavy stains +$30, mobile $10.20; last start 2 PM (closes 4 PM) |
| AD-XD2X5CWT | desktop | Interior Basic, "Other" with the required note, shop, Tue, last start | Went to the Review lane (`review_reasons: condition`); 3 PM is the last start before 4 PM |
| AD-FXKBFJJY | phone | Full Detail Bundle + WetGloss on a **Van**, dirt/sand, mobile 75407, Sun | WetGloss "Price confirmed by us"; total held ("We confirm the price…"); dirt included |
| AD-TZALA6L9 | desktop | Exterior Deluxe + WetGloss, SUV **XL**, shop, Thu | WetGloss $54.99; total held for XL; last start 2 PM for 2 h |
| AD-28RD86FN | desktop | Signature Combo, spills, shop, Sat, last start (after fix 1) | $99.99 + $10 = $109.99 |

Also walked without sending:

- **Out of area:** ZIP 75201 is stopped at step 03 with "We come to you within about 10 miles of Parker, Texas.
  For other areas, call (945) 361-7551."
- **Exterior and interior chosen separately:** the bundle suggestion appeared, and Switch made it a Signature
  Combo. Also: a "not sure" vehicle, WetGloss (held) and Steam, mobile 75042. Prices and the bundle-saving note
  were right.

The calendars kept out existing jobs and the buffers as the database says. For example, a mobile job at 10–11 AM
on Saturday pushes the next start to 11:30 AM. The test project allows 2 shop jobs at once (`max_shop_jobs = 2`),
so two 3 PM shop jobs on Nov 10 are allowed there.

## Pages

`#home`, `#services`, its groups, `#gallery`, `#reviews`, `#tips`, `#faq`, `#about`, `#contact`, `#account`,
`#appointments`, `#book`, `#admin`, `#team` and `404.html` were loaded at 360, 390, 440 and 1280 px (68 loads),
and again in the light theme with reduced motion (16 loads). Nothing turned up: no console errors, no failed
requests, no broken images and no sideways scroll.

`#admin` shows the email and password form. A wrong password gets "That email and password don't match." `#team`
shows the phone form. `#account` and `#appointments` show the "accounts are coming soon" notes with the phone
number.

## Not done

- **Admin screens and actions:** no staff password or TOTP secret reached this session, so I couldn't sign in.
- **The test phone numbers in the brief:** `(555) 010-01xx` numbers can't be typed in. The site's
  `normalizePhone` (and the database) refuse an exchange starting with 0 or 1, and the 555-01xx fictional range.
  I used `(555) 555-02xx` instead.

## For the owner to decide (not changed)

- **"Other" condition:** the choice says "We price it", but the summary and the receipt show a firm total
  (for example $59.99) while the request waits in the Review lane. A customer may read that total as final.
- **"Held until" time zone:** this time is shown in the visitor's own time zone with no zone named. The start
  times are Parker time. A visitor in another time zone sees the two on different clocks.

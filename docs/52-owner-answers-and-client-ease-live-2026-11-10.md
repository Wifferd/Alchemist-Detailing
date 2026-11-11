# Doc 52: the owner's Nov 10 answers, and the client-ease changes live (Nov 10–11, 2026)

## What the owner asked and answered

On Nov 10, 2026 the owner asked for three things.

1. "Remove the back button from the normal home screen, only should appear when you need to go back from clicking something, also add some convenience. Make changes to make the website easier to clients, tell me what your thinking then ill select which ones to push onto the live website."
2. Business cards for the Avery 5882 sheets they bought (photos of the box): "Make the design with research on how to make the design, for my bussniess cards with this paper card stuff".
3. After the session listed 10 conveniences and 7 questions, each with a recommendation, the owner answered: "go with your recommendations \n\n5, they can save it.\n6, just leave it empty until we get a customer".

The session read that last answer as follows:

- **All 10 conveniences go live,** together with the Back fix and a fix for a double-tap bug found while building them.
- **Questions 1 to 4 and 7: yes**, as recommended.
- **Question 5:** answered with "they can save it": confirmation calls and texts come from (945) 361-7551, so a "Save our number" button is wanted.
- **Question 6** (hide Appointments from the menu until accounts open): "just leave it empty until we get a customer" was read as *no change*. Appointments stays in the menu and keeps its "coming soon" screen. If the owner meant something else, it is a small change.

The questions and the answers taken from them:

| # | Question (session's recommendation) | Answer |
| --- | --- | --- |
| 1 | On phones, a slim bar at the bottom of Home with Call and Book Now, hidden over the top section, the foam wash and the footer? (Yes, Home and phones only.) | Yes |
| 2 | Keep Contact's "Your ZIP" check? Is the ZIP list right, including 75072, 75407 and 75042? (Yes to both; then "Check your ZIP →" links on Home, the footer, the FAQ and Services.) | Yes to both. **This confirms the ZIP list**, the "confirm once" item from docs 23/24, and answers doc 39 question 21 (keep the ZIP box). |
| 3 | "Add to calendar" on the receipt, the entry marked "requested, not confirmed"? (Yes, if it opens Calendar on the owner's iPhone.) | Yes |
| 4 | Show the owner's Admin note to customers (`business_settings.customer_notice`) on Contact's hours too? (Yes.) | Yes |
| 5 | Do confirmation calls and texts come from (945) 361-7551? If so, a "Save our number" button. | "they can save it": yes |
| 6 | Hide Appointments from the menu until accounts open? (Yes.) | "just leave it empty until we get a customer": Appointments stays. Answers doc 39 question 23. |
| 7 | Reword Home's "How booking works" to match the form's order? (Yes.) | Yes. The four steps change; the title "Four steps to a booked detail" stays, so doc 39 question 6(b) (the title) is still open. |

## The first push: the Back fix and the 10 conveniences (live Nov 10, about 17:35 UTC)

`main` was fast-forwarded from `e1abf82` to `ef00a6c`. No merge commit was needed, because `main` had not moved since doc 51. There was no database change and no Vercel settings change: `config.js`, `vercel.json` and `supabase/` are unchanged.

| Commit | What it does |
| --- | --- |
| `5b97d06` | Back never shows on the home screen, however Home is reached. It still shows on every other page (doc 40's rules otherwise unchanged). |
| `9914df2` | Phones (a touch screen up to 720 px wide, or up to 500 px tall when held sideways): the top bar's person icon, which only said "accounts coming soon", becomes a one-tap Call button (`tel:+19453617551`). Computers and tablets keep the person icon. |
| `9429648` | Home: Book Now and "Services & prices" show straight away on a first visit, not after the logo intro. The intro's order and timing are otherwise unchanged. |
| `3c5c23f` | First-timer words. "Explore Services" becomes "Services & prices". Home's Why Alchemist and Services repeat the FAQ's approved sentences on how to pay and on what a mobile job needs (an outdoor faucet and an outlet). Home gets a "More in the FAQ →" link. |
| `d982505` | Booking form labels go from 11 px to 13 px (11 px stays below 360 px wide). Staff screens keep 11 px. |
| `c75386b` | Booking step 01 reads the guest's phone number back ("We'll call or text (972) 555-2011 to confirm") and says plainly when a number can't be real or has too few digits. |
| `8dab15e` | The receipt's "Good to know": to change or cancel, call (945) 361-7551 with the reference; the ways to pay (card, Apple Pay or tap to pay, cash, or Zelle: the FAQ's words); for a mobile job, the faucet and outlet note. |
| `75206a6` | The "Thank you" receipt survives a reload in the same tab (sessionStorage `ad.receipt`: only what the receipt shows and who booked; never the booking's id, history, team or the shop's address). |
| `da342bb` | A half-filled booking survives a reload in the same tab (sessionStorage `ad.book`). Name, car, place and services come back; the day and time are checked again. Send, Cancel and a fresh request forget it. Answers doc 39 question 25. |
| `64044a3` | The double-tap bug: a quick second tap on Continue could land on Send Request before the Summary had shown. Send now ignores taps for 500 ms after the Summary appears. |
| `f2558d3` | After Edit on the Summary, the gold button reads "Summary" and goes straight back to it, instead of Continue through every step. |
| `8a20773` | "What's the inside of the car like?" moves from step 02 to step 04 and shows only with an interior service or a bundle. It is still required there, and the fees are unchanged (doc 24). Exterior-only bookings send `conditions: []`. Answers doc 39 question 24. |
| `911c3d4`, `a502c3f`, `ef00a6c` | Integration, lead and review fixes from putting the eleven together. A fresh step 01 keeps Cancel, but step 01 opened by Edit has only "Summary". The receipt kept for a reload also keeps the names, so "Book another detail" works the same after a reload. "Summary" re-checks its step after waiting and ignores repeat taps. A reload or Back/Forward on a booking opened from a Services link (`#book-wg` etc.) no longer re-adds that service over the kept answers. |

What the booking sends to the database is byte-identical to before for the same answers. The one exception is the inside-of-the-car question: exterior-only bookings no longer send an answer to it, which the database never charged for. This was checked in four cases (exterior only; interior with pet hair; a bundle with Other and a note; Full Detail mobile with spills, dirt and heavy stains), in guest and text-code mode, with and without a reload at every step.

### How it was checked

- Each change was built alone on `5b97d06` and then checked by an independent reviewer. A change that failed was fixed and checked again, for up to 3 rounds.
- The eleven were then put together on the `client-ease` branch, and two more reviewers checked the whole: one for the booking flow, one for the rest of the site.
  - The first round found one blocking bug, the Services-link token taken again on a reload. It was fixed in `ef00a6c`.
  - The second round passed both reviewers.
- Last runs:
  - `tools/qa/check_site.sh` (no wash): 94 ok, 0 FAIL.
  - `wash.py site ios fling`: unchanged against the baseline.
  - Back walks: all pass.
  - The draft and receipt walks at 8 size and theme combinations: all pass.
  - The receipt prints on one page on Letter and A4.

### Deployments

- Live: `dpl_4RMKiEeFKFRK6jRmhHwdfNci2wNz` (thealchemistdetailing.com). Test: `dpl_DDrKShd44yZY8zfj4j9uWAfDuxPw` (alchemist-detailing-test.vercel.app). Both came from the GitHub hook, at `ef00a6c`.
- The domain serves `js/app.js` byte-identical to `ef00a6c`.
- **To put the Nov 8 site back:** promote `dpl_CN3TjzUFbkKSidzzhNQotV2WfKCS` (live) and `dpl_4T32gN5ghE5QV3p6BwgNqotFhsUy` (test) with Vercel's rollback. Or revert `main` to `e1abf82`'s tree with a new commit. Neither needs a database change.

### Small things left as they are (reviewers' minors)

- Cancel on a step 01 reached by Previous or the step bar starts a fresh request. That is the keep-draft rule ("cleared on Send or Cancel"). Step 01 opened by Edit has no Cancel.
- After a reload on an Edit step, the button reads Continue, not "Summary". The step bar still reaches the Summary.
- A reload while "Sending…" shows the Summary again. A second Send inside the repeat window is caught by the database (m007 step 6). After that window it would make a second request.
- The 404 page says "Services and prices"; Home says "Services & prices".
- At 320 px wide, a long page name in the top bar ends in "…" when Back shows. It did the same before.
- On phones, the top bar's Call button also shows on `#admin` and `#team`.

## The business cards (Avery 5882)

- The Nov 8 card design was laid out on the Avery 5882 sheet: 10 cards, 3½″ × 2″, 2 columns of 5, ¾″ side and ½″ top margins, no gaps. That is template 8371, as listed by gLabels and LibreOffice.
- The right-hand column is printed upside down, so the white halves meet in the middle and a home printer's small shift can't leave black lines on white edges.
- All 20 QR codes scan to the booking page, even when shifted 3/32″.
- The owner got:
  - a print file;
  - a plain-paper test file with the cut lines;
  - a picture of both pages;
  - the printing steps: 100% / Actual size, Letter, heavy paper, fronts then backs. It is laser paper, so if they have no laser printer, a copy shop.
- The files were sent again on request the same day.
- The owner then counted "4, 4 and 2" logos on 3 pages. They had opened the PDF in Word, which converts a PDF into a Word document and rebuilds its layout. The PDF itself is 2 pages of 10.
  - The session sent a picture with the 10 cards numbered.
  - It asked the owner to open and print the PDF from Edge, Chrome, Acrobat Reader or Preview, at "Actual size" / 100%, never from Word.
- The files are not in the repository.
- The card tagline question from Nov 8 is still open (the recommendation is no tagline).

## The second push: the answers to questions 1 to 5 and 7 (live Nov 11, about 01:33 UTC)

`main` was fast-forwarded from `ef00a6c` to `dcaa217`. There was no database change and no Vercel settings change; `vercel.json` gained one header rule.

| Commit | What it does |
| --- | --- |
| `1ff832c` | **Question 1, Home's foot bar on phones.** Call (glass, `tel:+19453617551`) and a gold Book Now sit at the bottom of the screen, using the same phone query as the top bar's Call. The bar (`#dock` at the end of `<main>`, `app.js` `dock`) shows only while the visitor reads Home between the wash and the closing band. One IntersectionObserver watches the hero, the Standard section, the wash, the closing band's own buttons and the footer: with any of them on screen the bar steps aside. The closing band takes over once its own Book Now rises above the bar. It also goes while the menu is open and from the tap that leaves Home (Book Now's veil). Computers, tablets and other pages never get it. It is fixed and moves by transform, so the page never moves; `foam.js` is untouched and the wash runs as before. When hidden it is `inert`. |
| `1ff832c` | **Question 7, "How booking works" in the form's order.** 01 Tell us about you ("Your name, a phone number we can reach, and the car."); 02 Choose where (the existing sentence plus "Check your ZIP →"); 03 Pick your service and time ("See the price as you go, then choose an open start time, from tomorrow up to 60 days ahead."); 04 We confirm (unchanged). The title "Four steps to a booked detail" is unchanged. |
| `006ef8e` | **Question 2, "Check your ZIP" links.** New sub-route `#contact-zip`: Contact, with the ZIP box just under the top bar and its input focused. The links sit in How step 02, the footer's Where column, the FAQ's "Where do you work?" answer (after the approved words, which are unchanged) and Services' Mobile service note. Back from `#contact-zip` returns where the tap was. |
| `006ef8e` | **Question 4, the owner's note on Contact.** The Admin note to customers (`business_settings.customer_notice`, read through `get_public_settings`) shows above Contact's hours as "A note from Alchemist", in the booking calendar's look. It is text only (the team types it); with no note, or no settings, nothing shows. Admin's heading and hint now say "shown on the booking calendar and on Contact". |
| `dcaa217` | **Question 5, Save our number.** `site/alchemist-detailing.vcf` (vCard 3.0, CRLF, kept by `.gitattributes`). It holds the company name, the work number +1-945-361-7551, the website and Instagram; no address, email or hours. The domain serves it as `text/vcard; charset=utf-8` (`vercel.json`; Vercel adds `Content-Disposition: inline`). Links: in the receipt's Good to know ("Save our number, so you know it's us when we call.") and under Contact's Call button. |
| `dcaa217` | **Question 3, Add to calendar.** A glass button on the receipt saves `alchemist-<reference>.ics`, built from the receipt alone (`booking.js` `calendarFile`):<ul><li>"Alchemist Detailing (requested, not confirmed)", STATUS:TENTATIVE, no reminder;</li><li>the requested start on Parker's clock and its length, written in UTC (`startsAt` now looks twice, so the days the clocks change are right too);</li><li>the reference, the services and "Requested, not confirmed yet. We'll call to confirm. To change or cancel, call (945) 361-7551.";</li><li>where: the customer's own typed address for a mobile job, only "Parker, Texas" for come-to-us.</li></ul>iPhone/iPad Safari before 26.5 gets a `data:` link. Newer Safari and every other browser get a calendar-typed Blob link, because Safari 26.5/26.6 refuses `data:` links. The kept receipt (`ad.receipt`) now also holds the request's `created_at`, so a reloaded receipt makes the same file; if anything is missing, the button is hidden. Neither new control prints, and the receipt still prints on one page. |

### What the session decided along the way

- **The iPhone keyboard on `#contact-zip`.** The first spec asked that landing on the ZIP box open the phone's keyboard. Safari on the iPhone opens a keyboard only for a focus made inside the tap itself, never after a page change.
  - A hidden stand-in field was built to get round that, but it can't be proven without a real iPhone, and it touched the iOS scroll area where the doc 35 jump lived. One reviewer also found a Back regression it caused in Android in-app browsers.
  - The session dropped it. The box arrives focused, and one tap on it opens the number keypad.
- **The foot bar** stays hidden over the service cards, which sit inside the wash. It shows between the wash and the closing band.
- **On a phone, Call can show twice** (the top bar's icon and the foot bar) when the top bar comes back on a scroll up. The owner asked for both.

### How it was checked

- **Research first.** Two web researchers checked how iPhones handle calendar and contact files.
  - Calendar: no way that needs no server is proven to open the iPhone Calendar sheet as of Nov 2026. `data:` links worked on iOS 15 to 18 and early 26 and are blocked from 26.5/26.6. A calendar-typed Blob is the method two maintained libraries switched to in Sept/Oct 2026, mostly on simulator evidence. A served `.ics` URL (a server function) is the one proven way.
  - Contacts: `text/vcard`, vCard 3.0, labelled URLs, no X-SOCIALPROFILE.
- **Each change was built alone on `ef00a6c`, then checked by an independent reviewer.**
  - Home bar: passed round 1.
  - Receipt: passed round 1.
  - ZIP and note: passed in round 4, after the stand-in was removed.
- **Put together on `client-ease` with no conflicts**, apart from two CSS spots where both rules were kept.
- **Checked as a whole by two reviewers**, one for the booking, receipt and Contact, one for Home and the rest of the site. Both passed in round 1.
  - The payload is identical to `ef00a6c`'s.
  - The .ics files parse strictly, with the right times on both sides of a DST change and no owner address.
  - `check_site.sh` passes, and `wash.py` is unchanged against the baseline.
  - No sideways scroll and no console errors.
- **After the push:**
  - The domain and the test site serve `/alchemist-detailing.vcf` with `text/vcard; charset=utf-8`.
  - The domain's `js/booking.js` is byte-identical to `dcaa217`.

### Deployments

- Live: `dpl_A4UtQxVoEbHoZCsqD7RuvDuzvtxQ`. Test: `dpl_J5nDSPWCRC2KXJmWKctccVpVXm45`. Both came from the GitHub hook, at `dcaa217`.
- **To put the first push's site back:** promote `dpl_4RMKiEeFKFRK6jRmhHwdfNci2wNz` (live) and `dpl_DDrKShd44yZY8zfj4j9uWAfDuxPw` (test). Or revert `main` to `ef00a6c`'s tree with a new commit.

### What only the owner's iPhone can show (asked of the owner)

1. **Add to calendar:** make a practice booking on the test site, then tap Add to calendar in Safari. Does the Calendar "Add" sheet open, or does the file land in Files › Downloads?
   - If it lands in Files, a small server function that serves the file (a Vercel Function, no database) is the proven way. It would be the site's first server code, so it is the owner's call.
   - In Chrome for iPhone the file goes to Downloads. In the Instagram and Facebook in-app browsers it probably does nothing; the receipt still shows the number and the reference.
2. **Save our number:** does iOS open "Create New Contact" with the company name, the number, the website and Instagram?
3. **The foot bar:** check it on Home in both themes, and that it never covers anything.

## Still open

- Doc 39 questions:
  - 6(a) and 6(c);
  - 6(b), the title "Four steps to a booked detail" (only the steps changed);
  - 7 to 20;
  - 22: does the number take texts from customers? The site still never says it does;
  - 26 to 33.
- PROPOSED, not built:
  - a one-line hint under Save our number ("On iPhone: scroll down and tap Create New Contact");
  - a secondary Google Calendar link;
  - an "Open in Safari" hint in in-app browsers.
- The owner's rinse clip, owed assets (interior photo, before/after pairs, videos, About story, Google reviews link) and Twilio.

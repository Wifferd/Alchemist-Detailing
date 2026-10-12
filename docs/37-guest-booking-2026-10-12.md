# 37. Guest booking until Twilio (Oct 12, 2026)

On Oct 12 the owner asked: "For now can you keep the guest only until i get the twillio?"

Text codes (doc 36) need a Twilio account, and the owner gets one after the next wash. Until then nobody could confirm a phone, so nobody could book. Now a visitor books as a **guest**: the name and phone as typed, no code. The owner calls or texts that number to confirm.

## What a visitor sees

- **Step 01 (Contact):** first name, last name (optional) and mobile phone, with "We'll call or text this number to confirm your booking." There is no "Send code" and no email.
- **Steps 02 to 06** are as before, except photos: a guest reads "Photos: you can text them to us after you book." Photos upload to an account's own folder, and a guest has no account.
- **The receipt:** reference, day and time, place, price, "Held until" (24 hours), and "we review your request and contact you at (phone) to confirm."
- **The Account page** says online accounts are coming soon, with the phone number for changes and a "Book a detail" button.
- Someone already signed in with a confirmed phone (none yet on live) books as before.

## The database (Migration 005, four parts, tests in `db-tests/m005_tests_guest_booking.sql`)

1. **`business_settings.guest_booking`**: on. The site reads it from `get_public_settings`.
2. **`submit_guest_booking(p)`**: the same rules as an account booking:
   - shared vehicle, price and time checks, re-checked under the day lock;
   - the hidden spam field;
   - repeats: the same request, or the same booking within 10 minutes, returns the first one.

   A guest can't use a saved vehicle or attach photos.

   Limits:
   - The per-customer limits count per phone number: 3 waiting requests, 5 a day.
   - All guest bookings together: 12 an hour and 25 waiting at once, so made-up numbers can't fill the calendar.
     - A request the owner declines or cancels frees its place in the hour.
     - The Spam lane has its own 12, so the bots the hidden field catches can't close booking.
   - One guest booking is handled at a time (lock 7305), so these counts stay exact when requests arrive together.
3. **`office.requests`**: every booking, newest first, in plain words. It is in the `office` schema, which the website's API can't reach. Only the Supabase dashboard can read it.
4. **`office.confirm`, `office.decline`, `office.cancel`, `office.set_extra_cost`**: the owner's answers, by reference. They do what the Admin page's buttons do, with the same checks, and reply in words. Only the dashboard can call them.

**Tests:** 45 checks, all passed on the test project:
- a visitor books;
- repeats and limits;
- bad phones and names are refused;
- a visitor can't read the list or use the answers;
- confirm, the extra cost before confirming an XL, decline and cancel;
- the hourly cap, the Spam lane's own cap, and a declined request freeing its place;
- the history records each change;
- with the setting off, a guest is asked for the code.

## How the owner answers requests (until the Admin page works)

The Admin page needs a text code to sign in, so for now:

1. Open **supabase.com → your project "Alchemist Detailing" → SQL Editor → New query**.
2. **See the requests:** type `select * from office.requests;` and press Run. Each row shows the reference, when it came in, the status, the day and time, the name, the phone, the vehicle, the services, the total, the condition, the damage and the notes. (The same list is in Table Editor: pick the schema **office** in the schema menu, then **requests**.)
3. **Call or text the customer** at the phone shown. The phone was typed by the visitor, not confirmed.
4. **Answer by reference** (one line, then Run):
   - Confirm: `select office.confirm('AD-XXXXXXXX');`
   - Decline: `select office.decline('AD-XXXXXXXX');`
   - Cancel a confirmed one: `select office.cancel('AD-XXXXXXXX');`
   - An XL or "Not sure" vehicle shows "Price to set". Set the extra cost in dollars first, then confirm: `select office.set_extra_cost('AD-XXXXXXXX', 25, 'Large SUV');`

**Answer within 24 hours.** A request holds its time for 24 hours (`hold_hours`). After that the time is open to others again. You can still confirm it later if the time is still free.

**Nothing alerts you to a new request** yet: there is no email or text sender. Check the list once or twice a day, or ask Claude Code about a scheduled check.

## The review (Oct 12)

An independent review checked the database as a visitor and as a signed-in customer, and walked the site in a browser. It found 9 real problems, all fixed before going live:
1. The hidden spam field was never sent: the form read it on step 06, but it exists only on step 01. It is now kept with the contact details.
2. Spam, declined and cancelled requests counted toward the 12 an hour, so the spam trap's own catches could close booking. Now only requests still in play count, and Spam has its own 12.
3. Requests arriving at the same moment could pass the caps together. Now one guest booking is handled at a time.
4. The test file read appointments as a visitor, which a visitor can't do.
5. A page left open when guest booking is turned off kept asking for a confirmation it couldn't send. It now switches to the text-code step.
6. A "please call" refusal showed for 3 seconds only. It now stays under the summary.
7. Photos chosen while signed in stayed hidden in a guest booking, which the server then refused.
8. The form accepted numbers the database refuses. Both now use the same rule.
9. Coming back to Book before the settings arrived showed the text-code step for a moment. It now shows "Loading the booking…".

Also changed: a stranger who types someone else's number no longer learns how many requests it has waiting.

What remains, and why it is acceptable for a few weeks:
- Anyone can book with any name and number. The owner calls or texts to confirm, so a fake request costs a phone call.
- A script with made-up numbers could hold up to 25 times for 24 hours, or fill the 12 an hour. If that happens, decline the junk in the list (it frees the places), or turn guest booking off for a while with the line below.

A leftover from the review sits on the **test** project only: `public.zz_m005_review_headers()`. It does nothing, nobody but the dashboard can run it, and dropping it waits on a confirmation the Supabase tool can't show here. Drop it from the test project's SQL Editor when convenient: `drop function public.zz_m005_review_headers();`

## Applied

- **Test project:** Oct 12. All 45 checks passed, and the page walks passed: a guest booking on desktop, phone and light theme; the text-code flow with `?guest=0`; the Account, Admin and Team pages; the broken-page check. The reviewer's own front-end checks also passed.
- **Live project:** Oct 12, the same four parts, after the test project. The functions, the list and the permissions match the test project exactly. A trial booking as a visitor was saved, shown in the list, refused to the visitor's own reads, and confirmed with `office.confirm`. It was then undone, so the live database still has no bookings. The Supabase security check lists only the expected note that visitors can call `submit_guest_booking`.

## Turning it off once Twilio works

After the Twilio steps in doc 36 work on the test site, run this in the live project's SQL Editor:

```sql
update public.business_settings set guest_booking = false where id = 1;
```

The site then asks for the text code again. Accounts, saved vehicles, photos and the Admin page work as designed. Guest bookings already made stay in the list and in Admin. Admin shows them like any other request, with the typed name and phone.

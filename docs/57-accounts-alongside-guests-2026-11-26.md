# 57. Accounts alongside guest booking (Nov 26, 2026)

## The owner's words

Asked whether customers should keep booking as guests or move to accounts now that text codes work, the owner chose
**"Both, build it"** (Nov 26). Text codes (Twilio Verify) work on live: he signed in to Admin with one today.

So:

- **Guests still book** with a name and a phone and no code. `business_settings.guest_booking` stays on.
- **Anyone who wants an account can make one** with a text code. There is no password.

Branch `accounts-both`, from main `9ca6955`. **Not live.** Nothing changes on the website or the database until he
says "push".

## What changed on the website

### The Account page (`#account`)

The Account page now shows the real sign-in instead of "Online accounts are coming soon":

- "Sign in or create an account with your mobile number. We text you a 6-digit code; no password. New here? The first
  code makes your account."
- First name (optional, "Only needed the first time"), then the mobile phone with **Send code**.
- "No account needed to book: you can also book as a guest."
- "Need help? Call (945) 361-7551."

A customer who signs in sees the account pages as they were already built: Welcome back, Upcoming appointment, Your
vehicles, History and Profile.

**Send code** now waits for its answer ("Sending…"), so a double tap can't send two texts. Each text costs a little.

### Appointments (`#appointments`)

A signed-in customer sees their bookings, as before.

A signed-out visitor sees a calm prompt instead of "coming soon":

- "Sign in to see your upcoming and past details. Booked as a guest? Those bookings aren't in an account: call us to
  check one."
- The same sign-in box, which ends with our phone number.

### Booking, step 03 (Contact)

A signed-out visitor now sees **"How would you like to book?"** with two cards:

- **Book as a guest**, chosen by default: "No code and no account. We call or text you to confirm." This works
  exactly as before: name and phone as typed, no saved vehicles, no photos.
- **Sign in or create an account**: "We text you a 6-digit code. See your bookings online, save your vehicle and add
  photos." This shows **Send code** and the code box. Once the phone is confirmed, that booking goes the account
  way, with the confirmed phone, saved vehicles and photos on step 04.

Details of how the choice behaves:

- A name and phone already typed stay put when the visitor switches between the cards.
- Switching back to the guest card drops any code asked for, and any saved vehicle or photos.
- Pressing Continue on the account card without a code says: "Press 'Send code' and confirm your phone to continue.
  Or choose 'Book as a guest' above: no code needed."
- A customer who is already signed in doesn't see the choice. Step 03 says "Signed in as …" with "Not you?", as
  before.
- Once a phone is confirmed on step 03, the price and the held time are checked again. A First Timer Deal follows
  the account's own history, so the price can change at that point.
- Someone who chose the account card **stays signed in** after Send. The receipt adds: "It's in your account: see it
  any time under Appointments." **This needs the owner's yes before "push"** (open point 2): it changes an earlier
  choice (doc 05, audit flow step 7: a phone confirmed on the booking is signed out after Send, for shared devices).
- The photo picker on step 04 shows only once the phone is confirmed. Someone who picks the account card and jumps to
  step 04 from the step bar before the code sees "Photos are optional. To add some, confirm your phone on step 03
  first." (Guests still see "Photos are optional and not needed to book.")
- A code asked for only because guest booking is off (the old forced path) still signs out after Send, as before.
- The choice is kept for a reload, along with the rest of the draft.

These all still work as before:

- the hidden spam field;
- the rate-limit messages;
- the draft kept for a reload;
- Back;
- the re-fit;
- receipts;
- reduced motion;
- light mode;
- the phone layout;
- keyboard use (the two cards are one radio group: arrow keys move, Space chooses).

### When Supabase's "Allow new users to sign up" is off

Today it is off on live. Only numbers that already have an account get a code. A new number gets this message, never
Supabase's own error text:

- **On the booking:** "New accounts can't be made online yet. Choose 'Book as a guest' above to book without one, or
  call (945) 361-7551."
- **On the Account page:** "New accounts can't be made online yet. You can book without one, or call (945) 361-7551."
- When a guest can't book online (guest booking off, or online booking switched off), both say instead: "New accounts
  can't be made online yet. Please call (945) 361-7551." The Account page's "you can also book as a guest" line hides
  then too.

Supabase answers a new number with the error `signup_disabled` ("Signups not allowed for this instance"); the site
maps that (and `otp_disabled`, and any "signups not allowed" text) to the message above, for customers only. Team
sign-ins keep "No team account uses that number." The preview can only fake this (`?signups=0`), so go-live step 5
checks it once on the real site.

**While sign-ups are off,** #account sends a real code only to a number that already has an account (today only the
owner's). So someone trying numbers could tell which one is his, and text it once a minute. This ends when sign-ups go
on; the team sign-in form already behaves the same way.

### The switch

`config.js` `textCodes` is now `true`. That switch now does two jobs:

- It opens accounts on the site (`data.js` `accountsOpen`).
- It makes the Admin page's "Add a team member" say that team members sign in with a text code.

Set it back to `false` to show "Online accounts are coming soon" again. The booking then offers only the guest way.

### The other switches

- **Booking closed** (`config.js` `bookingClosed`): still wins. The booking page shows its note and the phone number,
  whatever else is on.
- **Guest booking turned off** (`guest_booking = false`): there is no choice. Everyone confirms a phone, as before.

### Reviews

The Reviews page shows "Had a detail with us? Sign in to your account…" again whenever accounts are open.

### Preview switches (screenshots only)

- `?signups=0` shows the sign-ups-closed message.
- `?noexamples` shows a brand-new account with no example history.
- In the preview, a guest's request no longer appears under a later sign-in's Appointments. That matches the real
  site.

Files: `site/js/booking.js`, `account.js`, `data.js`, `reviews.js`, `config.js`. No CSS change: the cards are the
booking's own choice cards. No database change.

## The database needs no change (checked read-only on live, Nov 26)

| What | Evidence |
|---|---|
| Nothing refuses accounts while `guest_booking` is on | Only `get_public_settings` and `submit_guest_booking` read `guest_booking`; `submit_booking`, `my_bookings`, `update_my_profile`, `delete_my_vehicle`, `save_booking`, `quote_booking`, `my_first_visit_offer` and `submit_review` don't mention it. |
| `submit_booking` | Needs a signed-in user with a confirmed, valid phone (`phone_not_verified` otherwise) and an active profile. Granted to `authenticated` only. |
| A new account's profile | `on_auth_user_created` → `handle_new_user` makes the `profiles` row (role defaults to `customer`, active) with the first name from the sign-up. `on_auth_user_contact_changed` → `handle_auth_contact_change` fills `profiles.phone` once the code confirms it. |
| `my_bookings` | Rows where `customer_id = auth.uid()`; `assert_signed_in` needs an active profile. |
| `update_my_profile` | `assert_signed_in`, then the caller's own row. |
| Vehicles | RLS read own / add own / edit own (`owner_id = auth.uid()` and an active profile). Column grants: insert/update only make, model, year, color, type, size, modifications. `owner_id` defaults to `auth.uid()`, and `check_vehicle` refuses an owner change and more than 25 vehicles. |
| Photos | Bucket `vehicle-photos` is private, 8 MB, jpeg/png/webp. Upload needs an active `customer` profile with a confirmed phone, the caller's own folder and fewer than 60 files. View is the owner's own folder or staff. Delete goes through `can_delete_vehicle_photo`. |
| First Timer Deals | `save_booking` decides by phone (`first_visit_eligible(contact_phone, address key, customer_id)`) under a per-phone lock. A guest who later makes an account with the same phone can't get a second deal that way. |
| Customers on live today | One profile, the owner's (admin). No customer accounts yet. |

**A guest's earlier bookings don't show in a new account.** `submit_guest_booking` saves them with
`customer_id = null`, and `my_bookings` reads only the caller's `customer_id`. That is why Appointments tells a
signed-out visitor that guest bookings aren't in an account.

## Go-live steps, in order (only after the owner says "push")

0. **The owner answers open point 2** (stay signed in after a booking made with an account): yes keeps the branch as
   it is; no is a one-line change in `booking.js` `confirmPhone` (`signedInHere = true`), which signs out after Send
   as before and drops the receipt's Appointments line.
1. **Twilio Verify (Twilio Console):**
   - **Fraud Guard on** for the Verify service: Verify → Services → the service → Fraud Guard. Twilio says it has been
     on by default for Verify customers since 2023; check it.
   - **Geo permissions: United States only.** Verify → Settings → Geo permissions: allow the United States, turn off
     every other country for SMS (and Voice, if listed).
2. **Supabase (live project) → Authentication → Sign In / Providers**, checked **before** sign-ups go on, because
   "Allow new users to sign up" opens every way of signing up, not only text codes:
   - **Email → "Confirm email" ON.** The owner's own email-and-password login (doc 43) needs the Email provider, so it
     stays on. With "Confirm email" on, an email sign-up gets no session until the email is confirmed, and no email
     sender is set up, so none arrives. His login is not affected (his email is already confirmed). With it off,
     anyone could make a junk account with any email and a password, get signed in at once, and add saved vehicles
     (they still could not book, upload photos or see anything of anyone else: the database refuses).
   - **Phone → "Confirm phone" (phone confirmations) ON.** Otherwise a phone-and-password sign-up could mark a number
     as confirmed without a text. That would be a real hole: booking the account way trusts the confirmed phone.
   - **Anonymous sign-ins OFF.**
3. **Supabase (live) → Authentication → Rate Limits:**
   - **"Rate limit for sending SMS messages"** is one limit for the whole project, per hour. Supabase's default is
     about 30 an hour (from Supabase's rate-limit docs; this container can't open supabase.com to recheck). Keep it
     small to start, about 30, which is about 3× a busy hour. Raise it if real customers hit it.
   - **What hitting it means:** once that many texts went out in the hour, **every** text code stops until the hour
     resets: customers, the Team page, and the owner's own text sign-in to Admin. A bot that asks for codes to many
     random numbers can cause that. The owner's **email-and-password sign-in to Admin still works**, and guest
     booking needs no text, so customers can still book.
   - Leave the per-number wait between codes at its default.
4. Merge the branch and push (both Vercel projects). Check each deployment by its commit.
5. **Test on the real site, sign-ups still OFF:** one Send code from #account with a number that has no account. The
   page should say "New accounts can't be made online yet. You can book without one, or call (945) 361-7551." If it
   shows "We can't text a code to this number right now" instead, Supabase uses another error name: tell Claude
   before going on.
6. **Supabase (live) → Authentication → turn on "Allow new users to sign up"** (under Sign In / Providers, user
   signups). Customers' first code is a sign-up.
7. Test on the real site:
   - A new number from #account: code, account, name.
   - The "Sign in or create an account" card on a booking: code, step 04 photos, Send, then Appointments.
   - A guest booking.
   - The owner then declines or cancels the test bookings, as before.
8. **A bot check (CAPTCHA)** on code requests: Supabase **Attack Protection → CAPTCHA** (hCaptcha or Cloudflare
   Turnstile). Needs a site change (open point 3). Recommended **at once if the SMS limit is ever hit**, since that is
   the way it fails; otherwise in the first weeks.

**Verified or not:**

- Twilio's setting names were checked in Twilio's docs (Verify Fraud Guard, Verify Geo Permissions).
- Supabase's "Allow new users to sign up", "Confirm email", Anonymous sign-ins and Rate Limits are named in Supabase's
  docs. The exact menu path moves between dashboard versions.
- The `signup_disabled` error name comes from Supabase's Auth error list (`search_docs`) and how its Auth server
  handles a new phone; step 5 checks it for real.
- The SMS field's exact label comes from a copy of Supabase Studio's form, not the docs page. **Unverified:** this
  container can't open supabase.com.
- Whether "Confirm email" and "Confirm phone" are on today can't be read from the database: the owner checks them in
  step 2.

**Costs:**

- Twilio Verify charges per successful check plus the text fee. Doc 36 estimated about $0.05 per code plus SMS.
- The SMS rate limit and Geo permissions cap what a bot pumping texts could cost.

## Open points for the owner (PROPOSED, not built)

1. **Guest bookings in a new account.** Should a new account with the same phone pick up that phone's earlier guest
   bookings? It would need a small database change. **Careful:** a guest's phone is typed, never confirmed. Anyone who
   mistypes a number, or types someone else's on purpose, would put their booking (name, address, vehicle) into that
   person's account. **Recommended: link only bookings you confirmed or completed** (you actually reached that
   number), from the last 12 months; or don't link at all. Until then, Appointments tells guests to call.
2. **Staying signed in after a booking. Needs your answer before "push".** Someone who picks "Sign in or create an
   account" on the booking stays signed in after Send, like someone who signs in on the Account page. This changes
   an earlier choice: since the October audit (doc 05, flow step 7), a phone confirmed during a booking is signed out
   after Send, so the next person on a shared phone or computer can't see that booking or book as that person. With
   staying signed in, on a shared device the next person would see "Signed in as …", that person's saved vehicles
   and their Appointments, until they sign out on the Account page. **Recommended: keep it** (that is what an
   account is for; most people book on their own phone). If you'd rather sign them out, it's a one-line change, and
   the receipt then drops its "see it under Appointments" line.
3. **A bot check (CAPTCHA)** on code requests, the "before launch" item in CLAUDE.md. **Recommended:** at once if the
   SMS limit is ever hit (that stops every text code, yours too), otherwise in the first weeks.
4. **The Account icon in the top bar** opens Account as before. No new wording in the menu.
5. **Saved vehicles only with a confirmed phone** (a small database change, written and tested before it goes
   anywhere). Today any signed-in account can add saved vehicles (up to 25). With go-live step 2 done, every account
   has a confirmed phone anyway, so this is a second lock, not a fix. **Recommended: later, with the next migration.**
6. **An older database message to check.** The live guest-booking function refuses photos with "You can text us
   photos after you book." The site never sends photos on a guest booking, so customers don't see it today. It may
   not match the rule that our number is never described as taking texts. **Recommended:** change the words in the
   next migration (for example "You can add photos with an account."), with your OK.

## Checks run (preview mode, Nov 26)

**Walks** (`walk.py` in the session scratchpad, preview mode, 2× screenshots):

- Six variants: phone 390 and desk 1440, dark and light, plus reduced motion on phone dark and desk light.
- Each variant ran the same scenarios:
  - a guest booking end to end, with the receipt;
  - Appointments signed out;
  - a sign-up from #account;
  - a signed-in booking and its Appointments;
  - switching to the account card in the booking: Continue without a code, then code, step 04 photos, Send, receipt,
    Appointments;
  - sign-ups off;
  - back to the guest card.
- 20 checks per variant: **0 failures** in all six, and no page errors.
- A keyboard check (arrow keys and Space on the two cards) and a reload: the account choice and the phone came back.

**QA kit:**

- `tools/qa/smoke.py site`: 72 ok, 0 FAIL.
- `tools/qa/heads.py`: 70 PASS.

Screenshots for the owner: `owner/` in the session scratchpad (`{size}-{theme}-…png`).

## After the two reviews (Nov 26)

A security review and a flow review of the branch found **nothing blocking**: the database still checks every rule.
What was fixed or written down:

| Found | What was done |
|---|---|
| "Allow new users to sign up" also opens email-and-password sign-ups | Go-live step 2: "Confirm email" on, "Confirm phone" on, Anonymous sign-ins off, all before sign-ups go on. The old `data.js` note ("new sign-ups are closed at Supabase") now says the same. |
| The SMS limit is one for the whole project | Go-live step 3 says plainly that hitting it stops every text code, the owner's too, and that his password sign-in still works; CAPTCHA moved to "at once if the limit is ever hit". |
| Staying signed in after a booking changes the doc 05 choice | Not changed in code: go-live step 0 and open point 2 ask the owner first, with the one-line way back. |
| Linking guest bookings by phone could leak a booking to the wrong account | Open point 1 now recommends linking only bookings the owner confirmed or completed, or none. Nothing built. |
| On live, a new number probably gets `signup_disabled`, not `otp_disabled`, so the "can't be made online yet" message would never show | `data.js` maps `signup_disabled`, `otp_disabled` and any "signups not allowed" text, for customers only. Go-live step 5 checks it once on the real site before sign-ups go on. |
| The photo picker on step 04 could show before the code (from the step bar) | It shows only once the phone is confirmed; before that a note says to confirm the phone on step 03. |
| "You can book without one" was said with guest booking off | Said only while a guest can book online; otherwise "Please call (945) 361-7551." |
| The Account page offered "book as a guest" while booking is closed | Hidden while booking is closed (`data.js` `guestsCanBook`). |
| While sign-ups are off, #account shows which number has an account | Written down above; ends when sign-ups go on. |
| Live `submit_guest_booking`'s "You can text us photos after you book." | Older than this branch, not shown by the site. Open point 6. |
| Optional: saved vehicles only with a confirmed phone | Open point 5 (PROPOSED). No migration written: with step 2 done it isn't needed to be safe. |

**Checks after the fixes** (preview mode):

- The flow walk (`verify-flow/vf.py` in the session scratchpad) in 7 configurations: phone 390 dark, desk 1440 light,
  phone light with reduced motion, desk dark with reduced motion and no WebGL (68 checks each), and 320 dark,
  360 light and 390 dark with sideways-scroll checks (76 each). **497 of 497 real checks pass**, including the three
  former nits in every configuration, with no page errors. The 3 remaining "fails" are the walk's own false positive
  (Home's wash cards wait off-screen inside a clipped section; the page itself never scrolls sideways).
- `tools/qa/smoke.py site`: 72 ok, 0 FAIL. `tools/qa/heads.py`: 70 PASS, 0 FAIL.
- The error mapping, checked by itself: `signup_disabled`, `otp_disabled` and "Signups not allowed …" map to the
  sign-ups message for a customer; a team sign-in, `sms_send_failed` and the rate limit don't.
- No regex lookbehind in `site/js`; `foam.js` untouched.

New owner screenshots: `owner/phone-dark-6-account-04-before-code.png` and `owner/desk-light-6-account-04-before-code.png`
(step 04 on the account card before the code). The other owner screenshots are unchanged: nothing else visible moved.

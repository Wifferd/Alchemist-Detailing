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
  any time under Appointments."
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

1. **Twilio Verify (Twilio Console):**
   - **Fraud Guard on** for the Verify service: Verify → Services → the service → Fraud Guard. Twilio says it has been
     on by default for Verify customers since 2023; check it.
   - **Geo permissions: United States only.** Verify → Settings → Geo permissions: allow the United States, turn off
     every other country for SMS (and Voice, if listed).
2. **Supabase (live project) → Authentication → Rate Limits:**
   - Set **"Rate limit for sending SMS messages"** (texts per hour for the whole project) to a small number.
     Recommended: 30 an hour to start, about 3× a busy hour. Raise it if real customers hit it.
   - Leave the per-number wait between codes at its default.
3. Merge the branch and push (both Vercel projects). Check each deployment by its commit.
4. **Supabase (live) → Authentication → turn on "Allow new users to sign up"** (under Sign In / Providers, user
   signups). Customers' first code is a sign-up. With it off, the site shows the "New accounts can't be made online
   yet" message.
5. Test on the real site:
   - A new number from #account: code, account, name.
   - The "Sign in or create an account" card on a booking: code, step 04 photos, Send, then Appointments.
   - A guest booking.
   - The owner then declines or cancels the test bookings, as before.
6. Optional, recommended: Supabase **Attack Protection → CAPTCHA** (hCaptcha or Cloudflare Turnstile) on sign-ins.
   This needs a site change (PROPOSED below).

**Verified or not:**

- Twilio's setting names were checked in Twilio's docs (Verify Fraud Guard, Verify Geo Permissions).
- Supabase's "Allow new users to sign up" and Rate Limits are named in Supabase's docs (general configuration, rate
  limits). The exact menu path moves between dashboard versions.
- The SMS field's exact label comes from a copy of Supabase Studio's form, not the docs page. **Unverified:** this
  container can't open supabase.com.

**Costs:**

- Twilio Verify charges per successful check plus the text fee. Doc 36 estimated about $0.05 per code plus SMS.
- The SMS rate limit and Geo permissions cap what a bot pumping texts could cost.

## Open points for the owner (PROPOSED, not built)

1. **Guest bookings in a new account.** Should a new account with the same phone pick up that phone's earlier guest
   bookings? It would need a small database change: on the first confirmed phone, attach guest bookings with that
   `contact_phone` and `customer_id is null`. **Recommended: yes**, limited to bookings from the last 12 months.
   Until then, Appointments tells guests to call.
2. **Staying signed in after a booking.** Someone who picks "Sign in or create an account" stays signed in after
   Send. On a shared phone or computer, they sign out from the Account page. **Recommended: keep it.** That is what an
   account is for.
3. **A bot check (CAPTCHA)** on code requests, the "before launch" item in CLAUDE.md. **Recommended:** after the first
   weeks, or at once if the SMS limit is ever hit by strangers.
4. **The Account icon in the top bar** opens Account as before. No new wording in the menu.

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

# Doc 43: Admin sign-in without Twilio (Nov 4, 2026)

## The owner's words

- He asked: "how do i login to see booking". He was told about Supabase's Table Editor (`office` → `requests`) and the `office.*` commands.
- Then: "can i skip twillio for admin for about 5 minutes".
- Then: "i want to be able to login without twillio as an admin, keeping client logins disabled".

| # | Question | He chose |
|---|----------|----------|
| 1 | How to sign in to Admin until Twilio is set up? | **Email + password**. His authenticator app stays as the second lock. The other option was an emailed code, through Supabase's built-in sender: own address only, a few emails an hour, may land in spam. |
| 2 | Close new sign-ups at Supabase too? | **"Yes, close them"**. |

Customer sign-in stays off: guest booking is on, and the site shows customers no sign-in.

## What changed in the site

- **The Admin page's sign-in** (`#admin`, `admin.js` `passwordSignIn`) now opens on **Email** and **Password**, then **Sign in**.
  - It is a real form, so Enter signs in and a password manager can fill it (`autocomplete` username / current-password).
  - "Use a text code instead" switches to the old phone form, for when Twilio works. The phone form has a link back.
  - There is no sign-up anywhere: the login is made in Supabase.
- **`data.js` `staffPasswordSignIn(email, password)`** calls `signInWithPassword`. It shows plain messages for:
  - a wrong email or password: "That email and password don't match.";
  - an unconfirmed login;
  - too many tries.

  It never stores the password.
- **After the password**, the authenticator step works as before. `staffSession` reads the role, and an admin or manager without an authenticator gets the one-time setup, then a 6-digit code at every sign-in. Three things changed after the review:
  - **A half-done setup can't trap him.** Supabase refuses a second factor with the same name, and keeps an unverified one for up to a day. So `mfaEnroll` first clears unverified authenticator factors, which Supabase allows before the second step, then enrols. A failed start shows its message and **Try again**, not a spinner that never stops.
  - **The setup screen helps on a phone.** It names the entry "Alchemist Detailing" (`issuer`) and adds a link that opens the authenticator app. A phone can't scan a QR code shown on its own screen.
  - **Clearer messages.** Sign-out forgets a half-done setup. A sign-in that fails for any reason other than a wrong email or password says "We couldn't sign you in right now".

## Migration 006: the authenticator for team reads too

The review found that Migration 001's `is_staff()` checked the role only. So a manager or the admin signed in with just the first step (aal1) could still read:
- the bookings assigned to them, with the customer's name, phone, email, address and notes;
- those bookings' lines, history and photos;
- `open_jobs`;
- their own notices.

They could also call `request_job`, `withdraw_job_request` and `request_review`. With a password as the first step, that would have let a stolen password reach customer details without the authenticator code. `is_manager()` and `is_admin()`, which cover everything else a manager or the admin can do, already required the authenticator.

`20261104220001_m006_staff_needs_authenticator.sql` changes three things:
- **`is_staff()`:** true for detailers, and for managers and the admin only after the authenticator code.
- **`assert_staff()`:** says `mfa_required` to a manager or admin at aal1.
- **The two "Notices … own" policies:** a manager's or the admin's notices need the authenticator code.

These are plain replacements, so grants are kept and nothing is removed. Detailers and customers are unchanged.

`db-tests/m006_tests_staff_mfa.sql` is one DO block, 24 checks:
- **Before the migration (`m006pre`):** 9 of the manager and admin checks failed on the test project, as expected. With the first step alone, the manager saw 1 assigned booking, its line, 2 history rows, 61 notices and open_jobs. The admin saw 66 notices and open_jobs.
- **After it (`m006`):** 24 of 24 passed.
- **The Team page** (detailers, `#team`) still signs in by text code only. Not changed.

## The owner's steps (live project, "Alchemist Detailing")

Close sign-ups first, so nobody can claim his email address before he does.

0. **Close sign-ups.** In Authentication, then **Sign In / Providers**, turn off **"Allow new users to sign up"**, then Save. Supabase: "If this config is disabled, only existing users can sign in." Logins made in the dashboard still work.
1. **Make the login.** In Supabase, open Authentication, then **Users**, then **Add user**, then **Create new user**.
   - Use his email and a strong password that he uses nowhere else.
   - Tick auto-confirm, so the login is confirmed at once.
   - The password goes only into Supabase, never into a chat.
   - If Supabase says the email is already registered, stop and ask. Live had no logins at all on Nov 4.
3. **Tell Claude Code.** With his OK, it makes that login the admin by the same rule as `bootstrap_admin`: only while no admin exists. On live, `bootstrap_admin` takes only a phone (Migration 004, which also takes an email, is on the test project only). So it runs the same update by email, once:

   ```sql
   update public.profiles p set role = 'admin', is_active = true
   from auth.users u
   where u.id = p.id and lower(u.email) = lower('<his email>') and u.email_confirmed_at is not null and p.deleted_at is null
     and not exists (select 1 from public.profiles x where x.role = 'admin' and x.deleted_at is null)
   returning p.id;
   ```

   Exactly one id must come back, and it must be the login he made: one user, his email, created minutes before.
4. **Sign in right away, and set up the authenticator at once.** Until his own authenticator is added, anyone with the password could add theirs.
   1. Open thealchemistdetailing.com/#admin.
   2. Enter the email and password.
   3. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password and the like).
   4. Enter its 6-digit code.

   From then on, each sign-in is the password, then the app's code.

**When Twilio is set up:** turn "Allow new users to sign up" back on, together with `guest_booking = false` (doc 37). Customers then make accounts with a text code. Staff can keep the password or use a text code.

## Checks (Nov 4)

**In Chromium, with a stand-in Supabase client** (this environment can't reach Supabase). The site was served as thealchemistdetailing.com through a host-resolver rule, at 1280 px and 390 px.

- **The form:**
  - The email field is `type=email` with `autocomplete=username`. The password field is `type=password` with `autocomplete=current-password`.
  - A wrong password, an unconfirmed login and too many tries each showed their message under the password.
  - An invalid email showed its message under the email, with no call to Supabase.
- **The right password,** entered with the Enter key, led to the authenticator setup with its QR code and key.
  - A wrong code: "That code didn't match."
  - The right code: the Morning view, with all eight admin tabs.
- **Afterwards:**
  - The password was not in localStorage.
  - Sign out brought the form back.
  - "Use a text code instead" and its link back both work.
  - No script errors.
- **A local copy** (127.0.0.1) still shows the preview's "Look around" buttons.
- **Setup recovery, with a stand-in that follows Supabase's rules** (a second factor with the same name is refused while an unverified one exists):
  - A wrong code, then a reload, led to a fresh QR code: the old factor was cleared, not stuck.
  - A failed start showed "The authenticator setup couldn't start" and **Try again**, which worked.
  - The right code opened the Admin page.
  - The phone link is an `otpauth://` address with issuer Alchemist Detailing.
- **An independent review, two reviewers.** It found the `is_staff()` gap (fixed by Migration 006) and the setup trap (fixed above). It confirmed:
  - `signInWithPassword` and its error codes match supabase-js 2.49.4;
  - the password is never stored, and there is no sign-up path;
  - the error messages don't reveal whether an email has a login;
  - the `office` schema is closed to the API;
  - the one-off role update is safe.

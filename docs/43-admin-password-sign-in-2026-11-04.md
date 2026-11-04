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
- **After the password**, everything is as before:
  - `staffSession` reads the role;
  - an admin or manager without an authenticator gets the one-time setup (QR code and key), then a 6-digit code at every sign-in;
  - the database itself refuses staff actions without that second step. `aal2` is checked in Migration 001's staff check, while `business_settings.require_mfa_for_managers` is on.
- **The Team page** (detailers, `#team`) still signs in by text code only. Not changed.

## The owner's steps (live project, "Alchemist Detailing")

1. **Make the login.** In Supabase, open Authentication, then **Users**, then **Add user**, then **Create new user**.
   - Use his email and a strong password that he uses nowhere else.
   - Tick auto-confirm, so the login is confirmed at once.
   - The password goes only into Supabase, never into a chat.
2. **Close sign-ups.** In Authentication, then **Sign In / Providers**, turn off **"Allow new users to sign up"**, then Save. Supabase: "If this config is disabled, only existing users can sign in." Logins made in the dashboard still work.
3. **Tell Claude Code.** With his OK, it makes that login the admin by the same rule as `bootstrap_admin`: only while no admin exists. On live, `bootstrap_admin` takes only a phone (Migration 004, which also takes an email, is on the test project only). So it runs the same update by email, once:

   ```sql
   update public.profiles p set role = 'admin', is_active = true
   from auth.users u
   where u.id = p.id and lower(u.email) = lower('<his email>') and u.email_confirmed_at is not null and p.deleted_at is null
     and not exists (select 1 from public.profiles x where x.role = 'admin' and x.deleted_at is null)
   returning p.id;
   ```
4. **Sign in.**
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

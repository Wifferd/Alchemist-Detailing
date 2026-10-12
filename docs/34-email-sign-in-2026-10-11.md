# 34. Sign-in by email code (Oct 11, 2026)

The owner chose Resend for codes and booking messages (doc 33). Resend sends **email only** (it has no texting product), so customers and staff now confirm an email address with a 6-digit code instead of a phone number with a text. This doc says what changed, where it stands, and what the owner does to switch it on.

## What changed

- **Booking, step 01 (Contact):** first name, last name, then the **email** with "Send code" and a "Code from the email" field, then a **mobile phone** (required; not confirmed by a code: the owner calls or texts it himself). The confirmed email signs the customer in, as the text code did. The phone goes with the booking and is filled in next time from the customer's profile.
- **Account page, admin and team sign-in:** email code (the admin and managers then use the authenticator app, as before). The team screens never create a new login for an unknown address.
- **Admin, Team, "Add a team member":** email and first name (no phone). The new member signs in with an email code.
- **Database (Migration 004):** a booking needs a confirmed email (or a confirmed phone, kept for the day texts might come back); a throwaway address can't book; the typed phone is required, checked for a US format, kept on the profile as `contact_phone` (never treated as a confirmed phone); photo uploads follow the confirmed email; staff bookings for an email-only account use the phone staff enter or the saved one; removing a customer also clears the saved phone; `bootstrap_admin` takes the owner's email. 31 tests (`db-tests/m004_tests_email_sign_in.sql`), all passing on the test project, twice in a row.
- **Edge Function `admin-create-team-account`:** by email.
- Fixed on the way: "Not you?" on the booking page kept the previous person's saved vehicle and photos; it now drops them.

## Where it stands (Oct 11)

| Piece | Test project | Live project |
|-------|--------------|--------------|
| Migration 004 | Applied (six parts, same SQL as the file), 31 of 31 tests pass | **Not applied**: needs the owner's OK |
| Edge Function (by email) | Deployed (version 2) | Not deployed: with the migration |
| The website (email sign-in) | Live on the test site | Live on the main site (sign-in can't send codes yet there either) |
| Sending the codes | **Not set up**: needs the Resend account and a verified domain | Same |

Until the email setup below is done, nobody can get a code on either site (before the switch, nobody could get a text code either: no texting service was ever connected).

## What the owner does (about 20 minutes, once the domain is bought)

1. **The domain.** Resend only emails customers from a domain you own. Say "buy it" and Claude Code gets a fresh Vercel quote for alchemydetails.com to approve (doc 33).
2. **A free Resend account.** Go to resend.com, press Sign up, use your own email. The free plan sends up to 100 emails a day (3,000 a month).
3. **Add the domain in Resend.** In Resend: Domains → Add domain → type `alchemydetails.com` → Add. Resend shows a short list of DNS records (usually an MX and a TXT record for `send`, and a TXT record for `resend._domainkey`). Send Claude Code a screenshot of that list: it adds the records in Vercel (where the domain lives). Then press **Verify DNS records** in Resend. It can take a few minutes.
4. **An API key.** In Resend: API Keys → Create API key → name it `Supabase`, permission "Sending access" → Create. Copy the key (it is shown once). **Don't paste it in the chat**; it goes straight into Supabase in the next step.
5. **Supabase, test project first** ("Alchemist Test"): Authentication → Emails → SMTP Settings → turn on **Enable custom SMTP** and fill in:
   - Sender email: `bookings@alchemydetails.com`
   - Sender name: `Alchemist Detailing`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Save.
6. **The code in the email.** Still in Supabase: Authentication → Emails → Templates. Open **Magic link** and set:
   - Subject: `Your Alchemist Detailing code: {{ .Token }}`
   - Message: `<h2>Your code is {{ .Token }}</h2><p>Enter this 6-digit code on the Alchemist Detailing website to confirm your email. It works once and expires soon. If you didn't ask for it, you can ignore this email.</p>`
   - Save. Do the same in **Confirm sign up** (a brand-new address can get this one instead).
7. **Rate limit.** Authentication → Rate Limits: Supabase starts custom email at 30 an hour; 60 is plenty for now.
8. **Tell Claude Code.** It tests the sign-in on the test site with your email, then (with your OK) applies Migration 004 and the function to the live project, and you repeat steps 5 to 7 on the live project ("Alchemist Detailing").
9. **Your admin account on the live site:** sign in on the Account page with your email code; Claude Code then makes that account the admin (`bootstrap_admin` with your email, with your OK); on the Admin page you add the authenticator app.

## Later: booking emails

Planned next, once Resend works: an email to the owner for every new request, and one to the customer when a booking is confirmed, declined or needs information. That is a small server function using the Resend key as a Supabase secret (Edge Functions → Secrets → `RESEND_API_KEY`). Not built yet.

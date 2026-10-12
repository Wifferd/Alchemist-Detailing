# 36. Back to text codes, through Twilio (Oct 12, 2026)

On Oct 12 the owner said he will buy the domain and get a Twilio account after his next wash. Asked what Twilio should do, he chose **"Text codes only"**:
- Customers and staff sign in with a 6-digit text code.
- Booking confirmations are decided later.
- Resend (doc 34) isn't needed for now.

## What changed

- **The site signs people in with a text code again.** This is the flow from before doc 34; the email switch (commit adf094f) is reverted.
  - Booking step 01 asks for the mobile phone, with "Send code" and "Code from the text".
  - The Account page and the admin and team sign-ins use text codes. The admin and managers still add the authenticator app.
- **Kept from the email switch:** "Not you?" also drops the other account's saved vehicle and the photos chosen under it.
- **The optional email (and its code) is hidden for now.** Confirming an email needs an email sender, and none is set up. `site/js/config.js` has `emailCodes: false`. Set it to `true` once an email sender exists (doc 34 has those steps); the email field and its code then come back as before.
- **`admin-create-team-account`** adds team members by phone again. This is the version the live project already had; it was redeployed to the test project as version 3.
- **Database: unchanged.**
  - The live project never got Migration 004 and needs nothing for text codes.
  - The test project keeps Migration 004. It accepts a confirmed phone or a confirmed email, so text-code sign-ins behave there as on live.

Until Twilio is connected in Supabase, nobody can get a text code on either site, as before.

## What the owner does (about 15 minutes, test project first)

1. **A Twilio account.** At twilio.com, sign up with your own email and phone. Then upgrade the account (add a payment method and some credit, for example $20). A trial account can only text numbers you've verified in Twilio yourself.
2. **A Verify service.** In the Twilio Console, go to Verify → Services → Create new:
   - Friendly name: `Alchemist Detailing`. It appears in the text: "Your Alchemist Detailing verification code is: 123456".
   - Turn on SMS, then press Create.
   - Copy the **Service SID** (it starts with `VA`).
3. **The account keys.** On the Twilio Console home page, under Account Info, there are the **Account SID** and the **Auth Token**. Don't paste them in the chat; they go straight into Supabase in the next step.
4. **Supabase, test project** ("Alchemist Test"):
   - Go to Authentication → Sign In / Providers → **Phone** and turn it on.
   - SMS provider: **Twilio Verify**.
   - Paste the Account SID, the Auth Token and the Verify Service SID, then Save.
5. **Try it** on the test site (alchemist-detailing-test.vercel.app): book with your own mobile number. The code arrives by text.
6. **Tell Claude Code.** It checks your test booking in the database. You then put the same settings in the **live** project ("Alchemist Detailing"). Then Claude Code makes your account the admin (`bootstrap_admin` with your phone, with your OK), and you add the authenticator app on the Admin page.

**Cost:**
- About $0.05 for each successful code, plus the text itself (about $0.008 plus small carrier fees), so roughly 6 cents per sign-in.
- Verify needs no A2P 10DLC registration.
- Booking-confirmation texts, if wanted later, go through Twilio Messaging. That needs the registration: about $4.50 plus $15 once, then $2 a month, approved in a few days.

**Sources:** [Supabase: phone login with Twilio](https://supabase.com/docs/guides/auth/phone-login/twilio), [Twilio: A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc), [Twilio: A2P 10DLC brand fees](https://static1.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand), and [Twilio Verify pricing (summary)](https://www.authgear.com/post/twilio-verify-pricing-and-alternatives). Check the current prices in the Twilio Console.

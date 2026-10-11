# 33. The owner's answers of Oct 11, 2026

Answers to the open items at the end of the final run (doc 32).

| # | Topic | The owner said | Done / next |
|---|-------|----------------|-------------|
| 1 | Domain | "alchemydetails.com is good." | Picked. Vercel quote on Oct 11: $11.25 for 1 year, auto-renew on (renews yearly at the then-current price until turned off on the Vercel domains page), charged to the Vercel team's default card, tax and fees may be added, non-refundable. Bought only after his explicit approval of that quote, then connected to the live site. |
| 2 | Texting service | "Texting service is Resend." | Resend sends **email only** (no SMS product; its blog names SMS as a future goal). Free plan, as published: 3,000 emails a month, at most 100 a day. So sign-in codes and booking messages would go by email: a Migration 004 and front-end change, since today a booking needs a phone confirmed by text code (`submit_booking` checks `phone_confirmed_at`). Direction put to the owner on Oct 11. Needs the domain (Resend sends from a verified domain) and a free Resend account in his name. |
| 3 | Photos (interior, before/after, video) | "Haven't gotten any clients yet." | Nothing to add yet. The before/after slider stays hidden on the live site until a pair exists. |
| 4 | Calendar week start, wash length | "Start on Monday, the 4 scrolls are good." | Both calendars (the admin week view and the customer month grid) start on Monday since commit "Calendars start the week on Monday". The pinned wash stays 430% / 380% of the screen height. |

## Follow-up the same day

- **Calendar:** "If a new month starts on Tuesday, show the Monday in grey and that it's in the previous month." Done: the booking calendar shows the neighbouring months' days in grey with the month in small capitals under the number ("30 NOV" before Tuesday Dec 1; "1 JAN" after Dec 31). They are plain text (`.cal-other`), not buttons.
- **Domain:** asked to approve the Vercel quote ($11.25 for 1 year, auto-renew, the team's default card, tax may be added, non-refundable), he answered **"Not yet"**. For when he does buy it, he chose the registrant details on file (his name, his own email, the business phone, the address on file, company Alchemist Detailing); they are not written here.
- **Codes:** he chose **email codes with Resend** (customers and staff confirm an email with a 6-digit code; booking emails to him and to customers; phone numbers still collected so he can call or text people himself). Resend only emails arbitrary recipients from a verified domain, so the email codes go live after the domain is bought and the Resend account exists. The switch is being designed and built on the test project first (doc 34 to follow).

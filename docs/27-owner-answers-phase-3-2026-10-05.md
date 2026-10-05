# Owner answers, phase 3: the admin console (Oct 5, 2026)

Answers to the phase 3 questions (doc 22, Q-D2, the notice box, V-4), given before the admin console is built.

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| Q-D2 | One-tap actions | Claude's recommendation accepted: **Confirm at the requested time** and **Decline (with a short reason)** are one tap. **Change the time**, **Set a price** (XL, heavy stains, sealant on an unpriced vehicle) and **Assign a detailer** open a small panel. | DECIDED |
| Notice box | Wording and whether it blocks dates | Two separate things: (1) the admin **blocks days**, and customers can't select them (Migration 001's `blocked_days` already does this; the console gets a screen for it). (2) A **note from the owner**, visibly his, shown on the booking calendar; display only. | DECIDED |
| V-4 | Do buffers count toward a day? | **Yes.** The 10-minute travel gap counts as the owner's time in the morning view. | DECIDED |
| Morning view | Order | Today's jobs, then what needs the owner (new requests with the hold clock, items needing a price), then tomorrow. | DECIDED |
| NEW | Detailers can message a customer when running late | The owner wants this. It is a text-sending feature, so it depends on the texting provider (not set up yet) and on Q-N1 (which texts the system sends). **PROPOSED shape:** a "Running late" button on the detailer's job that sends one text from a fixed template with the new arrival time; nothing free-form; logged in `notifications`. | PROPOSED, needs the texting provider |
| Texting provider | "My dad told me about one that's free" | The owner knows of a free texting provider. Name not given yet. Supabase's phone sign-in supports Twilio, MessageBird, Textlocal and Vonage out of the box; anything else needs a small server function. | OPEN: which one? |

## Build notes for phase 3

- Role gate: manager and admin, with an authenticator code (MFA, `aal2`), as Migration 001 requires. Staff sign in with their phone code and then the authenticator app.
- Every action calls an existing staff function from `…05_m001_access_and_storage.sql`; the console never writes to tables directly.
- Screens: Morning view, Requests (lanes: requests, review, spam), Calendar (day and week, blocked days, the owner's note), Customers (search), Team (admin only), Settings (read-only), Audit log.

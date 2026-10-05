# Owner answers, phase 2 (Oct 5, 2026)

Direct answers to the phase 2 questions from doc 22, given after seeing the booking app preview.

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| Q-A1 | What else belongs in a customer's account? | Profile, vehicles and bookings are enough for now. | DECIDED |
| Q-A2 | Can customers cancel or reschedule online? | **No.** Cancellations (and reschedules) go through the owner: the customer contacts him. The account shows a "Call us to cancel or change" line with the phone number; no cancel button. | DECIDED |
| — | Test phone numbers on the test project | OK to set them up (needed for a real text-code sign-in without Twilio). | DECIDED |
| — | Migration 002 on live | OK in principle, once the booking is tested end to end on the test project. | Pending that test |

## Reported problem

On the owner's phone, pressing **Send Request** on the last step took him back to the **Vehicle** step instead of the Thank-you screen, with no message. Cause: the final check re-runs every step's rules, and a problem on a step that isn't on screen couldn't show its message, so the page jumped back silently. Fixed on Oct 5: the booking now goes to the step *and* shows the reason next to the field. The owner is asked what he had filled in, to find the rule that fired.

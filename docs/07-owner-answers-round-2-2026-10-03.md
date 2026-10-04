# Owner answers, second round (Oct 3, 2026)

Sent by the owner on Oct 3, 2026 at 12:04 PM Central, answering the 18 questions from the first audit round. The answer sheet below was prepared with ChatGPT and is copied here unchanged. Where it differs from doc 02, this doc is newer.

Owner's message sent with it (verbatim): "For this tier one and tier two are just chat gpts version of out manager and detailer being manager is at a higher level and admin is at the higest, any other confusions can be discussed"

Role names used from here on: detailer = tier 1, manager = tier 2, admin = highest.

Points sent back to the owner for confirmation are tracked in the audit plan, Section 17 (X-1 to X-10).

---

I checked both our conversation and the current Alchemist Detailing project file. There are a few places where the project contains draft assumptions that conflict with what we later decided, so I’m calling those out instead of treating them as final. The current project, for example, still has draft four-level standalone services and placeholder bundle logic. Alchemist Detailing.html

Send Claude this number-for-number:

⸻

Answers

1. Service durations

The exact final durations were not fully finalized.

For now, use these provisional durations:

* Exterior Basic: 60 minutes
* Exterior Deluxe: 90 minutes
* Interior Basic: 60 minutes
* Interior Deluxe: 120 minutes

Those match the first two levels of the current project’s draft timing structure. The project also contains draft Level 3/4 timings, but those belong to the newer four-level standalone draft and should not be treated as final because our current menu is Basic/Deluxe for standalone Exterior/Interior. Alchemist Detailing.html

Perfect Finish Sealant and standalone Steam Cleaning durations are not finalized yet.

For bundles: yes, initially calculate the bundle duration as the duration of its two included services added together. Keep the duration configurable so we can adjust a bundle later without rewriting the system.

⸻

2. Larger vehicles and the 5–10% surcharge

The business rule is 5–10% extra for larger vehicles.

The exact percentage for each vehicle-size category has not been finalized yet, so do not invent the exact breakdown.

Make the percentage configurable in the admin/backend.

The current project architecture already expects a vehicle_size_rules table and calculates the surcharge dynamically, so keep that concept.

The surcharge should apply to the booking subtotal, including selected extras. For bundles, calculate the bundle savings first, then apply the larger-vehicle adjustment to the resulting service subtotal.

⸻

3. Vehicle types / sealant pricing

Yes, keep:

* Sedan
* Coupe
* Crossover
* SUV
* Minivan
* Truck
* Large SUV
* Van
* Convertible
* Other

The current Alchemist project already includes Convertible and Other. Alchemist Detailing.html

For Perfect Finish Sealant:

* Car/Coupe/Sedan = $44.99
* SUV/Minivan/Crossover = $54.99
* Truck/Large SUV = $64.99

We have not decided the exact sealant tier for Van, Convertible, or Other.

For a customer who selects Not sure, do not guess a vehicle-size surcharge or sealant tier. Keep it as an assessment/review situation and confirm the appropriate price based on the actual vehicle.

⸻

4. Steam Cleaning and Sealant rules

Steam Cleaning cannot be booked completely by itself.

It is an add-on to another visit/service.

It can be added to an eligible service.

Perfect Finish Sealant cannot be booked without an exterior wash/service. It is an exterior protection add-on after a wash.

When the customer selects Interior Deluxe, Steam Cleaning is already included.

Therefore:

* Show Steam Cleaning as Included
* Do not charge the $49.99 again
* Do not let the customer accidentally purchase a duplicate Steam add-on

The original pricing sheet specifically described Steam Cleaning as already included in Interior Deluxe.

⸻

5. Preventing fake requests

Do not let a submitted request permanently consume an actual calendar slot.

Use multiple layers:

* Honeypot field
* Server-side rate limiting
* Duplicate/repeated-request throttling
* Strong server-side validation
* Bot protection/CAPTCHA only when necessary

The current project already contains a hidden honeypot field and input validation, so keep that concept.

Most importantly:

A pending request should not become a confirmed appointment just because somebody submitted it.

Only an approved/confirmed appointment should consume permanent scheduling capacity.

⸻

6. 24-hour hold expiration

This was not actually finalized in our earlier discussion.

So do not silently decide this for me.

For now, make the hold behavior configurable.

The intended business behavior should be:

If a temporary hold expires before approval, the time becomes available again and the customer can submit another request.

But the exact status/customer-notification behavior after the 24 hours is TBD.

⸻

7. “Not sure” vehicle requests

No, Not Sure should NOT automatically mean Review.

It should be treated as:

Unidentified / Not Sure

and remain distinguishable from normal fully identified requests.

Only send it to Review when there is another reason, such as:

* Concerning damage
* Unusual vehicle situation
* Unclear service requirements
* Other information requiring staff judgment

So:

Not Sure ≠ automatically Review

The project currently stores not_sure as vehicle information, which is the correct foundation. Alchemist Detailing.html

For whether a Not Sure request holds a slot: use the same temporary-hold rule as other pending requests. The exact 24-hour behavior is still TBD from #6.

⸻

8. Spam

Yes, I want to be able to see Spam.

The Admin interface should have:

* Requests
* Review
* Spam

Spam should be separated from normal requests but still accessible.

Spam retention length is not finalized yet.

⸻

9. Guest email

Required.

Guest booking requires:

* First name
* Last name optional
* Phone
* Email

The current Alchemist project also validates the guest email as required. Alchemist Detailing.html

⸻

10. Days, hours, buffers, booking horizon, simultaneous jobs

The business should be available for booking every day.

Operating window

* Earliest appointment: 10:00 AM
* Business finish/closing target: 7:00 PM

Important clarification:

7:00 PM should be treated as the time the job must be finished, not a universal 7:00 PM start time.

The latest possible start time should therefore be calculated from:

7:00 PM − service duration − required buffer/travel time

Example:

If a job takes 2 hours, it cannot start at 6:30 PM.

Booking horizon

The project/previous implementation has used a limited future calendar; the exact final customer booking horizon was not explicitly finalized by us.

Use 1–60 days as the configurable range for now, since that is the range currently presented in the build discussion.

Jobs at the same time

Yes.

Because Alchemist is not a solo operation, multiple jobs can occur simultaneously when enough team members and physical/service capacity are available.

One employee cannot be double-booked.

Buffer/travel time

The exact amount of time between jobs was not finalized.

It needs to be configurable, especially for mobile jobs.

⸻

11. Damage choices that trigger Review

Definitely send these to Review:

* Unknown
* Other

Known damage such as:

* Paint damage
* Dents
* Scratches

should still be clearly visible to the team, but should not automatically force Review unless the condition requires it.

The important rule we established was that unknown damage needs verification.

The current project already requires additional explanation when Unknown or Other is selected. Alchemist Detailing.html

⸻

12. Manager / Detailer permissions

Do not create a separate Manager role right now.

Use:

Admin

Everything.

Tier 1 Employee

Can perform the normal day-to-day operational functions and essentially everything necessary to work appointments, except:

* Cancel appointments
* Perform Tier 2 Review authority

Tier 2 Employee

Everything Tier 1 can do, plus:

* Review higher-complexity appointments
* Review unusual vehicles
* Review damage situations
* Review complicated modifications/service requests

Admin

Final authority, including:

* Cancellation
* Refunds
* Service credits
* Business settings
* Employee management
* Full appointment management

Any employee, including Tier 1, can still:

Request Admin Review

with a message explaining what needs to be checked.

⸻

13. Vehicle photos — staff access and retention

Any employee who has legitimate access to that appointment should be able to see the photos necessary to perform/review that job.

That includes the employees assigned to the appointment and appropriately authorized higher-level staff/admins.

Do not make vehicle photos publicly accessible.

The exact photo-retention period is not finalized yet.

⸻

14. Customer account deletion

When a customer deletes their account, we should not destroy important business records immediately.

Keep business records such as:

* Completed appointments
* Appointment history
* Payment records
* Refund records
* Service credits
* Necessary audit records

Customer profile information should be removed/anonymized where appropriate once it is no longer needed.

The exact legal/business retention period is TBD. Do not invent a number yet.

⸻

15. Supabase

Use the existing empty Supabase project rather than creating another project, assuming it is still empty and has no unrelated production data.

The current Alchemist project is already structured around Supabase: it expects the Supabase URL/key and accesses services, vehicle-size rules, business settings, availability RPCs, sessions, vehicle records, storage, and booking submission through Supabase. Alchemist Detailing.html

For the Supabase Pro $25/month plan:

Not finalized yet.

Do not upgrade/charge anything automatically. We can decide when we’re ready for production.

⸻

16. SMS / Twilio

We do not need phone-number SMS sign-in at launch.

Use secure email/password authentication for customer accounts and team accounts.

Therefore:

Twilio budget for launch: $0.

We can add SMS later if the business actually needs it.

⸻

17. Deep Detail — $159.99

Yes, it is gone from the current pricing menu.

Do not include Deep Detail — $159.99 as a current standalone service.

The old Wiffed project had older pricing/data such as a $159.99 Deep Clean, but that is historical and should not be carried into the new Alchemist pricing automatically. Wiffed_Koch_Chemie_Chemical_Guide.docx

⸻

18. Basic / Deluxe vs old Levels 1 / 2

Yes, for the standalone Exterior and Interior services:

Exterior

* Basic = Level 1 concept
* Deluxe = Level 2 concept

Interior

* Basic = Level 1 concept
* Deluxe = Level 2 concept

But the new four-tier structure is for the Bundles, not four separate standalone Exterior and Interior services.

This is an important correction to the current Alchemist prototype because it currently defines four standalone Exterior levels and four standalone Interior levels. Alchemist Detailing.html

The final structure should therefore be:

STANDALONE SERVICES
Exterior
├── Basic
└── Deluxe
Interior
├── Basic
└── Deluxe
BUNDLES
├── Tier 1
├── Tier 2
├── Tier 3
└── Tier 4

⸻

Important corrections to the current project

There are three things Claude should correct before treating the current prototype as the source of truth:

1. Standalone service structure: The current project has four Exterior and four Interior levels. That is not our finalized structure. Alchemist Detailing.html

2. Draft pricing: The current project contains placeholder Level 1/2/3/4 prices such as $30, $65, $100, $160 for Exterior and $40, $85, $130, $190 for Interior, plus a placeholder 10% bundle discount. Those are prototype assumptions, not the current established Alchemist pricing. Alchemist Detailing.html

3. Calendar prototype: The current mock calendar contains artificial availability logic rather than real business availability, so it should not be used as production scheduling logic. The real system needs to use the database/team schedule and the finalized 10 AM–7 PM operating rules.

This should give Claude a much cleaner answer set without accidentally turning the prototype’s temporary assumptions into permanent business rules.
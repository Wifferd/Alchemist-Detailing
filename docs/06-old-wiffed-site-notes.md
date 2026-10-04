# Old Wiffed_ website — what it had

Read on 2026-10-03 from the Vercel project "wiffy-washes". It has one deployment, which is the production one (dpl_F3ycKzHwDmjsssLgK4ZdqsyLkYJD). These notes come from its compiled page code. They are facts about the OLD site, kept for reference. They are not decisions for Alchemist unless the owner confirms them.

## How it worked
- **No server or database.** Bookings, customer and team accounts (including passwords), chats and reviews were saved only in the browser of whoever was using the site (localStorage).
  - A booking made on a customer's phone never reached the team.
  - There is no old customer data to move.
- **Only outside call:** the NHTSA vehicle database, used to list models for a chosen make.

## Contact details shown on the old site
- Phone: +1 (945) 361-7551
- Instagram: @Wiffed_
- Team access requests went by email to owner@wiffeddetailing.com

## Old menu (named packages, no levels)

**Exterior**

| Package | Price | What it included |
|---|---|---|
| Basic Wash | $29.99 | Rinse, contact wash, brake cleaner |
| Professional Wash | $79.99 | Basic Wash plus a pre-wash and tire shine |
| Xtra Pro Wash | $99.99 | Professional Wash plus engine bay and exhaust cleaning |
| Deep Clean | $159.99 | Xtra Pro Wash plus wheels off and cleaning behind them |

**Interior**

| Package | Price | What it included |
|---|---|---|
| Basic Detail | $39.99 | Vacuum and wipe-down |
| Deep Clean | $89.99 | Full scrub including mats, steam clean, water vacuum |
| Professional Clean | $109.99 | Interior Deep Clean plus plastic restoration inside and out |

**Call for pricing:** Headlight Restoration, Waxing / Ceramic Wash, Ceramic Coating, Paint Correction, Polishing.

**Rules**
- Pick one exterior package, one interior package, or both. At least one is required.
- "Prices can vary depending on condition and size." There was no vehicle-size question and no fixed surcharge.

**Where the brief's prices came from:** the handoff brief's "Interior Basic $39.99" is the old Basic Detail, and its "Deep Detail $159.99" is the old exterior Deep Clean. The brief's Exterior Basic $49.99 and Exterior Deluxe $94.99 match the owner's current list instead.

## Booking flow
Steps: You → Vehicle → Service → Mods → Notes → Review.

- **Customer details**
  - Name and a 10-digit phone number were required.
  - Preferred contact method: phone, email or Instagram.
- **Vehicle**
  - Year and color.
  - Make, picked from a list or "Other / Not Listed".
  - Model, from the NHTSA lookup. One-character models such as Tesla 3, S and Y were accepted.
- **Location**
  - At the shop, at no extra cost.
  - Mobile: $30 flat plus $2 per mile from the shop, confirmed with the customer before the appointment was locked in.
- **Mods and condition**
  - A modifications checklist, the same eight options as the new prototype.
  - Ceramic coating and PPF checkboxes.
  - Damage only as a free-text note: "notify us prior to your wash".
- **Scheduling**
  - An optional "general availability" note.
  - No calendar: "Appointment times are scheduled by our team — we'll confirm a time with you directly."
  - Drop-off note: everything except the Basic Wash takes about 1–3 hours, and a dropped-off car can be held, which adds time.
- **Reference format:** WD-YYYY-0001, numbered in order.
- **Anti-spam:** checks in the browser only, with no verification of any kind. A name had to be a first and last name, letters only, with no swear words or keyboard mash, and the phone number had to be 10 digits.

## Team side ("Garage")
- **Statuses:**
  - pending
  - accepted (a team member claims it with Accept)
  - confirmed (a time is set)
  - completed
  - declined
- **No permission levels.** Every team member could do everything:
  - accept or decline any request
  - set times and mark jobs complete
  - add and remove teammates
  - reset passwords
  - issue join codes

  The role was a free-text label, and the first account created was the owner.
- **Joining:** a new member requested access, the business issued a 6-character member code, and the member then created a login.
- **Messaging:** a chat on each request between the customer and the assigned team member, plus "Message our team" direct messages.

## Customer side
- **Accounts**
  - Customer accounts needed a name, a phone number or email, a username and a password.
  - Guests gave a name and phone number only.
- **"Look up your requests":** anyone could type a phone number to see the requests made under it.
- **Reviews:** public reviews posted instantly with a name, stars and text, with no approval step.
- **Other pages and settings:**
  - Merch and Donate pages marked "coming soon"
  - a link page
  - a dark/light theme and a performance mode

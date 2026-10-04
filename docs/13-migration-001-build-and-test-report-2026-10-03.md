# Migration 001: build and test report (Oct 3, 2026, updated 6:35 PM)

**Status at 6:35 PM:** signed off and applied to the live project "Alchemist Detailing" (us-east-1). See doc 15 for the live results.

## Where things stand

- **Built:**
  - Migration 001 (work items W-01 to W-15).
  - Two server functions.
  - Your round-8 decisions: phone-in bookings entered by managers and the admin, and the bundle recommendation.
- **Tested on a local Postgres 16 copy:** 472 checks, all passing. They cover:
  - every role, booking rule and staff action;
  - all 6,480 price combinations, including 1,296 where a bundle is recommended;
  - 13 checks on simultaneous actions;
  - a check that applying the files one at a time never leaves anything open to the website.
- **Tested on the Supabase test project ("Alchemist Test", Postgres 17, with Supabase's real sign-in and file storage):** 453 checks, all passing.
  - Every table, rule, function, permission, index, trigger and menu entry matches the tested local copy. So do all 6,480 prices.
  - Supabase's security and performance checks found nothing to fix (details below).
  - Both server functions are deployed there. Both refuse anyone who isn't signed in.
- **Reviewed twice by an independent reviewer:** neither review found anything critical or high.
  - The first review found 17 issues. 16 are fixed. The 17th was a check to run on the live project before applying (no automatic-RLS helper in it); it passed.
  - The second review covered the new work and found 1 medium and 6 small issues. All are fixed.
- **Live project:** Migration 001 applied on Oct 3, after your sign-off (W-17). Its fingerprints match this tested build exactly (doc 15).

## What Migration 001 contains

Six files, applied in order. Each runs as one transaction, so a second run fails on its first line and changes nothing. From the first file on, nothing is open to the website until file 5 grants exactly what each role needs.

| File | Contents |
| --- | --- |
| 1 · types and tables | No automatic access; statuses and lanes; settings; menu tables; profiles, vehicles, bookings, assignments, job and review requests, notices, audit log; name, phone, email and text checks |
| 2 · roles, triggers, menu | Role checks with the authenticator-code step for managers and admin; profile sync from Supabase Auth (phone and email only once confirmed); notices; audit log without personal details; today's menu, form choices and 18 service-area ZIP codes |
| 3 · prices, open times, booking | One pricing routine with the bundle recommendation; open times in one query; day locks; booking rules shared by online and phone-in bookings; `submit_booking` |
| 4 · actions | Customer, manager, admin and team-member actions (Section 11), including phone-in bookings and removing details from a closed booking |
| 5 · access and storage | Privileges, row-level security, the private `vehicle-photos` bucket and its rules |
| 6 · email blocklist | 9,203 throwaway-email domains from the public CC0 list, pinned to one version and checked by count and fingerprint |

There are also two server functions:

- **admin-create-team-account:** the admin creates a manager or detailer. The new person confirms their phone by text at first sign-in.
- **cleanup-unattached-photos:** a scheduled job that deletes photo uploads never attached to a booking, after 24 hours.

## Your round-8 decisions, as built

**1. Phone-in bookings (managers and the admin, not detailers).**
- Managers and the admin can enter a booking for someone who calls (945) 361-7551.
- The same price, service-area, closed-day and limit rules apply as online, checked under the same day lock. Staff may choose any future day within opening hours.
- **Who it's for:**
  - Contact details are entered as given on the phone.
  - Or staff pick an existing customer account. That customer then sees the booking under "My bookings" and gets a notice.
  - Only customer accounts can be picked. A typed phone number that doesn't match the account is refused, so the wrong person's account can't be chosen by mistake.
- **Status:**
  - With a complete price, the booking is saved as confirmed.
  - If the price waits for the extra cost (XL, heavy stains, or a sealant with no price), it's saved as a request until you set the extra cost.
  - Only you can enter the extra cost with the booking.
- **Double entries:** each entry carries an ID from the staff screen, so a double click saves one booking. Phone-in bookings don't count toward the customer's own online limits.
- **Removing details:** the admin can remove the personal details from one closed booking. This is for callers without an account, whom "remove customer" can't reach.

**2. Bundle recommendation, never a switch.**
- When the chosen exterior and interior services make up a bundle that costs less, the quote recommends it and shows the saving. Mobile percentages are included in the saving.
- Exterior Basic + Interior Basic suggests the Signature Combo: $9.99 less at your driveway, $5.74 less on a mobile job.
- Both Deluxe services suggest the Full Detail Bundle.
- If several bundles match, the one that saves the most is shown. The customer's choice is never changed.

**3. US server location before launch (W-17).** Migration 001 goes onto a new US project instead of the current Canadian one. Your plan allows two active projects, so this takes three steps:

1. Pause or delete the empty "Wiffy Wash" project. Pausing keeps it restorable for 90 days.
2. Create the new project in **us-east-1 (North Virginia)**. That's one of the nearest choices for Texas (Supabase has no central-US region), and it sits next to Vercel's default region, Washington, D.C., where the website prototype is hosted.
3. Apply Migration 001 there.

The test project can stay where it is.

## Results on the Supabase test project (run at 6:04 PM)

Supabase's approval card for changes that clear data was cancelled every time in this app. Instead, you ran one script in the test project's SQL Editor. It did four things:

1. Cleared the unfinished earlier run.
2. Applied the six files exactly as they will go onto the real project, and recorded them as applied migrations.
3. Saved fingerprints of the result.
4. Ran the checks.

The same script was practised first on the local copy. That included what happens if it fails partway: the setup either completes or leaves the project as it was.

- **Checks: 453 of 453 passed.** These are the local checks except two parts that can't run in the SQL Editor:
  - The 13 simultaneous-action checks need several connections at once. They passed locally.
  - The 6,480-row price table is replaced by a fingerprint of all 6,480 quotes.
- **Fingerprints, test project vs. local copy:** identical for:
  - functions (90), table columns (196), rules (105), indexes (54), access policies (59) and triggers (34);
  - permissions (58 on tables, 15 on single columns, 46 on functions);
  - menu and settings data (77 rows) and all 6,480 prices.

  One cosmetic difference: pasting on Windows stored the functions' text with Windows line breaks. With those ignored, the function fingerprint matches exactly. No message or value the functions produce is affected, because none of their text spans two lines.
- **Also confirmed on Supabase:**
  - The throwaway-email list downloaded and passed its check: 9,203 domains. The download tool was removed again.
  - All 21 tables have row-level security on.
  - The private `vehicle-photos` bucket takes JPEG, PNG and WebP up to 8 MB.
  - The profile sync from Supabase sign-in works: test logins got profiles, and confirmed phones and emails were copied while unconfirmed ones weren't.
  - The six files are recorded as applied migrations.
- **Supabase's "Run without RLS" prompt:** Supabase offered to turn on row-level security for every table the script creates. "Without RLS" was the right choice. Migration 001 turns it on itself, with its own rules, for all 21 website tables.
  - The first attempt, with the offer accepted, stopped with an error.
  - The second run cleared everything from the first and finished. Nothing from the first attempt remains.
- **What stays on the test project:** 14 test logins, test bookings and the check results. It can stay as the sandbox for building the website.

### Supabase's security and performance checks

- **Security:**
  - 40 functions signed-in people can call, and 5 that signed-out visitors can call: prices, open days, open times, public settings and the email check. These are the intended entry points:
    - Each action checks who is calling before doing anything.
    - The small checks the access rules use only answer questions about the callers themselves.
    - The checks above cover every kind of caller.
  - 9 notes about the test helpers. These exist only on the test project.
  - Leaked-password protection is off. This sign-in setting rejects passwords known from data breaches. It matters for team members, who set a password, and it needs Supabase's Pro plan. It's added to the setup list below.
- **Performance:** 9 indexes not used yet. That's expected on a new database with almost no data. They serve staff screens and links between tables, so they stay.

### Server functions on the test project

- Both are deployed. Both refuse a request without a signed-in user (Supabase answers 401).
- Neither has run end to end yet:
  - Creating a team account needs you signed in as the admin with your authenticator code.
  - The photo cleanup runs from the scheduled job.

  Both will be exercised when the website's admin screens and the Cron job are set up. The database steps they rely on passed the checks above.

### Supabase details found while testing

- **Deleting file records:** Supabase only lets its file storage service delete file records, which it marks with a flag. The photo-deletion checks now set that same flag, so they test the rules exactly as the website will use them. The local copy now has the same block.
- **File versions:** Supabase file storage now supports file versions. The photo bucket is created with versions off. Keep it off, because the photo checks treat each file name as one photo.

## Test coverage (local copy, Postgres 16): 472 of 472 passing

- **Access by role:** a signed-out visitor, customers, a guest, an unconfirmed phone, an anonymous login and a turned-off account. Also a detailer, a manager and the admin, with and without the authenticator code.
- **Online booking:**
  - Driveway: 2 cars at once.
  - Mobile: 1 job at once.
  - Never driveway and mobile at the same time.
  - No job past 8 PM; buffers between jobs.
  - Bookable 1 to 60 days ahead; closed days are refused.
  - Mobile only inside the service area.
  - A request holds its time for 24 hours, then releases it.
  - Each customer's own limits: 3 open requests, 5 a day.
  - Repeated requests and the hidden spam field are handled.
  - The Review lane and photo checks.
- **Phone-in bookings:**
  - Who may enter them.
  - Contact details checked.
  - The area, limits and closed days still apply.
  - Linked to accounts correctly.
  - Price waits for the extra cost when it should.
  - Double entries saved once.
  - Notices go to the right people.
- **Prices:** all 6,480 combinations match an independent model of your price rules, and the recommendation does too.
- **Staff:**
  - Confirming, declining and asking the customer for information.
  - Setting a booking's time; moving it between lanes.
  - Starting, completing and shortening a job.
  - Assigning people: several people per car allowed; each person limited to 2 driveway cars or 1 mobile job at a time.
  - Job requests and review requests.
  - Extra cost and cancelling: admin only.
  - Notices.
  - Photo access by role.
  - Removing a customer, or one booking's details, while keeping business records.
- **Simultaneous actions:**
  - Two requests for the same time.
  - A manager moving a job while a customer books that time.
  - Two assignments of one person at once.
  - Confirming a lapsed request while someone else books its time.
  - Two admins demoting each other.
  - A phone-in entry for a customer while the admin removes that customer.

  In every case the second action waits for the first, then is refused.

## Fixed after the two independent reviews

1. A second booking within 10 minutes was treated as a repeat even with a different vehicle or address. Repeats now must match the time, place, vehicle and services. A retry after a Spam hit is a new booking.
2. Retiring a modification choice blocked editing or removing vehicles that already had it.
3. Deleting a login before removing the customer's details would have left those details on their bookings. That order is now refused.
4. Removing a customer clears every free-text note about them: staff notes, job and review request text, and notices. This includes bookings whose details were already removed.
5. Photo uploads are limited to customers and guests with a confirmed phone (Section 13).
6. Two admins demoting each other at once could leave no admin. Role changes now run one at a time.
7. One service entered as both the exterior and the interior choice was priced twice. It's now refused.
8. Spam bookings get "Request received" like any other, so the sender can't tell.
9. A turned-off account could still save vehicles.
10. A started job can be shortened, but not lengthened or moved.
11. Changing a first name no longer erases the last name.
12. The server functions handle turned-off and unconfirmed logins clearly, and accept Supabase's newer secret keys.
13. The audit log records which private fields changed (for example your address), never their values.
14. Free text refuses HTML tags. Three missing indexes were added.
15. Internal functions could be called from the website in the gap between applying file 1 and file 5. Automatic access is now turned off at the start of file 1. A test applies the files one at a time and confirms nothing is ever open.
16. Phone-in bookings:
    - only customer accounts can be picked;
    - a mismatched phone is refused;
    - an entry ID is required;
    - the customer's account is held while the booking is saved;
    - entries don't count toward the customer's own limits;
    - a reused entry ID gives a clear error.
17. If several bundles match, the one that saves the most is recommended.

## Choices made while building: please confirm or change

1. A request whose price waits for your extra cost can't be confirmed until you set it, so no customer is confirmed without a price.
2. When staff move an unconfirmed request to a new time, it holds that time for a fresh 24 hours.
3. Customers get a notice when their booking time changes.
4. Customers see their booking lines and history through "My bookings" only, which keeps the lanes (Spam, Review) hidden from them.
5. One account can save up to 25 vehicles.
6. You (the admin) can see every uploaded photo file, so you can delete any of them.
7. New tables or functions added later aren't visible to the website until a migration grants access.
8. The throwaway-email list is downloaded once by the database from the pinned public list, then the download tool is removed.
9. Phone-in bookings with a complete price are saved as confirmed, since managers and the admin are the ones who confirm anyway.
10. A phone-in booking for someone without an account isn't attached to an account they make later. History links only through a text-confirmed phone (F-39). Staff can attach a booking by picking the account when entering it.
11. Team members don't get notices about their own actions. For example, the manager who enters a booking isn't notified of it.
12. A phone-in booking whose price waits for your extra cost holds its time for 24 hours, like an online request. Set the extra cost while entering it, if you know it, to confirm it straight away.

## Values and setup still needed

- **Values:**
  - Buffer and travel minutes (X-8).
  - Sealant and steam minutes (X-7). They can't be booked until these are set.
  - Which services steam can be added to (X-5).
  - Which stains hold the price (X-25; proposed: heavy).
  - Bundle tiers (X-4).
  - Your private address.
  - Three borderline ZIP codes: 75072, 75407 and 75042.
- **Supabase setup before launch:**
  - Phone sign-in with Twilio Verify, and its monthly budget (X-11).
  - Phone confirmations turned on.
  - An email-sending service for email codes.
  - The bot check on code requests (X-9).
  - Authenticator-app sign-in (MFA) turned on.
  - A Supabase Cron job running the photo cleanup every hour.
  - Leaked-password protection for team members' passwords. It needs the Pro plan, so it's your choice.
- **For W-17:** answered at 6:18 PM: us-east-1, and delete "Wiffy Wash".

## Next steps

1. **Sign-off:** done at 6:18 PM, with the 12 choices as listed.
2. **W-17, the live project in the US:** done at 6:28 PM (doc 15). "Wiffy Wash" was deleted at 6:36 PM.
3. **The frontend phase** begins: the website itself.

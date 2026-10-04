You are taking over as the primary senior engineer, architect, UI/UX engineer, and technical project lead for the entire Alchemist Detailing website/application project.

This is NOT a request to blindly start coding.

Your first responsibility is to completely understand the project, its history, existing implementation, requirements, decisions, constraints, and unfinished work before making architectural or code changes.

I have Claude Max, so use the available context, project files, repository, codebase, and conversation/project information aggressively and thoroughly. Do not give me a shallow summary.

1. PROJECT IDENTITY

Business:
Alchemist Detailing

Short name:
AD

The website/application is for a premium automotive detailing business.

The overall product should feel like a legitimate, production-quality company website and booking/account platform — not a generic AI-generated template.

The visual identity should combine:

* Premium automotive aesthetic
* Nike/Apple-level simplicity and presentation
* Black / charcoal foundations
* Off-white/light surfaces where appropriate
* Metallic/warm gold as the primary accent
* Glass/translucent UI elements
* Cinematic automotive photography
* Sophisticated typography
* Restrained, intentional animation
* Premium micro-interactions
* Strong visual hierarchy
* Fast, responsive UX
* Excellent mobile experience

The brand should feel luxurious, modern, technical, and professional without becoming flashy or gimmicky.

Do NOT make the website look like a generic car-detailing template.

2. IMPORTANT: INGEST THE ENTIRE PROJECT FIRST

Before changing code, inspect EVERYTHING available to you:

* Current repository
* Existing website code
* Existing components
* Existing routes/pages
* Existing styling system
* Existing assets
* Existing database schema
* Supabase configuration
* Existing migrations
* Existing authentication implementation
* Existing booking implementation
* Existing APIs/functions
* Existing storage configuration
* Existing environment-variable usage
* Existing RLS policies
* Existing database functions
* Existing UI/UX work
* Existing project documentation
* Any pinned/project instructions
* Previous implementation decisions
* Previous prompts/specifications available in the project

Also use the accumulated project context from our previous discussions.

Do not assume that the newest document is automatically correct if older implementation or decisions contradict it.

Instead, build a source-of-truth hierarchy.

3. BUILD A REQUIREMENTS RECONCILIATION

Before implementation, classify what you discover into these categories:

1. FINALIZED / LOCKED
2. CURRENT IMPLEMENTATION
3. AGREED BUT NOT YET IMPLEMENTED
4. PLACEHOLDER
5. DEFERRED / FUTURE
6. AMBIGUOUS / NEEDS DECISION
7. CONFLICTING
8. BUG / SECURITY ISSUE
9. OUTDATED INFORMATION

Do not silently resolve contradictions.

For every important contradiction, explain:

* What the two versions say
* Which appears newer
* What the existing implementation currently does
* What should be treated as the current working requirement
* Whether it requires my approval before changing

Do NOT invent business rules simply because they seem reasonable.

4. CORE WEBSITE EXPERIENCE

The website should have a premium navigation system.

Primary desktop direction:

* Floating translucent/glass navigation bar
* Menu/navigation control toward the top-left
* Current page/context centered where appropriate
* Alchemist branding/logo
* Account control toward the right
* Premium glass/metal treatment
* Gold accent interactions
* Smooth but restrained animation

Mobile should have an equally intentional experience rather than simply shrinking desktop UI.

There should be a prominent Book Now CTA.

Book Now should be accessible immediately from the navigation/hero and remain easy to reach on mobile.

The site should support dark/light mode where already specified, while maintaining the Alchemist visual identity in both modes.

Hero imagery should feel cinematic and automotive.

The hero can use refresh-randomized imagery where that behavior has already been designed, but it must not compromise performance, accessibility, or determinism where inappropriate.

5. BOOKING SYSTEM

Booking is one of the most important parts of the entire product.

The booking experience should be a complete, price-aware flow rather than a simple contact form.

The customer should be able to progress through things such as:

1. Service selection
2. Vehicle selection
3. Vehicle information
4. Add-ons
5. Live price calculation
6. Location
7. Date
8. Available time
9. Contact information
10. Guest/account choice
11. Additional requests/notes
12. Confirmation

The system should clearly communicate price information throughout the process.

There should also be a way for customers who do not know their exact vehicle information to continue.

Vehicle selection should be easy and customer-friendly.

Include the previously established fallback:

“Not sure? Type here”

Vehicle photos should be optional.

Booking submissions should have automated handling/spam filtering.

Normal, identifiable vehicle bookings should be prioritized in the team’s appointment view.

Uncertain, unidentified, suspicious, or potentially spam submissions should be separated into a review queue rather than simply disappearing or being rejected without visibility.

The team should be able to inspect those submissions later.

Do not remove this behavior simply because it adds complexity.

6. CUSTOMER ACCOUNTS

The system should support a real cloud-based account system.

Customers should be able to log in and have their information persist across devices.

Customer accounts should support appropriate persistent information such as:

* Customer profile
* Vehicles
* Appointments
* Appointment history
* Relevant booking information

The system should not depend on browser-local storage as the source of truth for customer accounts or appointment history.

Authentication, authorization, database access, and session behavior must be designed for production use.

7. TEAM / STAFF SYSTEM

The application needs role-based access.

Known roles include:

* Admin
* Manager
* Detailer

Do not treat these as cosmetic labels.

Permissions must be enforced at the appropriate backend/database layer, not merely hidden in the frontend.

Audit existing RLS and authorization carefully.

The team should eventually be able to manage appointments and customer/vehicle information according to role permissions.

Do not grant every role administrative access simply because it is easier.

8. CURRENT SERVICE / PRICING FOUNDATION

Use the project’s latest established pricing as the current pricing foundation unless the repository/project documentation explicitly supersedes it.

Current core reference:

* Exterior Basic — $49.99
* Exterior Deluxe — $94.99
* Interior Basic — $39.99
* Deep Detail — $159.99

There have also been earlier prices and drafts in the project’s history.

Do NOT automatically merge old prices into the current menu.

Do NOT silently change finalized prices.

If the current code/database contains a different price, identify the discrepancy during the audit.

Future/unfinished services should be treated as future services / Coming Soon rather than pretending they are fully available.

The booking system must ultimately derive pricing from a controlled source rather than allowing arbitrary client-side price manipulation.

9. PRICING ARCHITECTURE

The pricing system needs to be designed so that:

* Base services have controlled prices
* Add-ons can modify the total
* The client can see a live total
* The server/database is authoritative
* The browser cannot simply submit an arbitrary final price
* Historical appointments preserve the correct pricing information at the time of booking
* Future price changes do not corrupt historical appointments
* Duration and availability can eventually be tied to services
* Pricing logic is not duplicated unnecessarily across unrelated frontend components

If the existing architecture does not satisfy these requirements, document the problem rather than immediately rewriting everything.

10. SUPABASE / DATABASE

The backend uses Supabase.

A major current milestone is:

Migration 001 — accounts + booking core

Migration 001 is intended to establish the foundational backend.

The project has specifically adopted the principle that:

The browser should not directly write to booking tables.

Writes should go through controlled backend/database functions as appropriate.

Row Level Security is an important part of the security model.

The latest work provided for Migration 001 must be treated as an artifact that requires careful auditing.

11. CURRENT DEVELOPMENT STAGE — CRITICAL

We are currently at:

Migration 001 audit / hardening BEFORE Migration 002.

DO NOT jump directly into Migration 002.

DO NOT rewrite Migration 001 immediately.

First audit Migration 001 thoroughly.

The audit must cover at minimum:

1. SQL dependencies
2. Schema correctness
3. Foreign keys
4. Constraints
5. Data integrity
6. Security
7. RLS policies
8. Role enforcement
9. Function security
10. SECURITY DEFINER usage where applicable
11. Search paths / privilege boundaries where applicable
12. Booking creation flow
13. Booking modification/cancellation flow
14. Pricing integrity
15. Duration handling
16. Availability logic
17. Double-booking/concurrency risks
18. Transaction safety
19. Customer/account relationships
20. Vehicle relationships
21. Appointment history
22. Guest bookings
23. Suspicious/review bookings
24. Storage assumptions
25. Notifications/audit assumptions
26. Edge cases
27. Failure handling
28. Migration ordering
29. Idempotency / repeat execution risks
30. Production-readiness concerns

Also inspect whether the frontend currently relies on behavior that Migration 001 does not actually guarantee.

12. MIGRATION 001 AUDIT OUTPUT

Before modifying Migration 001, produce a structured audit.

For every issue, classify it as:

* CRITICAL
* HIGH
* MEDIUM
* LOW
* INFORMATIONAL

Also identify:

* Security vulnerabilities
* Data integrity risks
* Logic bugs
* Architectural weaknesses
* Missing constraints
* Missing RLS
* Incorrect RLS
* Authorization bypass possibilities
* Race conditions
* Booking conflicts
* Pricing manipulation possibilities
* Incorrect assumptions in the frontend
* Technical debt
* Things that are intentionally deferred and should NOT be fixed yet

For every proposed change, explain:

* Why it is needed
* What it changes
* What depends on it
* Whether it is backwards-compatible
* Whether existing data could be affected
* Whether it should be part of Migration 001 hardening or deferred to Migration 002+

Do not make changes merely for stylistic preference.

13. DO NOT INVENT FEATURES

This is extremely important.

If something has not been finalized, do not silently turn it into a permanent business rule.

If something is obviously useful but not specified, mark it:

PROPOSED — REQUIRES APPROVAL

Do not confuse:

* “technically possible”
* “recommended”
* “planned”
* “implemented”
* “required”

These are different states.

14. ENGINEERING STANDARD

Treat this as a real production application.

Prioritize:

* Security
* Data integrity
* Maintainability
* Clear architecture
* Type safety
* Accessibility
* Responsive behavior
* Performance
* Error handling
* Observability
* Clean component boundaries
* Reusable primitives
* Minimal duplication
* Predictable state management
* Good loading/error/empty states
* Safe database access
* Correct authorization

Do not over-engineer things that are not necessary.

Do not add dependencies simply because they are trendy.

Do not rewrite working code without a concrete reason.

15. UI/UX STANDARD

The website should feel premium.

Avoid:

* Generic SaaS cards everywhere
* Excessive rounded rectangles
* Excessive gradients
* Excessive animation
* Cheap-looking gold effects
* Overly bright colors
* Cluttered layouts
* Generic stock-template sections
* AI-looking copy
* Unnecessary UI elements

Gold should feel like a material/accent, not like everything has been painted gold.

Animation should communicate hierarchy and polish.

Performance matters.

The experience should remain excellent on phones.

16. DESIGN SYSTEM

Where appropriate, establish or preserve reusable:

* Typography
* Spacing
* Buttons
* Cards
* Glass surfaces
* Inputs
* Selectors
* Modal/dialog patterns
* Navigation
* CTA patterns
* Form states
* Loading states
* Error states
* Toasts/notifications
* Booking components

Avoid building each page as an isolated visual system.

17. UI/UX PRO MAX

If the project already uses or is intended to use UI/UX Pro Max, inspect and preserve that workflow where useful.

A previous project workflow used:

npm install -g ui-ux-pro-max-cli

and:

uipro init –ai claude –global

Do not reinstall or alter tooling unnecessarily if it is already present.

Use the project’s existing tooling rather than creating competing systems.

18. EXISTING WEBSITE CODE

The existing website is valuable.

Do not assume it should be thrown away.

First determine:

* What is already good
* What is incomplete
* What is broken
* What is temporary
* What should be refactored
* What should remain untouched

When a component is already strong, preserve it.

When something is structurally wrong, explain why before replacing it.

19. BUSINESS CONTEXT

This is being developed for a real solo detailing business.

The business currently focuses on detailing services and intends to expand capabilities over time.

Future capabilities may include more advanced polishing/correction and ceramic-coating-related services, but future offerings must not be represented as currently available unless they have actually been finalized and implemented.

The application should therefore be architected so additional services can be added later without rebuilding the booking system.

20. SUPPORT / CUSTOMER EXPERIENCE

The booking experience should provide customers with an obvious way to get help, including phone/text contact where specified by the existing project requirements.

Do not invent a phone number.

Use a placeholder/configuration value if one has not been supplied.

21. DATA MODEL PRINCIPLES

The system should eventually support relationships similar to:

User
→ Customer profile
→ Vehicles
→ Appointments
→ Appointment history

Appointments should reference controlled service information.

Important booking information should be preserved historically.

Do not design historical appointments so they dynamically change merely because today’s service price changes.

22. SECURITY PRINCIPLES

Treat all browser input as untrusted.

Never trust:

* Submitted price
* Submitted role
* Submitted user ID
* Submitted appointment ownership
* Submitted service permissions
* Submitted availability
* Submitted internal status
* Submitted administrative fields

Validate sensitive business logic server-side/database-side.

Check for:

* IDOR risks
* Privilege escalation
* RLS bypasses
* Unsafe SECURITY DEFINER functions
* Function execution privileges
* Unrestricted table writes
* Client-controlled pricing
* Client-controlled role fields
* Cross-customer data exposure
* Booking manipulation
* Appointment enumeration
* Unauthorized updates/deletes

23. DATABASE MIGRATION DISCIPLINE

Migrations need to be deterministic and understandable.

Do not casually edit history as though Migration 001 never existed.

If Migration 001 has a serious problem, determine whether:

* It can be safely hardened
* A corrective migration is appropriate
* It has not yet been deployed and can still be amended
* Data migration is required

Explain the reasoning.

Migration 002 should not begin until the Migration 001 audit is complete and the required corrections are understood.

24. HOW I WANT YOU TO WORK

Use this workflow:

PHASE A — DISCOVER
Inspect the entire project.

PHASE B — RECONCILE
Compare requirements, project documents, previous decisions, and implementation.

PHASE C — AUDIT
Audit the current implementation, especially Migration 001.

PHASE D — REPORT
Give me a clear technical report.

PHASE E — APPROVAL
Identify changes that require my approval.

PHASE F — IMPLEMENT
Only after the audit/approval, implement the agreed changes.

PHASE G — VERIFY
Run appropriate tests, type checks, builds, database checks, and security validation.

PHASE H — DOCUMENT
Record exactly what changed and why.

25. FIRST RESPONSE REQUIREMENT

For your FIRST response to this prompt, do NOT start changing files.

Instead, perform the discovery/reconciliation/audit work that can be performed from the available project context.

Then give me:

A. PROJECT UNDERSTANDING

A concise but comprehensive explanation showing that you understand what Alchemist Detailing is building.

B. SOURCE-OF-TRUTH MAP

Identify which project documents/code/configuration appear to represent the current truth.

C. CURRENT ARCHITECTURE

Describe the current frontend, backend, database, authentication, booking, and authorization architecture based on what you actually find.

D. REQUIREMENTS MATRIX

Classify requirements into:

* Locked
* Implemented
* Planned
* Deferred
* Placeholder
* Ambiguous
* Conflicting

E. MIGRATION 001 AUDIT

Perform the full audit described above.

F. SECURITY AUDIT

Specifically identify security/RLS/authentication/authorization risks.

G. BOOKING AUDIT

Trace the complete booking flow and identify pricing, availability, concurrency, validation, spam/review, and historical-data issues.

H. CURRENT BUGS / TECHNICAL DEBT

Separate real problems from things that are simply future work.

I. PROPOSED CHANGES

List the exact changes you believe should be made, grouped by priority.

Do not implement them yet unless a change is clearly required to safely inspect or run the project.

J. MIGRATION 002 READINESS

Tell me what must be resolved before Migration 002 should begin.

K. QUESTIONS / APPROVALS

Only ask me questions where the answer genuinely cannot be determined from the existing project/context.

Do not ask me to repeat information that already exists in the project.

26. MOST IMPORTANT RULE

You are not starting from zero.

You are inheriting an existing project with a history.

Preserve that history.

Use the entire available project context.

Do not discard previous decisions.

Do not blindly trust old decisions either.

Reconcile them.

Do not invent requirements.

Do not prematurely code.

Do not jump to Migration 002.

First understand.
Then audit.
Then report.
Then get approval where necessary.
Then implement.
Then verify.

Your job is to help turn Alchemist Detailing into a polished, secure, production-ready application while maintaining a clean development history and avoiding unnecessary rewrites.

Start with discovery and the Migration 001 audit.
# Homepage preview (Oct 3, 2026)

The first frontend build: the homepage, the services page, and placeholder pages for everything else. Source files are in `alchemist/site/` in this Project; the published preview is the "Alchemist Detailing" artifact.

## What's built

- **Glass bar:** menu button (presses in, gold ring), the page name in the centre (animates on change), the AD mark and the account button.
- **Side menu:** smoked glass from the left, items staggered 28 ms apart, gold line on hover and on the current page, Book Now and the phone number at the foot.
- **Hero:** live WebGL paint with water beads and a moving gold light. Two scenes ("beads" and "gloss") alternate on each visit. Then ALCHEMIST / DETAILING, "Precision. Protection. Perfection.", Book Now and Explore Services.
- **The Alchemist Standard:** emblem, the statement from the design notes, and the logo tagline.
- **The wash:** scroll-controlled. The cannon slides in and sprays, foam builds from the edges until the screen is almost covered, a rinse sheet sweeps it away, and the four service cards appear. Scrolling back reverses it. The spray only fires while you scroll forward.
- **Service cards:** Exterior from $49.99, Interior from $59.99, Bundles from $99.99, Protection from $44.99. Card pictures are drawn in WebGL: glossy paint, quilted leather with gold stitching, paint meeting leather, water beads.
- **Why Alchemist, How booking works, closing call to action, footer.**
- **Services page:** the full menu with prices and what each service includes, taken word for word from the database seed.
- **Booking transition:** Book Now lifts and a gold light crosses the screen.
- **Fallbacks:** reduced motion shows the services directly; no WebGL shows a still background.

## Not built yet

Booking app, account, appointments, admin and team pages, reviews, tips, FAQ, about, light mode. Their menu items open placeholder pages that say so.

## Open questions for the owner

1. **Booking step order.** The design notes list 01 Contact, 02 Vehicle, 03 Service, 04 Location, 05 Date & Time, 06 Review. The owner's round-5 decision says location comes first. The homepage follows the owner's decision; the booking app needs a final order.
2. **Completed-appointment gold.** The design notes want $200+ appointments fully gold; the audit records the "$200 gold rule" as dropped. Decide before building Appointments.
3. **Payment methods.** The old prototype listed card, Apple Pay, cash or Zelle. Only the Square reader is confirmed, so the site says "pay in person" for now.
4. **Photos and video** of real work, to replace or sit beside the drawn hero scenes.

## Preview limits

- The preview shows the booking number as text; phone links can be unreliable inside the preview frame.
- The fonts (Cinzel, Manrope, Cormorant Garamond) load from Google Fonts.

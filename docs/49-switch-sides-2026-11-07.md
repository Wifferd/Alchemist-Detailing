# Doc 49: "Switch sides" at the bottom of the menu (Nov 7, 2026)

## The owner's words

Nov 7, 2026, changing their answer to doc 47's question 2 (doc 48): "2 make manager and admine see “switch sides” bottom of the left menu button".

So detailers keep "My jobs", and the admin and managers get "Switch sides" at the bottom of the menu that opens from the left button (the three lines at the top left).

## What changed

**Who sees what in the menu:**

| Signed in on this browser | In the menu |
|---|---|
| The admin or an active manager | **Switch sides**, the very last thing in the menu, under the phone number. The "Requests · Team" item is gone for them. |
| A detailer | "My jobs · Team" in the list, as before (it opens the Team page). No Switch sides. |
| A customer, a visitor, an inactive team member | Nothing new. |
| A login whose role couldn't be read (a weak connection) | No change from what was there. |

**What Switch sides does:**

- **On the website** (any page that isn't Admin or Team), it goes to the Admin page: the Admin screen last open in this tab (for example Calendar), or Requests if none was open yet. Its small gold tag says **Requests**.
- **On the Admin page or the Team page**, it goes back to the website page last open in this tab (for example Services, at the Exterior group, or Book Now), or Home if none was open yet. Its tag says **Website**.
- So a round trip is one tap each way: the website page → Switch sides → the Admin screen they were on → Switch sides → the same website page.
- The memory lasts while the tab is open. Nothing is saved on the device.
- It is a normal link: tapping it closes the menu, and a long press can copy or open it in a new tab.

**How it looks:**

- A full-width glass button like "Light mode", with a thin gold edge, a small two-way-arrows icon, the words "Switch sides" and the gold tag ("Requests" or "Website").
- 48 px tall, so it is easy to tap.
- Works in dark and light mode and with reduced motion. It is never marked as the current page.
- Screen readers hear "Switch sides, to Requests" or "Switch sides, back to the website". It is the last stop when tabbing through the menu.

**Room at the bottom of the menu:**

- The menu's bottom spacing (including the space for the iPhone home bar) now sits inside the menu's foot. So when the menu scrolls, it always ends below Switch sides, and the home bar can't cover it.
- On a 390 × 844 phone the admin's menu scrolls 43 px to reach it. On a 360 × 640 phone it scrolls 233 px. On a 1280 × 900 screen it doesn't scroll.

**Kept as it was:**

- The account page's team card with "Open Requests".
- The footer's "Team sign-in" link.
- The Team page's "Open Requests" line, and the Admin page's "Open my jobs" for a detailer.
- The typed addresses /admin, /requests and /team.
- The "Are you sure?" step before Confirm, and everything about bookings.

**Files:** `site/index.html` (the button in the menu's foot; the detailer's item is now always "My jobs" to `#team`), `site/js/app.js` (`showDoor`, `note`, `markDoor`, and the router remembers each side's last page, including Admin screens that change without a new address), `site/css/alchemist.css` (`.switch-side`, and the bottom spacing moved into `.menu-foot`).

## How it was checked

**Preview mode** (no database; the preview admin, manager and detailer), at 360 × 640 and 390 × 844 (touch) and 1280 × 900 (mouse), in dark and light, with and without reduced motion (eight runs). 31 checks per run, all passed on every run, with no page errors:

- the place (last in the menu), the tag, the link and the spoken name on the website and on an Admin screen;
- the round trip: Services at the Exterior group → Switch sides → the Admin page → Calendar → Switch sides → back to Services at Exterior → Switch sides → Calendar again (also with the keyboard's Enter key);
- the browser's Back button, then Switch sides still going to Calendar;
- the menu closes after the tap;
- Tab ends on Switch sides, and Shift+Tab from the first item goes to it;
- 48 px tall and as wide as the other buttons;
- a manager the same way (starting from Reviews), and a manager on the Team page sees "Website";
- a detailer sees "My jobs" (marked current on the Team page) and no Switch sides;
- a visitor, a customer and an inactive manager see nothing new;
- after Sign out it is gone.

**iPhone home bar:** with the home bar's space emulated (34 px at the bottom), Switch sides stays 24 px above it when the menu is scrolled to the bottom, at all three sizes.

**Live mode against the test database** (its real recorded answers, nothing written anywhere):

- The Sweep admin signed in with password and authenticator and switched both ways twice at 390 px (dark) and 1280 px (light): the memory followed Services at Exterior and the Requests screen. After Sign out it was gone.
- The Sweep manager (a stored login) switched from Home to Requests and back.
- The Sweep detailer saw "My jobs", and the Sweep customer and a visitor saw nothing new. The visitor's page made no request to the database.
- A few list answers that depend on today's date weren't in the recordings, so those lists showed their error note in the test. Switch sides doesn't depend on them.

**Also:**

- The four screenshot tools (booking, admin, team, account) at 390 × 844 ran clean.
- The single-file preview builds and Switch sides works in it.
- Every site script parses.
- A newer script with an older cached page (one without the button) still runs the site, with no door rather than an error.

## Noticed along the way (not changed)

With reduced motion turned on, opening the menu leaves the keyboard focus outside the list until the first Tab press (the menu becomes visible a moment after the focus is placed). Tab still enters the menu. This was already the case before this change.

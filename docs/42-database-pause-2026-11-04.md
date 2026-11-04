# Doc 42: the database pause, and keeping it awake (Nov 4, 2026)

## What happened

On Nov 4 the owner wrote: "supabase needs me to resume my project".

- **Why:** Supabase's free plan pauses a project after about a week with little database activity. This is Supabase's own rule ([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). The site has had no customers yet, so both projects were quiet.
- **The live project ("Alchemist Detailing"):** the owner resumed it. It came back healthy by 19:56 UTC with everything intact:
  - 12 services;
  - guest booking on;
  - the 5 weekly-closure rows;
  - `get_public_settings` answering;
  - no bookings, and none in `office.requests`, the same as before the pause.
- **The test project ("Alchemist Test"):** it was paused too. Resumed from here with the owner's OK.
- **What a visitor saw while it was paused:** after about 20 seconds, the site gave up on the database and ran its preview. The booking page said "Preview — nothing is sent" and gave a made-up reference. A customer could have thought they had booked.

## The owner's answers

| # | Question | The owner said | Done |
|---|----------|----------------|------|
| 1 | Resume the practice project too? | "Yes, resume it" | Resumed with the Supabase MCP `restore_project`. |
| 2 | How to keep it awake? | **"Free scheduled check"**. He was also offered Supabase Pro, $25 a month (never paused), and doing nothing. | `.github/workflows/keep-database-awake.yml`, below. |
| 3 | What should the live site show if the database can't be reached? | "until the booking are sent keep my number there" | Read as: whenever online booking can't send, show his number instead of the preview. Below. |

## The scheduled check

`.github/workflows/keep-database-awake.yml` is a GitHub Actions job. It runs at 01:17, 07:17, 13:17 and 19:17 UTC, and can also be started by hand (Actions, "Keep the database awake", Run workflow).

- **What it does:** it asks each project for `get_public_settings`. This is the same read-only call the site makes on every visit. It uses the publishable keys already public in `site/js/config.js`.
- **Why that should be enough:** Supabase's guide says "a few user requests to the database each day over the previous week is enough", and names API calls as a way to prevent pausing. It is not a guarantee. Supabase still emails the owner before a pause.
- **Brief errors:** a brief error is tried again up to 3 more times, 20 seconds apart. This uses `--fail`: with the body thrown away, `--fail-with-body` can't retry (curl exits 23 after one try, found in review and reproduced on curl 8.5.0).
- **What a red run means:** a project that still doesn't answer turns the run red in the repository's Actions tab. GitHub sends failure notices for a scheduled workflow to the account that last changed its schedule line. That is the account this session pushes with, which may not be the owner's.
- **Limits:**
  - The job only runs from `main`, the default branch.
  - GitHub can delay scheduled runs, or drop one when it is busy.
  - The repository is public, so GitHub's runners cost nothing, and a run takes seconds.
  - In a public repository, GitHub turns scheduled workflows off after 60 days without repository activity. To turn it back on: Actions, then "Keep the database awake", then **Enable workflow**.
- **If the project pauses anyway:**
  1. Go to supabase.com and open the organization.
  2. Open the paused project.
  3. Click **Resume project**.

  A paused project can be resumed for 90 days.
- **The paid way, if ever wanted:** Supabase Pro is $25 a month for the organization, and its projects are not paused for inactivity. An unpaid invoice can still pause them. It includes $10 of compute credits, which covers one project. A second project (the test one) adds about $10 a month, unless it is moved to its own free organization. Tax may be added.

## The site when the database can't be reached

These changes apply only on the site's own addresses: thealchemistdetailing.com and every `*.vercel.app` address, which includes the test site and the previews.

- **`config.js`** sets `deployed` for those addresses.
- **`data.js`** has `isDown`: deployed, and not live once `init()` has finished.

On those addresses, a database that doesn't answer is treated as an outage, not a preview:

- **Booking:** "Online booking isn't available right now. Call (945) 361-7551 to book.", with a gold Call button. The older "The booking couldn't load" message uses the same layout now. Before, its words and the number fell into columns on a phone.
- **Account and Appointments:** "Your account can't load right now. To book, or about a booking, call (945) 361-7551.", with the Call button. The preview sign-in, where any six digits work, can't appear.
- **Admin and Team:** "The database can't be reached right now. Reload the page in a few minutes." No example data.
- **Gallery:** the before/after slider stays hidden, as it is in live mode until a before photo exists.
- **Reviews:** unchanged. With no reviews it shows "Reviews from Alchemist customers will appear here as they come in.", and the preview has no example reviews. The Google reviews button stays hidden, because there is no link yet.

A local copy or a claude.ai preview runs the preview exactly as before. A claude.ai artifact doesn't include `config.js`, so it is never treated as an outage. The screenshot tools aren't affected: `tools/shoot_*.py` open the site from `file://`, and the design branch's `tools/qa` serves it on 127.0.0.1. That changes if a tool is pointed at a `*.vercel.app` address with `SHOOT_URL`. A page reload tries the database again; until then the note stays.

The shared piece is `U.outage(parts, phone)` in `ui.js`, styled by `.bk-down` in `alchemist.css`.

## Checks (Nov 4)

**An independent review, two reviewers:**
- **The site:** nothing blocking. Run side by side with the base commit, against a stub database, every page's HTML was identical on the live, test and local addresses while the database answered. During an outage, no preview data or preview sign-in was left on thealchemistdetailing.com, www, the test site or a preview address. Light theme contrast was about 8.5:1.
- **The job:** one blocking finding, the retry problem above, now fixed. Confirmed:
  - the keys are the projects' publishable keys;
  - only the `apikey` header is used, as Supabase documents for these keys;
  - `get_public_settings` takes no arguments and is read-only, run as anon;
  - the job needs no token and can't change either database.

**In Chromium, against a local copy:**

- **Served as alchemist-detailing.vercel.app (a host-resolver rule), with every outside request blocked:**
  - every page showed the messages above;
  - the booking page's Call links were `tel:+19453617551`;
  - the Gallery had no slider;
  - no script errors.
- **The same copy served as localhost:** every page showed its preview as before.
- **Pictures:** a phone at 390 px and a desktop, both showing the message centred, the number on one line and the gold button.

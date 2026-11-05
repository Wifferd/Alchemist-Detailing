# 39. The design build: what the owner asked, their answers, and what was built (Nov 5, 2026)

On Oct 20 the owner asked to "just do web design" until they buy Twilio and the domain, with ideas from luxury car brands. On Oct 23 they asked for new animations wherever the site lacks a WOW factor, chose a look and adjusted its gold. This doc records their words, their answers, what was built round by round, what was skipped and why, and what still needs the owner.

The build is on the branch `design-build-wip` (on GitHub). It is **not live**: `main` is the live site, and nothing goes to `main` without the owner's yes. `git log --oneline 6dbb2c7..HEAD` lists every commit, and each commit body says what changed and what was skipped. Doc 41 kept the numbers 39 and 40 for this record and for the Back button (doc 40). The owner's own direction stays in `docs/design-direction-from-owner.md` and `docs/animation-direction-from-owner.md`.

The last review run, panels 9 to 11, is dated Nov 5, 2026. Two container restarts interrupted it: the first cut off panel 9's fix in the middle of the merge of `main`, the second cut off panel 10's re-check.

## What the owner asked

In their words, spelling kept:

- Oct 20: "Take design ideas for the website from luxury car brands like pagani, aston martin, laborghini and etc", then "Also look at Porsche and Bugatti", then "Run till perfect".
- Oct 23: "Add new animations to exsisting or where ever it lacks a WOW factor, something that makes the site POP and look much more apealing than a normal site, something top notch, you may ask questions and please dont make up anything".
- The same day: "By the way, take concepts from luxury websites or other high end websites. Dont take anything cheap, educate yourself on the way the have their texts layed out and try to copy it to make the website feel premium", and "Try improving format, fonts, colors, etc…".

## The owner's answers (Oct 23)

| # | Question | The owner's answer | What it settled | Where it is |
|---|----------|--------------------|-----------------|-------------|
| 1 | Which look? | "Do look C, you can tweak the gold colors saturation" | Look C, "Hypercar": Archivo in expanded light capitals, Cormorant Garamond italic only for the logo tagline and the Table's element names, true neutral blacks, a polished gold of the AD monogram's hue | `bf926ab` [wL1]; the header of `site/css/alchemist.css` |
| 2 | The gold | "Make the gold shade a little less dark and make the gold texts and buttons more vibrant. Keeping professinal tone while you do it" | The same hue; the shaded steps a step lighter; more saturation in the middle and light steps | `cf5b205` [wL2] |
| 3 | Headings | "Tighter capitals (Recommended)" | Capitals, tighter, centred. The option also put the booking's step questions in sentence case: round wL1 first read it as capitals everywhere, panel 8 found the option's wording, and `471ab00` [p08] made the six questions sentence case | `bf926ab` [wL1]; `471ab00` [p08]; phone heads centred in `9e29390` [p09] |
| 4 | Book Now | "Moving reflection (Recommended)" | Keeps its gold, adds a reflection that moves with the page's scroll and a press feel. No bevel, no brushed grain | `85b28d3` [w05] (`glareHero`); the reflection set at the light's 118deg in `9e29390` [p09] |
| 5 | What to retire | "Counting numbers" | ONLY the counting numbers: figures such as "60 min" and "+2.5%" arrive set. The hero's ALCHEMIST letter tilt and the Gallery tilt stay | `3ff5e3d` [w12] (`app.js`: "the owner, Oct 23: no number counts up"); tilts kept in `1a15c8f`, `789f192`, `96ad658` |
| 6 | The home page's story | "Beads now, interior later (Recommended)" | Live water beads on the closing "Shine like gold" band, once a visit. An Interior chapter only once a real interior photo exists | `789f192` [w08]; no Interior chapter yet |

## Look C and the gold

**Fonts.** The live site uses Jost for headlines and Manrope for the interface. Look C uses one family, **Archivo** (variable: width 100 to 125, weight 300 to 700), whose width does the work: expanded light capitals for statements (125%, 112% on a phone, weight 300), a semi-expanded width for titles (112%), the plain width for the interface. Each width has an Arial-based metric fallback face, so nothing moves when the font arrives. **Cormorant Garamond** italic 500 stays for the logo tagline ("Our chemicals make your car shine like gold ✦") and the Table's element names. Round wL1 also re-derived the type system for Archivo: a nine-step fluid scale (`--t-0` to `--t-8`), on round r09's five tracking steps and 11 px floor.

**The gold.** One ramp, `--au-900` to `--au-50`, the same in both themes. `--gold` is `--au-500`, `--gold-hi` is `--au-200`, and `--gold-s1` to `--gold-s6` make the polish (`--gold-grad`, Book Now's `--gold-base` and `--gold-glare`).

| Token | Live site (`main`) | Look C's first proof (`bf926ab`) | After the owner's gold answer (`cf5b205`) |
|-------|--------------------|----------------------------------|-------------------------------------------|
| `--au-900` | | #8e6320 | #9c6c16 |
| `--au-700` (`--gold-s1`) | | #ae7a2a | #c08720 |
| `--au-600` (`--gold-s6`) | | #c9903b | #da9c30 |
| `--au-500` (`--gold`) | `--gold` #e2b952 | #ebb758 | #f5ba4c |
| `--au-300` (`--gold-s3`) | | #f6ce7f | #face78 |
| `--au-200` (`--gold-hi`) | `--gold-hi` #f8dd98 | #fadc9c | #fddd97 |
| `--au-100`, `--au-50` | | #fff6dc, #fffaf0 | unchanged |
| `--gold-s2`, `--gold-s5` | | #dca347, #f1be63 | #eaab3f, #f9c157 |
| `--gold-text` lower stops | | #be8732, #f5ca72 | #d09227, #fbca6a (now `--gold-t4`, `--gold-t5`) |
| `--gold-rgb` | | 235, 183, 88 | 245, 186, 76 |
| Light theme `--gold` | #b8902c | #9c7026 | #a16e10 |
| Light theme small gold text | #7a5d14 | #7c5818 | `--studio-gold-ink` #805707 |

From the wL2 commit: the changed steps sit at 37.9 to 41.2 degrees of hue; no glow, element or motion was added; gold stays about 1 to 3% of the screen's pixels; black on the button's darkest step went from 5.3:1 to 6.4:1. In the light theme each gold keeps its brightness (so its contrast on cream) and gains saturation. Not regraded: the hero shader's amber and core, the no-WebGL hero band, and the light theme's gold shadows and sheens (they would read as added glow).

## What was built, round by round

What a visitor now sees, from the commit bodies.

### The first rounds (Oct 20 to 22)

Thirteen judged rounds (r01 to r13 in the build's notes) and four whole-site polish passes, committed up to `7521da8`. On Oct 22 a resumed run went through rounds 2 to 9 again as judged refinement passes (`36db693` to `a94bb9f`), and kept them.

- **The menu** (`e54beb2`, `3695fc6`, round r04-bar-menu): a floating smoked-glass panel with one gold Book Now; nearly solid over the live foam wash.
- **Home after the wash** (`67eba3e`, `047948f`, r05-home): gold means Book (on home only the two Book Nows are gold); a review slot shows nothing until the owner approves a real review; two doorways to Tips and About in the owner's approved words.
- **The brand pages** (`51291d4`, `1e0e8ff`, r06-pages): Contact, Reviews, Gallery, Tips and About as finished pages; the photo viewer laid out for landscape screens; Reviews explains its rules in four numbered lines; Tips puts the gold on the numbers. Doc 38 (`26a07e8`) holds what this round put to the owner.
- **Booking as an Alchemist application** (`0663442`, `8a4e29b`, `29fbf91`): the calendar follows the service and add-ons; a chosen time stays gold; the phone's Change strip; the month glides; the printed receipt fits one Letter page. No step order, check, payload, price or guest rule changed.
- **One gold light and one type system** (`f845e9e`, `a94bb9f`, r09): one pass of light crosses a thing when it arrives or changes, never loops, and only one plays at a time (the `window.AlchemistLight` queue); the visitor's own choices light at once; a gold hairline replaces the spinner.
- **Signature moments** (`71f0cbc`, r10): water drops forming and rolling on the Protection plate, drawn by the existing WebGL program; drifting light specks in the hero.
- **Account** (`37fe014`, r11): a calm "accounts are coming soon" screen for every visitor.
- **Home, menu and footer** (`a694143`, `36db693`, r12): a true line about booking times; captions only describe the photos; the footer links every page; one phone-icon pattern.
- **Services as car-maker model pages** (`6a916c2`, `fde1b39`): photo plates with an index (01 / 04), spec lines, a chapter bar and the bundle lineup; on phones each bundle part folds under its name.
- **Services, pages and account fixes** (`5f48547`, `4d7effd`): WetGloss described once; the Exterior plate recropped; the bundle saving shown honestly.
- **Polish passes 1 to 4** (`83c9ee9`, `b1db55c`, `cf2c76f`, `7521da8`): 62 judge issues fixed. Among them, the hero became black and gold in both themes (`7521da8`: the cream light-theme hero is gone, an open question below), and the Time, Mobile and History figures counted up once (`b1db55c`, retired by the owner's answer in w12).

### The look (Oct 23)

- **wL1** (`bf926ab`): Look C (above), with balanced two-line titles on phones, Porsche-style dark fades under text on photos, and a gold underline that draws in under links.
- **wL2** (`cf5b205`): the gold change (above). `og.jpg` was regenerated with it.

### The animation program (Oct 23 to 25)

A judged 14-item program with one motion language: one light at 118 degrees, three curves, duration tokens, one moment per section, each moment once and stopped off screen.

- **w04** (`99eaad6`): after the wash, one gold light crosses the four home service cards in turn (about 2.7 s); the photos light just behind it; the prices glint only once the database has confirmed them.
- **w05** (`85b28d3`): taps no longer leave things lit (hover only with a mouse); chosen chips ease in; Book Now's reflection rides the page's scroll; the gold is defined once.
- **w3b** (`1a15c8f`, `b72128a`): the studio light glides 3.6 s across the ALCHEMIST wordmark and glints the AD monogram; the glass bar's top edge catches it. The letter tilt is unchanged.
- **w06** (`c258270`): headings set line by line in smooth steps; the Interior and Protection plate titles wait for their moments.
- **w07** (`2d58869`): the Standard opens like a title card (ring and mark, label, lines 90 ms apart, the script, the facts); its phrase starts white and a warm light turns it gold. No scroll pinning.
- **w08** (`789f192`): water beads up live on the closing "Shine like gold" band, once a visit; the footer's hairline draws out from the middle and the AD mark takes one pass of light.
- **w09** (`96ad658`): an inspection light sweeps the Our work strip and the Gallery photos, at most two crossings in 4 s on the Gallery.
- **w10** (`e1709cb`): on Services the rooms start as soon as a quarter of the plate is on screen: the Exterior rinse crest, the Interior cabin's lights, the Protection beading; each motto word lights with its pool.
- **w12** (`3ff5e3d`): the Alchemist's Table: the Au tile is always readable and the gold spreads from a point in one turn; no number counts up anywhere.
- **w13** (`7d7d68e`): the booking receipt arrives part by part (seal, head, summary, price lines, next steps) with no long task.
- **w14** (`1cc3ff6`): About's hand-drawn mark and the Reviews page's moment play smoothly on a first visit.
- **w1b** (`3461b84`): pages cut through black (the old page draws back in 200 ms, a beat of black, 80 ms, the new one rises 14 px; from above on Back); the menu as a glass cabinet (rows rise 28 ms apart, a gold line under the chosen one); the Light/Dark switch as studio lights (a white softbox band into Light in 0.9 s, the dark closing in to Dark in 0.6 s). A page change never moves the page under a finger.
- `ccfc0c7`: the guest booking note no longer says photos can be texted in (not confirmed); it says photos are optional.

### The final-polish panels (Oct 25 to Nov 5)

Each panel looks at the whole site through four lenses (luxury, motion, rules, the owner's direction), then fixes what is confirmed, has the fix re-checked, and commits or reverts.

- **[p01]** (`09bf232`): About opens sooner (the pen 20% faster); the printed footer stays whole; the wash runs again after the menu opens and closes; the cut's black beat never under 80 ms.
- **[p03]** (`9380126`): the home Our work strip prints all eight photos.
- **[p04]** (`dab34d9`): a calmer phone hero (gold 9.4% of the screen on average, now 5.9%); the Our work light paced; phone page titles 40 px; the preview's example data no longer invents a Camry or an address.
- **[bk]** (`b33be3d`): the Back button (doc 40).
- **[p07]** (`fdeeed7`): no gold focus ring on a heading after Back or Forward; the wordmark's sheen rests on touch under reduced motion.
- **[p08]** (`471ab00`): curly apostrophes and quotes in booking and the staff screens; the booking's step questions in sentence case.
- **QA kit** (`9e76de5`, below), then the live site's Nov 4 work merged in (`e4ffd48`, `4b0f9a2`: the new address, the keep-awake job, the "call us" notes, the Admin email sign-in; docs 41 to 43).
- **Panel 9** (`9e29390`): four majors confirmed and fixed. The branch was behind `main` (fixed by the two merges); on phones the top bar came back at the wash's release with no scroll up; Back with a full-size photo open left the photo on top of a frozen page; three section heads were left-aligned on phones. Also fixed: a shared link opens on its own page (no flash of Home's hero); the hero's picture fades in over its glow; the reduced-motion hero is one composed still, set with the first paint; a touch presses only on a tap or a 90 ms hold, so nothing lights under a scrolling finger; the booking's own step button reads "Previous"; the 404 page has the bar; a black floor line where the hero meets the cream page; the Standard's facts as one centred block on phones; the Our work arrows on the head's axis (hidden without JavaScript); Book Now's reflection at 118 degrees; print hides Contact's Online row and ZIP check, the Gallery's filters and an empty before/after frame; the receipt's "When" line no longer breaks inside the time.
- **Panel 10** (`1893144`): clean, no blocker and no major. Its minors were fixed: the phone service cards line up and Protection reads "Added to a detail"; the outage screen has the AD mark in its ring; About hands the page over sooner and a tap releases it; the Light/Dark still path changes text and panels together; on a computer the home cards, the closing band and the Gallery match the text column; the FAQ prints every answer and the Services print is a page shorter; the bar's Back uses the bar's label face; the menu is a plain `div` with the dialog role (it was an `aside`); the receipt's "held until" is in Parker's time zone.
- **Panel 11** (Nov 5): not clean (two blockers, two majors, twelve minors). Its fix was **reverted**: the re-check found it put dark glass over the cream page in the light theme when the hero's bottom edge sits exactly at the top of the screen (the suggested repair, for the next try: `r.bottom > 0` in `darkTopsNow`, and ignore zero-height intersections in `darkIo`). Nothing from panel 11 is in the build. Its findings are open, below.

## What was skipped, and why

- **The foam wash is off limits** (doc 35, confirmed by the owner on their iPhone): the wash's start task was not made smaller (p04); its scroll listener keeps some frames over budget (w06); the iPhone light-theme slide goes to the owner (question 3); the drying of the wet film goes to the owner's iPhone look (question 2). `foam.js` differs from the live site only by its gold colour.
- **Booking logic is off limits**: no step order, check, payload, price or guest rule changed in any round. `data.js` keeps its straight quotes, because its messages copy the database's own text (p08).
- **No real phone here**: every timing comes from Chromium with software graphics on a shared 4-CPU machine. The 4x CPU target of no task over 50 ms was not reached on this machine in w06, and the copy before that round missed it too. The frame-rate guard in w12 was built and removed, because it could not tell a slow phone from this machine.
- **Tried and dropped**: one physical band across the four cards (w04: it crossed all four in 0.3 to 0.4 s); a price glint in preview mode (w04: prices never animate before the database confirms them); the field rim lit at once on phones (w13); photos in a print made before the Our work strip is reached (p03); step names on the booking's step button (p09: they don't fit beside Send Request at 360 px; its spoken label names the step); the wordmark's sheen at 118 degrees (p09: it stays at 100 degrees); durations with no matching token were left as they are (p09).
- **Waiting for a photo**: the Interior chapter on home and an interior cross-fade on Services.
- **Rejected in the program**: a glint on the top bar's monogram and a highlight on the Standard's emblem (w08).
- **The owner's call**: everything in the questions below.
- **CLAUDE.md's design-system section** was left for the owner in rounds r09, wL1, wL2 and panel 7; it is updated with this doc, since it records the owner's own Oct 23 choices.

## Where the build stands (open after panel 11)

**Blockers** (go-live waits on them):

1. **Booking moves the page under a finger** when a database answer arrives late (hard rule 3: no script scroll while a finger is on the glass). `booking.js`'s own scrolls (`window.scrollTo`, `scrollIntoView`) have no finger guard; `app.js` has one (`onGlass`).
2. **The Services stretch has new tasks over 50 ms** at 4x CPU on a 390x844 phone, compared with the live site (hard rule 5). Panel 9 judged them noise; panel 11 measured again and confirmed them. The reverted attempt removed the light queue's forced layout and capped entrances at four a frame; the rest came mostly from the Bead Test's first WebGL frame.

**Majors:**

3. The Standard's tagline and facts arrive after a phone visitor has already scrolled past them.
4. Seven headings are still set on the left, against the owner's "centred" answer (question 5).

**Minors:**

- Cut page text shows in the 12 px strip above the floating bar when the bar comes back mid-page.
- Light theme: a solid ivory bar over the black hero is the brightest thing on the first screen.
- After the wash folds, Why Alchemist is an empty black room for about 1 s on phones.
- Page titles take the gold light again on every revisit within a visit.
- Back then Forward from the booking receipt opens an empty step 01 instead of the receipt.
- The Car care and Our story doors are the only image-free card pair on Home and read like a blog teaser.
- About's first visit keeps its words waiting about 3 s (3.95 s on a computer), and the computer's photo about 1 s longer.
- Light theme: the Services header dissolves into the ivory through a grey band.
- The Bead Test caption "Water lies flat in a film" sits on the brightest part of the gold light.
- The Ritual's "Snow foam" tag measures just under 4.5:1 on phones.
- The Table's row numerals (I, II) are set in Cormorant italic, beyond Look C's "the Table's element names".
- iPhone, light theme: after a flick past the foam the page slides about 2,363 px under a resting thumb (question 3).
- From panel 10's re-check, two notes: Appointments sits 11 px right of centre at 360 px; the FAQ's PDF ends with the footer alone on page 4.

## The QA kit (`tools/qa`)

Kept in the repo since the Nov 4 reset (`9e76de5`); `tools/qa/README.md` has the details. Nothing in it changes `site/`, talks to Supabase or deploys: pages run in preview mode, and `*.supabase.co` is refused.

- `capture.py`: screens of every route, slice by slice, dark and light, computer (1440x900) and phone (390x844).
- `wash.py` with `wash_probe.js`: the iPhone-emulating scroll harness for the foam wash and page changes. Real touch through the browser's debugging protocol, an iOS shim that undoes a script's scroll made under a finger (the doc 35 bug), hidden thumbs, jump detection; modes `ios`, `chromium`, `desk`; 11 scenarios.
- `back_walk.py`: the Back walks (`owner`, `chain`, `reload`, `direct`; doc 40).
- `smoke.py`: every route at computer and phone widths 360, 390 and 440: errors, pictures, requests, sideways scroll.
- `check_site.sh`: all of it in one go, with the older booking, account, admin and team walks; `wash_baseline.txt` holds the live site's wash results (6dbb2c7); `selftest.sh` shows the harness catches the real doc 35 bug on the commit before its fix.
- `QA_DEPLOYED=1`: opens the local copy as thealchemistdetailing.com, so the outage notes (doc 42) can be seen.

```bash
cd /home/user/alchemist-detailing
S=/path/to/a/scratch/folder
tools/qa/check_site.sh $S/check          # about 10 minutes
tools/qa/check_site.sh $S/check wash     # about 35 minutes, with the 33 wash runs and the owner walks
python3 tools/qa/capture.py site $S/screens
python3 tools/qa/wash.py site ios fling
python3 tools/qa/back_walk.py site phone dark all $S/back
```

The browser is the Chromium in `/opt/pw-browsers`, with WebGL in SwiftShader. In the cloud container, Google Fonts load only once the proxy's CA certificates are trusted in `~/.pki/nssdb`; check `document.fonts.status` before judging type. Timings on this machine are upper bounds.

## What still needs the owner

**Before the design goes live**

1. **Go live?** Can the new design replace the live site at thealchemistdetailing.com once the open problems above are fixed and a full re-check passes? It already has the live site's Nov 4 changes (the new address, the phone number when online booking can't send, the Admin email sign-in). Doc 41 records that the design waits for the owner's OK. *Recommendation:* yes, after the fixes and the re-check, and after the owner's own look on their iPhone (question 2).
2. **A 5-minute check on the owner's iPhone, on the preview.** Tell us: the iOS version; whether the light on Book Now slides as you scroll home; at the end of the foam wash, whether the wet film over the service cards fades with the last drops or vanishes at once; in Light mode, flick past the foam and rest your thumb (the page must not move); switch Light and Dark twice (no black flash); open a Gallery photo and swipe back (the photo closes, the page stays); whether the top bar stays away at the end of the wash until you scroll up; whether the beads on the "Shine like gold" band move smoothly, with its title and Book Now up within about a second. Our test browser is Chromium with software graphics, not Safari; the Book Now slide needs iOS 26. *Recommendation:* yes. If the iOS is older than 26 and the owner wants the slide, a small fallback can be added. If the film vanishes at once, a change to its drying is shown to the owner before anything goes live.
3. **One rule in the wash fix (doc 35).** After a quick flick past the foam in the Light theme, our iPhone test shows the page sliding about 2,363 px under a resting thumb. It fails on every run of the design build (60 small scrolls undone) and never on the live site. The cause is the rule that decides a finger has lifted on a still page. May we make it wait 400 ms longer after a lift before the wash gives back its length? Only the owner can reopen doc 35. A separate small jump, seen only when the test slows the phone heavily, also happens on the live site and not on a normal phone. *Recommendation:* yes to the 400 ms, and hold the design's own effects until the wash has finished drying. In a test copy the change fixed the failing case 2 times out of 2 and changed nothing in the other iPhone tests; the wait is invisible. Then the full 125-run test and the owner's iPhone check. Leave the heavy-slowdown jump alone.
4. **Lock the Vercel preview links** (Deployment Protection for previews) so only the owner can open them? A booking made on one goes to the live booking system. *Recommendation:* yes.

**Design choices**

5. **Seven headings are still on the left.** On a computer, Home's "Choose your finish", the Ritual and the Bead Test put the title on the left and a short note on the right (on phones they are centred). The four Services photo titles (Exterior, Interior, Bundles, Protection and add-ons) sit low on the left at every width. Home's head and the plates are on the left on the live site too. Centre all seven? And the small titles inside the booking card and on the price cards: left is OK? *Recommendation:* centre all seven, with the note as a line under the title, checking that the four service cards still fit one laptop screen after the wash; keep the plates on the left only if the owner prefers the car-maker "model page" look. Keep the small card and form titles on the left: forms and spec lists read from the left edge.
6. **Heading words.** (a) The Services page is titled "The Menu"; the owner's direction says "product pages, not restaurant menus". (b) Home says "Four steps to a booked detail", but the booking shows "Step 01 of 06". (c) Three titles take two lines on a phone: FOUR STEPS TO A BOOKED DETAIL, PROTECTION AND ADD-ONS, ONLINE ACCOUNTS ARE COMING SOON (the booking's "Where should we detail it?" now fits one line, in sentence case). *Recommendation:* rename "The Menu" to "Services"; say "How a detail gets booked" and keep the four stages; let the other two break once into balanced lines.
7. **Book Now's two lights.** The reflection that moves as you scroll (the owner's choice) and an older gold sweep that crosses every Book Now on its own every 8 seconds, for the whole visit: the only light on the site that repeats. Keep both? *Recommendation:* keep the scroll reflection and the press; let the sweep cross once when a Book Now first comes on screen, then rest.
8. **The Light-mode hero.** Keep it black and gold, as in the design (a polish round made it so, `7521da8`; no doc records the owner's OK), or go back to the cream hero the live site shows? *Recommendation:* keep black and gold in both themes, the brand's first impression; confirm on the preview.
9. **About's opening.** On a first visit the About page draws the logo by hand before the word ABOUT and the text appear: the title follows as the ring closes, about 2.2 s into the drawing (about 3 s on a phone here, 4 s on a computer, on a slow machine). Keep it, or shorten it? *Recommendation:* bring the title in at about 1.6 s: the pen a little faster, the ring closing as the title rises; once a visit, and scrolling or a tap skips it.
10. **The Standard's phrase** now starts white and turns gold as a light crosses it (`2d58869`). OK? *Recommendation:* keep it: it is the Standard's one moment, it ends gold, and under reduced motion or on a second visit it is simply gold.
11. **The gold light in page titles.** Should it still pass through each page title (Reviews, Gallery, Tips, FAQ, About, Contact) after it rises, or only through the Services header? *Recommendation:* once a visit on each title (today it plays again on every revisit), and keep the Services header's.
12. **The cut between pages:** the black beat is 80 ms. Crisper (about 60 ms) or more cinematic (about 150 ms)? *Recommendation:* keep 80 ms.
13. **story-04**, the home card growing into its Services plate: build it or leave it out? *Recommendation:* leave it out for now; it adds work in the moment right after the wash, where the speed budget is tightest.
14. **A small gold Book button in the top bar** on a computer, always one click away? *Recommendation:* not now: the menu's gold Book Now is one tap away on every page, and the bar stays Back, the page name and the mark.
15. **When a request is sent**, keep both gold lights (the screen sweep and the seal), or only the seal's? *Recommendation:* only the seal's: one light at a time is the site's rule.
16. **PRECISION. PROTECTION. PERFECTION.** in capitals, and the star after the tagline: keep both? *Recommendation:* keep both: the capitals match the other statements, and the star is part of the logo's tagline.
17. **The Au tile shows 79** (gold's atomic number), while the Table's key says the tile shows its place on the menu. Keep 79 and reword the key, or show the menu place? *Recommendation:* keep 79 and reword the key.
18. **The Ritual's step 04** (Hand dry) uses the owner's photo of the side skirt and carbon trim, which shows a "NOT FOR EVERYBODY." decal that no crop removes ([p01]). Keep it, or use another photo? *Recommendation:* keep it if the owner is happy for the sticker to show; otherwise name the photo to use.
19. **Back's defaults** (doc 40): a page opened directly goes to the top of home on Back, and home opened directly hides Back. Keep these? *Recommendation:* keep them: a shared link's Back stays in the site, and a home page opened directly has nothing behind it.

**Content and PROPOSED features**

20. **Reviews and Tips** (doc 38, no answer yet). The Reviews page shows four lines before the first review: "From a customer account, after a completed detail." "Read by the owner before it is shown." "Signed with a first name and last initial." "Reviews of $200+ details are certified gold." Approve or reword? And on Tips, keep the gold on the numbers ("No. 01" to "No. 07") rather than the titles? *Recommendation:* keep both as they are; each review line restates a recorded decision (docs 21, 22, 29).
21. **PROPOSED: Contact's "Your ZIP" box** (`51291d4`): it tells a visitor whether the owner comes to them, with the booking's ZIP list and words. Nobody asked for it. Keep it? *Recommendation:* keep it: it only reads the public service-area ZIPs, it disappears if they can't be read, and it answers a common question.
22. **Contact: email, form and texts.** The owner's direction (section 17) lists Call, Email and a contact form; email and the form are missing. Does (945) 361-7551 take texts, including photos of the car? *Recommendation:* add an email once there is one on the domain; skip a form until an email sender exists, so messages don't go nowhere; if the number takes texts, add "Text us" beside Call, and the guest note can say photos can be texted again.
23. **Appointments in the menu.** While accounts are off it opens the same "coming soon" screen as Account. *Recommendation:* hide Appointments until Twilio and accounts arrive, keep Account.
24. **PROPOSED: ask "What's the inside of the car like?" only with an interior service.** Today every customer answers it at step 02, even for an exterior-only wash, where its fees never apply (doc 24 makes it required with an interior service). *Recommendation:* yes, after the design goes live: move it to the service step and show it only with Interior Basic, Interior Deluxe or a bundle. It is a booking change.
25. **PROPOSED: keep a half-filled booking across a reload.** An iPhone often reloads a tab left to read a text, and the booking then starts again at step 01. Scroll places survive a reload; booking answers don't. *Recommendation:* yes, for that browser tab only, cleared on Send or Cancel; built after the design work, as a booking change.
26. **Did the BMW M2 in the photos get the Hydro Foam Sealant?** If yes, the beading photo's caption can say "Protection at work" again (`a694143`). *Recommendation:* just answer yes or no; the caption changes only on a yes.
27. **Still owed by the owner:** a real interior photo (it unlocks the Interior chapter), before/after pairs (doc 38's shot list), short video clips (under 10 MB each), 3 to 5 sentences of the owner's own story for About and a photo at work, and the Google reviews link. *Recommendation:* send them as they come; they go in as given, and until then the site shows only what exists.

## Before the build goes live

1. Fix the two blockers and the open majors, then have them re-checked.
2. Run the full check with the wash (`tools/qa/check_site.sh … wash`), the Back walks, and a 4x CPU trace against `main`.
3. The owner's answers to questions 3 and 2: if the wash rule changes, the 125-run iPhone test (doc 35) and the owner's iPhone look.
4. If `main` has moved since `b07fced`, merge it into `design-build-wip` again.
5. The owner says yes (question 1). Then merge into `main` and check that both Vercel projects deployed the commit (CLAUDE.md, Hosting).

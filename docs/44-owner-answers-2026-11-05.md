# 44. The owner's answers of Nov 5, 2026: centred headings, the wash's 400 ms wait, locked preview links

The owner answered three of the design build's questions (doc 39, questions 3, 4 and 5) on Nov 5, 2026, after the
panel 11 review. This doc records the answers and what was built from them. The build is still on the branch
`design-build-wip`, not live.

The session kept the owner's exact words for the first answer only ("Centre all seven"). The other two are recorded
as the answers the session received; their wording was not kept, so none is quoted here.

## The answers

| # | Question (doc 39) | The owner's answer | Built |
|---|-------------------|--------------------|-------|
| 5 | Seven headings are still on the left. Centre all seven? | "Centre all seven" | `99b2de4` |
| 3 | One rule in the wash fix (doc 35): may the wash wait 400 ms longer after a lift before it gives back its length? | Yes, approved, and the owner checks the wash on their own iPhone before go-live | `99b2de4` |
| 4 | Lock the Vercel preview links? | Yes: the preview links are now locked (Vercel Authentication on preview deployments) | Nothing in the repo |

## (a) Centre all seven

What is centred, with the short note as a line under the title:

- Home's "Choose your finish" head on a computer;
- the Ritual's and the Bead Test's heads on a computer (on phones they were already centred);
- the four Services photo-plate titles (Exterior, Interior, Bundles, Protection and add-ons), at every size.

Small card and form titles stay on the left (the booking card, the price cards): forms and spec lists read from the
left edge, as doc 39 recommended.

Check: `tools/qa/heads.py` measures each title's offset from its column's centre. On `99b2de4`: within 0.73 px at
1440, 1024, 440, 390 and 360 px, in both themes, under reduced motion and with WebGL off (PASS). Panel 12 (Nov 6)
re-checked that they hold.

## (b) The wash waits 400 ms after a lift

`site/js/foam.js`, `rest.proven()`, rule (b) gains exactly one condition: `&& t - s.tLift >= 400`. A finger's lift
counts as proof that no finger is on the glass only once 400 ms have passed with no scroll. It is the only `foam.js`
change the owner allowed; every other part of doc 35 (the pin, the fold, the release, `--wash-release`, the
section's length) stands.

Results (`tools/qa/README.md`, "The starved-frame slide after the owner's Nov 5 OK"): 125 runs of the iPhone
harness at ordinary load, 0 undos and 0 jumps, every wash folded (before the change, 110 runs had one slide). With
the whole browser held to one core and the CPU slowed 2x to 4x (about 6 to 8 frames a second), the light theme's
`theme` scenario can still slide, as on the live site; that case is left for the owner's iPhone check.

**Before go-live:** the owner checks the wash on their own iPhone (doc 39, question 2).

## (c) The preview links are locked

Vercel Authentication is on for preview deployments, so a preview link opens only for someone signed in to the
team's Vercel account. Nothing in the repository changes for it.

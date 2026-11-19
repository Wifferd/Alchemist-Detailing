# 54. Light mode: Home turns white and gold (Nov 19, 2026)

Branch `light-home` in a worktree, based on live `main` 4b2df4b. Nothing is pushed, nothing is deployed, and no
database was touched.

## The owner's words (Nov 19)

- "Another fix, home page doesnt turn white and gold in white mode".

## What it reverses

Since the polish round of Nov 5 (`7521da8`, doc 39) the Home hero stayed the black showroom in both themes, and over
it the light theme kept the smoked-glass bar (`3cdfa37`). Doc 39 question 8 asked the owner to keep it black or go
back to a light hero; no doc records an answer until now. His Nov 19 words settle it for Home: in light mode the hero
follows the theme.

## As built (`3302c17`, then the contrast fix in the next commit)

- The hero shader paints its studio preset in light mode (ivory paint under a white softbox, the warm bar faint in
  it) and follows the theme toggle live (`hero-gl.js`'s theme observer; `app.js` no longer forces the black preset).
- The hero takes the studio's tokens: the words in ink, Detailing in deep gold ink, Book Now's polished gold, the
  "Services & prices" glass in frosted ivory on a gold hairline, a deeper gold wordmark with a warm gold sheen, ivory
  halos and an ivory clearing behind the words, and a foot that fades into the cream page (no black band).
- The top bar is the ivory glass over the hero from the first paint; the smoked-glass rules over Home are gone.
- No WebGL, no script or reduced motion: an ivory still with a white-and-gold stripe.
- Dark mode is unchanged.
- Contrast on the real hero paint (luminance about .90 to .95): the small words 5.8:1 and up; the wordmark (display
  type, 3:1 floor) 3.7 to 3.9:1 at its lightest stop and about 3.4:1 where the warm sheen peaks on it.

## Left as it was (the owner's call)

- **The Services page header** keeps its dark photo in light mode, with the ivory bar over it.
- **Below the hero**, Home still shows dark photographs (the service cards, Our work, the gallery) and the wash shows
  grey foam and the black foam gun in light mode. The photos are real work photos; the wash is not part of this fix.

## Questions for the owner

1. Should the Services page top turn white and gold in light mode too, or keep the dark photo? *Recommendation:* ask
   him on the preview before this goes live; changing it now would decide for him.
2. The light wordmark is a deeper, more bronze gold so it reads on white. Happy with it on his phone?

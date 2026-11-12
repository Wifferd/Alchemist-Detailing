#!/usr/bin/env python3
"""Makes the wash card's pictures (Migration 009, plan sections 2.4 and 4.3), in flat colours: no gradients, glints
or sparkles (the owner wants a less "AI" look and is choosing a new logo). The AD mark from brand/ad-mark.svg stands in
until he has: its letters and bar, without the four-point stars (--full-mark keeps them). Every file goes to
site/img/wallet/; the SHA-1 of each goes to art-manifest.json, which the Edge Function compiles in and checks each
fetched file against (plan 4.3: a changed site picture is never signed for).

Apple (storeCard, sizes from the HIG change log of 2026-06-08), one folder per card state, each file at @1x, @2x
and @3x, so a pass takes its nine pictures from one place (plan 4.3: <WALLET_ART_URL>/apple/<state>/<file>):
  apple/<n>/strip.png        375 x 144 pt: two rows of five slots, n filled (0 to 10). 10 is gold: every slot
                             filled, on a gold ground. A card past 10 keeps the 10 pictures (it stays gold).
  apple/<n>/icon.png         38 x 38 pt, the mark in gold on black (the lock screen and notifications)
  apple/<n>/logo.png         the mark alone, 50 pt tall, on a clear ground: gold on the black card, the ink on gold
                             on the gold card (10)
  apple/test-<n>/...         the test project's passes (grey ground, plan 2.4) for 0 to 9; test-10 is the gold card,
                             the same as 10
Google (Loyalty), in pixels:
  google/hero-<n>-v1.png       1032 x 812 (plan 2.4), black for 0 to 9, gold for 10 (route G-a: the card takes the
                               hero's dominant colour). A new address per count: Google caches pictures by address.
  google/hero-test-<n>-v1.png  the test look (grey) for 0 to 9; test-10 is the gold one
  google/logo-v1.png           660 x 660, the mark inside a 15% margin, on black

The manifest (site/img/wallet/art-manifest.json) lists the SHA-1 of every file, keyed by its path under img/wallet/
("apple/3/strip@2x.png", "google/hero-3-v1.png"): the Edge Function checks each picture it fetches against it (plan 4.3),
so a changed picture on the site is never signed for.

    python3 tools/wallet/make_wallet_art.py [--ts PATH] [--full-mark]

--ts       also writes the manifest as the Edge Functions' TypeScript module (the shape of
           supabase/functions/_shared/wallet/art-manifest.ts: {version, files}); deploy the function after the site
           (plan 4.3's order: push the site, check both projects deployed it, then deploy the function)
--full-mark  keeps the mark's two four-point stars and their hairlines. By default the art draws the AD letters and
             the bar only: the owner asked for flat art with no sparkles (a less "AI" look) while he picks a new logo

Needs Playwright (Chromium: SHOOT_CHROME, or the one tools/qa/qalib.py finds) and Pillow."""
import argparse, asyncio, hashlib, io, json, pathlib, re, sys

from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'qa'))
import qalib  # noqa: E402  (finds the sandbox's Chromium)

OUT = ROOT / 'site' / 'img' / 'wallet'
SLOTS = 10

# The site's tokens (site/css/alchemist.css, Look C), as flat colours
BLACK = '#000000'        # --bg
TEST_BG = '#1c1c1c'      # --panel-2: the test project's passes (plan 2.4)
GOLD = '#f5ba4c'         # --au-500: a filled slot and its ring, the mark on black
GOLD_DIM = '#9c6c16'     # --au-900: an empty slot's ring
MEMBER_BG = '#da9c30'    # --au-600: the gold card at 10 (plan 2.4 "Colours (member)")
ON_GOLD = '#0d0903'      # --on-gold: ink on the gold card (6.4:1)

# The strip's slots, in points (375 x 144): two rows of five, 48 pt across, 18 pt apart, 14 pt between the rows
STRIP_W, STRIP_H, R, GAP_X, GAP_Y = 375, 144, 24, 18, 14
# The Google hero's slots, in pixels (1032 x 812)
HERO_W, HERO_H, HR, HGAP_X, HGAP_Y = 1032, 812, 70, 48, 60

# The card states: (folder, stamps shown, ground). 10 is the gold card on both projects.
STATES = [(f'{look}{n}', n, ground) for n in range(SLOTS + 1) for look, ground in (('', BLACK), ('test-', TEST_BG))]


def mark_paths(letters):
    """The AD mark's path data from brand/ad-mark.svg (one path, several subpaths). With letters: only the A, the D
    and the bar under them (the four-point stars and their hairlines left out)."""
    svg = (ROOT / 'brand' / 'ad-mark.svg').read_text()
    m = re.search(r'<path[^>]*\sd="([^"]+)"', svg)
    vb = re.search(r'viewBox="([^"]+)"', svg)
    if not m or not vb:
        sys.exit('brand/ad-mark.svg: no path or viewBox')
    d = m.group(1)
    if letters:
        subs = [s.strip() for s in re.findall(r'M[^M]+', d)]
        # the letters are the subpaths drawn with straight lines and the D's bowl; the stars are four C curves round
        # one centre, the hairlines thin rectangles. Kept: the first two (the A with the D's bowl, the bar).
        d = ' '.join(subs[:2])
    return d, [float(v) for v in vb.group(1).split()]


def slot_svg(cx, cy, r, filled, ring, ink, bbox, d, stroke):
    """One slot: a ring, and in a filled one the mark, centred: 62% of the ring's width tall, or 66% of it wide,
    whichever binds (the letters alone are wider than tall)."""
    out = [f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r - stroke / 2:.2f}" fill="none" stroke="{ring}" stroke-width="{stroke:.2f}"/>']
    if filled:
        bx, by, bw, bh = bbox
        h = 2 * r * .62
        s = min(h / bh, 2 * r * .66 / bw)
        tx, ty = cx - (bx + bw / 2) * s, cy - (by + bh / 2) * s
        out.append(f'<path fill="{ink}" transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})" d="{d}"/>')
    return ''.join(out)


def strip_svg(n, ground, bbox, d):
    member = n >= SLOTS
    bg = MEMBER_BG if member else ground
    parts = [f'<rect width="{STRIP_W}" height="{STRIP_H}" fill="{bg}"/>']
    top = STRIP_H / 2 - GAP_Y / 2 - R
    left = (STRIP_W - (5 * 2 * R + 4 * GAP_X)) / 2 + R
    for i in range(SLOTS):
        row, col = divmod(i, 5)
        cx, cy = left + col * (2 * R + GAP_X), top + row * (2 * R + GAP_Y)
        filled = i < n
        ring = ON_GOLD if member else (GOLD if filled else GOLD_DIM)
        parts.append(slot_svg(cx, cy, R, filled, ring, ON_GOLD if member else GOLD, bbox, d, 2 if filled else 1.5))
    return parts, STRIP_W, STRIP_H


def hero_svg(n, ground, bbox, d):
    member = n >= SLOTS
    bg = MEMBER_BG if member else ground
    parts = [f'<rect width="{HERO_W}" height="{HERO_H}" fill="{bg}"/>']
    top = HERO_H / 2 - HGAP_Y / 2 - HR
    left = (HERO_W - (5 * 2 * HR + 4 * HGAP_X)) / 2 + HR
    for i in range(SLOTS):
        row, col = divmod(i, 5)
        cx, cy = left + col * (2 * HR + HGAP_X), top + row * (2 * HR + HGAP_Y)
        filled = i < n
        ring = ON_GOLD if member else (GOLD if filled else GOLD_DIM)
        parts.append(slot_svg(cx, cy, HR, filled, ring, ON_GOLD if member else GOLD, bbox, d, 5 if filled else 4))
    return parts, HERO_W, HERO_H


def mark_only_svg(w, h, frac, ink, bg, bbox, d):
    """The mark centred in a w x h box, frac of its height (or width, whichever binds), on bg (None: clear)."""
    bx, by, bw, bh = bbox
    s = min(h * frac / bh, w * frac / bw)
    tx, ty = w / 2 - (bx + bw / 2) * s, h / 2 - (by + bh / 2) * s
    parts = [f'<rect width="{w}" height="{h}" fill="{bg}"/>'] if bg else []
    parts.append(f'<path fill="{ink}" transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})" d="{d}"/>')
    return parts


def wrap(parts, vw, vh, pw, ph):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{pw}" height="{ph}" '
            f'shape-rendering="geometricPrecision">{"".join(parts)}</svg>')


def png_bytes(img):
    """A PNG as small as it stays faithful: a palette of 64 colours when that is smaller (flat art quantises cleanly),
    otherwise true colour. Deterministic, so the SHA-1s only change when the art does."""
    best = None
    for colors in (None, 64):
        out = img if colors is None else img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
        buf = io.BytesIO()
        out.save(buf, format='PNG', optimize=True)
        if best is None or buf.tell() < len(best):
            best = buf.getvalue()
    return best


async def main(args):
    d, vb = mark_paths(not args.full_mark)
    files = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=qalib.chrome(), args=['--disable-gpu'])
        pg = await b.new_page(device_scale_factor=1)
        # the mark's own box, measured once by the browser (the path's control points overshoot it)
        await pg.set_content(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(map(str, vb))}"><path id="m" d="{d}"/></svg>')
        bb = await pg.evaluate("(() => { const b = document.getElementById('m').getBBox(); return [b.x, b.y, b.width, b.height]; })()")

        async def render(svg, pw, ph, clear):
            await pg.set_viewport_size({'width': pw, 'height': ph})
            await pg.set_content('<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>' + svg + '</body></html>')
            shot = await pg.screenshot(omit_background=clear, clip={'x': 0, 'y': 0, 'width': pw, 'height': ph})
            img = Image.open(io.BytesIO(shot))
            return img.convert('RGBA') if clear else img.convert('RGB')

        def put(rel, data):
            path = OUT / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            files[rel] = hashlib.sha1(data).hexdigest()

        async def save(rel, svg, pw, ph, clear=False):
            put(rel, png_bytes(await render(svg, pw, ph, clear)))

        scales = (('', 1), ('@2x', 2), ('@3x', 3))
        # Apple: the icon (opaque: the system draws its own corners) and the two logos (clear ground), drawn once
        logo_h = 50
        lw = round(logo_h * bb[2] / bb[3] * .84 + 8)   # the mark at 84% of the height, a 4 pt margin each side
        icon, logo, logo_gold = {}, {}, {}
        for suffix, s in scales:
            icon[suffix] = png_bytes(await render(wrap(mark_only_svg(38, 38, .72, GOLD, BLACK, bb, d), 38, 38, 38 * s, 38 * s), 38 * s, 38 * s, False))
            logo[suffix] = png_bytes(await render(wrap(mark_only_svg(lw, logo_h, .84, GOLD, None, bb, d), lw, logo_h, lw * s, logo_h * s), lw * s, logo_h * s, True))
            logo_gold[suffix] = png_bytes(await render(wrap(mark_only_svg(lw, logo_h, .84, ON_GOLD, None, bb, d), lw, logo_h, lw * s, logo_h * s), lw * s, logo_h * s, True))
        # Apple: one folder per state, live and test
        for state, n, ground in STATES:
            parts, vw, vh = strip_svg(n, ground, bb, d)
            for suffix, s in scales:
                await save(f'apple/{state}/strip{suffix}.png', wrap(parts, vw, vh, vw * s, vh * s), vw * s, vh * s)
                put(f'apple/{state}/icon{suffix}.png', icon[suffix])
                put(f'apple/{state}/logo{suffix}.png', logo_gold[suffix] if n >= SLOTS else logo[suffix])
        # Google: the heroes and the programme logo
        for state, n, ground in STATES:
            parts, vw, vh = hero_svg(n, ground, bb, d)
            await save(f'google/hero-{state}-v1.png', wrap(parts, vw, vh, vw, vh), vw, vh)
        await save('google/logo-v1.png', wrap(mark_only_svg(660, 660, .70, GOLD, BLACK, bb, d), 660, 660, 660, 660), 660, 660)
        await b.close()

    manifest = {
        'about': 'Wash card art (tools/wallet/make_wallet_art.py). A state is the card\'s stamps capped at 10 ("10" is '
                 'the gold card), with "test-" for the test project\'s grey look. files: the SHA-1 of each picture, by '
                 'its path under the site\'s img/wallet/.',
        'mark': 'brand/ad-mark.svg, a stand-in until the owner picks the new logo' + ('' if args.full_mark else ' (the AD letters and bar only: no stars)'),
        'slots': SLOTS,
        'apple': {'states': [st for st, _, _ in STATES], 'files': [f'{k}{x}.png' for k in ('icon', 'logo', 'strip') for x, _ in scales]},
        'google': {'heroes': {st: f'google/hero-{st}-v1.png' for st, _, _ in STATES}, 'logo': 'google/logo-v1.png'},
        'files': dict(sorted(files.items())),
    }
    stale = sorted(str(f.relative_to(OUT)) for f in OUT.rglob('*.png') if str(f.relative_to(OUT)) not in files)
    if stale:   # pictures from an older layout: nothing points at them any more
        print('not in the manifest (left from an older run; remove them before committing):', ', '.join(stale))
    (OUT / 'art-manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    if args.ts:
        ts = pathlib.Path(args.ts)
        ts = ts if ts.is_absolute() else ROOT / ts
        ts.parent.mkdir(parents=True, exist_ok=True)
        body = json.dumps({'version': 1, 'files': manifest['files']}, indent=2)
        ts.write_text('// The wallet art\'s fingerprints (plan 4.3): "apple/<state>/<file>.png" and "google/<file>.png" -> SHA-1 (hex).\n'
                      '// Written by tools/wallet/make_wallet_art.py; do not edit by hand. The files are served from site/img/wallet/\n'
                      '// and each is checked against this list before it goes into a pass.\n'
                      'export interface ArtManifest {\n  version: number;\n  files: Record<string, string>;\n}\n\n'
                      f'const manifest: ArtManifest = {body};\nexport default manifest;\n')
    total = sum((OUT / k).stat().st_size for k in files)
    print(f'{len(files)} pictures, {total // 1024} KB, in {OUT.relative_to(ROOT)}; manifest in {OUT.relative_to(ROOT)}/art-manifest.json'
          + (f' and {args.ts}' if args.ts else ''))
    print('mark box (svg units):', ', '.join(f'{v:.1f}' for v in bb))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--ts')
    ap.add_argument('--full-mark', action='store_true')
    asyncio.run(main(ap.parse_args()))

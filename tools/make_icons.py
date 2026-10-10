#!/usr/bin/env python3
"""Makes the site's icons from the brand monogram in site/index.html (the #ad-mark path and its gold
gradient, so the icons follow the mark): icon.svg (a 64-unit black rounded square with the mark at 76% of
its height), favicon.ico (16 and 32), apple-touch-icon.png (180, opaque black), icon-192.png, icon-512.png
and icon-maskable-512.png (opaque, the mark at 60%, inside the launcher's safe zone).
Needs Playwright (set SHOOT_CHROME to a Chromium if Playwright's own isn't installed) and Pillow.
Every PNG is kept under 20 KB (quantised to a palette when it has to be).
    python3 tools/make_icons.py"""
import asyncio, io, os, pathlib, re, sys
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
site = ROOT / 'site'
html = (site / 'index.html').read_text()
sym = re.search(r'<symbol id="ad-mark" viewBox="([^"]+)">\s*<path fill="url\(#adGold\)" d="([^"]+)"/>', html)
grad = re.search(r'<linearGradient id="adGold"[^>]*>\s*(.*?)\s*</linearGradient>', html, re.S)
if not sym or not grad:
    sys.exit('the monogram (#ad-mark and #adGold) was not found in site/index.html')
VX, VY, VW, VH = (float(v) for v in sym.group(1).split())
PATH, STOPS = sym.group(2), grad.group(1)
LIMIT = 20 * 1024


def svg(size, mark, radius, pretty=False):
    """The mark, `mark` of the square's height, centred on a black square whose corners are rounded by
    `radius` (a fraction of the side; 0 = a plain square)."""
    s = size * mark / VH
    tx, ty = (size - VW * s) / 2 - VX * s, (size - VH * s) / 2 - VY * s
    nl = '\n' if pretty else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{nl}'
            f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">{STOPS}</linearGradient></defs>{nl}'
            f'<rect width="{size}" height="{size}" rx="{size * radius:.2f}" fill="#000"/>{nl}'
            f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})"><path fill="url(#g)" d="{PATH}"/></g>{nl}</svg>{nl}')


def small(img, path):
    """Saves a PNG under the limit: as is when it fits, otherwise on a palette of fewer and fewer colours."""
    for colors in (None, 256, 128, 64, 32):
        out = img if colors is None else img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
        buf = io.BytesIO()
        out.save(buf, format='PNG', optimize=True)
        if buf.tell() <= LIMIT:
            path.write_bytes(buf.getvalue())
            return buf.tell(), colors
    raise SystemExit(f'{path.name} would not fit under {LIMIT} bytes')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None)

        async def render(size, mark, radius):
            pg = await b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
            await pg.set_content('<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>' + svg(size, mark, radius) + '</body></html>')
            png = await pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            await pg.close()
            return Image.open(io.BytesIO(png)).convert('RGBA')

        (site / 'icon.svg').write_text(svg(64, .76, 14 / 64, pretty=True))
        report = [('icon.svg', (site / 'icon.svg').stat().st_size, '')]
        for name, size, mark, radius in [('icon-512.png', 512, .76, 14 / 64), ('icon-192.png', 192, .76, 14 / 64), ('apple-touch-icon.png', 180, .76, 0), ('icon-maskable-512.png', 512, .60, 0)]:
            img = await render(size, mark, radius)
            if radius == 0:   # opaque: iOS and the launcher mask draw their own corners
                flat = Image.new('RGB', img.size, (0, 0, 0))
                flat.paste(img, mask=img.split()[3])
                img = flat
            n, colors = small(img, site / name)
            report.append((name, n, f'{colors} colours' if colors else 'true colour'))
        i32, i16 = await render(32, .76, 14 / 64), await render(16, .76, 14 / 64)
        i32.save(site / 'favicon.ico', format='ICO', sizes=[(32, 32), (16, 16)], append_images=[i16])
        report.append(('favicon.ico', (site / 'favicon.ico').stat().st_size, '16 + 32'))
        await b.close()
    for name, n, note in report:
        print(f'{name:24} {n:6} bytes  {note}')


asyncio.run(main())

#!/usr/bin/env python3
"""Renders site/img/og.jpg (1200 x 630), the picture shown when the site's address is shared: the monogram and
the wordmark on black under the gold light, as on the hero. The fonts come from Google Fonts, or from the
same fonts installed locally when those can't be reached (the script says which).
Needs Playwright (set SHOOT_CHROME to a Chromium if Playwright's own isn't installed) and Pillow.
    python3 tools/make_og.py"""
import asyncio, base64, io, os, pathlib
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
site = ROOT / 'site'
out = site / 'img' / 'og.jpg'
mono = 'data:image/webp;base64,' + base64.b64encode((site / 'img' / 'mono-metallic.webp').read_bytes()).decode()
FONTS = 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500&family=Manrope:wght@600&display=block'
HTML = f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FONTS}"><style>
html, body {{ margin: 0; }}
body {{ position: relative; width: 1200px; height: 630px; overflow: hidden; display: grid; place-items: center; background: #000; color: #f7f7f4; font-family: "Manrope", system-ui, sans-serif; }}
.glow {{ position: absolute; inset: 0; background: radial-gradient(55% 60% at 50% 44%, rgba(226, 185, 82, .26), rgba(226, 185, 82, .06) 55%, transparent 76%); }}
.light {{ position: absolute; inset: -30%; background: linear-gradient(118deg, transparent 40%, rgba(226, 185, 82, .07) 47%, rgba(255, 243, 207, .16) 50%, rgba(226, 185, 82, .07) 53%, transparent 60%); }}
.in {{ position: relative; display: grid; justify-items: center; text-align: center; }}
img {{ width: 200px; height: auto; filter: drop-shadow(0 14px 40px rgba(226, 185, 82, .3)); }}
h1 {{ margin: 26px 0 0; font: 400 112px/.92 "Jost", sans-serif; letter-spacing: .14em; text-indent: .14em; text-transform: uppercase; background: linear-gradient(180deg, #fff6d8 0%, #f6dc96 30%, #e2b952 56%, #b88a27 80%, #f0c966 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }}
.l2 {{ margin-top: 18px; display: flex; align-items: center; gap: 22px; font: 500 26px/1 "Jost", sans-serif; letter-spacing: .42em; text-indent: .42em; text-transform: uppercase; color: #f8dd98; }}
.l2::before, .l2::after {{ content: ""; width: 90px; height: 1px; background: linear-gradient(90deg, transparent, #e2b952); }}
.l2::after {{ background: linear-gradient(90deg, #e2b952, transparent); }}
.place {{ margin: 34px 0 0; font: 600 18px/1.5 "Manrope", sans-serif; letter-spacing: .22em; text-transform: uppercase; color: #bdbdb8; }}
</style></head><body><div class="glow"></div><div class="light"></div>
<div class="in"><img src="{mono}" alt=""><h1>Alchemist</h1><div class="l2">Detailing</div><p class="place">Parker, Texas · Mobile within about 10 miles</p></div>
</body></html>'''


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None)
        pg = await b.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        fonts = {'ok': False}
        pg.on('response', lambda r: fonts.update(ok=True) if r.url.startswith('https://fonts.googleapis.com/') and r.ok else None)
        await pg.set_content(HTML)
        await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(400)
        png = await pg.screenshot(clip={'x': 0, 'y': 0, 'width': 1200, 'height': 630})
        await b.close()
    img = Image.open(io.BytesIO(png)).convert('RGB')
    img.save(out, format='JPEG', quality=82, optimize=True)
    print(f'{out.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {out.stat().st_size} bytes  fonts: '
          + ('Google Fonts' if fonts['ok'] else 'Google Fonts unreachable, the locally installed Jost and Manrope were used'))


asyncio.run(main())

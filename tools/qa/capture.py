#!/usr/bin/env python3
"""Screens of every page, slice by slice down each one, for looking at the design.

    capture.py <site_dir> <out_dir>

Writes {theme}-{size}-{route}-NN.png: NN 00 is the first screen, each next one a screen further down (at most
CAP_MAX, default 12). Home: the hero, the screens down to the wash, the wash at three points of its timeline
(window.__alchemist.goTo, where the site has it), the services once it is over, then the screens after it.
Filters (environment): CAP_ROUTES=home,faq  CAP_THEMES=dark,light  CAP_SIZES=desk,phone  CAP_MAX=12
Sizes: desk 1440x900; phone 390x844, touch, 2x pixels. Each screen waits for the fonts, the pictures in view and
the sections' entrances (they rise as they come into view)."""
import asyncio, os, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib
from playwright.async_api import async_playwright

CAP_MAX = int(os.environ.get('CAP_MAX', '12'))
routes = [r for r in os.environ.get('CAP_ROUTES', ','.join(qalib.ROUTES)).split(',') if r]
themes = [t for t in os.environ.get('CAP_THEMES', 'dark,light').split(',') if t]
sizes = [s for s in os.environ.get('CAP_SIZES', 'desk,phone').split(',') if s]


async def shot(pg, path, wait=700):
    await asyncio.sleep(wait / 1000)
    await qalib.settle(pg, 6000)
    try:   # the entrances in view have played (rises, reveals)
        await pg.wait_for_function("""() => document.getAnimations().every((a) => a.playState !== 'running'
            || a.effect.getComputedTiming().endTime === Infinity || a.effect.getComputedTiming().iterations === Infinity)""", timeout=3000)
    except Exception:
        pass
    await pg.screenshot(path=str(path))


async def slices(pg, out, name, start, n0):
    """Screens from scrollY start down to the end of the page, numbered from n0."""
    n = n0
    vh = await pg.evaluate('innerHeight')
    y = start
    while n < CAP_MAX:
        await pg.evaluate(f'window.scrollTo(0, {y})')
        await shot(pg, out / f'{name}-{n:02d}.png')
        n += 1
        h = await pg.evaluate('document.documentElement.scrollHeight')
        if y + vh >= h - 2:
            break
        y = min(y + vh, h - vh)
    return n


async def home(pg, out, name):
    await shot(pg, out / f'{name}-00.png', 2600)   # the hero once its intro has played
    n = 1
    vh = await pg.evaluate('innerHeight')
    top = await pg.evaluate("(() => { const w = document.getElementById('wash'); return w ? scrollY + w.getBoundingClientRect().top : null; })()")
    y = vh
    while top is not None and y < top and n < CAP_MAX:   # down to the wash
        await pg.evaluate(f'window.scrollTo(0, {y})')
        await shot(pg, out / f'{name}-{n:02d}.png')
        n += 1
        y += vh
    has = await pg.evaluate('!!(window.__alchemist && window.__alchemist.goTo)')
    if has:
        await pg.wait_for_function('window.__alchemist.wash || document.documentElement.classList.contains("no-webgl")', timeout=12000)
    if has and await pg.evaluate('!!window.__alchemist.wash'):
        for p in (0.2, 0.45, 0.7):
            if n >= CAP_MAX:
                break
            for k in range(5):   # approached gradually, so the spray reacts as to a scroll
                await pg.evaluate(f'window.__alchemist.goTo({max(0, p - 0.04 + 0.01 * k)})')
                await asyncio.sleep(0.08)
            await shot(pg, out / f'{name}-{n:02d}.png', 500)
            n += 1
        await pg.evaluate('window.__alchemist.goTo(1)')   # finishes the wash, the services at the top
        await asyncio.sleep(1.2)
    elif top is not None:
        await pg.evaluate(f'window.scrollTo(0, {top})')
    start = await pg.evaluate('scrollY')
    await slices(pg, out, name, start, n)


async def main(site, out):
    out.mkdir(parents=True, exist_ok=True)
    with qalib.serve(site) as base:
        async with async_playwright() as p:
            b = await qalib.launch(p)
            for theme in themes:
                for size in sizes:
                    ctx = await qalib.context(b, size, theme)
                    for r in routes:
                        pg = await ctx.new_page()
                        name = f'{theme}-{size}-{r}'
                        try:
                            await pg.goto(qalib.route_url(base, r))
                            await qalib.ready(pg)
                            if r == 'home':
                                await home(pg, out, name)
                            else:
                                await asyncio.sleep(1.2)   # a group route scrolls to its group once its page is built
                                await slices(pg, out, name, await pg.evaluate('scrollY'), 0)
                            print('ok', name, flush=True)
                        except Exception as e:
                            print('FAIL', name, str(e).split('\n')[0][:160], flush=True)
                        await pg.close()
                    await ctx.close()
            await b.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    asyncio.run(main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])))

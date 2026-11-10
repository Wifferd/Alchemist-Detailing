#!/usr/bin/env python3
"""The Back button walks, with real touch (or a mouse and wheel on desk).

    back_walk.py <base_url|site_dir> <phone|desk|n360> <dark|light> <owner|chain|reload|direct|all> [out_dir]

owner   the owner's example: home, through the wash to the service cards, tap Interior, scroll Services a long way
        down, a little up (the bar comes back, Back with it), tap Back: home at the same scrollY (less what the wash
        gave back meanwhile, if it did) with the Interior card at the same place on the screen, within 2 px
chain   home (the Bundles card), a Services group, the FAQ with a question open, Contact; Back three times (each page
        where it was left, the question still open), then Forward
reload  home a little down, the FAQ further down, a reload (the FAQ where it was), Back (home where it was)
direct  the FAQ opened directly: Back shows and goes to the top of home; home opened directly: Back is not visible
        (its computed visibility and opacity, not its hidden attribute)
Home never shows Back, however it is reached (the owner, Nov 10, doc 52): reload and direct also check it on the home
they land on with Back, which has a page of the site behind it.
Prints PASS/FAIL lines and BACK_DONE; with out_dir, a screen of each landing."""
import asyncio, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib, wash
from playwright.async_api import async_playwright

results = []
VIS_JS = """() => { const b = document.getElementById('barBack'); if (!b) return null; const c = getComputedStyle(b), r = b.getBoundingClientRect();
  return { vis: c.visibility, op: +c.opacity, disp: c.display, top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width),
    away: document.getElementById('topbar').classList.contains('away') }; }"""


def say(ok, name, what):
    line = f"{'PASS' if ok else 'FAIL'} {name}: {what}"
    results.append(ok)
    print(line, flush=True)


async def page(b, base, size, theme, route='home'):
    mode = 'desk' if size == 'desk' else 'chromium'
    ctx = await qalib.context(b, size, theme)
    await ctx.add_init_script('window.__QA_CFG = ' + json.dumps({'mode': mode}) + ';\n' + wash.PROBE)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    cdp = await ctx.new_cdp_session(pg)
    await pg.goto(qalib.route_url(base, route))
    await qalib.ready(pg)
    await qalib.settle(pg)
    await asyncio.sleep(1.2)
    r = wash.Run(pg, cdp, mode)
    r.errs = errs
    return ctx, pg, r


async def gone_on_home(pg, name, how, wait=2.0):
    """Back is not visible on home (the owner, Nov 10): hidden, transparent or not laid out, after its fade."""
    t, v = 0.0, None
    while t <= wait:
        v = await pg.evaluate(VIS_JS)
        if bool(v) and (v['vis'] == 'hidden' or v['op'] <= 0.01 or v['disp'] == 'none'):
            say(True, name, f'{how}: Back is not visible on home ({v})')
            return
        await asyncio.sleep(0.2)
        t += 0.2
    say(False, name, f'{how}: Back is still visible on home ({v})')


async def shoot(pg, out, name):
    if out:
        await pg.screenshot(path=str(out / f'{name}.png'))


async def visible(pg, wait=4.0):
    """Back is on the screen: visible, opaque, inside the screen (the bar slides back in: a busy page takes a while)."""
    t = 0.0
    while True:
        v = await pg.evaluate(VIS_JS)
        ok = bool(v) and v['vis'] == 'visible' and v['op'] >= 0.99 and v['disp'] != 'none' and v['top'] >= 0 and v['w'] > 0
        if ok or t >= wait:
            return ok, v
        await asyncio.sleep(0.2)
        t += 0.2


async def here(r):
    """Where a page is left: the bar brought back first (a small move up, as a visitor makes to reach the menu)."""
    await r.show_bar()
    return await r.pg.evaluate('scrollY')


async def back(r):
    await r.show_bar()
    await r.tap('#barBack')


async def into_view(r, sel, top=0.3):
    """Scrolls until sel's top is about top screens down (a finger's slow drags, the wheel on desk)."""
    for _ in range(6):
        t = await r.pg.evaluate(f"document.querySelector('{sel}').getBoundingClientRect().top")
        d = t - r.vh * top
        if abs(d) < 40:
            return
        if r.mode == 'desk':
            await r.slow(abs(d), up=d < 0)
        else:
            await r.stroke(max(-600, min(600, d)), 450, still=200)
            await asyncio.sleep(0.3)
            await r.quiet()


async def down(r, px):
    if r.mode == 'desk':
        await r.slow(px)
    else:
        left = px
        while left > 0:
            await r.stroke(min(600, left), 900, still=180)
            await asyncio.sleep(0.15)
            left -= 600
    await r.quiet()


async def to_cards(r):
    g = await r.geom()
    await r.to(g['top'] + g['pin'] + 0.15 * g['vh'], how='fling')
    await asyncio.sleep(1.0)


async def owner(b, base, size, theme, out):
    name = f'owner {size} {theme}'
    ctx, pg, r = await page(b, base, size, theme)
    card = '#washServices .svc-card[href="#services-interior"]'
    await to_cards(r)
    await into_view(r, card, 0.3)
    await asyncio.sleep(0.8)
    await r.quiet()
    y0, c0 = await pg.evaluate('scrollY'), await pg.evaluate(f"document.querySelector('{card}').getBoundingClientRect().top")
    h0 = await pg.evaluate("document.getElementById('wash').offsetHeight")
    await shoot(pg, out, f'{size}-{theme}-owner-1-home')
    await r.tap(card)
    await r.landed('services')
    say((await pg.evaluate('location.hash')) == '#services-interior', name, 'Interior opens Services at its group')
    await down(r, 2600)
    if r.mode == 'desk':
        await r.slow(150, up=True)
    else:
        await r.stroke(-150, 300, still=250)
    await asyncio.sleep(0.8)
    ok, v = await visible(pg)
    say(ok and not v['away'], name, f'a little up brings the bar and Back back ({v})')
    await shoot(pg, out, f'{size}-{theme}-owner-2-services')
    await back(r)
    await r.landed('home')
    await asyncio.sleep(0.6)
    y1, c1 = await pg.evaluate('scrollY'), await pg.evaluate(f"document.querySelector('{card}').getBoundingClientRect().top")
    h1 = await pg.evaluate("document.getElementById('wash').offsetHeight")
    want = y0 - (h0 - h1)
    say(abs(y1 - want) <= 2 and abs(c1 - c0) <= 2, name, f'Back: home at scrollY {y1} (left at {y0}, the wash gave back {h0 - h1} px), Interior card at {c1:.1f} (was {c0:.1f})')
    await shoot(pg, out, f'{size}-{theme}-owner-3-back')
    if r.errs:
        say(False, name, 'page errors: ' + '; '.join(r.errs[:3]))
    await ctx.close()


async def chain(b, base, size, theme, out):
    name = f'chain {size} {theme}'
    ctx, pg, r = await page(b, base, size, theme)
    card = '#washServices .svc-card[href="#services-bundles"]'
    await to_cards(r)
    await into_view(r, card, 0.35)
    await asyncio.sleep(0.6)
    c_home = await pg.evaluate(f"document.querySelector('{card}').getBoundingClientRect().top")
    await r.tap(card)
    await r.landed('services')
    await down(r, 300)
    y_svc = await here(r)
    await r.menu('#menu nav a[href="#faq"]')
    await r.landed('faq')
    await into_view(r, '.faq-item:nth-of-type(2) summary', 0.4)
    await r.tap('.faq-item:nth-of-type(2) summary')
    await asyncio.sleep(0.8)
    await down(r, 250)
    y_faq, open_faq = await here(r), await pg.evaluate('window.AlchemistContent.opened()')
    await r.menu('#menu nav a[href="#contact"]')
    await r.landed('contact')
    await down(r, 200)
    await shoot(pg, out, f'{size}-{theme}-chain-1-contact')
    await back(r)
    await r.landed('faq')
    y, o = await pg.evaluate('scrollY'), await pg.evaluate('window.AlchemistContent.opened()')
    say(abs(y - y_faq) <= 2 and o == open_faq and o, name, f'Back to the FAQ at {y} (left at {y_faq}), open {o} (was {open_faq})')
    await back(r)
    await r.landed('services')
    y = await pg.evaluate('scrollY')
    say(abs(y - y_svc) <= 2 and (await pg.evaluate('location.hash')) == '#services-bundles', name, f'Back to Services Bundles at {y} (left at {y_svc})')
    await back(r)
    await r.landed('home')
    c = await pg.evaluate(f"document.querySelector('{card}').getBoundingClientRect().top")
    say(abs(c - c_home) <= 2, name, f'Back to home, the Bundles card at {c:.1f} (was {c_home:.1f})')
    await gone_on_home(pg, name, 'home reached by Back from Services')
    await shoot(pg, out, f'{size}-{theme}-chain-2-home')
    await pg.evaluate('history.forward()')
    await r.landed('services')
    y = await pg.evaluate('scrollY')
    say(abs(y - y_svc) <= 2, name, f'Forward to Services at {y} (left at {y_svc})')
    if r.errs:
        say(False, name, 'page errors: ' + '; '.join(r.errs[:3]))
    await ctx.close()


async def reload(b, base, size, theme, out):
    name = f'reload {size} {theme}'
    ctx, pg, r = await page(b, base, size, theme)
    await down(r, 500)
    y_home = await here(r)
    await r.menu('#menu nav a[href="#faq"]')
    await r.landed('faq')
    await down(r, 600)
    y_faq = await here(r)
    await pg.reload()
    await qalib.ready(pg)
    await qalib.settle(pg)
    await asyncio.sleep(1.5)
    y = await pg.evaluate('scrollY')
    say(abs(y - y_faq) <= 2, name, f'the FAQ after a reload at {y} (left at {y_faq})')
    await back(r)
    await r.landed('home')
    y = await pg.evaluate('scrollY')
    say(abs(y - y_home) <= 2, name, f'Back to home at {y} (left at {y_home})')
    await gone_on_home(pg, name, 'home reached by Back, the FAQ behind it')
    await shoot(pg, out, f'{size}-{theme}-reload-home')
    if r.errs:
        say(False, name, 'page errors: ' + '; '.join(r.errs[:3]))
    await ctx.close()


async def direct(b, base, size, theme, out):
    name = f'direct {size} {theme}'
    ctx, pg, r = await page(b, base, size, theme, 'faq')
    ok, v = await visible(pg)
    say(ok, name, f'the FAQ opened directly shows Back ({v})')
    await shoot(pg, out, f'{size}-{theme}-direct-faq')
    await back(r)
    await r.landed('home')
    y = await pg.evaluate('scrollY')
    say(y == 0 and (await pg.evaluate('location.hash')) == '#home', name, f'Back goes to the top of home ({y})')
    await gone_on_home(pg, name, 'home reached from the FAQ opened directly')
    await ctx.close()
    ctx, pg, r = await page(b, base, size, theme, 'home')
    v = await pg.evaluate(VIS_JS)
    gone = bool(v) and (v['vis'] == 'hidden' or v['op'] <= 0.01 or v['disp'] == 'none')
    say(gone, name, f'home opened directly: Back is not visible ({v})')
    await shoot(pg, out, f'{size}-{theme}-direct-home')
    await ctx.close()


WALKS = {'owner': owner, 'chain': chain, 'reload': reload, 'direct': direct}


async def main(base, size, theme, which, out):
    async with async_playwright() as p:
        b = await qalib.launch(p)
        for w in (list(WALKS) if which == 'all' else which.split(',')):
            try:
                await WALKS[w](b, base, size, theme, out)
            except Exception as e:
                say(False, f'{w} {size} {theme}', 'stopped: ' + str(e).split('\n')[0][:200])
        await b.close()
    print('BACK_DONE', 'ok' if all(results) else 'FAIL', flush=True)


if __name__ == '__main__':
    if len(sys.argv) < 5 or sys.argv[2] not in qalib.SIZES or sys.argv[3] not in ('dark', 'light'):
        print(__doc__)
        sys.exit(2)
    target, size, theme, which = sys.argv[1:5]
    out = pathlib.Path(sys.argv[5]) if len(sys.argv) > 5 else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    if target.startswith('http'):
        asyncio.run(main(target if target.endswith('/') else target + '/', size, theme, which, out))
    else:
        with qalib.serve(target) as base:
            asyncio.run(main(base, size, theme, which, out))
    sys.exit(0 if all(results) else 1)

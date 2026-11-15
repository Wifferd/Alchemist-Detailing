#!/usr/bin/env python3
"""Screenshots the wash card's page (#card) and the Admin "Wash cards" screen, in preview mode (the QA kit refuses
every request to Supabase), for the owner and for checks. shoot_card.py <out_dir> [dark|light|both]

The card page: an iPhone, an Android phone and an iPad (390x844 / 820x1180 touch), a computer (1440x900), a narrow
phone (320x640), a holder's own page (#card-<token>: the example card) and reduced motion. The Admin screen: the owner
in the preview: the first screen after a scan (390x844, 390x664 and 1440x900; the first job's button must be on it),
then at 390x844 and 1440x900 the whole screen (its example sync problem at the end), "Complete and stamp" on today's
job (the stamp and its Take back), a stamp from Waiting for a stamp, and a past wash by hand.
Then, in each theme, the Admin screen under reduced motion, and a keyboard-only walk: the card page's controls in
order (each with a focus ring; the privacy note opened with Enter), and the Admin steps (find a card, Complete and stamp,
Take back with a reason, a past wash by hand), checking where the keyboard lands after each.
Each shot is checked for page errors, sideways scroll and missing pictures; the findings are printed."""
import asyncio, os, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / 'qa'))
import qalib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {
    'iphone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'ipad': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
}
CHECK = """() => { const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
  const bad = [...document.images].filter((i) => i.complete && i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc);
  return { wide: sw > W ? sw + ' on ' + W : null, bad, fonts: document.fonts.status }; }"""
found = []


async def page(b, theme, w, h, ua=None, touch=True, reduce=False):
    o = dict(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=touch, has_touch=touch, ignore_https_errors=True,
             reduced_motion='reduce' if reduce else 'no-preference')
    if ua:
        o['user_agent'] = ua
    ctx = await b.new_context(**o)
    if theme == 'light':
        await ctx.add_init_script("try{localStorage.setItem('ad.theme','light')}catch(e){}")
    if ua == UA['ipad']:   # iPadOS Safari: a Mac user agent with touch points
        await ctx.add_init_script("Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 })")
    await ctx.route(lambda u: any(x in u for x in qalib.BLOCK), lambda r: r.abort())
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: found.append(f'pageerror: {str(e)[:160]}'))
    return ctx, pg


async def shot(pg, path, full=True):
    await qalib.settle(pg)
    await asyncio.sleep(1.2)   # the head's lines
    if full:   # the blocks below rise as they come into view: through the page once, then back
        y0 = await pg.evaluate('scrollY')
        h = await pg.evaluate('document.documentElement.scrollHeight')
        for y in range(0, h, 500):
            await pg.evaluate(f'window.scrollTo(0, {y})')
            await asyncio.sleep(0.12)
        await asyncio.sleep(0.8)
        await pg.evaluate(f'window.scrollTo(0, {y0})')
        await asyncio.sleep(0.4)
    r = await pg.evaluate(CHECK)
    if r['wide']:
        found.append(f'{path.name}: sideways scroll {r["wide"]}')
    for u in r['bad']:
        found.append(f'{path.name}: broken picture {u}')
    await pg.screenshot(path=str(path), full_page=full)
    print('shot', path.name, '' if r['fonts'] == 'loaded' else '(fonts ' + r['fonts'] + ')', flush=True)


async def card(b, base, out, theme):
    for name, w, h, ua, touch in (('iphone', 390, 844, UA['iphone'], True), ('android', 390, 844, UA['android'], True), ('ipad', 820, 1180, UA['ipad'], True),
                                  ('desk', 1440, 900, None, False), ('n320', 320, 640, UA['iphone'], True)):
        ctx, pg = await page(b, theme, w, h, ua, touch)
        await pg.goto(base + '?noadapt#card')
        await pg.wait_for_selector('.wc-page')
        await shot(pg, out / f'{theme}-card-{name}.png')
        if name in ('iphone', 'desk'):
            await pg.goto(base + '?noadapt#card-EXAMPLE')
            await pg.wait_for_selector('.wc-holder')
            await shot(pg, out / f'{theme}-card-holder-{name}.png')
        await ctx.close()
    ctx, pg = await page(b, theme, 390, 844, UA['iphone'], True, reduce=True)
    await pg.goto(base + '?noadapt#card')
    await pg.wait_for_selector('.wc-page')
    await shot(pg, out / f'{theme}-card-iphone-reduced.png')
    await ctx.close()


# the card's first job's button, where the scan lands (it must be on the first screen, no scroll: one tap)
FIRST_GO = """() => { const g = document.querySelector('#wc-card .wc-job .wc-go'); if (!g) return null;
  const r = g.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : innerHeight;
  return { text: g.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: Math.round(vh), y: Math.round(scrollY) }; }"""


async def scan_lands(b, base, out, theme, name, w, h, touch):
    """The card's QR scanned (#admin-cards-<code>): the first screen, with the first job's button on it."""
    ctx, pg = await page(b, theme, w, h, None, touch)
    await pg.goto(base + '?noadapt#admin-cards-K7Q2M9XD')   # as the camera opens it from the card's QR
    await pg.click('text=Look around as the admin')
    await pg.wait_for_selector('#wc-card')
    await shot(pg, out / f'{theme}-admin-scan-{name}.png', full=False)
    r = await pg.evaluate(FIRST_GO)
    if not r or r['top'] < 0 or r['bottom'] > r['vh']:
        found.append(f'{theme}-admin-scan-{name}: the first job\'s button is not on the first screen {r}')
    print('  scan', name, r, flush=True)
    await ctx.close()


async def admin(b, base, out, theme):
    for name, w, h, touch in (('phone', 390, 844, True), ('phone-short', 390, 664, True), ('desk', 1440, 900, False)):
        await scan_lands(b, base, out, theme, name, w, h, touch)
    for name, w, h, touch in (('phone', 390, 844, True), ('desk', 1440, 900, False)):
        ctx, pg = await page(b, theme, w, h, None, touch)
        await pg.goto(base + '?noadapt#admin-cards-K7Q2M9XD')   # as the camera opens it from the card's QR
        await pg.click('text=Look around as the admin')
        await pg.wait_for_selector('#wc-card')
        await shot(pg, out / f'{theme}-admin-cards-{name}.png')
        await pg.click('#wc-card .wc-go >> text=Complete and stamp')
        await pg.wait_for_selector('.wc-last')
        await shot(pg, out / f'{theme}-admin-stamped-{name}.png')
        if name == 'desk':
            await pg.click('.wc-last .link')
            await pg.fill('#wc_unstamp', 'Example: stamped the wrong card')
            await shot(pg, out / f'{theme}-admin-takeback-{name}.png')
            await pg.click('.wc-card .adm-panel .btn-gold')
            await pg.wait_for_function("() => !document.querySelector('.wc-last')")
            await pg.click('text=Add a past wash by hand')
            await pg.fill('#wc_reason', 'Example: a wash before the card existed')
            await shot(pg, out / f'{theme}-admin-byhand-{name}.png')
            await pg.click('.wc-card .adm-panel .btn-gold')
            await pg.wait_for_selector('.wc-last')
            await pg.click('text=Close this card')
            await pg.wait_for_function("() => !document.querySelector('#wc-card')")
            await pg.click('#wc-waiting .wc-go')
            await pg.wait_for_selector('.wc-last')
            await shot(pg, out / f'{theme}-admin-from-waiting-{name}.png')
        await ctx.close()


# where the keyboard is, and whether a focus ring shows there (an outline or a ring drawn with box-shadow; a form
# field's is on its box: the gold ring after Tab, the lit rim otherwise)
FOCUS = """() => { const a = document.activeElement; if (!a || a === document.body) return null;
  const c = getComputedStyle(a.closest('.fld-box') || a), ring = (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== 'none';
  return { tag: a.tagName.toLowerCase(), id: a.id, cls: String(a.className || ''), text: (a.getAttribute('aria-label') || a.textContent || a.value || '').trim().slice(0, 48),
    card: !!a.closest('#cardApp'), admin: !!a.closest('#adminApp'), ring }; }"""


async def keys(b, base, out, theme):
    """Keyboard only (1440x900): the card page's stops in order, each with a visible focus ring, and the privacy note
    opened with Enter; then the Admin screen from the card number to Complete and stamp, Take back with a reason and
    a past wash by hand, checking where the keyboard lands after each step."""
    ctx, pg = await page(b, theme, 1440, 900, None, False)
    await pg.goto(base + '?noadapt#card')
    await pg.wait_for_selector('.wc-page')
    await qalib.settle(pg)
    stops = []
    for _ in range(60):
        await pg.keyboard.press('Tab')
        f = await pg.evaluate(FOCUS)
        if f and f['card']:
            stops.append(f)
            if not f['ring']:
                found.append(f'keys card: no focus ring on {f["tag"]} "{f["text"]}"')
        if f and f['tag'] == 'summary':
            await pg.keyboard.press('Enter')
            if not await pg.evaluate("document.querySelector('.wc-privacy').open"):
                found.append('keys card: Enter did not open the privacy note')
            await pg.screenshot(path=str(out / f'{theme}-keys-card-privacy.png'))
            break
    print('keys card stops:', ' | '.join(f'{x["tag"]} {x["text"]}' for x in stops), flush=True)

    async def at(label, want):
        await asyncio.sleep(0.3)
        f = await pg.evaluate(FOCUS)
        ok = bool(f) and (want(f) if callable(want) else (f['id'] == want or want in f['cls'].split()))
        print(f'keys admin {label}:', 'ok' if ok else 'WRONG', (f or {}).get('tag'), (f or {}).get('id') or (f or {}).get('cls'), (f or {}).get('text'), flush=True)
        if not ok:
            found.append(f'keys admin: after {label} the keyboard is on {f}')
        elif not f['ring'] and f['tag'] not in ('h2', 'div'):
            found.append(f'keys admin: no focus ring after {label} ({f["tag"]} {f["text"]})')

    async def tab_to(pred, limit=40):
        for _ in range(limit):
            await pg.keyboard.press('Tab')
            f = await pg.evaluate(FOCUS)
            if f and pred(f):
                return f
        found.append('keys admin: Tab never reached the control')
        return None

    await pg.goto(base + '?noadapt#admin-cards')
    await pg.wait_for_selector('text=Look around as the admin')
    await pg.get_by_text('Look around as the admin').focus()
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('#wc_code')
    await pg.focus('#wc_code')
    await pg.keyboard.type('k7q2 m9xd')
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('#wc-card')
    await at('Find card', 'wc-card-h')
    await tab_to(lambda f: 'wc-go' in f['cls'].split() and f['text'].startswith('Complete'))
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('.wc-last')
    await at('Complete and stamp', 'wc-last')
    await tab_to(lambda f: f['text'] == 'Take back')
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('#wc_unstamp')
    await at('Take back (open)', 'wc_unstamp')
    await pg.keyboard.type('Example: stamped the wrong card')
    await tab_to(lambda f: f['tag'] == 'button' and f['text'] == 'Take back', 3)
    await pg.screenshot(path=str(out / f'{theme}-keys-admin-takeback.png'))
    await pg.keyboard.press('Enter')
    await pg.wait_for_function("() => !document.querySelector('.wc-last')")
    await at('Take back (done)', 'wc-card-h')
    await tab_to(lambda f: f['id'] == 'wc-hand')
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('#wc_day')
    await at('Add a past wash by hand (open)', 'wc_day')
    await tab_to(lambda f: f['id'] == 'wc_reason', 6)   # (the date box's month, day and year are stops of their own)
    await pg.keyboard.type('Example: a wash before the card existed')
    await tab_to(lambda f: f['text'] == 'Back', 4)
    await pg.keyboard.press('Enter')
    await pg.wait_for_function("() => !document.querySelector('#wc_day')")
    await at('Back (by hand)', 'wc-hand')
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('#wc_day')
    await tab_to(lambda f: f['id'] == 'wc_reason', 6)   # (the date box's month, day and year are stops of their own)
    await pg.keyboard.type('Example: a wash before the card existed')
    await tab_to(lambda f: f['text'] == 'Stamp it', 3)
    await pg.keyboard.press('Enter')
    await pg.wait_for_selector('.wc-last')
    await at('Stamp it (by hand)', 'wc-last')
    await pg.screenshot(path=str(out / f'{theme}-keys-admin-byhand.png'))
    await ctx.close()


async def reduced_admin(b, base, out, theme):
    """The Admin screen under reduced motion (390x844): the card opened, a stamp made, nothing moving."""
    ctx, pg = await page(b, theme, 390, 844, None, True, reduce=True)
    await pg.goto(base + '?noadapt#admin-cards-K7Q2M9XD')
    await pg.click('text=Look around as the admin')
    await pg.wait_for_selector('#wc-card')
    await pg.click('#wc-card .wc-go >> text=Complete and stamp')
    await pg.wait_for_selector('.wc-last')
    await shot(pg, out / f'{theme}-admin-stamped-phone-reduced.png', full=False)
    await ctx.close()


async def main(out, themes):
    out.mkdir(parents=True, exist_ok=True)
    with qalib.serve(ROOT / 'site') as base:
        async with async_playwright() as p:
            b = await qalib.launch(p, gl=False)
            for t in themes:
                await card(b, base, out, t)
                await admin(b, base, out, t)
                await reduced_admin(b, base, out, t)
                await keys(b, base, out, t)
            await b.close()
    print('\n'.join(found) if found else 'no findings')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    t = sys.argv[2] if len(sys.argv) > 2 else 'both'
    asyncio.run(main(pathlib.Path(sys.argv[1]), ['dark', 'light'] if t == 'both' else [t]))

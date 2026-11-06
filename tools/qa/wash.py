#!/usr/bin/env python3
"""The foam wash and page changes under real touch input, frame by frame (doc 35).

    wash.py <site_dir|base_url> <mode|m1,m2|all> <scenario|s1,s2|all>

mode: ios       an iPhone (iOS 26.1 and earlier): a script's scroll under a finger is undone at its next move
                (WebKit bug 310358), the thumb that catches a fling is never heard, no scrollend, no scroll anchoring
      chromium  a Chromium phone (Android): the same touch input, the engine's own flings
      desk      a computer: a mouse wheel (and its momentum) and clicks
Each run prints one JSON line: mode, scenario, err (undos + jumps), worst (the largest jump, px), undos, jumps, bad
(landing or wash checks that failed; the cut scenarios), wash (its state at the end), land (scrollY at the end),
fps (the page's frames a second during the scenario), ms. A jump is a move over 400 px in one frame of what is on the screen that the visitor's input does not explain.
Touch goes through CDP (Input.dispatchTouchEvent): drags, and flings with a momentum tail. To keep a run quick in
SwiftShader the pages draw at 1x pixel density (WASH_DPR to change it) and adapt their resolution (no ?noadapt).
WASH_THEME=light opens the page in the light theme (every scenario but theme, which switches from dark itself).
WASH_FOLD=1 adds after: once the run is scored, a wash not yet folded must still fold (a short drag held still,
then lifted on a still page, is the proof iOS needs), within 20 s, with no undo or jump on the way.
WASH_CPU=4 slows the page's CPU 4x through CDP (Emulation.setCPUThrottlingRate) once it has loaded, for the whole
scenario and the after check: frames starved after a flick, as on a busy phone (the line then carries cpu)."""
import asyncio, json, os, pathlib, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib
from playwright.async_api import async_playwright

PROBE = (pathlib.Path(__file__).resolve().parent / 'wash_probe.js').read_text()
DT = 0.016
DPR = float(os.environ.get('WASH_DPR', '1'))
THEME = os.environ.get('WASH_THEME', 'dark')
FOLD = os.environ.get('WASH_FOLD') == '1'
CPU = float(os.environ.get('WASH_CPU', '1'))
IPHONE_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) '
             'Version/18.6 Mobile/15E148 Safari/604.1')
MODES = {
    'ios': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=DPR, is_mobile=True, has_touch=True, user_agent=IPHONE_UA),
    'chromium': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=DPR, is_mobile=True, has_touch=True),
    'desk': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1),
}
SCENARIOS = ['fling', 'slow', 'hold', 'decay', 'back_rest', 'leave', 'leave_mid', 'second', 'theme', 'touchcut_faq', 'touchcut_home']
# scenarios that need the cut through black and Back (commits w1b and bk): on a site without them the baseline is
# the absolute pass (err 0, undos 0, bad 0)
CUT_SCENARIOS = ['second', 'touchcut_faq', 'touchcut_home']

WASH_JS = """() => { const w = window.__alchemist && window.__alchemist.wash; if (!w) return null;
  const s = w.state ? w.state() : w.debug(); return { p: +(+s.p).toFixed(3), fin: !!(s.finished || s.done), fold: !!s.folded }; }"""
# how the wash gave its length back (foam.js pinFold debug: free, trim, rest, hide, now), where the site reports it
FOLD_JS = """() => { const w = window.__alchemist && window.__alchemist.wash; const d = w && w.debug && w.debug().pin;
  return d ? { how: d.last && d.last.mode, steps: d.steps, trims: d.trims, reverts: d.reverts, undone: d.undone } : null; }"""
# the wash's section in the page: its top, its end, its pinned length (the pin lets go at top + pin), the screen
GEOM_JS = """() => { const s = document.getElementById('wash'), st = document.getElementById('washStage'); if (!s) return null;
  const r = s.getBoundingClientRect(), top = scrollY + r.top;
  return { top, end: top + r.height, pin: r.height - st.offsetHeight, vh: innerHeight }; }"""
CARD = '#washServices .svc-card[href="#services-interior"]'


class Run:
    def __init__(self, pg, cdp, mode):
        self.pg, self.cdp, self.mode = pg, cdp, mode
        self.vw = pg.viewport_size['width']
        self.vh = pg.viewport_size['height']
        self.bad = []
        self.ticks = []
        self.marked = False

    async def mark(self):
        """A gesture begins: the probe takes what scrolls from here to 800ms after quiet() as the input's."""
        if not self.marked:
            self.marked = True
            await self.pg.evaluate('window.__qa && __qa.busy()')

    # ------------------------------------------------------------ input
    async def touch(self, typ, x=None, y=None):
        await self.mark()
        pts = [] if typ in ('touchEnd', 'touchCancel') else [{'x': x, 'y': y, 'id': 0, 'radiusX': 6, 'radiusY': 6, 'force': 1}]
        await self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})

    async def wheel(self, dy, x=None, y=None):
        """A wheel tick, sent at once: the next is not held back until a busy page has taken this one (a slow page
        takes a real wheel's ticks as they come too, in order); quiet() waits for them all."""
        await self.mark()
        self.ticks.append(asyncio.ensure_future(self.cdp.send('Input.dispatchMouseEvent', {
            'type': 'mouseWheel', 'x': x or self.vw / 2, 'y': y or self.vh / 2, 'deltaX': 0, 'deltaY': dy})))
        await asyncio.sleep(0)

    async def stroke(self, dist, speed=1500, hold=0, lift=True, still=0, hidden=False):
        """A finger drag: up by dist px (the page scrolls down; dist < 0 the other way) at speed px/s; hold ms with
        the finger down and still at the end; still ms of stillness before the lift (no fling); hidden: the page never
        hears it (ios)."""
        if hidden:
            await self.pg.evaluate('__qa.hide(1)')
        x = self.vw * 0.5
        y = self.vh * 0.86 if dist > 0 else self.vh * 0.14
        await self.touch('touchStart', x, y)
        n = max(2, int(abs(dist) / (speed * DT)))
        for i in range(n):
            y -= dist / n
            await asyncio.sleep(DT)
            await self.touch('touchMove', x, y)
        if hold:
            await asyncio.sleep(hold / 1000)
        if still:
            await asyncio.sleep(still / 1000)
        if lift:
            await self.touch('touchEnd')
            if hidden:
                await asyncio.sleep(0.08)
                await self.pg.evaluate('__qa.hide(0)')
        return x, y

    async def fling(self, dist=300, speed=2600, v0=42, k=0.95, vmin=1.0, rest=0, tail=None, up=False):
        """A flick and its momentum. ios: the thumb that catches the engine's fling is never heard: the tail is the
        engine's momentum with that thumb on the glass (wash_probe.js coast), then the thumb rests rest ms and drags
        tail px a frame. chromium: the engine's own fling. desk: wheel ticks and a trackpad-like momentum."""
        sgn = -1 if up else 1
        if self.mode == 'desk':
            for _ in range(6):
                await self.wheel(sgn * 100)
                await asyncio.sleep(0.03)
            v = v0 * 1.4
            while v >= vmin * 2:
                await self.wheel(sgn * round(v))
                v *= k
                await asyncio.sleep(0.03)
            if rest:
                await asyncio.sleep(rest / 1000)
            for d in tail or []:
                await self.wheel(sgn * d)
                await asyncio.sleep(0.03)
            await self.quiet()
            return
        if self.mode == 'ios':   # the momentum starts in the page as the finger lifts (wash_probe.js arm)
            await self.pg.evaluate(f'__qa.arm({sgn * v0}, {k}, {vmin})')
        x, y = await self.stroke(sgn * dist, speed)
        if self.mode == 'ios':
            await self.pg.wait_for_function('!!__qa.coasting', timeout=5000)
            await self.touch('touchStart', x, y)   # the hidden thumb (it also stops the engine's own fling)
            await self.pg.evaluate('__qa.coasting')
            if rest:
                await asyncio.sleep(rest / 1000)
            for d in tail or []:
                y -= sgn * d
                await self.touch('touchMove', x, y)
                await asyncio.sleep(DT)
            await self.touch('touchEnd')
            await asyncio.sleep(0.08)
            await self.pg.evaluate('__qa.hide(0)')
        else:
            if rest or tail:   # a thumb rests on the fling's tail, then drags
                await asyncio.sleep(0.5)
                await self.touch('touchStart', x, y)
                if rest:
                    await asyncio.sleep(rest / 1000)
                for d in tail or []:
                    y -= sgn * d
                    await self.touch('touchMove', x, y)
                    await asyncio.sleep(DT)
                await asyncio.sleep(0.15)
                await self.touch('touchEnd')
        await self.quiet()

    async def slow(self, dist, up=False):
        if self.mode == 'desk':
            for _ in range(max(1, int(dist / 50))):
                await self.wheel((-50 if up else 50))
                await asyncio.sleep(0.11)
            await self.quiet()
            return
        await self.stroke(-dist if up else dist, 520, still=180)
        await asyncio.sleep(0.2)

    async def quiet(self, ms=300, limit=6):
        """Until the page has taken every wheel tick sent and has not scrolled for ms."""
        if self.ticks:
            await asyncio.gather(*self.ticks)
            self.ticks = []
        t0 = time.time()
        last, since = None, time.time()
        while time.time() - t0 < limit:
            y = await self.pg.evaluate('scrollY')
            if y != last:
                last, since = y, time.time()
            elif time.time() - since >= ms / 1000:
                break
            await asyncio.sleep(0.05)
        if self.marked:
            self.marked = False
            await self.pg.evaluate('window.__qa && __qa.idle()')

    async def tap(self, sel):
        """A tap (desk: a click) at the middle of sel, once it holds still and nothing covers it (a bar sliding back,
        a panel sliding shut), for 3s at most."""
        box, last = None, None
        for _ in range(30):
            box = await self.pg.evaluate("""(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
                if (!r.width) return null; const x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y);
                return [Math.round(x), Math.round(y), !!h && (h === e || e.contains(h))]; }""", sel)
            if box and box[2] and box == last:
                break
            last = box
            await asyncio.sleep(0.1)
        if not box:
            raise RuntimeError('nothing to tap: ' + sel)
        x, y = box[0], box[1]
        if self.mode == 'desk':
            await self.mark()
            await self.pg.mouse.click(x, y)
        else:
            await self.touch('touchStart', x, y)
            await asyncio.sleep(0.06)
            await self.touch('touchEnd')

    async def show_bar(self):
        """The top bar slides away while scrolling down ([bk]); a small move up brings it back."""
        if await self.pg.evaluate("document.getElementById('topbar').classList.contains('away')"):
            if self.mode == 'desk':
                await self.wheel(-40)
            else:
                await self.stroke(-40, 300, still=200)
            try:   # the bar is back once the page has moved up (a busy page takes the move late)
                await self.pg.wait_for_function("!document.getElementById('topbar').classList.contains('away')", timeout=4000)
            except Exception:
                self.bad.append('the bar did not come back on a move up')
            await asyncio.sleep(0.4)
            await self.quiet(400)

    async def menu(self, link):
        await self.show_bar()
        await self.tap('#menuBtn')
        await self.pg.wait_for_function("document.getElementById('menu').classList.contains('on')", timeout=10000)
        await asyncio.sleep(0.75)   # the rows have risen
        await self.tap(link)

    # ------------------------------------------------------------ reading the page
    async def geom(self):
        return await self.pg.evaluate(GEOM_JS)

    async def wash(self):
        return await self.pg.evaluate(WASH_JS)

    async def card(self):
        return await self.pg.evaluate(f"(() => {{ const e = document.querySelector('{CARD}'); if (!e || !e.getClientRects().length) return null; return e.getBoundingClientRect().top; }})()")

    async def landed(self, route, limit=8):
        """Until the page change to route is over (the black lifted, any view transition done), then still."""
        try:
            await self.pg.wait_for_function("""(r) => (location.hash.slice(1).split('-')[0] || 'home') === r && !(window.__qa && window.__qa.vt)
                && !(document.getElementById('scrim') && document.getElementById('scrim').classList.contains('cut') && document.getElementById('scrim').classList.contains('on'))""",
                                            arg=route, timeout=limit * 1000)
        except Exception:
            self.bad.append(f'never landed on {route}')
        await asyncio.sleep(0.7)
        await self.quiet()

    def check(self, ok, what):
        if not ok:
            self.bad.append(what)

    async def through(self, past=0.6, how='fling', limit=14):
        """On down the page until past the wash's end by past screens (re-measured: a fold shortens it)."""
        for _ in range(limit):
            g = await self.geom()
            if (await self.pg.evaluate('scrollY')) >= g['end'] + past * g['vh'] - g['vh']:
                return
            if how == 'fling':
                await self.fling()
            else:
                await self.slow(600)

    async def to(self, y, how='slow', limit=14):
        """Down the page until scrollY reaches y."""
        for _ in range(limit):
            cur = await self.pg.evaluate('scrollY')
            if cur >= y - 2:
                return
            left = y - cur
            if how == 'fling' and left > 900:
                await self.fling()
            elif self.mode == 'desk':
                await self.slow(min(600, left))
            else:
                await self.stroke(min(600, left), 520, still=180)
                await asyncio.sleep(0.2)

    async def top(self, limit=16):
        for _ in range(limit):
            if (await self.pg.evaluate('scrollY')) <= 0:
                return
            if self.mode == 'desk':   # a fast wheel all the way up
                for _ in range(10):
                    await self.wheel(-400)
                    await asyncio.sleep(0.03)
                await self.quiet()
            else:
                await self.fling(up=True)


# ---------------------------------------------------------------- scenarios
async def s_fling(r):
    await r.through(1.0)
    await asyncio.sleep(1.5)


async def s_slow(r):
    await r.through(1.0, how='slow', limit=20)
    await asyncio.sleep(1.5)


async def s_hold(r):
    g = await r.geom()
    target = g['top'] + g['pin']   # the release
    await r.to(target - 500)
    # the last stretch to the release with the finger down, then it rests there 2.5s, then goes on
    left = max(100, target - await r.pg.evaluate('scrollY'))
    if r.mode == 'desk':
        await r.slow(left + 40)
        await r.mark()
        await r.pg.mouse.move(r.vw * 0.5, r.vh * 0.5)
        await r.pg.mouse.down()
        await asyncio.sleep(2.5)
        await r.pg.mouse.up()
        await r.slow(600)
    else:
        x, y = await r.stroke(min(640, left + 40), 520, hold=2500, lift=False)
        for i in range(30):
            y -= 14
            await asyncio.sleep(DT)
            await r.touch('touchMove', x, y)
        await asyncio.sleep(0.2)
        await r.touch('touchEnd')
    await r.through(1.0)
    await asyncio.sleep(1.5)


async def s_decay(r):
    g = await r.geom()
    await r.to(g['top'] + g['pin'] * 0.55, how='fling')
    # a fling with a long slow tail across the release, a thumb resting on the tail 1.2s, then dragging on
    await r.fling(v0=30, k=0.985, vmin=0.4, rest=1200, tail=[6] * 50)
    await r.through(1.0)
    await asyncio.sleep(1.5)


async def s_back_rest(r):
    g = await r.geom()
    await r.to(g['top'] + g['pin'] + 0.3 * g['vh'], how='fling')
    await asyncio.sleep(1.5)   # a rest on a still page, the finger up
    await r.top()
    await asyncio.sleep(1.0)


async def to_cards(r):
    """Past the release with the cards on the screen, the finger up, the bar back."""
    g = await r.geom()
    await r.to(g['top'] + g['pin'] + 0.15 * g['vh'], how='fling')
    await asyncio.sleep(1.2)
    await r.show_bar()


async def s_leave(r):
    await to_cards(r)
    c0, y0 = await r.card(), await r.pg.evaluate('scrollY')
    await r.menu('#menu nav a[href="#faq"]')
    await r.landed('faq')
    r.check(await r.pg.evaluate('scrollY') == 0, 'FAQ not at its top')
    await r.menu('#menu nav a[href="#home"]')
    await r.landed('home')
    c1 = await r.card()
    r.check(c0 is not None and c1 is not None and abs(c1 - c0) <= 2, f'home not where it was left (card {c0} -> {c1}, y {y0})')


async def s_leave_mid(r):
    g = await r.geom()
    await r.to(g['top'] + g['pin'] * 0.4)
    await asyncio.sleep(0.6)
    await r.show_bar()
    y0, p0 = await r.pg.evaluate('scrollY'), (await r.wash() or {}).get('p')
    await r.menu('#menu nav a[href="#faq"]')
    await r.landed('faq')
    r.check(await r.pg.evaluate('scrollY') == 0, 'FAQ not at its top')
    await r.menu('#menu nav a[href="#home"]')
    await r.landed('home')
    y1 = await r.pg.evaluate('scrollY')
    r.check(abs(y1 - y0) <= 2, f'home not where it was left mid-wash ({y0} -> {y1})')
    await r.through(1.0)
    w = await r.wash()
    r.check(bool(w and w['fin']), 'the wash did not finish after coming back')
    await asyncio.sleep(1.0)


async def s_second(r):
    await to_cards(r)
    c0 = await r.card()
    await r.menu('#menu nav a[href="#faq"]')
    # the second link, the logo, as soon as it can be touched (the menu's panel slides shut over it first), in the cut
    try:
        await r.pg.wait_for_function("""() => { const e = document.querySelector('.topbar .brand-link'), b = e.getBoundingClientRect();
            const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && !!h.closest('.brand-link'); }""", timeout=3000, polling=20)
    except Exception:
        r.bad.append('the logo never came clear of the menu')
    r.check(await r.pg.evaluate("document.getElementById('scrim').classList.contains('cut')"), 'the cut was over before the logo could be touched')
    await r.tap('.topbar .brand-link')
    await r.landed('home')
    c1 = await r.card()
    r.check(c0 is not None and c1 is not None and abs(c1 - c0) <= 2, f'home not where it was left (card {c0} -> {c1})')


async def s_theme(r):
    g = await r.geom()
    await r.to(g['top'] + g['pin'] * 0.5)
    await asyncio.sleep(0.5)
    for want in ('light', 'dark'):
        await r.menu('#themeBtn')
        await asyncio.sleep(1.3)
        theme = await r.pg.evaluate("document.documentElement.getAttribute('data-theme') || 'dark'")
        r.check(theme == want, f'theme is {theme}, not {want}')
        await r.tap('#menuClose')
        await asyncio.sleep(0.7)
        if want == 'light':
            await r.through(0.0)
            await asyncio.sleep(1.0)
    w = await r.wash()
    r.check(bool(w and w['fin']), 'the wash did not finish')
    await asyncio.sleep(1.0)


async def drag_in_black(r):
    """A finger touches and drags in the black just after the link (desk: a mouse press and drag, which ends the cut
    at once)."""
    await asyncio.sleep(0.06)
    if r.mode == 'desk':
        await r.mark()
        x, y = r.vw * 0.5, r.vh * 0.6
        await r.pg.mouse.move(x, y)
        await r.pg.mouse.down()
        for i in range(10):
            await r.pg.mouse.move(x, y + (-12 if i < 6 else 12) * (i % 6 + 1))
            await asyncio.sleep(0.03)
        await r.pg.mouse.up()
        return
    x, y = r.vw * 0.5, r.vh * 0.6
    await r.touch('touchStart', x, y)
    for i in range(25):
        y += (-8 if i < 15 else 8)
        await asyncio.sleep(DT)
        await r.touch('touchMove', x, y)
    await r.touch('touchEnd')


async def s_touchcut_faq(r):
    await to_cards(r)
    p0 = (await r.wash() or {}).get('p')
    await r.menu('#menu nav a[href="#faq"]')
    await drag_in_black(r)
    await r.landed('faq')
    r.check(await r.pg.evaluate('scrollY') == 0, f"FAQ not at its top ({await r.pg.evaluate('scrollY')})")
    p1 = (await r.wash() or {}).get('p')
    r.check(p0 == p1, f'wash progress moved ({p0} -> {p1})')


async def s_touchcut_home(r):
    await to_cards(r)
    c0, p0 = await r.card(), (await r.wash() or {}).get('p')
    await r.menu('#menu nav a[href="#faq"]')
    await r.landed('faq')
    await r.slow(400)
    await asyncio.sleep(0.8)
    await r.show_bar()
    await r.menu('#menu nav a[href="#home"]')
    await drag_in_black(r)
    await r.landed('home')
    c1, p1 = await r.card(), (await r.wash() or {}).get('p')
    r.check(c0 is not None and c1 is not None and abs(c1 - c0) <= 2, f'home not where it was left (card {c0} -> {c1})')
    r.check(p0 == p1, f'wash progress moved ({p0} -> {p1})')


RUNS = {name: globals()['s_' + name] for name in SCENARIOS}

PIN_JS = """() => { const w = window.__alchemist && window.__alchemist.wash; const d = w && w.debug && w.debug().pin;
  return d ? { fold: !!d.folded, creeping: !!d.creeping, how: d.last && d.last.mode, steps: d.steps } : null; }"""


async def fold_after(r):
    """WASH_FOLD=1: a wash the run left unfolded must still fold. Unless it is already creeping, a visitor's finger
    drags 40 px, holds still 200 ms and lifts on a still page (the lift rest.proven() trusts); then up to 20 s."""
    t0 = time.time()
    st = await r.pg.evaluate(PIN_JS)
    if not st:
        return None
    touched = False
    if not st['fold'] and not st['creeping']:
        touched = True
        if r.mode == 'desk':
            await r.slow(50)
        else:
            await r.stroke(40, 300, still=200)
            await r.quiet()
    while time.time() - t0 < 20:
        st = await r.pg.evaluate(PIN_JS)
        if st['fold']:
            break
        await asyncio.sleep(0.1)
    await asyncio.sleep(0.5)
    q = await r.pg.evaluate('({undos: __qa.undos, jumps: __qa.jumps.length, worst: __qa.worst})')
    return dict(fold=st['fold'], how=st['how'], steps=st['steps'], touched=touched, s=round(time.time() - t0, 1), **q)


async def one(browser, base, mode, scenario):
    t0 = time.time()
    ctx = await browser.new_context(ignore_https_errors=True, **MODES[mode])
    await ctx.route(lambda u: any(h in u for h in qalib.BLOCK), lambda rt: rt.abort())
    await ctx.add_init_script('window.__QA_CFG = ' + json.dumps({'mode': mode}) + ';\n' + PROBE)
    if THEME == 'light':   # WASH_THEME=light: the page opens in the light theme (not for theme, which starts dark)
        await ctx.add_init_script("try{localStorage.setItem('ad.theme','light')}catch(e){}")
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    cdp = await ctx.new_cdp_session(pg)
    r = Run(pg, cdp, mode)
    out = {'mode': mode, 'scenario': scenario}
    if THEME == 'light':
        out['theme'] = 'light'
    try:
        await pg.goto(base + '#home')
        await qalib.ready(pg)
        await pg.wait_for_function('window.__alchemist && window.__alchemist.wash', timeout=15000)
        await qalib.settle(pg)
        await asyncio.sleep(1.2)
        if CPU > 1:   # WASH_CPU: the page loaded at full speed; from here its CPU is slowed
            await cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
            out['cpu'] = CPU
        f0, ts = await pg.evaluate('__qa.frames'), time.time()
        await RUNS[scenario](r)
        await asyncio.sleep(0.3)
        fps = round((await pg.evaluate('__qa.frames') - f0) / (time.time() - ts), 1)   # the page's frames a second in the scenario
        q = await pg.evaluate('({undos: __qa.undos, jumps: __qa.jumps, worst: __qa.worst, judged: __qa.judged, frames: __qa.frames, calls: __qa.calls.filter((c) => c.under).slice(0, 6), landedUnder: __qa.landedUnder, swallowed: __qa.swallowed || 0, trace: __qa.trace})')
        out.update(err=q['undos'] + len(q['jumps']), worst=q['worst'], undos=q['undos'], jumps=len(q['jumps']), bad=len(r.bad),
                   wash=await r.wash(), land=round(await pg.evaluate('scrollY')))
        fold = await pg.evaluate(FOLD_JS)
        if fold and out['wash']:
            out['wash']['how'] = fold['how']
        if q['swallowed']:
            out['taps'] = q['swallowed']   # (the hidden thumb's mouse and click events the probe kept from the page: wash_probe.js)
        if q['jumps']:
            out['jump'] = q['jumps'][:3]
        if q['calls']:
            out['under'] = q['calls']
        if q['trace'] and os.environ.get('WASH_TRACE'):   # WASH_TRACE=1: the frames after each undo
            out['trace'] = q['trace']
        if r.bad:
            out['why'] = r.bad
        out['frames'] = q['judged']
        out['fps'] = fps
        if FOLD and out['wash'] is not None:
            out['after'] = await fold_after(r)   # (undos, jumps and worst there are the totals, the run's included)
    except Exception as e:
        out.update(err=-1, worst=-1, undos=-1, jumps=-1, bad=-1, wash=None, land=None, fail=str(e).split('\n')[0][:200])
    if errs:
        out['pageerrors'] = errs[:3]
    out['ms'] = round((time.time() - t0) * 1000)
    await ctx.close()
    return out


async def main(target, mode, scenarios):
    async with async_playwright() as p:
        b = await qalib.launch(p)
        for s in scenarios:
            res = await one(b, target, mode, s)
            print(json.dumps(res), flush=True)
        await b.close()


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    target, mode, sc = sys.argv[1], sys.argv[2], sys.argv[3]
    modes = list(MODES) if mode == 'all' else mode.split(',')
    scs = SCENARIOS if sc == 'all' else sc.split(',')
    for m in modes:
        assert m in MODES, m
    for s in scs:
        assert s in RUNS, s
    if target.startswith('http'):
        for m in modes:
            asyncio.run(main(target if target.endswith('/') else target + '/', m, scs))
    else:
        with qalib.serve(target) as base:
            for m in modes:
                asyncio.run(main(base, m, scs))

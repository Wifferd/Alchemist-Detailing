"""iPhone Safari toolbar emulation through the Home wash (doc 54, Nov 19). Playwright has svh = lvh, so wash.py and
every other run here cannot see a stage sized by the wrong one; run this on a mksim.py copy of site/ instead:
    python3 tools/qa/mksim.py site $S/sim750 750 664
    python3 tools/qa/toolbar.py $S/sim750 $S/tb-light light mixed
It fails (exit 1) when any frame shows the page under the pinned stage (gap > 0: the strip of cream or black the owner
saw under the foam on his iPhone).
 The site copy has vh/lvh = LVH px, svh = SVH px; the viewport
is SVH tall while the toolbar shows and LVH tall once it has collapsed (a scroll down collapses it, a scroll up brings
it back), as Safari does. Touch through CDP. Frames + per-frame geometry + bottom-row colours.
Usage: toolbar.py <site> <out> <theme> <plan> [LVH SVH W]
plan: slow | flick | mixed | keys"""
import asyncio, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np

site, out, theme, plan = sys.argv[1:5]
LVH = int(sys.argv[5]) if len(sys.argv) > 5 else 750
SVH = int(sys.argv[6]) if len(sys.argv) > 6 else 664
W = int(sys.argv[7]) if len(sys.argv) > 7 else 390
IOS = os.environ.get('IOS', '1') == '1'
os.makedirs(out, exist_ok=True)
M = """() => { const q = (s) => document.querySelector(s); const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top*10)/10, Math.round(r.bottom*10)/10]; };
  const w = window.__alchemist && window.__alchemist.wash; let s = null; try { s = w && w.state(); } catch (e) {}
  const sec = q('#wash'), st = q('#washStage');
  return { y: Math.round(scrollY), ih: innerHeight, sec: R(sec), st: R(st), why: R(q('#why')), pos: getComputedStyle(st).position,
    p: s ? +(+s.p).toFixed(3) : null, fin: !!(s && s.finished), fold: !!(s && s.folded), cls: sec.className }; }"""

async def main():
    async with async_playwright() as p:
        b = await qalib.launch(p)
        ctx = await b.new_context(ignore_https_errors=True, viewport={'width': W, 'height': SVH}, device_scale_factor=1, is_mobile=True, has_touch=True,
                                  user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1')
        if theme == 'light':
            await ctx.add_init_script("try{localStorage.setItem('ad.theme','light')}catch(e){}")
        if IOS:
            await ctx.add_init_script("Object.defineProperty(Navigator.prototype,'platform',{get(){return 'iPhone'}});")
        await ctx.route(lambda u: any(h in u for h in qalib.BLOCK), lambda r: r.abort())
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(pg)
        state = {'bar': True, 'i': 0, 'y': 0}
        frames = []
        async def shot(tag):
            m = await pg.evaluate(M)
            m['bar'] = state['bar']; m['tag'] = tag; m['i'] = state['i']
            path = f"{out}/f{state['i']:03d}.png"
            await pg.screenshot(path=path)
            a = np.asarray(Image.open(path).convert('RGB')).astype(int)
            h = a.shape[0]
            rows = a[:, W // 4: 3 * W // 4].mean(axis=1)   # each row's mean colour (middle half)
            m['foot'] = [int(v) for v in rows[h - 3]]
            m['foot100'] = [int(v) for v in rows[max(0, h - 100)]]
            # the largest jump between two adjacent rows in the bottom 160 px
            d = np.abs(np.diff(rows[h - 160:], axis=0)).sum(axis=1)
            k = int(d.argmax()); m['edge'] = [int(h - 160 + k), int(d[k])]
            # page background strip: stage pinned but stops above the screen's foot, inside its own section
            st, sec = m['st'], m['sec']
            m['gap'] = round(m['ih'] - st[1], 1) if (st and sec and st[0] < m['ih'] and st[1] < m['ih'] - 0.5 and sec[1] > st[1] + 0.5) else 0
            frames.append(m); state['i'] += 1
            return m
        async def setbar(on):
            if state['bar'] == on: return
            state['bar'] = on
            await pg.set_viewport_size({'width': W, 'height': SVH if on else LVH})
            await pg.wait_for_timeout(120)
        async def after_scroll(y0):
            y1 = await pg.evaluate('scrollY')
            if y1 > y0 + 10: await setbar(False)
            elif y1 < y0 - 10: await setbar(True)
        async def drag(dist, speed, still=150, flick=False):
            y0 = await pg.evaluate('scrollY')
            vh = SVH if state['bar'] else LVH
            x = W / 2; y = vh * 0.8 if dist > 0 else vh * 0.2
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 0}]})
            n = max(3, int(abs(dist) / (speed * 0.016)))
            for _ in range(n):
                y -= dist / n
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'id': 0}]})
                await asyncio.sleep(0.016)
            if not flick: await asyncio.sleep(still / 1000)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            if flick:
                # frames during the engine's fling
                for k in range(4):
                    await asyncio.sleep(0.12); await shot('fling')
                await pg.wait_for_timeout(700)
            else:
                await pg.wait_for_timeout(120)
            await after_scroll(y0)
        async def key(k):
            y0 = await pg.evaluate('scrollY')
            await pg.keyboard.press(k)
            await pg.wait_for_timeout(250); await shot('key-mid')
            await pg.wait_for_timeout(700)
            await after_scroll(y0)
        with qalib.serve(site) as base:
            await pg.goto(base + '#home')
            await qalib.ready(pg); await qalib.settle(pg); await pg.wait_for_timeout(3000)
            await shot('start')
            top = await pg.evaluate("() => scrollY + document.querySelector('#wash').getBoundingClientRect().top")
            # come down to a screen above the wash with a few drags
            while (await pg.evaluate("() => document.querySelector('#wash').getBoundingClientRect().top")) > 500:
                await drag(260, 900)
            await shot('above')
            t0 = time.time()
            def done(m): return m['why'] and m['why'][0] < -m['ih'] * 0.6
            step = 0
            while time.time() - t0 < 240:
                if plan == 'slow': await drag(140, 520)
                elif plan == 'flick': await drag(300, 2600, flick=True)
                elif plan == 'keys': await key('PageDown' if step % 2 == 0 else 'Space')
                elif plan == 'mixed':
                    # down, then back up mid-pin (toolbar comes back), down again with flicks, slow
                    seq = ['d', 'd', 'd', 'u', 'd', 'f', 'u', 'u', 'f', 'd', 'd', 'f', 'd', 'd', 'd', 'd']
                    c = seq[step % len(seq)]
                    if c == 'd': await drag(160, 600)
                    elif c == 'u': await drag(-180, 600)
                    elif c == 'f': await drag(300, 2600, flick=True)
                step += 1
                m = await shot(plan)
                if done(m): break
            await pg.wait_for_timeout(1800); await shot('rest')
            # come back up through the wash (toolbar returns), slowly then a flick
            for k in range(40):
                await (drag(-300, 2600, flick=True) if k % 3 == 2 else drag(-200, 700))
                m = await shot('up')
                if m['y'] < 50: break
            json.dump({'frames': frames, 'errs': errs}, open(f'{out}/frames.json', 'w'), indent=0)
        await b.close()
        gaps = [f for f in frames if f['gap'] > 0.5]
        print(f"{'FAIL' if gaps or errs else 'ok'} toolbar {theme} {plan}: frames {len(frames)} gap frames {len(gaps)} max gap {max([f['gap'] for f in gaps] or [0])} errors {len(errs)}")
        return 1 if gaps or errs else 0
sys.exit(asyncio.run(main()))

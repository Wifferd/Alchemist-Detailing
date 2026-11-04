#!/usr/bin/env python3
"""A quick look at every page: errors, broken pictures, failed requests, and sideways scroll on phones.

    smoke.py <site_dir|base_url>

Each route opens fresh at desk (1440x900) and at phone widths 360, 390 and 440 (touch), is scrolled to its end
(so lazy pictures load) and back. Prints one line per finding: "ok smoke <size> <route>", "FAIL smoke ..." (a page
error, a console error, a broken picture, a failed request, the page wider than the screen), or "env smoke ..."
(a request this sandbox refused: the proxy, its certificate; the kit's own block of Supabase is not reported)."""
import asyncio, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib
from playwright.async_api import async_playwright

WIDTHS = {'desk': None, 'w360': 360, 'w390': 390, 'w440': 440}
env_seen = set()

WIDE_JS = """() => { const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
  if (sw <= W) return null;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') { out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && el.className.baseVal === undefined ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '')) + ' ' + Math.round(r.right)); if (out.length > 3) break; }
  }
  return { sw, W, els: out }; }"""


async def check(b, base, size, route, sem):
    async with sem:
        w = WIDTHS[size]
        if w is None:
            ctx = await qalib.context(b, 'desk')
        else:
            ctx = await qalib.context(b, 'phone', viewport={'width': w, 'height': 820})
        pg = await ctx.new_page()
        found, env = [], []
        pg.on('pageerror', lambda e: found.append('pageerror: ' + str(e).split('\n')[0][:160]))

        def console(m):
            if m.type != 'error':
                return
            url = (m.location or {}).get('url', '') or ''
            if 'Failed to load resource' in m.text:
                return   # the request itself is reported below
            if qalib.is_env(url):
                return
            found.append('console: ' + m.text[:160])
        pg.on('console', console)

        def failed(rq):
            f = rq.failure or ''
            if any(h in rq.url for h in qalib.BLOCK):
                return
            if qalib.is_env(rq.url, f):
                env.append(f'{rq.url[:90]} {f}')
            else:
                found.append(f'request failed: {rq.url[:120]} {f}')
        pg.on('requestfailed', failed)

        def response(rs):
            if rs.status >= 400:
                (env if qalib.is_env(rs.url) else found).append(f'HTTP {rs.status}: {rs.url[:120]}')
        pg.on('response', response)
        try:
            await pg.goto(qalib.route_url(base, route))
            await qalib.ready(pg)
            await asyncio.sleep(2.0)
            h = await pg.evaluate('document.documentElement.scrollHeight')
            vh = await pg.evaluate('innerHeight')
            for y in range(0, h, max(vh, h // 6)):
                await pg.evaluate(f'window.scrollTo(0, {y})')
                await asyncio.sleep(0.25)
            await pg.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
            await asyncio.sleep(0.8)
            broken = await pg.evaluate("[...document.images].filter((i) => i.complete && i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc)")
            for u in broken:
                (env if qalib.is_env(u) else found).append('broken picture: ' + u[:120])
            if w is not None:
                for y in (0, None):
                    if y is not None:
                        await pg.evaluate('window.scrollTo(0, 0)')
                        await asyncio.sleep(0.3)
                    wide = await pg.evaluate(WIDE_JS)
                    if wide:
                        found.append(f"sideways scroll: page {wide['sw']}px on a {wide['W']}px screen ({', '.join(wide['els'])})")
                        break
        except Exception as e:
            found.append('did not load: ' + str(e).split('\n')[0][:160])
        await ctx.close()
        for m in sorted(set(env)):
            if m not in env_seen:
                env_seen.add(m)
                print(f'env smoke {size} {route}: {m}', flush=True)
        if found:
            for m in dict.fromkeys(found):
                print(f'FAIL smoke {size} {route}: {m}', flush=True)
        else:
            print(f'ok smoke {size} {route}', flush=True)


async def main(base):
    async with async_playwright() as p:
        b = await qalib.launch(p)
        sem = asyncio.Semaphore(3)
        await asyncio.gather(*[check(b, base, s, r, sem) for s in WIDTHS for r in qalib.ROUTES])
        await b.close()
    print('SMOKE_DONE', flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    t = sys.argv[1]
    if t.startswith('http'):
        asyncio.run(main(t if t.endswith('/') else t + '/'))
    else:
        with qalib.serve(t) as base:
            asyncio.run(main(base))

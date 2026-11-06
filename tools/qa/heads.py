#!/usr/bin/env python3
"""The centred headings (the owner's Nov 5 answer: "Centre all seven"), measured and shot.

    heads.py <site_dir> <out_dir> [label]

For each width and theme it opens Home (the wash finished, the cards up) and Services, brings each of the seven heads
on screen, waits until it has set (its lines whole, its plate's moment over), then measures and shoots it:
  svc       Home's 'Choose your finish' head (.svc-head)
  ritual    the Ritual's head (#svc-ritual .show-head)
  bead      the Bead Test's head (#svc-bead .show-head)
  exterior, interior, bundles, protection: the four Services photo plates' captions (.group-plate figcaption)
Each prints one JSON line: the title's offset from its column's centre in px (off: the worst of its lines; the
column is the head's own content box, the plate's for a plate), its lines, the lead's offset (lead), and the shot.
A line's centre is its glyphs' (the text's box less the tracking after its last letter). PASS when |off| <= 2.
Environment: HEADS_WIDTHS=1440,1024,440,390,360  HEADS_THEMES=dark,light  HEADS_REDUCE=1 (reduced motion)
HEADS_ONLY=svc,bead (some heads), HEADS_NOGL=1 (WebGL off). Widths of 440 and under are touch phones."""
import asyncio, json, os, pathlib, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib
from playwright.async_api import async_playwright

HEIGHTS = {1440: 900, 1024: 768, 440: 956, 390: 844, 360: 780}
WIDTHS = [int(w) for w in os.environ.get('HEADS_WIDTHS', '1440,1024,440,390,360').split(',') if w]
THEMES = [t for t in os.environ.get('HEADS_THEMES', 'dark,light').split(',') if t]
REDUCE = os.environ.get('HEADS_REDUCE') == '1'
NOGL = os.environ.get('HEADS_NOGL') == '1'
# name, route, the head, its column (None: the head's own box), its lead
HEADS = [
    ('svc', 'home', '#washServices .svc-head', None, '#washServices .svc-head > p'),
    ('exterior', 'services', '#svc-exterior .group-plate figcaption', '#svc-exterior .group-plate', '#svc-exterior figcaption > p:not(.motto)'),
    ('ritual', 'services', '#svc-ritual .show-head', None, '#svc-ritual .show-head > p'),
    ('interior', 'services', '#svc-interior .group-plate figcaption', '#svc-interior .group-plate', '#svc-interior figcaption > p:not(.motto)'),
    ('bundles', 'services', '#svc-bundles .group-plate figcaption', '#svc-bundles .group-plate', '#svc-bundles figcaption > p'),
    ('protection', 'services', '#svc-protection .group-plate figcaption', '#svc-protection .group-plate', '#svc-protection figcaption > p'),
    ('bead', 'services', '#svc-bead .show-head', None, '#svc-bead .show-head > p'),
]
ONLY = [h for h in os.environ.get('HEADS_ONLY', '').split(',') if h]

# set: on screen, its lines whole, no entrance or plate moment still running on it
SET_JS = """(sel) => { const c = document.querySelector(sel); if (!c) return false;
  const r = c.getBoundingClientRect(); if (!r.height || r.bottom < 0 || r.top > innerHeight) return false;
  if (c.querySelector('.hd-lines')) return false;
  if (c.hasAttribute('data-head') && !c.classList.contains('in')) return false;
  if (c.closest('.wet, .cabin, .beading.handover, .beading:not(.crossing)') && !matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const h = c.querySelector('h2'); if (!h || +getComputedStyle(h).opacity < 0.99) return false;
  if (+getComputedStyle(c).opacity < 0.99) return false;
  return !document.getAnimations().some((a) => { const t = a.effect && a.effect.target; return a.playState === 'running' && t && t.nodeType === 1
    && (c.contains(t) || t.contains(c)) && Number.isFinite(a.effect.getComputedTiming().endTime); }); }"""   # (scroll-driven drifts excepted)

MEASURE_JS = """([sel, colSel, leadSel]) => {
  const c = document.querySelector(sel), col = colSel ? document.querySelector(colSel) : c;
  const cr = col.getBoundingClientRect(), cs = getComputedStyle(col);
  const left = cr.left + parseFloat(cs.borderLeftWidth) + (colSel ? 0 : parseFloat(cs.paddingLeft));
  const right = cr.right - parseFloat(cs.borderRightWidth) - (colSel ? 0 : parseFloat(cs.paddingRight));
  const mid = (left + right) / 2;
  function lines(el) {
    if (!el || !el.getClientRects().length || getComputedStyle(el).display === 'none') return null;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const out = [];
    [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).forEach((r) => {
      const cy = (r.top + r.bottom) / 2;
      let L = out.find((l) => Math.abs(l.cy - cy) < r.height * 0.4);
      if (!L) out.push({ cy, l: r.left, r: r.right }); else { L.l = Math.min(L.l, r.left); L.r = Math.max(L.r, r.right); }
    });
    const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
    return out.map((L) => +((L.l + L.r - ls) / 2 - mid).toFixed(2));
  }
  const worst = (a) => a && a.length ? a.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0) : null;
  const h = c.querySelector('h2'), t = lines(h), ld = lines(document.querySelector(leadSel));
  const hs = getComputedStyle(h);
  return { off: worst(t), lines: t, lead: worst(ld), leadLines: ld, col: [Math.round(left), Math.round(right)],
    align: getComputedStyle(c).textAlign, font: hs.fontSize, indent: hs.textIndent, ls: hs.letterSpacing };
}"""

CLIP_JS = """([sel, colSel]) => { const e = document.querySelector(colSel || sel), r = e.getBoundingClientRect(), m = colSel ? 0 : 28;
  const x = Math.max(0, r.left - m), y = Math.max(0, r.top - m);
  return { x, y, width: Math.min(innerWidth, r.right + m) - x, height: Math.min(innerHeight, r.bottom + m) - y }; }"""


async def show(pg, sel, col):
    """Brings the head (a plate: the whole plate) on screen, its middle a little above the screen's."""
    await pg.evaluate("""([sel, col]) => { const e = document.querySelector(col || sel), r = e.getBoundingClientRect();
        const y = scrollY + r.top + r.height / 2 - innerHeight * (r.height > innerHeight * 0.8 ? 0.5 : 0.45);
        window.scrollTo(0, Math.max(0, y)); }""", [sel, col])


async def one(browser, base, w, theme, out, label):
    phone = w <= 440
    o = dict(viewport={'width': w, 'height': HEIGHTS.get(w, 900)}, device_scale_factor=1)
    if phone:
        o.update(is_mobile=True, has_touch=True)
    if REDUCE:
        o['reduced_motion'] = 'reduce'
    ctx = await browser.new_context(ignore_https_errors=True, **o)
    if theme == 'light':
        await ctx.add_init_script("try{localStorage.setItem('ad.theme','light')}catch(e){}")
    await ctx.route(lambda u: any(h in u for h in qalib.BLOCK), lambda r: r.abort())
    pg = await ctx.new_page()
    route = None
    for name, rt, sel, col, lead in HEADS:
        if ONLY and name not in ONLY:
            continue
        if rt != route:
            route = rt
            await pg.goto(base + '#' + rt)
            await qalib.ready(pg)
            await qalib.settle(pg)
            await asyncio.sleep(1.5)
            if rt == 'home':   # the wash finished and folded, the cards at the top (reduced motion, no WebGL: no wash)
                await pg.wait_for_function('!!window.__alchemist', timeout=15000)
                try:
                    await pg.wait_for_function('!!window.__alchemist.wash', timeout=3000 if REDUCE else 12000)
                except Exception:
                    pass
                if await pg.evaluate('!!window.__alchemist.wash'):
                    await pg.evaluate('window.__alchemist.goTo(1)')
                    await asyncio.sleep(1.5)
                else:
                    await show(pg, sel, col)
        if rt != 'home':
            await show(pg, sel, col)
        ok, t0 = True, time.time()
        try:
            await pg.wait_for_function(SET_JS, arg=sel, timeout=14000, polling=100)
        except Exception:
            ok = False
        waited = round(time.time() - t0, 1)
        await asyncio.sleep(0.4)
        m = await pg.evaluate(MEASURE_JS, [sel, col, lead])
        shot = out / f'{label}-{name}-{w}-{theme}{"-rm" if REDUCE else ""}{"-nogl" if NOGL else ""}.png'
        clip = await pg.evaluate(CLIP_JS, [sel, col])
        await pg.screenshot(path=str(shot), clip=clip)
        line = dict(label=label, head=name, w=w, theme=theme, reduce=REDUCE, nogl=NOGL, set=ok, waited=waited, **m, shot=shot.name,
                    verdict='PASS' if m['off'] is not None and abs(m['off']) <= 2 else 'FAIL')
        print(json.dumps(line), flush=True)
    await ctx.close()


async def main(base, out, label):
    async with async_playwright() as p:
        b = await qalib.launch(p, gl=not NOGL)
        for w in WIDTHS:
            for theme in THEMES:
                await one(b, base, w, theme, out, label)
        await b.close()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    target, out = sys.argv[1], pathlib.Path(sys.argv[2])
    label = sys.argv[3] if len(sys.argv) > 3 else 'heads'
    out.mkdir(parents=True, exist_ok=True)
    if target.startswith('http'):
        asyncio.run(main(target if target.endswith('/') else target + '/', out, label))
    else:
        with qalib.serve(target) as base:
            asyncio.run(main(base, out, label))
    print('HEADS_DONE')

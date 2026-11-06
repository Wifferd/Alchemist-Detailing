#!/usr/bin/env python3
"""Long tasks on a phone walk: hard rule 5's budget, measured the same way every time.

    budget.py <route> <site_a> <site_b> [walks] [out_dir]

A first visit (a fresh browser each walk: no cache, no storage) on a 390x844 touch phone at 2x with the CPU slowed
4x (CDP Emulation.setCPUThrottlingRate, set before the page loads) opens #<route>, waits for its fonts and the
pictures in view and BUDGET_IDLE ms more (the opening moment plays), then walks the page top to bottom at a visitor's
pace: a 330 px drag lifted on a still finger (no fling, so both sites scroll the same distances), 0.75 s of reading,
again, until the foot of the page, then 1.5 s. The two site folders are walked in turn, A B B A A B ..., `walks`
times each (default 6), so they share the machine's load.

Each long task (PerformanceObserver 'longtask', over 50 ms) is kept with its time from the walk's start, the scrollY
then (from a scroll log), the block in the middle of the screen, and the Long Animation Frame around it (the scripts
in it: invoker, file, function, char, ms, forced style and layout ms; and where its rendering began). The opening
(load to the walk's start) is counted apart from the walk itself; the walk is the number that counts.

It prints one line per walk (label, walk number, the 1-minute load average at its start and end, the opening's and
the walk's counts, then the walk's long tasks as ms@scrollY:block), then a summary per site. The JSON of every walk
goes to out_dir (default: a folder in /tmp).

Environment:
  BUDGET_LABELS=live,head   the two sites' names (default: their folder names)
  BUDGET_RATE=4             the CPU slow-down
  BUDGET_THEME=light        the light theme (default dark)
  BUDGET_IDLE=2500          ms between the settled page and the first stroke
  BUDGET_WAIT=2             before each walk, wait (90 s at most) for the 1-minute load average to fall under this
  BUDGET_TRACE=1            also record a Chrome trace of the walk (devtools.timeline, its frame and disabled-by-default
                            categories, blink, cc, gpu) and split the main thread's time, and each of its tasks over
                            30 ms, by self time into script, gc, style, layout, prepaint, paint, composite (the
                            commit), animate, intersect, scroll, input, frame, decode, gpu, task and other, with the
                            busiest trace events and the elements they name (layout roots, painted nodes); and the
                            commit waits: the main thread held up while the compositor takes its frame, which waits
                            for raster, which waits for the GPU process (in this sandbox, SwiftShader on the same
                            CPUs). BUDGET_TRACE=keep keeps the trace file; BUDGET_TRACE=inval keeps it and adds
                            the invalidation-tracking category (which element and why). The trace adds its own cost:
                            compare traced walks with traced walks.
  BUDGET_CATS=viz,gpu.angle  more trace categories (comma list)
  BUDGET_TRACE_FROM=8000    start the trace only once the page is scrolled this far (a smaller trace)
  BUDGET_ONLY=a|b           walk one site only (still `walks` times)
  BUDGET_QUERY=?noadapt     a query for the page's address (default none: the page a visitor opens)
  BUDGET_DUMP='js'          an expression read from the page at the walk's end, kept in the JSON (dump)
Supabase and jsDelivr are refused (preview mode), as everywhere in the kit."""
import asyncio, json, os, pathlib, statistics, sys, tempfile, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import qalib
from playwright.async_api import async_playwright

RATE = float(os.environ.get('BUDGET_RATE', '4'))
THEME = os.environ.get('BUDGET_THEME', 'dark')
IDLE = int(os.environ.get('BUDGET_IDLE', '2500'))
WAIT = float(os.environ.get('BUDGET_WAIT', '0') or 0)
TRACE = os.environ.get('BUDGET_TRACE', '')
ONLY = os.environ.get('BUDGET_ONLY', '')
CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
        'blink', 'cc', 'gpu', 'blink.user_timing', 'v8.execute', 'toplevel']
if TRACE == 'inval':
    CATS.append('disabled-by-default-devtools.timeline.invalidationTracking')
CATS += [c for c in os.environ.get('BUDGET_CATS', '').split(',') if c]
TRACE_FROM = int(os.environ.get('BUDGET_TRACE_FROM', '0') or 0)
QUERY = os.environ.get('BUDGET_QUERY', '')
DUMP = os.environ.get('BUDGET_DUMP', '')

# observers only: no rAF loop (a loop would keep the page drawing every frame and change what it does)
INIT = r"""(() => {
  const b = window.__bud = { lt: [], loaf: [], sc: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) b.lt.push([e.startTime, e.duration]); })
    .observe({ type: 'longtask', buffered: true }); } catch (e) { b.ltErr = String(e); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.duration < 50) continue;
      b.loaf.push({ t: e.startTime, d: e.duration, blk: e.blockingDuration || 0, rs: e.renderStart ? e.renderStart - e.startTime : -1,
        sl: e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : -1,
        sc: (e.scripts || []).map((s) => [s.invoker, (s.sourceURL || '').split('/').pop(), s.sourceFunctionName, s.sourceCharPosition,
          Math.round(s.duration), Math.round(s.forcedStyleAndLayoutDuration || 0)]) }); } })
    .observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { b.loafErr = String(e); }
  addEventListener('scroll', () => b.sc.push([performance.now(), scrollY]), { passive: true, capture: true });
})();"""

# the blocks a long task is placed in: the smallest one around the screen's middle line
BLOCKS_JS = """() => { const v = document.querySelector('.view:not([hidden])') || document.body; const out = [];
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''));
  v.querySelectorAll('section, [id], figure, .price-grid, .lineup, .addons, .page-head, .svc-jump, footer').forEach((e) => {
    const r = e.getBoundingClientRect(); if (r.height < 60) return;
    const p = e.parentElement && e.parentElement.closest('[id], section'); out.push([name(e) + (p && p !== v && !e.id ? '<' + name(p) : ''), r.top + scrollY, r.bottom + scrollY, r.height]); });
  const f = document.querySelector('footer'); if (f) { const r = f.getBoundingClientRect(); out.push(['footer', r.top + scrollY, r.bottom + scrollY, r.height]); }
  return out; }"""

CALIB_JS = "(() => { const t = performance.now(); let s = 0; for (let i = 0; i < 3e6; i++) s += i % 7; return [performance.now() - t, s]; })()"


def load1():
    return float(open('/proc/loadavg').read().split()[0])


def place(blocks, y, h=844):
    mid = y + h / 2
    hit = [b for b in blocks if b[1] <= mid < b[2]]
    return min(hit, key=lambda b: b[3])[0] if hit else '?'


def y_at(sc, t, y0=0):
    y = y0
    for (tt, yy) in sc:
        if tt > t:
            break
        y = yy
    return round(y)


class Walk:
    def __init__(self, pg, cdp):
        self.pg, self.cdp = pg, cdp

    async def touch(self, typ, x=None, y=None):
        pts = [] if typ in ('touchEnd', 'touchCancel') else [{'x': x, 'y': y, 'id': 0, 'radiusX': 6, 'radiusY': 6, 'force': 1}]
        await self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts})

    async def stroke(self, dist, still=140):
        """A drag up by dist px (the page scrolls down), lifted on a still finger: no fling."""
        x, y = 195, 844 * 0.82
        await self.touch('touchStart', x, y)
        for _ in range(5):          # few moves: each waits for the page, and its frames are slow at 4x
            y -= dist / 5
            await asyncio.sleep(0.016)
            await self.touch('touchMove', x, y)
        await asyncio.sleep(still / 1000)
        await self.touch('touchEnd')


async def trace_start(cdp):
    await cdp.send('Tracing.start', {'transferMode': 'ReturnAsStream', 'traceConfig': {
        'recordMode': 'recordContinuously', 'includedCategories': CATS, 'excludedCategories': ['*']}})


async def trace_end(cdp, path):
    done = asyncio.get_event_loop().create_future()
    cdp.once('Tracing.tracingComplete', lambda e: done.set_result(e))
    await cdp.send('Tracing.end')
    e = await asyncio.wait_for(done, 300)
    h = e['stream']
    with open(path, 'wb') as f:
        while True:
            r = await cdp.send('IO.read', {'handle': h, 'size': 4 << 20})
            data = r.get('data', '')
            if r.get('base64Encoded'):
                import base64
                f.write(base64.b64decode(data))
            else:
                f.write(data.encode())
            if r.get('eof'):
                break
    await cdp.send('IO.close', {'handle': h})


CAT_NAMES = {
    'script': ('FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'FireIdleCallback', 'EventDispatch',
               'RunMicrotasks', 'v8.run', 'v8.callFunction', 'V8.Execute', 'v8.evaluateModule', 'XHRReadyStateChange',
               'AsyncTask Run', 'TimerBase::run', 'FrameRequestCallbackCollection::ExecuteFrameCallbacks',
               'BlinkScheduler_PerformMicrotaskCheckpoint', 'ResizeObserver::BroadcastObservations', 'ScheduleStyleRecalculation'),
    'animate': ('Blink.Animate.UpdateTime', 'PageAnimator::serviceScriptedAnimations', 'AnimationTimeline::serviceAnimations',
                'AnimationHost::TickAnimations', 'DocumentAnimations::UpdateAnimationTimingForAnimationFrame'),
    'style': ('UpdateLayoutTree', 'RecalculateStyles', 'ParseAuthorStyleSheet', 'Blink.Style.UpdateTime', 'Document::updateStyle',
              'Document::recalcStyle', 'Document::updateActiveStyle', 'Document::rebuildLayoutTree'),
    'layout': ('Layout', 'UpdateLayerTree', 'Blink.Layout.UpdateTime', 'LocalFrameView::performLayout', 'LocalFrameView::layout',
               'LocalFrameView::UpdateStyleAndLayout', 'LocalFrameView::RunStyleAndLayoutLifecyclePhases',
               'Blink.ForcedStyleAndLayout.UpdateTime', 'Document::UpdateStyleAndLayout'),
    'intersect': ('LocalFrameView::UpdateViewportIntersectionsForSubtree', 'Blink.IntersectionObservation.UpdateTime',
                  'IntersectionObserverController::computeIntersections'),
    'prepaint': ('PrePaint', 'CullRectUpdate', 'Blink.CompositingInputs.UpdateTime', 'LocalFrameView::RunCompositingInputsLifecyclePhase',
                 'Blink.PrePaint.UpdateTime'),
    'scroll': ('ScrollTree::SetScrollOffset', 'ScrollableArea::SetScrollOffset', 'ScrollLayer', 'RootScrollerController::PerformRootScrollerSelection'),
    'input': ('EventHandler::HitTestResultAtLocation', 'HitTest'),
    'frame': ('WebFrameWidgetImpl::UpdateLifecycle', 'WebFrameWidgetImpl::BeginMainFrame', 'MainFrameAborted', 'WidgetBase::WillBeginMainFrame',
              'LocalFrameView::ScheduleAnimation', 'LocalFrameView::RunAccessibilitySteps'),
}
CAT_OF = {n: c for c, ns in CAT_NAMES.items() for n in ns}


def cat_of(name):
    n = name
    if n in CAT_OF:
        return CAT_OF[n]
    if n.startswith('v8.compile') or n.startswith('V8.Compile') or n.startswith('v8.parse'):
        return 'script'
    if 'GC' in n or n.startswith('BlinkGC') or n.startswith('ThreadState'):
        return 'gc'
    if 'StyleRecalc' in n or 'StyleInvalidat' in n or n.startswith('StyleEngine') or n.startswith('Blink.Style'):
        return 'style'
    if 'PerformLayout' in n or n.startswith('LayoutView') or n.startswith('Blink.Layout'):
        return 'layout'
    if 'PrePaint' in n:
        return 'prepaint'
    if n in ('Paint', 'PaintImage', 'Layerize', 'UpdateLayer', 'PaintSetup') or 'Paint' in n or n.startswith('Blink.Paint'):
        return 'paint'
    if n in ('Commit', 'CompositeLayers') or n.startswith('ProxyMain') or n.startswith('LayerTreeHost') or n.startswith('cc::') or 'Commit' in n or n.startswith('Blink.Composit'):
        return 'composite'
    if 'Decode' in n or 'ImageFrameGenerator' in n:
        return 'decode'
    if 'CommandBuffer' in n or 'GLES2' in n or 'WebGL' in n or 'Gpu' in n or 'GPU' in n or 'SharedImage' in n or 'SyncToken' in n or 'Wait' in n:
        return 'gpu'
    if n == 'ParseHTML':
        return 'parse'
    if n in ('RunTask', 'ThreadControllerImpl::RunTask'):
        return 'task'
    return 'other'


def analyse_trace(path, mark_ms, w0, w1, near=30):
    """The renderer main thread during the walk: its busy time split by category (self times), and each task over
    `near` ms split the same way, with its busiest events and the elements named in it (layout roots, painted nodes,
    invalidations). Times are mapped onto performance.now() through the 'budget-trace' mark (made as the trace
    starts; mark_ms is its performance.now())."""
    with open(path) as f:
        raw = json.load(f)
    evs = raw['traceEvents'] if isinstance(raw, dict) else raw
    raw = None
    mk = [e for e in evs if e.get('name') == 'budget-trace' and e.get('ph') in ('R', 'I', 'i', 'n', 'b', 'e', 'X')]
    if not mk:
        return {'err': 'no budget-trace mark in the trace'}
    pid = mk[0]['pid']
    off = mk[0]['ts'] / 1000.0 - mark_ms          # trace ms = perf ms + off
    tid = None
    for e in evs:
        if e.get('ph') == 'M' and e.get('name') == 'thread_name' and e.get('pid') == pid and e['args'].get('name') == 'CrRendererMain':
            tid = e['tid']
    if tid is None:
        return {'err': 'no CrRendererMain'}
    main = [e for e in evs if e.get('pid') == pid and e.get('tid') == tid and e.get('ph') in ('X', 'B', 'E')]
    other = [e for e in evs if e.get('pid') == pid and e.get('tid') == tid and 'InvalidationTracking' in e.get('name', '')]
    evs = None
    items, stack = [], []
    main.sort(key=lambda e: (e['ts'], 0 if e['ph'] != 'E' else -1))
    for e in main:
        if e['ph'] == 'X':
            items.append({'n': e['name'], 'ts': e['ts'], 'dur': e.get('dur', 0), 'args': e.get('args', {})})
        elif e['ph'] == 'B':
            stack.append(e)
        elif e['ph'] == 'E' and stack:
            b = stack.pop()
            a = dict(b.get('args', {}))
            a.update(e.get('args', {}))
            items.append({'n': b['name'], 'ts': b['ts'], 'dur': e['ts'] - b['ts'], 'args': a})
    main = None
    items.sort(key=lambda i: (i['ts'], -i['dur']))
    # self times, and each event's outermost task
    st, tops = [], []
    for i in items:
        i['self'] = i['dur']
        while st and st[-1]['ts'] + st[-1]['dur'] <= i['ts']:
            st.pop()
        if st:
            st[-1]['self'] -= i['dur']
            i['top'] = st[0]
        else:
            i['top'] = i
            i['kids'] = []
            tops.append(i)
        if i['top'] is not i:
            i['top']['kids'].append(i)
        st.append(i)
    a0, a1 = (w0 + off) * 1000, (w1 + off) * 1000
    busy, cats_all, n30, n50 = 0, {}, 0, 0
    # the main thread held up waiting for the compositor's commit (which waits on raster, which waits on the GPU)
    waits = [i['dur'] / 1000 for i in items if i['n'] == 'LayerTreeHost::WaitForCommitCompletion' and a0 <= i['ts'] < a1]
    res = []
    for t in tops:
        if not (a0 <= t['ts'] < a1):
            continue
        busy += t['dur']
        cats, names = {}, {}
        for i in [t] + t['kids']:
            s = max(0, i['self'])
            c = 'task' if i is t else cat_of(i['n'])
            cats[c] = cats.get(c, 0) + s
            cats_all[c] = cats_all.get(c, 0) + s
            names[i['n']] = names.get(i['n'], 0) + s
        if t['dur'] < near * 1000:
            continue
        n30 += 1
        n50 += t['dur'] > 50000
        a, z = t['ts'], t['ts'] + t['dur']
        els = []
        for i in t['kids']:
            ar = i['args']
            d = ar.get('data') or {}
            if i['n'] == 'Layout':
                ed = ar.get('endData') or {}
                bd = ar.get('beginData') or {}
                roots = [r.get('nodeId') for r in (ed.get('layoutRoots') or [])] or ([ed.get('rootNode')] if ed.get('rootNode') else [])
                els.append(['layout', round(i['dur'] / 1000, 1), roots[:4], bd.get('dirtyObjects'), bd.get('totalObjects')])
            elif i['n'] in ('Paint', 'PaintImage') and i['dur'] >= 2000:
                els.append([i['n'].lower(), round(i['dur'] / 1000, 1), [d.get('nodeId')], ((d.get('nodeName') or '') + ' ' + (d.get('url') or '').split('/')[-1]).strip(), (d.get('clip') or [])[:2]])
            elif i['n'] == 'UpdateLayoutTree' and i['dur'] >= 2000:
                els.append(['style', round(i['dur'] / 1000, 1), [], ar.get('elementCount') or (ar.get('endData') or {}).get('elementCount') or (ar.get('beginData') or {}).get('elementCount'), None])
            elif 'Decode' in i['n'] and i['dur'] >= 2000:
                els.append(['decode', round(i['dur'] / 1000, 1), [], str(ar)[:120], None])
            elif i['n'] in ('FunctionCall', 'TimerFire', 'FireAnimationFrame', 'EventDispatch') and i['dur'] >= 5000:
                els.append([i['n'], round(i['dur'] / 1000, 1), [], (d.get('functionName') or d.get('type') or '') + ' ' + (d.get('url') or '').split('/')[-1] + ':' + str(d.get('lineNumber', '')), None])
        invs = {}
        for e in other:
            if a <= e['ts'] < z:
                d = (e.get('args') or {}).get('data') or {}
                k = (e['name'].replace('InvalidationTracking', ''), d.get('nodeName'), str(d.get('reason') or d.get('changedClass') or d.get('changedId') or d.get('changedAttribute') or d.get('changedPseudo') or d.get('invalidationList', ''))[:80])
                invs[k] = invs.get(k, 0) + 1
        res.append({'t': round(a / 1000.0 - off, 1), 'dur': round(t['dur'] / 1000, 1), 'name': t['n'],
                    'cats': {k: round(v / 1000, 1) for k, v in sorted(cats.items(), key=lambda kv: -kv[1]) if v >= 500},
                    'top': [[n, round(v / 1000, 1)] for n, v in sorted(names.items(), key=lambda kv: -kv[1])[:6]],
                    'els': sorted(els, key=lambda x: -x[1])[:8],
                    'inval': sorted([[k[0], k[1], k[2], n] for k, n in invs.items()], key=lambda x: -x[3])[:10]})
    # over 50 ms and not mostly garbage collection (the observer leaves V8's GC tasks out; it also misses some of the
    # others, the commit waits among them, so the trace's count is the stricter one)
    n50ng = sum(1 for t in res if t['dur'] > 50 and t['cats'].get('gc', 0) < t['dur'] / 2)
    return {'tasks': res, 'busy': round(busy / 1000), 'n30': n30, 'n50': n50, 'n50ng': n50ng,
            'commit_wait': [round(sum(waits)), sum(1 for w in waits if w >= 30), round(max(waits)) if waits else 0],
            'cats': {k: round(v / 1000) for k, v in sorted(cats_all.items(), key=lambda kv: -kv[1])}}


async def describe(cdp, ids):
    """DOM node ids from the trace to tag#id.class names (nodes gone by now stay numbers)."""
    names = {}
    try:
        await cdp.send('DOM.getDocument', {'depth': 0})
    except Exception:
        return names
    for i in ids:
        if not i or i in names:
            continue
        try:
            n = (await cdp.send('DOM.describeNode', {'backendNodeId': int(i)}))['node']
            at = n.get('attributes') or []
            d = dict(zip(at[::2], at[1::2]))
            nm = n.get('localName') or n.get('nodeName', '?').lower()
            if d.get('id'):
                nm += '#' + d['id']
            if d.get('class'):
                nm += '.' + '.'.join(d['class'].split()[:3])
            if d.get('src'):
                nm += '[' + d['src'].split('/')[-1] + ']'
            elif d.get('data-art'):
                nm += '[' + d['data-art'] + ']'
            names[i] = nm
        except Exception:
            names[i] = str(i)
    return names


async def one(p, label, site, route, k, outdir):
    res = {'label': label, 'k': k, 'route': route, 'rate': RATE, 'theme': THEME, 'load0': load1()}
    b = await qalib.launch(p)
    try:
        ctx = await qalib.context(b, 'phone', THEME)
        await ctx.route(lambda u: 'cdn.jsdelivr.net' in u, lambda r: r.abort())
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e).split('\n')[0][:200]))
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': RATE})
        w = Walk(pg, cdp)
        with qalib.serve(site) as base:
            t0 = time.time()
            await pg.goto(qalib.route_url(base, route, QUERY), wait_until='load', timeout=120000)
            await qalib.ready(pg, 30000)
            res['fonts'] = await qalib.settle(pg, 30000)
            res['open_s'] = round(time.time() - t0, 1)
            await asyncio.sleep(IDLE / 1000)
            res['calib'] = round((await pg.evaluate(CALIB_JS))[0], 1)
            await asyncio.sleep(0.3)
            tracing = None

            async def trace_on():
                await trace_start(cdp)
                await asyncio.sleep(0.5)
                return await pg.evaluate("(() => { performance.mark('budget-trace'); return performance.now(); })()")
            if TRACE and not TRACE_FROM:
                tracing = await trace_on()
            w0 = await pg.evaluate('performance.now()')
            strokes = 0
            for _ in range(90):
                if await pg.evaluate('scrollY + innerHeight >= document.documentElement.scrollHeight - 4'):
                    break
                if TRACE and tracing is None and await pg.evaluate('scrollY') >= TRACE_FROM:
                    tracing = await trace_on()   # (from a place on the page: a smaller trace, more categories)
                await w.stroke(330)
                strokes += 1
                await asyncio.sleep(0.75)
            await asyncio.sleep(1.5)
            w1 = await pg.evaluate('performance.now()')
            res['strokes'] = strokes
            res['end'] = await pg.evaluate('[Math.round(scrollY), document.documentElement.scrollHeight]')
            blocks = await pg.evaluate(BLOCKS_JS)
            bud = await pg.evaluate('__bud')
            if DUMP:
                res['dump'] = await pg.evaluate(DUMP)
            if tracing is not None:
                tp = os.path.join(outdir, f'{label}-{k:02d}.trace.json')
                await trace_end(cdp, tp)
                tr = analyse_trace(tp, tracing, tracing, w1)
                ids = sorted({n for t in tr.get('tasks', []) for e in t['els'] for n in (e[2] or []) if n})
                names = await describe(cdp, ids)
                for t in tr.get('tasks', []):
                    for e in t['els']:
                        e[2] = [names.get(n, n) for n in (e[2] or [])]
                res['trace'] = tr
                if TRACE not in ('keep', 'inval'):
                    try:
                        os.remove(tp)
                    except OSError:
                        pass
        res['load1'] = load1()
        res['walk_s'] = round((w1 - w0) / 1000, 1)
        sc = bud['sc']
        lts = []
        for (s, d) in bud['lt']:
            rel = s - w0
            if s < w0 or s > w1:
                continue
            y = y_at(sc, s)
            lf = [f for f in bud['loaf'] if f['t'] - 1 <= s <= f['t'] + f['d']]
            lts.append({'t': round(rel), 'd': round(d), 'y': y, 'at': place(blocks, y), 'loaf': lf[:1]})
        res['open'] = [[round(s), round(d)] for (s, d) in bud['lt'] if s < w0]
        res['walk'] = lts
        res['blocks'] = [[b[0], round(b[1]), round(b[2])] for b in blocks]
        res['loaf_err'] = bud.get('loafErr') or bud.get('ltErr')
        res['errors'] = errs
        if TRACE and 'trace' in res:
            for t in res['trace'].get('tasks', []):
                t['y'] = y_at(sc, t['t'])
                t['at'] = place(blocks, t['y'])
                t['rel'] = round(t['t'] - w0)
    finally:
        await b.close()
    with open(os.path.join(outdir, f'{label}-{k:02d}.json'), 'w') as f:
        json.dump(res, f)
    return res


def line(r):
    lt = ' '.join(f"{x['d']}@{x['y']}:{x['at']}" for x in r['walk'])
    return (f"{r['label']:>6} {r['k']:2d} load {r['load0']:.2f}->{r['load1']:.2f} calib {r.get('calib')}ms "
            f"open {len(r['open'])} walk {len(r['walk'])} ({r['strokes']} strokes, {r['walk_s']}s, end {r['end'][0]}/{r['end'][1]})"
            + (f" | {lt}" if lt else '') + (f" ERR {r['errors'][:2]}" if r['errors'] else ''))


async def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    route, sa, sb = sys.argv[1], sys.argv[2], sys.argv[3]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    outdir = sys.argv[5] if len(sys.argv) > 5 else tempfile.mkdtemp(prefix='budget-')
    os.makedirs(outdir, exist_ok=True)
    labels = (os.environ.get('BUDGET_LABELS') or f'{pathlib.Path(sa).resolve().parent.name},{pathlib.Path(sb).resolve().parent.name}').split(',')
    sites = [(labels[0], sa), (labels[1], sb)]
    if ONLY in ('a', 'b'):
        sites = [sites[0 if ONLY == 'a' else 1]]
    order = []
    for i in range(n):
        pair = sites if i % 2 == 0 else sites[::-1]
        order += [(lab, s, i + 1) for (lab, s) in pair]
    print(f'budget: #{route} rate {RATE}x theme {THEME} idle {IDLE}ms walks {n} trace {TRACE or "off"} out {outdir}', flush=True)
    allr = {lab: [] for (lab, _) in sites}
    async with async_playwright() as p:
        for (lab, s, k) in order:
            if WAIT:
                t = time.time()
                while load1() >= WAIT and time.time() - t < 90:
                    await asyncio.sleep(5)
            try:
                r = await one(p, lab, s, route, k, outdir)
            except Exception as e:
                print(f'{lab:>6} {k:2d} FAILED {str(e).splitlines()[0][:200]}', flush=True)
                continue
            allr[lab].append(r)
            print(line(r), flush=True)
            if TRACE and r.get('trace'):
                tr = r['trace']
                print(f"         trace: main thread busy {tr.get('busy')} ms {tr.get('cats')}; tasks over 30 ms {tr.get('n30')}, over 50 ms {tr.get('n50')} "
                      f"({tr.get('n50ng')} not GC); "
                      f"commit waits [ms, over 30 ms, longest] {tr.get('commit_wait')} {tr.get('err', '')}", flush=True)
                for t in tr.get('tasks', []):
                    print(f"         trace +{t['rel']}ms {t['dur']}ms y{t['y']} {t['at']} {t['cats']} top {t['top'][:4]} els {t['els'][:3]}"
                          + (f" inval {t['inval'][:4]}" if t['inval'] else ''), flush=True)
    print('summary', flush=True)
    for lab, rs in allr.items():
        if not rs:
            continue
        c = [len(r['walk']) for r in rs]
        o = [len(r['open']) for r in rs]
        ds = [x['d'] for r in rs for x in r['walk']]
        loads = [r['load0'] for r in rs] + [r['load1'] for r in rs]
        print(f"  {lab:>6}: {len(rs)} walks, walk long tasks {c} (total {sum(c)}, mean {statistics.mean(c):.2f}, median {statistics.median(c)}), "
              f"over 100 ms {sum(1 for d in ds if d > 100)}, longest {max(ds) if ds else 0} ms; opening {o}; "
              f"load {min(loads):.2f} to {max(loads):.2f} (median {statistics.median(loads):.2f}); calib {[r.get('calib') for r in rs]}", flush=True)
        trs = [r['trace'] for r in rs if r.get('trace') and 'busy' in r['trace']]
        if trs:
            print(f"  {'':>6}  traced: tasks over 50 ms, not GC {[t.get('n50ng') for t in trs]}; over 30 ms {[t['n30'] for t in trs]}; "
                  f"main thread busy {[t['busy'] for t in trs]} ms, "
                  f"commit waits {[t['commit_wait'] for t in trs]} ([ms, over 30 ms, longest])", flush=True)
    print('BUDGET_DONE', outdir, flush=True)


if __name__ == '__main__':
    asyncio.run(main())

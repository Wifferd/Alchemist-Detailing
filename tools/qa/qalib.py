"""Shared pieces of the QA kit: a local server for a site folder, the browser, the screen sizes, the routes,
and waiting for a page's fonts and pictures. Every page the kit opens runs in preview mode: requests to Supabase
are refused by the kit itself (it never talks to the live or the test project)."""
import asyncio, contextlib, functools, glob, http.server, os, pathlib, socket, threading

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

ROUTES = ['home', 'services', 'services-exterior', 'services-interior', 'services-protection', 'services-bundles',
          'gallery', 'reviews', 'tips', 'faq', 'about', 'contact', 'book', 'account', 'appointments', 'admin', 'team', '404']

# desk: a computer screen; phone: an iPhone-sized touch screen; n360: a narrow phone
SIZES = {
    'desk': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1),
    'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'n360': dict(viewport={'width': 360, 'height': 780}, device_scale_factor=2, is_mobile=True, has_touch=True),
}

# WebGL through SwiftShader (no GPU here); the hero, the wash and the stills all need it
GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# requests the kit refuses: the database (preview mode, never the live project)
BLOCK = ('supabase.co',)
# failures that come from this sandbox, not from the site: the proxy refusing a host (supabase-js on jsDelivr,
# sometimes a Google Fonts file) or its certificate
ENV_ERRS = ('ERR_TUNNEL_CONNECTION_FAILED', 'ERR_PROXY', 'ERR_CERT', 'ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED')
ENV_HOSTS = ('fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net')


def chrome():
    """The Chromium to drive: QA_CHROME or SHOOT_CHROME, else Playwright's own if it is installed, else the one in
    /opt/pw-browsers (this sandbox's Playwright is newer than its browsers)."""
    for k in ('QA_CHROME', 'SHOOT_CHROME'):
        if os.environ.get(k):
            return os.environ[k]
    base = os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
    for pat in ('chromium', 'chromium-*/chrome-linux*/chrome', 'chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'):
        hits = sorted(glob.glob(os.path.join(base, pat)))
        if hits and os.path.exists(hits[-1]):
            return hits[-1]
    return None


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


@contextlib.contextmanager
def serve(site_dir):
    """Serves site_dir on a free local port; yields the base URL (ending in /)."""
    site_dir = str(pathlib.Path(site_dir).resolve())
    handler = functools.partial(_Quiet, directory=site_dir)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield f'http://127.0.0.1:{srv.server_address[1]}/'
    finally:
        srv.shutdown()
        srv.server_close()


def route_url(base, route, query=''):
    if route == '404':
        return base + '404.html' + query
    return base + query + '#' + route


async def launch(p, gl=True, extra=()):
    return await p.chromium.launch(executable_path=chrome(), args=(GL_ARGS if gl else ['--disable-gpu']) + list(extra))


async def context(browser, size, theme='dark', **kw):
    o = dict(SIZES[size])
    o.update(kw)
    ctx = await browser.new_context(ignore_https_errors=True, **o)
    if theme == 'light':
        await ctx.add_init_script("try{localStorage.setItem('ad.theme','light')}catch(e){}")
    await ctx.route(lambda u: any(h in u for h in BLOCK), lambda r: r.abort())
    return ctx


def is_env(url, failure=''):
    """A request that failed because of this sandbox (or the kit's own block), not the site."""
    f = failure or ''
    return any(e in f for e in ENV_ERRS) or any(h in url for h in ENV_HOSTS) or any(h in url for h in BLOCK)


async def settle(pg, timeout=8000):
    """Waits for the fonts and for every picture in view (lazy ones out of view are left alone)."""
    try:
        await pg.wait_for_function("""() => document.fonts.status === 'loaded' && [...document.images].every((i) => {
            const r = i.getBoundingClientRect();
            const near = r.bottom > -50 && r.top < innerHeight + 50 && r.width > 0;
            return !near || (i.complete && (i.naturalWidth > 0 || !i.currentSrc));
          })""", timeout=timeout)
        return True
    except Exception:
        return False


async def ready(pg, timeout=10000):
    """The page's script has run (the router has shown a view)."""
    await pg.wait_for_function("() => !!document.querySelector('.view:not([hidden])') || !document.querySelector('.view')", timeout=timeout)


def run(coro):
    return asyncio.run(coro)

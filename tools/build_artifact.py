#!/usr/bin/env python3
"""Builds the single-file preview of the site for publishing: content-only
HTML (the host adds the document shell), with the stylesheet, the scripts and
the logo picture inlined."""
import base64, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
site = ROOT / 'site'
out = ROOT / 'dist' / 'alchemist-detailing.html'
html = (site / 'index.html').read_text()
head = html.split('<!-- HEAD START -->')[1].split('<!-- HEAD END -->')[0]
body = html.split('<!-- BODY START -->')[1].split('<!-- BODY END -->')[0]
# keep the title and font links; meta tags belong to the real site's <head>
head = '\n'.join(l for l in head.strip().splitlines() if not l.lstrip().startswith('<meta'))
css = (site / 'css/alchemist.css').read_text()
mono = 'data:image/webp;base64,' + base64.b64encode((site / 'img/mono-metallic.webp').read_bytes()).decode()
body = body.replace('img/mono-metallic.webp', mono)
js = ''
for name in ['hero-gl.js', 'foam.js', 'data.js', 'ui.js', 'booking.js', 'account.js', 'admin.js', 'team.js', 'reviews.js', 'content.js', 'gallery.js', 'app.js']:
    src = (site / 'js' / name).read_text()
    assert '</script' not in src.lower()
    js += f'<script>\n{src}\n</script>\n'
assert '</style' not in css.lower()
page = f'{head}\n<style>\n{css}\n</style>\n{body.strip()}\n{js}'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
# a local copy wrapped the way the host wraps it, for a quick check
shell = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
         '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>'
         '</head><body>' + page + '</body></html>')
(out.parent / 'wrapped-check.html').write_text(shell)
print(out, len(page.encode()) // 1024, 'KB')

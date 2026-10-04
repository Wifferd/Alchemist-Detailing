#!/usr/bin/env python3
"""Screenshot a local page URL (with query) using headless Chromium + SwiftShader WebGL.
shot.py <out.png> <width> <height> <url> [wait_ms]"""
import asyncio, sys
from playwright.async_api import async_playwright
out, w, h, url = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
wait = int(sys.argv[5]) if len(sys.argv) > 5 else 800
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': w, 'height': h})
        msgs = []
        pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: msgs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        await pg.goto(url)
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        for m in msgs: print(m)
        await b.close()
asyncio.run(main())

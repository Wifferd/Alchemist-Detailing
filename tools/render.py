#!/usr/bin/env python3
"""Renders an HTML snippet or file to PNG with headless Chromium. Usage:
render.py <out.png> <width> <height> <html-file-or-string> [wait_ms]"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
out, w, h, src = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
wait = int(sys.argv[5]) if len(sys.argv) > 5 else 300
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': w, 'height': h})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        path = pathlib.Path(src)
        if path.exists():
            await pg.goto('file://' + str(path.resolve()))
        else:
            await pg.set_content(src)
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        for e in errs: print(e)
        await b.close()
asyncio.run(main())

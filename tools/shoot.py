#!/usr/bin/env python3
"""Screenshots of the local site for checks.
shoot.py <prefix> <width> <height> <spec>...   spec = name:action
actions: top | y=<px> | p=<wash progress> | sel=<css selector> | route=<hash> | menu
Example: shoot.py shots/d 1440 900 hero:top wash30:p=0.3"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
specs = sys.argv[4:]
import os
url = os.environ.get('SHOOT_URL') or ((pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=w < 700, has_touch=w < 700)
        pg = await ctx.new_page()
        msgs = []
        pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: msgs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        await pg.goto(url)
        await pg.wait_for_timeout(1500)
        for spec in specs:
            name, act = spec.split(':', 1)
            if act == 'top':
                await pg.evaluate('window.scrollTo(0,0)')
            elif act.startswith('y='):
                await pg.evaluate(f'window.scrollTo(0,{act[2:]})')
            elif act.startswith('p='):
                # approach the target gradually so the spray reacts like a real scroll
                target = float(act[2:])
                await pg.evaluate(f'window.__alchemist.goTo({max(0, target - 0.02)})')
                await pg.wait_for_timeout(120)
                for k in range(1, 5):
                    await pg.evaluate(f'window.__alchemist.goTo({max(0, target - 0.02) + 0.02 * k / 4})')
                    await pg.wait_for_timeout(60)
            elif act.startswith('sel='):
                await pg.evaluate(f'document.querySelector({act[4:]!r}).scrollIntoView({{block:"start"}})')
            elif act.startswith('route='):
                await pg.evaluate(f'location.hash = {act[6:]!r}')
                await pg.wait_for_timeout(900)
            elif act == 'menu':
                await pg.click('#menuBtn')
                await pg.wait_for_timeout(1100)
            elif act == 'closemenu':
                await pg.keyboard.press('Escape')
                await pg.wait_for_timeout(700)
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'{prefix}-{name}.png')
        for m in msgs: print(m)
        await b.close()
asyncio.run(main())

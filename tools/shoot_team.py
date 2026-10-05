#!/usr/bin/env python3
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
url = (pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt#team'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None, args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': w, 'height': h}); msgs = []; pg.on('pageerror', lambda e: msgs.append(str(e)))
        await pg.goto(url); await pg.click('#teamApp button.btn-gold'); await pg.wait_for_selector('.appt.adm'); await pg.click('.appt.adm .appt-head')
        await pg.wait_for_selector('.appt-body'); await pg.wait_for_timeout(500); await pg.screenshot(path=f'{prefix}-team.png', full_page=True)
        print('ok'); [print(m) for m in msgs]; await b.close()
asyncio.run(main())

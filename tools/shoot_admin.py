#!/usr/bin/env python3
"""Screenshots the admin console in preview mode. shoot_admin.py <prefix> <width> <height>"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
url = (pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt#admin'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None, args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': w, 'height': h})
        msgs = []; pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        await pg.goto(url); await pg.wait_for_selector('text=Look around as the admin'); await pg.click('text=Look around as the admin')
        await pg.wait_for_selector('.adm-tiles'); await pg.wait_for_timeout(400); await pg.screenshot(path=f'{prefix}-morning.png', full_page=True)
        await pg.click('.adm-nav a[href="#admin-requests"]'); await pg.wait_for_selector('.appt.adm'); await pg.click('.appt.adm .appt-head')
        await pg.wait_for_selector('.appt-body'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-request-open.png', full_page=True)
        await pg.click('text=Decline'); await pg.wait_for_selector('.adm-panel'); await pg.fill('#p_note', 'We are fully booked that day.'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{prefix}-decline.png', full_page=True)
        await pg.click('.adm-panel .btn-glass')
        await pg.click('.adm-nav a[href="#admin-calendar"]'); await pg.wait_for_selector('.cal-cols'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-calendar.png', full_page=True)
        await pg.click('.adm-nav a[href="#admin-team"]'); await pg.wait_for_selector('#t_phone'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-team.png', full_page=True)
        print('ok'); [print(m) for m in msgs]
        await b.close()
asyncio.run(main())

#!/usr/bin/env python3
"""Screenshots the admin console in preview mode. shoot_admin.py <prefix> <width> <height>
A wide run also shoots Morning and an opened request on the owner's phone (390x844, touch): <prefix>-phone-*.png,
the first screen as he sees it and the whole page. SHOOT_THEME=light shoots the light theme."""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
url = (pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt#admin'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None, args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': w, 'height': h})
        light = "try{localStorage.setItem('ad.theme','light')}catch(e){}"   # SHOOT_THEME=light shoots the console in the light theme
        if os.environ.get('SHOOT_THEME') == 'light': await pg.add_init_script(light)
        msgs = []; pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        await pg.goto(url); await pg.wait_for_selector('text=Look around as the admin'); await pg.click('text=Look around as the admin')
        await pg.wait_for_selector('.adm-tiles'); await pg.wait_for_timeout(400); await pg.screenshot(path=f'{prefix}-morning.png', full_page=True)
        await pg.click('.adm-nav a[href="#admin-requests"]'); await pg.wait_for_selector('.appt.adm'); await pg.click('.appt.adm .appt-head')
        await pg.wait_for_selector('.appt-body'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-request-open.png', full_page=True)
        await pg.click('text=Decline'); await pg.wait_for_selector('.adm-panel'); await pg.fill('#p_note', 'We are fully booked that day.'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{prefix}-decline.png', full_page=True)
        await pg.click('.adm-panel .btn-glass')
        await pg.click('.adm-nav a[href="#admin-calendar"]'); await pg.wait_for_selector('.cal-cols'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-calendar.png', full_page=True)
        await pg.click('.adm-nav a[href="#admin-team"]'); await pg.wait_for_selector('#t_phone'); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{prefix}-team.png', full_page=True)
        if w >= 700:
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph = await ctx.new_page(); ph.on('pageerror', lambda e: msgs.append('pageerror (phone): ' + str(e)))
            if os.environ.get('SHOOT_THEME') == 'light': await ph.add_init_script(light)
            await ph.goto(url); await ph.wait_for_selector('text=Look around as the admin'); await ph.click('text=Look around as the admin')
            await ph.wait_for_selector('.adm-tiles'); await ph.wait_for_timeout(400)
            await ph.screenshot(path=f'{prefix}-phone-morning.png'); await ph.screenshot(path=f'{prefix}-phone-morning-full.png', full_page=True)
            await ph.click('.adm-nav a[href="#admin-requests"]'); await ph.wait_for_selector('.appt.adm'); await ph.click('.appt.adm .appt-head')
            await ph.wait_for_selector('.appt-body'); await ph.wait_for_timeout(300); await ph.screenshot(path=f'{prefix}-phone-request-open.png', full_page=True)
            await ctx.close()
        print('ok'); [print(m) for m in msgs]
        await b.close()
asyncio.run(main())

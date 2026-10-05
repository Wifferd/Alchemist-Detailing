#!/usr/bin/env python3
"""Books in preview mode, then screenshots the account and appointments pages.
shoot_account.py <prefix> <width> <height>"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
url = (pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt#book'
phone = w < 700

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None, args=['--allow-file-access-from-files'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=phone, has_touch=phone)
        pg = await ctx.new_page()
        msgs = []
        pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        await pg.goto(url); await pg.wait_for_selector('#first_name')
        await pg.fill('#first_name', 'Carla'); await pg.fill('#phone', '9725552011'); await pg.click('#bk-send-code')
        await pg.wait_for_selector('#phone_code'); await pg.fill('#phone_code', '123456'); await pg.wait_for_selector('.fld-ok')
        await pg.click('#bk-next'); await pg.wait_for_selector('#vehicle_make')
        await pg.fill('#vehicle_make', 'Toyota'); await pg.fill('#vehicle_model', '4Runner'); await pg.click('[data-field="vehicle_type"] [data-code="suv"]'); await pg.click('[data-field="conditions"] [data-code="pet_hair"]')
        await pg.click('#bk-next'); await pg.wait_for_selector('[data-field="location_type"]'); await pg.click('[data-field="location_type"] [data-code="shop"]')
        await pg.click('#bk-next'); await pg.wait_for_selector('.svc-opt'); await pg.click('.svc-opt[data-code="signature_combo"]'); await pg.wait_for_timeout(300)
        await pg.click('#bk-next'); await pg.wait_for_selector('.cal-day.open')
        days = await pg.query_selector_all('.cal-day.open'); await days[2].click()
        await pg.wait_for_selector('.choice-item.time'); await (await pg.query_selector_all('.choice-item.time'))[0].click()
        await pg.click('#bk-next'); await pg.wait_for_selector('.sum'); await pg.click('#bk-next'); await pg.wait_for_selector('.bk-sent')
        # the guest is signed out after sending; sign in again on the account page
        await pg.evaluate('location.hash = "account"'); await pg.wait_for_selector('#phone', timeout=8000)
        await pg.wait_for_timeout(400); await pg.screenshot(path=f'{prefix}-account-signin.png')
        await pg.fill('#phone', '9725552011'); await pg.click('.mini-btn'); await pg.wait_for_selector('#phone_code'); await pg.fill('#phone_code', '123456')
        await pg.wait_for_selector('#first_name', timeout=8000); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{prefix}-account.png', full_page=True)
        await pg.click('text=+ Add vehicle'); await pg.wait_for_selector('#vehicle_make')
        await pg.fill('#vehicle_year', '2021'); await pg.fill('#vehicle_make', 'Toyota'); await pg.fill('#vehicle_model', '4Runner'); await pg.fill('#vehicle_color', 'Black')
        await pg.click('[data-field="vehicle_type"] [data-code="suv"]'); await pg.click('text=Save vehicle'); await pg.wait_for_selector('.veh', timeout=8000)
        await pg.wait_for_timeout(400); await pg.screenshot(path=f'{prefix}-account-vehicle.png', full_page=True)
        await pg.evaluate('location.hash = "appointments"'); await pg.wait_for_selector('.appt', timeout=8000)
        await pg.click('.appt-head'); await pg.wait_for_selector('.appt-body'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{prefix}-appointments.png', full_page=True)
        print('ok'); [print(m) for m in msgs]
        await b.close()
asyncio.run(main())

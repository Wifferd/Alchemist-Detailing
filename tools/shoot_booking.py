#!/usr/bin/env python3
"""Walks the booking in preview mode and screenshots each step.
shoot_booking.py <prefix> <width> <height>
Set SHOOT_CHROME to a Chromium binary if Playwright's own isn't installed."""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright

prefix, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
url = os.environ.get('SHOOT_URL') or ((pathlib.Path(__file__).resolve().parent.parent / 'site' / 'index.html').as_uri() + '?noadapt#book')
phone = w < 700


async def shot(pg, name, full=False):
    await pg.wait_for_timeout(450)
    await pg.screenshot(path=f'{prefix}-{name}.png', full_page=full)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('SHOOT_CHROME') or None,
                                    args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=phone, has_touch=phone)
        pg = await ctx.new_page()
        msgs = []
        pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: msgs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' and 'ERR_CERT' not in m.text and 'net::' not in m.text else None)
        await pg.goto(url)
        await pg.wait_for_selector('#first_name', timeout=15000)
        await shot(pg, '01-contact')
        await pg.fill('#first_name', 'Carla')
        await pg.fill('#last_name', 'Diaz')
        await pg.fill('#phone', '972 555 2011')
        await pg.click('#bk-send-code')
        await pg.wait_for_selector('#phone_code')
        await pg.fill('#phone_code', '123456')
        await pg.wait_for_selector('.fld-ok')
        await pg.fill('#email', 'carla.diaz@gmail.com')
        await shot(pg, '01-contact-confirmed')
        await pg.click('#bk-next')
        await pg.wait_for_selector('#vehicle_make')
        await shot(pg, '02-vehicle', full=True)
        await pg.fill('#vehicle_year', '2021')
        await pg.fill('#vehicle_make', 'Toyota')
        await pg.fill('#vehicle_model', '4Runner')
        await pg.fill('#vehicle_color', 'Black')
        await pg.click('[data-field="vehicle_type"] [data-code="suv"]')
        await pg.click('[data-field="conditions"] [data-code="pet_hair"]')
        await pg.click('[data-field="conditions"] [data-code="spills"]')
        await shot(pg, '02-vehicle-filled', full=True)
        await pg.click('#bk-next')
        await pg.wait_for_selector('[data-field="location_type"]')
        await pg.click('[data-field="location_type"] [data-code="mobile"]')
        await pg.wait_for_selector('#address')
        await pg.fill('#address', '123 Main St')
        await pg.fill('#address_zip', '75002')
        await shot(pg, '03-location')
        await pg.click('#bk-next')
        await pg.wait_for_selector('.svc-opt')
        await pg.wait_for_timeout(400)
        await shot(pg, '04-service', full=True)
        await pg.click('.svc-opt[data-code="ext_basic"]')
        await pg.click('.svc-opt[data-code="int_basic"]')
        await pg.wait_for_selector('.bk-suggest', timeout=5000)
        await shot(pg, '04-service-suggestion', full=True)
        await pg.click('.bk-suggest .btn')
        await pg.wait_for_timeout(400)
        await pg.click('[data-field="addons"] [data-code="perfect_finish_sealant"]')
        await pg.wait_for_timeout(500)
        await shot(pg, '04-service-picked', full=True)
        await pg.click('#bk-next')
        await pg.wait_for_selector('.cal-day.open', timeout=8000)
        await shot(pg, '05-calendar')
        days = await pg.query_selector_all('.cal-day.open')
        await days[min(3, len(days) - 1)].click()
        await pg.wait_for_selector('.choice-item.time', timeout=8000)
        times = await pg.query_selector_all('.choice-item.time')
        await times[1].click()
        await shot(pg, '05-time', full=True)
        await pg.click('#bk-next')
        await pg.wait_for_selector('.sum')
        await shot(pg, '06-summary', full=True)
        await pg.click('#bk-next')
        await pg.wait_for_selector('.bk-sent', timeout=10000)
        await shot(pg, '07-sent', full=True)
        state = await pg.evaluate('JSON.stringify({mode: window.AlchemistData.mode, ref: window.AlchemistBooking.state.receipt.ref, total: window.AlchemistBooking.state.receipt.total_cents})')
        print(state)
        for m in msgs:
            print(m)
        await b.close()

asyncio.run(main())

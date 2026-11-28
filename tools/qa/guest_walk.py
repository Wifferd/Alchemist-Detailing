#!/usr/bin/env python3
"""Guest bookings in the account (Migration 013, doc 57), preview mode: Appointments and the Account page with the guest
bookings my_bookings lists for the account's phone ("booked_as_guest": true).

guest_walk.py <site_dir> <out_dir> <phone|desk> <dark|light>

Four scenarios, each a fresh page:
  stock      the preview as it is: three completed details, one of them a guest Basic Wash (under $200)
  guestgold  the example Full Detail ($200+) turned into a guest booking: the only gold detail is a guest one
  bothgold   a guest Full Detail added beside the account's own Full Detail
  pending    bothgold, then a review sent for the own Full Detail (waiting for approval), then the Account page
The gold scenarios change data.js's example list on the way in (a Playwright route), nothing on disk. The Gold client
card counts only details booked with the account until the owner decides otherwise (doc 57, PROPOSED), and its review
button never opens a guest booking. Doc 57's verifier found the Account page stuck on "Loading..." for a guest gold
booking (goldAction read the review of a booking that had none): every scenario checks the page finishes and throws
nothing.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qalib
from playwright.async_api import async_playwright

site, out, size, theme = sys.argv[1:5]
tag = f'{size}-{theme}'
fails, notes = [], []
OWN_GOLD = "make(weekend(1), 600, { location_type: 'mobile', bundle: 'full_detail_v2', vehicle_type: 'large_suv', conditions: ['none'] }, 'completed'),"
GUEST_GOLD = "make(weekend(2), 660, { location_type: 'mobile', bundle: 'full_detail_v2', vehicle_type: 'large_suv', conditions: ['none'] }, 'completed', { booked_as_guest: true }),"
PATCH = {
    'stock': None,
    'guestgold': (OWN_GOLD, OWN_GOLD.replace("'completed'),", "'completed', { booked_as_guest: true }),")),
    'bothgold': (OWN_GOLD, OWN_GOLD + '\n      ' + GUEST_GOLD),
    'pending': (OWN_GOLD, OWN_GOLD + '\n      ' + GUEST_GOLD),
}


def check(ok, what):
    (notes if ok else fails).append(('ok   ' if ok else 'FAIL ') + what)


async def shot(pg, name, full=False):
    await pg.wait_for_timeout(600)
    await pg.screenshot(path=os.path.join(out, f'{tag}-{name}.png'), full_page=full)


async def no_sideways(pg, what):
    w = await pg.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    check(w[0] <= w[1], f'{what}: no sideways scroll ({w[0]} <= {w[1]})')


async def sign_in(pg, app):
    await pg.fill('#phone', '9725552002')
    await pg.click(f'#{app} .mini-btn'); await pg.wait_for_selector('#phone_code', timeout=8000)
    await pg.fill('#phone_code', '123456')


async def account_done(pg, what):
    """The Account page got past "Loading..." (its History or Profile is there)."""
    try:
        await pg.wait_for_selector('#accountApp .acct-profile', timeout=8000)
        check(True, f'{what}: the Account page finishes loading')
        return True
    except Exception:
        check(False, f'{what}: the Account page finishes loading (stuck: {(await pg.inner_text("#accountApp"))[:80]!r})')
        return False


async def scenario(b, base, name):
    ctx = await qalib.context(b, size, theme)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if PATCH[name]:
        old, new = PATCH[name]
        async def h(route):
            r = await route.fetch(); t = await r.text()
            if old not in t:
                errs.append('walk: data.js example line not found'); await route.fulfill(response=r); return
            await route.fulfill(response=r, body=t.replace(old, new))
        await pg.route('**/js/data.js*', h)

    if name == 'stock':
        # signed out: the words for guests
        await pg.goto(base + '?noadapt#appointments'); await pg.wait_for_selector('#appointmentsApp #phone', timeout=20000)
        t = await pg.inner_text('#appointmentsApp')
        check('Sign in with the same mobile number' in t and 'last 12 months' in t, 'signed out: guests told to sign in with the same number')
        await shot(pg, 'stock-1-appointments-signed-out')
        await sign_in(pg, 'appointmentsApp'); await pg.wait_for_selector('#appointmentsApp .appt', timeout=8000)
        await pg.wait_for_timeout(800)
        guest = await pg.query_selector_all('#appointmentsApp .appt .appt-guest')
        check(len(guest) == 1, f'stock appointments: one booking says "Booked as a guest" ({len(guest)})')
        await no_sideways(pg, 'stock appointments')
        await shot(pg, 'stock-2-appointments', full=True)
        card = await pg.query_selector('#appointmentsApp .appt:has(.appt-guest)')
        await (await card.query_selector('.appt-head')).click(); await pg.wait_for_selector('#appointmentsApp .appt.open .appt-body', timeout=5000)
        body = await pg.query_selector('#appointmentsApp .appt.open')
        bt = await body.inner_text()
        check(await body.query_selector('button.btn-gold') is None and 'leave a review' not in bt.lower(), 'stock guest card: no "Leave a review"')
        check('can’t be reviewed here' in bt.lower(), 'stock guest card: says why there is no review')
        await pg.evaluate('location.hash = "account"')
        if await account_done(pg, 'stock'):
            fig = await pg.query_selector('#accountApp .hist-fig')
            check(fig is not None and '3' in await fig.inner_text(), 'stock account: History counts the 3 completed details, the guest one included')
            gold = await pg.query_selector('#accountApp .gold-sec a.btn-gold')
            check(gold is not None, 'stock account: the Gold client card (own Full Detail) offers its review')
            await no_sideways(pg, 'stock account')
            await shot(pg, 'stock-3-account', full=True)
            if gold:
                await gold.click(); await pg.wait_for_selector('#appointmentsApp .appt.open', timeout=8000); await pg.wait_for_timeout(600)
                op = await pg.query_selector('#appointmentsApp .appt.open')
                check(await op.query_selector('.appt-guest') is None and await op.query_selector('[data-field="review"]') is not None,
                      'stock gold card: "Leave a review" opens an own detail')
    else:
        await pg.goto(base + '?noadapt#account'); await pg.wait_for_selector('#accountApp #phone', timeout=20000)
        await sign_in(pg, 'accountApp')
        if await account_done(pg, name):
            sec = await pg.query_selector('#accountApp .gold-sec')
            if name == 'guestgold':
                check(sec is None, 'guestgold account: no Gold client card from a guest detail alone (PROPOSED, doc 57)')
            else:
                btn = await pg.query_selector('#accountApp .gold-sec a.btn-gold')
                check(sec is not None and btn is not None and 'review' in (await btn.inner_text()).lower(), f'{name} account: the Gold client card offers the review of the own Full Detail')
            await no_sideways(pg, f'{name} account')
            await shot(pg, f'{name}-1-account', full=True)
            if name == 'pending':
                await btn.click(); await pg.wait_for_selector('#appointmentsApp .appt.open [data-field="review"]', timeout=8000)
                op = await pg.query_selector('#appointmentsApp .appt.open')
                check(await op.query_selector('.appt-guest') is None, 'pending: the review form is on the own Full Detail, never the guest one')
                await pg.fill('#review_body', 'Walk check: the car looked great.')
                await pg.click('#appointmentsApp .appt.open [data-field="review"] .acct-actions .btn-gold')
                await pg.wait_for_function("() => /waiting for approval/i.test(document.querySelector('#appointmentsApp').innerText)", timeout=8000)
                await pg.evaluate('location.hash = "account"')
                if await account_done(pg, 'pending (after the review)'):
                    t = await pg.inner_text('#accountApp')
                    check('Your review is waiting for approval' in t, 'pending account: the Gold card says the review is waiting')
                    await shot(pg, 'pending-2-account-after-review', full=True)
        # the guest gold card on Appointments: the booking's own gold, tagged, no review
        await pg.evaluate('location.hash = "appointments"'); await pg.wait_for_selector('#appointmentsApp .appt', timeout=8000)
        await pg.wait_for_timeout(600)
        gg = await pg.query_selector_all('#appointmentsApp .appt.gold:has(.appt-guest)')
        check(len(gg) == 1, f'{name} appointments: the guest Full Detail card is gold and tagged ({len(gg)})')
        if gg:
            await (await gg[0].query_selector('.appt-head')).click(); await pg.wait_for_timeout(600)
            op = await pg.query_selector('#appointmentsApp .appt.open')
            check(op is not None and await op.query_selector('[data-field="review"]') is None and 'leave a review' not in (await op.inner_text()).lower(),
                  f'{name} appointments: the guest gold card offers no review')
            await shot(pg, f'{name}-3-appointments-guest-gold')
    check(not errs, f'{name}: no page errors ' + ('; '.join(errs)[:300] if errs else ''))
    await ctx.close()


async def main():
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await qalib.launch(p)
        with qalib.serve(site) as base:
            for name in PATCH:
                try:
                    await scenario(b, base, name)
                except Exception as e:
                    check(False, f'{name}: walk stopped: {str(e)[:200]}')
        await b.close()
    print(tag); [print(' ', n) for n in notes + fails]
    print('RESULT', tag, 'fails', len(fails))


asyncio.run(main())

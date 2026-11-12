#!/usr/bin/env python3
"""Mock-ups of the wash card for the owner (plan 2.4, Phase A step 6): the Apple Wallet card and the Google Wallet card
at 0, 3 and 10 washes, the test project's look (grey, "(test)"), and the back of the Apple card. Drawn in HTML from
the pass's own pictures (site/img/wallet/, made by make_wallet_art.py) and rendered to PNG at device scale 2, with one
overview sheet. They are pictures of what the wallets will show, not the wallets' own screens: the real layout is
Apple's and Google's, and is checked on a real iPhone and Android phone in Phases B and C.

Example data only: the card number K7Q2 M9XD and its dates are made up. Every other word is a fact from the database or
CLAUDE.md (the name, "Parker, Texas", (945) 361-7551, the site's address) or a PROPOSED label the owner approves. No
reward, perk or price is named. "Issued by" shows only what exists today: the mailbox address and the business email
are still to come (Apple stays off until both are set).

    python3 tools/wallet/make_wallet_mockups.py <out_dir>

Needs Playwright (Chromium: SHOOT_CHROME, or the one tools/qa/qalib.py finds), segno and Pillow."""
import asyncio, base64, datetime, io, pathlib, sys

import segno
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'qa'))
import qalib  # noqa: E402

ART = ROOT / 'site' / 'img' / 'wallet'
SITE = 'https://thealchemistdetailing.com'
CODE, WORDS = 'K7Q2M9XD', 'K7Q2 M9XD'   # an example card number
PHONE = '(945) 361-7551'


def data_uri(rel):
    return 'data:image/png;base64,' + base64.b64encode((ART / rel).read_bytes()).decode()


def qr_svg(text):
    buf = io.BytesIO()
    segno.make(text, error='m').save(buf, kind='svg', scale=1, border=0, dark='#000', light=None, xmldecl=False, svgns=True, omitsize=True)
    return buf.getvalue().decode()


QR = qr_svg(SITE + '/#admin-cards-' + CODE)   # the pass's barcode: opens the owner's Admin on this card (plan 5.1)
LAST = {0: None, 3: 'Nov 12', 10: 'Nov 12'}

CSS = '''
* { box-sizing: border-box; }
body { margin: 0; padding: 28px; background: #e9e6e0; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; }
.frame { display: grid; gap: 14px; justify-items: center; width: 360px; }
.cap { margin: 0; font: 600 13px/1.35 Helvetica, Arial, sans-serif; text-align: center; color: #333; }
.cap small { display: block; font-weight: 400; color: #666; }
/* Apple: a store card, 340 wide */
.ap { width: 340px; border-radius: 14px; overflow: hidden; box-shadow: 0 18px 40px -20px rgba(0,0,0,.55); }
.ap.collect { background: #000; color: #f4f4f4; } .ap.member { background: #da9c30; color: #0d0903; } .ap.test { background: #1c1c1c; color: #f4f4f4; }
.ap .top { display: flex; align-items: center; gap: 8px; padding: 12px 14px; height: 54px; }
.ap .top img { height: 30px; }
.ap .top b { font-size: 15px; font-weight: 600; }
.ap .top .hdr { margin-left: auto; text-align: right; }
.ap .lbl { display: block; font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.ap.collect .lbl, .ap.test .lbl { color: #f5ba4c; } .ap.member .lbl { color: #0d0903; }
.ap .val { display: block; font-size: 16px; margin-top: 2px; }
.ap .strip { display: block; width: 100%; }
.ap .fields { display: flex; gap: 14px; padding: 12px 14px 0; }
.ap .fields > div { flex: 1; min-width: 0; }
.ap .code { margin: 18px auto 16px; width: 150px; padding: 10px 10px 6px; background: #fff; border-radius: 6px; text-align: center; color: #000; }
.ap .code svg { width: 130px; height: 130px; display: block; margin: 0 auto; }
.ap .code span { display: block; margin-top: 4px; font-size: 11px; letter-spacing: .1em; }
.ap .dots { text-align: right; padding: 0 14px 10px; font-size: 18px; opacity: .7; }
/* the back of the Apple card: Wallet's details sheet, white */
.back { width: 340px; border-radius: 14px; background: #fff; box-shadow: 0 18px 40px -20px rgba(0,0,0,.4); padding: 6px 16px; }
.back > div { padding: 10px 0; border-bottom: 1px solid #e5e5e5; }
.back > div:last-child { border-bottom: 0; }
.back .k { font-size: 12px; color: #6b6b6b; }
.back .v { font-size: 14px; margin-top: 3px; line-height: 1.35; }
.back a { color: #0a64d8; text-decoration: none; }
.back .ph { color: #a05a00; }
/* Google: a loyalty card, 340 wide; its colour is the hero picture's (route G-a, UNVERIFIED) */
.gw { width: 340px; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 40px -20px rgba(0,0,0,.55); font-family: Roboto, "Google Sans", Arial, sans-serif; }
.gw.collect { background: #000; color: #fff; } .gw.member { background: #da9c30; color: #0d0903; } .gw.test { background: #1c1c1c; color: #fff; }
.gw .top { display: flex; align-items: center; gap: 10px; padding: 16px 18px 0; }
.gw .top img { width: 36px; height: 36px; border-radius: 50%; }
.gw .top span { font-size: 14px; }
.gw h3 { margin: 12px 18px 0; font-size: 22px; font-weight: 500; }
.gw .pts { display: flex; gap: 28px; padding: 14px 18px 0; }
.gw .pts .lbl { display: block; font-size: 11px; opacity: .8; }
.gw .pts .val { display: block; font-size: 20px; margin-top: 2px; }
.gw .code { margin: 18px auto 14px; width: 170px; padding: 12px 12px 8px; background: #fff; border-radius: 12px; text-align: center; color: #000; }
.gw .code svg { width: 146px; height: 146px; display: block; margin: 0 auto; }
.gw .code span { display: block; margin-top: 6px; font-size: 12px; letter-spacing: .08em; }
.gw .hero { display: block; width: 100%; }
.gw .note { margin: 0; padding: 0 18px 14px; font-size: 13px; }
'''


def apple(n, test=False, member_label='Loyalty member'):
    member = n >= 10
    look = 'member' if member else ('test' if test else 'collect')
    state = ('test-' if test else '') + str(min(n, 10))
    logo = f'apple/{state}/logo@3x.png'   # gold on the black card, the ink on gold on the gold one
    name = 'Alchemist Detailing' + (' (test)' if test else '')
    last = LAST[n] or 'None yet'
    return f'''<div class="ap {look}">
  <div class="top"><img src="{data_uri(logo)}" alt=""><b>{name}</b>{'<span class="hdr"><span class="lbl">Test</span><span class="val" style="font-size:12px">not a real card</span></span>' if test else ''}</div>
  <img class="strip" src="{data_uri(f'apple/{state}/strip@3x.png')}" alt="">
  <div class="fields">
    <div><span class="lbl">Washes</span><span class="val">{n} of 10</span></div>
    <div><span class="lbl">Status</span><span class="val">{member_label if member else 'Collecting'}</span></div>
    <div><span class="lbl">Last wash</span><span class="val">{last}</span></div>
  </div>
  <div class="code">{QR}<span>{WORDS}</span></div>
  <div class="dots">•••</div>
</div>'''


def apple_back():
    return f'''<div class="back">
  <div><div class="k">How it works</div><div class="v">Each wash we finish fills one of the 10 slots. At 10 the card turns gold and says “Loyalty member”.</div></div>
  <div><div class="k">Book</div><div class="v"><a>Book a wash</a> (thealchemistdetailing.com/#book)</div></div>
  <div><div class="k">Call</div><div class="v"><a>{PHONE}</a></div></div>
  <div><div class="k">Your card</div><div class="v"><a>Card page and reminders</a> (your own link)</div></div>
  <div><div class="k">Card number</div><div class="v">{WORDS}</div></div>
  <div><div class="k">Issued by</div><div class="v">Alchemist Detailing<br>Parker, Texas<br>{PHONE}<br><span class="ph">[mailbox address and business email: to come; Apple stays off until both are set]</span></div></div>
</div>'''


def google(n, test=False):
    member = n >= 10
    look = 'member' if member else ('test' if test else 'collect')
    hero = f'google/hero-{"test-" if test else ""}{min(n, 10)}-v1.png'
    issuer = 'Alchemist Detailing' + (' (test)' if test else '')
    program = 'TEST wash card' if test else 'Wash card'
    status = '<div><span class="lbl">Status</span><span class="val">Member</span></div>' if member else ''
    return f'''<div class="gw {look}">
  <div class="top"><img src="{data_uri('google/logo-v1.png')}" alt=""><span>{issuer}</span></div>
  <h3>{program}</h3>
  <div class="pts"><div><span class="lbl">Washes</span><span class="val">{n} / 10</span></div>{status}</div>
  <div class="code">{QR}<span>{WORDS}</span></div>
  {'<p class="note">Loyalty member</p>' if member else ''}
  <img class="hero" src="{data_uri(hero)}" alt="">
</div>'''


def page(body):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'


def frame(card, cap, sub=''):
    return f'<div class="frame">{card}<p class="cap">{cap}<small>{sub}</small></p></div>'


SHOTS = [
    ('apple-0', apple(0), 'Apple Wallet · a new card', '0 of 10'),
    ('apple-3', apple(3), 'Apple Wallet · 3 washes', '3 of 10'),
    ('apple-10', apple(10), 'Apple Wallet · 10 washes', 'gold: “Loyalty member”'),
    ('apple-test-3', apple(3, test=True), 'Apple Wallet · the test project', 'grey, marked “(test)”'),
    ('apple-back', apple_back(), 'Apple Wallet · the back', 'the details sheet'),
    ('google-0', google(0), 'Google Wallet · a new card', '0 / 10'),
    ('google-3', google(3), 'Google Wallet · 3 washes', '3 / 10'),
    ('google-10', google(10), 'Google Wallet · 10 washes', 'gold; “Member” (Google allows 7 letters there)'),
    ('google-test-3', google(3, test=True), 'Google Wallet · the test project', 'grey, “(test)”; Google adds “[TEST ONLY]” in demo mode'),
]


async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=qalib.chrome(), args=['--disable-gpu'])
        pg = await b.new_page(viewport={'width': 420, 'height': 900}, device_scale_factor=2)
        for name, card, cap, sub in SHOTS:
            await pg.set_content(page(frame(card, cap, sub)))
            await pg.wait_for_function("[...document.images].every((i) => i.complete && i.naturalWidth)")
            el = await pg.query_selector('.frame')
            await el.screenshot(path=str(out / f'{name}.png'))
        # the overview: every card side by side, with the words that go with them
        sheet = ''.join(frame(card, cap, sub) for _, card, cap, sub in SHOTS)
        note = ('<p class="cap" style="grid-column:1/-1;width:auto;text-align:left;max-width:1500px">Wash card mock-ups, '
                f'{datetime.date.today():%b %d, %Y}. Example card number {WORDS}; dates made up. Not the wallets\' own screens: '
                'Apple and Google draw the real layout. Flat colours, no sparkles: the AD letters stand in until the new logo is chosen. '
                'Nothing on the card names a reward. Every word is a proposal for your OK.</p>')
        html = page(f'<div style="display:grid;grid-template-columns:repeat(5,360px);gap:34px 28px;align-items:start">{note}{sheet}</div>')
        (out / 'wallet-mockups.html').write_text(html)
        await pg.set_viewport_size({'width': 1960, 'height': 1200})
        await pg.set_content(html)
        await pg.wait_for_function("[...document.images].every((i) => i.complete && i.naturalWidth)")
        await pg.screenshot(path=str(out / 'wallet-mockups.png'), full_page=True)
        await b.close()
    for f in sorted(out.glob('*.png')):
        print(f, Image.open(f).size)
    print(out / 'wallet-mockups.html')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    asyncio.run(main(pathlib.Path(sys.argv[1])))

#!/usr/bin/env python3
"""Makes the wash card's QR code (plan 2.1): it encodes one stable address on the owner's domain, never a shortener,
so the steps behind it can change without reprinting, and the plain address is printed under it (the FTC warns about
hidden QR links). Black on white, a quiet zone of 4 modules, error correction M.

Two kinds of output:
  print   card-qr-print.svg and card-qr-print.png (1800 px wide, 6 in at 300 dpi): the code with the address under
          it, for the business card or a sign. Held until launch: written to --out (a folder outside the repo), never
          to site/. Apple's badge, if the print shows one, is Apple's own EPS artwork beside the code, added only
          once the Apple Developer membership is active (its licence holds only while it is).
  site    site/img/wallet/card-qr.svg (the live address) and card-qr-test.svg (the test site's): the code alone,
          which the #card page shows a computer once a wallet is ready ("Scan with your phone's camera").

    python3 tools/wallet/make_card_qr.py print <out_dir> [address]
    python3 tools/wallet/make_card_qr.py site

The default address is https://thealchemistdetailing.com/card (site/vercel.json sends /card to /#card).
Needs segno and Pillow."""
import io, pathlib, sys

import segno
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
LIVE = 'https://thealchemistdetailing.com/card'
TEST = 'https://alchemist-detailing-test.vercel.app/card'


def code_svg(url, scale=10):
    q = segno.make(url, error='m', micro=False)
    buf = io.BytesIO()
    q.save(buf, kind='svg', scale=scale, border=4, dark='#000', light='#fff', xmldecl=False, svgns=True, title=None, desc=None)
    return q, buf.getvalue().decode()


def plain(url):
    return url.split('://', 1)[1]


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'):
        if pathlib.Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def make_print(out, url):
    out.mkdir(parents=True, exist_ok=True)
    q = segno.make(url, error='m', micro=False)
    n = q.symbol_size(scale=1, border=4)[0]   # modules across, quiet zone included
    # SVG: the code in a square of n units, the address under it in a sans-serif, all black on white
    unit = 10
    side, text_h = n * unit, 9 * unit
    buf = io.BytesIO()
    q.save(buf, kind='svg', scale=unit, border=4, xmldecl=False, svgns=True, omitsize=True)
    inner = buf.getvalue().decode()
    body = inner[inner.index('>') + 1:inner.rindex('</svg>')]
    # the address fits the code's width inside its quiet zone (textLength holds it there in any font)
    t = plain(url)
    span = side - 8 * unit
    size = min(unit * 3.6, span / (len(t) * .56))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side + text_h}" width="{side}" height="{side + text_h}">'
           f'<rect width="{side}" height="{side + text_h}" fill="#fff"/>{body}'
           f'<text x="{side / 2}" y="{side + text_h * .4:.1f}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" '
           f'font-size="{size:.1f}" textLength="{span}" lengthAdjust="spacingAndGlyphs" fill="#000">{t}</text></svg>\n')
    (out / 'card-qr-print.svg').write_text(svg)
    # PNG: 1800 px wide (6 in at 300 dpi), the address under the code
    W = 1800
    px = W // n
    code = q.to_pil(scale=px, border=4, dark='black', light='white').convert('L') if hasattr(q, 'to_pil') else None
    if code is None:
        b2 = io.BytesIO()
        q.save(b2, kind='png', scale=px, border=4, dark='black', light='white')
        code = Image.open(io.BytesIO(b2.getvalue())).convert('L')
    th = int(px * 9)
    img = Image.new('L', (code.width, code.height + th), 255)
    img.paste(code, (0, 0))
    d = ImageDraw.Draw(img)
    size = int(px * 3.6)
    while size > 10 and d.textlength(t, font=font(size)) > code.width - 8 * px:
        size -= 2
    f = font(size)
    w = d.textlength(t, font=f)
    d.text(((img.width - w) / 2, code.height + th * .12), t, fill=0, font=f)
    img.save(out / 'card-qr-print.png', dpi=(300, 300), optimize=True)
    print(f'{out / "card-qr-print.svg"}\n{out / "card-qr-print.png"} ({img.width} x {img.height} px, {n} modules with the quiet zone): {url}')


def make_site():
    dest = ROOT / 'site' / 'img' / 'wallet'
    dest.mkdir(parents=True, exist_ok=True)
    for name, url in (('card-qr.svg', LIVE), ('card-qr-test.svg', TEST)):
        q = segno.make(url, error='m', micro=False)
        buf = io.BytesIO()
        q.save(buf, kind='svg', scale=1, border=4, dark='#000', light='#fff', xmldecl=False, svgns=True, omitsize=True)
        (dest / name).write_text(buf.getvalue().decode() + '\n')
        print(f'{dest / name}: {url}')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'print':
        make_print(pathlib.Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else LIVE)
    elif len(sys.argv) == 2 and sys.argv[1] == 'site':
        make_site()
    else:
        print(__doc__)
        sys.exit(2)

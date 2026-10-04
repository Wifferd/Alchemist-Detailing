#!/usr/bin/env python3
"""Rebuilds the Alchemist AD monogram as clean geometry, measured from the
owner's logo (edges fitted by least squares on the gold mask), so the mark
stays sharp at every size. Coordinates are in the 570 x 610 crop of the logo
image that starts at (330, 130).

Writes ad-mark.svg (gold gradient preview) and ad-mark-paths.json (path data).
"""
import json
import cv2
import numpy as np

m = (cv2.imread('debug-strict2-mono.png', 0) > 127).astype(np.uint8)
H, W = m.shape


def row_runs(y):
    row = m[y]
    r, inr = [], False
    for x in range(W):
        if row[x] and not inr:
            s, inr = x, True
        elif not row[x] and inr:
            r.append((s, x - 1))
            inr = False
    return [q for q in r if q[1] - q[0] >= 2]


def robust_line(pts):
    """Fit x = a + b*y, dropping outliers (bumps from glare) twice."""
    pts = np.array(pts, float)
    keep = np.ones(len(pts), bool)
    for _ in range(3):
        b, a = np.polyfit(pts[keep, 1], pts[keep, 0], 1)
        res = np.abs(pts[:, 0] - (a + b * pts[:, 1]))
        keep = res < max(1.2, np.percentile(res[keep], 70) * 1.8)
    return a, b


def pick(y, lo, hi):
    """The run whose left edge lies in [lo, hi)."""
    for r in row_runs(y):
        if lo <= r[0] < hi:
            return r
    return None


# ---------------------------------------------------------------- legs
left_out, left_in, right_l, right_r = [], [], [], []
for y in range(300, 500):
    r = pick(y, 0, 235)
    if r and r[1] < 235:
        left_out.append((r[0], y))
        left_in.append((r[1] + 1, y))
    rr = [q for q in row_runs(y) if 236 <= q[0] < 420 and q[1] - q[0] > 30]
    if rr:
        q = rr[0]
        right_l.append((q[0], y))
        right_r.append((q[1] + 1, y))
LO = robust_line(left_out)
LI = robust_line(left_in)
RL = robust_line(right_l[: len(right_l) * 3 // 4])
RR = robust_line(right_r[: len(right_r) * 3 // 4])
print('left outer', LO, 'left inner', LI, 'right left', RL, 'right right', RR)


def x_at(line, y):
    a, b = line
    return a + b * y


def intersect(l1, l2):
    (a1, b1), (a2, b2) = l1, l2
    y = (a2 - a1) / (b1 - b2)
    return np.array([a1 + b1 * y, y])


BASE = 547.5
BAR_TOP = 508.0
DBAR_TOP, DBAR_BOT = 236.0, 278.0
apex = intersect(LO, RR)
inner_apex = intersect(LI, RL)
print('apex', apex, 'inner apex', inner_apex)

# ---------------------------------------------------------------- D bowl (outer and inner edges)
outer, inner = [], []
for y in range(240, 546):
    rs = row_runs(y)
    if rs:
        outer.append((rs[-1][1] + 1, y))
for y in range(282, 505):
    rs = [q for q in row_runs(y) if q[0] > 380]
    if rs:
        inner.append((rs[-1][0], y))
outer = np.array(outer, float)
inner = np.array(inner, float)


def fit_bowl(pts, top, bot, x_far, y_mid_guess):
    """Two cubic quarter curves: (xs, top) -> (x_far, ymid) -> (xs, bot), horizontal tangents at the ends."""
    best = None
    for xs in np.arange(pts[:, 0].min() - 60, pts[:, 0].min() + 40, 2.0):
        for k1 in np.arange(0.3, 0.75, 0.025):
            for k2 in np.arange(0.3, 0.75, 0.025):
                ymid = (top + bot) / 2
                err = 0
                for (yy0, yy1, sgn) in ((top, ymid, 1), (ymid, bot, -1)):
                    if sgn == 1:
                        P0, P3 = np.array([xs, top]), np.array([x_far, ymid])
                        P1 = P0 + [k1 * (x_far - xs), 0]
                        P2 = P3 - [0, k2 * (ymid - top)]
                    else:
                        P0, P3 = np.array([x_far, ymid]), np.array([xs, bot])
                        P1 = P0 + [0, k2 * (bot - ymid)]
                        P2 = P3 + [k1 * (x_far - xs), 0]
                    t = np.linspace(0, 1, 120)[:, None]
                    c = (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t ** 2 * P2 + t ** 3 * P3
                    sel = pts[(pts[:, 1] >= min(yy0, yy1)) & (pts[:, 1] <= max(yy0, yy1))]
                    for p in sel[::3]:
                        cc = c[np.abs(c[:, 1] - p[1]).argmin()]
                        err += (cc[0] - p[0]) ** 2
                if best is None or err < best[0]:
                    best = (err, xs, k1, k2)
    return best


x_far_out = float(np.percentile(outer[:, 0], 99.5))
x_far_in = float(np.percentile(inner[:, 0], 99.5))
bo = fit_bowl(outer, DBAR_TOP, BASE, x_far_out, None)
bi = fit_bowl(inner, DBAR_BOT, BAR_TOP, x_far_in, None)
print('outer bowl', bo, x_far_out, 'inner bowl', bi, x_far_in)


def bowl_path(xs, top, bot, x_far, k1, k2, forward=True):
    ymid = (top + bot) / 2
    a = [(xs + k1 * (x_far - xs), top), (x_far, ymid - k2 * (ymid - top)), (x_far, ymid)]
    b = [(x_far, ymid + k2 * (bot - ymid)), (xs + k1 * (x_far - xs), bot), (xs, bot)]
    if forward:
        return a, b
    # reversed direction (bottom -> top)
    ra = [(xs + k1 * (x_far - xs), bot), (x_far, ymid + k2 * (bot - ymid)), (x_far, ymid)]
    rb = [(x_far, ymid - k2 * (ymid - top)), (xs + k1 * (x_far - xs), top), (xs, top)]
    return ra, rb


f = lambda p: f'{p[0]:.2f} {p[1]:.2f}'
# ---------------------------------------------------------------- piece 1: A legs + D, one outline
p_lo_base = (x_at(LO, BASE), BASE)
p_ri_base = (x_at(RL, BASE), BASE)                # right leg, A-counter side, at the base
p_li_base = (x_at(LI, BASE), BASE)
p_rr_bar = (x_at(RR, BAR_TOP), BAR_TOP)           # right leg, D-counter side, at the counter floor
p_rr_dbar = (x_at(RR, DBAR_BOT), DBAR_BOT)
# D bar's left end is cut parallel to the right leg, ending at x = 315 on its lower edge
dbar_left_bot = (315.0, DBAR_BOT)
dbar_left_top = (315.0 - RR[1] * (DBAR_BOT - DBAR_TOP), DBAR_TOP)
_, xs_o, k1_o, k2_o = bo
_, xs_i, k1_i, k2_i = bi

oa, ob = bowl_path(xs_o, DBAR_TOP, BASE, x_far_out, k1_o, k2_o, True)
ia, ib = bowl_path(xs_i, DBAR_BOT, BAR_TOP, x_far_in, k1_i, k2_i, False)
piece1 = ' '.join([
    f'M{f(p_lo_base)}',
    f'L{f(apex)}',
    # down the right leg's outer edge into the gap, to the D bar's underside level
    f'L{f(p_rr_dbar)}',
    # the gap is open to the D counter: continue down the same edge to the counter floor
    f'L{f(p_rr_bar)}',
    # counter floor to the inner bowl, then up the inner bowl (reversed curve)
    f'L{f((xs_i, BAR_TOP))}',
    f'C{f(ia[0])} {f(ia[1])} {f(ia[2])}',
    f'C{f(ib[0])} {f(ib[1])} {f(ib[2])}',
    # underside of the D bar back to its slanted left end, then up to its top
    f'L{f(dbar_left_bot)}',
    f'L{f(dbar_left_top)}',
    # top of the D bar to the outer bowl, around it, along the base
    f'L{f((xs_o, DBAR_TOP))}',
    f'C{f(oa[0])} {f(oa[1])} {f(oa[2])}',
    f'C{f(ob[0])} {f(ob[1])} {f(ob[2])}',
    f'L{f(p_ri_base)}',
    f'L{f(inner_apex)}',
    f'L{f(p_li_base)}',
    'Z',
])
# Note: the outline above passes from the gap straight to the counter floor along
# the right leg; the D bar is attached to the bowl only, as in the logo.

# ---------------------------------------------------------------- piece 2: the base bar
bar = (f'M131.5 {BAR_TOP} L314.5 {BAR_TOP} L{314.5 + RR[1] * (BASE - BAR_TOP):.2f} {BASE} '
       f'L{131.5 + LO[1] * (BASE - BAR_TOP):.2f} {BASE} Z')


# ---------------------------------------------------------------- stars
def star(cx, cy, up, down, left, right, pinch):
    """Four-point sparkle with concave sides. pinch: how far the side curves pull in (0..1)."""
    T, B, L, R = (cx, cy - up), (cx, cy + down), (cx - left, cy), (cx + right, cy)
    def side(P0, P3):
        # tangents along the ray axes: from a tip toward the centre, then out to the next tip
        c = np.array([cx, cy])
        P1 = np.array(P0) + (c - np.array(P0)) * pinch
        P2 = np.array(P3) + (c - np.array(P3)) * pinch
        return f'C{f(P1)} {f(P2)} {f(P3)}'
    return ' '.join([f'M{f(T)}', side(T, R), side(R, B), side(B, L), side(L, T), 'Z'])


big_star = star(297.0, 146.0, 110.0, 46.0, 49.0, 47.0, 0.80)
small_star = star(232.5, 415.0, 67.0, 72.0, 53.5, 51.5, 0.80)
# thin line from the big star down to the D bar, and the short line under the base
line_top = 'M294.6 180 L299.4 180 L299.4 238 L294.6 238 Z'
line_bot = 'M295.6 553 L298.4 553 L297.6 596 L296.4 596 Z'

paths = {'body': piece1, 'bar': bar, 'starBig': big_star, 'starSmall': small_star,
         'lineTop': line_top, 'lineBottom': line_bot}
json.dump(paths, open('ad-mark-paths.json', 'w'), indent=1)
d_all = ' '.join(paths.values())
vb = '0 20 570 590'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#fbda90"/><stop offset=".45" stop-color="#d9a446"/><stop offset=".7" stop-color="#a8701f"/><stop offset="1" stop-color="#f1c66e"/></linearGradient></defs>
<path fill="url(#g)" d="{d_all}"/></svg>'''
open('ad-mark.svg', 'w').write(svg)
print('written')

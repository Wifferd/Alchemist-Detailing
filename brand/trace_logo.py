#!/usr/bin/env python3
"""Traces the Alchemist AD monogram from the owner's logo image into a clean
SVG path (cubic Beziers and straight lines, sharp corners kept), and makes a
transparent cut-out of the metallic logo for large brand moments.

Outputs (in this folder):
  ad-monogram.svg     the monogram as one filled path (no colour baked in)
  ad-monogram-path.txt  the path data, for inlining in the site
  logo-metallic.png   the full logo, gold kept as rendered, background removed
  mono-metallic.png   the monogram only, cut out the same way
"""
import cv2
import numpy as np

SRC = 'logo-source.png'
UP = 4                      # contour precision: trace at 4x
MONO_BOX = (330, 130, 900, 740)   # x0, y0, x1, y1 of the monogram in the source

img = cv2.imread(SRC)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, S, V = [hsv[..., i].astype(int) for i in range(3)]


def gold_mask(lenient=True):
    if lenient:
        m = ((H >= 5) & (H <= 40) & (S >= 70) & (V >= 55)) | (V >= 170)
    else:
        m = ((H >= 8) & (H <= 35) & (S >= 90) & (V >= 70)) | (V >= 200)
    return m.astype(np.uint8) * 255


def fill_small_holes(mask, max_area):
    m = mask.copy()
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is not None:
        for i, c in enumerate(cnts):
            if hier[0][i][3] != -1 and cv2.contourArea(c) < max_area:
                cv2.drawContours(m, cnts, i, 255, -1)
    return m


def clean_mask():
    m = gold_mask(True)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=2)
    m = fill_small_holes(m, 2500)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    return m


# ---------------------------------------------------------------- Bezier fitting (Schneider)
def bez(ctrl, t):
    t = t[:, None]
    mt = 1 - t
    return mt ** 3 * ctrl[0] + 3 * mt ** 2 * t * ctrl[1] + 3 * mt * t ** 2 * ctrl[2] + t ** 3 * ctrl[3]


def bez_d1(ctrl, t):
    t = t[:, None]
    mt = 1 - t
    return 3 * mt ** 2 * (ctrl[1] - ctrl[0]) + 6 * mt * t * (ctrl[2] - ctrl[1]) + 3 * t ** 2 * (ctrl[3] - ctrl[2])


def bez_d2(ctrl, t):
    t = t[:, None]
    return 6 * (1 - t) * (ctrl[2] - 2 * ctrl[1] + ctrl[0]) + 6 * t * (ctrl[3] - 2 * ctrl[2] + ctrl[1])


def chord_params(pts):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    return d / d[-1] if d[-1] > 0 else d


def generate(pts, u, t1, t2):
    first, last = pts[0], pts[-1]
    A1 = t1[None, :] * (3 * (1 - u) ** 2 * u)[:, None]
    A2 = t2[None, :] * (3 * (1 - u) * u ** 2)[:, None]
    C = np.array([[np.sum(A1 * A1), np.sum(A1 * A2)], [np.sum(A1 * A2), np.sum(A2 * A2)]])
    basis = bez(np.array([first, first, last, last]), u)
    tmp = pts - basis
    X = np.array([np.sum(A1 * tmp), np.sum(A2 * tmp)])
    det = C[0, 0] * C[1, 1] - C[0, 1] * C[1, 0]
    seg = np.linalg.norm(last - first)
    if abs(det) > 1e-12:
        a1 = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det
        a2 = (C[0, 0] * X[1] - C[1, 0] * X[0]) / det
    else:
        a1 = a2 = seg / 3
    if a1 < 1e-6 * seg or a2 < 1e-6 * seg:
        a1 = a2 = seg / 3
    return np.array([first, first + t1 * a1, last + t2 * a2, last])


def reparam(ctrl, pts, u):
    p = bez(ctrl, u)
    d1 = bez_d1(ctrl, u)
    d2 = bez_d2(ctrl, u)
    num = np.sum((p - pts) * d1, axis=1)
    den = np.sum(d1 * d1, axis=1) + np.sum((p - pts) * d2, axis=1)
    with np.errstate(divide='ignore', invalid='ignore'):
        nu = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(nu, 0, 1)


def max_err(ctrl, pts, u):
    d = np.sum((bez(ctrl, u) - pts) ** 2, axis=1)
    i = int(np.argmax(d))
    return d[i], i


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def fit_cubic(pts, t1, t2, err, out):
    if len(pts) == 2:
        dist = np.linalg.norm(pts[1] - pts[0]) / 3
        out.append(np.array([pts[0], pts[0] + t1 * dist, pts[1] + t2 * dist, pts[1]]))
        return
    u = chord_params(pts)
    ctrl = generate(pts, u, t1, t2)
    e, split = max_err(ctrl, pts, u)
    if e < err:
        out.append(ctrl)
        return
    if e < err * 16:
        for _ in range(12):
            u = reparam(ctrl, pts, u)
            ctrl = generate(pts, u, t1, t2)
            e, split = max_err(ctrl, pts, u)
            if e < err:
                out.append(ctrl)
                return
    split = min(max(split, 1), len(pts) - 2)
    tc = unit(pts[split - 1] - pts[split + 1])
    fit_cubic(pts[:split + 1], t1, tc, err, out)
    fit_cubic(pts[split:], -tc, t2, err, out)


# ---------------------------------------------------------------- contour -> path
def smooth_closed(pts, sigma):
    if sigma <= 0:
        return pts
    n = len(pts)
    k = int(3 * sigma)
    w = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
    w /= w.sum()
    out = np.zeros_like(pts)
    for j, wj in zip(range(-k, k + 1), w):
        out += wj * np.roll(pts, -j, axis=0)
    return out


def corners(pts, k, min_turn_deg):
    a = pts - np.roll(pts, k, axis=0)
    b = np.roll(pts, -k, axis=0) - pts
    ang = np.degrees(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], np.sum(a * b, axis=1)))
    turn = np.abs(ang)
    idx = []
    n = len(pts)
    for i in range(n):
        if turn[i] >= min_turn_deg:
            win = [(i + j) % n for j in range(-k, k + 1)]
            if turn[i] >= max(turn[w] for w in win):
                if not idx or i - idx[-1] > k:
                    idx.append(i)
    return idx


def contour_to_path(cnt, scale, err_px=0.35, straight_px=0.6, corner_deg=38):
    pts = cnt[:, 0, :].astype(float) / scale
    pts = smooth_closed(pts, sigma=1.2 * scale / 4)
    k = max(3, int(round(1.6 * scale / 4 * 4)))   # ~1.6 source px either side
    cs = corners(pts * scale, k, corner_deg)
    n = len(pts)
    if len(cs) < 2:
        cs = [0, n // 2]
    cmds = []
    start = pts[cs[0]]
    cmds.append(f'M{start[0]:.2f} {start[1]:.2f}')
    for ci in range(len(cs)):
        i0 = cs[ci]
        i1 = cs[(ci + 1) % len(cs)]
        if i1 <= i0:
            seg = np.vstack([pts[i0:], pts[:i1 + 1]])
        else:
            seg = pts[i0:i1 + 1]
        if len(seg) < 3:
            cmds.append(f'L{seg[-1][0]:.2f} {seg[-1][1]:.2f}')
            continue
        chord = seg[-1] - seg[0]
        L = np.linalg.norm(chord)
        if L > 1e-6:
            nrm = np.array([-chord[1], chord[0]]) / L
            dev = np.abs((seg - seg[0]) @ nrm).max()
        else:
            dev = 1e9
        if dev <= straight_px:
            cmds.append(f'L{seg[-1][0]:.2f} {seg[-1][1]:.2f}')
            continue
        t1 = unit(seg[min(3, len(seg) - 1)] - seg[0])
        t2 = unit(seg[max(-4, -len(seg))] - seg[-1])
        out = []
        fit_cubic(seg, t1, t2, err_px ** 2, out)
        for c in out:
            cmds.append(f'C{c[1][0]:.2f} {c[1][1]:.2f} {c[2][0]:.2f} {c[2][1]:.2f} {c[3][0]:.2f} {c[3][1]:.2f}')
    cmds.append('Z')
    return ' '.join(cmds)


def trace(mask_crop, offset):
    big = cv2.resize(cv2.GaussianBlur(mask_crop, (0, 0), 1.3), None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    _, big = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)
    cnts, hier = cv2.findContours(big, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    paths = []
    for i, c in enumerate(cnts):
        if cv2.contourArea(c) < 40 * UP * UP:
            continue
        d = contour_to_path(c, UP)
        paths.append(d)
    return paths


def main():
    m = clean_mask()
    x0, y0, x1, y1 = MONO_BOX
    crop = m[y0:y1, x0:x1]
    paths = trace(crop, (x0, y0))
    d = ' '.join(paths)
    w, h = x1 - x0, y1 - y0
    open('ad-monogram-path.txt', 'w').write(d)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
           f'<path fill="#d4a24c" fill-rule="evenodd" d="{d}"/></svg>')
    open('ad-monogram.svg', 'w').write(svg)
    print('paths:', len(paths), 'chars:', len(d))

    # Metallic cut-outs: keep the rendered gold, make the satin background transparent.
    # Alpha from "goldness": saturated warm pixels and bright highlights, soft edges.
    sat = np.clip((S - 40) / 80.0, 0, 1)
    warm = ((H >= 4) & (H <= 42)).astype(float)
    val = np.clip((V - 35) / 90.0, 0, 1)
    alpha = np.clip(np.maximum(sat * warm * val, np.clip((V - 150) / 60.0, 0, 1)), 0, 1)
    # keep the glow but drop the grey satin highlights
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
    rgba = np.dstack([img, (alpha * 255).astype(np.uint8)])
    # un-premultiply against the black background so edges don't look dirty
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip(img.astype(float) / a, 0, 255)
    rgb = np.where(alpha[..., None] > 0.02, rgb, 0)
    rgba = np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    cv2.imwrite('logo-metallic.png', rgba[120:1100, 150:1110])
    cv2.imwrite('mono-metallic.png', rgba[y0:y1, x0:x1])
    print('cut-outs written')


if __name__ == '__main__':
    main()

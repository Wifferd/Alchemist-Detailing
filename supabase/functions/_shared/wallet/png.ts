// A tiny PNG writer and the drawing the stand-in art needs (rings and one filled path, the AD mark). Supabase Edge can't
// run libvips or sharp, so the real art is pre-rendered by tools/make_wallet_art.py (plan 2.4); this only draws the
// stand-in a pass uses while that art isn't on the site.
import { zlibSync } from "npm:fflate@0.8.2";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(t, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

// RGBA pixels (width * height * 4) to PNG bytes (8-bit RGBA, no filter).
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export type RGBA = [number, number, number, number];

export class Canvas {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number, bg: RGBA) {
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.px.set(bg, i * 4);
  }

  private blend(i: number, c: RGBA, cover: number): void {
    const a = (c[3] / 255) * cover;
    if (a <= 0) return;
    const p = this.px;
    const da = p[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) {
      p[i + k] = Math.round((c[k] * a + p[i + k] * da * (1 - a)) / (oa || 1));
    }
    p[i + 3] = Math.round(oa * 255);
  }

  // A disc (inner = 0) or a ring (inner > 0) centred at cx, cy, anti-aliased.
  ring(cx: number, cy: number, outer: number, inner: number, c: RGBA): void {
    const x0 = Math.max(0, Math.floor(cx - outer - 1)), x1 = Math.min(this.w - 1, Math.ceil(cx + outer + 1));
    const y0 = Math.max(0, Math.floor(cy - outer - 1)), y1 = Math.min(this.h - 1, Math.ceil(cy + outer + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        let cover = Math.min(1, Math.max(0, outer - d + 0.5));
        if (inner > 0) cover = Math.min(cover, Math.min(1, Math.max(0, d - inner + 0.5)));
        if (cover > 0) this.blend((y * this.w + x) * 4, c, cover);
      }
    }
  }

  // Closed polygons (pixel coordinates) filled with SVG's default nonzero rule, anti-aliased: four sub-rows per pixel,
  // each span's horizontal coverage exact.
  fill(polys: Pt[][], c: RGBA): void {
    const SUB = 4;
    const edges: { x0: number; y0: number; k: number; ya: number; yb: number; dir: number }[] = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        minX = Math.min(minX, a[0]);
        maxX = Math.max(maxX, a[0]);
        minY = Math.min(minY, a[1]);
        maxY = Math.max(maxY, a[1]);
        if (a[1] === b[1]) continue;
        edges.push({ x0: a[0], y0: a[1], k: (b[0] - a[0]) / (b[1] - a[1]), ya: Math.min(a[1], b[1]),
          yb: Math.max(a[1], b[1]), dir: b[1] > a[1] ? 1 : -1 });
      }
    }
    if (!edges.length) return;
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(this.w - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    if (x1 < x0 || y1 < y0) return;
    const cov = new Float32Array(x1 - x0 + 1);
    const hits: number[] = [], dirs: number[] = [], order: number[] = [];
    for (let py = y0; py <= y1; py++) {
      cov.fill(0);
      for (let s = 0; s < SUB; s++) {
        const y = py + (s + 0.5) / SUB;
        hits.length = 0;
        dirs.length = 0;
        order.length = 0;
        for (const e of edges) {
          if (y >= e.ya && y < e.yb) {
            order.push(hits.length);
            hits.push(e.x0 + (y - e.y0) * e.k);
            dirs.push(e.dir);
          }
        }
        if (hits.length < 2) continue;
        order.sort((i, j) => hits[i] - hits[j]);
        let wind = 0;
        for (let i = 0; i < order.length - 1; i++) {
          wind += dirs[order[i]];
          if (wind === 0) continue;
          const a = Math.max(x0, hits[order[i]]), b = Math.min(x1 + 1, hits[order[i + 1]]);
          for (let px = Math.floor(a); px < b; px++) {
            const over = Math.min(b, px + 1) - Math.max(a, px);
            if (over > 0) cov[px - x0] += over / SUB;
          }
        }
      }
      for (let px = x0; px <= x1; px++) {
        const v = cov[px - x0];
        if (v > 0) this.blend((py * this.w + px) * 4, c, Math.min(1, v));
      }
    }
  }

  png(): Uint8Array {
    return encodePng(this.w, this.h, this.px);
  }
}

export type Pt = [number, number];

// SVG path data with absolute M, L, C and Z only (brand/ad-mark.svg) -> closed polygons, each curve as 24 segments.
export function pathPolys(d: string): Pt[][] {
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  let at: Pt = [0, 0];
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (m[1] === "M") {
      if (cur.length > 2) polys.push(cur);
      at = [n[0], n[1]];
      cur = [at];
      for (let i = 2; i + 1 < n.length; i += 2) cur.push(at = [n[i], n[i + 1]]);
    } else if (m[1] === "L") {
      for (let i = 0; i + 1 < n.length; i += 2) cur.push(at = [n[i], n[i + 1]]);
    } else if (m[1] === "C") {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const [ax, ay] = at;
        for (let k = 1; k <= 24; k++) {
          const t = k / 24, u = 1 - t;
          cur.push([u * u * u * ax + 3 * u * u * t * n[i] + 3 * u * t * t * n[i + 2] + t * t * t * n[i + 4],
            u * u * u * ay + 3 * u * u * t * n[i + 1] + 3 * u * t * t * n[i + 3] + t * t * t * n[i + 5]]);
        }
        at = [n[i + 4], n[i + 5]];
      }
    } else {
      if (cur.length > 2) polys.push(cur);
      cur = [];
    }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

// The pictures inside an Apple pass: icon, logo and strip at @1x, @2x and @3x (plan 2.4; sizes from Apple's HIG of
// 2026-06-08: icon 38 pt, logo 50 pt tall, strip 375 x 144 pt).
//
// The real art (the AD mark as a stand-in until the owner picks the new logo) is made by tools/make_wallet_art.py,
// served from <WALLET_ART_URL>/apple/<state>/<file> (the test project's grey look from apple/test-<state>/) and checked
// against art-manifest.ts before use (a mismatch is an ArtError: the route answers 503 and records a setup problem).
// Until that art is on the site and its fingerprints are compiled in (Phase A), every pass gets the same design drawn
// here: the AD mark from brand/ad-mark.svg in flat colours, two rows of five slots (an empty slot a dim gold ring, a
// filled one a gold ring with the mark), all filled on a gold ground at the last slot. The count is always in a text
// field too (Apple Watch doesn't show the strip).
import manifest from "./art-manifest.ts";
import { Canvas, pathPolys, type Pt, type RGBA } from "./png.ts";
import { sha1Hex } from "./util.ts";

export class ArtError extends Error {}

export interface ArtLook {
  stamps: number;
  slots: number;
  member: boolean;
  test: boolean;
}

// The site's tokens (Look C), as flat colours, the same as tools/make_wallet_art.py.
const GOLD: RGBA = [245, 186, 76, 255];        // --au-500: a filled slot and its ring, the mark on black
const GOLD_DIM: RGBA = [156, 108, 22, 255];    // --au-900: an empty slot's ring
const MEMBER_BG: RGBA = [218, 156, 48, 255];   // --au-600: the gold card at the last slot
const ON_GOLD: RGBA = [13, 9, 3, 255];         // --on-gold: ink on the gold card
const BLACK: RGBA = [0, 0, 0, 255];            // --bg
const TEST_GREY: RGBA = [28, 28, 28, 255];     // --panel-2 (test passes, plan 2.4)
const CLEAR: RGBA = [0, 0, 0, 0];

// brand/ad-mark.svg's path (viewBox 0 20 570 590), copied as it is: the A with the D's bowl, the bar, two four-point
// stars and their hairlines. tools/make_wallet_art.py reads the same file.
const AD_MARK = "M20.2 547.5 L237.6 201.5 L408.5 508.0 C433.8 508.0 500.0 473.5 500.0 393.0 C500.0 312.5 433.8 278.0 " +
  "402.0 278.0 L315.0 278.0 L291.5 236.0 L427.0 236.0 C463.6 236.0 549.0 298.3 549.0 391.7 C549.0 485.2 463.6 547.5 " +
  "427.0 547.5 L379.4 547.5 L232.8 282.0 L70.3 547.5 Z M131.5 508.0 L314.5 508.0 L336.5 547.5 L106.6 547.5 Z M297.0 " +
  "36.0 C297.0 124.0 306.4 146.0 344.0 146.0 C306.4 146.0 297.0 155.2 297.0 192.0 C297.0 155.2 287.2 146.0 248.0 146.0 " +
  "C287.2 146.0 297.0 124.0 297.0 36.0 Z M232.5 348.0 C232.5 401.6 242.8 415.0 284.0 415.0 C242.8 415.0 232.5 429.4 " +
  "232.5 487.0 C232.5 429.4 221.8 415.0 179.0 415.0 C221.8 415.0 232.5 401.6 232.5 348.0 Z M294.6 180 L299.4 180 " +
  "L299.4 238 L294.6 238 Z M295.6 553 L298.4 553 L297.6 596 L296.4 596 Z";

let markCache: { polys: Pt[][]; x: number; y: number; w: number; h: number } | null = null;

function mark() {
  if (markCache) return markCache;
  const polys = pathPolys(AD_MARK);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  markCache = { polys, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return markCache;
}

// The mark centred at cx, cy, `size` pixels tall (or wide, when maxW binds).
function drawMark(c: Canvas, cx: number, cy: number, size: number, ink: RGBA, maxW = Infinity): void {
  const m = mark();
  const s = Math.min(size / m.h, maxW / m.w);
  const tx = cx - (m.x + m.w / 2) * s, ty = cy - (m.y + m.h / 2) * s;
  c.fill(m.polys.map((p) => p.map(([x, y]) => [x * s + tx, y * s + ty] as Pt)), ink);
}

const remote = new Map<string, Uint8Array>();
const drawn = new Map<string, Record<string, Uint8Array>>();

function state(look: ArtLook): number {
  return look.member ? look.slots : Math.max(0, Math.min(look.stamps, look.slots));
}

// The folder of a card state in tools/make_wallet_art.py's output: "3", "10", or "test-3" for the test project.
export function artFolder(look: ArtLook): string {
  return `${look.test ? "test-" : ""}${state(look)}`;
}

const NAMES = ["icon", "logo", "strip"].flatMap((n) => [`${n}.png`, `${n}@2x.png`, `${n}@3x.png`]);

export async function passArt(look: ArtLook, artUrl: string | null): Promise<Record<string, Uint8Array>> {
  const keys = NAMES.map((n) => `apple/${artFolder(look)}/${n}`);
  // The site's art serves exactly 10 slots; another slot count keeps the drawn stand-in.
  if (artUrl && look.slots === 10 && keys.every((k) => manifest.files[k])) {
    const out: Record<string, Uint8Array> = {};
    for (let i = 0; i < keys.length; i++) out[NAMES[i]] = await fetchChecked(artUrl, keys[i]);
    return out;
  }
  return standIn(look);
}

async function fetchChecked(artUrl: string, key: string): Promise<Uint8Array> {
  const hit = remote.get(key);
  if (hit) return hit;
  const r = await fetch(`${artUrl}/${key}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new ArtError(`art ${key}: ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if ((await sha1Hex(bytes)) !== manifest.files[key]) throw new ArtError(`art ${key}: fingerprint differs from art-manifest`);
  remote.set(key, bytes);
  return bytes;
}

export function standIn(look: ArtLook): Record<string, Uint8Array> {
  const s = state(look);
  const id = `${look.test ? "t" : "l"}${look.member ? "m" : "c"}${s}/${look.slots}`;
  const hit = drawn.get(id);
  if (hit) return hit;
  const ground: RGBA = look.member ? MEMBER_BG : look.test ? TEST_GREY : BLACK;
  const ink: RGBA = look.member ? ON_GOLD : GOLD;
  const m = mark();
  const out: Record<string, Uint8Array> = {};
  for (const k of [1, 2, 3]) {
    const sfx = k === 1 ? "" : `@${k}x`;
    // icon: the mark in gold on black, 72% of the square (the lock screen and notifications; the same on every card)
    const ic = 38 * k;
    const icon = new Canvas(ic, ic, BLACK);
    drawMark(icon, ic / 2, ic / 2, ic * 0.72, GOLD, ic * 0.72);
    out[`icon${sfx}.png`] = icon.png();
    // logo: the mark alone, 84% of 50 pt tall with a 4 pt margin each side, on a clear ground
    const lh = 50 * k, lw = Math.round(50 * (m.w / m.h) * 0.84 + 8) * k;
    const logo = new Canvas(lw, lh, CLEAR);
    drawMark(logo, lw / 2, lh / 2, lh * 0.84, ink, lw * 0.84);
    out[`logo${sfx}.png`] = logo.png();
    // strip: two rows of slots (five each for 10), 48 pt across, 18 pt apart, 14 pt between the rows
    const w = 375 * k, h = 144 * k;
    const strip = new Canvas(w, h, ground);
    const cols = Math.max(1, Math.ceil(look.slots / 2)), rows = look.slots > 1 ? 2 : 1;
    const fit = Math.min(1, (375 - 16) / (cols * 48 + (cols - 1) * 18));
    const r = 24 * fit * k, gx = 18 * fit * k, gy = 14 * k;
    const top = h / 2 - (rows - 1) * (gy / 2 + r);
    const left = (w - (cols * 2 * r + (cols - 1) * gx)) / 2 + r;
    for (let i = 0; i < look.slots; i++) {
      const cx = left + (i % cols) * (2 * r + gx), cy = top + Math.floor(i / cols) * (2 * r + gy);
      const filled = i < s;
      const stroke = (filled ? 2 : 1.5) * fit * k;
      strip.ring(cx, cy, r, r - stroke, look.member ? ON_GOLD : filled ? GOLD : GOLD_DIM);
      if (filled) drawMark(strip, cx, cy, 2 * r * 0.62, ink);
    }
    out[`strip${sfx}.png`] = strip.png();
  }
  drawn.set(id, out);
  return out;
}

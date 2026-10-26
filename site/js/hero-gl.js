/* Alchemist Detailing — paint, water and leather, drawn live in WebGL.

   Hero scenes (one is picked per visit):
     "beads"  glossy black paint covered in water beads; a studio light bar
              passes across the clear coat and shows in every drop.
     "gloss"  the same paint after drying off: a few beads left, so the clear
              coat and its metallic flake carry the light.
   Still pictures for the service cards, the wash background and the Bead
   Test come from the same shaders, plus a leather scene for Interior:
     art scenes: gloss, beads, leather, split (paint above, leather below),
                 film (a sheet of water lying flat on bare paint).

   The light is the same everywhere on the site: a warm bar (#fff6dc core,
   #f5ba4c body, a wide amber halo) reflected along the 118deg axis, gliding
   across the paint and back without ever leaving the frame, with a faint
   cooler panel beside it. The "studio" preset turns the black paint into
   cream paint under a white softbox for light mode.

   Live in the hero, a few of the largest drops slide slowly down the paint (not on phones) and soft specks of
   light drift up through the air in front of it (none in the stills or under reduced motion).

   Real photos or video of the owner's work can replace these later.
   Usage:
     AlchemistHero.start(canvas, { scene: 'beads' | 'gloss', still?: true, studio?: bool, flow?: [travel, share, rate], motes?: bool,
                                   entrance?: bool, onFrame?: fn(hero), onSkip?: fn() })
       -> { stop, pause, resume, setStudio(on), setSweep(0..1), enter(rowY, endX), lineX(y) } or null without WebGL
       studio follows html[data-theme] when the option is left out; flow: how far the moving drops travel
       (grid cells), the share of the largest drops that move, and their cycles a second. entrance: the studio
       light comes on with enter() (see there); onFrame runs after every picture, for what follows the light on
       the page; onSkip if a slow first picture cancels an entrance already planned. lineX(y): where the light
       bar's centre line crosses the screen row y in the last picture (px, both in the viewport; null until the hero
       has been laid out and seen by its observer).
     AlchemistHero.art(scene, width, height, time, { studio?, live?, intro?, form?, sweep?, sweepRange?, roll? })
       -> a canvas to copy from: the picture is its lower left width x height corner (the canvas only grows),
       or to show while a sequence is drawn through it, frame by frame
     AlchemistHero.artRoom() -> [width, height] of that canvas, or null before the first still
     AlchemistHero.artBar(scene, width, height, time) -> { rest, level(x, y), line(L, y) }: where the light bar of that
       picture is, for a page that follows it (x and y are 0..1 across and down the frame; see there) */
(function () {
  'use strict';

  // One light for the whole site, written once: the shaders below take these numbers, and the script uses the same
  // ones to say where the bar is (the glass bar's edge, the entrance's timing), so the page and the paint never part.
  // The bar is reflected along the 118deg axis LD and glides across the paint and back (a pass takes about 10 s):
  // DRIFT is its place on that axis over time, CURVE the panel's curvature that bends it, SPAN how much paint a
  // screen height shows, PAN the paint's slow drift a second.
  const LD = [0.82, -0.57];
  const DRIFT = [0.1, 0.5, 0.3, 0.05, 0.11];   // 0.1 + 0.5 sin(0.3 t) + 0.05 sin(0.11 t)
  const CURVE = [0.05, 1.8, 0.4, 0.02, 3.1];   // 0.05 sin(1.8 y + 0.4) + 0.02 sin(3.1 x)
  const SPAN = 1.35, PAN = [0.006, 0.0025];
  const BODY = [60, 160];   // the bar's body across its axis: exp(-d*d*BODY), from BODY[0] on a wide frame to BODY[1] on a tall one
  const drift = (t) => DRIFT[0] + DRIFT[1] * Math.sin(t * DRIFT[2]) + DRIFT[3] * Math.sin(t * DRIFT[4]);
  const curve = (x, y) => CURVE[0] * Math.sin(y * CURVE[1] + CURVE[2]) + CURVE[3] * Math.sin(x * CURVE[4]);
  const glf = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));   // as a GLSL float

  const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uIntro;      // 0..1 fade-in of the light
uniform float uDensity;    // how many water beads (1 = wet, ~0.3 = mostly clear paint)
uniform float uZoom;
uniform float uScene;      // art only: 0 gloss, 1 beads, 2 leather, 3 split, 4 film
uniform float uStudio;     // 1 = light mode: cream paint under a white softbox
uniform float uSweep;      // nudges the light bar along its axis by (uSweep - 0.5)*uSweepK (0.5 = at rest)
uniform float uSweepK;     // how far uSweep moves the bar (the stills: 0.5, a quarter of the screen either way; the live hero: 1)
uniform vec4 uFlow;        // the moving drops: travel (cells; 0 = none), share, cycles a second (0: one pass), its progress
uniform float uForm;       // 0..1 the drops forming: each appears small at its own moment and beads up (1 = all formed)
uniform float uMotes;      // 1 = the drifting specks of light in the air (the live hero)
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
// The brand's gold (--au-500 #f5ba4c, --au-200 #fddd97), the light's warm core (--au-100 #fff6dc) and its deep amber falloff.
const vec3 GOLD = vec3(0.961, 0.729, 0.298);
const vec3 GOLD_HI = vec3(0.992, 0.867, 0.592);
const vec3 CORE = vec3(1.0, 0.965, 0.863);
const vec3 AMBER = vec3(0.60, 0.40, 0.10);
const vec3 COOL = vec3(0.80, 0.82, 0.86);
// One light for the whole site: a studio light bar reflected across the 118deg axis (the numbers come
// from the script's LD, DRIFT and CURVE). It glides across the paint and back (a pass takes about 10 s),
// slowing at the turns, and never leaves the visible paint or jumps: the frame spans about +-1.3 on this
// axis at 1440 wide and +-0.8 on a phone, the bar stays within -0.45..0.65.
const vec2 LD = vec2(${glf(LD[0])}, ${glf(LD[1])});
float lightPos(float t){ return ${glf(DRIFT[0])} + ${glf(DRIFT[1])}*sin(t*${glf(DRIFT[2])}) + ${glf(DRIFT[3])}*sin(t*${glf(DRIFT[4])}) + (uSweep - 0.5)*uSweepK; }
// Signed distance to the bar's centre line. The paint is not a mirror: orange peel
// (fine normals) and the panel's curvature bend the reflection a little.
float curvature(vec2 q){ return ${glf(CURVE[0])}*sin(q.y*${glf(CURVE[1])} + ${glf(CURVE[2])}) + ${glf(CURVE[3])}*sin(q.x*${glf(CURVE[4])}); }
float lightD(vec2 q, float t){
  float w = (noise(q*11.0) - 0.5)*0.008 + (noise(q*47.0) - 0.5)*0.0025;
  return dot(q, LD) - lightPos(t) + w + curvature(q);
}
vec3 finish(vec3 c, vec2 uv){
  // vignette, gentle filmic curve, fine grain (all softer on the cream studio)
  float v = smoothstep(1.25, 0.25, length((uv - 0.5)*vec2(1.15, 1.0)));
  c *= mix(mix(0.55, 0.93, uStudio), 1.0, v);
  // tone-map on brightness only, so the gold keeps its saturation
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= 1.0/(1.0 + lum*mix(0.75, 0.05, uStudio));
  c += (hash21(uv*uRes + fract(uTime)*91.7) - 0.5)*mix(0.012, 0.006, uStudio);
  return pow(max(c, 0.0), vec3(0.95));
}`;

  // Wet paint: what the clear coat reflects (a near-black studio, the warm bar with its
  // bloom, a faint cooler panel beside it), then five layers of beads over it.
  const PAINT = `
// The environment seen in the clear coat at q. d is the distance to the bar; sharp (0..1)
// widens and dims the core where the picture is out of focus. The bar is anisotropic:
// stretched along its axis, soft across it, never a hard-edged band.
vec3 envAt(float d, float sharp){
  float ds = d + 0.42;
  // a tall frame (a phone): the bar's band runs its whole height, so the same band on the paint would cover about
  // twice the share of the screen it does on a desk. There it is drawn narrower, core and body, and its body a little
  // dimmer (and the live hero's paint zooms out a little more), so its gold covers about a desk's share of the screen
  float portrait = 1.0 - min(uRes.x/uRes.y, 1.0);
  vec3 base = mix(vec3(0.003, 0.003, 0.004), vec3(0.94, 0.93, 0.91), uStudio);
  // the studio preset: a wide white softbox panel beside the warm bar
  base = mix(base, vec3(0.985, 0.98, 0.97), smoothstep(0.30, 0.22, abs(ds))*0.95*uStudio);
  float k = mix(80.0, 420.0, sharp)*mix(1.0, 1.5, portrait);
  float core = exp(-d*d*k)*sqrt(k/420.0);
  float body = exp(-d*d*mix(${glf(BODY[0])}, ${glf(BODY[1])}, portrait));
  // the halo: a wide, dim amber spill that keeps the whole panel warm, so the drops have light to bend
  float halo = exp(-d*d*1.8);
  vec3 bar = ((CORE*core*2.4 + GOLD*body*1.2)*mix(1.0, 0.7, portrait) + AMBER*halo*0.26)*mix(1.0, 0.35, uStudio);
  vec3 c = base + bar*uIntro;
  // a second, cooler reflection beside the bar: the soft edge of a panel, a wide gaussian with no edge
  float d2 = d + 0.52;
  c += COOL*exp(-d2*d2*40.0)*0.08*(1.0 - uStudio)*uIntro;
  return c;
}
vec3 env(vec2 q, float t, float sharp){ return envAt(lightD(q, t), sharp); }
// the same without the orange peel: for what a drop refracts (cheaper)
vec3 envFast(vec2 q, float t, float sharp){ return envAt(dot(q, LD) - lightPos(t) + curvature(q), sharp); }

// The nearest bead to g in a jittered grid: its offset o from the centre (in radii), its
// radius rr (grid cells) and distance tt (radii). Radii follow a power law (most beads tiny,
// few large); beads sag downward; a few of the large ones trail a run where two merged.
// clr is a clearing (its centre in grid cells, and the scale to its ellipse), hole how much it
// clears: a bead is kept or dropped by its centre, so none is ever cut through.
// Compiled in only where they are used:
//   FLOW  the live hero: in the largest layer a share (flow.y) of the beads slide slowly down by up to flow.x
//         cells and back, flow.z cycles a second, fading in at the top and out at the end of their travel (fa)
//   ROLL  the stills' program, for the Bead moment drawn through it: one pass instead, flow.w carrying them from 0
//         to 1, as far as flow.x cells, so the search reaches two cells up for them
//   FORM  the stills' program too: the beads forming (uForm below 1)
// A still sets flow to 0 and uForm to 1, so neither changes a pixel of it.
// A moving bead takes its run with it, and leaves no track: on a sealed finish the water rolls off clean.
#ifdef ROLL
#define JMAX 2
#else
#define JMAX 1
#endif
float beads(vec2 g, float density, float rmin, float rmax, float sag, float runs, vec4 clr, float hole, vec4 flow, out vec2 o, out float rr, out float tt, out float fa){
  vec2 id = floor(g);
  float best = 9.0;
  o = vec2(0.0); rr = 0.0; fa = 1.0;
  for (int j = -1; j <= JMAX; j++){
    if (j == 2 && flow.x < 0.45) break;       // only a bead that travels further is found from two cells below its own
    for (int i = -1; i <= 1; i++){
      vec2 cid = id + vec2(float(i), float(j));
      vec2 c = cid + 0.2 + hash22(cid*1.37 + 3.1)*0.6;
      float kept = hole > 0.0 ? mix(1.0, smoothstep(0.28, 0.58, length((c - clr.xy)*clr.zw)), hole) : 1.0;
      float hv = hash21(cid*0.731 + 4.1);
      if (hv > density*kept) continue;
      float rh = hash21(cid + 7.7);
      float r = mix(rmin, rmax, pow(rh, 2.2));
#ifdef FORM
      if (uForm < 1.0){
        // each bead starts at its own moment and grows to its size
        float p0 = hv/max(density*kept, 1e-3)*0.6;
        r *= smoothstep(p0, p0 + 0.4, uForm);
        if (r < 1e-3) continue;
      }
#endif
      float f = 1.0;
#if defined(FLOW) || defined(ROLL)
      if (hv < density*kept*flow.y){
        float h = fract(rh*9.71);
#ifdef ROLL
        float ph = clamp(flow.w*1.5 - h*0.5, 0.0, 1.0);
        c.y -= flow.x*ph*ph;                  // breaks free, then gathers pace
#else
        float ph = fract(uTime*flow.z*(0.75 + 0.5*h) + h);
        c.y -= flow.x*smoothstep(0.1, 0.85, ph);
        f = smoothstep(0.0, 0.1, ph)*(1.0 - smoothstep(0.86, 1.0, ph));
#endif
      }
#endif
      vec2 dv = g - c;
      dv.x *= 1.0 + (hash21(cid + 5.5) - 0.5)*0.24;
      if (dv.y < 0.0) dv.y /= 1.0 + sag;          // the lower half bulges with gravity
      float tn = length(dv)/r;
      if (tn < best){ best = tn; rr = r; o = dv/r; fa = f; }
      if (runs > 0.0 && hash21(cid + 9.3) < 0.06){
        // a run: a thinner capsule from the centre down, with a rounded head
        float len = r*mix(0.6, 1.4, hash21(cid + 1.9));
        vec2 dr = vec2(dv.x, dv.y - clamp(dv.y, -len, 0.0));
        float r2 = r*0.35;
        float tn2 = length(dr)/r2;
        if (tn2 < best){ best = tn2; rr = r2; o = dr/r2; fa = f; }
      }
    }
  }
  tt = best;
  return best < 1.6 ? 1.0 : 0.0;
}
#ifdef LITE
#define K0 1     // phones: the mist between the beads is a pixel wide, skip it (keeps the frame cost); the fine beads stay
#define RUNS 0.0
#else
#define K0 0
#define RUNS 1.0
#endif
// One layer of drops over col (k: 0 the mist between the beads .. 4 the largest drops; flow: see beads).
vec3 layer(vec3 col, int k, vec2 q, float t, float blur, float sag, float d0, float density, float zoom, float hole, vec2 qc, vec4 flow){
  vec2 LP = vec2(-LD.y, LD.x);     // along the bar
  float sc, dens, rmin, rmax;
  if (k == 0){ sc = 70.0; dens = 0.35; rmin = 0.03; rmax = 0.05; }        // mist between the beads
  else if (k == 1){ sc = 34.0; dens = 0.30; rmin = 0.06; rmax = 0.12; }
  else if (k == 2){ sc = 19.0; dens = 0.55; rmin = 0.11; rmax = 0.28; }
  else if (k == 3){ sc = 9.0; dens = 0.58; rmin = 0.15; rmax = 0.36; }
  else { sc = 4.6; dens = 0.55; rmin = 0.18; rmax = mix(0.30, 0.22, uStudio); }   // the largest drops stay under ~90px (65px on cream)
  // the two finest layers melt into the blur above and below the focus band
  float keep = k <= 1 ? 1.0 - smoothstep(0.45, 0.65, blur) : 1.0;
  if (keep <= 0.0) return col;
  vec2 o; float rr; float tn; float fa;
  vec4 clr = vec4(qc*sc + float(k)*17.3, vec2(0.7, 1.2)/(${glf(SPAN)}*zoom*sc));   // on screen: length((uv - .5)*vec2(asp*.7, 1.2))
  // on cream paint every drop shows, so the studio carries fewer of them and the wordmark keeps its room
  float b = beads(q*sc + float(k)*17.3, dens*density*(1.0 - 0.4*uStudio), rmin, rmax, k == 0 ? 0.0 : sag, k >= 3 ? RUNS : 0.0, clr, hole, flow, o, rr, tn, fa);
  if (b < 0.5) return col;
  float soft = 0.025 + blur*0.30*(k == 4 ? 1.0 : 0.7);
  float a = (1.0 - smoothstep(1.0 - soft, 1.0 + soft, tn))*keep;
  float tt = clamp(tn, 0.0, 1.0);
  float z = sqrt(max(1.0 - tt*tt, 0.0));
  vec3 n = normalize(vec3(o*1.25, z*0.8 + 0.2));      // a flattened dome: broad streak highlights
  float fres = pow(1.0 - z, 2.5);
  // where the bar is for this bead (dc: its centre's distance from the bar). The light comes from the
  // bar's side, weaker the further away, but never gone: every drop keeps a little of the bar.
  float dc = d0 - dot(o*(rr/sc), LD);
  float near = exp(-dc*dc*3.0);
  float lit = max(near, 0.15);
  vec3 L = normalize(vec3(-LD*clamp(dc, -1.0, 1.0)*0.6, 0.8));
  // away from the bar, in the paint's plane: at least a third of a side, so the crescent never vanishes
  vec2 away = LD*clamp(sign(dc)*max(abs(dc)/0.2, 0.35), -1.0, 1.0);
  vec2 on = normalize(o + vec2(1e-4, 0.0));
  float lightSide = max(dot(on, -away), 0.0);
  // the bar reflected in the dome: a short streak along the bar's axis, inside the drop
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  vec2 dv2 = (R - L).xy;
  float al = dot(dv2, LP), ac = dot(dv2, LD);
  float spec = exp(-(al*al*mix(14.0, 4.0, blur) + ac*ac*mix(110.0, 24.0, blur)))*(1.0 + 1.0*near)*uIntro*(1.0 - blur*0.5);
  vec3 rimCol = mix(GOLD_HI, CORE, near);
  if (k == 0){
    // micro-droplets: just a rim and a glint, no refraction
    float rim0 = fres*(0.3 + 0.7*lightSide);
    vec3 c0 = col*(1.0 - smoothstep(0.5, 0.97, tt)*0.18) + rimCol*rim0*(0.08 + 0.7*near)*uIntro + CORE*spec*0.6;
    return mix(col, c0, a);
  }
  // looking into the drop: a convex lens on a mirror shows the scene upright and squeezed (several
  // radii of paint in each direction), pulled a little toward the light: the half facing the bar
  // carries the bar's halo, the far half the darker paint
  vec2 qr = q + o*(rr/sc)*2.6 - away*0.12*rr;
  vec3 c = envFast(qr, t, 0.6)*0.9*(1.0 - fres*0.85)*(1.0 + 0.05*uStudio);
  // the meniscus: a dark band just inside the edge (on cream paint a thinner, lighter one)
  c *= 1.0 - mix(smoothstep(0.62, 0.97, tt)*0.85, smoothstep(0.78, 0.97, tt)*0.6, uStudio);
  // a darker crescent on the side away from the bar
  c *= 1.0 - 0.55*smoothstep(0.3, 0.95, dot(o, away))*smoothstep(0.5, 1.0, tt);
  // the bar compressed into the drop: a short warm streak on the bar's side (the lit face of every
  // drop in the reference), falling off slowly with distance so far drops still carry it
  float ib = dot(o, LD) + clamp(dc*2.0, -0.7, 0.7);
  float img = exp(-ib*ib*12.0)*exp(-pow(dot(o, LP), 2.0)*1.5)*(1.0 - smoothstep(0.7, 0.95, tt))*(0.35 + 0.65*exp(-dc*dc*0.6));
  c += mix(GOLD*0.9, CORE, near)*img*0.5*uIntro*(1.0 - uStudio*0.3);
  // fresnel-bright rim, lit on the bar's side (on cream: bright on the bar's side, shaded opposite);
  // the cool panel in the far rim
  float rim = fres*(mix(0.25, 0.15, uStudio) + mix(0.75, 0.85, uStudio)*lightSide);
  c += rimCol*rim*(0.35 + 0.75*near)*uIntro*(1.0 - uStudio*0.8);
  c += vec3(1.0)*rim*0.45*uStudio*uIntro;
  c += COOL*fres*(1.0 - lightSide)*0.06*(1.0 - uStudio)*uIntro;
  c += CORE*spec*(1.0 + 1.2*uStudio);
  // on the paint around the drop: a soft contact shadow on the far side, and the bar's light
  // focused through the drop onto the paint just beyond it (a bright lens caustic on cream)
  float outside = step(1.0, tn);
  vec2 cp = o + away*1.15;
  float caus = exp(-dot(cp, cp)*6.8)*smoothstep(1.5, 1.0, tn)*outside*lit;
  float shadow = smoothstep(1.3, 1.0, tn)*outside*(0.5 + 0.5*dot(on, away))*0.35;
  vec3 ground = col*(1.0 - shadow) + GOLD*caus*0.25*uIntro*(1.0 - uStudio) + vec3(1.0)*caus*0.35*uStudio;
  return mix(col, mix(ground, c, a), fa);      // a moving drop fades in and out with its shadow and caustic
}
// hole: 0..1, a clearing behind the hero's text (the studio on a wide screen): the drops thin out
// over an ellipse round the wordmark, tagline and buttons and keep their crisp edges everywhere else
vec3 paint(vec2 uv, float asp, float t, float density, float zoom, float hole){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*${glf(SPAN)}*zoom + vec2(t*${glf(PAN[0])}, t*${glf(PAN[1])});
  vec2 qc = vec2(t*${glf(PAN[0])}, t*${glf(PAN[1])});    // the text block's centre: the middle of the screen
  // shallow depth of field: sharp across the middle band, soft above and below
  float blur = smoothstep(0.10, 0.48, abs(uv.y - 0.46 - 0.04*sin(t*0.05)));
  float d0 = lightD(q, t);
  vec3 col = envAt(d0, 1.0 - blur*0.85);
  float body = exp(-d0*d0*60.0);
  // metallic flake: tiny sparkles, only where the bar lights the paint
  float fl = step(0.9955, hash21(floor(q*640.0)));
  col += GOLD_HI*fl*body*(1.0 - blur)*uIntro*(1.0 - uStudio*0.7);
  float sag = 0.18*(1.0 - blur);
#ifdef FLOW
  for (int k = K0; k < 4; k++) col = layer(col, k, q, t, blur, sag, d0, density, zoom, hole, qc, vec4(0.0));
  // the largest drops on their own, so only they carry the code that moves a few of them
  return layer(col, 4, q, t, blur, sag, d0, density, zoom, hole, qc, uFlow);
#else
  // (with ROLL, in the stills' program, only the largest drops roll)
  for (int k = K0; k < 5; k++) col = layer(col, k, q, t, blur, sag, d0, density, zoom, hole, qc, k == 4 ? uFlow : vec4(0.0));
  return col;
#endif
}
// A sheet of water lying flat on bare paint (the Bead Test's "before" side): soft
// ripples, the bar smeared along the film, puddle edges that catch the light.
vec3 film(vec2 uv, float asp, float t){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*${glf(SPAN)} + vec2(t*${glf(PAN[0])}, t*${glf(PAN[1])});
  float m = fbm(q*1.4 + 5.0) - 0.5;
  float inside = smoothstep(-0.012, 0.012, m);
  float edge = exp(-m*m*1800.0);
  vec2 rip = vec2(noise(q*6.0 + t*0.1), noise(q*6.0 + 7.0 - t*0.08)) - 0.5;
  vec2 qf = q + rip*0.09*inside;
  vec3 dry = env(q, t, 0.9);
  // the bar smeared along the film: five taps across the sheet
  vec3 wet = vec3(0.0);
  for (int i = -2; i <= 2; i++) wet += envFast(qf + vec2(0.0, 0.03*float(i)), t, 0.3);
  wet /= 5.0;
  // the sheet lifts the paint a shade and smears the studio into it
  wet = wet*1.08 + vec3(0.05, 0.05, 0.06)*(1.0 - uStudio) + COOL*(noise(q*2.5 + 1.0) - 0.5)*0.03*(1.0 - uStudio);
  float d = lightD(q, t);
  // one soft, stretched highlight where the ripples face the bar
  vec3 nr = normalize(vec3(-rip*0.6, 1.0));
  vec3 Lf = normalize(vec3(-LD*clamp(d, -1.0, 1.0)*0.6, 0.8));
  vec3 Hf = normalize(Lf + vec3(0.0, 0.0, 1.0));
  wet += CORE*pow(max(dot(nr, Hf), 0.0), 60.0)*0.3*exp(-d*d*4.0)*uIntro;
  vec3 c = mix(dry, wet, inside);
  // the meniscus catches the bar only where the puddle's edge faces it (a real highlight is one-sided),
  // and only near the bar; the edge is a soft sheen, never a drawn outline
  float near = exp(-d*d*14.0);
  const float eps = 0.012;
  vec2 gm = vec2(fbm(q*1.4 + 5.0 + vec2(eps, 0.0)), fbm(q*1.4 + 5.0 + vec2(0.0, eps))) - 0.5 - m;
  float facing = smoothstep(0.0, 0.35, dot(normalize(-gm + vec2(1e-5, 0.0)), -LD*sign(d + 1e-5)));
  c += CORE*edge*facing*(0.012 + 0.3*near)*uIntro*(1.0 - uStudio*0.8);
  c *= 1.0 - edge*0.25*uStudio;                                    // on cream paint the edge reads dark
  return c;
}`;

  // Black quilted leather: diamond-stitched cushions in gold thread, with a
  // soft grain, lit from the upper left with the gold light passing across.
  const LEATHER = `
vec3 cellv(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float d = 8.0; vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash22(i + g)*0.8 + 0.1 - f;
      float dd = dot(r, r);
      if (dd < d){ d = dd; best = r; }
    }
  }
  return vec3(sqrt(d), best);
}
vec3 leather(vec2 uv, float asp, float t){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*1.2;
  vec3 L = normalize(vec3(-0.5, 0.62, 0.6));          // light from the upper left
  // diamond quilting: two families of stitch lines
  const vec2 A = vec2(3.2, 2.1);
  float lenA = length(A);
  float u = dot(q, A), v = dot(q, vec2(-A.x, A.y));
  float fu = fract(u) - 0.5, fv = fract(v) - 0.5;
  // cushion height and its slope
  float pu = 1.0 - pow(2.0*abs(fu), 2.4), pv = 1.0 - pow(2.0*abs(fv), 2.4);
  float h = pu*pv;
  float dpu = -2.4*pow(2.0*abs(fu) + 1e-4, 1.4)*2.0*sign(fu);
  float dpv = -2.4*pow(2.0*abs(fv) + 1e-4, 1.4)*2.0*sign(fv);
  vec2 grad = (dpu*pv)*A + (pu*dpv)*vec2(-A.x, A.y);
  // fine grain on top
  vec3 c1 = cellv(q*70.0);
  vec2 grain = -c1.yz*0.22*smoothstep(0.02, 0.45, c1.x);
  vec3 n = normalize(vec3(-grad*0.055 + grain, 1.0));
  float key = exp(-dot(q - vec2(-0.45, 0.55), q - vec2(-0.45, 0.55))*1.1);
  vec3 base = mix(vec3(0.055, 0.055, 0.058), vec3(0.62, 0.60, 0.57), uStudio);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = base*(0.25 + 1.0*key)*(0.35 + 0.95*diff);
  col *= 0.55 + 0.45*smoothstep(0.0, 0.35, h);        // creases at the stitches
  col *= 0.92 + (fbm(q*5.0 + 2.0) - 0.5)*0.3;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 14.0);
  col += vec3(0.15, 0.15, 0.16)*spec*(0.25 + key)*0.8;
  float d = dot(q, LD) - lightPos(t)*0.8;
  float band = exp(-d*d*3.5);
  col += GOLD*band*(0.02 + spec*0.42)*uIntro;
  // gold thread along both families of lines
  for (int k = 0; k < 2; k++){
    float f = k == 0 ? fu : fv;
    vec2 dir = k == 0 ? vec2(-A.y, A.x) : vec2(A.y, A.x);
    float along = dot(q, dir)/lenA;
    float dist = (0.5 - abs(f))/lenA;                 // q units from the line
    float a = dist/0.0048;
    float st = fract(along/0.024);
    float dash = smoothstep(0.1, 0.2, st)*(1.0 - smoothstep(0.8, 0.9, st));
    if (a < 1.0){
      float br = sqrt(max(1.0 - a*a, 0.0));
      float sh = 0.45 + 0.7*br*(0.55 + 0.45*sin(st*3.1416));
      vec3 th = GOLD*sh*(0.45 + key*0.75);
      th += vec3(1.0, 0.9, 0.7)*pow(br, 10.0)*(0.12 + band*0.9)*uIntro;
      col = mix(col, th, dash*smoothstep(1.0, 0.7, a));
      col *= 1.0 - (1.0 - dash)*0.5*smoothstep(1.0, 0.0, a);   // needle holes
    }
  }
  // tufts where the lines cross
  float cross = (0.5 - abs(fu))*(0.5 - abs(fv));
  col *= 1.0 - (1.0 - smoothstep(0.0, 0.006, cross))*0.6;
  return col;
}`;

  // Specks of light in the air in front of the paint, out of focus (the owner's "extremely subtle floating
  // particles"): soft discs 16 to 36px across rising slowly, each column of the screen at its own pace, a
  // little brighter where the bar's light is, kept out of the clearing round the text, none on cream paint.
  // One per cell at most, inside its cell, so a pixel looks at one cell only.
  const HERO_MAIN = `
float motes(vec2 uv, float asp, float t){
  vec2 p = (uv - 0.5)*vec2(asp, 1.0);                     // screen heights from the middle
  // the clearing round the text; a little lower on a portrait screen, so a phone keeps a few specks above and below it
  float clear = smoothstep(0.85, 1.2, length(p/vec2(min(0.5, asp*0.45), asp < 1.0 ? 0.26 : 0.31)));
  if (clear <= 0.0) return 0.0;
  // a portrait screen keeps them to the bands above and below the text: there smaller cells, more of them taken
  float CELL = asp < 1.0 ? 0.15 : 0.18;
  float colm = floor(p.x/CELL);
  float rise = mix(0.01, 0.022, hash21(vec2(colm, 3.3)));  // screen heights a second
  vec2 g = vec2(p.x, p.y - t*rise)/CELL;
  vec2 id = floor(g);
  if (hash21(id + 0.7) > (asp < 1.0 ? 0.8 : 0.5)) return 0.0;
  vec2 h = hash22(id*1.7 + 2.3);
  float s = hash21(id + 5.1);
  float r = mix(0.05, 0.11, s*s);                         // 16 to 36px across on a desktop screen
  vec2 c = 0.2 + h*0.6 + vec2(0.05*sin(t*0.21 + h.y*6.283), 0.0);
  float d = length(fract(g) - c)/r;
  float m = smoothstep(1.0, 0.3, d)*(0.8 + 0.2*d);        // a soft disc, its rim a touch brighter: out of focus
  m *= 0.8 + 0.2*sin(t*0.5 + h.x*40.0);
  return m*mix(1.0, 0.55, s)*clear;                       // the larger (nearer) ones fainter
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float asp = uRes.x/uRes.y;
  // the studio's clearing behind the text, on wide screens only (a phone's drops already leave the text its room)
  vec3 c = paint(uv, asp, uTime, uDensity, uZoom, uStudio*smoothstep(0.9, 1.2, asp));
  if (uMotes > 0.0){
    float m = motes(uv, asp, uTime);
    if (m > 0.0){
      vec2 q = (uv - 0.5)*vec2(asp, 1.0)*${glf(SPAN)}*uZoom + vec2(uTime*${glf(PAN[0])}, uTime*${glf(PAN[1])});
      float d = dot(q, LD) - lightPos(uTime);
      c += CORE*m*(0.055 + 0.045*exp(-d*d*10.0))*uIntro*(1.0 - uStudio)*uMotes;
    }
  }
  gl_FragColor = vec4(finish(c, uv), 1.0);
}`;

  const ART_MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float asp = uRes.x/uRes.y;
  vec3 c;
  if (uScene < 0.5) c = paint(uv, asp, uTime, 0.32, 1.12, 0.0);
  else if (uScene < 1.5) c = paint(uv, asp, uTime, 1.0, 1.0, 0.0);
  else if (uScene < 2.5) c = leather(uv, asp, uTime);
  else if (uScene < 3.5) {
    // paint above a diagonal, leather below, a thin gold trim between
    vec2 q = (uv - 0.5)*vec2(asp, 1.0);
    float m = q.y + q.x*0.42 - 0.04;
    vec3 a = paint(uv, asp, uTime, 0.55, 1.05, 0.0);
    vec3 b = leather(uv, asp, uTime + 3.0);
    c = mix(b, a, smoothstep(-0.004, 0.004, m));
    float trim = exp(-m*m*26000.0);
    c = mix(c, GOLD_HI, trim*0.9);
    c += GOLD*exp(-m*m*900.0)*0.12;
  }
  else c = film(uv, asp, uTime);
  gl_FragColor = vec4(finish(c, uv), 1.0);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
    return s;
  }

  function program(gl, frag) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n) => gl.getUniformLocation(prog, n);
    return { prog, uRes: u('uRes'), uTime: u('uTime'), uIntro: u('uIntro'), uDensity: u('uDensity'), uZoom: u('uZoom'), uScene: u('uScene'), uStudio: u('uStudio'), uSweep: u('uSweep'),
      uSweepK: u('uSweepK'), uFlow: u('uFlow'), uForm: u('uForm'), uMotes: u('uMotes') };
  }

  const root = document.documentElement;
  const isLight = () => root.dataset.theme === 'light';
  const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));
  // a CSS cubic-bezier as a function of 0..1 (clamped), so the script's own motion runs on the site's curves
  function bezier(x1, y1, x2, y2) {
    const B = (a, b, t) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
    const dB = (a, b, t) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
    return (x) => {
      if (!(x > 0)) return 0;
      if (x >= 1) return 1;
      // Newton's method: the site's curves are nowhere flat along x, so four steps are exact far below a pixel
      let t = x;
      for (let i = 0; i < 4; i++) { const d = dB(x1, x2, t); if (d < 1e-6) break; t = Math.min(1, Math.max(0, t - (B(x1, x2, t) - x) / d)); }
      return B(y1, y2, t);
    };
  }
  const inOut = bezier(0.65, 0, 0.35, 1);   // --ease-in-out, the curve of every pass of light

  function start(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!opts.still, powerPreference: 'high-performance' });
    if (!gl) return null;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    // slower devices render smaller and at 30 fps (?noadapt keeps full quality for checks)
    const noadapt = /[?&]noadapt/.test(location.search);
    const lowEnd = !noadapt && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4);
    const scale = opts.scale || (small ? 0.55 : lowEnd ? 0.6 : 0.75);   // render below screen resolution: soft, fast
    const fps0 = opts.fps || (small || lowEnd ? 30 : 60);
    const preset = opts.scene === 'gloss' ? { density: 0.32, zoom: 1.12 } : { density: 1.0, zoom: 1.0 };
    let studio = opts.studio != null ? !!opts.studio : isLight();
    let sweep = 0.5;
    // live, a few of the largest drops slide slowly down (0.4 of a cell, about 12 s a cycle) and the specks drift;
    // a still keeps every drop where it is. Phones (LITE) keep their frame cost: the specks cost next to nothing and
    // drift there too, the sliding drops are left to larger screens
    const flow = opts.still ? [0, 0, 0] : opts.flow || (small ? [0, 0, 0] : [0.4, 0.12, 0.08]);
    const motes = !opts.still && opts.motes !== false;
    let P = null, raf = 0, last = 0, visible = true, lost = false, running = false, paused = false, stopped = false, vw = 0, vh = 0;
    let t0 = performance.now();   // set again once the shader is built, so a slow build never eats the light's fade-up
    let timeOffset = opts.time != null ? opts.time : 4 + Math.random() * 30;
    let zoom = 1, shown = { T: timeOffset, L: drift(timeOffset) }, rect = null;   // the last picture: its paint time, where its bar was

    // portrait screens see less of the surface, so zoom out a little there (and the bar's band takes less of the
    // screen); the cream studio a little more, so its drops stay small on the paint
    function applyZoom() {
      const portrait = canvas.clientHeight > canvas.clientWidth;
      zoom = preset.zoom * (portrait ? 1.45 : 1) * (studio ? 1.2 : 1);
      gl.uniform1f(P.uZoom, zoom);
    }
    // the canvas on the screen, kept in page coordinates (so a scroll needs no layout) and taken from the observer's
    // reports below, which come from the page's own layout: a picture never makes the page lay out. Measured only for
    // a still and for enter() (called once the page is laid out); null until then
    function place(r) { rect = r && r.width > 0 ? { left: r.left + window.scrollX, top: r.top + window.scrollY, w: r.width, h: r.height || 1 } : null; }
    function box(measure) {
      if (!rect && measure) place(canvas.getBoundingClientRect());
      return rect && { left: rect.left - window.scrollX, top: rect.top - window.scrollY, w: rect.w, h: rect.h };
    }
    // a screen point's place on the light's axis at paint time T: the bar's centre line passes through it when the
    // bar is there (the shader's paint() coordinates and lightD(), without the orange peel)
    function axisAt(x, y, T, r) {
      const k = SPAN * zoom;
      const qx = ((x - r.left) / r.w - 0.5) * (r.w / r.h) * k + T * PAN[0], qy = (0.5 - (y - r.top) / r.h) * k + T * PAN[1];
      return qx * LD[0] + qy * LD[1] + curve(qx, qy);
    }
    // where the bar's centre line crosses the screen row y in the last picture (px; null before the canvas is placed)
    function lineX(y) {
      const r = box(!!opts.still), k = SPAN * zoom, { T, L } = shown;
      if (!r) return null;
      const qy = (0.5 - (y - r.top) / r.h) * k + T * PAN[1];
      let qx = 0;
      for (let i = 0; i < 3; i++) qx = (L - qy * LD[1] - curve(qx, qy)) / LD[0];
      return r.left + ((qx - T * PAN[0]) / ((r.w / r.h) * k) + 0.5) * r.w;
    }

    // The studio light comes on (opts.entrance, from enter(rowY, endX) on, which the page calls as the hero's intro
    // starts). Until then the bar rests where it always has, unseen (the light fades up from 0.3 s). From enter() it
    // waits at the left edge on the wordmark's row (rowY), its centre just beyond it, while the light comes up; it glides
    // across the paint until its body has cleared the word's end (endX; at least IN.to, at most IN.over of the width)
    // in IN.glide on --ease-in-out, so the crossing itself takes about IN.glide, and slows there, where its own drift
    // takes it on (over IN.back the two blend), and from then on the hero is as it always was. The path is measured
    // on the wordmark's row in widths of the screen, so a phone sees the light cross at the same pace as a desk. Its
    // clock stops while the hero is paused (the menu over it) and runs on, unseen, off the screen or in a hidden tab.
    // enter() later than 0.35 s after the shader was built (the light already up) plays nothing; a first picture that
    // comes only once the glide is under way (a stalled start, IN.at + 0.3 s after enter()) cancels it (onSkip), so the
    // bar never pops in part way across: it is at rest, as before.
    const IN = { at: 0.5, glide: 3.6, back: 5, tail: 1, from: -0.05, to: 0.86, over: 1.05 };
    let armed = !!opts.entrance && !opts.still, entry = null;
    function entryAt(s, rest) {
      const g = (s - IN.at) / IN.glide, x = entry.from + (entry.to - entry.from) * inOut(g);
      return g < 1 ? x : x + (rest - x) * inOut((s - IN.at - IN.glide) / IN.back);
    }
    function enter(rowY, endX) {
      if (!armed || lost) return null;
      armed = false;
      const now = performance.now();
      if (now - t0 > 350) return null;
      const r = box(true), turn = IN.at + IN.glide, end = turn + IN.back;
      if (!r) return null;   // (no box: a zero-size canvas, a page printed as it loads)
      // it slows with its body (where it is brighter than half its middle, as envAt draws it) just clear of endX on the
      // row: on a phone, where the word runs nearly to the edge, just beyond the edge
      const portrait = 1 - Math.min(r.w / r.h, 1);
      const reach = Math.sqrt(Math.LN2 / (BODY[0] + (BODY[1] - BODY[0]) * portrait)) * r.h / (SPAN * zoom * LD[0]);
      const toX = r.left + Math.min(IN.over, Math.max(IN.to, ((endX || 0) + reach - r.left) / r.w)) * r.w;
      const tAt = (s) => timeOffset + (now - t0) / 1000 + s;   // paint time s seconds into the entrance
      // the drift takes the bar on where it slows: the paint's clock is set now (unseen, the light still dark) so the
      // drift is there at that moment and on its way back, and from the turn the bar simply drifts on with it
      // (where the turn is beyond the drift's reach, as near as it comes: its own turn). The clock is scanned in
      // half seconds, one of the nearly best is taken at random (each visit sees the paint at another moment),
      // and the best fit is found around it
      if (opts.time == null) {
        const base = (now - t0) / 1000 + turn;
        const miss = (o) => { const T = o + base, d = drift(T); return drift(T + 0.05) <= d ? Math.abs(d - axisAt(toX, rowY, T, r)) : Infinity; };
        const fits = [];
        let best = Infinity;
        for (let o = 4; o <= 34; o += 0.5) { const m = miss(o); fits.push(m); if (m < best) best = m; }
        const near = [];
        fits.forEach((m, i) => { if (m < best + 0.06) near.push(4 + i * 0.5); });
        let pick = near[Math.floor(Math.random() * near.length)], pm = miss(pick);
        for (let o = pick - 0.2, k = 0; k <= 4; k++, o += 0.1) { const m = miss(o); if (m < pm) { pm = m; pick = o; } }
        timeOffset = pick;
      }
      entry = { at: now, held: 0, pausedAt: 0, seen: !wanted(), from: axisAt(r.left + IN.from * r.w, rowY, tAt(IN.at), r), to: axisAt(toX, rowY, tAt(turn), r) };
      // how far the bar's centre is past a screen point s seconds into the entrance (its drift taking it on after)
      const past = (x, y, s) => entryAt(s, drift(tAt(s))) - axisAt(x, y, tAt(s), r);
      // the moment it changes sign between lo and hi, found by halving (ms after enter())
      const halve = (x, y, lo, hi, n) => {
        const sign = past(x, y, lo) < 0;
        for (let i = 0; i < n; i++) { const s = (lo + hi) / 2; if ((past(x, y, s) < 0) === sign) lo = s; else hi = s; }
        return Math.round(hi * 1000);
      };
      // when the bar's centre first reaches a screen point: it only moves on during the glide; null for a point
      // beyond its turn
      function when(x, y) {
        if (past(x, y, turn) < 0) return null;
        return past(x, y, IN.at) >= 0 ? IN.at * 1000 : halve(x, y, IN.at, turn, 9);
      }
      // when it has gone back past that point on its way back (looked for from `after` ms, when it is known not to be
      // back yet), by `until` (the entrance and IN.tail after it); null if not
      function back(x, y, after) {
        if (past(x, y, turn) < 0) return null;
        for (let s = Math.max(turn, (after || 0) / 1000) + 0.5; s <= end + IN.tail + 0.5; s += 0.5) {
          const t = Math.min(s, end + IN.tail);
          if (past(x, y, t) < 0) return halve(x, y, s - 0.5, t, 6);
        }
        return null;
      }
      return { when, back, turn: turn * 1000, end: end * 1000, until: (end + IN.tail) * 1000 };
    }
    function setup() {
      // the moving drops are compiled in only when they move
      P = program(gl, (small ? '#define LITE\n' : '') + (flow[0] > 0 ? '#define FLOW\n' : '') + COMMON + PAINT + HERO_MAIN);
      gl.uniform1f(P.uDensity, preset.density);
      applyZoom();
      gl.uniform1f(P.uStudio, studio ? 1 : 0);
      gl.uniform1f(P.uSweep, 0.5);
      gl.uniform1f(P.uSweepK, 1);   // draw() places the bar: uSweep carries its offset from the drift
      gl.uniform4f(P.uFlow, flow[0], flow[1], flow[2], 0);
      gl.uniform1f(P.uForm, 1);
      gl.uniform1f(P.uMotes, motes ? 1 : 0);
      vw = vh = 0;
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(canvas.clientWidth * dpr * scale));
      const h = Math.max(2, Math.round(canvas.clientHeight * dpr * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (vw !== w || vh !== h) { vw = w; vh = h; gl.viewport(0, 0, w, h); }
    }
    function draw(now) {
      if (lost) return;
      resize();
      const secs = (now - t0) / 1000, T = timeOffset + (opts.still ? 0 : secs);
      // where the bar is: its drift (setSweep nudges it by up to a quarter of the screen), or the entrance's path
      let L = drift(T) + (sweep - 0.5) * 0.5;
      if (entry) {
        const s = (now - entry.at - entry.held) / 1000;
        if (!entry.seen) {
          entry.seen = true;
          if (s > IN.at + 0.3) { entry = null; if (opts.onSkip) opts.onSkip(); }
        }
        if (entry && s >= IN.at + IN.glide + IN.back) entry = null;
        else if (entry) L = entryAt(s, L);
      }
      gl.uniform2f(P.uRes, canvas.width, canvas.height);
      gl.uniform1f(P.uTime, T);
      gl.uniform1f(P.uIntro, opts.still ? 1 : Math.min(1, Math.max(0, (secs - 0.3) / 1.6)));
      gl.uniform1f(P.uSweep, 0.5 + L - drift(T));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      shown = { T, L };
      if (opts.onFrame) opts.onFrame(api);
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      // after the intro the light only drifts: 30 fps is plenty, and half the cost
      const fps = now - t0 > 3000 ? Math.min(fps0, 30) : fps0;
      if (!visible || document.hidden || now - last < 1000 / fps - 2) return;
      last = now;
      draw(now);
    }
    function run() {
      if (running || lost || stopped || opts.still) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function halt() {
      running = false;
      cancelAnimationFrame(raf);
    }
    // the loop runs only while it can be seen: on the screen (the observer below), the tab shown, the menu closed
    const wanted = () => visible && !paused && !document.hidden;
    const follow = () => { if (wanted()) run(); else halt(); };
    const drawNow = () => draw(performance.now());
    function setStudio(on) {
      studio = !!on;
      if (lost) return;
      gl.uniform1f(P.uStudio, studio ? 1 : 0);
      applyZoom();
      if (opts.still) drawNow();
    }
    function setSweep(v) {
      sweep = clamp01(v);
      if (!lost && opts.still) drawNow();   // live, the next picture takes it
    }
    // A lost context (the tab in the background too long, the GPU reset): the loop stops and
    // the CSS fallback shows (html.no-hero-gl) until the browser gives the context back.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      halt();
      root.classList.add('no-hero-gl');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { setup(); } catch (err) { return; }
      lost = false;
      root.classList.remove('no-hero-gl');
      if (opts.still) drawNow(); else follow();
    });
    setup();
    t0 = performance.now();
    if (armed) box(true);   // the entrance needs the canvas's place: read now, while the page is laid out (app.js)

    const api = {
      stop() { stopped = true; halt(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', follow); if (themeWatch) themeWatch.disconnect(); window.removeEventListener('resize', onResize); },
      pause() {
        paused = true; halt();
        if (entry && !entry.pausedAt) entry.pausedAt = performance.now();
      },
      resume() {
        if (entry && entry.pausedAt) { entry.held += performance.now() - entry.pausedAt; entry.pausedAt = 0; }
        paused = false; follow();
      },
      setStudio,
      setSweep,
      enter,
      lineX,
    };
    // the studio preset follows the site's theme unless the caller chose
    let themeWatch = null;
    if (opts.studio == null && window.MutationObserver) {
      themeWatch = new MutationObserver(() => setStudio(isLight()));
      themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }
    // a new size: the still is measured again as it is drawn; the live hero waits for the observer's next report
    // (observed afresh), and its glass light holds still until then
    const onResize = () => {
      if (opts.still) { rect = null; drawNow(); return; }
      resize();
      if (io) { io.unobserve(canvas); io.observe(canvas); }
    };
    window.addEventListener('resize', onResize);
    let io = null;
    if (opts.still) drawNow();
    else {
      io = new IntersectionObserver((es) => { const e = es[es.length - 1]; visible = e.isIntersecting; place(e.boundingClientRect); follow(); }, { threshold: 0 });
      io.observe(canvas);
      document.addEventListener('visibilitychange', follow);
      run();
    }
    return api;
  }

  // One shared offscreen context for every still picture. Its canvas only grows: each picture is drawn into its
  // lower left corner and the caller copies that corner, so a resize (it waits for the GPU process) comes only with a
  // picture larger than any before it. The Bead moment on Services is drawn through it too, frame by frame, by the
  // same program (its drops forming and rolling are compiled in and stay still for a still), so the moment needs no
  // program or context of its own, nothing to compile, wait for or let go. opts: studio; for the sequence live,
  // intro (the light, 0..1), form (the drops forming, 0..1), sweep with sweepRange (where the bar is), roll (0..1,
  // a fifth of the largest drops rolling down 1.1 cells).
  let artGL = null;
  function art(scene, w, h, time, opts) {
    opts = opts || {};
    const names = { gloss: 0, beads: 1, leather: 2, split: 3, film: 4 };
    if (artGL && artGL.gl.isContextLost()) artGL = null;
    if (!artGL) {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
      if (!gl) return null;
      artGL = { canvas, gl, P: program(gl, '#define FORM\n#define ROLL\n' + COMMON + PAINT + LEATHER + ART_MAIN) };
    }
    const { canvas, gl, P } = artGL;
    const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
    if (canvas.width < W || canvas.height < H) { canvas.width = Math.max(canvas.width, W); canvas.height = Math.max(canvas.height, H); }
    gl.viewport(0, 0, W, H);
    gl.uniform2f(P.uRes, W, H);
    gl.uniform1f(P.uTime, time);
    gl.uniform1f(P.uIntro, opts.intro != null ? clamp01(opts.intro) : 1);
    gl.uniform1f(P.uScene, names[scene] || 0);
    gl.uniform1f(P.uStudio, (opts.studio != null ? !!opts.studio : isLight()) ? 1 : 0);
    gl.uniform1f(P.uSweep, opts.sweep != null ? clamp01(opts.sweep) : 0.5);
    gl.uniform1f(P.uSweepK, opts.sweepRange || 0.5);
    if (opts.live) gl.uniform4f(P.uFlow, 1.1, 0.2, 0, clamp01(opts.roll));
    else gl.uniform4f(P.uFlow, 0, 0, 0, 0);
    gl.uniform1f(P.uForm, opts.live && opts.form != null ? clamp01(opts.form) : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas;
  }
  const artRoom = () => (artGL && !artGL.gl.isContextLost() ? [artGL.canvas.width, artGL.canvas.height] : null);
  // The stills' light bar in a w x h picture of a scene at a time, for a page that follows it (the closing band's
  // letters take the light where the bar is): the bar is at rest + (sweep - 0.5) * sweepRange on its way (the shader's
  // lightPos); level(x, y) is where on its way it is when its centre line passes through the point (x, y), and
  // line(L, y) where (0..1 across) that line crosses the row y (0..1 down the frame) when the bar is at L. The same
  // numbers as the shader (its orange peel aside, a pixel or two), as the live hero's lineX.
  function artBar(scene, w, h, time) {
    const k = SPAN * ({ gloss: 1.12, split: 1.05 }[scene] || 1), asp = Math.max(2, w) / Math.max(2, h);
    const qx = (x) => (x - 0.5) * asp * k + time * PAN[0], qy = (y) => (0.5 - y) * k + time * PAN[1];
    return {
      rest: drift(time),
      level(x, y) { const a = qx(x), b = qy(y); return a * LD[0] + b * LD[1] + curve(a, b); },
      line(L, y) {
        const b = qy(y);
        let a = 0;
        for (let i = 0; i < 3; i++) a = (L - b * LD[1] - curve(a, b)) / LD[0];
        return (a - time * PAN[0]) / (asp * k) + 0.5;
      },
    };
  }

  window.AlchemistHero = { start, art, artRoom, artBar };
})();

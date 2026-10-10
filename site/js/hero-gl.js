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

   The light is the same everywhere on the site: a warm bar (#fff3cf core,
   #e2b952 body, a wide amber halo) reflected along the 118deg axis, gliding
   across the paint and back without ever leaving the frame, with a faint
   cooler panel beside it. The "studio" preset turns the black paint into
   cream paint under a white softbox for light mode.

   Real photos or video of the owner's work can replace these later.
   Usage:
     AlchemistHero.start(canvas, { scene: 'beads' | 'gloss', still?: true, studio?: bool })
       -> { stop, pause, resume, setStudio(on), setSweep(0..1) } or null without WebGL
       studio follows html[data-theme] when the option is left out.
     AlchemistHero.art(scene, width, height, time, { studio? }) -> a canvas to copy from */
(function () {
  'use strict';

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
uniform float uSweep;      // 0..1 nudges the light bar by up to a quarter of the screen (0.5 = at rest)
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
// The brand's gold (#e2b952, #f8dd98), the light's warm core (#fff3cf) and its deep amber falloff.
const vec3 GOLD = vec3(0.886, 0.725, 0.322);
const vec3 GOLD_HI = vec3(0.973, 0.867, 0.596);
const vec3 CORE = vec3(1.0, 0.953, 0.81);
const vec3 AMBER = vec3(0.60, 0.40, 0.10);
const vec3 COOL = vec3(0.80, 0.82, 0.86);
// One light for the whole site: a studio light bar reflected across the 118deg axis. It glides
// across the paint and back (a pass takes about 10 s), slowing at the turns, and never leaves
// the visible paint or jumps: the frame spans about +-1.3 on this axis at 1440 wide and +-0.8
// on a phone, the bar stays within -0.45..0.65.
const vec2 LD = vec2(0.82, -0.57);
float lightPos(float t){ return 0.1 + 0.5*sin(t*0.3) + 0.05*sin(t*0.11) + (uSweep - 0.5)*0.5; }
// Signed distance to the bar's centre line. The paint is not a mirror: orange peel
// (fine normals) and the panel's curvature bend the reflection a little.
float curvature(vec2 q){ return 0.05*sin(q.y*1.8 + 0.4) + 0.02*sin(q.x*3.1); }
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
  // a tall frame (a phone) sees a narrow slice of the paint: the bar spreads a little so it still reads
  float portrait = 1.0 - min(uRes.x/uRes.y, 1.0);
  vec3 base = mix(vec3(0.003, 0.003, 0.004), vec3(0.94, 0.93, 0.91), uStudio);
  // the studio preset: a wide white softbox panel beside the warm bar
  base = mix(base, vec3(0.985, 0.98, 0.97), smoothstep(0.30, 0.22, abs(ds))*0.95*uStudio);
  float k = mix(80.0, 420.0, sharp)*mix(1.0, 0.6, portrait);
  float core = exp(-d*d*k)*sqrt(k/420.0);
  float body = exp(-d*d*mix(60.0, 30.0, portrait));
  // the halo: a wide, dim amber spill that keeps the whole panel warm, so the drops have light to bend
  float halo = exp(-d*d*1.8);
  vec3 bar = (CORE*core*2.4 + GOLD*body*1.2 + AMBER*halo*0.26)*mix(1.0, 0.35, uStudio);
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
float beads(vec2 g, float density, float rmin, float rmax, float sag, float runs, out vec2 o, out float rr, out float tt){
  vec2 id = floor(g);
  float best = 9.0;
  o = vec2(0.0); rr = 0.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 cid = id + vec2(float(i), float(j));
      if (hash21(cid*0.731 + 4.1) > density) continue;
      vec2 c = cid + 0.2 + hash22(cid*1.37 + 3.1)*0.6;
      float r = mix(rmin, rmax, pow(hash21(cid + 7.7), 2.2));
      vec2 dv = g - c;
      dv.x *= 1.0 + (hash21(cid + 5.5) - 0.5)*0.24;
      if (dv.y < 0.0) dv.y /= 1.0 + sag;          // the lower half bulges with gravity
      float tn = length(dv)/r;
      if (tn < best){ best = tn; rr = r; o = dv/r; }
      if (runs > 0.0 && hash21(cid + 9.3) < 0.06){
        // a run: a thinner capsule from the centre down, with a rounded head
        float len = r*mix(0.6, 1.4, hash21(cid + 1.9));
        vec2 dr = vec2(dv.x, dv.y - clamp(dv.y, -len, 0.0));
        float r2 = r*0.35;
        float tn2 = length(dr)/r2;
        if (tn2 < best){ best = tn2; rr = r2; o = dr/r2; }
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
vec3 paint(vec2 uv, float asp, float t, float density, float zoom){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*1.35*zoom + vec2(t*0.006, t*0.0025);
  // shallow depth of field: sharp across the middle band, soft above and below
  float blur = smoothstep(0.10, 0.48, abs(uv.y - 0.46 - 0.04*sin(t*0.05)));
  float d0 = lightD(q, t);
  vec3 col = envAt(d0, 1.0 - blur*0.85);
  float body = exp(-d0*d0*60.0);
  // metallic flake: tiny sparkles, only where the bar lights the paint
  float fl = step(0.9955, hash21(floor(q*640.0)));
  col += GOLD_HI*fl*body*(1.0 - blur)*uIntro*(1.0 - uStudio*0.7);
  float sag = 0.18*(1.0 - blur);
  vec2 LP = vec2(-LD.y, LD.x);     // along the bar
  for (int k = K0; k < 5; k++){
    float sc, dens, rmin, rmax;
    if (k == 0){ sc = 70.0; dens = 0.35; rmin = 0.03; rmax = 0.05; }        // mist between the beads
    else if (k == 1){ sc = 34.0; dens = 0.30; rmin = 0.06; rmax = 0.12; }
    else if (k == 2){ sc = 19.0; dens = 0.55; rmin = 0.11; rmax = 0.28; }
    else if (k == 3){ sc = 9.0; dens = 0.58; rmin = 0.15; rmax = 0.36; }
    else { sc = 4.6; dens = 0.55; rmin = 0.18; rmax = mix(0.30, 0.22, uStudio); }   // the largest drops stay under ~90px (65px on cream)
    // the two finest layers melt into the blur above and below the focus band
    float keep = k <= 1 ? 1.0 - smoothstep(0.45, 0.65, blur) : 1.0;
    if (keep <= 0.0) continue;
    vec2 o; float rr; float tn;
    // on cream paint every drop shows, so the studio carries fewer of them and the wordmark keeps its room
    float b = beads(q*sc + float(k)*17.3, dens*density*(1.0 - 0.4*uStudio), rmin, rmax, k == 0 ? 0.0 : sag, k >= 3 ? RUNS : 0.0, o, rr, tn);
    if (b < 0.5) continue;
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
      col = mix(col, c0, a);
      continue;
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
    col = mix(ground, c, a);
  }
  return col;
}
// A sheet of water lying flat on bare paint (the Bead Test's "before" side): soft
// ripples, the bar smeared along the film, puddle edges that catch the light.
vec3 film(vec2 uv, float asp, float t){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*1.35 + vec2(t*0.006, t*0.0025);
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
      vec3 th = vec3(0.92, 0.74, 0.36)*sh*(0.45 + key*0.75);
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

  const HERO_MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec3 c = paint(uv, uRes.x/uRes.y, uTime, uDensity, uZoom);
  gl_FragColor = vec4(finish(c, uv), 1.0);
}`;

  const ART_MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float asp = uRes.x/uRes.y;
  vec3 c;
  if (uScene < 0.5) c = paint(uv, asp, uTime, 0.32, 1.12);
  else if (uScene < 1.5) c = paint(uv, asp, uTime, 1.0, 1.0);
  else if (uScene < 2.5) c = leather(uv, asp, uTime);
  else if (uScene < 3.5) {
    // paint above a diagonal, leather below, a thin gold trim between
    vec2 q = (uv - 0.5)*vec2(asp, 1.0);
    float m = q.y + q.x*0.42 - 0.04;
    vec3 a = paint(uv, asp, uTime, 0.55, 1.05);
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
    return { prog, uRes: u('uRes'), uTime: u('uTime'), uIntro: u('uIntro'), uDensity: u('uDensity'), uZoom: u('uZoom'), uScene: u('uScene'), uStudio: u('uStudio'), uSweep: u('uSweep') };
  }

  const root = document.documentElement;
  const isLight = () => root.dataset.theme === 'light';
  const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));

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
    let P = null, raf = 0, last = 0, visible = true, lost = false, running = false, vw = 0, vh = 0;
    const t0 = performance.now();
    const timeOffset = opts.time != null ? opts.time : 4 + Math.random() * 30;

    // portrait screens see less of the surface, so zoom out a little there; the cream studio a little
    // more, so its drops stay small on the paint
    function applyZoom() {
      const portrait = canvas.clientHeight > canvas.clientWidth;
      gl.uniform1f(P.uZoom, preset.zoom * (portrait ? 1.25 : 1) * (studio ? 1.2 : 1));
    }
    function setup() {
      P = program(gl, (small ? '#define LITE\n' : '') + COMMON + PAINT + HERO_MAIN);
      gl.uniform1f(P.uDensity, preset.density);
      applyZoom();
      gl.uniform1f(P.uStudio, studio ? 1 : 0);
      gl.uniform1f(P.uSweep, sweep);
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
      const secs = (now - t0) / 1000;
      gl.uniform2f(P.uRes, canvas.width, canvas.height);
      gl.uniform1f(P.uTime, timeOffset + (opts.still ? 0 : secs));
      gl.uniform1f(P.uIntro, opts.still ? 1 : Math.min(1, Math.max(0, (secs - 0.3) / 1.6)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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
      if (running || lost || opts.still) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function halt() {
      running = false;
      cancelAnimationFrame(raf);
    }
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
      if (lost) return;
      gl.uniform1f(P.uSweep, sweep);
      if (opts.still) drawNow();
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
      if (opts.still) drawNow(); else run();
    });
    setup();

    // the studio preset follows the site's theme unless the caller chose
    let themeWatch = null;
    if (opts.studio == null && window.MutationObserver) {
      themeWatch = new MutationObserver(() => setStudio(isLight()));
      themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }
    const onResize = opts.still ? drawNow : resize;
    window.addEventListener('resize', onResize);
    let io = null;
    if (opts.still) drawNow();
    else {
      io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 });
      io.observe(canvas);
      run();
    }
    return {
      stop() { halt(); if (io) io.disconnect(); if (themeWatch) themeWatch.disconnect(); window.removeEventListener('resize', onResize); },
      pause: halt,
      resume: run,
      setStudio,
      setSweep,
    };
  }

  // One shared offscreen context for every still picture.
  let artGL = null;
  function art(scene, w, h, time, opts) {
    opts = opts || {};
    const names = { gloss: 0, beads: 1, leather: 2, split: 3, film: 4 };
    if (artGL && artGL.gl.isContextLost()) artGL = null;
    if (!artGL) {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
      if (!gl) return null;
      artGL = { canvas, gl, P: program(gl, COMMON + PAINT + LEATHER + ART_MAIN) };
    }
    const { canvas, gl, P } = artGL;
    canvas.width = Math.max(2, Math.round(w));
    canvas.height = Math.max(2, Math.round(h));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(P.uRes, canvas.width, canvas.height);
    gl.uniform1f(P.uTime, time);
    gl.uniform1f(P.uIntro, 1);
    gl.uniform1f(P.uScene, names[scene] || 0);
    gl.uniform1f(P.uStudio, (opts.studio != null ? !!opts.studio : isLight()) ? 1 : 0);
    gl.uniform1f(P.uSweep, 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas;
  }

  window.AlchemistHero = { start, art };
})();

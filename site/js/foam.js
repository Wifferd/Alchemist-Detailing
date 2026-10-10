/* Alchemist Detailing — the wash.
   Scrolling drives the wash: the foam cannon walks in from the left and sprays
   a steady stream across the screen, left to right, until the screen is
   covered; then a sheet of rinse water sweeps across and the services appear.
   Once the wash has finished it stays finished: the section lets go of the
   page (no more pinning), the loop stops, and scrolling back up never rewinds it.

   Rendering, in two WebGL passes:
     1. Every foam blob is drawn as a soft disc into a small field texture
        (red = coverage, green = thickness, blue = foam in flight), summed with
        additive blending.
     2. One full-screen pass turns that field into foam: big soft lumps from the
        field's thickness, domed bubbles of two sizes shaded from grey creases
        to warm off-white tops with small highlights on some, fine froth where it is
        thin, occlusion in the creases, cool see-through edges, a wet skirt and
        a contact shadow on the paint; then the mist and jet from the nozzle,
        the rinse (one bright crest line on the rinsed side, a dark wet film
        with long sheens, runoff, the foam bending at the front) and the small
        drops it leaves, each lit from the bar's side with a gold caustic.
        The bubbles are two Voronoi lattices: fine ones in the thick body (soft
        folds and pin-point sparkle carry the shading there) and medium ones that
        show where the foam thins and drains, as real foam does at its edges.
   The light is the site's: the gold bar along the 118deg axis (the same one
   the hero reflects), and the foam is lit from the bar's side.
   Phones (< 600px) compile a lighter shader (#define LITE: no fine froth,
   contact shadow or sparkle); the resolution still adapts to slow frames.
   Usage: AlchemistWash.start({ section, stage, canvas, cannon, tip, back, reveal: [elements] }) */
(function () {
  'use strict';

  // Timeline, as progress through the pinned section (0..1).
  const T = {
    cannonIn: [0.0, 0.12],     // the cannon walks in from the left, its body seen arriving, before it fires
    spray: [0.12, 0.56],       // the nozzle sweeps left to right; foam lands along the stream
    cannonOut: [0.56, 0.66],
    titleOut: [0.14, 0.4],
    sag: [0.45, 0.82],         // the foam slides down a little
    rinse: [0.62, 0.9],        // the water sheet sweeps across
    drops: [0.86, 0.985],      // droplets left on the glass fade away
  };
  const CANNON_ROT = -58;      // degrees: nozzle points up and to the right
  const BAND = 0.34;           // the stream leans right as it rises: landing x = nozzle x + BAND * height above the nozzle
  const NOZ_Y = 0.9;           // nozzle height used for the landing map (screen units, y down)
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn2 = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const backOut = (t) => { const c1 = 1.35, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The rinse sweeps left to right, leaning down a little (screen space, y down).
  // It ends just past the far corner, so the sheet clears the screen on every aspect.
  const D = (() => { const x = 1, y = 0.36, l = Math.hypot(x, y); return [x / l, y / l]; })();
  function front(p, asp) {
    const k = clamp((p - T.rinse[0]) / (T.rinse[1] - T.rinse[0]), 0, 1);
    const sMin = -0.3, sMax = asp * D[0] + D[1] + 0.12;
    return { k, s: lerp(sMin, sMax, easeInOut(k)) };
  }

  // Where and when every blob of foam lands. Coordinates: x in [0, aspect],
  // y in [0, 1] from the top. A blob lands when the stream reaches it, so the
  // left lands first and the right last, in a band that leans with the spray.
  // The sweep starts with the nozzle inside the frame (about 55px in on a desktop, at the
  // edge on a portrait phone), so the cannon is seen before the first foam lands; the
  // landing band still reaches the left edge, since the stream leans right as it rises.
  function sweepRange(asp) { return [asp < 0.75 ? 0.0 : 0.06, asp + 0.06]; }
  function layout(asp, seed) {
    const R = mulberry32(seed);
    const out = [];
    const g = 0.125;
    const x0 = -0.1, y0 = -0.1, w = asp + 0.2, h = 1.2;
    const nx = Math.max(3, Math.round(w / g)), ny = Math.round(h / g);
    const gx = w / nx, gy = h / ny;
    const [xs, xe] = sweepRange(asp);
    const span = T.spray[1] - T.spray[0] - 0.03;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5 + (R() - 0.5) * 0.85) * gx;
        const y = y0 + (j + 0.5 + (R() - 0.5) * 0.85) * gy;
        const r = g * (1.0 + R() * 0.5);
        const need = x - BAND * (NOZ_Y - y);               // nozzle x at which the stream reaches this spot
        const u = clamp((need - xs) / (xe - xs) + (R() - 0.5) * 0.06, 0, 1);
        const a = T.spray[0] + 0.006 + span * easeInOutSine(u);
        out.push({ x, y, r, a, w: R(), k: 0, n: 0, L: 0 });
      }
    }
    const big = out.length;
    for (let b = 0; b < big; b++) {
      const B = out[b];
      // spatter that lands just ahead of each mass
      const n = 2 + Math.floor(R() * 3);
      for (let s = 0; s < n; s++) {
        const ang = R() * Math.PI * 2, dist = B.r * (0.75 + R() * 0.8);
        out.push({ x: B.x + Math.cos(ang) * dist, y: B.y + Math.sin(ang) * dist, r: B.r * (0.16 + R() * 0.22), a: B.a - 0.004 - R() * 0.016, w: R(), k: 1, n: 0, L: 0 });
      }
      // satellite clusters: small blobs that settle beside a third of the masses
      if (R() < 0.3) {
        const m = 2 + Math.floor(R() * 2);
        for (let s = 0; s < m; s++) {
          const ang = R() * Math.PI * 2, dist = B.r * (1.1 + R() * 0.5);
          out.push({ x: B.x + Math.cos(ang) * dist, y: B.y + Math.sin(ang) * dist, r: B.r * (0.12 + R() * 0.08), a: B.a + 0.004 + R() * 0.012, w: R(), k: 1, n: 0, L: 0 });
        }
      }
    }
    // drips that grow under some of the masses: four beads in a line, the last one the rounded head
    const drips = Math.round(big * 0.3);
    for (let d = 0; d < drips; d++) {
      const B = out[Math.floor(R() * big)];
      const L = 0.07 + R() * 0.15;
      const ox = (R() - 0.5) * B.r * 0.6;
      for (let n = 1; n <= 4; n++) out.push({ x: B.x + ox, y: B.y + B.r * 0.42, r: B.r * (0.27 - n * 0.035) * (n === 4 ? 1.3 : 1), a: B.a + 0.01, w: B.w, k: 2, n, L });
    }
    return out;
  }

  // ------------------------------------------------------------------ shaders
  const VS_FIELD = `
attribute vec2 aCorner;
attribute vec4 aBlob;      // x, y, radius, strength
uniform float uAsp;
varying vec2 vL;
varying float vS;
void main(){
  vec2 pos = aBlob.xy + aCorner*aBlob.z;
  vL = aCorner; vS = aBlob.w;
  gl_Position = vec4(pos.x/uAsp*2.0 - 1.0, 1.0 - pos.y*2.0, 0.0, 1.0);
}`;
  const FS_FIELD = `
precision mediump float;
varying vec2 vL;
varying float vS;
void main(){
  float d2 = dot(vL, vL);
  if (d2 >= 1.0) discard;
  float f = 1.0 - d2; f = f*f*f;
  if (vS < 0.0) gl_FragColor = vec4(0.0, 0.0, f*0.95, 0.0);   // foam in flight
  else gl_FragColor = vec4(f*vS*0.9, f*0.15, 0.0, 0.0);
}`;
  const VS_FULL = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FS_SHADE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uField;
uniform vec2 uRes;
uniform vec2 uFieldPx;
uniform float uAsp;
uniform float uTime;
uniform float uFront;
uniform float uRinse;
uniform float uDrops;
uniform float uGold;
uniform float uTheme;      // 1 = light mode: the foam casts grey shadows on the ivory stage
uniform vec2 uD;
uniform vec3 uSpray;
uniform vec2 uSprayDir;

const vec3 GOLD = vec3(0.886, 0.725, 0.322);
const vec2 LD = vec2(0.82, 0.57);    // the site's light axis (118deg) in screen space, y down
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p){ return noise(p)*0.55 + noise(p*2.07 + 3.1)*0.3 + noise(p*4.3 + 7.7)*0.15; }
// nearest and second-nearest cell distances; id and offset (pixel -> centre) of the nearest
vec2 vor(vec2 p, out vec2 id, out vec2 off){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  id = vec2(0.0); off = vec2(0.0);
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + h22(i + g)*0.85 + 0.075 - f;
      float d = dot(r, r);
      if (d < d1){ d2 = d1; d1 = d; id = i + g; off = r; }
      else if (d < d2){ d2 = d; }
    }
  }
  return vec2(sqrt(d1), sqrt(d2));
}
vec4 over(vec4 top, vec4 under){ return top + under*(1.0 - top.a); }

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 q = vec2(uv.x*uAsp, 1.0 - uv.y);       // screen space, y down, height 1
  float t = uTime;
  vec4 acc = vec4(0.0);

  // the rinse front: dd < 0 has been rinsed; the water sheet lies just behind it
  vec2 Dp = vec2(-uD.y, uD.x);
  float s = dot(q, uD);
  float across = dot(q, Dp);
  float rag = (noise(vec2(across*3.0, t*0.25)) - 0.5)*0.12 + (noise(vec2(across*14.0, t*0.6)) - 0.5)*0.03;
  float dd = s - uFront + rag*uRinse;
  float behind = -dd;
  float sheet = uRinse > 0.0 ? smoothstep(-0.005, 0.03, behind)*(1.0 - smoothstep(0.1, 0.55, behind))*uDrops : 0.0;
  // the water bends what lies under it: the field is read through a wobble, so the
  // swept foam wavers under the sheet (the page beneath the canvas is DOM: it cannot bend)
  vec2 fuv = uv;
  if (sheet > 0.001){
    vec2 w = vec2(noise(vec2(across*20.0, s*4.0 - t*3.0)), noise(vec2(across*20.0 + 9.0, s*4.0 - t*3.0))) - 0.5;
    fuv += w*0.012*sheet;
  }
  // the crest bends what lies just ahead of it: the field is read through the sheet's slope there
  if (uRinse > 0.0){
    float bend = dd*exp(-dd*dd*800.0)*0.5*uDrops;
    fuv += vec2(uD.x/uAsp, -uD.y)*bend;
  }
  vec4 F = texture2D(uField, fuv);

  // the light: the site's gold bar passing across; everything is lit from the bar's side
  float db = dot(q, LD) - uGold;
  float gl = exp(-db*db*10.0);
  vec3 L = normalize(vec3(-LD*clamp(db/0.25, -1.0, 1.0)*0.6, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));

  // ---------------------------------------------------------------- foam
  if (F.r > 0.08){
    // snow foam: a creamy mass of fine bubbles shaped by soft folds; where it thins and drains the bubbles
    // grow and their walls show, as real foam does at its edges. Two lattices: medium bubbles (seen where the
    // foam is thin, and in the scalloped outline) and fine ones (the body), the fine one turned 37deg
    float wT = smoothstep(0.04, 0.22, F.g);                       // 1 where the foam is thick
    vec2 idL, offL;
    vec2 vmL = vor(q*34.0 + vec2(0.0, -t*0.015), idL, offL);
    vec2 idS, offS;
    const mat2 ROT = mat2(0.7986, 0.6018, -0.6018, 0.7986);
#ifndef LITE
    vec2 vmS = vor(ROT*q*96.0 + vec2(3.0, -t*0.012), idS, offS);
#else
    vec2 vmS = vor(ROT*q*70.0 + vec2(3.0, -t*0.012), idS, offS);
#endif
    float e = fbm3(q*4.5 + vec2(t*0.01, 0.0));
    float bub = 1.0 - smoothstep(0.0, 0.8, vmL.x);
    float field = F.r + (e - 0.5)*0.26 + (bub - 0.5)*0.16;
    float rinsed = uRinse > 0.0 ? smoothstep(-0.01, 0.02, dd) : 1.0;
    float cov = smoothstep(0.36, 0.48, field)*rinsed;
    float skirt = smoothstep(0.22, 0.38, field)*(1.0 - cov)*rinsed;   // the wet, see-through hem of each mass
    if (cov > 0.002 || skirt > 0.002){
      float th = clamp(F.g*4.2 + (field - 0.45)*1.2, 0.0, 1.0);
      if (uRinse > 0.0){
        th *= smoothstep(0.0, 0.05, dd);
        th += 0.35*smoothstep(0.08, 0.0, dd)*step(0.0, dd);        // the ridge the water pushes ahead of it
        th = min(th, 1.0);
      }
      // big lumps: the slope of the field's thickness (normals here are in screen space, y down)
      float gR = texture2D(uField, fuv + vec2(uFieldPx.x, 0.0)).g, gL = texture2D(uField, fuv - vec2(uFieldPx.x, 0.0)).g;
      float gU = texture2D(uField, fuv + vec2(0.0, uFieldPx.y)).g, gD = texture2D(uField, fuv - vec2(0.0, uFieldPx.y)).g;
      vec3 n = normalize(vec3(-(gR - gL)*8.0, (gU - gD)*8.0, 1.0));
      // folds: whipped, soft ridges at a middle scale, from the slope of a two-octave noise
      vec2 lq = q*9.0 + vec2(0.0, -t*0.01);
      float l0 = noise(lq) + 0.5*noise(lq*2.1 + 4.0);
      float lx = noise(lq + vec2(0.06, 0.0)) + 0.5*noise((lq + vec2(0.06, 0.0))*2.1 + 4.0);
      float ly = noise(lq + vec2(0.0, 0.06)) + 0.5*noise((lq + vec2(0.0, 0.06))*2.1 + 4.0);
      n = normalize(n + vec3(-(lx - l0)*3.2, -(ly - l0)*3.2, 0.0));
      // bubbles: a slight dome on each, counting for more where the foam is thin (the fine lattice's offset is
      // turned back into screen space before it shades)
      vec3 ndL = normalize(vec3(-offL*1.6, 1.0));
      vec2 oS = vec2(dot(offS, ROT[0]), dot(offS, ROT[1]));
      vec3 ndS = normalize(vec3(-oS*1.6, 1.0));
      n = normalize(mix(n, mix(ndL, ndS, wT), mix(0.42, 0.16, wT)));
      float lam = pow(clamp(dot(n, L), 0.0, 1.0), 1.25);
      // the creases: where a thicker lump stands between this spot and the light, it sits in its shade
      // (the field is 8-bit, so this reads thickness a few texels away rather than a curvature)
      float gS = texture2D(uField, fuv + vec2(L.x, -L.y)*uFieldPx*2.0).g;
      float ao = (1.0 - 0.26*smoothstep(0.02, 0.3, gS - F.g))*(0.9 + 0.1*smoothstep(0.35, 1.1, l0));
      float wallM = 1.0 - smoothstep(0.0, 0.10, vmL.y - vmL.x);
      float wallF = 1.0 - smoothstep(0.0, 0.14, vmS.y - vmS.x);
      float thin = 1.0 - th;
      // the body never clips: a grey-blue shade in the creases up to a warm off-white on the lit tops, the white
      // kept for the highlights (a shade lower on the ivory stage, so the highlights still read there)
      vec3 shade = mix(vec3(0.76, 0.79, 0.84), vec3(0.64, 0.68, 0.74), uTheme);
      vec3 top = mix(vec3(0.95, 0.94, 0.92), vec3(0.90, 0.89, 0.87), uTheme);
      vec3 col = mix(shade, top, smoothstep(0.05, 0.85, lam));
      col *= ao;
      col *= 0.88 + 0.12*smoothstep(0.2, 0.8, e);                 // big soft lumps
      col += vec3(0.03, 0.02, 0.0)*th;                            // a faint warm cast where it is thick
      // walls: a whisper of grey on the fine bubbles of the body, more on the larger ones where the foam drains,
      // never a drawn net; a faint thin-film sheen on those larger walls
      col *= 1.0 - wallF*0.035*wT;
      col *= 1.0 - wallM*(0.04 + 0.14*thin)*(1.0 - 0.8*wT);
      col += wallM*thin*(1.0 - wT)*(0.5 + 0.5*sin(th*18.0 + h21(idL)*6.28))*vec3(0.03, 0.025, 0.04);
      // sparkle: a few fine bubbles catch the light as pin-points, a few larger thin ones carry a soft window,
      // warm and gold where the bar passes
      float pickS = step(0.8, h21(idS + 9.1)), pickL = step(0.6, h21(idL + 9.1));
      float specM = (pow(max(dot(ndS, H), 0.0), 90.0)*pickS*0.55*wT + pow(max(dot(ndL, H), 0.0), 40.0)*pickL*0.32*(1.0 - wT))*(1.0 - wallM*0.7);
      col += mix(vec3(1.0), GOLD, gl)*specM;
      col = mix(col, col*vec3(1.06, 0.98, 0.86), gl*0.45);
      // thin edges let the paint show through each bubble's face, with a cool tint
      float face = (1.0 - wallM)*(1.0 - wallF*0.5);
      float alpha = cov*mix(1.0 - face*0.55, 1.0, smoothstep(0.08, 0.45, th));
      alpha = max(alpha, cov*specM*0.6);
      col = mix(vec3(0.80, 0.83, 0.87), col, smoothstep(0.0, 0.3, th));
      // the skirt: a translucent grey-blue film in the dark (the rim around every hole), a grey shadow on ivory
      vec4 sk = mix(vec4(vec3(0.72, 0.76, 0.82)*0.5, 0.5), vec4(vec3(0.50, 0.52, 0.56)*0.65, 0.65), uTheme)*skirt;
      acc = over(vec4(col*alpha, alpha), sk);
    }
#ifndef LITE
    // the shadow the foam casts on the paint, read from the field a little to the side
    float shF = texture2D(uField, fuv + vec2(0.009, -0.013)).r;
    float shadow = smoothstep(0.14, 0.5, shF)*(1.0 - cov)*rinsed*mix(0.4, 0.65, uTheme);
    acc = over(acc, vec4(vec3(0.0), shadow));
#endif
    // loose bubbles around the foam's edge: soft domes, lit from the bar's side
    if (F.r < 0.62){
      vec2 idL, offL;
      vor(q*10.0 + 5.3, idL, offL);
      float rad = 0.22 + 0.16*h21(idL + 2.1);
      float rr = length(offL)/rad;
      if (h21(idL*1.7) > 0.76 && rr < 1.0 && (uRinse <= 0.0 || dd > 0.02)){
        vec2 rel = -offL/rad;
        float rim = smoothstep(0.55, 1.0, rr)*(1.0 - smoothstep(0.95, 1.0, rr))*0.5;
        vec3 nl = normalize(vec3(rel*1.4, 1.0));
        float ll = clamp(dot(nl, L), 0.0, 1.0);
        float hl1 = pow(max(dot(nl, H), 0.0), 24.0);
        vec2 a2 = rel - vec2(0.42, 0.40);
        float hl2 = exp(-dot(a2, a2)*50.0);
        float ba = clamp(rim*0.7 + 0.25 + hl1*0.7 + hl2*0.3, 0.0, 1.0)*smoothstep(0.14, 0.3, F.r);
        vec3 bc = clamp(mix(vec3(0.72, 0.76, 0.82), vec3(0.93, 0.92, 0.9), ll)*(0.6 + rim*0.4) + vec3(1.0)*hl1*0.8 + GOLD*hl2*gl, 0.0, 1.0);
        acc = over(vec4(bc*ba, ba), acc);
      }
    }
  }

  // ---------------------------------------------------------------- foam in flight: shaded globs, not flat discs
  if (F.b > 0.2){
    float fa = smoothstep(0.3, 0.6, F.b)*0.8;
    float bR = texture2D(uField, uv + vec2(uFieldPx.x, 0.0)).b, bL = texture2D(uField, uv - vec2(uFieldPx.x, 0.0)).b;
    float bU = texture2D(uField, uv + vec2(0.0, uFieldPx.y)).b, bD = texture2D(uField, uv - vec2(0.0, uFieldPx.y)).b;
    vec3 nf = normalize(vec3(-(bR - bL)*6.0, (bU - bD)*6.0, 1.0));
    float lf = clamp(dot(nf, L), 0.0, 1.0);
    vec3 fc = mix(vec3(0.72, 0.75, 0.80), vec3(0.95, 0.94, 0.92), smoothstep(0.2, 0.9, lf));
    fc += pow(max(dot(nf, H), 0.0), 24.0)*0.35;
    acc = over(vec4(fc*fa*0.95, fa*0.95), acc);
  }

  // ---------------------------------------------------------------- rinse water
  if (uRinse > 0.0){
    // the sheet: a dark film that reads as wet, long sheens stretched along the sweep, runoff behind the front
    float film = sheet*0.22;
    acc = over(vec4(vec3(0.03, 0.04, 0.06)*film, film), acc);
    float sheen = pow(noise(vec2(across*9.0, s*0.2 - t*1.6)), 3.0)*0.5*sheet;
    acc = over(vec4(vec3(0.9, 0.93, 0.97)*sheen, sheen), acc);
    float runMask = smoothstep(0.06, 0.25, behind)*(1.0 - smoothstep(0.45, 0.85, behind))*uDrops;
    if (runMask > 0.001){
      float line = smoothstep(0.80, 0.86, noise(vec2(across*40.0, s*2.5)));
      float lineL = smoothstep(0.80, 0.86, noise(vec2((across - 1.5/uRes.y)*40.0, s*2.5)));
      float edge = max(line - lineL, 0.0)*0.2*runMask;        // a darker edge on the lines' left
      acc = over(vec4(vec3(0.0), edge), acc);
      float ra = line*0.12*runMask;
      acc = over(vec4(vec3(0.88, 0.91, 0.95)*ra, ra), acc);
      // a few short bright runoff streaks just behind the crest
      float streak = pow(noise(vec2(across*30.0, s*2.0 - t)), 6.0)*0.4*runMask*smoothstep(0.3, 0.1, behind);
      acc = over(vec4(mix(vec3(0.95), GOLD, gl*0.4)*streak, streak), acc);
    }
    // the crest: one bright line on the rinsed side (on the dark paint, where it shows), soft with a sharp
    // core, warm where the bar crosses it, sparkling; the refraction's dark line just ahead, on the foam
    float dc2 = dd + 0.018;
    float crest = (exp(-dc2*dc2*2500.0)*0.35 + exp(-dc2*dc2*20000.0)*0.5)*uDrops;
    vec3 cc = mix(vec3(0.93, 0.95, 0.98), vec3(1.0, 0.90, 0.64), 0.35 + gl*0.5);
    float sh = exp(-pow(dd - 0.012, 2.0)*9000.0)*0.45*uDrops;
    acc = over(vec4(vec3(0.0), sh), acc);
    float cs = exp(-pow(dd + 0.01, 2.0)*4000.0)*0.15*uTheme*uDrops;   // on ivory, a cool shadow under the crest
    acc = over(vec4(vec3(0.30, 0.33, 0.40)*cs, cs), acc);
#ifndef LITE
    float spark = step(0.985, h21(floor(vec2(across*160.0, s*160.0)) + floor(t*8.0)))*crest;
#else
    float spark = 0.0;
#endif
    float ca = clamp(crest*0.85 + spark, 0.0, 1.0);
    acc = over(vec4(cc*ca, ca), acc);
  }

  // ---------------------------------------------------------------- droplets left on the glass
  if (uDrops > 0.002 && dd < -0.04){
    vec2 qd = q + vec2(0.0, -t*0.012);        // they creep down the glass
    vec2 idD, offD;
    vor(qd*14.0 + 1.3, idD, offD);
    float rad = uAsp < 0.8 ? 0.10 + 0.17*h21(idD + 8.0) : 0.09 + 0.14*h21(idD + 8.0);
    offD.y *= 0.85;                             // flattened against the glass
    float rr = length(offD)/rad;
    float fade = uDrops*smoothstep(-0.04, -0.15, dd);
    if (h21(idD*3.1) > mix(0.82, 0.93, q.y) && rr < 1.0){   // fewer low down, where the cards sit
      // each drop a flattened dome: a bright rim and the bar's image on the bar's side, a dark crescent
      // opposite, a white glint, a warm caustic where the drop focuses the bar onto the paint
      vec2 rel = -offD/rad;
      vec2 toL = normalize(-LD*clamp(db/0.25, -1.0, 1.0) + vec2(0.0, -1e-3));
      float edge = 1.0 - smoothstep(0.92, 1.0, rr);
      float ring = smoothstep(0.55, 0.95, rr)*edge;
      float lside = clamp(dot(normalize(rel + vec2(1e-4, 0.0)), toL)*0.5 + 0.5, 0.0, 1.0);
      float dark = ring*(1.0 - lside)*0.5;
      float bright = ring*lside*0.6*(0.5 + 0.5*gl);
      vec2 ip = rel - toL*0.35;
      float img = exp(-dot(ip, ip)*9.0)*(1.0 - ring)*(0.35 + 0.65*gl);
      vec2 cp = rel + toL*0.55;
      float caus = exp(-dot(cp, cp)*14.0)*(1.0 - ring)*(0.15 + 0.35*gl);
      vec2 hp = rel - toL*0.42;
      float hl = exp(-dot(hp, hp)*60.0)*0.8;
      acc = over(vec4(vec3(0.0), dark*fade), acc);
      acc = over(vec4(GOLD*caus*fade, caus*fade), acc);
      vec3 ic = mix(vec3(0.95, 0.90, 0.78), vec3(1.0, 0.93, 0.70), gl);
      float ia = clamp(img*0.45 + bright, 0.0, 1.0)*fade;
      acc = over(vec4(ic*ia, ia), acc);
      acc = over(vec4(vec3(hl*fade), hl*fade), acc);
    }
    // residue: a few single-pixel specks that dry away
    vec2 sc = fract(qd*110.0) - 0.5;
    float speck = step(0.994, h21(floor(qd*110.0)))*(1.0 - smoothstep(0.05, 0.12, length(sc)))*uDrops*uDrops*0.3*fade;
    acc = over(vec4(vec3(0.9)*speck, speck), acc);
  }

  // ---------------------------------------------------------------- mist and jet from the nozzle
  if (uSpray.z > 0.01){
    vec2 v = q - uSpray.xy;
    float along = dot(v, uSprayDir);
    if (along > 0.0){
      // a short turbulent cone that widens and billows as it leaves the nozzle: the turbulence is noise in the
      // cone's own coordinates, blown outward along the jet (noise over the angle would draw straight rays)
      float perp = dot(v, vec2(-uSprayDir.y, uSprayDir.x));
      float ang = atan(perp, along);
      float cone = 1.0 - smoothstep(0.22 + along*0.3, 0.6 + along*0.3, abs(ang));
      float fall = smoothstep(0.0, 0.04, along)*exp(-along*2.6);
      vec2 cl = vec2(along, perp)*14.0;
      float str = noise(cl*vec2(1.0, 1.6) + vec2(-t*9.0, 0.0))*0.6 + noise(cl*2.3 + vec2(-t*14.0, 3.0))*0.4;
      float m = clamp(cone*fall*(0.3 + 1.0*str)*uSpray.z*0.7, 0.0, 0.55);
      // a bright, narrow jet right at the nozzle
      float jet = exp(-perp*perp*900.0)*smoothstep(0.0, 0.02, along)*exp(-along*6.0)*0.9*uSpray.z;
      m = clamp(m + jet, 0.0, 0.9);
      acc = over(vec4(vec3(0.97, 0.965, 0.95)*m, m), acc);
    }
  }
  gl_FragColor = acc;
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
    return s;
  }
  function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link error');
    return p;
  }

  function start(o) {
    const { section, stage, canvas, cannon, tip, back } = o;
    const reveal = o.reveal || [];
    const root = document.documentElement;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;

    // programs (phones get the lighter shader)
    const lite = window.innerWidth < 600;
    const pField = link(gl, VS_FIELD, FS_FIELD);
    const pShade = link(gl, VS_FULL, (lite ? '#define LITE\n' : '') + FS_SHADE);
    // From here the wash owns the stage: until its first frame the title stands alone and the services wait
    // under it (the stylesheet hides them before the wash too; this holds even where that rule is overridden).
    // settle() restores them, and a lost context adds html.no-webgl, whose !important rule shows them again.
    for (const el of reveal) el.style.setProperty('--r', '0');
    stage.style.setProperty('--title-out', '0');
    const aCorner = gl.getAttribLocation(pField, 'aCorner');
    const aBlob = gl.getAttribLocation(pField, 'aBlob');
    const aPos = gl.getAttribLocation(pShade, 'aPos');
    const uF = {}; ['uAsp'].forEach((n) => { uF[n] = gl.getUniformLocation(pField, n); });
    const uS = {};
    ['uField', 'uRes', 'uFieldPx', 'uAsp', 'uTime', 'uFront', 'uRinse', 'uDrops', 'uGold', 'uTheme', 'uD', 'uSpray', 'uSprayDir']
      .forEach((n) => { uS[n] = gl.getUniformLocation(pShade, n); });
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const blobBuf = gl.createBuffer();
    let verts = new Float32Array(6 * 6 * 1800);

    // field texture and framebuffer
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let fw = 0, fh = 0;

    const small = Math.min(innerWidth, innerHeight) < 700;
    let scale = small ? 0.5 : 0.7;   // the foam is soft: a phone draws it at half size (and adapts lower on slow frames)
    let W = 0, H = 0, asp = 1, blobs = [], seed = 0x5eed + Math.floor(Math.random() * 1e6);
    let revealBoxes = [];

    function measure() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return false;
      const w = Math.max(2, Math.round(cw * dpr * scale)), h = Math.max(2, Math.round(ch * dpr * scale));
      if (w !== W || h !== H) {
        W = w; H = h; canvas.width = W; canvas.height = H;
        fw = Math.max(16, Math.round(W / 3)); fh = Math.max(16, Math.round(H / 3));
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      const nasp = cw / ch;
      if (Math.abs(nasp - asp) > 0.001 || !blobs.length) { asp = nasp; blobs = layout(asp, seed); }
      // where the revealed elements sit, in the same screen space as the foam
      const sr = stage.getBoundingClientRect();
      revealBoxes = reveal.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: (r.left + r.width / 2 - sr.left) / ch, y: (r.top + r.height * 0.35 - sr.top) / ch, last: null };
      });
      return true;
    }

    // ---------------------------------------------------------------- live spray stream
    // Globs leave the nozzle and arc up to a point on the landing band, where the
    // foam appears; the arc bends over like a real stream under gravity.
    const parts = [];
    function spawn(now, noz, count) {
      for (let i = 0; i < count && parts.length < 240; i++) {
        const y1 = -0.04 + Math.random() * 1.06;
        const x1 = noz[0] + BAND * (noz[1] - y1) + (Math.random() - 0.5) * 0.1;
        const rise = Math.max(0.05, noz[1] - y1);
        parts.push({
          x0: noz[0], y0: noz[1], x1, y1,
          cx: (noz[0] + x1) / 2 + 0.04 + rise * 0.1, cy: Math.min(noz[1], y1) - 0.06 - rise * 0.12,
          t0: now, dur: 220 + rise * 330 + Math.random() * 120, r1: 0.013 + Math.random() * 0.024,
        });
      }
    }

    // ---------------------------------------------------------------- per-frame state
    let p = 0, lastP = null, lastT = performance.now(), vel = 0, spray = 0, carry = 0;
    let noz = [0, NOZ_Y], dir = [BAND, -1];
    let drewLast = false, active = false, raf = 0;
    let slowFrames = 0, shrink = false;
    const adaptive = o.adaptive !== false;
    const t0 = performance.now();
    let done = false;                 // finished once: never rewinds
    let tipOff = 0, cannonW = 0;      // the nozzle's x inside the cannon element, and its width (px)
    let lastTitle = null, lastClean = null;

    function progress() {
      if (done) return 1;
      const r = section.getBoundingClientRect();
      const total = r.height - innerHeight;
      const v = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      if (v >= 0.995) { settle(); return 1; }
      return v;
    }
    // The wash is over: the section shrinks to one screen and the page carries on from here.
    // The scroll position is moved by the same amount, so nothing on screen shifts. Every
    // reveal lands on its final value, the loop stops, and nothing watches the section any more.
    function settle() {
      if (done) return;
      done = true;
      const before = section.getBoundingClientRect();
      section.classList.add('washed');
      const after = section.getBoundingClientRect();
      const dh = before.height - after.height;
      const shift = before.bottom <= 0 ? dh : (before.top < 0 ? Math.min(dh, -before.top) : 0);
      if (shift > 0) window.scrollBy({ top: -shift, left: 0, behavior: 'instant' });
      stage.classList.add('revealed');
      stage.style.setProperty('--title-out', '1');
      stage.style.setProperty('--clean', '1');
      for (const el of reveal) el.style.setProperty('--r', '1');
      cannon.style.visibility = 'hidden';
      if (drewLast) { clear(); drewLast = false; }
      setActive(false);
      io.disconnect();
    }
    function finish() { settle(); window.scrollTo({ top: scrollY + stage.getBoundingClientRect().top, behavior: 'auto' }); }

    // the cannon's nozzle, in screen units, across the whole wash
    function measureCannon() {
      cannon.style.transform = `rotate(${CANNON_ROT}deg)`;
      const sr = stage.getBoundingClientRect(), a = tip.getBoundingClientRect(), c = cannon.getBoundingClientRect();
      tipOff = a.left + a.width / 2 - sr.left; cannonW = c.width;
    }
    function nozzleX(p, cw, ch) {
      const [xs, xe] = sweepRange(asp);
      const hidden = (tipOff - cannonW - 40) / ch, gone = (cw + tipOff + 40) / ch;
      if (p < T.spray[0]) return lerp(hidden, xs, easeOut3(clamp((p - T.cannonIn[0]) / (T.cannonIn[1] - T.cannonIn[0]), 0, 1)));
      if (p < T.cannonOut[0]) return lerp(xs, xe, easeInOutSine(clamp((p - T.spray[0]) / (T.spray[1] - T.spray[0]), 0, 1)));
      return lerp(xe, gone, easeIn2(clamp((p - T.cannonOut[0]) / (T.cannonOut[1] - T.cannonOut[0]), 0, 1)));
    }

    function readNozzle() {
      const sr = stage.getBoundingClientRect();
      const a = tip.getBoundingClientRect(), b = back.getBoundingClientRect();
      const ch = canvas.clientHeight || 1;
      const ax = (a.left + a.width / 2 - sr.left) / ch, ay = (a.top + a.height / 2 - sr.top) / ch;
      const bx = (b.left + b.width / 2 - sr.left) / ch, by = (b.top + b.height / 2 - sr.top) / ch;
      const l = Math.hypot(ax - bx, ay - by) || 1;
      noz = [ax, ay];
      dir = [(ax - bx) / l, (ay - by) / l];
    }

    function writeBlob(i, x, y, r, s) {
      const o = i * 36;
      const c = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
      for (let k = 0; k < 6; k++) {
        const v = o + k * 6;
        verts[v] = c[k * 2]; verts[v + 1] = c[k * 2 + 1];
        verts[v + 2] = x; verts[v + 3] = y; verts[v + 4] = r; verts[v + 5] = s;
      }
    }

    function buildField(now, fr) {
      const sagK = sstep(T.sag[0], T.sag[1], p);
      const sag = 0.08 * sagK;
      let n = 0;
      const need = (blobs.length + parts.length * 4) * 36;
      if (verts.length < need) verts = new Float32Array(need * 2);
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        if (p < b.a) continue;
        const grow = clamp((p - b.a) / (b.k === 1 ? 0.018 : 0.032), 0, 1);
        let r = b.r * (b.k === 0 ? backOut(grow) : easeOut3(grow));
        let x = b.x, y = b.y + sag * (0.35 + 0.65 * b.w);
        // drips stretch as they form, then keep stretching with gravity while the foam sags
        if (b.k === 2) y += (b.L * (sstep(b.a, b.a + 0.2, p) + 0.6 * sagK) + sag * 0.6) * b.n / 4;
        if (fr.k > 0) {
          const behind = fr.s - (x * D[0] + y * D[1]);
          if (behind > 0) {   // swept along by the water: bunches up a little, then shrinks away
            x += D[0] * behind; y += D[1] * behind;
            r *= (1 + 0.15 * Math.min(1, behind / 0.04)) * Math.exp(-Math.max(0, behind - 0.04) * 8);
            if (r < 0.006) continue;
          }
        }
        writeBlob(n++, x, y, r, 1.0);
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        const k = (now - q.t0) / q.dur;
        if (k >= 1) { parts.splice(i, 1); continue; }
        for (let j = 0; j < 4; j++) {   // the glob and a short motion-blur trail behind it
          const kk = Math.max(0, k - j * 0.05);
          const e = 1 - Math.pow(1 - kk, 1.6), f = 1 - e;
          const x = f * f * q.x0 + 2 * f * e * q.cx + e * e * q.x1, y = f * f * q.y0 + 2 * f * e * q.cy + e * e * q.y1;
          writeBlob(n++, x, y, q.r1 * (0.2 + 0.8 * kk) * Math.pow(0.72, j), -1);
        }
      }
      return n;
    }

    function clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    let lastN = 0, lastFr = null;
    function draw(now, fr) {
      const n = buildField(now, fr);
      lastN = n; lastFr = fr;
      // pass 1: the field
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fw, fh);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (n > 0) {
        gl.useProgram(pField);
        gl.uniform1f(uF.uAsp, asp);
        gl.bindBuffer(gl.ARRAY_BUFFER, blobBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 36), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aBlob);
        gl.vertexAttribPointer(aBlob, 4, gl.FLOAT, false, 24, 8);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, n * 6);
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(aCorner);
        gl.disableVertexAttribArray(aBlob);
      }
      // pass 2: shade
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(pShade);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uS.uField, 0);
      gl.uniform2f(uS.uRes, W, H);
      gl.uniform2f(uS.uFieldPx, 3.0 / fw, 3.0 / fh);   // the lumps' slope is read over 3 field texels: the field is 8-bit, closer taps only see its steps
      gl.uniform1f(uS.uAsp, asp);
      gl.uniform1f(uS.uTime, (now - t0) / 1000);
      gl.uniform1f(uS.uFront, fr.s);
      gl.uniform1f(uS.uRinse, fr.k > 0 ? 1 : 0);
      gl.uniform1f(uS.uDrops, fr.k > 0 ? 1 - sstep(T.drops[0], T.drops[1], p) : 0);
      gl.uniform1f(uS.uGold, lerp(-1.2, 2.2, sstep(0.1, 0.95, p)) + Math.sin((now - t0) / 4000) * 0.08);
      gl.uniform1f(uS.uTheme, root.dataset.theme === 'light' ? 1 : 0);
      gl.uniform2f(uS.uD, D[0], D[1]);
      gl.uniform3f(uS.uSpray, noz[0], noz[1], spray);
      gl.uniform2f(uS.uSprayDir, dir[0], dir[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aPos);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!W && !measure()) return;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;
      if (shrink) { shrink = false; W = 0; measure(); }
      readNozzle();   // last frame's cannon position: no forced layout
      p = progress();
      const fr = front(p, asp);

      // the stream runs while the nozzle sweeps: a steady trickle, stronger the faster the visitor scrolls
      const v = lastP == null ? 0 : (p - lastP) / dt;
      lastP = p;
      vel = lerp(vel, v, 1 - Math.exp(-dt * 12));
      const inWindow = p > T.cannonIn[1] * 0.75 && p < T.spray[1] - 0.01;   // the cannon is on screen before it fires
      const target = inWindow ? clamp(0.3 + vel * 5, 0, 1) : 0;
      spray = lerp(spray, target, 1 - Math.exp(-dt * (target > spray ? 12 : 6)));
      if (spray > 0.04) {
        carry += spray * 120 * dt;
        const c = Math.floor(carry);
        carry -= c;
        if (c > 0) spawn(now, noz, c);
      }

      // the cannon walks in from the left, sweeps across while firing (its nozzle lagging the
      // sweep a few degrees, like a real hose), and leaves on the right
      const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
      const nx = nozzleX(p, cw, ch) * ch - tipOff;
      const walk = Math.sin((now - t0) / 1000 * Math.PI * 2 * 1.5);
      const bob = walk * 4 * spray, sway = walk * 1.2 * spray;
      const lag = clamp(vel * 40, -4, 4);
      const kick = spray * 0.9;
      const jx = (Math.random() - 0.5) * kick, jy = (Math.random() - 0.5) * kick;
      cannon.style.transform = `translate(${nx.toFixed(1)}px, ${(bob + jy).toFixed(2)}px) rotate(${(CANNON_ROT + sway - lag).toFixed(2)}deg) translate(${jx.toFixed(2)}px, 0)`;
      cannon.style.visibility = p <= 0 || p >= T.cannonOut[1] ? 'hidden' : 'visible';

      // page state that follows the wash (written only when it changes)
      const titleOut = sstep(T.titleOut[0], T.titleOut[1], p).toFixed(3);
      if (titleOut !== lastTitle) { lastTitle = titleOut; stage.style.setProperty('--title-out', titleOut); }
      const clean = easeOut3(fr.k).toFixed(3);
      if (clean !== lastClean) { lastClean = clean; stage.style.setProperty('--clean', clean); }
      stage.classList.toggle('revealed', fr.k > 0.55);
      for (const b of revealBoxes) {
        const s = b.x * D[0] + b.y * D[1];
        const r = easeOut3(clamp((fr.s - s + 0.04) / 0.32, 0, 1)).toFixed(3);
        if (r !== b.last) { b.last = r; b.el.style.setProperty('--r', r); }
      }

      // draw only while there's something to show
      const visible = (p > T.spray[0] - 0.01 && p < T.drops[1] + 0.01) || parts.length > 0 || spray > 0.01;
      if (visible && !done) {
        draw(now, fr);
        drewLast = true;
        // keep it smooth on slower phones
        if (adaptive && dt > 0.026) { if (++slowFrames > 40 && scale > 0.42) { scale -= 0.08; slowFrames = 0; shrink = true; } }
        else slowFrames = Math.max(0, slowFrames - 1);
      } else if (drewLast) {
        clear();
        drewLast = false;
      }
    }

    function setActive(on) {
      if (on === active) return;
      active = on;
      if (on) { lastT = performance.now(); lastP = null; measure(); measureCannon(); raf = requestAnimationFrame(frame); }
      else cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver((es) => { if (!done) setActive(es[0].isIntersecting); }, { rootMargin: '25% 0px 25% 0px' });
    io.observe(section);
    let rt = 0;
    window.addEventListener('resize', () => { if (done) return; clearTimeout(rt); rt = setTimeout(() => { W = 0; measure(); measureCannon(); }, 120); });
    // The GPU took the context away (a long time in the background, a reset): the wash cannot
    // go on, so it finishes at once and the services show directly, as without WebGL.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      active = false;
      root.classList.add('no-webgl');
      settle();
    });

    return {
      debug() { return { p, lastN, lastFr, W, H, fw, fh, asp, blobs: blobs.length, parts: parts.length, err: gl.getError(), drewLast, done, lite, active }; },
      refresh() { if (done) return; W = 0; measure(); measureCannon(); },
      finish,
      done() { return done; },
      top() { return scrollY + stage.getBoundingClientRect().top; },
      progressTo(target) {   // scroll position for a given progress (the stage top once the wash is done)
        const r = section.getBoundingClientRect();
        return scrollY + r.top + (done ? 0 : (r.height - innerHeight) * target);
      },
    };
  }

  window.AlchemistWash = { start, T };
})();

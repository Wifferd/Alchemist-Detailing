/* Alchemist Detailing — the wash.
   Scrolling drives the wash: the foam cannon walks in from the left and sprays
   a steady stream across the screen, left to right, until the screen is
   covered; then a sheet of rinse water sweeps across and the services appear.
   Once the wash has finished it stays finished: the section lets go of the
   page (no more pinning) and scrolling back up never rewinds it.

   Rendering, in two WebGL passes:
     1. Every foam blob is drawn as a soft disc into a small field texture
        (red = coverage, green = thickness), summed with additive blending.
     2. One full-screen pass turns that field into foam: lumpy shading, bubble
        walls, glossy highlights (a few in gold), thin see-through edges and
        loose bubbles; then the rinse water, droplets left on the glass, and
        the mist from the nozzle.
   Usage: AlchemistWash.start({ section, stage, canvas, cannon, tip, back, reveal: [elements] }) */
(function () {
  'use strict';

  // Timeline, as progress through the pinned section (0..1).
  const T = {
    cannonIn: [0.0, 0.1],
    spray: [0.08, 0.56],       // the nozzle sweeps left to right; foam lands along the stream
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
  const D = (() => { const x = 1, y = 0.36, l = Math.hypot(x, y); return [x / l, y / l]; })();
  function front(p, asp) {
    const k = clamp((p - T.rinse[0]) / (T.rinse[1] - T.rinse[0]), 0, 1);
    const sMin = -0.3, sMax = asp * D[0] + D[1] + 0.32;
    return { k, s: lerp(sMin, sMax, easeInOut(k)) };
  }

  // Where and when every blob of foam lands. Coordinates: x in [0, aspect],
  // y in [0, 1] from the top. A blob lands when the stream reaches it, so the
  // left lands first and the right last, in a band that leans with the spray.
  function sweepRange(asp) { return [-0.2, asp + 0.06]; }
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
    // spatter that lands just ahead of each mass
    for (let b = 0; b < big; b++) {
      const B = out[b];
      const n = 2 + Math.floor(R() * 3);
      for (let s = 0; s < n; s++) {
        const ang = R() * Math.PI * 2, dist = B.r * (0.75 + R() * 0.8);
        out.push({ x: B.x + Math.cos(ang) * dist, y: B.y + Math.sin(ang) * dist, r: B.r * (0.16 + R() * 0.22), a: B.a - 0.004 - R() * 0.016, w: R(), k: 1, n: 0, L: 0 });
      }
    }
    // drips that grow under some of the masses
    const drips = Math.round(big * 0.2);
    for (let d = 0; d < drips; d++) {
      const B = out[Math.floor(R() * big)];
      const L = 0.07 + R() * 0.15;
      const ox = (R() - 0.5) * B.r * 0.6;
      for (let n = 1; n <= 4; n++) out.push({ x: B.x + ox, y: B.y + B.r * 0.42, r: B.r * (0.27 - n * 0.035), a: B.a + 0.01, w: B.w, k: 2, n, L });
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
uniform vec2 uD;
uniform vec3 uSpray;
uniform vec2 uSprayDir;

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
  vec4 F = texture2D(uField, uv);
  vec4 acc = vec4(0.0);

  // the rinse front: dd < 0 has been rinsed
  vec2 Dp = vec2(-uD.y, uD.x);
  float s = dot(q, uD);
  float across = dot(q, Dp);
  float rag = (noise(vec2(across*8.0, t*0.35)) - 0.5)*0.07 + (noise(vec2(across*30.0, 2.0)) - 0.5)*0.025;
  float dd = s - uFront + rag*uRinse;

  // ---------------------------------------------------------------- foam
  if (F.r > 0.14){
    vec2 idM, offM;
    vec2 vm = vor(q*26.0 + vec2(0.0, -t*0.015), idM, offM);
    float e = fbm3(q*4.5 + vec2(t*0.01, 0.0));
    float bub = 1.0 - smoothstep(0.0, 0.8, vm.x);
    float field = F.r + (e - 0.5)*0.26 + (bub - 0.5)*0.2;
    float cov = smoothstep(0.40, 0.45, field);
    if (uRinse > 0.0) cov *= smoothstep(-0.01, 0.02, dd);
    if (cov > 0.002){
      float th = clamp(F.g*4.2 + (field - 0.45)*1.2, 0.0, 1.0);
      if (uRinse > 0.0) th *= smoothstep(0.0, 0.05, dd);
      float gx = texture2D(uField, uv + vec2(uFieldPx.x, 0.0)).g - texture2D(uField, uv - vec2(uFieldPx.x, 0.0)).g;
      float gy = texture2D(uField, uv + vec2(0.0, uFieldPx.y)).g - texture2D(uField, uv - vec2(0.0, uFieldPx.y)).g;
      vec3 n = normalize(vec3(-gx*2.6, -gy*2.6, 1.0));
      vec3 L = normalize(vec3(-0.45, 0.55, 0.8));
      float lam = clamp(dot(n, L), 0.0, 1.0);
      vec2 idF, offF;
      vec2 vf = vor(q*80.0 + 11.0, idF, offF);
      float wallF = 1.0 - smoothstep(0.02, 0.11, vf.y - vf.x);
      float wallM = 1.0 - smoothstep(0.015, 0.09, vm.y - vm.x);
      float thin = 1.0 - th;
      // warm white, shaded by the foam's lumps; bubble walls show where it's thin
      vec3 col = mix(vec3(0.76, 0.75, 0.73), vec3(0.975, 0.968, 0.95), smoothstep(0.1, 0.95, lam*0.8 + 0.3));
      col *= 1.0 - (1.0 - wallF)*0.025*th;
      col *= mix(1.0, 0.9 + 0.1*wallM, thin);
      // a highlight on every bubble; a few catch the gold
      vec2 hl = vec2(-0.2, -0.24);
      vec2 rm = -offM - hl;
      float specM = exp(-dot(rm, rm)*80.0)*step(0.55, h21(idM + 9.1));
      vec2 rf = -offF - hl;
      float specF = exp(-dot(rf, rf)*120.0);
      float goldPick = step(0.87, h21(idM + 3.7));
      vec3 hlCol = mix(vec3(1.0), vec3(1.0, 0.78, 0.40), goldPick);
      col += hlCol*specM*(0.06 + 0.5*thin)*0.8;
      col += vec3(1.0)*specF*0.05*th;
      // the gold light passing across
      float gl = exp(-pow((q.x*0.82 - q.y*0.57) - uGold, 2.0)*10.0);
      col = mix(col, col*vec3(1.06, 0.97, 0.84), gl*0.18);
      col += vec3(1.0, 0.75, 0.35)*gl*specM*goldPick*0.5;
      // thin foam lets the background show through each bubble's face
      float face = (1.0 - wallM)*(1.0 - wallF*0.5);
      float alpha = cov*mix(1.0 - face*0.55, 1.0, smoothstep(0.08, 0.45, th));
      alpha = max(alpha, cov*specM*0.6);
      acc = vec4(col*alpha, alpha);
    }
    // loose bubbles around the foam's edge
    if (F.r < 0.62){
      vec2 idL, offL;
      vor(q*10.0 + 5.3, idL, offL);
      float rad = 0.22 + 0.16*h21(idL + 2.1);
      float rr = length(offL)/rad;
      if (h21(idL*1.7) > 0.72 && rr < 1.0 && (uRinse <= 0.0 || dd > 0.02)){
        vec2 rel = -offL/rad;
        float rim = smoothstep(0.7, 0.95, rr)*(1.0 - smoothstep(0.95, 1.0, rr));
        vec2 a1 = rel - vec2(-0.36, -0.42), a2 = rel - vec2(0.42, 0.40);
        float hl1 = exp(-dot(a1, a1)*36.0), hl2 = exp(-dot(a2, a2)*50.0);
        float ba = clamp(rim*0.7 + 0.05 + hl1*0.9 + hl2*0.35, 0.0, 1.0)*smoothstep(0.14, 0.3, F.r);
        vec3 bc = clamp(vec3(0.93, 0.92, 0.9)*rim + vec3(1.0)*hl1 + vec3(1.0, 0.82, 0.5)*hl2 + 0.2, 0.0, 1.0);
        acc = over(vec4(bc*ba, ba), acc);
      }
    }
  }

  // ---------------------------------------------------------------- foam in flight
  if (F.b > 0.2){
    float fa = smoothstep(0.3, 0.6, F.b)*0.8;
    float fb = texture2D(uField, uv + vec2(-uFieldPx.x, uFieldPx.y)).b;
    vec3 fc = vec3(0.9, 0.895, 0.88) + vec3(0.1)*clamp((fb - F.b)*6.0, 0.0, 1.0);
    acc = over(vec4(fc*fa*0.95, fa*0.95), acc);
  }

  // ---------------------------------------------------------------- rinse water
  if (uRinse > 0.0){
    float behind = -dd;
    float sheet = smoothstep(-0.005, 0.03, behind)*(1.0 - smoothstep(0.1, 0.55, behind));
    float flow = noise(vec2(across*46.0, s*2.6 - t*2.4));
    float flow2 = noise(vec2(across*12.0 + 4.0, s*1.3 - t*1.2));
    float streak = smoothstep(0.6, 0.95, flow)*0.8 + smoothstep(0.58, 0.92, flow2)*0.45;
    float film = sheet*0.2*(1.0 - streak*0.6);
    acc = over(vec4(vec3(0.015, 0.018, 0.022)*film, film), acc);
    float wa = sheet*streak*0.42;
    acc = over(vec4(vec3(0.88, 0.92, 0.95)*wa, wa), acc);
    float line = clamp(exp(-dd*dd*16000.0)*0.85 + exp(-dd*dd*900.0)*0.12, 0.0, 1.0);
    vec3 lc = vec3(0.98, 0.95, 0.88);
    acc = over(vec4(lc*line, line), acc);
  }

  // ---------------------------------------------------------------- droplets left on the glass
  if (uDrops > 0.002 && dd < -0.04){
    vec2 qd = q + vec2(0.0, -t*0.012);
    vec2 idD, offD;
    vor(qd*8.0 + 1.3, idD, offD);
    float rad = 0.12 + 0.2*h21(idD + 8.0);
    float rr = length(offD)/rad;
    if (h21(idD*3.1) > 0.7 && rr < 1.0){
      vec2 rel = -offD/rad;
      float edge = 1.0 - smoothstep(0.92, 1.0, rr);
      float ring = smoothstep(0.5, 0.95, rr)*edge;
      vec2 b1 = rel - vec2(-0.3, -0.36), b2 = rel - vec2(0.28, 0.4);
      float hl = exp(-dot(b1, b1)*34.0);
      float caus = exp(-dot(b2, b2)*16.0)*(1.0 - ring);
      float fade = uDrops*smoothstep(-0.04, -0.15, dd);
      acc = over(vec4(vec3(0.0), ring*0.5*fade), acc);
      acc = over(vec4(vec3(1.0, 0.78, 0.4)*caus*0.35*fade, caus*0.35*fade), acc);
      acc = over(vec4(vec3(1.0)*hl*0.95*fade, hl*0.95*fade), acc);
    }
  }

  // ---------------------------------------------------------------- mist from the nozzle
  if (uSpray.z > 0.01){
    vec2 v = q - uSpray.xy;
    float along = dot(v, uSprayDir);
    if (along > 0.0){
      float perp = dot(v, vec2(-uSprayDir.y, uSprayDir.x));
      float ang = atan(perp, along);
      float cone = 1.0 - smoothstep(0.16, 0.5, abs(ang));
      float fall = smoothstep(0.0, 0.04, along)*exp(-along*1.3);
      float str = noise(vec2(ang*34.0, along*8.0 - t*16.0));
      float m = clamp(cone*fall*(0.3 + 1.0*str)*uSpray.z*0.7, 0.0, 0.75);
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
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;

    // programs
    const pField = link(gl, VS_FIELD, FS_FIELD);
    const pShade = link(gl, VS_FULL, FS_SHADE);
    const aCorner = gl.getAttribLocation(pField, 'aCorner');
    const aBlob = gl.getAttribLocation(pField, 'aBlob');
    const aPos = gl.getAttribLocation(pShade, 'aPos');
    const uF = {}; ['uAsp'].forEach((n) => { uF[n] = gl.getUniformLocation(pField, n); });
    const uS = {};
    ['uField', 'uRes', 'uFieldPx', 'uAsp', 'uTime', 'uFront', 'uRinse', 'uDrops', 'uGold', 'uD', 'uSpray', 'uSprayDir']
      .forEach((n) => { uS[n] = gl.getUniformLocation(pShade, n); });
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const blobBuf = gl.createBuffer();
    let verts = new Float32Array(6 * 6 * 1200);

    // field texture and framebuffer
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let fw = 0, fh = 0;

    const small = Math.min(innerWidth, innerHeight) < 700;
    let scale = small ? 0.55 : 0.7;
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
        return { el, x: (r.left + r.width / 2 - sr.left) / ch, y: (r.top + r.height * 0.35 - sr.top) / ch };
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

    function progress() {
      if (done) return 1;
      const r = section.getBoundingClientRect();
      const total = r.height - innerHeight;
      const v = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      if (v >= 0.995) { settle(); return 1; }
      return v;
    }
    // The wash is over: the section shrinks to one screen and the page carries on from here.
    // The scroll position is moved by the same amount, so nothing on screen shifts.
    function settle() {
      if (done) return;
      done = true;
      const before = section.getBoundingClientRect();
      section.classList.add('washed');
      const after = section.getBoundingClientRect();
      window.scrollBy({ top: -(before.height - after.height), left: 0, behavior: 'instant' });
      stage.classList.add('revealed');
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
      const sag = 0.08 * sstep(T.sag[0], T.sag[1], p);
      let n = 0;
      const need = (blobs.length + parts.length * 3) * 36;
      if (verts.length < need) verts = new Float32Array(need * 2);
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        if (p < b.a) continue;
        const grow = clamp((p - b.a) / (b.k === 1 ? 0.018 : 0.032), 0, 1);
        let r = b.r * (b.k === 0 ? backOut(grow) : easeOut3(grow));
        let x = b.x, y = b.y + sag * (0.35 + 0.65 * b.w);
        if (b.k === 2) y += (b.L * sstep(b.a, b.a + 0.2, p) + sag * 0.6) * b.n / 4;
        if (fr.k > 0) {
          const behind = fr.s - (x * D[0] + y * D[1]);
          if (behind > 0) {   // swept along by the water, shrinking as it goes
            x += D[0] * behind; y += D[1] * behind;
            r *= Math.exp(-behind * 7);
            if (r < 0.006) continue;
          }
        }
        writeBlob(n++, x, y, r, 1.0);
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        const k = (now - q.t0) / q.dur;
        if (k >= 1) { parts.splice(i, 1); continue; }
        for (let j = 0; j < 3; j++) {   // the glob and a short trail behind it
          const kk = Math.max(0, k - j * 0.06);
          const e = 1 - Math.pow(1 - kk, 1.6), f = 1 - e;
          const x = f * f * q.x0 + 2 * f * e * q.cx + e * e * q.x1, y = f * f * q.y0 + 2 * f * e * q.cy + e * e * q.y1;
          writeBlob(n++, x, y, q.r1 * (0.2 + 0.8 * kk) * (1 - j * 0.28), -1);
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
      gl.uniform2f(uS.uFieldPx, 2.8 / fw, 2.8 / fh);
      gl.uniform1f(uS.uAsp, asp);
      gl.uniform1f(uS.uTime, (now - t0) / 1000);
      gl.uniform1f(uS.uFront, fr.s);
      gl.uniform1f(uS.uRinse, fr.k > 0 ? 1 : 0);
      gl.uniform1f(uS.uDrops, fr.k > 0 ? 1 - sstep(T.drops[0], T.drops[1], p) : 0);
      gl.uniform1f(uS.uGold, lerp(-1.2, 2.2, sstep(0.1, 0.95, p)) + Math.sin((now - t0) / 4000) * 0.08);
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

      // the cannon walks in from the left, sweeps across while firing, and leaves on the right
      const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
      const nx = nozzleX(p, cw, ch) * ch - tipOff;
      const walk = Math.sin((now - t0) / 1000 * Math.PI * 2 * 1.5);
      const bob = walk * 4 * spray, sway = walk * 1.2 * spray;
      const kick = spray * 0.9;
      const jx = (Math.random() - 0.5) * kick, jy = (Math.random() - 0.5) * kick;
      cannon.style.transform = `translate(${nx.toFixed(1)}px, ${(bob + jy).toFixed(2)}px) rotate(${(CANNON_ROT + sway).toFixed(2)}deg) translate(${jx.toFixed(2)}px, 0)`;
      cannon.style.visibility = p <= 0 || p >= T.cannonOut[1] ? 'hidden' : 'visible';

      // page state that follows the wash
      stage.style.setProperty('--title-out', sstep(T.titleOut[0], T.titleOut[1], p).toFixed(3));
      stage.style.setProperty('--clean', easeOut3(fr.k).toFixed(3));
      stage.classList.toggle('revealed', fr.k > 0.55);
      for (const b of revealBoxes) {
        const s = b.x * D[0] + b.y * D[1];
        const r = clamp((fr.s - s + 0.04) / 0.32, 0, 1);
        b.el.style.setProperty('--r', easeOut3(r).toFixed(3));
      }

      // draw only while there's something to show
      const visible = (p > T.spray[0] - 0.01 && p < T.drops[1] + 0.01) || parts.length > 0 || spray > 0.01;
      if (visible) {
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
    const io = new IntersectionObserver((es) => setActive(es[0].isIntersecting), { rootMargin: '25% 0px 25% 0px' });
    io.observe(section);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { W = 0; measure(); measureCannon(); }, 120); });

    return {
      debug() { return { p, lastN, lastFr, W, H, fw, fh, asp, blobs: blobs.length, parts: parts.length, err: gl.getError(), drewLast, done }; },
      refresh() { W = 0; measure(); measureCannon(); },
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

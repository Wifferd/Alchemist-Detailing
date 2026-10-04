/* Alchemist Detailing — paint, water and leather, drawn live in WebGL.

   Hero scenes (one is picked per visit):
     "beads"  glossy black paint covered in water beads; a gold light passes
              across the clear coat and glints in every drop.
     "gloss"  the same paint after drying off: a few beads left, so the clear
              coat and its metallic flake carry the light.
   Still pictures for the service cards and the wash background come from the
   same shaders, plus a leather scene for Interior:
     art scenes: gloss, beads, leather, split (paint above, leather below).

   Real photos or video of the owner's work can replace these later.
   Usage:
     AlchemistHero.start(canvas, { scene: 'beads' | 'gloss', still?: true })
     AlchemistHero.art(scene, width, height, time)  -> a canvas to copy from */
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
uniform float uScene;      // art only: 0 gloss, 1 beads, 2 leather, 3 split
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
const vec3 GOLD = vec3(1.0, 0.66, 0.20);      // the logo's saturated gold
const vec3 GOLD_HI = vec3(1.0, 0.83, 0.50);
// The gold light: a soft-edged streak that sweeps diagonally across the surface.
float lightPos(float t){ return fract(t*0.075 + 0.62)*3.6 - 1.4; }
vec3 finish(vec3 c, vec2 uv){
  // vignette, gentle filmic curve, fine grain
  float v = smoothstep(1.25, 0.25, length((uv - 0.5)*vec2(1.15, 1.0)));
  c *= mix(0.55, 1.0, v);
  // tone-map on brightness only, so the gold keeps its saturation
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= 1.0/(1.0 + lum*0.75);
  c += (hash21(uv*uRes + fract(uTime)*91.7) - 0.5)*0.012;
  return pow(max(c, 0.0), vec3(0.95));
}`;

  // Wet paint: what the clear coat reflects (a near-black studio, a soft warm
  // panel that drifts slowly, and the gold light), then three layers of beads.
  const PAINT = `
float waviness(vec2 q){ return (noise(q*3.1) - 0.5)*0.035 + (noise(q*11.0) - 0.5)*0.008; }
vec3 env(vec2 q, float t, float sharp){
  vec3 c = vec3(0.003, 0.003, 0.004);
  float w = waviness(q);
  float pp = sin(t*0.07)*0.55;
  float dp = (q.x*0.55 + q.y*0.84) - pp + w*2.0;
  c += vec3(0.030, 0.026, 0.020)*exp(-dp*dp*2.2) + vec3(0.012, 0.012, 0.015)*exp(-dp*dp*0.5);
  float d = (q.x*0.82 - q.y*0.57) - lightPos(t) + w;
  float k = mix(30.0, 420.0, sharp);
  float core = exp(-d*d*k);
  float halo = exp(-d*d*9.0);
  c += (GOLD*core*1.25 + vec3(1.0, 0.93, 0.80)*pow(core, 6.0)*0.55 + GOLD*halo*0.07)*uIntro;
  return c;
}
float beads(vec2 g, float density, float rmin, float rmax, out vec2 o, out float rr, out float tt){
  vec2 id = floor(g);
  float best = 9.0;
  o = vec2(0.0); rr = 0.0; tt = 9.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 cid = id + vec2(float(i), float(j));
      if (hash21(cid*0.731 + 4.1) > density) continue;
      vec2 c = cid + 0.2 + hash22(cid*1.37 + 3.1)*0.6;
      float r = mix(rmin, rmax, pow(hash21(cid + 7.7), 1.8));
      vec2 dv = g - c;
      float ang = hash21(cid + 2.2)*6.2831;
      vec2 ax = vec2(cos(ang), sin(ang));
      vec2 local = vec2(dot(dv, ax), dot(dv, vec2(-ax.y, ax.x)));
      local.x *= 1.0 + (hash21(cid + 5.5) - 0.5)*0.24;
      float tn = length(local)/r;
      if (tn < best){ best = tn; rr = r; o = dv/r; }
    }
  }
  tt = best;
  return best < 1.6 ? 1.0 : 0.0;
}
vec3 paint(vec2 uv, float asp, float t, float density, float zoom){
  vec2 q = (uv - 0.5)*vec2(asp, 1.0)*1.35*zoom + vec2(t*0.006, t*0.0025);
  // shallow depth of field: sharp across the middle band, soft above and below
  float blur = smoothstep(0.10, 0.48, abs(uv.y - 0.46 - 0.04*sin(t*0.05)));
  vec3 col = env(q, t, 1.0 - blur*0.85);
  float glow = exp(-pow((q.x*0.82 - q.y*0.57) - lightPos(t), 2.0)*7.0);
  float fl = step(0.9968, hash21(floor(q*vec2(640.0))));
  col += GOLD_HI*fl*glow*(1.0 - blur)*uIntro*0.8;
  vec3 L = normalize(vec3(0.82, -0.57, 0.75));
  vec2 Ld = normalize(vec2(0.82, -0.57));
  for (int k = 0; k < 3; k++){
    float sc = k == 2 ? 4.6 : (k == 1 ? 9.0 : 19.0);
    float dens = k == 2 ? 0.55 : (k == 1 ? 0.58 : 0.55);
    float rmin = k == 2 ? 0.20 : (k == 1 ? 0.15 : 0.11);
    float rmax = k == 2 ? 0.42 : (k == 1 ? 0.36 : 0.28);
    vec2 o; float rr; float tn;
    float b = beads(q*sc + float(k)*17.3, dens*density, rmin, rmax, o, rr, tn);
    if (b < 0.5) continue;
    float soft = 0.025 + blur*0.30*(k == 2 ? 1.0 : 0.7);
    float a = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, tn);
    if (a <= 0.001) continue;
    float tt = clamp(tn, 0.0, 1.0);
    float z = sqrt(max(1.0 - tt*tt, 0.0));
    vec3 n = normalize(vec3(o*1.1, z + 0.05));
    // looking through the drop: the scene is flipped and squeezed toward the centre
    vec2 qr = q - o*(rr/sc)*2.6;
    vec3 through = env(qr, t, 0.6)*0.9;
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
    float sp = max(dot(R, L), 0.0);
    float spec = pow(sp, mix(220.0, 30.0, blur));
    float fres = pow(1.0 - z, 2.5);
    vec3 c = through*(1.0 - fres*0.85);
    // dark contact ring, thin lit edge on the light side
    c *= 1.0 - smoothstep(0.62, 0.97, tt)*0.85;
    float lightSide = max(dot(normalize(o + 1e-4), Ld), 0.0);
    float edge = smoothstep(0.80, 0.95, tt)*(1.0 - smoothstep(0.95, 1.02, tt));
    c += GOLD_HI*edge*lightSide*(0.05 + glow*0.9)*uIntro;
    // light focused through the drop: bright crescent on the far side
    float caus = exp(-pow(length(o + Ld*0.42)*3.0, 2.0))*(1.0 - smoothstep(0.75, 1.0, tt));
    c += GOLD*caus*(0.03 + glow*0.85)*uIntro;
    c += vec3(1.0, 0.94, 0.82)*spec*(0.35 + 2.6*glow)*uIntro*(1.0 - blur*0.5);
    col = mix(col, c, a);
  }
  return col;
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
  vec3 base = vec3(0.064, 0.054, 0.047);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = base*(0.25 + 1.0*key)*(0.35 + 0.95*diff);
  col *= 0.55 + 0.45*smoothstep(0.0, 0.35, h);        // creases at the stitches
  col *= 0.92 + (fbm(q*5.0 + 2.0) - 0.5)*0.3;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 14.0);
  col += vec3(0.16, 0.14, 0.12)*spec*(0.25 + key)*0.8;
  float d = (q.x*0.82 - q.y*0.57) - lightPos(t)*0.8;
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
      vec3 th = vec3(0.86, 0.6, 0.24)*sh*(0.45 + key*0.75);
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
  else {
    // paint above a diagonal, leather below, a thin gold trim between
    vec2 q = (uv - 0.5)*vec2(asp, 1.0);
    float m = q.y + q.x*0.42 - 0.04;
    vec3 a = paint(uv, asp, uTime, 0.55, 1.05);
    vec3 b = leather(uv, asp, uTime + 3.0);
    c = mix(b, a, smoothstep(-0.004, 0.004, m));
    float trim = exp(-m*m*26000.0);
    c = mix(c, vec3(1.0, 0.72, 0.28), trim*0.9);
    c += GOLD*exp(-m*m*900.0)*0.12;
  }
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
    return { prog, uRes: u('uRes'), uTime: u('uTime'), uIntro: u('uIntro'), uDensity: u('uDensity'), uZoom: u('uZoom'), uScene: u('uScene') };
  }

  function start(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!opts.still, powerPreference: 'high-performance' });
    if (!gl) return null;
    const P = program(gl, COMMON + PAINT + HERO_MAIN);
    const preset = opts.scene === 'gloss' ? { density: 0.32, zoom: 1.12 } : { density: 1.0, zoom: 1.0 };
    gl.uniform1f(P.uDensity, preset.density);
    // portrait screens see less of the surface, so zoom out a little there
    const portrait = canvas.clientHeight > canvas.clientWidth;
    gl.uniform1f(P.uZoom, preset.zoom * (portrait ? 1.25 : 1));

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const scale = opts.scale || (small ? 0.62 : 0.75);   // render below screen resolution: soft, fast
    const fps = opts.fps || (small ? 30 : 60);
    let raf = 0, last = 0, visible = true;
    const t0 = performance.now();
    const timeOffset = opts.time != null ? opts.time : 4 + Math.random() * 30;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(canvas.clientWidth * dpr * scale));
      const h = Math.max(2, Math.round(canvas.clientHeight * dpr * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    function draw(now) {
      resize();
      const secs = (now - t0) / 1000;
      gl.uniform2f(P.uRes, canvas.width, canvas.height);
      gl.uniform1f(P.uTime, timeOffset + (opts.still ? 0 : secs));
      gl.uniform1f(P.uIntro, opts.still ? 1 : Math.min(1, Math.max(0, (secs - 0.3) / 1.6)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / fps - 2) return;
      last = now;
      draw(now);
    }
    if (opts.still) {
      draw(performance.now());
      window.addEventListener('resize', () => draw(performance.now()));
      return { stop() {} };
    }
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    return {
      stop() { cancelAnimationFrame(raf); io.disconnect(); },
    };
  }

  // One shared offscreen context for every still picture.
  let artGL = null;
  function art(scene, w, h, time) {
    const names = { gloss: 0, beads: 1, leather: 2, split: 3 };
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas;
  }

  window.AlchemistHero = { start, art };
})();

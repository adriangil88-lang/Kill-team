import { kfetch, kjson, kbuf, kblob, NET } from './net.js';
// Renderizador WebGL estilo Tabletop Simulator: iluminación direccional con sombras suaves, esculturas reales (OBJ), mesa con textura.
const m4 = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  lookAt(e, t, u) { const f = n3([t[0] - e[0], t[1] - e[1], t[2] - e[2]]), s = n3(x3(f, u)), w = x3(s, f); return new Float32Array([s[0], w[0], -f[0], 0, s[1], w[1], -f[1], 0, s[2], w[2], -f[2], 0, -d3(s, e), -d3(w, e), d3(f, e), 1]); },
  ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); },
  trs(tx, ty, tz, R, sx, sy, sz) { // R: 3x3 row-major (columnas = ejes locales)
    R = R || [1, 0, 0, 0, 1, 0, 0, 0, 1]; return new Float32Array([R[0] * sx, R[3] * sx, R[6] * sx, 0, R[1] * sy, R[4] * sy, R[7] * sy, 0, R[2] * sz, R[5] * sz, R[8] * sz, 0, tx, ty, tz, 1]);
  }
};
const n3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const x3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Rzm = a => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
let TPACK = null; const TPB = {}; let RANGE = null; // RANGE: null = sin probar, promesa = probando, true/false = resultado
const txKey = n => 'tx/' + n; let TXC = null; const txCache = async () => { if (TXC === null) { try { TXC = await caches.open('kt-assets-v1'); } catch (e) { TXC = false; } } return TXC; };
async function tblob(name, url) { // texturas agrupadas en tpackN.webp (índice tpack.json: nombre → [desplazamiento, tamaño, n.º de pack]). Se pide SOLO el trozo de cada textura (Range) en vez del paquete de 14 MB; si el servidor no admite Range, se baja el paquete entero como antes. Cada trozo se guarda en caché.
  if (TPACK === null) TPACK = (async () => { try { return await kjson('tpack.json', { tries: 4 }); } catch (e) { TPACK = null; return false; } })();
  const m = await TPACK; const e = m && m[name];
  if (!e) return kblob(url);
  const pi = e[2] || 0, a = e[0], L = e[1], mk = buf => new Blob([buf], { type: 'image/webp' }), full = () => { if (!TPB[pi]) TPB[pi] = kbuf('tpack' + pi + '.webp').catch(er => { delete TPB[pi]; throw er; }); return TPB[pi]; };
  const c = await txCache(); if (c) { try { const h = await c.match(txKey(name)); if (h && h.ok) { const b = await h.blob(); if (b.size === L) return b; } } catch (er) { } }
  const save = b => { if (c) { try { c.put(txKey(name), new Response(b, { headers: { 'content-type': 'image/webp' } })); } catch (er) { } } return b; };
  if (TPB[pi]) { const buf = await TPB[pi]; return save(mk(buf.slice(a, a + L))); } // paquete ya descargado entero
  if (RANGE && typeof RANGE.then === 'function') await RANGE.catch(() => { }); // otro trozo está probando si el servidor admite Range
  if (RANGE !== false) {
    const probe = RANGE === null; let done; if (probe) RANGE = new Promise(z => { done = z; });
    try {
      const r = await kfetch('tpack' + pi + '.webp', { keep: false, headers: { Range: 'bytes=' + a + '-' + (a + L - 1) }, tries: 4 });
      if (r.status === 206) { const buf = await r.arrayBuffer(); if (buf.byteLength === L) { RANGE = true; if (done) done(); return save(mk(buf)); } }
      RANGE = false; if (done) done(); // el servidor ignora Range y envía el paquete entero: se aprovecha lo descargado
      if (r.status === 200) { const buf = await r.arrayBuffer(); if (buf.byteLength > L) { TPB[pi] = Promise.resolve(buf); return save(mk(buf.slice(a, a + L))); } }
    } catch (er) { if (probe) { RANGE = null; if (done) done(); } throw er; }
  }
  const buf = await full(); return save(mk(buf.slice(a, a + L)));
}
export const LIGHT = n3([-0.45, -0.55, 0.75]);

const VS_PROP = `attribute vec3 aPos;attribute vec3 aNor;attribute vec2 aUV;
uniform mat4 uVP,uModel,uLVP;varying vec3 vN,vW;varying vec2 vUV;varying vec4 vL;
void main(){vec4 w=uModel*vec4(aPos,1.);vW=w.xyz;vN=mat3(uModel)*aNor;vUV=aUV;vL=uLVP*w;gl_Position=uVP*w;}`;
export const HQ = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) >= 700; /* PC / iPad: calidad máxima (no en móvil) */
const SH_N = HQ ? 4096 : 3072; /* resolución del mapa de sombras */
const SHADOW_FN = `uniform sampler2D uSh;uniform float uShOn;
float shadow(vec4 l,float nl){vec3 p=l.xyz/l.w*.5+.5;if(uShOn<.5||p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)return 1.;float b=.0016+.003*(1.-nl);float s=0.;
${HQ ? `float a=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*6.2832;mat2 Rm=mat2(cos(a),-sin(a),sin(a),cos(a));
for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){float d=texture2D(uSh,p.xy+Rm*vec2(float(i),float(j))*1.15/${SH_N}.).r;s+=(p.z-b>d)?0.:1.;}return s/25.;}` : `for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float d=texture2D(uSh,p.xy+vec2(float(i),float(j))/${SH_N}.*1.7).r;s+=(p.z-b>d)?0.:1.;}return s/9.;}`}`;
const PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const GRADE_FN = `vec3 grade(vec3 c,vec3 w,vec3 eye){c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.1);float d=distance(eye,w);return mix(c,vec3(.055,.07,.095),smoothstep(70.,200.,d)*.5);}`;
const FS_PROP = PREC + `varying vec3 vN,vW;varying vec2 vUV;varying vec4 vL;
uniform sampler2D uTex;uniform int uMode;uniform vec3 uCol,uL,uEye;uniform vec2 uTS,uTO;uniform float uEm,uSpec,uAlpha,uCut,uTOy,uDet;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1.,0.)),f.x),mix(hh(i+vec2(0.,1.)),hh(i+vec2(1.)),f.x),f.y);}
${SHADOW_FN}
${GRADE_FN}
void main(){vec3 n=normalize(vN);vec3 alb=uCol;
 if(uMode==0){vec4 t0=texture2D(uTex,vUV);if(uCut>.5&&t0.a<.5)discard;alb=t0.rgb;}
 else if(uMode==1){vec2 q;vec3 an=abs(n);if(an.x>.6)q=vW.yz;else if(an.y>.6)q=vW.xz;else q=vW.xy;alb=texture2D(uTex,q*uTS).rgb*uCol;}
 else if(uMode==3){vec3 an=abs(n);if(an.z>.6&&uCut>.5)discard;if(an.z<=.6){vec2 q;if(an.x>.6)q=vec2(vW.y*uTS.x+uTOy,vW.z*uTS.y+uTO.y);else q=vec2(vW.x*uTS.x+uTO.x,vW.z*uTS.y+uTO.y);vec4 tx=texture2D(uTex,q);if(uCut>.5&&tx.a<.5)discard;alb=tx.rgb;}}
 ${HQ ? 'if(uDet>.5){float dd=length(uEye-vW);float fd=1.-smoothstep(25.,90.,dd);float dt=vn(vW.xy*7.)*.5+vn(vW.xy*19.)*.3+vn(vW.xy*47.)*.2;alb*=1.+(dt-.5)*.55*fd;}' : ''}
 float nl=max(dot(n,uL),0.);float sh=shadow(vL,nl);
 vec3 amb=mix(vec3(.16,.15,.17),vec3(.42,.46,.55),n.z*.5+.5)*mix(.8,1.,smoothstep(0.,.9,vW.z));/* oclusión ambiental: la base de muros y cajas, algo más oscura */
 vec3 V=normalize(uEye-vW);vec3 H=normalize(uL+V);float sp=pow(max(dot(n,H),0.),32.)*uSpec;
 vec3 c=alb*(amb+vec3(1.,.95,.86)*nl*sh*.95)+vec3(1.,.95,.9)*sp*sh+alb*uEm+alb*vec3(.55,.65,.9)*max(dot(n,vec3(.62,.68,.28)),0.)*.13+alb*vec3(.5,.38,.3)*max(-n.z,0.)*.1;
 gl_FragColor=vec4(uMode==2&&uEm>.4?c:grade(c,vW,uEye),uAlpha);}`;
const VS_MESH = `attribute vec3 aPos;attribute vec3 aNor;attribute vec2 aUV;
uniform mat4 uVP,uModel,uLVP;uniform float uHinv;varying vec3 vN,vW;varying float vH;varying vec4 vL;varying vec2 vUV;
void main(){vec4 w=uModel*vec4(aPos,1.);vW=w.xyz;vN=mat3(uModel)*aNor;vH=aPos.y*uHinv;vUV=aUV;vL=uLVP*w;gl_Position=uVP*w;}`;
const FS_MESH = PREC + `varying vec3 vN,vW;varying float vH;varying vec4 vL;varying vec2 vUV;
uniform vec3 uTeam,uL,uEye;uniform float uDim,uHurt,uGlow,uUseTex;uniform sampler2D uTexM;
${SHADOW_FN}
${GRADE_FN}
void main(){vec3 n=normalize(vN);vec3 metal=vec3(.17,.18,.2);vec3 bone=vec3(.82,.77,.66);
 vec3 alb=uTeam;
 if(uUseTex>.5){alb=texture2D(uTexM,vUV).rgb;}else
 if(vH<.36)alb=mix(metal,uTeam*.45,.35);else if(vH>.84)alb=mix(bone,uTeam,.18);else alb=mix(uTeam*.86,metal,.12+smoothstep(.62,.8,vH)*.2);
 if(uUseTex<.5)alb*=.72+.28*smoothstep(-.4,.7,n.z);alb=mix(alb,vec3(dot(alb,vec3(.33))),uDim*.7)*(1.-uDim*.35);
 alb=mix(alb,vec3(.9,.1,.12),uHurt*.28);
 float nl=max(dot(n,uL),0.);float sh=shadow(vL,nl);
 vec3 amb=mix(vec3(.14,.13,.15),vec3(.45,.5,.6),n.z*.5+.5);
 vec3 V=normalize(uEye-vW);vec3 H=normalize(uL+V);float sp=pow(max(dot(n,H),0.),40.)*.55;
 float rim=pow(1.-max(dot(n,V),0.),2.5)*.2;
 vec3 c=alb*(amb+vec3(1.,.95,.86)*nl*sh)+vec3(1.,.96,.9)*sp*sh+rim*vec3(.5,.6,.8)+uGlow*vec3(1.,.9,.5)*.35+alb*vec3(.55,.65,.9)*max(dot(n,vec3(.62,.68,.28)),0.)*.16;
 gl_FragColor=vec4(grade(c,vW,uEye),1.);}`;
const VS_DEPTH = `attribute vec3 aPos;uniform mat4 uMVP;uniform float uK;void main(){gl_Position=uMVP*vec4(aPos*uK,1.);}`;
const FS_DEPTH = `precision mediump float;void main(){gl_FragColor=vec4(1.);}`;

function geomBox() { // cubo unidad [0,1]^3, 24 vértices
  const P = [], N = [], U = [], I = []; const faces = [[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]], [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1], [-1, 0, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 0, -1]]];
  faces.forEach((f, k) => { for (let i = 0; i < 4; i++) { P.push(...f[i]); N.push(...f[4]); U.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); } I.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); });
  return { P, N, U, I };
}
function geomCyl(n = 28) { // radio 1, altura 1 (z 0..1), tapa superior e inferior
  const P = [], N = [], U = [], I = [];
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); P.push(c, s, 0, c, s, 1); N.push(c, s, 0, c, s, 0); U.push(i / n, 0, i / n, 1); }
  for (let i = 0; i < n; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const b = P.length / 3; P.push(0, 0, 1); N.push(0, 0, 1); U.push(.5, .5); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; P.push(Math.cos(a), Math.sin(a), 1); N.push(0, 0, 1); U.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5); }
  for (let i = 0; i < n; i++) I.push(b, b + 1 + i, b + 2 + i);
  return { P, N, U, I };
}
function geomPyr() { // cono triangular invertido (▼): vértice en z=0, base triangular de radio 1 en z=1
  const P = [], N = [], U = [], I = []; const c = [0, 1, 2].map(i => [Math.cos(Math.PI / 2 + i * 2 * Math.PI / 3), Math.sin(Math.PI / 2 + i * 2 * Math.PI / 3)]);
  for (let i = 0; i < 3; i++) { const a = c[i], b = c[(i + 1) % 3]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const n = n3([mx, my, -0.6]); const k = P.length / 3;
    P.push(0, 0, 0, a[0], a[1], 1, b[0], b[1], 1); N.push(...n, ...n, ...n); U.push(0, 0, 0, 0, 0, 0); I.push(k, k + 1, k + 2); }
  const k = P.length / 3; P.push(c[0][0], c[0][1], 1, c[1][0], c[1][1], 1, c[2][0], c[2][1], 1); for (let i = 0; i < 3; i++) { N.push(0, 0, 1); U.push(0, 0); } I.push(k, k + 1, k + 2);
  return { P, N, U, I };
}
function geomQuad() { return { P: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], N: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], U: [0, 0, 1, 0, 1, 1, 0, 1], I: [0, 1, 2, 0, 2, 3] }; }

export function createGL(E, canvas) {
  const R = { ok: false, meshes: {}, tex: {}, W: 0, H: 0, yaw: {}, packTry: {}, texTry: {} };
  let gl; try { gl = canvas.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) { }
  if (!gl) return R; R.gl = gl;
  const dep = gl.getExtension('WEBGL_depth_texture'); R.shadows = !!dep;
  function prog(vs, fs) { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; } gl.attachShader(p, sh); } gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; } const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } p.u = u; return p; }
  const PP = prog(VS_PROP, FS_PROP), PM = prog(VS_MESH, FS_MESH), PD = prog(VS_DEPTH, FS_DEPTH); if (!PP || !PM || !PD) return R;
  const buf = (type, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(type, b); gl.bufferData(type, data, usage || gl.STATIC_DRAW); return b; };
  function mkGeom(g) { return { vb: buf(gl.ARRAY_BUFFER, new Float32Array(g.P)), nb: buf(gl.ARRAY_BUFFER, new Float32Array(g.N)), ub: buf(gl.ARRAY_BUFFER, new Float32Array(g.U)), ib: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.I)), n: g.I.length }; }
  const BOX = mkGeom(geomBox()), CYL = mkGeom(geomCyl()), QUAD = mkGeom(geomQuad()), PYR = mkGeom(geomPyr());
  const isPot = v => (v & (v - 1)) === 0, np2 = v => { let n = 1; while (n < v) n <<= 1; return Math.min(n, 2048); };
  const ANI = (() => { const an = gl.getExtension('EXT_texture_filter_anisotropic'); return an ? { e: an, n: Math.min(16, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) } : null; })();
  function texFrom(src, repeat, mips) { /* mips: filtrado trilineal + anisotrópico (sin brillos al alejar o inclinar la cámara); las texturas no potencia de 2 se remuestrean a potencia de 2 (los UV son normalizados) para poder tener mipmaps y REPEAT */
    let img = src; const w = src.width, h = src.height; if ((mips || repeat) && !(isPot(w) && isPot(h)) && w > 8 && h > 8) { try { const c = document.createElement('canvas'); c.width = np2(w); c.height = np2(h); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); img = c; } catch (e) { img = src; } }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); const pot = isPot(img.width) && isPot(img.height); const rep = repeat && pot; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (mips && pot) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); if (ANI) gl.texParameterf(gl.TEXTURE_2D, ANI.e.TEXTURE_MAX_ANISOTROPY_EXT, ANI.n); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; }
  // ----- texturas procedurales
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  function noise(c, amt) { const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const k = (rnd() - .5) * amt; d.data[i] += k; d.data[i + 1] += k; d.data[i + 2] += k; } x.putImageData(d, 0, 0); }
  function texWall() { const c = cnv(256, 256), x = c.getContext('2d'); x.fillStyle = '#7d8793'; x.fillRect(0, 0, 256, 256); for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) { const off = (r % 2) * 64; x.fillStyle = `hsl(212,${8 + rnd() * 6}%,${44 + rnd() * 10}%)`; x.fillRect(q * 128 + off - 128 + 2, r * 64 + 2, 124, 60); x.fillRect(q * 128 + off + 2, r * 64 + 2, 124, 60); } x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3; for (let r = 0; r <= 4; r++) { x.beginPath(); x.moveTo(0, r * 64); x.lineTo(256, r * 64); x.stroke(); } for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * .18})`; x.fillRect(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 6 + rnd() * 18); } noise(c, 22); return c; }
  function texCrate() { const c = cnv(256, 256), x = c.getContext('2d'); x.fillStyle = '#8a8f55'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 8; i++) { x.fillStyle = `hsl(${68 + rnd() * 10},${22 + rnd() * 10}%,${36 + rnd() * 8}%)`; x.fillRect(0, i * 32 + 1, 256, 30); } x.strokeStyle = '#3d4224'; x.lineWidth = 5; x.strokeRect(6, 6, 244, 244); x.beginPath(); x.moveTo(6, 6); x.lineTo(250, 250); x.moveTo(250, 6); x.lineTo(6, 250); x.stroke(); noise(c, 26); return c; }
  function texWood() { const c = cnv(512, 512), x = c.getContext('2d'); x.fillStyle = '#4b3424'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(${20 + rnd() * 40},${10 + rnd() * 20},5,${.1 + rnd() * .2})`; x.lineWidth = 1 + rnd() * 3; x.beginPath(); const y = rnd() * 512; x.moveTo(0, y); for (let k = 1; k <= 8; k++)x.lineTo(k * 64, y + Math.sin(k + i) * 4); x.stroke(); } noise(c, 16); return c; }
  function texDice() { const c = cnv(384, 256), x = c.getContext('2d'); const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] }; for (let v = 1; v <= 6; v++) { const cx = ((v - 1) % 3) * 128, cy = Math.floor((v - 1) / 3) * 128; const g = x.createLinearGradient(cx, cy, cx + 128, cy + 128); g.addColorStop(0, '#f4efe2'); g.addColorStop(1, '#d9d2bf'); x.fillStyle = g; x.fillRect(cx, cy, 128, 128); x.strokeStyle = 'rgba(80,70,50,.55)'; x.lineWidth = 8; x.strokeRect(cx + 2, cy + 2, 124, 124); for (const [a, b] of PIPS[v]) { x.fillStyle = v === 1 ? '#c0262d' : '#17130f'; x.beginPath(); x.arc(cx + 64 + a * 30, cy + 64 + b * 30, v === 1 ? 17 : 12, 0, 7); x.fill(); } } return c; }
  function loadVol() { for (const [k, u] of [['vwall', 'vwall.webp'], ['vgrate', 'vgrate.webp']]) { const im = new Image(); im.onload = () => { try { R.tex[k] = texFrom(im, true, true); R.dirty = true; } catch (e) {} }; const u0 = (R.texBase || '') + u; let nr = 0; im.onerror = () => { if (nr++ < 4) setTimeout(() => { im.src = u0 + '?_r=' + nr; }, 1500 * nr); }; im.src = u0; } for (const k of ['Conceal_ready', 'Conceal_activated', 'Engage_ready', 'Engage_activated']) { const im = new Image(); im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.translate(0, c.height); x.scale(1, -1); x.drawImage(im, 0, 0); R.tex['ord_' + k] = texFrom(c, false, false); R.dirty = true; } catch (e) {} }; const u0 = (R.texBase || '') + 'img/tok/' + k + '.webp'; let nr = 0; im.onerror = () => { if (nr++ < 4) setTimeout(() => { im.src = u0 + '?_r=' + nr; }, 1500 * nr); }; im.src = u0; } /* la ficha se invierte (▼, como el marcador original) */ for (const k of ['1c', '1o', '2c', '2o', '3c', '3o', 'b', 't0', 't1', 't2', 's0', 's1', 's2']) { const im = new Image(); im.onload = () => { try { R.tex['sk' + k] = texFrom(im, false, /^[ts]\d$/.test(k)); R.dirty = true; } catch (e) {} }; const u0 = (R.texBase || '') + 'sk' + k + '.webp'; let nr = 0; im.onerror = () => { if (nr++ < 4) setTimeout(() => { im.src = u0 + '?_r=' + nr; }, 1500 * nr); }; im.src = u0; } }
  function mkTex() { loadVol(); R.tex.wall = texFrom(texWall(), true, true); R.tex.crate = texFrom(texCrate(), true, true); R.tex.wood = texFrom(texWood(), true, true); R.tex.dice = texFrom(texDice(), false, false); R.tex.ground = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, R.tex.ground); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 25, 33, 255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  mkTex();
  // dados: geometría con atlas 3x2 (caras en el mismo orden/ejes que sandbox.js)
  const FACES = [{ v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { v: 6, n: [0, 0, -1], u: [1, 0, 0], w: [0, -1, 0] }, { v: 2, n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }, { v: 5, n: [-1, 0, 0], u: [0, -1, 0], w: [0, 0, 1] }, { v: 3, n: [0, 1, 0], u: [0, 0, 1], w: [1, 0, 0] }, { v: 4, n: [0, -1, 0], u: [0, 0, 1], w: [-1, 0, 0] }];
  (function () { const P = [], N = [], U = [], I = []; FACES.forEach((f, k) => { const cx = ((f.v - 1) % 3) / 3, cy = Math.floor((f.v - 1) / 3) / 2; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const h = .5; P.push((f.n[0] + f.u[0] * a + f.w[0] * b) * h, (f.n[1] + f.u[1] * a + f.w[1] * b) * h, (f.n[2] + f.u[2] * a + f.w[2] * b) * h); N.push(...f.n); U.push(cx + (a * .46 + .5) / 3, cy + (b * .46 + .5) / 2); }); I.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); }); R.DIE = mkGeom({ P, N, U, I }); })();
  // sombras
  const SH = Math.min(SH_N, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048); let fbo = null, shTex = null, shCol = null;
  if (R.shadows) { shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, SH, SH, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); shCol = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shCol); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SH, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shCol, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { R.shadows = false; } gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
  const LCEN = [E.BW / 2, E.BH / 2, 0]; const LV = m4.lookAt([LCEN[0] + LIGHT[0] * 45, LCEN[1] + LIGHT[1] * 45, LIGHT[2] * 45], LCEN, [0, 0, 1]); const LP = m4.ortho(-21, 21, -17, 17, 8, 95); const LVP = m4.mul(LP, LV);

  // ----- mallas (esculturas)
  R.loadMeshes = async (jsonUrl) => { try { const j = await kjson(jsonUrl); R.index = j.idx; R.keys = j.order; R.base = jsonUrl.replace(/[^/]*$/, ''); R.packs = {}; R.packTry = {}; return R.keys.length; } catch (e) { console.error('meshes', e); return 0; } };
  R.ensure = key => {
    if (R.meshes[key] || !R.index || !R.index[key]) return R.meshes[key] || null; const pi = R.index[key].p;
    if (!R.packs[pi]) R.packs[pi] = (async () => { try { const url = (R.packUrl ? R.packUrl(pi) : R.base + 'mesh' + String(pi).padStart(2, '0') + '.webp'); const r = await kfetch(url); const ds = new Response(r.body.pipeThrough(new DecompressionStream('gzip'))); const bin = await ds.arrayBuffer(); for (const k in R.index) { const m = R.index[k]; if (m.p !== pi) continue; const vb = buf(gl.ARRAY_BUFFER, new Uint8Array(bin, m.off, m.n * 16)); const ib = buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bin.slice(m.ioff, m.ioff + m.t * 6))); R.meshes[k] = { vb, ib, tex: m.tex, n: m.t * 3, ext: m.ext, bb: m.bb, s: m.ext / 32767, hinv: m.ext / (32767 * m.bb[1]) }; } } catch (e) { console.error('pack', pi, e); const n = (R.packTry[pi] = (R.packTry[pi] || 0) + 1); if (n < 4) setTimeout(() => { delete R.packs[pi]; R.dirty = true; }, 3000 * n); } })();
    return null;
  };

  R.texs = {};
  R.getTex = name => { if (!name) return null; const e = R.texs[name]; if (e) return e.t || null; R.texs[name] = { t: null }; (async () => { try { const url = (R.texUrl ? R.texUrl(name) : R.base + name + '.webp'); const b = await tblob(name, url); const bmp = await createImageBitmap(b); R.texs[name].t = texFrom(bmp, false, true); R.dirty = true; } catch (e) { console.error('tex', name, e); const n = (R.texTry[name] = (R.texTry[name] || 0) + 1); if (n < 5) setTimeout(() => { delete R.texs[name]; R.dirty = true; }, 2500 * n); } })(); return null; };
  R.resize = (w, h, dpr) => { const W = Math.round(w * dpr), H = Math.round(h * dpr); if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; } R.W = w; R.H = h; };
  const bindProp = (g, p) => { for (const [loc, b, sz] of [['aPos', g.vb, 3], ['aNor', g.nb, 3], ['aUV', g.ub, 2]]) { const l = gl.getAttribLocation(p, loc); if (l < 0) continue; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 0, 0); } gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); };
  const bindMesh = (m, p) => { gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); const a = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.SHORT, false, 16, 0); const n = gl.getAttribLocation(p, 'aNor'); if (n >= 0) { gl.enableVertexAttribArray(n); gl.vertexAttribPointer(n, 3, gl.BYTE, true, 16, 8); } const t = gl.getAttribLocation(p, 'aUV'); if (t >= 0) { gl.enableVertexAttribArray(t); gl.vertexAttribPointer(t, 2, gl.UNSIGNED_SHORT, true, 16, 12); } gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); };
  const disableAttrs = () => { for (let i = 0; i < 4; i++) gl.disableVertexAttribArray(i); };

  // Lista de dibujo: props (geom + modelo + material) y minis
  R.render = (cam, S) => {
    const W = canvas.width, H = canvas.height; const { eye, F, cx, cy, vw, vh, f, r, u } = cam;
    // vista (misma base que view3d: r,u,f)
    const view = new Float32Array([r.x, u.x, -f.x, 0, r.y, u.y, -f.y, 0, r.z, u.z, -f.z, 0, -(r.x * eye.x + r.y * eye.y + r.z * eye.z), -(u.x * eye.x + u.y * eye.y + u.z * eye.z), (f.x * eye.x + f.y * eye.y + f.z * eye.z), 1]);
    const n = .4, fa = 220, P = new Float32Array(16); P[0] = 2 * F / vw; P[5] = 2 * F / vh; P[8] = 1 - 2 * cx / vw; P[9] = 2 * cy / vh - 1; P[10] = -(fa + n) / (fa - n); P[11] = -1; P[14] = -2 * fa * n / (fa - n);
    const VP = m4.mul(P, view);
    // ---- listas
    const props = [], minis = [];
    const prop = (g, M, o) => props.push(Object.assign({ g, M }, o));
    const bw = E.BW, bh = E.BH;
    prop(QUAD, m4.trs(0, 0, 0, null, bw, bh, 1), { mode: 0, tex: R.tex.ground, spec: .05, noShadowCast: true, det: true });
    prop(BOX, m4.trs(-7, -7, -3, null, bw + 14, bh + 14, 2.94), { mode: 1, tex: R.tex.wood, ts: [.12, .12], col: [1, 1, 1], spec: .1 });
    prop(BOX, m4.trs(-.5, -.5, -.3, null, bw + 1, bh + 1, .28), { mode: 2, col: [.1, .12, .16], spec: .3, noShadowCast: true });
    const scn = []; const putScn = (key, x, y, yaw, size) => { const m = R.ensure(key); if (!m) return false; const sc = size / Math.max(m.bb[0], m.bb[2]); const kk = m.s * sc; const RR = mulR(Rzm(yaw), [1, 0, 0, 0, 0, 1, 0, 1, 0]); minis.push({ m, M: m4.trs(x, y, 0, RR, kk, kk, kk), o: { col: [1, 1, 1], sc: 1 }, kk }); return true; };
    [['sc_cart', -4.2, bh * .3, .5, 5], ['sc_rock1', bw + 3.6, bh * .2, 1.2, 3.4], ['sc_rock3', bw + 3, bh * .72, 2.1, 2.2], ['sc_skel', -3.4, bh * .76, .3, 2.6], ['sc_skull', bw + 2.2, bh * .5, 2.4, .9], ['sc_barrel1', -2.6, bh * .1, 0, 1.1], ['sc_barrel2', -3.2, bh * .93, 1.1, 1.4], ['sc_barrel1', bw + 2.4, bh * .92, 0, 1.1], ['sc_crate1', bw + 3.2, bh * .05, .4, 1.8]].forEach(a => putScn(a[0], a[1], a[2], a[3], a[4]));
    const fitScn = (key, cx, cy, yaw, L, T, H, lenZ) => { const m = R.ensure(key); if (!m) return false; const a = lenZ ? [T / m.bb[0], H / m.bb[1], L / m.bb[2]] : [L / m.bb[0], H / m.bb[1], T / m.bb[2]]; const RR = mulR(Rzm(yaw), mulR([1, 0, 0, 0, 0, 1, 0, 1, 0], [a[0], 0, 0, 0, a[1], 0, 0, 0, a[2]])); minis.push({ m, M: m4.trs(cx, cy, 0, RR, m.s, m.s, m.s), o: { col: [1, 1, 1], sc: 1 }, kk: m.s }); return true; }; // Tomb World: muros y pilares modulares con las mallas reales del mod
    if (S.pieces) for (const p of S.pieces) {
      if (p.open) continue; /* escotilla abierta: se oculta el portillo */
      const th = p.rot * Math.PI / 180, sxa = Math.abs(p.sx);
      if (p.k === 3) { let lx = sxa, lz = Math.abs(p.sz); if ((((p.rot % 180) + 180) % 180) === 90) { const t = lx; lx = lz; lz = t; } { const L = Math.max(lx, lz), hz = lx >= lz, nT = Math.max(1, Math.round(L / 3.375)), pl = L / nT; let ok = L >= 1.8; for (let i = 0; i < nT && ok; i++) { const o = (i + .5) * pl - L / 2; ok = fitScn('gd1', p.x + (hz ? o : 0), p.y + (hz ? 0 : o), hz ? 0 : Math.PI / 2, pl, .8, p.sy, false); } if (ok) continue; } prop(BOX, m4.trs(p.x - lx / 2, p.y - lz / 2, 0, null, lx, lz, p.sy), { mode: 1, tex: R.tex.wall, ts: [.22, .22], col: [.5, .46, .44], spec: .1 }); continue; }
      if (p.k >= 30) { /* Typhon: mallas reales del mod (terreno Volkus + infestación); fi = índice del rasgo de infestación */ if (p.fi != null && S.tySac && S.tySac[p.fi] === 0) continue; const m = R.ensure('ty_' + (p.k - 30)); if (!m) continue; const th2 = p.rot * Math.PI / 180, c = Math.cos(th2), sn = Math.sin(th2), kk = m.s; minis.push({ m, M: new Float32Array([c * p.sx * kk, -sn * p.sx * kk, 0, 0, 0, 0, p.sy * kk, 0, sn * p.sz * kk, c * p.sz * kk, 0, 0, p.x, p.y, p.h, 1]), o: { col: [1, 1, 1], sc: 1 }, kk }); continue; }
      if (p.k >= 10) { const m = R.ensure('vk_' + 'ABCDEFGHIJKLMN'[p.k - 10]); if (!m) continue; const th2 = p.rot * Math.PI / 180, c = Math.cos(th2), sn = Math.sin(th2), kk = m.s; minis.push({ m, M: new Float32Array([c * p.sx * kk, -sn * p.sx * kk, 0, 0, 0, 0, p.sy * kk, 0, sn * p.sz * kk, c * p.sz * kk, 0, 0, p.x, p.y, p.h, 1]), o: { col: [1, 1, 1], sc: 1 }, kk }); continue; }
      const m = R.ensure('gd' + p.k); if (!m) continue;
      const D = [Math.sign(p.sx) * 1, 0, 0, 0, p.sy, 0, 0, 0, p.sz]; const RR = mulR(Rzm(-th), mulR([1, 0, 0, 0, 0, 1, 0, 1, 0], D)); const kk = m.s;
      minis.push({ m, M: m4.trs(p.x, p.y, 0, RR, kk, kk, kk), o: { col: [1, 1, 1], sc: 1 }, kk });
    }
    for (const rc of S.terrain) if (rc.eq) { // terreno de equipo con su modelo de la mesa KT24 (barricadas, alambre de púas)
      const k = 'eq:' + (rc.kind || (rc.t === 'razor' ? 'razor' : rc.t === 'wall' ? 'heavy' : rc.prot ? 'port' : 'light')); const hz = rc.w >= rc.h;
      if (!putScn(k, rc.x + rc.w / 2, rc.y + rc.h / 2, hz ? 0 : Math.PI / 2, Math.max(rc.w, rc.h))) prop(BOX, m4.trs(rc.x, rc.y, 0, null, rc.w, rc.h, rc.t === 'wall' ? 2.4 : rc.t === 'razor' ? .5 : .85), { mode: 1, tex: R.tex.crate, ts: [.45, .45] });
    }
    if (S.tele) for (const tp of S.tele) { if (putScn('tp:pad', tp.x, tp.y, 0, 2.36)) { prop(CYL, m4.trs(tp.x, tp.y, .21, null, .7, .7, .02), { mode: 2, col: [.4, 1, .9], spec: .2, em: .9, noShadowCast: true }); continue; } prop(CYL, m4.trs(tp.x, tp.y, 0, null, 1.18, 1.18, .12), { mode: 2, col: [.2, .55, .5], spec: .3, em: .5 }); prop(CYL, m4.trs(tp.x, tp.y, .12, null, .7, .7, .04), { mode: 2, col: [.4, 1, .9], spec: .2, em: .9 }); } // Tomb World: plataformas de teletransporte
    if (S.tyF) S.tyF.forEach((f, fi) => { if (S.tySac && S.tySac[fi] === 0) return; if (S.pieces && S.pieces.some(q => q.k >= 30 && q.fi === fi)) { if (S.tyDr && S.tyDr[fi]) prop(CYL, m4.trs(f[1], f[2], 0.02, null, Math.max(f[3], f[4]) + .25, Math.max(f[3], f[4]) + .25, .04), { mode: 2, col: [.2, .75, .45], spec: .2, em: .6, noShadowCast: true }); return; } const q = Math.abs(((f[5] % 180) + 180) % 180 - 90) < 1, a = q ? f[4] : f[3], b = q ? f[3] : f[4], dr = S.tyDr && S.tyDr[fi]; prop(CYL, m4.trs(f[1], f[2], 0, null, a, b, f[6] * .55), { mode: 2, col: [.42, .22, .58], spec: .25 }); prop(CYL, m4.trs(f[1], f[2], f[6] * .55, null, a * .7, b * .7, f[6] * .45), { mode: 2, col: dr ? [.2, .75, .45] : [.55, .3, .72], spec: .3, em: dr ? .35 : .08 }); }); // Typhon: piezas de infestación como volúmenes sencillos (verde = dron desplegado)
    if (S.pieces) { /* Compound Siege: las empalizadas se dibujan con las fotos oficiales del libro (Killzone Upgrade: Compound Siege, pág. 1): tres modelos (brecha en el extremo, brecha con ventana, puerta); cada tramo recorta la foto con su escala */
      const SK = { 1: { u0: .703, u1: .887, a: 325 / 768 }, 2: { u0: .405, u1: .598, a: 326 / 768 }, 3: { u0: .401, u1: .602, a: 340 / 768 } }, HT = 2.6, touch = (b, r) => Math.abs(b.x - r.x) < .07 && Math.abs(b.y - r.y) < .07 || (b.x + b.w >= r.x - .07 && b.x <= r.x + r.w + .07 && b.y + b.h >= r.y - .07 && b.y <= r.y + r.h + .07);
      const skInfo = new Map(); /* rect -> {tipo, ejes, espejo, ...} */
      for (const k of (S.vcSk || [])) { const r = k.r, hz = r.w >= r.h, ax = hz ? 'x' : 'y', ln = hz ? 'w' : 'h', cs = hz ? 'y' : 'x', tn = hz ? 'h' : 'w'; const bodies = S.terrain.filter(t => t.stk && !t.brk && (hz ? t.w >= t.h : t.h >= t.w) && Math.abs(t[cs] - r[cs]) < .1 && touch(t, r)); let A = r[ax], E = r[ax] + r[ln]; for (const b of bodies) { A = Math.min(A, b[ax]); E = Math.max(E, b[ax] + b[ln]); } const f = (r[ax] + r[ln] / 2 - A) / (E - A), ty = k.door ? 3 : (f > .3 && f < .7 ? 2 : 1), mir = ty === 1 && f < .5; const I = { ty, mir, ax, ln, b0: r[ax], b1: r[ax] + r[ln], hz }; for (const b of bodies) skInfo.set(b, I); skInfo.set(r, I); }
      for (const rc of S.terrain) { const I = skInfo.get(rc); if (I && R.tex['sk' + I.ty + 'o'] && R.tex['sk' + I.ty + 'c']) { const P = SK[I.ty], kU = P.a / HT, a0 = rc[I.ax], a1 = a0 + rc[I.ln], brc = rc.brk; let m, c; /* u = c + m·a (a = coordenada a lo largo del tramo) */
          if (brc) { m = (I.mir ? -1 : 1) * (P.u1 - P.u0) / (I.b1 - I.b0); c = (I.mir ? P.u1 : P.u0) - m * I.b0; }
          else { const before = a1 <= I.b0 + .01; if (!I.mir) { m = kU; c = before ? P.u0 - kU * I.b0 : P.u1 - kU * I.b1; } else { m = -kU; c = before ? P.u1 + kU * I.b0 : P.u0 + kU * I.b1; } }
          const T = R.tex['sk' + I.ty + (brc ? 'c' : 'o')]; prop(BOX, m4.trs(rc.x, rc.y, 0, null, rc.w, rc.h, HT), { mode: 3, tex: T, ts: [m, -1 / HT], to: I.hz ? [c, 1] : [c, 1], cut: true, col: [.42, .46, .55], spec: .12 }); continue; }
        if (rc.bnk && R.tex.skb) continue; /* los búnkeres se dibujan abajo con la foto del libro */
        if (rc.stk || rc.bnk) prop(BOX, m4.trs(rc.x, rc.y, 0, null, rc.w, rc.h, rc.brk ? 2.2 : 2.6), { mode: 1, tex: R.tex.vwall || R.tex.wall, ts: R.tex.vwall ? [.25, .5] : [.3, .3], col: R.tex.vwall ? (rc.brk ? [1.1, .62, .5] : [1, 1, 1]) : (rc.brk ? [.66, .32, .22] : [.44, .47, .52]) }); }
      if (R.tex.skb) { /* Búnker (libro, pág. 2): muro curvo de 3 caras; el motor lo aproxima con tramos rectos y escalones de 0,4": cada escalón diagonal se dibuja como un panel inclinado con la foto oficial */
        const bn = S.terrain.filter(t => t.bnk), kU = (560 / 765) / HT, T0 = .4; let u0 = 0, prev = null, grp = []; const segs = [];
        const flush = () => { if (grp.length) { const a = grp[0], b = grp[grp.length - 1]; segs.push({ P: [a.x + a.w / 2, a.y + a.h / 2], Q: [b.x + b.w / 2, b.y + b.h / 2], T: T0 }); grp = []; } };
        for (const t of bn) { if (prev && Math.hypot(t.x - prev.x, t.y - prev.y) > 2.2) flush(); if (Math.max(t.w, t.h) > .5) { flush(); segs.push(t.w > t.h ? { P: [t.x, t.y + t.h / 2], Q: [t.x + t.w, t.y + t.h / 2], T: t.h } : { P: [t.x + t.w / 2, t.y], Q: [t.x + t.w / 2, t.y + t.h], T: t.w }); } else grp.push(t); prev = t; } flush();
        for (const sg of segs) { let dx = sg.Q[0] - sg.P[0], dy = sg.Q[1] - sg.P[1]; let L = Math.hypot(dx, dy); if (L < .05) { dx = 1; dy = 0; L = 0; } const th = Math.atan2(dy, dx), ux = Math.cos(th), uy = Math.sin(th), T = sg.T, LL = L + T, Rm = Rzm(th);
          const ox = sg.P[0] - ux * T / 2 + uy * T / 2, oy = sg.P[1] - uy * T / 2 - ux * T / 2; /* esquina local (0,0) del tramo */
          const useY = Math.abs(uy) > .6, sdir = useY ? Math.sign(uy) || 1 : Math.sign(ux) || 1, span = useY ? Math.abs(uy) : Math.abs(ux), s = sdir * kU / Math.max(span, .3); if (u0 + LL * kU > .999) u0 = 0; const pc = useY ? sg.P[1] - uy * T / 2 : sg.P[0] - ux * T / 2, c = u0 - s * pc; u0 += LL * kU;
          prop(BOX, m4.trs(ox, oy, 0, Rm, LL, T, HT), { mode: 3, tex: R.tex.skb, ts: [s, -1 / HT], to: [c, 1], to2: c, cut: true, col: [.42, .46, .55], spec: .12 }); }  } }
    if (S.fsteps && S.fsteps.length) S.fsteps.forEach((f, i) => { /* Escalones de fuego (libro, pág. 2): cajas de munición gris, roja y negra, con volumen real; la tapa y los laterales salen de las fotos oficiales (tapa corregida de perspectiva) */
      const k = i % 3, TT = R.tex['skt' + k], TS = R.tex['sks' + k], hz = f.z || 1; if (!TT || !TS) { prop(BOX, m4.trs(f.x, f.y, 0, null, f.w, f.h, hz), { mode: 2, col: [[.62, .66, .7], [.45, .14, .14], [.2, .24, .17]][k], spec: .1 }); return; }
      prop(BOX, m4.trs(f.x, f.y, 0, null, f.w, f.h, hz), { mode: 0, tex: TS, spec: .06 });
      const L = Math.max(f.w, f.h), Sh = Math.min(f.w, f.h), yaw = f.h > f.w ? Math.PI / 2 : 0, cx = f.x + f.w / 2, cy = f.y + f.h / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
      prop(BOX, m4.trs(cx - (c * L / 2 - sn * Sh / 2), cy - (sn * L / 2 + c * Sh / 2), hz + .004, Rzm(yaw), L, Sh, .02), { mode: 0, tex: TT, spec: .08 });
    });
    if (S.bz) { const Z = S.bz, tx = R.tex.wall; const realSt = putScn('bz:statue', Z.sx, Z.sy, 0, 1.5); if (!realSt) { prop(BOX, m4.trs(Z.sx - .75, Z.sy - .75, 0, null, 1.5, 1.5, .55), { mode: 1, tex: tx, ts: [.3, .3], col: [.55, .5, .46] }); prop(BOX, m4.trs(Z.sx - .45, Z.sy - .45, .55, null, .9, .9, .35), { mode: 1, tex: tx, ts: [.3, .3], col: [.5, .46, .42] }); prop(CYL, m4.trs(Z.sx, Z.sy, .9, null, .3, .3, 1.6), { mode: 2, col: [.66, .64, .6], spec: .2 }); prop(CYL, m4.trs(Z.sx, Z.sy, 2.5, null, .22, .22, .36), { mode: 2, col: [.7, .68, .64], spec: .2 }); } prop(CYL, m4.trs(Z.px, Z.py, 0, null, .75, .75, .04), { mode: 2, col: [.92, .76, .3], spec: .4, em: .35 }); prop(CYL, m4.trs(Z.px, Z.py, .04, null, .32, .32, .08), { mode: 2, col: [.5, .12, .12], spec: .4, em: .3 }); } // Blood and Zeal: estatua del santuario y peana
    /* Octarius: agrupa los bloques rasterizados del mapa en piezas y las sustituye por las mallas reales del mod (ruina, pozo, chatarra, muros) */
    const ocDone = new Set(); if (S.oct && S.terrain) { if (!S.terrain._oc) { const T = S.terrain.filter(r => !r.eq && !r.bzs), P = T.map((_, i) => i), f = i => P[i] === i ? i : (P[i] = f(P[i])); for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) { const a = T[i], b = T[j]; if (a.hz !== b.hz || !!a.lo !== !!b.lo) continue; if (a.x <= b.x + b.w + .01 && b.x <= a.x + a.w + .01 && a.y <= b.y + b.h + .01 && b.y <= a.y + a.h + .01) P[f(i)] = f(j); } const G = {}; T.forEach((r, i) => (G[f(i)] = G[f(i)] || []).push(r)); S.terrain._oc = Object.values(G).map(g => { const x0 = Math.min(...g.map(r => r.x)), y0 = Math.min(...g.map(r => r.y)), x1 = Math.max(...g.map(r => r.x + r.w)), y1 = Math.max(...g.map(r => r.y + r.h)); return { g, x0, y0, w: x1 - x0, h: y1 - y0, hz: g[0].hz, lo: !!g[0].lo }; }); }
      S.terrain._oc.forEach((c, ci) => { const hs = Math.abs(Math.floor(c.x0 * 7 + c.y0 * 13)); const key = c.hz >= 4 ? 'oc:pump' : c.hz >= 3 ? 'oc:p' + (hs % 2 ? 'a' : 'b') : c.hz >= 2 ? 'oc:h' + (1 + hs % 3) : (c.w >= 3 || c.h >= 3) ? 'oc:w' + (1 + hs % 3) : null; if (!key) return; const m = R.ensure(key); if (!m) return; const hzL = c.w >= c.h, same = hzL === (m.bb[0] >= m.bb[2]), a = same ? [c.w / m.bb[0], c.h / m.bb[2]] : [c.h / m.bb[0], c.w / m.bb[2]], H = Math.min(4.6, Math.max(.9, c.hz >= 3 ? c.hz * 1.05 : (c.hz >= 2 ? 2.0 : 1.3))), ys = H / m.bb[1], flip = (hs % 2) * Math.PI; const RR = mulR(Rzm((same ? 0 : Math.PI / 2) + flip), mulR([1, 0, 0, 0, 0, 1, 0, 1, 0], [a[0], 0, 0, 0, ys, 0, 0, 0, a[1]])); minis.push({ m, M: m4.trs(c.x0 + c.w / 2, c.y0 + c.h / 2, 0, RR, m.s, m.s, m.s), o: { col: [1, 1, 1], sc: 1 }, kk: m.s }); c.g.forEach(r => ocDone.add(r)); }); }
        for (const rc of (S.pieces ? [] : S.terrain)) { if (rc.eq || rc.bzs || ocDone.has(rc)) continue; const wall = rc.t === 'wall';
      if (S.tw && !wall) { const m = R.ensure(Math.abs(rc.w * rc.h) >= 6 ? 'tw:l0' : 'tw:l' + (1 + Math.abs(Math.floor(rc.x * 7 + rc.y * 13)) % 3)); if (m) { const rw = Math.abs(rc.w), rh = Math.abs(rc.h), rx = rc.w < 0 ? rc.x + rc.w : rc.x, ry = rc.h < 0 ? rc.y + rc.h : rc.y, same = (rw >= rh) === (m.bb[0] >= m.bb[2]), a = same ? [rw / m.bb[0], rh / m.bb[2]] : [rh / m.bb[0], rw / m.bb[2]], ys = Math.min(1.4, Math.sqrt(a[0] * a[1])); const RR = mulR(Rzm(same ? 0 : Math.PI / 2), mulR([1, 0, 0, 0, 0, 1, 0, 1, 0], [a[0], 0, 0, 0, ys, 0, 0, 0, a[1]])); minis.push({ m, M: m4.trs(rx + rw / 2, ry + rh / 2, 0, RR, m.s, m.s, m.s), o: { col: [1, 1, 1], sc: 1 }, kk: m.s }); continue; } }
      if (S.tw && wall && S.doors && S.doors.includes(rc)) { const rw = Math.abs(rc.w), rh = Math.abs(rc.h), hz = rw >= rh; if (fitScn('tw:door', rc.x + rc.w / 2, rc.y + rc.h / 2, hz ? 0 : Math.PI / 2, Math.max(rw, rh), Math.max(Math.min(rw, rh), .4), 2.45, false)) continue; }
      if (S.tw && wall) { const rw = Math.abs(rc.w), rh = Math.abs(rc.h), rx = rc.w < 0 ? rc.x + rc.w : rc.x, ry = rc.h < 0 ? rc.y + rc.h : rc.y, hs = Math.abs(Math.floor(rx * 7 + ry * 13)), hz = rw >= rh, L = Math.max(rw, rh), T = Math.min(rw, rh), cx = rx + rw / 2, cy = ry + rh / 2, yaw = hz ? 0 : Math.PI / 2;
        if (S.brs && S.brs.includes(rc) && fitScn('tw:w3', cx, cy, yaw, L, Math.max(T, .4), 2.45, false)) continue; /* punto de brecha */
        if (L < 2.2 && T < .9 && L >= .3 && fitScn('tw:w1', cx, cy, yaw, L, Math.max(T, .4), 2.45, false)) continue; /* tramo corto de muro junto a un punto de acceso */
        if (L >= 2.2) { const WV = ['tw:w1', 'tw:z0', 'tw:z1', 'tw:z2'], k = T >= .8 ? 'tw:wk' : WV[hs % 4], nT = Math.max(1, Math.round(L / 3.5)), pl = L / nT; let ok = true; for (let i = 0; i < nT && ok; i++) { const o = (i + .5) * pl - L / 2; const lz = k === 'tw:wk' || k[3] === 'z'; ok = fitScn(k, cx + (hz ? o : 0), cy + (hz ? 0 : o), yaw + (lz ? Math.PI / 2 : 0), pl, T >= .8 ? T : Math.max(T, .4), 2.45, lz); /* las mallas z* y wk tienen su eje largo en Z: giro extra de 90° */ } if (ok) continue; }
        else if (fitScn('tw:p' + (T < .9 ? 7 : hs % 7), cx, cy, 0, rw, rh, 2.4, false)) continue; } if (!wall) { const hs = Math.abs(Math.floor(rc.x * 7 + rc.y * 13)); if (putScn('sc_crate' + (1 + hs % 4), rc.x + rc.w / 2, rc.y + rc.h / 2, (rc.h > rc.w ? Math.PI / 2 : 0) + (hs % 3) * .08, Math.max(rc.w, rc.h) * 1.05)) { if (hs % 3 === 0) putScn('sc_barrel1', rc.x + rc.w + .7, rc.y + rc.h * .3, hs, 1.0); continue; } } const vt = R.tex.vwall || null; /* muros y barricadas con la textura de la escenografía original (recorte del atlas del mod) */ prop(BOX, m4.trs(rc.x, rc.y, 0, null, rc.w, rc.h, wall ? 2.4 : .85), { mode: 1, tex: vt || (wall ? R.tex.wall : R.tex.crate), ts: vt ? [.25, .5] : (wall ? [.22, .22] : [.45, .45]), col: wall ? [1, 1, 1] : [1.05, 1.05, 1], spec: .12 }); }
    if (S.hl) prop(BOX, m4.trs(S.hl.x - .08, S.hl.y - .08, .02, null, S.hl.w + .16, S.hl.h + .16, .05), { mode: 2, col: [1, .82, .2], spec: 0, em: .9, noShadowCast: true }); // terreno seleccionado (editor de mapa)
    (S.marks || []).forEach(m => { const pc = m.p ? [.9, .3, .25] : [.25, .55, .95];
      if (m.k === 'm' && putScn('eq:mine', m.x, m.y, 0, 1.0)) { prop(CYL, m4.trs(m.x, m.y, 0, null, .55, .55, .02), { mode: 2, col: pc, spec: .3, em: .4 }); return; }
      if (m.k === 's' && putScn('eq:smoke', m.x, m.y, 0, 2.0)) { for (const [dx, dy, r, h] of [[.35, .1, .45, 1.1], [-.3, -.2, .5, 1.4], [.05, .35, .4, 1.8]]) prop(CYL, m4.trs(m.x + dx, m.y + dy, 0, null, r, r, h), { mode: 2, col: [.72, .74, .78], spec: .05 }); return; }
      if (m.k === 'c') { if (!putScn('eq:comms', m.x, m.y, .3, .8)) prop(CYL, m4.trs(m.x, m.y, 0, null, .35, .35, .5), { mode: 2, col: [.3, .3, .32], spec: .4 }); prop(CYL, m4.trs(m.x, m.y, 0, null, .6, .6, .02), { mode: 2, col: pc, spec: .3, em: .4 }); return; }
      if (m.k !== 'm' && m.k !== 's' && putScn('eq:ammo', m.x, m.y, .4, 1.3)) { prop(CYL, m4.trs(m.x, m.y, 0, null, .7, .7, .02), { mode: 2, col: pc, spec: .3, em: .4 }); return; }
      if (m.k === 's') { for (const [dx, dy, r, h] of [[0, 0, .9, .12], [.35, .1, .45, 1.1], [-.3, -.2, .5, 1.4], [.05, .35, .4, 1.8]]) prop(CYL, m4.trs(m.x + dx, m.y + dy, 0, null, r, r, h), { mode: 2, col: [.72, .74, .78], spec: .05 }); }
      else if (m.k === 'm') { prop(CYL, m4.trs(m.x, m.y, 0, null, .32, .32, .08), { mode: 2, col: [.12, .12, .14], spec: .4 }); prop(CYL, m4.trs(m.x, m.y, .08, null, .12, .12, .05), { mode: 2, col: pc, spec: .5, em: .5 }); }
      else { prop(CYL, m4.trs(m.x, m.y, 0, null, .42, .42, .3), { mode: 2, col: [.42, .35, .16], spec: .2 }); prop(CYL, m4.trs(m.x, m.y, .3, null, .3, .3, .06), { mode: 2, col: pc, spec: .5, em: .4 }); } });
    { const lm = R.ensure('eq:ladder'); if (lm) for (const l of (S.ladders || [])) { const kk = lm.s * ((l.z + .5) / lm.bb[1]); minis.push({ m: lm, M: m4.trs(l.x, l.y, 0, mulR(Rzm(l.yaw + Math.PI / 2), [1, 0, 0, 0, 0, 1, 0, 1, 0]), kk, kk, kk), o: { col: [1, 1, 1], sc: 1 }, kk }); } } // escaleras
    const objM = R.ensure('eq:obj'); // ficha de objetivo de la mesa KT24 (marcador de 40 mm con su zona de control)
    if (objM) { S.objs.forEach(ob => { const c = ob.col, sc = 3.68 / Math.max(objM.bb[0], objM.bb[2]), kk = objM.s * sc; minis.push({ m: objM, M: m4.trs(ob.x, ob.y, .03, mulR(Rzm(0), [1, 0, 0, 0, 0, 1, 0, 1, 0]), kk, kk, kk), o: { col: [1, 1, 1], sc: 1 }, kk }); prop(CYL, m4.trs(ob.x, ob.y, .04, null, .22, .22, .3), { mode: 2, col: c, spec: .6, em: .6 }); }); }
    else S.objs.forEach(ob => { const c = ob.col; prop(CYL, m4.trs(ob.x, ob.y, 0, null, .55, .55, .12), { mode: 2, col: [c[0] * .5, c[1] * .5, c[2] * .5], spec: .3 }); prop(CYL, m4.trs(ob.x, ob.y, .12, null, .38, .38, .5), { mode: 2, col: c, spec: .6, em: .35 }); prop(CYL, m4.trs(ob.x, ob.y, .62, null, .2, .2, .1), { mode: 2, col: [c[0] * 1.1, c[1] * 1.1, c[2] * 1.1], spec: .8, em: .5 }); });
    for (const t of S.tokens || []) prop(CYL, m4.trs(t.x, t.y, 0, null, .4, .4, .09), { mode: 2, col: t.col, spec: .5 });
    for (const d of S.dice || []) prop(R.DIE, m4.trs(d.x, d.y, d.z, d.R, .9, .9, .9), { mode: 0, tex: R.tex.dice, spec: .45, die: true });
    const figure = (o, z0) => { // ficha original: silueta de primitivas según el tipo (sin modelo propio)
      const c = Math.cos(o.yaw), sn = Math.sin(o.yaw), zb = .15 + z0, k = o.dim ? .55 : 1, col = o.col.map(v => v * k), dk = col.map(v => v * .5), lt = col.map(v => Math.min(1, v * 1.1 + .12)), gr = [.2 * k, .21 * k, .24 * k], R3 = Rzm(o.yaw), em = o.glow ? .25 : 0;
      const box = (lx, ly, lz, sx, sy, sz, cc, e) => { const x0 = lx - sx / 2, y0 = ly - sy / 2; prop(BOX, m4.trs(o.x + x0 * c - y0 * sn, o.y + x0 * sn + y0 * c, zb + lz, R3, sx, sy, sz), { mode: 2, col: cc, spec: .35, em: e || 0 }); };
      const cyl = (lx, ly, lz, r, h, cc, e) => prop(CYL, m4.trs(o.x + lx * c - ly * sn, o.y + lx * sn + ly * c, zb + lz, null, r, r, h), { mode: 2, col: cc, spec: .4, em: e || 0 });
      const kind = o.kind || 'shooter', big = kind === 'heavy';
      cyl(0, 0, 0, big ? .44 : .36, big ? 1.0 : .9, dk, em); box(0, 0, big ? .62 : .55, .3, big ? 1.0 : .82, .32, col, em); cyl(0, 0, big ? 1.0 : .92, .21, .24, lt, em);
      if (kind === 'shooter') { box(.5, .24, .6, .95, .1, .1, gr); box(.1, .3, .55, .22, .1, .22, dk); }
      else if (kind === 'heavy') { box(.62, .3, .72, 1.3, .2, .2, gr); box(-.38, 0, .45, .28, .6, .6, dk); box(.2, .34, .62, .3, .12, .3, dk); }
      else if (kind === 'melee') { box(.55, -.34, .62, .95, .07, .16, [.82 * k, .84 * k, .88 * k]); box(.25, .36, .55, .4, .16, .16, dk); box(.1, -.34, .55, .22, .14, .22, dk); }
      else if (kind === 'leader') { box(-.3, 0, .32, .08, .78, .75, lt); cyl(0, 0, 1.14, .07, .32, [1 * k, .82 * k, .25 * k], .3); box(.35, .26, .6, .5, .08, .1, gr); }
      else { box(-.34, 0, .38, .3, .56, .62, [.55 * k, .6 * k, .66 * k]); cyl(-.38, .18, 1.0, .03, .6, lt); box(.3, .3, .58, .3, .1, .14, dk); }
    };
    const dtr = new Set();
    for (const o of S.ops) {
      if (!o.alive) continue; const z0 = o.z0 || 0; const key = o.mesh, m = key ? R.ensure(key) : null; const rad = E.RAD;
      prop(CYL, m4.trs(o.x, o.y, z0, null, rad, rad, .1), { mode: 2, col: o.dim ? [.2, .2, .22] : [.07, .08, .1], spec: .3 });
      prop(CYL, m4.trs(o.x, o.y, .1 + z0, null, rad * .93, rad * .93, .05), { mode: 2, col: o.glow ? o.col.map(v => Math.min(1, v * 1.25 + .1)) : o.col, spec: .4, em: o.glow ? .95 : .12 });
      if (o.order === 'conceal') prop(CYL, m4.trs(o.x, o.y, .15 + z0, null, rad * .5, rad * .5, .02), { mode: 2, col: [.7, .75, .8] });
      if (m) { const sc = o.h ? o.h / m.bb[1] : 1; const k = m.s * sc; const wMax = Math.max(m.bb[0], m.bb[2]) * sc, shrink = wMax > 1.5 ? 1.5 / wMax : 1; const kk = k * shrink; const R3 = Rzm(o.yaw - Math.PI / 2); const sw = [1, 0, 0, 0, 0, 1, 0, 1, 0]; const RR = mulR(R3, sw); minis.push({ m, M: m4.trs(o.x, o.y, .15 + z0, RR, kk, kk, kk), o, kk }); }
      else if (!(key && R.index && R.index[key])) figure(o, z0);
      else R.dirty = true;
    }
    // ---- pasada de sombras
    gl.disable(gl.BLEND);
    if (R.shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SH, SH); gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(PD);
      for (const p of props) { if (p.noShadowCast) continue; disableAttrs(); bindProp(p.g, PD); gl.uniformMatrix4fv(PD.u.uMVP, false, m4.mul(LVP, p.M)); gl.uniform1f(PD.u.uK, 1); gl.drawElements(gl.TRIANGLES, p.g.n, gl.UNSIGNED_SHORT, 0); }
      for (const q of minis) { if (q.o.sc && !R.getTex(q.m.tex)) continue; disableAttrs(); bindMesh(q.m, PD); gl.uniformMatrix4fv(PD.u.uMVP, false, m4.mul(LVP, q.M)); gl.uniform1f(PD.u.uK, 1); gl.drawElements(gl.TRIANGLES, q.m.n, gl.UNSIGNED_SHORT, 0); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // ---- pasada principal
    gl.viewport(0, 0, W, H); gl.clearColor(.055, .07, .095, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(PP); gl.uniformMatrix4fv(PP.u.uVP, false, VP); gl.uniformMatrix4fv(PP.u.uLVP, false, LVP); gl.uniform3fv(PP.u.uL, LIGHT); gl.uniform3fv(PP.u.uEye, [eye.x, eye.y, eye.z]); gl.uniform1f(PP.u.uShOn, R.shadows ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shTex || null); gl.uniform1i(PP.u.uSh, 1); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(PP.u.uTex, 0);
    for (const p of props) { disableAttrs(); bindProp(p.g, PP); gl.uniformMatrix4fv(PP.u.uModel, false, p.M); gl.uniform1i(PP.u.uMode, p.mode); gl.uniform3fv(PP.u.uCol, p.col || [1, 1, 1]); gl.uniform2fv(PP.u.uTS, p.ts || [1, 1]); gl.uniform1f(PP.u.uEm, p.em || 0); gl.uniform1f(PP.u.uSpec, p.spec || 0); gl.uniform1f(PP.u.uAlpha, 1); gl.uniform2fv(PP.u.uTO, p.to || [0, 0]); gl.uniform1f(PP.u.uCut, p.cut ? 1 : 0); gl.uniform1f(PP.u.uDet, p.det ? 1 : 0); gl.uniform1f(PP.u.uTOy, p.to2 != null ? p.to2 : (p.to ? p.to[0] : 0)); if (p.tex) { gl.bindTexture(gl.TEXTURE_2D, p.tex); } gl.drawElements(gl.TRIANGLES, p.g.n, gl.UNSIGNED_SHORT, 0); }
    gl.useProgram(PM); gl.uniformMatrix4fv(PM.u.uVP, false, VP); gl.uniformMatrix4fv(PM.u.uLVP, false, LVP); gl.uniform3fv(PM.u.uL, LIGHT); gl.uniform3fv(PM.u.uEye, [eye.x, eye.y, eye.z]); gl.uniform1f(PM.u.uShOn, R.shadows ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shTex || null); gl.uniform1i(PM.u.uSh, 1); gl.activeTexture(gl.TEXTURE0);
    for (const q of minis) { if (q.o.sc && !R.getTex(q.m.tex)) continue; disableAttrs(); bindMesh(q.m, PM); gl.uniformMatrix4fv(PM.u.uModel, false, q.M); gl.uniform1f(PM.u.uHinv, q.m.hinv); gl.uniform3fv(PM.u.uTeam, q.o.col); gl.uniform1f(PM.u.uDim, q.o.dim ? 1 : 0); gl.uniform1f(PM.u.uHurt, q.o.hurt ? 1 : 0); const tx = R.getTex(q.m.tex); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx || null); gl.uniform1i(PM.u.uTexM, 0); gl.uniform1f(PM.u.uUseTex, tx ? 1 : 0); gl.uniform1f(PM.u.uGlow, 0); /* al seleccionar solo se ilumina la base, no la miniatura */ gl.drawElements(gl.TRIANGLES, q.m.n, gl.UNSIGNED_SHORT, 0); }
  };
  let gCv = null; R.setGround = c => { /* suelo: se remuestrea a potencia de 2 para tener mipmaps y filtrado anisotrópico (el suelo es lo que más se ve inclinado) */
    gl.bindTexture(gl.TEXTURE_2D, R.tex.ground); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); let src = c;
    if (!(isPot(c.width) && isPot(c.height))) { try { if (!gCv) gCv = document.createElement('canvas'); const W2 = np2(c.width), H2 = np2(c.height); if (gCv.width !== W2 || gCv.height !== H2) { gCv.width = W2; gCv.height = H2; } const x = gCv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, W2, H2); src = gCv; } catch (e) { src = c; } }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (isPot(src.width) && isPot(src.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); if (ANI) gl.texParameterf(gl.TEXTURE_2D, ANI.e.TEXTURE_MAX_ANISOTROPY_EXT, ANI.n); } };
  R.ok = true; return R;
}
function mulR(A, B) { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; }

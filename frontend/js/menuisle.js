// Островок с котом в меню — живая картинка (canvas, WebGL): menu-isle.webp натянута на мелкую сетку, вершины
// сдвигаются в вершинном шейдере. Кот смотрит на курсор: лицо смещается внутри контура головы (голова «поворачивается»),
// глаза — внутри глазниц, голова чуть клонится к курсору вокруг шеи, корпус подаётся следом; лапы стоят, меч — жёсткий.
// Кот дышит, плащ колышется, знамёна, вымпелы и красный флажок развеваются (с тенью волны). Блок целиком не двигается.
// Координаты — пиксели макета (12.png): островок на нём — 404…996 × 208…760, картинка — вдвое крупнее
import { clamp } from './util.js';

var X0 = 404, Y0 = 208, W = 593, H = 553, STEP = 3; // шаг сетки — 3 px макета

// кот (контур с клинком и плащом), клинок — жёсткий; полотнища: вид 1 — висит (top — где закреплено, edge — у древка),
// 2 и 3 — вбок от древка вправо и влево (from — древко, len — до конца)
var CAT = [[626, 212], [638, 212], [644, 255], [642, 271], [655, 279], [668, 289], [677, 293], [690, 291], [705, 288], [722, 288], [736, 284],
  [750, 276], [762, 271], [771, 271], [776, 282], [779, 300], [783, 315], [787, 330], [791, 356], [787, 376], [776, 388], [763, 396], [761, 405],
  [779, 416], [800, 424], [820, 432], [835, 440], [848, 450], [858, 461], [866, 471], [867, 481], [860, 491], [851, 500], [848, 512], [760, 522],
  [640, 524], [631, 505], [632, 480], [633, 462], [629, 440], [620, 428], [616, 410], [606, 404], [605, 388], [616, 384], [614, 365], [617, 350],
  [622, 339], [625, 300], [622, 250], [622, 212]];
var BLADE = [[624, 206], [642, 206], [651, 300], [657, 388], [631, 391], [625, 300]];
var CLOTH = [
  { poly: [[503, 283], [573, 283], [573, 398], [560, 410], [546, 428], [533, 428], [522, 417], [505, 405]], kind: 1, top: 286, len: 142, edge: [562, 570], seed: 0 }, // левое знамя (древко справа)
  { poly: [[826, 284], [891, 284], [891, 400], [872, 420], [862, 425], [858, 431], [846, 431], [840, 418], [830, 414], [826, 400]], kind: 1, top: 286, len: 145, edge: [836, 828], seed: 2.1 }, // правое (древко слева)
  { poly: [[506, 228], [567, 226], [568, 255], [511, 251]], kind: 3, from: 566, len: -58, seed: 1.2 }, // вымпел слева (крепится справа)
  { poly: [[831, 229], [879, 228], [881, 257], [832, 257]], kind: 2, from: 834, len: 45, seed: 3.3 }, // вымпел справа
  { poly: [[893, 409], [959, 413], [959, 453], [893, 456]], kind: 2, from: 895, len: 62, seed: 0.6 } // красный флажок
];
var HEAD = [703, 345, 78, 62], TILT = [703, 320, 110, 100], EYES = [[675, 352], [730, 352]], EYE_R = 16;

function inPoly(p, x, y) {
  var c = false;
  for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}

// расстояние до контура со знаком (внутри > 0)
function sdPoly(p, x, y) {
  var d = 1e9;
  for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
    var ax = p[j][0], ay = p[j][1], bx = p[i][0] - ax, by = p[i][1] - ay, t = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by), 0, 1);
    var dx = x - ax - bx * t, dy = y - ay - by * t;
    d = Math.min(d, dx * dx + dy * dy);
  }
  d = Math.sqrt(d);
  return inPoly(p, x, y) ? d : -d;
}

function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

var VS = [
  'attribute vec2 aPos; attribute vec4 aW; attribute vec4 aC; attribute float aEye;',
  'uniform vec2 uLook; uniform float uT; uniform vec2 uSize;',
  'varying vec2 vUv; varying float vShade;',
  'void main() {',
  '  vec2 p = aPos, d = vec2(0.0);',
  '  d += aW.x * uLook * vec2(3.5, 2.3);', // лицо — к курсору внутри контура головы (чуть-чуть)
  '  d += aEye * uLook * vec2(1.6, 1.3);', // глаза
  '  float a = (uLook.x * 0.025 + sin(uT * 0.7) * 0.008) * aW.y;', // голова клонится вокруг шеи
  '  vec2 r = p - vec2(299.0, 202.0);',
  '  d += vec2(cos(a) * r.x - sin(a) * r.y, sin(a) * r.x + cos(a) * r.y) - r;',
  '  d.x += aW.z * uLook.x * 1.6;', // корпус подаётся к курсору
  '  d.y -= aW.w * (0.5 + 0.5 * sin(uT * 2.3)) * 1.1;', // дыхание
  '  d += aC.x * vec2(sin(uT * 1.7) * 1.8, sin(uT * 1.7 + 0.8) * 1.0);', // плащ
  '  float s = 0.0;',
  '  if (aC.z > 0.5 && aC.z < 1.5) {', // знамя висит: волна идёт вниз, низ ходит из стороны в сторону
  '    float ph = uT * 1.9 + p.y * 0.045 + aC.w;',
  '    d.x += aC.y * (3.2 * sin(ph) + sin(uT * 3.1 + p.x * 0.09 + p.y * 0.02));',
  '    d.y += aC.y * 0.8 * sin(ph * 1.3);',
  '    s = aC.y * cos(ph) * 0.09;',
  '  } else if (aC.z > 1.5) {', // вымпел и флажок: волна бежит от древка к концу
  '    float ph = uT * 3.2 - (aC.z > 2.5 ? -1.0 : 1.0) * p.x * 0.11 + aC.w;',
  '    d.y += aC.y * 3.0 * sin(ph);',
  '    d.x += aC.y * 0.6 * (cos(ph) - 1.0);',
  '    s = aC.y * cos(ph) * 0.1;',
  '  }',
  '  vUv = p / uSize; vShade = s;',
  '  vec2 q = (p + d) / uSize;',
  '  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);',
  '}'
].join('\n');

var FS = [
  'precision mediump float;',
  'uniform sampler2D uTex; varying vec2 vUv; varying float vShade;',
  'void main() {',
  '  vec4 c = texture2D(uTex, vUv);', // цвет уже умножен на прозрачность
  '  gl_FragColor = vec4(min(c.rgb * (1.0 + vShade), vec3(c.a)), c.a);',
  '}'
].join('\n');

// веса вершин: лицо, наклон головы, корпус, дыхание | плащ, размах полотнища, его вид, фаза | глаза
function buildMesh() {
  var nx = Math.ceil(W / STEP) + 1, ny = Math.ceil(H / STEP) + 1, n = nx * ny;
  var pos = new Float32Array(n * 2), w = new Float32Array(n * 4), c = new Float32Array(n * 4), eye = new Float32Array(n), idx = [];
  for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
    var k = j * nx + i, lx = Math.min(W, i * STEP), ly = Math.min(H, j * STEP), x = lx + X0, y = ly + Y0;
    pos[k * 2] = lx;
    pos[k * 2 + 1] = ly;
    var blade = sstep(-2, 3, sdPoly(BLADE, x, y)), cat = sstep(-3, 5, sdPoly(CAT, x, y));
    var e = Math.pow((x - HEAD[0]) / HEAD[2], 2) + Math.pow((y - HEAD[1]) / HEAD[3], 2);
    w[k * 4] = e < 1 ? (1 - e) * (1 - e) * (1 - blade) : 0;
    var et = Math.pow((x - TILT[0]) / TILT[2], 2) + Math.pow((y - TILT[1]) / TILT[3], 2);
    w[k * 4 + 1] = (1 - sstep(392, 425, y)) * (1 - sstep(0.75, 1, et)) * (1 - blade);
    w[k * 4 + 2] = cat * (1 - sstep(468, 505, y));
    w[k * 4 + 3] = cat * clamp((505 - y) / 220, 0, 1);
    c[k * 4] = cat * sstep(775, 845, x) * sstep(395, 412, y) * (1 - sstep(470, 500, y));
    EYES.forEach(function (o) {
      var r = ((x - o[0]) * (x - o[0]) + (y - o[1]) * (y - o[1])) / (EYE_R * EYE_R);
      if (r < 1) eye[k] = Math.max(eye[k], (1 - r) * (1 - r));
    });
    for (var q = 0; q < CLOTH.length; q++) {
      var f = CLOTH[q], m = sstep(-1.5, 1.5, sdPoly(f.poly, x, y));
      if (m <= 0) continue;
      var amp;
      if (f.kind === 1) amp = Math.pow(clamp((y - f.top) / f.len, 0, 1), 1.2) * sstep(f.edge[1], f.edge[0], x); // у древка — закреплено
      else amp = Math.pow(clamp((x - f.from) / f.len, 0, 1), 1.15);
      c[k * 4 + 1] = amp * m;
      c[k * 4 + 2] = f.kind;
      c[k * 4 + 3] = f.seed;
      break;
    }
    if (i < nx - 1 && j < ny - 1) idx.push(k, k + 1, k + nx, k + nx, k + 1, k + nx + 1);
  }
  return { pos: pos, w: w, c: c, eye: eye, idx: n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}

function shader(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// canvas — элемент на месте островка; src — картинка. Без WebGL — статичная картинка фоном (ok = false)
export function createMenuIsle(canvas, src) {
  var api = { ok: false, draw: function () {} };
  var opts = { alpha: true, premultipliedAlpha: true, antialias: true };
  var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts), gl2 = !!(gl && window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext);
  var fallback = function () { api.ok = false; canvas.style.backgroundImage = 'url(' + src + ')'; };
  if (!gl) { fallback(); return api; }
  var mesh = buildMesh(), prog, loc = {}, tex = null, nIdx = mesh.idx.length;
  if (!gl2 && mesh.idx instanceof Uint32Array && !gl.getExtension('OES_element_index_uint')) { fallback(); return api; }
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { fallback(); return api; }
  gl.useProgram(prog);
  [['aPos', mesh.pos, 2], ['aW', mesh.w, 4], ['aC', mesh.c, 4], ['aEye', mesh.eye, 1]].forEach(function (a) {
    var b = gl.createBuffer(), l = gl.getAttribLocation(prog, a[0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, a[1], gl.STATIC_DRAW);
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, a[2], gl.FLOAT, false, 0, 0);
  });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  ['uLook', 'uT', 'uSize', 'uTex'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
  gl.uniform2f(loc.uSize, W, H);
  gl.uniform1i(loc.uTex, 0);

  var img = new Image();
  img.onload = function () {
    var source = img;
    if (!gl2) { // WebGL 1: мип-уровни только у сторон степени двойки
      source = document.createElement('canvas');
      source.width = source.height = 1024;
      source.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
    }
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    api.ok = true;
  };
  img.onerror = fallback;
  img.src = src;
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fallback(); });

  // кадр: t — время, lx, ly — куда смотрит кот (−1…1)
  api.draw = function (t, lx, ly) {
    if (!api.ok) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.uLook, lx, ly);
    gl.uniform1f(loc.uT, t);
    gl.drawElements(gl.TRIANGLES, nIdx, mesh.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  };
  return api;
}

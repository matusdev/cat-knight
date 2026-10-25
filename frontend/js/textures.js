// Текстуры, нарисованные на canvas при запуске: кладка, облака, искры, монеты, стяги, вода, огонь…
import * as THREE from 'three';
var T = THREE;
import { rand, clamp, lerp, prng } from './util.js';

function makeCanvas(w, h, live) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  if (!live) c.getContext('2d', { willReadFrequently: true });
  return c;
}

// Текстура из нарисованного canvas. Canvas хранит прозрачные пиксели чёрными, и при сглаживании на краю
// облака, искры или пера этот чёрный подмешивается — в Safari и WebView Telegram видна тёмная кайма. Поэтому
// картинка переливается в DataTexture, а прозрачным пикселям достаётся цвет соседних непрозрачных («растекание»).
// live — холст, который потом перерисовывается (небо): остаётся CanvasTexture
function toTexture(canvas, opts) {
  opts = opts || {};
  var t = opts.live ? new T.CanvasTexture(canvas) : bledTexture(canvas);
  if (opts.srgb !== false) t.colorSpace = T.SRGBColorSpace;
  if (opts.repeat !== false) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

var maxAniso = 4; // ставит запуск (setAnisotropy) — по возможностям видеокарты
function setAnisotropy(n) { maxAniso = Math.min(4, n); }

function bledTexture(canvas) {
  var w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  var d = new Uint8Array(w * h * 4), filled = new Uint8Array(w * h), next = new Uint8Array(w * h), i, x, y, pass;
  for (y = 0; y < h; y++) { // строки снизу вверх — как у CanvasTexture (flipY)
    d.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  var any = false;
  for (i = 0; i < w * h; i++) if ((filled[i] = d[i * 4 + 3] > 3 ? 1 : 0) === 0) any = true;
  for (pass = 0; any && pass < 8; pass++) { // цвет растекается в прозрачное на 8 пикселей
    any = false;
    next.set(filled);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (filled[i]) continue;
        var r = 0, g = 0, b = 0, n = 0, k;
        if (x > 0 && filled[k = i - 1]) { r += d[k * 4]; g += d[k * 4 + 1]; b += d[k * 4 + 2]; n++; }
        if (x < w - 1 && filled[k = i + 1]) { r += d[k * 4]; g += d[k * 4 + 1]; b += d[k * 4 + 2]; n++; }
        if (y > 0 && filled[k = i - w]) { r += d[k * 4]; g += d[k * 4 + 1]; b += d[k * 4 + 2]; n++; }
        if (y < h - 1 && filled[k = i + w]) { r += d[k * 4]; g += d[k * 4 + 1]; b += d[k * 4 + 2]; n++; }
        if (!n) { any = true; continue; }
        d[i * 4] = r / n;
        d[i * 4 + 1] = g / n;
        d[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    filled.set(next);
  }
  var t = new T.DataTexture(d, w, h);
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgb(c) {
  return 'rgb(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ')';
}

function grain(ctx, w, h, amount) {
  var img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Каменная кладка: ряды камней со сдвигом, бесшовная по обеим осям.
// Возвращает цвет и рельеф для bumpMap (швы утоплены, камни выпуклые).
function paintMasonry(o) {
  var w = o.w, h = o.h, rowH = h / o.rows;
  var color = makeCanvas(w, h), bump = makeCanvas(w, h);
  var cx = color.getContext('2d'), bx = bump.getContext('2d');
  cx.fillStyle = o.mortar;
  cx.fillRect(0, 0, w, h);
  bx.fillStyle = '#2a2a2a';
  bx.fillRect(0, 0, w, h);

  function stone(x, y, sw, look) {
    var r = prng(look.seed), g = o.gap, i;
    var x0 = x + g / 2, y0 = y + g / 2, ww = sw - g, hh = rowH - g, rr = Math.min(ww, hh) * o.round;
    roundRect(cx, x0, y0, ww, hh, rr);
    cx.fillStyle = look.color;
    cx.fill();
    var lg = cx.createLinearGradient(x0, y0, x0 + ww * 0.2, y0 + hh);
    lg.addColorStop(0, 'rgba(255,246,226,.3)');
    lg.addColorStop(0.4, 'rgba(255,246,226,0)');
    lg.addColorStop(1, 'rgba(36,24,12,.32)');
    cx.fillStyle = lg;
    cx.fill();

    cx.save();
    roundRect(cx, x0, y0, ww, hh, rr);
    cx.clip();
    for (i = 0; i < 5; i++) { // пятна и сколы
      cx.fillStyle = r() < 0.5 ? 'rgba(255,250,235,.08)' : 'rgba(40,28,16,.09)';
      cx.beginPath();
      cx.arc(x0 + r() * ww, y0 + r() * hh, (0.1 + r() * 0.25) * hh, 0, Math.PI * 2);
      cx.fill();
    }
    if (look.moss) { // мох — чаще на верхней кромке
      var my = r() < 0.7 ? y0 : y0 + hh;
      for (i = 0; i < 9; i++) {
        cx.fillStyle = r() < 0.5 ? 'rgba(98,128,48,.9)' : 'rgba(134,164,66,.85)';
        cx.beginPath();
        cx.arc(x0 + r() * ww, my + (r() - 0.3) * hh * 0.25, (0.08 + r() * 0.16) * hh, 0, Math.PI * 2);
        cx.fill();
      }
    }
    if (look.crack) {
      cx.strokeStyle = 'rgba(40,28,18,.5)';
      cx.lineWidth = 1.4;
      cx.beginPath();
      var px = x0 + ww * (0.2 + r() * 0.6), py = y0;
      cx.moveTo(px, py);
      for (i = 0; i < 4; i++) {
        px += (r() - 0.5) * ww * 0.25;
        py += hh / 4;
        cx.lineTo(px, py);
      }
      cx.stroke();
    }
    cx.restore();

    roundRect(bx, x0, y0, ww, hh, rr);
    bx.fillStyle = '#909090';
    bx.fill();
    roundRect(bx, x0 + 3, y0 + 3, ww - 6, hh - 6, rr - 3);
    bx.fillStyle = look.bump;
    bx.fill();
  }

  for (var row = 0; row < o.rows; row++) {
    // ширины камней ряда в сумме дают ровно w — ряд замыкается сам на себя
    var widths = [], sum = 0, i;
    while (sum < w - o.len * 0.5) {
      widths.push(o.len * rand(0.7, 1.35));
      sum += widths[widths.length - 1];
    }
    var k = w / sum, x = rand(0, w);
    for (i = 0; i < widths.length; i++) {
      var sw = widths[i] * k, f = rand(1 - o.spread, 1 + o.spread), warm = rand(-8, 8), gv = 200 * rand(0.86, 1.08);
      var look = {
        color: rgb([o.base[0] * f + warm, o.base[1] * f, o.base[2] * f - warm]),
        bump: rgb([gv, gv, gv]),
        moss: Math.random() < o.moss,
        crack: Math.random() < 0.12,
        seed: 1 + (Math.random() * 2e9 | 0)
      };
      stone(x, row * rowH, sw, look);
      if (x + sw > w) stone(x - w, row * rowH, sw, look);
      x += sw;
      if (x >= w) x -= w;
    }
  }
  grain(cx, w, h, o.grain);
  return { map: toTexture(color), bump: toTexture(bump, { srgb: false }) };
}

// доски: волокна вдоль V; трещины и гниль — эти доски не держат
function paintWood() {
  var w = 128, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'), i;
  x.fillStyle = '#8f5d33';
  x.fillRect(0, 0, w, h);
  for (i = 0; i < 70; i++) {
    var px = rand(0, w);
    x.strokeStyle = 'rgba(60,32,14,' + rand(0.1, 0.35).toFixed(2) + ')';
    x.lineWidth = rand(1, 3);
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + rand(-6, 6), h * 0.33, px + rand(-6, 6), h * 0.66, px, h);
    x.stroke();
  }
  for (i = 0; i < 24; i++) {
    var lx = rand(0, w);
    x.strokeStyle = 'rgba(255,210,150,' + rand(0.05, 0.16).toFixed(2) + ')';
    x.lineWidth = rand(2, 5);
    x.beginPath();
    x.moveTo(lx, 0);
    x.lineTo(lx + rand(-4, 4), h);
    x.stroke();
  }
  for (i = 0; i < 6; i++) {
    var cxp = rand(10, w - 10), cy = rand(0, h);
    x.strokeStyle = 'rgba(30,16,6,.75)';
    x.lineWidth = rand(2, 4);
    x.beginPath();
    x.moveTo(cxp, cy);
    for (var k = 0; k < 5; k++) x.lineTo(cxp + rand(-8, 8), cy += rand(10, 26));
    x.stroke();
  }
  for (i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(52,40,20,' + rand(0.25, 0.45).toFixed(2) + ')';
    x.beginPath();
    x.ellipse(rand(0, w), rand(0, h), rand(10, 26), rand(18, 50), 0, 0, Math.PI * 2);
    x.fill();
  }
  grain(x, w, h, 14);
  return toTexture(c);
}

// ящик-батут: рамка, диагональ и жёлтая стрелка «вверх»
function paintCrate() {
  var s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), i;
  for (i = 0; i < 4; i++) {
    x.fillStyle = rgb([158 * rand(0.88, 1.08), 104 * rand(0.88, 1.08), 56]);
    x.fillRect(0, i * s / 4, s, s / 4);
    x.fillStyle = 'rgba(60,30,10,.55)';
    x.fillRect(0, i * s / 4, s, 3);
  }
  x.save();
  x.beginPath();
  x.rect(26, 26, s - 52, s - 52);
  x.clip();
  x.strokeStyle = '#b57c45';
  x.lineWidth = 30;
  x.beginPath();
  x.moveTo(0, s);
  x.lineTo(s, 0);
  x.stroke();
  x.strokeStyle = 'rgba(60,30,10,.5)';
  x.lineWidth = 3;
  x.stroke();
  x.restore();
  x.strokeStyle = '#6b3f1c';
  x.lineWidth = 30;
  x.strokeRect(15, 15, s - 30, s - 30);
  x.strokeStyle = '#b98249';
  x.lineWidth = 22;
  x.strokeRect(15, 15, s - 30, s - 30);
  [[6, 6], [s - 40, 6], [6, s - 40], [s - 40, s - 40]].forEach(function (p) {
    x.fillStyle = '#6f747c';
    x.fillRect(p[0], p[1], 34, 34);
    x.fillStyle = '#3c4046';
    x.beginPath();
    x.arc(p[0] + 17, p[1] + 17, 4, 0, Math.PI * 2);
    x.fill();
  });
  x.beginPath();
  x.moveTo(s / 2, 64);
  x.lineTo(s / 2 + 46, 122);
  x.lineTo(s / 2 + 20, 122);
  x.lineTo(s / 2 + 20, 186);
  x.lineTo(s / 2 - 20, 186);
  x.lineTo(s / 2 - 20, 122);
  x.lineTo(s / 2 - 46, 122);
  x.closePath();
  x.fillStyle = '#ffcc33';
  x.fill();
  x.lineWidth = 7;
  x.strokeStyle = '#6b3f1c';
  x.stroke();
  grain(x, s, s, 16);
  return toTexture(c, { repeat: false });
}

function drawPaw(x, cx, cy, k, color) {
  x.fillStyle = color;
  x.beginPath();
  x.ellipse(cx, cy + 9 * k, 15 * k, 12.5 * k, 0, 0, Math.PI * 2);
  x.fill();
  [[-17, -6, -0.4], [-6.5, -16, -0.15], [6.5, -16, 0.15], [17, -6, 0.4]].forEach(function (t) {
    x.beginPath();
    x.ellipse(cx + t[0] * k, cy + t[1] * k, 6 * k, 7.8 * k, t[2], 0, Math.PI * 2);
    x.fill();
  });
}

// Зерно камня для ближнего плана (накладывается поверх атласа, mat.bridge — stoneDetail): бесшовный шум в
// несколько октав, поры, светлые крапины и волосяные трещины. Серый 0…1, середина — 0.5; плитка 256 пикселей
function paintGrain() {
  var s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), r = prng(9001), img = x.createImageData(s, s), d = img.data, i, j, o;
  var octave = function (n) { // решётка n×n, замкнутая по краям — плитка без шва
    var g = [];
    for (i = 0; i < n * n; i++) g.push(r());
    return function (u, v) {
      var x0 = Math.floor(u * n), y0 = Math.floor(v * n), fx = u * n - x0, fy = v * n - y0, at = function (a, b) { return g[((b % n + n) % n) * n + ((a % n + n) % n)]; };
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
    };
  };
  var O = [[octave(4), 0.35], [octave(9), 0.3], [octave(23), 0.22], [octave(64), 0.13]];
  for (j = 0; j < s; j++) for (i = 0; i < s; i++) {
    var v = 0;
    O.forEach(function (oc) { v += oc[0](i / s, j / s) * oc[1]; });
    o = (j * s + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = clamp(v * 255, 0, 255);
    d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  var dot = function (cx, cy, rad, col) { // с переносом через край — плитка остаётся бесшовной
    [-s, 0, s].forEach(function (dx) { [-s, 0, s].forEach(function (dy) {
      x.fillStyle = col;
      x.beginPath();
      x.arc(cx + dx, cy + dy, rad, 0, Math.PI * 2);
      x.fill();
    }); });
  };
  for (i = 0; i < 420; i++) dot(r() * s, r() * s, 0.6 + r() * 1.6, 'rgba(40,40,40,' + (0.25 + r() * 0.4) + ')'); // поры
  for (i = 0; i < 260; i++) dot(r() * s, r() * s, 0.5 + r() * 1.1, 'rgba(255,255,255,' + (0.2 + r() * 0.35) + ')'); // крапины
  x.lineCap = 'round';
  for (i = 0; i < 9; i++) { // волосяные трещины
    var px = r() * s, py = r() * s, a = r() * Math.PI * 2;
    x.strokeStyle = 'rgba(50,45,40,' + (0.25 + r() * 0.25) + ')';
    x.lineWidth = 0.8 + r() * 0.7;
    x.beginPath();
    x.moveTo(px, py);
    for (j = 0; j < 6; j++) {
      a += (r() - 0.5) * 1.1;
      px += Math.cos(a) * (6 + r() * 10);
      py += Math.sin(a) * (6 + r() * 10);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  return toTexture(c, { srgb: false });
}

function paintCoin() {
  var s = 128, r = s / 2, c = makeCanvas(s, s), x = c.getContext('2d');
  var g = x.createRadialGradient(r * 0.75, r * 0.65, 4, r, r, r);
  g.addColorStop(0, '#fff3a8');
  g.addColorStop(0.5, '#ffc93c');
  g.addColorStop(1, '#cf8612');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  x.strokeStyle = '#c27c0e';
  x.lineWidth = 7;
  x.beginPath();
  x.arc(r, r, r - 11, 0, Math.PI * 2);
  x.stroke();
  drawPaw(x, r + 2, r + 4, 1.45, 'rgba(255,246,190,.9)');
  drawPaw(x, r, r + 2, 1.45, '#b9730c');
  return toTexture(c, { repeat: false });
}

// стяг: бордовое полотнище с золотой каймой, раздвоенный низ и голова кота
function paintBanner() {
  var w = 128, h = 256, c = makeCanvas(w, h), x = c.getContext('2d');
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(w, 0);
  x.lineTo(w, h);
  x.lineTo(w / 2, h * 0.8);
  x.lineTo(0, h);
  x.closePath();
  var g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#761719');
  g.addColorStop(0.5, '#b2292c');
  g.addColorStop(1, '#761719');
  x.fillStyle = g;
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = '#e2b54a';
  x.fillRect(8, 0, 5, h);
  x.fillRect(w - 13, 0, 5, h);
  x.fillRect(0, 10, w, 5);
  var cx = w / 2, cy = h * 0.4;
  x.fillStyle = '#f1dcbf';
  x.beginPath();
  x.moveTo(cx - 30, cy - 4);
  x.lineTo(cx - 26, cy - 40);
  x.lineTo(cx - 8, cy - 22);
  x.lineTo(cx + 8, cy - 22);
  x.lineTo(cx + 26, cy - 40);
  x.lineTo(cx + 30, cy - 4);
  x.closePath();
  x.fill();
  x.beginPath();
  x.ellipse(cx, cy + 4, 31, 26, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#761719';
  x.beginPath();
  x.ellipse(cx - 12, cy + 1, 4, 7, 0, 0, Math.PI * 2);
  x.ellipse(cx + 12, cy + 1, 4, 7, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(cx - 4, cy + 12);
  x.lineTo(cx + 4, cy + 12);
  x.lineTo(cx, cy + 17);
  x.fill();
  x.restore();
  grain(x, w, h, 12);
  return toTexture(c, { repeat: false });
}

// пушистое облако: мягкие круги + тень снизу; кадр 256 × 150 со сдвигом ox (в атласе облака стоят в ряд)
function drawCloud(x, ox, n) {
  var w = 256, h = 150, r = prng(n * 977 + 13);
  x.save();
  x.beginPath();
  x.rect(ox, 0, w, h);
  x.clip();
  x.translate(ox, 0);
  for (var i = 0; i < 14; i++) {
    var t = i / 13, px = w * (0.14 + t * 0.72) + (r() - 0.5) * 20;
    var rr = h * (0.2 + Math.sin(t * Math.PI) * 0.22 + r() * 0.08), py = h * 0.66 - Math.sin(t * Math.PI) * h * 0.14 - r() * 18;
    rr = Math.min(rr, px - 3, w - px - 3, h - py - 3, py - 3); // клуб целиком в своей клетке — иначе клетка срезала бы его прямой линией
    var g = x.createRadialGradient(px, py, rr * 0.45, px, py, rr);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, rr, 0, Math.PI * 2);
    x.fill();
  }
  x.globalCompositeOperation = 'source-atop';
  var sh = x.createLinearGradient(0, h * 0.25, 0, h);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(150,178,214,.65)');
  x.fillStyle = sh;
  x.fillRect(0, 0, w, h);
  x.restore();
}

function paintCloud(n) {
  var c = makeCanvas(256, 150);
  drawCloud(c.getContext('2d'), 0, n);
  return toTexture(c, { repeat: false });
}

// три облака в ряд — для пачки облаков (CloudBatch)
function paintCloudAtlas() {
  var c = makeCanvas(768, 150), x = c.getContext('2d');
  for (var n = 1; n <= 3; n++) drawCloud(x, (n - 1) * 256, n);
  return toTexture(c, { repeat: false });
}

function paintDot() {
  var s = 64, c = makeCanvas(s, s), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return toTexture(c, { srgb: false, repeat: false });
}

function paintSpark() {
  var s = 64, c = makeCanvas(s, s), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 20);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(32, 2);
  x.quadraticCurveTo(35, 29, 62, 32);
  x.quadraticCurveTo(35, 35, 32, 62);
  x.quadraticCurveTo(29, 35, 2, 32);
  x.quadraticCurveTo(29, 29, 32, 2);
  x.fill();
  return toTexture(c, { srgb: false, repeat: false });
}

// мех головы (развёртка сферы): u = 0.25 — затылок (его видно в игре), u = 0.75 — мордочка
function paintFur() {
  var w = 512, h = 256, c = makeCanvas(w, h), x = c.getContext('2d'), i;
  var g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9a7f65');
  g.addColorStop(0.55, '#b99d80');
  g.addColorStop(1, '#e4d3bc');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  var m = x.createRadialGradient(w * 0.75, h * 0.74, 10, w * 0.75, h * 0.74, h * 0.45);
  m.addColorStop(0, 'rgba(245,234,217,1)');
  m.addColorStop(1, 'rgba(245,234,217,0)');
  x.fillStyle = m;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(94,74,57,.78)';
  x.lineCap = 'round';
  for (i = 0; i < 5; i++) {
    var vy = h * (0.15 + i * 0.085), span = w * (0.16 - i * 0.012);
    x.lineWidth = h * (0.034 - i * 0.003);
    x.beginPath();
    x.moveTo(w * 0.25 - span, vy + 10);
    x.quadraticCurveTo(w * 0.25, vy - 9, w * 0.25 + span, vy + 10);
    x.stroke();
  }
  x.lineWidth = h * 0.026;
  for (i = -1; i <= 1; i++) {
    x.beginPath();
    x.moveTo(w * 0.75 + i * w * 0.028, h * 0.08);
    x.lineTo(w * 0.75 + i * w * 0.036, h * 0.3);
    x.stroke();
  }
  for (i = 0; i < 1600; i++) { // ворсинки
    var px = rand(0, w), py = rand(0, h), len = rand(3, 9);
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(255,245,228,.16)' : 'rgba(70,52,38,.14)';
    x.lineWidth = rand(0.8, 1.8);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + rand(-2, 2), py + len);
    x.stroke();
  }
  var t = toTexture(c);
  t.wrapT = T.ClampToEdgeWrapping;
  return t;
}

// свечение лавы в трещинах (emissiveMap огненного острова), бесшовное
function paintLava() {
  var s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), i, k;
  x.fillStyle = '#000';
  x.fillRect(0, 0, s, s);
  x.lineCap = x.lineJoin = 'round';
  for (i = 0; i < 9; i++) {
    var pts = [[rand(0, s), rand(0, s)]];
    for (k = 0; k < 7; k++) pts.push([pts[k][0] + rand(-40, 40), pts[k][1] + rand(-40, 40)]);
    [[14, 'rgba(255,80,10,.25)'], [6, 'rgba(255,130,30,.7)'], [2.2, '#ffe08a']].forEach(function (st) {
      x.lineWidth = st[0];
      x.strokeStyle = st[1];
      for (var ox = -s; ox <= s; ox += s) {
        for (var oy = -s; oy <= s; oy += s) {
          x.beginPath();
          x.moveTo(pts[0][0] + ox, pts[0][1] + oy);
          for (var p = 1; p < pts.length; p++) x.lineTo(pts[p][0] + ox, pts[p][1] + oy);
          x.stroke();
        }
      }
    });
  }
  return toTexture(c);
}

// язык пламени: белое ядро → оранжевый → прозрачный
// шлейф «бешеного» острова: мягкое ядро по высоте и рваные струйки вдоль; по U повторяется без шва
function paintWake() {
  var w = 256, h = 64, c = makeCanvas(w, h), x = c.getContext('2d'), i, k;
  var g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,.62)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  for (i = 0; i < 48; i++) {
    var px = rand(0, w), py = h * rand(0.22, 0.78), rw = rand(14, 70), rh = rand(1.5, 5), a = rand(0.12, 0.42);
    for (k = -1; k <= 1; k++) {
      x.save();
      x.translate(px + k * w, py);
      x.scale(rw / rh, 1);
      var sg = x.createRadialGradient(0, 0, 0, 0, 0, rh);
      sg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sg;
      x.fillRect(-rh, -rh, rh * 2, rh * 2);
      x.restore();
    }
  }
  x.globalCompositeOperation = 'destination-in'; // края ленты всегда гаснут в ноль
  var e = x.createLinearGradient(0, 0, 0, h);
  e.addColorStop(0, 'rgba(0,0,0,0)');
  e.addColorStop(0.3, 'rgba(0,0,0,1)');
  e.addColorStop(0.7, 'rgba(0,0,0,1)');
  e.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = e;
  x.fillRect(0, 0, w, h);
  return toTexture(c, { srgb: false });
}

// смаз клинка поперёк ленты (снизу гарда, сверху остриё): у гарды почти прозрачно — там меч движется
// медленно, к острию гуще; по самой кромке — белый блик, сам смаз — сталь с отсветом неба
function paintSmear() {
  var w = 4, h = 128, c = makeCanvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  for (var y = 0; y < h; y++) {
    // v — от середины клинка (0) к точке за остриём (1): белая кромка, под ней золотое свечение, ниже — сталь
    var v = 1 - y / (h - 1), fall = clamp((1 - v) / 0.05, 0, 1);
    var edge = Math.exp(-Math.pow((v - 0.88) / 0.06, 2)) * fall, glow = 0.6 * Math.exp(-Math.pow((v - 0.7) / 0.16, 2));
    var body = 0.45 * Math.pow(v, 1.4) * fall, sum = body + glow + edge + 1e-4;
    for (var i = 0; i < w; i++) { // сталь чуть темнее неба и светлого камня — след читается на них
      var j = (y * w + i) * 4;
      d[j] = (body * 118 + glow * 255 + edge * 255) / sum;
      d[j + 1] = (body * 140 + glow * 186 + edge * 255) / sum;
      d[j + 2] = (body * 182 + glow * 64 + edge * 250) / sum;
      d[j + 3] = Math.min(1, body + glow + edge * 0.95) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

// струи водопада (прокручиваются по V)
// прозрачность по высоте (alphaMap, зелёный канал): сверху непрозрачно, нижние 45% плавно тают
function paintFade() {
  var c = makeCanvas(4, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fff'); // верх холста — верх плоскости (flipY)
  g.addColorStop(0.55, '#fff');
  g.addColorStop(1, '#000');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  return toTexture(c, { srgb: false, repeat: false });
}

function paintWater() {
  var w = 64, h = 256, c = makeCanvas(w, h), x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(120,200,255,0)');
  g.addColorStop(0.2, 'rgba(140,210,255,.85)');
  g.addColorStop(0.8, 'rgba(140,210,255,.85)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  for (var i = 0; i < 40; i++) {
    var px = rand(6, w - 6), py = rand(0, h), len = rand(30, 90);
    for (var k = -1; k <= 1; k++) {
      x.fillStyle = 'rgba(255,255,255,' + rand(0.3, 0.8).toFixed(2) + ')';
      x.fillRect(px, py + k * h, rand(1, 3), len);
    }
  }
  return toTexture(c);
}

// купол воздушного шара: красно-жёлтые клинья
function paintBalloon() {
  var w = 256, h = 128, c = makeCanvas(w, h), x = c.getContext('2d');
  for (var i = 0; i < 12; i++) {
    x.fillStyle = i % 2 ? '#f6cf4f' : '#e2473c';
    x.fillRect(i * w / 12, 0, w / 12 + 1, h);
  }
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillRect(0, h * 0.62, w, 6);
  x.fillStyle = 'rgba(80,30,20,.35)';
  x.fillRect(0, h * 0.86, w, h * 0.14);
  return toTexture(c);
}

// луна: бледный диск с кратерами и мягким краем
function paintMoon() {
  var s = 128, r = s / 2, c = makeCanvas(s, s), x = c.getContext('2d');
  var g = x.createRadialGradient(r * 0.8, r * 0.75, 4, r, r, r * 0.92);
  g.addColorStop(0, '#fffdf0');
  g.addColorStop(0.85, '#e9e4cf');
  g.addColorStop(1, 'rgba(233,228,207,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(r, r, r * 0.92, 0, Math.PI * 2);
  x.fill();
  [[0.38, 0.4, 0.12], [0.62, 0.58, 0.09], [0.45, 0.7, 0.07], [0.68, 0.32, 0.06]].forEach(function (k) {
    x.fillStyle = 'rgba(160,150,125,.35)';
    x.beginPath();
    x.arc(k[0] * s, k[1] * s, k[2] * s, 0, Math.PI * 2);
    x.fill();
  });
  return toTexture(c, { repeat: false });
}

// одиночный тёсаный камень: пятна, сколы, мох у кромки; к краям темнее — затенение в швах кладки
function paintBlock() {
  var s = 256, c = makeCanvas(s, s), b = makeCanvas(s, s), x = c.getContext('2d'), y = b.getContext('2d'), i;
  x.fillStyle = '#a99d8c';
  x.fillRect(0, 0, s, s);
  y.fillStyle = '#9a9a9a';
  y.fillRect(0, 0, s, s);
  for (i = 0; i < 80; i++) {
    var px = rand(0, s), py = rand(0, s), r = rand(6, 42), light = Math.random() < 0.5, a = rand(0.04, 0.11).toFixed(3);
    x.fillStyle = light ? 'rgba(255,248,232,' + a + ')' : 'rgba(50,38,26,' + a + ')';
    y.fillStyle = light ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)';
    [x, y].forEach(function (k) {
      k.beginPath();
      k.arc(px, py, r, 0, Math.PI * 2);
      k.fill();
    });
  }
  for (i = 0; i < 40; i++) { // выбоины
    var qx = rand(0, s), qy = rand(0, s), qr = rand(1.5, 4);
    x.fillStyle = 'rgba(40,30,20,.35)';
    y.fillStyle = 'rgba(0,0,0,.45)';
    [x, y].forEach(function (k) {
      k.beginPath();
      k.arc(qx, qy, qr, 0, Math.PI * 2);
      k.fill();
    });
  }
  for (i = 0; i < 3; i++) { // трещины
    var cx = rand(20, s - 20), cy = rand(20, s - 20);
    x.strokeStyle = 'rgba(40,28,18,.5)';
    y.strokeStyle = 'rgba(0,0,0,.6)';
    [x, y].forEach(function (k) { k.lineWidth = 1.6; k.beginPath(); k.moveTo(cx, cy); });
    for (var j = 0; j < 5; j++) {
      cx += rand(-22, 22);
      cy += rand(-22, 22);
      x.lineTo(cx, cy);
      y.lineTo(cx, cy);
    }
    x.stroke();
    y.stroke();
  }
  for (i = 0; i < 16; i++) { // мох у одной кромки
    x.fillStyle = Math.random() < 0.5 ? 'rgba(98,128,48,.75)' : 'rgba(134,164,66,.6)';
    x.beginPath();
    x.arc(rand(0, s), rand(0, s * 0.14), rand(5, 16), 0, Math.PI * 2);
    x.fill();
  }
  var g = x.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.74);
  g.addColorStop(0, 'rgba(30,20,12,0)');
  g.addColorStop(1, 'rgba(30,20,12,.4)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  grain(x, s, s, 24);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// «волоски» для меха оболочками: густые точки с мягким краем (чем дальше оболочка, тем тоньше волосок)
function paintStrands() {
  var s = 512, c = makeCanvas(s, s), x = c.getContext('2d'), img = x.createImageData(s, s), d = img.data, i;
  for (i = 3; i < d.length; i += 4) d[i] = 255;
  var put = function (px, py, v) {
    px = (px + s) % s;
    py = (py + s) % s;
    var k = (py * s + px) * 4;
    if (d[k] < v) d[k] = d[k + 1] = d[k + 2] = v;
  };
  for (i = 0; i < 60000; i++) {
    var px = (Math.random() * s) | 0, py = (Math.random() * s) | 0, v = 150 + Math.random() * 105;
    put(px, py, v);
    put(px + 1, py, v * 0.55);
    put(px - 1, py, v * 0.55);
    put(px, py + 1, v * 0.55);
    put(px, py - 1, v * 0.55);
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

// табличка дистанции у дороги — «50 м» белым с тёмной обводкой, как на референсе
function paintLabel(text) {
  var c = makeCanvas(256, 112), x = c.getContext('2d');
  x.font = '900 80px Nunito, "Arial Rounded MT Bold", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 14;
  x.strokeStyle = 'rgba(30,42,84,.85)';
  x.strokeText(text, 128, 60);
  x.fillStyle = '#fff';
  x.fillText(text, 128, 60);
  return toTexture(c, { repeat: false });
}

export { makeCanvas, toTexture, maxAniso, setAnisotropy, bledTexture, roundRect, rgb, grain, paintMasonry, paintWood, paintCrate, drawPaw, paintGrain, paintCoin, paintBanner, drawCloud, paintCloud, paintCloudAtlas, paintDot, paintSpark, paintFur, paintLava, paintWake, paintSmear, paintFade, paintWater, paintBalloon, paintMoon, paintBlock, paintStrands, paintLabel };

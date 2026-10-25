// Нарезка лавки из макета (_not_main/refcut/shop-mockup.png, 1785×881, без рамки):
//  — небо без островка и без панели (в превью; shop-sky.jpg игры — из чистого неба, refcut/sky.cjs); островок с шатром, хоругвями, фонарями, реквизитом и постаментом —
//    отдельным слоем (shop-isle.webp), нарисованного кота на нём нет: выше стола за ним — небо (просвет шатра), ниже —
//    заливка (её закрывает 3D-кот игры);
//  — панель: рамка с чистым пергаментом, кнопка «назад», кошелёк, активная вкладка, строка, цена с монетой, «надето»,
//    значок раздела, линия, блик образца (shop-*.webp) — текст стёрт; неактивная вкладка и полоса вкладок — CSS.
// Всё вдвое крупнее (Ланцош-3). Из _not_main: node refcut/shopcut.cjs refcut/shop-mockup.png ../public/img <папка превью>
// (в консоль — meta: места деталей на макете — по ним стоят размеры в _game.scss)
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const [SRC, OUT, PREV] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('console', m => console.log('page:', m.text()));
  const res = await p.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const W = img.width, H = img.height, c0 = document.createElement('canvas');
    c0.width = W; c0.height = H;
    const x0 = c0.getContext('2d');
    x0.drawImage(img, 0, 0);
    const full = x0.getImageData(0, 0, W, H).data;
    const mk = (w, h) => ({ w, h, d: new Float32Array(w * h * 4) });
    const orig = mk(W, H);
    for (let i = 0; i < W * H * 4; i++) orig.d[i] = full[i];
    const X = (x) => x, Y = (y) => y;
    const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
    const clone = (im) => ({ w: im.w, h: im.h, d: new Float32Array(im.d) });
    // гладкая заливка по маске (уравнение Лапласа на пирамиде) — rgb
    const membrane = (im, mask) => {
      const w0 = im.w, h0 = im.h, val = new Float32Array(w0 * h0 * 3);
      for (let i = 0; i < w0 * h0; i++) for (let k = 0; k < 3; k++) val[i * 3 + k] = im.d[i * 4 + k];
      const solve = (V, M, w, h, iters) => {
        for (let it = 0; it < iters; it++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!M[i]) continue;
          for (let k = 0; k < 3; k++) {
            let s = 0, n = 0;
            if (x > 0) { s += V[(i - 1) * 3 + k]; n++; }
            if (x < w - 1) { s += V[(i + 1) * 3 + k]; n++; }
            if (y > 0) { s += V[(i - w) * 3 + k]; n++; }
            if (y < h - 1) { s += V[(i + w) * 3 + k]; n++; }
            V[i * 3 + k] = s / n;
          }
        }
      };
      const levels = [{ V: val, M: mask, w: w0, h: h0 }];
      while (levels[levels.length - 1].w > 24 && levels[levels.length - 1].h > 24) {
        const P = levels[levels.length - 1], w = Math.ceil(P.w / 2), h = Math.ceil(P.h / 2), V = new Float32Array(w * h * 3), M = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let n = 0; const s = [0, 0, 0];
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const xx = Math.min(P.w - 1, x * 2 + dx), yy = Math.min(P.h - 1, y * 2 + dy), j = yy * P.w + xx;
            if (P.M[j]) continue;
            for (let k = 0; k < 3; k++) s[k] += P.V[j * 3 + k];
            n++;
          }
          const i = y * w + x;
          if (n) for (let k = 0; k < 3; k++) V[i * 3 + k] = s[k] / n; else M[i] = 1;
        }
        levels.push({ V, M, w, h });
      }
      for (let lv = levels.length - 1; lv >= 0; lv--) {
        const P = levels[lv];
        if (lv < levels.length - 1) {
          const C = levels[lv + 1];
          for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
            const i = y * P.w + x;
            if (!P.M[i]) continue;
            const j = Math.min(C.h - 1, y >> 1) * C.w + Math.min(C.w - 1, x >> 1);
            for (let k = 0; k < 3; k++) P.V[i * 3 + k] = C.V[j * 3 + k];
          }
        }
        solve(P.V, P.M, P.w, P.h, lv === levels.length - 1 ? 300 : 50);
      }
      let seed = 3;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < w0 * h0; i++) if (mask[i]) for (let k = 0; k < 3; k++) im.d[i * 4 + k] = val[i * 3 + k] + (rnd() - 0.5) * 2.5;
    };
    const rectMask = (w, h, rects) => {
      const m = new Uint8Array(w * h);
      rects.forEach(([a, b2, c, d]) => { for (let y = Math.max(0, b2); y <= Math.min(h - 1, d); y++) for (let x = Math.max(0, a); x <= Math.min(w - 1, c); x++) m[y * w + x] = 1; });
      return m;
    };
    const inPoly = (pts, x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const rr = (x1, y1, x2, y2, r) => (x, y) => {
      if (x < x1 || x > x2 || y < y1 || y > y2) return false;
      const cx = Math.min(Math.max(x, x1 + r), x2 - r), cy = Math.min(Math.max(y, y1 + r), y2 - r);
      return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    };
    const circ = (cx, cy, r) => (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    const poly = (pts) => (x, y) => inPoly(pts, x, y);
    const any = (...fs) => (x, y) => fs.some(f => f(x, y));
    // ---------- 3. детали интерфейса ----------
    // кусок прямоугольника (исходные координаты), прозрачность — по разнице с чистым фоном
    const cut = (x1, y1, x2, y2) => {
      const w = x2 - x1 + 1, h = y2 - y1 + 1, im = mk(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const s = ((Y(y1) + y) * W + X(x1) + x) * 4, t = (y * w + x) * 4;
        let diff = 0;
        for (let k = 0; k < 3; k++) { im.d[t + k] = orig.d[s + k]; diff += Math.abs(orig.d[s + k] - clean.d[s + k]); }
        im.d[t + 3] = 255 * clamp01((diff - 24) / 40);
      }
      im.x1 = x1; im.y1 = y1;
      return im;
    };
    // стереть надпись: каждая строка прямоугольника — медиана этой строки в чистых промежутках (плашка ровная по горизонтали)
    const eraseRows = (im, [a, b2, c, d], spans) => {
      for (let y = b2; y <= d; y++) {
        const yy = y - im.y1, vals = [[], [], []];
        spans.forEach(([s1, s2]) => { for (let x = s1; x <= s2; x++) for (let k = 0; k < 3; k++) vals[k].push(im.d[(yy * im.w + x - im.x1) * 4 + k]); });
        const med = vals.map(v => { v.sort((p, q) => p - q); return v[v.length >> 1]; });
        for (let x = a; x <= c; x++) { const t = (yy * im.w + x - im.x1) * 4; for (let k = 0; k < 3; k++) im.d[t + k] = med[k]; im.d[t + 3] = 255; }
      }
    };
    // стереть надпись по столбцам: каждый столбец — от цвета над надписью к цвету под ней (плашка с градиентом и сверху вниз,
    // и вдоль — «Играть» светлее к острию)
    const eraseCols = (im, [a, b2, c, d]) => {
      for (let x = a; x <= c; x++) {
        const px = (y) => (y - im.y1) * im.w + x - im.x1, top = [0, 0, 0], bot = [0, 0, 0];
        for (let k = 0; k < 3; k++) { top[k] = (im.d[px(b2 - 1) * 4 + k] + im.d[px(b2 - 2) * 4 + k]) / 2; bot[k] = (im.d[px(d + 1) * 4 + k] + im.d[px(d + 2) * 4 + k]) / 2; }
        for (let y = b2; y <= d; y++) { const t = (y - b2 + 1) / (d - b2 + 2), i = px(y) * 4; for (let k = 0; k < 3; k++) im.d[i + k] = top[k] + (bot[k] - top[k]) * t; im.d[i + 3] = 255; }
      }
    };
    // стереть гладкой заливкой (внутренность карточки, содержимое плашки прогресса)
    const eraseSmooth = (im, rects) => membrane(im, rectMask(im.w, im.h, rects.map(([a, b2, c, d]) => [a - im.x1, b2 - im.y1, c - im.x1, d - im.y1])));

    // прозрачность плашки — покрытие формой (края замерены, сглаживание 4×4); цвет края — без примеси фона B под плашкой
    // (залитое небо: наблюдаемое = a·плашка + (1 − a)·фон). Без B (плашка лежит на другой плашке) — цвет как есть
    const mat = (im, f, B) => {
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (f(im.x1 + x + (sx + 0.5) / 4 - 0.5, im.y1 + y + (sy + 0.5) / 4 - 0.5)) n++;
        const a = n / 16, t = (y * im.w + x) * 4;
        if (B && a > 0 && a < 1) {
          const s = (Y(im.y1 + y) * W + X(im.x1 + x)) * 4;
          for (let k = 0; k < 3; k++) im.d[t + k] = Math.max(0, Math.min(255, (im.d[t + k] - (1 - a) * B.d[s + k]) / Math.max(a, 0.35)));
        }
        im.d[t + 3] = 255 * a;
      }
    };
    const plate = (x1, y1, x2, y2, f, B) => { const im = cut(x1, y1, x2, y2); mat(im, f, B); return im; };

    // ---------- 1. островок лавки: шатёр, хоругви, фонари, реквизит, постамент с ковром, скала; нарисованного кота нет ----------
    // контур островка (с запасом), ядро — непрозрачное (постамент, скала, трава, ящики; меч у стола — он серебристый, как облака),
    // остальное — по цвету: голубое небо, облака и дымка прозрачные (в просветах шатра — небо)
    const isleArea = [[10, 138], [138, 58], [160, 140], [252, 146], [252, 168], [578, 140], [670, 58], [692, 140], [772, 140], [772, 172], [744, 250],
      [744, 440], [836, 450], [846, 520], [884, 556], [904, 616], [946, 634], [950, 724], [918, 764], [884, 881], [104, 881], [24, 881], [6, 790], [6, 720],
      [20, 640], [60, 556], [66, 460], [62, 186], [10, 182]];
    const isleCore = [
      [[70, 650], [90, 600], [235, 592], [250, 604], [700, 604], [770, 586], [878, 600], [925, 650], [925, 720], [880, 780], [862, 800], [860, 881], [118, 881], [100, 805], [70, 760], [60, 700]],
      [[268, 418], [300, 418], [334, 600], [318, 612], [286, 612]] // меч, прислонённый к столу
    ];
    // нарисованный кот (с мечом и плащом): выше линии стола за ним — небо (просвет шатра), ниже — заливка, её закроет 3D-кот
    const catPoly = [[372, 300], [392, 288], [432, 298], [470, 316], [520, 298], [562, 286], [584, 300], [598, 360], [598, 430], [612, 470],
      [618, 540], [612, 612], [582, 632], [572, 660], [428, 662], [418, 632], [396, 612], [330, 614], [230, 608], [224, 592], [330, 560], [370, 520],
      [370, 470], [364, 420], [362, 350]];
    const CAT_SKY = 484; // выше — небо
    const ix1 = 0, iy1 = 50, ix2 = 960, iy2 = H - 1;
    // нижняя часть кота — гладкая заливка из окружения (стол, стойка, ковёр); сверху её граница — не небо над столом, а цвет
    // столешницы (за котом — стол), иначе пятно выходило светлым. Её почти целиком закрывает 3D-кот с тенью
    const src = clone(orig);
    {
      const m = new Uint8Array(W * H), top = [0, 0, 0];
      for (let y = 486; y <= 494; y++) for (let x = 340; x <= 356; x++) for (let k = 0; k < 3; k++) top[k] += orig.d[(y * W + x) * 4 + k] / (9 * 17);
      for (let y = iy1; y <= iy2; y++) for (let x = ix1; x <= ix2; x++) if (inPoly(catPoly, x, y)) {
        if (y >= CAT_SKY - 6) m[y * W + x] = 1;
        else for (let k = 0; k < 3; k++) src.d[(y * W + x) * 4 + k] = top[k]; // небо в контуре — прозрачное, цвет не виден
      }
      membrane(src, m);
      // стол и стенка прилавка за котом (до 540 — ниже клинок нарисованного меча): чистая полоса между мечом и котом
      // (334…360) повторяется туда-обратно — доски и их стыки продолжаются, а не размываются
      const pp = (d, n) => { const k = ((d % (2 * n)) + 2 * n) % (2 * n); return k < n ? k : 2 * n - 1 - k; };
      for (let y = CAT_SKY - 6; y < 540; y++) for (let x = ix1; x <= ix2; x++) {
        if (!m[y * W + x]) continue;
        const sx = 334 + pp(x - 334, 27), t = (y * W + x) * 4, u = (y * W + sx) * 4, w = y < 532 ? 1 : (540 - y) / 8;
        for (let k = 0; k < 3; k++) src.d[t + k] = orig.d[u + k] * w + src.d[t + k] * (1 - w);
      }
    }
    const isle = mk(ix2 - ix1 + 1, iy2 - iy1 + 1); isle.x1 = ix1; isle.y1 = iy1;
    const sm = clamp01;
    for (let y = iy1; y <= iy2; y++) for (let x = ix1; x <= ix2; x++) {
      const s = (y * W + x) * 4, t = ((y - iy1) * isle.w + x - ix1) * 4;
      for (let k = 0; k < 3; k++) isle.d[t + k] = src.d[s + k];
      let a = 0;
      if (inPoly(catPoly, x, y)) a = y < CAT_SKY ? 0 : 1;
      else if (isleCore.some(pl => inPoly(pl, x, y))) a = 1;
      else if (inPoly(isleArea, x, y)) {
        const r = src.d[s], g = src.d[s + 1], bb = src.d[s + 2], mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), lu = (r + g + bb) / 3;
        const blue = sm((bb - r - 40) / 30) * sm((g - 105) / 20) * sm((bb - 185) / 15);
        const cloud = sm((lu - 178) / 20) * sm((50 - (mx - mn)) / 18) * sm((bb - r + 14) / 12); // облака холодные, кремовое — нет
        const haze = sm((lu - 160) / 20) * sm((bb - r + 12) / 18) * sm((80 - (mx - mn)) / 20);
        a = 1 - Math.max(blue, cloud, haze);
      }
      isle.d[t + 3] = 255 * a;
    }
    { // убрать пятна и сгладить край 3×3
      const a0 = new Float32Array(isle.w * isle.h);
      for (let i = 0; i < a0.length; i++) { const a = isle.d[i * 4 + 3] / 255; a0[i] = a < 0.35 ? 0 : a > 0.8 ? 1 : (a - 0.35) / 0.45; }
      for (let y = 1; y < isle.h - 1; y++) for (let x = 1; x < isle.w - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a0[(y + dy) * isle.w + x + dx]; isle.d[(y * isle.w + x) * 4 + 3] = 255 * s / 9; }
    }

    // ---------- 2. небо: без островка (и без нарисованного кота) и без панели ----------
    const sky = clone(orig), skyMask = rectMask(W, H, [[1250, 36, 1748, 846]]);
    for (let y = iy1; y <= iy2; y++) for (let x = ix1; x <= ix2; x++) {
      const t = ((y - iy1) * isle.w + x - ix1) * 4;
      if (isle.d[t + 3] > 6 || inPoly(catPoly, x, y)) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) skyMask[yy * W + xx] = 1; }
    }
    membrane(sky, skyMask);
    for (let y = iy1; y <= iy2; y++) for (let x = ix1; x <= ix2; x++) { // край островка — без примеси неба
      const t = ((y - iy1) * isle.w + x - ix1) * 4, a = isle.d[t + 3] / 255;
      if (a <= 0 || a >= 1) continue;
      const s = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) isle.d[t + k] = Math.max(0, Math.min(255, (src.d[s + k] - (1 - a) * sky.d[s + k]) / Math.max(a, 0.35)));
    }
    const clean = sky; // фон под панелью — для краёв рамки

    // ---------- 3. панель: рамка, шапка, вкладки, строка, цена, «надето», значок раздела, линия, блик образца ----------
    const pieces = {};
    let q;
    // рамка: середина — чистый пергамент ровного цвета (медиана зазоров между строками), к рамке — плавно (10 px)
    q = cut(1255, 40, 1742, 840);
    {
      const P = [1272, 57, 1725, 823], vals = [[], [], []];
      [[306, 310], [382, 386]].forEach(([y1, y2]) => { for (let y = y1; y <= y2; y++) for (let x = 1300; x <= 1690; x++) { const t = ((y - q.y1) * q.w + x - q.x1) * 4; for (let k = 0; k < 3; k++) vals[k].push(q.d[t + k]); } });
      const med = vals.map(v => { v.sort((p, r) => p - r); return v[v.length >> 1]; });
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let y = P[1]; y <= P[3]; y++) for (let x = P[0]; x <= P[2]; x++) {
        const m = Math.min(1, Math.min(x - P[0], P[2] - x, y - P[1], P[3] - y) / 10), t = ((y - q.y1) * q.w + x - q.x1) * 4, g = (rnd() - 0.5) * 2;
        for (let k = 0; k < 3; k++) q.d[t + k] = q.d[t + k] * (1 - m) + (med[k] + g) * m;
      }
    }
    // рамка тянется по высоте экрана (border-image): стороны между углами — ровные вдоль (медиана столбца/строки),
    // иначе конец полосы под шапкой или полоса прокрутки растянулись бы в длинный след
    {
      const px = (x, y) => ((y - q.y1) * q.w + x - q.x1) * 4, med = (arr) => { arr.sort((p, r) => p - r); return arr[arr.length >> 1]; };
      for (let y = 222; y <= 802; y++) for (let x = 1707; x <= 1724; x++) for (let k = 0; k < 3; k++) q.d[px(x, y) + k] = q.d[px(1705, y) + k]; // полоса прокрутки — своя (CSS)
      const sides = [[1255, 1292], [1704, 1742]];
      const ss = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
      sides.forEach(([x1, x2]) => { for (let x = x1; x <= x2; x++) { const c = [0, 1, 2].map(k => { const v = []; for (let y = 300; y <= 700; y++) v.push(q.d[px(x, y) + k]); return med(v); }); for (let y = 100; y <= 780; y++) { const w = ss(100, 150, y) * (1 - ss(730, 780, y)); for (let k = 0; k < 3; k++) q.d[px(x, y) + k] = q.d[px(x, y) + k] * (1 - w) + c[k] * w; } } });
      [[40, 70], [808, 840]].forEach(([y1, y2]) => { for (let y = y1; y <= y2; y++) { const c = [0, 1, 2].map(k => { const v = []; for (let x = 1400; x <= 1600; x++) v.push(q.d[px(x, y) + k]); return med(v); }); for (let x = 1320; x <= 1680; x++) for (let k = 0; k < 3; k++) q.d[px(x, y) + k] = c[k]; } });
    }
    mat(q, rr(1261.5, 47.5, 1735.5, 833.5, 40), clean);
    pieces['shop-frame'] = q;
    pieces['shop-back'] = plate(1286, 64, 1344, 123, circ(1315, 93.2, 25.8));
    q = cut(1590, 64, 1716, 122); eraseCols(q, [1642, 76, 1704, 110]); mat(q, rr(1593, 67.5, 1712.5, 118, 25)); pieces['shop-wallet'] = q;
    q = cut(1288, 144, 1505, 210); eraseCols(q, [1330, 156, 1460, 199]); mat(q, rr(1291, 147.5, 1501.5, 206, 19)); pieces['shop-tab-on'] = q;
    q = cut(1288, 308, 1701, 384); eraseRows(q, [1298, 316, 1692, 376], [[1293, 1296], [1693, 1695]]); mat(q, rr(1291, 311.5, 1697.5, 380, 15)); pieces['shop-row'] = q; // вторая строка — у первой след от курсора
    q = cut(1583, 243, 1689, 297); eraseRows(q, [1597, 251, 1678, 289], [[1589, 1594], [1680, 1683]]); mat(q, rr(1586.5, 246.5, 1685.5, 293.5, 16)); pieces['shop-price'] = q;
    pieces['shop-coin'] = plate(1599, 254, 1631, 286, circ(1615, 270, 13.8));
    q = cut(1562, 514, 1689, 560); eraseRows(q, [1574, 521, 1677, 553], [[1567, 1571], [1679, 1683]]); mat(q, rr(1565, 517.5, 1685.5, 556, 19)); pieces['shop-worn'] = q;
    // значок раздела (меч на бурой плашке) и линия с наконечником справа — прозрачность по отличию от пергамента
    const onParchment = (x1, y1, x2, y2, thr) => {
      const im = cut(x1, y1, x2, y2), bg = [0, 0, 0];
      let n = 0;
      for (let x = 0; x < im.w; x++) { const t = x * 4; for (let k = 0; k < 3; k++) bg[k] += im.d[t + k]; n++; }
      for (let k = 0; k < 3; k++) bg[k] /= n;
      for (let i = 0; i < im.w * im.h; i++) { let df = 0; for (let k = 0; k < 3; k++) df += Math.abs(im.d[i * 4 + k] - bg[k]); im.d[i * 4 + 3] = 255 * clamp01((df - thr) / 30); }
      return im;
    };
    pieces['shop-sec'] = onParchment(1287, 469, 1321, 501, 24);
    pieces['shop-line'] = onParchment(1518, 480, 1696, 493, 10);
    // блик образца: стальной образец (светло-серый, ровный) → карта света для overlay (серый 50% — без изменений)
    q = cut(1300, 508, 1358, 573); mat(q, rr(1304, 512, 1353.5, 568.5, 11));
    {
      let s = 0, n = 0;
      for (let y = 530; y <= 545; y++) for (let x = 1318; x <= 1340; x++) { const t = ((y - q.y1) * q.w + x - q.x1) * 4; s += (q.d[t] + q.d[t + 1] + q.d[t + 2]) / 3; n++; }
      const mid = s / n;
      for (let i = 0; i < q.w * q.h; i++) { const lu = (q.d[i * 4] + q.d[i * 4 + 1] + q.d[i * 4 + 2]) / 3, v = Math.max(0, Math.min(255, 128 + (lu - mid) * 1.6)); q.d[i * 4] = q.d[i * 4 + 1] = q.d[i * 4 + 2] = v; }
    }
    pieces['shop-swatch'] = q;

    // обрезать по видимой части; места — в meta (исходные координаты макета 1785×881)
    const boxes = {};
    Object.keys(pieces).forEach(n => {
      const im = pieces[n];
      let x1 = im.w, y1 = im.h, x2 = -1, y2 = -1;
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.d[(y * im.w + x) * 4 + 3] > 2) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      const o = mk(x2 - x1 + 1, y2 - y1 + 1);
      for (let y = 0; y < o.h; y++) o.d.set(im.d.subarray(((y + y1) * im.w + x1) * 4, ((y + y1) * im.w + x2 + 1) * 4), y * o.w * 4);
      o.x1 = im.x1 + x1; o.y1 = im.y1 + y1;
      pieces[n] = o;
      boxes[n] = [o.x1, o.y1, o.w, o.h];
    });

    const up2 = (im) => { // Ланцош-3 по премультиплицированному цвету, затем резкость 0.4
      const w = im.w, h = im.h, S = 2, w2 = w * S, h2 = h * S;
      const Lz = (v) => { if (v === 0) return 1; if (Math.abs(v) >= 3) return 0; const a = Math.PI * v; return 3 * Math.sin(a) * Math.sin(a / 3) / (a * a); };
      const taps = [], wts = [];
      for (let o = 0; o < S; o++) { const f = (o + 0.5) / S - 0.5, base = Math.floor(f), t = [], ws = []; let sum = 0; for (let j = base - 2; j <= base + 3; j++) { const ww = Lz(f - j); t.push(j); ws.push(ww); sum += ww; } taps.push(t); wts.push(ws.map(ww => ww / sum)); }
      const pm = new Float32Array(w * h * 4);
      for (let i = 0; i < w * h; i++) { const a = im.d[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) pm[i * 4 + k] = im.d[i * 4 + k] * a; pm[i * 4 + 3] = im.d[i * 4 + 3]; }
      const tmp = new Float32Array(w2 * h * 4), out = new Float32Array(w2 * h2 * 4);
      for (let y = 0; y < h; y++) for (let X2 = 0; X2 < w2; X2++) { const sx = Math.floor(X2 / S), t = taps[X2 % S], ws = wts[X2 % S]; for (let k = 0; k < 4; k++) { let s = 0; for (let j = 0; j < 6; j++) { const xx = Math.min(w - 1, Math.max(0, sx + t[j])); s += pm[(y * w + xx) * 4 + k] * ws[j]; } tmp[(y * w2 + X2) * 4 + k] = s; } }
      for (let Y2 = 0; Y2 < h2; Y2++) { const sy = Math.floor(Y2 / S), t = taps[Y2 % S], ws = wts[Y2 % S]; for (let X2 = 0; X2 < w2; X2++) for (let k = 0; k < 4; k++) { let s = 0; for (let j = 0; j < 6; j++) { const yy = Math.min(h - 1, Math.max(0, sy + t[j])); s += tmp[(yy * w2 + X2) * 4 + k] * ws[j]; } out[(Y2 * w2 + X2) * 4 + k] = s; } }
      const c = document.createElement('canvas'); c.width = w2; c.height = h2;
      const cx = c.getContext('2d'), id = cx.createImageData(w2, h2), d = id.data;
      for (let Y2 = 0; Y2 < h2; Y2++) for (let X2 = 0; X2 < w2; X2++) {
        const i = Y2 * w2 + X2, a = Math.max(0, Math.min(255, out[i * 4 + 3]));
        for (let k = 0; k < 3; k++) {
          let blur = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = Math.min(h2 - 1, Math.max(0, Y2 + dy)), xx = Math.min(w2 - 1, Math.max(0, X2 + dx)); blur += out[(yy * w2 + xx) * 4 + k]; n++; }
          const v = out[i * 4 + k], sh = v + 0.4 * (v - blur / n);
          d[i * 4 + k] = a > 0.5 ? Math.max(0, Math.min(255, sh / (a / 255))) : 0;
        }
        d[i * 4 + 3] = a;
      }
      cx.putImageData(id, 0, 0);
      return c;
    };
    const out = {};
    Object.keys(pieces).forEach(n => { out[n + '.webp'] = up2(pieces[n]).toDataURL('image/webp', 0.92).split(',')[1]; });
    out['shop-isle.webp'] = up2(isle).toDataURL('image/webp', 0.9).split(',')[1];
    out['_shop-sky.jpg'] = up2(sky).toDataURL('image/jpeg', 0.86).split(',')[1]; // в превью: в игре — чистое небо (refcut/sky.cjs)
    // превью: островок на шахматке, детали панели на пурпурном
    const pv = document.createElement('canvas'); pv.width = isle.w; pv.height = isle.h;
    const pc = pv.getContext('2d');
    for (let y = 0; y < isle.h; y += 16) for (let x = 0; x < isle.w; x += 16) { pc.fillStyle = ((x + y) / 16) % 2 ? '#ff00ff' : '#00c080'; pc.fillRect(x, y, 16, 16); }
    pc.drawImage(up2(isle), 0, 0, isle.w, isle.h);
    out['_shop-isle-check.png'] = pv.toDataURL('image/png').split(',')[1];
    const sv = document.createElement('canvas'); sv.width = 1000; sv.height = 900;
    const scx = sv.getContext('2d'); scx.fillStyle = '#ff00ff'; scx.fillRect(0, 0, 1000, 900);
    let yy = 6, xx = 6, rowH = 0;
    Object.keys(pieces).forEach(n => { const c = up2(pieces[n]), w = c.width / 2, h = c.height / 2; if (xx + w > 994) { xx = 6; yy += rowH + 6; rowH = 0; } scx.drawImage(c, xx, yy, w, h); xx += w + 6; rowH = Math.max(rowH, h); });
    out['_shop-ui-check.png'] = sv.toDataURL('image/png').split(',')[1];
    out.meta = JSON.stringify({ size: [W, H], isle: [ix1, iy1, isle.w, isle.h], boxes });
    return out;
  }, fs.readFileSync(SRC).toString('base64'));
  for (const [n, v] of Object.entries(res)) {
    if (n === 'meta') { console.log(v); continue; }
    fs.writeFileSync((n[0] === '_' ? PREV : OUT) + '/' + n.replace(/^_/, ''), Buffer.from(v, 'base64'));
  }
  console.log('файлы:', Object.keys(res).filter(n => n !== 'meta' && n[0] !== '_').map(n => n + ' ' + Math.round(fs.statSync(OUT + '/' + n).size / 1024) + ' КБ').join(', '));
  await b.close();
})();

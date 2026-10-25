// Нарезка меню из макета (12.png):
//  — фон без интерфейса и без островка с котом (в превью; menu-sky.jpg игры — из чистого неба, refcut/sky.cjs),
//    островок с котом отдельным слоем (menu-isle.webp);
//  — кнопки, кошелёк, корзина, задания, шестерёнка, карточка (рамка, бирка, разделитель, кнопка), прогресс, рекорд,
//    корона и щит логотипа — точно из макета; английский текст стёрт (ui-*.webp), прозрачность — по разнице с фоном.
// Всё увеличено вдвое (Ланцош-3) с лёгкой резкостью. Из _not_main: node refcut/refcut.cjs refcut/menu-mockup.png ../public/img <папка превью>
// (в консоль — meta: места плашек на макете в кадре 1500×739 — по ним стоят k(…) в _game.scss)
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
    const W0 = img.width, H0 = img.height, c0 = document.createElement('canvas');
    c0.width = W0; c0.height = H0;
    const x0 = c0.getContext('2d');
    x0.drawImage(img, 0, 0);
    const full = x0.getImageData(0, 0, W0, H0).data;
    // рамка снимка
    const lum = (i) => (full[i] + full[i + 1] + full[i + 2]) / 3;
    const rowDark = (y) => { let s = 0; for (let x = 0; x < W0; x += 4) s += lum((y * W0 + x) * 4); return s / (W0 / 4) < 40; };
    const colDark = (x) => { let s = 0; for (let y = 0; y < H0; y += 4) s += lum((y * W0 + x) * 4); return s / (H0 / 4) < 40; };
    let T = 0, B = H0 - 1, L = 0, R = W0 - 1;
    while (rowDark(T)) T++;
    while (rowDark(B)) B--;
    while (colDark(L)) L++;
    while (colDark(R)) R--;
    T += 2; B -= 2; L += 2; R -= 2;
    const W = R - L + 1, H = B - T + 1;
    // изображение — Float32 RGBA (0…255), координаты — как у исходного снимка (сдвиг рамки учитывают функции)
    const mk = (w, h) => ({ w, h, d: new Float32Array(w * h * 4) });
    const orig = mk(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((y + T) * W0 + x + L) * 4, j = (y * W + x) * 4;
      orig.d[j] = full[i]; orig.d[j + 1] = full[i + 1]; orig.d[j + 2] = full[i + 2]; orig.d[j + 3] = 255;
    }
    const X = (x) => x - L, Y = (y) => y - T; // исходные координаты → в кадре без рамки
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

    // ---------- 1. формы плашек (исходные координаты; края замерены по профилям яркости снимка) ----------
    const rr = (x1, y1, x2, y2, r) => (x, y) => {
      if (x < x1 || x > x2 || y < y1 || y > y2) return false;
      const cx = Math.min(Math.max(x, x1 + r), x2 - r), cy = Math.min(Math.max(y, y1 + r), y2 - r);
      return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    };
    const circ = (cx, cy, r) => (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    const poly = (pts) => (x, y) => inPoly(pts, x, y);
    const any = (...fs) => (x, y) => fs.some(f => f(x, y));
    // плашка со стрелкой справа: скругление слева, прямой край до xs, дальше — остриё в tip со скруглёнными плечами
    // (плечи и наклон замерены по снимку: от xs вправо на 6/10/14 px край опускается на 2/6/12 px, потом — прямо к острию)
    const arrow = (x1, y1, xs, y2, tip, r) => {
      const body = rr(x1, y1, xs + r, y2, r), cy = (y1 + y2) / 2;
      const head = poly([[xs, y1], [xs + 6, y1 + 2], [xs + 10, y1 + 6], [xs + 14, y1 + 12], [tip, cy], [xs + 14, y2 - 12], [xs + 10, y2 - 6], [xs + 6, y2 - 2], [xs, y2]]);
      return (x, y) => (x <= xs && body(x, y)) || head(x, y);
    };
    // кнопка меню: плашка со стрелкой и медальон слева (он чуть выше и ниже плашки)
    const btn = (y1, y2, tip, cy, r) => any(arrow(38, y1, 262, y2, tip, 14), circ(84, cy, r));
    const S = {
      wallet: any(rr(38, 23.5, 234.5, 87.5, 22), circ(78, 51.5, 30.2)),
      cart: rr(249.5, 23, 313.5, 87.5, 18),
      quests: rr(329.5, 23, 393.5, 87.5, 18),
      gear: rr(1441.5, 23, 1497.5, 78, 15),
      play: any(arrow(37.5, 153.5, 262, 227, 290.5, 14), circ(84, 189.75, 40.7)),
      chars: btn(243.5, 314, 290.5, 278.5, 38),
      levels: btn(330.5, 400, 288.5, 364.75, 38.25),
      settings: btn(416, 486, 288.5, 450.5, 38),
      progress: rr(38, 628.5, 342.5, 713, 27),
      best: rr(1295.5, 674, 1476, 717.5, 21),
      // карточка: углы — радиус 26, верх рамки посередине чуть выгнут (на 3.5 px выше, чем у углов)
      card: any(rr(1101.5, 114.5, 1472.5, 647, 26), (x, y) => x > 1127 && x < 1447 && y <= 647 && y >= 111 + 3.5 * ((x - 1287) / 165) ** 2),
      tag: rr(1236.5, 98, 1324, 129.5, 5),
      cardPlay: rr(1137.5, 538.5, 1436, 610.5, 16)
    };

    // ---------- 2. фон без интерфейса ----------
    // заливаются только сами плашки (с запасом 4 px), логотип и значок «3»; небо между кнопками остаётся настоящим
    const uiMask = rectMask(W, H, [[498, 8, 1022, 202], [362, 8, 404, 52]].map(r => [X(r[0]), Y(r[1]), X(r[2]), Y(r[3])]));
    {
      const sm0 = new Uint8Array(W * H), fs = Object.values(S), R = 4;
      [[26, 6, 404, 98], [1426, 8, 1512, 94], [26, 140, 304, 500], [26, 620, 354, 726], [1086, 82, 1488, 662], [1282, 662, 1490, 730]]
        .forEach(([a, b2, c, d]) => { for (let y = b2; y <= d; y++) for (let x = a; x <= c; x++) if (fs.some(f => f(x, y))) sm0[Y(y) * W + X(x)] = 1; });
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sm0[y * W + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const yy = y + dy, xx = x + dx;
        if (dx * dx + dy * dy <= R * R && yy >= 0 && yy < H && xx >= 0 && xx < W) uiMask[yy * W + xx] = 1;
      }
    }
    // щит логотипа
    for (let y = Y(148); y <= Y(248); y++) for (let x = X(696); x <= X(818); x++) if (inPoly([[696, 148], [818, 148], [815, 208], [758, 248], [700, 208]].map(q => [X(q[0]), Y(q[1])]), x, y)) uiMask[y * W + x] = 1;
    const clean = clone(orig);
    membrane(clean, uiMask);

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
    // перенести кусок (цвет и прозрачность) из другого места снимка — например, угол корзины на место значка «3»
    const copyFrom = (im, [a, b2, c, d], dx, dy) => {
      for (let y = b2; y <= d; y++) for (let x = a; x <= c; x++) {
        const s = ((Y(y + dy)) * W + X(x + dx)) * 4, t = ((y - im.y1) * im.w + x - im.x1) * 4;
        let diff = 0;
        for (let k = 0; k < 3; k++) { im.d[t + k] = orig.d[s + k]; diff += Math.abs(orig.d[s + k] - clean.d[s + k]); }
        im.d[t + 3] = 255 * clamp01((diff - 24) / 40);
      }
    };
    const transparent = (im, [a, b2, c, d]) => { for (let y = b2; y <= d; y++) for (let x = a; x <= c; x++) im.d[((y - im.y1) * im.w + x - im.x1) * 4 + 3] = 0; };
    const opaque = (im, [a, b2, c, d]) => { for (let y = b2; y <= d; y++) for (let x = a; x <= c; x++) im.d[((y - im.y1) * im.w + x - im.x1) * 4 + 3] = 255; };

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

    const pieces = {};
    let q;
    q = cut(34, 18, 240, 92); eraseRows(q, [112, 38, 184, 70], [[186, 189], [108, 110]]); mat(q, S.wallet, clean); pieces['ui-wallet'] = q;
    const cart = pieces['ui-cart'] = plate(244, 10, 320, 92, S.cart, clean);
    // задания: значок «3» — свой, под ним — угол плашки как у корзины (она такая же, на 80 px левее)
    q = plate(324, 10, 400, 92, S.quests, clean);
    for (let y = 10; y <= 52; y++) for (let x = 360; x <= 400; x++) {
      const s = ((y - cart.y1) * cart.w + x - 80 - cart.x1) * 4, t = ((y - q.y1) * q.w + x - q.x1) * 4;
      for (let k = 0; k < 4; k++) q.d[t + k] = cart.d[s + k];
    }
    pieces['ui-quests'] = q;
    pieces['ui-gear'] = plate(1436, 16, 1504, 86, S.gear, clean);
    // надпись — от правого края медальона (126) до конца слова
    const menuBtn = (name, f, [x1, y1, x2, y2], text) => { const im = cut(x1, y1, x2, y2); eraseCols(im, text); mat(im, f, clean); pieces[name] = im; };
    menuBtn('ui-play', S.play, [30, 144, 298, 236], [126, 168, 204, 210]);
    menuBtn('ui-btn-chars', S.chars, [30, 234, 298, 322], [126, 260, 256, 298]);
    menuBtn('ui-btn-levels', S.levels, [30, 321, 298, 408], [126, 346, 206, 382]);
    menuBtn('ui-btn-settings', S.settings, [30, 407, 298, 494], [126, 431, 228, 469]);
    q = cut(32, 622, 350, 719); eraseSmooth(q, [[124, 640, 334, 700]]); mat(q, S.progress, clean); pieces['ui-progress'] = q;
    q = cut(1290, 668, 1482, 723); eraseRows(q, [1342, 684, 1466, 709], [[1340, 1341], [1467, 1469]]); mat(q, S.best, clean); pieces['ui-best'] = q;
    // карточка: рамка и чистый пергамент; бирки нет (под ней — верхняя кайма, как левее), содержимое — заливкой
    q = cut(1096, 94, 1482, 656);
    // пергамент без содержимого: стираются только сами элементы (заголовок, картинка, текст, разделитель с наградами, кнопка);
    // середина пергамента — гладкая поверхность (квадратичная по x, y — светлая середина, темнее к краям), подобранная по
    // видимым кускам пергамента между элементами и у рамки, плюс лёгкое зерно; к рамке — плавный переход (8 px)
    {
      const items = [[1196, 140, 1380, 178], [1132, 178, 1444, 380], [1140, 382, 1420, 430], [1134, 434, 1442, 534], [1128, 532, 1448, 626]];
      const P = [1122, 138, 1458, 626], inItem = (x, y, m) => items.some(([a, b, c, d]) => x >= a - m && x <= c + m && y >= b - m && y <= d + m);
      const N = Array.from({ length: 6 }, () => new Float64Array(6)), Bv = [0, 1, 2].map(() => new Float64Array(6));
      const basis = (x, y) => { const u = (x - 1290) / 170, v = (y - 382) / 245; return [1, u, v, u * u, v * v, u * v]; };
      for (let y = P[1]; y <= P[3]; y++) for (let x = P[0]; x <= P[2]; x++) {
        if (inItem(x, y, 2)) continue;
        const t = ((y - q.y1) * q.w + x - q.x1) * 4, f = basis(x, y);
        for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) N[i][j] += f[i] * f[j]; for (let k = 0; k < 3; k++) Bv[k][i] += f[i] * q.d[t + k]; }
      }
      const solve = (A, b) => { const n = 6, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; } } return M.map((r, i) => r[n] / r[i]); };
      const coef = [0, 1, 2].map(k => solve(N.map(r => [...r]), Bv[k]));
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let y = P[1]; y <= P[3]; y++) for (let x = P[0]; x <= P[2]; x++) {
        const m = Math.min(1, Math.min(x - P[0], P[2] - x, y - P[1], P[3] - y) / 8); // вся середина — поверхность, к рамке — плавно
        const t = ((y - q.y1) * q.w + x - q.x1) * 4, f = basis(x, y), g = (rnd() - 0.5) * 3;
        for (let k = 0; k < 3; k++) { let v = g; for (let i = 0; i < 6; i++) v += coef[k][i] * f[i]; q.d[t + k] = q.d[t + k] * (1 - m) + v * m; }
      }
    }
    for (let y = 108; y <= 134; y++) for (let x = 1232; x <= 1332; x++) { // кайма под биркой — копия столбца левее
      const s = ((y - q.y1) * q.w + 1215 - q.x1) * 4, t = ((y - q.y1) * q.w + x - q.x1) * 4;
      for (let k = 0; k < 3; k++) q.d[t + k] = q.d[s + k];
    }
    mat(q, S.card, clean);
    pieces['ui-card'] = q;
    q = cut(1232, 94, 1328, 134); eraseRows(q, [1258, 103, 1306, 126], [[1246, 1254], [1310, 1318]]); mat(q, S.tag, clean); pieces['ui-card-tag'] = q;
    q = cut(1138, 438, 1438, 460); for (let i = 3; i < q.d.length; i += 4) q.d[i] = 255; eraseRows(q, [1243, 438, 1330, 460], [[1180, 1200]]);
    // линии разделителя — без пергамента вокруг: прозрачность по отличию от пергамента
    { const bg = [0, 0, 0]; for (let x = 1180; x < 1200; x++) for (let k = 0; k < 3; k++) bg[k] += q.d[(x - q.x1) * 4 + k] / 20;
      for (let i = 0; i < q.w * q.h; i++) { let df = 0; for (let k = 0; k < 3; k++) df += Math.abs(q.d[i * 4 + k] - bg[k]); q.d[i * 4 + 3] = 255 * clamp01((df - 18) / 30); } }
    // между внутренними ромбиками (1237 и 1336) — пусто, как на макете (там слово); выше и ниже линии с ромбиками — пусто
    for (let y = q.y1; y < q.y1 + q.h; y++) for (let x = q.x1; x < q.x1 + q.w; x++) if ((x >= 1242 && x <= 1332) || y < 444 || y > 453) q.d[((y - q.y1) * q.w + x - q.x1) * 4 + 3] = 0;
    pieces['ui-card-div'] = q;
    q = cut(1132, 532, 1442, 616); eraseRows(q, [1268, 552, 1346, 594], [[1350, 1420]]); mat(q, S.cardPlay); pieces['ui-card-play'] = q;
    // медальоны кнопок (для телефона: «Облик · Уровни · Настройки» — кружками) и монета с карточки
    [['play', 189.75, 40.7], ['chars', 278.5, 38], ['levels', 364.75, 38.25], ['settings', 450.5, 38]].forEach(([n, cy, r]) => {
      pieces['ui-med-' + n] = plate(Math.floor(84 - r - 2), Math.floor(cy - r - 2), Math.ceil(84 + r + 2), Math.ceil(cy + r + 2), circ(84, cy, r));
    });
    pieces['ui-coin'] = plate(1166, 459, 1214, 507, circ(1190, 483, 22.5));
    // логотип целиком из макета (дощечка, надпись Cat Knight, корона, щит на лентах, плющ). Прозрачность — по отличию от
    // неба, залитого только под самим логотипом (вокруг — настоящее небо); щит и корона — целиком (щит синий, как небо)
    {
      const logoPoly = [[498, 108], [500, 62], [530, 40], [600, 26], [722, 20], [724, 9], [792, 9], [798, 22], [900, 26], [966, 32], [980, 48], [1012, 50],
        [1015, 100], [1007, 106], [1005, 166], [990, 178], [962, 197], [862, 197], [815, 201], [760, 250], [705, 201], [660, 200], [600, 197], [556, 193],
        [538, 172], [503, 165]];
      const solid = [[[705, 146], [814, 146], [812, 196], [760, 243], [708, 196]], [[662, 148], [707, 148], [707, 196], [690, 190], [662, 172]],
        [[812, 148], [858, 148], [858, 172], [830, 190], [812, 196]], [[730, 22], [744, 31], [757, 14], [770, 31], [784, 22], [779, 51], [735, 51]]];
      const lx1 = 494, ly1 = 6, lx2 = 1019, ly2 = 252;
      const lmask = new Uint8Array(W * H);
      for (let y = ly1; y <= ly2; y++) for (let x = lx1; x <= lx2; x++) if (inPoly(logoPoly, x, y)) lmask[Y(y) * W + X(x)] = 1;
      const lbg = clone(orig);
      membrane(lbg, lmask);
      const logo = cut(lx1, ly1, lx2, ly2), lw = logo.w, lh = logo.h, la = new Float32Array(lw * lh);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const X0 = x + lx1, Y0 = y + ly1, t = (y * lw + x) * 4, s = (Y(Y0) * W + X(X0)) * 4;
        let a = 0;
        if (inPoly(logoPoly, X0, Y0)) {
          if (solid.some(pl => inPoly(pl, X0, Y0))) a = 1;
          else { let dd = 0; for (let k = 0; k < 3; k++) dd += (logo.d[t + k] - lbg.d[s + k]) ** 2; a = clamp01((Math.sqrt(dd) - 14) / 40); }
        }
        la[y * lw + x] = a;
      }
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { // край — сгладить 3×3 и убрать примесь неба
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < lh && xx >= 0 && xx < lw) { sum += la[yy * lw + xx]; n++; } }
        const a = la[y * lw + x] >= 1 ? 1 : sum / n, t = (y * lw + x) * 4, s = (Y(y + ly1) * W + X(x + lx1)) * 4;
        if (a > 0 && a < 1) for (let k = 0; k < 3; k++) logo.d[t + k] = Math.max(0, Math.min(255, (logo.d[t + k] - (1 - a) * lbg.d[s + k]) / Math.max(a, 0.35)));
        logo.d[t + 3] = 255 * a;
      }
      pieces['logo'] = logo;

    }

    // обрезать по видимой части: картинка — ровно плашка, её место на макете — в meta
    const boxes = {};
    Object.keys(pieces).forEach(n => {
      const im = pieces[n];
      let x1 = im.w, y1 = im.h, x2 = -1, y2 = -1;
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.d[(y * im.w + x) * 4 + 3] > 2) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      const o = mk(x2 - x1 + 1, y2 - y1 + 1);
      for (let y = 0; y < o.h; y++) o.d.set(im.d.subarray(((y + y1) * im.w + x1) * 4, ((y + y1) * im.w + x2 + 1) * 4), y * o.w * 4);
      o.x1 = im.x1 + x1; o.y1 = im.y1 + y1;
      pieces[n] = o;
      boxes[n] = [o.x1 - L, o.y1 - T, o.w, o.h]; // в кадре без рамки 1500×739
    });

    // ---------- 4. островок с котом — отдельный слой ----------
    // кот (с клинком и плащом) — плотный контур: внутри прозрачно только голубое небо (мех и плащ светлые, как облака);
    // знамёна, флажок, низ островка — контуры, внутри которых прозрачны небо, облака и дымка; постамент, скала и водопад —
    // целиком. Дальние острова, касающиеся силуэта, остаются за контурами
    const catPoly = [[626, 212], [638, 212], [644, 255], [642, 271], [655, 279], [668, 289], [677, 293], [690, 291], [705, 288], [722, 288], [736, 284],
      [750, 276], [762, 271], [771, 271], [776, 282], [779, 300], [783, 315], [787, 330], [791, 356], [787, 376], [776, 388], [763, 396], [761, 405], [779, 416],
      [800, 424], [820, 432], [835, 440], [848, 450], [858, 461], [866, 471], [867, 481], [860, 491], [851, 500], [848, 512], [760, 522], [640, 524],
      [631, 505], [632, 480], [633, 462], [629, 440], [620, 428], [616, 410], [606, 404], [605, 388], [616, 384], [614, 365], [617, 350], [622, 339],
      [625, 300], [622, 250], [622, 212]];
    const area = [
      // низ: ящики, фонарь, сундук, цветы, постамент, скала (справа — без дальнего островка и скалы за флажком)
      [[404, 570], [408, 545], [432, 505], [452, 482], [472, 446], [482, 432], [506, 430], [514, 444], [520, 470], [533, 447], [560, 440], [590, 445],
        [598, 420], [612, 415], [624, 425], [632, 460], [632, 505], [760, 522], [848, 512], [851, 500], [852, 477], [895, 474], [931, 478], [933, 500],
        [931, 510], [945, 503], [961, 505], [962, 535], [976, 548], [990, 565], [997, 590], [992, 620], [965, 700], [930, 722], [880, 745], [870, 761],
        [560, 761], [520, 722], [478, 690], [440, 650], [418, 610]],
      // левое знамя: навершие, вымпел, перекладина, полотнище, древко
      [[566, 212], [577, 212], [588, 228], [588, 262], [600, 268], [600, 288], [590, 290], [590, 470], [566, 470], [573, 398], [560, 410], [546, 428],
        [533, 428], [522, 417], [505, 405], [502, 290], [486, 289], [484, 267], [498, 262], [510, 253], [506, 230], [540, 228], [564, 226]],
      // правое знамя (справа — без дальнего островка с ёлкой)
      [[818, 212], [828, 212], [835, 228], [878, 229], [880, 256], [895, 264], [908, 275], [905, 291], [890, 292], [891, 400], [872, 420], [862, 425],
        [858, 431], [846, 431], [840, 418], [830, 414], [830, 470], [810, 470], [808, 292], [800, 289], [799, 268], [810, 262], [813, 248], [813, 229]],
      // красный флажок
      [[886, 398], [899, 398], [900, 413], [930, 414], [957, 419], [941, 434], [952, 448], [925, 453], [900, 452], [894, 482], [880, 482]]
    ];
    const core = [
      [[470, 520], [600, 505], [870, 505], [930, 520], [950, 540], [972, 570], [975, 595], [930, 670], [830, 735], [600, 735], [520, 700], [440, 620], [430, 560]], // постамент и скала
      [[586, 585], [652, 585], [652, 761], [586, 761]] // водопад
    ];
    const fx1 = 404, fy1 = 208, fx2 = 996, fy2 = 760;
    const isle = mk(fx2 - fx1 + 1, fy2 - fy1 + 1); isle.x1 = fx1; isle.y1 = fy1;
    const sm = (v) => clamp01(v);
    for (let y = fy1; y <= fy2; y++) for (let x = fx1; x <= fx2; x++) {
      const s = (Y(y) * W + X(x)) * 4, t = ((y - fy1) * isle.w + x - fx1) * 4;
      if (Y(y) >= H) continue;
      const r = orig.d[s], g = orig.d[s + 1], bb = orig.d[s + 2];
      for (let k = 0; k < 3; k++) isle.d[t + k] = orig.d[s + k];
      let a = 0;
      const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), lu = (r + g + bb) / 3;
      const blue = sm((bb - r - 40) / 30) * sm((g - 105) / 20) * sm((bb - 185) / 15);   // голубое небо
      if (inPoly(catPoly, x, y)) {
        // у края плаща справа — ещё и холодные облака (плащ тёплый, кремовый; доспеха там нет)
        const cool = x > 795 ? sm((lu - 180) / 15) * sm((bb - r + 4) / 8) : 0;
        a = 1 - Math.max(blue, cool);
      } else if (area.some(pl => inPoly(pl, x, y))) {
        if (core.some(pl => inPoly(pl, x, y))) a = 1;
        else {
          const cloud = sm((lu - 175) / 20) * sm((55 - (mx - mn)) / 18);                     // светлые облака, и тёплые
          const haze = sm((lu - 160) / 20) * sm((bb - r + 12) / 18) * sm((80 - (mx - mn)) / 20); // голубоватая дымка
          a = 1 - Math.max(blue, cloud, haze);
        }
      }
      isle.d[t + 3] = 255 * a;
    }
    // край кота: пиксели рядом с прозрачным небом — смесь меха и неба (светлый ореол, клочки бледного неба между
    // шерстинками); там прозрачно бледно-голубое и холодное светлое (мех тёплый). Несколько проходов — край «съедается»
    // вглубь, пока не упрётся в тёплый мех. Клинок и доспех (они холодные) не трогаем: только голова, выше гарды
    { const blade = [[624, 210], [641, 210], [650, 300], [656, 386], [632, 389], [626, 300]];
      for (let pass = 0; pass < 4; pass++) {
        const a0 = new Float32Array(isle.w * isle.h);
        for (let i = 0; i < a0.length; i++) a0[i] = isle.d[i * 4 + 3] / 255;
        for (let y = 2; y < isle.h - 2; y++) for (let x = 2; x < isle.w - 2; x++) {
          const i = y * isle.w + x, X0 = x + fx1, Y0 = y + fy1;
          if (a0[i] < 0.5 || Y0 > 392) continue;
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (a0[i + dy * isle.w + dx] < 0.2) { near = true; break; }
          if (!near || !inPoly(catPoly, X0, Y0) || inPoly(blade, X0, Y0)) continue;
          const r = isle.d[i * 4], g = isle.d[i * 4 + 1], bb = isle.d[i * 4 + 2], lu = (r + g + bb) / 3;
          const sky = Math.max(sm((bb - r - 5) / 30) * sm((bb - 175) / 20), sm((lu - 165) / 20) * sm((bb - r + 2) / 10));
          isle.d[i * 4 + 3] = 255 * Math.min(a0[i], 1 - sky);
        }
      } }
    // убрать редкие пятна: прозрачность ниже 0.35 — ноль, выше 0.8 — единица; затем сгладить край 3×3
    { const a0 = new Float32Array(isle.w * isle.h);
      for (let i = 0; i < a0.length; i++) { const a = isle.d[i * 4 + 3] / 255; a0[i] = a < 0.35 ? 0 : a > 0.8 ? 1 : (a - 0.35) / 0.45; }
      for (let y = 1; y < isle.h - 1; y++) for (let x = 1; x < isle.w - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a0[(y + dy) * isle.w + x + dx]; isle.d[(y * isle.w + x) * 4 + 3] = 255 * s / 9; } }
    // ---------- 4. фон без островка ----------
    const sky = clone(clean), isleMask = new Uint8Array(W * H);
    for (let y = fy1; y <= fy2; y++) for (let x = fx1; x <= fx2; x++) {
      const t = ((y - fy1) * isle.w + x - fx1) * 4;
      if (isle.d[t + 3] > 6) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = Y(y) + dy, xx = X(x) + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) isleMask[yy * W + xx] = 1; }
    }
    membrane(sky, isleMask);
    // край островка — без примеси неба (фон за ним — только что заполненное небо)
    for (let y = fy1; y <= fy2; y++) for (let x = fx1; x <= fx2; x++) {
      const t = ((y - fy1) * isle.w + x - fx1) * 4, a = isle.d[t + 3] / 255;
      if (a <= 0 || a >= 1 || Y(y) >= H) continue;
      const s = (Y(y) * W + X(x)) * 4;
      for (let k = 0; k < 3; k++) isle.d[t + k] = Math.max(0, Math.min(255, (orig.d[s + k] - (1 - a) * sky.d[s + k]) / Math.max(a, 0.35)));
    }

    // ---------- 5. увеличение вдвое и выгрузка ----------
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
    out['menu-isle.webp'] = up2(isle).toDataURL('image/webp', 0.9).split(',')[1];
    out['_menu-sky.jpg'] = up2(sky).toDataURL('image/jpeg', 0.86).split(',')[1]; // в превью: в игре — чистое небо (refcut/sky.cjs)
    // превью: островок на шахматке и пары «до / после» для кнопок
    const pv = document.createElement('canvas'); pv.width = isle.w; pv.height = isle.h;
    const pc = pv.getContext('2d');
    for (let y = 0; y < isle.h; y += 16) for (let x = 0; x < isle.w; x += 16) { pc.fillStyle = ((x + y) / 16) % 2 ? '#ff00ff' : '#00c080'; pc.fillRect(x, y, 16, 16); }
    const ic = up2(isle); pc.drawImage(ic, 0, 0, isle.w, isle.h);
    out['_isle-check.png'] = pv.toDataURL('image/png').split(',')[1];
    const sv = document.createElement('canvas'); sv.width = 900; sv.height = 760;
    const scx = sv.getContext('2d'); scx.fillStyle = '#ff00ff'; scx.fillRect(0, 0, 900, 760);
    let yy = 6, xx = 6, rowH = 0;
    Object.keys(pieces).forEach(n => { const c = up2(pieces[n]), w = c.width / 2, h = c.height / 2; if (xx + w > 894) { xx = 6; yy += rowH + 6; rowH = 0; } scx.drawImage(c, xx, yy, w, h); xx += w + 6; rowH = Math.max(rowH, h); });
    out['_ui-check.png'] = sv.toDataURL('image/png').split(',')[1];
    out.meta = JSON.stringify({ frame: [L, T], size: [W, H], isle: [fx1 - L, fy1 - T, isle.w, isle.h], boxes });
    return out;
  }, fs.readFileSync(SRC).toString('base64'));
  for (const [n, v] of Object.entries(res)) {
    if (n === 'meta') { console.log(v); continue; }
    fs.writeFileSync((n[0] === '_' ? PREV : OUT) + '/' + n.replace(/^_/, ''), Buffer.from(v, 'base64'));
  }
  console.log('файлы:', Object.keys(res).filter(n => n !== 'meta' && n[0] !== '_').map(n => n + ' ' + Math.round(fs.statSync(OUT + '/' + n).size / 1024) + ' КБ').join(', '));
  await b.close();
})();

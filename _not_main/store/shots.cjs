// Скриншоты для сторов: сцены игры на русском и английском (графика «Красиво»), затем кадры с подписью —
// App Store (iPhone 6,7", 1290×2796) и Google Play (1080×1920). Запуск из _not_main: node store/shots.cjs [сцена,…]
// Результат: store/screens/raw/<язык>-<сцена>.png и store/screens/<ios|play>/<язык>-<номер>-<сцена>.png.
// С ключом --compose — только пересобрать кадры из готовых снимков, без съёмки
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const OUT = path.join(__dirname, 'screens');
const ARGS = process.argv.slice(2), COMPOSE_ONLY = ARGS.includes('--compose'), PICK = ARGS.filter(a => a[0] !== '-')[0];
const ONLY = PICK ? PICK.split(',') : null;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

// сцена: подпись и как её получить (страница уже на заставке, игра на паузе кадров — freeze)
const SCENES = [
  { key: 'start', ru: 'Кот-рыцарь спешит\nв Небесный замок', en: 'A knight cat races\nto the Sky Castle', go: async (p) => { await p.waitForTimeout(1500); } },
  { key: 'run', ru: 'Наклоняй —\nкот прыгает сам', en: 'Tilt to fly\nisland to island', go: (p) => p.evaluate(() => { const g = window.__game; g.start(); g.freeze(true); g.sim(22); settle(g); }) },
  { key: 'boss', ru: 'Отбивай огонь\nдраконов мечом', en: 'Deflect dragon fire\nwith your sword', go: (p) => p.evaluate(() => {
    const g = window.__game; g.freeze(true); g.level(4, 6);
    for (let i = 0; i < 1500; i++) { g.sim(1 / 60); const D = g.world.boss; if (D && D.state === 'fight' && g.world.fireballs.some(f => !f.done && f.z > g.player().z - 14)) break; }
    settle(g);
  }) },
  { key: 'golem', ru: '5 миров — 5 боссов', en: '5 worlds, 5 bosses', go: (p) => p.evaluate(() => { // лавовый голем — контрастнее ледяного
    const g = window.__game; g.freeze(true); g.level(2, 6);
    for (let i = 0; i < 1500; i++) { g.sim(1 / 60); const D = g.world.boss; if (D && D.state === 'fight' && D.act && D.act.charge > 0.6) break; }
    settle(g);
  }) },
  { key: 'night', ru: 'Сказочные ночи\nи грозы', en: 'Magical nights\nand storms', go: (p) => p.evaluate(() => { const g = window.__game; g.freeze(true); g.level(3, 1); g.sim(10); g.setDay(0.6); g.weather(); settle(g, 8); }) },
  { key: 'wings', ru: 'Лети на крыльях\nгрифона', en: 'Soar on\ngriffin wings', go: (p) => p.evaluate(() => { const g = window.__game; g.start(); g.freeze(true); g.sim(4); g.wings(); g.sim(1.6); settle(g); }) },
  { key: 'map', ru: '35 уровней\nпохода к замку', en: '35 levels on the\nroad to the castle', go: (p) => openScreen(p, '#game-quest', 'map') },
  { key: 'shop', ru: 'Шляпы, окрас, спутники\nи волшебные мечи', en: 'Hats, fur, companions\nand magic swords', go: (p) => openScreen(p, '#game-open-shop', 'shop') }
];

// экран интерфейса: игру останавливаем (иначе медленный программный рендер не даёт CSS-переходу дойти) и ждём, пока проявится
async function openScreen(p, button, name) {
  await p.evaluate(() => window.__game.freeze(true));
  await p.click(button);
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 100; i++) g.step(1 / 60); }); // лавка: камера облетает кота
  await p.waitForFunction((n) => getComputedStyle(document.querySelector('.game__screen--' + n)).opacity === '1', name, { timeout: 30000 });
  await p.waitForTimeout(300);
}

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});

// прогресс для карты и лавки: пройден первый мир и часть второго, монеты в кошельке
function seed(lang) {
  const stars = {};
  for (let i = 1; i <= 7; i++) stars['1-' + i] = i % 3 ? 3 : 2;
  for (let i = 1; i <= 3; i++) stars['2-' + i] = 3;
  localStorage.setItem('catKnight.coach', '1');
  localStorage.setItem('catKnight.settings', JSON.stringify({ lang: lang, quality: 'high' }));
  localStorage.setItem('catKnight.quest', JSON.stringify({ stars: stars }));
  localStorage.setItem('catKnight.wallet', JSON.stringify({ coins: 2480, earned: 9000 }));
  window.settle = function (g, n) { for (let i = 0; i < (n || 6); i++) g.step(1 / 60); };
}

// для кадров — без всплывающих подсказок и тостов (они разные в каждый момент)
const CLEAN = '.game__toast, .game__hint, .game__pop { display: none !important; }';

async function capture(browser, base, lang) {
  fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
  for (const s of SCENES) {
    if (ONLY && !ONLY.includes(s.key)) continue;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, locale: lang === 'ru' ? 'ru-RU' : 'en-US' });
    const log = [];
    page.on('pageerror', e => log.push(e.message));
    await page.addInitScript(seed, lang);
    await page.goto(base + '/index.html?debug&bot');
    await page.waitForFunction(() => window.__game && window.__game.state() === 'start', null, { timeout: 120000 });
    await page.addStyleTag({ content: CLEAN });
    await page.waitForTimeout(1200);
    await s.go(page);
    await page.screenshot({ path: path.join(OUT, 'raw', lang + '-' + s.key + '.png') });
    console.log(lang, s.key, log.length ? log : 'ok');
    await page.close();
  }
}

// кадр стора: небо-градиент, подпись сверху, снимок игры в светлой рамке
async function compose(browser, lang) {
  const font = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)).toString('base64');
  const targets = { ios: [1290, 2796, 128, 1010], play: [1080, 1920, 92, 700] }; // ширина, высота, кегль подписи, ширина снимка
  for (const [name, [W, H, size, shotW]] of Object.entries(targets)) {
    fs.mkdirSync(path.join(OUT, name), { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    for (const [i, s] of SCENES.entries()) {
      if (ONLY && !ONLY.includes(s.key)) continue;
      const raw = path.join(OUT, 'raw', lang + '-' + s.key + '.png');
      if (!fs.existsSync(raw)) continue;
      const img = 'data:image/png;base64,' + fs.readFileSync(raw).toString('base64');
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face { font-family: N; src: url(${font('nunito-latin.woff2')}) format('woff2'); font-weight: 200 1000; }
        @font-face { font-family: N; src: url(${font('nunito-cyrillic.woff2')}) format('woff2'); font-weight: 200 1000; unicode-range: U+0400-04FF; }
        html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
        body { background: linear-gradient(180deg, #3f86d8 0%, #7cc0ff 38%, #ffe0a8 100%); font-family: N, sans-serif;
          display: flex; flex-direction: column; align-items: center; }
        .cap { margin-top: ${Math.round(size * 0.85)}px; color: #fff; font-weight: 900; font-size: ${size}px; line-height: 1.06;
          text-align: center; white-space: pre; letter-spacing: -0.01em; text-shadow: 0 ${Math.round(size / 18)}px 0 rgba(30, 50, 110, .35); }
        .shot { margin-top: ${Math.round(size * 0.55)}px; width: ${shotW}px; border-radius: ${Math.round(shotW / 17)}px;
          border: ${Math.round(shotW / 75)}px solid #fff8ee; box-shadow: 0 ${Math.round(shotW / 30)}px ${Math.round(shotW / 12)}px rgba(20, 30, 70, .45); }
      </style></head><body><div class="cap">${s[lang]}</div><img class="shot" src="${img}"></body></html>`);
      await page.evaluate(([W, H]) => Promise.all([document.fonts.ready, document.querySelector('.shot').decode()]).then(() => { // подпись не шире кадра, снимок — в оставшуюся высоту
        const cap = document.querySelector('.cap'), shot = document.querySelector('.shot');
        let size = parseFloat(getComputedStyle(cap).fontSize);
        while (cap.scrollWidth > W * 0.92 && size > 40) cap.style.fontSize = (size -= 4) + 'px';
        const free = H - shot.getBoundingClientRect().top - H * 0.035;
        if (shot.offsetHeight > free) shot.style.width = Math.floor(shot.offsetWidth * free / shot.offsetHeight) + 'px';
      }), [W, H]);
      await page.screenshot({ path: path.join(OUT, name, lang + '-' + (i + 1) + '-' + s.key + '.png') });
    }
    await page.close();
  }
}

// графика для витрины Google Play (1024×500): название слева, справа — кадр боя с драконом
async function feature(browser, lang) {
  const raw = path.join(OUT, 'raw', lang + '-boss.png');
  if (!fs.existsSync(raw)) return;
  const font = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)).toString('base64');
  const title = lang === 'ru' ? ['Кот-рыцарь', 'Небесный замок'] : ['Cat Knight', 'Sky Castle'];
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: N; src: url(${font('nunito-latin.woff2')}) format('woff2'); font-weight: 200 1000; }
    @font-face { font-family: N; src: url(${font('nunito-cyrillic.woff2')}) format('woff2'); font-weight: 200 1000; unicode-range: U+0400-04FF; }
    html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: N, sans-serif; }
    body { background: url(data:image/png;base64,${fs.readFileSync(raw).toString('base64')}) 0px -960px / 1500px auto no-repeat, #3b6fc4; } /* дракон — справа от названия */
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(40, 80, 160, .92) 0%, rgba(60, 110, 200, .55) 42%, rgba(60, 110, 200, 0) 62%); }
    .t { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); color: #fff; text-shadow: 0 5px 0 rgba(20, 40, 100, .4); }
    .t b { display: block; font-size: 82px; font-weight: 900; line-height: 1; }
    .t span { display: block; margin-top: 10px; font-size: 44px; font-weight: 800; color: #ffe27a; }
  </style></head><body><div class="shade"></div><div class="t"><b>${title[0]}</b><span>${title[1]}</span></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, 'play', 'feature-' + lang + '.png') });
  await page.close();
}

server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const lang of ['ru', 'en']) {
    if (!COMPOSE_ONLY) await capture(browser, base, lang);
    await compose(browser, lang);
    await feature(browser, lang);
  }
  await browser.close();
  server.close();
});

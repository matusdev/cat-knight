// Адаптив интерфейса: экраны игры на телефонах, планшете, компьютере и в альбомной ориентации.
// Ищет наложения важных блоков, выход за край экрана и обрезанный текст в кнопках; снимки — check/out/layout.
// Запуск из _not_main: node check/layout.cjs [экран,…|all] [ru|en]   (экраны: start, play, pause, over, settings, shop, quests, codex, map)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const OUT = path.join(__dirname, 'out', 'layout');
const ONLY = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null;
const LANG = process.argv[3] === 'en' ? 'en' : 'ru'; // английский — те же экраны, снимки с суффиксом -en
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

const VIEWS = [
  ['android-small', 360, 640, true],
  ['iphone-se', 375, 667, true],
  ['iphone-15', 390, 844, true],
  ['iphone-max', 430, 932, true],
  ['ipad', 768, 1024, true],
  ['laptop', 1440, 900, false],
  ['desktop', 1920, 1080, false],
  ['phone-land', 844, 390, true]
];

// что на экране не должно накладываться (пары) и что должно целиком помещаться
const SCREENS = {
  start: { go: null, apart: ['.game__logo', '.game__corner--left', '.game__corner--right', '.game__menu', '.game__qcard', '.game__progress', '.game__best'], inside: ['.game__logo-title', '.game__corner--left', '.game__corner--right', '.game__menu', '.game__qcard', '.game__progress', '.game__best'] },
  play: { go: 'play', apart: ['.game__player', '.game__right', '.game__height', '.game__pad--trick', '.game__pad--sword'], inside: ['.game__player', '.game__right', '.game__height'] },
  pause: { go: 'pause', apart: [], inside: ['.game__screen--pause .game__card'] },
  over: { go: 'over', apart: [], inside: ['.game__screen--over .game__card'] },
  settings: { go: 'settings', apart: [], inside: ['.game__screen--settings .game__card'] },
  shop: { go: 'shop', apart: [], inside: ['.game__screen--shop .game__map'] },
  quests: { go: 'quests', apart: [], inside: ['.game__screen--quests .game__map'] },
  codex: { go: 'codex', apart: [], inside: ['.game__screen--codex .game__map'] },
  daily: { go: 'daily', apart: [], inside: ['.game__screen--daily .game__card'] },
  map: { go: 'map', apart: [], inside: ['.game__screen--map .game__map'] }
};

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});

server.listen(0, '127.0.0.1', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const problems = [];
  for (const [vname, w, h, touch] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, locale: LANG === 'en' ? 'en-US' : 'ru-RU' });
    await page.addInitScript((lang) => {
      localStorage.setItem('catKnight.coach', '1');
      localStorage.setItem('catKnight.settings', JSON.stringify({ lang: lang }));
      localStorage.setItem('catKnight.wallet', JSON.stringify({ coins: 2480, earned: 9000 }));
      localStorage.setItem('catKnight.best', '1552');
    }, LANG);
    await page.goto('http://127.0.0.1:' + server.address().port + '/index.html?debug&bot');
    await page.waitForFunction(() => window.__game && window.__game.state() === 'start', null, { timeout: 120000 });
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-play-state: paused !important; }' });
    for (const [sname, S] of Object.entries(SCREENS)) {
      if (ONLY && !ONLY.includes(sname)) continue;
      await page.evaluate((go) => {
        const g = window.__game, el = id => document.getElementById(id);
        g.freeze(true);
        if (go === 'play' || go === 'pause' || go === 'over') {
          if (g.state() === 'start') g.start();
          if (g.state() !== 'play') g.restart();
          g.sim(3);
          if (go === 'pause') el('game-pause').click();
          if (go === 'over') { g.fall(); for (let i = 0; i < 300 && g.state() !== 'over'; i++) g.tick(1 / 60); }
        } else if (go === 'settings') el('game-open-settings').click();
        else if (go === 'shop') el('game-open-shop').click();
        else if (go === 'quests') el('game-open-quests').click();
        else if (go === 'codex') el('game-open-codex').click();
        else if (go === 'daily') g.daily();
        else if (go === 'map') el('game-quest').click();
        for (let i = 0; i < 40; i++) g.tick(1 / 60);
        for (let i = 0; i < 2; i++) g.step(1 / 60);
      }, S.go);
      await page.waitForTimeout(150);
      const found = await page.evaluate(([S, W, H]) => {
        const out = [], rect = sel => { const n = document.querySelector(sel); if (!n) return null; const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = n.getBoundingClientRect(); return r.width && r.height ? r : null; };
        for (let i = 0; i < S.apart.length; i++) for (let j = i + 1; j < S.apart.length; j++) {
          const a = rect(S.apart[i]), b = rect(S.apart[j]);
          if (!a || !b) continue;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) out.push('наложение ' + S.apart[i] + ' и ' + S.apart[j] + ' (' + Math.round(ox) + '×' + Math.round(oy) + ')');
        }
        S.inside.forEach(sel => { const r = rect(sel); if (r && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) out.push('за краем ' + sel + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round) + ']'); });
        // текст кнопок и строк не обрезан
        document.querySelectorAll('.game__btn, .game__buy, .game__seg button, .game__tabs button, .game__mbtn span').forEach(n => {
          const r = n.getBoundingClientRect();
          if (!r.width || getComputedStyle(n).visibility === 'hidden' || n.closest('[style*="display: none"]')) return;
          let vis = true; for (let p = n; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { vis = false; break; } }
          if (vis && n.scrollWidth > n.clientWidth + 2) out.push('текст не влезает: «' + n.textContent.trim().slice(0, 24) + '»');
        });
        return out;
      }, [S, w, h]);
      await page.screenshot({ path: path.join(OUT, vname + '-' + sname + (LANG === 'en' ? '-en' : '') + '.png'), timeout: 120000 });
      found.forEach(f => problems.push(vname + ' / ' + sname + ': ' + f));
      if (sname === 'start' && !(touch && w > h)) { // режим — настоящим нажатием (экран меню пропускает нажатия насквозь); телефон боком закрыт просьбой повернуть
        for (const v of ['run', 'hop', 'mix']) {
          const b = page.locator('#game-modes button[data-v="' + v + '"]');
          if (touch) await b.tap(); else await b.click();
          const on = await page.evaluate(() => [...document.querySelectorAll('#game-modes button.is-on')].map(x => x.dataset.v).join());
          if (on !== v) problems.push(vname + ' / start: режим «' + v + '» не включается нажатием (' + on + ')');
        }
      }
      // назад на заставку
      await page.evaluate((go) => {
        const g = window.__game, el = id => document.getElementById(id), close = document.querySelector('.game__screen--' + go + ' .game__close, #game-map-back, #game-set-done');
        if (go === 'settings') el('game-set-done').click();
        else if (go === 'shop' || go === 'quests' || go === 'codex') document.querySelector('.game__screen--' + go + ' .game__close').click();
        else if (go === 'daily') { el('game-daily-claim').click(); el('game-daily-claim').click(); } // забрать — «Отлично»
        else if (go === 'map') el('game-map-back').click();
        else if (go === 'pause') el('game-pause-menu').click();
        else if (go === 'over') el('game-over-menu').click();
        else if (go === 'play') { el('game-pause').click(); el('game-pause-menu').click(); }
        for (let i = 0; i < 20; i++) g.tick(1 / 60);
      }, S.go);
    }
    await page.close();
    console.log(vname, 'готово');
  }
  console.log(problems.length ? 'Найдено ' + problems.length + ':\n  ' + problems.join('\n  ') : 'Наложений и выходов за край нет');
  await browser.close();
  server.close();
});

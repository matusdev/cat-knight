// Автопроверка игры — страховка перед каждым изменением. Запуск из _not_main: npm run check
// (сначала пересобирает JS, затем запускает этот файл; только проверка без сборки — node check/check.cjs).
//
// Поднимает локальный сервер, открывает игру в headless Chrome с программной отрисовкой, бот проходит дистанцию.
// Проверяет: в консоли нет ошибок и предупреждений; дорога, острова, замок и кот — из моделей; бот уходит дальше 300 м
// и собирает серию точных приземлений (комбо), докручивает трюки; одолевает Пламенного дракона, отбивая его огонь; проходит новые ловушки (лёд, бочка, призрачный остров, секира); проходит уровень кампании (та же дорога при повторе) и её финал; в забеге сменяются биомы;
// режимы забега: на виадуке бот проходит каждое препятствие (барьер, арка — подкатом, провал, бочка, пёс, огонь, призрак, лёд) без потерь
// и одолевает босса на бегу, бегает по верхним виадукам и рядом с ними (под помост хода нет); в смешанном бег и прыжки чередуются;
// цикл «падение → Ещё раз» работает; build/playable.html (если собран) запускается сам по себе.
// Пишет check/out/: скриншоты (старт, дистанция, закат, ночь, широкий экран) и report.json.
// FPS здесь не показателен — отрисовка программная; вызовы отрисовки и треугольники — точные.
// Нужен Chromium для Playwright: если его нет — npx playwright-core install chromium.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const MIN_DIST = 300;
const STYLE = { // режим забега в настройках — до скриптов игры (по умолчанию «Смешанный»)
  hop: () => { try { localStorage.setItem('catKnight.settings', JSON.stringify({ style: 'hop' })); } catch (e) {} },
  run: () => { try { localStorage.setItem('catKnight.settings', JSON.stringify({ style: 'run' })); } catch (e) {} }
};

const failures = [];
const fail = msg => { failures.push(msg); console.log('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// страница игры + журнал консоли; ждёт, пока игра дойдёт до состояния play
async function open(browser, url, opts, init) {
  const page = await browser.newPage(opts || MOBILE);
  page.setDefaultTimeout(120000); // программный рендер теста (SwiftShader): отдельные кадры — по несколько секунд (сборка шейдеров), снимок ждёт кадр
  const log = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => log.push('pageerror: ' + e.message));
  if (init) await page.addInitScript(init); // до скриптов игры: например, настройки в localStorage
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state() === 'play', null, { timeout: 90000 });
  return { page, log };
}

// вызовы отрисовки и треугольники одного кадра — сумма трёх проходов (тени входят в проход дороги)
function frameStats(page) {
  return page.evaluate(() => new Promise(done => {
    const r = window.__game.renderer, orig = r.render.bind(r), passes = [];
    r.info.autoReset = false;
    r.render = function (s, c) {
      r.info.reset();
      orig(s, c);
      passes.push({ calls: r.info.render.calls, tris: r.info.render.triangles });
    };
    requestAnimationFrame(() => {
      r.render = orig;
      r.info.autoReset = true;
      done({ calls: passes.reduce((a, p) => a + p.calls, 0), triangles: passes.reduce((a, p) => a + p.tris, 0), passes });
    });
  }));
}

// в исходнике нет вызова $( — есть только $$( (одиночный $ не определён: так теряется символ при правке через оболочку)
function lintSource() {
  const dir = path.join(ROOT, 'frontend/js'), bad = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => { if (/(^|[^$\w])\$\(/.test(line)) bad.push(f + ':' + (i + 1)); });
  });
  return bad;
}

// словарь: у RU и EN одни и те же ключи; всё, что код и разметка просят через tr()/data-i18n, в нём есть
function lintI18n() {
  const js = path.join(ROOT, 'frontend/js'), src = fs.readFileSync(path.join(js, 'i18n.js'), 'utf8');
  const keysOf = name => {
    const from = src.indexOf('var ' + name + ' = {'), to = src.indexOf('\n};', from);
    return new Set([...src.slice(from, to).matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]));
  };
  const RU = keysOf('RU'), EN = keysOf('EN'), used = new Set(), problems = [];
  const isKey = s => /^[a-z]+(\.[a-zA-Z0-9-]+)+$/.test(s);
  fs.readdirSync(js).filter(f => f.endsWith('.js') && f !== 'i18n.js').forEach(f => {
    const code = fs.readFileSync(path.join(js, f), 'utf8');
    for (const m of code.matchAll(/\btr\(([^()]*)/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) if (isKey(q[1])) used.add(q[1]);
    for (const m of code.matchAll(/(?:name|tip): '([^']+)'/g)) if (isKey(m[1])) used.add(m[1]); // биомы, подсказки уровней, боссы
  });
  for (const m of fs.readFileSync(path.join(ROOT, 'frontend/pug/index.pug'), 'utf8').matchAll(/data-i18n(?:-html|-label)?='([^']+)'/g)) used.add(m[1]);
  ['ice', 'ghost', 'keg', 'axe', 'axe.run', 'ghost.run', 'keg.run', 'barrier', 'lowbar'].forEach(k => used.add('trap.' + k)); // tr('trap.' + p.type + run)
  ['fire', 'frost', 'spike', 'dog', 'keg', 'axe', 'barrier', 'lowbar'].forEach(k => used.add('hurt.' + k)); // tr('hurt.' + kind)
  used.forEach(k => { if (!RU.has(k)) problems.push('нет в словаре: ' + k); });
  RU.forEach(k => { if (!EN.has(k)) problems.push('нет перевода: ' + k); });
  EN.forEach(k => { if (!RU.has(k)) problems.push('лишний в EN: ' + k); });
  return { problems, ru: RU.size, used: used.size };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const bad = lintSource();
  bad.length ? fail('вызов $( вместо $$( — ' + bad.join(', ')) : ok('исходник: одиночных $( нет');
  const dict = lintI18n();
  dict.problems.length ? fail('словарь: ' + dict.problems.join(', ')) : ok('словарь: ' + dict.ru + ' строк на русском и английском, код просит ' + dict.used);
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = { date: new Date().toISOString() };
  try {
    console.log('Забег бота (смешанный режим, без потери жизней):');
    const run = await open(browser, base + '?debug=play&bot&god');
    const p = run.page;
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(OUT, '1-start.png') });
    const loaded = await p.evaluate(() => ({ bridge: !!window.__game.models.bridge, islands: !!window.__game.models.islands, castle: !!window.__game.models.castle, cat: !!window.__game.models.cat, dog: !!window.__game.models.dog, enemies: !!window.__game.models.enemies, traps: !!window.__game.models.traps, decks: !!window.__game.models.decks, gates: !!window.__game.models.gates }));
    loaded.bridge ? ok('дорога — из модели моста') : fail('модель моста не загрузилась — дорога процедурная');
    loaded.islands ? ok('боковые острова — из модели') : fail('модель островов не загрузилась — острова процедурные');
    loaded.castle ? ok('замок — из модели') : fail('модель замка не загрузилась — замок процедурный');
    loaded.cat ? ok('кот — из модели') : fail('модель кота не загрузилась — кот из простых фигур');
    loaded.dog ? ok('пёс — из модели') : fail('модель пса не загрузилась — пёс из простых фигур');
    loaded.enemies ? ok('ворона, летучая мышь, драконы — из модели') : fail('модель врагов не загрузилась — враги из простых фигур');
    loaded.traps ? ok('ловушки (бочка, секира, ворота) — из модели') : fail('модель ловушек не загрузилась — ловушки из простых фигур');
    loaded.decks ? ok('верхние виадуки (камень и дерево) — из модели') : fail('модель верхних виадуков не загрузилась — помост из брусков');
    loaded.gates ? ok('большие ворота — из модели') : fail('модель больших ворот не загрузилась — колонны с балкой');
    report.frame = await frameStats(p);
    ok('кадр: ' + report.frame.calls + ' вызовов отрисовки, ' + Math.round(report.frame.triangles / 1000) + ' тыс. треугольников');
    report.run = await p.evaluate(() => window.__game.sim(60));
    report.run.dist >= MIN_DIST ? ok('за 60 с бот прошёл ' + report.run.dist + ' м') : fail('бот прошёл только ' + report.run.dist + ' м (нужно ≥ ' + MIN_DIST + ')');
    report.run.bestCombo >= 3 ? ok('комбо: лучшая серия — ' + report.run.bestCombo + ' оч.') : fail('комбо не складывается: лучшая серия ' + report.run.bestCombo + ' (бот меняет колонку и целится в центр, ждём ≥ 3)');
    const ev = report.run.events || {};
    ev.trick > 0 ? ok('трюки: докручено и засчитано ' + ev.trick + ', сорвано ' + (ev.crash || 0)) : fail('бот не засчитал ни одного трюка');
    ok('события забега: ' + Object.keys(ev).map(k => k + ' ' + ev[k]).join(', '));
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, '2-distance.png') });
    await p.evaluate(() => window.__game.setDay(0.4));
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, '3-sunset.png') });
    await p.evaluate(() => window.__game.setDay(0.57));
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, '4-night.png') });
    await p.setViewportSize({ width: 1264, height: 842 });
    await p.evaluate(() => window.__game.setDay(0.1));
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, '5-wide.png') });
    run.log.length ? fail('консоль: ' + run.log.join(' | ')) : ok('консоль чистая');
    await p.close();

    console.log('Пламенный дракон (прыжки; бот отбивает огонь мечом):');
    const bs = await open(browser, base + '?debug=play&bot&god', null, STYLE.hop);
    report.boss = await bs.page.evaluate(() => {
      const g = window.__game;
      g.sim(3);
      g.boss();
      for (let i = 0; i < 60 && !g.world.bosses && !(g.world.boss && g.world.boss.state === 'leave'); i++) g.sim(1);
      return { bosses: g.world.bosses, events: g.sim(0).events };
    });
    const bev = report.boss.events || {}, parried = (bev.parry || 0) + (bev.parryPerfect || 0);
    report.boss.bosses > 0 ? ok('босс повержен, отбито шаров: ' + parried) : fail('бот не одолел босса (отбито шаров: ' + parried + ')');
    bs.log.length ? fail('консоль: ' + bs.log.join(' | ')) : ok('консоль чистая');
    await bs.page.close();

    console.log('Ловушки (прыжки; каждая — в ближайшем ряду, бот проходит её):');
    const tr = await open(browser, base + '?debug=play&bot&god', null, STYLE.hop);
    report.traps = await tr.page.evaluate(() => {
      const g = window.__game, out = {};
      g.sim(2);
      ['ice', 'keg', 'ghost', 'axe'].forEach(kind => {
        g.trap(kind);
        const seen = () => g.world.rows.some(row => kind === 'axe' ? row.axe : row.plats.some(p => kind === 'keg' ? p.keg : p.type === kind));
        let ok = false;
        for (let i = 0; i < 40 && !ok; i++) { g.sim(0.5); ok = seen(); }
        g.sim(16); // ловушка генерируется в ~90 м впереди — бот доходит до неё и проходит
        out[kind] = ok;
      });
      out.events = g.sim(0).events;
      out.state = g.state();
      return out;
    });
    const tev = report.traps.events || {};
    ['ice', 'keg', 'ghost', 'axe'].every(k => report.traps[k]) ? ok('все четыре построены; лёд ' + (tev.ice || 0) + ', бочек разрублено ' + (tev.kegCut || 0) + ', взорвалось под котом ' + (tev.kegBoom || 0) + ', секира попала ' + (tev.axeHit || 0)) : fail('не построились: ' + ['ice', 'keg', 'ghost', 'axe'].filter(k => !report.traps[k]).join(', '));
    tr.log.length ? fail('консоль: ' + tr.log.join(' | ')) : ok('консоль чистая');
    await tr.page.close();

    console.log('Бег по виадуку (каждое препятствие во всех трёх колонках — без потерь):');
    const rn = await open(browser, base + '?debug=play&bot', null, STYLE.run);
    report.runner = await rn.page.evaluate(() => {
      const g = window.__game, P = g.player(), out = {};
      g.world.bossAt = 1e9; // босс — отдельно ниже
      g.sim(2);
      const pass = kind => { // одно препятствие во всех колонках: построилось, бот прошёл без потерь (по дороге к нему — тоже)
        const lost0 = JSON.stringify(g.sim(0).lost);
        g.trap(kind);
        for (let i = 0; i < 40 && g.world.forceTrap; i++) g.sim(0.1);
        const row = g.world.rows.filter(r => r.road && (kind === 'gap' ? r.gaps.length === 3 : r.plats.length === 3 && r.plats.every(p => p.obstacle ? p.obstacle.kind === kind : kind === 'keg' ? p.keg : kind === 'dog' ? p.dog : p.type === kind))).pop();
        for (let i = 0; i < 40 && row && P.z > row.z - 4; i++) g.sim(0.5);
        return !row ? 'не построено' : P.z > row.z ? 'не дошёл' : JSON.stringify(g.sim(0).lost) !== lost0 ? 'потеря ' + JSON.stringify(g.sim(0).lost) : 'ok';
      };
      ['barrier', 'lowbar', 'gap', 'keg', 'dog', 'fire', 'ghost', 'ice'].forEach(kind => {
        out[kind] = pass(kind);
        if (out[kind] !== 'ok') out[kind] = pass(kind) === 'ok' ? 'ok' : out[kind]; // бот не идеален в редких сочетаниях (секира рядом, летун) — ещё попытка
      });
      // низкая арка: голова кота в подкате проходит под перемычкой (низ — 1,08 м над плитой), а не сквозь неё
      // (до трёх попыток: если кот подлетел к арке в прыжке через что-то перед ней, он проходит над ней — замера нет)
      let archTop = 0;
      for (let k = 0; k < 3 && !archTop; k++) {
        g.trap('lowbar');
        let arch = null;
        for (let i = 0; i < 600 && !arch; i++) { g.tick(1 / 60); arch = g.world.rows.filter(r => r.road && r.z < P.z - 3 && r.plats.length === 3 && r.plats.every(p => p.obstacle && p.obstacle.kind === 'lowbar')).pop(); }
        for (let i = 0; i < 600 && arch && P.z > arch.z - 0.6; i++) { g.tick(1 / 60); if (Math.abs(P.z - arch.z) < 0.3 && P.y < arch.y + 0.3 && P.slide > 0 && P.slide < 0.58 && P.grounded) archTop = Math.max(archTop, g.catTop(true)); } // в подкате (уже лёг: подкат начат больше 0,12 с назад; неуязвимый после полёта мог пробежать стоя)
      }
      out.archTop = +archTop.toFixed(2);
      const res = g.sim(0);
      return { traps: out, events: res.events, dist: res.dist, state: res.state, move: P.move };
    });
    const at = report.runner.traps.archTop; delete report.runner.traps.archTop;
    at > 0 && at < 1.03 ? ok('под низкой аркой голова ниже перемычки: верх кота ' + at + ' м при низе перемычки 1,08 м') : fail('под низкой аркой верх кота ' + at + ' м — задевает перемычку (низ 1,08 м)');
    const rr = report.runner, bad = Object.keys(rr.traps).filter(k => rr.traps[k] !== 'ok');
    !bad.length && rr.move === 'run' ? ok('все восемь пройдены на бегу (' + rr.dist + ' м): ловко — ' + (rr.events.dodge || 0) + ', бочек разрублено ' + (rr.events.kegCut || 0) + ', лёд ' + (rr.events.ice || 0)) : fail('бег: ' + bad.map(k => k + ' — ' + rr.traps[k]).join(', ') + (rr.move !== 'run' ? '; кот не бежит (' + rr.move + ')' : ''));
    report.decks = await rn.page.evaluate(() => { // верхние виадуки: бот бегает по ним и рядом без потерь; под помостом кот не оказывается
      const g = window.__game;
      g.restart(); // свой забег с начала: сложность — как у игрока, который дошёл до помостов, а не после всех ловушек выше
      g.world.bossAt = 1e9;
      g.sim(1);
      const P = g.player(), fall0 = g.sim(0).lost.fall || 0, X = [-2.2, 0, 2.2], L0 = (window.__losses || []).length; // падения — с настила или в провал после него
      let top = 0, decks = 0, under = 0, out = 0;
      const kinds = {};
      for (let t = 0; t < 240; t++) {
        if (t % 24 === 0) g.deck(t % 48 ? 'wood' : 'stone'); // по очереди: каменный и деревянный
        g.sim(0.25);
        const r = g.world.rows.find(q => q.road && Math.abs(q.z - P.z) <= 1.3);
        if (r && r.upper) {
          kinds[r.upper.kind] = 1;
          if (!r.upper.ramp && P.grounded && !P.flight && P.y > r.y + 1.9 && P.y < r.y + 2.7 && Math.abs(P.x - X[r.upper.lane]) > 0.9) out++; // стоит на самом настиле (не летит на крыльях над ним) // на настиле — не за парапетом (запрыгнувшего с края парапет за долю секунды сводит к середине)
          if (t % 4 === 0) decks++;
          if (P.y > r.y + 1.9 && t % 4 === 0) top++;
          if (!r.upper.ramp && P.y < r.y + 1 && Math.abs(P.x - X[r.upper.lane]) < 1.4) under++; // на дороге под настилом
        }
      }
      const ok = (g.sim(0).lost.fall || 0) === fall0 && !under && !out;
      return { decks: decks, top: top, under: under, out: out, kinds: Object.keys(kinds).sort().join(), ok: ok, lost: g.sim(0).lost,
        why: ok ? undefined : (window.__losses || []).slice(L0).map(x => x.kind + ' x' + x.x + ' y' + x.y + ' | ' + x.rows.slice(0, 4).join(' | ')) }; // где и что было при потерях
    });
    const dk = report.decks;
    dk.decks > 5 && dk.ok && dk.kinds === 'stone,wood' ? ok('верхние виадуки (каменный и деревянный): над ними — ' + dk.decks + ' с, из них наверху ' + dk.top + ' с, без падений, под настил и за парапет не попал') : fail('верхние виадуки: ' + JSON.stringify(dk));
    report.runBoss = await rn.page.evaluate(() => {
      const g = window.__game;
      g.world.bossAt = 0;
      for (let i = 0; i < 70 && !g.world.bosses && !(g.world.boss && g.world.boss.state === 'leave') && g.state() === 'play'; i++) g.sim(1);
      const res = g.sim(0);
      return { bosses: g.world.bosses, lives: res.lives, parried: (res.events.parry || 0) + (res.events.parryPerfect || 0), state: res.state };
    });
    const rb = report.runBoss;
    rb.bosses > 0 ? ok('босс на бегу повержен: отбито шаров ' + rb.parried + ', жизней ' + rb.lives) : fail('босс на бегу: ' + JSON.stringify(rb));
    report.runOver = await rn.page.evaluate(() => { // без жизней на бегу кот проваливается → финал
      const g = window.__game;
      g.fall();
      for (let i = 0; i < 40 && g.state() === 'play'; i++) g.sim(0.1);
      for (let i = 0; i < 150 && g.state() === 'fall'; i++) g.tick(1 / 60); // камера провожает падение 1,3 с
      return g.state();
    });
    report.runOver === 'over' ? ok('последняя жизнь на бегу — финал') : fail('без жизней на бегу игра не кончилась (' + report.runOver + ')');
    rn.log.length ? fail('консоль: ' + rn.log.join(' | ')) : ok('консоль чистая');
    await rn.page.close();

    console.log('Смешанный режим (бег и прыжки чередуются):');
    const mx = await open(browser, base + '?debug=play&bot&god');
    report.mix = await mx.page.evaluate(() => {
      const g = window.__game, P = g.player(), seq = [];
      for (let t = 0; t < 70; t++) {
        g.sim(1);
        if (!P.flight && seq[seq.length - 1] !== P.move) seq.push(P.move);
      }
      return { seq: seq.join(' → '), switches: seq.length - 1, dist: g.sim(0).dist };
    });
    const mxr = report.mix;
    mxr.switches >= 2 && mxr.seq.startsWith('run') ? ok('за 70 с ' + mxr.dist + ' м: ' + mxr.seq) : fail('смешанный: ' + JSON.stringify(mxr));
    mx.log.length ? fail('консоль: ' + mx.log.join(' | ')) : ok('консоль чистая');
    await mx.page.close();

    console.log('Кампания и биомы:');
    const qp = await open(browser, base + '?debug=play&bot&god');
    report.quest = await qp.page.evaluate(() => {
      const g = window.__game, out = {}, rows = () => JSON.stringify(g.world.rows.slice(0, 10).map(r => [r.z.toFixed(2), r.plats.map(p => p.type + p.lane).join()]));
      g.sim(1);
      for (let i = 0; i < 12 && g.biome() === 'sky'; i++) g.sim(10); // забег: после 500 м — ледяные пики
      out.runBiome = g.biome();
      out.runDist = g.sim(0).dist;
      const P = g.player(), c0 = P.coins, l0 = P.lives;
      g.wings(); // крылья грифона: полёт, дорожка монет, посадка на надёжный остров
      let landed = false; // после посадки бот может подобрать новые крылья — посадка засчитана, если была
      for (let t = 0; t < 9; t++) { g.sim(1); if (!P.flight) landed = true; }
      out.flight = { coins: P.coins - c0, lost: l0 - P.lives, landed: landed && g.state() === 'play' };
      for (let i = 0; i < 16 && P.flight; i++) g.sim(0.5); // в полёте не падают — дождаться посадки
      g.bonus('bubble'); // пузырь: падение не отнимает жизнь
      P.fury = 0; // идёт «ярость» — ошибку простила бы она, а не пузырь
      const l1 = P.lives; P.grounded = false; P.target && (P.y = P.target.y - 6); g.sim(0.2); // на бегу — снять с плиты, иначе встанет обратно
      out.bubble = { lost: l1 - P.lives, popped: !P.bubble };
      g.bonus('double'); const c1 = P.coins; g.sim(3); out.double = P.double > 0 || P.coins > c1;
      g.level(0, 0);
      const first = rows();
      for (let i = 0; i < 20 && g.state() === 'play'; i++) g.sim(3);
      out.win = g.state();
      out.stars = g.quest().stars['1-1'] || 0;
      g.level(0, 0);
      out.same = rows() === first;
      g.level(4, 6);
      for (let i = 0; i < 20 && g.state() === 'play'; i++) g.sim(3);
      out.bossWin = g.state();
      // боссы миров: пёс, ледяной и лавовый големы, призрак; стоящие на скале не уходят в острова под собой
      // (низ босса — D.foot от его точки; острова — в пределах опоры D.footR)
      const sink = (B) => {
        if (!B || B.def.fly || B.state === 'enter' || B.state === 'down') return 0;
        let top = -1e9;
        g.world.rows.forEach(row => {
          if (Math.abs(row.z - B.z) > B.footR + 1.3) return;
          row.plats.forEach(p => { if (p.mesh.visible && Math.abs(p.x - B.x) < B.footR + p.w / 2) top = Math.max(top, p.y); });
        });
        return Math.max(0, top - (B.y + B.foot));
      };
      out.sink = 0;
      out.bosses = [0, 1, 2, 3].map(function (w) {
        let kind = '?';
        g.level(w, 6);
        for (let i = 0; i < 300 && g.state() === 'play'; i++) { g.sim(0.25); if (g.world.boss) { kind = g.world.boss.kind; out.sink = Math.max(out.sink, sink(g.world.boss)); } }
        return kind + ':' + g.state();
      });
      return out;
    });
    const q = report.quest;
    q.win === 'win' && q.stars > 0 ? ok('уровень 1-1 пройден, звёзд: ' + q.stars + '; при повторе та же дорога: ' + (q.same ? 'да' : 'нет')) : fail('уровень 1-1 не пройден (' + q.win + ')');
    if (!q.same) fail('уровень при повторе строится иначе');
    q.bossWin === 'win' ? ok('финал кампании — Пламенный дракон повержен') : fail('финал кампании не пройден (' + q.bossWin + ')');
    q.bosses.join() === 'dog:win,golem:win,lava:win,ghost:win' ? ok('боссы миров повержены: пёс, ледяной и лавовый големы, призрак') : fail('боссы миров: ' + q.bosses.join(', '));
    q.sink < 0.05 ? ok('боссы на скалах не уходят в острова под собой') : fail('босс ушёл в острова на ' + q.sink.toFixed(2) + ' м');
    q.flight.landed && q.flight.lost === 0 && q.flight.coins > 20 ? ok('крылья грифона: монет за полёт ' + q.flight.coins + ', посадка без потерь') : fail('полёт: ' + JSON.stringify(q.flight));
    q.bubble.lost === 0 && q.bubble.popped ? ok('пузырь спас от падения') : fail('пузырь: ' + JSON.stringify(q.bubble));
    q.runBiome === 'ice' ? ok('забег: на ' + q.runDist + ' м — «Ледяные пики»') : fail('забег: биом не сменился (' + q.runBiome + ' на ' + q.runDist + ' м)');
    qp.log.length ? fail('консоль: ' + qp.log.join(' | ')) : ok('консоль чистая');
    await qp.page.close();

    console.log('Свечение (графика «Красиво»):');
    const gp = await open(browser, base + '?debug=play&bot', null, () => { try { localStorage.setItem('catKnight.settings', JSON.stringify({ quality: 'high' })); } catch (e) {} });
    await gp.page.evaluate(() => window.__game.sim(4));
    report.glow = await gp.page.evaluate(() => { // кадр через EffectComposer: не пустой (NaN в HDR-кадре стёр бы его целиком)
      const g = window.__game, gl = g.renderer.getContext();
      g.freeze(true);
      g.step(1 / 60);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let empty = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) empty++;
      return { on: g.bloom.on, empty: +(empty / (w * h)).toFixed(4) };
    });
    await gp.page.screenshot({ path: path.join(OUT, '6-glow.png') });
    report.glow.on && report.glow.empty < 0.01 ? ok('свечение включено, кадр целый') : fail('свечение: ' + JSON.stringify(report.glow));
    const gpLog = gp.log.filter(l => !/stall due to ReadPixels/.test(l)); // предупреждение от самой проверки (readPixels)
    gpLog.length ? fail('консоль: ' + gpLog.join(' | ')) : ok('консоль чистая');
    await gp.page.close();

    console.log('Монеты и облака на экране:');
    const vp = await open(browser, base + '?debug=play&bot&god');
    report.view = await vp.page.evaluate(() => {
      const g = window.__game, cam = g.camera, S = g.scenery(), V = cam.position.constructor, tmp = new V();
      g.freeze(true);
      let pairs = 0, stuck = 0, frames = 0, cuts = 0;
      for (let f = 0; f < 60 * 40; f++) {
        g.sim(1 / 60);
        if (f % 10) continue;
        frames++;
        cam.updateMatrixWorld();
        const P = g.player(), inv = cam.matrixWorldInverse, arcs = new Map();
        // монеты одной дуги: расстояние на экране между соседними против диаметра ближней (меньше — слиплись)
        g.world.coins.forEach(c => { if (c.arc && !c.taken && c.z < P.z - 2 && c.z > P.z - 22) { if (!arcs.has(c.arc)) arcs.set(c.arc, []); arcs.get(c.arc).push(c); } });
        arcs.forEach(list => {
          list.sort((a, b) => b.z - a.z);
          for (let i = 1; i < list.length; i++) {
            const a = new V(list[i - 1].x, list[i - 1].y, list[i - 1].z), b = new V(list[i].x, list[i].y, list[i].z), d = a.distanceTo(cam.position);
            const pa = a.clone().project(cam), pb = b.clone().project(cam), h = innerHeight;
            const px = Math.hypot((pa.x - pb.x) * innerWidth / 2, (pa.y - pb.y) * h / 2), diam = 0.6 / (2 * d * Math.tan(cam.fov * Math.PI / 360)) * h;
            pairs++;
            if (px < diam) stuck++;
          }
        });
        // видимое облако-плоскость сквозь габарит острова (в координатах камеры) — прямая линия среза
        const boxes = S.islands.map(is => is.mesh).concat(S.decor.filter(d => d.kind === 'mini').map(d => d.mesh)).map(o => {
          const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
          o.updateMatrixWorld(true);
          o.traverse(m => {
            if (!m.isMesh) return;
            m.geometry.computeBoundingBox();
            const gb = m.geometry.boundingBox;
            for (let i = 0; i < 8; i++) {
              tmp.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
              b.x0 = Math.min(b.x0, tmp.x); b.x1 = Math.max(b.x1, tmp.x); b.y0 = Math.min(b.y0, tmp.y); b.y1 = Math.max(b.y1, tmp.y); b.z0 = Math.min(b.z0, tmp.z); b.z1 = Math.max(b.z1, tmp.z);
            }
          });
          return b;
        });
        S.clouds.forEach(c => {
          const a = c.s ? c.s.material.opacity / 0.35 : S.roadClouds.alpha[c.i] / (c.a0 || 1), size = c.s ? c.s.scale.x : S.roadClouds.size[c.i];
          if (!(a > 0.15)) return;
          const v = new V(c.x, c.y, c.z).applyMatrix4(inv), hw = size * 0.4, hh = size * 0.58 * 0.36;
          if (v.z > -3 || v.z < -100) return;
          boxes.forEach(b => { if (v.z > b.z0 && v.z < b.z1 && b.x1 > v.x - hw && b.x0 < v.x + hw && b.y1 > v.y - hh && b.y0 < v.y + hh) cuts++; });
        });
      }
      return { pairs, stuck, cutsPerFrame: +(cuts / frames).toFixed(3) };
    });
    const vw = report.view;
    vw.pairs > 20 && vw.stuck / vw.pairs < 0.03 ? ok('монеты дугой не слипаются: ' + vw.stuck + ' из ' + vw.pairs + ' пар ближе диаметра') : fail('монеты слипаются: ' + JSON.stringify(vw));
    vw.cutsPerFrame < 0.08 ? ok('облака не режут острова: ' + vw.cutsPerFrame + ' пересечения на кадр') : fail('облака режут острова: ' + vw.cutsPerFrame + ' на кадр');
    vp.log.length ? fail('консоль: ' + vp.log.join(' | ')) : ok('консоль чистая');
    await vp.page.close();

    console.log('Мост с приложением (WebView в mobile/):');
    const br = await open(browser, base + '?debug=play', null, () => { // как в приложении: ReactNativeWebView до скриптов игры
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: m => window.__sent.push(JSON.parse(m)) };
    });
    report.bridge = await br.page.evaluate(() => {
      const g = window.__game, send = (type, data) => window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, data: data || {} }) }));
      g.freeze(true);
      send('tilt', { beta: 30, gamma: 0 }); // первое показание — «прямо» (калибровка)
      g.sim(1.5);
      const x0 = g.player().x;
      for (let i = 0; i < 45; i++) { send('tilt', { beta: 30, gamma: 25 }); g.sim(1 / 30); } // наклон вправо
      const dx = g.player().x - x0;
      g.freeze(false);
      send('pause');
      return { ready: window.__sent.some(m => m.type === 'ready'), dx: +dx.toFixed(2), state: g.state() };
    });
    const bg = report.bridge;
    bg.ready && bg.dx > 0.5 && bg.state === 'pause' ? ok('игра ответила «ready», наклон из приложения рулит (+' + bg.dx + ' м), «pause» ставит паузу') : fail('мост: ' + JSON.stringify(bg));
    br.log.length ? fail('консоль: ' + br.log.join(' | ')) : ok('консоль чистая');
    await br.page.close();

    console.log('Падение и «Ещё раз»:');
    const cyc = await open(browser, base + '?debug=play&bot');
    await cyc.page.evaluate(() => window.__game.sim(10));
    await cyc.page.evaluate(() => { // падение до финала — шагами игры: живые кадры в программном рендере идут рывками по секунде
      const g = window.__game;
      g.fall();
      for (let i = 0; i < 900 && g.state() !== 'over'; i++) g.tick(1 / 60);
    });
    await cyc.page.waitForFunction(() => window.__game.state() === 'over', null, { timeout: 60000 });
    await cyc.page.evaluate(() => document.getElementById('game-again').click()); // кнопка пульсирует — щелчок из страницы
    await cyc.page.waitForFunction(() => window.__game.state() === 'play', null, { timeout: 30000 });
    report.restart = await cyc.page.evaluate(() => window.__game.sim(10));
    report.restart.state === 'play' ? ok('после «Ещё раз» игра идёт (' + report.restart.dist + ' м за 10 с)') : fail('после «Ещё раз» состояние ' + report.restart.state);
    report.telemetry = await cyc.page.evaluate(() => { // аналитика: события забега записаны, отчётов об ошибках нет
      const q = window.__game.telemetry().queue, end = q.filter(e => e.e === 'run_end')[0];
      return { kinds: [...new Set(q.map(e => e.e))], errors: q.filter(e => e.e === 'error').map(e => e.d.kind + ': ' + e.d.msg), end: end && end.d };
    });
    const tl = report.telemetry;
    ['session', 'run_start', 'run_end'].every(k => tl.kinds.includes(k)) && !tl.errors.length && tl.end.dist > 0
      ? ok('аналитика: ' + tl.kinds.join(', ') + ' (забег ' + tl.end.dist + ' м, ' + tl.end.fps + ' к/с); ошибок нет')
      : fail('аналитика: ' + JSON.stringify(tl));
    cyc.log.length ? fail('консоль: ' + cyc.log.join(' | ')) : ok('консоль чистая');
    await cyc.page.close();

    const playable = path.join(ROOT, 'build', 'playable.html');
    if (fs.existsSync(playable)) {
      console.log('Playable (один файл):');
      const pl = await open(browser, 'file:///' + playable.split(path.sep).join('/').replace(/ /g, '%20') + '?debug=play&bot&god');
      const plLoaded = await pl.page.evaluate(() => !!(window.__game.models.bridge && window.__game.models.islands && window.__game.models.castle && window.__game.models.cat && window.__game.models.dog && window.__game.models.enemies && window.__game.models.traps));
      plLoaded ? ok('запускается, модели вшиты (' + (fs.statSync(playable).size / 1048576).toFixed(2) + ' МБ)') : fail('в playable нет моделей');
      pl.log.length ? fail('консоль: ' + pl.log.join(' | ')) : ok('консоль чистая');
      await pl.page.close();
    }
  } catch (e) {
    fail('проверка упала: ' + e.message.split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  report.failures = failures;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(failures.length ? '\nПРОВАЛ: ' + failures.length + ' — подробности в check/out/report.json' : '\nВсё в порядке. Скриншоты — check/out/');
  process.exit(failures.length ? 1 : 0);
})();

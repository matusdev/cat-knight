// Иконка и заставка приложения из самой игры: кот-рыцарь крупно спереди на фоне неба игры (движок игры, Playwright).
// Запуск из mobile: node scripts/icon.cjs → assets/icon.png (1024), assets/adaptive-icon.png (1024, кот с полями
// под маску Android), assets/splash.png (1284×2778). Игра должна быть собрана (index.html и public/ в корне проекта)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, '_not_main', 'node_modules', 'playwright-core'));
const ASSETS = path.join(__dirname, '..', 'assets');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});

// кадр: только холст игры; камера перед котом, один проход со всеми слоями. dist — отъезд камеры, lift — выше головы
async function shot(browser, base, w, h, dist, lift, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { localStorage.setItem('catKnight.coach', '1'); localStorage.setItem('catKnight.settings', JSON.stringify({ quality: 'high' })); });
  await page.goto(base + '/index.html?debug');
  await page.waitForFunction(() => window.__game && window.__game.state() === 'start', null, { timeout: 120000 });
  await page.addStyleTag({ content: '#game > :not(canvas) { display: none !important; }' });
  await page.evaluate(([dist, lift]) => {
    const g = window.__game, R = g.renderer, cam = g.camera, P = g.player();
    g.freeze(true);
    g.setDay(0.12);
    g.step(1 / 60);
    let scene = g.scenery().islands[0].mesh; while (scene.parent) scene = scene.parent;
    const hx = P.x, hy = P.y + 1.2, hz = P.z;
    cam.position.set(hx + dist * 0.35, hy + lift, hz - dist); // спереди (кот смотрит в −z), чуть сбоку и сверху
    cam.lookAt(hx, hy - 0.05, hz);
    cam.fov = 30;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    cam.layers.enableAll();
    R.setRenderTarget(null);
    R.clear();
    R.render(scene, cam);
  }, [dist, lift]);
  await page.screenshot({ path: out });
  await page.close();
}

server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const base = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(ASSETS, { recursive: true });
  await shot(browser, base, 512, 512, 3.6, 0.45, path.join(ASSETS, 'icon.png'));
  await shot(browser, base, 512, 512, 5.2, 0.6, path.join(ASSETS, 'adaptive-icon.png')); // под круглую маску — кот мельче
  await shot(browser, base, 642, 1389, 8, 1.2, path.join(ASSETS, 'splash.png'));
  await browser.close();
  server.close();
  console.log('иконки и заставка → ' + ASSETS);
});

// Приёмник аналитики для проверки (frontend/js/telemetry.js): пачки событий — строками JSON в _not_main/telemetry.jsonl.
// Запуск: node _not_main/telemetry-server.cjs [порт]; в CONFIG.telemetry.url — 'http://<адрес>:<порт>/collect'.
// Для релиза — настоящий сервис (Firebase, GameAnalytics) или свой сервер с HTTPS; этот — только для разработки
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.argv[2] || 8787, OUT = path.join(__dirname, 'telemetry.jsonl');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST' || req.url !== '/collect') {
    res.writeHead(req.method === 'OPTIONS' ? 204 : 404);
    return res.end();
  }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try {
      const p = JSON.parse(body);
      fs.appendFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), ...p }) + '\n');
      const errors = (p.events || []).filter(e => e.e === 'error');
      console.log(new Date().toLocaleTimeString(), p.id, (p.events || []).length + ' событий' + (errors.length ? ', ошибок: ' + errors.length : ''));
      res.writeHead(204);
    } catch (e) {
      res.writeHead(400);
    }
    res.end();
  });
}).listen(PORT, () => console.log('аналитика: http://localhost:' + PORT + '/collect → ' + OUT));

// Аналитика и отчёты об ошибках. Анонимно: случайный id устройства (catKnight.device), без имени, почты и рекламных id.
// События копятся в очереди на устройстве (catKnight.telemetry, последние MAX); если в CONFIG.telemetry.url задан адрес —
// уходят туда пачкой (sendBeacon, JSON в text/plain; пример приёмника — _not_main/telemetry-server.cjs) при скрытии
// вкладки, раз в flushEvery с и сразу после ошибки. Адреса нет — ничего никуда не уходит, очередь видна
// в __game.telemetry(). В приложении (Expo) сюда подключится Firebase или GameAnalytics — остальной код зовёт
// только event() и error()
import { CONFIG, DEBUG } from './config.js';
import { load, save } from './store.js';
import * as Native from './native.js';

var VERSION = '0.9.0', MAX = 200, MAX_ERRORS = 20;
var queue = load('telemetry', []), id = load('device', null), errors = 0, started = Date.now();
var session = Math.random().toString(36).slice(2, 10);
if (!Array.isArray(queue)) queue = [];
if (!id) {
  id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  save('device', id);
}

// событие игры: имя и плоский объект с числами и короткими строками
export function event(name, data) {
  queue.push({ e: name, s: session, t: Math.round((Date.now() - started) / 1000), d: data || {} });
  if (queue.length > MAX) queue.splice(0, queue.length - MAX);
  save('telemetry', queue);
  if (DEBUG && CONFIG.telemetry.log) console.log('[telemetry]', name, JSON.stringify(data || {}));
}

// отчёт об ошибке: вид (js, promise, webgl, audio), сообщение, начало стека; за сессию — не больше MAX_ERRORS
export function error(kind, message, stack) {
  if (errors >= MAX_ERRORS) return;
  errors++;
  event('error', {
    kind: kind,
    msg: String(message || '').slice(0, 300),
    stack: stack ? String(stack).split('\n').slice(0, 6).join('\n').slice(0, 800) : ''
  });
  flush();
}

// отправить очередь; без адреса или без sendBeacon — остаётся на устройстве до следующего раза
export function flush() {
  var url = CONFIG.telemetry.url;
  if (!queue.length || (!Native.inApp && (!url || !navigator.sendBeacon))) return false;
  var payload = {
    app: 'cat-knight', v: VERSION, id: id, ua: navigator.userAgent, lang: navigator.language,
    screen: [screen.width, screen.height, window.devicePixelRatio || 1], events: queue
  };
  if (Native.inApp) { // в приложении пачку забирает оно (дальше — Firebase или GameAnalytics)
    Native.send('telemetry', payload);
    queue = [];
    save('telemetry', queue);
    return true;
  }
  var body = JSON.stringify(payload), sent = false;
  try { sent = navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' })); } catch (e) {} // text/plain — без CORS-запроса: маяк его не умеет
  if (sent) {
    queue = [];
    save('telemetry', queue);
  }
  return sent;
}

// запуск: перехват ошибок, отправка при скрытии вкладки и по таймеру; info — устройство и настройки
export function start(info) {
  window.addEventListener('error', function (e) { error('js', e.message, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    error('promise', r && r.message ? r.message : r, r && r.stack);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  setInterval(flush, CONFIG.telemetry.flushEvery * 1000);
  event('session', info);
}

// номер установки — в настройках: по нему можно попросить удалить отправленную статистику
export function installId() { return id; }

export function debug() {
  return { id: id, session: session, url: CONFIG.telemetry.url, errors: errors, queue: queue.slice() };
}

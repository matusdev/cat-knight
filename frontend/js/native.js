// Мост с приложением (Expo, папка mobile/): игра открыта в WebView. Игра шлёт приложению вибрацию, аналитику
// и «готово»; приложение — наклон с датчиков (в WebView на iOS свои разрешения на ориентацию — проще так),
// паузу и возврат из фона. Сообщения — JSON-строки { type, data }. В браузере моста нет — всё работает по-старому
var RN = window.ReactNativeWebView, handlers = {};

export var inApp = !!(RN && RN.postMessage);

export function send(type, data) {
  if (inApp) RN.postMessage(JSON.stringify({ type: type, data: data || {} }));
}

export function on(type, fn) { handlers[type] = fn; }

function receive(e) {
  var m;
  try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
  if (m && handlers[m.type]) handlers[m.type](m.data || {});
}

if (inApp) {
  window.addEventListener('message', receive); // iOS
  document.addEventListener('message', receive); // Android
}

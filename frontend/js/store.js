// Сохранения на устройстве (localStorage) с защитой: в приватном режиме или в WebView без хранилища
// запись молча не делается, чтение возвращает значение по умолчанию. Ключи — catKnight.<имя>.
// В приложении (React Native, этап 4) сюда же подключится нативное хранилище — остальной код не меняется

var PREFIX = 'catKnight.';

export function load(name, fallback) {
  try {
    var raw = localStorage.getItem(PREFIX + name);
    if (raw == null) return fallback;
    var v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function save(name, value) {
  try { localStorage.setItem(PREFIX + name, JSON.stringify(value)); } catch (e) {}
}

// объект с полями по умолчанию: сохранённые поля поверх, новых полей (после обновления игры) — из defaults
export function loadObject(name, defaults) {
  var v = load(name, null), out = {}, k;
  for (k in defaults) out[k] = defaults[k];
  if (v && typeof v === 'object') for (k in v) if (k in defaults) out[k] = v[k];
  return out;
}

// Облачное сохранение (крючки для приложения): все сохранения игры одним объектом и обратно.
// Приложение хранит снимок в своём облаке (iCloud / Google Play Games) и при входе на новом устройстве шлёт его назад
export function snapshot() {
  var out = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) out[k.slice(PREFIX.length)] = localStorage.getItem(k);
    }
  } catch (e) {}
  return out;
}

export function restore(snap) {
  if (!snap || typeof snap !== 'object') return false;
  try {
    Object.keys(snap).forEach(function (k) { if (typeof snap[k] === 'string') localStorage.setItem(PREFIX + k, snap[k]); });
    return true;
  } catch (e) {
    return false;
  }
}

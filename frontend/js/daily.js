// Награда за вход и забег дня. Награда — раз в день, семь дней по кругу (день 4 — малый сундук, день 7 — большой);
// пропустил день — счёт с начала. Забег дня — одна и та же дорога у всех в этот день (зерно — дата), свой рекорд дня
// и таблица своих лучших дней; результат уходит в аналитику и приложению (онлайн-таблица — на его стороне)
import { load, save } from './store.js';

export var DAYS = [{ coins: 50 }, { coins: 75 }, { coins: 100 }, { chest: 'small' }, { coins: 150 }, { coins: 200 }, { chest: 'big' }];

var st = load('daily', { last: '', streak: 0 });
var runs = load('dailyRuns', {}); // дата → лучшая дистанция в забеге дня

export function today() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function days(a, b) { // сколько суток от даты a до даты b
  var p = function (s) { var x = s.split('-'); return new Date(+x[0], x[1] - 1, +x[2]).getTime(); };
  return Math.round((p(b) - p(a)) / 86400000);
}

// ready — можно забрать; day — какой день (0…6) забирается сейчас или был взят сегодня
export function status() {
  var t = today();
  if (st.last === t) return { ready: false, day: (st.streak - 1) % 7, streak: st.streak };
  var streak = st.last && days(st.last, t) === 1 ? st.streak : 0;
  return { ready: true, day: streak % 7, streak: streak };
}

export function claim() {
  var s = status();
  if (!s.ready) return null;
  st = { last: today(), streak: s.streak + 1 };
  save('daily', st);
  return DAYS[s.day];
}

export function runSeed() { return 'daily ' + today(); }

export function runBest() { return runs[today()] || 0; }

// записать дистанцию забега дня; true — новый рекорд дня
export function runResult(dist) {
  var t = today();
  if (dist <= (runs[t] || 0)) return false;
  runs[t] = dist;
  var keys = Object.keys(runs).sort();
  while (keys.length > 60) delete runs[keys.shift()]; // хранится два месяца
  save('dailyRuns', runs);
  return true;
}

// лучшие дни: [{ date, dist }] по убыванию
export function runTop(n) {
  return Object.keys(runs).map(function (k) { return { date: k, dist: runs[k] }; })
    .sort(function (a, b) { return b.dist - a.dist; }).slice(0, n || 5);
}

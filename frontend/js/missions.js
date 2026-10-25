// Задания дня и достижения. Игра сообщает события: track('trick'), track('dist', 850) в конце забега и т. п.;
// задание дня — три штуки на дату (одинаковые весь день), выполнено — награду забирают кнопкой.
// Достижения — навсегда, у каждого ступени (бронза, серебро, золото) с растущей наградой

import { load, save } from './store.js';

// вид задания: событие, сколько нужно (по ступени сложности 0…2), награда; best — за один забег (максимум), иначе — сумма за день
export var MISSION_KINDS = [
  { id: 'dist', event: 'dist', best: true, goal: [500, 900, 1400], reward: [180, 330, 570] },
  { id: 'coins', event: 'coins', goal: [300, 700, 1200], reward: [150, 300, 480] },
  { id: 'tricks', event: 'trick', goal: [5, 12, 25], reward: [150, 270, 450] },
  { id: 'flyers', event: 'flyer', goal: [3, 8, 15], reward: [150, 300, 480] },
  { id: 'dogs', event: 'dog', goal: [2, 5, 10], reward: [150, 300, 480] },
  { id: 'parry', event: 'parry', goal: [3, 8, 15], reward: [180, 330, 570] },
  { id: 'combo', event: 'combo', best: true, goal: [15, 30, 50], reward: [180, 330, 570] },
  { id: 'kegs', event: 'keg', goal: [2, 5, 10], reward: [150, 270, 450] },
  { id: 'wings', event: 'wings', goal: [1, 2, 4], reward: [180, 330, 570] },
  { id: 'levels', event: 'level', goal: [1, 3, 5], reward: [230, 390, 630] },
  { id: 'runs', event: 'run', goal: [3, 6, 10], reward: [120, 230, 360] }
];

export var ACHIEVEMENTS = [
  { id: 'dist', event: 'dist', best: true, tiers: [1000, 3000, 6000], reward: [300, 900, 2250] },
  { id: 'coins', event: 'coins', tiers: [2000, 10000, 40000], reward: [300, 900, 2250] },
  { id: 'tricks', event: 'trick', tiers: [50, 250, 1000], reward: [300, 900, 2250] },
  { id: 'flyers', event: 'flyer', tiers: [30, 150, 500], reward: [300, 900, 2250] },
  { id: 'dogs', event: 'dog', tiers: [20, 100, 300], reward: [300, 900, 2250] },
  { id: 'boss', event: 'boss', tiers: [1, 5, 20], reward: [450, 1350, 3000] },
  { id: 'combo', event: 'combo', best: true, tiers: [30, 60, 100], reward: [300, 900, 2250] },
  { id: 'stars', event: 'stars', best: true, tiers: [21, 63, 105], reward: [450, 1350, 3750] },
  { id: 'wings', event: 'wings', tiers: [10, 50, 150], reward: [300, 900, 2250] }
];

var day = load('missionsDay', null);
var ach = load('achievements', {}); // id → { n: прогресс, got: сколько ступеней забрано }

function today() {
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// три разных задания на дату: выбор по «зерну» даты, ступени сложности 0, 1, 2
function rollDay(date) {
  var s = date, pool = MISSION_KINDS.slice(), list = [];
  var rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (var i = 0; i < 3; i++) {
    var k = pool.splice((rnd() * pool.length) | 0, 1)[0];
    list.push({ id: k.id, tier: i, n: 0, claimed: false });
  }
  return { date: date, list: list };
}

function ensureDay() {
  var d = today();
  if (!day || day.date !== d) {
    day = rollDay(d);
    save('missionsDay', day);
  }
  return day;
}

function kindOf(id) { return MISSION_KINDS.filter(function (k) { return k.id === id; })[0]; }

// событие игры: event, n (по умолчанию 1); возвращает список только что выполненных заданий и ступеней достижений
export function track(event, n) {
  if (n == null) n = 1;
  var done = [];
  ensureDay().list.forEach(function (m) {
    var K = kindOf(m.id);
    if (!K || K.event !== event) return;
    var goal = K.goal[m.tier], was = m.n >= goal;
    m.n = K.best ? Math.max(m.n, n) : m.n + n;
    if (!was && m.n >= goal) done.push({ type: 'mission', id: m.id, goal: goal });
  });
  save('missionsDay', day);
  ACHIEVEMENTS.forEach(function (A) {
    if (A.event !== event) return;
    var a = ach[A.id] || (ach[A.id] = { n: 0, got: 0 }), before = tierOf(A, a.n);
    a.n = A.best ? Math.max(a.n, n) : a.n + n;
    var after = tierOf(A, a.n);
    for (var t = before; t < after; t++) done.push({ type: 'achievement', id: A.id, tier: t, goal: A.tiers[t] });
  });
  save('achievements', ach);
  return done;
}

function tierOf(A, n) {
  var t = 0;
  while (t < A.tiers.length && n >= A.tiers[t]) t++;
  return t;
}

// для экрана заданий
export function missions() {
  return ensureDay().list.map(function (m) {
    var K = kindOf(m.id);
    return { id: m.id, n: Math.min(m.n, K.goal[m.tier]), goal: K.goal[m.tier], reward: K.reward[m.tier], done: m.n >= K.goal[m.tier], claimed: m.claimed };
  });
}

export function achievements() {
  return ACHIEVEMENTS.map(function (A) {
    var a = ach[A.id] || { n: 0, got: 0 }, reached = tierOf(A, a.n), next = Math.min(a.got, A.tiers.length - 1);
    return { id: A.id, n: a.n, tier: a.got, reached: reached, goal: A.tiers[Math.min(reached, A.tiers.length - 1)], claimable: reached > a.got, reward: a.got < A.tiers.length ? A.reward[a.got] : 0, max: A.tiers.length, nextGoal: A.tiers[next] };
  });
}

// забрать награду: возвращает монеты (0 — нечего забирать)
export function claimMission(id) {
  var m = ensureDay().list.filter(function (q) { return q.id === id; })[0], K = m && kindOf(m.id);
  if (!m || m.claimed || m.n < K.goal[m.tier]) return 0;
  m.claimed = true;
  save('missionsDay', day);
  return K.reward[m.tier];
}

export function claimAchievement(id) {
  var A = ACHIEVEMENTS.filter(function (q) { return q.id === id; })[0], a = ach[id];
  if (!A || !a || tierOf(A, a.n) <= a.got) return 0;
  var r = A.reward[a.got];
  a.got++;
  save('achievements', ach);
  return r;
}

// сколько наград ждёт (значок на кнопке «Задания»)
export function pending() {
  return missions().filter(function (m) { return m.done && !m.claimed; }).length +
    achievements().filter(function (a) { return a.claimable; }).length;
}

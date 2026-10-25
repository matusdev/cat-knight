// Настройки игры и данные: CONFIG, ключевые точки суток, биомы, миры кампании

var LIGHT_K = Math.PI;

var CONFIG = {
  ctaUrl: '',                       // ссылка «Играть в полную версию» (стор); пусто — кнопка скрыта
  lanes: { x: [-2.2, 0, 2.2], half: 3.1 }, // три колонки островов; кот ходит в пределах ±half
  cat: { scale: 1.12, takeoff: 0.6 }, // масштаб модели (на физику не влияет; крупнее — кот закрывает дорогу); пауза перед первым прыжком, с
  camera: {
    fov: 60,
    height: 4.2,                    // над последним островом, на который приземлился кот, м (выше — дальше видно дорогу)
    back: 6.5,                      // позади кота
    ahead: 11,                      // точка взгляда впереди кота
    lookUp: 1.4,                    // взгляд выше — горизонт ближе к центру, над дорогой встаёт замок
    follow: 0.45,                   // какую долю бокового смещения кота повторяет камера
    margin: 1.12,                   // запас по ширине: все три колонки помещаются в экран
    minK: 1.4,                      // на широких экранах камера не ближе этого (иначе кот закрывает дорогу)
    intro: 1.2                      // облёт камеры после «Играть», с
  },
  physics: {
    step: 1 / 120,
    gravity: 28,
    jump: 12.5,                     // ≈ 2.8 м над островом
    superJump: 19,                  // гриб-батут: перелёт через два ряда
    speed: 7.5,                     // м/с вбок при полном наклоне
    accel: 9                        // как быстро скорость догоняет наклон, 1/с
  },
  // удар мечом: серия из трёх — рубящий, наотмашь, круговой; тап во время удара или сразу после — следующий удар серии
  attack: { cut: 0.3, back: 0.28, whirl: 0.46, chain: 0.3, cooldown: 0.3, reach: 2.2, whirlReach: 1.35, hitStop: 0.06 },
  combo: {
    perfect: 0.35,                  // точное приземление — не дальше этого от центра острова, м
    step: 3, max: 4,                // каждые step очков серии — множитель монет +1, до max
    zigzag: 3,                      // столько точных приземлений со сменой колонки подряд — «Зигзаг!» (+1)
    dare: 0.5                       // огненный остров: «Дерзко!», если приземлился в первые dare с после того, как пламя погасло
  },
  fury: { need: 12, time: 8, magnet: 4.5 }, // «Рыцарская ярость»: очков серии на полную шкалу, длительность, с, радиус магнита монет, м
  parry: { perfect: 1.3, speed: 24 }, // отбить огненный шар мечом: ближе perfect м к коту — «Идеально!» (двойной урон); скорость отбитого шара, м/с
  // Пламенный дракон — босс: прилетает на first м и дальше каждые every м; на участке arena м дорога спокойная
  // (без ловушек, ездящих островов и летунов). Ранить его можно только его же огнём, отбитым мечом.
  // Не одолел за time с — улетает; одолел — reward монет (с множителем серии)
  boss: { first: 700, every: 900, arena: 320, hp: 6, time: 45, reward: 40 },
  wings: { time: 6, height: 7, speed: 13, gap: 1.5 }, // крылья грифона: сколько летит, с; высота над дорогой и скорость, м, м/с; шаг монет, м
  trick: { time: 0.42, coins: 2 },  // трюк в прыжке (свайп вверх / ↑): длительность, с; монет за трюк (растёт с числом трюков за прыжок)
  tilt: { full: 0.36, dead: 0.025 }, // sin(~21°) — наклон для полной скорости
  lives: 3,
  invuln: 1.8,                      // неуязвимость после удара, с
  music: 0.55,                      // громкость музыки относительно эффектов
  telemetry: { url: '', flushEvery: 30, log: false }, // аналитика (telemetry.js): адрес приёмника пуст — события остаются на устройстве; log — в консоль при ?debug
  platform: { w: 1.9, depth: 2.4, height: 0.5, crate: 0.85, start: 6.8, startDepth: 3.4 },
  fire: { period: 3.2, burn: 1.1, warn: 0.7 }, // огненный остров: цикл, сколько горит, сколько предупреждает, с
  ghost: { period: 3.4, gone: 1.1, warn: 0.6 }, // призрачный остров: цикл, сколько его нет, сколько мерцает перед этим, с
  ice: { slide: 3, grip: 0.25 },    // лёд: толчок вбок, м/с; доля руления до следующего приземления
  keg: { coins: 5, blast: 3 },      // пороховая бочка: монет, если разрубить мечом; радиус взрыва, м
  axe: { pivot: 5.6, arm: 4.8, swing: 0.75, period: [2.4, 1.8] }, // секира-маятник: крюк над островами, длина подвеса, м; размах, рад; период — в начале и на пике сложности, с
  biomeEvery: 500,                  // в забеге биомы сменяются по кругу через столько метров
  // раннер (режимы «Бег» и «Смешанный»): кот бежит по виадуку; скорость в начале и на пике сложности, м/с; прыжок по
  // свайпу вверх (≈ 2 м над дорогой); подкат, с; шаг плит, м; препятствие — через столько метров; в смешанном —
  // длина отрезков бега и прыжков, м (начинается с бега)
  // бег: скорость и шаг препятствий от сложности бега (runDifficulty: быстро растёт и выходит на плато к hard, м);
  // roll — катящаяся бочка: с какой дистанции, скорость, м/с, и за сколько метров до кота она трогается
  run: { speed: [11, 15], jump: 10.5, slide: 0.7, tile: 2.6, every: [9.5, 5.8], hard: 1300, roll: { from: 200, v: 4.5, wake: 30 }, stretch: { run: 260, hop: 220 },
    // верхний виадук: шанс начаться на ряд, с какой дистанции, длина в плитах (с пандусом), плит в пандусе, высота настила, м
    deck: { chance: 0.045, from: 60, rows: [7, 12], ramp: 3, h: 2.2 } },
  fog: { near: 40, far: 106 },      // туман на дороге (цвета неба за предметом): к краю дороги (ahead) — сплошной, новые ряды рождаются в нём
  daynight: { period: 240, start: 0.04 }, // полный круг день → закат → ночь → рассвет, с (4 минуты — смена плавная); старт — утро
  gen: {
    hardAt: 1600,                   // дистанция, на которой сложность выходит на максимум, м
    ahead: 100,                     // насколько вперёд построена дорога, м (новый ряд рождается за краем растворения — DISSOLVE)
    step: [5.9, 8.2],               // расстояние между рядами
    rise: [0.15, 0.85],             // подъём следующего ряда (иногда ряд ниже)
    pace: [1.15, 1.35],             // темп прыжков: та же высота, но короче полёт (быстрее вперёд)
    full: [0.45, 0.08],             // доля рядов, где заняты все три колонки
    single: [0.08, 0.38],           // доля рядов с одним островом
    moving: [0.15, 0.55],           // шанс, что остров ездит
    fast: [0, 0.65],                // доля «бешеных» среди ездящих
    fastFrom: 250,
    hazard: [0.12, 0.6],            // шанс, что запасной остров ряда окажется ловушкой
    hazardFrom: { wood: 50, spike: 90, fire: 130, ice: 160, dog: 180, keg: 230, ghost: 300 },
    axe: [380, 0.05, 0.12],         // ряд с секирой-маятником: с какой дистанции, шанс в начале и на пике сложности
    crate: 0.06,                    // гриб-батут
    coins: 0.95,                    // монеты дугой по пути прыжка (3–4 на дугу — сколько не слипаются на экране); на виадуке — линии
    shield: [150, 0.025],           // щит серии над островом: с какой дистанции, шанс на ряд
    bonus: [100, 0.035],            // бонус (магнит, монеты ×2, пузырь): с какой дистанции, шанс на ряд
    wings: [220, 0.012],            // перо грифона (полёт): с какой дистанции, шанс на ряд; только в забеге
    pair: 0.35,                     // шанс, что ворона летит парой — вторая выше и дальше, для цепочки прыжков
    flyers: { crow: [150, 0.04, 0.12], bat: [280, 0.03, 0.09], dragon: [420, 0.02, 0.045] }, // с какой дистанции и как часто
    marker: 50                      // табличка с дистанцией у дороги
  },
  scenery: {
    castle: { ahead: 210, scale: 2.2, drop: -16 }, // замок всегда на горизонте — недосягаем, крупный: цель над концом дороги
    islands: 10,
    islandStep: 13
  }
};

// Ключевые точки суток (доля цикла 0…1). Цвета — sRGB, числа плавно смешиваются между точками.
// sunEl/sunAz, moonEl/moonAz — высота и азимут светил в градусах относительно взгляда к замку.
var DAY_BASE = {
  top: '#3d8de0', hor: '#d8ecfb', low: '#9ccaf3', fog: '#e3ebf1', cloud: '#ffffff',
  sun: '#fff2dc', sunI: 1.7, hemiSky: '#e2f0ff', hemiGround: '#9b8a72', hemiI: 0.45,
  exp: 1.05, env: 1, stars: 0, night: 0, sunEl: 50, sunAz: -22, moonEl: -25, moonAz: 30
};
var NIGHT = {
  top: '#0a1233', hor: '#26356e', low: '#141c44', fog: '#1f2a57', cloud: '#56649a',
  sun: '#a6b8ff', sunI: 0.6, hemiSky: '#8aa0e6', hemiGround: '#2a2440', hemiI: 0.26,
  exp: 0.92, env: 0.3, stars: 1, night: 1, sunEl: -12, sunAz: 0, moonEl: 26, moonAz: 26
};
function dayKey(t, o) { return Object.assign({ t: t }, DAY_BASE, o || {}); }
var DAY_KEYS = [
  dayKey(0),
  dayKey(0.27),
  dayKey(0.35, { top: '#4a78cc', hor: '#ffd7a0', low: '#c8b6dc', fog: '#efd6bd', cloud: '#ffe7cc', sun: '#ffc98a', sunI: 1.45, hemiSky: '#ffe2c4', hemiI: 0.4, exp: 1, env: 0.8, sunEl: 13, sunAz: -26 }),
  dayKey(0.42, { top: '#2b347c', hor: '#ff8c5e', low: '#6a5193', fog: '#c98a84', cloud: '#ffae8c', sun: '#ff7b4f', sunI: 0.95, hemiSky: '#ffaa88', hemiGround: '#5a4560', hemiI: 0.32, exp: 0.95, env: 0.55, stars: 0.2, night: 0.35, sunEl: 0, sunAz: -28, moonEl: -5 }),
  dayKey(0.49, NIGHT),
  dayKey(0.66, NIGHT),
  dayKey(0.73, { top: '#384595', hor: '#ffa996', low: '#8371b3', fog: '#d1a1b0', cloud: '#ffc1bd', sun: '#ffaa82', sunI: 0.95, hemiSky: '#ffc2b0', hemiGround: '#5a4a62', hemiI: 0.32, exp: 0.95, env: 0.55, stars: 0.2, night: 0.35, sunEl: 0, sunAz: 26, moonEl: 6 }),
  dayKey(0.8, { top: '#3f86da', hor: '#ffe6c9', low: '#a9cbef', fog: '#e4dedd', cloud: '#fff2e4', sun: '#ffe4bd', sunI: 1.45, hemiSky: '#fff0dc', hemiI: 0.4, exp: 1.02, env: 0.85, sunEl: 15, sunAz: 24 }),
  dayKey(0.88),
  dayKey(1)
];
var DAY_COLORS = ['top', 'hor', 'low', 'fog', 'cloud', 'sun', 'hemiSky', 'hemiGround'];
var DAY_NUMBERS = ['sunI', 'hemiI', 'exp', 'env', 'stars', 'night', 'sunEl', 'sunAz', 'moonEl', 'moonAz'];

var IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
var DEBUG = /[?&]debug\b/.test(location.search);
var AUTOPLAY = /[?&]debug=play\b/.test(location.search);
var BOT = DEBUG && /[?&]bot\b/.test(location.search);
var GOD = DEBUG && /[?&]god\b/.test(location.search);
// fx — частицы в воздухе всегда; weather — погода поверх них (main.js, updateWeather): fluff — летящий пух,
// blizzard — порывы метели, ash — пепел и порывы искр, storm — грозы с молниями на горизонте
var BIOMES = {
  sky: { name: 'biome.sky', mix: 0, tint: {}, stone: '#ffffff', isle: '#ffffff', fx: null, weather: 'fluff', traps: {} },
  ice: {
    name: 'biome.ice', mix: 0.7, stone: '#cfe2f3', isle: '#d6ecff', fx: 'snow', weather: 'blizzard', traps: { ice: 4, ghost: 0.5, fire: 0.3 },
    tint: { top: '#3a7fd2', hor: '#d9ebf8', low: '#9cc8ec', fog: '#d4e8f6', cloud: '#eef6fc', hemiSky: '#e0f0fb', hemiGround: '#9fb6cc', sun: '#eef6ff' } // холодный, но не белёсый
  },
  fire: {
    name: 'biome.fire', mix: 0.55, stone: '#d19a7e', isle: '#e7b49a', fx: 'embers', weather: 'ash', traps: { fire: 3, keg: 3, ice: 0 },
    tint: { top: '#a2442c', hor: '#ffb57d', low: '#d97b4c', fog: '#eaa37c', cloud: '#ffcbab', hemiGround: '#6b3b29', sun: '#ffc08b' }
  },
  ghost: {
    name: 'biome.ghost', mix: 0.6, stone: '#bbb3d6', isle: '#b9b2d9', fx: 'wisps', weather: 'storm', traps: { ghost: 4, ice: 0.5 },
    tint: { top: '#2d2b60', hor: '#938acd', low: '#4f4b8c', fog: '#7c76b3', cloud: '#aca6dc', hemiGround: '#3b3453', sun: '#cbc4ff' }
  },
  citadel: {
    name: 'biome.citadel', mix: 0.4, stone: '#dac8b9', isle: '#e6d0c4', fx: 'embers', weather: 'storm', traps: { axe: 3, keg: 1.5, dog: 2 },
    tint: { top: '#4b3b7b', hor: '#ffd1a0', low: '#b78db2', fog: '#d9b6b2', cloud: '#ffdaca' }
  }
};
var BIOME_ORDER = ['sky', 'ice', 'fire', 'ghost', 'citadel'];
var WORLDS = [
  { biome: 'sky', time: 0.08, levels: [
    { len: 200, d: 0.02, traps: {}, tip: 'tip.1-1' },
    { len: 240, d: 0.06, traps: { wood: 1 }, tip: 'tip.1-2' },
    { len: 260, d: 0.1, traps: { wood: 1, spike: 1 }, crows: 0.06, tip: 'tip.1-3' },
    { len: 280, d: 0.14, traps: { spike: 1, fire: 1 }, crows: 0.06, moving: 0.2, tip: 'tip.1-4' },
    { len: 300, d: 0.18, traps: { wood: 1, fire: 1, dog: 1 }, crows: 0.08, moving: 0.25, tip: 'tip.1-5' },
    { len: 320, d: 0.22, traps: { wood: 1, spike: 1, fire: 1, dog: 1 }, crows: 0.1, moving: 0.3, fast: 0.2, dragon: true, tip: 'tip.1-6' },
    { len: Infinity, d: 0.24, boss: 'dog', tip: 'tip.1-7' }
  ] },
  { biome: 'ice', time: 0.2, levels: [
    { len: 260, d: 0.25, traps: { ice: 3 }, tip: 'tip.2-1' },
    { len: 280, d: 0.28, traps: { ice: 3, wood: 1 }, crows: 0.08 },
    { len: 300, d: 0.31, traps: { ice: 2, spike: 1 }, bats: 0.06, tip: 'tip.2-3' },
    { len: 320, d: 0.34, traps: { ice: 2, spike: 1, dog: 1 }, bats: 0.08, moving: 0.3 },
    { len: 340, d: 0.37, traps: { ice: 3, dog: 1, wood: 1 }, crows: 0.1, moving: 0.35, fast: 0.3 },
    { len: 360, d: 0.4, traps: { ice: 3, spike: 1, dog: 1 }, bats: 0.1, moving: 0.35, fast: 0.4, shield: 0.04 },
    { len: Infinity, d: 0.42, boss: 'golem', tip: 'tip.2-7' }
  ] },
  { biome: 'fire', time: 0.38, levels: [
    { len: 280, d: 0.42, traps: { fire: 3 }, tip: 'tip.3-1' },
    { len: 300, d: 0.45, traps: { fire: 2, keg: 2 }, tip: 'tip.3-2' },
    { len: 320, d: 0.48, traps: { fire: 2, keg: 2, spike: 1 }, crows: 0.1 },
    { len: 340, d: 0.5, traps: { fire: 2, keg: 2, dog: 1 }, moving: 0.35, fast: 0.4 },
    { len: 360, d: 0.53, traps: { fire: 3, keg: 2, dog: 2 }, crows: 0.12, shield: 0.04 },
    { len: 380, d: 0.56, traps: { fire: 2, keg: 3, dog: 1, spike: 1 }, moving: 0.4, fast: 0.5, shield: 0.04 },
    { len: Infinity, d: 0.58, boss: 'lava', tip: 'tip.3-7' }
  ] },
  { biome: 'ghost', time: 0.6, levels: [
    { len: 300, d: 0.58, traps: { ghost: 3 }, tip: 'tip.4-1' },
    { len: 320, d: 0.6, traps: { ghost: 3, wood: 1 }, bats: 0.12 },
    { len: 340, d: 0.62, traps: { ghost: 2, spike: 1, dog: 1 }, bats: 0.14 },
    { len: 360, d: 0.65, traps: { ghost: 3, ice: 1, keg: 1 }, bats: 0.14, moving: 0.4 },
    { len: 380, d: 0.68, traps: { ghost: 3, fire: 1, dog: 1 }, bats: 0.16, fast: 0.5, shield: 0.05 },
    { len: 400, d: 0.7, traps: { ghost: 3, spike: 1, keg: 1, dog: 1 }, bats: 0.16, moving: 0.45, fast: 0.5, shield: 0.05 },
    { len: Infinity, d: 0.72, boss: 'ghost', tip: 'tip.4-7' }
  ] },
  { biome: 'citadel', time: 0.33, levels: [
    { len: 320, d: 0.72, traps: { dog: 1 }, axe: 0.3, tip: 'tip.5-1' },
    { len: 340, d: 0.75, traps: { dog: 2, keg: 1 }, axe: 0.25, crows: 0.12 },
    { len: 360, d: 0.78, traps: { dog: 1, fire: 1, ghost: 1 }, axe: 0.25, bats: 0.12 },
    { len: 380, d: 0.82, traps: { dog: 1, keg: 1, ice: 1, spike: 1 }, axe: 0.3, moving: 0.45, fast: 0.5, shield: 0.05 },
    { len: 400, d: 0.86, traps: { dog: 2, keg: 1, ghost: 1, fire: 1 }, axe: 0.3, crows: 0.12, bats: 0.1, shield: 0.05 },
    { len: 460, d: 0.9, traps: { dog: 2, keg: 2, ghost: 1, fire: 1, ice: 1, spike: 1 }, axe: 0.35, crows: 0.12, bats: 0.12, shield: 0.06 },
    { len: Infinity, d: 0.85, boss: 'dragon', tip: 'tip.5-7' }
  ] }
];

// Музыка на выбор в настройках: файл public/music/<file>.mp3 (96 кбит/с, _not_main/blender/music.py); первый — по умолчанию.
// Треки Kevin MacLeod (incompetech.com), лицензия CC BY 4.0 — автор показывается в настройках под выбором
var MUSIC_TRACKS = [
  { file: 'celtic_impulse', title: 'Celtic Impulse' },
  { file: 'master_of_the_feast', title: 'Master of the Feast' },
  { file: 'minstrel_guild', title: 'Minstrel Guild' },
  { file: 'achaidh_cheide', title: 'Achaidh Cheide' },
  { file: 'teller_of_the_tales', title: 'Teller of the Tales' }
];

export { LIGHT_K, CONFIG, DAY_BASE, NIGHT, dayKey, DAY_KEYS, DAY_COLORS, DAY_NUMBERS, IS_TOUCH, DEBUG, AUTOPLAY, BOT, GOD, BIOMES, BIOME_ORDER, WORLDS, MUSIC_TRACKS };

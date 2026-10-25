// Лавка: кошелёк, облик кота (доспех, плащ, меч) и улучшения. Только данные и правила — без three.js:
// игра спрашивает upgrade('wings') и skin(), а меняет кота и подсчёты сама. Всё хранится на устройстве

import { load, save, loadObject } from './store.js';

// облик: цвет (sRGB) — для материала кота и образца в лавке; первый в списке — тот, что есть с начала.
// Шляпа, окрас (tint — множитель цвета шерсти), шлейф за котом и спутник (собирает монеты рядом) — с третьего круга
export var SKINS = {
  armor: [
    { id: 'steel', color: '#d3d8e0', dark: '#8d949f', price: 0 },
    { id: 'gold', color: '#ffd36a', dark: '#c48a1e', price: 600 },
    { id: 'obsidian', color: '#4a4560', dark: '#25222f', price: 900 },
    { id: 'rose', color: '#f2b6c6', dark: '#c47a90', price: 1200 }
  ],
  cape: [
    { id: 'white', color: '#cbbb9e', price: 0 },
    { id: 'red', color: '#b8282e', price: 300 },
    { id: 'blue', color: '#2f5fb8', price: 300 },
    { id: 'violet', color: '#6c3fa8', price: 450 }
  ],
  sword: [
    { id: 'steel', color: '#d3d8e0', glow: null, price: 0 },
    { id: 'gold', color: '#ffc845', glow: null, price: 500 },
    { id: 'ice', color: '#bfe9ff', glow: '#5fc8ff', price: 800 },
    { id: 'flame', color: '#ffb36b', glow: '#ff5a1a', price: 1100 }
  ],
  hat: [
    { id: 'none', color: '#e6dccb', price: 0 },
    { id: 'crown', color: '#ffcf4a', price: 700 },
    { id: 'beret', color: '#c8343c', price: 600 },
    { id: 'wizard', color: '#4b3aa8', price: 900 }
  ],
  fur: [
    { id: 'cream', color: '#f1dfc0', tint: '#ffffff', price: 0 },
    { id: 'ginger', color: '#e8955a', tint: '#ffb27a', price: 500 },
    { id: 'grey', color: '#9aa0aa', tint: '#b3b8c4', price: 500 },
    { id: 'black', color: '#4a4650', tint: '#5d5864', price: 800 }
  ],
  trail: [
    { id: 'none', color: '#e6dccb', price: 0 },
    { id: 'sparks', color: '#ffd56a', glow: [1, 0.82, 0.35], price: 600 },
    { id: 'petals', color: '#ff8fb0', glow: [1, 0.5, 0.68], price: 800 },
    { id: 'frost', color: '#9fe0ff', glow: [0.6, 0.86, 1], price: 800 },
    { id: 'rainbow', color: '#b48cff', glow: null, price: 1200 }
  ],
  pet: [
    { id: 'none', color: '#e6dccb', price: 0 },
    { id: 'firefly', color: '#ffe27a', price: 1500 },
    { id: 'owl', color: '#b08a5c', price: 2200 }
  ]
};

// улучшения: уровень 0…max; price(уровень) — цена следующего; value(уровень) — что даёт
export var UPGRADES = {
  wings: { max: 5, base: 250, value: function (l) { return 6 + l; } },              // полёт, с
  magnet: { max: 5, base: 200, value: function (l) { return 7 + l * 1.5; } },       // бонус «магнит», с
  double: { max: 5, base: 200, value: function (l) { return 8 + l * 2; } },         // бонус «монеты ×2», с
  fury: { max: 4, base: 300, value: function (l) { return 12 - l * 1.5; } },        // очков серии на ярость
  shield: { max: 1, base: 900, value: function (l) { return l; } },                 // щит серии со старта
  life: { max: 1, base: 1500, value: function (l) { return l; } }                   // жизнь сверху
};

var wallet = loadObject('wallet', { coins: 0, earned: 0 });
var owned = loadObject('owned', { armor: ['steel'], cape: ['white'], sword: ['steel'], hat: ['none'], fur: ['cream'], trail: ['none'], pet: ['none'] });
var worn = loadObject('worn', { armor: 'steel', cape: 'white', sword: 'steel', hat: 'none', fur: 'cream', trail: 'none', pet: 'none' });
var levels = loadObject('upgrades', { wings: 0, magnet: 0, double: 0, fury: 0, shield: 0, life: 0 });

export function coins() { return wallet.coins; }
export function earned() { return wallet.earned; }

export function addCoins(n) {
  if (n <= 0) return;
  wallet.coins += n;
  wallet.earned += n;
  save('wallet', wallet);
}

function spend(n) {
  if (wallet.coins < n) return false;
  wallet.coins -= n;
  save('wallet', wallet);
  return true;
}

export function skinOf(slot) {
  var id = worn[slot], list = SKINS[slot];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return list[0];
}

export function isOwned(slot, id) { return owned[slot].indexOf(id) >= 0; }
export function isWorn(slot, id) { return worn[slot] === id; }

// купить (если не куплено) и надеть; false — не хватает монет
export function wear(slot, id) {
  var item = SKINS[slot].filter(function (s) { return s.id === id; })[0];
  if (!item) return false;
  if (!isOwned(slot, id)) {
    if (!spend(item.price)) return false;
    owned[slot].push(id);
    save('owned', owned);
  }
  worn[slot] = id;
  save('worn', worn);
  return true;
}

export function level(key) { return levels[key] || 0; }
export function upgrade(key) { return UPGRADES[key].value(level(key)); }
export function upgradePrice(key) {
  var l = level(key), U = UPGRADES[key];
  return l >= U.max ? null : Math.round(U.base * Math.pow(1.8, l) / 10) * 10;
}

export function buyUpgrade(key) {
  var p = upgradePrice(key);
  if (p == null || !spend(p)) return false;
  levels[key]++;
  save('upgrades', levels);
  return true;
}

// заплатить монетами (спасение забега); false — не хватает
export function pay(n) { return spend(n); }

// подарок из сундука: вещь становится своей (не надевается)
export function grant(slot, id) {
  if (isOwned(slot, id)) return false;
  owned[slot].push(id);
  save('owned', owned);
  return true;
}

// облики, которых ещё нет (для сундука): шляпы, окрас, шлейфы, цвета доспеха и плаща — не дороже max
export function unownedLooks(max) {
  var out = [];
  ['hat', 'fur', 'trail', 'cape', 'armor'].forEach(function (slot) {
    SKINS[slot].forEach(function (s) { if (!isOwned(slot, s.id) && s.price <= max) out.push({ slot: slot, id: s.id, price: s.price }); });
  });
  return out;
}

// ?debug: монеты в кошелёк без игры
export function debugGrant(n) { addCoins(n); }

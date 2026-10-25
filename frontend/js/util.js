// Утилиты: случайные числа, интерполяция, плавность, ГСЧ с «зерном»

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(k, dt) { return 1 - Math.exp(-k * dt); } // доля пути к цели за dt при скорости k
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - (1 - t) * (1 - t) * (1 - t); }
function rad(d) { return d * Math.PI / 180; }
function pickOf(list) { return list[(Math.random() * list.length) | 0]; }

// детерминированный ГСЧ: камень на шве текстуры рисуется дважды одинаково
function prng(seed) {
  var s = (Math.abs(seed | 0) % 2147483646) + 1;
  return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
}

export { rand, clamp, lerp, smooth, ease, easeOut, rad, pickOf, prng };

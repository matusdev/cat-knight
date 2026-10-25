// Звук: эффекты и окружение на WebAudio (синтез, без файлов) и музыка — трек из public/music (выбор в настройках)
import { CONFIG, DEBUG } from './config.js';
import { rand } from './util.js';

var Sound = (function () {
  var ctx = null, master = null, sfx = null, noise = null, muted = false, vol = { sfx: 1, music: 1 }; // эффекты и музыка — громкость из настроек

  function init() {
    if (ctx) { resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = vol.sfx;
    sfx.connect(master);
    var len = ctx.sampleRate | 0;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    ambient();
    startAmbience();
    startMusic();
    if (track.name) setTrack(track.name);
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (track.name && track.el && track.el.paused) playTrack();
  }
  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
    if (track.el) track.el.pause(); // элемент audio идёт сам по себе — без паузы трек «уезжал» бы, пока игра стоит
  }

  function env(g, t, attack, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(type, f0, f1, t, dur, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.008, vol, dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function hiss(t, dur, vol, freq, type, toFreq) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    s.loop = dur > 0.45; // шум — секунда: длинный (гром, метель) идёт по кругу
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    env(g, t, 0.004, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /* Воздух и даль. Ветер на высоте — два слоя: густой шум и свист в щелях; порывы — медленный случайный процесс
     (сила тянется к новой цели раз в 1,5–5 с). Даль — шина far: сухой сигнал и хвост реверберации (свёртка
     с затухающим шумом) — птицы, сверчки, колокол замка, сова, вороны, треск льда звучат «в пространстве».
     Что звучит — по биому (PROFILE) и времени суток: днём птицы, ночью сверчки и сова; у водопада — вода */
  var air = null;
  var PROFILE = {
    sky: { wind: 1, whistle: 0.8, pitch: 1, birds: 1, crickets: 1, owl: 1, bell: 1 },
    ice: { wind: 1.3, whistle: 1.5, pitch: 1.35, ice: 1, owl: 0.3, bell: 0.4 },
    fire: { wind: 0.8, whistle: 0.4, pitch: 0.75, rumble: 1, embers: 1 },
    ghost: { wind: 1.1, whistle: 1.2, pitch: 0.9, howl: 1, owl: 1, crows: 0.6 },
    citadel: { wind: 1, whistle: 0.9, pitch: 1, bell: 2, crows: 1, embers: 0.4, birds: 0.3 }
  };

  function reverbIR(sec) { // отклик «простора»: шум, темнеющий и затухающий к хвосту, в каждом канале свой
    var n = (ctx.sampleRate * sec) | 0, buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c), lp = 0;
      for (var i = 0; i < n; i++) {
        var k = i / n;
        lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.5 * k);
        d[i] = lp * Math.pow(1 - k, 2.6) * 0.6;
      }
    }
    return buf;
  }

  function airLayer(buf, type, freq, q) { // петля шума через фильтр и панораму; громкость задаёт сцена
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = panner();
    s.buffer = buf;
    s.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(p);
    s.start(0, Math.random() * buf.duration);
    return { f: f, g: g, p: p.pan || null };
  }

  function ambient() {
    var far = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), cv = ctx.createConvolver();
    cv.buffer = reverbIR(2.4);
    dry.gain.value = 0.55;
    wet.gain.value = 0.5;
    far.connect(dry);
    far.connect(cv);
    cv.connect(wet);
    dry.connect(sfx);
    wet.connect(sfx);
    var thick = brownNoise(3);
    air = {
      far: far,
      low: airLayer(thick, 'lowpass', 380, 0.5),        // густой ветер
      low2: airLayer(thick, 'lowpass', 420, 0.5),       // второй канал — шире
      whistle: airLayer(noise, 'bandpass', 900, 3),     // свист
      whistle2: airLayer(noise, 'bandpass', 1500, 5),
      water: airLayer(noise, 'bandpass', 1300, 0.45),   // водопад: широкий шум
      rumble: airLayer(thick, 'bandpass', 160, 0.8),    // огненный мир: гул вулкана
      gust: 0.3, gustTo: 0.3, gustT: 0,
      crickets: [0, 1, 2].map(function () { return { f: rand(4300, 5300), pan: rand(-0.8, 0.8), next: rand(0, 1), per: rand(0.55, 1) }; }),
      drum: { next: 0, step: 0 },
      n: { bird: 0, cricket: 0, owl: 0, bell: 0, crow: 0, ice: 0, chime: 0, boom: 0, howl: 0, purr: 0, drum: 0, flags: 0 },
      purrUntil: 0
    };
  }

  function spot(pan) { // источник вдали: своя панорама → шина far (с реверберацией)
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = pan;
    p.connect(air.far);
    return p;
  }

  // нота-«пение»: синус с изгибом частоты (glide: [f0, f1]), мягкая атака; out — куда
  function sing(t, f0, f1, dur, vol, out, type) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.03);
    return o;
  }

  // птица: щебет (серия коротких нисходящих нот), «ти-чу» (две ноты по кругу) или трель с переливом
  function bird(t, vol, pan) {
    var out = spot(pan), k = Math.random(), i, n, f;
    if (k < 0.4) {
      n = 3 + (Math.random() * 4 | 0);
      f = rand(3000, 4800);
      for (i = 0; i < n; i++) sing(t + i * rand(0.08, 0.14), f * rand(0.95, 1.05), f * rand(0.6, 0.85), rand(0.05, 0.09), vol, out);
    } else if (k < 0.75) {
      var hi = rand(3800, 4600), lo = hi * rand(0.72, 0.82);
      n = 2 + (Math.random() * 3 | 0);
      for (i = 0; i < n; i++) {
        sing(t + i * 0.3, hi, hi * 0.97, 0.12, vol, out);
        sing(t + i * 0.3 + 0.14, lo, lo * 0.94, 0.12, vol * 0.85, out);
      }
    } else {
      n = 8 + (Math.random() * 7 | 0);
      for (i = 0; i < n; i++) {
        var o = sing(t + i * 0.05, rand(2400, 4600), rand(2400, 4600), 0.045, vol * 0.8, out), lfo = ctx.createOscillator(), d = ctx.createGain();
        lfo.frequency.value = rand(30, 50);
        d.gain.value = rand(150, 350);
        lfo.connect(d);
        d.connect(o.frequency);
        lfo.start(t + i * 0.05);
        lfo.stop(t + i * 0.05 + 0.08);
      }
    }
    air.n.bird++;
  }

  function cricket(t, c, vol) { // сверчок: 3–4 импульса высокого тона, по 16 мс
    var o = ctx.createOscillator(), g = ctx.createGain(), out = spot(c.pan), n = 3 + (Math.random() < 0.5 ? 1 : 0);
    o.type = 'sine';
    o.frequency.value = c.f;
    g.gain.setValueAtTime(0, t);
    for (var i = 0; i < n; i++) {
      g.gain.setValueAtTime(vol, t + i * 0.03);
      g.gain.setValueAtTime(0, t + i * 0.03 + 0.016);
    }
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + n * 0.03 + 0.02);
    air.n.cricket++;
  }

  function owl(t, vol, pan) { // сова: «у-ху… у-у-ху» — низкие мягкие гласные, вдали
    var out = spot(pan), f = rand(340, 400);
    [[0, 0.34, 1], [0.62, 0.16, 0.7], [0.82, 0.18, 0.75], [1.05, 0.5, 1]].forEach(function (s) {
      var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.04, t + s[0]);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + s[0] + s[1]);
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t + s[0]);
      g.gain.exponentialRampToValueAtTime(vol * s[2], t + s[0] + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s[0] + s[1]);
      o.connect(lp);
      lp.connect(g);
      g.connect(out);
      o.start(t + s[0]);
      o.stop(t + s[0] + s[1] + 0.05);
    });
    air.n.owl++;
  }

  // колокол замка вдали: негармонические обертоны (как у литого колокола), у каждого — свой спад
  function bell(t, f, vol) {
    var out = spot(0.1), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.connect(out);
    [[0.5, 0.5, 5], [1, 1, 4], [1.19, 0.6, 3], [1.5, 0.5, 2.5], [2, 0.4, 2], [2.51, 0.25, 1.5], [3.01, 0.2, 1.2], [4.1, 0.12, 0.8]].forEach(function (p) {
      sing(t, f * p[0], 0, p[2], vol * p[1], lp);
    });
    air.n.bell++;
  }

  function caw(t, vol, pan) { // ворона: два-три хриплых «кар» — пила через две форманты и шум
    var out = spot(pan), n = 2 + (Math.random() < 0.5 ? 1 : 0), f = rand(480, 560);
    for (var i = 0; i < n; i++) {
      var t0 = t + i * rand(0.32, 0.42), o = ctx.createOscillator(), b1 = ctx.createBiquadFilter(), b2 = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.22);
      b1.type = b2.type = 'bandpass';
      b1.frequency.value = 1100;
      b1.Q.value = 1.6;
      b2.frequency.value = 2500;
      b2.Q.value = 2.2;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.connect(b1);
      o.connect(b2);
      b1.connect(g);
      b2.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + 0.27);
    }
    air.n.crow++;
  }

  function iceCrack(t, vol, pan) { // лёд трескается: щелчок и звенящий спад — частота скользит вниз
    var out = spot(pan);
    burst(t, 0.012, vol, 'highpass', 2200, out);
    sing(t, rand(2800, 3600), 900, 0.4, vol * 0.5, out);
    sing(t + 0.01, rand(4800, 5600), 1700, 0.25, vol * 0.25, out);
    air.n.ice++;
  }

  function chime(t, f, vol, pan) { // кристалл звенит: основной тон и два негармонических обертона, долгий спад
    var out = spot(pan);
    sing(t, f, 0, 2.4, vol, out);
    sing(t, f * 2.76, 0, 1.2, vol * 0.4, out);
    sing(t, f * 5.4, 0, 0.6, vol * 0.18, out);
    air.n.chime++;
  }

  function burst(t, dur, vol, type, freq, out, buf) { // короткий удар шума через фильтр
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf || noise;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  function boom(t, vol) { // далёкий выброс вулкана: глухой раскат, фильтр медленно закрывается
    var out = spot(rand(-0.6, 0.6)), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = brown;
    s.loop = true;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 1.9);
    air.n.boom++;
  }

  function howl(t, vol, pan) { // призрачный вой ветра: узкая полоса шума плавно поднимается и опадает
    var out = spot(pan), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), f0 = rand(420, 560), dur = rand(2.2, 3.4);
    s.buffer = noise;
    s.loop = true;
    f.type = 'bandpass';
    f.Q.value = 14;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f0 * rand(1.5, 1.9), t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    air.n.howl++;
  }

  // a: biome, night 0…1, speed 0…1, water 0…1 и waterPan — от игры; события — по случайным «часам» с частотой в секунду
  function scene(dt, a) {
    var t = ctx.currentTime, P = PROFILE[a.biome] || PROFILE.sky, night = a.night || 0, spd = a.speed || 0;
    air.gustT -= dt;
    if (air.gustT <= 0) {
      air.gustTo = Math.pow(Math.random(), 1.6);
      air.gustT = rand(1.5, 5);
    }
    air.gust += (air.gustTo - air.gust) * Math.min(1, dt * 0.5);
    var G = air.gust, sway = Math.sin(t * 0.13) * 0.5;
    air.low.g.gain.setTargetAtTime(P.wind * (0.04 + 0.07 * G + 0.04 * spd), t, 0.3);
    air.low2.g.gain.setTargetAtTime(P.wind * (0.04 + 0.07 * G + 0.04 * spd), t, 0.3);
    air.low.f.frequency.setTargetAtTime(260 + 320 * G + 200 * spd, t, 0.3);
    air.low2.f.frequency.setTargetAtTime(280 + 300 * G + 200 * spd, t, 0.3);
    air.whistle.g.gain.setTargetAtTime(P.whistle * (0.003 + 0.028 * G * G + 0.008 * spd), t, 0.3);
    air.whistle.f.frequency.setTargetAtTime(P.pitch * (650 + 750 * G), t, 0.4);
    air.whistle2.g.gain.setTargetAtTime(P.whistle * 0.012 * G * G * G, t, 0.3);
    air.whistle2.f.frequency.setTargetAtTime(P.pitch * (1200 + 900 * G), t, 0.4);
    air.water.g.gain.setTargetAtTime((a.water || 0) * 0.2, t, 0.2);
    air.rumble.g.gain.setTargetAtTime((P.rumble || 0) * (0.07 + 0.05 * Math.sin(t * 0.21)), t, 0.5);
    if (air.low.p) {
      air.low.p.setTargetAtTime(-0.6 + sway * 0.4, t, 0.5);
      air.low2.p.setTargetAtTime(0.6 + sway * 0.4, t, 0.5);
      air.whistle.p.setTargetAtTime(sway, t, 0.5);
      air.whistle2.p.setTargetAtTime(-sway, t, 0.5);
      air.water.p.setTargetAtTime(a.waterPan || 0, t, 0.2);
    }
    if (!live()) return;
    var day = clamp01(1 - night * 2.5), dark = clamp01((night - 0.35) * 2.5), ev = function (rate) { return Math.random() < rate * dt; };
    if (P.birds && ev(0.3 * P.birds * day)) bird(t, rand(0.006, 0.02), rand(-0.85, 0.85));
    if (P.crickets && dark > 0) air.crickets.forEach(function (c) {
      c.next -= dt;
      if (c.next > 0) return;
      c.next = c.per * rand(0.85, 1.15);
      cricket(t + Math.random() * 0.03, c, 0.006 * dark);
    });
    if (P.owl && ev(0.035 * P.owl * dark)) owl(t, 0.05, rand(-0.7, 0.7));
    if (P.bell && ev(0.014 * P.bell)) [0, 2.4].forEach(function (d) { bell(t + d, 330, 0.03 * (1 - night * 0.5)); });
    if (P.crows && ev(0.045 * P.crows)) caw(t, 0.022, rand(-0.8, 0.8));
    if (P.ice) {
      if (ev(0.11)) iceCrack(t, rand(0.03, 0.07), rand(-0.8, 0.8));
      if (ev(0.16)) chime(t, [1047, 1175, 1397, 1568, 1760, 2093][Math.random() * 6 | 0], rand(0.008, 0.018), rand(-0.8, 0.8));
    }
    if (P.rumble && ev(0.08)) boom(t, rand(0.12, 0.25));
    if (P.embers && ev(5 * P.embers)) burst(t, rand(0.006, 0.02), rand(0.01, 0.04), 'bandpass', rand(1500, 5000), spot(rand(-0.8, 0.8)));
    if (P.howl && ev(0.1 * P.howl)) howl(t, rand(0.02, 0.04), rand(-0.8, 0.8));
    if (a.water > 0.05 && ev(a.water * 7)) sing(t, rand(500, 900), rand(1100, 1700), 0.03, 0.02 * a.water, spot(a.waterPan || 0)); // капли и пузырьки
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* Звуки окружения у кота. Петли (клокотание лавы, рёв и шипение пламени, гул мельницы) крутятся
     всё время, игра каждый кадр задаёт им громкость и панораму по расстоянию; треск, бульканье,
     свист крыльев, стук и скрип — отдельные события. Всё в средних частотах: бас динамик телефона не вытянет. */
  var amb = null, brown = null;

  function brownNoise(sec) { // «коричневый» шум — гуще и ниже белого, основа огня и гула
    var len = (ctx.sampleRate * sec) | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), b = 0, i;
    for (i = 0; i < len; i++) {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = b * 3.5;
    }
    var drift = d[len - 1] - d[0]; // конец сводим к началу — петля без щелчка
    for (i = 0; i < len; i++) d[i] -= drift * i / (len - 1);
    return buf;
  }

  function panner() {
    var p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); // старый Safari — без панорамы
    p.connect(sfx);
    return p;
  }

  function loop(buf, type, freq, q, out) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf;
    s.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.value = 0;
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(0, Math.random() * buf.duration);
    return { f: f, g: g };
  }

  function tap(node) { // ?debug: уровень сигнала — проверить громкость без ушей
    if (!DEBUG) return null;
    var a = ctx.createAnalyser();
    a.fftSize = 2048;
    node.connect(a);
    return a;
  }

  function rms(a) {
    if (!a) return 0;
    var d = new Float32Array(a.fftSize), s = 0;
    a.getFloatTimeDomainData(d);
    for (var i = 0; i < d.length; i++) s += d[i] * d[i];
    return Math.round(Math.sqrt(s / d.length) * 1000) / 1000;
  }

  function startAmbience() {
    brown = brownNoise(2);
    var fire = panner(), mill = panner();
    amb = {
      fire: fire,
      mill: mill,
      lava: loop(brown, 'bandpass', 330, 1.1, fire),  // глухое клокотание
      roar: loop(brown, 'lowpass', 700, 0.6, fire),   // рёв пламени
      hiss: loop(noise, 'bandpass', 2800, 0.7, fire), // шипение
      hum: loop(brown, 'bandpass', 380, 0.5, mill),   // жернова трутся: шорох без тона
      n: { crackle: 0, bubble: 0, ignite: 0, blade: 0, creak: 0 },
      taps: { fire: tap(fire), mill: tap(mill), master: tap(master) }
    };
  }

  function live() { return amb && !muted && ctx.state === 'running'; }

  // a — уровни 0…1 от игры: lava, flame, heat (накал самого громкого), mill и панорамы firePan, millPan;
  // для сцены (scene) — biome, night, speed, water, waterPan
  function ambience(dt, a) {
    if (!amb) return;
    if (air) scene(dt, a);
    if (music && music.boss) drums();
    var t = ctx.currentTime, flick = 0.7 + Math.random() * 0.6; // пламя «дышит»: громкость и тембр дрожат каждый кадр
    amb.lava.g.gain.setTargetAtTime(a.lava * 0.35, t, 0.15);
    amb.roar.g.gain.setTargetAtTime(a.flame * 0.3 * flick, t, 0.035);
    amb.roar.f.frequency.setTargetAtTime(420 + a.heat * 1500 * flick, t, 0.05);
    amb.hiss.g.gain.setTargetAtTime(a.flame * 0.06 * flick, t, 0.035);
    amb.hum.g.gain.setTargetAtTime(a.mill * (0.1 + Math.sin(t * 2.2) * 0.04), t, 0.2);
    if (amb.fire.pan) {
      amb.fire.pan.setTargetAtTime(a.firePan, t, 0.1);
      amb.mill.pan.setTargetAtTime(a.millPan, t, 0.25);
    }
    if (!live()) return;
    // камень в огне трещит: мелкие щелчки, изредка громкий хлопок; тлеющая лава булькает
    var n = dt * (a.lava * 3 + a.flame * 26);
    while (Math.random() < n) {
      crackle(t + Math.random() * 0.05, (0.1 + Math.pow(Math.random(), 3) * 0.9) * 0.5 * Math.max(a.flame, a.lava * 0.35));
      n -= 1;
    }
    if (Math.random() < dt * a.lava * (1.8 - a.flame)) bubble(t + Math.random() * 0.05, a.lava);
  }

  function hush() {
    if (!amb) return;
    var t = ctx.currentTime;
    [amb.lava, amb.roar, amb.hiss, amb.hum].forEach(function (l) { l.g.gain.setTargetAtTime(0, t, 0.08); });
    if (air) [air.low, air.low2, air.whistle, air.whistle2, air.water, air.rumble].forEach(function (l) { l.g.gain.setTargetAtTime(0, t, 0.08); });
  }

  function crackle(t, vol) { // щелчок: несколько миллисекунд шума через случайный резонанс
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), dur = rand(0.006, 0.03);
    s.buffer = noise;
    f.type = 'bandpass';
    f.frequency.value = rand(900, 5200);
    f.Q.value = rand(0.8, 2.5);
    g.gain.setValueAtTime(Math.max(vol, 0.0002), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(amb.fire);
    s.start(t, Math.random() * 0.9);
    s.stop(t + dur + 0.02);
    amb.n.crackle++;
  }

  function bubble(t, vol) { // пузырь лавы лопается: тон быстро скользит вверх
    var o = ctx.createOscillator(), g = ctx.createGain(), f0 = rand(170, 300);
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.08);
    env(g, t, 0.008, 0.16 * vol, 0.14);
    o.connect(g);
    g.connect(amb.fire);
    o.start(t);
    o.stop(t + 0.18);
    amb.n.bubble++;
  }

  function ignite(g) { // остров вспыхнул: глухое «вуф» — фильтр раскрывается и гаснет
    if (!live()) return;
    var t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), v = ctx.createGain();
    s.buffer = brown;
    s.loop = true;
    f.type = 'lowpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(240, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    f.frequency.exponentialRampToValueAtTime(650, t + 0.85);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.06);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.connect(f);
    f.connect(v);
    v.connect(amb.fire);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.95);
    amb.n.ignite++;
  }

  // Мельница. Крыло, проходя низ, гонит воздух парусиной — мягкий низкий «вух» с дрожью полотна; внутри — деревянный
  // стук зубьев шестерни (два-три «ток»), иногда вал скрипит: трение рывками (прилип — сорвался) звенит в дереве
  function sail(t, vol) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator(), d = ctx.createGain(), dur = 1.2;
    s.buffer = brown;
    s.loop = true;
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(480, t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    am.gain.value = 0.8; // полотно дрожит: глубина 20%, ~13 раз в секунду
    lfo.frequency.value = rand(11, 15);
    d.gain.value = 0.2;
    lfo.connect(d);
    d.connect(am.gain);
    s.connect(f);
    f.connect(am);
    am.connect(g);
    g.connect(amb.mill);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  function tok(t, vol) { // деревянный «ток»: щелчок шума и короткое звонкое тело доски
    burst(t, 0.03, vol, 'bandpass', rand(900, 1300), amb.mill);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(rand(380, 460), t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    env(g, t, 0.002, vol * 0.8, 0.09);
    o.connect(g);
    g.connect(amb.mill);
    o.start(t);
    o.stop(t + 0.12);
  }

  // скрип: поток коротких импульсов с «гуляющей» частотой (прилип — сорвался) через три деревянных резонанса
  function creak(t, vol) {
    var dur = rand(0.4, 0.9), sr = ctx.sampleRate, n = (sr * dur) | 0, buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var r0 = rand(16, 28), r1 = r0 * rand(1.5, 2.6), next = 0, i;
    for (i = 0; i < n; i++) {
      if (i < next) continue;
      var k = i / n, env0 = Math.sin(k * Math.PI);
      d[i] = rand(0.6, 1) * env0;
      if (i + 1 < n) d[i + 1] = -d[i] * 0.5;
      next = i + sr / (r0 + (r1 - r0) * env0) * rand(0.8, 1.2);
    }
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    g.gain.value = vol;
    [[rand(380, 460), 14], [rand(950, 1150), 16], [rand(2100, 2500), 12]].forEach(function (p) {
      var b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = p[0];
      b.Q.value = p[1];
      s.connect(b);
      b.connect(g);
    });
    g.connect(amb.mill);
    s.start(t);
    amb.n.creak++;
  }

  function millBlade(g) { // крыло прошло низ: «вух» парусины, стук шестерни, иногда скрип вала
    if (!live()) return;
    var t = ctx.currentTime;
    sail(t, 0.35 * g);
    tok(t + 0.3, 0.14 * g);
    if (Math.random() < 0.6) tok(t + 0.3 + rand(0.08, 0.12), 0.1 * g);
    if (Math.random() < 0.4) creak(t + rand(0.1, 0.6), 3.5 * g);
    amb.n.blade++;
  }

  // Мурлыканье: шершавый шум на «голосовых» формантах пульсирует ~25 раз в секунду; выдох громче и чуть чаще вдоха.
  // Пока одно звучит — новое не начинается
  function purr(dur, vol) {
    if (!live() || !air || ctx.currentTime < air.purrUntil) return;
    var t = ctx.currentTime, s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    var am = ctx.createGain(), g = ctx.createGain(), lfo = ctx.createOscillator(), shape = ctx.createWaveShaper(), curve = new Float32Array(256), i;
    for (i = 0; i < 256; i++) curve[i] = Math.pow(Math.max(0, i / 127.5 - 1), 0.7); // половина синуса — короткие толчки
    shape.curve = curve;
    s.buffer = noise;
    s.loop = true;
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    f1.type = f2.type = 'peaking';
    f1.frequency.value = 280;
    f1.Q.value = 1.3;
    f1.gain.value = 12;
    f2.frequency.value = 700;
    f2.Q.value = 2;
    f2.gain.value = 5;
    am.gain.value = 0;
    lfo.connect(shape);
    shape.connect(am.gain);
    s.connect(lp);
    lp.connect(f1);
    f1.connect(f2);
    f2.connect(am);
    am.connect(g);
    g.connect(sfx);
    var T = t, end = t + dur;
    g.gain.setValueAtTime(0.0001, T);
    while (T < end) {
      lfo.frequency.setValueAtTime(rand(25, 27), T); // выдох
      g.gain.linearRampToValueAtTime(vol, T + 0.15);
      g.gain.setValueAtTime(vol, T + 0.9);
      g.gain.linearRampToValueAtTime(vol * 0.25, T + 1.1);
      lfo.frequency.setValueAtTime(rand(21, 23), T + 1.1); // вдох
      g.gain.linearRampToValueAtTime(vol * 0.45, T + 1.3);
      g.gain.setValueAtTime(vol * 0.45, T + 1.75);
      g.gain.linearRampToValueAtTime(vol * 0.2, T + 1.9);
      T += 1.9;
    }
    g.gain.linearRampToValueAtTime(0.0001, T + 0.2);
    s.start(t, Math.random() * 0.5);
    s.stop(T + 0.3);
    lfo.start(t);
    lfo.stop(T + 0.3);
    air.purrUntil = T + 0.3;
    air.n.purr++;
  }

  // Бой с боссом: поверх музыки — боевые барабаны (тайко): низкий удар с телом 140–190 Гц и шлепок по коже,
  // восьмыми на 150 ударов в минуту; громкость — от музыки (её ползунок)
  var DRUM = [1, 0, 0.5, 0, 1, 0, 0.5, 0.4, 1, 0, 0.5, 0, 1, 0.6, 0.8, 0.9];
  function drum(t, f, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    env(g, t, 0.004, vol, 0.38);
    o.connect(g);
    g.connect(music.out);
    o.start(t);
    o.stop(t + 0.42);
    burst(t, 0.035, vol * 0.5, 'lowpass', 1800, music.out);
  }

  function drums() {
    var D = air && air.drum, t = ctx.currentTime, step = 60 / 150 / 2;
    if (!D || !live()) return;
    if (D.next < t) D.next = t + 0.05;
    while (D.next < t + 0.2) { // расписание на 0,2 с вперёд — ровно, даже если кадры идут рывками
      var a = DRUM[D.step % DRUM.length];
      if (a) drum(D.next, a === 1 ? 150 : 185, 0.22 * a);
      D.next += step;
      D.step++;
      air.n.drum++;
    }
  }

  function flags(g) { // кот пробежал под воротами: полотнища хлопают на ветру
    if (!live() || !air) return;
    var t = ctx.currentTime, out = spot(0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), d = ctx.createGain(), e = ctx.createGain();
    s.buffer = noise;
    s.loop = true;
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.7;
    am.gain.value = 0.5;
    lfo.type = 'square';
    lfo.frequency.value = rand(9, 13);
    d.gain.value = 0.5;
    lfo.connect(d);
    d.connect(am.gain);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.1 * g, t + 0.08);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    s.connect(f);
    f.connect(am);
    am.connect(e);
    e.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.85);
    lfo.start(t);
    lfo.stop(t + 0.85);
    air.n.flags++;
  }

  function play(fn) { if (ctx && !muted) fn(ctx.currentTime); }

  // Музыка — трек из файла (MUSIC_TRACKS): public/music/<имя>.mp3, в приложении — путь, который оно прислало
  // (setTrackUrls). Поток — элемент audio (трек целиком в память не раскладывается) через шину music.out:
  // громкость из настроек, «ярость» и бой — громче. Не загрузился (playable как файл, нет сети) — тишина
  var music = null, track = { name: null, el: null, urls: {} };

  function startMusic() {
    if (music) return;
    var out = ctx.createGain();
    out.gain.value = CONFIG.music * vol.music;
    out.connect(master);
    music = { out: out, tap: tap(out), fury: false, boss: false };
  }

  function setTrack(name) {
    track.name = name || null;
    if (!ctx || !music) return; // применится в init
    if (name && !track.el) {
      track.el = new Audio();
      track.el.loop = true;
      track.el.preload = 'auto';
      var gain = ctx.createGain();
      gain.gain.value = 0.7; // файлы сведены громко — ровняем с эффектами
      ctx.createMediaElementSource(track.el).connect(gain);
      gain.connect(music.out);
      track.el.addEventListener('error', function () {
        if (DEBUG) console.warn('Музыка ' + track.el.src + ' не загрузилась');
      });
    }
    if (!track.name) {
      if (track.el) track.el.pause();
      return;
    }
    // открыта как файл (playable, приложение) — треков рядом нет: ждём пути от приложения (trackUrls)
    var src = track.urls[name] || (location.protocol === 'file:' ? null : 'public/music/' + name + '.mp3');
    if (!src) return;
    if (track.el.getAttribute('src') !== src) track.el.src = src;
    playTrack();
  }

  function playTrack() {
    var p = track.el.play();
    if (p && p.catch) p.catch(function () {}); // без касания браузер не даёт играть — заиграет после init
  }

  function intense() { // ярость или босс — музыка громче
    music.out.gain.setTargetAtTime(CONFIG.music * vol.music * (music.fury || music.boss ? 1.6 : 1), ctx.currentTime, 0.25);
  }

  return {
    init: init,
    resume: resume,
    suspend: suspend,
    ambience: ambience,
    hush: hush,
    ignite: ignite,
    millBlade: millBlade,
    purr: purr, // мурлыканье: длительность, с; громкость
    flags: flags, // стяги ворот хлопают (g — близость 0…1)
    debug: function () {
      var o = { ctx: ctx && ctx.state, track: track.el ? { name: track.name, paused: track.el.paused, time: +track.el.currentTime.toFixed(1) } : null };
      if (amb) {
        o.events = amb.n;
        if (air) o.air = air.n;
        o.rms = { fire: rms(amb.taps.fire), mill: rms(amb.taps.mill), music: rms(music && music.tap), master: rms(amb.taps.master) };
        o.gain = { lava: amb.lava.g.gain.value, roar: amb.roar.g.gain.value, hum: amb.hum.g.gain.value };
      }
      return o;
    },
    // громкость эффектов и музыки 0…1 (настройки); до первого касания звука ещё нет — применится при init
    track: setTrack, // имя файла из MUSIC_TRACKS или null — без музыки
    trackUrls: function (urls) { track.urls = urls || {}; if (track.name) setTrack(track.name); }, // приложение: свои пути к трекам
    volumes: function (s, m) {
      vol.sfx = s;
      vol.music = m;
      if (!ctx) return;
      sfx.gain.setTargetAtTime(s, ctx.currentTime, 0.05);
      if (music) intense();
    },
    toggle: function () {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
      return muted;
    },
    jump: function (k) {
      play(function (t) {
        tone('sine', 300 + 60 * k, 690 + 90 * k, t, 0.15, 0.13);
        tone('triangle', 150, 320, t, 0.09, 0.05);
      });
    },
    spring: function () {
      play(function (t) {
        tone('square', 180, 1100, t, 0.3, 0.05);
        tone('sine', 360, 1500, t, 0.4, 0.13);
      });
    },
    coin: function () {
      play(function (t) {
        tone('triangle', 1320, 0, t, 0.09, 0.12);
        tone('triangle', 1760, 0, t + 0.06, 0.2, 0.12);
      });
    },
    // точное приземление: нота ступенькой вверх с каждым прыжком серии (пентатоника ре), на новом множителе — арпеджио
    perfect: function (n, up) {
      var notes = [587, 659, 784, 880, 988, 1175, 1319, 1568], f = notes[Math.min(n, notes.length) - 1];
      play(function (t) {
        tone('triangle', f, 0, t, 0.16, 0.1);
        tone('sine', f * 2, 0, t + 0.03, 0.22, 0.04);
        if (up) [1175, 1397, 1760].forEach(function (a, i) { tone('triangle', a, 0, t + 0.09 + i * 0.07, 0.24, 0.08); });
      });
    },
    crack: function () {
      play(function (t) {
        hiss(t, 0.25, 0.35, 1500);
        tone('square', 170, 60, t, 0.18, 0.05);
      });
    },
    stomp: function () {
      play(function (t) {
        tone('sine', 720, 180, t, 0.18, 0.18);
        hiss(t, 0.1, 0.2, 900);
      });
    },
    hurt: function () {
      play(function (t) {
        tone('sawtooth', 340, 110, t, 0.3, 0.09);
        tone('square', 220, 80, t + 0.05, 0.25, 0.04);
      });
    },
    swish: function (i) { // взмах мечом: рубящий, наотмашь (выше), круговой (длинный двойной свист)
      play(function (t) {
        if (i === 2) {
          hiss(t + 0.04, 0.34, 0.3, 500, 'bandpass', 2600);
          hiss(t + 0.2, 0.2, 0.22, 1200, 'bandpass', 4200);
          tone('sine', 220, 120, t, 0.3, 0.04);
          return;
        }
        var f = i === 1 ? 1300 : 800;
        hiss(t + 0.05, 0.18, 0.3, f, 'bandpass', f * 4.6);
        tone('sine', f * 1.1, f * 1.9, t + 0.05, 0.08, 0.03);
      });
    },
    hit: function () { // меч попал: глухой удар и звон
      play(function (t) {
        hiss(t, 0.09, 0.45, 900, 'lowpass', 200);
        tone('sine', 160, 60, t, 0.14, 0.2);
        tone('triangle', rand(1900, 2300), 0, t + 0.01, 0.3, 0.06);
      });
    },
    trick: function () { // свайп — кот закручивается
      play(function (t) {
        hiss(t, 0.3, 0.16, 600, 'bandpass', 2400);
        tone('sine', 400, 900, t, 0.25, 0.05);
      });
    },
    bonus: function (n) { // «Вся дуга», цепочка летунов: короткий перелив, выше с каждым шагом
      play(function (t) {
        [784, 988, 1175, 1568].slice(0, Math.min(4, n + 1)).forEach(function (f, i) { tone('triangle', f * (1 + (n - 2) * 0.06), 0, t + i * 0.06, 0.18, 0.08); });
      });
    },
    shield: function () { // подобрал щит: светлый звон
      play(function (t) {
        tone('sine', 880, 0, t, 0.4, 0.1);
        tone('sine', 1320, 0, t + 0.08, 0.5, 0.08);
        tone('triangle', 1760, 0, t + 0.16, 0.6, 0.05);
      });
    },
    thud: function (g) { // бочка катится: глухой деревянный стук на стыке плит (g — близость 0…1)
      if (!(g > 0.02)) return;
      play(function (t) {
        tone('sine', 150, 85, t, 0.12, 0.14 * g);
        hiss(t, 0.06, 0.1 * g, 600, 'lowpass');
      });
    },
    heart: function () { // подобрал сердце: «тук-тук» и тёплый восходящий перелив
      play(function (t) {
        tone('sine', 90, 48, t, 0.14, 0.32);
        tone('sine', 90, 48, t + 0.17, 0.14, 0.26);
        [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, 0, t + 0.12 + i * 0.07, 0.32, 0.08); });
      });
    },
    shieldBreak: function () { // щит спас серию — треснул
      play(function (t) {
        hiss(t, 0.25, 0.35, 3000, 'highpass');
        tone('square', 700, 300, t, 0.2, 0.05);
        tone('sine', 1320, 0, t + 0.05, 0.4, 0.06);
      });
    },
    // «Рыцарская ярость»: фанфара, музыка громче, барабан чаще; на выходе — обратно
    fury: function (on) {
      if (!ctx || !music) return;
      music.fury = on;
      intense();
      if (on) play(function (t) {
        [587, 880, 1175, 1319].forEach(function (f, i) { // ре — ля — ре — ми: открыто, без терции, как у рога
          tone('sawtooth', f, 0, t + i * 0.09, 0.28, 0.035);
          tone('triangle', f, 0, t + i * 0.09, 0.32, 0.06);
        });
      });
    },
    clang: function () { // меч по доспеху
      play(function (t) {
        tone('square', 1250, 900, t, 0.12, 0.06);
        tone('triangle', 2100, 0, t, 0.35, 0.08);
        hiss(t, 0.08, 0.2, 4000, 'highpass');
      });
    },
    bark: function () { // «гав!» пса-рыцаря
      play(function (t) {
        tone('square', 300, 170, t, 0.11, 0.07);
        tone('square', 320, 180, t + 0.14, 0.11, 0.07);
      });
    },
    burn: function () {
      play(function (t) {
        hiss(t, 0.45, 0.3, 700, 'lowpass', 2400);
        tone('sawtooth', 160, 90, t, 0.3, 0.04);
      });
    },
    fireball: function () {
      play(function (t) { hiss(t, 0.5, 0.3, 300, 'lowpass', 1400); });
    },
    roar: function (big) { // дракон появился; босс — ниже, громче и дольше
      play(function (t) {
        var k = big ? 0.6 : 1;
        tone('sawtooth', 220 * k, 140 * k, t, big ? 1.1 : 0.5, big ? 0.09 : 0.06);
        hiss(t, big ? 1 : 0.5, big ? 0.25 : 0.15, 500 * k, 'bandpass', 250 * k);
        if (big) tone('square', 90, 55, t + 0.05, 1, 0.05);
      });
    },
    parry: function (perfect) { // отбил шар: звонкий удар, у идеального — выше и с переливом
      play(function (t) {
        tone('triangle', perfect ? 2600 : 2000, 0, t, 0.35, 0.1);
        tone('square', perfect ? 1300 : 1000, perfect ? 1900 : 1300, t, 0.12, 0.05);
        hiss(t, 0.15, 0.25, 3000, 'highpass');
        if (perfect) tone('sine', 3200, 0, t + 0.08, 0.4, 0.06);
      });
    },
    dragonHit: function () { // отбитый шар попал в дракона: взрыв и рык
      play(function (t) {
        hiss(t, 0.4, 0.4, 1200, 'lowpass', 150);
        tone('sine', 120, 50, t, 0.35, 0.2);
        tone('sawtooth', 300, 160, t + 0.1, 0.35, 0.05);
      });
    },
    win: function () { // уровень пройден: восходящая фанфара
      play(function (t) {
        [587, 740, 880, 1175, 1480].forEach(function (f, i) {
          tone('triangle', f, 0, t + i * 0.09, 0.4, 0.08);
          tone('sawtooth', f, 0, t + i * 0.09, 0.3, 0.02);
        });
        tone('triangle', 1760, 0, t + 0.5, 0.8, 0.07);
      });
    },
    bossDown: function () { // дракон повержен: долгий рык вниз и победная фанфара в мажоре
      play(function (t) {
        tone('sawtooth', 200, 60, t, 1.2, 0.08);
        hiss(t, 1, 0.3, 600, 'bandpass', 120);
        [587, 740, 880, 1175, 1480, 1760].forEach(function (f, i) {
          tone('triangle', f, 0, t + 0.5 + i * 0.11, 0.5, 0.07);
          tone('sawtooth', f, 0, t + 0.5 + i * 0.11, 0.4, 0.025);
        });
      });
    },
    boom: function () { // пороховая бочка: глухой взрыв и треск
      play(function (t) {
        hiss(t, 0.7, 0.6, 1600, 'lowpass', 120);
        tone('sine', 110, 40, t, 0.5, 0.3);
        hiss(t + 0.05, 0.3, 0.2, 3000, 'highpass');
      });
    },
    thunder: function (far) { // гром после молнии: треск и долгий раскат; far 0…1 — дальше, тише и глуше
      var v = 1 - far * 0.6;
      play(function (t) {
        hiss(t, 0.3, 0.22 * v, 2600 - far * 1600, 'lowpass', 500);
        hiss(t + 0.06, 2.4, 0.45 * v, 420, 'lowpass', 80);
        tone('sine', 62, 36, t + 0.04, 2, 0.16 * v);
      });
    },
    gust: function () { // порыв метели: нарастает и стихает
      play(function (t) { hiss(t, 2.6, 0.12, 500, 'bandpass', 1700); });
    },
    axe: function (v) { // секира проходит низ — тяжёлый свист, громче рядом
      if (v < 0.03) return;
      play(function (t) {
        hiss(t, 0.4, 0.35 * v, 300, 'bandpass', 1200);
        tone('sine', 140, 90, t, 0.35, 0.06 * v);
      });
    },
    wings: function () { // крылья грифона: порыв и восходящий аккорд
      play(function (t) {
        hiss(t, 0.6, 0.3, 400, 'bandpass', 2000);
        [587, 880, 1175, 1760].forEach(function (f, i) { tone('triangle', f, 0, t + 0.1 + i * 0.08, 0.5, 0.06); });
      });
    },
    flap: function () { // взмах крыльев
      play(function (t) {
        hiss(t, 0.22, 0.14, 300, 'lowpass', 120);
        tone('sine', 90, 60, t, 0.15, 0.05);
      });
    },
    ice: function () { // кот заскользил по льду
      play(function (t) {
        hiss(t, 0.35, 0.18, 5000, 'highpass', 2500);
        tone('triangle', 1800, 900, t, 0.25, 0.03);
      });
    },
    boss: function (on) { // бой с боссом: музыка громче (как в ярости) и боевые барабаны поверх (drums)
      if (!ctx || !music) return;
      music.boss = on;
      intense();
    },
    squeak: function () {
      play(function (t) { tone('sine', 2400, 1700, t, 0.1, 0.06); });
    },
    rescue: function () {
      play(function (t) {
        [660, 880, 1100, 1320].forEach(function (f, i) { tone('triangle', f, 0, t + i * 0.06, 0.22, 0.1); });
      });
    },
    fall: function () {
      play(function (t) { tone('sine', 900, 160, t, 1.1, 0.12); });
    },
    over: function () {
      play(function (t) {
        [523, 440, 349, 262].forEach(function (f, i) { tone('triangle', f, 0, t + i * 0.16, 0.45, 0.13); });
      });
    },
    click: function () {
      play(function (t) { tone('sine', 880, 0, t, 0.06, 0.06); });
    }
  };
})();

export { Sound };

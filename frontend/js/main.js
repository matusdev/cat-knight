/* Please, don't do shit-code  */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from './ktx2loader.js'; // копия three без import.meta.url — сборка iife
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { tr, getLang, setLang, applyDom, plural } from './i18n.js';
import { load, save, loadObject, snapshot, restore } from './store.js';
import * as Shop from './shop.js';
import * as Missions from './missions.js';
import * as Daily from './daily.js';
import * as Telemetry from './telemetry.js';
import * as Native from './native.js';
import { makeCanvas, toTexture, setAnisotropy, paintMasonry, paintWood, paintCrate, paintGrain, paintCoin, paintBanner, paintCloud, paintCloudAtlas, paintDot, paintSpark, paintFur, paintLava, paintWake, paintSmear, paintFade, paintWater, paintBalloon, paintMoon, paintBlock, paintStrands, paintLabel } from './textures.js';
import { rand, clamp, lerp, smooth, ease, easeOut, rad, pickOf, prng } from './util.js';
import { LIGHT_K, CONFIG, DAY_KEYS, DAY_COLORS, DAY_NUMBERS, IS_TOUCH, DEBUG, AUTOPLAY, BOT, GOD, BIOMES, BIOME_ORDER, WORLDS, MUSIC_TRACKS } from './config.js';
import { PARTICLE_VS, PARTICLE_FS, fireTime, FLAME_VS, FLAME_FS } from './shaders.js';
import { Sound } from './sound.js';
import { createMenuIsle } from './menuisle.js';

Element.prototype.closest || (Element.prototype.closest = function (t) { for (var e = this; e;) { if (e.matches(t)) return e; e = e.parentElement } return null });

Element.prototype.matches || (Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.webkitMatchesSelector || Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector);

Object.assign || Object.defineProperty(Object, "assign", { enumerable: !1, configurable: !0, writable: !0, value: function (e) { "use strict"; if (null == e) throw new TypeError("Cannot convert first argument to object"); for (var t = Object(e), n = 1; n < arguments.length; n++) { var o = arguments[n]; if (null != o) for (var a = Object.keys(Object(o)), c = 0, b = a.length; c < b; c++) { var i = a[c], l = Object.getOwnPropertyDescriptor(o, i); void 0 !== l && l.enumerable && (t[i] = o[i]) } } return t } });

window.NodeList && !NodeList.prototype.forEach && (NodeList.prototype.forEach = Array.prototype.forEach);

function $$(e, o, t) { "function" != typeof o ? o = o || document : (t = o, o = document); var c = o.querySelectorAll(e); return c = Array.prototype.slice.call(o.querySelectorAll(e)), "function" == typeof t && c.forEach(function (e, o, c) { t(e, o, c) }), c }


/* ==========================================================================
   «Кот-рыцарь: Небесный замок» (playable)
   Вид как в Subway Surfers, механика Doodle Jump: острова стоят рядами в три колонки
   и уходят вперёд-вверх к замку. Кот сам отскакивает с ряда на ряд, наклон телефона
   ведёт его влево-вправо; тап по экрану — взмах мечом. Промах мимо острова — падение.
   Ловушки: гнилые доски, огненные острова, шипы, пёс-рыцарь; в небе — вороны,
   летучие мыши и дракончик с огненными шарами. День сменяется закатом, ночью и рассветом.
   Запасное управление: палец слева / справа от центра, стрелки / A, D; удар — пробел.
   Мир в метрах: X — вправо, Y — вверх, вперёд — к −Z (к замку).
   Графика процедурная (three.js + canvas-текстуры); фото героя — только на заставке и в аватаре.
   ?debug — хуки window.__game; ?debug=play — сразу в игру; &bot — автопилот; &god — без потери жизней.
   ========================================================================== */
(function () {
  'use strict';

  var T = THREE;
  // с r155 свет считается физически: прежняя яркость солнца и неба = старое число × π


  var BEST_KEY = 'catKnight.best';
  function bestKey() { return settings.style === 'hop' ? BEST_KEY : BEST_KEY + '.' + settings.style; } // рекорд у каждого режима свой
  var STATES = ['start', 'play', 'pause', 'fall', 'over', 'map', 'win', 'coach', 'settings', 'shop', 'quests', 'codex', 'daily', 'save'];
  var LAYER_WORLD = 0, LAYER_CAT = 1, LAYER_FAR = 2; // слои отрисовки: дорога, кот поверх, замок и небо

  var el = {};
  var renderer = null, scene = null, camera = null, sun = null, hemi = null, fogNear = null, fogFar = null, envMap = null;
  var view = { w: 1, h: 1, pr: 1, prCap: 1, k: 1, pitch: 0.3, horizon: 0.2 };
  var tex = {}, mat = {}, geo = {}, geoCache = {}, pools = {};
  var models = {}; // модели из Blender (_not_main/blender); нет модели — остров собирается процедурно
  var cat = null, castle = null, sky = {}, fxDust = null, fxGlow = null, fxFire = null, coins = null, roadClouds = null;
  var islands = [], decor = [], clouds = [], mist = [];
  var litMats = [], cloudMats = [];
  var day = {}, dayTime = 0, skyTimer = 0;

  var state = 'loading', hidden = false, frozen = false; // frozen — ?debug: кадры идут только по __game.step
  var time = 0, simTime = 0, stepAcc = 0, lastFrame = 0, fallTimer = 0, hintTimer = 0;
  var player = {}, cam = { x: 0, y: 0, z: 0, intro: 1, shake: 0, ko: 0 };
  var world = { rows: [], coins: [], flyers: [], fireballs: [], pickups: [], rollers: [], runPlan: [], laneOb: [-1e9, -1e9, -1e9], markers: [], dragon: null, dragonAt: null, boss: null, bossAt: 0, bosses: 0 };
  var hud = { coins: -1, meters: -1, lives: -1, combo: -1, mult: 1, shield: null, fury: -1, boss: -1 };
  var tips = {}; // подсказки, которые показываем один раз за игру (пёс, дракончик)
  var best = 0;
  var perf = { acc: 0, n: 0 }, perfRun = { t: 0, n: 0 };
  var debugStats = {}; // ?debug: причины потери жизней
  var debugEvents = {}; // ?debug: события серии и боя (автопроверка смотрит, что они случаются)
  function note(k) { if (DEBUG) debugEvents[k] = (debugEvents[k] || 0) + 1; }

  var input = {
    tilt: false, tx: 0, cx: 0, calibrate: true,
    motion: false, motionAllowed: false,
    touches: [],
    keys: { left: false, right: false }
  };


  /* ---------- Утилиты ---------- */


  // случайность генератора дороги: в забеге — Math.random, в уровне кампании — с «зерном» уровня (resetRound),
  // чтобы каждая попытка шла по той же дороге. Частицы и прочий облик берут Math.random — на дорогу не влияют
  var genRandom = Math.random;
  function grand(a, b) { return a + genRandom() * (b - a); }
  function gpick(list) { return list[(genRandom() * list.length) | 0]; }


  function difficulty(dist) { return clamp(dist / CONFIG.gen.hardAt, 0, 1); }

  // направление на светило: азимут вправо от взгляда к замку (−Z), высота над горизонтом
  function skyDir(el, az, out) {
    var e = rad(el), a = rad(az);
    return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  }


  /* ---------- Текстуры (рисуются на canvas при запуске) ---------- */

  // холсты текстур один раз читаются обратно (bledTexture) — браузеру лучше знать это заранее; live — перерисовывается

  function buildTextures() {
    tex.side = paintMasonry({ w: 512, h: 256, rows: 4, len: 150, gap: 7, round: 0.2, mortar: '#51483f', base: [150, 138, 121], spread: 0.15, moss: 0.1, grain: 18 });
    tex.side.map.repeat.set(1 / 2.2, 1 / 1.1);
    tex.block = paintBlock();
    tex.strands = paintStrands();
    tex.castle = tex.side.map.clone();
    tex.castle.needsUpdate = true;
    tex.castle.repeat.set(1 / 7, 1 / 3.5);
    tex.wood = paintWood();
    tex.wood.repeat.set(1 / 0.4, 1 / 2);
    tex.crate = paintCrate();
    tex.coin = paintCoin();
    tex.banner = paintBanner();
    tex.grain = paintGrain();
    tex.clouds = [paintCloud(1), paintCloud(2), paintCloud(3)];
    tex.cloudAtlas = paintCloudAtlas();
    tex.dot = paintDot();
    tex.spark = paintSpark();
    tex.fur = paintFur();
    tex.lava = paintLava();
    tex.puff = paintPuff();
    tex.wake = paintWake();
    tex.smear = paintSmear();
    tex.water = paintWater();
    tex.water.repeat.set(1, 2.3);
    tex.fade = paintFade();
    tex.balloon = paintBalloon();
    tex.moon = paintMoon();
    tex.skyCanvas = makeCanvas(4, 256, true);
    tex.sky = toTexture(tex.skyCanvas, { repeat: false, live: true });
  }


  /* ---------- Материалы и общие геометрии ---------- */

  function std(o) { return new T.MeshStandardMaterial(o); }
  function glowSprite(color, opacity) {
    return new T.SpriteMaterial({ map: tex.dot, color: color, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: opacity });
  }

// Ткань, что развевается: вершины гуляют волной от закреплённого верха (uv.y = 1) вниз, сильнее к низу;
  // нормали — по производным волны (складки ловят свет). Время — общее с огнём (fireTime), фаза — по месту стяга.
  // w, h — размер полотнища, м; amp — размах волны у низа, м
  function clothMaterial(map, w, h, amp) {
    var m = std({ map: map, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.88 });
    var A = amp.toFixed(3), W = w.toFixed(3), H = h.toFixed(3);
    m.onBeforeCompile = function (shader) {
      skyFogUniforms(shader);
      shader.uniforms.uTime = fireTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
        .replace('#include <beginnormal_vertex>', [
          'float clW = 1.0 - uv.y;',
          'float clPh = modelMatrix[3].x * 0.9 + modelMatrix[3].z * 0.37;',
          '#ifdef USE_INSTANCING',
          'clPh += instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.37;',
          '#endif',
          'float clA = uTime * 2.6 + clW * 4.4 + uv.x * 1.8 + clPh;',
          'float clB = uTime * 1.6 + uv.x * 3.3 - clW * 1.5 + clPh * 1.7;',
          'float clS = sin( clA ) + 0.45 * sin( clB );',
          'float clAmp = ' + A + ' * pow( clW, 0.8 );',
          'float clZ = clAmp * clS;',
          'float clDw = ' + A + ' * 0.8 * pow( max( clW, 0.02 ), -0.2 ) * clS + clAmp * ( 4.4 * cos( clA ) - 0.675 * cos( clB ) );',
          'float clDu = clAmp * ( 1.8 * cos( clA ) + 1.485 * cos( clB ) );',
          'vec3 objectNormal = normalize( vec3( -clDu / ' + W + ', clDw / ' + H + ', 1.0 ) );',
          '#ifdef USE_TANGENT',
          'vec3 objectTangent = vec3( tangent.xyz );',
          '#endif'
        ].join('\n'))
        // стандартный кусок остаётся: в нём и координата для растворения (alphaHash — ворота, пробежав, тают)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += clZ;\ntransformed.x += ' + (amp * 0.35).toFixed(3) + ' * clW * clW * sin( uTime * 1.3 + clPh );');
    };
    m.customProgramCacheKey = function () { return 'cloth' + W + 'x' + H + 'a' + A; }; // у каждого размера — своя программа
    return m;
  }

// Зерно камня вблизи: атлас мостов рассчитан на средний план, у камеры плиты — гладкие пятна. Серое зерно
  // (tex.grain) ложится с трёх сторон по мировым координатам (плитка ~0,45 м), сильнее у камеры и гаснет к 16 м,
  // где дало бы рябь; меняет альбедо на ±30% и чуть шероховатость. Работает и для пачек островов (инстансы)
  function stoneDetail(m) {
    var prev = m.onBeforeCompile;
    m.onBeforeCompile = function (shader, r) {
      if (prev) prev.call(this, shader, r);
      shader.uniforms.grainMap = { value: tex.grain };
      shader.vertexShader = 'varying vec3 vGrainW;\nvarying vec3 vGrainN;\n' + shader.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 grainP = vec4( transformed, 1.0 );',
        'vec3 grainN = objectNormal;',
        '#ifdef USE_INSTANCING',
        'grainP = instanceMatrix * grainP;',
        'grainN = mat3( instanceMatrix ) * grainN;',
        '#endif',
        'vGrainW = ( modelMatrix * grainP ).xyz;',
        'vGrainN = normalize( mat3( modelMatrix ) * grainN );'
      ].join('\n'));
      shader.fragmentShader = 'uniform sampler2D grainMap;\nvarying vec3 vGrainW;\nvarying vec3 vGrainN;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          'vec3 grainB = pow( abs( vGrainN ), vec3( 4.0 ) );',
          'grainB /= grainB.x + grainB.y + grainB.z;',
          'vec3 grainUV = vGrainW * 2.2;',
          'float grain = texture2D( grainMap, grainUV.zy ).r * grainB.x + texture2D( grainMap, grainUV.xz ).r * grainB.y + texture2D( grainMap, grainUV.xy ).r * grainB.z;',
          'float grainK = 1.0 - smoothstep( 6.0, 16.0, distance( vGrainW, cameraPosition ) );',
          'diffuseColor.rgb *= 1.0 + ( grain - 0.5 ) * 0.65 * grainK;'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + ( grain - 0.5 ) * 0.25 * grainK, 0.0, 1.0 );');
    };
    var key = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = function () { return key() + 'grain'; };
    return m;
  }

  function buildMaterials() {
    var D = T.DoubleSide;
    // тёсаные блоки островов: цвет каждого блока и затенение снизу — в цветах вершин
    mat.block = std({ map: tex.block.map, bumpMap: tex.block.bump, bumpScale: 0.06, vertexColors: true, roughness: 0.92, envMapIntensity: 0.55 });
    mat.blockLava = std({ map: tex.block.map, bumpMap: tex.block.bump, bumpScale: 0.06, vertexColors: true, color: '#5e4c46', roughness: 0.85, emissive: '#ff6a1c', emissiveMap: tex.lava, emissiveIntensity: 0.8 });
    if (models.bridge) { // кладка моста: цвет с затенением, рельеф и маска швов запечены в Blender
      var B = models.bridge.tex, bridge = function (o) {
        return std(Object.assign({ map: B.map, normalMap: B.normalMap, normalScale: B.normalScale, roughness: 0.9, envMapIntensity: 0.55 }, o));
      };
      mat.bridge = [bridge({}), bridge({ color: '#e6e2de' }), bridge({ color: '#fff2e2' })]; // три оттенка — по варианту острова
      // огненный: тёмный камень, лава светится в швах
      mat.bridgeLava = bridge({ color: '#5e4c46', roughness: 0.85, envMapIntensity: 0.8, emissive: '#ff5a14', emissiveMap: B.emissiveMap, emissiveIntensity: 0.62 });
      // призрачный: голубой полупрозрачный камень, швы светятся
      mat.ghost = bridge({ color: '#a6d6ff', emissive: '#3a7bff', emissiveMap: B.emissiveMap, emissiveIntensity: 1.2, transparent: true });
      mat.bridge.concat([mat.bridgeLava, mat.ghost]).forEach(stoneDetail);
    }
    if (models.islands) { // боковые острова: в «свечении» запечены окна и кристаллы — ночью разгораются (updateDayNight)
      var I = models.islands.tex;
      mat.island = stoneDetail(std({ map: I.map, normalMap: I.normalMap, normalScale: I.normalScale, emissive: '#ffffff', emissiveMap: I.emissiveMap, emissiveIntensity: 0.1, roughness: 0.9, envMapIntensity: 0.5 }));
    }
    if (models.castle) { // замок: камень чуть холоднее моста — даль; ночью горят окна
      var C = models.castle.tex;
      mat.castleStone = std({ map: C.map, normalMap: C.normalMap, normalScale: C.normalScale, color: '#eef1f6', emissive: '#ffffff', emissiveMap: C.emissiveMap, emissiveIntensity: 0.1, roughness: 0.9, envMapIntensity: 0.5 });
    }
    mat.body = std({ map: tex.side.map, bumpMap: tex.side.bump, bumpScale: 0.035, color: '#d9d0c2', roughness: 0.95, envMapIntensity: 0.7 });
    mat.deckWood = std({ map: tex.wood, color: '#c49a72', vertexColors: true, roughness: 0.9, envMapIntensity: 0.5 }); // помост без модели (decks.glb)
    if (models.gates) { // большие ворота: в «свечении» запечены бойницы — ночью горят (updateDayNight)
      var GT = models.gates.tex;
      mat.gateStone = stoneDetail(std({ map: GT.map, normalMap: GT.normalMap, normalScale: GT.normalScale, emissive: '#ffffff', emissiveMap: GT.emissiveMap, emissiveIntensity: 0.1, roughness: 0.9, envMapIntensity: 0.5 }));
    }
    if (models.decks) { // верхние виадуки из Blender: камень окрашивается по биому, как мост; дерево — нет
      var DK = models.decks.tex, deckMat = function (o) { return std(Object.assign({ map: DK.map, normalMap: DK.normalMap, normalScale: DK.normalScale, roughness: 0.9, envMapIntensity: 0.55 }, o)); };
      mat.deckStone = stoneDetail(deckMat({}));
      mat.deckTimber = deckMat({ envMapIntensity: 0.45 });
    }
    mat.parapet = stoneDetail(std({ map: tex.block.map, bumpMap: tex.block.bump, bumpScale: 0.06, vertexColors: true, roughness: 0.92, envMapIntensity: 0.55 })); // парапет виадука
    mat.depthOnly = new T.MeshBasicMaterial({ colorWrite: false }); // проход «препятствия закрывают кота» — только глубина
    mat.rock = std({ map: tex.side.map, color: '#b1a491', roughness: 1, flatShading: true, envMapIntensity: 0.6 });
    mat.basalt = std({ map: tex.side.map, color: '#5f514b', roughness: 1, flatShading: true, envMapIntensity: 0.5 });
    mat.grass = std({ color: '#80a64b', roughness: 1, envMapIntensity: 0.6 });
    mat.wood = std({ map: tex.wood, color: '#a88a70', roughness: 0.95 });
    mat.woodDark = std({ map: tex.wood, color: '#6e5442', roughness: 0.95 });
    mat.crate = std({ map: tex.crate, roughness: 0.8 });
    mat.gold = std({ color: '#ffc845', metalness: 1, roughness: 0.25, emissive: '#6b4300', emissiveIntensity: 0.45 });
    mat.coinFace = std({ map: tex.coin, metalness: 0.85, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.4 });
    mat.banner = std({ map: tex.banner, alphaTest: 0.5, side: D, roughness: 0.9 }); // стяги на стенах замка и островов
    mat.bannerWave = clothMaterial(tex.banner, 0.5, 0.85, 0.05); // флажки на столбах и ворота финиша — развеваются
    mat.pole = std({ color: '#56392a', roughness: 0.8 });
    mat.iron = std({ color: '#3b3d44', metalness: 0.7, roughness: 0.5 });
    mat.ice = std({ color: '#7cc6f5', roughness: 0.32, metalness: 0, emissive: '#1f5f92', emissiveIntensity: 0.14, transparent: true, opacity: 0.88, envMapIntensity: 0.6 }); // голубой — издалека не спутать с камнем; не зеркальный: блик солнца на «Красиво» засвечивал плиту
    if (!mat.ghost) mat.ghost = std({ map: tex.block.map, vertexColors: true, color: '#a6d6ff', emissive: '#3a7bff', emissiveIntensity: 0.3, roughness: 0.8, transparent: true });
    mat.metal = std({ color: '#d3d8e0', metalness: 0.9, roughness: 0.28 });
    mat.steel = std({ color: '#8d949f', metalness: 0.85, roughness: 0.36 });
    mat.leather = std({ color: '#6c4325', roughness: 0.75 });
    mat.white = new T.MeshBasicMaterial({ color: '#ffffff' });
    mat.eye = std({ color: '#1b1310', roughness: 0.12 });
    // ездящие острова: голубая руна; «бешеные» — оранжевая
    mat.rune = new T.MeshBasicMaterial({ color: '#8ff3ff' });
    mat.crystal = std({ color: '#7ae8ff', emissive: '#2fb8e6', emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.15, flatShading: true });
    mat.glow = glowSprite('#4fd2f5', 0.4);
    mat.fastRune = new T.MeshBasicMaterial({ color: '#ffb347' });
    mat.fastCrystal = std({ color: '#ffa04a', emissive: '#ff5a00', emissiveIntensity: 1.3, metalness: 0.2, roughness: 0.2, flatShading: true });
    mat.fastGlow = glowSprite('#ff8a2a', 0.5);
    // шлейф «бешеного»: жар от кристалла и воздушный след от плиты; цвет и прозрачность — в вершинах.
    // Жар не аддитивный: на светлом небе свечение выцветает, а обычное смешивание держит оранжевый
    mat.wakeHot = new T.MeshBasicMaterial({ map: tex.wake, vertexColors: true, transparent: true, depthWrite: false, side: D, fog: false });
    mat.wakeAir = new T.MeshBasicMaterial({ map: tex.wake, vertexColors: true, transparent: true, depthWrite: false, side: D, fog: false });
    // огненный остров и шипы
    mat.flame = flameMaterial();
    geo.flame = new T.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    mat.spike = std({ color: '#a7aeb8', metalness: 0.85, roughness: 0.3 });
    // ночные огни: окна, фонари, кристаллы
    mat.window = std({ color: '#3a3328', emissive: '#ffc35c', emissiveIntensity: 0.1, roughness: 1 });
    mat.lantern = new T.MeshBasicMaterial({ color: '#ffd77a' });
    mat.lanternHalo = glowSprite('#ffc15a', 0);
    mat.crystalBig = std({ color: '#b88cff', emissive: '#8a4dff', emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.2, flatShading: true });
    // замок и острова по краям
    mat.castle = std({ map: tex.castle, color: '#dde0e6', roughness: 0.95 });
    mat.roof = std({ color: '#6a7a92', roughness: 0.75, flatShading: true });
    mat.roofRed = std({ color: '#c4473a', roughness: 0.8, flatShading: true });
    mat.roofBlue = std({ color: '#4565c4', roughness: 0.7, flatShading: true });
    mat.plaster = std({ color: '#efe1c4', roughness: 0.95 });
    mat.bark = std({ color: '#6b4a32', roughness: 0.95 });
    mat.leaf = std({ color: '#4f9a45', roughness: 1, flatShading: true });
    mat.leafLight = std({ color: '#7cc35a', roughness: 1, flatShading: true });
    mat.flower = std({ color: '#ff8fb1', roughness: 0.8 });
    mat.sail = std({ color: '#f1ead8', roughness: 0.95, side: D });
    mat.water = std({ color: '#5ab7e8', roughness: 0.15, metalness: 0.2 });
    mat.waterfall = new T.MeshBasicMaterial({ map: tex.water, alphaMap: tex.fade, color: '#d8f2ff', transparent: true, depthWrite: false, side: D }); // струя тает книзу
    mat.balloon = std({ map: tex.balloon, roughness: 0.7 });
    mat.canvas = std({ color: '#d9c59b', roughness: 0.85 });
    mat.dark = std({ color: '#2b2b36', roughness: 1 });
    mat.flag = std({ color: '#b3262b', roughness: 0.9, side: D });
    mat.pine = std({ color: '#3f6b3c', roughness: 1, flatShading: true });
    // враги
    mat.crow = std({ color: '#302a3d', roughness: 0.5, metalness: 0.15 });
    mat.birdWing = std({ color: '#302a3d', roughness: 0.6, side: D }); // крыло птицы стаи — плоское, видно с обеих сторон
    mat.beak = std({ color: '#f2a93b', roughness: 0.5 });
    mat.crowEye = new T.MeshBasicMaterial({ color: '#ffd54a' });
    mat.bat = std({ color: '#3b2b4d', roughness: 0.7 });
    mat.batWing = std({ color: '#5d4476', roughness: 0.8, side: D });
    mat.batEye = new T.MeshBasicMaterial({ color: '#ff4d4d' });
    mat.eyeGlow = new T.MeshBasicMaterial({ vertexColors: true }); // глаза врагов из модели: цвет — в вершинах, светятся и ночью
    mat.dragon = std({ color: '#5bb24a', roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0 }); // от попадания вспыхивает белым
    mat.dragonBelly = std({ color: '#f3d36e', roughness: 0.7 });
    mat.dragonWing = std({ color: '#3a7f45', roughness: 0.75, side: D });
    mat.horn = std({ color: '#efe3c4', roughness: 0.6 });
    mat.dragonEye = new T.MeshBasicMaterial({ color: '#ffe14a' });
    mat.fireball = new T.MeshBasicMaterial({ color: '#ffd27a' });
    mat.fireGlow = glowSprite('#ff7a1a', 0.9);
    mat.fireballBack = new T.MeshBasicMaterial({ color: '#e2f6ff' }); // отбитый мечом шар — бело-голубой
    mat.fireGlowBack = glowSprite('#3fb4ff', 0.95);
    mat.bolt = new T.MeshBasicMaterial({ color: '#efe6ff', transparent: true, opacity: 0, depthWrite: false, fog: false, side: D }); // молния грозы
    mat.boss = std({ color: '#b3282d', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0 }); // от попадания вспыхивает белым
    mat.bossBelly = std({ color: '#f0a83c', roughness: 0.6 });
    mat.bossWing = std({ color: '#571527', roughness: 0.7, side: D });
    mat.dogFur = std({ color: '#b97c45', roughness: 1 });
    mat.dogLight = std({ color: '#f3e3c7', roughness: 1 });
    mat.dogEar = std({ color: '#5b3a26', roughness: 1 });
    mat.nose = std({ color: '#22180f', roughness: 0.3 });
    mat.tabard = std({ color: '#2f4f9e', roughness: 0.9 });
    mat.shield = std({ color: '#c23b33', roughness: 0.6 });
    mat.smear = new T.MeshBasicMaterial({ map: tex.smear, vertexColors: true, transparent: true, depthWrite: false, side: D, fog: false });
    mat.aura = glowSprite('#ffb52e', 0.5);
    mat.aura.fog = false;
    mat.shieldPick = std({ color: '#2f63c8', metalness: 0.35, roughness: 0.35, emissive: '#123a8a', emissiveIntensity: 0.5 });
    mat.shieldGlow = glowSprite('#8fd0ff', 0.5);
    mat.featherGlow = glowSprite('#ffd27a', 0.55);
    mat.heartGlow = glowSprite('#ff7f8f', 0.55);
    // шляпы и спутники кота (лавка)
    mat.hatGem = std({ color: '#d8243a', roughness: 0.25, metalness: 0.1 });
    mat.hatGem2 = std({ color: '#2f6fe0', roughness: 0.25, metalness: 0.1 });
    mat.hatBeret = std({ color: '#b52a33', roughness: 0.85 });
    mat.hatFeather = std({ color: '#fff4dc', roughness: 0.7 });
    mat.hatWizard = std({ color: '#43359b', roughness: 0.75 });
    mat.petGlow = std({ color: '#fff0a0', emissive: '#ffd040', emissiveIntensity: 1.6, roughness: 0.5 });
    mat.petOwl = std({ color: '#a77b4e', roughness: 0.9 });
    mat.petOwlBelly = std({ color: '#f1dcb4', roughness: 0.9 });
    collectLit([mat.hatGem, mat.hatGem2, mat.hatBeret, mat.hatFeather, mat.hatWizard, mat.petOwl, mat.petOwlBelly]);
    mat.heart = new T.MeshStandardMaterial({ color: '#f2384a', emissive: '#7a0a1a', emissiveIntensity: 0.45, roughness: 0.28, metalness: 0.05, envMapIntensity: 0.9 });
    mat.magnet = std({ color: '#d8343a', roughness: 0.4, metalness: 0.2 });
    mat.golemIce = std({ color: '#7fb4e0', roughness: 0.45, metalness: 0.05, emissive: '#ffffff', emissiveIntensity: 0, flatShading: true });
    mat.iceGlow = new T.MeshBasicMaterial({ color: '#8fe4ff' });
    mat.golemLava = std({ color: '#3a2a26', roughness: 0.9, emissive: '#ff5a14', emissiveIntensity: 0.14, flatShading: true });
    mat.lavaGlow = new T.MeshBasicMaterial({ color: '#ffb14a' });
    mat.ghostArmor = std({ color: '#7a5cc8', roughness: 0.35, metalness: 0.3, emissive: '#6a3cff', emissiveIntensity: 0.3, transparent: true, opacity: 0.8, depthWrite: false });
    mat.ghostGlow = new T.MeshBasicMaterial({ color: '#c9f0ff' });
    mat.ghostCloak = std({ color: '#2a1a48', roughness: 0.9, side: T.DoubleSide, transparent: true, opacity: 0.8 });
    mat.bubble = new T.MeshPhysicalMaterial({ color: '#bfe6ff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, iridescence: 1, iridescenceIOR: 1.3, depthWrite: false, side: T.FrontSide, envMapIntensity: 1.5 });

    geo.sphere = new T.SphereGeometry(1, 24, 16);
    geo.sphereLow = new T.SphereGeometry(1, 10, 8);
    geo.ico = new T.IcosahedronGeometry(1, 0);
    // монета: ребро и две грани — отдельные геометрии под два инстанс-меша
    geo.coinRim = new T.CylinderGeometry(0.3, 0.3, 0.07, 24, 1, true);
    geo.coinRim.rotateX(Math.PI / 2);
    geo.coinFace = mergeParts([part(new T.CircleGeometry(0.3, 24), [0, 0, 0.035]), part(new T.CircleGeometry(0.3, 24), [0, 0, -0.035], [0, Math.PI, 0])]);
    geo.crate = new T.BoxGeometry(CONFIG.platform.crate, CONFIG.platform.crate, CONFIG.platform.crate);
    geo.crate.translate(0, CONFIG.platform.crate / 2, 0);
    geo.crystal = new T.OctahedronGeometry(0.28, 0);
    geo.octa = new T.OctahedronGeometry(1, 0);
    geo.banner = new T.PlaneGeometry(0.5, 0.85, 5, 9); // сетка — чтобы ткань гнулась волной (clothMaterial)
    geo.banner.translate(0, -0.425, 0);
    geo.bigBanner = new T.PlaneGeometry(1, 1.8);
    geo.bigBanner.translate(0, -0.9, 0);
    geo.whisker = new T.CylinderGeometry(0.005, 0.005, 0.32, 3);
    geo.spike = new T.ConeGeometry(0.09, 0.42, 5);
    geo.block = unitBlock();
  }

  // единичный камень со скруглёнными рёбрами (1×1×1, центр в нуле) — из таких собраны острова
  function unitBlock() {
    var b = 0.09, h = 0.5 - b, r = 0.1, s = new T.Shape();
    s.moveTo(-h + r, -h);
    s.lineTo(h - r, -h);
    s.quadraticCurveTo(h, -h, h, -h + r);
    s.lineTo(h, h - r);
    s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h);
    s.quadraticCurveTo(-h, h, -h, h - r);
    s.lineTo(-h, -h + r);
    s.quadraticCurveTo(-h, -h, -h + r, -h);
    var g = new T.ExtrudeGeometry(s, { depth: 1 - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(0.5 - b), 0);
    return g;
  }

  // материалы, у которых ночью приглушаются отражения неба (иначе металл блестит, как днём).
  // Отражения задаются каждому материалу своей envMap: с общим scene.environment three r186
  // игнорирует envMapIntensity материала и берёт одну яркость на всю сцену
  function collectLit(list) {
    list.forEach(function (m) {
      if (m && m.isMeshStandardMaterial && litMats.indexOf(m) < 0) {
        if (!m.envMap) m.envMap = envMap;
        m.userData.env = m.envMapIntensity;
        litMats.push(m);
      }
    });
  }

  // коробка с UV в метрах: текстура с repeat = 1/тайл ложится одинаково на любые размеры
  function boxGeo(w, h, d, shift) {
    var g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv;
    var faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x −x +y −y +z −z
    var ou = shift ? rand(0, 3) : 0, ov = shift ? rand(0, 3) : 0;
    for (var i = 0; i < uv.count; i++) {
      var f = faces[(i / 4) | 0];
      uv.setXY(i, uv.getX(i) * f[0] + ou, uv.getY(i) * f[1] + ov);
    }
    return g;
  }

  function cylGeo(rt, rb, h, seg) {
    var g = new T.CylinderGeometry(rt, rb, h, seg), uv = g.attributes.uv, k = Math.PI * (rt + rb);
    for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * h);
    return g;
  }

  // неровный каменный конус (низ летающего острова)
  function rockGeo(rTop, rBottom, h, seg, rough, seed) {
    var g = new T.CylinderGeometry(rTop, rBottom, h, seg, 3, true), p = g.attributes.position, uv = g.attributes.uv;
    var r = prng(seed), cache = {}, k = Math.PI * (rTop + rBottom);
    for (var i = 0; i < p.count; i++) {
      var key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      var j = cache[key] || (cache[key] = [1 + (r() - 0.5) * rough, (r() - 0.5) * h * 0.12]);
      var top = p.getY(i) > h / 2 - 0.001;
      p.setXYZ(i, p.getX(i) * (top ? 1 : j[0]), p.getY(i) + (top ? 0 : j[1]), p.getZ(i) * (top ? 1 : j[0]));
      uv.setXY(i, uv.getX(i) * k, uv.getY(i) * h);
    }
    g.computeVertexNormals();
    return g;
  }

  // перепончатое крыло (летучая мышь, дракон): размах вдоль +X, передняя кромка к +Z, фестоны по заднему краю
  function wingGeo(span, chord) {
    var s = new T.Shape();
    s.moveTo(0, chord * 0.5);
    s.lineTo(span * 0.45, chord * 0.7);
    s.lineTo(span, chord * 0.15);
    s.lineTo(span * 0.78, -chord * 0.35);
    s.lineTo(span * 0.6, -chord * 0.1);
    s.lineTo(span * 0.42, -chord * 0.45);
    s.lineTo(span * 0.24, -chord * 0.15);
    s.lineTo(0, -chord * 0.4);
    s.closePath();
    var g = new T.ShapeGeometry(s);
    g.rotateX(Math.PI / 2);
    return g;
  }

  // tint — оттенок детали [r, g, b]: уходит в цвета вершин, низ детали затемняется (имитация затенения)
  function part(g, pos, rot, scl, tint) {
    var s = scl == null ? 1 : scl;
    var m = new T.Matrix4().compose(
      new T.Vector3(pos[0], pos[1], pos[2]),
      new T.Quaternion().setFromEuler(new T.Euler(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0)),
      typeof s === 'number' ? new T.Vector3(s, s, s) : new T.Vector3(s[0], s[1], s[2])
    );
    return { g: g, m: m, tint: tint };
  }

  function mergeParts(parts) {
    var pos = [], nor = [], uv = [], col = [], tinted = parts.some(function (p) { return p.tint; });
    var push = function (target, arr) { for (var i = 0; i < arr.length; i++) target.push(arr[i]); };
    parts.forEach(function (p) {
      var g = p.g.index ? p.g.toNonIndexed() : p.g.clone(), a = g.attributes, i;
      g.applyMatrix4(p.m);
      push(pos, a.position.array);
      push(nor, a.normal.array);
      if (p.uvOff) for (i = 0; i < a.uv.count; i++) a.uv.setXY(i, a.uv.getX(i) + p.uvOff[0], a.uv.getY(i) + p.uvOff[1]);
      push(uv, a.uv.array);
      if (tinted) {
        var t = p.tint || [1, 1, 1];
        g.computeBoundingBox();
        var y0 = g.boundingBox.min.y, dy = Math.max(0.001, g.boundingBox.max.y - y0);
        for (i = 0; i < a.position.count; i++) {
          var k = 0.62 + 0.38 * Math.pow((a.position.getY(i) - y0) / dy, 0.7);
          col.push(t[0] * k, t[1] * k, t[2] * k);
        }
      }
      g.dispose();
    });
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    if (tinted) out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // случайный оттенок камня: чуть теплее или холоднее, k — общая яркость (нижние ряды темнее)
  function stoneTint(r, k) {
    var v = (0.82 + r() * 0.26) * k;
    return [v * (1 + (r() - 0.5) * 0.06), v, v * (1 - (r() - 0.35) * 0.08)];
  }

  // сетка тёсаных блоков cols×rows на площадке gw×gd; верх блоков — около y0
  function blockGrid(parts, r, gw, gd, cols, rows, y0, h, k, jitter) {
    var bw = gw / cols, bd = gd / rows;
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var hh = h * (1 + (r() - 0.5) * 0.12), top = y0 + (r() - 0.6) * jitter;
        var p = part(geo.block, [-gw / 2 + bw * (i + 0.5) + (r() - 0.5) * 0.04, top - hh / 2, -gd / 2 + bd * (j + 0.5) + (r() - 0.5) * 0.04], [0, (r() - 0.5) * 0.06, 0], [bw * 0.96, hh, bd * 0.96], stoneTint(r, k));
        p.uvOff = [r(), r()];
        parts.push(p);
      }
    }
  }

  // набор деталей, склеиваемых в один меш на материал — меньше вызовов отрисовки
  function Bundle() {
    this.groups = {};
    this.order = [];
  }

  Bundle.prototype.add = function (g, material, pos, rot, scl, tint, uvOff) {
    var id = material.uuid, p = part(g, pos, rot, scl, tint);
    p.uvOff = uvOff;
    if (!this.groups[id]) {
      this.groups[id] = { material: material, parts: [] };
      this.order.push(id);
    }
    this.groups[id].parts.push(p);
    return this;
  };

  Bundle.prototype.build = function (parent, opts) {
    var self = this, out = [];
    opts = opts || {};
    this.order.forEach(function (id) {
      var grp = self.groups[id], mesh = new T.Mesh(mergeParts(grp.parts), grp.material);
      mesh.castShadow = !!opts.cast;
      mesh.receiveShadow = !!opts.receive;
      parent.add(mesh);
      out.push(mesh);
    });
    return out;
  };


  /* ---------- Пул объектов: острова, монеты, враги не создаются заново ---------- */

  function acquire(key, make) {
    var list = pools[key], o = list && list.length ? list.pop() : make();
    o.userData.poolKey = key;
    o.visible = true;
    scene.add(o);
    return o;
  }

  function release(o) {
    if (!o) return;
    scene.remove(o);
    (pools[o.userData.poolKey] || (pools[o.userData.poolKey] = [])).push(o);
  }


  /* ---------- Острова дороги ---------- */

  // Остров дороги собран из отдельных тёсаных блоков, как кладка на референсе: верхний ряд — площадка
  // (верх около y = 0), под ней ступенчатый «киль» из блоков поменьше и скальный конус.
  function islandParts(w, d, variant) {
    var key = 'isl' + w + 'x' + d + '_' + variant;
    if (geoCache[key]) return geoCache[key];
    var r = prng(variant * 131 + Math.round(w * 10) * 7 + Math.round(d * 10)), top = [], under = [];
    var cols = Math.max(2, Math.round(w / 0.62)), rows = Math.max(2, Math.round(d / 0.62));
    blockGrid(top, r, w, d, cols, rows, 0.012, 0.5, 1, 0.03);
    blockGrid(under, r, w * 0.78, d * 0.74, Math.max(1, cols - 1), Math.max(1, rows - 1), -0.47, 0.42, 0.8, 0.03);
    blockGrid(under, r, w * 0.5, d * 0.46, Math.max(1, cols - 2), Math.max(1, rows - 2), -0.86, 0.38, 0.64, 0.03);
    var tipH = 0.5 + r() * 0.35, tip = rockGeo(Math.min(w * 0.5, d * 0.46) * 0.42, 0.04, tipH, 6, 0.4, variant + 3);
    tip.translate((r() - 0.5) * 0.2, -1.22 - tipH / 2, 0);
    return (geoCache[key] = { top: mergeParts(top), under: mergeParts(under), tip: tip });
  }

  // Остров из модели моста: целиком (плиты, арка или глыба, скала) — один меш; у летающих только плиты.
  // Вариант = модель × разворот: соседние ряды не повторяются один в один
  function islandVariants() { return models.bridge ? models.bridge.segs.length * 2 : 3; }

  function bridgeMeshes(root, w, d, variant, material, whole) {
    var B = models.bridge, piece = !whole ? B.deck : w > 3 ? B.plaza : B.segs[(variant >> 1) % B.segs.length];
    var sx = w / piece.w, sz = d / piece.d, rotY = variant % 2 ? Math.PI : 0;
    if (piece !== B.plaza && mat.bridge.indexOf(material) >= 0) { // обычный остров — своего меша нет, рисуется пачкой
      root.userData.inst = { batch: bridgeBatch(piece, material), flat: piece === B.deck ? null : bridgeBatch(B.deck, material), sx: sx, sz: sz, rotY: rotY };
      return;
    }
    var m = new T.Mesh(piece.geo, material); // огненный (своё свечение) и стартовая площадка — отдельно
    m.scale.set(sx, 1, sz);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }

  // Острова одной модели и одного оттенка рисуются одной пачкой (instancing): ~12 вызовов отрисовки вместо ~45.
  // Пачка заводится при первом таком острове; место и разворот каждого пишет fillBridgeBatches каждый кадр
  var bridgeBatches = [], batchAt = null;
  function bridgeBatch(piece, material) {
    for (var i = 0; i < bridgeBatches.length; i++) {
      if (bridgeBatches[i].geometry === piece.geo && bridgeBatches[i].material === material) return bridgeBatches[i];
    }
    var m = new T.InstancedMesh(piece.geo, material, 64);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false; // острова по всей дороге и ездят — общий габарит устаревает
    m.count = 0;
    scene.add(m);
    bridgeBatches.push(m);
    return m;
  }

  function fillBridgeBatches() {
    if (!bridgeBatches.length) return;
    var at = batchAt || (batchAt = new T.Object3D());
    bridgeBatches.forEach(function (b) { b.count = 0; });
    world.rows.forEach(function (row) {
      var flat = row.road && row.z < cam.z - 38; // виадук вдали — плоскими плитами (туман: арок не видно)
      row.plats.forEach(function (p) {
        var inst = p.mesh.userData.inst, b = inst && (inst.flat && (flat || row.road && p.lane === 1) ? inst.flat : inst.batch); // средняя колонка — тоже: её низ закрыт соседними
        if (!b || !p.mesh.visible || b.count >= b.instanceMatrix.count) return;
        at.position.copy(p.mesh.position);
        at.rotation.set(0, inst.rotY, 0);
        at.scale.set(inst.sx, 1, inst.sz);
        at.updateMatrix();
        b.setMatrixAt(b.count++, at.matrix);
      });
    });
    bridgeBatches.forEach(function (b) {
      b.instanceMatrix.needsUpdate = true;
      b.visible = b.count > 0;
    });
  }

  // Парапет виадука: низкая стена из тёсаных блоков с зубцами по обеим кромкам. Одна пачка (instancing) на все ряды бега —
  // один вызов отрисовки; кромка с провалом остаётся без стены
  var PARAPET_X = 0.15, parapet = null; // центр стены — за кромкой плиты
  function parapetGeo() {
    var r = prng(77), parts = [];
    parts.push(part(geo.block, [0, 0.1, 0], null, [0.26, 0.8, 2.6], [0.5, 0.47, 0.44])); // сердцевина (видна в швах)
    for (var k = 0; k < 4; k++) {
      var p = part(geo.block, [(r() - 0.5) * 0.02, 0.22, -0.975 + k * 0.65], null, [0.32, 0.5, 0.62], stoneTint(r, 1));
      p.uvOff = [r(), r()];
      parts.push(p);
    }
    parts.push(part(geo.block, [0, 0.51, 0], null, [0.4, 0.09, 2.6], stoneTint(r, 1.06))); // плита-слив по верху
    [-0.65, 0.65].forEach(function (z) {
      var p = part(geo.block, [0, 0.72, z], null, [0.34, 0.34, 0.6], stoneTint(r, 1));
      p.uvOff = [r(), r()];
      parts.push(p);
    });
    parts.push(part(geo.block, [0, -0.22, 0], null, [0.22, 0.26, 2.4], stoneTint(r, 0.7))); // консоль под стеной
    return mergeParts(parts);
  }

  var wallDeco = null;
  function wallDecoBatches() {
    var h = 1.5, mk = function (g, m, shadow) {
      var im = new T.InstancedMesh(g, m, 48);
      im.castShadow = !!shadow;
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
      return im;
    };
    var iron = mergeParts([
      part(new T.CylinderGeometry(0.035, 0.045, h, 6), [0, h / 2, 0]),
      part(boxGeo(0.5, 0.04, 0.04), [0.22, h - 0.06, 0]),
      part(boxGeo(0.2, 0.04, 0.2), [0.42, h - 0.18, 0]),
      part(boxGeo(0.2, 0.04, 0.2), [0.42, h - 0.5, 0])
    ]);
    var glass = mergeParts([part(boxGeo(0.13, 0.26, 0.13), [0.42, h - 0.34, 0])]);
    var pole = mergeParts([
      part(new T.CylinderGeometry(0.035, 0.042, 1.7, 6), [0, 0.85, 0]),
      part(boxGeo(0.62, 0.05, 0.05), [0.27, 1.58, 0])
    ]);
    var cloth = geo.banner.clone();
    cloth.translate(0.32, 1.56, 0);
    return { iron: mk(iron, mat.iron, true), glass: mk(glass, mat.lantern), pole: mk(pole, mat.pole, true), cloth: mk(cloth, mat.bannerWave, true) };
  }

  // Верхний виадук двух видов — модели из Blender (decks.glb, _not_main/blender/decks.py): каменный акведук (опора
  // и арка на каждую плиту, парапет) и деревянный помост (доски на прогонах, козлы, перила); пандус — свои куски.
  // Каждый кусок — пачкой (InstancedMesh): ставится на ряд дороги в колонку помоста. Без модели — помост из брусков:
  // доски с зазорами, балки по краям, перила, под настилом через ряд — столбы
  var deckWood = null;
  function deckGeos() {
    var r = prng(91), slab = [], rail = [], post = [], L = CONFIG.run.tile;
    for (var k = 0; k < 5; k++) { // доски вдоль хода, разного тона
      var t = 0.82 + r() * 0.3;
      slab.push(part(geo.block, [-0.88 + k * 0.44, -0.06, 0], null, [0.41, 0.1, L - 0.02], [t, t * 0.92, t * 0.84]));
    }
    [-1, 1].forEach(function (sd) {
      slab.push(part(geo.block, [sd * 1.04, -0.2, 0], null, [0.16, 0.24, L], [0.62, 0.55, 0.48])); // балки по краям
      rail.push(part(geo.block, [sd * 1.04, 0.32, -L / 2 + 0.08], null, [0.09, 0.64, 0.09], [0.7, 0.62, 0.54])); // стойка перил
      rail.push(part(geo.block, [sd * 1.04, 0.62, 0], null, [0.08, 0.08, L], [0.78, 0.7, 0.6])); // поручень
    });
    [-1, 1].forEach(function (sd) {
      post.push(part(geo.block, [sd * 0.98, 0, 0], null, [0.18, 1, 0.18], [0.6, 0.52, 0.45])); // столб: высота — масштабом
    });
    return { slab: mergeParts(slab), rail: mergeParts(rail), post: mergeParts(post) };
  }

  var deckSets = null;
  function fillDecks() {
    if (models.decks) return fillDeckModels();
    if (!deckWood) {
      var G = deckGeos(), mk = function (g, cap) {
        var im = new T.InstancedMesh(g, mat.deckWood, cap);
        im.castShadow = im.receiveShadow = true;
        im.frustumCulled = false;
        im.count = 0;
        scene.add(im);
        return im;
      };
      deckWood = { slab: mk(G.slab, 48), rail: mk(G.rail, 48), post: mk(G.post, 32) };
    }
    var W = deckWood, at = batchAt || (batchAt = new T.Object3D()), R = CONFIG.run;
    W.slab.count = W.rail.count = W.post.count = 0;
    world.rows.forEach(function (row) {
      var U = row.upper;
      if (!U || W.slab.count >= 48) return;
      var a = Math.atan2(U.h1 - U.h0, R.tile), x = CONFIG.lanes.x[U.lane];
      at.position.set(x, row.y + (U.h0 + U.h1) / 2, row.z);
      at.rotation.set(a, 0, 0); // пандус — передний край выше
      at.scale.set(1, 1, 1 / Math.cos(a));
      at.updateMatrix();
      W.slab.setMatrixAt(W.slab.count++, at.matrix);
      W.rail.setMatrixAt(W.rail.count++, at.matrix);
      if (!U.ramp && row.i % 2 === 0 && W.post.count < 32) { // столбы через ряд, от дороги до балок
        var hh = U.h0 - 0.3;
        at.position.set(x, row.y + hh / 2, row.z);
        at.rotation.set(0, 0, 0);
        at.scale.set(1, hh, 1);
        at.updateMatrix();
        W.post.setMatrixAt(W.post.count++, at.matrix);
      }
    });
    [W.slab, W.rail, W.post].forEach(function (im) {
      im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    });
  }

  function fillDeckModels() {
    var DK = models.decks, R = CONFIG.run;
    if (!deckSets) {
      deckSets = {};
      ['stone', 'wood'].forEach(function (kind) {
        var m = kind === 'stone' ? mat.deckStone : mat.deckTimber, mk = function (g, cap) {
          var im = new T.InstancedMesh(g, m, cap);
          im.castShadow = im.receiveShadow = true;
          im.frustumCulled = false;
          im.count = 0;
          scene.add(im);
          return im;
        };
        deckSets[kind] = { span: mk(DK[kind].span, 24), ramp: DK[kind].ramp.map(function (g) { return mk(g, 4); }) };
      });
    }
    var at = batchAt || (batchAt = new T.Object3D()), all = [];
    ['stone', 'wood'].forEach(function (kind) {
      var S = deckSets[kind];
      S.span.count = 0;
      S.ramp.forEach(function (im) { im.count = 0; });
      all.push(S.span);
      all.push.apply(all, S.ramp);
    });
    world.rows.forEach(function (row) {
      var U = row.upper;
      if (!U) return;
      var S = deckSets[U.kind], im = U.k >= 0 ? S.ramp[U.k] : S.span;
      if (!im || im.count >= im.instanceMatrix.count) return;
      at.position.set(CONFIG.lanes.x[U.lane], row.y, row.z);
      at.rotation.set(0, 0, 0);
      at.scale.set(1, R.deck.h / 2.2, 1); // модель — под настил на 2,2 м
      at.updateMatrix();
      im.setMatrixAt(im.count++, at.matrix);
    });
    all.forEach(function (im) {
      im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    });
  }

  function fillParapet() {
    if (!parapet) {
      parapet = new T.InstancedMesh(parapetGeo(), mat.parapet, 160);
      parapet.castShadow = parapet.receiveShadow = true;
      parapet.frustumCulled = false;
      scene.add(parapet);
      wallDeco = wallDecoBatches();
    }
    var at = batchAt || (batchAt = new T.Object3D()), n = 0, W = wallDeco;
    W.iron.count = W.glass.count = W.pole.count = W.cloth.count = 0;
    var put = function (list, m) { // инстанс в пачки list (не больше вместимости)
      list.forEach(function (im) { if (im.count < 48) im.setMatrixAt(im.count++, m); });
    };
    world.rows.forEach(function (row) {
      if (!row.road || row.i === 0) return;
      row.plats.forEach(function (p) {
        if (p.lane === 1 || !p.mesh.visible || n >= 160) return;
        var side = p.lane === 0 ? -1 : 1;
        at.position.set(p.mesh.position.x + side * (p.w / 2 + PARAPET_X), p.mesh.position.y, p.mesh.position.z);
        at.rotation.set(0, 0, 0);
        at.scale.set(1, 1, 1);
        at.updateMatrix();
        parapet.setMatrixAt(n++, at.matrix);
        p.decos.forEach(function (dc) {
          if (!dc.wall) return;
          at.position.set(p.mesh.position.x + dc.dx, p.mesh.position.y + dc.dy, p.mesh.position.z + dc.dz);
          at.rotation.set(0, dc.side > 0 ? Math.PI : 0, 0); // перекладина — внутрь дороги
          at.updateMatrix();
          put(dc.wall === 'lantern' ? [W.iron, W.glass] : [W.pole, W.cloth], at.matrix);
        });
      });
    });
    parapet.count = n;
    parapet.instanceMatrix.needsUpdate = true;
    parapet.visible = n > 0;
    [W.iron, W.glass, W.pole, W.cloth].forEach(function (im) {
      im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    });
  }

  function islandMeshes(root, w, d, variant, topMat, rockMat, withUnder) {
    if (models.bridge) return bridgeMeshes(root, w, d, variant, topMat, withUnder);
    var g = islandParts(w, d, variant), list = [new T.Mesh(g.top, topMat)];
    if (withUnder) list.push(new T.Mesh(g.under, mat.block), new T.Mesh(g.tip, rockMat || mat.rock));
    list.forEach(function (m) {
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    });
  }

  // Шлейф — лента вдоль пути острова за последние life секунд. Путь известен (синус от simTime),
  // поэтому прошлые положения считаются точно, без истории кадров: на развороте лента сама сжимается,
  // а завихрения привязаны ко времени пролёта — остаются висеть в воздухе, а не едут за островом.
  // лента из n пар вершин (вершины 2i и 2i+1 — два края); позиции, цвет с прозрачностью и UV пишет хозяин
  function stripMesh(o, n, material) {
    var g = new T.BufferGeometry(), idx = [];
    o.n = n;
    o.pos = new Float32Array(n * 6);
    o.col = new Float32Array(n * 8);
    o.uv = new Float32Array(n * 4);
    for (var i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    g.setAttribute('position', new T.BufferAttribute(o.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('color', new T.BufferAttribute(o.col, 4).setUsage(T.DynamicDrawUsage));
    g.setAttribute('uv', new T.BufferAttribute(o.uv, 2).setUsage(T.DynamicDrawUsage));
    o.mesh = new T.Mesh(g, material);
    o.mesh.frustumCulled = false;
    o.mesh.renderOrder = 2;
  }

  function Wake(n, material, y, h0, h1, puff) {
    this.y = y;
    this.h0 = h0;
    this.h1 = h1;
    this.puff = puff;
    stripMesh(this, n, material);
  }

  // c0 → c1 — цвет от острова к хвосту; alpha — общая яркость (дальние гаснут вместе с туманом)
  Wake.prototype.update = function (p, life, c0, c1, alpha) {
    var n = this.n, pos = this.pos, col = this.col, uv = this.uv, i, j;
    for (i = 0; i < n; i++) {
      var k = i / (n - 1), t = simTime - k * life, ph = p.phase + t * p.speed;
      var x = p.baseX + Math.sin(ph) * p.amp - p.x;
      var v = Math.abs(Math.cos(ph)); // доля скорости, с которой остров пролетал эту точку: у разворота следа почти нет
      var wob = (Math.sin(t * 9.3 + p.phase * 3) * 0.6 + Math.sin(t * 15.7 + p.phase) * 0.4) * k * this.puff;
      var h = lerp(this.h0, this.h1, Math.sqrt(k)), a = alpha * Math.pow(1 - k, 1.25) * Math.pow(v, 0.8);
      j = i * 6;
      pos[j] = pos[j + 3] = x;
      pos[j + 1] = this.y + wob + h;
      pos[j + 4] = this.y + wob - h;
      pos[j + 2] = pos[j + 5] = 0;
      j = i * 8;
      col[j] = col[j + 4] = lerp(c0[0], c1[0], k);
      col[j + 1] = col[j + 5] = lerp(c0[1], c1[1], k);
      col[j + 2] = col[j + 6] = lerp(c0[2], c1[2], k);
      col[j + 3] = col[j + 7] = a;
      j = i * 4;
      uv[j] = uv[j + 2] = t * 0.9;
      uv[j + 1] = 1;
      uv[j + 3] = 0;
    }
    var at = this.mesh.geometry.attributes;
    at.position.needsUpdate = at.color.needsUpdate = at.uv.needsUpdate = true;
  };

  // ездящий остров: руна и кристалл-левитатор вместо каменного низа; у «бешеного» — огненные и шлейф
  function addLevitator(root, w, d, fast) {
    var rune = new T.Mesh(boxGeo(w * 0.62, 0.07, 0.03), fast ? mat.fastRune : mat.rune);
    rune.position.set(0, -0.26, d / 2 + 0.005);
    root.add(rune);
    var crystal = new T.Mesh(geo.crystal, fast ? mat.fastCrystal : mat.crystal);
    crystal.position.y = -0.95;
    crystal.scale.set(0.9, 1.4, 0.9);
    crystal.castShadow = true;
    root.add(crystal);
    var glow = new T.Sprite(fast ? mat.fastGlow : mat.glow);
    glow.position.y = -0.9;
    glow.scale.set(1.3, 1.3, 1);
    root.add(glow);
    root.userData.crystal = crystal;
    if (fast) { // лента идёт по центру острова: голова спрятана в камне, след выходит из-за задней кромки
      var hot = new Wake(32, mat.wakeHot, -0.95, 0.13, 0.38, 0.12), air = new Wake(32, mat.wakeAir, -0.24, 0.2, 0.7, 0.3);
      root.add(hot.mesh, air.mesh);
      root.userData.wakes = { hot: hot, air: air };
    }
  }

  function buildPlatformMesh(type, w, d, variant, side) {
    var root = new T.Group(), i;
    if (type === 'wood') { // гнилые мостки: проваливаются под котом
      var n = Math.max(4, Math.round(w / 0.34)), pw = w / n, planks = [], gapAt = 1 + (Math.random() * (n - 2) | 0);
      for (i = 0; i < n; i++) {
        if (i === gapAt) continue; // одной доски не хватает — сразу видно, что мостки ненадёжные
        var m = new T.Mesh(boxGeo(pw - 0.05, 0.14, d * rand(0.82, 0.97), true), mat.wood);
        m.position.set(-w / 2 + pw * (i + 0.5), -0.08 - rand(0, 0.06), rand(-0.06, 0.06));
        m.rotation.set(rand(-0.04, 0.04), rand(-0.06, 0.06), rand(-0.08, 0.08));
        m.castShadow = m.receiveShadow = true;
        m.userData.rest = { p: m.position.clone(), r: m.rotation.clone() };
        root.add(m);
        planks.push(m);
      }
      var beams = new Bundle();
      beams.add(boxGeo(w + 0.1, 0.12, 0.14), mat.woodDark, [0, -0.22, d * 0.3]);
      beams.add(boxGeo(w + 0.1, 0.12, 0.14), mat.woodDark, [0, -0.22, -d * 0.3]);
      var bm = beams.build(root, { cast: true })[0];
      bm.userData.rest = { p: bm.position.clone(), r: bm.rotation.clone() };
      planks.push(bm);
      root.userData.planks = planks;
      return root;
    }
    if (type === 'fire') { // огненный: лава в трещинах (свой материал — яркость у каждого острова своя), языки пламени
      var lava = (models.bridge ? mat.bridgeLava : mat.blockLava).clone();
      collectLit([lava]);
      islandMeshes(root, w, d, variant, lava, mat.basalt, true);
      var fl = [];
      for (i = 0; i < 4; i++) {
        var f = flameMesh();
        f.position.set((i - 1.5) * w * 0.22, 0, rand(-0.4, 0.4));
        root.add(f);
        fl.push(f);
      }
      root.userData.lava = lava;
      root.userData.flames = fl;
      return root;
    }
    if (type === 'ghost') { // призрачный: свой полупрозрачный материал — у каждого острова своя фаза
      var gm = mat.ghost.clone();
      collectLit([gm]);
      islandMeshes(root, w, d, variant, gm, mat.basalt, true);
      root.userData.ghost = gm;
      return root;
    }
    var flying = type === 'move' || type === 'fast';
    islandMeshes(root, w, d, variant, models.bridge ? mat.bridge[variant % mat.bridge.length] : mat.block, null, !flying);
    if (type === 'ice') addIce(root, w, d);
    if (flying) addLevitator(root, w, d, type === 'fast');
    if (type === 'spike') { // шипы на половине острова: вторая половина безопасна
      var sb = new Bundle();
      sb.add(boxGeo(w / 2 - 0.08, 0.05, d - 0.25), mat.iron, [side * (w / 4), 0.025, 0]);
      for (var ix = 0; ix < 3; ix++) {
        for (var iz = 0; iz < 5; iz++) sb.add(geo.spike, mat.spike, [side * (0.2 + ix * 0.27), 0.25, -d / 2 + 0.32 + iz * (d - 0.64) / 4]);
      }
      sb.build(root, { cast: true });
    }
    return root;
  }

  function buildPole(h) {
    var g = new T.Group(), b = new Bundle();
    b.add(new T.CylinderGeometry(0.035, 0.042, h, 6), mat.pole, [0, h / 2, 0]);
    b.add(boxGeo(0.62, 0.05, 0.05), mat.pole, [0.27, h - 0.12, 0]);
    b.add(geo.sphereLow, mat.gold, [0, h + 0.04, 0], null, 0.065);
    b.build(g, { cast: true });
    var cloth = new T.Mesh(geo.banner, mat.bannerWave);
    cloth.position.set(0.32, h - 0.14, 0);
    cloth.castShadow = true;
    g.add(cloth);
    g.userData.cloth = cloth;
    return g;
  }

  // фонарь на столбе: ночью вокруг него ореол
  function buildLantern(h) {
    var g = new T.Group(), b = new Bundle();
    b.add(new T.CylinderGeometry(0.035, 0.045, h, 6), mat.iron, [0, h / 2, 0]);
    b.add(boxGeo(0.5, 0.04, 0.04), mat.iron, [0.22, h - 0.06, 0]);
    b.add(boxGeo(0.2, 0.04, 0.2), mat.iron, [0.42, h - 0.18, 0]);
    b.add(boxGeo(0.2, 0.04, 0.2), mat.iron, [0.42, h - 0.5, 0]);
    b.add(boxGeo(0.13, 0.26, 0.13), mat.lantern, [0.42, h - 0.34, 0]);
    b.build(g, { cast: true });
    var halo = new T.Sprite(mat.lanternHalo);
    halo.position.set(0.42, h - 0.34, 0);
    halo.scale.set(1.8, 1.8, 1);
    g.add(halo);
    g.userData.cloth = null;
    return g;
  }

  function addPlatform(type, lane, row, w, d, side) {
    if (CODEX_TRAP[type]) codexSeen('trap', type);
    var P = CONFIG.platform;
    var wq = Math.round((w || P.w) * 5) / 5, dq = d || P.depth, variant = (genRandom() * islandVariants()) | 0; // ширина с шагом 0.2 м — конечный набор геометрий
    var oneLook = type === 'move' || type === 'fast' || type === 'wood'; // летающие плиты и доски всегда одни и те же
    var key = type + wq + 'x' + dq + (oneLook ? '' : '_' + variant) + (side ? '_' + side : '');
    var mesh = acquire(key, function () { return buildPlatformMesh(type, wq, dq, variant, side); });
    var x = CONFIG.lanes.x[lane];
    var p = {
      type: type, lane: lane, x: x, baseX: x, amp: 0, speed: 0, phase: grand(0, Math.PI * 2), y: row.y, z: row.z, w: wq, d: dq,
      mesh: mesh, crate: null, dog: null, decos: [], broken: false, breakT: 0, row: row, side: side || 0, firePhase: 0
    };
    if (type === 'wood') resetPlanks(mesh);
    mesh.position.set(x, row.y, row.z);
    row.plats.push(p);
    return p;
  }

  function resetPlanks(mesh) {
    mesh.userData.planks.forEach(function (m) {
      m.position.copy(m.userData.rest.p);
      m.rotation.copy(m.userData.rest.r);
    });
  }

  // гриб-батут (модель traps.glb); без модели — ящик со стрелкой. Пружинит: приземлился — шляпка сплющивается
  function addCrate(p) {
    codexSeen('bonus', 'mushroom');
    var mesh = acquire('crate', function () {
      if (models.traps && models.traps.mushroom) {
        var g = new T.Group();
        attach(g, models.traps.mushroom, 0, 0, 0, {}, { plain: 1 });
        return g;
      }
      var m = new T.Mesh(geo.crate, mat.crate);
      m.castShadow = m.receiveShadow = true;
      return m;
    });
    p.crate = { mesh: mesh, squash: 0 };
  }

  // щит серии над островом: геральдический щит — синяя эмаль, золотая кайма и лапка на гербе, голубое свечение
  function buildShieldPickup() {
    var g = new T.Group(), s = new T.Shape(), b = new Bundle();
    s.moveTo(-0.3, 0.34);
    s.lineTo(0.3, 0.34);
    s.lineTo(0.3, 0.04);
    s.quadraticCurveTo(0.28, -0.28, 0, -0.44);
    s.quadraticCurveTo(-0.28, -0.28, -0.3, 0.04);
    s.lineTo(-0.3, 0.34);
    var face = new T.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 });
    face.center();
    b.add(face, mat.shieldPick, [0, 0, 0]);
    b.add(face, mat.gold, [0, 0.005, -0.012], null, [1.16, 1.12, 0.6]); // кайма — тот же щит чуть больше, позади
    b.add(geo.sphereLow, mat.gold, [0, -0.07, 0.07], null, [0.11, 0.09, 0.03]);
    [[-0.13, 0.06], [-0.045, 0.12], [0.045, 0.12], [0.13, 0.06]].forEach(function (t) { b.add(geo.sphereLow, mat.gold, [t[0], t[1], 0.07], null, [0.04, 0.05, 0.02]); });
    b.build(g, { cast: true });
    var halo = new T.Sprite(mat.shieldGlow);
    halo.scale.set(1.7, 1.7, 1);
    halo.position.z = -0.12;
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  // стяг или фонарь на внешней кромке крайней колонки (side: −1 — левый край, 1 — правый)
  function addDeco(p, side, kind, wall) {
    if (wall) { // на парапете виадука, между зубцами; рисует пачка (fillParapet)
      p.decos.push({ mesh: null, wall: kind, side: side, dx: side * (p.w / 2 + PARAPET_X), dy: 0.53, dz: 0, phase: 0 });
      return;
    }
    var mesh = kind === 'lantern' ? acquire('lantern', function () { return buildLantern(1.9); }) : acquire('pole', function () { return buildPole(1.7); });
    mesh.rotation.y = side > 0 ? Math.PI : 0; // перекладина смотрит внутрь дороги
    p.decos.push({ mesh: mesh, dx: side * (p.w / 2 - 0.15), dz: rand(-0.4, 0.4), phase: rand(0, 6) });
  }

  // все монеты — два инстанс-меша (ребро и грани с лапкой): своего меша у монеты нет, её место пишет updateWorld
  var COIN_CAP = 160;
  function buildCoins() {
    var rim = new T.InstancedMesh(geo.coinRim, mat.gold, COIN_CAP), face = new T.InstancedMesh(geo.coinFace, mat.coinFace, COIN_CAP);
    [rim, face].forEach(function (m) {
      m.castShadow = true;
      m.frustumCulled = false; // монеты разбросаны по всей дороге и всё время двигаются
      m.count = 0;
      scene.add(m);
    });
    return { rim: rim, face: face, at: new T.Object3D() };
  }

  // phase — фаза вращения и покачивания: у монет одной дуги она идёт волной, иначе соседние то ребром, то плашмя
  // и в перспективе сливаются в кучу
  function addCoin(x, y, z, arc, phase) {
    world.coinsTotal++;
    world.coins.push({ x: x, y: y, z: z, mesh: null, taken: false, done: false, t: 0, phase: phase == null ? rand(0, 6) : phase, arc: arc || null });
  }

  function staticPlat(row, lane) {
    for (var i = 0; i < row.plats.length; i++) {
      var p = row.plats[i];
      if (p.lane === lane && p.type === 'stone' && !p.crate && !p.dog) return p;
    }
    return null;
  }

  // время полёта от высоты y0 со скоростью v до высоты y1 на снижении
  function flightTime(v, g, y0, y1) {
    var disc = v * v + 2 * g * (y0 - y1);
    return disc > 0 ? (v + Math.sqrt(disc)) / g : 2 * v / g;
  }

  // точка на траектории прыжка из ряда a в ряд b (f — доля пути), y — центр кота
  function arcPoint(a, b, f) {
    var P = CONFIG.physics, g = P.gravity * b.pace * b.pace, v = P.jump * b.pace, t = f * flightTime(v, g, a.y, b.y);
    return { y: a.y + v * t - g * t * t / 2 + 0.95, z: lerp(a.z, b.z, f) };
  }

  // монеты дугой по траектории прыжка между рядами одной колонки — кот собирает их, не сворачивая.
  // Вся дуга за один прыжок — «Вся дуга!» и ещё столько же монет (выбор: дуга в своей колонке или смена колонки для серии)
  function addCoinArc(a, b) {
    var lanes = [0, 1, 2].filter(function (l) { return (a.i === 0 || staticPlat(a, l)) && staticPlat(b, l); });
    if (!lanes.length) return;
    // Камера сзади почти вдоль дороги: на спуске дуги монеты уходят дальше и ниже — на экране сходятся в кучу.
    // Поэтому монеты стоят там, где экранная высота s растёт (взлёт и чуть за вершиной), с равным шагом по s
    var x = CONFIG.lanes.x[gpick(lanes)], cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), pts = [], top = 0, f, k;
    for (f = 0.06; f <= 0.94; f += 0.02) {
      var q = arcPoint(a, b, f);
      q.s = q.y * cp - q.z * sp;
      pts.push(q);
      if (q.s > pts[top].s) top = pts.length - 1;
    }
    var lo = pts[0].s, span = pts[top].s - lo, arc = { n: span > 3.8 ? 4 : 3, got: 0 }, phase = rand(0, 6), j = 0;
    for (k = 0; k < arc.n; k++) {
      var want = lo + span * (k + 0.5) / arc.n;
      while (j < top && pts[j].s < want) j++;
      addCoin(x, pts[j].y, pts[j].z, arc, phase + k * 0.5);
    }
  }

  function addMarker(m, y) {
    var side = (m / CONFIG.gen.marker) % 2 ? 1 : -1;
    var s = new T.Sprite(new T.SpriteMaterial({ map: paintLabel(m + ' ' + tr('unit.m')), color: '#f2f2f2', transparent: true, depthWrite: false })); // чуть ниже белого — в режиме свечения не расплывается
    s.scale.set(2.6, 1.15, 1);
    s.position.set(side * (CONFIG.lanes.half + 1), y + 1.8, -m);
    scene.add(s);
    world.markers.push(s);
  }

  // ряд островов: 1–3 колонки, хотя бы один остров надёжный (не ловушка)
  function pickLanes(d) {
    var G = CONFIG.gen, r = genRandom(), full = lerp(G.full[0], G.full[1], d), single = lerp(G.single[0], G.single[1], d);
    if (r < full) return [0, 1, 2];
    if (r < full + single) return [(genRandom() * 3) | 0];
    var skip = (genRandom() * 3) | 0;
    return [0, 1, 2].filter(function (l) { return l !== skip; });
  }

  // ловушка по весам правил ряда (вид → вес); подходящих нет — null
  function hazardType(traps) {
    var keys = Object.keys(traps).filter(function (k) { return traps[k] > 0 && k !== 'axe'; }), sum = 0, i;
    keys.forEach(function (k) { sum += traps[k]; });
    var r = genRandom() * sum;
    for (i = 0; i < keys.length; i++) {
      r -= traps[keys[i]];
      if (r < 0) return keys[i];
    }
    return null;
  }

  // Дорога строится рядами вперёд. Между рядами шаг по Z и подъём по Y; кот при каждом отскоке
  // целится в центр следующего ряда, поэтому в любой ряд можно попасть — дело только в колонке.
  // Вбок кот успевает пересечь всю дорогу за один прыжок, так что ряд с одним островом достижим всегда.
  function addRow() {
    var G = CONFIG.gen, last = world.rows[world.rows.length - 1], d = mode === 'level' ? level.def.d : difficulty(-last.z);
    if (mode !== 'level' && stretchAt(-last.z + 3) === 'run') return addRoadRow(last, d);
    var row = {
      i: last.i + 1,
      z: last.z - lerp(G.step[0], G.step[1], d) * grand(0.92, 1.08),
      y: last.y + (genRandom() < 0.15 ? grand(-0.5, 0) : lerp(G.rise[0], G.rise[1], genRandom())),
      pace: lerp(G.pace[0], G.pace[1], d),
      plats: []
    };
    world.rows.push(row);
    var dist = -row.z;
    if (mode === 'level' && dist >= level.def.len) { // конец уровня — ворота
      addFinish(row);
      return;
    }
    var R = rowRules(dist), force = world.forceTrap, lanes = pickLanes(d);
    world.forceTrap = null; // ?debug: __game.trap(вид) — ловушка в ближайшем новом ряду
    var last2 = world.rows[world.rows.length - 2];
    var axe = force === 'axe' || !force && R.axe > 0 && !(last2 && last2.axe) && genRandom() < R.axe;
    // рядом с ловушкой — безопасная колонка; под секирой — все три: лезвие закрывает одну, кот успевает в другую
    if (axe || force && lanes.length < 2) lanes = [0, 1, 2];
    var safe = gpick(lanes);
    // ездить могут одиночный остров (через всю дорогу) или пара крайних (покачиваясь у своей колонки)
    var movable = !axe && (lanes.length === 1 || (lanes.length === 2 && lanes[0] === 0 && lanes[1] === 2));
    lanes.forEach(function (l) {
      var type = 'stone', hazard = force && force !== 'axe' ? (l !== safe ? force : null) : l !== safe && !axe && genRandom() < R.hazard ? hazardType(R.traps) : null;
      if (hazard && hazard !== 'dog' && hazard !== 'keg') type = hazard;
      else if (!hazard && movable && genRandom() < R.moving) type = genRandom() < R.fast ? 'fast' : 'move';
      var p = addPlatform(type, l, row, null, null, type === 'spike' ? gpick([-1, 1]) : 0);
      if (type === 'move' || type === 'fast') {
        p.baseX = lanes.length === 1 ? 0 : p.x;
        p.amp = lanes.length === 1 ? CONFIG.lanes.x[2] : 0.9;
        p.speed = (type === 'fast' ? lerp(2.6, 3.4, d) : lerp(1.1, 1.9, d)) * grand(0.85, 1.15);
        p.x = p.baseX + Math.sin(p.phase + simTime * p.speed) * p.amp;
      }
      if (type === 'fire') p.firePhase = grand(0, CONFIG.fire.period);
      if (type === 'ghost') p.ghostPhase = grand(0, CONFIG.ghost.period);
      if (hazard === 'dog') addDog(p);
      if (hazard === 'keg') addKeg(p);
      if (type === 'stone' && !p.dog && !p.keg && !axe && genRandom() < R.crate) addCrate(p);
      if (type === 'stone' && !p.crate && !p.dog && !p.keg && !axe && l !== 1 && Math.random() < 0.3) addDeco(p, l === 0 ? -1 : 1, Math.random() < 0.5 ? 'lantern' : 'pole');
    });
    if (axe) {
      codexSeen('trap', 'axe');
      row.axe = { mesh: acquire('axeGate', buildAxeGate), phase: grand(0, Math.PI * 2), period: lerp(CONFIG.axe.period[0], CONFIG.axe.period[1], d), low: false };
    }
    if (genRandom() < G.coins) addCoinArc(last, row);
    if (heartDue(dist)) addPickup(row, 'heart');
    else if (genRandom() < R.shield) addPickup(row, 'shield');
    else if (genRandom() < R.wings) addPickup(row, 'wings');
    else if (genRandom() < R.bonus) addPickup(row, gpick(BONUS));
    if (genRandom() < R.crow) {
      var crow = addFlyer('crow', last, row);
      if (genRandom() < G.pair) addFlyer('crow', last, row, crow);
    } else if (genRandom() < R.bat) addFlyer('bat', last, row);
    if (R.dragon && !world.dragon && world.dragonAt == null && genRandom() < R.dragon) {
      world.dragonAt = row.z + 40; // дракончик прилетит, когда кот поравняется с этим местом
    }
    var m = Math.floor(dist / G.marker) * G.marker;
    if (m > 0 && m > -last.z) addMarker(m, row.y);
  }

  function generate() {
    var last = world.rows[world.rows.length - 1];
    while (!world.finish && last.z > player.z - CONFIG.gen.ahead) {
      addRow();
      last = world.rows[world.rows.length - 1];
    }
  }

  /* ---------- Раннер: бег по виадуку ---------- */

  // Три режима забега (настройки, settings.style): «Прыжки» — острова, кот прыгает сам; «Бег» — сплошной виадук,
  // кот бежит, прыгает и подкатывается по команде; «Смешанный» — отрезки бега и прыжков по очереди (сначала бег,
  // CONFIG.run.stretch). Виадук — ряды плит вплотную на одной высоте (row.road). Препятствия: барьер — перепрыгнуть,
  // низкая арка — подкат, бочка и пёс — рубить мечом или перепрыгнуть, провал — перепрыгнуть или обойти; огонь, лёд
  // и призрачные плиты — те же, что на островах. Чисто прошёл препятствие — +1 к серии. Конец виадука — кот сам
  // прыгает на острова; приземлился с острова на виадук — снова бежит. Поход — всегда прыжки
  function styleNow() { return mode === 'level' ? 'hop' : settings.style; }

  function stretchAt(dist) {
    var st = styleNow();
    if (st !== 'mix') return st;
    var S = CONFIG.run.stretch;
    return dist % (S.run + S.hop) < S.run ? 'run' : 'hop';
  }

  function runSpeed() { var R = CONFIG.run; return lerp(R.speed[0], R.speed[1], runDifficulty(player.maxDist)); }

  // сложность бега: быстро растёт в начале и плавно выходит на плато к CONFIG.run.hard (м)
  function runDifficulty(dist) { var k = clamp(dist / CONFIG.run.hard, 0, 1); return 1 - (1 - k) * (1 - k); }

  // препятствия ряда: вид в каждой колонке или null; виды — по дистанции, веса огня, льда и призраков — от биома
  // Катящаяся бочка: стоит на плите виадука, а когда кот подбегает (CONFIG.run.roll.wake), катится ему навстречу
  // по своей колонке. Перепрыгнул — +1 к серии, срубил мечом — взрыв и монеты (kegBlast), не успел — бочка рвётся
  // и жизнь долой. Колонка позади бочки (ближе к коту) на три плиты чистая — катиться есть куда
  function buildRoller() {
    var pivot = new T.Group(), spin = new T.Group(), keg = buildKeg();
    keg.rotation.z = Math.PI / 2; // на боку, ось — поперёк дороги
    keg.position.x = 0.4; // середина бочки (высота 0,81) — в оси вращения
    spin.add(keg);
    pivot.add(spin);
    pivot.userData.spin = spin;
    return pivot;
  }

  function rollerLaneFree(l) { // три ряда перед бочкой (уже построенные, ближе к коту) — без провала и препятствия в колонке
    for (var k = 1; k <= 3; k++) {
      var row = world.rows[world.rows.length - 1 - k];
      if (!row || !row.road || row.gaps.indexOf(l) >= 0 || row.upper && row.upper.lane === l || row.axe) return false;
      var p = row.plats.filter(function (q) { return q.lane === l; })[0];
      if (!p || p.obstacle || p.keg || p.dog || p.type !== 'stone') return false;
    }
    return true;
  }

  function addRoller(p) {
    codexSeen('trap', 'roll');
    var mesh = acquire('roller', buildRoller);
    world.rollers.push({ x: p.x, y: p.y, z: p.z, lane: p.lane, mesh: mesh, keg: { mesh: mesh, done: false }, rolling: false, passed: false, done: false, turn: 0, bump: 0 });
  }

  function updateRollers(dt) {
    var P = player, R = CONFIG.run.roll;
    world.rollers.forEach(function (r) {
      if (r.keg.done) { r.done = true; return; }
      if (!r.rolling && P.z - r.z < R.wake && state === 'play') r.rolling = true;
      if (r.rolling) {
        r.z += R.v * dt;
        r.turn += R.v * dt / 0.36; // радиус бочки
        r.bump += R.v * dt;
        if (r.bump > CONFIG.run.tile) { // стык плит — глухой стук
          r.bump -= CONFIG.run.tile;
          Sound.thud(earshot(r.x - P.x, 0, r.z - P.z, 3, 30));
        }
        if (Math.random() < dt * 12) dust(r.x + rand(-0.3, 0.3), r.y, r.z - 0.3, 1);
      }
      r.mesh.position.set(r.x, r.y + 0.36, r.z);
      r.mesh.userData.spin.rotation.x = r.turn;
      if (r.passed || P.dead || state !== 'play' || Math.abs(r.z - P.z) > 0.6 || Math.abs(r.x - P.x) > 0.85) return;
      r.passed = true;
      if (P.y - r.y > 0.78) {
        comboAdd(1, r.y, [tr('tag.dodge')], 0);
        note('dodge');
        return;
      }
      kegBlast(r, false);
      hazardHurt('keg', r);
      if (!P.dead) {
        P.grounded = false;
        P.vy = 4;
        P.slide = 0;
      }
    });
  }

  // Связки препятствий: несколько рядов подряд, задуманные вместе, — слалом (свободная колонка сдвигается), прыжок —
  // и сразу подкат, подкат — и прыжок, лесенка, провал во всю ширину и арки за ним. С ростом сложности — чаще.
  // Шаг — в плитах; между прыжком и следующим препятствием — сколько кот пролетит на этой скорости, и запас на реакцию
  function comboPlan(dist, d) {
    var R = CONFIG.run, sp = lerp(R.speed[0], R.speed[1], d), air = Math.ceil((sp * 0.75 + 3.5) / R.tile);
    var hard = ['barrier', 'keg'], f0 = gpick([0, 1, 2]), f1 = f0 === 1 ? gpick([0, 2]) : 1; // слалом: перепрыгнувшего первый ряд дуга проносит и над вторым
    var open = function (f, kinds) { var o = [gpick(kinds), gpick(kinds), gpick(kinds)]; o[f] = null; return o; };
    var all = function (k) { return [k, k, k]; };
    var plans = [
      [[0, open(f0, hard)], [3, open(f1, hard)]],
      [[0, all('barrier')], [air, all('lowbar')]],
      [[0, all('lowbar')], [3, all('barrier')]]
    ];
    if (d > 0.35) plans.push(
      [[0, open(0, ['barrier', 'gap'])], [3, open(1, ['barrier', 'gap'])], [6, open(2, ['barrier', 'gap'])]],
      [[0, all('gap')], [air, open(f0, ['lowbar'])]]
    );
    return gpick(plans).map(function (s) { return { at: dist + s[0] * R.tile - 0.01, ob: s[1] }; });
  }

  // шаг до следующего ряда с препятствием. Ряд, закрывший две-три колонки, скорее всего перепрыгивают — следующий
  // либо вплотную (3 плиты: дуга того же прыжка проходит и над ним; арок и псов там нет — nearNext), либо дальше
  // приземления с запасом на реакцию. Между ними — «мёртвая зона»: кот приземлялся бы прямо перед препятствием
  function obstacleGap(ob, d) {
    var R = CONFIG.run, sp = lerp(R.speed[0], R.speed[1], d), base = Math.max(R.tile * 3, lerp(R.every[0], R.every[1], d) * grand(0.8, 1.25));
    if (ob.filter(Boolean).length < 2) return base;
    if (genRandom() < 0.4) {
      world.nearNext = true;
      return R.tile * 3;
    }
    return Math.max(base, Math.ceil((sp * 0.75 + 4.5) / R.tile) * R.tile);
  }

  // Колонка в «мёртвой зоне» за своим препятствием: перепрыгнувший его кот приземлился бы прямо перед следующим
  // (или в провал) и не успел бы прыгнуть снова — такие препятствия снимаются. Дуга того же прыжка проносит кота над
  // барьером, бочкой и провалом вплотную (до land − 2,2 м), над аркой, псом и бочкой-катком — нет. land — где кот
  // приземляется за препятствием на этой скорости. Возвращает ряд или null (всё снято)
  function laneSafe(ob, dist, d) {
    var R = CONFIG.run, land = lerp(R.speed[0], R.speed[1], d) * 0.75 - 1, L = world.laneOb, any = false, l;
    for (l = 0; l < 3; l++) {
      if (!ob[l]) continue;
      var dd = dist - L[l], low = ob[l] === 'lowbar' || ob[l] === 'dog' || ob[l] === 'roll';
      if (dd < land + 4.5 && (low || dd > land - 2.2)) ob[l] = null;
      else any = true;
    }
    return any ? ob : null;
  }

  function obstaclePattern(dist, d, near) {
    var B = BIOMES[biomeAt(dist)].traps, w = function (k, def) { return B[k] != null ? B[k] : def; };
    var kinds = [['barrier', 3, 0], ['lowbar', 2.5, 30], ['gap', 2, 50], ['fire', w('fire', 1), 90], ['keg', w('keg', 1.5), 110], ['ice', w('ice', 0.6), 130], ['dog', w('dog', 1.5), 150], ['ghost', w('ghost', 0.6), 200], ['roll', w('keg', 1.5) * lerp(0.6, 1.4, d), CONFIG.run.roll.from]];
    var avail = kinds.filter(function (k) { return dist > k[2] && k[1] > 0 && !(near && (k[0] === 'lowbar' || k[0] === 'dog' || k[0] === 'roll')); }), sum = 0;
    avail.forEach(function (k) { sum += k[1]; });
    var pick = function () {
      var r = genRandom() * sum;
      for (var i = 0; i < avail.length; i++) if ((r -= avail[i][1]) < 0) return avail[i][0];
      return 'barrier';
    };
    var n = genRandom() < lerp(0.35, 0.08, d) ? 1 : genRandom() < 0.7 ? 2 : 3, out = [null, null, null], lanes = [0, 1, 2], rolled = false;
    for (var i = 2; i > 0; i--) { var j = (genRandom() * (i + 1)) | 0, t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t; }
    lanes.slice(0, n).forEach(function (l) {
      var k = pick();
      if (k === 'roll' && (rolled || !rollerLaneFree(l))) k = 'barrier'; // одна бочка на ряд, и катиться ей есть куда
      rolled = rolled || k === 'roll';
      out[l] = k;
    });
    return out;
  }

  // ряд виадука: три плиты вплотную (или провал); первый ряд после островов — на обычном шаге прыжка
  function addRoadRow(last, d) {
    d = runDifficulty(-last.z);
    var R = CONFIG.run, G = CONFIG.gen, first = !last.road;
    var row = { i: last.i + 1, z: last.z - (first ? lerp(G.step[0], G.step[1], d) : R.tile), y: first ? last.y + lerp(G.rise[0], G.rise[1], genRandom()) : last.y, pace: 1, road: true, plats: [], gaps: [] };
    world.rows.push(row);
    var dist = -row.z, rules = rowRules(dist), endSoon = stretchAt(dist + R.tile * 3) !== 'run', carry = world.gapCarry, ob = null;
    world.gapCarry = null;
    var force = world.forceTrap, prev2 = world.rows[world.rows.length - 3];
    // ?debug: __game.trap(вид) — во всех колонках; не под виадуком и не на чистой полосе за ним (там колонка пустеет)
    var forced = force && ['barrier', 'lowbar', 'gap', 'keg', 'roll', 'dog', 'fire', 'ice', 'ghost'].indexOf(force) >= 0 && !first && !world.deck && !world.deckClear && !carry && !last.busy && !last.axe && !(prev2 && (prev2.busy || prev2.axe));
    if (forced) {
      world.forceTrap = null;
      world.runPlan = []; // связка обрывается: её ряды не встанут вплотную за ловушкой
      ob = [force, force, force];
      world.runNext = Math.max(world.runNext, dist + R.tile * 3);
    } else if (carry) { // провал длиной в две плиты
      ob = [null, null, null];
      carry.forEach(function (l) { ob[l] = 'gap'; });
    } else if (world.runPlan.length) { // связка: ряды по плану (до пункта — пусто)
      if (endSoon || !(rules.hazard > 0)) world.runPlan = [];
      else if (dist >= world.runPlan[0].at) ob = laneSafe(world.runPlan.shift().ob.slice(), dist, d);
    } else if (!first && !endSoon && dist > 18 && rules.hazard > 0 && dist >= world.runNext) {
      if (dist > 120 && genRandom() < lerp(0.12, 0.45, d) && stretchAt(dist + R.tile * 12) === 'run') {
        world.runPlan = comboPlan(dist, d);
        ob = laneSafe(world.runPlan.shift().ob.slice(), dist, d);
        var tail = world.runPlan.length ? world.runPlan[world.runPlan.length - 1] : { at: dist, ob: ob || [] };
        world.runNext = tail.at + obstacleGap(tail.ob, d);
      } else {
        ob = laneSafe(obstaclePattern(dist, d, world.nearNext), dist, d);
        world.nearNext = false;
        world.runNext = ob ? dist + obstacleGap(ob, d) : dist + R.tile; // не чаще чем через три плиты; всё снято — в следующем ряду
        var gaps = ob ? [0, 1, 2].filter(function (l) { return ob[l] === 'gap'; }) : [];
        if (gaps.length && genRandom() < 0.5) world.gapCarry = gaps;
      }
    }
    if (ob) [0, 1, 2].forEach(function (l) { if (ob[l]) world.laneOb[l] = dist; }); // где в колонке было препятствие (laneSafe)
    var D = R.deck, U = world.deck;
    if (!U && !world.deckClear && !first && !forced && dist > D.from && !world.forceTrap && !inArena(dist) && !inArena(dist + R.tile * (D.rows[1] + 4)) && !bossFight() && stretchAt(dist + R.tile * (D.rows[1] + 4)) === 'run' && (world.forceDeck || genRandom() < D.chance)) {
      var kind = typeof world.forceDeck === 'string' ? world.forceDeck : genRandom() < 0.5 ? 'stone' : 'wood'; // каменный акведук или деревянный помост
      world.forceDeck = false;
      U = world.deck = { lane: gpick([0, 1, 2]), i: 0, n: D.rows[0] + ((genRandom() * (D.rows[1] - D.rows[0] + 1)) | 0), kind: kind };
      world.coinRun = { lane: U.lane, left: U.n + 1 }; // монеты — по пандусу и настилу
    }
    if (U) {
      var k = U.i++;
      row.upper = { lane: U.lane, kind: U.kind, k: k < D.ramp ? k : -1, h0: k < D.ramp ? D.h * k / D.ramp : D.h, h1: k < D.ramp ? D.h * (k + 1) / D.ramp : D.h, ramp: k < D.ramp };
      if (ob) ob[U.lane] = null; // под настилом и на пандусе — без препятствий
      if (U.i >= U.n) {
        world.deck = null;
        world.deckClear = { lane: U.lane, left: 3 }; // и где кот приземлится, спрыгнув с края (на 14 м/с — за две плиты)
      }
    } else if (world.deckClear) {
      if (ob) ob[world.deckClear.lane] = null;
      if (--world.deckClear.left <= 0) world.deckClear = null;
    }
    var axe = !ob && !U && !first && !endSoon && rules.axe > 0 && !last.axe && !last.busy && dist < world.runNext - R.tile * 2 && genRandom() < rules.axe * 0.8;
    row.busy = !!ob; // в ряду препятствие — секира не следом
    if (axe) world.runNext = Math.max(world.runNext, dist + R.tile * 2);
    if (!ob && !axe && !U && !world.deckClear && !first && dist >= world.archNext && !inArena(dist) && !bossFight()) { // ворота со стягами над виадуком — вехи пути (у босса — нет: он над дорогой; над верхним виадуком — нет: свод низкий)
      row.gate = acquire('roadGate', buildRoadGate);
      world.archNext = dist + grand(60, 90);
    }
    [0, 1, 2].forEach(function (l) {
      var kind = ob && ob[l];
      if (kind === 'gap') {
        codexSeen('trap', 'gap');
        row.gaps.push(l);
        return;
      }
      var type = kind === 'fire' || kind === 'ice' || kind === 'ghost' ? kind : 'stone';
      var p = addPlatform(type, l, row, 2.2, R.tile);
      if (type === 'fire') p.firePhase = grand(0, CONFIG.fire.period);
      if (type === 'ghost') p.ghostPhase = grand(0, CONFIG.ghost.period);
      if (kind === 'barrier' || kind === 'lowbar') addObstacle(p, kind);
      else if (kind === 'keg') addKeg(p);
      else if (kind === 'roll') addRoller(p);
      else if (kind === 'dog') addDog(p);
      else if (l !== 1 && row.i % 3 === 0 && l === (row.i % 6 === 0 ? 0 : 2)) addDeco(p, l === 0 ? -1 : 1, row.i % 4 === 0 ? 'pole' : 'lantern', true); // на парапете через ряд-другой
    });
    if (axe) {
      codexSeen('trap', 'axe');
      row.axe = { mesh: acquire('axeGate', buildAxeGate), phase: grand(0, Math.PI * 2), period: lerp(CONFIG.axe.period[0], CONFIG.axe.period[1], d), low: false };
    }
    roadCoins(row, ob);
    if (!ob && !axe) {
      if (heartDue(dist)) addPickup(row, 'heart');
      else if (genRandom() < rules.shield * 0.4) addPickup(row, 'shield');
      else if (genRandom() < rules.wings * 0.4) addPickup(row, 'wings');
      else if (genRandom() < rules.bonus * 0.4) addPickup(row, gpick(BONUS));
    }
    var m = Math.floor(dist / G.marker) * G.marker;
    if (m > 0 && m > -last.z) addMarker(m, row.y);
  }

  // монеты линией по колонке; над барьером, бочкой, псом, огнём и провалом — дугой (на высоте прыжка), под аркой — низко
  function roadCoins(row, ob) {
    var C = world.coinRun;
    if (!C && genRandom() < CONFIG.gen.coins) C = world.coinRun = { lane: gpick([0, 1, 2]), left: 7 + ((genRandom() * 9) | 0) };
    if (!C) return;
    var kind = ob && ob[C.lane], y = row.y + 0.95 + (row.upper && row.upper.lane === C.lane ? (row.upper.h0 + row.upper.h1) / 2 : 0);
    if (kind === 'barrier' || kind === 'keg' || kind === 'dog' || kind === 'fire' || kind === 'gap') y = row.y + 2.1;
    else if (kind === 'lowbar') y = row.y + 0.45;
    addCoin(CONFIG.lanes.x[C.lane], y, row.z, null, row.i * 0.45);
    if (--C.left <= 0) world.coinRun = null;
  }

  // Барьер: бревенчатая загородка с заострёнными кольями — перепрыгнуть. Низкая арка: каменные столбы и перемычка
  // на высоте 0,95 м с золотой лапкой — подкатиться (стоя кот в неё упирается)
  function buildBarrier() {
    var g = new T.Group(), b = new Bundle();
    [-0.82, 0.82].forEach(function (x) {
      b.add(cylGeo(0.07, 0.08, 0.7, 7), mat.woodDark, [x, 0.35, 0]);
      b.add(new T.ConeGeometry(0.07, 0.16, 7), mat.woodDark, [x, 0.78, 0]);
    });
    [0.24, 0.5].forEach(function (y) { b.add(cylGeo(0.075, 0.075, 1.9, 8), mat.wood, [0, y, 0], [0, 0, Math.PI / 2]); });
    [-0.45, 0, 0.45].forEach(function (x) {
      b.add(cylGeo(0.035, 0.045, 0.62, 6), mat.wood, [x, 0.34, 0.05], [0.25, 0, 0]);
      b.add(new T.ConeGeometry(0.045, 0.14, 6), mat.wood, [x, 0.71, 0.14], [0.25, 0, 0]);
    });
    [-0.82, 0.82].forEach(function (x) { b.add(new T.TorusGeometry(0.085, 0.015, 5, 12), mat.iron, [x, 0.5, 0], [Math.PI / 2, 0, 0]); });
    b.build(g, { cast: true });
    return occluder(g);
  }

  // низкая арка: низ перемычки — LOWBAR.bottom (кот в подкате — ниже, с запасом; бегом — выше, не пройти), перепрыгнуть —
  // выше LOWBAR.top (прыжок на бегу — до ~2 м: только точный)
  var LOWBAR = { bottom: 1.08, top: 1.62 };
  function buildLowbar() {
    var g = new T.Group(), b = new Bundle(), y0 = LOWBAR.bottom;
    [-1.0, 1.0].forEach(function (x) {
      b.add(boxGeo(0.34, y0 + 0.8, 0.44), mat.body, [x, (y0 + 0.8) / 2, 0]);
      b.add(boxGeo(0.44, 0.12, 0.54), mat.body, [x, 0.06, 0]);
    });
    b.add(boxGeo(2.4, 0.42, 0.5), mat.body, [0, y0 + 0.21, 0]);
    b.add(boxGeo(2.5, 0.1, 0.56), mat.body, [0, y0 + 0.47, 0]);
    b.add(geo.sphereLow, mat.gold, [0, y0 + 0.21, -0.27], null, [0.13, 0.13, 0.04]);
    b.build(g, { cast: true });
    return occluder(g);
  }

  // препятствие закрывает кота (арка над головой, барьер позади): помечено — в проходе кота оно пишет глубину, когда рядом (occluderNear)
  function occluder(g) {
    g.userData.occluder = true;
    return g;
  }

  function addObstacle(p, kind) {
    codexSeen('trap', kind);
    p.obstacle = { kind: kind, mesh: acquire('ob_' + kind, kind === 'barrier' ? buildBarrier : buildLowbar), done: false };
    p.obstacle.mesh.visible = true;
  }

  // верхний виадук: колонка x над ним и высота настила (пандуса) в точке z — от верха ряда. Под настил хода нет: кот
  // рисуется поверх мира и под помостом казался бы стоящим на нём. Сбоку помост — стенка: ниже его верха кот держится
  // не ближе DECK_SIDE от середины его колонки (в соседней колонке — целиком, не задевая перил); забраться — по пандусу
  // или прыжком сбоку, если долетел почти до верха (DECK_STEP)
  var DECK_SIDE = 1.5, DECK_STEP = 0.6;
  // на настиле (со второго куска пандуса) по краям — парапет или перила: кот держится не дальше DECK_IN от середины
  // колонки, вбок с помоста — только прыжком выше DECK_RAIL
  var DECK_IN = 0.62, DECK_RAIL = 0.45, DECK_RAIL_FROM = 0.7;
  function onUpper(row, x) { return !!row.upper && Math.abs(x - CONFIG.lanes.x[row.upper.lane]) <= 1.15; }
  function upperY(row, z) {
    var U = row.upper, R = CONFIG.run;
    return row.y + lerp(U.h0, U.h1, clamp((row.z + R.tile / 2 - z) / R.tile, 0, 1));
  }

  // ряд виадука под точкой z и плита в колонке под x (null — провал)
  function roadRowAt(z) {
    var R = CONFIG.run;
    for (var i = 0; i < world.rows.length; i++) {
      var row = world.rows[i];
      if (row.road && Math.abs(row.z - z) <= (row.i === 0 ? CONFIG.platform.startDepth / 2 : R.tile / 2) + 0.01) return row;
    }
    return null;
  }

  function roadTile(row, x) {
    for (var i = 0; i < row.plats.length; i++) {
      var p = row.plats[i];
      if (Math.abs(x - p.x) <= p.w / 2 + 0.05) return p;
    }
    return null;
  }

  // плита держит: не сломана, призрачная — не исчезла, атака босса не убрала её
  function tileHolds(p) {
    return p && !p.broken && !(p.type === 'ghost' && ghostState(p) === 'gone') && !(!p.mesh.visible && p.scorch);
  }

  // старт бега: со стартовой площадки, после «Ещё раз» и после спасения
  function startRun() {
    var P = player;
    P.wait = 0;
    P.move = 'run';
    P.grounded = true;
    P.vy = 0;
    P.vz = -runSpeed();
    P.pace = 1;
    P.target = roadRowAt(P.z) || rowAt(0);
    Sound.jump(0);
    teach('run', tr(IS_TOUCH ? 'teach.run' : 'teach.runKeys'));
  }

  // под перемычкой низкой арки прыгать нельзя — голова прошла бы сквозь неё: прыжок сработает сразу за аркой (jumpQ)
  function underLowbar() {
    var P = player;
    for (var i = 0; i < world.rows.length; i++) {
      var row = world.rows[i];
      if (!row.road || Math.abs(row.z - P.z) > 0.75) continue;
      var p = roadTile(row, P.x);
      if (p && p.obstacle && p.obstacle.kind === 'lowbar' && p.obstacle.mesh.visible) return true;
    }
    return false;
  }

  function runJump() {
    var P = player;
    if (underLowbar()) {
      P.jumpQ = 0.35;
      return;
    }
    P.jumpQ = 0;
    P.slide = 0;
    P.grounded = false;
    P.vy = CONFIG.run.jump;
    P.squash = 0.7;
    dust(P.x, P.y, P.z, 6);
    Sound.jump(0.5);
  }

  // подкат: на земле — сразу; в прыжке — кот камнем вниз и подкатывается на приземлении
  function startSlide() {
    var P = player;
    if (state !== 'play' || P.dead || P.move !== 'run' || P.flight) return;
    P.trick = null;
    if (P.grounded) {
      P.slide = CONFIG.run.slide;
      dust(P.x, P.y, P.z, 5);
      Sound.flap();
    } else {
      P.vy = Math.min(P.vy, -16);
      P.slideQueued = true;
    }
    vibrate(8);
  }

  // конец виадука — прыжок на острова (как с трамплина)
  function hopFromRoad(next) {
    var P = player;
    P.move = 'hop';
    P.grounded = false;
    P.slide = 0;
    P.lane = -1; // серия на островах начинается заново: колонка прошлого приземления неизвестна
    P.pace = next.pace;
    P.vy = CONFIG.physics.jump * P.pace;
    P.squash = 1;
    aim(next);
    sparkle(P.x, P.y + 0.2, P.z, [1, 0.85, 0.35], 12, 3);
    dust(P.x, P.y, P.z, 9);
    Sound.spring();
  }

  // приземление на виадук (после прыжка, с острова, после спасения): дальше — бег; трюки засчитываются здесь
  function runLand(p) {
    var P = player, top = p.y;
    var fromHop = P.move !== 'run';
    if (fromHop) teach('run', tr(IS_TOUCH ? 'teach.run' : 'teach.runKeys'));
    P.y = top;
    P.vy = 0;
    P.grounded = true;
    P.move = 'run';
    P.vz = -runSpeed();
    P.ground = top;
    P.target = p.row;
    P.squash = fromHop ? 1 : 0.6;
    P.glide = null;
    dust(P.x, top, P.z, fromHop ? 9 : 5);
    Sound.jump(fromHop ? 0.3 : 0.8);
    if (P.slideQueued) {
      P.slideQueued = false;
      P.slide = CONFIG.run.slide;
    }
    if (P.trick) { // не докрутил — плюхнулся
      P.trick = null;
      P.tricks = 0;
      P.squash = 1.25;
      comboBreak(tr('break.crash'));
      return;
    }
    if (P.tricks) {
      var n = P.tricks;
      P.tricks = 0;
      comboAdd(n, top, [n > 1 ? tr('tag.tricks', { n: n }) : tr('tag.trick')], CONFIG.trick.coins * n * n);
      note('trick');
      track('trick', n);
    }
  }

  // шаг бега: руление как на островах, вперёд — своя скорость, вверх — прыжок по команде
  function runStep(dt) {
    var C = CONFIG.physics, R = CONFIG.run, P = player, half = Math.min(CONFIG.lanes.half, 2.85); // дальше — парапет
    var u = P.dead ? 0 : control();
    if (!P.dead) P.vx += (u * C.speed * 1.15 - P.vx) * smooth(C.accel * (P.slipT > 0 ? CONFIG.ice.grip : 1.3), dt);
    var nx = P.dead ? P.x + P.vx * dt : clamp(P.x + P.vx * dt, -half, half), wr = roadRowAt(P.z); // сбитого — через парапет, вбок
    if (wr && wr.upper && !onUpper(wr, P.x) && upperY(wr, P.z) > P.y + DECK_STEP) { // сбоку помост выше кота — стенка
      var dx = CONFIG.lanes.x[wr.upper.lane], side = P.x < dx ? -1 : 1;
      if (Math.abs(nx - dx) < DECK_SIDE) {
        nx = Math.abs(P.x - dx) < DECK_SIDE ? P.x + (dx + side * DECK_SIDE - P.x) * Math.min(1, dt * 12) : dx + side * DECK_SIDE; // уже у самой стенки (помост вырос рядом) — отходит
        P.vx = 0;
      }
    }
    if (wr && wr.upper && onUpper(wr, P.x)) {
      var ut = upperY(wr, P.z), lo = CONFIG.lanes.x[wr.upper.lane] - DECK_IN, hi = lo + 2 * DECK_IN;
      if (ut - wr.y > DECK_RAIL_FROM && P.y > ut - DECK_STEP && P.y < ut + DECK_RAIL && (nx < lo || nx > hi)) {
        nx = P.x < lo || P.x > hi ? P.x + (clamp(P.x, lo, hi) - P.x) * Math.min(1, dt * 12) : clamp(nx, lo, hi); // взбежал с края пандуса — к середине
        P.vx = 0;
      }
    }
    P.x = nx;
    if (P.slipT > 0) P.slipT -= dt;
    if (P.slide > 0) P.slide -= dt;
    if (P.jumpQ > 0 && (P.jumpQ -= dt) > 0 && P.grounded && !P.dead && !underLowbar()) runJump(); // прыжок, нажатый под аркой
    if (P.slide > 0 && P.grounded && Math.random() < dt * 40) dust(P.x + rand(-0.3, 0.3), P.y, P.z + 0.5, 1); // подкат — пыль из-под лап
    if (!P.dead) P.vz += (-runSpeed() - P.vz) * smooth(2, dt);
    else {
      P.vz *= Math.exp(-dt * 1.6); // сбит с ног: летит вверх и вбок с виадука, вперёд — по инерции, гаснет
      if (Math.abs(P.x) > 4.6) P.vx *= Math.exp(-dt * 2.5); // за краем — почти отвесно вниз, рядом с виадуком
      P.grounded = false;
    }
    var prevY = P.y;
    if (!P.grounded) {
      P.vy -= C.gravity * dt;
      P.y += P.vy * dt;
    }
    P.z += P.vz * dt;
    if (-P.z > P.maxDist) P.maxDist = -P.z;
    var row = roadRowAt(P.z), p = row && roadTile(row, P.x), up = row && onUpper(row, P.x) ? upperY(row, P.z) : null;
    if (row) {
      P.target = row;
      if (P.grounded) P.ground = row.y;
    } else if (!P.grounded && !P.dead) { // перелетел край виадука в прыжке: цель — остров впереди (туда и спасение)
      var isle = rowAhead(P.z, 0);
      if (isle && !isle.road) {
        P.target = isle;
        var disc = P.vy * P.vy + 2 * C.gravity * (P.y - isle.y), t = disc > 0 ? (P.vy + Math.sqrt(disc)) / C.gravity : 0;
        if (t > 0.15 && (P.z - isle.z) / t < runSpeed() * 1.7) { // ещё долетает — дальше прыжком на остров
          P.move = 'hop';
          P.lane = -1;
          P.slide = 0;
          P.vz = (isle.z - P.z) / t;
          return;
        }
      }
    }
    if (P.grounded) {
      if (up != null && Math.abs(up - P.y) < 0.5) { // по пандусу и настилу верхнего виадука
        P.y = up;
        P.ground = up;
      } else if (!tileHolds(p) || row && P.y > row.y + 0.5) {
        P.grounded = false; // шагнул в провал или с края настила
        P.slide = 0;
        if (p && p.type === 'wood' && !p.broken) breakPlatform(p);
      } else {
        P.y = p.y;
        tileUnderfoot(p);
      }
    } else if (P.vy < 0 && !P.dead) {
      if (up != null) { // над колонкой помоста — только на настил (чуть ниже верха — запрыгнул сбоку или пандус вырос под котом)
        if (P.y <= up && prevY >= up - DECK_STEP) runLand({ y: up, row: row, x: CONFIG.lanes.x[row.upper.lane], z: P.z });
      } else if (tileHolds(p) && prevY >= p.y - 0.001 && P.y <= p.y) runLand(p);
    }
    if (!P.dead) runObstacles();
    // виадук кончился — впереди острова: прыжок с края
    var next = row && rowAt(row.i + 1);
    if (row && next && !next.road && P.grounded && P.z < row.z - R.tile * 0.35) hopFromRoad(next);
  }

  // под ногами: огонь жжёт, лёд несёт вбок, шипы, атака босса по колонке — каждая плита один раз
  function tileUnderfoot(p) {
    if (p.stepped) return;
    var hurt = null;
    if (p.type === 'fire' && fireState(p) === 'burn') hurt = 'fire';
    else if (p.scorch && simTime >= p.scorch.from && simTime < p.scorch.to && LANE_FX[p.scorch.kind].hurt) hurt = LANE_FX[p.scorch.kind].hurt;
    else if (p.type === 'spike') hurt = 'spike';
    if (p.type === 'ice') {
      p.stepped = true;
      player.slipT = 1.2;
      slipOnIce();
    }
    if (hurt) {
      p.stepped = true;
      hazardHurt(hurt, p);
      if (!player.dead) {
        player.grounded = false; // отскок — и подката больше нет (иначе кот «проезжал» бы арку стоя)
        player.vy = 5;
        player.slide = 0;
      }
    }
  }

  // препятствия рядом с котом в его колонке: прошёл чисто — +1 к серии, нет — удар
  function runObstacles() {
    var P = player;
    for (var r = 0; r < world.rows.length; r++) {
      var row = world.rows[r];
      if (!row.road || Math.abs(row.z - P.z) > 1.4) continue;
      if (row.axe && !row.axeChecked && Math.abs(row.z - P.z) < 0.3) { // секира над виадуком: пробегая под ней, не попасть под лезвие
        row.axeChecked = true;
        if (axeHits(row, P.x, P.y)) {
          note('axeHit');
          hazardHurt('axe', roadTile(row, P.x) || { x: P.x, y: row.y, z: row.z, w: 2.2 });
        }
      }
      for (var i = 0; i < row.plats.length; i++) {
        var p = row.plats[i], o = p.obstacle, kind = o ? o.kind : p.keg && !p.keg.done ? 'keg' : p.dog && !p.dog.down ? 'dog' : null;
        if (!kind || p.passed || Math.abs(P.x - p.x) > 0.85 || Math.abs(P.z - p.z) > (kind === 'lowbar' ? 0.32 : 0.28)) continue;
        var h = P.y - p.y, ok = kind === 'barrier' ? h > 0.62 : kind === 'lowbar' ? P.slide > 0 && P.grounded || h > LOWBAR.top : kind === 'keg' ? h > 0.78 : h > 1.05;
        p.passed = true;
        if (ok) {
          comboAdd(1, p.y, [tr('tag.dodge')], 0);
          note('dodge');
          continue;
        }
        if (kind === 'keg') kegBlast(p, false);
        else if (kind === 'dog') dogStrike(p.dog);
        else {
          o.mesh.visible = false; // разлетелся
          chips(p.x, p.y + 0.6, p.z, kind === 'barrier' ? [0.45, 0.3, 0.18] : [0.72, 0.68, 0.62], 16);
        }
        hazardHurt(kind, p);
        if (!P.dead) {
          P.grounded = false;
          P.vy = 4;
          P.slide = 0;
        }
      }
    }
  }

  // автопилот на виадуке: колонка без опасностей на 12 м вперёд; перед барьером, бочкой и провалом — прыжок,
  // перед аркой — подкат, пса и бочку рубит мечом
  function botRun() {
    var P = player, lanes = [0, 1, 2], risk = [0, 0, 0], act = null;
    world.rows.forEach(function (row) {
      var ahead = P.z - row.z;
      if (!row.road || ahead < -0.5 || ahead > 12) return;
      var wgt = 1 / (1 + ahead * 0.25);
      lanes.forEach(function (l) {
        var p = roadTile(row, CONFIG.lanes.x[l]);
        if (!p) { risk[l] += 2 * wgt; return; }
        if (p.type === 'fire' || p.type === 'ghost') risk[l] += 3 * wgt;
        if (p.type === 'ice') risk[l] += 0.5 * wgt;
        if (p.obstacle) risk[l] += 1.2 * wgt;
        if (p.dog && !p.dog.down || p.keg && !p.keg.done) risk[l] += 1 * wgt;
        if (row.upper && row.upper.lane === l && !onUpper(row, P.x) && upperY(row, row.z) > P.y + DECK_STEP) risk[l] += 4 * wgt; // помост сбоку — стенка
        if (row.upper && row.upper.lane !== l && onUpper(row, P.x) && P.y > row.y + DECK_RAIL_FROM) risk[l] += 4 * wgt; // на помосте — парапет
        if (p.scorch) { // атака босса по колонке: опасна, если кот окажется на плите, пока она горит
          var at = simTime + Math.max(0, ahead) / Math.max(1, -P.vz);
          if (at > p.scorch.from - 0.25 && at < p.scorch.to + 0.1) risk[l] += 6 * wgt;
        }
        if (row.axe && ahead > 0) { // где будет лезвие, когда кот добежит
          var b = axeBlade(row, simTime + ahead / Math.max(1, -P.vz));
          if (Math.abs(b.x - CONFIG.lanes.x[l]) < 1.7 && b.y < row.y + 2.3) risk[l] += 6 * wgt;
        }
      });
    });
    world.rollers.forEach(function (r) { // бочка катится навстречу — её колонка опасна
      var ahead = P.z - r.z;
      if (!r.keg.done && !r.passed && ahead > 0 && ahead < 16) risk[nearestLane(r.x)] += 2 / (1 + ahead * 0.2);
    });
    // путь в другую колонку идёт через соседние: провал или препятствие в них в ближайшие 4 м — дорогой путь
    var here = nearestLane(P.x);
    world.rows.forEach(function (row) {
      var ahead = P.z - row.z;
      if (!row.road || ahead < -1.3 || ahead > 4) return;
      lanes.forEach(function (l) {
        if (l === here) return;
        for (var k = Math.min(l, here); k <= Math.max(l, here); k++) {
          if (k === here) continue;
          var q = roadTile(row, CONFIG.lanes.x[k]);
          if (!q || q.obstacle && !q.passed) risk[l] += 3;
        }
      });
    });
    var best = 0;
    lanes.forEach(function (l) {
      var cur = Math.abs(CONFIG.lanes.x[l] - P.x) < 1.1 ? -0.4 : 0; // своя колонка — немного выгоднее
      if (risk[l] + cur < risk[best] + (Math.abs(CONFIG.lanes.x[best] - P.x) < 1.1 ? -0.4 : 0)) best = l;
    });
    // что перед котом: плита там, где он будет, добежав до ряда (если смещается — в соседней колонке)
    world.rows.forEach(function (row) {
      var ahead = P.z - row.z;
      if (!row.road || ahead < -1.3 || ahead > 3.4) return;
      var p = roadTile(row, clamp(P.x + P.vx * Math.max(0.12, ahead / Math.max(1, -P.vz)), -CONFIG.lanes.half, CONFIG.lanes.half)); // свой ряд — куда шагнёт через 0,12 с
      var sp = Math.max(12, -P.vz) / 14; // на большой скорости — раньше
      if (!p) { if (ahead < 1.9 * sp) act = act || 'jump'; return; }
      if (ahead < 0) return;
      if (p.obstacle && !p.passed) act = act || (p.obstacle.kind === 'lowbar' ? (ahead < 2.4 * sp ? 'slide' : null) : ahead < 2.4 * sp ? 'jump' : null);
      if ((p.keg && !p.keg.done || p.dog && !p.dog.down) && ahead < 3.2) act = act || 'cut';
      if ((p.type === 'fire' && fireState(p) !== 'calm' || p.type === 'ghost' && ghostState(p) !== 'solid') && ahead < 2.2) act = act || 'jump';
    });
    world.rollers.forEach(function (r) { // бочка вплотную — срубить
      if (!r.keg.done && !r.passed && P.z - r.z > 0 && P.z - r.z < 4.6 && Math.abs(r.x - P.x) < 1.4) act = act || 'cut';
    });
    world.flyers.forEach(function (w) { // ворона или мышь у дороги впереди — срубить
      if (!w.dead && w.z < P.z + 0.5 && P.z - w.z < 3 && Math.abs(w.x - P.x) < 1.8 && w.y - P.y < 2.4) act = act || 'cut'; // прыжок важнее
    });
    world.fireballs.forEach(function (f) { // шар летит навстречу — отбить, когда до встречи меньше 0,18 с
      if (!f.done && !f.back && f.z < P.z + 0.5 && P.z - f.z < 0.18 * (15 - P.vz) && Math.abs(f.x - P.x) < 2.5) act = 'cut';
    });
    if (act === 'jump' && P.grounded) runJump();
    else if (act === 'slide' && !(P.slide > 0) && !P.slideQueued) startSlide(); // в воздухе — камнем вниз и подкат при касании
    else if (act === 'cut') startAttack();
    return clamp((CONFIG.lanes.x[best] - P.x) * 1.5, -1, 1);
  }

  function rowAt(i) {
    var rows = world.rows;
    return rows.length ? rows[i - rows[0].i] || null : null;
  }

  // первый ряд впереди кота не ближе minAhead — цель для прыжка после внепланового отскока
  function rowAhead(z, minAhead) {
    for (var i = 0; i < world.rows.length; i++) if (world.rows[i].z < z - minAhead) return world.rows[i];
    return world.rows[world.rows.length - 1];
  }

  function groundAt(z) {
    var rows = world.rows;
    if (!rows.length) return 0;
    var last = rows[rows.length - 1];
    if (z < last.z) return last.y + (last.z - z) * 0.08;
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i].z >= z) return rows[i].y;
    return rows[0].y;
  }

  function releasePlatform(p) {
    release(p.mesh);
    if (p.crate) release(p.crate.mesh);
    if (p.dog) release(p.dog.mesh);
    if (p.keg) release(p.keg.mesh);
    if (p.obstacle) release(p.obstacle.mesh);
    scorchFlames(p, false);
    p.decos.forEach(function (dc) { if (dc.mesh) release(dc.mesh); });
  }

  function releaseRow(row) {
    row.plats.forEach(releasePlatform);
    if (row.axe) release(row.axe.mesh);
    if (row.gate) release(row.gate);
  }

  function breakPlatform(p) {
    p.broken = true;
    p.breakT = 0;
    p.mesh.userData.planks.forEach(function (m) {
      m.userData.v = new T.Vector3(rand(-1.6, 1.6), rand(-0.5, 1.5), rand(-1, 1));
      m.userData.spin = new T.Vector3(rand(-5, 5), rand(-2, 2), rand(-5, 5));
    });
    chips(p.x, p.y - 0.1, p.z, [0.55, 0.36, 0.2], 16);
    Sound.crack();
    vibrate(40);
  }

  // огненный остров по кругу: спокоен → разогревается (предупреждение) → горит
  function firePhase(p) {
    var F = CONFIG.fire;
    return ((simTime + p.firePhase) % F.period + F.period) % F.period;
  }

  function fireState(p) {
    var F = CONFIG.fire, c = firePhase(p);
    if (c > F.period - F.burn) return 'burn';
    if (c > F.period - F.burn - F.warn) return 'warn';
    return 'calm';
  }

  // накал 0…1: спокоен — 0, предупреждение — разгорается, горит — 1
  function fireHeat(p, st) {
    var F = CONFIG.fire;
    return st === 'burn' ? 1 : st === 'warn' ? (firePhase(p) - (F.period - F.burn - F.warn)) / F.warn : 0;
  }


  /* ---------- Ловушки: призрачный и ледяной острова, пороховая бочка, секира-маятник ---------- */

  // Призрачный остров по кругу: виден → мерцает (предупреждение) → исчезает, и кот проваливается сквозь него
  function ghostPhase(p) {
    var Q = CONFIG.ghost;
    return ((simTime + p.ghostPhase) % Q.period + Q.period) % Q.period;
  }

  function ghostState(p) {
    var Q = CONFIG.ghost, c = ghostPhase(p);
    if (c > Q.period - Q.gone) return 'gone';
    if (c > Q.period - Q.gone - Q.warn) return 'warn';
    return 'solid';
  }

  function updateGhost(p) {
    var m = p.mesh.userData.ghost, st = ghostState(p);
    m.opacity = st === 'gone' ? 0.1 : st === 'warn' ? (Math.sin(simTime * 40) > 0 ? 0.85 : 0.3) : 0.9;
    m.depthWrite = st !== 'gone';
    if (st === 'gone' && Math.random() < 0.35) {
      fxGlow.emit({ x: p.x + rand(-p.w / 2, p.w / 2), y: p.y + rand(-0.4, 0.2), z: p.z + rand(-0.9, 0.9), vx: 0, vy: rand(0.5, 1.2), vz: 0, grav: 0, drag: 1, life: rand(0.4, 0.7), size: rand(0.3, 0.5), grow: 0.5, c: [0.55, 0.8, 1], a: 0.7 });
    }
  }

  // Ледяной остров: корка льда и сосульки по кромке. На льду кот скользит — его несёт вбок,
  // и до следующего приземления рулить трудно
  function addIce(root, w, d) {
    var b = new Bundle(), i;
    b.add(boxGeo(w - 0.12, 0.07, d - 0.2), mat.ice, [0, 0.01, 0]);
    for (i = 0; i < 6; i++) b.add(new T.ConeGeometry(0.06, rand(0.25, 0.5), 5), mat.ice, [-w / 2 + 0.2 + i * (w - 0.4) / 5, -0.3, d / 2 - 0.05], [Math.PI, 0, 0]);
    for (i = 0; i < 3; i++) [-1, 1].forEach(function (s) { b.add(new T.ConeGeometry(0.05, rand(0.2, 0.4), 5), mat.ice, [s * (w / 2 - 0.05), -0.28, -d / 2 + 0.4 + i * (d - 0.8) / 2], [Math.PI, 0, 0]); });
    b.build(root, {});
  }

  function slipOnIce() {
    var P = player, dir = P.vx > 0.3 ? 1 : P.vx < -0.3 ? -1 : pickOf([-1, 1]);
    P.vx += dir * CONFIG.ice.slide;
    sparkle(P.x, P.y + 0.1, P.z, [0.75, 0.92, 1], 10, 2.5);
    Sound.ice();
    note('ice');
  }

  // Пороховая бочка на острове, фитиль искрит. Прыгнул на неё — взрыв и минус жизнь; разрубил мечом
  // издалека — «Бабах!», монеты, а взрыв сносит псов, летунов и соседние бочки
  function buildKeg() {
    var g = new T.Group();
    if (models.traps) attach(g, models.traps.keg, 0, 0, 0, {}, { plain: 1 });
    else new Bundle().add(new T.CylinderGeometry(0.27, 0.27, 0.62, 12), mat.wood, [0, 0.31, 0]).add(new T.TorusGeometry(0.28, 0.025, 6, 16), mat.iron, [0, 0.31, 0], [Math.PI / 2, 0, 0]).build(g, { cast: true });
    g.scale.setScalar(1.3);
    return g;
  }

  function addKeg(p) {
    codexSeen('trap', 'keg');
    p.keg = { mesh: acquire('keg', buildKeg), done: false };
  }

  function updateKeg(p) {
    p.keg.mesh.position.set(p.x, p.ry, p.z);
    if (Math.random() < 0.6) fxGlow.emit({ x: p.x + 0.08, y: p.ry + 1.17, z: p.z + 0.16, vx: rand(-0.6, 0.6), vy: rand(0.4, 1.4), vz: rand(-0.6, 0.6), grav: 3, drag: 1.5, life: rand(0.15, 0.3), size: rand(0.12, 0.22), grow: -0.5, c: [1, rand(0.6, 0.9), 0.3], a: 1 });
  }

  function kegBlast(p, cut) {
    var K = CONFIG.keg, x = p.x, y = p.y + 0.5, z = p.z, i;
    p.keg.done = true;
    p.keg.mesh.visible = false;
    fxGlow.emit({ x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 0.25, size: 4.5, grow: 0.6, c: [1, 0.75, 0.3], a: 1 });
    flames(x, p.y, z, 1.4, 20);
    for (i = 0; i < 12; i++) fxDust.emit({ x: x + rand(-0.5, 0.5), y: y + rand(0, 0.6), z: z + rand(-0.5, 0.5), vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5), grav: -0.5, drag: 2, life: rand(0.7, 1.2), size: rand(0.8, 1.4), grow: 1.5, c: [0.32, 0.3, 0.3], a: 0.6 });
    chips(x, y, z, [0.33, 0.18, 0.08], 14); // щепки
    cam.shake = Math.max(cam.shake, cut ? 0.35 : 0.5);
    Sound.boom();
    vibrate(60);
    note(cut ? 'kegCut' : 'kegBoom');
    if (cut) track('keg');
    if (!cut) return;
    var won = addCoins(K.coins), R2 = K.blast * K.blast;
    popText(tr('pop.boom'), '+' + coinsWord(won), true);
    world.rows.forEach(function (row) { // взрыв задевает всё рядом — и соседние бочки (цепочкой)
      if (Math.abs(row.z - z) > K.blast + 1) return;
      row.plats.forEach(function (q) {
        var dx = q.x - x, dz = q.z - z;
        if (dx * dx + dz * dz > R2) return;
        if (q.dog && !q.dog.down) defeatDog(q.dog);
        if (q.keg && !q.keg.done) kegBlast(q, true);
      });
    });
    world.flyers.forEach(function (w) {
      var dx = w.x - x, dy = w.y - y, dz = w.z - z;
      if (!w.dead && dx * dx + dy * dy + dz * dz < R2) defeatFlyer(w, 3);
    });
  }

  // Секира-маятник: каменные ворота над рядом, на балке качается секира — поперёк всех колонок.
  // Приземлился, когда лезвие рядом, — минус жизнь. Угол качания — синус от времени, поэтому видно, куда она придёт
  function buildAxeGate() {
    var g = new T.Group(), A = CONFIG.axe, pend = new T.Group();
    pend.position.y = A.pivot;
    g.add(pend);
    if (models.traps) {
      attach(g, models.traps.gate, 0, 0, 0, {}, { plain: 1 });
      attach(pend, models.traps.axe, 0, 0, 0, { blade: mat.metal }, { plain: 1, blade: 1 });
    } else {
      var b = new Bundle(), a = new Bundle();
      [-1, 1].forEach(function (s) { b.add(boxGeo(0.7, 8, 0.7), mat.basalt, [4.8 * s, 1.8, 0]); });
      b.add(boxGeo(10.4, 0.36, 0.42), mat.wood, [0, 5.75, 0]);
      b.build(g, { cast: true });
      a.add(new T.CylinderGeometry(0.03, 0.03, A.arm, 6), mat.iron, [0, -A.arm / 2, 0]);
      a.add(boxGeo(1.6, 0.9, 0.07), mat.metal, [0, -A.arm, 0]);
      a.build(pend, { cast: true });
    }
    g.userData.pend = pend;
    return occluder(g);
  }

  function axeAngle(row, t) {
    return CONFIG.axe.swing * Math.sin(t * Math.PI * 2 / row.axe.period + row.axe.phase);
  }

  function axeBlade(row, t) {
    var A = CONFIG.axe, a = axeAngle(row, t);
    return { x: A.arm * Math.sin(a), y: row.y + A.pivot - A.arm * Math.cos(a) };
  }

  function axeHits(row, x, y) { // лезвие рядом с туловищем кота (оно на 0.8 м выше лап)
    var b = axeBlade(row, simTime), dx = (b.x - x) / 1.0, dy = (b.y - y - 0.8) / 0.9;
    return dx * dx + dy * dy < 1;
  }

  function updateAxe(row) {
    var a = axeAngle(row, simTime), m = row.axe.mesh, low = Math.abs(a) < 0.15;
    m.position.set(0, row.y, row.z);
    m.userData.pend.rotation.z = a;
    if (low && !row.axe.low && Math.abs(row.z - player.z) < 16) Sound.axe(earshot(0, row.y - player.y, row.z - player.z, 3, 16)); // тяжёлый свист внизу
    row.axe.low = low;
  }

  // первая встреча с ловушкой — подсказка (раз за запуск)
  // на виадуке (row.road) — свои подсказки: бегом, а не прыжком на остров; плюс барьер, арка и провал
  function trapTips(row) {
    var ahead = player.z - row.z, run = row.road ? '.run' : '';
    if (ahead < 8 || ahead > 30) return;
    if (row.axe) teach('axe' + run, tr('trap.axe' + run));
    row.plats.forEach(function (p) {
      if (p.type === 'ice' || p.type === 'ghost') teach(p.type + run, tr('trap.' + p.type + (p.type === 'ghost' ? run : '')));
      if (p.keg && !p.keg.done) teach('keg' + run, tr('trap.keg' + run));
      if (p.obstacle) teach(p.obstacle.kind, tr('trap.' + p.obstacle.kind));
    });
    if (row.gaps && row.gaps.length) teach('gap', tr('trap.gap'));
  }


  /* ---------- Биомы ---------- */

  // Биом — облик участка дороги: небо и туман подмешиваются к цветам суток (доля mix, ночью слабее), камень
  // дороги и боковые острова тонируются (stone, isle), в воздухе свои частицы (fx), а ловушки биома выпадают
  // чаще (traps — вес вместо 1). Миры кампании — по биому на мир; в забеге биомы сменяются по кругу каждые
  // CONFIG.biomeEvery м

  var bio = { key: 'sky', prev: BIOMES.sky, cur: BIOMES.sky, k: 1 }, bioTmp = null, bioTmp2 = null;

  function biomeAt(dist) {
    if (mode === 'level') return WORLDS[level.w].biome;
    return BIOME_ORDER[Math.floor(Math.max(0, dist) / CONFIG.biomeEvery) % BIOME_ORDER.length];
  }

  // смена биома — плавно, за пару секунд; instant — сразу (начало раунда)
  function setBiome(key, instant) {
    if (key === bio.key && !instant) return;
    bio.prev = instant ? BIOMES[key] : bio.cur;
    bio.cur = BIOMES[key];
    bio.key = key;
    bio.k = instant ? 1 : 0;
    applyBiomeTint();
    updateDayNight(0, true);
  }

  // камень дороги и боковые острова: исходный цвет материала × оттенок биома (переход prev → cur)
  function applyBiomeTint() {
    if (!bioTmp) {
      bioTmp = new T.Color();
      bioTmp2 = new T.Color();
    }
    var stone = bioTmp.set(bio.prev.stone).lerp(bioTmp2.set(bio.cur.stone), bio.k);
    (mat.bridge || [mat.block]).concat([mat.parapet], mat.deckStone ? [mat.deckStone] : []).forEach(function (m) {
      if (!m.userData.base) m.userData.base = m.color.clone();
      m.color.copy(m.userData.base).multiply(stone);
    });
    if (mat.island) mat.island.color.set(bio.prev.isle).lerp(bioTmp2.set(bio.cur.isle), bio.k);
  }

  // небо, туман, свет: цвета суток тянутся к оттенку биома; ночью — слабее, чтобы ночь оставалась ночью
  function applyBiomeSky() {
    var night = 1 - day.night * 0.5;
    [[bio.prev, 1 - bio.k], [bio.cur, bio.k]].forEach(function (pair) {
      var B = pair[0], w = B.mix * pair[1] * night;
      if (w <= 0) return;
      Object.keys(B.tint).forEach(function (key) { day[key].lerp(bioTmp2.set(B.tint[key]), w); });
    });
  }

  function updateBiome(dt) {
    if (bio.k < 1) {
      bio.k = Math.min(1, bio.k + dt / 2.5);
      applyBiomeTint();
    }
    if (mode === 'run' && state === 'play') { // в забеге биом меняется по дистанции — с названием на экране
      var key = biomeAt(player.maxDist);
      if (key !== bio.key) {
        setBiome(key);
        toast(tr(BIOMES[key].name), 2200);
      }
    }
    updateWeather(dt);
    var fx = bio.cur.fx, a = bio.k; // частицы в воздухе вокруг камеры
    if (!fx || Math.random() > dt * 26 * a) return;
    var x = camera.position.x + rand(-9, 9), z = camera.position.z - rand(4, 26), y = cam.y + rand(-1, 7);
    if (fx === 'snow') fxDust.emit({ x: x, y: y + 4, z: z, vx: rand(-0.4, 0.4), vy: -rand(0.8, 1.6), vz: rand(-0.3, 0.3), grav: 0, drag: 0.2, life: rand(2.5, 4), size: rand(0.1, 0.2), grow: 0, c: [1, 1, 1], a: 0.9 });
    else if (fx === 'embers') fxGlow.emit({ x: x, y: y - 2, z: z, vx: rand(-0.3, 0.3), vy: rand(0.6, 1.4), vz: rand(-0.3, 0.3), grav: -0.2, drag: 0.3, life: rand(1.6, 2.8), size: rand(0.1, 0.2), grow: -0.3, c: [1, rand(0.35, 0.6), 0.1], a: 0.9 });
    else fxGlow.emit({ x: x, y: y, z: z, vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.3), vz: rand(-0.3, 0.3), grav: 0, drag: 0.2, life: rand(2, 3.5), size: rand(0.3, 0.6), grow: 0.4, c: [0.55, 0.75, 1], a: 0.5 });
  }

  // Погода биома (BIOMES.weather): пух — всегда понемногу; метель и порывы искр — раз в полминуты на несколько секунд;
  // гроза — молния на горизонте, вспышка неба и света, через миг — гром (дальше молния — позже и глуше)
  var weather = { next: 10, gust: 0, dir: 1, frost: false, flash: -1, thunder: -1, far: 0, bolt: null };
  var FLASH = [[0, 1], [0.07, 0.25], [0.13, 0.9], [0.2, 0.5], [0.6, 0]]; // молния мигает: время, яркость

  function updateWeather(dt) {
    var kind = bio.k > 0.5 ? bio.cur.weather : null, x, z;
    weather.next -= dt;
    if (kind === 'fluff' && Math.random() < dt * 5) {
      fxDust.emit({ x: camera.position.x + rand(-10, 10), y: cam.y + rand(-1, 6), z: camera.position.z - rand(4, 24), vx: rand(0.3, 0.8), vy: rand(-0.1, 0.25), vz: rand(-0.2, 0.2), grav: 0, drag: 0, life: rand(4, 6), size: rand(0.07, 0.12), grow: 0, c: [1, 1, 1], a: 0.85 });
    }
    if ((kind === 'blizzard' || kind === 'ash') && weather.next <= 0 && weather.gust <= 0) {
      weather.gust = rand(5, 7);
      weather.dir = pickOf([-1, 1]);
      weather.next = rand(18, 30);
      if (kind === 'blizzard') Sound.gust();
    }
    if (weather.gust > 0) {
      weather.gust -= dt;
      var g = Math.max(0, Math.min(1, weather.gust, 6 - weather.gust)); // порыв нарастает и стихает
      if (kind === 'blizzard' || weather.frost) { // метель: края экрана белеют (слой вспышки молнии — в метель грозы не бывает)
        weather.frost = weather.gust > 0;
        el.flash.classList.toggle('is-frost', weather.frost);
        el.flash.style.opacity = weather.frost && kind === 'blizzard' ? (g * 0.45 * flashK()).toFixed(3) : '0'; // иней по краям — не выбеливает экран
      }
      for (var n = 0; n < 3; n++) {
        if (Math.random() > dt * 60 * g) continue;
        x = camera.position.x + rand(-14, 14) - weather.dir * 6;
        z = camera.position.z - rand(3, 22);
        if (kind === 'blizzard' && n === 2) { // крупные хлопья у самой камеры — метель «в лицо»
          fxDust.emit({ x: camera.position.x + rand(-5, 5) - weather.dir * 3, y: camera.position.y + rand(-3, 1), z: camera.position.z - rand(2, 7), vx: weather.dir * rand(6, 9), vy: -rand(1, 2), vz: rand(-0.5, 0.5), grav: 0, drag: 0, life: rand(0.7, 1.1), size: rand(0.06, 0.1), grow: 0, c: [1, 1, 1], a: 0.9 });
        } else if (kind === 'blizzard') fxDust.emit({ x: x, y: cam.y + rand(-1, 8), z: z, vx: weather.dir * rand(5, 8), vy: -rand(1, 2.5), vz: rand(-0.5, 0.5), grav: 0, drag: 0, life: rand(1.4, 2.2), size: rand(0.12, 0.26), grow: 0, c: [1, 1, 1], a: 0.95 });
        else if (kind === 'ash') fxGlow.emit({ x: x, y: cam.y - rand(2, 4), z: z, vx: weather.dir * rand(1.5, 3), vy: rand(2, 4), vz: rand(-0.3, 0.3), grav: -0.3, drag: 0.3, life: rand(1.2, 2), size: rand(0.1, 0.22), grow: -0.3, c: [1, rand(0.4, 0.65), 0.12], a: 1 });
      }
    }
    if (kind === 'ash' && Math.random() < dt * 8) { // пепел медленно падает
      fxDust.emit({ x: camera.position.x + rand(-9, 9), y: cam.y + rand(3, 8), z: camera.position.z - rand(4, 24), vx: rand(-0.3, 0.3), vy: -rand(0.3, 0.7), vz: rand(-0.2, 0.2), grav: 0, drag: 0, life: rand(4, 6), size: rand(0.06, 0.12), grow: 0, c: [0.28, 0.24, 0.22], a: 0.75 });
    }
    if (kind === 'storm' && (bio.key === 'ghost' || day.night > 0.25) && weather.next <= 0 && weather.flash < 0) strike(); // на светлом небе молнии не видно
    if (weather.flash >= 0) {
      weather.flash += dt;
      var k = flashAt(weather.flash);
      hemi.intensity = day.hemiI * LIGHT_K * (1 + 1.6 * k * flashK());
      weather.bolt.material.opacity = Math.min(1, k * 1.4 * flashK());
      el.flash.style.opacity = (k * 0.28 * flashK()).toFixed(3);
      if (weather.flash > FLASH[FLASH.length - 1][0]) {
        weather.flash = -1;
        weather.bolt.visible = false;
        hemi.intensity = day.hemiI * LIGHT_K;
        el.flash.style.opacity = '0';
      }
    }
    if (weather.thunder >= 0 && (weather.thunder -= dt) < 0) Sound.thunder(weather.far);
  }

  function flashAt(t) {
    for (var i = 1; i < FLASH.length; i++) if (t < FLASH[i][0]) return lerp(FLASH[i - 1][1], FLASH[i][1], (t - FLASH[i - 1][0]) / (FLASH[i][0] - FLASH[i - 1][0]));
    return 0;
  }

  // молния: зигзаг-лента из 10 звеньев с отростком, далеко за дорогой, в слое неба
  function strike() {
    var b = weather.bolt;
    if (!b) {
      var geo = new T.BufferGeometry(), idx = [];
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
      for (var i = 0; i < 15; i++) if (i !== 10) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); // 10 — разрыв перед отростком
      geo.setIndex(idx);
      b = weather.bolt = new T.Mesh(geo, mat.bolt);
      b.layers.set(LAYER_FAR);
      b.frustumCulled = false;
      scene.add(b);
    }
    var p = b.geometry.attributes.position, x = 0, y = 0, w, bx = 0, by = 0;
    for (var s = 0; s <= 15; s++) {
      if (s === 11) { x = bx; y = by; } // отросток — от середины ствола
      w = s <= 10 ? 0.9 * (1 - s / 13) : 0.45 * (1 - (s - 11) / 6);
      p.setXYZ(s * 2, x - w, y, 0);
      p.setXYZ(s * 2 + 1, x + w, y, 0);
      if (s === 4) { bx = x; by = y; }
      x += rand(-5, 5) + (s > 10 ? 3 : 0);
      y -= rand(5, 8);
    }
    p.needsUpdate = true;
    weather.far = Math.random();
    b.position.set(camera.position.x + pickOf([-1, 1]) * rand(8, 22) * (1 + weather.far), cam.y + 40 + weather.far * 15, camera.position.z - 140 - weather.far * 110); // в кадре: на 150 м экран — около ±30 м
    b.visible = true;
    weather.flash = 0;
    weather.thunder = 0.25 + weather.far * 1.4;
    weather.next = rand(9, 20);
  }


  /* ---------- Кампания «Дорога к Небесному замку» ---------- */

  // Пять миров по семь уровней. Уровень — отрезок дороги длиной len м с финишем у ворот со стягами; дорога строится
  // тем же генератором, но с «зерном» уровня (каждая попытка — та же дорога) и по правилам уровня: сложность d,
  // какие ловушки и с каким весом (traps), секиры (axe), ездящие (moving, доля «бешеных» — fast), вороны и мыши
  // (crows, bats — шанс на ряд), щиты (shield), дракончик в середине (dragon). Время суток у мира своё и не идёт.
  // Последний уровень — Пламенный дракон: дорога без конца и ловушек, уровень пройден, когда дракон повержен.
  // Звёзды: дошёл; собрал 60% монет уровня; ни разу не потерял жизнь

  var QUEST_KEY = 'catKnight.quest';
  var quest = { stars: {} }; // звёзды по уровням: { '1-1': 3, … }
  var mode = 'run', level = null, winTimer = 0; // 'run' — бесконечный забег; 'level' — уровень кампании

  function levelId(w, i) { return (w + 1) + '-' + (i + 1); }
  function levelBonus(w, i) { return 60 + 15 * (w * 7 + i); } // монеты за первое прохождение уровня

  // уровень для карточки похода в меню: первый открытый и не пройденный; всё пройдено — первый не на три звезды
  function questNext() {
    var pick = null, w, i;
    for (w = 0; w < WORLDS.length && !pick; w++) for (i = 0; i < WORLDS[w].levels.length && !pick; i++) if (levelOpen(w, i) && !starsOf(w, i)) pick = [w, i];
    for (w = 0; w < WORLDS.length && !pick; w++) for (i = 0; i < WORLDS[w].levels.length && !pick; i++) if (starsOf(w, i) < 3) pick = [w, i];
    return pick || [WORLDS.length - 1, WORLDS[WORLDS.length - 1].levels.length - 1];
  }

  // карточка похода и прогресс в меню: номер уровня, мир, подсказка, награда, звёзды, длина (или босс)
  function renderQuestCard() {
    var q = questNext(), w = q[0], i = q[1], L = WORLDS[w].levels[i], s = starsOf(w, i), done = 0, all = 0;
    el.qcardTag.textContent = levelId(w, i);
    el.qcardTitle.textContent = tr(BIOMES[WORLDS[w].biome].name);
    el.qcardText.textContent = L.tip ? tr(L.tip) : tr('qcard.text');
    el.qcardCoins.textContent = s ? tr('qcard.done') : '+' + levelBonus(w, i);
    el.qcardStars.textContent = s + '/3';
    el.qcardLen.textContent = L.boss ? tr('qcard.boss') : isFinite(L.len) ? tr('qcard.len', { n: L.len }) : '';
    el.qcard.dataset.w = w;
    el.qcard.dataset.i = i;
    WORLDS.forEach(function (W, k) { W.levels.forEach(function (x, j) { all++; if (starsOf(k, j)) done++; }); });
    el.progressNum.textContent = done + '/' + all;
    el.progressFill.style.width = (done / all * 100) + '%';
  }
  function starsOf(w, i) { return quest.stars[levelId(w, i)] || 0; }
  function totalStars() { return Object.keys(quest.stars).reduce(function (a, k) { return a + quest.stars[k]; }, 0); }
  function levelOpen(w, i) { // открыт первый уровень и каждый следующий за пройденным
    if (!w && !i) return true;
    return i ? starsOf(w, i - 1) > 0 : starsOf(w - 1, WORLDS[w - 1].levels.length - 1) > 0;
  }

  function loadQuest() {
    try { quest = JSON.parse(localStorage.getItem(QUEST_KEY)) || quest; } catch (e) {}
    if (!quest.stars) quest = { stars: {} };
  }

  function saveQuest() {
    try { localStorage.setItem(QUEST_KEY, JSON.stringify(quest)); } catch (e) {}
  }

  // ГСЧ с «зерном» (mulberry32): уровень кампании строится одинаково при каждой попытке
  function seeded(seed) {
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashOf(s) {
    for (var h = 2166136261, i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h | 0;
  }

  // правила ряда: в забеге — от дистанции (сложность растёт) и биома, в уровне — из описания уровня
  function rowRules(dist) {
    var G = CONFIG.gen, FL = G.flyers;
    if (mode === 'level') {
      var L = level.def, d = L.d, calm = !!L.boss;
      return {
        d: d, hazard: calm ? 0 : lerp(G.hazard[0], G.hazard[1], d), traps: L.traps || {}, axe: L.axe || 0,
        moving: calm ? 0 : L.moving != null ? L.moving : lerp(G.moving[0], G.moving[1], d), fast: L.fast || 0,
        crate: calm ? 0 : G.crate, crow: L.crows || 0, bat: L.bats || 0, shield: L.shield || 0, wings: 0, bonus: calm ? 0 : G.bonus[1] * 0.7, dragon: 0
      };
    }
    var d = difficulty(dist), arena = inArena(dist) || bossFight(), B = BIOMES[biomeAt(dist)].traps, traps = {}, F = G.hazardFrom, night = day.night || 0;
    Object.keys(F).forEach(function (k) { if (dist > F[k]) traps[k] = B[k] != null ? B[k] : 1; });
    return {
      d: d, hazard: arena ? 0 : lerp(G.hazard[0], G.hazard[1], d), traps: traps,
      axe: arena || dist <= G.axe[0] ? 0 : lerp(G.axe[1], G.axe[2], d) * (B.axe || 1),
      moving: arena || dist <= 40 ? 0 : lerp(G.moving[0], G.moving[1], d), fast: dist > G.fastFrom ? lerp(G.fast[0], G.fast[1], d) : 0,
      crate: arena || dist <= 30 ? 0 : G.crate,
      crow: arena || dist <= FL.crow[0] ? 0 : lerp(FL.crow[1], FL.crow[2], d),
      bat: arena || dist <= FL.bat[0] ? 0 : lerp(FL.bat[1], FL.bat[2], d) * (1 + night * 2),
      shield: dist > G.shield[0] ? G.shield[1] : 0,
      wings: arena || dist <= G.wings[0] ? 0 : G.wings[1],
      bonus: arena || dist <= G.bonus[0] ? 0 : G.bonus[1],
      dragon: dist > FL.dragon[0] && !arena && !inArena(dist + 60) ? lerp(FL.dragon[1], FL.dragon[2], d) : 0
    };
  }

  // финиш уровня: площадка во всю ширину дороги, над ней ворота со стягами; приземлился — уровень пройден
  function addFinish(row) {
    var P = CONFIG.platform;
    addPlatform('stone', 1, row, P.start, P.startDepth);
    row.finish = true;
    row.gate = acquire('finishGate', buildFinishGate);
    world.finish = row;
  }

  function buildFinishGate() {
    if (models.gates) return gateArch(new T.Group(), true);
    var g = new T.Group(), cloths = [];
    if (models.traps) attach(g, models.traps.gate, 0, 0, 0, {}, { plain: 1 });
    else new Bundle().add(boxGeo(10.4, 0.36, 0.42), mat.wood, [0, 5.75, 0]).build(g, { cast: true });
    [-2.2, 0, 2.2].forEach(function (x) { // три стяга с котом на балке
      var c = new T.Mesh(geo.banner, mat.bannerWave);
      c.position.set(x - 0.6, 5.55, 0.26);
      c.scale.setScalar(2.4);
      c.castShadow = true;
      g.add(c);
      cloths.push(c);
    });
    g.userData.cloths = cloths;
    return occluder(g);
  }

  // ворота над виадуком (вехи пути): стяги — у колонн, над парапетами, а не над серединой дороги — камера под ними проезжает
  // большие ворота: модель из Blender (gates.glb) — низкие: свод 4,35 м (кот в прыжке проходит), верх стенки 5,16 м —
  // камера (5,9…7,9 м над дорогой) идёт над ней; стяги — на кронштейнах перед башнями (точки в extras), развеваются,
  // у финиша — крупнее; без модели — прежние колонны с балкой
  function gateArch(g, center) {
    var G = models.gates, cloths = [], m = new T.Mesh(G.geo, mat.gateStone);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    var put = function (p, s) {
      var c = new T.Mesh(geo.banner, mat.bannerWave);
      c.position.set(p[0], p[1], p[2]);
      c.scale.setScalar(s);
      c.castShadow = true;
      g.add(c);
      cloths.push(c);
    };
    (G.extras.banners || []).forEach(function (p) { put(p, center ? 2 : 1.7); });
    g.userData.cloths = cloths;
    g.userData.sway = 0.15; // покачивание — не до стены башни
    return occluder(g);
  }

  function buildRoadGate() {
    if (models.gates) return gateArch(new T.Group(), false);
    var g = new T.Group(), cloths = [];
    if (models.traps) attach(g, models.traps.gate, 0, 0, 0, {}, { plain: 1 });
    else new Bundle().add(boxGeo(10.4, 0.36, 0.42), mat.wood, [0, 5.75, 0]).build(g, { cast: true });
    [-4.05, 4.05].forEach(function (x) {
      var c = new T.Mesh(geo.banner, mat.bannerWave);
      c.position.set(x, 5.55, 0.55); // перед колонной (её грань — 0,4), а не в ней
      c.scale.setScalar(1.7);
      c.castShadow = true;
      g.add(c);
      cloths.push(c);
    });
    g.userData.cloths = cloths;
    return occluder(g);
  }

  function updateFinish(row) {
    row.gate.position.set(0, row.y, row.z);
    var sw = row.gate.userData.sway || 0.25;
    row.gate.userData.cloths.forEach(function (c, i) { c.rotation.y = Math.sin(time * 2 + i * 1.7) * sw; });
  }

  // начало уровня: та же дорога при каждой попытке, биом и время суток мира
  function startLevel(w, i) {
    dailyRun = false;
    mode = 'level';
    level = { w: w, i: i, id: levelId(w, i), def: WORLDS[w].levels[i] };
    el.game.classList.add('is-campaign');
    requestTilt();
    Sound.init();
    Sound.click();
    resetRound();
    cam.intro = 0;
    withCoach(function () { beginPlay(true); });
    toast(tr('level.intro', { id: level.id, biome: tr(BIOMES[WORLDS[w].biome].name) }) + (level.def.tip ? '. ' + tr(level.def.tip) : ''), 3400);
  }

  function nextLevel() {
    var w = level.w, i = level.i + 1;
    if (i >= WORLDS[w].levels.length) { w++; i = 0; }
    if (w >= WORLDS.length) openMap();
    else startLevel(w, i);
  }

  // уровень пройден: кот делает сальто, звёзды, прогресс сохраняется
  function levelComplete() {
    player.cheer = 3;
    var ahead = world.coins.filter(function (c) { return !c.taken && c.z < player.z - 0.5; }).length; // до этих кот не дошёл
    var got = world.coinsGot, total = world.coinsTotal - ahead, boss = !!level.def.boss;
    var coinsOk = total === 0 || got >= Math.ceil(total * 0.6), safe = player.lives >= CONFIG.lives;
    var stars = 1 + (coinsOk ? 1 : 0) + (safe ? 1 : 0), first = !starsOf(level.w, level.i), bonus = first ? levelBonus(level.w, level.i) : 0;
    quest.stars[level.id] = Math.max(starsOf(level.w, level.i), stars);
    player.coins += bonus;
    saveQuest();
    setState('win');
    player.flip = 0;
    sparkle(player.x, player.y + 1, player.z, [1, 0.85, 0.35], 40, 6);
    Sound.win();
    Sound.purr(3.8, 0.35);
    vibrate(80);
    var last = level.w === WORLDS.length - 1 && level.i === WORLDS[level.w].levels.length - 1;
    var bossName = boss ? tr(BOSSES[bossKindFor(0)].name) : '';
    el.winTitle.textContent = last ? tr('win.castle') : tr('win.level', { id: level.id });
    el.winStars.forEach(function (s, i) { s.classList.toggle('is-on', i < stars); });
    el.winText.innerHTML = '★ ' + (boss ? tr('win.boss', { name: bossName }) : tr('win.gate')) + '<br>' +
      (coinsOk ? '★' : '☆') + ' ' + tr('win.coins', { got: got, total: total }) + '<br>' +
      (safe ? '★' : '☆') + ' ' + (safe ? tr('win.safe') : tr('win.lost', { n: maxLives() - player.lives })) +
      (bonus ? '<br>' + tr('win.bonus', { n: bonus }) : '');
    el.next.textContent = tr(last ? 'win.map' : 'win.next');
    el.winMap.style.display = last ? 'none' : '';
    note('levelWin');
    track('level');
    track('stars', totalStars());
    runEnded('win');
  }

  // карта кампании: миры по порядку, в каждом — уровни со звёздами; закрытые — серые с замком
  function openMap() {
    Sound.click();
    renderMap();
    setState('map');
  }

  function renderMap() {
    var html = '';
    WORLDS.forEach(function (W, w) {
      var B = BIOMES[W.biome], got = W.levels.reduce(function (a, L, i) { return a + starsOf(w, i); }, 0), open = levelOpen(w, 0);
      html += '<section class="game__world game__world--' + W.biome + (open ? '' : ' is-locked') + '">' +
        '<div class="game__world-head"><b>' + (w + 1) + '. ' + tr(B.name) + '</b><span>★ ' + got + '/' + W.levels.length * 3 + '</span></div><div class="game__levels">';
      W.levels.forEach(function (L, i) {
        var s = starsOf(w, i), lock = !levelOpen(w, i);
        html += '<button type="button" class="game__level' + (lock ? ' is-locked' : '') + (L.boss ? ' is-boss' : '') + '" data-w="' + w + '" data-i="' + i + '"' + (lock ? ' disabled' : '') + '>' +
          '<b>' + (L.boss ? tr('map.boss') : i + 1) + '</b><i>' + '★★★'.slice(0, s) + '<em>' + '★★★'.slice(s) + '</em></i></button>';
      });
      html += '</div></section>';
    });
    el.worlds.innerHTML = html;
    el.mapStars.textContent = tr('map.stars', { n: totalStars(), total: WORLDS.length * 21 });
    el.questStars.textContent = '★ ' + totalStars();
  }


  /* ---------- Враги ---------- */

  // ворона или летучая мышь из модели (_not_main/blender/enemies.py, в стиле кота и пса): тело и два крыла
  // на шарнирах у плеч — машут вокруг оси полёта; глаза светятся и ночью
  function flyerModel(kind) {
    var E = models.enemies[kind], g = new T.Group(), body = new T.Group(), y = kind === 'bat' ? 0.06 : 0.12, z = kind === 'bat' ? 0.14 : 0.16;
    var swap = { glow: mat.eyeGlow }, shade = { plain: 1, membrane: 1 };
    g.add(body);
    attach(body, E.body, 0, 0, 0, swap, shade);
    g.userData.wingA = attach(body, E.wingA, 0, y, z, swap, shade);
    g.userData.wingB = attach(body, E.wingB, 0, y, -z, swap, shade);
    g.scale.setScalar(1.25);
    return g;
  }

  // ворона из простых фигур (если модели нет)
  function buildCrow() {
    if (models.enemies) return flyerModel('crow');
    var g = new T.Group(), body = new T.Group(), b = new Bundle(), S = geo.sphere;
    g.add(body);
    b.add(S, mat.crow, [0, 0, 0], null, [0.42, 0.3, 0.32]);
    b.add(S, mat.crow, [0.36, 0.14, 0], null, [0.2, 0.19, 0.19]);
    b.add(new T.ConeGeometry(0.07, 0.26, 6), mat.beak, [0.62, 0.11, 0], [0, 0, -Math.PI / 2]);
    b.add(boxGeo(0.32, 0.05, 0.24), mat.crow, [-0.46, 0.05, 0], [0, 0, 0.3]);
    [-1, 1].forEach(function (s) {
      b.add(geo.sphereLow, mat.crowEye, [0.47, 0.2, 0.11 * s], null, 0.062);
      b.add(geo.sphereLow, mat.dark, [0.515, 0.2, 0.125 * s], null, 0.032);
      b.add(boxGeo(0.12, 0.03, 0.05), mat.dark, [0.47, 0.27, 0.11 * s], [0, 0, -0.5]); // сердитые брови
    });
    b.build(body, { cast: true });
    var wing = function (side) {
      var pivot = new T.Group(), w = new T.Mesh(boxGeo(0.5, 0.04, 0.78), mat.crow);
      pivot.position.set(0, 0.12, side * 0.16);
      w.position.set(-0.06, 0, side * 0.39);
      w.castShadow = true;
      pivot.add(w);
      body.add(pivot);
      return pivot;
    };
    g.userData.wingA = wing(1);
    g.userData.wingB = wing(-1);
    g.scale.setScalar(1.25);
    return g;
  }

  // летучая мышь из простых фигур (если модели нет): большие уши, красные глазки, перепончатые крылья; летит волной
  function buildBat() {
    if (models.enemies) return flyerModel('bat');
    var g = new T.Group(), body = new T.Group(), b = new Bundle(), S = geo.sphere;
    g.add(body);
    b.add(S, mat.bat, [0, 0, 0], null, [0.24, 0.22, 0.2]);
    b.add(S, mat.bat, [0.22, 0.12, 0], null, 0.16);
    [-1, 1].forEach(function (s) {
      b.add(new T.ConeGeometry(0.07, 0.22, 5), mat.bat, [0.2, 0.32, 0.08 * s], [0.25 * s, 0, 0]);
      b.add(geo.sphereLow, mat.batEye, [0.36, 0.15, 0.065 * s], null, 0.035);
      b.add(new T.ConeGeometry(0.018, 0.06, 4), mat.white, [0.36, 0.04, 0.03 * s], [0, 0, Math.PI]);
    });
    b.build(body, { cast: true });
    var wing = function (side) {
      var pivot = new T.Group(), w = new T.Mesh(wingGeo(0.75, 0.42), mat.batWing);
      w.rotation.y = Math.PI / 2; // размах — поперёк полёта (вдоль ±Z), передняя кромка — по ходу (+X)
      if (side > 0) w.scale.x = -1;
      pivot.position.set(0, 0.06, side * 0.14);
      w.castShadow = true;
      pivot.add(w);
      body.add(pivot);
      return pivot;
    };
    g.userData.wingA = wing(1);
    g.userData.wingB = wing(-1);
    g.scale.setScalar(1.25);
    return g;
  }

  // летун летит вдоль X, но развёрнут на три четверти к камере — видно морду и взмахи крыльев
  function flyerYaw(dir) { return dir > 0 ? -0.5 : Math.PI + 0.5; }

  // летун пересекает дорогу прямо на траектории прыжка между рядами:
  // задел на подъёме — удар, на снижении — кот его сбивает (как монстры в Doodle Jump)
  // lead — ведущий летун пары: второй летит за ним выше и дальше, как раз на пути отскока после прыжка на первого
  function addFlyer(kind, a, b, lead) {
    codexSeen('foe', kind);
    var mesh = acquire(kind, kind === 'bat' ? buildBat : buildCrow), dir = lead ? lead.dir : gpick([-1, 1]);
    var pt = lead ? { y: lead.baseY + 1.4, z: lead.z - 2.2 } : arcPoint(a, b, grand(0.25, 0.75));
    mesh.rotation.set(0, flyerYaw(dir), 0);
    mesh.userData.yaw = mesh.rotation.y;
    var w = {
      kind: kind, x: lead ? lead.x - dir * 1.2 : grand(-3, 3), y: pt.y, baseY: pt.y, z: pt.z, dir: dir, mesh: mesh, dead: false, vy: 0, phase: grand(0, 6),
      speed: lead ? lead.speed : (kind === 'bat' ? grand(3.2, 4.4) : grand(2.2, 3.6)) * lerp(1, 1.4, difficulty(-b.z))
    };
    world.flyers.push(w);
    return w;
  }

  function updateFlyers(dt) {
    var lim = CONFIG.lanes.half + 0.3;
    world.flyers.forEach(function (w) {
      var m = w.mesh, ud = m.userData, bat = w.kind === 'bat';
      w.phase += dt;
      if (w.dead) {
        w.vy -= 22 * dt;
        w.y += w.vy * dt;
        m.rotation.z += dt * 8;
      } else {
        w.x += w.dir * w.speed * dt;
        if (w.x > lim) { w.x = lim; w.dir = -1; } else if (w.x < -lim) { w.x = -lim; w.dir = 1; }
        w.y = w.baseY + (bat ? Math.sin(w.phase * 3.2) * 0.7 : Math.sin(w.phase * 3) * 0.15);
        ud.yaw += (flyerYaw(w.dir) - ud.yaw) * smooth(8, dt);
        m.rotation.y = ud.yaw;
      }
      m.position.set(w.x, w.y, w.z);
      var flap = Math.sin(w.phase * (bat ? 24 : 14)) * (bat ? 0.9 : 1);
      ud.wingA.rotation.x = -flap;
      ud.wingB.rotation.x = flap;
    });
  }

  function defeatFlyer(w, coins) {
    w.dead = true;
    w.vy = 3;
    var won = addCoins(coins);
    track('flyer');
    sparkle(w.x, w.y, w.z, [1, 0.86, 0.35], 14, 3.5);
    chips(w.x, w.y, w.z, w.kind === 'bat' ? [0.3, 0.22, 0.4] : [0.2, 0.17, 0.26], 10);
    if (w.kind === 'bat') Sound.squeak();
    Sound.stomp();
    vibrate(25);
    return won;
  }

  // Пёс-охранник из модели (мем «no vibecode today», _not_main/blender/dog.py): пухлый рыжий сиба смотрит
  // навстречу коту (+Z), в правой лапе нож, в левой круглый щит. Части — в группы-шарниры, нож — в «запястье»
  // правой лапы (рубит, а не тычет). Шерсть оболочками — на голове и теле; тень — от крупных частей
  // Часть модели (пёс, враги) — в новую группу-шарнир в точке (x, y, z) родителя: копия части (геометрия
  // и материалы общие с моделью), материалы по имени подменяются игровыми (swap); тень отбрасывают только
  // материалы из shade — мелочь (глаза, металл) нет. Возвращает группу; меши — в userData.meshes
  function attach(parent, src, x, y, z, swap, shade) {
    var grp = new T.Group(), o = src.clone(), meshes = [], lit = [];
    grp.position.set(x, y, z);
    grp.add(o);
    parent.add(grp);
    o.traverse(function (m) {
      if (!m.isMesh) return;
      var name = m.material.name;
      m.material = swap[name] || m.material;
      m.castShadow = !!shade[name];
      m.userData.part = name;
      meshes.push(m);
      lit.push(m.material);
    });
    collectLit(lit);
    grp.userData.meshes = meshes;
    return grp;
  }

  function dogModel() {
    var D = models.dog, g = new T.Group(), body = new T.Group();
    var swap = { blade: mat.metal }, shade = { fur: 1, plain: 1 }; // металл — игровой; тень — от шерсти и лап со щитом
    g.add(body);
    var torso = attach(body, D.body, 0, 0, 0, swap, shade), head = attach(body, D.head, 0, 1.1, 0.02, swap, shade);
    var armR = attach(body, D.armR, 0.36, 0.82, 0, swap, shade), armL = attach(body, D.armL, -0.36, 0.82, 0, swap, shade);
    var knife = attach(armR, D.knife, 0.14, -0.26, 0.3, swap, shade);
    var shells = [];
    torso.userData.meshes.concat(head.userData.meshes).forEach(function (m) { if (m.userData.part === 'fur') shells.push(addFur(m, 7, 0.024)); });
    g.userData = { body: body, head: head, armR: armR, armL: armL, knife: knife, shells: shells };
    g.scale.setScalar(1.25);
    return g;
  }

  // пёс-рыцарь из простых фигур (если модель не загрузилась): в правой лапе булава, в левой щит
  function buildDog() {
    if (models.dog) return dogModel();
    var g = new T.Group(), body = new T.Group(), b = new Bundle(), S = geo.sphere;
    g.add(body);
    b.add(S, mat.metal, [0, 0.62, 0], null, [0.34, 0.36, 0.28]);
    b.add(boxGeo(0.34, 0.44, 0.04), mat.tabard, [0, 0.52, 0.27]);
    b.add(new T.CylinderGeometry(0.29, 0.33, 0.17, 18), mat.steel, [0, 0.37, 0]);
    b.add(new T.TorusGeometry(0.3, 0.035, 8, 26), mat.leather, [0, 0.45, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
    [-1, 1].forEach(function (s) {
      b.add(new T.CylinderGeometry(0.09, 0.08, 0.24, 10), mat.steel, [0.13 * s, 0.2, 0]);
      b.add(S, mat.leather, [0.13 * s, 0.07, 0.04], null, [0.1, 0.08, 0.15]);
    });
    b.build(body, { cast: true });

    var head = new T.Group(), hb = new Bundle();
    head.position.set(0, 1.1, 0.02);
    hb.add(S, mat.dogFur, [0, 0, 0], null, [0.36, 0.34, 0.34]);
    hb.add(S, mat.dogLight, [0, -0.08, 0.28], null, [0.2, 0.15, 0.2]);
    hb.add(S, mat.nose, [0, -0.02, 0.47], null, [0.07, 0.055, 0.05]);
    hb.add(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.metal, [0, 0.06, -0.01], null, [0.39, 0.32, 0.38]); // шлем
    hb.add(boxGeo(0.07, 0.24, 0.34), mat.shield, [0, 0.42, -0.04]); // плюмаж
    [-1, 1].forEach(function (s) {
      hb.add(S, mat.dogEar, [0.34 * s, -0.1, 0], [0, 0, 0.25 * s], [0.09, 0.26, 0.15]);
      hb.add(geo.sphereLow, mat.white, [0.12 * s, 0.06, 0.3], null, [0.06, 0.07, 0.04]);
      hb.add(geo.sphereLow, mat.eye, [0.12 * s, 0.05, 0.335], null, 0.034);
      hb.add(boxGeo(0.14, 0.035, 0.04), mat.dogEar, [0.12 * s, 0.15, 0.32], [0, 0, 0.35 * s]);
      hb.add(boxGeo(0.035, 0.05, 0.03), mat.white, [0.05 * s, -0.17, 0.4]);
    });
    hb.build(head, { cast: true });
    body.add(head);

    var arm = function (side) {
      var p = new T.Group(), ab = new Bundle();
      p.position.set(0.36 * side, 0.82, 0);
      ab.add(S, mat.metal, [0.03 * side, 0.02, 0], null, [0.16, 0.13, 0.16]);
      ab.add(new T.CylinderGeometry(0.075, 0.068, 0.3, 10), mat.steel, [0, -0.17, 0]);
      ab.add(S, mat.steel, [0, -0.34, 0], null, 0.09);
      ab.build(p, { cast: true });
      body.add(p);
      return p;
    };
    var armR = arm(1), armL = arm(-1);
    var mace = new Bundle();
    mace.add(new T.CylinderGeometry(0.035, 0.045, 0.7, 6), mat.bark, [0, -0.62, 0]);
    mace.add(geo.ico, mat.iron, [0, -1.02, 0], null, 0.17);
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      mace.add(geo.spike, mat.steel, [Math.cos(a) * 0.17, -1.02, Math.sin(a) * 0.17], [Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57], 0.6);
    }
    mace.build(armR, { cast: true });
    var shield = new Bundle();
    shield.add(new T.CylinderGeometry(0.3, 0.3, 0.06, 18), mat.shield, [-0.06, -0.26, 0.2], [Math.PI / 2, 0, 0]);
    shield.add(new T.TorusGeometry(0.3, 0.03, 6, 22), mat.gold, [-0.06, -0.26, 0.23]);
    shield.add(geo.sphereLow, mat.gold, [-0.06, -0.26, 0.25], null, 0.06);
    shield.build(armL, { cast: true });

    g.userData = { body: body, head: head, armR: armR, armL: armL };
    g.scale.setScalar(1.25);
    return g;
  }

  function addDog(p) {
    codexSeen('foe', 'dog');
    var mesh = acquire('dog', buildDog);
    mesh.rotation.set(0, 0, 0);
    p.dog = { p: p, mesh: mesh, state: 'idle', t: rand(0, 6), swing: 0, down: false, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0 };
  }

  function updateDog(dog, dt) {
    var m = dog.mesh, ud = m.userData, p = dog.p;
    dog.t += dt;
    if (ud.shells) { // мех вдали не различить — оболочки только у ближних псов (их по 7 на шерсть: дорого)
      var nearDog = camera.position.z - m.position.z < 26;
      if (ud.furOn !== nearDog) {
        ud.furOn = nearDog;
        ud.shells.forEach(function (sh) { sh.visible = nearDog; });
      }
    }
    if (dog.down) { // отлетел от удара мечом
      dog.vy -= 20 * dt;
      dog.x += dog.vx * dt;
      dog.y += dog.vy * dt;
      dog.z += dog.vz * dt;
      m.position.set(dog.x, dog.y, dog.z);
      m.rotation.x -= dt * 7;
      m.rotation.z += dt * 3;
      if (dog.y < p.y - 25) m.visible = false;
      return;
    }
    m.position.set(p.x, p.ry, p.z);
    var near = (player.target === p.row || p.row.road && player.move === 'run' && player.z - p.z < 9 && player.z > p.z) && Math.abs(player.x - p.x) < 1.9 && state === 'play';
    if (dog.state === 'idle' && near) {
      dog.state = 'alert';
      Sound.bark();
      if (!tips.dog) {
        tips.dog = true;
        showHint(tr(IS_TOUCH ? 'hint.sword.touch' : 'hint.sword.keys'));
      }
    } else if (dog.state === 'alert' && !near) {
      dog.state = 'idle';
    }
    if (dog.state === 'strike') {
      dog.swing += dt / 0.22;
      if (dog.swing > 1.8) dog.state = 'idle';
    }
    var strike = dog.state === 'strike', alert = dog.state === 'alert', k = easeOut(Math.min(1, dog.swing)), raise;
    if (ud.knife) { // нож: замах — лапа над плечом, нож остриём вверх (коту видно); удар — рубит вниз, к коту; щит при коте выше
      raise = strike ? lerp(-2.2, 0.6, k) : alert ? -2.2 + Math.sin(dog.t * 18) * 0.05 : Math.sin(dog.t * 2) * 0.08;
      var wrist = strike ? lerp(1.8, 1.4, k) : alert ? 1.8 : 0;
      ud.knife.rotation.x += (wrist - ud.knife.rotation.x) * (strike ? 1 : smooth(10, dt));
      ud.armL.rotation.set(alert ? -0.25 : -0.05, 0, 0);
    } else { // булава: замах за голову, удар сверху вниз
      raise = strike ? lerp(2.6, -1.3, k) : alert ? 2.5 + Math.sin(dog.t * 18) * 0.06 : 0.3 + Math.sin(dog.t * 2) * 0.1;
      ud.armL.rotation.set(-0.4, 0, 0.2);
    }
    ud.armR.rotation.x += (raise - ud.armR.rotation.x) * (strike ? 1 : smooth(10, dt));
    ud.body.position.y = Math.abs(Math.sin(dog.t * 3)) * 0.04;
    ud.body.rotation.x = dog.state === 'alert' ? -0.12 : 0;
    ud.head.rotation.y = dog.state === 'idle' ? Math.sin(dog.t * 0.8) * 0.4 : (player.x - p.x) * 0.15;
  }

  function dogStrike(dog) {
    dog.state = 'strike';
    dog.swing = 0;
  }

  function defeatDog(dog) {
    dog.down = true;
    track('dog');
    dog.x = dog.p.x;
    dog.y = dog.p.y;
    dog.z = dog.p.z;
    dog.vx = (dog.p.x - player.x >= 0 ? 1 : -1) * rand(2, 4);
    dog.vy = 7;
    dog.vz = -5;
    var won = addCoins(5);
    sparkle(dog.x, dog.y + 1.2, dog.z, [1, 0.9, 0.5], 22, 4.5);
    chips(dog.x, dog.y + 1, dog.z, [0.85, 0.87, 0.9], 10);
    Sound.clang();
    vibrate(30);
    toast(tr('dog.down', { n: won }));
  }

  // Дракон: висит впереди над дорогой и плюётся огненными шарами. skin — окраска: дракончик зелёный,
  // Пламенный дракон (босс) — багровый. У пасти — сгусток огня: разгорается перед плевком (это предупреждение)
  function buildDragon(skin) {
    var K = skin || { body: mat.dragon, belly: mat.dragonBelly, wing: mat.dragonWing };
    if (models.enemies) return dragonModel(K);
    var g = new T.Group(), body = new T.Group(), b = new Bundle(), S = geo.sphere, i;
    g.add(body);
    b.add(S, K.body, [0, 0, 0], null, [0.45, 0.42, 0.62]);
    b.add(S, K.belly, [0, -0.13, 0.2], null, [0.32, 0.3, 0.45]);
    b.add(S, K.body, [0, 0.42, 0.62], null, [0.32, 0.3, 0.34]);
    b.add(S, K.body, [0, 0.35, 0.92], null, [0.2, 0.15, 0.2]);
    [-1, 1].forEach(function (s) {
      b.add(geo.sphereLow, mat.dark, [0.07 * s, 0.4, 1.09], null, 0.025);
      b.add(geo.sphereLow, mat.dragonEye, [0.17 * s, 0.52, 0.85], null, 0.075);
      b.add(geo.sphereLow, mat.eye, [0.18 * s, 0.52, 0.915], null, 0.036);
      b.add(new T.ConeGeometry(0.06, 0.3, 6), mat.horn, [0.15 * s, 0.74, 0.5], [-0.6, 0, -0.25 * s]);
      b.add(geo.sphereLow, K.body, [0.25 * s, -0.36, 0.25], null, [0.1, 0.14, 0.12]);
    });
    for (i = 0; i < 4; i++) b.add(new T.ConeGeometry(0.05, 0.18, 5), mat.horn, [0, 0.4 - i * 0.04, 0.25 - i * 0.28], [-0.5, 0, 0]);
    for (i = 0; i < 6; i++) b.add(S, K.body, [0, -0.05 + i * 0.03, -0.6 - i * 0.22], null, 0.2 - i * 0.025);
    b.add(new T.ConeGeometry(0.14, 0.26, 4), K.wing, [0, 0.12, -1.98], [-Math.PI / 2, 0, 0], [1, 1, 0.35]);
    if (K.crown) for (i = 0; i < 5; i++) { // у босса — золотая корона из зубцов
      var a = (i - 2) * 0.42;
      b.add(new T.ConeGeometry(0.055, 0.2, 5), mat.gold, [Math.sin(a) * 0.2, 0.72 + Math.cos(a) * 0.02, 0.6 - Math.abs(a) * 0.05], [-0.25, 0, -a * 0.6]);
    }
    b.build(body, { cast: true });
    var wing = function (side) {
      var pivot = new T.Group(), w = new T.Mesh(wingGeo(1.5, 0.9), K.wing);
      if (side < 0) w.scale.x = -1;
      pivot.position.set(0.28 * side, 0.32, 0.05);
      w.castShadow = true;
      pivot.add(w);
      body.add(pivot);
      return pivot;
    };
    var charge = new T.Sprite(mat.fireGlow);
    charge.position.set(0, 0.32, 1.18);
    charge.scale.set(0.001, 0.001, 1);
    body.add(charge);
    g.userData = { body: body, wingL: wing(-1), wingR: wing(1), charge: charge };
    g.scale.setScalar(1.3);
    return g;
  }

  // дракон из модели (enemies.py): чешуя, брюхо и перепонки — материалы окраски K (от них и белая вспышка
  // попадания), рога и когти — игровые; корона — только у босса. Крылья на шарнирах у плеч машут буквой V
  function dragonModel(K) {
    var E = models.enemies.dragon, g = new T.Group(), body = new T.Group();
    var swap = { scale: K.body, belly: K.belly, membrane: K.wing, horn: mat.horn, glow: mat.eyeGlow, gold: mat.gold };
    var shade = { scale: 1, belly: 1, membrane: 1, horn: 1, gold: 1 };
    g.add(body);
    attach(body, E.body, 0, 0, 0, swap, shade);
    if (K.crown) attach(body, E.crown, 0, 0, 0, swap, shade);
    var charge = new T.Sprite(mat.fireGlow);
    charge.position.set(0, 0.32, 1.2);
    charge.scale.set(0.001, 0.001, 1);
    body.add(charge);
    g.userData = { body: body, wingL: attach(body, E.wingL, -0.28, 0.32, 0.05, swap, shade), wingR: attach(body, E.wingR, 0.28, 0.32, 0.05, swap, shade), charge: charge };
    g.scale.setScalar(1.3);
    return g;
  }

  function buildBoss() {
    var g = buildDragon({ body: mat.boss, belly: mat.bossBelly, wing: mat.bossWing, crown: true });
    g.scale.setScalar(2.4);
    return g;
  }

  function buildFireball() {
    var g = new T.Group(), core = new T.Mesh(geo.sphereLow, mat.fireball), halo = new T.Sprite(mat.fireGlow);
    core.scale.setScalar(0.3);
    halo.scale.set(1.9, 1.9, 1);
    g.add(core);
    g.add(halo);
    g.userData = { core: core, halo: halo };
    return g;
  }

  function spawnDragon() {
    codexSeen('foe', 'drake');
    world.dragon = { mesh: acquire('dragon', buildDragon), scale: 1.3, x: pickOf([-1, 1]) * 14, tx: 0, y: cam.y + 6, z: player.z - 24, state: 'enter', t: 0, shots: 3, cool: 0.9, mouth: 0, flash: 0 };
    world.dragonAt = null;
    Sound.roar(false);
    if (!tips.dragon) {
      tips.dragon = true;
      toast(tr('dragonling.come'));
    }
  }

  function nearestLane(x) {
    var L = CONFIG.lanes.x, best = L[0];
    L.forEach(function (lx) { if (Math.abs(lx - x) < Math.abs(best - x)) best = lx; });
    return best;
  }

  // взмахи крыльев, клевок при плевке, сгусток огня у пасти (charge 0…1) и белая вспышка от попадания
  function poseDragon(D, dt, sway, beat, charge) {
    var m = D.mesh, ud = m.userData;
    D.mouth = Math.max(0, D.mouth - dt);
    m.position.set(D.x, D.y, D.z);
    m.rotation.set(D.mouth > 0 ? 0.3 : -0.05, 0, sway); // морда — к коту, при плевке клюёт вниз
    var flap = 0.55 + Math.sin(D.t * beat) * 0.45; // крылья подняты буквой V — так их видно с камеры позади кота
    ud.wingL.rotation.z = -flap;
    ud.wingR.rotation.z = flap;
    var c = charge > 0 ? 0.35 + charge * 1.5 + Math.sin(D.t * 40) * 0.08 * charge : 0.001;
    ud.charge.scale.set(c, c, 1);
  }

  function updateDragon(dt) {
    var D = world.dragon;
    if (!D) return;
    D.t += dt;
    D.flash = Math.max(0, D.flash - dt);
    mat.dragon.emissiveIntensity = D.flash * 2.4;
    D.z += (player.z - 22 - D.z) * smooth(3, dt);
    if (D.state === 'leave') {
      D.x += (D.x >= 0 ? 1 : -1) * 11 * dt;
      D.y += 5 * dt;
      if (Math.abs(D.x) > 22) {
        release(D.mesh);
        world.dragon = null;
        mat.dragon.emissiveIntensity = 0;
        return;
      }
    } else {
      D.y += (cam.y + 4.4 + Math.sin(D.t * 2) * 0.4 - D.y) * smooth(2, dt);
      D.x += (D.tx - D.x) * smooth(D.state === 'enter' ? 2.2 : 3, dt);
      if (D.state === 'enter') {
        D.tx = nearestLane(player.x);
        if (Math.abs(D.x - D.tx) < 0.4) D.state = 'hover';
      } else if ((D.cool -= dt) <= 0) {
        if (D.shots-- > 0) {
          shootFireball(D);
          D.cool = 1.5;
          D.tx = nearestLane(player.x);
        } else {
          D.state = 'leave';
        }
      }
    }
    poseDragon(D, dt, Math.sin(D.t * 1.6) * 0.12, 9, D.state === 'hover' && D.cool < 0.45 && D.shots > 0 ? 1 - D.cool / 0.45 : 0);
  }

  // огненный шар летит к коту (+Z) и подруливает к точке прицела (по умолчанию — колонка кота); owner — чей он
  function shootFireball(D, tx, ty) {
    var mesh = acquire('fireball', buildFireball), ud = mesh.userData, look = shotLook(D.shot || 'fire');
    ud.core.material = look.core;
    ud.halo.material = look.halo;
    var hand = D.kind && D.kind !== 'dragon' ? 1.6 : 0.3; // не дракон бросает из поднятой руки
    world.fireballs.push({
      mesh: mesh, x: D.x, y: D.y + hand * D.scale, z: D.z + 1.2 * D.scale, done: false, owner: D, back: false, perfect: false, trail: look.trail,
      tx: tx == null ? player.x : tx, ty: ty == null ? player.ground + 1.9 : ty
    });
    D.mouth = 0.4;
    Sound.fireball();
  }

  function dragonHere(D) {
    return !!D && (D === world.dragon || D === world.boss) && D.state !== 'leave' && D.state !== 'down';
  }

  function updateFireballs(dt) {
    world.fireballs.forEach(function (f) {
      if (f.back) { // отбит мечом: летит прямо в своего дракона
        var D = f.owner;
        if (dragonHere(D)) {
          var dx = D.x - f.x, dy = D.y + 0.2 * D.scale - f.y, dz = D.z - f.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, v = CONFIG.parry.speed * dt;
          if (!f.done && d < 0.8 * D.scale) {
            f.done = true;
            dragonHit(D, f.perfect ? 2 : 1, f);
          } else {
            f.x += dx / d * Math.min(v, d);
            f.y += dy / d * Math.min(v, d);
            f.z += dz / d * Math.min(v, d);
          }
        } else { // дракон улетел — шар уходит в небо
          f.z -= CONFIG.parry.speed * dt;
          f.y += 4 * dt;
          if (f.z < player.z - 60) f.done = true;
        }
      } else {
        f.z += 15 * dt;
        f.x += (f.tx - f.x) * smooth(2.2, dt);
        f.y += (f.ty - f.y) * smooth(2.6, dt);
      }
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.visible = !f.done;
      if (!f.done && Math.random() < 0.8) {
        var trail = { x: f.x + rand(-0.15, 0.15), y: f.y + rand(-0.15, 0.15), z: f.z + (f.back ? 0.2 : -0.2), vx: rand(-0.4, 0.4), vy: rand(0.4, 1.2), vz: f.back ? 2 : -2, grav: -1, drag: 2, life: rand(0.3, 0.5), size: rand(0.6, 0.9), grow: 0.8, c: [0.55, rand(0.8, 0.95), 1], a: 0.85 };
        if (f.back) fxGlow.emit(trail); // отбитый — голубой
        else if (f.trail) { trail.c = f.trail; fxGlow.emit(trail); } // лёд, призрак, нож — свой цвет
        else { trail.c = [1, 1, 1]; trail.fire = true; fxFire.emit(trail); }
      }
    });
  }

  function popFireball(f, reward) {
    f.done = true;
    sparkle(f.x, f.y, f.z, [1, 0.6, 0.2], 16, 3.5);
    if (reward) {
      addCoins(1);
      Sound.clang();
    }
  }

  // Отбить шар мечом: если его дракон ещё здесь, шар летит обратно и ранит его. Отбил вплотную к коту —
  // «Идеально!», двойной урон и мир замирает чуть дольше. Дракона уже нет — шар просто разбит (+1 монета)
  function parryFireball(f, dist) {
    swordHit(f.x, f.y, f.z);
    if (!dragonHere(f.owner)) {
      popFireball(f, true);
      return;
    }
    f.back = true;
    f.perfect = dist < CONFIG.parry.perfect;
    f.mesh.userData.core.material = mat.fireballBack;
    f.mesh.userData.halo.material = mat.fireGlowBack;
    sparkle(f.x, f.y, f.z, [0.6, 0.85, 1], 14, 4);
    if (f.perfect) {
      hitStop = 0.12;
      popText(tr('parry.perfect'), tr('parry.perfect.sub'), true);
    } else {
      popText(tr('parry.ok'), '', false);
    }
    Sound.parry(f.perfect);
    note(f.perfect ? 'parryPerfect' : 'parry');
    track('parry');
  }

  // отбитый шар попал в дракона: вспышка и искры; дракончику хватит одного — сбегает, оставив монеты
  function dragonHit(D, dmg, f) {
    D.flash = 0.3;
    sparkle(f.x, f.y, f.z, [0.7, 0.9, 1], 26, 6);
    fxGlow.emit({ x: f.x, y: f.y, z: f.z, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 0.22, size: 2.2 * D.scale, grow: 0.5, c: [1, 0.9, 0.7], a: 1 });
    Sound.dragonHit();
    if (D === world.boss) {
      bossDamage(dmg);
      return;
    }
    var won = addCoins(8 * dmg);
    D.state = 'leave';
    popText(tr('dragonling.flee'), '+' + coinsWord(won), true);
    note('dragonFled');
  }



  /* ---------- Боссы миров ---------- */

  // У каждого мира свой босс: снаряды (shot — их отбивают мечом), атака по колонке (lane: scorch — горит,
  // frost — ледяные шипы, spikes — стальные шипы, vanish — острова колонки исчезают) и поза. В забеге босс —
  // по биому участка, в походе — у седьмого уровня мира. Дракон и призрак летают (fly — высота над камерой), остальные стоят на парящей скале
  var BOSSES = {
    dragon: { name: 'boss.dragon', shot: 'fire', lane: 'scorch', fly: 3, hp: 6 },
    dog: { name: 'boss.dog', shot: 'knife', lane: 'spikes', hp: 5 },
    golem: { name: 'boss.golem', shot: 'ice', lane: 'frost', hp: 6 },
    lava: { name: 'boss.lava', shot: 'fire', lane: 'scorch', hp: 6 },
    ghost: { name: 'boss.ghost', shot: 'ghost', lane: 'vanish', fly: 2.3, hp: 6 }
  };
  var BIOME_BOSS = { sky: 'dog', ice: 'golem', fire: 'lava', ghost: 'ghost', citadel: 'dragon' };

  // снаряды: ядро, ореол, цвет следа (fire — клубы огня)
  var SHOTS = {};
  function shotLook(kind) {
    if (!SHOTS.fire) {
      SHOTS.fire = { core: mat.fireball, halo: mat.fireGlow, trail: null };
      SHOTS.ice = { core: new T.MeshBasicMaterial({ color: '#e8f8ff' }), halo: glowSprite('#5fc8ff', 0.95), trail: [0.6, 0.85, 1] };
      SHOTS.ghost = { core: new T.MeshBasicMaterial({ color: '#efe2ff' }), halo: glowSprite('#9a5cff', 0.95), trail: [0.65, 0.45, 1] };
      SHOTS.knife = { core: new T.MeshBasicMaterial({ color: '#f2f4f8' }), halo: glowSprite('#ffffff', 0.6), trail: [0.9, 0.92, 1] };
    }
    return SHOTS[kind];
  }

  function bossKindFor(dist) {
    if (mode === 'level') return level.def.boss === true ? 'dragon' : level.def.boss;
    return BIOME_BOSS[biomeAt(dist)] || 'dragon';
  }

  // парящая скала под боссом, который не летает: без ёлок и цветов (проросли бы сквозь босса); top — материал макушки.
  // Невысокая: босс держится над дорогой (bossClear), высокая скала подняла бы его под самый верх экрана
  function bossRock(g, s, top) {
    var b = new Bundle();
    g.userData.rockR = s * 1.4; // радиус макушки — по нему босс держится над плитами и помостами
    b.add(rockGeo(s * 1.4, 0.05, s * 1.15, 7, 0.45, 301), mat.rock, [0, -s * 0.575 - 0.12, 0]);
    b.add(new T.CylinderGeometry(s * 1.36, s * 1.4, 0.22, 7), top || mat.grass, [0, -0.13, 0]);
    b.build(g, { cast: true });
  }

  // голем: skin — 'ice' (голубой камень, светятся кристаллы) или 'lava' (базальт, светятся трещины)
  function buildGolem(skin) {
    var E = models.enemies && models.enemies.golem, g = new T.Group(), body = new T.Group();
    var K = skin === 'lava' ? { rock: mat.golemLava, glow: mat.lavaGlow } : { rock: mat.golemIce, glow: mat.iceGlow };
    g.add(body);
    if (E) {
      var swap = { rockskin: K.rock, glowskin: K.glow }, shade = { rockskin: 1 };
      attach(body, E.body, 0, 0, 0, swap, shade);
      g.userData.armL = attach(body, E.armL, -1.0, 1.4, 0, swap, shade);
      g.userData.armR = attach(body, E.armR, 1.0, 1.4, 0, swap, shade);
    } else {
      new Bundle().add(geo.sphere, K.rock, [0, 1, 0], null, [0.95, 0.9, 0.75]).build(body, { cast: true });
      g.userData.armL = g.userData.armR = new T.Group();
    }
    bossRock(g, 0.9, skin === 'lava' ? mat.basalt : mat.ice);
    g.userData.body = body;
    g.userData.flash = [K.rock];
    g.scale.setScalar(1.7);
    return g;
  }

  function buildGhostKnight() {
    var E = models.enemies && models.enemies.ghost, g = new T.Group(), body = new T.Group();
    g.add(body);
    if (E) {
      var swap = { spectral: mat.ghostArmor, glowskin: mat.ghostGlow, cloak: mat.ghostCloak, gold: mat.gold }, shade = {};
      attach(body, E.body, 0, 0, 0, swap, shade);
      g.userData.armR = attach(body, E.armR, 0.6, 1.3, 0.1, swap, shade);
    } else {
      new Bundle().add(geo.sphere, mat.ghostArmor, [0, 1, 0], null, [0.6, 0.9, 0.45]).build(body);
      g.userData.armR = new T.Group();
    }
    g.userData.body = body;
    g.userData.flash = [mat.ghostArmor];
    g.scale.setScalar(1.9);
    return g;
  }

  // пёс-воевода: пёс-охранник в полтора роста больше, с золотой короной и на скале
  function buildDogLord() {
    var g = new T.Group(), dog = buildDog(), crown = new Bundle();
    for (var i = 0; i < 5; i++) {
      var a = (i - 2) * 0.5;
      crown.add(new T.ConeGeometry(0.06, 0.24, 5), mat.gold, [Math.sin(a) * 0.32, 1.52, 0.03 + Math.cos(a) * 0.1]);
    }
    crown.add(new T.TorusGeometry(0.3, 0.04, 6, 18), mat.gold, [0, 1.42, 0.02], [Math.PI / 2, 0, 0]);
    crown.build(dog.userData.body, { cast: true });
    dog.scale.setScalar(1);
    g.add(dog);
    g.userData = dog.userData;
    bossRock(g, 0.8);
    g.userData.flash = [];
    g.scale.setScalar(2.3);
    return g;
  }

  function buildBossOf(kind) {
    if (kind === 'golem') return buildGolem('ice');
    if (kind === 'lava') return buildGolem('lava');
    if (kind === 'ghost') return buildGhostKnight();
    if (kind === 'dog') return buildDogLord();
    return buildBoss();
  }

  // поза босса: сгусток заряда у пасти — только у дракона; остальные заносят руку (charge 0…1)
  function poseBoss(D, dt) {
    if (D.kind === 'dragon') return poseDragon(D, dt, Math.sin(D.t * 1.2) * 0.1, 6, D.act ? D.act.charge : 0);
    var m = D.mesh, ud = m.userData, ch = D.act ? D.act.charge : 0;
    D.mouth = Math.max(0, D.mouth - dt);
    m.position.set(D.x, D.y, D.z);
    m.rotation.set(0, Math.sin(D.t * 0.7) * 0.12, D.kind === 'ghost' ? Math.sin(D.t * 1.3) * 0.08 : 0);
    if (ud.body) ud.body.position.y = D.kind === 'ghost' ? Math.sin(D.t * 2) * 0.12 : Math.abs(Math.sin(D.t * 2.2)) * 0.05;
    var throwK = D.mouth > 0 ? D.mouth / 0.4 : 0;
    if (ud.armR) ud.armR.rotation.x = -ch * 2.2 + throwK * 1.6; // замах — рука назад и вверх, бросок — вперёд
    if (ud.armL && D.kind !== 'dog') ud.armL.rotation.x = Math.sin(D.t * 1.5) * 0.15 - ch * 0.4;
  }

  // острова колонки под атакой: искрят (предупреждение), потом действуют; вид — по атаке босса
  var LANE_FX = {
    scorch: { warn: [1, 0.16, 0.05], hurt: 'fire' },
    frost: { warn: [0.55, 0.85, 1], hurt: 'frost' },
    spikes: { warn: [1, 0.85, 0.5], hurt: 'spike' },
    vanish: { warn: [0.7, 0.45, 1], hurt: null } // острова исчезают — кот проваливается
  };


  /* ---------- Пламенный дракон — босс ---------- */

  // Прилетает и кружит над дорогой впереди, атакует по очереди: залп в колонку кота, веер в три колонки,
  // огонь вдоль колонки — её острова впереди горят, приземляться туда нельзя. Перед каждой атакой —
  // предупреждение: разгорается сгусток у пасти, колонка под огнём искрит красным. Ранить его можно только
  // отбитым огнём; на половине здоровья он злится — атаки чаще, веер без просвета
  function bossFight() { return !!world.boss && world.boss.state !== 'down'; } // бой идёт — и после конца участка арены

  function inArena(dist) { // участок дороги вокруг босса: без ловушек, ездящих островов и летунов
    var B = CONFIG.boss, from = B.first - 20;
    if (dist < from) return false;
    return (dist - from) % B.every < B.arena + 20;
  }

  function spawnBoss() {
    var B = CONFIG.boss, kind = bossKindFor(-player.z), def = BOSSES[kind];
    codexSeen('boss', kind);
    var mesh = acquire('boss_' + kind, function () { return buildBossOf(kind); }), foot = bossFoot(mesh);
    world.boss = {
      kind: kind, def: def, shot: def.shot, lane: def.lane, mesh: mesh, scale: mesh.scale.x, x: pickOf([-1, 1]) * 18, tx: 0,
      y: cam.y + (def.fly ? 10 : 1), z: player.z - 30, state: 'enter', t: 0, life: mode === 'level' ? Infinity : B.time,
      hp: def.hp, act: null, cool: 0.8, n: 0, mouth: 0, flash: 0, vy: 0, foot: foot.y, footR: foot.r
    };
    world.bossAt += B.every;
    el.bossName.textContent = tr(def.name);
    el.game.classList.add('is-boss');
    cam.shake = 0.45;
    vibrate(80);
    Sound.roar(true);
    Sound.boss(true);
    toast(tr('boss.come', { name: tr(def.name) }), 2800);
    note('boss');
  }

  // низ босса (скалы или тела) от его точки и радиус опоры — по габариту модели в покое, один раз на модель
  function bossFoot(mesh) {
    var ud = mesh.userData;
    if (ud.foot == null) {
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.updateMatrixWorld(true);
      var bb = new T.Box3().setFromObject(mesh);
      ud.foot = bb.min.y;
      ud.footR = ud.rockR ? ud.rockR * mesh.scale.x : Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    }
    return { y: ud.foot, r: ud.footR };
  }

  // высота, ниже которой босс уходил бы в дорогу: верх плит и помостов под его опорой — с запасом вперёд по ходу
  // (ряды едут к нему, а в «Прыжках» каждый следующий выше) — плюс глубина его низа
  function bossClear(D) {
    var top = -Infinity, X = CONFIG.lanes.x;
    world.rows.forEach(function (row) {
      var dz = row.z - D.z;
      if (dz > D.footR + 1.5 || dz < -D.footR - 16) return; // впереди — с запасом ~1,3 с хода: поднимается заранее и плавно
      row.plats.forEach(function (p) {
        if (Math.abs(p.x - D.x) < D.footR + p.w / 2) top = Math.max(top, p.y + (p.crate ? CONFIG.platform.crate : 0));
      });
      if (row.upper && Math.abs(X[row.upper.lane] - D.x) < D.footR + 1.2) top = Math.max(top, row.y + Math.max(row.upper.h0, row.upper.h1) + 0.6); // с парапетом
    });
    return top - D.foot + 0.25;
  }

  // вспышка от попадания: дракон — своим материалом, остальные — материалами из userData.flash
  function bossFlash(D) {
    var k = D.flash * 2.4 * flashK();
    if (D.kind === 'dragon') mat.boss.emissiveIntensity = k;
    (D.mesh.userData.flash || []).forEach(function (m) {
      if (m.userData.baseE == null) m.userData.baseE = m.emissiveIntensity;
      m.emissiveIntensity = m.userData.baseE + k;
    });
  }

  function updateBoss(dt) {
    var D = world.boss;
    if (!D) return;
    D.t += dt;
    D.flash = Math.max(0, D.flash - dt);
    bossFlash(D);
    if (D.state === 'down') { // повержен: кувыркается, дымит и падает в облака — в сторону от дороги, не сквозь неё
      D.vy -= 10 * dt;
      D.y += D.vy * dt;
      D.x += (D.x >= 0 ? 1 : -1) * 11 * dt;
      D.mesh.rotation.x += dt * 2.4;
      D.mesh.rotation.z += dt * 1.5;
      D.mesh.position.set(D.x, D.y, D.z);
      if (Math.random() < dt * 25) fxDust.emit({ x: D.x + rand(-1, 1), y: D.y + rand(-0.5, 1), z: D.z + rand(-1, 1), vx: rand(-0.5, 0.5), vy: rand(0.5, 1.5), vz: rand(-0.5, 0.5), grav: -0.5, drag: 1.5, life: rand(0.8, 1.3), size: rand(1.2, 2), grow: 1.5, c: [0.35, 0.33, 0.33], a: 0.6 });
      if (D.y < cam.y - 30) endBoss();
      return;
    }
    D.z += (player.z - 23 - D.z) * smooth(3, dt);
    if (D.state === 'leave') {
      D.x += (D.x >= 0 ? 1 : -1) * 12 * dt;
      D.y += 6 * dt;
      if (Math.abs(D.x) > 30) endBoss();
    } else {
      var ty = cam.y + (D.def.fly ? D.def.fly + Math.sin(D.t * 1.6) * 0.5 : 2.2), clear = bossClear(D); // ниже полос интерфейса; не летающий — на своей скале
      ty = Math.max(ty, clear); // над плитами и помостами под ним — в «Прыжках» ряды впереди выше
      D.vy += ((ty - D.y) * 9 - D.vy * 5.5) * dt; // пружина с затуханием: без рывков и подтяжек
      D.y += D.vy * dt;
      D.x += (D.tx - D.x) * smooth(D.state === 'enter' ? 1.6 : 2.6, dt);
      if (D.state === 'enter') {
        D.tx = 0;
        if (Math.abs(D.x) < 0.8) D.state = 'fight';
      } else if ((D.life -= dt) <= 0) {
        bossLeave();
      } else {
        bossAct(D, dt);
      }
    }
    poseBoss(D, dt);
  }

  // очередная атака: залп, веер или огонь по колонке; первая — всегда залп (учит отбивать)
  function bossAct(D, dt) {
    var angry = D.hp <= D.def.hp / 2, A = D.act;
    if (!A) {
      if ((D.cool -= dt) > 0) return;
      var kind = D.force || (D.n === 0 ? 'volley' : pickOf(angry ? ['volley', 'spread', 'spread', 'breath'] : ['volley', 'volley', 'spread', 'breath']));
      D.force = null;
      D.n++;
      A = D.act = { kind: kind, t: 0, shots: kind === 'volley' ? (angry ? 3 : 2) : 1, charge: 0, lane: nearestLane(player.x) };
      if (kind === 'breath') { // колонку под атакой видно заранее: её острова искрят цветом атаки
        D.tx = A.lane;
        scorchLane(A.lane, simTime + 1.1, simTime + 2.7, D.lane);
      }
    }
    A.t += dt;
    var wait = A.kind === 'volley' ? (angry ? 0.35 : 0.5) : A.kind === 'spread' ? 0.7 : 1.1;
    if (A.kind === 'volley') D.tx = nearestLane(player.x);
    A.charge = clamp(A.t / wait, 0, 1);
    if (A.kind === 'breath' && A.t > wait) { // на колонку: огонь (дракон, лавовый голем), иней, призрачный дым; пёс бьёт оземь
      A.charge = 1;
      // струя — частицы внахлёст складываются по яркости: их немного и они полупрозрачные, иначе — сплошной белый
      var hy = D.kind === 'dragon' ? 0.7 : 2.5, nb = emitCount(D.lane === 'scorch' ? 48 : 40, dt);
      if (D.lane === 'scorch') for (var b = 0; b < nb; b++) fxFire.emit({ x: D.x + rand(-0.3, 0.3), y: D.y + hy, z: D.z + 2.9, vx: rand(-0.6, 0.6), vy: rand(-7, -5), vz: rand(9, 12), grav: 4, drag: 0.4, life: rand(0.5, 0.8), size: rand(1, 1.5), grow: 1.1, c: [1, 1, 1], a: 0.5, fire: true });
      else if (D.lane !== 'spikes') {
        var lc = LANE_FX[D.lane].warn;
        for (var q = 0; q < nb; q++) fxGlow.emit({ x: D.x + rand(-0.4, 0.4), y: D.y + hy, z: D.z + 2.5, vx: rand(-0.6, 0.6), vy: rand(-6, -4), vz: rand(9, 12), grav: 3, drag: 0.4, life: rand(0.5, 0.8), size: rand(0.6, 1), grow: 0.8, c: lc, a: 0.45 });
      } else if (!A.slam) {
        A.slam = true;
        cam.shake = Math.max(cam.shake, 0.4);
        chips(D.x, D.y + 0.3, D.z + 1.5, [0.55, 0.5, 0.45], 16);
        Sound.boom();
      }
      if (A.t > wait + 1.6) bossActDone(D, angry);
      return;
    }
    if (A.t < wait) return;
    if (A.kind === 'spread') { // веер: шар в каждую колонку; пока не злится — в одной просвет
      var gap = angry ? -1 : (Math.random() * 3) | 0;
      CONFIG.lanes.x.forEach(function (lx, i) { if (i !== gap) shootFireball(D, lx); });
      bossActDone(D, angry);
      return;
    }
    shootFireball(D, nearestLane(player.x)); // залп: шар за шаром в колонку кота
    if (--A.shots > 0) {
      A.t = 0;
      A.charge = 0;
    } else bossActDone(D, angry);
  }

  function bossActDone(D, angry) {
    D.act = null;
    D.cool = angry ? 0.9 : 1.4;
  }

  // атака по колонке lx впереди кота: с from до to (simTime) острова горят, покрыты ледяными или стальными шипами
  // или исчезают; до from — искрят цветом атаки (предупреждение)
  function scorchLane(lx, from, to, kind) {
    world.rows.forEach(function (row) {
      if (row.z > player.z - 3 || row.z < player.z - 40) return;
      row.plats.forEach(function (p) { if (Math.abs(p.baseX - lx) < 1.1 && p.type !== 'wood') p.scorch = { from: from, to: to, kind: kind || 'scorch' }; });
    });
  }

  function clearScorch() {
    world.rows.forEach(function (row) {
      row.plats.forEach(function (p) {
        if (p.scorch && p.scorch.kind === 'vanish') p.mesh.visible = true;
        p.scorch = null;
        scorchFlames(p, false);
      });
    });
  }

  function scorchFx(p, dt) {
    var kind = p.scorch.kind, on = simTime >= p.scorch.from;
    if (simTime >= p.scorch.to) {
      if (kind === 'vanish') p.mesh.visible = true;
      p.scorch = null;
      scorchFlames(p, false);
      return;
    }
    if (kind === 'scorch') scorchFlames(p, on);
    if (kind === 'vanish') p.mesh.visible = !on;
    if (!on) {
      var pulse = 0.6 + 0.4 * Math.sin(simTime * 18), wc = LANE_FX[kind].warn, nw = emitCount(22 * pulse, dt); // колонка под атакой мерцает её цветом
      for (var k = 0; k < nw; k++) fxGlow.emit({ x: p.x + rand(-p.w / 2, p.w / 2), y: p.y + 0.1, z: p.z + rand(-0.9, 0.9), vx: 0, vy: rand(0.8, 2), vz: 0, grav: 0, drag: 1, life: rand(0.3, 0.5), size: rand(0.4, 0.65), grow: -0.3, c: wc, a: 0.75 });
    } else if (kind === 'scorch') {
      flames(p.x, p.y, p.z, p.w, emitCount(24, dt));
    } else if (kind === 'frost' || kind === 'spikes') { // шипы торчат из острова
      for (var f = emitCount(16, dt); f > 0; f--) fxGlow.emit({ x: p.x + rand(-p.w / 2, p.w / 2), y: p.y + 0.3, z: p.z + rand(-0.9, 0.9), vx: 0, vy: rand(0.2, 0.6), vz: 0, grav: 0, drag: 2, life: rand(0.25, 0.4), size: rand(0.4, 0.7), grow: -0.5, c: LANE_FX[kind].warn, a: 0.8 });
    } else for (var v = emitCount(14, dt); v > 0; v--) fxGlow.emit({ x: p.x + rand(-p.w / 2, p.w / 2), y: p.y - rand(0, 1), z: p.z + rand(-0.9, 0.9), vx: 0, vy: rand(-0.4, 0.4), vz: 0, grav: 0, drag: 1, life: rand(0.5, 0.8), size: rand(0.5, 0.9), grow: 0.4, c: LANE_FX.vanish.warn, a: 0.6 });
  }

  function bossDamage(dmg) {
    var D = world.boss, wasAngry = D.hp <= D.def.hp / 2;
    D.hp = Math.max(0, D.hp - dmg);
    cam.shake = Math.max(cam.shake, 0.3);
    vibrate(40);
    if (D.hp <= 0) {
      bossDefeat();
      return;
    }
    if (!wasAngry && D.hp <= D.def.hp / 2) {
      Sound.roar(true);
      toast(tr('boss.angry', { name: tr(D.def.name) }));
    }
  }

  function bossDefeat() {
    var D = world.boss, won = addCoins(CONFIG.boss.reward), life = !player.dead && player.lives < maxLives();
    if (life) player.lives++; // победа возвращает жизнь
    D.state = 'down';
    D.vy = 3;
    D.act = null;
    world.bosses++;
    world.fireballs.forEach(function (f) { if (!f.done && !f.back) popFireball(f, false); }); // его огонь гаснет
    clearScorch();
    hitStop = 0.4; // замедление — момент победы
    cam.shake = 0.6;
    sparkle(D.x, D.y, D.z, [1, 0.85, 0.4], 60, 9);
    popText(tr('boss.down', { name: tr(D.def.name) }), '+' + coinsWord(won) + (life ? ' · ' + tr('bonus.heart.sub') : ''), true);
    el.game.classList.remove('is-boss');
    Sound.boss(false);
    Sound.bossDown();
    vibrate(120);
    note('bossDown');
    track('boss');
    Telemetry.event('boss', { kind: D.kind, level: level ? level.id : '', dist: Math.floor(player.maxDist), lives: player.lives });
    player.cheer = 1.8; // меч вверх, подпрыгивает (animateCat)
    if (mode === 'level') winTimer = 2.4; // в уровне — победа, когда дракон упадёт
  }

  function bossLeave() {
    world.boss.state = 'leave';
    world.boss.act = null;
    clearScorch();
    el.game.classList.remove('is-boss');
    Sound.boss(false);
    toast(tr('boss.left', { name: tr(world.boss.def.name) }));
    note('bossLeft');
  }

  function endBoss() {
    var D = world.boss;
    D.flash = 0;
    bossFlash(D);
    release(D.mesh);
    D.mesh.rotation.set(0, 0, 0);
    world.boss = null;
  }


  /* ---------- Кот-рыцарь ---------- */

  // Мех оболочками: копии меша, раздутые вдоль нормалей; на каждой следующей «волоски» реже и тоньше
  // (порог прозрачности растёт), а цвет светлее — у корней шерсть темнее, как в жизни.
  // Все оболочки — один вызов отрисовки: копии рисуются инстансами, доля оболочки 0…1 — в атрибуте shellK
  // У глаз (userData.eyes — центры и радиус в координатах меша) оболочки прижимаются к коже и не рисуются:
  // иначе волоски рвано залезают на глаз (вблизи, в лавке, это видно)
  function shellCompile(shader) {
    skyFogUniforms(shader);
    var E = this.userData.eyes || [], far = new T.Vector4(0, 0, 0, 0);
    shader.uniforms.shellLen = { value: this.userData.shellLen };
    shader.uniforms.furEyeA = { value: E[0] || far };
    shader.uniforms.furEyeB = { value: E[1] || far };
    shader.vertexShader = 'uniform float shellLen;\nuniform vec4 furEyeA;\nuniform vec4 furEyeB;\nattribute float shellK;\nvarying float vShellK;\nvarying float vFurMask;\n' +
      'float furEye( vec4 e, vec3 p ) { return e.w > 0.0 ? smoothstep( e.w, e.w * 1.7, distance( p, e.xyz ) ) : 1.0; }\n' + shader.vertexShader
      .replace('#include <begin_vertex>', 'vFurMask = min( furEye( furEyeA, position ), furEye( furEyeB, position ) );\nvec3 transformed = position + normal * shellLen * shellK * vFurMask;\nvShellK = shellK;');
    shader.fragmentShader = 'varying float vShellK;\nvarying float vFurMask;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.8 + 0.35 * vShellK;')
      .replace('#include <alphatest_fragment>', 'if ( diffuseColor.a < 0.12 + 0.5 * vShellK + 1.2 * ( 1.0 - vFurMask ) ) discard;');
  }

  function addFur(mesh, n, length) {
    var src = mesh.geometry, g = new T.InstancedBufferGeometry(), k = new Float32Array(n), m = mesh.material.clone(), i;
    g.index = src.index; // атрибуты общие с исходным мешем — хвост, который гнётся каждый кадр, гнётся и в мехе
    Object.keys(src.attributes).forEach(function (name) { g.setAttribute(name, src.attributes[name]); });
    for (i = 0; i < n; i++) k[i] = (i + 1) / n;
    g.setAttribute('shellK', new T.InstancedBufferAttribute(k, 1));
    g.instanceCount = n;
    m.alphaMap = tex.strands;
    m.alphaTest = 0.12; // включает отсечение; порог по оболочке считает шейдер
    m.envMapIntensity = 0.4;
    m.userData.shellLen = length;
    m.userData.eyes = mesh.userData.eyes || null;
    m.onBeforeCompile = shellCompile;
    var s = new T.Mesh(g, m);
    s.frustumCulled = false;
    mesh.add(s);
    return s;
  }

  // хвост: трубка из колец вдоль кривой; вершины пересчитываются каждый кадр (updateTail)
  function buildTail(material, lightHex, darkHex) {
    var S = 22, R = 10, n = (S + 1) * (R + 1), g = new T.BufferGeometry(), idx = [], i, j;
    var col = new Float32Array(n * 3), uv = new Float32Array(n * 2), light = new T.Color(lightHex || '#b89a7c'), dark = new T.Color(darkHex || '#5e4b3c');
    for (i = 0; i <= S; i++) {
      var t = i / S, c = Math.sin(t * Math.PI * 6 + 0.4) > 0.42 || t > 0.9 ? dark : light; // полосы и тёмный кончик
      for (j = 0; j <= R; j++) {
        var k = i * (R + 1) + j;
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
        uv[k * 2] = j / R;
        uv[k * 2 + 1] = t * 2.5;
        if (i < S && j < R) idx.push(k, k + 1, k + R + 1, k + R + 1, k + 1, k + R + 2); // лицом наружу
      }
    }
    g.setIndex(idx);
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    var mat2 = material.clone();
    mat2.vertexColors = true;
    mat2.color.set('#ffffff');
    var mesh = new T.Mesh(g, mat2);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    addFur(mesh, 8, 0.04);
    var pts = [];
    for (i = 0; i < 10; i++) pts.push(new T.Vector3());
    return { mesh: mesh, geo: g, S: S, R: R, curve: new T.CatmullRomCurve3(pts), pts: pts };
  }

  var tailTmp = { p: null, t: null, n: null, b: null, ref: null };
  function updateTail(tail) {
    var S = tail.S, R = tail.R, pos = tail.geo.attributes.position, nor = tail.geo.attributes.normal, v = tailTmp, i, j;
    if (!v.p) { v.p = new T.Vector3(); v.t = new T.Vector3(); v.n = new T.Vector3(); v.b = new T.Vector3(); v.ref = new T.Vector3(1, 0, 0); }
    for (i = 0; i <= S; i++) {
      var t = i / S, r = (0.08 + Math.sin(Math.min(1, t * 1.05) * Math.PI) * 0.075) * (t > 0.84 ? Math.sqrt(Math.max(0, 1 - (t - 0.84) / 0.16)) : 1); // пушистая середина, закруглённый кончик
      tail.curve.getPoint(t, v.p);
      tail.curve.getTangent(t, v.t);
      v.n.crossVectors(v.t, v.ref).normalize();
      v.b.crossVectors(v.t, v.n).normalize();
      for (j = 0; j <= R; j++) {
        var a = j / R * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = i * (R + 1) + j;
        var nx = v.n.x * ca + v.b.x * sa, ny = v.n.y * ca + v.b.y * sa, nz = v.n.z * ca + v.b.z * sa;
        pos.setXYZ(k, v.p.x + nx * r, v.p.y + ny * r, v.p.z + nz * r);
        nor.setXYZ(k, nx, ny, nz);
      }
    }
    pos.needsUpdate = nor.needsUpdate = true;
  }

  // Модель смотрит в −Z (к замку) — в игре мы видим спину, плащ и хвост, как на референсе.
  // Иерархия: root (позиция, поворот) → squash (сжатие от ног) → spin (сальто вокруг центра) → model.
  // Тело, голова, лапы и меч — из cat.glb (_not_main/blender/cat.py, по фото героя), в группах-шарнирах ниже;
  // без модели — из простых фигур (catShapes). Плащ, хвост и смаз клинка игра строит сама
  function buildCat() {
    var M = {
      tail: std({ color: '#b39374', roughness: 1 }),
      cape: std({ color: '#cbbb9e', roughness: 0.95, side: T.DoubleSide, envMapIntensity: 0.6 })
    };
    collectLit([M.tail, M.cape]);
    var root = new T.Group(), squash = new T.Group(), spin = new T.Group(), model = new T.Group();
    root.add(squash);
    squash.add(spin);
    spin.position.y = 0.72;
    spin.add(model);
    model.position.y = -0.72;

    // шарниры: бедро, плечо, шея; меч — рукоятью в правой лапе, клинок смотрит вниз и в сторону
    var joint = function (x, y) {
      var g = new T.Group();
      g.position.set(x, y, 0);
      model.add(g);
      return g;
    };
    var legL = joint(-0.13, 0.33), legR = joint(0.13, 0.33), armL = joint(-0.3, 0.79), armR = joint(0.3, 0.79), head = joint(0, 1.12);
    var sword = new T.Group();
    sword.position.set(0, -0.36, 0);
    sword.rotation.set(SWORD_REST[0], 0, SWORD_REST[1]);
    armR.add(sword);
    var parts = { body: model, head: head, armL: armL, armR: armR, legL: legL, legR: legR, sword: sword };
    var skin = null;
    if (models.cat) skin = catModel(parts);
    else catShapes(parts);
    if (skin) {
      skin.cape = M.cape; // облик (лавка): доспех, меч, плащ — свои материалы кота; окрас — мех и хвост
      skin.fur.push(M.tail);
      skin.fur.forEach(function (fm) { fm.userData.base = fm.color.clone(); });
    }
    var wb = new Bundle(); // усы
    [-1, 1].forEach(function (s) {
      for (var k = 0; k < 3; k++) wb.add(geo.whisker, mat.white, [0.25 * s, -0.11 - k * 0.03, -0.36], [0, 0, s * (Math.PI / 2 + (k - 1) * 0.16)]);
    });
    wb.build(head);

    // плащ: узкий, с левого плеча, как на фото — справа остаются видны меч и наплечник;
    // крепится под воротником и развевается за спиной (вершины двигаются в animateCape)
    var capeGeo = new T.PlaneGeometry(0.4, 0.62, 12, 8);
    capeGeo.translate(0, -0.31, 0);
    var cape = new T.Mesh(capeGeo, M.cape);
    cape.position.set(-0.1, 0.86, 0.31);
    cape.rotation.z = -0.12;
    cape.castShadow = true;
    cape.userData.rest = new Float32Array(capeGeo.attributes.position.array);
    model.add(cape);

    // хвост: одна пушистая полосатая трубка вдоль изогнутой оси; выглядывает из-под плаща.
    // Окрас — как у головы модели (кремовый с табби-полосами)
    var tail = models.cat ? buildTail(M.tail, '#ceb290', '#89735d') : buildTail(M.tail);
    tail.mesh.position.set(0.1, 0.32, 0.22);
    model.add(tail.mesh);

    // смаз клинка: от середины клинка до точки за остриём в координатах плеча — дальше их крутит поза удара.
    // Лента живёт вне spin (в squash): разворот корпуса в ней посчитан для каждой прошлой позы
    sword.updateMatrix();
    var smear = { base: new T.Vector3(0, 0.32, 0).applyMatrix4(sword.matrix), edge: new T.Vector3(0, 1.25, 0).applyMatrix4(sword.matrix), pose: new T.Euler(), v: new T.Vector3() };
    stripMesh(smear, 28, mat.smear);
    smear.mesh.visible = false;
    squash.add(smear.mesh);

    // крылья грифона за плечами — видны только в полёте; левое — зеркало правого
    var wings = new T.Group(), wingR = new T.Group(), wingL = new T.Group();
    wings.position.set(0, 0.92, 0.22);
    wings.rotation.x = 0.12; // чуть назад, за спину
    [[wingR, 1], [wingL, -1]].forEach(function (w) {
      w[0].position.x = 0.1 * w[1];
      w[0].scale.set(1.05 * w[1], 1.05, 1.05);
      if (models.traps && models.traps.wing) attach(w[0], models.traps.wing, 0, 0, 0, {}, {});
      else new Bundle().add(geo.sphereLow, mat.gold, [0.6, 0.1, 0.25], null, [0.6, 0.03, 0.3]).build(w[0]);
      wings.add(w[0]);
    });
    wings.visible = false;
    wings.userData = { r: wingR, l: wingL };
    model.add(wings);

    // ореол «Рыцарской ярости»: золотое свечение вокруг кота (кот заслоняет середину — светится силуэт)
    var aura = new T.Sprite(mat.aura);
    aura.position.y = 0.85;
    aura.visible = false;
    squash.add(aura);

    // пузырь (бонус): прозрачная сфера вокруг кота — один удар или падение не отнимут жизнь
    var bubble = new T.Mesh(geo.sphere, mat.bubble);
    bubble.position.y = 0.75;
    bubble.scale.setScalar(1.05);
    bubble.visible = false;
    bubble.renderOrder = 3;
    squash.add(bubble);

    // слой 1 — третий проход отрисовки: кот всегда виден поверх островов, и только там.
    // Карта теней строится в проходе дороги, поэтому тень отбрасывает невидимый манекен из простых фигур
    root.traverse(function (o) { o.layers.set(LAYER_CAT); o.castShadow = false; });
    catShadow(model, head, armL, armR, sword);
    root.scale.setScalar(CONFIG.cat.scale);
    return { root: root, squash: squash, spin: spin, head: head, armL: armL, armR: armR, legL: legL, legR: legR, tail: tail, cape: cape, smear: smear, sword: sword, aura: aura, wings: wings, bubble: bubble, skin: skin };
  }

  // кот из модели: части — в шарниры; металл, кожа, золото и глаза — игровые материалы (настроены под здешний
  // свет, как у остального мира), шерсть и розовое — из модели. На шерсть (голова, уши, щёки, воротник) — оболочки,
  // полоски табби — в цветах вершин головы
  function catModel(parts) {
    var skin = { armor: mat.metal.clone(), dark: mat.steel.clone(), blade: mat.metal.clone(), fur: [] };
    var swap = { steel: skin.armor, steel_dark: skin.dark, leather: mat.leather, gold: mat.gold, eye: mat.eye, white: mat.white };
    var fur = { fur: [10, 0.032], fur_light: [7, 0.026] }, furry = [], lit = [], eyeMeshes = [];
    Object.keys(parts).forEach(function (name) {
      var o = models.cat[name];
      parts[name].add(o);
      o.traverse(function (m) {
        if (!m.isMesh) return;
        if (m.material.name === 'eye') eyeMeshes.push(m);
        m.material = name === 'sword' && m.material.name === 'steel' ? skin.blade : swap[m.material.name] || m.material;
        if (fur[m.material.name]) furry.push(m);
        lit.push(m.material);
      });
    });
    collectLit(lit);
    // центры глаз: в меше глаз оба, левый — вершины с x < 0, правый — с x > 0 (в координатах родителя — у меха он тот же)
    var eyes = [];
    eyeMeshes.forEach(function (m) {
      var p = m.geometry.attributes.position, v = new T.Vector3(), sides = [[new T.Vector3(), 0], [new T.Vector3(), 0]];
      for (var i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        var sd = sides[v.x < 0 ? 0 : 1];
        sd[0].add(v);
        sd[1]++;
      }
      sides.forEach(function (sd) { if (sd[1]) eyes.push({ p: sd[0].divideScalar(sd[1]).applyMatrix4(m.matrix), parent: m.parent }); });
    });
    furry.forEach(function (m) {
      var mine = eyes.filter(function (e) { return e.parent === m.parent; }), inv = new T.Matrix4().copy(m.matrix).invert();
      if (mine.length) m.userData.eyes = mine.map(function (e) { var l = e.p.clone().applyMatrix4(inv); return new T.Vector4(l.x, l.y, l.z, 0.1); });
      var sh = addFur(m, fur[m.material.name][0], fur[m.material.name][1]); // после обхода — оболочки тоже меши
      [m.material, sh.material].forEach(function (fm) { if (skin.fur.indexOf(fm) < 0) skin.fur.push(fm); });
    });
    // макушка между ушами (в координатах шеи) — сюда садится шляпа: самая высокая вершина головы у середины по x
    var head = parts.head, inv = new T.Matrix4(), v = new T.Vector3(), top = -1, zAt = 0;
    head.updateMatrixWorld(true);
    inv.copy(head.matrixWorld).invert();
    head.traverse(function (m) {
      if (!m.isMesh || !m.geometry || m.material === skin.blade) return;
      var p = m.geometry.attributes.position;
      for (var i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        if (Math.abs(v.x) < 0.07 && v.y > top) { top = v.y; zAt = v.z; }
      }
    });
    skin.hatAt = new T.Vector3(0, top, zAt);
    return skin;
  }

  // кот из простых фигур — если модель не загрузилась
  function catShapes(parts) {
    var M = {
      fur: std({ map: tex.fur, roughness: 1 }),
      stripe: std({ color: '#6f5a48', roughness: 1 }),
      cream: std({ color: '#f3e7d5', roughness: 1 }),
      pink: std({ color: '#eaa0a3', roughness: 0.6 }),
      bow: std({ color: '#f6a8bb', roughness: 0.55 }),
      blade: std({ color: '#f1f4f8', metalness: 1, roughness: 0.15 })
    };
    collectLit(Object.keys(M).map(function (k) { return M[k]; }));
    var S = geo.sphere;

    // кираса, юбка из пластин, пояс с пряжкой, меховой воротник
    var body = new Bundle();
    body.add(S, mat.metal, [0, 0.6, 0], null, [0.31, 0.33, 0.27]);
    body.add(new T.CylinderGeometry(0.27, 0.31, 0.17, 18), mat.steel, [0, 0.37, 0]);
    body.add(new T.TorusGeometry(0.285, 0.035, 8, 26), mat.leather, [0, 0.46, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
    body.add(new T.BoxGeometry(0.1, 0.08, 0.04), mat.gold, [0, 0.46, -0.255]);
    body.add(new T.TorusGeometry(0.2, 0.085, 8, 18), M.cream, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
    body.build(parts.body, { cast: true });

    [parts.legL, parts.legR].forEach(function (g) {
      new Bundle()
        .add(new T.CylinderGeometry(0.085, 0.075, 0.22, 10), mat.steel, [0, -0.1, 0])
        .add(S, mat.leather, [0, -0.26, -0.04], null, [0.095, 0.075, 0.14])
        .build(g, { cast: true });
    });
    [[parts.armL, -1], [parts.armR, 1]].forEach(function (a) {
      new Bundle()
        .add(S, mat.metal, [0.03 * a[1], 0.02, 0], null, [0.15, 0.12, 0.15])
        .add(new T.CylinderGeometry(0.068, 0.062, 0.3, 10), mat.steel, [0, -0.17, 0])
        .add(S, mat.metal, [0, -0.34, 0], null, 0.085)
        .build(a[0], { cast: true });
    });

    // меч: плоский клинок-ромб, рукоять в нуле
    var sb = new Bundle();
    sb.add(new T.CylinderGeometry(0.024, 0.024, 0.16, 8), mat.leather, [0, 0, 0]);
    sb.add(S, mat.gold, [0, -0.1, 0], null, 0.035);
    sb.add(new T.BoxGeometry(0.26, 0.04, 0.05), mat.gold, [0, 0.095, 0]);
    sb.add(new T.CylinderGeometry(0.036, 0.036, 0.66, 4), M.blade, [0, 0.45, 0], null, [1, 1, 0.35]);
    sb.add(new T.ConeGeometry(0.036, 0.13, 4), M.blade, [0, 0.845, 0], null, [1, 1, 0.35]);
    sb.build(parts.sword, { cast: true });

    // голова: пушистые щёки, уши с кисточками, глаза-бусины и розовый бантик, как на фото
    var hb = new Bundle();
    hb.add(S, M.fur, [0, 0, 0], null, [0.44, 0.4, 0.41]);
    [-1, 1].forEach(function (s) {
      hb.add(S, M.cream, [0.25 * s, -0.13, -0.1], null, [0.2, 0.16, 0.19]);
      hb.add(new T.ConeGeometry(0.09, 0.24, 7), M.fur, [0.42 * s, -0.12, 0.02], [0, 0, -s * (Math.PI / 2 + 0.45)]);
      hb.add(new T.ConeGeometry(0.15, 0.32, 12), M.fur, [0.25 * s, 0.33, 0.02], [0, 0, -0.38 * s], [1, 1, 0.62]);
      hb.add(new T.ConeGeometry(0.095, 0.22, 10), M.pink, [0.245 * s, 0.31, -0.045], [0, 0, -0.38 * s], [1, 1, 0.4]);
      hb.add(new T.ConeGeometry(0.03, 0.14, 5), M.stripe, [0.33 * s, 0.53, 0.02], [0, 0, -0.5 * s]);
      hb.add(S, mat.eye, [0.155 * s, 0.02, -0.33], null, [0.085, 0.1, 0.06]);
      hb.add(geo.sphereLow, mat.white, [0.135 * s, 0.065, -0.383], null, [0.026, 0.026, 0.012]);
      hb.add(S, M.cream, [0.068 * s, -0.12, -0.34], null, [0.1, 0.08, 0.08]);
      hb.add(S, M.bow, [-0.3 + s * 0.075, 0.3 - s * 0.02, -0.08], [0, 0, 0.4 + s * 0.3], [0.085, 0.055, 0.04]);
    });
    hb.add(geo.sphereLow, M.bow, [-0.3, 0.3, -0.1], null, 0.032);
    hb.add(S, M.cream, [0, -0.2, -0.31], null, [0.075, 0.055, 0.06]);
    hb.add(S, M.pink, [0, -0.07, -0.402], null, [0.042, 0.03, 0.03]);
    hb.build(parts.head, { cast: true }).forEach(function (m) { // пушистая голова: шерсть оболочками
      if (m.material === M.fur) addFur(m, 10, 0.032);
      else if (m.material === M.cream) addFur(m, 7, 0.026);
    });
  }

  // манекен для тени: туловище, голова с ушами, плащ, хвост, лапы и меч — в тех же группах, что и кот,
  // поэтому повторяет прыжки, сальто и взмах. Цвет и глубину не пишет — в кадре его нет, только в карте теней
  function catShadow(model, head, armL, armR, sword) {
    var m = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), S = geo.sphereLow, body = new Bundle(), hb = new Bundle();
    body.add(S, m, [0, 0.6, 0], null, [0.31, 0.33, 0.27]);
    body.add(new T.CylinderGeometry(0.27, 0.31, 0.17, 8), m, [0, 0.37, 0]);
    body.add(boxGeo(0.42, 0.62, 0.05), m, [-0.1, 0.56, 0.42], [0.35, 0, -0.12]); // плащ
    body.add(S, m, [0.14, 0.42, 0.55], [0.6, 0, 0], [0.12, 0.12, 0.32]); // хвост
    hb.add(S, m, [0, 0, 0], null, [0.44, 0.4, 0.41]);
    [-1, 1].forEach(function (s) {
      body.add(new T.CylinderGeometry(0.085, 0.075, 0.3, 6), m, [0.13 * s, 0.18, 0]);
      hb.add(new T.ConeGeometry(0.15, 0.32, 5), m, [0.25 * s, 0.33, 0.02], [0, 0, -0.38 * s]);
    });
    body.build(model, { cast: true });
    hb.build(head, { cast: true });
    [armL, armR].forEach(function (arm) { new Bundle().add(new T.CylinderGeometry(0.07, 0.065, 0.42, 6), m, [0, -0.18, 0]).build(arm, { cast: true }); });
    new Bundle().add(boxGeo(0.07, 0.95, 0.02), m, [0, 0.45, 0]).build(sword, { cast: true });
  }

  // корпус под плащом (координаты модели, ноги — y = 0): радиус по высоте с поясом, перевязью и бляхами и запасом;
  // точка плаща ближе к оси корпуса — выталкивается наружу, ткань ложится поверх доспеха
  function capeBodyR(y) {
    return y < 0.2 ? 0.315 : y < 0.68 ? 0.365 : y < 0.95 ? lerp(0.365, 0.285, (y - 0.68) / 0.27) : 0.285;
  }

  function animateCape() {
    var c = cat.cape, pos = c.geometry.attributes.position, rest = c.userData.rest, P = show.on ? SHOW_POSE : player;
    var cs = Math.cos(c.rotation.z), sn = Math.sin(c.rotation.z), ox = c.position.x, oy = c.position.y, oz = c.position.z;
    var fall = clamp(-P.vy / (CONFIG.physics.jump * P.pace), 0, 1), wind = clamp(-P.vz / 10, 0, 1.3);
    for (var i = 0; i < pos.count; i++) {
      var x = rest[i * 3], y = rest[i * 3 + 1], v = -y / 0.62; // 0 у воротника, 1 у края
      var wx = x * (1 + v * 0.7), wrap = wx / 0.4; // книзу шире; края заворачивают вокруг спины
      var folds = Math.sin(x * 30 + v * 2) * 0.05 * (0.3 + v); // вертикальные складки — ткань ловит свет полосами
      var back = v * v * (0.16 + wind * 0.3 + fall * 0.45) + Math.sin(time * 9 + v * 5 + x * 6) * 0.035 * v - wrap * wrap * 0.12 + folds;
      var ly = y * (1 - fall * 0.3 * v), mx = cs * wx - sn * ly + ox, my = sn * wx + cs * ly + oy, mz = back + oz + 0.02; // в модель (ось корпуса — z = −0.02)
      var d = Math.sqrt(mx * mx + mz * mz), r = capeBodyR(my);
      if (mz > -0.05 && d < r) {
        mx *= r / d;
        mz *= r / d;
        var dx = mx - ox, dy = my - oy;
        wx = cs * dx + sn * dy;
        back = mz - 0.02 - oz;
      }
      pos.setXYZ(i, wx, ly, back);
    }
    pos.needsUpdate = true;
    c.geometry.computeVertexNormals();
  }

  // Удары мечом — ключевые позы правой лапы (поворот плеча x, y, z) и разворот корпуса tw по доле удара k.
  // Замах и возврат плавные, сам удар (hot — в нём меч и бьёт) резкий. Рубящий — из-за правого плеча наискось
  // вниз-влево; наотмашь — снизу слева вверх-вправо; круговой — клинок вбок, кот делает оборот. Удары идут
  // в плоскости, которую видно с камеры позади кота
  var SWING = {
    cut: { hot: [0.2, 0.62], k: [0, 0.2, 0.4, 0.62, 1], x: [-0.15, -0.7, -0.95, -0.4, -0.2], y: [0, 0.15, 0, -0.2, 0], z: [0.5, 2.95, 1.1, -0.85, 0.3], tw: [0, -0.35, 0.15, 0.45, 0] },
    back: { hot: [0.18, 0.6], k: [0, 0.18, 0.4, 0.6, 1], x: [-0.15, -0.5, -0.75, -0.5, -0.2], y: [0, -0.25, 0, 0.2, 0], z: [0.5, -1.15, 0.9, 2.7, 0.6], tw: [0, 0.4, -0.1, -0.5, 0] },
    whirl: { hot: [0.1, 0.85], k: [0, 0.1, 0.85, 1], x: [-0.15, -0.35, -0.35, -0.2], y: [0, 0, 0, 0], z: [0.5, 1.85, 1.85, 0.4], tw: [0, 0.3, 0.3 - Math.PI * 2, -Math.PI * 2] }
  };
  var SWINGS = ['cut', 'back', 'whirl'], Y_AXIS = new T.Vector3(0, 1, 0);
  var SWORD_REST = [-0.35, Math.PI + 0.55]; // меч в лапе: наклон x и поворот z (клинок вниз и в сторону); смаз удара посчитан от них

  function swingKey(S, ch, k) {
    var K = S.k, i = 0;
    while (i < K.length - 2 && k > K[i + 1]) i++;
    var f = clamp((k - K[i]) / (K[i + 1] - K[i]), 0, 1);
    if (K[i] < S.hot[0] || K[i + 1] > S.hot[1]) f = ease(f);
    return lerp(S[ch][i], S[ch][i + 1], f);
  }

  function swingPose(kind, k, out) {
    var S = SWING[kind];
    return out.set(swingKey(S, 'x', k), swingKey(S, 'y', k), swingKey(S, 'z', k));
  }

  function swingTwist(kind, k) { return swingKey(SWING[kind], 'tw', k); }

  // Смаз клинка — лента от середины клинка до точки за остриём (след шире самого меча — видно размах)
  // по положениям меча за последние 0.12 с (у кругового — 0.22 с, почти кольцо). Прошлые позы считаются той же
  // формулой, что и сам удар, вместе с разворотом корпуса, поэтому лента гладкая при любой частоте кадров.
  // Видна только в резкой части удара
  function updateSmear(s, armPos, sw, k) {
    var n = s.n, pos = s.pos, col = s.col, uv = s.uv, hot = SWING[sw.kind].hot, i, j;
    var win = (sw.kind === 'whirl' ? 0.22 : 0.12) / sw.dur;
    var fade = clamp((k - hot[0] + 0.04) / 0.08, 0, 1) * (1 - clamp((k - hot[1]) / 0.2, 0, 1));
    for (i = 0; i < n; i++) {
      var u = i / (n - 1), kp = Math.max(0, k - u * win), a = fade * Math.pow(1 - u, 1.3), tw = swingTwist(sw.kind, kp);
      swingPose(sw.kind, kp, s.pose);
      j = i * 6;
      s.v.copy(s.base).applyEuler(s.pose).add(armPos).applyAxisAngle(Y_AXIS, tw);
      pos[j] = s.v.x;
      pos[j + 1] = s.v.y;
      pos[j + 2] = s.v.z;
      s.v.copy(s.edge).applyEuler(s.pose).add(armPos).applyAxisAngle(Y_AXIS, tw);
      pos[j + 3] = s.v.x;
      pos[j + 4] = s.v.y;
      pos[j + 5] = s.v.z;
      j = i * 8;
      col[j] = col[j + 1] = col[j + 2] = col[j + 4] = col[j + 5] = col[j + 6] = 1;
      col[j + 3] = col[j + 7] = a;
      j = i * 4;
      uv[j] = uv[j + 2] = u;
      uv[j + 1] = 0;
      uv[j + 3] = 1;
    }
    var at = s.mesh.geometry.attributes;
    at.position.needsUpdate = at.color.needsUpdate = at.uv.needsUpdate = true;
  }

  function animateCat(dt) {
    var P = show.on ? SHOW_POSE : player, c = cat, J = CONFIG.physics.jump * P.pace, i; // в витрине — спокойная поза
    c.root.position.set(P.x, P.y, P.z);
    c.root.rotation.set(0, -P.vx * 0.05 + (show.on ? Math.sin(time * 0.6) * 0.18 + show.drag : 0), -P.vx * 0.03);

    // сжатие при приземлении, вытягивание на взлёте, присед перед первым прыжком
    P.squash = Math.max(0, P.squash - dt * 4.5);
    var rise = clamp(P.vy / J, -1, 1), up = Math.max(0, rise), sq = P.squash * P.squash;
    var crouch = P.wait > 0 ? Math.pow(1 - Math.min(1, P.wait / CONFIG.cat.takeoff), 2) * 0.22 : 0; // ждёт дольше — сначала стоит
    // стоит на месте (заставка, витрина, присед перед прыжком): дышит, оглядывается, клинок отведён наружу
    var calm = !P.swing && (show.on || P.wait > 0 || state === 'start' || state === 'map' || state === 'shop' || state === 'quests' || state === 'codex' || state === 'daily' || state === 'settings') ? 1 : 0;
    var sy = 1 - 0.3 * sq - crouch + 0.09 * up * (1 - P.squash) + calm * Math.sin(time * 2.4) * 0.015, sx = 1 / Math.sqrt(sy);
    c.squash.scale.set(sx, sy, sx);

    // бег: фаза шага — от пройденного пути (быстрее бежит — чаще шаги); подкат — откинулся назад, ноги вперёд, как в бейсболе
    var running = P.move === 'run' && P.grounded && !P.dead, sliding = running && P.slide > 0;
    c.slideK = (c.slideK || 0) + ((sliding ? 1 : 0) - (c.slideK || 0)) * smooth(sliding ? 26 : 7, dt); // вниз — быстро (подкат прямо перед аркой — голова успевает уйти), подъём — мягко
    if (running) c.runPh = (c.runPh || 0) + dt * Math.max(4, -P.vz) * 1.9;
    var sk = running ? c.slideK : 0, rs = running ? 1 - sk : 0, st = Math.sin(c.runPh || 0), stance = 1 - Math.abs(st);
    c.squash.position.y = rs * stance * 0.08 - sk * 0.56; // шаг: вверх на середине, вниз на касании; подкат — к земле
    var air = P.wait > 0 || running ? 0 : 1, tuck = air * clamp(rise * 1.3, 0, 1), fall = air * clamp(-rise, 0, 1);
    c.legL.rotation.set(tuck * 0.9 - fall * 0.25, 0, -0.05 - fall * 0.12);
    c.legR.rotation.set(tuck * 0.9 - fall * 0.25, 0, 0.05 + fall * 0.12);
    var spread = 0.18 + tuck * 0.35 + fall * 0.65;
    c.armL.rotation.set(tuck * 0.6, 0, -spread);
    if (running) { // ноги — вперёд-назад, левая лапа — навстречу ноге; в подкате ноги вытянуты вперёд, лапа упирается позади
      c.legL.rotation.set(lerp(st * 0.95, 0.5, sk), 0, -0.05);
      c.legR.rotation.set(lerp(-st * 0.95, 0.35, sk), 0, 0.05);
      c.armL.rotation.set(lerp(-st * 0.75, -1.25, sk), 0, lerp(-0.22, -0.55, sk));
    }
    c.swordCalm = (c.swordCalm || 0) + (calm - (c.swordCalm || 0)) * (P.swing ? 1 : smooth(8, dt));
    c.sword.rotation.set(SWORD_REST[0] - 0.2 * c.swordCalm, 0, SWORD_REST[1] + 0.5 * c.swordCalm);
    var sw = P.swing, twist = 0, lean = 0;
    c.smear.mesh.visible = !!sw;
    if (sw) {
      var k = Math.min(1, sw.t / sw.dur), hot = SWING[sw.kind].hot;
      swingPose(sw.kind, k, c.armR.rotation);
      twist = swingTwist(sw.kind, k);
      lean = -0.18 * Math.sin(clamp((k - hot[0] + 0.1) / (hot[1] - hot[0] + 0.2), 0, 1) * Math.PI); // в удар — подаётся вперёд
      updateSmear(c.smear, c.armR.position, sw, k);
    } else if (P.cheer > 0) { // победа: меч над головой, лапа вверх
      c.armR.rotation.set(-2.6 + Math.sin(time * 9) * 0.12, 0, 0.35);
    } else {
      c.armR.rotation.set(tuck * 0.5 - 0.15 + rs * st * 0.4 - sk * 0.5, 0, spread + sk * 0.2);
    }
    if (P.cheer > 0) {
      P.cheer -= dt;
      if (state === 'win' || running) c.squash.position.y += Math.abs(Math.sin(time * 8)) * 0.14; // подпрыгивает на месте
    }
    var look = calm * (Math.sin(time * 0.31) * 0.3 + Math.sin(time * 0.83 + 1) * 0.1); // в покое оглядывается
    var ouch = P.ouch > 0 ? P.ouch / 0.5 : 0; // удар: трясёт головой
    c.head.rotation.set(-rise * 0.12 * air - sk * 0.5 - (P.cheer > 0 ? 0.25 : 0), -P.vx * 0.03 + look + Math.sin(time * 38) * 0.3 * ouch, Math.sin(time * 1.7) * 0.05 - rs * st * 0.06); // в подкате смотрит вперёд

    // ось хвоста: из-под плаща вниз-назад, кончик подкручен вверх (как на референсе);
    // в падении хвост задирается, при поворотах отстаёт и покачивается
    var px = 0, py = 0, pz = 0, pts = c.tail.pts;
    for (i = 0; i < pts.length; i++) {
      var a = -0.55 + i * (0.15 + fall * 0.05) + fall * 0.35;
      pts[i].set(px, py, pz);
      px += 0.015 + Math.sin(time * 3.2 - i * 0.5) * 0.008 * i - P.vx * 0.0012 * i;
      py += Math.sin(a) * 0.1;
      pz += Math.cos(a) * 0.1;
    }
    updateTail(c.tail);

    var rx = 0, ry = 0, rz = 0;
    if (P.flip >= 0) { // сальто после гриба-батута
      P.flip = Math.min(1, P.flip + dt / 0.85);
      rx = -ease(P.flip) * Math.PI * 2;
      if (P.flip >= 1) P.flip = -1;
    } else if (P.flight) { // полёт: корпус подался вперёд, крылья машут
      rx = -0.3;
      var F = P.flight, wk = c.wings.userData, beat = Math.sin(time * 7.5);
      F.flap = (F.flap || 0) + dt;
      wk.r.rotation.z = -0.12 + beat * 0.38; // крылья раскрыты в стороны — с камеры сзади видна вся их ширина
      wk.l.rotation.z = 0.12 - beat * 0.38;
      if (F.flap > 0.84) {
        F.flap = 0;
        Sound.flap();
      }
    } else if (P.trick) { // трюк: сальто вперёд или винт вокруг себя
      var tk = ease(clamp(P.trick.t / CONFIG.trick.time, 0, 1)) * Math.PI * 2;
      if (P.trick.kind === 'flip') rx = -tk;
      else ry = tk;
    } else if (state === 'fall' || P.dead) { // сбит или падает: кувырок назад и вбок
      rx = c.spin.rotation.x - dt * 7;
      rz = c.spin.rotation.z + dt * 3.2 * (P.vx >= 0 ? -1 : 1);
    } else {
      rx = lean + (running ? lerp(-0.16, 1.4, sk) : 0); // бег — корпус вперёд, подкат — откинулся назад почти лёжа: верх головы ~0,75 м, ниже перемычки арки (LOWBAR)
      ry = twist + rs * st * 0.12; // плечи — навстречу шагу
      rz = rs * st * 0.07; // переваливается с лапы на лапу
    }
    if (P.ouch > 0) { // вздрогнул: откинулся назад и выпрямился
      P.ouch -= dt;
      rx -= Math.sin(clamp(P.ouch / 0.5, 0, 1) * Math.PI) * 0.45;
    }
    c.spin.rotation.set(rx, ry, rz);
    c.aura.visible = P.fury > 0;
    c.bubble.visible = P.bubble;
    if (P.bubble) c.bubble.rotation.y = time * 0.8;
    if (P.fury > 0) {
      var glow = 1 + Math.sin(time * 9) * 0.08;
      c.aura.scale.set(2.7 * glow, 2.7 * glow, 1);
      c.aura.material.opacity = 0.55 * Math.min(1, P.fury / 1.2) * (0.85 + Math.sin(time * 5) * 0.15); // к концу ярости гаснет
    }
    c.root.visible = state !== 'over' && !(P.invuln > 0 && ((time * 14) | 0) % 2 === 0);
    animateCape();
    if (c.pet) { // спутник у плеча: покачивается, отстаёт на поворотах, крылышки трепещут
      var pb = c.pet.userData.body;
      c.pet.position.set(0.75 + P.vx * 0.04, 1.55 + Math.sin(time * 2.6) * 0.1, 0.35 + Math.sin(time * 1.3) * 0.08);
      pb.rotation.set(Math.sin(time * 3.1) * 0.12, Math.sin(time * 0.9) * 0.5, Math.sin(time * 14) * 0.08);
    }
    trailFx(dt);
  }

  // шлейф за котом (лавка): искры, лепестки, иней или радуга — только в забеге, пока кот движется
  var trailCol = null;
  function trailFx(dt) {
    var T0 = skinFor('trail'), P = player;
    if (T0.id === 'none' || state !== 'play' || P.dead || show.on) return;
    var n = emitCount(34, dt), c = T0.glow;
    for (var i = 0; i < n; i++) {
      if (!c) { // радуга: цвет бежит по кругу
        var col = (trailCol || (trailCol = new T.Color())).setHSL((time * 0.6 + i * 0.07) % 1, 0.9, 0.62);
        c = [col.r, col.g, col.b];
      }
      fxGlow.emit({ x: P.x + rand(-0.25, 0.25), y: P.y + rand(0.35, 0.95), z: P.z + 0.35, vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.5), vz: rand(0.2, 1), grav: 0.3, drag: 1.2, life: rand(0.35, 0.6), size: rand(0.16, 0.28), grow: -0.6, c: c, a: 0.75 });
      if (!T0.glow) c = null;
    }
  }


  /* ---------- Замок, острова по краям, небо ---------- */

  // Пачка облаков: одна плоскость, нарисованная инстансами, повёрнута к камере, как спрайт. Место и размер —
  // в матрице инстанса, вид облака (одно из трёх в атласе) и прозрачность — в его атрибутах. Один вызов отрисовки на пачку
  function cloudCompile(shader) {
    skyFogUniforms(shader);
    shader.vertexShader = 'attribute float cloudTile;\nattribute float cloudAlpha;\nvarying float vCloudAlpha;\n' + shader.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = ( vMapUv.x + cloudTile ) / 3.0;\nvCloudAlpha = cloudAlpha;')
      .replace('#include <project_vertex>', [
        'mat4 cloudM = modelMatrix * instanceMatrix;',
        'vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );',
        'mvPosition.xy += position.xy * vec2( length( cloudM[ 0 ].xyz ), length( cloudM[ 1 ].xyz ) );',
        'gl_Position = projectionMatrix * mvPosition;'
      ].join('\n'));
    shader.fragmentShader = 'varying float vCloudAlpha;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vCloudAlpha;');
  }

  // облака, как и фон неба, без тонмаппинга: белые на небе, а не серо-голубые пятна, и в дали тают ровно в небо
  function CloudBatch(cap) {
    var g = new T.PlaneGeometry(1, 1), m = new T.MeshBasicMaterial({ map: tex.cloudAtlas, transparent: true, depthWrite: false, toneMapped: false });
    this.tile = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    g.setAttribute('cloudTile', new T.InstancedBufferAttribute(this.tile, 1));
    g.setAttribute('cloudAlpha', new T.InstancedBufferAttribute(this.alpha, 1));
    m.onBeforeCompile = cloudCompile;
    m.defines = { NO_DISSOLVE: '' };
    cloudMats.push(m);
    this.mesh = new T.InstancedMesh(g, m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // облака всё время переставляются — общий габарит устаревает
    this.size = [];
    this.at = new T.Object3D();
  }

  // новое облако: размер как у спрайта (ширина size, высота 0.58 size); возвращает номер для place
  CloudBatch.prototype.add = function (size, opacity) {
    var i = this.mesh.count++;
    this.size.push(size);
    this.tile[i] = (Math.random() * 3) | 0;
    this.alpha[i] = opacity;
    return i;
  };

  CloudBatch.prototype.place = function (i, x, y, z) {
    var a = this.at, s = this.size[i];
    a.position.set(x, y, z);
    a.scale.set(s, s * 0.58, 1);
    a.updateMatrix();
    this.mesh.setMatrixAt(i, a.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  };

  function cloudSprite(size, opacity) {
    var m = new T.SpriteMaterial({ map: pickOf(tex.clouds), transparent: true, opacity: opacity, depthWrite: false, toneMapped: false });
    m.defines = { NO_DISSOLVE: '' };
    cloudMats.push(m);
    var s = new T.Sprite(m);
    s.scale.set(size, size * 0.58, 1);
    return s;
  }

  // флаги на шпилях: древко и треугольное полотнище; at — верхушка крыши (точки — из модели замка)
  function castleFlags(g, tops) {
    var b = new Bundle();
    tops.forEach(function (t) {
      b.add(new T.CylinderGeometry(0.07, 0.07, 2.2, 5), mat.pole, [t[0], t[1] + 1, t[2]]);
      b.add(flagGeo(), mat.flag, [t[0], t[1] + 1.7, t[2]]);
    });
    b.build(g);
  }

  // Замок: тело — модель из Blender (castle.glb) или, без неё, процедурное; стяги с котом, кружащие обломки,
  // облачное море и свечение — общие
  function buildCastle() {
    var g = new T.Group(), i, banners;
    if (models.castle) {
      g.add(new T.Mesh(models.castle.geo, mat.castleStone));
      castleFlags(g, models.castle.extras.flags);
      banners = models.castle.extras.banners;
    } else {
      var front = castleBody(g);
      banners = [[-4.2, 4.1, front + 0.72], [4.2, 4.1, front + 0.72]];
    }

    banners.forEach(function (p) { // стяги на передней стене
      var m = new T.Mesh(geo.bigBanner, mat.banner);
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(1.3, 1.3, 1);
      g.add(m);
    });

    // мелкие обломки, которые кружат вокруг замка: камешки из модели островов (крупно) или процедурные
    g.userData.rocks = [];
    for (i = 0; i < 5; i++) {
      var rock = new T.Group(), s = rand(1.6, 3.2), I = models.islands && models.islands[i % 2 ? 'mini_pine' : 'mini_flower'];
      if (I) {
        var rm = new T.Mesh(I.geo, mat.island);
        rm.scale.setScalar(s * 1.5);
        rock.add(rm);
      } else {
        var rb = new Bundle();
        rb.add(rockGeo(s, 0.15, s * 1.6, 7, 0.4, 40 + i), mat.rock, [0, -s * 0.8, 0]);
        rb.add(new T.CylinderGeometry(s * 0.95, s, 0.35, 7), mat.grass, [0, 0.1, 0]);
        rb.build(rock);
      }
      var side = i % 2 ? 1 : -1;
      rock.userData.base = new T.Vector3(side * rand(22, 34), rand(-6, 8), rand(-12, 10));
      rock.userData.phase = rand(0, 6);
      g.add(rock);
      g.userData.rocks.push(rock);
    }

    // облачное море под замком и тёплое свечение за ним
    var cb = new CloudBatch(12);
    g.userData.clouds = [];
    for (i = 0; i < 12; i++) g.userData.clouds.push({ i: cb.add(rand(30, 60), rand(0.85, 1)), x: rand(-110, 110), y: rand(-40, -27), z: rand(-50, 25) });
    g.add(cb.mesh);
    g.userData.cloudBatch = cb;
    var halo = new T.Sprite(glowSprite('#fff3d6', 0.22));
    halo.material.fog = false;
    halo.position.set(0, 14, -80);
    halo.scale.set(100, 70, 1);
    g.add(halo);
    g.userData.halo = halo;

    g.scale.setScalar(CONFIG.scenery.castle.scale);
    g.traverse(function (o) { o.layers.set(LAYER_FAR); }); // свой проход со слабой дымкой — замок не тонет в тумане дороги
    return g;
  }

  // процедурное тело замка (если модель не загрузилась); возвращает положение передней стены
  function castleBody(g) {
    var b = new Bundle(), S = mat.castle, i;
    b.add(rockGeo(17, 2, 24, 11, 0.28, 11), mat.rock, [0, -12.4, 0]);
    b.add(rockGeo(5, 0.4, 8, 7, 0.35, 12), mat.rock, [-8, -21, 3]);
    b.add(new T.CylinderGeometry(16.4, 16.8, 0.8, 11), mat.grass, [0, -0.25, 0]);

    var tower = function (x, z, r, h, roof) {
      b.add(cylGeo(r, r * 1.06, h, 12), S, [x, h / 2, z]);
      b.add(cylGeo(r * 1.16, r * 1.16, 0.7, 12), S, [x, h + 0.35, z]);
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * Math.PI * 2;
        b.add(boxGeo(0.55, 0.6, 0.55), S, [x + Math.cos(a) * r * 1.1, h + 0.95, z + Math.sin(a) * r * 1.1], [0, -a, 0]);
      }
      b.add(new T.ConeGeometry(r * 1.25, roof, 12), mat.roof, [x, h + 0.7 + roof / 2, z]);
      b.add(boxGeo(0.45, 1.1, 0.12), mat.window, [x, h * 0.62, z + r * 0.98]);
      if (h > 9) { // флаг на высоких башнях
        var top = h + 0.7 + roof;
        b.add(new T.CylinderGeometry(0.07, 0.07, 2.2, 5), mat.pole, [x, top + 1, z]);
        b.add(flagGeo(), mat.flag, [x, top + 1.7, z]);
      }
    };

    // шестиугольная стена с зубцами, башни по углам; передняя грань смотрит на нас
    var R0 = 10.5, n = 6;
    for (i = 0; i < n; i++) {
      var a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      var x0 = Math.cos(a0) * R0, z0 = Math.sin(a0) * R0, x1 = Math.cos(a1) * R0, z1 = Math.sin(a1) * R0;
      var len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0)), ang = Math.atan2(z1 - z0, x1 - x0);
      var mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      b.add(boxGeo(len, 4.4, 1.4), S, [mx, 2.2, mz], [0, -ang, 0]);
      for (var k = 0; k < 7; k++) {
        var t = (k + 0.5) / 7 - 0.5;
        b.add(boxGeo(0.7, 0.75, 1.5), S, [mx + Math.cos(ang) * t * len, 4.75, mz + Math.sin(ang) * t * len], [0, -ang, 0]);
      }
      tower(x0, z0, 1.9, i === 1 || i === 2 ? 9.5 : 7.5, 4.2);
    }
    var front = R0 * Math.cos(Math.PI / 6);
    b.add(boxGeo(2.6, 3.2, 0.5), mat.dark, [0, 1.6, front + 0.55]);
    tower(-2.6, front + 0.4, 1.2, 6.2, 2.8);
    tower(2.6, front + 0.4, 1.2, 6.2, 2.8);

    // донжон с угловыми башенками и центральной башней
    b.add(boxGeo(9, 11, 7), S, [0, 5.5, -2]);
    for (i = 0; i < 9; i++) b.add(boxGeo(0.7, 0.8, 0.7), S, [-4.2 + i * 1.05, 11.4, 1.45]);
    tower(-4.5, 1.5, 1.4, 14, 4.5);
    tower(4.5, 1.5, 1.4, 14, 4.5);
    tower(-4.5, -5.5, 1.4, 13, 4.2);
    tower(4.5, -5.5, 1.4, 13, 4.2);
    tower(0, -2.5, 2.4, 20, 6.5);
    for (i = 0; i < 3; i++) b.add(boxGeo(0.6, 1.3, 0.12), mat.window, [-2.4 + i * 2.4, 7.5, 1.56]);
    for (i = 0; i < 7; i++) { // ёлки по краю острова
      var ta = Math.PI * (0.15 + i * 0.12) + (i > 3 ? Math.PI * 0.75 : 0), th = rand(2.6, 4);
      b.add(new T.ConeGeometry(th * 0.32, th, 6), mat.pine, [Math.cos(ta) * 14.2, th / 2, Math.sin(ta) * 14.2 * 0.95]);
    }
    b.build(g);
    return front;
  }

  function flagGeo() {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([0, 0.5, 0, 0, -0.5, 0, 1.8, 0.1, 0], 3));
    g.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0.5], 2));
    return g;
  }

  // общий низ острова по краю карты: ступени из крупных тёсаных блоков, скальный конус, трава сверху
  function islandBase(b, w, d, r, seed, rockMat) {
    [[1, 0.02, 1.15, 1], [0.78, -1.1, 1.1, 0.8], [0.52, -2.15, 1, 0.64]].forEach(function (t) {
      var gw = w * t[0], gd = d * t[0], cols = Math.max(2, Math.round(gw / 1.15)), rows = Math.max(2, Math.round(gd / 1.15)), bw = gw / cols, bd = gd / rows;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          var hh = t[2] * (1 + (r() - 0.5) * 0.18);
          b.add(geo.block, mat.block, [-gw / 2 + bw * (i + 0.5), t[1] - hh / 2 + (r() - 0.5) * 0.12, -gd / 2 + bd * (j + 0.5)], [0, (r() - 0.5) * 0.08, 0], [bw * 0.95, hh, bd * 0.95], stoneTint(r, t[3]), [r(), r()]);
        }
      }
    });
    b.add(rockGeo(Math.min(w, d) * 0.28, 0.1, 2.4, 7, 0.4, seed), rockMat || mat.rock, [(r() - 0.5) * 0.6, -4.3, 0]);
    b.add(boxGeo(w * 0.9, 0.16, d * 0.9), mat.grass, [0, 0.1, 0]);
    for (var k = 0; k < 6; k++) { // кочки травы по краю
      b.add(geo.ico, mat.grass, [(r() - 0.5) * w * 0.9, 0.12, (r() < 0.5 ? -1 : 1) * d * 0.44], [r(), r(), r()], [0.35 + r() * 0.3, 0.14, 0.3]);
    }
  }

  function addPine(b, x, z, h) {
    b.add(new T.ConeGeometry(h * 0.28, h, 6), mat.pine, [x, 0.14 + h * 0.55, z]);
    b.add(cylGeo(0.07, 0.1, 0.35, 5), mat.bark, [x, 0.3, z]);
  }

  function addTree(b, x, z, s) {
    b.add(cylGeo(0.12 * s, 0.2 * s, 1.3 * s, 6), mat.bark, [x, 0.14 + 0.65 * s, z]);
    [[0, 1.6, 0, 0.7], [0.45, 1.35, 0.15, 0.5], [-0.42, 1.4, -0.1, 0.52], [0.1, 1.35, -0.42, 0.48], [-0.1, 2.05, 0.1, 0.45]].forEach(function (c, i) {
      b.add(geo.ico, i % 2 ? mat.leafLight : mat.leaf, [x + c[0] * s, 0.14 + c[1] * s, z + c[2] * s], [i, i * 2, 0], c[3] * s);
    });
  }

  function addHouse(b, x, z, s) {
    b.add(boxGeo(1.1 * s, 0.9 * s, 0.9 * s), mat.plaster, [x, 0.14 + 0.45 * s, z]);
    [-1, 1].forEach(function (k) { // двускатная крыша
      b.add(boxGeo(1.25 * s, 0.08, 0.62 * s), mat.roofRed, [x, 0.14 + 1.07 * s, z + k * 0.22 * s], [k * 0.7, 0, 0]);
    });
    b.add(boxGeo(1.1 * s, 0.3 * s, 0.05), mat.plaster, [x, 0.14 + 1.0 * s, z]);
    b.add(boxGeo(0.22 * s, 0.26 * s, 0.04), mat.window, [x - 0.25 * s, 0.14 + 0.55 * s, z + 0.46 * s]);
    b.add(boxGeo(0.2 * s, 0.4 * s, 0.04), mat.pole, [x + 0.22 * s, 0.14 + 0.2 * s, z + 0.46 * s]);
    b.add(boxGeo(0.14 * s, 0.42 * s, 0.14 * s), mat.body, [x + 0.3 * s, 0.14 + 1.25 * s, z - 0.15 * s]);
  }

  // то, что на островах движется, — общее для модели из Blender и процедурных островов; at — точка крепления
  function addBlades(g, at) { // крылья мельницы
    var blades = new T.Group(), bb = new Bundle();
    for (var i = 0; i < 4; i++) {
      var ba = i * Math.PI / 2;
      bb.add(boxGeo(0.1, 2.5, 0.06), mat.bark, [Math.sin(ba) * 1.25, Math.cos(ba) * 1.25, 0], [0, 0, -ba]);
      bb.add(boxGeo(0.55, 1.7, 0.02), mat.sail, [Math.sin(ba) * 1.45 + Math.cos(ba) * 0.3, Math.cos(ba) * 1.45 - Math.sin(ba) * 0.3, 0.03], [0, 0, -ba]);
    }
    bb.add(geo.sphereLow, mat.pole, [0, 0, 0], null, 0.18);
    bb.build(blades);
    blades.position.set(at[0], at[1], at[2]);
    g.add(blades);
    return blades;
  }

  function addWaterfall(g, fallAt, sprayAt) { // струи (текстура прокручивается) и облачко брызг внизу
    var fg = new T.PlaneGeometry(1.2, 10);
    fg.translate(0, -5, 0); // верх — у кромки острова (как у прежней струи 6.5 м)
    var fall = new T.Mesh(fg, mat.waterfall);
    fall.position.set(fallAt[0], fallAt[1] + 3.25, fallAt[2]);
    g.add(fall);
    var spray = cloudSprite(4.2, 0.45); // туман брызг — там, где струя уже тает
    spray.position.set(sprayAt[0], sprayAt[1] - 0.8, sprayAt[2]);
    g.add(spray);
  }

  function addFlag(g, at) { // полотнище стяга — покачивается
    var cloth = new T.Mesh(geo.bigBanner, mat.banner);
    cloth.position.set(at[0], at[1], at[2]);
    g.add(cloth);
    return cloth;
  }

  // остров из модели (Blender, islands.glb): один меш; точки для крыльев, водопада и стяга — в его extras
  function islandModel(theme) {
    var I = models.islands[theme], g = new T.Group(), anim = {}, x = I.extras;
    g.add(new T.Mesh(I.geo, mat.island));
    if (x.hub) anim.blades = addBlades(g, x.hub);
    if (x.fall) {
      addWaterfall(g, x.fall, x.spray);
      anim.water = x.fall; // шум воды (updateAmbience)
    }
    if (x.flag) anim.cloth = addFlag(g, x.flag);
    g.userData.anim = anim;
    return g;
  }

  // остров по краю карты одного из семи видов
  function buildIsland(theme, seed) {
    if (models.islands && models.islands[theme]) return islandModel(theme);
    var r = prng(seed), g = new T.Group(), b = new Bundle(), i, w = 5 + r() * 3, d = 4 + r() * 2.5, anim = {};
    islandBase(b, w, d, r, seed, theme === 'crystal' ? mat.basalt : null);
    if (theme === 'ruins') { // обломки стены, башенка и стяг
      var bricks = 3 + (r() * 4 | 0);
      for (i = 0; i < bricks; i++) {
        var bw = 0.6 + r() * 0.6, bh = 0.5 + r() * 1.4;
        b.add(boxGeo(bw, bh, 0.7, true), mat.body, [-w / 2 + 0.6 + i * (w - 1.2) / bricks, bh / 2 + 0.1, -d / 2 + 0.6], [0, (r() - 0.5) * 0.3, 0]);
      }
      b.add(cylGeo(0.9, 1, 2.4, 10), mat.body, [w * 0.25, 1.3, -d * 0.1]);
      for (i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2;
        b.add(boxGeo(0.4, 0.45, 0.4), mat.body, [w * 0.25 + Math.cos(a) * 0.85, 2.7, -d * 0.1 + Math.sin(a) * 0.85], [0, -a, 0]);
      }
      var poleX = -w * 0.3, poleZ = d * 0.15;
      b.add(new T.CylinderGeometry(0.07, 0.08, 3.4, 6), mat.pole, [poleX, 1.8, poleZ]);
      b.add(boxGeo(1.2, 0.08, 0.08), mat.pole, [poleX + 0.55, 3.3, poleZ]);
      anim.cloth = addFlag(g, [poleX + 0.6, 3.26, poleZ]);
    } else if (theme === 'windmill') { // мельница: крылья крутятся
      b.add(cylGeo(0.75, 1.05, 3.2, 10), mat.plaster, [0, 1.74, -0.3]);
      b.add(new T.ConeGeometry(1.0, 1.3, 10), mat.roofRed, [0, 3.98, -0.3]);
      b.add(boxGeo(0.4, 0.7, 0.05), mat.pole, [0, 0.5, 0.68]);
      b.add(boxGeo(0.3, 0.32, 0.05), mat.window, [0, 2.2, 0.62]);
      addPine(b, w * 0.32, d * 0.2, 1.8);
      addTree(b, -w * 0.3, d * 0.15, 0.8);
      anim.blades = addBlades(g, [0, 3.3, 0.55]);
    } else if (theme === 'waterfall') { // пруд и водопад, срывающийся с края
      b.add(new T.CylinderGeometry(1.3, 1.3, 0.12, 18), mat.water, [0, 0.17, d * 0.18]);
      for (i = 0; i < 7; i++) {
        var wa = i / 7 * Math.PI * 2;
        b.add(geo.ico, mat.rock, [Math.cos(wa) * 1.45, 0.25, d * 0.18 + Math.sin(wa) * 1.45], [wa, wa, 0], 0.18 + r() * 0.12);
      }
      addPine(b, -w * 0.32, -d * 0.25, 2.2);
      addPine(b, w * 0.3, -d * 0.3, 1.6);
      addTree(b, w * 0.28, d * 0.1, 0.7);
      addWaterfall(g, [0, -3.1, d / 2 + 0.06], [0, -6.3, d / 2 + 0.3]);
      anim.water = [0, -3.1, d / 2];
    } else if (theme === 'village') { // домики с красными крышами — ночью светятся окна
      addHouse(b, -w * 0.22, -d * 0.1, 1);
      addHouse(b, w * 0.24, -d * 0.18, 0.8);
      if (r() < 0.6) addHouse(b, w * 0.05, d * 0.25, 0.7);
      addTree(b, -w * 0.38, d * 0.3, 0.7);
      for (i = 0; i < 6; i++) b.add(boxGeo(0.06, 0.4, 0.06), mat.pole, [-w * 0.45 + i * 0.4, 0.34, d * 0.44]);
      b.add(boxGeo(2.1, 0.05, 0.04), mat.pole, [-w * 0.45 + 1, 0.46, d * 0.44]);
    } else if (theme === 'tree') { // огромное дерево в цветах
      addTree(b, 0, 0, 2.1);
      for (i = 0; i < 9; i++) b.add(geo.sphereLow, mat.flower, [(r() - 0.5) * (w - 0.8), 0.2, (r() - 0.5) * (d - 0.8)], null, 0.09);
    } else if (theme === 'crystal') { // кристаллы — ночью светятся
      for (i = 0; i < 6; i++) {
        var h = i === 0 ? 2.4 : 0.8 + r() * 0.8;
        b.add(geo.octa, mat.crystalBig, [i === 0 ? 0 : (r() - 0.5) * (w - 1.2), 0.14 + h * 0.6, i === 0 ? 0 : (r() - 0.5) * (d - 1)], [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6], [h * 0.28, h, h * 0.28]);
      }
    } else if (theme === 'tower') { // башня мага с синей крышей и горящими окнами
      b.add(cylGeo(0.7, 0.9, 4.6, 10), mat.body, [0, 2.44, -0.2]);
      b.add(new T.TorusGeometry(0.85, 0.07, 6, 18), mat.iron, [0, 3.6, -0.2], [Math.PI / 2, 0, 0]);
      b.add(new T.ConeGeometry(1.05, 2.6, 10), mat.roofBlue, [0, 6.0, -0.2]);
      b.add(geo.sphereLow, mat.gold, [0, 7.4, -0.2], null, 0.16);
      for (i = 0; i < 3; i++) b.add(boxGeo(0.24, 0.42, 0.05), mat.window, [0, 1.3 + i * 1.3, 0.6]);
      addPine(b, w * 0.3, d * 0.2, 1.6);
    }
    b.build(g);
    g.userData.anim = anim;
    return g;
  }

  // воздушный шар в полосу
  function buildBalloon() {
    var g = new T.Group(), b = new Bundle();
    b.add(geo.sphere, mat.balloon, [0, 2.4, 0], null, [1.6, 1.85, 1.6]);
    b.add(new T.ConeGeometry(0.75, 0.9, 16, 1, true), mat.balloon, [0, 0.65, 0], [Math.PI, 0, 0]);
    b.add(boxGeo(0.6, 0.45, 0.6), mat.wood, [0, -0.45, 0]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      b.add(new T.CylinderGeometry(0.012, 0.012, 1.0, 3), mat.pole, [c[0] * 0.26, 0.15, c[1] * 0.26], [c[1] * 0.25, 0, -c[0] * 0.25]);
    });
    b.build(g);
    return g;
  }

  // дирижабль с крутящимся пропеллером
  function buildAirship() {
    var g = new T.Group(), b = new Bundle();
    b.add(geo.sphere, mat.canvas, [0, 0, 0], null, [3.2, 1.05, 1.05]);
    b.add(boxGeo(0.9, 0.9, 0.06), mat.roofRed, [-2.8, 0.55, 0], [0, 0, 0.5]);
    b.add(boxGeo(0.9, 0.06, 0.9), mat.roofRed, [-2.8, 0, 0]);
    b.add(boxGeo(1.4, 0.4, 0.55), mat.wood, [0.2, -1.25, 0]);
    b.add(boxGeo(0.06, 0.4, 0.06), mat.pole, [-0.4, -0.95, 0]);
    b.add(boxGeo(0.06, 0.4, 0.06), mat.pole, [0.8, -0.95, 0]);
    b.build(g);
    var prop = new T.Group(), pb = new Bundle();
    pb.add(boxGeo(0.06, 1.2, 0.14), mat.bark, [0, 0, 0]);
    pb.add(boxGeo(0.06, 0.14, 1.2), mat.bark, [0, 0, 0]);
    pb.build(prop);
    prop.position.set(-3.3, 0, 0);
    g.add(prop);
    g.userData.prop = prop;
    return g;
  }

  // крыло птицы: стреловидное, заострённое на конце; лежит в плоскости XZ, шарнир у тела, размах — вдоль +Z, полёт — к +X
  function birdWingGeo() {
    var s = new T.Shape();
    s.moveTo(0.1, 0);
    s.lineTo(-0.06, 0.6);
    s.lineTo(-0.24, 0.68);
    s.lineTo(-0.26, 0.55);
    s.lineTo(-0.15, 0);
    s.closePath();
    var g = new T.ShapeGeometry(s);
    g.rotateX(Math.PI / 2);
    return g;
  }

  // стайка птиц клином вдалеке: тела склеены в один меш (тело, голова, хвост-веер), десять крыльев — инстансы
  // (машут в flapFlock)
  function buildFlock() {
    var g = new T.Group(), b = new Bundle(), birds = [];
    for (var i = 0; i < 5; i++) {
      var row = Math.ceil(i / 2), p = new T.Vector3(-row * 0.9, 0, (i % 2 ? 1 : -1) * row * 0.8);
      b.add(geo.sphereLow, mat.crow, [p.x, p.y, p.z], null, [0.3, 0.085, 0.1]);
      b.add(geo.sphereLow, mat.crow, [p.x + 0.27, p.y + 0.035, p.z], null, 0.075);
      b.add(boxGeo(0.2, 0.015, 0.15), mat.crow, [p.x - 0.32, p.y + 0.01, p.z], [0, 0, 0.12]);
      birds.push({ p: p, phase: i * 0.7 });
    }
    b.build(g);
    var wings = new T.InstancedMesh(birdWingGeo(), mat.birdWing, birds.length * 2);
    wings.frustumCulled = false;
    g.add(wings);
    g.userData = { birds: birds, wings: wings, at: new T.Object3D() };
    return g;
  }

  function flapFlock(ud) {
    var a = ud.at;
    ud.birds.forEach(function (b, i) {
      var f = Math.sin(time * 9 + b.phase) * 0.7;
      [-1, 1].forEach(function (s, k) {
        a.position.copy(b.p);
        a.rotation.set(s < 0 ? f + Math.PI : -f, 0, 0); // левое крыло — то же крыло, развёрнутое на пол-оборота
        a.updateMatrix();
        ud.wings.setMatrixAt(i * 2 + k, a.matrix);
      });
    });
    ud.wings.instanceMatrix.needsUpdate = true;
  }

  // мелкий парящий камень у самой дороги — даёт параллакс рядом с котом
  function buildMini(seed) {
    var I = models.islands, kind = seed % 2 ? 'mini_pine' : 'mini_flower';
    if (I && I[kind]) { // из модели (Blender): с ёлкой или с цветами
      var m = new T.Group();
      m.add(new T.Mesh(I[kind].geo, mat.island));
      return m;
    }
    var g = new T.Group(), b = new Bundle(), r = prng(seed), s = 0.6 + r() * 0.6;
    b.add(rockGeo(s, 0.05, s * 1.5, 6, 0.45, seed), mat.rock, [0, -s * 0.75, 0]);
    b.add(new T.CylinderGeometry(s * 0.95, s, 0.18, 6), mat.grass, [0, 0.05, 0]);
    if (r() < 0.5) addPine(b, 0, 0, s * 1.6);
    else b.add(geo.sphereLow, mat.flower, [0, 0.2, 0], null, 0.12);
    b.build(g);
    return g;
  }

  var THEMES = ['ruins', 'windmill', 'waterfall', 'village', 'tree', 'crystal', 'tower'];
  var DECOR = [['balloon', 2, 150], ['airship', 1, 220], ['flock', 2, 180], ['mini', 13, 115]]; // вид, сколько, на каком отрезке дороги повторяется

  function buildScenery() {
    var S = CONFIG.scenery, i;
    castle = buildCastle();
    scene.add(castle);
    for (i = 0; i < S.islands; i++) {
      var is = { mesh: buildIsland(THEMES[i % THEMES.length], 1000 + i * 37), side: i % 2 ? 1 : -1, phase: rand(0, 6) };
      is.box = new T.Box3().setFromObject(is.mesh); // габарит модели (башня, крылья мельницы, вода) — облака его обходят
      scene.add(is.mesh);
      islands.push(is);
    }
    // свободные украшения неба: шары, дирижабль, птицы, камешки у дороги
    DECOR.forEach(function (k) {
      for (var n = 0; n < k[1]; n++) {
        var mesh = k[0] === 'balloon' ? buildBalloon() : k[0] === 'airship' ? buildAirship() : k[0] === 'flock' ? buildFlock() : buildMini(300 + n * 17);
        scene.add(mesh);
        decor.push({ kind: k[0], span: k[2], mesh: mesh, phase: rand(0, 6), side: n % 2 ? 1 : -1, box: k[0] === 'mini' ? new T.Box3().setFromObject(mesh) : null });
      }
    });
    // дальние облака — одной пачкой; рисуются первыми из прозрачного, под эффектами и огнями
    roadClouds = new CloudBatch(32);
    roadClouds.mesh.renderOrder = -1;
    scene.add(roadClouds.mesh);
    for (i = 0; i < 10; i++) { // облака по сторонам дороги: дают ощущение полёта вперёд (реже и прозрачнее — не заслоняют острова)
      var a0 = rand(0.4, 0.6);
      clouds.push({ i: roadClouds.add(rand(10, 20), a0), a0: a0, near: false });
    }
    for (i = 0; i < 9; i++) { // море облаков под дорогой — видно в просветах между островами
      clouds.push({ i: roadClouds.add(rand(16, 28), 0.6), a0: 0.6, near: false, low: true });
    }
    for (i = 0; i < 4; i++) { // близкие полупрозрачные облака у самой дороги — проносятся мимо камеры; спрайтами, чтобы ложиться поверх всего
      var nc = { s: cloudSprite(rand(5, 7.5), 0.22), near: true };
      scene.add(nc.s);
      clouds.push(nc);
    }
    for (i = 0; i < 9; i++) { // гряда облаков по бокам там, где дорога уходит в даль
      mist.push({ i: roadClouds.add(rand(20, 28), 0.5) });
    }
  }

  // солнце, луна и звёзды — в дальнем слое, вместе с замком
  function buildSky() {
    sky.sun = new T.Sprite(glowSprite('#fff1cf', 1));
    sky.sun.scale.set(80, 80, 1);
    sky.sunCore = new T.Sprite(glowSprite('#fffbe8', 1));
    sky.sunCore.scale.set(22, 22, 1);
    sky.moon = new T.Sprite(new T.SpriteMaterial({ map: tex.moon, transparent: true, depthWrite: false }));
    sky.moon.scale.set(24, 24, 1);
    sky.moonHalo = new T.Sprite(glowSprite('#c8d4ff', 0.5));
    sky.moonHalo.scale.set(70, 70, 1);
    var pos = [], v = new T.Vector3();
    for (var i = 0; i < 900; i++) {
      skyDir(rand(2, 72), rand(-85, 85), v).multiplyScalar(480);
      pos.push(v.x, v.y, v.z);
    }
    var sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    sky.stars = new T.Points(sg, new T.PointsMaterial({ map: tex.dot, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }));
    sky.stars.frustumCulled = false;
    [sky.sun, sky.sunCore, sky.moon, sky.moonHalo, sky.stars].forEach(function (o) {
      o.material.fog = false;
      o.layers.set(LAYER_FAR);
      o.renderOrder = -1;
      scene.add(o);
    });
  }

  function placeIsland(is, z) {
    is.z = z;
    is.x = is.side * rand(8, 15);
    is.y = groundAt(z) + rand(-6, 1.5);
    is.rot = rand(-0.6, 0.6);
    is.ampX = rand(0.3, 0.9);
    is.ampY = rand(0.3, 0.7);
    is.mesh.scale.setScalar(rand(0.85, 1.25));
  }

  function placeDecor(o, z) {
    var g = groundAt(z);
    o.z = z;
    if (o.kind === 'balloon') { o.x = o.side * rand(9, 18); o.y = g + rand(4, 11); }
    else if (o.kind === 'airship') { o.x = o.side * rand(16, 26); o.y = g + rand(9, 15); }
    else if (o.kind === 'flock') { o.x = rand(-30, 30); o.y = g + rand(7, 13); o.dir = pickOf([-1, 1]); }
    else { // мини-остров: несколько попыток найти место, где он не налезает на большой остров и ворота секиры
      o.mesh.scale.setScalar(rand(0.7, 1.3));
      for (var k = 0; k < 10; k++) {
        o.x = o.side * rand(4.8, 7.5 + k * 0.4);
        o.y = g + rand(-3, 1.5);
        if (miniClear(o)) break;
      }
    }
    o.mesh.rotation.y = o.kind === 'flock' ? 0 : rand(0, 6);
  }

  function miniClear(o) {
    var r = 1.5 * o.mesh.scale.x, i;
    for (i = 0; i < islands.length; i++) {
      var is = islands[i], R = 4.6 * is.mesh.scale.x;
      if (Math.abs(is.z - o.z) < R + r && Math.abs(is.x - o.x) < R + r + 1 && Math.abs(is.y - o.y) < R + r) return false;
    }
    for (i = 0; i < world.rows.length; i++) {
      var row = world.rows[i];
      if ((row.axe || row.gate) && Math.abs(row.z - o.z) < 1.5 + r) return false;
    }
    return true;
  }

  // Облако — плоскость, повёрнутая к камере: там, где сквозь неё проходит остров, видна резкая черта среза.
  // Поэтому облако тает, пока его плоскость режет остров (большой, мини или острова дороги), и снова
  // проявляется, когда разойдутся. Возвращает 0…1
  var cloudObstacles = [];
  // Облако — плоскость лицом к камере, а камера смотрит сверху вниз: плоскость наклонена к миру, и срез идёт
  // наискось. Поэтому всё считается в координатах камеры: у каждого острова, камешка и куска моста — габарит
  // (8 углов модели → вид камеры, min/max), облако гаснет, когда его плоскость входит в габарит по глубине
  // и по ширине-высоте
  var obstCorner = null;
  function collectObstacles() {
    var list = cloudObstacles, n = 0, i, V = obstCorner || (obstCorner = new T.Vector3()), inv;
    camera.updateMatrixWorld();
    inv = camera.matrixWorldInverse;
    var box = function (m, B, x0, x1, y0, y1, z0, z1) { // m — объект с матрицей (или null — мир), B — его локальный габарит
      var o = list[n] || (list[n] = {});
      o.x0 = o.y0 = o.z0 = Infinity;
      o.x1 = o.y1 = o.z1 = -Infinity;
      for (var c = 0; c < 8; c++) {
        V.set(c & 1 ? (B ? B.max.x : x1) : (B ? B.min.x : x0), c & 2 ? (B ? B.max.y : y1) : (B ? B.min.y : y0), c & 4 ? (B ? B.max.z : z1) : (B ? B.min.z : z0));
        if (m) V.applyMatrix4(m.matrix);
        V.applyMatrix4(inv);
        o.x0 = Math.min(o.x0, V.x); o.x1 = Math.max(o.x1, V.x);
        o.y0 = Math.min(o.y0, V.y); o.y1 = Math.max(o.y1, V.y);
        o.z0 = Math.min(o.z0, V.z); o.z1 = Math.max(o.z1, V.z);
      }
      n++;
    };
    for (i = 0; i < islands.length; i++) {
      islands[i].mesh.updateMatrix();
      box(islands[i].mesh, islands[i].box);
    }
    for (i = 0; i < decor.length; i++) if (decor[i].box) {
      decor[i].mesh.updateMatrix();
      box(decor[i].mesh, decor[i].box);
    }
    for (i = 0; i < world.rows.length; i++) { // кладка моста: три колонки, от плиты на 3 м вниз
      var r = world.rows[i];
      box(null, null, -3.8, 3.8, r.y - 3.1, r.y + 0.3, r.z - 1.4, r.z + 1.4);
    }
    list.length = n;
  }

  var cloudV = null;
  function cloudFade(x, y, z, size) {
    var V = cloudV || (cloudV = new T.Vector3()), hw = size * 0.4 + 0.4, hh = size * 0.58 * 0.38 + 0.4, k = 1;
    V.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    for (var i = 0; i < cloudObstacles.length; i++) {
      var o = cloudObstacles[i];
      if (o.x1 < V.x - hw || o.x0 > V.x + hw || o.y1 < V.y - hh || o.y0 > V.y + hh) continue;
      var gap = V.z < o.z0 ? o.z0 - V.z : V.z > o.z1 ? V.z - o.z1 : 0; // глубина до габарита; 0 — плоскость внутри
      k = Math.min(k, clamp((gap - 1.6) / 3, 0, 1));
    }
    return k;
  }

  function placeCloud(c, z) {
    c.z = z;
    if (c.near) {
      c.x = pickOf([-1, 1]) * rand(5.5, 9);
      c.y = cam.y + rand(1.5, 5);
    } else if (c.low) {
      c.x = rand(-18, 18);
      c.y = groundAt(z) - rand(7, 12);
    } else {
      c.x = pickOf([-1, 1]) * rand(10, 45);
      c.y = groundAt(z) + rand(-14, 6);
    }
    c.drift = rand(0.2, 0.6);
  }

  function placeMist(m, z) {
    m.z = z;
    m.x = pickOf([-1, 1]) * rand(12, 30); // по бокам: посередине облака рваными пятнами ложились на низ замка, а дальний
    // край дороги и без них тает в небе
    m.y = groundAt(z) + rand(-7, -2.5); // ниже уровня дороги: дорога уходит в облака, замок над ними
  }

  function resetScenery() {
    var S = CONFIG.scenery;
    islands.forEach(function (is, i) { placeIsland(is, 10 - i * S.islandStep); });
    decor.forEach(function (o) { placeDecor(o, cam.z - rand(8, o.span)); });
    clouds.forEach(function (c) {
      placeCloud(c, cam.z - (c.near ? rand(5, 60) : rand(10, 150)));
      c.fade = null; // видимость — заново от места (кадр до расстановки мог её испортить)
    });
    mist.forEach(function (m) { placeMist(m, cam.z - rand(96, 126)); });
  }

  var skyV = null;
  function updateScenery(dt) {
    var S = CONFIG.scenery, i;
    // замок держится на горизонте и плавно «левитирует» — сколько ни прыгай, ближе он не станет
    castle.position.set(0, camera.position.y + S.castle.drop + Math.sin(time * 0.35) * 0.9, camera.position.z - S.castle.ahead);
    castle.rotation.y = Math.sin(time * 0.12) * 0.05;
    castle.userData.rocks.forEach(function (r) {
      var b = r.userData.base, ph = r.userData.phase;
      r.position.set(b.x + Math.sin(time * 0.2 + ph) * 1.5, b.y + Math.sin(time * 0.45 + ph) * 1.2, b.z);
      r.rotation.y = time * 0.05 + ph;
    });
    var cb = castle.userData.cloudBatch;
    castle.userData.clouds.forEach(function (c) {
      c.x += dt * 0.8;
      if (c.x > 120) c.x = -120;
      cb.place(c.i, c.x, c.y, c.z);
    });

    islands.forEach(function (is) { // острова по краям медленно плывут и покачиваются
      if (is.z > cam.z + 14) placeIsland(is, is.z - S.islands * S.islandStep);
      var a = is.mesh.userData.anim;
      is.mesh.position.set(is.x + Math.sin(time * 0.22 + is.phase) * is.ampX, is.y + Math.sin(time * 0.5 + is.phase) * is.ampY, is.z);
      is.mesh.rotation.y = is.rot + Math.sin(time * 0.15 + is.phase) * 0.12;
      if (a.cloth) a.cloth.rotation.y = Math.sin(time * 1.8 + is.phase) * 0.3;
      if (a.blades) a.blades.rotation.z -= dt * 1.1;
    });
    tex.water.offset.y = time * 0.9;

    decor.forEach(function (o) {
      if (o.z > cam.z + 14) placeDecor(o, o.z - o.span);
      if (o.kind === 'flock') {
        o.x += o.dir * 3 * dt;
        if (Math.abs(o.x) > 40) o.dir = -o.dir;
        o.mesh.rotation.y = o.dir > 0 ? 0 : Math.PI;
        flapFlock(o.mesh.userData);
      } else if (o.kind === 'airship') {
        o.x += Math.sin(time * 0.1 + o.phase) * dt * 0.8;
        o.mesh.userData.prop.rotation.x += dt * 9;
      }
      o.mesh.position.set(o.x, o.y + Math.sin(time * 0.6 + o.phase) * (o.kind === 'mini' ? 0.3 : 0.6), o.z);
    });

    collectObstacles();
    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.drift * dt * (c.x > 0 ? 1 : -1) * 0.3;
      if (c.z > cam.z + (c.near ? 6 : 12)) {
        placeCloud(c, cam.z - (c.near ? rand(50, 70) : rand(140, 160)));
        c.fade = 0; // новое облако проявляется, а не выскакивает
      }
      var size = c.s ? c.s.scale.x : roadClouds.size[c.i], was = c.fade == null ? 1 : c.fade;
      var aim = cloudFade(c.x, c.y, c.z, size);
      c.fade = was + (aim - was) * smooth(aim < was ? 22 : 4, dt); // тает быстро (срез не успевает мелькнуть), проявляется плавно
      if (!(c.fade >= 0)) c.fade = null; // облако ещё не расставлено (NaN): в шейдер NaN не отдаём — в HDR-кадре он расползся бы
      if (c.s) {
        c.s.position.set(c.x, c.y, c.z);
        c.s.material.opacity = 0.22 * c.fade;
      } else {
        roadClouds.place(c.i, c.x, c.y, c.z);
        roadClouds.alpha[c.i] = c.a0 * c.fade;
      }
    }
    roadClouds.mesh.geometry.attributes.cloudAlpha.needsUpdate = true;
    mist.forEach(function (m) { // гряда всё время впереди: кот её не догонит
      if (m.z > player.z - 80) placeMist(m, player.z - rand(110, 126));
      roadClouds.place(m.i, m.x, m.y, m.z);
    });

    // светила привязаны к камере — бесконечно далеко
    var cp = camera.position;
    skyV = skyDir(day.sunEl, day.sunAz, skyV || new T.Vector3());
    sky.sun.position.copy(cp).addScaledVector(skyV, 460);
    sky.sunCore.position.copy(sky.sun.position);
    var sunVis = clamp((day.sunEl + 4) / 6, 0, 1);
    sky.sun.material.opacity = sunVis * 0.85;
    sky.sunCore.material.opacity = sunVis;
    sky.sun.material.color.copy(day.sun);
    skyDir(day.moonEl, day.moonAz, skyV);
    sky.moon.position.copy(cp).addScaledVector(skyV, 450);
    sky.moonHalo.position.copy(sky.moon.position);
    var moonVis = clamp(day.moonEl / 6, 0, 1);
    sky.moon.material.opacity = moonVis;
    sky.moonHalo.material.opacity = moonVis * 0.45;
    sky.stars.position.copy(cp);
    sky.stars.material.opacity = day.stars;
  }


  /* ---------- Частицы ---------- */


  function Particles(cap, map, additive) {
    var g = new T.BufferGeometry();
    this.cap = cap;
    this.list = [];
    this.pos = new Float32Array(cap * 3);
    this.tint = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('tint', new T.BufferAttribute(this.tint, 4).setUsage(T.DynamicDrawUsage));
    g.setAttribute('size', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = new T.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 500 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    this.points = new T.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  Particles.prototype.emit = function (p) {
    if (this.list.length >= this.cap) this.list.shift();
    p.max = p.life;
    this.list.push(p);
  };

  Particles.prototype.clear = function () { this.list.length = 0; };

  // сколько частиц выпустить за кадр, чтобы выходило rate в секунду (не «по стольку-то за кадр»: на 120 Гц было бы вдвое ярче)
  function emitCount(rate, dt) { return Math.floor(rate * dt + Math.random()); }

  Particles.prototype.update = function (dt) {
    var list = this.list, n = 0, i, p;
    for (i = list.length - 1; i >= 0; i--) {
      list[i].life -= dt;
      if (list[i].life <= 0) list.splice(i, 1);
    }
    for (i = 0; i < list.length; i++) {
      p = list[i];
      var k = 1 - p.life / p.max, dr = Math.exp(-p.drag * dt);
      if (p.fire) fireColor(k, p.c);
      p.vy -= p.grav * dt;
      p.vx *= dr;
      p.vy *= dr;
      p.vz *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.tint[n * 4] = p.c[0];
      this.tint[n * 4 + 1] = p.c[1];
      this.tint[n * 4 + 2] = p.c[2];
      this.tint[n * 4 + 3] = p.a * Math.min(1, k / 0.12) * (1 - k);
      this.size[n] = p.size * (1 + p.grow * k);
      n++;
    }
    var a = this.geometry.attributes;
    a.position.needsUpdate = a.tint.needsUpdate = a.size.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  };

  function dust(x, y, z, n) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), s = rand(1.2, 2.6);
      fxDust.emit({ x: x + Math.cos(a) * 0.3, y: y + 0.05, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: rand(0.3, 1.2), vz: Math.sin(a) * s * 0.6, grav: -1, drag: 4, life: rand(0.35, 0.6), size: rand(0.3, 0.5), grow: 1.4, c: [0.96, 0.93, 0.86], a: 0.75 });
    }
  }

  function sparkle(x, y, z, c, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), e = rand(-1, 1), s = rand(0.4, 1) * speed;
      fxGlow.emit({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: e * s + 0.6, vz: Math.sin(a) * s * 0.5, grav: 2, drag: 2.5, life: rand(0.35, 0.7), size: rand(0.22, 0.42), grow: -0.5, c: c, a: 1 });
    }
  }

  function chips(x, y, z, c, n) {
    for (var i = 0; i < n; i++) {
      fxDust.emit({ x: x + rand(-0.8, 0.8), y: y, z: z + rand(-0.8, 0.8), vx: rand(-2.5, 2.5), vy: rand(1, 4), vz: rand(-1, 1), grav: 16, drag: 0.6, life: rand(0.6, 1), size: rand(0.12, 0.22), grow: 0, c: c, a: 1 });
    }
  }

  function flames(x, y, z, w, n) {
    for (var i = 0; i < n; i++) {
      fxFire.emit({ x: x + rand(-w / 2, w / 2), y: y + 0.1, z: z + rand(-0.8, 0.8), vx: rand(-0.3, 0.3), vy: rand(2.2, 3.8), vz: rand(-0.3, 0.3), grav: -1.5, drag: 1.5, life: rand(0.45, 0.8), size: rand(0.7, 1.2), grow: 0.9, c: [1, 1, 1], a: 0.85, fire: true });
    }
  }

  // Пламя — плоскость, всегда повёрнутая к камере (как спрайт); язык огня рисует шейдер: шум бежит вверх, рвёт
  // края и кончик, язык колышется, цвет — от белого ядра через оранжевый к тёмно-красному. Время общее (fireTime),
  // у каждого языка своё смещение — по его месту в мире. Туман гасит огонь вдали (огонь складывается со светом,
  // поэтому туман не подмешивается, а убирает яркость). Основание языка — в начале координат, высота — scale.y

  function flameMaterial() {
    var u = T.UniformsUtils.merge([T.UniformsLib.fog]);
    u.uTime = fireTime;
    return new T.ShaderMaterial({ uniforms: u, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, fog: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  }

  function flameMesh() {
    var m = new T.Mesh(geo.flame, mat.flame);
    m.frustumCulled = false; // язык повёрнут к камере в шейдере — габарит плоскости тут не годится
    m.renderOrder = 2;
    return m;
  }

  // языки огня на горящей колонке босса — из пула: зажглись, пока горит, погасли — в пул
  function scorchFlames(p, on) {
    if (on && !p.scorchF) {
      p.scorchF = [];
      for (var i = 0; i < 3; i++) p.scorchF.push(acquire('flame', flameMesh));
    }
    if (!on && p.scorchF) {
      p.scorchF.forEach(release);
      p.scorchF = null;
    }
    if (!p.scorchF) return;
    p.scorchF.forEach(function (f, k) {
      var h = 1.5 + Math.sin(time * 13 + k * 2.1) * 0.3;
      f.position.set(p.x + (k - 1) * p.w * 0.3, p.ry != null ? p.ry : p.y, p.z + (k - 1) * 0.3);
      f.scale.set(1.1, h * 1.7, 1);
    });
  }

  // клубы огня (взрывы, струя дракона, вспышки): мягкий шум; с возрастом — от жёлто-белого к красному и в дым
  function paintPuff() {
    var s = 64, c = makeCanvas(s, s), x = c.getContext('2d'), r = prng(77);
    for (var i = 0; i < 14; i++) {
      var px = 32 + (r() - 0.5) * 22, py = 32 + (r() - 0.5) * 22, rad = 10 + r() * 14, g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    }
    return toTexture(c, { srgb: false, repeat: false });
  }

  var FIRE_RAMP = [[1, 0.92, 0.6], [1, 0.5, 0.08], [0.55, 0.1, 0.02], [0.16, 0.12, 0.12]];
  function fireColor(k, out) {
    var f = Math.min(2.999, k * 3), i = f | 0, t = f - i, a = FIRE_RAMP[i], b = FIRE_RAMP[i + 1];
    out[0] = lerp(a[0], b[0], t);
    out[1] = lerp(a[1], b[1], t);
    out[2] = lerp(a[2], b[2], t);
    return out;
  }


  /* ---------- Игрок, прыжки, ловушки, удар мечом ---------- */

  function resetPlayer() {
    player = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, pace: 1, ground: 0, maxDist: 0, target: null,
      lives: maxLives(), coins: 0, invuln: 0, squash: 0, flip: -1, dead: false, rescue: 0, wait: 0, from: null, ouch: 0, cheer: 0,
      swing: null, swingQueued: false, swingNext: 0, chainT: 0, attackCd: 0, // удар мечом: текущий взмах, тап в очереди, следующий в серии, окно серии
      combo: 0, bestCombo: 0, lane: 1, switches: 0, // серия; колонка прошлого приземления (−1 — ездящий остров); смен колонки подряд
      fromCrate: false, airStomps: 0, airSword: false, // за этот полёт: прыжок с батута, сбито летунов прыжком, сбит ли кто-то мечом
      trick: null, tricks: 0,                         // трюк в воздухе: текущий и сколько докручено за полёт
      fury: 0, furyMeter: 0, shield: false,           // «Рыцарская ярость»: сколько ещё длится, шкала 0…1; щит серии
      slip: false,                                    // приземлился на лёд — до следующего приземления рулить трудно
      flight: null, glide: null,                      // крылья грифона: полёт; после него — остров, к которому кот планирует
      magnet: 0, double: 0, bubble: false,            // бонусы: магнит и монеты ×2 — сколько ещё, с; пузырь
      move: 'hop', grounded: false, slide: 0, slideQueued: false, slipT: 0 // раннер: прыжки или бег; на земле; подкат, с; лёд, с
    };
    if (Shop.upgrade('shield')) player.shield = true; // улучшение «щит со старта»
  }

  // Комбо. Очки серии дают точные приземления — в центр острова: со сменой колонки +1, на ездящий остров +2,
  // на «бешеный» +3, после батута +2 («Высший пилотаж»); сверху — «Зигзаг!», «Дерзко!», «Рыцарский приём!»
  // и докрученные трюки. Точно, но в той же колонке — серия стоит. Каждые step очков — множитель монет +1 (до max).
  // Промах мимо центра, сорванный трюк, ловушка или падение обнуляют серию, если не спасут «Ярость» или щит
  function comboMult() {
    var C = CONFIG.combo;
    return Math.min(C.max, 1 + Math.floor(player.combo / C.step));
  }

  function addCoins(n) {
    n *= comboMult() * (player.double > 0 ? 2 : 1);
    player.coins += n;
    return n;
  }

  function coinsWord(n) {
    return n + ' ' + plural(n, [tr('coin.1'), tr('coin.2'), tr('coin.5')]);
  }

  var taught = {}; // подсказки о правилах — по разу за запуск, не каждую попытку
  function teach(key, text) {
    if (taught[key]) return;
    taught[key] = true;
    toast(text, 2600);
  }

  // приземление на остров (не на батут): что засчитать в серию
  function judgeLanding(p, top, hurt) {
    var C = CONFIG.combo, P = player, moving = p.type === 'move' || p.type === 'fast', lane = moving ? -1 : p.lane;
    var crashed = !!P.trick, perfect = !hurt && !crashed && Math.abs(P.x - p.x) <= C.perfect, changed = moving || lane !== P.lane;
    var gain = 0, coins = 0, tags = [];
    if (!hurt) { // ловушка — серию уже решил loseLife (или её спасла ярость)
      if (p.type === 'fire' && firePhase(p) < C.dare) { // пламя только что погасло
        gain++;
        tags.push(tr('tag.dare'));
        note('dare');
      }
      if (perfect) {
        if (P.fromCrate) { gain += 2; tags.unshift(tr('tag.pilot')); note('pilot'); }
        else if (p.type === 'fast') { gain += 3; tags.unshift(tr('tag.fast')); }
        else if (p.type === 'move') { gain += 2; tags.unshift(tr('tag.move')); }
        else if (changed) { gain++; tags.unshift(tr('tag.exact')); }
        else teach('lane', tr('teach.lane'));
        P.switches = changed ? P.switches + 1 : 0;
        if (changed && P.switches % C.zigzag === 0) { gain++; tags.push(tr('tag.zigzag')); note('zigzag'); }
        if (P.airSword) { gain++; tags.push(tr('tag.knight')); note('knight'); }
        if (P.tricks) {
          gain += P.tricks;
          coins += CONFIG.trick.coins * P.tricks * P.tricks;
          tags.push(P.tricks > 1 ? tr('tag.tricks', { n: P.tricks }) : tr('tag.trick'));
          note('trick');
          track('trick', P.tricks);
        }
      } else {
        P.switches = 0;
      }
    }
    var lost = !perfect && !hurt && (P.tricks > 0 || crashed);
    if (crashed) {
      P.squash = 1.25; // недокрутил — плюхнулся
      note('crash');
    }
    P.lane = lane;
    P.fromCrate = P.airSword = false;
    P.airStomps = P.tricks = 0;
    P.trick = null;
    if (gain) comboAdd(gain, top, tags, coins);
    else if (!perfect && !hurt) comboBreak(crashed ? tr('break.crash') : lost ? tr('break.trick') : null);
  }

  function comboAdd(gain, top, tags, coins) {
    var P = player, was = comboMult();
    P.combo += gain;
    P.bestCombo = Math.max(P.bestCombo, P.combo);
    var mult = comboMult(), up = mult > was, won = coins ? addCoins(coins) : 0;
    var sub = (up ? tags : tags.slice(1)).concat(gain > 1 ? [tr('tag.gain', { n: gain })] : [], won ? ['+' + coinsWord(won)] : []);
    sparkle(P.x, top + 0.15, P.z, [1, 0.85, 0.35], up ? 26 : 8 + mult * 2, up ? 4.5 : 2.6);
    Sound.perfect(Math.min(P.combo, 8), up);
    vibrate(up ? 30 : 10);
    popText(up ? tr('combo.up', { n: mult }) : tags[0], sub.join(' · '), up);
    teach('combo', tr(player.move === 'run' ? 'teach.comboRun' : 'teach.combo', { n: CONFIG.combo.step }));
    note('series');
    furyFill(gain);
  }

  // серия оборвалась — если её не спасут «Ярость» (прощает первую ошибку) или щит
  function comboBreak(why) {
    var P = player;
    if (P.combo > 0 && !P.dead && forgive()) return;
    if (P.combo >= CONFIG.combo.step) el.combo.classList.add('is-broken'); // плашка вздрагивает и гаснет
    if (why) popText(why, P.combo > 0 ? tr('combo.lost') : '', false);
    P.combo = P.switches = 0;
  }

  function forgive() {
    var P = player;
    if (P.fury > 0) {
      endFury(true);
      return true;
    }
    if (P.shield) {
      P.shield = false;
      sparkle(P.x, P.y + 1, P.z, [0.55, 0.8, 1], 22, 4);
      chips(P.x, P.y + 1, P.z, [0.3, 0.5, 0.95], 10);
      Sound.shieldBreak();
      note('shieldSave');
      popText(tr('shield.saved'), '', true);
      return true;
    }
    return false;
  }

  // «Рыцарская ярость»: очки серии копят шкалу; полная — кот светится, монеты сами летят к нему,
  // первая ошибка (промах или удар) прощается, музыка громче и бодрее
  function furyFill(gain) {
    var P = player;
    if (P.fury > 0) return;
    P.furyMeter = Math.min(1, P.furyMeter + gain / Shop.upgrade('fury'));
    if (P.furyMeter >= 1) startFury();
  }

  function startFury() {
    player.fury = CONFIG.fury.time;
    el.game.classList.add('is-fury');
    sparkle(player.x, player.y + 1, player.z, [1, 0.8, 0.3], 36, 6);
    Sound.fury(true);
    vibrate(60);
    popText(tr('fury'), tr('fury.sub'), true);
    teach('fury', tr('teach.fury'));
    note('fury');
  }

  function endFury(saved) {
    var P = player;
    P.fury = P.furyMeter = 0;
    el.game.classList.remove('is-fury');
    Sound.fury(false);
    if (saved) {
      sparkle(P.x, P.y + 1, P.z, [1, 0.8, 0.3], 30, 5);
      popText(tr('fury.saved'), tr('fury.saved.sub'), true);
      note('furySave');
    }
  }

  function updateFury(dt) {
    var P = player;
    if (P.fury <= 0) return;
    P.fury -= dt;
    P.furyMeter = Math.max(0, P.fury / CONFIG.fury.time);
    if (P.fury <= 0) {
      endFury(false);
      return;
    }
    attractCoins(dt, CONFIG.fury.magnet); // магнит: монеты рядом летят к коту
    if (Math.random() < dt * 24) sparkle(P.x + rand(-0.4, 0.4), P.y + rand(0.3, 1.6), P.z + 0.2, [1, 0.8, 0.3], 1, 0.6);
  }

  // Трюк в прыжке (свайп вверх, на клавиатуре ↑): сальто, затем винт, снова сальто… Докрученные трюки
  // засчитываются при точном приземлении (+1 к серии и монеты за каждый), при неточном — сгорают;
  // приземлился, не докрутив, — «Сорвался!»
  function startTrick() {
    var P = player;
    if (state === 'play' && !P.dead && P.move === 'run' && P.grounded && !P.flight) return runJump(); // на виадуке с земли — прыжок
    if (state !== 'play' || P.dead || P.wait > 0 || P.trick || P.flip >= 0) return;
    P.trick = { kind: P.tricks % 2 ? 'twist' : 'flip', t: 0 };
    P.swing = null; // удар и трюк не смешиваются: начатый удар трюк обрывает
    P.swingQueued = false;
    Sound.trick();
    vibrate(8);
  }

  function updateTrick(dt) {
    var P = player;
    if (!P.trick) return;
    P.trick.t += dt;
    if (P.trick.t < CONFIG.trick.time) return;
    P.trick = null;
    P.tricks++;
    sparkle(P.x, P.y + 1, P.z, [1, 0.92, 0.6], 6, 1.6);
  }

  // Жизни: полный запас — CONFIG.lives и улучшение лавки «жизнь сверху». Вернуть потерянную — сердце над дорогой
  // (появляется, только пока жизней меньше полного, не чаще раза в 260–380 м) или победа над боссом. Решение — по
  // Math.random, не по зерну уровня: раскладка уровня кампании не зависит от того, сколько жизней у кота
  function lossInfo(kind) { // ?debug: обстановка при потере жизни — ряды рядом с котом, связка, бочки
    var P = player;
    return { kind: kind, z: +P.z.toFixed(1), x: +P.x.toFixed(2), y: +P.y.toFixed(2), vy: +P.vy.toFixed(1), move: P.move, slide: P.slide > 0, plan: world.runPlan.length,
      rows: world.rows.filter(function (r) { return r.road && r.z < P.z + 4 && r.z > P.z - 14; }).map(function (r) {
        return (r.z - P.z).toFixed(1) + ':' + [0, 1, 2].map(function (l) {
          if (r.gaps.indexOf(l) >= 0) return 'gap';
          var p = r.plats.filter(function (q) { return q.lane === l; })[0];
          return !p ? '-' : p.obstacle ? p.obstacle.kind : p.keg ? 'keg' : p.dog ? 'dog' : p.type !== 'stone' ? p.type : r.upper && r.upper.lane === l ? 'deck' : '.';
        }).join(',') + (r.axe ? ' axe' : '');
      }),
      rollers: world.rollers.filter(function (r) { return !r.done; }).map(function (r) { return (r.z - P.z).toFixed(1) + '@' + r.lane; }) };
  }

  function maxLives() { return CONFIG.lives + Shop.upgrade('life'); }

  function heartDue(dist) {
    if (player.lives >= maxLives() || dist < world.heartNext || Math.random() > 0.3) return false;
    world.heartNext = dist + rand(260, 380);
    return true;
  }

  // щит серии над островом: подобрал — следующий обрыв серии не случится
  // подбор над островом: щит серии или перо грифона (kind)
  function addPickup(row, kind) {
    codexSeen('bonus', kind);
    var p = row.plats.filter(function (q) { return q.type === 'stone' && !q.crate && !q.dog && !q.keg; })[0];
    if (!p) return;
    var mesh = kind === 'wings' ? acquire('feather', buildFeather) : kind === 'shield' ? acquire('shieldPickup', buildShieldPickup) : acquire('bonus_' + kind, function () { return buildBonus(kind); });
    world.pickups.push({ kind: kind, x: p.x, y: row.y + 1.25, z: row.z, mesh: mesh, t: rand(0, 6), taken: false, done: false });
  }

  // Крылья грифона: подобрал золотое перо — у кота вырастают крылья, он взмывает над дорогой и несколько секунд
  // летит, собирая дорожку монет, что вьётся змейкой между колонками (рулить, как обычно); ловушки и враги внизу
  // не страшны. В конце крылья складываются и кот планирует на надёжный остров впереди (сам подруливает к нему)
  function buildFeather() {
    var g = new T.Group();
    if (models.traps && models.traps.feather) attach(g, models.traps.feather, 0, 0, 0, {}, { plain: 1 });
    else new Bundle().add(new T.ConeGeometry(0.17, 0.8, 6), mat.gold, [0, 0.1, 0], null, [1, 1, 0.15]).build(g, { cast: true });
    g.rotation.z = 0.35;
    var halo = new T.Sprite(mat.featherGlow);
    halo.scale.set(1.8, 1.8, 1);
    halo.position.z = -0.1;
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  function startFlight() {
    var P = player, W = CONFIG.wings;
    P.flight = { t: Shop.upgrade('wings'), nextZ: P.z - 6, k: 0, flap: 0 };
    P.target = null; // пока летит — не падает и не приземляется
    P.trick = null;
    P.tricks = 0;
    P.vy = 6;
    cat.wings.visible = true;
    sparkle(P.x, P.y + 1, P.z, [1, 0.85, 0.4], 30, 5);
    popText(tr('wings'), tr('wings.sub'), true);
    teach('wings', tr('teach.wings'));
    Sound.wings();
    vibrate(40);
    note('wings');
    track('wings');
  }

  // полёт: высота над дорогой, скорость вперёд, дорожка монет впереди; в конце — планирование на остров
  function flightStep(dt) {
    var P = player, F = P.flight, W = CONFIG.wings, half = CONFIG.lanes.half;
    var u = control();
    P.vx += (u * CONFIG.physics.speed - P.vx) * smooth(CONFIG.physics.accel, dt);
    P.x = clamp(P.x + P.vx * dt, -half, half);
    var alt = groundAt(P.z) + W.height, y0 = P.y;
    P.y += (alt - P.y) * smooth(2.4, dt);
    P.vy = (P.y - y0) / dt;
    P.vz = -W.speed;
    P.z += P.vz * dt;
    P.ground = P.y - 3.2; // камера держится рядом с котом
    if (-P.z > P.maxDist) P.maxDist = -P.z;
    while (F.nextZ > P.z - 46 && F.t > 1.6) { // дорожка монет вьётся змейкой — кончается до спуска
      F.k++;
      addCoin(Math.sin(F.k * 0.17) * CONFIG.lanes.x[2], groundAt(F.nextZ) + W.height + 0.95, F.nextZ, null, F.k * 0.45);
      F.nextZ -= W.gap;
    }
    if ((F.t -= dt) <= 0) endFlight();
  }

  // спуск: ближайший надёжный остров не ближе 12 м — к нему кот планирует, подруливая сам
  function endFlight() {
    var P = player, row = rowAhead(P.z, 12), p = safePlatform(row);
    while (!p) {
      row = rowAt(row.i + 1);
      p = safePlatform(row);
    }
    P.flight = null;
    P.move = 'hop'; // спуск — прыжком; на виадук кот приземлится и побежит
    P.grounded = false;
    P.slide = 0;
    P.glide = p;
    P.ground = row.y;
    P.vy = 2;
    P.pace = row.pace;
    aim(row);
    P.fromCrate = true; // точное приземление после полёта — «Высший пилотаж»
    P.lane = -1;
    cat.wings.visible = false;
    sparkle(P.x, P.y + 1, P.z, [1, 0.85, 0.4], 16, 3);
  }


  function updatePickups(dt) {
    world.pickups.forEach(function (o) {
      var m = o.mesh;
      o.t += dt;
      if (o.taken) {
        o.k = Math.min(1, (o.k || 0) + dt / 0.3);
        m.scale.setScalar(1 + o.k * 0.8);
        m.position.set(o.x, o.y + o.k, o.z);
        if (o.k >= 1) o.done = true;
      } else {
        m.scale.setScalar(1);
        m.position.set(o.x, o.y + Math.sin(o.t * 2.4) * 0.12, o.z);
      }
      m.rotation.y = o.t * 2.2;
      m.userData.halo.material.opacity = 0.45 + Math.sin(o.t * 5) * 0.15;
    });
  }

  function collectShield(o) {
    var P = player;
    o.taken = true;
    sparkle(o.x, o.y, o.z, [0.55, 0.8, 1], 18, 3.5);
    Sound.shield();
    note('shield');
    vibrate(20);
    if (P.shield) {
      var won = addCoins(5);
      popText(tr('shield'), '+' + coinsWord(won), false);
      return;
    }
    P.shield = true;
    popText(tr('shield.got'), tr('shield.got.sub'), true);
  }

  function control() {
    if (BOT) return botControl();
    var k = input.keys, kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    if (kx) return kx;
    if (input.touches.length) return input.touches[input.touches.length - 1].dir;
    if (input.tilt || input.motion) {
      var Tl = CONFIG.tilt, u = input.tx - input.cx, m = Math.abs(u);
      if (m < Tl.dead) return 0;
      return (u > 0 ? 1 : -1) * Math.min(1, (m - Tl.dead) / (Tl.full - Tl.dead));
    }
    return 0;
  }

  // автопилот для проверки (?debug&bot): рулит к безопасному месту целевого ряда, бьёт пса мечом
  function botTarget(p) {
    if (p.broken || p.type === 'wood' || p.scorch) return null;
    var left = player.target ? Math.max(0, flightTime(player.vy, CONFIG.physics.gravity * player.pace * player.pace, player.y, p.y)) : 0; // до приземления, с
    if (p.type === 'fire') {
      var F = CONFIG.fire, c = ((firePhase(p) + left) % F.period + F.period) % F.period; // сравниваем с моментом приземления
      if (c > F.period - F.burn - 0.1) return null;
    }
    if (p.type === 'ghost') {
      var Q = CONFIG.ghost, q = ((ghostPhase(p) + left) % Q.period + Q.period) % Q.period;
      if (q > Q.period - Q.gone - 0.15) return null;
    }
    if (p.row.axe) {
      var b = axeBlade(p.row, simTime + left);
      if (Math.abs(b.x - p.x) < 1.7 && b.y < p.row.y + 2.3) return null;
    }
    return p.type === 'spike' ? p.x - p.side * p.w * 0.3 : p.x;
  }

  // серия растёт только при смене колонки — автопилот предпочитает чужую колонку, если там безопасно;
  // в трети прыжков крутит трюк, если до приземления хватает времени
  var botJump = { row: null, trick: false };
  function botControl() {
    if (player.flight) { // в полёте — по дорожке монет (и когда крылья подобраны на бегу)
      var next = null;
      world.coins.forEach(function (c) { if (!c.taken && c.z < player.z - 1 && (!next || c.z > next.z)) next = c; });
      return next ? clamp((next.x - player.x) * 1.5, -1, 1) : 0;
    }
    if (player.move === 'run') return botRun();
    var row = player.target, best = null, bestScore = 0;
    if (!row) return 0;
    if (row !== botJump.row) {
      botJump.row = row;
      botJump.trick = Math.random() < 0.3;
    }
    row.plats.forEach(function (p) {
      var tx = botTarget(p), score = tx == null ? 0 : Math.abs(tx - player.x) + (p.lane === player.lane && p.type === 'stone' ? 4 : 0);
      if (tx != null && (best == null || score < bestScore)) {
        best = tx;
        bestScore = score;
      }
    });
    if (best == null) { // безопасного нет — лучше принять удар, чем упасть: к ближайшему острову
      row.plats.forEach(function (p) { if (!p.broken && (best == null || Math.abs(p.x - player.x) < Math.abs(best - player.x))) best = p.x; });
      if (best == null) return 0;
    }
    row.plats.forEach(function (p) {
      if ((p.dog && !p.dog.down || p.keg && !p.keg.done) && Math.abs(p.x - player.x) < 1.5 && player.z - p.z < 3) startAttack();
    });
    var fire = false; // огненный шар близко — рубим (отбиваем)
    world.fireballs.forEach(function (f) {
      if (f.done || f.back) return;
      fire = true;
      if (player.z - f.z < 4.2 && f.z < player.z + 0.5 && Math.abs(f.x - player.x) < 2.5) startAttack();
    });
    var g = CONFIG.physics.gravity * player.pace * player.pace;
    if (botJump.trick && !fire && !player.trick && !player.tricks && flightTime(player.vy, g, player.y, row.y) > CONFIG.trick.time + 0.2) startTrick();
    return clamp((best - player.x) * 1.5, -1, 1);
  }

  // скорость вперёд подбирается так, чтобы кот приземлился ровно на центр ряда row
  function aim(row) {
    var g = CONFIG.physics.gravity * player.pace * player.pace;
    player.target = row;
    player.vz = (row.z - player.z) / Math.max(0.25, flightTime(player.vy, g, player.y, row.y));
  }

  function physicsStep(dt) {
    var P = CONFIG.physics, half = CONFIG.lanes.half, r, i;
    simTime += dt;
    for (r = 0; r < world.rows.length; r++) {
      var plats = world.rows[r].plats;
      for (i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (p.type === 'move' || p.type === 'fast') p.x = p.baseX + Math.sin(p.phase + simTime * p.speed) * p.amp;
      }
    }
    if (player.wait > 0) { // кот приседает, камера облетает его сверху
      player.wait -= dt;
      if (player.wait <= 0) takeoff();
      return;
    }
    if (player.flight) {
      flightStep(dt);
      return;
    }
    if (player.move === 'run') {
      runStep(dt);
      return;
    }
    var u = player.dead ? 0 : control();
    if (player.glide) u = clamp((player.glide.x - player.x) * 1.5, -1, 1); // после полёта — сам к острову
    if (!player.dead) player.vx += (u * P.speed * player.pace - player.vx) * smooth(P.accel * (player.slip ? CONFIG.ice.grip : 1), dt);
    player.x += player.vx * dt;
    if (player.dead) { // сбит с ног — летит вбок с острова, вперёд — по инерции, за краем — почти отвесно
      player.vz *= Math.exp(-dt * 1.6);
      if (Math.abs(player.x) > 4.6) player.vx *= Math.exp(-dt * 2.5);
    }
    else if (player.x > half) { player.x = half; player.vx = Math.min(0, player.vx); }
    else if (player.x < -half) { player.x = -half; player.vx = Math.max(0, player.vx); }

    var prevY = player.y;
    player.vy -= P.gravity * player.pace * player.pace * dt;
    if (state === 'fall') player.vy = Math.max(player.vy, -20);
    player.y += player.vy * dt;
    player.z += player.vz * dt;
    if (-player.z > player.maxDist) player.maxDist = -player.z;
    if (player.vy < 0 && !player.dead) collide(prevY);
  }

  // острова проходимы снизу: столкновение только при падении сквозь верхнюю грань
  function collide(prevY) {
    var y = player.y, x = player.x, z = player.z, H = CONFIG.platform.crate;
    for (var r = 0; r < world.rows.length; r++) {
      var row = world.rows[r];
      if (Math.abs(row.z - z) > 3) continue;
      if (row.upper && onUpper(row, x) && Math.abs(row.z - z) <= CONFIG.run.tile / 2) { // над помостом — на настил, не на дорогу под ним
        var up = upperY(row, z);
        if (prevY >= up - 0.001 && y <= up) return runLand({ y: up, row: row, x: CONFIG.lanes.x[row.upper.lane], z: z });
        continue;
      }
      for (var i = 0; i < row.plats.length; i++) {
        var p = row.plats[i];
        if (p.broken || p.type === 'ghost' && ghostState(p) === 'gone' || !p.mesh.visible && p.scorch || Math.abs(z - p.z) > p.d / 2 + 0.3) continue;
        if (p.crate) {
          var top = p.y + H * (1 - p.crate.squash * 0.35);
          if (prevY >= top - 0.001 && y <= top && Math.abs(x - p.x) <= H / 2 + 0.2) {
            land(p, p.y + H, true);
            return;
          }
        }
        if (prevY >= p.y - 0.001 && y <= p.y && Math.abs(x - p.x) <= p.w / 2 + 0.22) {
          land(p, p.y, false);
          return;
        }
      }
    }
  }

  function land(p, top, crate) {
    var P = CONFIG.physics;
    if (p.row.road) return runLand(p); // на виадук — дальше бегом
    if (p.row.finish) { // ворота уровня — кот остаётся на площадке
      player.y = top;
      player.vy = player.vz = player.vx = 0;
      player.squash = 1;
      dust(player.x, top, player.z, 14);
      levelComplete();
      return;
    }
    if (p.type === 'wood') { // гнилые доски ломаются, отскока нет — кот летит вниз
      breakPlatform(p);
      return;
    }
    var hurt = null;
    if (p.type === 'fire' && fireState(p) === 'burn') hurt = 'fire';
    else if (p.scorch && simTime >= p.scorch.from && simTime < p.scorch.to && LANE_FX[p.scorch.kind].hurt) hurt = LANE_FX[p.scorch.kind].hurt;
    else if (p.type === 'spike' && (player.x - p.x) * p.side > -0.15) hurt = 'spike';
    else if (p.dog && !p.dog.down) {
      hurt = 'dog';
      dogStrike(p.dog);
    } else if (p.keg && !p.keg.done) {
      hurt = 'keg';
      kegBlast(p, false);
    } else if (p.row.axe && !crate && axeHits(p.row, player.x, top)) {
      hurt = 'axe';
      note('axeHit');
    }
    var next = rowAt(p.row.i + (crate ? 3 : 1)) || rowAhead(p.z, 2);
    player.y = top;
    player.ground = p.y;
    player.squash = 1;
    player.pace = next.pace;
    player.vy = (crate ? P.superJump : P.jump) * player.pace;
    aim(next);
    if (crate) {
      player.flip = 0;
      p.crate.squash = 1;
      sparkle(player.x, top + 0.3, p.z, [1, 0.85, 0.35], 18, 4);
      Sound.spring();
      vibrate(25);
    } else {
      Sound.jump(Math.random());
    }
    dust(player.x, top, player.z, 9);
    player.glide = null;
    player.slip = !crate && p.type === 'ice'; // на льду — скользит до следующего приземления
    if (player.slip) slipOnIce();
    if (hurt) hazardHurt(hurt, p);
    if (player.dead) return;
    if (crate) { // батут серию не трогает; точное приземление после него — «Высший пилотаж»
      player.fromCrate = true;
      player.lane = p.lane;
      player.trick = null;
      player.tricks = player.airStomps = 0;
      player.airSword = false;
      return;
    }
    judgeLanding(p, top, hurt);
  }

  // ловушка на острове: минус жизнь, но кот отскакивает дальше (если жизни ещё есть)
  function hazardHurt(kind, p) {
    if (player.invuln > 0) return;
    if (kind === 'fire') {
      flames(p.x, p.y, p.z, p.w, 24);
      Sound.burn();
    } else if (kind === 'frost') {
      sparkle(player.x, p.y + 0.5, p.z, [0.6, 0.85, 1], 18, 4);
      Sound.ice();
    } else if (kind === 'spike') {
      chips(player.x, p.y, p.z, [0.75, 0.78, 0.82], 8);
    } else if (kind === 'axe') {
      sparkle(player.x, p.y + 1, p.z, [1, 0.95, 0.8], 14, 4);
      Sound.clang();
    } else if (kind !== 'keg') { // бочка уже взорвалась
      Sound.clang();
    }
    loseLife('hit');
    if (!player.dead) toast(tr('hurt.' + kind));
  }

  function takeoff() { // со стартовой площадки или с острова, где кот стоит после спасения (player.from)
    var from = player.from || rowAt(0), next = rowAt(from.i + 1);
    player.from = null;
    if (from.road) return startRun();
    player.wait = 0;
    player.pace = next.pace;
    player.vy = CONFIG.physics.jump * player.pace;
    player.squash = 1;
    aim(next);
    dust(player.x, player.y, player.z, 9);
    Sound.jump(0);
  }

  // Тап — удар. Серия: рубящий → наотмашь → круговой (шире и дальше). Тап во время удара встаёт в очередь
  // и запускает следующий удар серии сразу за этим; после удара серия ждёт следующий тап ещё attack.chain с,
  // потом начинается заново. После кругового — короткая передышка
  function startAttack() {
    var P = player;
    if (state !== 'play' || P.wait > 0 || P.dead || P.trick) return;
    if (P.swing) {
      P.swingQueued = true;
      return;
    }
    if (P.attackCd > 0) return;
    swingStart(P.chainT > 0 ? P.swingNext : 0);
  }

  var tipV = null;
  function swingStart(i) {
    var P = player, kind = SWINGS[i];
    P.swing = { kind: kind, i: i, t: 0, dur: CONFIG.attack[kind] };
    P.swingQueued = false;
    P.chainT = 0;
    Sound.swish(i);
    note(kind);
    vibrate(i === 2 ? 18 : 8);
  }

  function updateSwing(dt) {
    var P = player, A = CONFIG.attack, s = P.swing;
    P.attackCd = Math.max(0, P.attackCd - dt);
    P.chainT = Math.max(0, P.chainT - dt);
    if (!s) return;
    s.t += dt;
    if (!s.glint && s.t >= s.dur * SWING[s.kind].hot[0]) { // блик на острие в верхней точке замаха
      s.glint = true;
      if (!tipV) tipV = new T.Vector3();
      cat.sword.localToWorld(tipV.set(0, 0.95, 0));
      fxGlow.emit({ x: tipV.x, y: tipV.y, z: tipV.z, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 0.14, size: 0.7, grow: 0.6, c: [1, 1, 0.92], a: 1 });
    }
    if (s.kind === 'whirl' && !s.ring && s.t > s.dur * 0.3) { // круговой: кольцо искр по радиусу удара
      s.ring = true;
      for (var a = 0; a < 18; a++) {
        var ang = a / 18 * Math.PI * 2, r = 0.6;
        fxGlow.emit({ x: P.x + Math.cos(ang) * r, y: P.y + 0.8, z: P.z + Math.sin(ang) * r, vx: Math.cos(ang) * 7, vy: 0.4, vz: Math.sin(ang) * 7, grav: 0, drag: 5, life: 0.35, size: 0.45, grow: -0.3, c: [1, 0.93, 0.7], a: 0.9 });
      }
    }
    if (s.t < s.dur) return;
    P.swing = null;
    if (s.i === SWINGS.length - 1) { // после кругового — передышка, серия сначала
      P.attackCd = A.cooldown;
      return;
    }
    P.swingNext = s.i + 1;
    if (P.swingQueued) swingStart(P.swingNext);
    else P.chainT = A.chain;
  }

  // в резкой части удара всё, что в зоне меча, повержено; круговой бьёт шире
  var hitStop = 0;
  function strikeCheck() {
    var s = player.swing;
    if (!s) return;
    var k = s.t / s.dur, hot = SWING[s.kind].hot;
    if (k < hot[0] - 0.05 || k > hot[1] + 0.05) return;
    var A = CONFIG.attack, wide = s.kind === 'whirl', reach = A.reach * (wide ? A.whirlReach : 1), R2 = reach * reach, i;
    var cx = player.x, cy = player.y + 1, cz = player.z;
    var d2 = function (o) { var dx = o.x - cx, dy = o.y - cy, dz = o.z - cz; return dx * dx + dy * dy + dz * dz; };
    for (i = 0; i < world.flyers.length; i++) {
      var w = world.flyers[i];
      if (!w.dead && d2(w) < R2) {
        defeatFlyer(w, 3);
        swordHit(w.x, w.y, w.z);
      }
    }
    for (i = 0; i < world.fireballs.length; i++) {
      var f = world.fireballs[i], fd = d2(f);
      if (!f.done && !f.back && fd < R2) parryFireball(f, Math.sqrt(fd));
    }
    world.rows.forEach(function (row) {
      if (row.z > cz + 1 || row.z < cz - (wide ? 4.4 : 3.6)) return;
      row.plats.forEach(function (p) {
        if (p.keg && !p.keg.done && Math.abs(p.x - cx) < (wide ? 2.4 : 1.7) && cy > p.y - 0.3) {
          swordHit(p.x, p.y + 0.6, p.z);
          kegBlast(p, true);
        }
        var dog = p.dog;
        if (dog && !dog.down && Math.abs(p.x - cx) < (wide ? 2.4 : 1.7) && cy > p.y - 0.3) {
          defeatDog(dog);
          swordHit(p.x, p.y + 1.2, p.z);
        }
      });
    });
    world.rollers.forEach(function (r) { // катящаяся бочка
      if (r.keg.done || r.z > cz + 1 || r.z < cz - (wide ? 4.4 : 3.6) || Math.abs(r.x - cx) > (wide ? 2.4 : 1.7) || cy < r.y - 0.3) return;
      swordHit(r.x, r.y + 0.4, r.z);
      kegBlast(r, true);
    });
  }

  // попадание: мир замирает на миг, вспышка и искры в точке удара, камеру тряхнуло
  function swordHit(x, y, z) {
    player.airSword = true; // «Рыцарский приём», если приземлится точно
    note('hit');
    hitStop = CONFIG.attack.hitStop;
    cam.shake = Math.max(cam.shake, 0.14);
    fxGlow.emit({ x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 0.14, size: 2.6, grow: 0.6, c: [1, 0.97, 0.85], a: 1 });
    sparkle(x, y, z, [1, 0.95, 0.75], 16, 6);
    Sound.hit();
  }

  function collectCoin(c) {
    codexSeen('bonus', 'coin');
    c.taken = true;
    c.t = 0;
    world.coinsGot++;
    addCoins(1);
    if (c.arc && ++c.arc.got === c.arc.n) { // вся дуга
      var won = addCoins(c.arc.n);
      popText(tr('pop.arc'), '+' + coinsWord(won), false);
      note('arc');
      Sound.bonus(2);
    }
    sparkle(c.x, c.y, c.z, [1, 0.86, 0.35], 7, 2.6);
    flyCoin(c.x, c.y, c.z);
    Sound.coin();
  }

  // монета в счётчик: кружок из точки монеты на экране летит к медальону монет (не больше 10 сразу; в покадровом
  // режиме проверок — нет)
  var flyPool = null, flyV = null;
  function flyCoin(x, y, z) {
    if (frozen || hidden) return;
    if (!flyPool) {
      flyPool = [];
      for (var i = 0; i < 10; i++) flyPool.push(el.flyers.appendChild(document.createElement('i')));
    }
    var e = flyPool.pop();
    if (!e) return;
    var v = (flyV || (flyV = new T.Vector3())).set(x, y, z).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      flyPool.push(e);
      return;
    }
    var r = el.coins.getBoundingClientRect(), g = el.game.getBoundingClientRect();
    e.classList.remove('is-go');
    e.style.transform = 'translate(' + ((v.x + 1) / 2 * view.w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * view.h).toFixed(1) + 'px)';
    void e.offsetWidth;
    e.classList.add('is-go');
    e.style.transform = 'translate(' + (r.left - g.left + r.height / 2).toFixed(1) + 'px,' + (r.top - g.top + r.height / 2).toFixed(1) + 'px) scale(.6)';
    setTimeout(function () {
      e.classList.remove('is-go');
      flyPool.push(e);
    }, 520);
  }

  // Скорость на экране: поле зрения чуть шире на разгоне бега, в ярости и в полёте; штрихи по краям (.game__speed) —
  // в полёте, в ярости и на самом разгоне. Горизонт неба и тумана (view.horizon) — от текущего поля зрения
  var kick = { fov: 0, lines: -1 };
  function speedFx(dt) {
    var P = player, R = CONFIG.run, play = state === 'play' && !P.dead;
    var run = play && P.move === 'run' ? clamp((runSpeed() - R.speed[0]) / (R.speed[1] - R.speed[0]), 0, 1) : 0;
    var tf = play ? run * 2.5 + (P.flight ? 5 : 0) + (P.fury > 0 ? 2 : 0) : 0;
    kick.fov += (tf - kick.fov) * smooth(2.5, dt);
    var fov = CONFIG.camera.fov + kick.fov;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      view.horizon = 0.5 - 0.5 * Math.tan(view.pitch) / Math.tan(rad(fov / 2));
    }
    var lines = play ? Math.round(Math.max(P.flight ? 0.9 : 0, P.fury > 0 ? 0.55 : 0, Math.max(0, run - 0.75) * 1.2) * 20) / 20 : 0;
    if (lines !== kick.lines) el.speed.style.opacity = kick.lines = lines;
  }

  function checkPickups() {
    var px = player.x, py = player.y + 0.95, pz = player.z, i;
    for (i = 0; i < world.coins.length; i++) {
      var c = world.coins[i];
      if (c.taken) continue;
      var dx = c.x - px, dy = c.y - py, dz = c.z - pz;
      if (dx * dx + dy * dy + dz * dz < 0.7) collectCoin(c);
    }
    if (player.dead) return;
    for (i = 0; i < world.pickups.length; i++) {
      if (player.flight) break;
      var o = world.pickups[i];
      if (o.taken) continue;
      var sx = o.x - px, sy = o.y - py, sz = o.z - pz;
      if (sx * sx + sy * sy + sz * sz < 0.9) {
        if (o.kind === 'wings') {
          o.taken = true;
          if (!player.flight) startFlight();
        } else if (o.kind === 'shield') collectShield(o);
        else collectBonus(o);
      }
    }
    if (player.flight) return; // над дорогой летуны и огонь не достают
    for (i = 0; i < world.flyers.length; i++) {
      var w = world.flyers[i];
      if (w.dead) continue;
      var ex = w.x - px, ey = w.y - py, ez = w.z - pz;
      if (ex * ex + ey * ey + ez * ez > 0.45) continue;
      if (player.vy < 0) stomp(w);
      else if (player.invuln <= 0) hitBy(w.x);
    }
    for (i = 0; i < world.fireballs.length; i++) {
      var f = world.fireballs[i];
      if (f.done || f.back) continue;
      var fx = f.x - px, fy = f.y - py, fz = f.z - pz;
      if (fx * fx + fy * fy + fz * fz > 0.6) continue;
      popFireball(f, false);
      if (player.invuln <= 0) {
        Sound.burn();
        hitBy(f.x);
      }
    }
  }

  // прыжок на летуна сверху — он падает, кот отскакивает, +3 монеты; следующий летун в том же полёте —
  // «Двойной!» и вдвое больше монет, третий — «Тройной!» и ещё вдвое
  function stomp(w) {
    var n = ++player.airStomps, won = defeatFlyer(w, 3 * Math.pow(2, n - 1));
    if (n > 1) {
      popText(n === 2 ? tr('pop.chain2') : n === 3 ? tr('pop.chain3') : tr('pop.chain', { n: n }), '+' + coinsWord(won), true);
      Sound.bonus(n);
      note('stompChain');
    }
    player.vy = CONFIG.physics.jump * player.pace * 0.8;
    player.squash = 1;
    if (player.move !== 'run') aim(rowAhead(player.z, 1)); // на бегу — просто отскок вверх
  }

  function hitBy(fromX) {
    player.vx = (player.x > fromX ? 1 : -1) * 8;
    player.vy = Math.max(player.vy, 4);
    if (player.move === 'run') player.grounded = false; // на бегу — отбросило вверх
    else if (player.target) aim(player.target); // удар сбил прыжок — пересчитываем, чтобы долететь до ряда
    loseLife('hit');
  }

  // куда кот вернётся после падения и спуститься после полёта: без ловушек; не плывущий остров (уплыл бы из-под лап),
  // не плита под настилом верхнего виадука (кот влетел бы в помост) и не колонка под атакой босса
  function safePlatform(row) {
    for (var i = 0; i < row.plats.length; i++) {
      var p = row.plats[i];
      if (p.type !== 'wood' && p.type !== 'fire' && p.type !== 'spike' && p.type !== 'ghost' && p.type !== 'move' && p.type !== 'fast' && !p.dog && !p.keg && !p.obstacle && !p.broken && !p.scorch && !onUpper(row, p.x) && !(row.axe)) return p;
    }
    return null;
  }

  function loseLife(kind) {
    if (DEBUG) {
      debugStats[kind] = (debugStats[kind] || 0) + 1;
      (window.__losses || (window.__losses = [])).push(lossInfo(kind)); // ?debug: где и что было (разбор потерь бота)
    }
    var saved = (player.fury > 0 || player.bubble) && !player.dead; // ярость или пузырь принимают удар: жизнь и серия целы
    if (saved && player.fury > 0) endFury(true);
    else if (saved) popBubble();
    else {
      comboBreak();
      if (!GOD) player.lives--;
    }
    hud.lives = -1;
    cam.shake = 0.35;
    vibrate(70);
    if (kind !== 'fall') player.ouch = 0.5; // вздрогнул от удара (animateCat)
    if (player.lives <= 0) {
      player.lives = 0;
      if (kind === 'fall') gameOver();
      else knockOut();
      return;
    }
    if (kind === 'fall') { // спасение: кот возвращается к ряду, до которого не допрыгнул
      respawn();
      player.invuln = CONFIG.invuln + 0.6;
      player.rescue = 0.9;
      Sound.rescue();
      if (!saved) toast(player.lives === 1 ? tr('lives.last') : tr('lives.left', { n: player.lives }));
    } else {
      player.invuln = CONFIG.invuln;
      Sound.hurt();
    }
  }

  function checkFall() {
    if (player.flight || !player.target || player.y >= player.target.y - 4) return;
    if (player.dead) gameOver();
    else loseLife('fall');
  }

  // шлейф и частицы «бешеного» острова: пар срывается с задней кромки, искры — с кристалла.
  // Дальние ленты гаснут вместе с туманом и не пылят. Вершины ленты — в линейном цвете, частицы — в sRGB
  var wakeHot0 = [1, 0.5, 0.1], wakeHot1 = [0.95, 0.2, 0.04], wakeAir0 = [1, 1, 1], wakeAir1 = [1, 1, 1], wakePuff = null; // ярче 1 тонмаппинг выбелит
  function updateWake(p, wk, dt) {
    var far = clamp((camera.position.z - p.z - 16) / 40, 0, 1), alpha = 1 - far * far * (3 - 2 * far);
    wk.hot.mesh.visible = wk.air.mesh.visible = alpha > 0.01;
    if (alpha <= 0.01) return;
    var cl = day.cloud;
    wakeAir1[0] = cl.r;
    wakeAir1[1] = cl.g;
    wakeAir1[2] = cl.b;
    wakeAir0[0] = lerp(cl.r, 1, 0.35);
    wakeAir0[1] = lerp(cl.g, 1, 0.35);
    wakeAir0[2] = lerp(cl.b, 1, 0.35);
    // хвост длиннее полуширины острова: под плитой лента спрятана, видна та часть, что за кромкой
    wk.hot.update(p, 0.85, wakeHot0, wakeHot1, alpha);
    wk.air.update(p, 1.05, wakeAir0, wakeAir1, alpha * 0.85);
    if (far > 0.4 || state !== 'play') return;
    var v = Math.cos(p.phase + simTime * p.speed), vx = v * p.speed * p.amp, dir = vx > 0 ? 1 : -1, s = Math.abs(v);
    wakePuff = (wakePuff || new T.Color()).copy(cl).convertLinearToSRGB();
    p.puffs = (p.puffs || 0) + dt * 22 * s;
    while (p.puffs >= 1) {
      p.puffs -= 1;
      fxDust.emit({ x: p.x - dir * p.w * rand(0.4, 0.5), y: p.y + rand(-0.45, -0.05), z: p.z + rand(-0.45, 0.45) * p.d, vx: vx * rand(0.1, 0.3), vy: rand(0, 0.35), vz: rand(-0.3, 0.3), grav: -0.4, drag: 2.4, life: rand(0.5, 0.9), size: rand(0.35, 0.6), grow: 2.4, c: [wakePuff.r, wakePuff.g, wakePuff.b], a: 0.45 });
    }
    p.sparks = (p.sparks || 0) + dt * 14 * s;
    while (p.sparks >= 1) {
      p.sparks -= 1;
      fxGlow.emit({ x: p.x + rand(-0.12, 0.12), y: p.y - 0.95 + rand(-0.3, 0.25), z: p.z + rand(-0.15, 0.15), vx: vx * rand(0.05, 0.2) + rand(-0.3, 0.3), vy: rand(-0.7, 0.1), vz: rand(-0.2, 0.2), grav: 1.2, drag: 1.8, life: rand(0.3, 0.6), size: rand(0.12, 0.24), grow: -0.6, c: [1, rand(0.42, 0.68), 0.14], a: 1 });
    }
  }

  function updateWorld(dt) {
    updateRollers(dt);
    world.rows.forEach(function (row) {
      if (row.axe) updateAxe(row);
      if (row.gate) updateFinish(row);
      if (state === 'play') trapTips(row);
      row.plats.forEach(function (p) {
        var ud = p.mesh.userData;
        p.ry = p.y; // где остров рисуется (сейчас совпадает с физикой)
        p.mesh.position.set(p.x, p.ry, p.z);
        if (p.crate) {
          p.crate.squash = Math.max(0, p.crate.squash - dt * 4);
          p.crate.mesh.position.set(p.x, p.ry, p.z);
          p.crate.mesh.scale.set(1 + p.crate.squash * 0.15, 1 - p.crate.squash * 0.35, 1 + p.crate.squash * 0.15);
        }
        if (p.dog) updateDog(p.dog, dt);
        if (p.scorch) scorchFx(p, dt);
        if (p.type === 'ghost') updateGhost(p);
        if (p.keg && !p.keg.done) updateKeg(p);
        if (p.obstacle) p.obstacle.mesh.position.set(p.x, p.ry, p.z);
        p.decos.forEach(function (dc) {
          if (!dc.mesh) return;
          dc.mesh.position.set(p.x + dc.dx, p.ry + (dc.dy || 0), p.z + dc.dz);
          if (dc.mesh.userData.cloth) dc.mesh.userData.cloth.rotation.y = Math.sin(time * 2.2 + dc.phase) * 0.3;
        });
        if (p.type === 'move' || p.type === 'fast') {
          var cr = ud.crystal, fast = p.type === 'fast';
          cr.rotation.y += dt * (fast ? 6 : 1.6);
          cr.position.y = -0.95 + Math.sin(time * 2 + p.phase) * 0.08;
          if (fast) updateWake(p, ud.wakes, dt);
        } else if (p.type === 'fire') { // лава разгорается к извержению, пламя бьёт вверх
          var st = fireState(p), heat = fireHeat(p, st), flick = 0.85 + Math.random() * 0.3;
          ud.lava.emissiveIntensity = (0.45 + heat * 1.2) * (st === 'calm' ? 0.9 + Math.sin(time * 3 + p.phase) * 0.1 : flick); // накал — без пересвета (со свечением было белое пятно)
          ud.flames.forEach(function (f, k) {
            var h = st === 'burn' ? 1.4 + Math.sin(time * 14 + k * 2) * 0.35 : st === 'warn' ? 0.35 * heat * flick : 0.001;
            f.scale.set(0.9 * (0.6 + h * 0.4), h * 1.6, 1);
            f.visible = h > 0.01; // спокойный остров — языки не рисуются вовсе
          });
          if (st === 'burn') flames(p.x, p.y, p.z, p.w, emitCount(26, dt));
          else if (st === 'warn' && Math.random() < 0.25) sparkle(p.x + rand(-0.8, 0.8), p.y + 0.1, p.z + rand(-0.8, 0.8), [1, 0.5, 0.15], 1, 1);
        }
        if (p.broken) { // доски разлетаются и падают
          p.breakT += dt;
          ud.planks.forEach(function (m) {
            var v = m.userData.v, s = m.userData.spin;
            v.y -= 20 * dt;
            m.position.addScaledVector(v, dt);
            m.rotation.x += s.x * dt;
            m.rotation.y += s.y * dt;
            m.rotation.z += s.z * dt;
          });
          if (p.breakT > 1.6) p.mesh.visible = false;
        }
      });
    });
    var C = coins, at = C.at, n = 0;
    world.coins.forEach(function (c) {
      at.rotation.y = time * 3.2 + c.phase;
      if (c.taken) {
        c.t += dt;
        var k = Math.min(1, c.t / 0.25);
        at.scale.setScalar(1 + k * 0.7);
        at.position.set(c.x, c.y + k * 0.7, c.z);
        if (k >= 1) c.done = true;
      } else {
        at.scale.setScalar(1);
        at.position.set(c.x, c.y + Math.sin(time * 2.5 + c.phase) * 0.08, c.z);
      }
      if (c.done || n >= COIN_CAP) return;
      at.updateMatrix();
      C.rim.setMatrixAt(n, at.matrix);
      C.face.setMatrixAt(n, at.matrix);
      n++;
    });
    C.rim.count = C.face.count = n;
    C.rim.instanceMatrix.needsUpdate = C.face.instanceMatrix.needsUpdate = true;
    fillBridgeBatches();
    fillParapet();
    fillDecks();
    if (player.rescue > 0) {
      player.rescue -= dt;
      sparkle(player.x, player.y + 0.6, player.z, [1, 0.9, 0.5], 2, 1.2);
    }
    if (player.flip >= 0) sparkle(player.x, player.y + 0.7, player.z, [1, 0.85, 0.35], 1, 0.8);
  }

  // всё, что осталось позади камеры, возвращается в пул
  function cleanup() {
    var behind = Math.max(cam.z, player.z) + 6; // после спасения кот позади камеры (она ушла вперёд за падавшим) — его ряды целы
    while (world.rows.length > 2 && world.rows[0].z > behind) {
      releaseRow(world.rows.shift());
    }
    // списки ужимаются на месте — без нового массива каждый кадр (меньше работы сборщику мусора на телефоне)
    var keep = function (list) {
      for (var i = 0, n = 0; i < list.length; i++) {
        var o = list[i];
        if (o.z < behind && !o.done) list[n++] = o;
        else release(o.mesh);
      }
      list.length = n;
    };
    keep(world.coins);
    keep(world.flyers);
    keep(world.fireballs);
    keep(world.pickups);
    keep(world.rollers);
    for (var i = 0, n = 0; i < world.markers.length; i++) {
      var s = world.markers[i];
      if (s.position.z < behind) {
        world.markers[n++] = s;
        continue;
      }
      scene.remove(s);
      s.material.map.dispose();
      s.material.dispose();
    }
    world.markers.length = n;
  }

  function clearWorld() {
    world.rows.forEach(releaseRow);
    world.coins.concat(world.flyers, world.fireballs, world.pickups, world.rollers).forEach(function (o) { release(o.mesh); });
    if (world.dragon) release(world.dragon.mesh);
    if (world.boss) release(world.boss.mesh);
    world.markers.forEach(function (s) {
      scene.remove(s);
      s.material.map.dispose();
      s.material.dispose();
    });
    world.rows = [];
    world.coins = [];
    world.flyers = [];
    world.fireballs = [];
    world.pickups = [];
    world.rollers = [];
    world.runPlan = [];
    world.nearNext = false;
    world.laneOb = [-1e9, -1e9, -1e9];
    world.markers = [];
    world.dragon = null;
    world.dragonAt = null;
    world.boss = null;
    world.bossAt = CONFIG.boss.first;
    world.bosses = 0;
    world.finish = null;
    world.coinsTotal = world.coinsGot = 0; // монеты уровня: сколько было и сколько собрано (звезда за 60%)
    mat.boss.emissiveIntensity = mat.dragon.emissiveIntensity = 0;
    fxDust.clear();
    fxGlow.clear();
    fxFire.clear();
  }

  // новый раунд: в забеге дорога случайна, в уровне кампании — по «зерну» уровня, с его биомом и временем суток
  function resetRound() {
    clearWorld();
    resetPlayer();
    simTime = 0;
    stepAcc = 0;
    winTimer = 0;
    var lv = mode === 'level';
    genRandom = lv ? seeded(hashOf('level ' + level.id)) : dailyRun ? seeded(hashOf(Daily.runSeed())) : Math.random;
    dayTime = (lv ? WORLDS[level.w].time : CONFIG.daynight.start) * CONFIG.daynight.period;
    setBiome(biomeAt(0), true);
    if (lv) {
      world.bossAt = level.def.boss ? 60 : Infinity; // Пламенный дракон — только в своём уровне
      if (level.def.dragon) world.dragonAt = -level.def.len * 0.5; // дракончик — в середине уровня
    }
    tips = {};
    cam.x = cam.y = cam.z = 0;
    cam.shake = 0;
    world.runNext = 24; // раннер: первое препятствие, ворота над виадуком, провал на две плиты, линия монет, верхний виадук
    world.deck = world.deckClear = null;
    world.archNext = 45;
    world.heartNext = 150; // сердце — не раньше 150 м
    world.gapCarry = world.coinRun = null;
    var P = CONFIG.platform, start = { i: 0, z: 0, y: 0, pace: 1, plats: [], road: stretchAt(0) === 'run' };
    world.rows.push(start);
    var sp = addPlatform('stone', 1, start, P.start, P.startDepth); // стартовая площадка во всю ширину дороги
    addDeco(sp, -1, 'pole');
    addDeco(sp, 1, 'lantern');
    generate();
    resetScenery();
    fillBridgeBatches(); // первый кадр (он же компилирует шейдеры) — уже с островами
    updateDayNight(0, true);
    hud.coins = hud.meters = hud.lives = hud.combo = hud.fury = hud.boss = -1;
    hud.shield = null;
    hud.mult = 1;
    el.game.classList.remove('is-record');
    el.combo.classList.remove('is-broken');
    el.game.classList.remove('is-fury', 'is-boss');
    cat.wings.visible = false;
    Sound.fury(false);
    Sound.boss(false);
  }


  /* ---------- Камера и раскладка ---------- */

  // Камера сзади-сверху, как в раннере. Если экран узкий (телефон), отодвигаем её (k > 1),
  // чтобы на уровне кота все три колонки помещались по ширине.
  function fitCamera() {
    var C = CONFIG.camera, tanH = Math.tan(rad(C.fov / 2)), a = view.w / view.h;
    var fy = C.lookUp - C.height, fz = -(C.back + C.ahead), fl = Math.sqrt(fy * fy + fz * fz);
    var depth = ((1 - C.height) * fy - C.back * fz) / fl; // глубина кота вдоль взгляда при k = 1
    view.k = clamp(CONFIG.lanes.half * C.margin / (depth * tanH * a), C.minK, 2.4);
    view.pitch = Math.atan2(C.height - C.lookUp, C.back + C.ahead);
    view.horizon = 0.5 - 0.5 * Math.tan(view.pitch) / tanH;
  }

  function layout() {
    var w = el.game.clientWidth || window.innerWidth, h = el.game.clientHeight || window.innerHeight;
    view.w = w;
    view.h = h;
    renderer.setPixelRatio(view.pr);
    renderer.setSize(w, h, false);
    sizeBloom();
    camera.aspect = w / h;
    camera.fov = CONFIG.camera.fov;
    camera.updateProjectionMatrix();
    fitCamera();
    var scale = h * view.pr / (2 * Math.tan(rad(CONFIG.camera.fov / 2)));
    fxDust.material.uniforms.scale.value = fxGlow.material.uniforms.scale.value = scale;
    sky.stars.material.size = 2.6 * view.pr;
    updateDayNight(0, true);
    updateCamera(0);
    if (state !== 'play' && state !== 'fall') {
      updateScenery(0);
      render();
    }
    fitText(); // другая ширина экрана — подписи кнопок заново по месту
  }

  var lightDir = null, moonDirV = null;
  function updateCamera(dt) {
    var C = CONFIG.camera, k = view.k;
    var ko = (state === 'play' || state === 'fall') && player.dead, koY = player.koY != null ? player.koY : cam.y;
    cam.ko = ko ? Math.min(1, (cam.ko || 0) + dt * 2.5) : 0; // сбит: камера остаётся над дорогой и поворачивается вслед коту
    if (state === 'play' || state === 'fall') {
      cam.x += ((ko ? clamp(player.x, -2.2, 2.2) : player.x) * C.follow - cam.x) * smooth(5, dt);
      cam.z += (player.z - cam.z) * smooth(12, dt);
      var gy = state === 'fall' || ko ? Math.max(Math.min(cam.y, player.y + 1), koY - 2.5) : player.ground; // за падающим — вниз не дальше 2,5 м: кот уходит из кадра в облака
      cam.y += (gy - cam.y) * smooth(3.5, dt);
    }
    var e = ease(cam.intro), lift = (1 - e) * 9, pull = (1 - e) * 7; // после «Играть» камера опускается сверху-сзади
    var sway = Math.sin(time * 0.35) * 1.6 * (1 - e); // на заставке медленно плавает из стороны в сторону
    var px = cam.x + sway, py = cam.y + C.height * k + lift, pz = cam.z + C.back * k + pull;
    var lx = cam.x * 0.9 + sway * 0.3, ly = cam.y + C.lookUp, lz = cam.z - C.ahead * k;
    if (cam.ko > 0) { // взгляд — за кувыркающимся котом: вбок с виадука и вниз, в облака
      lx += (player.x - lx) * 0.6 * cam.ko;
      ly += (Math.max(player.y, koY - 7) - ly) * 0.55 * cam.ko;
    }
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt);
      var s = cam.shake * 0.5;
      px += rand(-s, s);
      py += rand(-s, s);
    }
    camera.position.set(px, py, pz);
    camera.lookAt(lx, ly, lz);
    // свет — от солнца, ночью от луны; низкое солнце на закате даёт длинные тени.
    // Тень следует за котом; шаг — размер текселя, иначе края теней мерцают
    lightDir = skyDir(Math.max(day.sunEl, 16), day.sunAz, lightDir || new T.Vector3());
    moonDirV = skyDir(Math.max(day.moonEl, 26), day.moonAz, moonDirV || new T.Vector3());
    lightDir.lerp(moonDirV, day.night).normalize();
    // область теней — от 6 м позади кота до края вперёд (SHADOW_BOX)
    var E = shadowSize.half, texel = 2 * E / shadowSize.map;
    var tx = Math.round(cam.x / texel) * texel, ty = Math.round(cam.y / texel) * texel, tz = Math.round((cam.z + 6 - E) / texel) * texel;
    sun.target.position.set(tx, ty, tz);
    sun.position.set(tx + lightDir.x * 45, ty + lightDir.y * 45, tz + lightDir.z * 45);
  }

  // размер области теней (полуширина, м) и карты по качеству графики: дальше — ровная граница гаснет (shadowEdgeFade)
  var SHADOW_BOX = { low: [16, 512], auto: [22, 2048], high: [22, 2048] }, shadowSize = { half: 22, map: 2048 };
  function shadowBox(quality) {
    var B = SHADOW_BOX[quality] || SHADOW_BOX.auto, sc = sun.shadow.camera;
    shadowSize.half = B[0];
    shadowSize.map = B[1];
    sc.left = sc.bottom = -B[0];
    sc.right = sc.top = B[0];
    sc.updateProjectionMatrix();
    sun.shadow.mapSize.set(B[1], B[1]);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }


  /* ---------- Смена дня и ночи ---------- */

  function dayBlend(t) {
    var i = 0, tmp = new T.Color();
    while (i < DAY_KEYS.length - 2 && t > DAY_KEYS[i + 1].t) i++;
    var a = DAY_KEYS[i], b = DAY_KEYS[i + 1], k = clamp((t - a.t) / (b.t - a.t), 0, 1);
    k = k * k * (3 - 2 * k);
    DAY_COLORS.forEach(function (n) { (day[n] || (day[n] = new T.Color())).set(a[n]).lerp(tmp.set(b[n]), k); });
    DAY_NUMBERS.forEach(function (n) { day[n] = lerp(a[n], b[n], k); });
  }

  // небо, туман, свет и ночные огни — каждый кадр (раз в несколько кадров свет менялся ступеньками); холст неба крошечный
  function updateDayNight(dt, force) {
    if ((state === 'play' || state === 'fall') && mode === 'run') dayTime += dt; // в уровне время суток мира стоит
    dayBlend((dayTime / CONFIG.daynight.period) % 1);
    applyBiomeSky();

    var c = tex.skyCanvas, x = c.getContext('2d'), hz = view.horizon, g = x.createLinearGradient(0, 0, 0, c.height), tmp = new T.Color();
    g.addColorStop(0, day.top.getStyle());
    g.addColorStop(hz * 0.6, tmp.copy(day.top).lerp(day.hor, 0.5).getStyle());
    g.addColorStop(hz, day.hor.getStyle());
    g.addColorStop(Math.min(0.98, hz + 0.1), tmp.copy(day.hor).lerp(day.low, 0.25).getStyle());
    g.addColorStop(1, day.low.getStyle());
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    tex.sky.needsUpdate = true;

    fogNear.color.copy(day.fog);
    fogFar.color.copy(day.fog).lerp(day.hor, 0.4);
    setSkyFog();
    sun.color.copy(day.sun);
    sun.intensity = day.sunI * LIGHT_K;
    hemi.color.copy(day.hemiSky);
    hemi.groundColor.copy(day.hemiGround);
    hemi.intensity = day.hemiI * LIGHT_K;
    renderer.toneMappingExposure = day.exp;
    litMats.forEach(function (m) { m.envMapIntensity = m.userData.env * day.env; });
    cloudMats.forEach(function (m) { m.color.copy(day.cloud).multiplyScalar(0.93); }); // чуть ниже белого: не слепят и не сливаются в сплошное
    castle.userData.halo.material.color.copy(day.sun);
    castle.userData.halo.material.opacity = 0.22 * (1 - day.night * 0.7);
    mat.window.emissiveIntensity = 0.1 + day.night * 1.8;
    mat.lanternHalo.opacity = day.night * 0.85;
    mat.crystalBig.emissiveIntensity = 0.3 + day.night * 1.4;
    if (mat.island) mat.island.emissiveIntensity = 0.1 + day.night * 1.6;
    if (mat.gateStone) mat.gateStone.emissiveIntensity = 0.1 + day.night * 1.6;
    if (mat.castleStone) mat.castleStone.emissiveIntensity = 0.1 + day.night * 1.8;
  }


  /* ---------- Управление ---------- */

  function screenAngle() {
    var a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : window.orientation;
    return (+a || 0) * Math.PI / 180;
  }

  // проекция гравитации на горизонталь экрана: > 0 — телефон наклонён вправо
  function setTilt(dx, dy) {
    var a = screenAngle();
    input.tx = dx * Math.cos(a) + dy * Math.sin(a);
    if (input.calibrate) {
      input.cx = input.tx;
      input.calibrate = false;
    }
  }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    var b = rad(e.beta), g = rad(e.gamma);
    if (!input.tilt) {
      input.tilt = true;
      input.motion = false;
      input.calibrate = true;
    }
    setTilt(Math.sin(g) * Math.cos(b), Math.sin(b));
  }

  // запасной вариант для телефонов без гироскопа: акселерометр (знаки — по спецификации W3C)
  function onMotion(e) {
    var g = e.accelerationIncludingGravity;
    if (input.tilt || !input.motionAllowed || !g || g.x == null) return;
    if (!input.motion) {
      input.motion = true;
      input.calibrate = true;
    }
    setTilt(clamp(-g.x / 9.81, -1, 1), clamp(g.y / 9.81, -1, 1));
  }

  // приложение (mobile/): наклон с его датчиков — в тот же обработчик, что и deviceorientation; пауза при уходе в фон
  function bindNative() {
    if (!Native.inApp) return;
    Native.on('tilt', onOrientation);
    Native.on('pause', function () {
      if (state === 'play') pauseGame();
      Sound.suspend();
    });
    Native.on('resume', function () { Sound.resume(); });
    Native.on('music', function (d) { Sound.trackUrls(d.urls); }); // треки лежат в приложении — пути от него
    Native.send('ready', { lang: getLang() });
  }

  function listenTilt() {
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    setTimeout(function () { input.motionAllowed = !input.tilt; }, 700);
  }

  function requestTilt() {
    var DOE = window.DeviceOrientationEvent;
    if (!DOE || Native.inApp) return; // в приложении наклон присылает оно само (bindNative)
    if (typeof DOE.requestPermission === 'function') {
      // iOS 13+: разрешение спрашиваем строго внутри обработчика тапа
      DOE.requestPermission().then(function (res) {
        if (res === 'granted') listenTilt();
      }).catch(function () {});
    } else if (!input.listening) {
      input.listening = true;
      listenTilt();
    }
  }

  // Тап по экрану — удар мечом (частые тапы — серия ударов), свайп вверх — трюк (на бегу — прыжок), вниз — подкат.
  // Без гироскопа палец ещё и рулит (держи слева / справа). Касание двумя пальцами — калибровка наклона: «прямо» — как
  // телефон держат сейчас (не двойной тап — тапы подряд теперь серия ударов)
  // Тап и свайп разделены: касание само ничего не делает. Палец ушёл вверх или вниз дальше порога за 0,35 с — свайп,
  // удара нет; остался на месте (сдвиг меньше TAP_SLOP) — тап: удар при отпускании, а если палец держат дольше TAP_WAIT —
  // сразу (удар не ждёт отпускания). Сдвинулся вбок или медленно — ни то ни другое
  var TAP_WAIT = 150;
  function bindInput() {
    var game = el.game, down = {};
    var dirOf = function (e) { return e.clientX < view.w / 2 ? -1 : 1; };
    var swipeMin = function () { return Math.max(28, view.h * 0.045); };
    var tapSlop = function () { return Math.max(10, view.h * 0.016); };
    var tapEnd = function (s) { // касание кончилось или стало свайпом: удар по нему больше не нужен
      clearTimeout(s.timer);
      s.done = true;
    };
    var drop = function (e) {
      delete down[e.pointerId];
      input.touches = input.touches.filter(function (t) { return t.id !== e.pointerId; });
      var s = input.swipe;
      if (s && s.id === e.pointerId && !s.done) {
        var tap = s.tap && e.type === 'pointerup';
        tapEnd(s);
        if (tap && state === 'play') startAttack();
      }
    };
    // С наклоном: тап по экрану — удар, свайпы — трюк/прыжок и подкат, два пальца — калибровка.
    // Без наклона палец только рулит (держи слева / справа) и свайпает; удар — кнопкой внизу (game__pads)
    game.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || state !== 'play') return;
      var tilt = input.tilt || input.motion;
      down[e.pointerId] = true;
      if (input.swipe && !input.swipe.done) tapEnd(input.swipe); // второй палец — не тап первым
      if (tilt && Object.keys(down).length === 2) {
        input.calibrate = true;
        toast(tr('toast.calibrated'));
        return;
      }
      var s = input.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false, tap: tilt, timer: 0 };
      if (tilt) {
        s.timer = setTimeout(function () { // держат на месте — удар, не дожидаясь отпускания
          if (input.swipe !== s || s.done || !s.tap) return;
          tapEnd(s);
          if (state === 'play') startAttack();
        }, TAP_WAIT);
      } else {
        input.touches = input.touches.filter(function (q) { return q.id !== e.pointerId; });
        input.touches.push({ id: e.pointerId, dir: dirOf(e) });
      }
    });
    // кнопки: срабатывают на касание (не на отпускание) — удар не опаздывает
    [['game-btn-sword', function () { startAttack(); }], ['game-btn-trick', function () { startTrick(); }], ['game-btn-slide', function () { startSlide(); }]].forEach(function (b) {
      var btn = document.getElementById(b[0]);
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.classList.add('is-down');
        btn.classList.remove('is-glow');
        b[1]();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { btn.addEventListener(n, function () { btn.classList.remove('is-down'); }); });
    });
    game.addEventListener('pointermove', function (e) {
      input.touches.forEach(function (q) { if (q.id === e.pointerId) q.dir = dirOf(e); });
      var s = input.swipe;
      if (!s || s.done || s.id !== e.pointerId) return;
      var dy = e.clientY - s.y, quick = performance.now() - s.t < 350;
      if (Math.hypot(e.clientX - s.x, dy) > tapSlop()) s.tap = false; // палец поехал — это уже не тап
      if (quick && -dy > swipeMin()) { // свайп вверх — трюк (на бегу — прыжок)
        tapEnd(s);
        startTrick();
      } else if (quick && dy > swipeMin()) { // свайп вниз — подкат (на виадуке)
        tapEnd(s);
        startSlide();
      }
    });
    game.addEventListener('pointerup', drop);
    game.addEventListener('pointercancel', drop);
    game.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    window.addEventListener('keydown', function (e) {
      if (KEYS[e.code]) {
        input.keys[KEYS[e.code]] = true;
        e.preventDefault();
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
        e.preventDefault();
        if (state === 'coach') coachNext();
        else if (state === 'start') startGame();
        else if (state === 'over') restart();
        else if (state === 'win') nextLevel();
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') startTrick();
        else startAttack();
      }
      if ((e.code === 'ArrowDown' || e.code === 'KeyS') && state === 'play') {
        e.preventDefault();
        startSlide();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (state === 'play') pauseGame();
        else if (state === 'pause') resumeGame();
      }
    });
    window.addEventListener('keyup', function (e) {
      if (KEYS[e.code]) input.keys[KEYS[e.code]] = false;
    });

    var recalibrate = function () { input.calibrate = true; };
    window.addEventListener('orientationchange', recalibrate);
    if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', recalibrate);
  }


  /* ---------- Звуки окружения у кота ---------- */

  // громкость по расстоянию: полная ближе near, тишина дальше far
  function earshot(dx, dy, dz, near, far) {
    var k = clamp((far - Math.sqrt(dx * dx + dy * dy + dz * dz)) / (far - near), 0, 1);
    return k * k * (3 - 2 * k);
  }

  function panOf(x) { return clamp((x - camera.position.x) / 7, -1, 1) * 0.8; }

  // Огненные острова рядом: тлеющая лава клокочет, с накалом ревёт пламя, вспышка — «вуф».
  // Мельница: парусина крыльев, стук шестерни, скрип вала; водопад шумит. Несколько источников складываются как «или» —
  // не громче одного вплотную. Сцене (sound.js, scene) — биом, ночь и скорость: ветер, птицы, сверчки, колокол
  var nearby = { lava: 0, flame: 0, heat: 0, firePan: 0, mill: 0, millPan: 0, water: 0, waterPan: 0, biome: 'sky', night: 0, speed: 0 };
  function updateAmbience(dt) {
    var P = player, lavaQ = 1, flameQ = 1, loud = 0, pw = 0, pan = 0;
    nearby.heat = 0;
    world.rows.forEach(function (row) {
      if (Math.abs(row.z - P.z) > 14) return;
      row.plats.forEach(function (p) {
        if (p.type !== 'fire') return;
        var g = earshot(p.x - P.x, p.y - P.y, p.z - P.z, 2.5, 13), st = fireState(p), h = fireHeat(p, st);
        if (st === 'burn' && p.heard && p.heard !== 'burn' && g > 0.05) Sound.ignite(g);
        p.heard = st;
        if (g <= 0) return;
        lavaQ *= 1 - g;
        flameQ *= 1 - g * h * h;
        if (g * h > loud) {
          loud = g * h;
          nearby.heat = h;
        }
        pan += panOf(p.x) * g;
        pw += g;
      });
    });
    nearby.lava = 1 - lavaQ;
    nearby.flame = 1 - flameQ;
    nearby.firePan = pw > 0 ? pan / pw : 0;
    nearby.mill = nearby.water = 0;
    nearby.biome = bio.key;
    nearby.night = day.night;
    nearby.speed = state === 'play' && !P.dead ? clamp(Math.abs(P.vz || 0) / 14, 0, 1) : 0;
    world.rows.forEach(function (row) { // под воротами — стяги хлопают
      if (!row.gate || row.flagsHeard || Math.abs(row.z - P.z) > 1.5 || state !== 'play') return;
      row.flagsHeard = true;
      Sound.flags(1);
    });
    islands.forEach(function (is) {
      var a = is.mesh.userData.anim;
      if (a.water) {
        var m0 = is.mesh.position, w = earshot(m0.x + a.water[0] - P.x, m0.y + a.water[1] - P.y, m0.z + a.water[2] - P.z, 6, 26);
        if (w > nearby.water) {
          nearby.water = w;
          nearby.waterPan = panOf(m0.x + a.water[0]);
        }
      }
      if (!a.blades) return;
      var m = is.mesh.position, g = earshot(m.x - P.x, m.y + 3 - P.y, m.z - P.z, 8, 30);
      // каждое крыло, проходя низ, со свистом режет воздух; вал постукивает и иногда скрипит
      var blade = Math.floor(-a.blades.rotation.z / (Math.PI / 2));
      if (is.blade !== undefined && blade !== is.blade && g > 0.03) Sound.millBlade(g);
      is.blade = blade;
      if (g > nearby.mill) {
        nearby.mill = g;
        nearby.millPan = panOf(m.x);
      }
    });
    Sound.ambience(dt, nearby);
  }


  /* ---------- Звук (WebAudio, без файлов) ---------- */



  function vibrate(ms) {
    if (!settings.vibro) return;
    if (Native.inApp) return Native.send('haptic', { ms: ms }); // в приложении — нативный отклик
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }


  /* ---------- Витрина: меню и лавка ---------- */

  // Лавка — как на макете: фон — картинка (небо и островок с шатром, хоругвями и постаментом, shop-*.webp), на ковре
  // постамента — 3D-кот игры. Он рисуется своим рендерером на прозрачном canvas (game__shop-cat) поверх картинки: в сцене
  // только кот, свет (тёплый ключевой спереди-слева — от него тень на ковёр, холодный контровой сзади) и тень — сама
  // по себе (ShadowMaterial) плюс мягкое пятно под лапами. Кадр — по ковру на картинке: лапы — в его середине, рост —
  // как у нарисованного кота на макете (frameShowroom). Кот стоит спокойно (SHOW_POSE), его можно крутить пальцем
  var show = { on: false, drag: 0, scene: null, camera: null, renderer: null, key: null, catH: 0 };
  var SHOW_POSE = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wait: 0, squash: 0, swing: null, flip: -1, flight: null, trick: null, fury: 0, bubble: false, invuln: 0, pace: 1 };
  // ковёр на картинке островка (961×831 px макета от его левого верхнего угла): середина и рост нарисованного кота
  var SHOP_CARPET = { x: 485 / 961, y: 593 / 831, catPx: 385 / 961 }; // наш кот стройнее нарисованного — чуть выше его

  function buildShowroom() {
    var S = new T.Scene(), key = new T.DirectionalLight('#ffe6c2', 1.6 * LIGHT_K), rim = new T.DirectionalLight('#d8e6ff', 0.9 * LIGHT_K);
    key.position.set(2.2, 5, -3.4); // спереди-слева (камера — со стороны −z, её «лево» — +x): тень ложится назад и вправо
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.6;
    key.shadow.camera.right = key.shadow.camera.top = 1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    rim.position.set(2.5, 3.5, 6);
    S.add(new T.HemisphereLight('#fff4e4', '#a5603a', 0.62 * LIGHT_K), key, key.target, rim);
    // тень на ковёр: плоскость, которая видна только там, где тень
    var floor = new T.Mesh(new T.PlaneGeometry(5, 5), new T.ShadowMaterial({ color: '#3a1606', opacity: 0.38 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    S.add(floor);
    var blob = new T.Mesh(new T.PlaneGeometry(1.15, 1.15), new T.MeshBasicMaterial({ map: tex.dot, color: '#2a0f04', transparent: true, opacity: 0.55, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.004;
    blob.renderOrder = 2;
    S.add(blob);
    show.scene = S;
    show.key = key;
    show.v = new T.Vector3();
    show.camera = new T.PerspectiveCamera(24, 1, 0.1, 100);
    show.camera.layers.enableAll(); // кот — в своём слое (LAYER_CAT)
    var r = show.renderer = new T.WebGLRenderer({ canvas: el.shopCat, alpha: true, antialias: true });
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFShadowMap; // мягкость — shadow.radius
    r.setClearColor(0, 0);
  }

  // отражения кота в лавке: у её рендерера свой контекст WebGL, карта неба игры там недоступна (металл был бы тёмным) —
  // на время лавки у материалов кота своя карта (и у облика, надетого на примерке), при выходе — прежняя
  function shopEnv(on) {
    if (!show.env) show.env = buildEnvironment(show.renderer);
    var from = on ? envMap : show.env, to = on ? show.env : envMap;
    cat.root.traverse(function (o) {
      if (o.material) [].concat(o.material).forEach(function (m) { if (m.envMap === from) m.envMap = to; });
    });
  }

  // кот в витрину и обратно; переход — короткое проявление кадра (is-cut)
  function enterShowroom() {
    if (!cat) return;
    if (!show.scene) buildShowroom();
    show.on = true;
    show.drag = 0;
    show.scene.add(cat.root); // объект в одной сцене за раз — из мира он уходит сам
    if (!show.catH) { // рост кота с ушами — по габариту модели, в позе витрины
      cat.root.position.set(0, 0, 0);
      cat.root.rotation.set(0, 0, 0);
      cat.root.updateMatrixWorld(true);
      var bb = new T.Box3().setFromObject(cat.root, true);
      show.catH = clamp(bb.max.y - Math.max(bb.min.y, 0), 1, 2.5);
    }
    cutFlash();
  }

  function leaveShowroom() {
    if (!show.on) return;
    show.on = false;
    shopEnv(false);
    scene.add(cat.root);
    cutFlash();
    render(); // игра могла стоять на паузе — кадр мира нужен сейчас, а не со следующим ходом
  }

  // фон по экрану: меню (заставка, карта; задания и настройки, открытые из меню) — картина из референса, лавка — своя
  // картина с 3D-котом, игра, пауза и финал — мир. Пока виден фон меню или лавки, мир не рисуется — телефон не греется
  var menuBg = false;
  function syncShowroom() {
    var fromMenu = state === 'settings' ? settingsBack === 'start' : state === 'quests' || state === 'codex' ? screenBack === 'start' : false;
    menuBg = state === 'start' || state === 'map' || state === 'daily' || fromMenu || state === 'loading';
    el.game.classList.toggle('is-menu-bg', menuBg);
    var shop = state === 'shop';
    el.game.classList.toggle('is-shop-bg', shop);
    if (shop && !show.on) enterShowroom();
    else if (!shop && show.on) leaveShowroom();
  }

  // меню: кот на островке смотрит на курсор (палец, мышь; на телефоне — наклон), без них — оглядывается сам;
  // небо чуть сдвигается следом (стили: --mx, --my от −1 до 1). Островок рисует menuisle.js
  var par = { x: 0, y: 0, px: 0, py: 0, idle: 9, t: 0, sx: '', sy: '', purr: 30 }, menuIsle = null;
  function onMenuCat(e) { // кот на островке: середина картинки, от ушей до лап
    var r = el.isle.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    return x > 0.36 && x < 0.66 && y > 0.04 && y < 0.62;
  }
  function menuParallax(dt) {
    par.t += dt;
    par.idle += dt;
    var tx, ty, k = 1 - Math.exp(-dt * 4);
    if (par.idle > 4) {
      tx = Math.sin(par.t * 0.33) * 0.6;
      ty = Math.sin(par.t * 0.21 + 1.3) * 0.35;
      k *= 0.5;
    } else { // от головы кота (на картинке — 50.4% ширины, 24.8% высоты) к курсору
      var r = el.isle.getBoundingClientRect();
      tx = clamp((par.px - r.left - r.width * 0.504) / (view.w * 0.3), -1, 1);
      ty = clamp((par.py - r.top - r.height * 0.248) / (view.h * 0.4), -1, 1);
    }
    if (input.tilt || input.motion) tx = clamp((input.tx - input.cx) * 2.4, -1, 1); // наклон влево-вправо
    par.x += (tx - par.x) * k;
    par.y += (ty - par.y) * k;
    var sx = par.x.toFixed(3), sy = par.y.toFixed(3);
    if (sx !== par.sx) el.menuBg.style.setProperty('--mx', par.sx = sx); // на фоне меню, не на всей игре: пересчёт стилей — только его
    if (sy !== par.sy) el.menuBg.style.setProperty('--my', par.sy = sy);
    if (menuIsle) menuIsle.draw(par.t, par.x, par.y);
    if ((par.purr -= dt) <= 0) { // в меню кот иногда мурлычет сам (звук — после первого касания)
      par.purr = rand(25, 45);
      Sound.purr(3.8, 0.22);
    }
  }

  function wipe() { // переход между экранами — облачная вспышка (стили: .game__wipe)
    el.wipe.classList.remove('is-on');
    void el.wipe.offsetWidth;
    el.wipe.classList.add('is-on');
  }

  function cutFlash() {
    el.canvas.classList.remove('is-cut');
    void el.canvas.offsetWidth;
    el.canvas.classList.add('is-cut');
  }

  // кадр: лапы — в середине ковра на картинке, рост — как у нарисованного кота; взгляд на ковёр ~14° сверху (на картинке
  // он — эллипс ~1:4) и чуть справа. Сдвиг кадра (setViewOffset) ставит лапы точно в середину ковра
  function frameShowroom() {
    var C = show.camera, r = el.shopIsle.getBoundingClientRect();
    if (!r.width) return false;
    var fx = r.left + r.width * SHOP_CARPET.x, fy = r.top + r.height * SHOP_CARPET.y, px = r.width * SHOP_CARPET.catPx;
    C.aspect = view.w / view.h;
    C.clearViewOffset();
    var catH = show.catH, D = catH * view.h / (2 * Math.tan(rad(C.fov / 2)) * px), yaw = 0.3, e = rad(14);
    C.position.set(Math.sin(yaw) * Math.cos(e) * D, Math.sin(e) * D, -Math.cos(yaw) * Math.cos(e) * D);
    C.lookAt(show.v.set(0, catH * 0.5, 0));
    C.updateMatrixWorld();
    C.updateProjectionMatrix();
    var p = show.v.set(0, 0, 0).project(C), sx = (p.x + 1) / 2 * view.w, sy = (1 - p.y) / 2 * view.h;
    C.setViewOffset(view.w, view.h, sx - fx, sy - fy, view.w, view.h);
    return true;
  }

  function furShells() { // оболочки меха на коте и надетом облике — меши с шейдером shellCompile
    var list = [];
    cat.root.traverse(function (o) { if (o.isMesh && o.visible && o.material && o.material.onBeforeCompile === shellCompile) list.push(o); });
    return list;
  }

  function renderShowroom() {
    var R = show.renderer, pr = Math.min(window.devicePixelRatio || 1, 2);
    if (R.getPixelRatio() !== pr) R.setPixelRatio(pr);
    if (show.w !== view.w || show.h !== view.h) {
      R.setSize(view.w, view.h, false); // размер на экране — из стилей (весь экран)
      show.w = view.w;
      show.h = view.h;
    }
    shopEnv(true); // и у только что надетого на примерке
    if (frameShowroom()) {
      // крупно длинные оболочки меха рябят по краю — в лавке только внутренние (30%): короткий густой бархат
      var shells = furShells();
      shells.forEach(function (m) {
        var g = m.geometry;
        g.userData.n = g.userData.n || g.instanceCount;
        g.instanceCount = Math.max(1, Math.round(g.userData.n * 0.3));
      });
      R.render(show.scene, show.camera);
      shells.forEach(function (m) { m.geometry.instanceCount = m.geometry.userData.n; });
    }
  }

  /* ---------- Прогресс: события для заданий, кошелёк, облик, бонусы на дороге ---------- */

  // событие игры → задания дня и достижения (missions.js); только что выполненное — коротко на экране
  var doneQueue = [];
  function track(event, n) {
    var done = Missions.track(event, n);
    done.forEach(function (d) { doneQueue.push(d); });
    if (doneQueue.length) {
      var d = doneQueue.shift();
      toast(tr(d.type === 'mission' ? 'mis.done' : 'ach.done', { name: tr((d.type === 'mission' ? 'mis.' : 'ach.') + d.id, { n: d.goal }) }), 2200);
    }
    updateQuestBadge();
  }

  // конец забега или уровня: монеты — в кошелёк, итоги — в задания и аналитику (result: 'fall' или 'win')
  // снимок сохранений приложению (облако) — после забега, покупки, награды; в браузере — ничего
  function cloudSave() { if (Native.inApp) Native.send('cloudSave', { save: snapshot(), at: Date.now() }); }

  function runEnded(result) {
    var m = Math.floor(player.maxDist);
    setTimeout(cloudSave, 0); // кошелёк уже пополнен — ниже, в этом же вызове
    Telemetry.event(mode === 'level' ? 'level_end' : 'run_end', {
      level: level ? level.id : '', result: result || 'fall', dist: m, coins: player.coins, combo: player.bestCombo, bosses: world.bosses,
      sec: Math.round(perfRun.t), fps: perfRun.t ? Math.round(perfRun.n / perfRun.t) : 0, pr: view.pr, bloom: bloom.on
    });
    perfRun.t = perfRun.n = 0;
    Shop.addCoins(player.coins);
    el.overWallet.innerHTML = tr('over.wallet', { n: player.coins, total: Shop.coins() });
    track('run');
    track('dist', m);
    track('coins', player.coins);
    track('combo', player.bestCombo);
    renderWallet();
  }

  function updateQuestBadge() {
    var n = Missions.pending();
    el.questBadge.textContent = n || '';
  }

  function renderWallet() {
    el.walletNum.textContent = Shop.coins();
  }

  // облик кота: доспех, плащ, меч — свои материалы кота (у пса и врагов металл общий)
  // облик кота: надетое или примеряемое в лавке (tryOn — слот → id, сбрасывается при выходе из лавки)
  var tryOn = {};
  function skinFor(slot) {
    var id = tryOn[slot];
    return id ? Shop.SKINS[slot].filter(function (s) { return s.id === id; })[0] : Shop.skinOf(slot);
  }

  function applySkin() {
    if (!cat || !cat.skin) return;
    var A = skinFor('armor'), C = skinFor('cape'), S = skinFor('sword'), K = cat.skin;
    K.armor.color.set(A.color);
    K.dark.color.set(A.dark);
    K.cape.color.set(C.color);
    K.blade.color.set(S.color);
    K.blade.emissive.set(S.glow || '#000000');
    K.blade.emissiveIntensity = S.glow ? 0.9 : 0;
    var tint = new T.Color(skinFor('fur').tint || '#ffffff');
    K.fur.forEach(function (fm) { fm.color.copy(fm.userData.base).multiply(tint); });
    var H = skinFor('hat').id, Q = skinFor('pet').id;
    if (cat.hatId !== H) {
      if (cat.hat) cat.head.remove(cat.hat);
      cat.hat = H === 'none' ? null : buildHat(H);
      if (cat.hat) {
        cat.hat.position.copy(K.hatAt || new T.Vector3(0, 0.42, 0));
        cat.hat.traverse(function (o) { o.layers.set(LAYER_CAT); });
        cat.head.add(cat.hat);
      }
      cat.hatId = H;
    }
    if (cat.petId !== Q) {
      if (cat.pet) cat.root.remove(cat.pet);
      cat.pet = Q === 'none' ? null : buildPet(Q);
      if (cat.pet) {
        cat.pet.traverse(function (o) { o.layers.set(LAYER_CAT); });
        cat.root.add(cat.pet);
      }
      cat.petId = Q;
    }
  }

  // Шляпы (садятся на макушку — skin.hatAt): корона с зубцами и камнями, берет с пером, колпак мага со звёздами
  function buildHat(id) {
    var g = new T.Group(), b = new Bundle();
    if (id === 'crown') {
      b.add(new T.CylinderGeometry(0.15, 0.16, 0.09, 18, 1, true), mat.gold, [0, 0.03, 0]);
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2;
        b.add(new T.ConeGeometry(0.035, 0.09, 6), mat.gold, [Math.sin(a) * 0.15, 0.11, Math.cos(a) * 0.15]);
        b.add(geo.sphereLow, i % 2 ? mat.hatGem : mat.hatGem2, [Math.sin(a) * 0.158, 0.035, Math.cos(a) * 0.158], null, 0.022);
      }
    } else if (id === 'beret') {
      b.add(geo.sphere, mat.hatBeret, [0, 0.03, 0.02], null, [0.2, 0.07, 0.2]);
      b.add(new T.ConeGeometry(0.03, 0.34, 6), mat.hatFeather, [0.12, 0.13, 0.1], [-0.9, 0, -0.5], [1, 1, 0.35]);
    } else {
      b.add(new T.CylinderGeometry(0.25, 0.25, 0.018, 24), mat.hatWizard, [0, 0.0, 0]);
      b.add(new T.ConeGeometry(0.16, 0.42, 20), mat.hatWizard, [0, 0.21, 0.02], [-0.18, 0, 0]);
      [[0.07, 0.16, 0.13], [-0.06, 0.27, 0.1], [0.02, 0.36, 0.07]].forEach(function (p) { b.add(geo.sphereLow, mat.gold, p, null, 0.018); });
    }
    b.build(g);
    g.scale.setScalar(1.35);
    return g;
  }

  // Спутник: светлячок (сияющий шарик с крылышками) или совёнок — летит у плеча, в забеге притягивает монеты рядом
  function buildPet(id) {
    var g = new T.Group(), body = new T.Group(), b = new Bundle();
    if (id === 'firefly') {
      b.add(geo.sphere, mat.petGlow, [0, 0, 0], null, 0.09);
      b.add(geo.sphereLow, mat.white, [0.11, 0.03, 0], null, [0.1, 0.012, 0.05]);
      b.add(geo.sphereLow, mat.white, [-0.11, 0.03, 0], null, [0.1, 0.012, 0.05]);
      var halo = new T.Sprite(mat.featherGlow);
      halo.scale.set(0.6, 0.6, 1);
      body.add(halo);
    } else {
      b.add(geo.sphere, mat.petOwl, [0, 0, 0], null, [0.14, 0.15, 0.13]);
      b.add(geo.sphere, mat.petOwlBelly, [0, -0.02, -0.07], null, [0.09, 0.1, 0.07]);
      [-1, 1].forEach(function (sd) {
        b.add(geo.sphere, mat.white, [0.055 * sd, 0.06, -0.1], null, 0.04);
        b.add(geo.sphereLow, mat.eye, [0.055 * sd, 0.06, -0.135], null, 0.022);
        b.add(new T.ConeGeometry(0.03, 0.07, 4), mat.petOwl, [0.08 * sd, 0.15, -0.02]);
        b.add(geo.sphereLow, mat.petOwl, [0.14 * sd, -0.01, 0], null, [0.04, 0.09, 0.08]);
      });
      b.add(new T.ConeGeometry(0.018, 0.04, 4), mat.gold, [0, 0.02, -0.14], [Math.PI / 2, 0, 0]);
    }
    b.build(body);
    g.add(body);
    g.userData.body = body;
    g.position.set(0.75, 1.55, 0.35);
    return g;
  }

  // Бонусы на дороге (над островом, как щит): магнит — монеты летят к коту; монеты ×2; пузырь — один удар
  // или падение не отнимут жизнь. Время магнита и ×2 — из улучшений (shop.js)
  var BONUS = ['magnet', 'double', 'bubble'];
  function buildBonus(kind) {
    var g = new T.Group(), b = new Bundle();
    if (kind === 'magnet') {
      b.add(new T.TorusGeometry(0.26, 0.09, 10, 20, Math.PI), mat.magnet, [0, 0.05, 0], [0, 0, Math.PI]);
      [-1, 1].forEach(function (s) {
        b.add(new T.CylinderGeometry(0.09, 0.09, 0.16, 10), mat.magnet, [0.26 * s, 0.13, 0]);
        b.add(new T.CylinderGeometry(0.092, 0.092, 0.1, 10), mat.metal, [0.26 * s, 0.26, 0]);
      });
    } else if (kind === 'double') {
      [-0.1, 0.1].forEach(function (dx, i) {
        b.add(geo.coinRim, mat.gold, [dx, i * 0.06, -i * 0.06], [Math.PI / 2, 0, 0], 1.1);
        b.add(geo.coinFace, mat.coinFace, [dx, i * 0.06, -i * 0.06], [Math.PI / 2, 0, 0], 1.1);
      });
    } else if (kind === 'heart') {
      b.add(heartGeo(), mat.heart, [0, 0, 0]);
    } else {
      b.add(geo.sphere, mat.bubble, [0, 0, 0], null, 0.4);
    }
    b.build(g, { cast: kind !== 'bubble' });
    var halo = new T.Sprite(kind === 'bubble' ? mat.shieldGlow : kind === 'heart' ? mat.heartGlow : mat.featherGlow);
    halo.scale.set(1.6, 1.6, 1);
    halo.position.z = -0.1;
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  // пухлое сердце: контур из кривых, выдавлен со скруглённой фаской; ~0,7 м
  function heartGeo() {
    if (geo.heart) return geo.heart;
    var h = new T.Shape();
    h.moveTo(5, 5);
    h.bezierCurveTo(5, 5, 4, 0, 0, 0);
    h.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    h.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
    h.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    h.bezierCurveTo(16, 7, 16, 0, 10, 0);
    h.bezierCurveTo(7, 0, 5, 5, 5, 5);
    geo.heart = new T.ExtrudeGeometry(h, { depth: 3, bevelEnabled: true, bevelThickness: 2.4, bevelSize: 2, bevelSegments: 5, curveSegments: 14 });
    geo.heart.center();
    geo.heart.rotateZ(Math.PI);
    geo.heart.scale(0.032, 0.032, 0.032);
    return geo.heart;
  }

  function collectBonus(o) {
    var P = player, k = o.kind;
    o.taken = true;
    sparkle(o.x, o.y, o.z, k === 'bubble' ? [0.55, 0.8, 1] : k === 'heart' ? [1, 0.35, 0.42] : [1, 0.86, 0.35], 18, 3.5);
    vibrate(20);
    if (k === 'heart') { // жизнь; запас и так полный (взял после победы над боссом) — монеты
      Sound.heart();
      Sound.purr(1.9, 0.3); // кот доволен
      if (P.lives < maxLives()) {
        P.lives++;
        popText(tr('bonus.heart'), tr('bonus.heart.sub'), true);
      } else popText(tr('bonus.heart'), '+' + coinsWord(addCoins(25)), true);
      note('bonus');
      return;
    }
    Sound.shield();
    if (k === 'magnet') P.magnet = Shop.upgrade('magnet');
    else if (k === 'double') P.double = Shop.upgrade('double');
    else P.bubble = true;
    popText(tr('bonus.' + k), tr('bonus.' + k + '.sub'), true);
    note('bonus');
  }

  // монеты в радиусе r летят к коту
  function attractCoins(dt, r) {
    var P = player, R2 = r * r, px = P.x, py = P.y + 0.95, pz = P.z, k = smooth(9, dt);
    world.coins.forEach(function (c) {
      if (c.taken) return;
      var dx = px - c.x, dy = py - c.y, dz = pz - c.z;
      if (dx * dx + dy * dy + dz * dz > R2) return;
      c.x += dx * k;
      c.y += dy * k;
      c.z += dz * k;
    });
  }

  function updateBonuses(dt) {
    var P = player;
    if (P.magnet > 0) {
      P.magnet = Math.max(0, P.magnet - dt);
      attractCoins(dt, 6);
    }
    if (P.double > 0) P.double = Math.max(0, P.double - dt);
    if (skinFor('pet').id !== 'none' && !(P.magnet > 0) && !(P.fury > 0)) attractCoins(dt, skinFor('pet').id === 'owl' ? 3.2 : 2.4); // спутник носит монеты рядом
  }

  // пузырь лопнул вместо потери жизни
  function popBubble() {
    var P = player;
    P.bubble = false;
    sparkle(P.x, P.y + 1, P.z, [0.6, 0.85, 1], 30, 5);
    Sound.shieldBreak();
    popText(tr('bonus.bubble.pop'), '', true);
    note('bubblePop');
  }


  /* ---------- Лавка и задания: экраны ---------- */

  var shopTab = 'look', questTab = 'day', screenBack = 'start';

  function coinIcon() { return '<i class="game__coin"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#paw"></use></svg></i>'; }

  function openScreen(name) {
    Sound.init();
    Sound.click();
    if (state === 'start' || state === 'over' || state === 'win' || state === 'pause') screenBack = state;
    if (name === 'shop') renderShop();
    else if (name === 'codex') renderCodex();
    else renderQuests();
    setState(name);
  }

  function closeScreen() {
    Sound.click();
    var wasShop = state === 'shop';
    if (state === 'codex' && Object.keys(codexNew).length) { // новые записи просмотрены
      codexNew = {};
      save('codexNew', codexNew);
      updateCodexBadge();
    }
    if (wasShop) {
      tryOn = {};
      applySkin();
    }
    renderWallet();
    setState(screenBack);
  }

  function renderShop() {
    $$('.game__wallet-num').forEach(function (n) { n.textContent = Shop.coins(); });
    $$('#game-shop-tabs button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === shopTab); });
    var html = '';
    if (shopTab === 'look') {
      html += '<p class="game__try-hint">' + tr('shop.try') + '</p>';
      ['armor', 'cape', 'sword', 'hat', 'fur', 'trail', 'pet'].forEach(function (slot) {
        html += '<p class="game__section-title is-' + slot + '"><i class="game__sec-ico">' + SLOT_ICON[slot] + '</i><span>' + tr('shop.' + slot) + '</span></p>';
        Shop.SKINS[slot].forEach(function (s) {
          var worn = Shop.isWorn(slot, s.id), own = Shop.isOwned(slot, s.id);
          var btn = worn ? '<button type="button" class="game__buy is-plain" disabled>' + tr('shop.worn') + '</button>'
            : own ? '<button type="button" class="game__buy" data-wear="' + slot + ':' + s.id + '">' + tr('shop.wear') + '</button>'
              : '<button type="button" class="game__buy" data-wear="' + slot + ':' + s.id + '"' + (Shop.coins() < s.price ? ' disabled' : '') + '>' + coinIcon() + s.price + '</button>';
          var trying = tryOn[slot] === s.id && !worn;
          html += '<div class="game__item' + (worn ? ' is-worn' : '') + (trying ? ' is-try' : '') + '" data-try="' + slot + ':' + s.id + '"><i class="game__swatch" style="--c:' + s.color + '"></i>' +
            '<div class="game__item-text"><b>' + tr('skin.' + slot + '.' + s.id) + '</b>' + (slot === 'pet' && s.id !== 'none' ? '<small>' + tr('skin.pet.' + s.id + '.sub') + '</small>' : '') + '</div>' + btn + '</div>';
        });
      });
    } else {
      Object.keys(Shop.UPGRADES).forEach(function (key) {
        var U = Shop.UPGRADES[key], l = Shop.level(key), price = Shop.upgradePrice(key);
        var btn = price == null ? '<button type="button" class="game__buy is-plain" disabled>' + tr('shop.max') + '</button>'
          : '<button type="button" class="game__buy" data-up="' + key + '"' + (Shop.coins() < price ? ' disabled' : '') + '>' + coinIcon() + price + '</button>';
        html += '<div class="game__item"><div class="game__item-text"><b>' + tr('up.' + key) + '</b><small>' +
          tr('up.' + key + '.v', { v: fmt(U.value(l)), next: price == null ? '' : fmt(U.value(l + 1)) }) + '</small>' +
          '<div class="game__bar"><i style="width:' + (l / U.max * 100) + '%"></i></div></div>' + btn + '</div>';
      });
    }
    el.shopList.innerHTML = html;
  }

  function fmt(v) { return Math.round(v * 10) / 10; }

  // значки разделов лавки: шлем, плащ, меч
  var SLOT_ICON = {
    armor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4.7 0-8 3.6-8 8.4V20l3.2 1.5V14h9.6v7.5L20 20v-9.1c0-4.8-3.3-8.4-8-8.4zm-5.2 9.4V10h10.4v1.9z"/></svg>',
    cape: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2.5h8l1 2.2c2 4.3 3.3 9.7 3.5 16.8l-4-1.6-2.2 2-2.3-2-2.3 2-2.2-2-4 1.6C3.7 14.4 5 9 7 4.7z"/></svg>',
    sword: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 2.5l-.6 4.4-8.6 8.6-2.8-2.8 8.6-8.6zM6.9 13.1l4 4-1.5 1.5-1.2-1.2-2.4 2.4.2 1.7-1.4 1.4-3.6-3.6 1.4-1.4 1.7.2 2.4-2.4-1.2-1.2z"/></svg>',
    hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-2 11H5z"/></svg>',
    fur: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#paw"/></svg>',
    trail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.3L21 9l-5.3 3.9L17.6 20 12 16.1 6.4 20l1.9-7.1L3 9l6.8-.7z"/></svg>',
    pet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM2 9c3 0 5 1.5 6 3-2 .3-4.5 0-6-3zm20 0c-3 0-5 1.5-6 3 2 .3 4.5 0 6-3z"/></svg>'
  };

  function renderQuests() {
    $$('.game__wallet-num').forEach(function (n) { n.textContent = Shop.coins(); });
    $$('#game-quest-tabs button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === questTab); });
    var html = '';
    if (questTab === 'day') {
      Missions.missions().forEach(function (m) {
        var btn = m.claimed ? '<button type="button" class="game__buy is-plain" disabled>' + tr('quests.got') + '</button>'
          : '<button type="button" class="game__buy" data-claim="m:' + m.id + '"' + (m.done ? '' : ' disabled') + '>' + coinIcon() + m.reward + '</button>';
        html += '<div class="game__item"><div class="game__item-text"><b>' + tr('mis.' + m.id, { n: m.goal }) + '</b><small>' + m.n + ' / ' + m.goal + '</small>' +
          '<div class="game__bar"><i style="width:' + (m.n / m.goal * 100) + '%"></i></div></div>' + btn + '</div>';
      });
      html += '<p class="game__text game__text--small">' + tr('quests.new') + '</p>';
    } else if (questTab === 'run') { // забег дня: кнопка, рекорд дня, лучшие дни
      var dBest = Daily.runBest(), top = Daily.runTop(5);
      html += '<div class="game__item"><div class="game__item-text"><b>' + tr('dayrun.title', { date: dayLabel(Daily.today()) }) + '</b><small>' + tr('dayrun.text') + '</small>' +
        '<small>' + (dBest ? tr('dayrun.best', { n: dBest }) : tr('dayrun.none')) + '</small></div><button type="button" class="game__buy" data-dayrun="1">' + tr('dayrun.go') + '</button></div>';
      html += '<p class="game__section-title"><span>' + tr('dayrun.top') + '</span></p>';
      top.forEach(function (r, i) {
        html += '<div class="game__item game__top"><b class="game__top-n">' + (i + 1) + '</b><div class="game__item-text"><b>' + dayLabel(r.date) + '</b></div><b class="game__top-m">' + tr('dayrun.m', { n: r.dist }) + '</b></div>';
      });
      if (!top.length) html += '<p class="game__text game__text--small">' + tr('dayrun.empty') + '</p>';
    } else {
      Missions.achievements().forEach(function (a) {
        var full = a.tier >= a.max, goal = full ? a.goal : a.nextGoal;
        var btn = full ? '<button type="button" class="game__buy is-plain" disabled>' + tr('quests.done') + '</button>'
          : '<button type="button" class="game__buy" data-claim="a:' + a.id + '"' + (a.claimable ? '' : ' disabled') + '>' + coinIcon() + a.reward + '</button>';
        html += '<div class="game__item"><div class="game__item-text"><b>' + tr('ach.' + a.id, { n: goal }) + '</b><small>' + tr('quests.tier', { t: Math.min(a.tier + 1, a.max), max: a.max }) + ' · ' + Math.min(a.n, goal) + ' / ' + goal + '</small>' +
          '<div class="game__bar"><i style="width:' + (Math.min(1, a.n / goal) * 100) + '%"></i></div></div>' + btn + '</div>';
      });
    }
    el.questList.innerHTML = html;
  }

  /* ---------- Справочник ---------- */

  // Всё, что встречается в пути. Запись открывается при первой встрече (codexSeen — когда это появилось в мире),
  // до того — силуэт и «???». Картинка — снимок модели игры (codexShot): тот же рендерер, своя сцена со светом,
  // кадр в текстуру → PNG; снимки — по одному за кадр, чтобы экран открывался сразу. Бейдж на кнопке меню — новые записи
  var CODEX = {
    boss: ['dragon', 'dog', 'golem', 'lava', 'ghost'],
    foe: ['crow', 'bat', 'dog', 'drake'],
    trap: ['gap', 'barrier', 'lowbar', 'axe', 'keg', 'roll', 'fire', 'ice', 'ghost', 'spike', 'wood'],
    bonus: ['coin', 'mushroom', 'shield', 'wings', 'magnet', 'double', 'bubble', 'heart']
  };
  var CODEX_TRAP = { fire: 1, ice: 1, ghost: 1, spike: 1, wood: 1 }; // острова-ловушки (addPlatform)
  var codexTab = 'boss', codexOpen = load('codex', {}), codexNew = load('codexNew', {}), shots = { cache: {}, queue: [], busy: false };

  function codexSeen(tab, id) {
    var k = tab + '.' + id;
    if (codexOpen[k]) return;
    codexOpen[k] = 1;
    codexNew[k] = 1;
    save('codex', codexOpen);
    save('codexNew', codexNew);
    updateCodexBadge();
  }

  function updateCodexBadge() {
    el.codexBadge.textContent = Object.keys(codexNew).length || '';
  }

  function solidIsland(root) { // обычный остров рисуется пачкой (instancing) — для снимка ему свой меш
    var I = root.userData.inst;
    if (I) {
      var m = new T.Mesh(I.batch.geometry, I.batch.material);
      m.scale.set(I.sx, 1, I.sz);
      m.rotation.y = I.rotY;
      root.add(m);
    }
    return root;
  }

  function codexModel(tab, id) {
    if (tab === 'boss') return buildBossOf(id);
    if (tab === 'foe') return id === 'crow' ? buildCrow() : id === 'bat' ? buildBat() : id === 'dog' ? buildDog() : buildDragon();
    if (tab === 'trap') {
      if (id === 'barrier') return buildBarrier();
      if (id === 'lowbar') return buildLowbar();
      if (id === 'axe') return buildAxeGate();
      if (id === 'keg') return buildKeg();
      if (id === 'roll') return buildRoller();
      if (id === 'gap') { // провал: две плиты дороги, между ними — пусто
        var g = new T.Group();
        [-1.75, 1.75].forEach(function (z) {
          var m = solidIsland(buildPlatformMesh('stone', 2.2, 2.4, 0));
          m.position.z = z;
          g.add(m);
        });
        return g;
      }
      return solidIsland(buildPlatformMesh(id, 1.9, 2.4, 0, 1)); // шипы — на правой половине
    }
    if (id === 'coin') {
      var c = new T.Group();
      c.add(new T.Mesh(geo.coinRim, mat.gold), new T.Mesh(geo.coinFace, mat.coinFace));
      c.children.forEach(function (m) { m.rotation.x = Math.PI / 2; });
      return c;
    }
    if (id === 'mushroom') {
      var s = new T.Group();
      if (models.traps && models.traps.mushroom) attach(s, models.traps.mushroom, 0, 0, 0, {}, { plain: 1 });
      else s.add(new T.Mesh(geo.crate, mat.crate));
      return s;
    }
    if (id === 'shield') return buildShieldPickup();
    if (id === 'wings') return buildFeather();
    return buildBonus(id);
  }

  // снимок модели: вид спереди-сбоку-сверху, кадр — по габариту; в текстуру вдвое крупнее и сглаживанием вниз → PNG
  function codexShot(tab, id) {
    var key = tab + '.' + id, S = shots;
    if (S.cache[key]) return S.cache[key];
    var N = 256;
    if (!S.scene) {
      S.rt = new T.WebGLRenderTarget(N * 2, N * 2);
      S.rt.texture.colorSpace = T.SRGBColorSpace;
      S.scene = new T.Scene();
      S.scene.environment = envMap;
      var key0 = new T.DirectionalLight('#fff3e0', 2.2 * LIGHT_K);
      key0.position.set(3, 5, 4);
      S.scene.add(new T.HemisphereLight('#f4f8ff', '#8a7360', 0.9 * LIGHT_K), key0);
      S.cam = new T.PerspectiveCamera(28, 1, 0.05, 400);
      S.cam.layers.enableAll();
      S.px = new Uint8Array(N * N * 16);
      S.big = document.createElement('canvas');
      S.big.width = S.big.height = N * 2;
    }
    var o = codexModel(tab, id);
    o.position.set(0, 0, 0);
    o.rotation.set(0, tab === 'trap' ? -0.5 : -0.45, 0);
    o.visible = true; // скрытые части (вспышки, ауры) так и остаются скрытыми
    o.traverse(function (m) {
      m.frustumCulled = false;
      if (m.isSprite) m.visible = false; // ореолы бонусов — без них: в прозрачном кадре они квадратные
    });
    S.scene.add(o);
    o.updateMatrixWorld(true);
    var bb = new T.Box3(), one = new T.Box3();
    o.traverse(function (m) { if (m.isMesh && m.geometry && m.visible) bb.union(one.setFromObject(m, true)); }); // без ореолов-спрайтов: иначе бонус в кадре крошечный
    var c = bb.getCenter(new T.Vector3()), r = Math.max(0.2, bb.getSize(new T.Vector3()).length() / 2);
    var dir = new T.Vector3(0.25, 0.42, 1).normalize(), dist = r / Math.sin(rad(14)) * 0.86; // шар габарита с запасом: чуть ближе
    S.cam.position.copy(c).addScaledVector(dir, dist);
    S.cam.near = dist * 0.05;
    S.cam.far = dist * 4;
    S.cam.lookAt(c);
    S.cam.updateProjectionMatrix();
    var prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new T.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(S.rt);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(S.scene, S.cam);
    renderer.readRenderTargetPixels(S.rt, 0, 0, N * 2, N * 2, S.px);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(cc, ca);
    S.scene.remove(o);
    var bx = S.big.getContext('2d'), im = bx.createImageData(N * 2, N * 2), row = N * 2 * 4;
    for (var y = 0; y < N * 2; y++) im.data.set(S.px.subarray((N * 2 - 1 - y) * row, (N * 2 - y) * row), y * row); // строки снизу вверх
    bx.putImageData(im, 0, 0);
    var out = document.createElement('canvas'), ox = out.getContext('2d');
    out.width = out.height = N;
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(S.big, 0, 0, N, N);
    return (S.cache[key] = out.toDataURL('image/png'));
  }

  function shotQueue() { // по снимку за кадр: экран открылся сразу, картинки проявляются по одной
    if (shots.busy) return;
    shots.busy = true;
    var next = function () {
      var j = shots.queue.shift();
      if (!j) { shots.busy = false; return; }
      var img = el.codexList.querySelector('[data-shot="' + j + '"]');
      if (img && state === 'codex') {
        var p = j.split('.');
        try { img.src = codexShot(p[0], p[1]); } catch (e) { if (DEBUG) console.warn('codex: снимок ' + j + ' не вышел', e); }
      }
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  function renderCodex() {
    $$('#game-codex-tabs button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === codexTab); });
    var all = 0, got = 0, html = '';
    Object.keys(CODEX).forEach(function (t) { CODEX[t].forEach(function (id) { all++; if (codexOpen[t + '.' + id]) got++; }); });
    el.codexCount.textContent = tr('cx.count', { n: got, m: all });
    shots.queue = [];
    CODEX[codexTab].forEach(function (id) {
      var k = codexTab + '.' + id, open = !!codexOpen[k];
      var name = !open ? tr('cx.locked') : codexTab === 'boss' ? tr('boss.' + id) : tr('cx.' + codexTab + '.' + id + '.name');
      html += '<div class="game__item game__cx' + (open ? '' : ' is-locked') + '">' +
        '<span class="game__cx-pic"><img alt="" data-shot="' + k + '"' + (shots.cache[k] ? ' src="' + shots.cache[k] + '"' : '') + '></span>' +
        '<div class="game__item-text"><b>' + name + (codexNew[k] ? ' <i class="game__cx-new">' + tr('cx.new') + '</i>' : '') + '</b>' +
        '<small>' + (open ? tr('cx.' + codexTab + '.' + id) : tr('cx.lockedText')) + '</small></div></div>';
      if (!shots.cache[k]) shots.queue.push(k);
    });
    el.codexList.innerHTML = html;
    el.codexList.scrollTop = 0;
    shotQueue();
  }

  /* ---------- Награда за вход, сундуки, спасение забега, забег дня ---------- */

  // Награда за вход (daily.js): на заставке, раз за сеанс, когда награда ждёт (после первого обучения).
  // Плитки семи дней: взятые — с галочкой, сегодняшняя — светится; сундук открывается тут же
  var dailyShown = false;
  function maybeDaily(force) {
    if (dailyShown || state !== 'start' || !coached() || !Daily.status().ready || DEBUG && !force && !/[?&]daily\b/.test(location.search)) return; // в проверках (?debug) — только с &daily или __game.daily()
    dailyShown = true;
    el.dailyClaim.textContent = tr('daily.claim');
    el.dailyClaim.dataset.done = '';
    el.dailyGot.textContent = '';
    el.chest.className = 'game__chest';
    renderDaily();
    setState('daily');
  }

  function renderDaily() {
    var S = Daily.status(), html = '';
    Daily.DAYS.forEach(function (d, i) {
      var cls = i < S.day || !S.ready && i === S.day ? ' is-done' : i === S.day ? ' is-today' : '';
      html += '<div class="game__day' + cls + (d.chest ? ' is-chest is-' + d.chest : '') + '"><small>' + tr('daily.day', { n: i + 1 }) + '</small>' +
        (d.chest ? '<i class="game__day-chest"></i>' : coinIcon()) + '<b>' + (d.chest ? tr('daily.chest.' + d.chest) : '+' + d.coins) + '</b></div>';
    });
    el.days.innerHTML = html;
    var today = Daily.DAYS[S.day];
    el.chest.classList.toggle('is-shown', !!(today && today.chest));
  }

  function claimDaily() {
    if (el.dailyClaim.dataset.done) { // «Отлично» — на заставку
      Sound.click();
      setState('start');
      return;
    }
    var r = Daily.claim();
    if (!r) return setState('start');
    var got = r.coins ? ['+' + coinsWord(r.coins)] : openChest(r.chest);
    if (r.coins) Shop.addCoins(r.coins);
    el.dailyGot.textContent = got.join(' · ');
    renderDaily();
    renderWallet();
    el.dailyClaim.textContent = tr('daily.ok');
    el.dailyClaim.dataset.done = '1';
    cloudSave();
    Sound.bonus(3);
    Sound.purr(2.4, 0.3);
    vibrate(30);
    Telemetry.event('daily', { day: Daily.status().day + 1, chest: r.chest || '' });
  }

  // сундук: монеты и — иногда — облик, которого ещё нет (большой — чаще и дороже); крышка откидывается
  function openChest(size) {
    var big = size === 'big', n = Math.round(rand(big ? 300 : 120, big ? 500 : 200) / 10) * 10, out = ['+' + coinsWord(n)];
    Shop.addCoins(n);
    var pool = Shop.unownedLooks(big ? 1200 : 800);
    if (pool.length && Math.random() < (big ? 0.5 : 0.2)) {
      var it = pool[(Math.random() * pool.length) | 0];
      Shop.grant(it.slot, it.id);
      out.push(tr('daily.look', { name: tr('skin.' + it.slot + '.' + it.id) }));
    }
    el.chest.classList.add('is-open');
    Sound.win();
    return out;
  }

  // Спасти забег: после падения в бесконечном забеге — один раз за забег — продолжить с одной жизнью за монеты
  // (в приложении — ещё и за рекламу: приложение показывает её и отвечает adDone). Кольцо — отсчёт 5 с
  var SAVE_COST = 150, saveT = 0;
  function canSave() {
    return mode === 'run' && !player.saved && player.maxDist > 60 && (Shop.coins() >= SAVE_COST || Native.inApp);
  }

  function offerSave() {
    saveT = 5;
    el.saveCoins.innerHTML = '<span>' + tr('save.pay') + '</span>' + coinIcon() + SAVE_COST;
    el.saveCoins.disabled = Shop.coins() < SAVE_COST;
    el.saveAd.style.display = Native.inApp ? '' : 'none'; // реклама — только в приложении
    el.saveRing.classList.remove('is-on');
    void el.saveRing.offsetWidth;
    el.saveRing.classList.add('is-on');
    el.saveLeft.textContent = 5;
    setState('save');
    fitText();
    Sound.squeak();
  }

  function updateSave(dt) {
    if (saveT === Infinity) return; // идёт реклама
    saveT -= dt;
    el.saveLeft.textContent = Math.max(0, Math.ceil(saveT));
    if (saveT <= 0) showOver();
  }

  // кот возвращается в игру над надёжной плитой ряда, к которому летел (или ближайшего впереди); stand — сразу стоит
  // на ней, приседает и прыгает дальше, как на старте (после «Спасти забег»: игрок успевает увидеть кота)
  function respawn(stand) {
    player.move = 'hop';
    player.grounded = false;
    player.slide = 0;
    var row = player.target;
    if (!row || world.rows.indexOf(row) < 0) row = rowAhead(player.z + 2, 0); // ряд уже ушёл в пул позади камеры — к ближайшему впереди
    var p = safePlatform(row);
    while (!p) {
      row = rowAt(row.i + 1);
      p = safePlatform(row);
    }
    player.x = p.x;
    player.z = row.z + 4.5;
    player.y = row.y + 3;
    player.ground = row.y;
    player.vx = 0;
    player.vz = 0;
    player.pace = row.pace;
    player.vy = 3 * player.pace;
    aim(row);
    player.trick = null; // полёт начинается заново: трюки, цепочки и колонка не в счёт
    player.tricks = player.airStomps = 0;
    player.airSword = player.fromCrate = false;
    player.lane = -1;
    player.glide = null; // упал на спуске после полёта — к прежнему острову больше не рулит
    player.slip = player.slideQueued = false;
    player.slipT = player.jumpQ = 0;
    if (stand) {
      player.z = row.z;
      player.y = p.y;
      player.vy = player.vz = 0;
      player.wait = CONFIG.cat.takeoff + 0.8; // стоит, пока гаснет облачная вспышка, потом приседает
      player.from = row;
    }
  }

  function revive(via) {
    var P = player;
    P.saved = true;
    P.dead = false;
    P.koY = null;
    P.lives = 1;
    hud.lives = -1;
    setState('play');
    respawn(true);
    cam.x = P.x * CONFIG.camera.follow; // камера ушла вниз и вперёд за падавшим котом — под облачной вспышкой сразу к нему
    cam.y = P.ground;
    cam.z = P.z;
    cam.ko = 0;
    P.invuln = CONFIG.invuln + 1.5;
    P.rescue = 0.9;
    lastFrame = 0;
    wipe();
    Sound.rescue();
    toast(tr('save.done'));
    Telemetry.event('save', { via: via, dist: Math.floor(P.maxDist) });
  }

  function saveWithCoins() {
    if (state !== 'save' || !Shop.pay(SAVE_COST)) return;
    renderWallet();
    revive('coins');
  }

  function saveWithAd() {
    if (state !== 'save') return;
    saveT = Infinity;
    Native.send('ad', { place: 'revive' });
  }

  // Забег дня: та же дорога у всех в этот день (зерно — дата), свой рекорд дня и таблица своих лучших дней;
  // результат — в аналитику и приложению (онлайн-таблица — на его стороне)
  var dailyRun = false;
  function startDailyRun() {
    Sound.init();
    Sound.click();
    dailyRun = true;
    mode = 'run';
    level = null;
    el.game.classList.remove('is-campaign');
    resetRound();
    cam.intro = 0;
    withCoach(function () { beginPlay(true); });
  }

  function dayLabel(s) { // 2026-10-25 → 25.10
    var p = s.split('-');
    return p[2] + '.' + p[1];
  }

  function bindShop() {
    document.getElementById('game-open-shop').addEventListener('click', function () { openScreen('shop'); });
    // в лавке кота над карточкой можно крутить пальцем
    var dragX = null;
    el.game.addEventListener('pointerdown', function (e) {
      if (show.on && !e.target.closest('.game__map')) { // гладят кота в лавке — мурлычет
        dragX = e.clientX;
        Sound.init();
        Sound.purr(3.8, 0.4);
      } else if (state === 'start' && !e.target.closest('button, a, .game__qcard') && onMenuCat(e)) {
        Sound.init();
        Sound.purr(3.8, 0.45);
      }
    });
    el.game.addEventListener('pointermove', function (e) {
      if (menuBg) { // меню: кот смотрит на палец или мышь (menuParallax)
        par.px = e.clientX;
        par.py = e.clientY;
        par.idle = 0;
      }
      if (dragX == null) return;
      show.drag += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
    });
    ['pointerup', 'pointercancel'].forEach(function (n) { el.game.addEventListener(n, function () { dragX = null; }); });
    document.getElementById('game-open-quests').addEventListener('click', function () { openScreen('quests'); });
    document.getElementById('game-open-codex').addEventListener('click', function () { openScreen('codex'); });
    el.dailyClaim.addEventListener('click', claimDaily);
    el.saveCoins.addEventListener('click', saveWithCoins);
    el.saveAd.addEventListener('click', saveWithAd);
    document.getElementById('game-save-no').addEventListener('click', function () { if (state === 'save') { Sound.click(); showOver(); } });
    // облако (приложение): снимок сохранений — после забега и покупок; пришёл снимок с другого устройства — применить и перезапустить
    Native.on('cloudLoad', function (d) { if (restore(d.save)) location.reload(); });
    Native.on('adDone', function (d) { if (d.place === 'revive' && state === 'save') { if (d.ok) revive('ad'); else showOver(); } }); // приложение показало рекламу
    el.questList.addEventListener('click', function (e) { if (e.target.closest('[data-dayrun]')) startDailyRun(); });
    document.getElementById('game-codex-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      codexTab = b.dataset.tab;
      Sound.click();
      renderCodex();
    });
    $$('.game__close').forEach(function (b) { b.addEventListener('click', closeScreen); });
    document.getElementById('game-shop-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      shopTab = b.dataset.tab;
      Sound.click();
      renderShop();
    });
    document.getElementById('game-quest-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      questTab = b.dataset.tab;
      Sound.click();
      renderQuests();
    });
    el.shopList.addEventListener('click', function (e) {
      var b = e.target.closest('button'), row = e.target.closest('[data-try]');
      if (!b && row) { // нажатие на строку — примерить на кота над карточкой
        var t = row.dataset.try.split(':');
        tryOn[t[0]] = Shop.isWorn(t[0], t[1]) ? null : t[1];
        Sound.click();
        applySkin();
        renderShop();
        return;
      }
      if (!b || b.disabled) return;
      if (b.dataset.wear) {
        var p = b.dataset.wear.split(':');
        tryOn[p[0]] = null;
        var had = Shop.isOwned(p[0], p[1]);
        if (Shop.wear(p[0], p[1])) {
          Sound.coin();
          applySkin();
          if (!had) Telemetry.event('buy', { item: p[0] + ':' + p[1], coins: Shop.coins() });
        }
      } else if (b.dataset.up && Shop.buyUpgrade(b.dataset.up)) {
        Sound.coin();
        Telemetry.event('buy', { item: 'up:' + b.dataset.up, level: Shop.level(b.dataset.up), coins: Shop.coins() });
      }
      renderShop();
      renderWallet();
      cloudSave();
    });
    el.questList.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled || !b.dataset.claim) return;
      var p = b.dataset.claim.split(':'), got = p[0] === 'm' ? Missions.claimMission(p[1]) : Missions.claimAchievement(p[1]);
      if (got) {
        Shop.addCoins(got);
        Sound.coin();
        vibrate(20);
      }
      renderQuests();
      renderWallet();
      updateQuestBadge();
    });
  }


  /* ---------- Настройки ---------- */

  // язык, громкость эффектов и музыки, вибрация, чувствительность наклона (0…1 → угол полного наклона),
  // кнопки для левши, графика: auto — чёткость подстраивается под FPS, high — максимум без подстройки,
  // low — экономно (чёткость 1×, тени меньше). Хранятся на устройстве (store.js)
  var SET_DEFAULTS = { lang: getLang(), style: 'mix', sfx: 0.9, music: 0.8, track: 'random', vibro: true, tilt: 0.5, lefty: false, calm: false, quality: 'auto' }; // track — файл из MUSIC_TRACKS
  var settings = loadObject('settings', SET_DEFAULTS), settingsBack = 'start', playingTrack = null;
  if (settings.track !== 'random' && !MUSIC_TRACKS.some(function (t) { return t.file === settings.track; })) settings.track = SET_DEFAULTS.track; // своей генеративной больше нет

  // мелодия: выбранный трек или random — каждая новая игра начинается с другого трека, с начала
  var musicNow = null;
  function pickMusic(fresh) {
    if (settings.track !== 'random') return settings.track;
    if (musicNow && !fresh) return musicNow;
    var pool = MUSIC_TRACKS.filter(function (t) { return t.file !== musicNow; });
    return pool[(Math.random() * pool.length) | 0].file;
  }
  function playMusic(fresh) {
    var f = pickMusic(fresh);
    if (f === musicNow && !fresh) return;
    musicNow = f;
    Sound.track(f);
  }

  function applySettings(first) {
    var S = settings;
    if (S.lang !== getLang() || first) {
      setLang(S.lang);
      refreshTexts();
    }
    Sound.volumes(S.sfx, S.music);
    if (first || S.track !== playingTrack) playMusic(S.track === 'random' && !first); // мелодия — трек из MUSIC_TRACKS (random — свой на каждую игру)
    playingTrack = S.track;
    CONFIG.tilt.full = 0.52 - S.tilt * 0.32; // 0.5 → прежние 0.36 (≈21°)
    el.game.classList.toggle('is-lefty', S.lefty);
    el.game.classList.toggle('is-calm', !!S.calm);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cap = S.quality === 'low' ? 1 : dpr;
    if (first || view.quality !== S.quality) {
      view.quality = S.quality;
      view.prCap = cap;
      view.pr = S.quality === 'auto' ? Math.min(cap, 1.5) : cap;
      shadowBox(S.quality);
      setBloom(S.quality === 'high');
      if (!first) layout();
    }
  }

  // тексты, которые пишет скрипт (а не разметка с data-i18n): смена языка — переписать
  function refreshTexts() {
    applyDom();
    document.title = tr('doc.title');
    el.startText.innerHTML = tr((IS_TOUCH ? 'start.touch' : 'start.keys') + (settings.style === 'hop' ? '' : '.run'));
    el.hintText.textContent = tr(IS_TOUCH ? 'hint.tilt' : 'hint.keys');
    updateBestText();
    if (quest) {
      renderMap();
      renderQuestCard();
    }
    fitText();
  }

  // Подписи кнопок — в одну строку на любом языке: не влезает (английское «How to play», узкий телефон) — шрифт
  // ужимается до ширины плашки, не мельче 70%. Экраны скрыты прозрачностью, не display — меряется и скрытое;
  // карточка скрытого экрана уменьшена — поэтому сравниваются доли, а не пиксели
  var fitRange = null;
  function fitText() {
    var R = fitRange || (fitRange = document.createRange());
    $$('.game__btn:not(.game__set-track), .game__seg button', el.game).forEach(function (b) {
      b.style.fontSize = '';
      var box = b.getBoundingClientRect();
      if (!box.width || !b.offsetWidth) return;
      var cs = getComputedStyle(b), room = (b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / b.offsetWidth;
      R.selectNodeContents(b);
      var need = R.getBoundingClientRect().width / box.width;
      if (need > room) b.style.fontSize = (parseFloat(cs.fontSize) * Math.max(0.7, room / need * 0.98)).toFixed(2) + 'px';
    });
  }

  // смена языка: подписи на миг гаснут (is-relang) и проявляются уже на новом — без рывка, рамки стоят на месте
  var relangTimer = 0;
  function relang(v) {
    $$('#game-set-lang button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.v === v); });
    el.game.classList.add('is-relang');
    clearTimeout(relangTimer);
    relangTimer = setTimeout(function () {
      settings.lang = v;
      saveSettings();
      requestAnimationFrame(function () { el.game.classList.remove('is-relang'); });
    }, 180);
  }

  function saveSettings() {
    save('settings', settings);
    applySettings();
    renderSettings();
  }

  function renderSettings() {
    var S = settings;
    $$('#game-set-lang button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.v === S.lang); });
    $$('#game-set-quality button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.v === S.quality); });
    el.setSfx.value = Math.round(S.sfx * 100);
    el.setMusic.value = Math.round(S.music * 100);
    el.setTilt.value = Math.round(S.tilt * 100);
    var T0 = MUSIC_TRACKS.filter(function (t) { return t.file === (S.track === 'random' ? musicNow : S.track); })[0] || MUSIC_TRACKS[0];
    el.setTrack.textContent = S.track === 'random' ? tr('set.shuffle') : T0.title;
    el.setCredits.textContent = tr('set.credits', { title: T0.title });
    el.setId.textContent = tr('set.id', { id: Telemetry.installId() });
    [[el.setVibro, S.vibro], [el.setLefty, S.lefty], [el.setCalm, S.calm]].forEach(function (p) {
      p[0].classList.toggle('is-on', p[1]);
      p[0].setAttribute('aria-checked', p[1] ? 'true' : 'false');
    });
  }

  function openSettings() {
    Sound.init();
    Sound.click();
    settingsBack = state;
    renderSettings();
    setState('settings');
  }

  function closeSettings() {
    Sound.click();
    Telemetry.event('settings', { lang: settings.lang, quality: settings.quality, track: settings.track, sfx: settings.sfx, music: settings.music, tilt: settings.tilt, lefty: settings.lefty, vibro: settings.vibro });
    setState(settingsBack);
  }

  function bindSettings() {
    var seg = function (id, key) {
      document.getElementById(id).addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        settings[key] = b.dataset.v;
        Sound.click();
        saveSettings();
      });
    };
    document.getElementById('game-set-lang').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.dataset.v === settings.lang) return;
      Sound.click();
      relang(b.dataset.v);
    });
    el.setTrack.addEventListener('click', function () { // следующая мелодия по кругу — сразу звучит
      var list = ['random'].concat(MUSIC_TRACKS.map(function (t) { return t.file; })), i = list.indexOf(settings.track);
      settings.track = list[(i + 1) % list.length]; // случайная → треки по кругу → снова случайная
      Sound.init();
      saveSettings();
    });
    seg('game-set-quality', 'quality');
    [[el.setSfx, 'sfx'], [el.setMusic, 'music'], [el.setTilt, 'tilt']].forEach(function (p) {
      p[0].addEventListener('input', function () {
        settings[p[1]] = p[0].value / 100;
        saveSettings();
      });
    });
    [[el.setVibro, 'vibro'], [el.setLefty, 'lefty'], [el.setCalm, 'calm']].forEach(function (p) {
      p[0].addEventListener('click', function () {
        settings[p[1]] = !settings[p[1]];
        Sound.click();
        saveSettings();
      });
    });
    document.getElementById('game-open-settings').addEventListener('click', openSettings);
    document.getElementById('game-pause-settings').addEventListener('click', openSettings);
    document.getElementById('game-set-done').addEventListener('click', closeSettings);
    document.getElementById('game-set-coach').addEventListener('click', function () {
      Sound.click();
      showCoach(null, 'settings');
    });
  }


  // «Меньше вспышек» (настройки): молнии, иней метели, вспышка босса от удара — в четверть силы, пульс ярости и
  // вспышка кадра на переходах — без мигания (стили .is-calm)
  function flashK() { return settings && settings.calm ? 0.25 : 1; }

  /* ---------- Ход игры ---------- */

  function setState(s) {
    state = s;
    STATES.forEach(function (n) { el.game.classList.toggle('is-' + n, n === s); });
    if (s === 'start' && !dailyShown) setTimeout(maybeDaily, 700); // награда за вход — раз за сеанс
    if (s === 'start' && el.qcard && quest) renderQuestCard();
    syncShowroom();
  }

  // Обучение — при первом запуске (и из настроек «Как играть»): рука на экране телефона показывает жест,
  // подпись — что он делает. На компьютере — клавиши. После обучения кнопки меча и трюка подсвечены до первого нажатия
  var COACH_KEY = 'catKnight.coach', coach = null;
  function coachSteps() {
    var run = styleNow() !== 'hop';
    if (!IS_TOUCH) return [['keys', 'coach.keys'], ['keys', 'coach.space'], ['keys', 'coach.up']].concat(run ? [['keys', 'coach.keysRun']] : []);
    return [['tilt', 'coach.tilt'], ['steer', 'coach.steer'], ['tap', 'coach.sword'], ['swipe', run ? 'coach.jump' : 'coach.trick']].concat(run ? [['swipedown', 'coach.slide']] : []);
  }

  function coached() {
    try { return !!localStorage.getItem(COACH_KEY); } catch (e) { return true; }
  }

  function showCoach(done, back) {
    coach = { steps: coachSteps(), i: 0, done: done, back: back || 'start' };
    el.coachDots.innerHTML = coach.steps.map(function () { return '<i></i>'; }).join('');
    setState('coach');
    coachStep();
  }

  function coachStep() {
    var C = coach, st = C.steps[C.i], last = C.i === C.steps.length - 1;
    el.coach.className = 'game__coach is-on is-' + st[0];
    el.coachText.innerHTML = tr(st[1]);
    el.coachNext.textContent = tr(last ? 'coach.go' : 'coach.next');
    $$('i', el.coachDots).forEach(function (d, i) { d.classList.toggle('is-on', i === C.i); });
  }

  function coachNext() {
    var C = coach;
    Sound.click();
    if (++C.i < C.steps.length) return coachStep();
    el.coach.className = 'game__coach';
    coach = null;
    try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {}
    $$('.game__pad').forEach(function (b) { b.classList.add('is-glow'); });
    if (C.done) C.done();
    else setState(C.back);
  }

  // перед первой игрой — обучение (не в автопроверке)
  function withCoach(go) {
    if (coached() || AUTOPLAY) go();
    else showCoach(go);
  }

  function beginPlay(fromSplash) {
    wipe();
    setState('play');
    if (settings.track === 'random') playMusic(true); // новая игра — новая мелодия
    el.game.classList.toggle('is-runner', styleNow() !== 'hop');
    Telemetry.event(mode === 'level' ? 'level_start' : 'run_start', { level: level ? level.id : '', style: styleNow(), best: best });
    perfRun.t = perfRun.n = 0;
    if (fromSplash) player.wait = CONFIG.cat.takeoff;
    else takeoff();
    input.calibrate = true;
    input.touches = [];
    lastFrame = 0;
    showHint();
    // наклон недоступен (iOS без разрешения, страница не по https) — подсказываем управление касанием
    if (IS_TOUCH) setTimeout(function () {
      if (state === 'play' && !input.tilt && !input.motion) showHint(tr('hint.steer'));
    }, 1500);
  }

  function showHint(text) {
    if (text) el.hintText.textContent = text;
    el.game.classList.add('is-hint');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.game.classList.remove('is-hint'); }, 3200);
  }

  function startGame() {
    if (state !== 'start') return;
    if (dailyRun) { // после забега дня — обычная дорога
      dailyRun = false;
      resetRound();
    }
    requestTilt();
    Sound.init();
    Sound.click();
    if (mode !== 'run') { // после кампании — снова бесконечный забег
      mode = 'run';
      level = null;
      el.game.classList.remove('is-campaign');
      resetRound();
    }
    cam.intro = 0;
    withCoach(function () { beginPlay(true); });
  }

  // с карты — обратно на заставку (забег)
  function backToStart() {
    Sound.click();
    updateBestText();
    setState('start');
  }

  // из паузы или с финала — на заставку: забег брошен (монеты — в кошелёк), дальше снова бесконечный забег
  function goMenu() {
    Sound.click();
    if (state === 'pause') runEnded('quit');
    dailyRun = false;
    mode = 'run';
    level = null;
    el.game.classList.remove('is-campaign');
    resetRound();
    cam.intro = 0;
    updateBestText();
    renderWallet();
    wipe();
    setState('start');
  }

  function restart() {
    Sound.init();
    Sound.click();
    resetRound();
    cam.intro = 1;
    beginPlay(false);
  }

  function pauseGame() {
    if (state !== 'play') return;
    setState('pause');
    Sound.hush(); // мир на паузе — огонь и мельница замолкают (кадры не идут, громкость сама не упадёт)
    Sound.click();
  }

  function resumeGame() {
    if (state !== 'pause') return;
    Sound.click();
    setState('play');
    lastFrame = 0;
  }

  // без жизней от удара — сбит с ног: подлетает, кувыркается и падает вбок с дороги в облака (не сквозь плиты);
  // в полёте его закрывает край виадука или острова (рисуется по глубине — drawWorld), камера опускается за ним чуть-чуть
  function knockOut() {
    var P = player, side = Math.abs(P.x) > 0.3 ? Math.sign(P.x) : (Math.random() < 0.5 ? -1 : 1);
    P.dead = true;
    P.grounded = false;
    P.trick = null;
    P.slide = 0;
    P.vy = 11; // высокая «мультяшная» дуга: в кадре видно, как кувыркается
    P.vx = side * Math.max(4.5, (4.4 - Math.abs(P.x)) / 0.65); // за 0,65 с — за край дороги или острова, пока ещё выше парапета
    P.koY = P.y;
    P.squash = 1;
    sparkle(P.x, P.y + 1.6, P.z, [1, 0.95, 0.6], 18, 3.5); // искры из глаз
    dust(P.x, P.y, P.z, 10);
    cam.shake = Math.max(cam.shake, 0.5);
    hitStop = Math.max(hitStop, 0.14); // миг замирания — удар ощущается
    Sound.hurt();
    vibrate(90);
  }

  function gameOver() {
    setState('fall');
    if (!player.dead) player.koY = player.target ? player.target.y : player.y;
    player.dead = true;
    if (player.fury > 0) endFury(false);
    comboBreak();
    player.lives = 0;
    fallTimer = 1.5;
    Sound.fall();
  }

  function showOver() {
    var m = Math.floor(player.maxDist), record = mode === 'run' && !dailyRun && m > best && m > 0, dayRecord = dailyRun && Daily.runResult(m);
    if (dailyRun) {
      Telemetry.event('daily_run', { date: Daily.today(), dist: m });
      Native.send('leaderboard', { board: 'daily-' + Daily.today(), score: m }); // онлайн-таблица — у приложения
    }
    if (record) {
      best = m;
      try { localStorage.setItem(bestKey(), String(best)); } catch (e) {}
    }
    el.overMeters.textContent = m;
    el.overCoins.textContent = player.coins;
    runEnded('fall');
    el.overCombo.textContent = [player.bestCombo >= 2 ? tr('over.combo', { n: player.bestCombo }) : '', world.bosses ? tr('over.bosses', { n: world.bosses }) : ''].filter(Boolean).join(' · ');
    el.overBest.textContent = mode === 'level' ? tr('over.gate', { id: level.id, m: Math.max(0, Math.round(level.def.len - m)) }) : dailyRun ? tr('dayrun.best', { n: Daily.runBest() }) : record || !best ? '' : tr('best', { n: best });
    el.game.classList.toggle('is-record', record || dayRecord);
    updateBestText();
    setState('over');
    Sound.over();
  }

  function loadBest() {
    try { best = parseInt(localStorage.getItem(bestKey()), 10) || 0; } catch (e) { best = 0; }
  }

  // переключатель режима на заставке: забег за ним перестраивается — площадка и первый отрезок под режим
  function renderModes() {
    $$('#game-modes button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.v === settings.style); });
  }

  function pickStyle(v) {
    if (v === settings.style) return;
    settings.style = v;
    save('settings', settings);
    Sound.click();
    loadBest();
    refreshTexts();
    renderModes();
    if (mode === 'run' && state === 'start') {
      resetRound();
      cam.intro = 0;
    }
  }

  function updateBestText() {
    el.best.textContent = best > 0 ? tr('best', { n: best }) : '';
  }

  function update(dt) {
    if (hitStop > 0) { // попадание мечом: мир на миг почти замер — удар ощущается весомым
      hitStop -= dt;
      dt *= 0.08;
    }
    time += dt;
    if (state === 'play' || state === 'fall') {
      stepAcc += dt;
      var S = CONFIG.physics.step, n = 0;
      while (stepAcc >= S && n < 12) {
        physicsStep(S);
        stepAcc -= S;
        n++;
      }
      updateFlyers(dt);
      updateFireballs(dt);
      if (world.dragonAt != null && player.z < world.dragonAt && !world.dragon && !world.boss) spawnDragon();
      if (!world.boss && -player.z > world.bossAt && state === 'play' && !player.flight) spawnBoss();
      updateDragon(dt);
      updateBoss(dt);
      player.invuln = Math.max(0, player.invuln - dt);
      updateSwing(dt);
      if (cam.intro < 1) cam.intro = Math.min(1, cam.intro + dt / CONFIG.camera.intro);
      if (state === 'play') {
        if (winTimer > 0 && (winTimer -= dt) <= 0) levelComplete();
        updateTrick(dt);
        updateFury(dt);
        updateBonuses(dt);
        strikeCheck();
        checkPickups();
        checkFall();
        generate();
        cleanup();
      } else if (state === 'fall') { // не 'win': уровень мог закончиться в этом же кадре
        fallTimer -= dt;
        if (fallTimer <= 0) {
          if (canSave()) offerSave();
          else showOver();
        }
      }
    }
    if (state === 'save') updateSave(dt);
    updateBiome(dt);
    updateDayNight(dt);
    updateCamera(dt);
    speedFx(dt);
    updateWorld(dt);
    updatePickups(dt);
    updateAmbience(dt);
    animateCat(dt);
    updateScenery(dt);
    fxDust.update(dt);
    fxGlow.update(dt);
    fxFire.update(dt);
    fireTime.value = time;
    updateHud();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    var t = ts / 1000, dt = lastFrame ? Math.min(0.05, t - lastFrame) : 0;
    lastFrame = t;
    // заставка прозрачная — сцена за ней живёт: плывут облака и острова, камера покачивается
    if (hidden || state === 'pause' || frozen) return;
    if (menuBg) menuParallax(dt);
    update(dt);
    render();
    adaptQuality(dt);
    if (state === 'play' && dt) { // средний FPS забега — в аналитику (runEnded)
      perfRun.t += dt;
      perfRun.n++;
    }
  }

  function render() {
    if (menuBg && !show.on) return; // меню — картина поверх сцены
    if (show.on) return renderShowroom();
    if (bloom.on) bloom.composer.render();
    else {
      renderer.setRenderTarget(null);
      drawWorld();
    }
  }

  // Три прохода:
  // 1) небо и замок со слабой дымкой; 2) дорога с плотным туманом — дальние ряды тают, не сливаясь с замком;
  // 3) кот поверх всего со сброшенной глубиной (острова проходимы снизу — иначе он прятался бы в плите).
  // Рисует в текущую цель: на экран или, со свечением, в кадр EffectComposer
  // арки, барьеры и ворота между камерой и котом (и чуть впереди): только им — слой прохода «закрывают кота»
  var occlNear = [];
  function occluderNear() {
    occlNear.length = 0;
    for (var i = 0; i < world.rows.length; i++) {
      var r = world.rows[i];
      if (r.z > camera.position.z || r.z < player.z - 4) continue; // от камеры (пробежал — арка между котом и камерой) до 4 м впереди
      if (r.axe) occlNear.push(r.axe.mesh);
      if (r.gate) occlNear.push(r.gate);
      for (var j = 0; j < r.plats.length; j++) if (r.plats[j].obstacle) occlNear.push(r.plats[j].obstacle.mesh);
    }
    return occlNear.length > 0;
  }

  // проход по глубине — в своей маленькой сцене: ближние препятствия на время прохода переезжают в неё (обходить
  // весь мир ради двух-трёх арок — лишняя работа на каждом кадре, на телефоне это и был рывок под аркой)
  var occlScene = null;
  function occlPass() {
    if (!occlScene) {
      occlScene = new T.Scene();
      occlScene.overrideMaterial = mat.depthOnly;
      occlScene.matrixWorldAutoUpdate = false; // матрицы уже посчитаны первым проходом
    }
    occlNear.forEach(function (g) { occlScene.add(g); });
    renderer.render(occlScene, camera);
    occlNear.forEach(function (g) { scene.add(g); });
  }

  // Все шейдеры — при загрузке, а не посреди забега: на D3D и телефоне каждый собирается десятки миллисекунд, и первая
  // встреча с бочкой, псом или боссом давала стоп-кадр. По предмету каждого вида из пулов (ключи и сборщики — как там,
  // где они появляются: потом из пула и возьмутся) встаёт перед камерой; шейдеры собираются параллельно (compileAsync),
  // затем один кадр рисуется целиком — с тенями и текстурами — под заставкой, и предметы уходят в пулы
  function warmUp() {
    var P = CONFIG.platform, w = Math.round(P.w * 5) / 5, list = [];
    ['stone', 'ice', 'fire', 'spike', 'ghost'].forEach(function (t) { list.push(acquire(t + w + 'x' + P.depth + '_0', function () { return buildPlatformMesh(t, w, P.depth, 0, 0); })); });
    ['wood', 'move', 'fast'].forEach(function (t) { list.push(acquire(t + w + 'x' + P.depth, function () { return buildPlatformMesh(t, w, P.depth, 0, 0); })); });
    list.push(acquire('lantern', function () { return buildLantern(1.9); }), acquire('pole', function () { return buildPole(1.7); }));
    [['axeGate', buildAxeGate], ['roller', buildRoller], ['roadGate', buildRoadGate], ['finishGate', buildFinishGate], ['ob_barrier', buildBarrier],
      ['ob_lowbar', buildLowbar], ['keg', buildKeg], ['crow', buildCrow], ['bat', buildBat], ['dog', buildDog], ['dragon', buildDragon],
      ['fireball', buildFireball], ['flame', flameMesh], ['feather', buildFeather], ['shieldPickup', buildShieldPickup]].forEach(function (k) { list.push(acquire(k[0], k[1])); });
    ['magnet', 'double', 'bubble', 'heart'].forEach(function (k) { list.push(acquire('bonus_' + k, function () { return buildBonus(k); })); });
    Object.keys(BOSSES).forEach(function (k) { list.push(acquire('boss_' + k, function () { return buildBossOf(k); })); });
    list.forEach(function (o, i) { o.position.set((i % 5 - 2) * 2.6, player.y, player.z - 6 - Math.floor(i / 5) * 3); });
    updateWorld(0); // пачки парапета, фонарей и верхних виадуков заводятся при первом кадре мира
    scene.updateMatrixWorld();
    var rt = bloom.on ? bloom.composer.readBuffer : null; // со свечением сцена рисуется в буфер — у шейдеров свой вариант
    renderer.setRenderTarget(rt);
    var ready = renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(scene, camera) // без расширения three предупреждает в консоли — собираем сразу
      : Promise.resolve(renderer.compile(scene, camera));
    renderer.setRenderTarget(null);
    return ready.then(function () {
      if (bloom.on) bloom.composer.render();
      else drawWorld();
      precompileOccl();
      list.forEach(release);
    });
  }

  // шейдер прохода — при загрузке, а не на первой арке
  function precompileOccl() {
    var box = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1));
    box.position.set(0, -500, 0);
    box.updateMatrixWorld();
    occlNear.length = 0;
    occlNear.push(box);
    occlPass();
    scene.remove(box);
    occlNear.length = 0;
  }

  function drawWorld() {
    if (SKY_FOG) SKY_FOG.skyUseBg.value = 0; // кадра дальнего прохода ещё нет — туман по градиенту неба
    // самый первый кадр: карты теней ещё нет, а заглушка three r186 для массива теней не годится для sampler2DShadow —
    // проход неба (он первый) ругался бы GL_INVALID_OPERATION. Строим карту заранее, в проходе дороги
    if (!sun.shadow.map) {
      camera.layers.set(LAYER_WORLD);
      scene.fog = fogNear;
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    }
    renderer.clear();
    camera.layers.set(LAYER_FAR);
    scene.fog = fogFar;
    renderer.render(scene, camera);
    if (SKY_FOG) skyBgCopy(); // за дальними рядами — этот кадр (небо и замок)
    // матрицы всех объектов уже пересчитаны первым проходом — два следующих их не трогают
    scene.matrixWorldAutoUpdate = false;
    var bg = scene.background;
    scene.background = null;
    camera.layers.set(LAYER_WORLD);
    scene.fog = fogNear;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    var ko = player.dead || state === 'fall'; // сбитый падает с края — его честно закрывают виадук и острова
    if (!ko) renderer.clearDepth();
    if (!ko && occluderNear()) { // арка над котом, барьер позади, ворота — только глубина: кот за ними прячется, а в островах (их он пролетает снизу) — нет
      camera.layers.set(LAYER_WORLD);
      occlPass();
    }
    camera.layers.set(LAYER_CAT);
    renderer.render(scene, camera);
    scene.background = bg;
    scene.matrixWorldAutoUpdate = true;
    camera.layers.set(LAYER_WORLD);
  }

  // Свечение: кадр — в HDR, светится только то, что ярче белого (порог 1). Со свечением огонь, лава, руны, глаза
  // и снаряды горят вдвое-втрое ярче (BLOOM_GLOW), без него — как были. Небо и облака не ярче белого — не светятся
  var bloom = { on: false, composer: null, pass: null };
  var BLOOM_GLOW = [['rune', 1.5], ['fastRune', 1.6], ['lantern', 1.6], ['crowEye', 1.6], ['batEye', 2], ['eyeGlow', 2.2], ['dragonEye', 2],
    ['fireball', 2.4], ['fireballBack', 2.2], ['bolt', 2.6], ['iceGlow', 2.2], ['lavaGlow', 2.4], ['ghostGlow', 2.2], ['blockLava', 1.6], ['bridgeLava', 1.6], ['crystal', 1.6]];

  class WorldPass extends Pass {
    constructor() {
      super();
      this.needsSwap = false;
    }
    render(r, writeBuffer, readBuffer) {
      r.setRenderTarget(readBuffer);
      drawWorld();
    }
  }

  // HDR-кадр с многовыборочным сглаживанием нужен float-буфер: без EXT_color_buffer_float свечения нет
  function bloomOk() {
    return renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  }

  function setBloom(on) {
    on = !!on && bloomOk();
    if (on === bloom.on) return;
    if (on && !bloom.composer) {
      bloom.composer = new EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 }));
      bloom.composer.addPass(new WorldPass());
      bloom.pass = new UnrealBloomPass(new T.Vector2(256, 256), 0.45, 0.4, 1);
      bloom.composer.addPass(bloom.pass);
      bloom.composer.addPass(new OutputPass());
    }
    bloom.on = on;
    BLOOM_GLOW.forEach(function (g) {
      var m = mat[g[0]], k = on ? g[1] : 1 / g[1];
      if (!m) return;
      if (m.isMeshStandardMaterial) m.emissiveIntensity *= k;
      else m.color.multiplyScalar(k);
    });
    if (on) sizeBloom();
  }

  function sizeBloom() {
    if (!bloom.composer) return;
    bloom.composer.setPixelRatio(view.pr);
    bloom.composer.setSize(view.w, view.h);
  }

  // Плотность пикселей под телефон: не тянет 45 к/с — ступень ниже; держит 57+ — ступень выше, но не выше той, на
  // которой уже не тянул (иначе качество качалось бы туда-сюда). Свечение «Авто» само не включает: со свечением кадр
  // рисуется в буфер, все шейдеры собираются заново — посреди забега это секунды стоп-кадра, и небо меняет оттенок;
  // свечение — в «Высоком». Облёт камеры после «Играть» не меряется
  function adaptQuality(dt) {
    if (state !== 'play' || !dt || view.quality !== 'auto' || cam.intro < 1) return;
    perf.acc += dt;
    perf.n++;
    if (perf.n < 120) return;
    var avg = perf.acc / perf.n;
    perf.acc = 0;
    perf.n = 0;
    if (avg > 1 / 45 && view.pr > 1) {
      view.prCap = view.pr - 0.25;
      view.pr = Math.max(1, view.prCap);
      layout();
    } else if (avg < 1 / 57 && view.pr < view.prCap) {
      view.pr = Math.min(view.prCap, view.pr + 0.25);
      layout();
    }
  }


  /* ---------- Интерфейс ---------- */

  function updateHud() {
    var m = Math.floor(player.maxDist), runNow = player.move === 'run';
    if (runNow !== hud.run) { // на бегу кнопка трюка — прыжок (стрелка вверх)
      hud.run = runNow;
      el.game.classList.toggle('is-run-now', runNow);
    }
    if (m !== hud.meters) {
      hud.meters = m;
      el.meters.textContent = mode === 'level' && isFinite(level.def.len) ? Math.min(m, level.def.len) + '/' + level.def.len : m;
    }
    if (player.coins !== hud.coins) {
      if (hud.coins >= 0) {
        el.coins.classList.remove('is-pop');
        void el.coins.offsetWidth;
        el.coins.classList.add('is-pop');
      }
      hud.coins = player.coins;
      el.coinCount.textContent = player.coins;
    }
    if (player.lives !== hud.lives) {
      var gain = hud.lives >= 0 && player.lives > hud.lives, max = maxLives();
      hud.lives = player.lives;
      el.hearts.forEach(function (h, i) {
        h.classList.toggle('is-off', i >= max); // четвёртое — только с улучшением лавки
        h.classList.toggle('is-lost', i >= player.lives);
        if (gain && i === player.lives - 1) { // вернулось — сердце подпрыгивает
          h.classList.remove('is-gain');
          void h.getBoundingClientRect();
          h.classList.add('is-gain');
        }
      });
    }
    // серия на медальоне монет: деления кольца — огоньки до следующего множителя (на максимуме горят все), бейдж — множитель
    if (player.combo !== hud.combo || player.shield !== hud.shield) {
      hud.combo = player.combo;
      hud.shield = player.shield;
      var C = CONFIG.combo, mult = comboMult(), lit = mult >= C.max ? C.step : player.combo % C.step;
      el.comboX.textContent = '×' + mult;
      if (mult > hud.mult && mult > 1) { // множитель вырос — бейдж подпрыгивает
        el.comboX.classList.remove('is-up');
        void el.comboX.offsetWidth;
        el.comboX.classList.add('is-up');
      }
      hud.mult = mult;
      el.pips.forEach(function (p, i) { p.classList.toggle('is-lit', i < lit); });
      el.combo.classList.toggle('is-on', player.combo > 0 || player.shield);
      el.combo.classList.toggle('is-mult', mult > 1);
      el.combo.classList.toggle('has-shield', player.shield);
      if (player.combo > 0) el.combo.classList.remove('is-broken');
    }
    // здоровье босса: полоса тает, при попадании вспыхивает
    var hp = world.boss ? world.boss.hp : -1;
    if (hp !== hud.boss) {
      if (hp >= 0) {
        el.bossFill.style.width = (hp / world.boss.def.hp * 100) + '%';
        if (hud.boss > hp) {
          el.bossBar.classList.remove('is-hit');
          void el.bossBar.offsetWidth;
          el.bossBar.classList.add('is-hit');
        }
      }
      hud.boss = hp;
    }
    var buffs = (player.magnet > 0 ? 'm' + Math.ceil(player.magnet) : '') + (player.double > 0 ? 'd' + Math.ceil(player.double) : '') + (player.bubble ? 'b' : '');
    if (buffs !== hud.buffs) {
      hud.buffs = buffs;
      el.buffs.innerHTML = (player.magnet > 0 ? '<span><i style="background:#d8343a"></i>' + Math.ceil(player.magnet) + '</span>' : '') +
        (player.double > 0 ? '<span><i style="background:#ffc845"></i>×2 ' + Math.ceil(player.double) + '</span>' : '') +
        (player.bubble ? '<span><i style="background:#9fd8ff"></i>' + tr('bonus.bubble.short') + '</span>' : '');
    }
    var fury = Math.round(player.furyMeter * 100);
    if (fury !== hud.fury) {
      hud.fury = fury;
      el.fury.style.setProperty('--fury', fury); // рамка аватара заполняется по кругу, во время ярости тает
      el.fury.classList.toggle('is-on', fury > 0);
    }
  }

  // надпись над котом («Точно!», «Комбо ×2!») и мелкая строка под ней: встаёт в экранную точку над головой
  // и уплывает вверх (CSS); у краёв экрана сдвигается внутрь, чтобы не обрезалась
  var popV = null;
  function popText(text, sub, big) {
    if (!popV) popV = new T.Vector3();
    popV.set(player.x, player.y + 2.4 * CONFIG.cat.scale, player.z).project(camera);
    el.popMain.textContent = text;
    el.popSub.textContent = sub || '';
    el.pop.style.left = clamp((popV.x + 1) * 50, 24, 76).toFixed(1) + '%';
    el.pop.style.top = clamp((1 - popV.y) * 50, 30, 85).toFixed(1) + '%';
    el.pop.classList.remove('is-on', 'is-big');
    void el.pop.offsetWidth; // перезапуск анимации
    el.pop.classList.add('is-on');
    el.pop.classList.toggle('is-big', !!big);
  }

  var toastTimer = 0;
  function toast(text, ms) {
    el.toast.textContent = text;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-visible'); }, ms || 1800);
  }

  // клик по CTA: MRAID-сети, Facebook, Google Ads, иначе — обычная ссылка
  function openStore() {
    var url = CONFIG.ctaUrl;
    try { if (window.mraid && typeof window.mraid.open === 'function') { window.mraid.open(url); return; } } catch (e) {}
    try { if (window.FbPlayableAd && window.FbPlayableAd.onCTAClick) { window.FbPlayableAd.onCTAClick(); return; } } catch (e) {}
    try { if (window.ExitApi && window.ExitApi.exit) { window.ExitApi.exit(); return; } } catch (e) {}
    window.open(url, '_blank');
  }

  function bindUi() {
    document.getElementById('game-play').addEventListener('click', startGame);
    document.getElementById('game-modes').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) pickStyle(b.dataset.v);
    });
    renderModes();
    document.getElementById('game-resume').addEventListener('click', resumeGame);
    document.getElementById('game-restart').addEventListener('click', restart);
    document.getElementById('game-again').addEventListener('click', restart);
    ['game-pause-menu', 'game-over-menu'].forEach(function (id) { document.getElementById(id).addEventListener('click', goMenu); });
    document.getElementById('game-cta').addEventListener('click', openStore);
    document.getElementById('game-quest').addEventListener('click', openMap);
    document.getElementById('game-wallet-btn').addEventListener('click', function () { openScreen('shop'); });
    document.getElementById('game-open-looks').addEventListener('click', function () {
      shopTab = 'look';
      openScreen('shop');
    });
    document.getElementById('game-qcard-play').addEventListener('click', function () { // уровень из карточки похода
      if (state === 'start') startLevel(+el.qcard.dataset.w, +el.qcard.dataset.i);
    });
    el.coachNext.addEventListener('click', coachNext);
    bindSettings();
    bindShop();
    renderWallet();
    updateQuestBadge();
    updateCodexBadge();
    document.getElementById('game-map-back').addEventListener('click', backToStart);
    ['game-over-map', 'game-pause-map', 'game-win-map'].forEach(function (id) { document.getElementById(id).addEventListener('click', openMap); });
    document.getElementById('game-win-again').addEventListener('click', restart);
    el.next.addEventListener('click', function () { Sound.click(); nextLevel(); });
    el.worlds.addEventListener('click', function (e) { // уровень на карте
      var b = e.target.closest('.game__level');
      if (b && !b.disabled) startLevel(+b.dataset.w, +b.dataset.i);
    });
    el.pause.addEventListener('click', pauseGame);
    el.sound.addEventListener('click', function () {
      Sound.init();
      el.sound.classList.toggle('is-muted', Sound.toggle());
      Sound.click();
    });
    if (!CONFIG.ctaUrl) el.game.classList.add('no-cta');

    var sideways = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
    var resizeQueued = false;
    window.addEventListener('resize', function () {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function () {
        resizeQueued = false;
        layout();
        if (sideways.matches) pauseGame(); // телефон боком — экран «поверни» закрывает игру, она ждёт на паузе
      });
    });
    document.addEventListener('visibilitychange', function () {
      hidden = document.hidden;
      if (hidden) {
        pauseGame();
        Sound.suspend();
      } else {
        Sound.resume();
      }
      lastFrame = 0;
    });
  }


  /* ---------- Свет и окружение ---------- */

  function buildLights() {
    hemi = new T.HemisphereLight('#e2f0ff', '#9b8a72', 0.45 * LIGHT_K);
    sun = new T.DirectionalLight('#fff2dc', 1.7 * LIGHT_K);
    sun.castShadow = true;
    sun.shadow.radius = 2; // мягкость края тени (PCF)
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 100;
    shadowBox('auto');
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    [hemi, sun].forEach(function (l) {
      l.layers.enable(LAYER_CAT);
      l.layers.enable(LAYER_FAR);
      scene.add(l);
    });
    scene.add(sun.target);
    envMap = buildEnvironment(); // раздаётся материалам в collectLit
    scene.background = tex.sky;
  }

  // отражения для металла и золота: размытое небо с ярким солнцем
  function buildEnvironment(r) { // r — рендерер (по умолчанию игровой; у лавки свой контекст WebGL — своя карта)
    var s = new T.Scene(), g = new T.SphereGeometry(50, 32, 16), pos = g.attributes.position, cols = [];
    var top = new T.Color('#4d95e0'), hor = new T.Color('#eef6fd'), low = new T.Color('#8f8676'), c = new T.Color();
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 50;
      if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
      else c.copy(hor).lerp(low, Math.pow(-y, 0.5));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    s.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    var sunBall = new T.Mesh(new T.SphereGeometry(5, 16, 8), new T.MeshBasicMaterial({ color: new T.Color(7, 6.4, 5.6) }));
    sunBall.position.set(-20, 34, -22);
    s.add(sunBall);
    var pm = new T.PMREMGenerator(r || renderer), rt = pm.fromScene(s, 0.03);
    pm.dispose();
    return rt.texture;
  }


  /* ---------- Запуск ---------- */

  // С r151 three нормирует экранные производные в bump-маппинге — рельеф кладки на нашем масштабе
  // стал почти плоским. Возвращаем прежнюю формулу, под которую подобраны все bumpScale
  function legacyBump() {
    var C = T.ShaderChunk, src = C.bumpmap_pars_fragment;
    C.bumpmap_pars_fragment = src
      .replace('normalize( dFdx( surf_pos.xyz ) )', 'dFdx( surf_pos.xyz )')
      .replace('normalize( dFdy( surf_pos.xyz ) )', 'dFdy( surf_pos.xyz )');
    if (DEBUG && C.bumpmap_pars_fragment === src) console.warn('legacyBump: шейдер bump-маппинга изменился, правка не применилась');
  }

  // Туман цвета неба: туман берёт цвет того места неба, что за предметом на экране (тот же градиент, что в tex.skyCanvas:
  // верх → горизонт → низ, по строке экрана) — вдали предмет целиком сливается с небом и проступает из него сам, без
  // силуэтов цвета тумана и без ряби, в любое время суток и в любом мире. Новые ряды рождаются в полностью
  // затуманенной дали (CONFIG.fog.far — край дороги). Значения неба — общие для всех материалов (SKY_FOG), их ставит
  // updateDayNight каждый кадр; материалы получают их в onBeforeCompile (по умолчанию — у всех, свои — зовут skyFogUniforms)
  var SKY_FOG = null;
  function skyFogUniforms(shader) {
    if (SKY_FOG) Object.keys(SKY_FOG).forEach(function (k) { shader.uniforms[k] = SKY_FOG[k]; });
  }
  function skyFog() {
    SKY_FOG = { skyTop: { value: new T.Vector3() }, skyHor: { value: new T.Vector3() }, skyLow: { value: new T.Vector3() }, skyHz: { value: 0.5 }, skyRes: { value: new T.Vector2(1, 1) },
      skyBg: { value: null }, skyUseBg: { value: 0 } };
    T.Material.prototype.onBeforeCompile = function (shader) { skyFogUniforms(shader); };
    var C = T.ShaderChunk;
    C.fog_pars_fragment += '\n' + [
      '#ifdef USE_FOG',
      'uniform vec3 skyTop;', // цвета неба — в sRGB, как на холсте неба: градиент холста смешивает в sRGB
      'uniform vec3 skyHor;',
      'uniform vec3 skyLow;',
      'uniform float skyHz;',
      'uniform vec2 skyRes;',
      'uniform sampler2D skyBg;', // кадр дальнего прохода — то, что за предметом на самом деле: небо или замок (skyBgCopy)
      'uniform float skyUseBg;',
      'vec3 skyGradient() {',
      '  float v = 1.0 - gl_FragCoord.y / skyRes.y, h1 = skyHz * 0.6, h3 = min( 0.98, skyHz + 0.1 );',
      '  vec3 a = mix( skyTop, skyHor, 0.5 ), b = mix( skyHor, skyLow, 0.25 ), c = skyLow;',
      '  if ( v < h1 ) c = mix( skyTop, a, v / max( h1, 1e-3 ) );',
      '  else if ( v < skyHz ) c = mix( a, skyHor, ( v - h1 ) / max( skyHz - h1, 1e-3 ) );',
      '  else if ( v < h3 ) c = mix( skyHor, b, ( v - skyHz ) / max( h3 - skyHz, 1e-3 ) );',
      '  else c = mix( b, skyLow, clamp( ( v - h3 ) / max( 1.0 - h3, 1e-3 ), 0.0, 1.0 ) );',
      // туман в three ложится уже после тонмаппинга и перевода в цвета вывода (как и fogColor): небо — в них же. На экране
      // это sRGB холста неба как есть, в буфере свечения — линейный. Линейный цвет на экране темнее неба — дальние
      // предметы таяли в серо-синюю дымку, а не в небо
      '  return linearToOutputTexel( vec4( mix( c * 0.0773993808, pow( c * 0.9478672986 + 0.0521327014, vec3( 2.4 ) ), vec3( greaterThan( c, vec3( 0.04045 ) ) ) ), 1.0 ) ).rgb;',
      '}',
      'vec3 skyFogColor() {',
      '  return skyUseBg > 0.5 ? texture2D( skyBg, gl_FragCoord.xy / skyRes ).rgb : skyGradient();',
      '}',
      '#endif'
    ].join('\n');
    var src = C.fog_fragment;
    // дымка лёгкая: до середины дороги предметы почти чёткие (степень 2), дальше уходят в светлую дымку (цвет тумана суток)
    // и к краю — в небо за ними: дальние острова и башни не синеют под цвет неба над горизонтом, а новые ряды рождаются
    // из неба без шва
    C.fog_fragment = src.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, skyFogColor(), smoothstep( 0.45, 1.0, fogFactor ) ), fogFactor * fogFactor );');
    if (DEBUG && C.fog_fragment === src) console.warn('skyFog: кусочек тумана изменился, туман цвета неба не применился');
  }

  // Туман дороги тает в то, что за предметом: после дальнего прохода (небо, замок, светила) кадр копируется в текстуру —
  // дальние ряды у подножия замка растворяются в замке, а не вырезают в нём дыры цвета неба. Сам дальний проход и кадр
  // со свечением (буфер с MSAA не скопировать) — по градиенту неба
  var skyBgSize = null;
  function skyBgCopy() {
    var U = SKY_FOG, toScreen = renderer.getRenderTarget() === null;
    U.skyUseBg.value = toScreen ? 1 : 0;
    if (!toScreen) return;
    var s = renderer.getDrawingBufferSize(skyBgSize || (skyBgSize = new T.Vector2())), t = U.skyBg.value;
    if (!t || t.image.width !== s.x || t.image.height !== s.y) {
      if (t) t.dispose();
      t = U.skyBg.value = new T.FramebufferTexture(s.x, s.y);
    }
    renderer.copyFramebufferToTexture(t);
  }

  // значения неба для тумана — те же, что рисуются на холсте неба
  function setSkyFog() {
    if (!SKY_FOG) return;
    var put = function (u, c) { var t = c.clone().convertLinearToSRGB(); u.value.set(t.r, t.g, t.b); };
    put(SKY_FOG.skyTop, day.top);
    put(SKY_FOG.skyHor, day.hor);
    put(SKY_FOG.skyLow, day.low);
    SKY_FOG.skyHz.value = view.horizon;
    renderer.getDrawingBufferSize(SKY_FOG.skyRes.value);
  }

  // край области теней (PCF): тень гаснет за последние 12% карты — граница не видна, тени не «включаются» на подлёте
  function shadowEdgeFade() {
    var C = T.ShaderChunk, src = C.shadowmap_pars_fragment, at = src.indexOf('#if defined( SHADOWMAP_TYPE_PCF )');
    var ret = 'return mix( 1.0, shadow, shadowIntensity );', end = src.indexOf(ret, at);
    if (at < 0 || end < 0) {
      if (DEBUG) console.warn('shadowEdgeFade: кусочек теней изменился, мягкий край не применился');
      return;
    }
    C.shadowmap_pars_fragment = src.slice(0, end) +
      'vec2 shadowEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );\n\t\t\tshadow = mix( 1.0, shadow, smoothstep( 0.0, 0.12, min( shadowEdge.x, shadowEdge.y ) ) );\n\t\t\t' +
      src.slice(end);
  }

  // видеокарта — для разбора жалоб на тормоза и чёрный экран (в аналитику при запуске)
  function gpuName() {
    try {
      var gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 80);
    } catch (e) {
      return '';
    }
  }

  function fail() {
    Telemetry.error('webgl', 'WebGL недоступен');
    el.game.classList.add('is-nogl');
    el.startText.textContent = tr('ui.nogl');
    document.getElementById('game-play').style.display = 'none';
    setState('start');
    el.game.classList.remove('is-loading');
  }

  function boot() {
    el = {
      game: document.getElementById('game'),
      canvas: document.getElementById('game-canvas'),
      shopCat: document.querySelector('.game__shop-cat'),
      shopIsle: document.querySelector('.game__sisle'),
      menuBg: document.querySelector('.game__menu-bg'),
      isle: document.querySelector('.game__misle'),
      hearts: $$('.game__heart'),
      coins: document.getElementById('game-coins'),
      speed: document.getElementById('game-speed'),
      wipe: document.getElementById('game-wipe'),
      flyers: document.getElementById('game-flyers'),
      coinCount: document.getElementById('game-coin-count'),
      meters: document.getElementById('game-meters'),
      combo: document.getElementById('game-coins'), // серия живёт на медальоне монет
      comboX: document.getElementById('game-combo-x'),
      pips: $$('.game__ring-seg'),
      pop: document.getElementById('game-pop'),
      popMain: document.getElementById('game-pop-main'),
      popSub: document.getElementById('game-pop-sub'),
      fury: document.getElementById('game-fury'),
      bossBar: document.querySelector('.game__boss-bar'),
      bossFill: document.getElementById('game-boss-fill'),
      bossName: document.getElementById('game-boss-name'),
      pause: document.getElementById('game-pause'),
      sound: document.getElementById('game-sound'),
      toast: document.getElementById('game-toast'),
      flash: document.getElementById('game-flash'),
      hintText: document.getElementById('game-hint-text'),
      startText: document.getElementById('game-start-text'),
      best: document.getElementById('game-best'),
      overMeters: document.getElementById('game-over-meters'),
      overCoins: document.getElementById('game-over-coins'),
      overCombo: document.getElementById('game-over-combo'),
      overBest: document.getElementById('game-over-best'),
      worlds: document.getElementById('game-worlds'),
      mapStars: document.getElementById('game-map-stars'),
      questStars: document.getElementById('game-quest-stars'),
      qcard: document.getElementById('game-qcard'),
      qcardTag: document.getElementById('game-qcard-tag'),
      qcardTitle: document.getElementById('game-qcard-title'),
      qcardText: document.getElementById('game-qcard-text'),
      qcardCoins: document.getElementById('game-qcard-coins'),
      qcardStars: document.getElementById('game-qcard-stars'),
      qcardLen: document.getElementById('game-qcard-len'),
      progressNum: document.getElementById('game-progress-num'),
      progressFill: document.getElementById('game-progress-fill'),
      winTitle: document.getElementById('game-win-title'),
      winStars: $$('.game__win-star'),
      winText: document.getElementById('game-win-text'),
      next: document.getElementById('game-next'),
      winMap: document.getElementById('game-win-map'),
      coach: document.getElementById('game-coach'),
      coachText: document.getElementById('game-coach-text'),
      coachNext: document.getElementById('game-coach-next'),
      coachDots: document.getElementById('game-coach-dots'),
      setSfx: document.getElementById('game-set-sfx'),
      setMusic: document.getElementById('game-set-music'),
      setTrack: document.getElementById('game-set-track'),
      setCredits: document.getElementById('game-set-credits'),
      setId: document.getElementById('game-set-id'),
      setTilt: document.getElementById('game-set-tilt'),
      setVibro: document.getElementById('game-set-vibro'),
      setLefty: document.getElementById('game-set-lefty'),
      setCalm: document.getElementById('game-set-calm'),
      walletNum: document.getElementById('game-wallet'),
      questBadge: document.getElementById('game-quest-badge'),
      codexBadge: document.getElementById('game-codex-badge'),
      days: document.getElementById('game-days'),
      dailyGot: document.getElementById('game-daily-got'),
      dailyClaim: document.getElementById('game-daily-claim'),
      chest: document.getElementById('game-chest'),
      saveRing: document.getElementById('game-save-ring'),
      saveLeft: document.getElementById('game-save-left'),
      saveCoins: document.getElementById('game-save-coins'),
      saveAd: document.getElementById('game-save-ad'),
      codexList: document.getElementById('game-codex-list'),
      codexCount: document.getElementById('game-codex-count'),
      shopList: document.getElementById('game-shop-list'),
      questList: document.getElementById('game-quest-list'),
      buffs: document.getElementById('game-buffs'),
      overWallet: document.getElementById('game-over-wallet')
    };
    if (IS_TOUCH) el.game.classList.add('is-touch');
    if (!el.game) return;
    setLang(settings.lang); // загрузчик — сразу на языке игрока, а не по-русски до конца загрузки моделей
    loaderTip();
    menuIsle = createMenuIsle(el.isle, 'public/img/menu-isle.webp'); // живой островок с котом в меню (свой WebGL; без него — картинка)
    if (!T) { fail(); return; }
    try {
      renderer = new T.WebGLRenderer({ canvas: el.canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      fail();
      return;
    }
    // цвета в hex — sRGB, считаем в линейном пространстве (ColorManagement включён по умолчанию)
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // карта теней — один раз за кадр, в проходе дороги
    renderer.autoClear = false;
    Telemetry.start({ lang: getLang(), touch: IS_TOUCH, webgl2: renderer.capabilities.isWebGL2, gpu: gpuName(), maxTex: renderer.capabilities.maxTextureSize });
    el.canvas.addEventListener('webglcontextlost', function () { Telemetry.error('webgl', 'context lost'); });
    view.prCap = Math.min(window.devicePixelRatio || 1, 2);
    view.pr = Math.min(view.prCap, 1.5); // старт чуть ниже потолка — adaptQuality поднимет, если телефон тянет (настройки поправят)
    setAnisotropy(renderer.capabilities.getMaxAnisotropy());
    legacyBump();
    skyFog();
    shadowEdgeFade();

    scene = new T.Scene();
    fogNear = new T.Fog('#cfe5fa', CONFIG.fog.near, CONFIG.fog.far);
    fogFar = new T.Fog('#cfe5fa', 140, 760);
    scene.fog = fogNear;
    camera = new T.PerspectiveCamera(CONFIG.camera.fov, 1, 0.3, 900);

    // тяжёлая сборка — по этапам: между ними браузер перерисовывает прелоудер; до неё — загрузка моделей
    var stages = [
      function () {
        buildTextures();
        buildMaterials();
      },
      function () {
        buildLights();
        fxDust = new Particles(320, tex.dot, false);
        fxGlow = new Particles(640, tex.spark, true);
        fxFire = new Particles(260, tex.puff, true);
        scene.add(fxDust.points);
        scene.add(fxGlow.points);
        scene.add(fxFire.points);
        coins = buildCoins();
        buildSky();
        buildScenery();
      },
      function () {
        cat = buildCat();
        scene.add(cat.root);
        applySkin();
        collectLit([].concat.apply([], Object.keys(mat).map(function (k) { return mat[k]; }))); // mat.bridge — массив, разворачиваем
        dayBlend(CONFIG.daynight.start);
        loadBest();
        loadQuest();
        renderMap(); // звёзды кампании — на кнопке заставки
        bindUi();
        applySettings(true);
        bindInput();
        bindNative();
        resetPlayer();
        layout();
        resetRound();
      },
      function () {
        cam.intro = 0;
        updateBestText();
        setState('start');
        updateCamera(0);
        updateScenery(0);
        return warmUp(); // все шейдеры — сейчас, а не посреди забега (сверху ляжет меню)
      }
    ];
    loadModels(function () { loadStages(stages, ready); });
  }

  // Модели из Blender. В playable путь заменяется на data:-URI. Если модель не загрузилась
  // (например, страница открыта как файл — браузер не даёт читать соседние файлы), острова строятся процедурно
  var MODEL_BRIDGE = 'public/models/bridge.glb', MODEL_ISLANDS = 'public/models/islands.glb', MODEL_CASTLE = 'public/models/castle.glb', MODEL_CAT = 'public/models/cat.glb', MODEL_DOG = 'public/models/dog.glb', MODEL_ENEMIES = 'public/models/enemies.glb', MODEL_TRAPS = 'public/models/traps.glb', MODEL_DECKS = 'public/models/decks.glb', MODEL_GATES = 'public/models/gates.glb';

  // KTX2 (_not_main/ktx2.mjs): текстуры моделей сжаты Basis Universal и остаются сжатыми в видеопамяти (в 4–8 раз
  // меньше PNG). Транскодер — public/basis; в playable и приложении он вшит строкой data:, по пути его не загрузить —
  // поэтому он заранее кладётся в кэш three под тем путём, откуда его попросит KTX2Loader. Нет WebAssembly — без KTX2
  var BASIS_JS = 'public/basis/basis_transcoder.js', BASIS_WASM = 'public/basis/basis_transcoder.wasm';
  function ktx2Ready() {
    if (typeof WebAssembly !== 'object') return Promise.reject(new Error('нет WebAssembly'));
    return Promise.all([
      fetch(BASIS_JS).then(function (r) { return r.text(); }),
      fetch(BASIS_WASM).then(function (r) { return r.arrayBuffer(); })
    ]).then(function (f) {
      T.Cache.enabled = true;
      T.Cache.add('file:basis/basis_transcoder.js', f[0]);
      T.Cache.add('file:basis/basis_transcoder.wasm', f[1]);
      return new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
    });
  }

  function loadModels(done) {
    var loader = new GLTFLoader(), left = 9, ktx = null;
    loaderTo(LOAD_MODELS * 0.25, 2.5); // сразу трогается: первые модели идут не мгновенно
    var finish = function () {
      loaderTo(LOAD_MODELS * Math.max(0.25, (9 - left + 1) / 9), 0.5);
      if (--left) return;
      T.Cache.clear(); // кэш нужен был только транскодеру (и попутно держал модели) — память обратно
      T.Cache.enabled = false;
      if (ktx) ktx.dispose();
      done();
    };
    var load = function (url, name, parse) {
      loader.load(url, function (gltf) {
        models[name] = parse(gltf.scene);
        finish();
      }, null, function (e) {
        if (DEBUG) console.warn('Модель ' + url + ' не загрузилась — собираю процедурно', e);
        finish();
      });
    };
    var all = function () {
      load(MODEL_BRIDGE, 'bridge', bridgeSet);
      load(MODEL_ISLANDS, 'islands', islandSet);
      load(MODEL_CASTLE, 'castle', castleSet);
      load(MODEL_CAT, 'cat', catSet);
      load(MODEL_DOG, 'dog', dogSet);
      load(MODEL_ENEMIES, 'enemies', enemiesSet);
      load(MODEL_TRAPS, 'traps', trapsSet);
      load(MODEL_DECKS, 'decks', decksSet);
      load(MODEL_GATES, 'gates', gatesSet);
    };
    ktx2Ready().then(function (k) {
      ktx = k;
      loader.setKTX2Loader(k);
      all();
    }, function (e) {
      if (DEBUG) console.warn('KTX2 недоступен — модели со сжатыми текстурами не загрузятся', e);
      all();
    });
  }

  // кот и пёс: части <prefix>_<имя> стоят в точках поворота — там же, где группы buildCat / dogModel;
  // модель вставляется в них с нуля
  function partSet(root, prefix, names) {
    var set = {};
    names.forEach(function (name) {
      var o = root.getObjectByName(prefix ? prefix + '_' + name : name);
      o.position.set(0, 0, 0);
      set[name] = o;
    });
    return set;
  }

  function catSet(root) { return partSet(root, 'cat', ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'sword']); }
  function dogSet(root) { return partSet(root, 'dog', ['body', 'head', 'armL', 'armR', 'knife']); }
  function trapsSet(root) { return partSet(root, '', ['keg', 'gate', 'axe', 'mushroom', 'wing', 'feather']); }
  function enemiesSet(root) {
    return {
      crow: partSet(root, 'crow', ['body', 'wingA', 'wingB']),
      bat: partSet(root, 'bat', ['body', 'wingA', 'wingB']),
      dragon: partSet(root, 'dragon', ['body', 'wingL', 'wingR', 'crown']),
      golem: partSet(root, 'golem', ['body', 'armL', 'armR']),
      ghost: partSet(root, 'ghost', ['body', 'armR'])
    };
  }

  // замок: одна модель; точки флагов и стягов — в её extras
  function castleSet(root) {
    var o = root.getObjectByName('castle'), m = o.material;
    [m.map, m.normalMap, m.emissiveMap].forEach(function (t) { t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });
    return { geo: o.geometry, extras: o.userData, tex: { map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, emissiveMap: m.emissiveMap } };
  }

  // боковые острова: isl_<вид> → геометрия и точки крепления (extras); текстуры общие
  function islandSet(root) { return pieceSet(root, 'isl_'); }

  function pieceSet(root, prefix) {
    var set = { tex: null };
    root.traverse(function (o) {
      if (!o.isMesh || o.name.indexOf(prefix) !== 0) return;
      set[o.name.slice(prefix.length)] = { geo: o.geometry, extras: o.userData };
      if (!set.tex) {
        var m = o.material;
        [m.map, m.normalMap, m.emissiveMap].forEach(function (t) { t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });
        set.tex = { map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, emissiveMap: m.emissiveMap };
      }
    });
    return set;
  }

  // Куски моста: острова seg_* (арки и глыбы — игра берёт любой), плиты летающих deck, стартовая plaza.
  // Размер площадки — из extras w, d (у кладки рваный край, габарит шире площадки), иначе — по габариту
  function bridgeSet(root) {
    var piece = function (o) {
      var g = o.geometry;
      g.computeBoundingBox();
      return { geo: g, w: o.userData.w || g.boundingBox.max.x - g.boundingBox.min.x, d: o.userData.d || g.boundingBox.max.z - g.boundingBox.min.z };
    };
    var segs = [];
    root.traverse(function (o) { if (o.isMesh && /^seg/.test(o.name)) segs.push(o); });
    segs.sort(function (a, b) { return a.name < b.name ? -1 : 1; }); // порядок не зависит от обхода — варианты стабильны
    var src = segs[0].material;
    [src.map, src.normalMap, src.emissiveMap].forEach(function (t) { t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });
    return {
      segs: segs.map(piece),
      deck: piece(root.getObjectByName('deck')),
      plaza: piece(root.getObjectByName('plaza')),
      tex: { map: src.map, normalMap: src.normalMap, normalScale: src.normalScale, emissiveMap: src.emissiveMap }
    };
  }

  // большие ворота (gates.glb): башни, арка, шатры; в extras — где висят стяги (верх полотнища) и вершина свода
  function gatesSet(root) {
    var o = root.getObjectByName('gate_arch'), m = o.material;
    [m.map, m.normalMap, m.emissiveMap].forEach(function (t) { t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });
    return { geo: o.geometry, extras: o.userData, tex: { map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, emissiveMap: m.emissiveMap } };
  }

  // верхние виадуки (decks.glb): deck_<вид> — пролёт, deck_<вид>_r<k> — куски пандуса; атлас общий
  function decksSet(root) {
    var set = { stone: { span: null, ramp: [] }, wood: { span: null, ramp: [] }, tex: null };
    root.traverse(function (o) {
      var m = o.isMesh && /^deck_(stone|wood)(?:_r(\d))?$/.exec(o.name);
      if (!m) return;
      if (m[2] != null) set[m[1]].ramp[+m[2]] = o.geometry;
      else set[m[1]].span = o.geometry;
      if (!set.tex) {
        var src = o.material;
        src.map.anisotropy = src.normalMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        set.tex = { map: src.map, normalMap: src.normalMap, normalScale: src.normalScale };
      }
    });
    return set;
  }

  // Загрузчик: полоса и монетка на её краю получают цель и едут к ней сами (сдвиг анимирует композитор, пока
  // главный поток занят). Модели — первая часть полосы (LOAD_MODELS), этапы сборки — остальное
  var LOAD_MODELS = 0.55;
  function loaderTo(p, sec) {
    ['game-progress', 'game-progress-ride'].forEach(function (id) {
      var n = document.getElementById(id);
      if (!n) return;
      n.style.transitionDuration = sec + 's';
      n.style.transform = 'translateX(' + ((p - 1) * 100).toFixed(1) + '%)';
    });
  }

  // совет из кампании на загрузчике — любой уровня без босса
  function loaderTip() {
    var n = document.getElementById('game-loader-tip'), tips = [];
    if (!n) return;
    WORLDS.forEach(function (w) { w.levels.forEach(function (l) { if (l.tip && !l.boss) tips.push(l.tip); }); });
    if (tips.length) n.innerHTML = '<b>' + tr('ui.tip') + '</b>' + tr(tips[(Math.random() * tips.length) | 0]);
  }

  // Этапы сборки: перед этапом цель — его конец. Этап стартует после кадра, чтобы цель успела отрисоваться;
  // запасной таймер — если вкладка скрыта и кадры не идут. Этап может вернуть промис — следующий ждёт его
  function loadStages(list, done) {
    var i = 0, to = function (p, sec) { loaderTo(LOAD_MODELS + p * (1 - LOAD_MODELS), sec); };
    (function next() {
      if (i === list.length) {
        to(1, 0.2);
        setTimeout(done, 220);
        return;
      }
      to((i + 0.9) / list.length, 0.9);
      var started = false, run = function () {
        if (started) return;
        started = true;
        var wait = list[i++]();
        if (wait && wait.then) wait.then(next, next); // сборка шейдеров не удалась — игра всё равно запускается
        else next();
      };
      requestAnimationFrame(function () { setTimeout(run, 0); });
      setTimeout(run, 150);
    })();
  }

  function ready() {
    el.game.classList.remove('is-loading');
    requestAnimationFrame(frame);
    if (AUTOPLAY) setTimeout(startGame, 200);

    if (DEBUG) {
      window.__game = {
        config: CONFIG,
        models: models, // какие модели загрузились (автопроверка: _not_main/check)
        player: function () { return player; },
        world: world,
        cam: cam,
        camera: camera,
        renderer: renderer,
        bloom: bloom, // свечение: on, composer, pass
        setBloom: function (on) { setBloom(on); },
        telemetry: Telemetry.debug, // очередь аналитики и отчётов об ошибках
        sound: Sound.debug,
        audio: Sound,
        nearby: function () { return nearby; },
        simTime: function () { return simTime; },
        state: function () { return state; },
        start: startGame,
        restart: restart,
        attack: startAttack,
        trick: startTrick,
        // покадрово для снимков: freeze(true) — игра стоит, step(dt) — продвинуть на dt и отрисовать
        freeze: function (on) { frozen = on; },
        step: function (dt) { update(dt); render(); },
        tick: function (dt) { update(dt); }, // ход без отрисовки (проверки вёрстки)
        cat: function () { return cat; }, // части кота (позы, проверки)
        // время суток: 0 — утро, 0.4 — закат, 0.55 — ночь, 0.75 — рассвет
        setDay: function (t) {
          dayTime = t * CONFIG.daynight.period;
          updateDayNight(0, true);
        },
        flyer: function (kind) { var a = player.target || rowAt(1); addFlyer(kind || 'crow', rowAt(a.i - 1) || a, a); },
        dragon: function () { world.dragonAt = player.z + 1; },
        boss: function () { world.bossAt = -player.z; }, // Пламенный дракон — сейчас же
        catTop: function (skip) { // верх видимой части кота над лапами (с ушами), м; skip — без меча
          cat.root.updateMatrixWorld(true);
          var bb = new T.Box3(), one = new T.Box3();
          var walk = function (o) {
            if (!o.visible || skip && (o === cat.sword || o === cat.bubble || o === cat.wings || o === cat.pet)) return; // skip — только сам кот: без меча, пузыря, крыльев и спутника
            if (o.isMesh && o.geometry) { one.setFromObject(o, true); bb.union(one); return; }
            o.children.forEach(walk);
          };
          walk(cat.root);
          return bb.max.y - player.y;
        },
        bossAct: function (kind) { var D = world.boss; if (D) { D.act = null; D.cool = 0; D.force = kind || 'breath'; } }, // атака босса сейчас же (breath — по колонке)
        wings: function () { startFlight(); }, // крылья грифона сейчас же
        bonus: function (kind) { collectBonus({ kind: kind, x: player.x, y: player.y, z: player.z }); }, // magnet, double, bubble, heart
        heart: function () { world.heartNext = 0; }, // сердце — в ближайшем новом ряду (если жизней меньше полного)
        codexShot: function (tab, id) { return codexShot(tab, id); }, // снимок записи справочника (PNG data URL)
        daily: function () { dailyShown = false; maybeDaily(true); }, // награда за вход сейчас (если ждёт; ?debug — и с &daily)
        dayRun: function () { startDailyRun(); }, // забег дня
        grant: function (n) { Shop.debugGrant(n); renderWallet(); }, // монеты в кошелёк
        trap: function (kind) { world.forceTrap = kind; },
        deck: function (kind) { world.forceDeck = kind || true; }, // верхний виадук (kind: stone, wood) — со следующего ряда бега
        level: function (w, i) { startLevel(w, i); }, // уровень кампании (номера с нуля)
        quest: function () { return quest; },
        biome: function () { return bio.key; },
        weather: function () { weather.next = 0; return weather; }, // событие погоды биома сейчас: молния, порыв метели или искр
        scenery: function () { return { islands: islands, decor: decor, clouds: clouds, castle: castle, roadClouds: roadClouds }; },
        layout: function () { layout(); }, // пересчитать камеру после правки CONFIG.camera
        // посадить пса-рыцаря на остров целевого ряда, ближайший к коту
        dog: function () {
          var row = player.target, p = row && row.plats.filter(function (q) { return q.type === 'stone' && !q.dog && !q.crate; })
            .sort(function (a, b) { return Math.abs(a.x - player.x) - Math.abs(b.x - player.x); })[0];
          if (p) addDog(p);
          return !!p;
        },
        // прогнать игру на sec секунд без отрисовки (проверка генерации и автопилота)
        sim: function (sec) {
          for (var i = 0; i < sec * 60 && state === 'play'; i++) update(1 / 60);
          return { state: state, dist: Math.round(player.maxDist), lives: player.lives, coins: player.coins, bestCombo: player.bestCombo, events: debugEvents, rows: world.rows.length, flyers: world.flyers.length, day: +((dayTime / CONFIG.daynight.period) % 1).toFixed(2), lost: debugStats };
        },
        // потерять все жизни и упасть → финальный экран
        fall: function () {
          player.saved = true; // без «Спасти забег?» — сразу финал
          player.lives = 0;
          hud.lives = -1;
          knockOut();
        }
      };
    }
  }

  // стартуем после DOM, three.js (подключён раньше) и шрифта (нужен табличкам дистанции), с учётом MRAID
  function whenReady() {
    var go = function () {
      if (window.mraid && typeof window.mraid.getState === 'function' && window.mraid.getState() === 'loading') {
        window.mraid.addEventListener('ready', boot);
      } else {
        boot();
      }
    };
    if (document.fonts && document.fonts.load) document.fonts.load('900 40px Nunito').then(go, go);
    else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenReady);
  else setTimeout(whenReady, 0);
})();

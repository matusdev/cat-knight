// Шейдеры: частицы (точки с размером и цветом) и языки пламени

var PARTICLE_VS = [
  'attribute float size;',
  'attribute vec4 tint;',
  'uniform float scale;',
  'varying vec4 vTint;',
  'void main() {',
  '  vTint = tint;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = size * scale / -mv.z;',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var PARTICLE_FS = [
  'uniform sampler2D map;',
  'varying vec4 vTint;',
  'void main() {',
  '  vec4 t = texture2D(map, gl_PointCoord);',
  '  gl_FragColor = vec4(vTint.rgb * t.rgb, vTint.a * t.a);',
  '}'
].join('\n');

var fireTime = { value: 0 };
var FLAME_VS = [
  '#include <fog_pars_vertex>',
  'varying vec2 vUv;',
  'varying float vSeed;',
  'void main() {',
  '  vUv = uv;',
  '  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
  '  mvPosition.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));',
  '  vSeed = fract(dot(modelMatrix[3].xyz, vec3(0.137, 0.71, 0.293)));',
  '  gl_Position = projectionMatrix * mvPosition;',
  '  #include <fog_vertex>',
  '}'
].join('\n');
var FLAME_FS = [
  'uniform float uTime;',
  '#include <fog_pars_fragment>',
  'varying vec2 vUv;',
  'varying float vSeed;',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float noise(vec2 p) {',
  '  vec2 i = floor(p), f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
  '}',
  'float fbm(vec2 p) {',
  '  float v = 0.0, a = 0.5;',
  '  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }',
  '  return v;',
  '}',
  'void main() {',
  '  float t = uTime + vSeed * 17.0, h = vUv.y;',
  '  float n = fbm(vec2(vUv.x * 2.6 + vSeed * 9.0, h * 2.2 - t * 1.9));',
  '  float n2 = fbm(vec2(vUv.x * 5.5 - 3.1, h * 4.5 - t * 2.9));',
  '  float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * h + sin(t * 3.1 + h * 4.0) * 0.08 * h;',
  '  float w = (1.0 - h * 0.85) * (0.55 + 0.45 * n2);',
  '  float body = 1.0 - smoothstep(w * 0.35, w, abs(x));',
  '  float tip = 1.0 - smoothstep(0.35 + 0.35 * n, 0.95, h);',
  '  float m = body * tip * smoothstep(0.0, 0.07, h);',
  '  float heat = m * (1.25 - h);',
  '  vec3 col = mix(vec3(0.7, 0.08, 0.01), vec3(1.0, 0.45, 0.06), smoothstep(0.1, 0.5, heat));',
  '  col = mix(col, vec3(1.0, 0.76, 0.38), smoothstep(0.55, 1.0, heat));', // ядро — жёлтое, не белое: языки складываются по яркости
  '  float a = m * (0.5 + 0.2 * n2);',
  '  #ifdef USE_FOG',
  '    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);',
  '  #endif',
  '  gl_FragColor = vec4(col, a);',
  '}'
].join('\n');

export { PARTICLE_VS, PARTICLE_FS, fireTime, FLAME_VS, FLAME_FS };

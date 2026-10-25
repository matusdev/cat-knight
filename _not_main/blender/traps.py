# Ловушки в стиле героев (figures.py): пороховая бочка с фитилём и черепом, секира-маятник на цепи
# и каменные ворота, на балке которых она качается. Части — keg (стоит на острове), gate (ворота над рядом,
# начало координат — центр ряда на уровне островов) и axe (секира, точка поворота — крюк на балке ворот,
# игра качает её вокруг оси z). Краска — в цветах вершин; металл лезвия — отдельный материал.
# Результат — public/models/traps.glb.
#
# Запуск из корня проекта (меньше минуты):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/traps.py -- public/models/traps.glb [превью.png]
#
# Координаты — в осях игры (z — к камере), в метрах игры.
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
from figures import G, S, material, Figure, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

M = {
    'plain': material('plain', (1, 1, 1), 0.7, vcol=True),
    'blade': material('blade', (0.75, 0.77, 0.8), 0.22, 1.0),
}
PAINTS = {
    'wood': ('plain', (0.33, 0.16, 0.06)),
    'wood_dark': ('plain', (0.18, 0.08, 0.03)),
    'iron': ('plain', (0.07, 0.07, 0.08)),
    'stone_a': ('plain', (0.3, 0.26, 0.2)),
    'stone_b': ('plain', (0.23, 0.2, 0.15)),
    'rock': ('plain', (0.2, 0.13, 0.08)),
    'white': ('plain', (0.95, 0.93, 0.86)),
    'dark': ('plain', (0.012, 0.01, 0.01)),
    'steel': ('blade', (1, 1, 1)),
    'cap': ('plain', (0.75, 0.05, 0.035)),
    'stem': ('plain', (0.86, 0.76, 0.6)),
    'gills': ('plain', (0.62, 0.45, 0.32)),
    'wing_gold': ('plain', (0.62, 0.36, 0.1)),
    'wing_dark': ('plain', (0.32, 0.17, 0.05)),
    'wing_light': ('plain', (0.93, 0.82, 0.6)),
    'wing_cov': ('plain', (0.82, 0.55, 0.22)),
    'feather': ('plain', (1.0, 0.68, 0.12)),
}
GX = 4.8  # колонны ворот: дальше края островов (даже ездящих) и размаха секиры (CONFIG.axe.swing)
AXE_PIVOT = (0, 5.6, 0)  # крюк на балке ворот — в осях ворот; игра ставит секиру сюда (main.js, AXE)
f = Figure({'keg': (0, 0, 0), 'gate': (0, 0, 0), 'axe': AXE_PIVOT, 'mushroom': (0, 0, 0), 'wing': (0, 0, 0), 'feather': (0, 0, 0)}, M, PAINTS)
PI = math.pi
FACE = (PI / 2, 0, 0)  # кольцо из плоскости XY — в плоскость, обращённую к камере

# ---------- пороховая бочка: пузатая, три железных обруча, череп с костями спереди, фитиль сверху ----------
f.cone('keg', 'wood', G(0, 0.155, 0), 0.25, 0.3, 0.31, seg=16)
f.cone('keg', 'wood', G(0, 0.465, 0), 0.3, 0.25, 0.31, seg=16)
f.cone('keg', 'wood_dark', G(0, 0.625, 0), 0.24, 0.24, 0.03, seg=16)
for y, r in ((0.09, 0.27), (0.31, 0.305), (0.53, 0.27)):
    f.torus('keg', 'iron', G(0, y, 0), r, 0.022)
for a in (0.6, -0.6):  # скрещённые кости за черепом
    f.box('keg', 'white', G(0, 0.33, 0.29), (0.2, 0.02, 0.035), (0, a, 0), bevel=0.4)
f.sphere('keg', 'white', G(0, 0.37, 0.3), S(0.085, 0.08, 0.025), seg=16)
for s in (-1, 1):
    f.sphere('keg', 'dark', G(0.032 * s, 0.38, 0.322), S(0.02, 0.022, 0.008), seg=8)
f.rod('keg', 'dark', (0.05, 0.62, 0.05), (0.1, 0.78, 0.08), 0.014)
f.rod('keg', 'dark', (0.1, 0.78, 0.08), (0.06, 0.9, 0.12), 0.012)  # кончик фитиля — тут игра зажигает искру

# ---------- ворота: две парящие колонны из блоков, под ними скалы, сверху деревянная балка с крюком ----------
for s in (-1, 1):
    for k in range(9):
        w = 0.72 + (k % 3) * 0.04
        f.box('gate', 'stone_a' if k % 2 else 'stone_b', G(GX * s, -2.0 + k * 0.85, 0), (w, 0.8, w), (0, 0, 0.04 * ((k * 7) % 3 - 1)), bevel=0.08)
    f.cone('gate', 'rock', G(GX * s, -2.75, 0), 0.08, 0.5, 0.9, (PI, 0, 0), seg=7)
    f.box('gate', 'stone_a', G(GX * s, 5.4, 0), (0.9, 0.3, 0.9), bevel=0.1)
f.box('gate', 'wood', G(0, 5.75, 0), (2 * GX + 0.8, 0.36, 0.42), bevel=0.06)
for s in (-1, 1):  # железные скобы на балке
    f.box('gate', 'iron', G(GX * s, 5.75, 0), (0.12, 0.44, 0.5), bevel=0.1)
f.box('gate', 'iron', G(0, 5.55, 0), (0.3, 0.12, 0.3), bevel=0.1)

# ---------- секира: цепь, топорище и двойное лезвие-полумесяц, плоскостью к камере ----------
px, py, pz = AXE_PIVOT
for k in range(17):  # звенья внахлёст, через одно повёрнуты
    f.torus('axe', 'iron', G(px, py - 0.12 - k * 0.22, pz), 0.12, 0.026, FACE if k % 2 else (PI / 2, 0, PI / 2))
f.rod('axe', 'wood', (px, py - 3.85, pz), (px, py - 5.0, pz), 0.06, 0.055)
f.sphere('axe', 'iron', G(px, py - 5.03, pz), S(0.08, 0.08, 0.08), seg=12)
cy = py - 4.8  # центр лезвия


def bit(s):  # одно лезвие: от топорища вогнутый верх к рогу, дуга режущей кромки, рог, вогнутый низ к топорищу
    up = [(0.08, 0.17), (0.3, 0.26), (0.5, 0.36), (0.66, 0.52)]
    edge = [(0.66 + 0.2 * math.sin(t), 0.52 * math.cos(t)) for t in [i / 10 * PI for i in range(1, 10)]]
    pts = up + edge + [(x, -y) for x, y in up[::-1]]
    return [(s * x, cy + y, pz + 0.035) for x, y in (pts if s > 0 else pts[::-1])]


f.slab('axe', 'steel', bit(-1)[::-1] + bit(1)[::-1], 0.07, bevel=0.012)
f.box('axe', 'iron', G(px, cy, pz), (0.16, 0.34, 0.1), bevel=0.1)  # проушина

# ---------- гриб-батут: красная шляпка в белых пятнах на толстой ножке — прыгнул, и он подбрасывает высоко ----------
f.cone('mushroom', 'stem', G(0, 0.24, 0), 0.2, 0.15, 0.48, seg=16)
f.sphere('mushroom', 'stem', G(0, 0.03, 0), S(0.24, 0.07, 0.24), seg=16)  # корень расплющен о камень
f.cone('mushroom', 'gills', G(0, 0.5, 0), 0.56, 0.17, 0.08, seg=24)
f.sphere('mushroom', 'cap', G(0, 0.52, 0), S(0.57, 0.36, 0.57), seg=32, dome=True)
f.torus('mushroom', 'cap', G(0, 0.53, 0), 0.54, 0.035)  # валик по кромке шляпки
for i, (a, e, r) in enumerate(((0, 0.55, 0.11), (1.3, 0.35, 0.09), (2.5, 0.6, 0.1), (3.7, 0.4, 0.08), (4.9, 0.55, 0.1), (0.7, 1.05, 0.08), (3.1, 1.1, 0.07), (5.6, 0.95, 0.07))):
    x, z = math.cos(a) * math.cos(e), math.sin(a) * math.cos(e)  # точка на куполе: азимут a, высота e
    n = Vector(G(x, math.sin(e), z)).normalized()  # пятно лежит на шляпке: плоская ось — по нормали купола
    f.sphere('mushroom', 'white', G(x * 0.57, 0.52 + math.sin(e) * 0.36, z * 0.57), (r, r, r * 0.35), tuple(Vector((0, 0, 1)).rotation_difference(n).to_euler()), seg=12)

# ---------- крыло грифона (правое; левое — зеркало в игре): кость, кроющие перья, маховые веером ----------
# корень — у плеча кота (начало координат), размах — вдоль +x, перья отходят назад (+z, за спину кота)


def feather(c, length, width, yaw, paint, lift=0.0):
    """перо — сплюснутый эллипсоид; yaw — поворот от +x назад, к +z; lift — наклон вверх"""
    f.sphere('wing', paint, G(*c), S(length / 2, 0.016, width / 2), (0, lift, -yaw), seg=12)


f.rod('wing', 'wing_dark', (0, 0, 0), (0.55, 0.2, 0.04), 0.05, 0.045)
f.rod('wing', 'wing_dark', (0.55, 0.2, 0.04), (1.05, 0.32, 0.12), 0.042, 0.03)
for i in range(8):  # маховые: веером от запястья, наружу и назад; кончики светлее
    a = 0.15 + i * 0.16
    L = 0.78 - i * 0.04
    cx, cz = 1.05 + math.cos(a) * L * 0.45, 0.12 + math.sin(a) * L * 0.45
    feather((cx, 0.31 - i * 0.008, cz), L, 0.15, a, 'wing_gold' if i % 2 else 'wing_dark')
    feather((1.05 + math.cos(a) * L * 0.85, 0.305 - i * 0.008, 0.12 + math.sin(a) * L * 0.85), L * 0.3, 0.12, a, 'wing_light')
for i in range(11):  # второстепенные — вдоль предплечья, назад, внахлёст
    t0 = i / 10
    x, y, z = 0.12 + t0 * 0.9, 0.07 + t0 * 0.23, 0.02 + t0 * 0.1
    feather((x - 0.02, y - 0.01, z + 0.33), 0.68, 0.14, 1.45 - t0 * 0.2, 'wing_gold' if i % 2 else 'wing_dark')
for row, (dz, L, paint) in enumerate(((0.16, 0.36, 'wing_cov'), (0.07, 0.22, 'wing_light'))):  # кроющие — два ряда поверх
    for i in range(10):
        t0 = i / 9
        x, y, z = 0.08 + t0 * 0.95, 0.1 + t0 * 0.23 + row * 0.015, 0.03 + t0 * 0.1
        feather((x, y + 0.02, z + dz), L, 0.12, 1.3, paint)

# ---------- перо грифона — подбор над островом: золотое, стержень и опахало ----------
f.rod('feather', 'wing_light', (0, -0.42, 0), (0, 0.5, 0), 0.018, 0.008)
f.slab('feather', 'feather', [(0, -0.22, 0.012), (0.13, -0.08, 0.012), (0.17, 0.14, 0.012), (0.12, 0.36, 0.012), (0, 0.52, 0.012), (-0.12, 0.36, 0.012), (-0.17, 0.14, 0.012), (-0.13, -0.08, 0.012)], 0.024, bevel=0.006)

objs = f.join()
export(OUT, objs)
if PREVIEW:
    for o in objs:
        if o.name == 'keg':
            o.location.x += 1.6
            o.location.z += 0.2
        if o.name == 'mushroom':
            o.location.x -= 1.8
            o.location.z += 0.2
        if o.name == 'wing':
            o.location.x -= 0.5
            o.location.z += 1.4
        if o.name == 'feather':
            o.location.x += 0.8
            o.location.z += 1.6
    preview(PREVIEW, (0, -4.2, 1.6), (0, 0, 0.6), lens=35, size=(800, 500))

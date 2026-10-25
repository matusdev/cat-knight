# Враги в стиле кота и пса — пухлые, чиби: ворона, летучая мышь и дракон. Каждый — набор жёстких частей
# с точками поворота там же, где их крутит игра (flyerModel и dragonModel в main.js): тело и крылья
# (у дракона ещё корона — её надевает только босс). Краска — в цветах вершин (figures.py).
# Дракон один на двоих: зелёный дракончик и багровый Пламенный дракон — игра подменяет материалы
# scale (чешуя), belly (брюхо), membrane (перепонки), horn (рога, шипы, когти), поэтому их цвета здесь — для превью.
# Результат — public/models/enemies.glb.
#
# Запуск из корня проекта (меньше минуты):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/enemies.py -- public/models/enemies.glb [превью.png]
#
# Координаты — в осях игры, каждый враг вокруг своего начала координат, до масштаба в игре
# (ворона и мышь 1.25, дракончик 1.3, босс 2.4). Ворона и мышь летят головой в +x, крылья — вдоль ±z;
# дракон смотрит в +z (на кота), крылья — вдоль ±x.
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figures import G, S, material, Figure, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

M = {
    'plain': material('plain', (1, 1, 1), 0.6, vcol=True),
    'glow': material('glow', (1, 1, 1), 0.3, vcol=True),             # в игре — без освещения: глаза светятся и ночью
    'membrane': material('membrane', (1, 1, 1), 0.8, vcol=True, double=True),
    'scale': material('scale', (0.11, 0.43, 0.07), 0.55),            # в игре — окраска дракона
    'belly': material('belly', (0.9, 0.66, 0.16), 0.7),
    'horn': material('horn', (0.86, 0.77, 0.55), 0.6),
    'gold': material('gold', (0.85, 0.58, 0.18), 0.3, 1.0),
    'rockskin': material('rockskin', (0.55, 0.62, 0.72), 0.85),      # в игре — облик голема (лёд или лава)
    'glowskin': material('glowskin', (0.4, 0.8, 1.0), 0.3),         # в игре — светится цветом облика
    'spectral': material('spectral', (0.45, 0.35, 0.8), 0.4),       # в игре — полупрозрачный призрак
    'cloak': material('cloak', (0.2, 0.12, 0.35), 0.8, double=True),
}
W = (1, 1, 1)
PAINTS = {
    'crow': ('plain', (0.027, 0.021, 0.051)),        # почти чёрная с лиловым
    'crow_light': ('plain', (0.069, 0.058, 0.117)),
    'beak': ('plain', (0.888, 0.397, 0.044)),
    'bat': ('plain', (0.044, 0.024, 0.074)),
    'bat_light': ('plain', (0.105, 0.061, 0.171)),
    'pink': ('plain', (0.807, 0.254, 0.352)),
    'dark': ('plain', (0.012, 0.01, 0.015)),
    'white': ('plain', W),
    'eye_yellow': ('glow', (1, 0.665, 0.07)),
    'eye_red': ('glow', (1, 0.074, 0.074)),
    'eye_dragon': ('glow', (1, 0.75, 0.07)),
    'bat_wing': ('membrane', (0.144, 0.076, 0.254)),
    'dragon_wing': ('membrane', W),
    'scale': ('scale', W),
    'belly': ('belly', W),
    'horn': ('horn', W),
    'gold': ('gold', W),
    'rockskin': ('rockskin', W),
    'glowskin': ('glowskin', W),
    'spectral': ('spectral', W),
    'cloak': ('cloak', W),
}
# точки поворота частей (оси игры) — те же, что у групп в flyerModel / dragonModel
f = Figure({
    'crow_body': (0, 0, 0), 'crow_wingA': (0, 0.12, 0.16), 'crow_wingB': (0, 0.12, -0.16),
    'bat_body': (0, 0, 0), 'bat_wingA': (0, 0.06, 0.14), 'bat_wingB': (0, 0.06, -0.14),
    'dragon_body': (0, 0, 0), 'dragon_wingL': (-0.28, 0.32, 0.05), 'dragon_wingR': (0.28, 0.32, 0.05), 'dragon_crown': (0, 0, 0),
    'golem_body': (0, 0, 0), 'golem_armL': (-1.0, 1.4, 0), 'golem_armR': (1.0, 1.4, 0),
    'ghost_body': (0, 0, 0), 'ghost_armR': (0.6, 1.3, 0.1),
}, M, PAINTS)
PI = math.pi

# ---------- ворона: круглая, большая голова, сердитые брови, жёлтые глаза, клюв приоткрыт («кар!») ----------
f.sphere('crow_body', 'crow', G(-0.02, 0, 0), S(0.4, 0.3, 0.3), seg=32)
f.sphere('crow_body', 'crow_light', G(0.08, -0.08, 0), S(0.28, 0.2, 0.24))
f.sphere('crow_body', 'crow', G(0.32, 0.17, 0), S(0.23, 0.22, 0.22), seg=32)
f.cone('crow_body', 'beak', G(0.6, 0.16, 0), 0.075, 0.0, 0.26, (0, PI / 2, 0), (0.8, 1, 1), seg=10)
f.cone('crow_body', 'beak', G(0.56, 0.09, 0), 0.05, 0.0, 0.18, (0, PI / 2 + 0.3, 0), (0.6, 1, 1), seg=8)
for s in (-1, 1):
    f.sphere('crow_body', 'eye_yellow', G(0.46, 0.22, 0.11 * s), S(0.05, 0.068, 0.06), seg=16)
    f.sphere('crow_body', 'dark', G(0.505, 0.215, 0.12 * s), S(0.022, 0.036, 0.03), seg=12)
    f.box('crow_body', 'dark', G(0.47, 0.305, 0.11 * s), (0.13, 0.05, 0.03), (0, 0.5, 0))  # сердитые брови
    f.rod('crow_body', 'beak', (0.04, -0.24, 0.08 * s), (0.06, -0.36, 0.08 * s), 0.022)  # лапки
    f.sphere('crow_body', 'beak', G(0.08, -0.37, 0.08 * s), S(0.06, 0.025, 0.035), seg=10)
for i, a in enumerate((-0.45, 0, 0.45)):  # хохолок и хвост веером
    f.rod('crow_body', 'crow', (0.3 - i * 0.05, 0.36, 0), (0.22 - i * 0.07, 0.5 - abs(a) * 0.05, a * 0.06), 0.035, 0.01)
    f.cone('crow_body', 'crow', G(-0.5, 0.05, a * 0.2), 0.08, 0.02, 0.32, (0, -PI / 2, a), (0.35, 1, 1), seg=8)
for part, s in (('crow_wingA', 1), ('crow_wingB', -1)):  # крыло: широкое перо и три махо­вых на конце
    f.sphere(part, 'crow', G(-0.05, 0.12, 0.42 * s), S(0.27, 0.035, 0.3))
    for i in range(3):
        f.sphere(part, 'crow', G(-0.08 - i * 0.11, 0.12, (0.66 + i * 0.03) * s), S(0.07, 0.025, 0.2), (0, 0, s * (0.2 + 0.18 * i)))

# ---------- летучая мышь: пушистый шарик, большие уши с розовым, красные глазки, клычки ----------
f.sphere('bat_body', 'bat', G(0, 0, 0), S(0.22, 0.22, 0.2), seg=24)
f.sphere('bat_body', 'bat_light', G(0.08, -0.05, 0), S(0.15, 0.16, 0.15))
f.sphere('bat_body', 'bat', G(0.2, 0.13, 0), S(0.17, 0.16, 0.16), seg=24)
for s in (-1, 1):
    f.cone('bat_body', 'bat', G(0.16, 0.37, 0.09 * s), 0.085, 0.01, 0.28, (s * 0.35, 0, 0), (0.5, 1, 1), seg=10)
    f.cone('bat_body', 'pink', G(0.19, 0.36, 0.09 * s), 0.055, 0.008, 0.2, (s * 0.35, 0, 0), (0.3, 1, 1), seg=10)
    f.sphere('bat_body', 'eye_red', G(0.34, 0.17, 0.065 * s), S(0.035, 0.042, 0.035), seg=12)
    f.cone('bat_body', 'white', G(0.345, 0.035, 0.035 * s), 0.018, 0.0, 0.06, (PI, 0, 0), seg=6)
    f.sphere('bat_body', 'bat', G(-0.02, -0.21, 0.06 * s), S(0.04, 0.035, 0.035), seg=10)
f.sphere('bat_body', 'pink', G(0.37, 0.11, 0), S(0.025, 0.02, 0.03), seg=10)
OUTLINE = [(0, 0.5), (0.45, 0.7), (1, 0.15), (0.78, -0.35), (0.6, -0.1), (0.42, -0.45), (0.24, -0.15), (0, -0.4)]  # (вдоль размаха, вдоль хорды)
for part, s in (('bat_wingA', 1), ('bat_wingB', -1)):  # перепонка: размах вдоль ±z, хорда вдоль x; пальцы-кости к зубцам
    P = lambda u, v: (v * 0.42, 0.06, s * (0.14 + u * 0.75))
    pts = [P(u, v) for u, v in OUTLINE]
    f.sheet(part, 'bat_wing', pts if s < 0 else pts[::-1])
    f.rod(part, 'bat', P(0, 0.5), P(0.45, 0.7), 0.022, 0.018)  # плечо
    for u, v in ((1, 0.15), (0.78, -0.35), (0.42, -0.45)):
        f.rod(part, 'bat', P(0.45, 0.7), P(u, v), 0.016, 0.006)
    f.cone(part, 'white', G(*P(0.46, 0.75)), 0.018, 0.0, 0.06, seg=6)  # коготок на сгибе

# ---------- дракон: круглое тело, большая голова, сердитые брови, рожки, шипы по спине, хвост с пикой ----------
f.sphere('dragon_body', 'scale', G(0, 0, 0), S(0.46, 0.44, 0.56), seg=32)
f.sphere('dragon_body', 'belly', G(0, -0.1, 0.22), S(0.33, 0.32, 0.42), seg=32)
f.sphere('dragon_body', 'scale', G(0, 0.44, 0.62), S(0.34, 0.31, 0.34), seg=32)
f.sphere('dragon_body', 'scale', G(0, 0.35, 0.92), S(0.22, 0.17, 0.22), seg=24)
f.sphere('dragon_body', 'belly', G(0, 0.25, 0.88), S(0.18, 0.09, 0.2), seg=16)  # светлая нижняя челюсть
for s in (-1, 1):
    f.sphere('dragon_body', 'dark', G(0.07 * s, 0.42, 1.11), S(0.03, 0.02, 0.02), seg=8)  # ноздри
    f.cone('dragon_body', 'white', G(0.08 * s, 0.22, 1.04), 0.026, 0.0, 0.08, (PI, 0, 0), seg=6)  # клыки
    f.sphere('dragon_body', 'eye_dragon', G(0.17 * s, 0.53, 0.86), S(0.085, 0.09, 0.07), seg=16)
    f.sphere('dragon_body', 'dark', G(0.18 * s, 0.53, 0.925), S(0.018, 0.06, 0.012), seg=10)  # зрачок-щёлка
    f.sphere('dragon_body', 'scale', G(0.17 * s, 0.63, 0.84), S(0.11, 0.035, 0.06), (0, -s * 0.35, 0), seg=12)  # брови
    f.cone('dragon_body', 'horn', G(0.16 * s, 0.76, 0.48), 0.07, 0.01, 0.34, (-0.6, s * 0.25, 0), seg=10)  # рога
    f.cone('dragon_body', 'horn', G(0.33 * s, 0.5, 0.56), 0.05, 0.005, 0.18, (0, s * PI / 2, 0), (1, 0.5, 1), seg=8)  # гребни на щеках
    f.sphere('dragon_body', 'scale', G(0.3 * s, -0.12, 0.36), S(0.09, 0.13, 0.09), seg=12)  # лапки
    f.sphere('dragon_body', 'scale', G(0.24 * s, -0.38, 0.06), S(0.14, 0.12, 0.18), seg=16)  # ступни
    for k in (-1, 0, 1):
        f.cone('dragon_body', 'horn', G(0.24 * s + k * 0.06, -0.44, 0.22), 0.025, 0.0, 0.07, (-PI / 2, 0, 0), seg=6)  # когти
for i in range(4):  # шипы по спине
    f.cone('dragon_body', 'horn', G(0, 0.5 - i * 0.07, 0.28 - i * 0.3), 0.065 - i * 0.008, 0.005, 0.22, (-0.55, 0, 0), (0.45, 1, 1), seg=8)
for i in range(6):  # хвост — к концу тоньше и чуть вверх
    f.sphere('dragon_body', 'scale', G(0, -0.05 + i * 0.04, -0.6 - i * 0.22), S(0.2 - i * 0.026, 0.2 - i * 0.026, 0.2 - i * 0.026), seg=16)
f.cone('dragon_body', 'horn', G(0, 0.2, -1.95), 0.16, 0.0, 0.3, (-PI / 2, 0, 0), (1, 0.3, 1), seg=4)  # пика на хвосте
for part, s in (('dragon_wingL', -1), ('dragon_wingR', 1)):  # перепонка: размах вдоль ±x, хорда вдоль z; пальцы-кости
    px, py, pz = f.pivots[part]
    P = lambda u, v: (px + s * u * 1.5, py, pz + v * 0.9)
    pts = [P(u, v) for u, v in OUTLINE]
    f.sheet(part, 'dragon_wing', pts if s > 0 else pts[::-1])
    f.rod(part, 'scale', P(0, 0.5), P(0.45, 0.7), 0.045, 0.035)  # плечо
    f.rod(part, 'scale', P(0.45, 0.7), P(1, 0.15), 0.035, 0.015)  # предплечье до кончика
    f.rod(part, 'scale', P(0.45, 0.7), P(0.78, -0.35), 0.02, 0.01)
    f.rod(part, 'scale', P(0.45, 0.7), P(0.42, -0.45), 0.02, 0.01)
    f.cone(part, 'horn', G(*P(0.47, 0.76)), 0.03, 0.0, 0.1, (0, 0, 0), seg=6)  # коготь на сгибе
# корона Пламенного дракона: золотой обруч с пятью зубцами
f.torus('dragon_crown', 'gold', G(0, 0.7, 0.6), 0.17, 0.035)
for i in range(5):
    a = (i - 2) * 0.55 + PI / 2
    f.cone('dragon_crown', 'gold', G(math.cos(a) * 0.17, 0.82, 0.6 + math.sin(a) * 0.17), 0.045, 0.0, 0.2, seg=6)

# ---------- голем: глыба-туловище с головой, кристаллы на спине, огромные каменные кулаки ----------
# камень — материал rockskin (в игре: ледяной — голубоватый с инеем, лавовый — чёрный базальт с огненными трещинами);
# глаза и кристаллы — glowskin (в игре светятся цветом облика). Валуны угловатые, с плоскими гранями
f.rock('golem_body', 'rockskin', G(0, 0.95, 0), S(0.95, 0.85, 0.72), seed=1)
f.rock('golem_body', 'rockskin', G(0, 0.4, 0.12), S(0.72, 0.5, 0.58), seed=2)
f.rock('golem_body', 'rockskin', G(0, 1.75, 0.35), S(0.46, 0.38, 0.4), seed=3, rough=0.1)   # голова — вперёд и ниже плеч
f.box('golem_body', 'rockskin', G(0, 1.97, 0.45), S(0.68, 0.14, 0.26), (0.25, 0, 0), bevel=0.2)  # тяжёлый лоб
for s in (-1, 1):
    f.sphere('golem_body', 'glowskin', G(0.17 * s, 1.76, 0.72), S(0.1, 0.07, 0.05), seg=10)  # глаза
    f.rock('golem_body', 'rockskin', G(0.42 * s, -0.08, 0.1), S(0.32, 0.26, 0.4), seed=4 + s)  # ступни
    f.rock('golem_body', 'rockskin', G(0.95 * s, 1.38, 0), S(0.42, 0.36, 0.42), seed=6 + s)    # плечи
for i, (x, y, z, h) in enumerate(((0, 1.55, -0.55, 0.7), (-0.4, 1.3, -0.6, 0.55), (0.42, 1.25, -0.58, 0.6), (-0.15, 1.0, -0.7, 0.45), (0.2, 0.75, -0.62, 0.4))):
    f.cone('golem_body', 'glowskin', G(x, y, z), 0.13, 0.0, h, (-0.7 + i * 0.1, 0, (i - 2) * 0.25), seg=5)  # кристаллы на спине
for part, s in (('golem_armL', -1), ('golem_armR', 1)):
    px, py, pz = f.pivots[part]
    f.rock(part, 'rockskin', G(px + 0.15 * s, py - 0.45, pz), S(0.28, 0.45, 0.28), seed=10 + s)      # предплечье
    f.rock(part, 'rockskin', G(px + 0.2 * s, py - 1.05, pz + 0.1), S(0.48, 0.42, 0.45), seed=12 + s)  # кулак
    f.cone(part, 'glowskin', G(px + 0.2 * s, py - 0.7, pz + 0.3), 0.08, 0.0, 0.3, (0.6, 0, 0), seg=5)

# ---------- призрачный рыцарь: вёдерный шлем с горящими глазами, доспех, рваный плащ, огромный меч ----------
# доспех — spectral (в игре полупрозрачный светящийся фиолетовый), глаза и клинок — glowskin
f.cone('ghost_body', 'spectral', G(0, 1.0, 0), 0.38, 0.6, 0.95, (0, 0, 0), S(1, 1, 0.72), seg=10)  # кираса: шире к плечам
f.cone('ghost_body', 'spectral', G(0, 1.78, 0.02), 0.3, 0.3, 0.46, seg=12)              # вёдерный шлем
f.sphere('ghost_body', 'spectral', G(0, 2.0, 0.02), S(0.3, 0.14, 0.3), seg=12)                          # макушка шлема
f.box('ghost_body', 'dark', G(0, 1.8, 0.29), S(0.42, 0.08, 0.06), bevel=0.3)                            # щель забрала
for s in (-1, 1):
    f.sphere('ghost_body', 'glowskin', G(0.1 * s, 1.8, 0.31), S(0.06, 0.035, 0.03), seg=8)
    f.sphere('ghost_body', 'spectral', G(0.56 * s, 1.38, 0), S(0.26, 0.2, 0.26), seg=12)  # наплечники
f.cone('ghost_body', 'glowskin', G(0, 2.25, -0.05), 0.07, 0.01, 0.45, (-0.5, 0, 0), seg=6)  # плюмаж-огонёк
TATTER = [(-0.55, 1.0), (-0.5, -0.55), (-0.32, -0.15), (-0.16, -0.7), (0, -0.2), (0.16, -0.75), (0.32, -0.15), (0.5, -0.6), (0.55, 1.0)]
f.sheet('ghost_body', 'cloak', [(x * (1.1 - y * 0.15), 0.5 + y * 0.85, -0.36) for x, y in TATTER])  # рваный плащ за спиной
f.cone('ghost_body', 'spectral', G(0, 0.1, 0), 0.04, 0.4, 0.9, seg=10)  # вместо ног — призрачный хвост
px, py, pz = f.pivots['ghost_armR']
f.sphere('ghost_armR', 'spectral', G(px + 0.05, py - 0.35, pz), S(0.15, 0.38, 0.15), seg=10)
f.rod('ghost_armR', 'dark', (px + 0.05, py - 0.78, pz + 0.12), (px + 0.05, py - 0.56, pz + 0.12), 0.05)
f.box('ghost_armR', 'gold', G(px + 0.05, py - 0.53, pz + 0.12), S(0.46, 0.06, 0.08), bevel=0.3)        # гарда
f.box('ghost_armR', 'glowskin', G(px + 0.05, py + 0.42, pz + 0.12), S(0.15, 1.85, 0.04), bevel=0.2)     # клинок вверх

objs = f.join()
export(OUT, objs)
if PREVIEW:  # три врага рядом: сдвинуть копии для превью нельзя — части стоят в своих точках; разводим объекты
    shift = {'crow': (-2.2, 0, 1.4), 'bat': (2.0, 0, 1.6), 'dragon': (0, 0, 0), 'golem': (-3.4, 0, -0.6), 'ghost': (3.4, 0, -0.6)}
    for o in objs:
        dx, dy, dz = shift[o.name.split('_')[0]]
        o.location.x += dx
        o.location.z += dz
    preview(PREVIEW, (0.6, -9.5, 2.6), (0, 0, 1.0), lens=35, size=(1100, 600))

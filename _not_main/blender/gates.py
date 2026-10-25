# Большие ворота над виадуком «Кот-рыцаря» (main.js: buildRoadGate, buildFinishGate) — в том же камне, что мост, острова
# и помосты (stonework.py): две квадратные башни с бойницами, зубцами и синими шатрами (как у замка), между ними —
# пологая (сегментная) арка из клинчатых камней с замковым камнем и золотой короной, над ней — невысокая стенка
# под плитами. Башни парят по бокам виадука, книзу сужаются и стоят на скальных обломках. Ворота низкие (вдвое ниже
# прежних): свод — 4,35 м над серединой дороги и 3,5 м у парапета (кот в прыжке проходит), верх стенки — 5,16 м:
# камера (5,9 м над дорогой на компьютере, до 7,9 м на телефоне) проходит над ней.
# Стяги — в игре (развеваются): висят на железных кронштейнах перед башнями, точки — в extras (banners: верх полотнища).
# Начало координат — середина ряда дороги на её уровне (y = 0). Результат — public/models/gates.glb, кусок gate_arch.
#
# Запуск из корня проекта (около 2 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/gates.py -- public/models/gates.glb <папка для промежуточных картинок> [превью.png]
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, GAP, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

TX = 4.75          # середина башни
TW = 0.74          # полуширина башни (квадрат 1,48 × 1,48)
SPRING = 2.75      # пята арки; пролёт — между внутренними гранями башен
HALF = TX - TW     # 4,01 — полупролёт
RISE = 1.6         # стрела свода: верх — 4,35 м; над колонкой x = ±2,2 — 3,92 м, у парапета (±2,85) — 3,6 м
R_IN = (HALF * HALF + RISE * RISE) / (2 * RISE)  # радиус свода (5,83)
YC = SPRING + RISE - R_IN                         # центр окружности свода — ниже дороги
A0 = math.atan2(SPRING - YC, HALF)                # угол пяты
RING = 0.5         # толщина кольца арки
WALL_D = 0.9       # толщина арки и стенки над ней (вдоль хода)
TOP = 5.0          # верх стенки над аркой (дальше — плиты покрытия, 0,16 м)
TOWER_TOP = 5.9    # верх башни (до зубцов)
BASE = -2.0        # низ башни (дальше — скала)
BAN_Y = 4.6        # кронштейн стяга: полотнище (1,45 м) — до 3,15 м
BAN_Z = TW + 0.3   # стяг — перед гранью башни, с запасом на волну ткани
VOXEL = 0.035

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rand = random.uniform


def tower(M, cx):
    """квадратная башня: кладка по четырём граням вперевязку, книзу (ниже дороги) — сужается уступами, сверху — карниз,
    зубцы и шатёр; бойницы на трёх гранях"""
    ch, y = 0.36, BASE
    k = 0
    while y < TOWER_TOP - 0.01:
        h = min(ch, TOWER_TOP - y)
        w = TW if y >= -0.6 else TW * (0.78 + 0.22 * (y - BASE) / (-0.6 - BASE))  # ниже дороги — уже
        for z, o in ((w - 0.14, (0, 0, 1)), (-w + 0.14, (0, 0, -1))):
            M.course(cx - w, cx + w, y, h, z, 0.28, 0.5, out=o)
        for x, o in ((cx + w - 0.14, (1, 0, 0)), (cx - w + 0.14, (-1, 0, 0))):
            M.course(-w + 0.29, w - 0.29, y, h, x, 0.28, 0.45, axis='z', out=o)
        y += h
        k += 1
    M.block((cx, (BASE + TOWER_TOP) / 2, 0), (2 * TW - 0.2, TOWER_TOP - BASE, 2 * TW - 0.2), tint=MORTAR)
    # цоколь на уровне дороги — пояс пошире, и карниз под зубцами
    for yy, grow, hh in ((0.0, 0.09, 0.3), (TOWER_TOP - 0.3, 0.12, 0.3)):
        for z, o in ((TW + grow - 0.14, (0, 0, 1)), (-TW - grow + 0.14, (0, 0, -1))):
            M.course(cx - TW - grow, cx + TW + grow, yy, hh, z, 0.28, 0.6, out=o)
        for x, o in ((cx + TW + grow - 0.14, (1, 0, 0)), (cx - TW - grow + 0.14, (-1, 0, 0))):
            M.course(-TW - grow + 0.29, TW + grow - 0.29, yy, hh, x, 0.28, 0.6, axis='z', out=o)
    # пояс в пяте арки — по внутренней грани
    xi = cx - math.copysign(TW + 0.06, cx)
    M.course(-TW - 0.06, TW + 0.06, SPRING - 0.22, 0.22, xi, 0.24, 0.5, axis='z', out=(-math.copysign(1, cx), 0, 0))
    # машикули: кронштейны под карнизом
    for i in range(4):
        a = i * math.pi / 2
        for t in (-0.5, -0.17, 0.17, 0.5):
            x = cx + math.cos(a) * (TW + 0.05) - math.sin(a) * t * TW * 1.6
            z = math.sin(a) * (TW + 0.05) + math.cos(a) * t * TW * 1.6
            M.block((x, TOWER_TOP - 0.48, z), (0.16 if i % 2 == 0 else 0.2, 0.32, 0.2 if i % 2 == 0 else 0.16))
    # зубцы: по два на грань
    g = TW + 0.12
    for i in range(4):
        a = i * math.pi / 2
        for s in (-1, 1):
            off = s * g * 0.55
            x = cx + math.cos(a) * (g - 0.13) - math.sin(a) * off
            z = math.sin(a) * (g - 0.13) + math.cos(a) * off
            M.block((x, TOWER_TOP + 0.27, z), (0.3 if i % 2 == 0 else 0.42, 0.5, 0.42 if i % 2 == 0 else 0.3))
    # шатёр: четырёхскатный, синяя черепица, золотое навершие
    M.prim('cyl', 'roof_blue', (cx, TOWER_TOP + 0.25 + 0.95, 0), r1=TW * 1.5, r2=0.02, depth=1.9, seg=4, rot=(0, math.pi / 4, 0))
    M.prim('cyl', 'gold', (cx, TOWER_TOP + 2.25, 0), r1=0.06, r2=0.01, depth=0.5, seg=6)
    M.prim('ico', 'gold', (cx, TOWER_TOP + 2.05, 0), (0.09, 0.09, 0.09), sub=1)
    # бойницы: узкие тёмные щели (ночью светятся)
    M.prim('cube', 'window', (cx, 1.75, TW + 0.02), (0.14, 0.62, 0.1))  # спереди выше — стяг
    for yy in (1.75, 3.95):
        M.prim('cube', 'window', (cx + math.copysign(TW + 0.02, cx), yy, 0), (0.1, 0.62, 0.14))
        M.prim('cube', 'window', (cx, yy, -TW - 0.02), (0.14, 0.62, 0.1))
    # кронштейн стяга: две скобы из стены и перекладина перед гранью
    for dx in (-0.36, 0.36):
        M.prim('cube', 'iron', (cx + dx, BAN_Y, TW + 0.16), (0.05, 0.05, 0.34))
    M.prim('cyl', 'iron', (cx, BAN_Y, BAN_Z), r1=0.035, r2=0.035, depth=1.1, seg=8, rot=(0, 0, math.pi / 2))
    for dx in (-0.56, 0.56):
        M.prim('ico', 'gold', (cx + dx, BAN_Y, BAN_Z), (0.06, 0.06, 0.06), sub=1)
    # под башней — скала
    M.rock(cx, BASE - 0.35, rand(-0.1, 0.1), TW * 1.3, 1.7, TW * 1.3)


def arch(M):
    """пологая арка: клинчатые камни по дуге от пяты до пяты (на всю толщину, вперевязку — снизу ровный свод),
    замковый камень крупнее, на нём — золотая корона; над аркой — невысокая стенка под плитами покрытия"""
    r_out = R_IN + RING
    nv = 23
    rows = 2
    span = math.pi - 2 * A0
    for j in range(rows):
        z0 = -WALL_D / 2 + j * WALL_D / rows
        bounds = list(range(nv + 1)) if j % 2 == 0 else [0] + [i + 0.5 for i in range(nv)] + [nv]
        for i in range(len(bounds) - 1):
            a0, a1 = A0 + span * bounds[i] / nv, A0 + span * bounds[i + 1] / nv
            am, rm = (a0 + a1) / 2, (R_IN + r_out) / 2
            key = abs(am - math.pi / 2) < 0.04
            dr = RING * (1.25 if key else 1.0)
            dz = 0.08 if j == 0 else -0.08  # кольцо чуть выступает из стенки с обеих сторон — арку видно
            r = rm + (dr - RING) / 2
            M.block((math.cos(am) * r, YC + math.sin(am) * r, z0 + WALL_D / rows / 2 - dz / 2),
                    (dr - GAP, (a1 - a0) * rm - GAP, WALL_D / rows + 0.08 - GAP), (0, 0, am))
    # стенка над аркой: ряды кладки с вырезом по кольцу, обе стороны и сердцевина
    ch = 0.3
    y = SPRING
    while y < TOP - 0.01:
        h = min(ch, TOP - y)
        dy = y + h - YC  # по верху ряда: камни заходят на кольцо — без щелей
        half = max(0.0, math.sqrt(r_out * r_out - dy * dy) - 0.12) if dy < r_out else 0.0
        cuts = [(-half, half)] if half > 0 else []
        for z, o in ((WALL_D / 2 - 0.14, (0, 0, 1)), (-WALL_D / 2 + 0.14, (0, 0, -1))):
            M.course(-HALF - 0.05, HALF + 0.05, y, h, z, 0.28, 0.55, cuts=cuts, out=o)
        y += h
    for s in (-1, 1):  # сердцевина пазух (между кольцом и башнями): ступенями по кольцу
        for k in range(5):
            yy = SPRING + 0.15 + k * (TOP - SPRING - 0.15) / 5
            dx = math.sqrt(max(0.0, r_out ** 2 - (yy - YC) ** 2))
            x0, x1 = dx - 0.1, HALF + 0.05
            if x1 - x0 > 0.1:
                M.block((s * (x0 + x1) / 2, yy + (TOP - SPRING - 0.15) / 10, 0), (x1 - x0, (TOP - SPRING - 0.15) / 5 + 0.02, WALL_D - 0.3), tint=MORTAR)
    M.block((0, (YC + r_out + TOP) / 2, 0), (2 * HALF, TOP - YC - r_out + 0.1, WALL_D - 0.3), tint=MORTAR)
    # покрытие: плиты на всю толщину стенки с напуском — сверху камера видит ровный верх, без зубцов (она идёт над ним)
    n = 11
    for i in range(n):
        x0 = -HALF - 0.05 + i * 2 * (HALF + 0.05) / n
        M.block((x0 + (HALF + 0.05) / n, TOP + 0.08, rand(-0.01, 0.01)), (2 * (HALF + 0.05) / n - 0.04, 0.16, WALL_D + 0.14))
    # на замковом камне — золотая корона на щитке
    M.prim('cube', 'gold', (0, YC + R_IN + 0.27, WALL_D / 2 + 0.11), (0.34, 0.26, 0.06))
    for dx in (-0.11, 0, 0.11):
        M.prim('cyl', 'gold', (dx, YC + R_IN + 0.47 + (0.03 if dx == 0 else 0), WALL_D / 2 + 0.12), r1=0.055, r2=0.0, depth=0.16, seg=4)


mats = materials(crevice_glow=False)
random.seed(81)
M = Mason(soft=True)
for s in (-1, 1):
    tower(M, s * TX)
arch(M)
high = build_high(M, 'gate_arch', (0, 0, 0), mats, bevel=0.035, segments=2)
banners = [[s * TX, BAN_Y - 0.06, BAN_Z] for s in (-1, 1)]
low = build_low(high, 'gate_arch', (0, 0, 0), 7000, VOXEL, {'banners': banners, 'crown': [0, SPRING + RISE, 0]}, smooth=2)
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)
unwrap([low], [1.0])
color, normal, emit = bake_atlas([high], [low], WORK, 2048, 2048, 512, ao=0.6)
bsdf = export([low], color, normal, emit, OUT, 'GateBaked')

if PREVIEW:
    high.hide_render = True
    bsdf.inputs['Emission Strength'].default_value = 0.0
    preview(PREVIEW, (2.5, 4.2, 12), (0, 2.8, 0), size=(900, 900))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'gates.blend'))

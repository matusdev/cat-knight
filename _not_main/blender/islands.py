# Боковые острова «Кот-рыцаря» — семь видов, в том же камне, что и мост (stonework.py).
# Основа у всех одна: дёрн, земля, обрыв из крупной кладки, под ним парящая скала. Сверху — руины, мельница,
# пруд с водопадом, деревня, большое дерево, кристаллы или башня мага. Окна и кристаллы запекаются в «свечение»:
# ночью игра их зажигает. Всё, что движется (крылья мельницы, вода водопада, стяг), остаётся в игре — а здесь в extras
# пишутся точки, куда это крепить (оси игры). Результат — public/models/islands.glb.
#
# Запуск из корня проекта (около 3 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/islands.py -- public/models/islands.glb <папка для промежуточных картинок> [превью.png]
#
# Верх дёрна — y = 0. Куски в модели: isl_ruins, isl_windmill, isl_waterfall, isl_village, isl_tree, isl_crystal, isl_tower.
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

VOXEL = 0.045       # острова видны издали — сплавляем грубее, чем мост
ISLANDS = [  # вид, ширина, глубина, треугольников в простой модели, где стоит при запекании
    dict(theme='ruins', w=7.0, d=5.5, seed=101, tris=4500, at=(0, 0, 0)),
    dict(theme='windmill', w=6.0, d=5.0, seed=102, tris=4500, at=(14, 0, 0)),
    dict(theme='waterfall', w=6.5, d=5.5, seed=103, tris=4500, at=(28, 0, 0)),
    dict(theme='village', w=7.5, d=6.0, seed=104, tris=5000, at=(42, 0, 0)),
    dict(theme='tree', w=5.5, d=5.0, seed=105, tris=4000, at=(56, 0, 0)),
    dict(theme='crystal', w=6.0, d=5.0, seed=106, tris=4000, at=(70, 0, 0)),
    dict(theme='tower', w=5.5, d=5.0, seed=107, tris=4500, at=(84, 0, 0)),
    dict(theme='mini_pine', w=1.4, d=1.3, seed=108, tris=700, at=(96, 0, 0)),     # камешки у самой дороги
    dict(theme='mini_flower', w=1.2, d=1.1, seed=109, tris=600, at=(102, 0, 0)),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rand = random.uniform


def base(M, W, D, ground='grass'):
    """дёрн с неровной кромкой (верх — y = 0), земля, два ряда крупной кладки обрывом и парящая скала"""
    M.prim('cube', ground, (0, -0.09, 0), (W - 0.15, 0.18, D - 0.15))
    for i in range(int((W + D) * 1.6)):  # кочки по краю — кромка дёрна неровная
        side, t = random.randrange(4), rand(-0.5, 0.5)
        x, z = (t * (W - 0.3), (D / 2 - 0.12) * (1 if side == 0 else -1)) if side < 2 else ((W / 2 - 0.12) * (1 if side == 2 else -1), t * (D - 0.3))
        M.prim('ico', ground, (x, -0.04, z), (rand(0.35, 0.6), rand(0.12, 0.2), rand(0.3, 0.5)), sub=1, jit=0.25)
    M.prim('cube', 'soil', (0, -0.33, 0), (W - 0.1, 0.3, D - 0.1))
    y = -0.4
    for shrink, h in ((1.0, 0.5), (0.86, 0.45)):
        w, d = W * shrink, D * shrink
        y0 = y - h
        for z, o in ((d / 2 - 0.2, (0, 0, 1)), (-d / 2 + 0.2, (0, 0, -1))):
            M.course(-w / 2, w / 2, y0, h, z, 0.4, 0.9, out=o, missing=0.08)
        for x, o in ((w / 2 - 0.2, (1, 0, 0)), (-w / 2 + 0.2, (-1, 0, 0))):
            M.course(-d / 2 + 0.41, d / 2 - 0.41, y0, h, x, 0.4, 0.9, axis='z', out=o, missing=0.08)
        M.block((0, y0 + h / 2, 0), (w - 0.2, h + 0.02, d - 0.2), tint=MORTAR)
        y = y0
    M.rock(rand(-0.3, 0.3), y - 0.6, rand(-0.3, 0.3), W * 0.44, 2.2, D * 0.42)


def pine(M, x, z, h):
    M.prim('cyl', 'bark', (x, 0.15 * h, z), r1=0.06 * h, r2=0.05 * h, depth=0.35 * h, seg=7)
    for r, hh, y in ((0.32, 0.5, 0.25), (0.26, 0.45, 0.48), (0.18, 0.4, 0.7)):
        M.prim('cyl', 'pine', (x, (y + hh / 2) * h, z), r1=r * h, r2=0.02, depth=hh * h, seg=8)


def tree(M, x, z, s):
    M.prim('cyl', 'bark', (x, 0.6 * s, z), r1=0.2 * s, r2=0.12 * s, depth=1.3 * s, seg=8)  # низ утоплен в дёрн — иначе при сплавлении не срастётся
    for cx, cy, cz, cr in ((0, 1.6, 0, 0.7), (0.45, 1.35, 0.15, 0.5), (-0.42, 1.4, -0.1, 0.52), (0.1, 1.35, -0.42, 0.48), (-0.1, 2.05, 0.1, 0.45)):
        M.prim('ico', 'leaves', (x + cx * s, cy * s, z + cz * s), (cr * s, cr * s * 0.85, cr * s), sub=2, jit=0.18)


def house(M, x, z, s):
    """фахверковый домик: каменный цоколь, тёмные балки, черепичная крыша, труба; окно горит ночью"""
    M.prim('cube', 'stone', (x, 0.07 * s, z), (1.2 * s, 0.24 * s, 1.0 * s))
    M.prim('cube', 'plaster', (x, 0.55 * s, z), (1.1 * s, 0.8 * s, 0.9 * s))
    for yy in (0.24, 0.92):
        M.prim('cube', 'wood', (x, yy * s, z), (1.14 * s, 0.07 * s, 0.94 * s))
    for xx in (-0.52, 0.52):
        M.prim('cube', 'wood', (x + xx * s, 0.58 * s, z), (0.08 * s, 0.7 * s, 0.94 * s))
    M.prim('cube', 'plaster', (x, 1.07 * s, z), (1.06 * s, 0.32 * s, 0.5 * s))
    for k in (-1, 1):
        M.prim('cube', 'roof_red', (x, 1.12 * s, z + k * 0.24 * s), (1.3 * s, 0.12 * s, 0.66 * s), (k * 0.7, 0, 0))
    M.prim('cube', 'window', (x - 0.25 * s, 0.58 * s, z + 0.46 * s), (0.24 * s, 0.28 * s, 0.08 * s))
    M.prim('cube', 'wood', (x + 0.22 * s, 0.33 * s, z + 0.46 * s), (0.22 * s, 0.42 * s, 0.08 * s))
    M.prim('cube', 'stone', (x + 0.3 * s, 1.35 * s, z - 0.15 * s), (0.18 * s, 0.5 * s, 0.18 * s))


def ruins(M, W, D, props):
    for k in range(6):  # стена крошится кверху
        M.course(-W / 2 + 0.6, W * 0.1, k * 0.32 - 0.05, 0.32, -D / 2 + 0.8, 0.45, 0.55, out=(0, 0, 1), missing=min(0.85, 0.05 + 0.17 * k))
    for k in range(4):
        M.course(-D / 2 + 1.03, -D / 2 + 2.4, k * 0.32 - 0.05, 0.32, -W / 2 + 0.8, 0.45, 0.55, axis='z', missing=0.05 + 0.2 * k)
    M.tower(W * 0.25, -D * 0.1, 0.95, -0.05, 7, h=0.34, crenel=True, missing_top=0.25)
    for i in range(6):  # обломки на траве
        M.block((rand(-W / 2 + 0.8, W / 2 - 0.8), 0.08, rand(-D / 4, D / 2 - 0.6)), (rand(0.25, 0.4), rand(0.2, 0.3), rand(0.25, 0.4)), (rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3)))
    px, pz = -W * 0.3, D * 0.15
    M.prim('cyl', 'wood', (px, 1.65, pz), r1=0.08, r2=0.07, depth=3.4, seg=8)
    M.prim('cube', 'wood', (px + 0.55, 3.3, pz), (1.2, 0.1, 0.1))
    props['flag'] = [px + 0.6, 3.26, pz]


def windmill(M, W, D, props):
    for k in range(2):
        M.ring(0, -0.3, 1.12, k * 0.3 - 0.05, 0.3, 14, phase=0.5 * k)
    M.prim('cyl', 'plaster', (0, 1.55, -0.3), r1=1.05, r2=0.75, depth=3.2, seg=16)
    M.prim('cyl', 'wood', (0, 3.15, -0.3), r1=0.82, r2=0.82, depth=0.12, seg=16)
    M.prim('cyl', 'roof_red', (0, 3.85, -0.3), r1=1.0, r2=0.02, depth=1.3, seg=16)
    M.prim('cube', 'wood', (0, 0.42, 0.72), (0.5, 0.84, 0.14))
    M.prim('cube', 'window', (0, 2.2, 0.56), (0.32, 0.36, 0.12))
    pine(M, W * 0.32, D * 0.2, 1.8)
    tree(M, -W * 0.3, D * 0.15, 0.8)
    props['hub'] = [0, 3.0, 0.62]


def waterfall(M, W, D, props):
    pz = D * 0.18
    M.prim('cyl', 'water', (0, -0.03, pz), r1=1.3, r2=1.3, depth=0.1, seg=20)
    for i in range(8):
        a = i / 8 * math.pi * 2 + rand(-0.2, 0.2)
        M.prim('ico', 'rock', (math.cos(a) * 1.45, 0.05, pz + math.sin(a) * 1.45), (rand(0.2, 0.32),) * 3, sub=1, jit=0.25)
    z0 = pz + 1.2
    M.prim('cube', 'water', (0, -0.03, (z0 + D / 2 + 0.1) / 2), (0.7, 0.1, D / 2 + 0.1 - z0))
    pine(M, -W * 0.32, -D * 0.25, 2.2)
    pine(M, W * 0.3, -D * 0.3, 1.6)
    tree(M, W * 0.3, D * 0.05, 0.7)
    props['fall'] = [0, -3.1, D / 2 + 0.14]
    props['spray'] = [0, -6.3, D / 2 + 0.3]


def village(M, W, D, props):
    house(M, -W * 0.22, -D * 0.1, 1.0)
    house(M, W * 0.24, -D * 0.18, 0.8)
    house(M, W * 0.05, D * 0.25, 0.7)
    M.course(-W * 0.45, W * 0.12, -0.05, 0.32, D * 0.42, 0.28, 0.4, out=(0, 0, 1), missing=0.15)  # низкая каменная ограда
    tree(M, -W * 0.38, D * 0.3, 0.7)


def big_tree(M, W, D, props):
    tree(M, 0, 0, 2.1)
    for i in range(14):
        M.prim('ico', 'flower', (rand(-W / 2 + 0.5, W / 2 - 0.5), -0.02, rand(-D / 2 + 0.5, D / 2 - 0.5)), (0.11,) * 3, sub=1)


def crystal(M, W, D, props):
    M.prim('gem', 'crystal', (0, 0.6, 0), (0.75, 2.4, 0.75), (rand(-0.15, 0.15), rand(0, 3), rand(-0.15, 0.15)))
    for i in range(6):
        sy = rand(0.8, 1.6)
        M.prim('gem', 'crystal', (rand(-W / 2 + 0.8, W / 2 - 0.8), 0.25 * sy, rand(-D / 2 + 0.7, D / 2 - 0.7)), (rand(0.25, 0.4), sy, rand(0.25, 0.4)), (rand(-0.35, 0.35), rand(0, 3), rand(-0.35, 0.35)))
    for i in range(4):
        M.prim('ico', 'rock', (rand(-W / 2 + 0.6, W / 2 - 0.6), 0.1, rand(-D / 2 + 0.6, D / 2 - 0.6)), (rand(0.3, 0.5), rand(0.25, 0.4), rand(0.3, 0.5)), sub=1, jit=0.25)


def wizard_tower(M, W, D, props):
    top = M.tower(0, -0.2, 0.8, -0.05, 12, h=0.36, crenel=False)
    M.ring(0, -0.2, 0.92, top - 0.05, 0.22, 12, depth=0.34)
    M.prim('cyl', 'roof_blue', (0, top + 0.17 + 1.3, -0.2), r1=1.08, r2=0.02, depth=2.6, seg=16)
    M.prim('ico', 'gold', (0, top + 0.17 + 2.7, -0.2), (0.16,) * 3, sub=1)
    for i in range(3):
        M.prim('cube', 'window', (0, 1.2 + i * 1.3, 0.78), (0.26, 0.44, 0.14))
    M.prim('cube', 'wood', (0, 0.42, 0.8), (0.5, 0.84, 0.14))
    pine(M, W * 0.3, D * 0.2, 1.6)


def mini(M, W, D):
    """парящий камешек: дёрн с кочками и скала — без кладки (рядом с дорогой он маленький)"""
    M.prim('ico', 'grass', (0, -0.08, 0), (W / 2, 0.16, D / 2), sub=2, jit=0.12)
    M.rock(rand(-0.05, 0.05), -0.25, rand(-0.05, 0.05), W * 0.46, 1.1, D * 0.44)


def mini_pine(M, W, D, props):
    mini(M, W, D)
    pine(M, 0, 0, 1.3)


def mini_flower(M, W, D, props):
    mini(M, W, D)
    for i in range(4):
        M.prim('ico', 'flower', (rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3)), (0.12,) * 3, sub=1)
    M.prim('ico', 'leaves', (0.25, 0.1, -0.2), (0.28, 0.2, 0.26), sub=2, jit=0.2)


BUILD = {'ruins': ruins, 'windmill': windmill, 'waterfall': waterfall, 'village': village, 'tree': big_tree, 'crystal': crystal, 'tower': wizard_tower,
         'mini_pine': mini_pine, 'mini_flower': mini_flower}

mats = materials()
highs, lows, props = [], [], []
for p in ISLANDS:
    random.seed(p['seed'])
    M = Mason(soft=True)  # мягкая кладка, как у моста: камни-подушки без острых углов
    if not p['theme'].startswith('mini'):
        base(M, p['w'], p['d'], 'rock' if p['theme'] == 'crystal' else 'grass')
    pr = {'w': p['w'], 'd': p['d']}
    BUILD[p['theme']](M, p['w'], p['d'], pr)
    highs.append(build_high(M, 'isl_' + p['theme'], p['at'], mats, bevel=0.05, segments=3))
    props.append(pr)
for h, p, pr in zip(highs, ISLANDS, props):
    lows.append(build_low(h, 'isl_' + p['theme'], p['at'], p['tris'], VOXEL, pr, smooth=2))

for lo in lows:
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)

unwrap(lows, [1.0] * len(lows))
color, normal, emit = bake_atlas(highs, lows, WORK, 2048, 1024, 512, ao=0.55)  # швы мягче — без чёрных щелей
bsdf = export(lows, color, normal, emit, OUT, 'IslandStone')

# превью: все в ряд, вид спереди-сверху; окна и кристаллы светятся вполсилы
if PREVIEW:
    bsdf.inputs['Emission Strength'].default_value = 0.4
    for h in highs:
        h.hide_render = True
    for i, lo in enumerate(lows):
        lo.location = g2b(((i - 4) * 8.5, 0, 0))
    preview(PREVIEW, (0, 12, 40), (0, -1.5, 0), (2000, 700))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'islands.blend'))

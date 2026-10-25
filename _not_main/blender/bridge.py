# Острова дороги «Кот-рыцаря» — каменные обломки моста двух видов вперемешку (как на референсе):
#   A — арка на опорах, снизу скальные обломки;  B — глыба: крупные плиты, ступени кладки, парящая скала.
# Детальная кладка запекается на простую модель с рваным силуэтом (stonework.py): цвет с затенением и сколами,
# рельеф и маска швов — по ней светится лава на огненных островах. Результат — public/models/bridge.glb.
#
# Запуск из корня проекта (около 2 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/bridge.py -- public/models/bridge.glb <папка для промежуточных картинок> [превью.png]
#
# Верх плит — y = 0, площадка — ровно w × d: на неё приземляется кот. Куски в модели:
#   seg_a1, seg_a2, seg_b1, seg_b2 — острова 2.0 × 2.4 (игра берёт любой; номинальный размер — в extras w, d)
#   deck  — только плиты (летающие острова — под ними кристалл-левитатор)
#   plaza — стартовая площадка 6.8 × 3.4 с тремя арками
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, GAP, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

VOXEL = 0.03
PIECES = [  # имя, вид, ширина, глубина, параметры, треугольников в простой модели, вес в атласе, где стоит при запекании
    dict(name='seg_a1', kind='arch', w=2.0, d=2.4, arches=1, r_in=0.45, piers=3, seed=21, tris=2300, uv=1.0, at=(0, 0, 0)),
    dict(name='seg_a2', kind='arch', w=2.0, d=2.4, arches=1, r_in=0.4, piers=2, seed=22, tris=2300, uv=1.0, at=(8, 0, 0)),
    dict(name='seg_b1', kind='block', w=2.0, d=2.4, seed=31, tris=2100, uv=1.0, at=(16, 0, 0)),
    dict(name='seg_b2', kind='block', w=2.0, d=2.4, seed=32, tris=2100, uv=1.0, at=(24, 0, 0)),
    dict(name='deck', kind='deck', w=2.0, d=2.4, seed=41, tris=500, uv=0.8, at=(32, 0, 0)),
    dict(name='plaza', kind='arch', w=6.8, d=3.4, arches=3, r_in=0.5, piers=3, seed=51, tris=4000, uv=0.6, at=(44, 0, 0)),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def deck(M, W, D, slab_len, fascia, f_len, missing):
    """плиты сверху (сплошные, верх — y = 0) и облицовка под ними по четырём сторонам; возвращает низ облицовки"""
    rows = max(3, round(D / 0.8))
    for r in range(rows):
        z = -D / 2 + (r + 0.5) * D / rows
        M.course(-W / 2, W / 2, -0.15 + GAP / 2, 0.15, z, D / rows - GAP, slab_len, jitter=0.006)
    y = -0.15
    for h in fascia:
        y0 = y - h
        for z, o in ((D / 2 - 0.14, (0, 0, 1)), (-D / 2 + 0.14, (0, 0, -1))):
            M.course(-W / 2 + 0.01, W / 2 - 0.01, y0, h, z, 0.28, f_len, out=o, missing=missing)
        for x, o in ((W / 2 - 0.14, (1, 0, 0)), (-W / 2 + 0.14, (-1, 0, 0))):
            M.course(-D / 2 + 0.29, D / 2 - 0.29, y0, h, x, 0.28, f_len, axis='z', out=o, missing=missing)
        y = y0
    M.block((0, (-0.15 + y) / 2, 0), (W - 0.1, -0.15 - y, D - 0.1), tint=MORTAR)
    return y


def arch_piece(M, p):
    """A: пролёты арок поперёк дороги (видны с камеры), опоры сужаются книзу и стоят на скальных обломках"""
    W, D, n, r_in = p['w'], p['d'], p['arches'], p['r_in']
    bottom = deck(M, W, D, 0.8, [0.26], 0.55, 0.06)
    r_out = r_in + 0.2
    spring = bottom - r_out - 0.02
    pw = (W - n * 2 * r_in) / (n + 1)
    piers = [(-W / 2 + i * (pw + 2 * r_in), -W / 2 + i * (pw + 2 * r_in) + pw) for i in range(n + 1)]
    centers = [b + r_in for a, b in piers[:-1]]
    m = max(1, round((bottom - spring) / 0.26))
    h = (bottom - spring) / m
    for k in range(m):  # стенка над арками; в проёмах камни вырезаны по окружности
        y0 = bottom - (k + 1) * h
        dy = max(0.0, y0 - spring)
        half = math.sqrt(max(0.0, r_out * r_out - dy * dy))
        cuts = [(c - half, c + half) for c in centers]
        for z, o in ((D / 2 - 0.14, (0, 0, 1)), (-D / 2 + 0.14, (0, 0, -1))):
            M.course(-W / 2 + 0.01, W / 2 - 0.01, y0, h, z, 0.28, 0.5, cuts=cuts, out=o)
        for x, o in ((W / 2 - 0.14, (1, 0, 0)), (-W / 2 + 0.14, (-1, 0, 0))):
            M.course(-D / 2 + 0.29, D / 2 - 0.29, y0, h, x, 0.28, 0.55, axis='z', out=o)
    nv = max(7, round(math.pi * (r_in + 0.1) / 0.17))
    for c in centers:
        for z in (D / 2 - 0.14, -D / 2 + 0.14):  # клинчатые камни по лицу арки
            for i in range(nv):
                a0, a1 = math.pi * i / nv, math.pi * (i + 1) / nv
                am, rm = (a0 + a1) / 2, (r_in + r_out) / 2
                M.block((c + math.cos(am) * rm, spring + math.sin(am) * rm, z), (r_out - r_in - GAP, (a1 - a0) * rm - GAP, 0.3), (0, 0, am))
        rings = max(2, round((D - 0.56) / 0.45))
        dz = (D - 0.56) / rings
        for j in range(rings):  # свод — кольца вперевязку
            z0 = -D / 2 + 0.28 + j * dz
            bounds = list(range(nv + 1)) if j % 2 == 0 else [0] + [i + 0.5 for i in range(nv)] + [nv]
            for i in range(len(bounds) - 1):
                a0, a1 = math.pi * bounds[i] / nv, math.pi * bounds[i + 1] / nv
                am, rv = (a0 + a1) / 2, r_in + 0.07
                M.block((c + math.cos(am) * rv, spring + math.sin(am) * rv, z0 + dz / 2), (0.14, (a1 - a0) * rv - GAP, dz - GAP), (0, 0, am))
    low = spring - p['piers'] * 0.24
    for a, b in piers:  # опоры сужаются книзу, под каждой — скальный обломок (заходит в опору, чтобы сплавиться с ней)
        pc = (a + b) / 2
        for k in range(p['piers']):
            y0 = spring - (k + 1) * 0.24
            w = (b - a) * (1 - 0.08 * k)
            for z, o in ((D / 2 - 0.14, (0, 0, 1)), (-D / 2 + 0.14, (0, 0, -1))):
                M.course(pc - w / 2, pc + w / 2, y0, 0.24, z, 0.28, 0.4, out=o)
            for x, o in ((pc + w / 2 - 0.14, (1, 0, 0)), (pc - w / 2 + 0.14, (-1, 0, 0))):
                M.course(-D / 2 + 0.29, D / 2 - 0.29, y0, 0.24, x, 0.28, 0.5, axis='z', out=o)
        M.block((pc, (bottom + low) / 2, 0), ((b - a) * 0.7, bottom - low, D - 0.1), tint=MORTAR)
        M.rock(pc, low - 0.12, random.uniform(-0.15, 0.15), (b - a) * 0.55, 0.7, D * 0.42)


def block_piece(M, p):
    """B: крупные плиты, ступени кладки уже книзу, под ними парящая скала"""
    W, D = p['w'], p['d']
    y = deck(M, W, D, 0.95, [0.3, 0.28], 0.65, 0.08)
    for shrink, h in ((0.82, 0.28), (0.62, 0.26)):
        w, d = W * shrink, D * shrink
        y0 = y - h
        for z, o in ((d / 2 - 0.14, (0, 0, 1)), (-d / 2 + 0.14, (0, 0, -1))):
            M.course(-w / 2, w / 2, y0, h, z, 0.28, 0.6, out=o, missing=0.05)
        for x, o in ((w / 2 - 0.14, (1, 0, 0)), (-w / 2 + 0.14, (-1, 0, 0))):
            M.course(-d / 2 + 0.29, d / 2 - 0.29, y0, h, x, 0.28, 0.6, axis='z', out=o, missing=0.05)
        M.block((0, y0 + h / 2, 0), (w - 0.1, h + 0.02, d - 0.1), tint=MORTAR)
        y = y0
    M.rock(random.uniform(-0.15, 0.15), y - 0.3, random.uniform(-0.15, 0.15), W * 0.42, 1.0, D * 0.36)


mats = materials(crevice_glow=True)
highs, lows = [], []
for p in PIECES:
    random.seed(p['seed'])
    M = Mason(soft=True)  # мягкая кладка: камни-подушки без острых углов
    if p['kind'] == 'arch':
        arch_piece(M, p)
    elif p['kind'] == 'block':
        block_piece(M, p)
    else:
        deck(M, p['w'], p['d'], 0.85, [0.26], 0.55, 0.05)
    highs.append(build_high(M, p['name'], p['at'], mats, bevel=0.06, segments=3))
for h, p in zip(highs, PIECES):
    lows.append(build_low(h, p['name'], p['at'], p['tris'], VOXEL, {'w': p['w'], 'd': p['d']}, smooth=3))

for lo in lows:  # плавные нормали на камне, острые рёбра — где излом больше 50°
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)

unwrap(lows, [p['uv'] for p in PIECES])
color, normal, emit = bake_atlas(highs, lows, WORK, 2048, 2048, 1024, ao=0.55)  # швы мягче — без чёрных щелей
bsdf = export(lows, color, normal, emit, OUT, 'BridgeStone')

# превью: простые модели вперемешку, как в игре; свечение маски выключено — оно только для лавы
if PREVIEW:
    bsdf.inputs['Emission Strength'].default_value = 0.0
    for h in highs:
        h.hide_render = True
    segs = [lo for lo in lows if lo.name.startswith('seg')]
    for lo in lows:
        lo.hide_render = True
    lows[-1].hide_render = False
    lows[-1].location = g2b((0, 0, 1.0))
    layout = [(-2.2, 0.5, -6.5), (0, 0.5, -6.5), (2.2, 0.5, -6.5), (-2.2, 1.0, -13), (2.2, 1.0, -13), (0, 1.5, -19.5), (2.2, 1.5, -19.5), (-2.2, 2.0, -26), (0, 2.0, -26)]
    for i, at in enumerate(layout):
        o = segs[i % len(segs)].copy()
        o.hide_render = False
        o.location = g2b(at)
        o.rotation_euler = (0, 0, math.pi if i % 3 == 1 else 0)
        scene.collection.objects.link(o)
    preview(PREVIEW, (0, 7.0, 9.8), (0, 0.4, -11))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'bridge.blend'))

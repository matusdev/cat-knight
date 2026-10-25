# Витрина «Кот-рыцаря» (заставка-меню и лавка): круглый парящий островок с постаментом и реквизит вокруг —
# в том же камне, что мост и острова (stonework.py). Верх постамента (плиты с лапкой и золотой обод), знамёна, шатёр
# лавки и струя водопада остаются в игре: ткань развевается, вода течёт. Здесь в extras пишутся точки, куда их крепить.
# Результат — public/models/showroom.glb.
#
# Запуск из корня проекта (около 2 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/showroom.py -- public/models/showroom.glb <папка для промежуточных картинок> [превью.png]
#
# Куски: show_base (островок с постаментом; верх дёрна — y = 0, верх нижней ступени — 0.3, стенка верхней — до 0.52),
# show_crate (ящик), show_barrel (бочка), show_chest (сундук), show_lantern (фонарь со свечением).
# Камера в игре — со стороны −z (спереди), ручей с водопадом — спереди слева.
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
rand = random.uniform
R_ISLE = 2.45       # радиус дёрна
STREAM = math.radians(-125)  # направление ручья: спереди слева (камера со стороны −z)


def polar(r, a, y=0.0):
    return (math.cos(a) * r, y, math.sin(a) * r)


def base(M, props):
    """островок: дёрн с кочками по кромке, земля, два кольца крупной кладки обрывом, скала; постамент в две ступени"""
    M.prim('cyl', 'grass', (0, -0.09, 0), r1=R_ISLE, r2=R_ISLE - 0.05, depth=0.18, seg=48)
    for i in range(80):  # кочки по кромке — край дёрна неровный, местами свисает
        a = i / 80 * math.pi * 2 + rand(-0.03, 0.03)
        if abs(math.atan2(math.sin(a - STREAM), math.cos(a - STREAM))) < 0.16:
            continue  # у русла ручья кочек нет
        M.prim('ico', 'grass', polar(R_ISLE - rand(0.02, 0.12), a, rand(-0.06, -0.02)), (rand(0.2, 0.3), rand(0.1, 0.16), rand(0.2, 0.3)), sub=2, jit=0.2)
        if random.random() < 0.3:  # мох и трава свисают с кромки на кладку
            M.prim('ico', 'leaves', polar(R_ISLE - 0.02, a + rand(-0.05, 0.05), rand(-0.45, -0.25)), (rand(0.12, 0.2), rand(0.25, 0.4), rand(0.12, 0.2)), sub=2, jit=0.25)
    M.prim('cyl', 'soil', (0, -0.33, 0), r1=R_ISLE - 0.05, r2=R_ISLE - 0.08, depth=0.3, seg=40)
    y = -0.42
    for r, h in ((R_ISLE - 0.22, 0.5), (R_ISLE - 0.55, 0.45)):
        M.ring(0, 0, r, y - h, h, max(14, round(2 * math.pi * r / 0.75)), depth=0.42, missing=0.04, phase=rand(0, 1))
        M.prim('cyl', 'stone', (0, y - h / 2, 0), r1=r - 0.15, r2=r - 0.15, depth=h, seg=24, tint=MORTAR)
        y -= h
    M.rock(0, y - 0.55, 0, R_ISLE * 0.8, 2.3, R_ISLE * 0.78, sub=4)

    # постамент: нижняя ступень — кольцо кладки, по верху — плиты-клинья; верхняя — кольцо пониже (верх рисует игра)
    M.ring(0, 0, 1.2, 0.0, 0.28, 18, depth=0.24, phase=0.3)
    M.prim('cyl', 'stone', (0, 0.14, 0), r1=1.08, r2=1.08, depth=0.28, seg=24, tint=MORTAR)
    for i in range(20):
        a = (i + 0.5) / 20 * math.pi * 2
        M.block(polar(1.14, a, 0.3), (0.34, 0.05, 2 * math.pi * 1.14 / 20 - 0.03), (rand(-0.02, 0.02), -a, rand(-0.02, 0.02)))
    M.ring(0, 0, 0.92, 0.3, 0.22, 16, depth=0.16, phase=0.15)
    M.prim('cyl', 'stone', (0, 0.41, 0), r1=0.86, r2=0.86, depth=0.22, seg=24, tint=MORTAR)

    # ручей: от постамента к кромке, по краям камешки; у кромки — водопад (струю рисует игра)
    for k in range(9):
        t = k / 8
        r = 1.45 + t * (R_ISLE - 1.45)
        M.prim('cube', 'water', polar(r, STREAM, -0.035), (0.34, 0.06, 0.5), (0, -STREAM, 0))
        for s in (-1, 1):
            if random.random() < 0.85:
                p = polar(r, STREAM + s * 0.2 / max(r, 1), 0.02)
                M.prim('ico', 'rock', p, (rand(0.08, 0.14), rand(0.06, 0.1), rand(0.08, 0.14)), sub=1, jit=0.25)
    M.prim('cyl', 'water', polar(1.6, STREAM, -0.03), r1=0.42, r2=0.42, depth=0.06, seg=16)  # заводь у постамента
    edge = polar(R_ISLE + 0.12, STREAM)
    props['fall'] = [edge[0], -3.3, edge[2]]
    props['spray'] = [edge[0], -6.4, edge[2]]

    # кусты, цветы и валуны вокруг постамента — сзади и по бокам гуще, спереди (к камере) реже
    for i in range(30):
        a = rand(0, math.pi * 2)
        front = math.sin(a) < -0.55
        if front and random.random() < 0.7 or abs(math.atan2(math.sin(a - STREAM), math.cos(a - STREAM))) < 0.3:
            continue
        r = rand(1.55, R_ISLE - 0.35)
        c = polar(r, a, 0.08)
        for j in range(3):
            M.prim('ico', 'leaves', (c[0] + rand(-0.12, 0.12), rand(0.08, 0.2), c[2] + rand(-0.12, 0.12)), (rand(0.16, 0.26), rand(0.13, 0.2), rand(0.16, 0.26)), sub=2, jit=0.2)
    spots = [(rand(0, math.pi * 2), rand(1.45, R_ISLE - 0.25)) for i in range(12)]
    for i in range(70):
        sa, sr = random.choice(spots)  # цветы растут кучками
        a, r = sa + rand(-0.22, 0.22), min(R_ISLE - 0.12, max(1.38, sr + rand(-0.25, 0.25)))
        if abs(math.atan2(math.sin(a - STREAM), math.cos(a - STREAM))) < 0.22:
            continue
        c = polar(r, a, 0.03)
        M.prim('cyl', 'leaves', (c[0], 0.02, c[2]), r1=0.012, r2=0.012, depth=0.12, seg=4)
        petal = 'petal' if random.random() < 0.55 else 'flower'
        for k in range(5):  # пять лепестков вокруг жёлтой серединки
            pa = k / 5 * math.pi * 2
            M.prim('ico', petal, (c[0] + math.cos(pa) * 0.045, 0.085, c[2] + math.sin(pa) * 0.045), (0.04, 0.012, 0.03), (0, -pa, 0), sub=1)
        M.prim('ico', 'gold', (c[0], 0.09, c[2]), (0.025, 0.018, 0.025), sub=1)
    for i in range(5):
        a = rand(0, math.pi * 2)
        if math.sin(a) < -0.5:
            continue
        M.prim('ico', 'rock', polar(rand(1.7, R_ISLE - 0.3), a, 0.08), (rand(0.18, 0.3), rand(0.14, 0.22), rand(0.18, 0.3)), sub=2, jit=0.22)
        M.prim('ico', 'grass', polar(rand(1.7, R_ISLE - 0.3), a + 0.1, 0.02), (0.2, 0.06, 0.2), sub=1, jit=0.3)


def crate(M, props):
    """ящик 0.56 м: доски по бокам, рамка из брусьев по рёбрам"""
    s = 0.56
    M.prim('cube', 'wood', (0, s / 2, 0), (s - 0.04, s - 0.04, s - 0.04))
    for k in range(3):  # доски — с зазорами
        y = 0.1 + k * 0.18
        for z in (-s / 2 + 0.005, s / 2 - 0.005):
            M.prim('cube', 'wood', (0, y, z), (s - 0.08, 0.15, 0.03), (0, 0, rand(-0.02, 0.02)))
        for x in (-s / 2 + 0.005, s / 2 - 0.005):
            M.prim('cube', 'wood', (x, y, 0), (0.03, 0.15, s - 0.08), (rand(-0.02, 0.02), 0, 0))
    for x in (-1, 1):
        for z in (-1, 1):
            M.prim('cube', 'wood', (x * (s / 2 - 0.03), s / 2, z * (s / 2 - 0.03)), (0.07, s, 0.07))
    for y in (0.035, s - 0.035):
        for z in (-1, 1):
            M.prim('cube', 'wood', (0, y, z * (s / 2 - 0.03)), (s, 0.07, 0.07))
        for x in (-1, 1):
            M.prim('cube', 'wood', (x * (s / 2 - 0.03), y, 0), (0.07, 0.07, s))
    M.prim('cube', 'wood', (0, s - 0.02, 0), (s - 0.08, 0.04, s - 0.08))  # крышка
    props['top'] = s


def barrel(M, props):
    """бочка 0.75 м: пузатая (три конуса), железные обручи, донце"""
    h, r0, r1 = 0.75, 0.25, 0.3
    M.prim('cyl', 'wood', (0, h * 0.18, 0), r1=r0, r2=r1, depth=h * 0.36, seg=20)
    M.prim('cyl', 'wood', (0, h * 0.5, 0), r1=r1, r2=r1, depth=h * 0.28, seg=20)
    M.prim('cyl', 'wood', (0, h * 0.82, 0), r1=r1, r2=r0, depth=h * 0.36, seg=20)
    for y, r in ((0.09, r0 + 0.035), (0.3, r1 + 0.02), (0.45, r1 + 0.02), (0.66, r0 + 0.035)):
        M.prim('cyl', 'iron', (0, y, 0), r1=r + 0.005, r2=r + 0.005, depth=0.035, seg=20)
    M.prim('cyl', 'wood', (0, h - 0.005, 0), r1=r0 - 0.03, r2=r0 - 0.03, depth=0.02, seg=20, tint=0.8)
    props['top'] = h


def chest(M, props):
    """сундук 0.7×0.46: короб, полукруглая крышка, золотые оковки по рёбрам и замок"""
    w, d, h = 0.7, 0.46, 0.3
    M.prim('cube', 'wood', (0, h / 2, 0), (w, h, d))
    lid = math.pi / 2
    M.prim('cyl', 'wood', (0, h, 0), (1, 1, 1), (0, 0, lid), r1=d / 2, r2=d / 2, depth=w, seg=16)
    for x in (-w / 2 + 0.03, 0, w / 2 - 0.03):  # оковки
        M.prim('cube', 'gold', (x, h / 2, 0), (0.05, h + 0.01, d + 0.02))
        M.prim('cyl', 'gold', (x, h, 0), (1, 1, 1), (0, 0, lid), r1=d / 2 + 0.012, r2=d / 2 + 0.012, depth=0.05, seg=16)
    M.prim('cube', 'gold', (0, h - 0.02, -d / 2 - 0.02), (0.12, 0.14, 0.04))
    M.prim('cube', 'iron', (0, h - 0.05, -d / 2 - 0.045), (0.04, 0.05, 0.02))
    props['top'] = h + d / 2


def lantern(M, props):
    """фонарь 0.4 м: железный каркас, стёкла горят (свечение), крыша-пирамида с кольцом"""
    s = 0.2
    M.prim('cube', 'iron', (0, 0.02, 0), (s + 0.04, 0.04, s + 0.04))
    M.prim('cube', 'window', (0, 0.17, 0), (s - 0.02, 0.26, s - 0.02))
    for x in (-1, 1):
        for z in (-1, 1):
            M.prim('cube', 'iron', (x * s / 2, 0.17, z * s / 2), (0.025, 0.3, 0.025))
    M.prim('cube', 'iron', (0, 0.32, 0), (s + 0.05, 0.03, s + 0.05))
    M.prim('cyl', 'iron', (0, 0.39, 0), r1=0.17, r2=0.02, depth=0.13, seg=4, rot=(0, math.pi / 4, 0))
    M.prim('cyl', 'iron', (0, 0.47, 0), (1, 1, 1), (math.pi / 2, 0, 0), r1=0.035, r2=0.035, depth=0.015, seg=10)
    props['glow'] = [0, 0.17, 0]


PIECES = [  # кусок, треугольников в простой модели, где стоит при запекании, место в атласе
    dict(name='base', build=base, tris=16000, at=(0, 0, 0), weight=1.0),
    dict(name='crate', build=crate, tris=700, at=(8, 0, 0), weight=1.15),
    dict(name='barrel', build=barrel, tris=900, at=(11, 0, 0), weight=1.15),
    dict(name='chest', build=chest, tris=900, at=(14, 0, 0), weight=1.15),
    dict(name='lantern', build=lantern, tris=500, at=(17, 0, 0), weight=1.3),
]

mats = materials()
highs, lows = [], []
for i, p in enumerate(PIECES):
    random.seed(700 + i)
    M = Mason(soft=True)
    pr = {}
    p['build'](M, pr)
    p['props'] = pr
    highs.append(build_high(M, 'show_' + p['name'], p['at'], mats, bevel=0.012 if p['name'] != 'base' else 0.04, segments=2))
for h, p in zip(highs, PIECES):
    lows.append(build_low(h, 'show_' + p['name'], p['at'], p['tris'], 0.02 if p['name'] != 'base' else 0.035, p['props'], smooth=1 if p['name'] != 'base' else 2))

for lo in lows:
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(45), keep_sharp_edges=True)

unwrap(lows, [p['weight'] for p in PIECES])
color, normal, emit = bake_atlas(highs, lows, WORK, 2048, 2048, 512, ao=0.6)
bsdf = export(lows, color, normal, emit, OUT, 'ShowStone')

if PREVIEW:
    bsdf.inputs['Emission Strength'].default_value = 0.6
    for h in highs:
        h.hide_render = True
    for lo, x in zip(lows, (0, 3.3, 4.3, 5.3, 6.1)):
        lo.location = g2b((x - 2.5, 0, -1.6 if x else 0))
    preview(PREVIEW, (-0.2, 2.6, -6.2), (-2.5, -0.4, 0), (1400, 900))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'showroom.blend'))

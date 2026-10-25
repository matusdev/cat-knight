# Верхние виадуки «Кот-рыцаря» — помосты над одной колонкой дороги (main.js: row.upper, fillDecks), в том же
# камне и дереве, что мост и острова (stonework.py): детальная модель запекается в общий атлас.
#   камень — акведук: на каждую плиту дороги — опора спереди и арка до опоры следующей плиты, сверху плиты настила
#            и низкий парапет; пандус — сплошная кладка с наклонным верхом;
#   дерево — помост из досок поперёк хода на двух прогонах, спереди — козлы из столбов с раскосами, перила;
#            пандус — те же доски на наклонных прогонах.
# Кусок = одна плита дороги: длина L вдоль хода (z), ширина 2·HW, начало координат — середина плиты на уровне дороги,
# верх настила — y = H. Пандус — из трёх кусков (r0, r1, r2): верх от h0 сзади (z = +L/2, к камере) до h1 спереди.
# Результат — public/models/decks.glb, куски deck_stone, deck_stone_r0…r2, deck_wood, deck_wood_r0…r2.
#
# Запуск из корня проекта (около 2 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/decks.py -- public/models/decks.glb <папка для промежуточных картинок> [превью.png]
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, GAP, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

L = 2.6        # длина плиты дороги (CONFIG.run.tile)
HW = 1.15      # полуширина помоста (onUpper в игре)
H = 2.2        # высота настила (CONFIG.run.deck.h)
RAMP = 3       # пандус — три плиты (CONFIG.run.deck.ramp)
PARA = 0.3     # высота парапета и перил над настилом: кот с настила вбок — только прыжком
VOXEL = 0.03
PIECES = [  # имя, вид, номер куска пандуса (None — пролёт), треугольников, вес в атласе, где стоит при запекании
    dict(name='deck_stone', kind='stone', k=None, seed=61, tris=2800, uv=1.0, at=(0, 0, 0)),
    dict(name='deck_stone_r0', kind='stone', k=0, seed=62, tris=900, uv=0.7, at=(6, 0, 0)),
    dict(name='deck_stone_r1', kind='stone', k=1, seed=63, tris=1300, uv=0.8, at=(12, 0, 0)),
    dict(name='deck_stone_r2', kind='stone', k=2, seed=64, tris=1600, uv=0.9, at=(18, 0, 0)),
    dict(name='deck_wood', kind='wood', k=None, seed=71, tris=2000, uv=0.9, at=(24, 0, 0)),
    dict(name='deck_wood_r0', kind='wood', k=0, seed=72, tris=900, uv=0.6, at=(30, 0, 0)),
    dict(name='deck_wood_r1', kind='wood', k=1, seed=73, tris=1200, uv=0.7, at=(36, 0, 0)),
    dict(name='deck_wood_r2', kind='wood', k=2, seed=74, tris=1400, uv=0.8, at=(42, 0, 0)),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rand = random.uniform


def ramp_h(k):
    return H * k / RAMP, H * (k + 1) / RAMP


def top_at(h0, h1, z):
    """верх пандуса в точке z: h0 сзади (z = +L/2), h1 спереди (z = −L/2)"""
    return h0 + (h1 - h0) * (L / 2 - z) / L


# ---------- камень ----------

def stone_slabs(M, y_top):
    """плиты настила: три ряда вдоль хода, верх — y_top"""
    rows = 4
    for r in range(rows):
        z = -L / 2 + (r + 0.5) * L / rows
        M.course(-HW, HW, y_top - 0.15 + GAP / 2, 0.15, z, L / rows - GAP, 0.62, jitter=0.006)


def stone_parapet(M, y_top, z0=-L / 2, z1=L / 2):
    """низкий парапет по краям: камни и крышка из длинных плит"""
    for x, o in ((HW - 0.1, (1, 0, 0)), (-HW + 0.1, (-1, 0, 0))):
        M.course(z0, z1, y_top, PARA - 0.08, x, 0.2, 0.5, axis='z', out=o)
        M.course(z0, z1, y_top + PARA - 0.08, 0.08, x, 0.24, 0.9, axis='z', jitter=0.004)


def stone_span(M):
    """пролёт акведука: опора спереди (z от −L/2), арка до опоры следующей плиты (z = +L/2)"""
    slab_bot = H - 0.15
    stone_slabs(M, H)
    stone_parapet(M, H)
    pz0, pz1 = -L / 2, -L / 2 + 0.6           # опора
    zc, r_in = (pz1 + L / 2) / 2, (L / 2 - pz1) / 2
    r_out = r_in + 0.18
    spring = slab_bot - r_out - 0.03
    # опора: кладка по четырём граням и сердцевина; внизу — цоколь пошире
    ch = 0.26
    n = max(1, round(spring / ch))
    hh = spring / n
    for i in range(n):
        y0 = i * hh
        grow = 0.05 if i == 0 else 0.0
        for z, o in ((pz0 + 0.14 - grow, (0, 0, -1)), (pz1 - 0.14 + grow, (0, 0, 1))):
            M.course(-HW - grow, HW + grow, y0, hh, z, 0.28, 0.5, out=o)
        for x, o in ((HW - 0.14 + grow, (1, 0, 0)), (-HW + 0.14 - grow, (-1, 0, 0))):
            M.course(pz0 + 0.29, pz1 - 0.29, y0, hh, x, 0.28, 0.4, axis='z', out=o)
    M.block((0, spring / 2, (pz0 + pz1) / 2), (2 * HW - 0.1, spring + 0.02, pz1 - pz0 - 0.1), tint=MORTAR)
    # стенки над аркой по бокам (вдоль хода): в проёме камни вырезаны по окружности
    m = max(1, round((slab_bot - spring) / 0.25))
    h = (slab_bot - spring) / m
    for k in range(m):
        y0 = spring + k * h
        dy = max(0.0, y0 - spring)
        half = math.sqrt(max(0.0, r_out * r_out - dy * dy))
        for x, o in ((HW - 0.14, (1, 0, 0)), (-HW + 0.14, (-1, 0, 0))):
            M.course(pz0, L / 2, y0, h, x, 0.28, 0.5, axis='z', cuts=[(zc - half, zc + half)], out=o)
    # клинчатые камни по лицу арки (с обеих сторон) и свод кольцами вперевязку
    nv = max(7, round(math.pi * (r_in + 0.09) / 0.17))
    for x in (HW - 0.14, -HW + 0.14):
        for i in range(nv):
            a0, a1 = math.pi * i / nv, math.pi * (i + 1) / nv
            am, rm = (a0 + a1) / 2, (r_in + r_out) / 2
            M.block((x, spring + math.sin(am) * rm, zc + math.cos(am) * rm), (0.3, (a1 - a0) * rm - GAP, r_out - r_in - GAP), (-am, 0, 0))
    rings = max(2, round((2 * HW - 0.56) / 0.45))
    dx = (2 * HW - 0.56) / rings
    for j in range(rings):
        x0 = -HW + 0.28 + j * dx
        bounds = list(range(nv + 1)) if j % 2 == 0 else [0] + [i + 0.5 for i in range(nv)] + [nv]
        for i in range(len(bounds) - 1):
            a0, a1 = math.pi * bounds[i] / nv, math.pi * bounds[i + 1] / nv
            am, rv = (a0 + a1) / 2, r_in + 0.07
            M.block((x0 + dx / 2, spring + math.sin(am) * rv, zc + math.cos(am) * rv), (dx - GAP, (a1 - a0) * rv - GAP, 0.14), (-am, 0, 0))
    # сердцевина над сводом (между стенками): от замка арки до плит
    M.block((0, (spring + r_in + 0.1 + slab_bot) / 2, zc), (2 * HW - 0.5, slab_bot - spring - r_in - 0.05, 2 * r_out), tint=MORTAR)
    for s in (-1, 1):  # пазухи у опор — сплошные
        M.block((0, (spring + slab_bot) / 2 + 0.2, zc + s * (r_in + 0.08)), (2 * HW - 0.5, slab_bot - spring - 0.3, 0.3), tint=MORTAR)


def stone_ramp(M, k):
    """кусок пандуса: сплошная кладка до наклонного верха, сверху наклонные плиты, парапет — со второго куска"""
    h0, h1 = ramp_h(k)
    a = math.atan2(h1 - h0, L)
    ch = 0.26
    y = 0.0
    while y < h1 - 0.05:
        hh = min(ch, h1 - y)
        zt = L / 2 - (y + hh - h0) / (h1 - h0) * L  # камни ряда — там, где верх выше его верха
        zt = min(L / 2, zt)
        if zt > -L / 2 + 0.15:
            for x, o in ((HW - 0.14, (1, 0, 0)), (-HW + 0.14, (-1, 0, 0))):
                M.course(-L / 2, zt - 0.12, y, hh, x, 0.28, 0.5, axis='z', out=o)
            if y < h1 - 0.12:
                M.course(-HW, HW, y, hh, -L / 2 + 0.14, 0.28, 0.5, out=(0, 0, -1))  # лицо спереди (видно со следующей плиты — нет; для силуэта)
        y += hh
    # под плитами по бокам — наклонный пояс из камней: закрывает ступеньки рядов кладки под наклонным верхом
    steps = 5
    for x, o in ((HW - 0.14, (1, 0, 0)), (-HW + 0.14, (-1, 0, 0))):
        for i in range(steps):
            z = -L / 2 + (i + 0.5) * L / steps
            hb = min(0.34, top_at(h0, h1, z) - 0.15)
            if hb > 0.06:
                M.block((x, top_at(h0, h1, z) - 0.15 - hb / 2, z), (0.28, hb, L / steps / math.cos(a) - GAP), (a + rand(-0.02, 0.02), 0, 0), out=o)
    # наклонные плиты и сердцевина под ними
    rows = 4
    for r in range(rows):
        z = -L / 2 + (r + 0.5) * L / rows
        yt = top_at(h0, h1, z)
        for xs in ((-HW, -0.35), (-0.35, 0.4), (0.4, HW)):
            cx = (xs[0] + xs[1]) / 2 + rand(-0.04, 0.04)
            M.block((cx, yt - 0.075, z), (xs[1] - xs[0] - GAP, 0.15, (L / rows) / math.cos(a) - GAP), (a, 0, 0))
    th = 0.9
    M.block((0, (h0 + h1) / 2 - th / 2 * math.cos(a) - 0.05, 0), (2 * HW - 0.1, th, L / math.cos(a) - 0.06), (a, 0, 0), tint=MORTAR)
    if h0 > 0.05:
        M.block((0, h0 / 2, 0), (2 * HW - 0.1, h0, L - 0.06), tint=MORTAR)
    if k >= 1:  # наклонный парапет
        steps = 5
        for x in (HW - 0.1, -HW + 0.1):
            for i in range(steps):
                z = -L / 2 + (i + 0.5) * L / steps
                M.block((x, top_at(h0, h1, z) + PARA / 2 - 0.02, z), (0.2, PARA, L / steps / math.cos(a) - GAP), (a, 0, 0))


# ---------- дерево ----------

def boards(M, y_of_z, a=0.0):
    """доски поперёк хода (y_of_z — верх настила в точке z), под ними два прогона и боковые брусья"""
    n = 10
    for i in range(n):
        z = -L / 2 + (i + 0.5) * L / n
        w = L / n / math.cos(a) - 0.03
        M.block((rand(-0.03, 0.03), y_of_z(z) - 0.04 + rand(-0.008, 0.008), z), (2 * HW - rand(0.0, 0.08), 0.08, w), (a + rand(-0.015, 0.015), rand(-0.02, 0.02), 0), mat='wood')
    for x in (0.78, -0.78):  # прогоны
        M.block((x, y_of_z(0) - 0.08 - 0.12, 0), (0.18, 0.24, L / math.cos(a) + 0.02), (a, 0, 0), mat='bark')
    for x in (HW - 0.06, -HW + 0.06):  # боковые брусья
        M.block((x, y_of_z(0) - 0.1, 0), (0.12, 0.2, L / math.cos(a)), (a, 0, 0), mat='bark')


def railing(M, y_of_z, a=0.0):
    """перила: стойка на каждой плите, поручень и средний брус; железные скобы у стоек"""
    for x in (HW - 0.06, -HW + 0.06):
        zp = -L / 2 + 0.12
        M.block((x, y_of_z(zp) + 0.27, zp), (0.1, 0.62, 0.1), mat='bark')
        M.block((x, y_of_z(zp) + 0.05, zp), (0.13, 0.08, 0.13), mat='iron')
        M.block((x, y_of_z(0) + PARA + 0.2, 0), (0.08, 0.08, L / math.cos(a) + 0.02), (a, 0, 0), mat='wood')
        M.block((x, y_of_z(0) + PARA - 0.02, 0), (0.06, 0.06, L / math.cos(a) + 0.02), (a, 0, 0), mat='wood')


def trestle(M, z, top):
    """козлы под настилом: два столба на камнях, насадка поперёк, раскосы крест-накрест"""
    hp = top - 0.32
    for x in (0.78, -0.78):
        M.block((x, hp / 2, z), (0.17, hp, 0.17), (0, rand(-0.05, 0.05), 0), mat='bark')
        M.block((x, 0.06, z), (0.32, 0.14, 0.32), mat='stone')
        M.block((x, hp - 0.12, z), (0.2, 0.06, 0.2), mat='iron')
    M.block((0, hp + 0.04, z), (1.9, 0.16, 0.2), mat='bark')
    ang = math.atan2(hp - 0.35, 1.4)
    for s in (-1, 1):
        M.block((0, hp / 2 + 0.05, z + 0.05 * s), (math.hypot(1.4, hp - 0.35), 0.1, 0.08), (0, 0, s * ang), mat='wood')


def wood_span(M):
    f = lambda z: H
    boards(M, f)
    railing(M, f)
    trestle(M, -L / 2 + 0.2, H)


def wood_ramp(M, k):
    h0, h1 = ramp_h(k)
    a = math.atan2(h1 - h0, L)
    f = lambda z: top_at(h0, h1, z)
    boards(M, f, a)
    if k >= 1:
        railing(M, f, a)
        trestle(M, -L / 2 + 0.2, h1)
    else:
        for z in (-L / 2 + 0.25, 0.3):  # низ пандуса — на коротких чурбаках
            for x in (0.78, -0.78):
                hp = max(0.06, f(z) - 0.32)
                M.block((x, hp / 2, z), (0.18, hp, 0.18), mat='bark')


mats = materials(crevice_glow=False)
highs, lows = [], []
for p in PIECES:
    random.seed(p['seed'])
    M = Mason(soft=True)
    if p['kind'] == 'stone':
        stone_span(M) if p['k'] is None else stone_ramp(M, p['k'])
    else:
        wood_span(M) if p['k'] is None else wood_ramp(M, p['k'])
    highs.append(build_high(M, p['name'], p['at'], mats, bevel=0.03, segments=2))
for h, p in zip(highs, PIECES):
    lows.append(build_low(h, p['name'], p['at'], p['tris'], VOXEL, {'kind': p['kind'], 'ramp': -1 if p['k'] is None else p['k']}, smooth=2))

for lo in lows:  # плавные нормали, острые рёбра — где излом больше 50°
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)

unwrap(lows, [p['uv'] for p in PIECES])
color, normal, emit = bake_atlas(highs, lows, WORK, 2048, 2048, 256, ao=0.6)
bsdf = export(lows, color, normal, emit, OUT, 'DeckBaked')

# превью: оба помоста рядом, как в игре — пандус из трёх кусков и пролёты, камера сзади сверху
if PREVIEW:
    for h in highs:
        h.hide_render = True
    by = {lo.name: lo for lo in lows}
    for lo in lows:
        lo.hide_render = True
    for kind, x in (('stone', -1.4), ('wood', 1.4)):
        seq = ['deck_%s_r0' % kind, 'deck_%s_r1' % kind, 'deck_%s_r2' % kind] + ['deck_%s' % kind] * 4
        for i, name in enumerate(seq):
            o = by[name].copy()
            o.hide_render = False
            o.location = g2b((x, 0, -i * L))
            scene.collection.objects.link(o)
    preview(PREVIEW, (0, 5.5, 7.5), (0, 1.2, -9), size=(960, 960))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'decks.blend'))

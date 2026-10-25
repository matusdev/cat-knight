# Замок «Кот-рыцаря» на горизонте — в том же камне, что мост и острова (stonework.py).
# Парящая скала с поясом крупной кладки и дёрном; шестигранная стена с зубцами и башнями по углам, ворота
# с надвратными башнями, донжон с четырьмя башенками и высокой центральной башней, синие конусные крыши, окна
# (ночью горят), ёлки по краю. Флаги, стяги с котом, облака и кружащие обломки остаются в игре — здесь в extras
# пишутся точки флагов и стягов (оси игры, до масштаба замка в игре). Результат — public/models/castle.glb.
#
# Запуск из корня проекта (около 2 минут):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/castle.py -- public/models/castle.glb <папка для промежуточных картинок> [превью.png]
import bpy, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stonework import Mason, GAP, MORTAR, g2b, materials, build_high, build_low, unwrap, bake_atlas, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
WORK = os.path.abspath(argv[1])
PREVIEW = os.path.abspath(argv[2]) if len(argv) > 2 else None
os.makedirs(WORK, exist_ok=True)

VOXEL = 0.12        # замок виден только издали — сплавляем крупно
TRIS = 26000
R0 = 10.5           # радиус шестигранной стены
FRONT = R0 * math.cos(math.pi / 6)  # передняя грань стены (к дороге, +Z)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
random.seed(201)
rand = random.uniform


def wall(M, x0, z0, x1, z1, y0, courses, h, thick, merlons=True):
    """стена из камней во всю толщину по прямой (x0, z0) → (x1, z1), ряды вперевязку; сверху — зубцы"""
    dx, dz = x1 - x0, z1 - z0
    L, ang = math.hypot(dx, dz), math.atan2(dz, dx)
    ux, uz = dx / L, dz / L
    for k in range(courses):
        pos = -rand(0.3, 0.7) if k % 2 else 0.0
        while pos < L:
            s = rand(1.0, 1.8)
            a, b = max(pos, 0.0), min(pos + s, L)
            if b - a > 0.2:
                c = (a + b) / 2
                M.block((x0 + ux * c, y0 + k * h + h / 2, z0 + uz * c), (b - a - GAP, h - GAP, thick), (rand(-0.02, 0.02), -ang, rand(-0.02, 0.02)))
            pos += s
    if merlons:
        t = 0.35
        while t < L - 0.3:
            M.block((x0 + ux * t, y0 + courses * h + 0.35, z0 + uz * t), (0.7, 0.7, thick + 0.08), (0, -ang, 0))
            t += 1.4


def castle_tower(M, x, z, r, h, roof, flags, flag=False, window=True):
    """круглая башня: кладка кольцами, выступающий пояс с зубцами, синяя конусная крыша; окно — к дороге"""
    top = M.tower(x, z, r, -0.3, max(3, round((h + 0.3) / 0.6)), h=0.6, crenel=False, stone=1.0)  # камни крупнее — издали мелкие швы рябят
    n = max(10, round(2 * math.pi * r * 1.12 / 0.9))
    M.ring(x, z, r * 1.12, top, 0.6, n, depth=0.5)
    M.ring(x, z, r * 1.12, top + 0.6, 0.5, n, depth=0.45, crenel=True)
    M.prim('cyl', 'roof_blue', (x, top + 0.6 + roof / 2, z), r1=r * 1.25, r2=0.03, depth=roof, seg=16)
    if window:
        M.prim('cube', 'window', (x, top * 0.62, z + r + 0.12), (0.45, 1.1, 0.3))
    if flag:
        flags.append([x, top + 0.6 + roof - 0.1, z])


def pine(M, x, z, h):
    M.prim('cyl', 'bark', (x, 0.15 * h, z), r1=0.06 * h, r2=0.05 * h, depth=0.35 * h, seg=7)
    for r, hh, y in ((0.32, 0.5, 0.25), (0.26, 0.45, 0.48), (0.18, 0.4, 0.7)):
        M.prim('cyl', 'pine', (x, (y + hh / 2) * h, z), r1=r * h, r2=0.02, depth=hh * h, seg=8)


M = Mason()
flags = []

# парящая скала: дёрн, два кольца крупной кладки обрывом, глыба книзу остриём — неглубокая (низ на 10 м под дёрном):
# глубже она на горизонте была массивнее самого замка
M.prim('cyl', 'grass', (0, -0.25, 0), r1=16.8, r2=16.4, depth=0.8, seg=40)
for k, (r, y0) in enumerate(((16.3, -1.65), (15.4, -2.65))):
    M.ring(0, 0, r, y0, 1.0, round(2 * math.pi * r / 1.6), depth=0.9, phase=0.5 * k)
M.prim('cyl', 'stone', (0, -1.6, 0), r1=15.6, r2=15.6, depth=2.2, seg=32, tint=MORTAR)
M.rock(0, -3.6, 0, 16.0, 5.2, 15.5, sub=5)
M.rock(-6.0, -5.6, 3.0, 4.5, 2.0, 4.0, sub=4)

# шестигранная стена; передняя грань (i = 1, к +Z) — с воротами
for i in range(6):
    a0, a1 = i / 6 * math.pi * 2, (i + 1) / 6 * math.pi * 2
    x0, z0, x1, z1 = math.cos(a0) * R0, math.sin(a0) * R0, math.cos(a1) * R0, math.sin(a1) * R0
    if i == 1:  # проём ворот посередине: стена двумя кусками
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        dx, dz = (x1 - x0), (z1 - z0)
        L = math.hypot(dx, dz)
        g = 1.6 / L
        wall(M, x0, z0, mx - dx * g, mz - dz * g, -0.2, 8, 0.58, 1.4)
        wall(M, mx + dx * g, mz + dz * g, x1, z1, -0.2, 8, 0.58, 1.4)
        wall(M, mx - dx * g, mz - dz * g, mx + dx * g, mz + dz * g, 3.0, 3, 0.58, 1.4)  # над воротами
    else:
        wall(M, x0, z0, x1, z1, -0.2, 8, 0.58, 1.4)
    castle_tower(M, x0, z0, 1.9, 9.5 if i in (1, 2) else 7.5, 4.2, flags, flag=i in (1, 2))
M.prim('cube', 'wood', (0, 1.4, FRONT + 0.25), (3.0, 3.0, 0.5))  # створки ворот
castle_tower(M, -2.9, FRONT + 0.6, 1.2, 6.2, 2.8, flags)
castle_tower(M, 2.9, FRONT + 0.6, 1.2, 6.2, 2.8, flags)

# донжон: стены во всю толщину, сердцевина, зубцы; четыре башенки и высокая центральная башня
kx, kz0, kz1 = 4.5, -5.5, 1.5
for (xa, za, xb, zb) in ((-kx, kz1, kx, kz1), (kx, kz1, kx, kz0), (kx, kz0, -kx, kz0), (-kx, kz0, -kx, kz1)):
    wall(M, xa, za, xb, zb, -0.2, 20, 0.56, 1.0)
M.prim('cube', 'stone', (0, 5.3, (kz0 + kz1) / 2), (2 * kx - 1.4, 11.0, kz1 - kz0 - 1.4), tint=MORTAR)
for i in range(3):
    M.prim('cube', 'window', (-2.4 + i * 2.4, 7.5, kz1 + 0.55), (0.6, 1.3, 0.3))
castle_tower(M, -kx, kz1, 1.4, 14, 4.5, flags)
castle_tower(M, kx, kz1, 1.4, 14, 4.5, flags)
castle_tower(M, -kx, kz0, 1.4, 13, 4.2, flags, window=False)
castle_tower(M, kx, kz0, 1.4, 13, 4.2, flags, window=False)
castle_tower(M, 0, -2.5, 2.4, 20, 6.5, flags, flag=True)

# ёлки по краю острова
for i in range(9):
    ta = math.pi * (0.1 + i * 0.1) + (math.pi * 0.75 if i > 4 else 0)
    pine(M, math.cos(ta) * 14.0, math.sin(ta) * 13.3, rand(2.6, 4.0))

props = {'flags': flags, 'banners': [[-4.4, 4.1, FRONT + 0.78], [4.4, 4.1, FRONT + 0.78]]}
mats = materials()
high = build_high(M, 'castle', (0, 0, 0), mats)
low = build_low(high, 'castle', (0, 0, 0), TRIS, VOXEL, props)
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)
unwrap([low], [1.0])
color, normal, emit = bake_atlas([high], [low], WORK, 1024, 1024, 256, ao=0.45)
bsdf = export([low], color, normal, emit, OUT, 'CastleStone')

if PREVIEW:
    bsdf.inputs['Emission Strength'].default_value = 0.3
    high.hide_render = True
    preview(PREVIEW, (0, 22, 62), (0, 4, 0), (1280, 900))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'castle.blend'))

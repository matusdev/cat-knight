# Пёс-охранник по мему «no vibecode today» — пухлый рыжий сиба с ножом и круглым щитом, стилизованная модель
# из простых форм. Как и кот (cat.py), это набор жёстких частей с точками поворота там, где их крутит игра
# (dogModel в main.js): тело, голова, лапы (плечо) и нож (рукоять — «запястье», чтобы удар был рубящим).
# Шерсть в игре — оболочками поверх материала fur (голова и тело); окрас сиба (светлые морда, щёки, грудь и живот,
# к спине и макушке темнее) — в цветах вершин. Морда, глаза, лапы, нож и щит — краской в цветах вершин без оболочек
# (иначе рот и нос утонули бы в шерсти). Общие детали — figures.py. Результат — public/models/dog.glb.
#
# Запуск из корня проекта (меньше минуты):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/dog.py -- public/models/dog.glb [превью.png]
#
# Координаты — в осях игры (пёс смотрит в +z, к коту), до масштаба пса в игре (1.25).
import bpy, math, sys, os
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figures import G, S, material, clamp01, mix, Figure, export, preview

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

# цвета — линейные (как в glTF и three.js)
ORANGE = (0.77, 0.31, 0.035)  # рыже-золотой, как в меме
DARK = (0.48, 0.17, 0.023)
CREAM = (0.9, 0.71, 0.43)

# Материалов три — каждый материал части это отдельный вызов отрисовки, а псов на экране бывает несколько:
# fur — шерсть головы и тела (в игре на неё ложатся оболочки), plain — всё остальное неметаллическое,
# blade — металл (клинок, обод щита)
M = {
    'fur': material('fur', ORANGE, 0.95, vcol=True),
    'plain': material('plain', (1, 1, 1), 0.7, vcol=True),
    'blade': material('blade', (0.75, 0.77, 0.8), 0.22, 1.0),
}
PAINTS = {
    'fur': ('fur', (1, 1, 1)),  # окрас посчитается после склейки
    'arm': ('plain', mix(ORANGE, DARK, 0.15)),
    'fur_light': ('plain', CREAM),
    'muzzle': ('plain', (0.92, 0.76, 0.5)),
    'dark': ('plain', (0.015, 0.01, 0.008)),
    'white': ('plain', (1, 1, 1)),
    'shield': ('plain', (0.42, 0.44, 0.47)),
    'red': ('plain', (0.66, 0.09, 0.025)),
    'steel': ('blade', (1, 1, 1)),
}
# точки поворота частей (оси игры) — те же, что у групп в dogModel
f = Figure({
    'dog_body': (0, 0, 0),
    'dog_head': (0, 1.1, 0.02),
    'dog_armR': (0.36, 0.82, 0),
    'dog_armL': (-0.36, 0.82, 0),
    'dog_knife': (0.5, 0.56, 0.3),  # рукоять в правой лапе — сбоку от головы, чтобы нож не прятался за щекой
}, M, PAINTS)
FACE = (math.pi / 2, 0, 0)  # кольцо/диск из плоскости XY — в плоскость морды (лицом к коту)

# ---------- тело: пухлое, как булка; светлые грудь и живот, лапки-ступни ----------
f.sphere('dog_body', 'fur', G(0, 0.52, 0), S(0.44, 0.44, 0.4), seg=48)
f.sphere('dog_body', 'fur', G(0, 0.45, 0.14), S(0.35, 0.34, 0.28), seg=32)
for s in (-1, 1):
    f.sphere('dog_body', 'fur_light', G(s * 0.2, 0.08, 0.13), S(0.13, 0.08, 0.17))
f.torus('dog_body', 'fur', G(0, 0.8, -0.38), 0.11, 0.065, (0, math.pi / 2, 0))  # хвост бубликом

# ---------- голова: круглая, щёки-пампушки, морда с носом и улыбкой «ω», глаза-бусинки, пятна-брови, ушки ----------
f.sphere('dog_head', 'fur', G(0, 1.08, 0.03), S(0.47, 0.4, 0.43), seg=64)
for s in (-1, 1):
    f.sphere('dog_head', 'fur', G(s * 0.21, 0.95, 0.24), S(0.2, 0.16, 0.18))
    f.sphere('dog_head', 'dark', G(s * 0.155, 1.12, 0.445), S(0.05, 0.032, 0.04), seg=16)  # выступают над шерстью
    f.sphere('dog_head', 'white', G(s * 0.14, 1.135, 0.482), S(0.014, 0.01, 0.008), seg=8)
    f.sphere('dog_head', 'muzzle', G(s * 0.14, 1.215, 0.42), S(0.05, 0.026, 0.03), seg=12)
    f.cone('dog_head', 'fur', G(s * 0.25, 1.43, -0.02), 0.11, 0.012, 0.22, (-0.15, s * 0.35, 0), (1, 0.55, 1), seg=16, uvs=0.3)
    f.cone('dog_head', 'muzzle', G(s * 0.245, 1.41, 0.02), 0.07, 0.008, 0.15, (-0.15, s * 0.35, 0), (1, 0.3, 1), seg=12)
    f.torus('dog_head', 'dark', G(s * 0.042, 0.948, 0.488), 0.042, 0.009, FACE, half=True)  # улыбка — две дуги «‿‿»
f.sphere('dog_head', 'muzzle', G(0, 0.98, 0.37), S(0.16, 0.115, 0.13), seg=32)
f.sphere('dog_head', 'muzzle', G(0, 0.87, 0.31), S(0.13, 0.075, 0.1))
f.sphere('dog_head', 'dark', G(0, 1.035, 0.5), S(0.06, 0.042, 0.04), seg=16)

# ---------- лапы: короткие пухлые; в правой — нож, в левой — круглый щит перед собой ----------
for part, s in (('dog_armR', 1), ('dog_armL', -1)):
    f.sphere(part, 'arm', G(s * 0.4, 0.69, 0.09), S(0.12, 0.17, 0.12))  # лапы без оболочек — краской
f.sphere('dog_armR', 'fur_light', G(0.48, 0.56, 0.26), S(0.11, 0.1, 0.11))
f.sphere('dog_armL', 'fur_light', G(-0.4, 0.57, 0.24), S(0.1, 0.1, 0.1))
shield_c, tilt = G(-0.3, 0.58, 0.4), -0.3  # щит повёрнут чуть влево, наружу
normal = Vector((math.sin(tilt), -math.cos(tilt), 0))  # куда смотрит лицевая сторона
f.cone('dog_armL', 'shield', shield_c, 0.27, 0.27, 0.05, (math.pi / 2, 0, tilt), seg=32)
f.torus('dog_armL', 'steel', shield_c, 0.27, 0.05, (math.pi / 2, 0, tilt))
f.sphere('dog_armL', 'red', tuple(Vector(shield_c) + normal * 0.03), (0.16, 0.07, 0.16), (0, 0, tilt), seg=24)

# ---------- нож: рыжая рукоять в лапе, широкий клинок вверх со скосом к острию, остриё чуть наружу ----------
gx, gy, gz = f.pivots['dog_knife']
top = gy + 0.14 + 0.6  # клинок длиной почти с голову, как в меме


def bevel_tip(v):  # скос: верх у лезвия (внутренняя сторона) ниже — остриё у обуха
    if v.co.z > top - 0.01 and v.co.x < gx:
        v.co.z -= 0.22


f.cone('dog_knife', 'red', G(gx, gy + 0.01, gz), 0.04, 0.04, 0.24, seg=10)
f.box('dog_knife', 'steel', G(gx, gy + 0.135, gz), (0.1, 0.05, 0.035))
f.box('dog_knife', 'steel', G(gx, gy + 0.14 + 0.3, gz), (0.14, 0.024, 0.6), bevel=0.25, shape=bevel_tip)
grip = Vector(G(gx, gy, gz))
lean = Matrix.Translation(grip) @ Matrix.Rotation(0.3, 4, 'Y') @ Matrix.Translation(-grip)
for o in f.parts['dog_knife']:
    o.data.transform(lean)

objs = f.join()


# Окрас сиба в цветах вершин шерсти: светлое («урадзиро») — низ морды, щёки, грудь и живот; макушка, спина
# и затылок темнее. У остальных кусков в цветах вершин уже их краска
def coat(name, p):  # p — точка в осях игры
    if name == 'dog_head':
        x, y, z = p[0], p[1] - 1.08, p[2] - 0.03
        cream = clamp01((z - 0.12) / 0.15) * clamp01((0.06 - y) / 0.12)
        dark = clamp01((y - 0.22) / 0.15) * 0.6 + clamp01((-z - 0.1) / 0.25) * 0.4
    else:
        x, y, z = p[0], p[1] - 0.52, p[2]
        cream = clamp01((z - 0.22) / 0.1) * clamp01((0.12 - y) / 0.2) * 0.85  # светлое — только низ груди и живот
        dark = clamp01((-z - 0.05) / 0.3) * 0.6 * clamp01((y + 0.1) / 0.3)
    return mix(mix(ORANGE, DARK, clamp01(dark)), CREAM, cream)


for o in objs:
    me = o.data
    slot = [i for i, m in enumerate(me.materials) if m.name == 'fur']
    if not slot:
        continue
    ca = me.color_attributes['Col']
    furry = {i for poly in me.polygons if poly.material_index == slot[0] for i in poly.vertices}
    for v in me.vertices:
        if v.index in furry:
            b = v.co + o.location  # оси Blender → оси игры
            ca.data[v.index].color = coat(o.name, (b.x, b.z, -b.y)) + [1.0]

export(OUT, objs)
if PREVIEW:  # спереди, со стороны кота
    preview(PREVIEW, (0.9, -3.4, 1.35), (0, 0, 0.82))

# Кот-рыцарь по фото героя (public/img/hero.jpg) — стилизованная модель, собранная кодом.
# Модель — набор жёстких частей с точками поворота там же, где их крутит игра (buildCat в main.js): тело, голова,
# руки (плечо), ноги (бедро), меч (рукоять). Поэтому все движения игры — прыжок, присед, взмах меча, сальто —
# работают без костей. Шерсть в игре — оболочками (addFur) поверх частей с материалами fur и fur_light; полоски
# табби нарисованы в цветах вершин головы. Плащ и хвост игра строит и двигает сама. Результат — public/models/cat.glb.
#
# Детали (лавка показывает кота крупно): голова с пухлыми щеками и пушистыми бакенбардами, нос-треугольник, рот «ω»,
# глаза с двумя бликами и тёмным веком, уши с розовым и пучками шерсти, бант из двух петель с хвостиками; доспех —
# кираса с золотой каймой и ребром, наплечники из трёх пластин, пояс с пряжкой и кошелём, набедренные пластины,
# кольчуга; латные перчатки с пальцами, наколенники с «веером», сапоги-сабатоны из пластин; меч с обмоткой рукояти,
# гардой с шарами, долом на клинке и камнем в навершии. Материалы steel, steel_dark, leather, gold, eye, white
# игра подменяет своими (облик из лавки перекрашивает доспех), остальные берёт из модели.
#
# Запуск из корня проекта (меньше минуты):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/cat.py -- public/models/cat.glb [превью.png]
#
# Оси Blender: Z вверх, кот смотрит в +Y (в glTF и в игре это −Z — к замку). Размеры — как у кота в игре до масштаба.
import bpy, bmesh, math, sys, os
from mathutils import Vector, Euler, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(argv[0])
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

# точки поворота частей (оси Blender) — те же, что у групп в buildCat
PIVOTS = {
    'cat_body': (0, 0, 0),
    'cat_head': (0, 0, 1.12),
    'cat_armL': (-0.3, 0, 0.79),
    'cat_armR': (0.3, 0, 0.79),
    'cat_legL': (-0.13, 0, 0.33),
    'cat_legR': (0.13, 0, 0.33),
    'cat_sword': (0, 0, 0),  # рукоять; игра сама ставит меч в правую лапу
}
parts = {k: [] for k in PIVOTS}

# цвета — линейные (как в glTF и three.js)
CREAM = (0.66, 0.50, 0.32)
TABBY = (0.36, 0.22, 0.11)  # карамельные полоски, как на фото, — не тёмно-бурые
LIGHT = (0.85, 0.74, 0.58)


def material(name, base, rough=0.5, metal=0.0, vcol=False):
    m = bpy.data.materials.new(name)
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = base + (1,)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if vcol:  # цвет — из вершин (полоски табби)
        a = N.new('ShaderNodeVertexColor')
        a.layer_name = 'Col'
        L.new(a.outputs['Color'], b.inputs['Base Color'])
    return m


M = {
    'fur': material('fur', CREAM, 0.95, vcol=True),
    'fur_light': material('fur_light', LIGHT, 0.95),
    'pink': material('pink', (0.80, 0.33, 0.36), 0.5),
    'bow': material('bow', (0.92, 0.42, 0.55), 0.45),
    'eye': material('eye', (0.012, 0.009, 0.007), 0.06),
    'lid': material('lid', (0.05, 0.03, 0.02), 0.6),      # веко и рот — тёмно-коричневые
    'white': material('white', (1, 1, 1), 0.2),
    'steel': material('steel', (0.70, 0.72, 0.76), 0.34, 1.0),
    'steel_dark': material('steel_dark', (0.46, 0.48, 0.52), 0.42, 1.0),
    'mail': material('mail', (0.2, 0.21, 0.23), 0.7, 0.8),
    'leather': material('leather', (0.20, 0.10, 0.045), 0.6),
    'gold': material('gold', (0.85, 0.58, 0.18), 0.3, 1.0),
    'gem': material('gem', (0.55, 0.02, 0.04), 0.1),       # камни: навершие меча, застёжка плаща
}


def add(part, bm, mat, smooth=True):
    """кусок части: bmesh в абсолютных координатах → объект; позже части склеиваются"""
    me = bpy.data.meshes.new(part)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    o = bpy.data.objects.new(part, me)
    o.data.materials.append(M[mat])
    col.objects.link(o)
    parts[part].append(o)
    return o


def new_bm():
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')  # без слоя calc_uvs ничего не пишет; развёртка нужна оболочкам шерсти
    return bm


def xf(c, rot=(0, 0, 0), s=(1, 1, 1)):
    return Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal(Vector(tuple(s) + (1,)))


def sphere(part, mat, c, s, rot=(0, 0, 0), seg=24, shape=None):
    """shape(v) — сдвиг вершины единичной сферы до масштаба (пухлые щёки, мордочка)"""
    bm = new_bm()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0, calc_uvs=True)
    if shape:
        for v in bm.verts:
            v.co = shape(v.co.copy())
    bmesh.ops.transform(bm, matrix=xf(c, rot, s), verts=bm.verts)
    return add(part, bm, mat)


def cone(part, mat, c, r1, r2, h, rot=(0, 0, 0), s=(1, 1, 1), seg=16, uvs=1.0):
    """uvs — доля текстуры прядей на развёртке: у маленьких деталей меньше, иначе пряди мельче пикселя"""
    bm = new_bm()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=xf(c, rot, s), calc_uvs=True)
    uv = bm.loops.layers.uv.active
    for f in bm.faces:
        for lp in f.loops:
            lp[uv].uv *= uvs
    return add(part, bm, mat)


def box(part, mat, c, s, rot=(0, 0, 0), bevel=0.18):
    bm = new_bm()
    bmesh.ops.create_cube(bm, size=1.0, matrix=xf(c, rot, s), calc_uvs=True)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(s) * bevel, segments=2, affect='EDGES')
    return add(part, bm, mat)


def torus(part, mat, c, R, r, rot=(0, 0, 0), s=(1, 1, 1), seg=32, ring=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=ring)
    t = bpy.context.active_object
    t.data.transform(xf(c, rot, s))
    t.data.shade_smooth()
    t.data.materials.append(M[mat])
    parts[part].append(t)
    return t


def arc(part, mat, c, R, r, a0, a1, rot=(0, 0, 0), s=(1, 1, 1), seg=24, ring=8):
    """дуга-трубка (кант, рот «ω», петля банта): по кругу радиуса R в плоскости XY от угла a0 до a1, с закрытыми концами"""
    bm = new_bm()
    rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        ctr = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        up = Vector((0, 0, 1))
        rr = []
        for j in range(ring):
            b = j / ring * math.pi * 2
            rr.append(bm.verts.new(ctr + (out * math.cos(b) + up * math.sin(b)) * r))
        rings.append(rr)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % ring], rings[i + 1][(j + 1) % ring], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.transform(bm, matrix=xf(c, rot, s), verts=bm.verts)
    return add(part, bm, mat)


# точка на поверхности эллипсоида (центр c, полуоси r, поворот вокруг y на ry): a — по кругу от +x к +y, b — к полюсу +z
def on_ellipsoid(c, r, ry, a, b, lift=1.0):
    p = Vector((r[0] * math.cos(a) * math.cos(b), r[1] * math.sin(a) * math.cos(b), r[2] * math.sin(b))) * lift
    p.rotate(Euler((0, ry, 0)))
    return tuple(Vector(c) + p)


# ---------- голова: большая (чиби), пухлые щёки, крупные глаза, ушки с розовым, бант на левом ухе ----------
def skull(v):
    """единичная сфера → череп: щёки шире книзу, макушка чуть площе, мордочка вперёд"""
    d = v.normalized()
    k = 1.0 + 0.09 * max(0.0, -d.z) * (1 - abs(d.y) * 0.4)   # щёки
    v.x *= k
    v.z *= 0.97 if d.z > 0 else 1.0
    if d.y > 0.55 and d.z < 0.15:                            # мордочка
        v.y *= 1.0 + 0.06 * (d.y - 0.55) / 0.45
    return v


sphere('cat_head', 'fur', (0, 0, 1.14), (0.44, 0.41, 0.4), seg=72, shape=skull)
for s in (-1, 1):
    sphere('cat_head', 'fur_light', (s * 0.2, 0.22, 1.0), (0.18, 0.15, 0.14), seg=28)         # щёки-подушечки
    for k, (dz, ang, ln) in enumerate(((0.07, 0.35, 0.1), (0.0, 0.12, 0.13), (-0.07, -0.12, 0.12), (-0.13, -0.38, 0.09))):  # бакенбарды: пушистые пучки
        cone('cat_head', 'fur', (s * (0.43 + ln * 0.2), 0.04 - k * 0.025, 1.0 + dz), 0.085, 0.02, ln,
             (0, s * (math.pi / 2 - ang), s * -0.35), seg=16, uvs=0.25)  # верхний пучок — вверх, нижний — вниз; чуть назад
    # глаз: чёрный, блестящий; два блика; тёмное веко сверху
    sphere('cat_head', 'eye', (s * 0.15, 0.39, 1.15), (0.088, 0.066, 0.104), seg=32)
    sphere('cat_head', 'white', (s * 0.15 - s * 0.03, 0.452, 1.19), (0.024, 0.012, 0.024), seg=14)
    sphere('cat_head', 'white', (s * 0.15 + s * 0.028, 0.452, 1.115), (0.011, 0.007, 0.011), seg=10)
    arc('cat_head', 'lid', (s * 0.15, 0.4, 1.152), 0.094, 0.006, math.radians(40), math.radians(140), (math.radians(90) - 0.25, 0, 0), (1, 1, 1.08), seg=20, ring=6)
    # ухо: внешняя часть в шерсти, розовая внутри, белые пучки из уха
    cone('cat_head', 'fur', (s * 0.25, -0.02, 1.47), 0.15, 0.02, 0.33, (0.1, -s * 0.38, 0), (1, 0.55, 1), seg=24, uvs=0.3)
    cone('cat_head', 'pink', (s * 0.245, 0.02, 1.455), 0.1, 0.012, 0.25, (0.1, -s * 0.38, 0), (1, 0.4, 1), seg=20)
    for k in range(3):
        cone('cat_head', 'fur_light', (s * (0.235 + k * 0.012), 0.045, 1.42 + k * 0.035), 0.022, 0.003, 0.11 - k * 0.02,
             (0.35, -s * (0.55 + k * 0.1), 0), seg=8, uvs=0.15)
sphere('cat_head', 'fur_light', (0, 0.33, 1.0), (0.13, 0.1, 0.09), seg=28)        # подбородок
sphere('cat_head', 'fur_light', (0, 0.3, 0.92), (0.08, 0.06, 0.05), seg=20)
# нос — закруглённый треугольник; рот «ω» и полоска от носа
cone('cat_head', 'pink', (0, 0.435, 1.072), 0.03, 0.006, 0.03, (math.pi, 0, 0), (1.25, 0.55, 1), seg=3)
sphere('cat_head', 'pink', (0, 0.432, 1.079), (0.03, 0.016, 0.017), seg=14)
box('cat_head', 'lid', (0, 0.437, 1.045), (0.006, 0.006, 0.03), bevel=0.4)
for s in (-1, 1):
    arc('cat_head', 'lid', (s * 0.022, 0.432, 1.032), 0.022, 0.0055, math.radians(195), math.radians(345), (math.radians(90), 0, 0), seg=14, ring=6)
# бант на левом ухе: две петли, узелок, два хвостика
for s in (-1, 1):
    arc('cat_head', 'bow', (-0.3 + s * 0.06, 0.05, 1.46 + s * 0.02), 0.05, 0.016, 0, math.pi * 2, (math.radians(70), s * 0.4, s * 0.5), (1.15, 0.7, 1), seg=20, ring=8)
    cone('cat_head', 'bow', (-0.3 + s * 0.03, 0.06, 1.41), 0.022, 0.006, 0.08, (0.2, s * 0.6, 0), (1, 0.45, 1), seg=8)
sphere('cat_head', 'bow', (-0.3, 0.065, 1.46), (0.028, 0.024, 0.026), seg=14)

# ---------- тело: кираса с кантом, ребро, медальон, наплечники из пластин, пояс с пряжкой и кошелём, юбка из пластин ----------
sphere('cat_body', 'steel', (0, 0.02, 0.62), (0.3, 0.26, 0.3), seg=40)
sphere('cat_body', 'steel_dark', (0, -0.05, 0.64), (0.27, 0.24, 0.26), seg=32)
torus('cat_body', 'gold', (0, 0.02, 0.795), 0.205, 0.016, (0, 0, 0), (1, 0.92, 1), seg=40)       # кант горловины
arc('cat_body', 'gold', (0, 0.03, 0.5), 0.29, 0.013, math.radians(-10), math.radians(190), (0, 0, 0), (1, 0.88, 1), seg=40)  # кант низа кирасы спереди
sphere('cat_body', 'steel', (0, 0.262, 0.6), (0.026, 0.03, 0.21), seg=16)  # продольное ребро
for s in (-1, 1):  # выпуклые «рёбра» по бокам груди
    arc('cat_body', 'steel', (s * 0.03, 0.2, 0.63), 0.19, 0.008, math.radians(70 if s > 0 else 110) - 0.6 * s, math.radians(70 if s > 0 else 110) + 0.6 * s,
        (math.radians(90), 0, 0), (1, 1, 1), seg=16, ring=6)
sphere('cat_body', 'gold', (-0.115, 0.252, 0.71), (0.055, 0.02, 0.062), (0, 0, 0.45), seg=24)  # медальон — выше перевязи
sphere('cat_body', 'steel_dark', (-0.121, 0.264, 0.71), (0.034, 0.012, 0.04), (0, 0, 0.45), seg=16)
sphere('cat_body', 'gem', (-0.123, 0.271, 0.71), (0.018, 0.008, 0.02), (0, 0, 0.45), seg=12)
cone('cat_body', 'steel_dark', (0, 0, 0.415), 0.305, 0.3, 0.07, seg=32)  # набедренные полосы: две, с кантом
cone('cat_body', 'steel', (0, 0, 0.36), 0.315, 0.29, 0.06, seg=32)
torus('cat_body', 'gold', (0, 0, 0.332), 0.316, 0.009, seg=40)
cone('cat_body', 'mail', (0, 0, 0.25), 0.29, 0.315, 0.13, seg=32)
for k in range(8):  # юбка: пластины с кантом, внахлёст вокруг кольчуги
    a = (k + 0.5) / 8 * math.pi * 2
    c = (math.sin(a) * 0.3, math.cos(a) * 0.3, 0.26)
    box('cat_body', 'steel', c, (0.15, 0.03, 0.14), (math.radians(-10), 0, -a), bevel=0.3)
    box('cat_body', 'gold', (c[0] * 1.03, c[1] * 1.03, 0.19), (0.15, 0.024, 0.016), (0, 0, -a), bevel=0.3)
torus('cat_body', 'leather', (0, 0, 0.45), 0.292, 0.032, seg=40)                    # пояс
torus('cat_body', 'leather', (0, 0, 0.62), 0.305, 0.02, (0, -0.7, 0), (1, 0.92, 1), seg=40)  # перевязь
for a in (-1.05, -0.55, 0.55, 1.05):  # бляхи пояса
    sphere('cat_body', 'gold', (math.sin(a) * 0.322, math.cos(a) * 0.322, 0.45), (0.019, 0.019, 0.019), seg=12)
box('cat_body', 'gold', (0, 0.316, 0.45), (0.095, 0.022, 0.08), bevel=0.25)            # пряжка: рамка и язычок
box('cat_body', 'leather', (0, 0.323, 0.45), (0.06, 0.012, 0.045), bevel=0.3)
box('cat_body', 'gold', (0.012, 0.33, 0.45), (0.035, 0.008, 0.012), bevel=0.3)
box('cat_body', 'leather', (0.27, 0.13, 0.39), (0.1, 0.06, 0.1), (0, 0, -0.45), bevel=0.35)  # кошель на правом бедре
box('cat_body', 'leather', (0.272, 0.15, 0.425), (0.105, 0.05, 0.04), (0.25, 0, -0.45), bevel=0.35)
sphere('cat_body', 'gold', (0.286, 0.178, 0.41), (0.014, 0.01, 0.014), seg=10)
# меховой воротник — пышный: кольцо и пучки
torus('cat_body', 'fur_light', (0, 0, 0.86), 0.2, 0.08, seg=36, ring=14)
for k in range(10):
    a = k / 10 * math.pi * 2
    sphere('cat_body', 'fur_light', (math.sin(a) * 0.22, math.cos(a) * 0.2, 0.85), (0.07, 0.06, 0.06), seg=14)
# застёжка плаща на левом плече (плащ — с левого плеча, сзади): золотое кольцо с камнем
torus('cat_body', 'gold', (-0.17, -0.2, 0.86), 0.035, 0.009, (math.radians(90), 0, 0), seg=20)
sphere('cat_body', 'gem', (-0.17, -0.21, 0.86), (0.022, 0.012, 0.022), seg=12)
for s in (-1, 1):  # наплечники: три пластины от плеча вниз, у нижней — золотой кант и заклёпки
    for k, (dz, sc) in enumerate(((0.0, 1.0), (-0.055, 0.92), (-0.105, 0.84))):
        c = (s * (0.32 + k * 0.012), 0, 0.81 + dz)
        sphere('cat_body', 'steel' if k != 1 else 'steel_dark', c, (0.165 * sc, 0.165 * sc, 0.1 * sc), (0, s * (0.35 + k * 0.1), 0), seg=28)
    torus('cat_body', 'gold', (s * 0.345, 0, 0.705), 0.128, 0.009, (0, s * 0.55, 0), (1, 1.0, 1), seg=32)
    for k in range(4):  # заклёпки по переднему краю верхней пластины
        sphere('cat_body', 'gold', on_ellipsoid((s * 0.32, 0, 0.81), (0.165, 0.165, 0.1), s * 0.35, math.radians(55 + k * 22) if s > 0 else math.radians(125 - k * 22), 0.25, 1.03), (0.016, 0.016, 0.016), seg=10)


# ---------- руки: наруч, налокотник с «веером», латная перчатка с пальцами ----------
for part, s in (('cat_armL', -1), ('cat_armR', 1)):
    px, _, pz = PIVOTS[part]
    cone(part, 'steel_dark', (px + s * 0.01, 0.0, pz - 0.08), 0.078, 0.072, 0.13, seg=20)     # плечевая часть
    sphere(part, 'steel', (px + s * 0.012, 0.01, pz - 0.155), (0.082, 0.082, 0.05), seg=20)   # налокотник
    sphere(part, 'steel', (px + s * 0.02, 0.0, pz - 0.155), (0.03, 0.07, 0.05), (0, 0, 0), seg=14)  # «веер» сбоку
    torus(part, 'gold', (px + s * 0.012, 0.01, pz - 0.155), 0.08, 0.008, seg=28)
    cone(part, 'steel_dark', (px + s * 0.01, 0.0, pz - 0.235), 0.072, 0.064, 0.12, seg=20)   # наруч
    torus(part, 'gold', (px + s * 0.01, 0.0, pz - 0.29), 0.069, 0.011, seg=28)                # кант перчатки
    sphere(part, 'steel', (px, 0.0, pz - 0.34), (0.085, 0.085, 0.075), seg=24)                # кулак
    sphere(part, 'steel_dark', (px, 0.0, pz - 0.31), (0.09, 0.09, 0.03), seg=24)              # раструб перчатки
    for f in range(4):  # пальцы: согнуты вокруг рукояти (сверху вниз)
        fz = pz - 0.31 - f * 0.026
        sphere(part, 'steel', (px + s * 0.0, 0.07, fz), (0.05, 0.03, 0.016), (0, 0, 0), seg=14)
    sphere(part, 'steel', (px - s * 0.055, 0.045, pz - 0.33), (0.024, 0.03, 0.02), seg=12)    # большой палец

# ---------- ноги: набедренник, наколенник с «веером», поножи, сапоги из пластин ----------
for part, s in (('cat_legL', -1), ('cat_legR', 1)):
    px, _, pz = PIVOTS[part]
    cone(part, 'steel', (px, 0.0, pz - 0.06), 0.085, 0.088, 0.11, seg=20)
    sphere(part, 'steel_dark', (px, 0.075, pz - 0.105), (0.058, 0.035, 0.05), seg=18)          # наколенник
    sphere(part, 'steel', (px + s * 0.05, 0.05, pz - 0.105), (0.025, 0.03, 0.042), seg=12)    # «веер» снаружи
    torus(part, 'gold', (px, 0.0, pz - 0.155), 0.089, 0.01, seg=28)                           # кант поножей
    cone(part, 'steel', (px, 0.0, pz - 0.2), 0.087, 0.09, 0.09, seg=20)                       # поножи
    sphere(part, 'steel_dark', (px, 0.01, pz - 0.25), (0.09, 0.09, 0.045), seg=24)             # щиколотка
    sphere(part, 'steel', (px, 0.07, pz - 0.28), (0.088, 0.135, 0.05), seg=28)                # стопа
    sphere(part, 'steel_dark', (px, 0.15, pz - 0.288), (0.062, 0.06, 0.04), seg=20)           # носок
    arc(part, 'gold', (px, 0.075, pz - 0.258), 0.085, 0.006, math.radians(10), math.radians(170), (math.radians(80), 0, 0), (1, 1.3, 1), seg=18, ring=6)  # кант на подъёме
    torus(part, 'gold', (px, 0.02, pz - 0.235), 0.09, 0.008, (math.radians(8), 0, 0), seg=28)

# ---------- меч: рукоять в нуле, клинок — вверх ----------
cone('cat_sword', 'leather', (0, 0, 0), 0.022, 0.022, 0.16, seg=12)
for k in range(5):  # обмотка рукояти
    torus('cat_sword', 'leather', (0, 0, -0.06 + k * 0.03), 0.023, 0.006, (0, 0, 0), seg=16, ring=6)
sphere('cat_sword', 'gold', (0, 0, -0.1), (0.038, 0.038, 0.034), seg=18)      # навершие с камнем
sphere('cat_sword', 'gem', (0, 0.03, -0.1), (0.017, 0.012, 0.017), seg=12)
sphere('cat_sword', 'gem', (0, -0.03, -0.1), (0.017, 0.012, 0.017), seg=12)
box('cat_sword', 'gold', (0, 0, 0.095), (0.25, 0.04, 0.04), bevel=0.3)        # гарда с шарами на концах, перекрестье
for s in (-1, 1):
    sphere('cat_sword', 'gold', (s * 0.135, 0, 0.1), (0.026, 0.026, 0.026), seg=14)
sphere('cat_sword', 'gold', (0, 0, 0.095), (0.04, 0.03, 0.045), seg=16)
sphere('cat_sword', 'gem', (0, 0.025, 0.095), (0.014, 0.008, 0.016), seg=10)
box('cat_sword', 'steel', (0, 0, 0.48), (0.06, 0.014, 0.72), bevel=0.2)       # клинок
box('cat_sword', 'steel_dark', (0, 0, 0.44), (0.014, 0.017, 0.56), bevel=0.4) # дол с обеих сторон
cone('cat_sword', 'steel', (0, 0, 0.9), 0.03, 0.0, 0.12, s=(1, 0.25, 1), seg=4)

# ---------- склеить куски каждой части, начало координат — в точку поворота ----------
objs = []
for name, pieces in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    if len(pieces) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    pv = Vector(PIVOTS[name])
    o.data.transform(Matrix.Translation(-pv))
    o.location = pv
    objs.append(o)


# Окрас головы в цветах вершин, как на фото: кремовая, на затылке и боках (их видит игровая камера) — карамельные
# полосы табби поперёк головы, на лбу — продольные, буквой «М»; низ мордочки светлый; уши светлые с тёмными кончиками.
# Игра умножает цвет вершин на цвет материала, поэтому у глаз, носа, бантика и щёк он белый
def clamp01(x):
    return max(0.0, min(1.0, x))


def mix(a, b, k):
    return [a[i] + (b[i] - a[i]) * k for i in range(3)]


me = bpy.data.objects['cat_head'].data
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
fur_slot = [i for i, m in enumerate(me.materials) if m.name == 'fur'][0]
furry = {i for poly in me.polygons if poly.material_index == fur_slot for i in poly.vertices}
for v in me.vertices:
    if v.index not in furry:
        ca.data[v.index].color = (1, 1, 1, 1)
        continue
    p = v.co - Vector((0, 0, 0.02))  # от центра черепа (вершины уже отсчитаны от точки поворота головы)
    if abs(p.x) > 0.43 and p.z < 0.0:  # бакенбарды — светлее, с полосками на кончиках
        c = mix(LIGHT, CREAM, clamp01((abs(p.x) - 0.45) / 0.12))
    elif (p.x / 0.47) ** 2 + (p.y / 0.43) ** 2 + (p.z / 0.4) ** 2 > 1.05:  # вне черепа — ухо
        c = mix(mix(CREAM, LIGHT, 0.35), TABBY, clamp01((p.z - 0.4) / 0.09) * 0.8)
    else:
        n = noise.noise(p * 5.0)
        back = clamp01((0.15 - p.y) / 0.3)                                    # затылок и бока — 1, мордочка — 0
        brow = clamp01((p.z - 0.13) / 0.08) * clamp01(1 - abs(p.x) / 0.22) * (1 - back)  # лоб над глазами
        across = clamp01((math.sin(p.z * 30 + n * 1.1) - 0.3) / 0.35) * back
        along = clamp01((math.sin(abs(p.x) * 46 + 1.3 + n * 0.8) - 0.3) / 0.35) * brow
        c = mix(CREAM, TABBY, max(across, along))
        if p.y > 0.2 and p.z < 0.0:  # низ мордочки светлее
            c = mix(c, LIGHT, 0.6)
    ca.data[v.index].color = c + [1.0]

bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                          export_materials='EXPORT', export_yup=True, export_vertex_color='MATERIAL')
print('GLB', OUT, os.path.getsize(OUT))
for o in objs:
    print('TRIS', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))

# ---------- превью: меч в правой лапе, как в игре; шерсть оболочками — для глаза ----------
if PREVIEW:
    sw = bpy.data.objects['cat_sword']
    sw.location = Vector(PIVOTS['cat_armR']) + Vector((0, 0, -0.36))
    sw.rotation_euler = (0.35, 0, math.pi + 0.55)  # поза из buildCat (игра: −0.35 по X → в осях Blender знак меняется)
    for o in objs:
        for m in o.data.materials:
            if m.name.startswith('fur'):
                n = 8 if m.name == 'fur' else 6
                for i in range(1, n + 1):
                    k = i / n
                    s = o.copy()
                    s.data = o.data.copy()
                    col.objects.link(s)
                    d = s.modifiers.new('Shell', 'DISPLACE'); d.strength = 0.032 * k; d.mid_level = 0.0
                    for j, sm in enumerate(s.data.materials):
                        if sm.name.startswith('fur'):
                            c = sm.copy()
                            N, L = c.node_tree.nodes, c.node_tree.links
                            v = N.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 260.0
                            tc = N.new('ShaderNodeTexCoord'); L.new(tc.outputs['Object'], v.inputs['Vector'])
                            th = N.new('ShaderNodeMath'); th.operation = 'LESS_THAN'; th.inputs[1].default_value = 0.42 - 0.3 * k
                            L.new(v.outputs['Distance'], th.inputs[0])
                            L.new(th.outputs[0], N['Principled BSDF'].inputs['Alpha'])
                            s.data.materials[j] = c
                        else:
                            hide = sm.copy(); hide.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.0
                            s.data.materials[j] = hide
                break
    world = bpy.data.worlds.new('w'); scene.world = world
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.5, 0.65, 0.85, 1); bg.inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.data.color = (1, 0.93, 0.83)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(150)); col.objects.link(sun)
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for x in prefs.devices: x.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU', e)
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_x, scene.render.resolution_y = 600, 760
    scene.view_settings.view_transform = 'AgX'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 70; col.objects.link(cam); scene.camera = cam
    cam.location = (1.6, 3.2, 1.45)
    cam.rotation_euler = (Vector((0, 0, 0.8)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)

# Общая «мастерская» для генераторов моделей «Кот-рыцаря» (bridge.py, islands.py): кладка и скалы, материалы,
# простая модель из детальной (камни сплавляются в один объём и упрощаются), запекание в атлас и экспорт glTF.
# Камень везде один и тот же — правка материала здесь меняет и мосты, и острова.
#
# Всё строится в осях игры (метры, Y вверх, к камере +Z) и при сборке поворачивается в оси Blender (Z вверх);
# экспорт glTF возвращает Y вверх.
import bpy, bmesh, math, random, os
import numpy as np
from mathutils import Matrix, Vector, Euler, noise

TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'textures')  # фототекстуры Poly Haven (CC0)
GAP = 0.024         # шов между камнями
MORTAR = 0.3        # «оттенок» раствора — уходит в тёмный край палитры камня
TO_BLENDER = Matrix.Rotation(math.radians(90), 4, 'X')

# материалы по номерам граней; камень и скала — первые (их же берут мосты)
MAT_NAMES = ['stone', 'rock', 'grass', 'soil', 'plaster', 'roof_red', 'roof_blue', 'wood', 'leaves', 'pine', 'bark',
             'water', 'crystal', 'window', 'flower', 'gold', 'iron', 'petal']  # новые — только в конец: номера прежних не сдвигаются


def g2b(v):
    return Vector((v[0], -v[2], v[1]))


def mat_index(name):
    return MAT_NAMES.index(name)


class Mason:
    """детальная модель в bmesh: у каждой грани — материал и оттенок (атрибут tint; камню — случайный, раствору — тёмный)"""

    def __init__(self, soft=False):
        """soft — мягкая кладка (мост): камни ровнее и ближе по тону — после скругления (build_high) выглядят гладко"""
        self.bm = bmesh.new()
        self.t = self.bm.faces.layers.float.new('tint')
        self.soft = soft

    def _mark(self, verts, mat, tint):
        for f in {f for v in verts for f in v.link_faces}:
            f[self.t] = tint
            f.material_index = mat_index(mat)

    def block(self, c, s, rot=(0, 0, 0), tint=None, out=None, mat='stone'):
        """тёсаный камень: перекос и сколы; out — направление, куда камень может чуть выпирать из стены"""
        if out is not None:
            c = tuple(c[i] + out[i] * random.uniform(0, 0.03) for i in range(3))
        m = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal(Vector((s[0], s[1], s[2], 1)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        if tint is None:
            chip = 0.035 if self.soft else 0.08
            for v in res['verts']:
                v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * min(s) * chip
        lo, hi = (0.86, 1.12) if self.soft else (0.72, 1.25)
        self._mark(res['verts'], mat, random.uniform(lo, hi) if tint is None else tint)

    def course(self, x0, x1, y0, h, fixed, depth, length, axis='x', cuts=(), out=None, missing=0.0, jitter=0.012):
        """ряд камней от x0 до x1 вдоль оси axis на высоте y0…y0+h; cuts — пролёты без камней; missing — доля выпавших"""
        pos = x0 - random.uniform(0, 0.5) * length
        while pos < x1:
            L = length * random.uniform(0.7, 1.3)
            parts = [(max(pos, x0), min(pos + L, x1))]
            for lo, hi in cuts:
                nxt = []
                for a, b in parts:
                    if b <= lo or a >= hi:
                        nxt.append((a, b))
                        continue
                    if a < lo:
                        nxt.append((a, lo))
                    if b > hi:
                        nxt.append((hi, b))
                parts = nxt
            for a, b in parts:
                if b - a < 0.08 or random.random() < missing:
                    continue
                c, s = (a + b) / 2, b - a - GAP
                dy = random.uniform(-jitter, jitter)
                rot = (random.uniform(-0.03, 0.03), random.uniform(-0.04, 0.04), random.uniform(-0.03, 0.03))
                if axis == 'x':
                    self.block((c, y0 + h / 2 + dy, fixed), (s, h - GAP, depth), rot, out=out)
                else:
                    self.block((fixed, y0 + h / 2 + dy, c), (depth, h - GAP, s), rot, out=out)
            pos += L

    def ring(self, cx, cz, r, y0, h, n, depth=0.3, missing=0.0, crenel=False, phase=0.0):
        """кольцо камней — ряд круглой башни; crenel — зубцы (каждый второй камень)"""
        for i in range(n):
            if (crenel and i % 2) or random.random() < missing:
                continue
            a = (i + phase) / n * math.pi * 2
            L = 2 * math.pi * r / n - GAP
            self.block((cx + math.cos(a) * r, y0 + h / 2, cz + math.sin(a) * r), (depth, h - GAP, L),
                       (random.uniform(-0.03, 0.03), -a, random.uniform(-0.03, 0.03)), out=(math.cos(a), 0, math.sin(a)))

    def tower(self, cx, cz, r, y0, courses, h=0.34, crenel=True, missing_top=0.0, stone=0.5):
        """круглая башня из колец вперевязку и тёмная сердцевина; stone — длина камня; возвращает высоту верха"""
        n = max(8, round(2 * math.pi * r / stone))
        for k in range(courses):
            last = k == courses - 1
            self.ring(cx, cz, r, y0 + k * h, h, n, missing=missing_top if k >= courses - 2 else 0.0, crenel=crenel and last, phase=0.5 * (k % 2))
        self.prim('cyl', 'stone', (cx, y0 + courses * h / 2 - (h / 2 if crenel else 0), cz), (1, 1, 1),
                  r1=r - 0.1, r2=r - 0.1, depth=courses * h - (h if crenel else 0), seg=16, tint=MORTAR)
        return y0 + courses * h

    def prim(self, kind, mat, c, s=(1, 1, 1), rot=(0, 0, 0), tint=None, r1=1.0, r2=0.0, depth=1.0, seg=12, sub=2, jit=0.0):
        """простая фигура: 'cube', 'cyl' (радиусы r1 → r2 снизу вверх, высота depth), 'ico' (неровная глыба: jit),
        'gem' (шестигранный кристалл: остриё сверху и снизу)"""
        m = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal(Vector((s[0], s[1], s[2], 1)))
        up = Matrix.Rotation(-math.pi / 2, 4, 'X')  # конусы bmesh стоят вдоль Z — кладём на Y (вверх в игре)
        if kind == 'cube':
            res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        elif kind == 'cyl':
            res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=m @ up)
        elif kind == 'gem':
            a = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=6, radius1=1.0, radius2=0.0, depth=0.6, matrix=m @ Matrix.Translation((0, 0.3, 0)) @ up)
            b = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=6, radius1=0.0, radius2=1.0, depth=0.4, matrix=m @ Matrix.Translation((0, -0.2, 0)) @ up)
            self._mark(a['verts'], mat, 1.0)
            self._mark(b['verts'], mat, 1.0)
            return
        else:
            res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0, matrix=m)
            for v in res['verts']:
                v.co += (v.co - Vector(c)).normalized() * random.uniform(-jit, jit) * min(s)
        self._mark(res['verts'], mat, (random.uniform(0.72, 1.25) if mat == 'stone' else 1.0) if tint is None else tint)

    def rock(self, x, y, z, rx, ry, rz, mat='rock', sub=3):
        """скальная глыба: верх плоский и широкий, книзу сужается неровным остриём; sub — густота сетки (большим глыбам — больше)"""
        tb = bmesh.new()
        bmesh.ops.create_icosphere(tb, subdivisions=sub, radius=1.0)
        off = Vector((random.uniform(0, 100), random.uniform(0, 100), random.uniform(0, 100))) if sub >= 4 else None
        for v in tb.verts:
            n = v.co.copy()
            # большим глыбам — плавные неровности шумом: случайный сдвиг каждой вершины на густой сетке даёт «ежа»
            k = 1 + (0.3 * noise.noise(n * 2.2 + off) if off is not None else random.uniform(-0.22, 0.22))
            v.co = Vector((n.x * rx * k, n.y * ry * (1.25 if n.y < 0 else 0.35) * k, n.z * rz * k))
            if v.co.y < -ry * 0.6:
                v.co.x *= 0.55
                v.co.z *= 0.55
            v.co += Vector((x, y, z))
        me = bpy.data.meshes.new('tmp')
        tb.to_mesh(me)
        tb.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self.bm.faces.ensure_lookup_table()
        for i in range(n0, len(self.bm.faces)):
            self.bm.faces[i][self.t] = 1.0
            self.bm.faces[i].material_index = mat_index(mat)


# ---------- материалы детальной модели ----------

def _photo(N, L, file, repeat):
    """фототекстура из textures/ проекцией «коробкой» в координатах объекта (развёртка не нужна); repeat — повторов на метр.
    Возвращает её яркость: из неё и тон камня, и рельеф"""
    img = bpy.data.images.load(os.path.join(TEX_DIR, file), check_existing=True)
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (repeat, repeat, repeat)
    L.new(tc.outputs['Object'], mp.inputs['Vector'])
    t = N.new('ShaderNodeTexImage')
    t.image = img
    t.projection = 'BOX'
    t.projection_blend = 0.3
    L.new(mp.outputs['Vector'], t.inputs['Vector'])
    bw = N.new('ShaderNodeRGBToBW')
    L.new(t.outputs['Color'], bw.inputs['Color'])
    return t, bw.outputs['Val']


def _ramp_material(name, colors, rough=0.9, bump=0.3, scale=5.0, emit=None, metallic=0.0, brick=None):
    """простой материал: шум по цветовой шкале colors [(позиция, (r, g, b)), …], рельеф шумом;
    brick — черепица/кладка текстурой «кирпичи» в координатах объекта: (цвет1, цвет2, раствор, масштаб)"""
    m = bpy.data.materials.new(name)
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = scale; noise.inputs['Detail'].default_value = 8.0
    if brick:
        tc = N.new('ShaderNodeTexCoord')
        bt = N.new('ShaderNodeTexBrick')
        bt.inputs['Color1'].default_value = brick[0] + (1,)
        bt.inputs['Color2'].default_value = brick[1] + (1,)
        bt.inputs['Mortar'].default_value = brick[2] + (1,)
        bt.inputs['Scale'].default_value = brick[3]
        bt.inputs['Mortar Size'].default_value = 0.03
        L.new(tc.outputs['Object'], bt.inputs['Vector'])
        L.new(bt.outputs['Color'], b.inputs['Base Color'])
        bb = N.new('ShaderNodeBump'); bb.inputs['Strength'].default_value = 0.5
        L.new(bt.outputs['Fac'], bb.inputs['Height']); L.new(bb.outputs['Normal'], b.inputs['Normal'])
    else:
        ramp = N.new('ShaderNodeValToRGB')
        cr = ramp.color_ramp
        cr.elements[0].position, cr.elements[0].color = colors[0][0], colors[0][1] + (1,)
        cr.elements[1].position, cr.elements[1].color = colors[-1][0], colors[-1][1] + (1,)
        for pos, col in colors[1:-1]:
            cr.elements.new(pos).color = col + (1,)
        L.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        L.new(ramp.outputs['Color'], b.inputs['Base Color'])
        if bump:
            bb = N.new('ShaderNodeBump'); bb.inputs['Strength'].default_value = bump
            L.new(noise.outputs['Fac'], bb.inputs['Height']); L.new(bb.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    if emit:
        b.inputs['Emission Color'].default_value = emit + (1,)
        b.inputs['Emission Strength'].default_value = 1.0
    else:
        b.inputs['Emission Color'].default_value = (0, 0, 0, 1)
    return m


def materials(crevice_glow=False):
    """все материалы в порядке MAT_NAMES. Камень: тёплый серо-коричневый, низ темнее, светлые сколы на рёбрах,
    мох в щелях; crevice_glow — маска швов в «свечении» (мосты: по ней светится лава огненных островов).
    В «свечении» у остальных — только окна и кристаллы: в игре они загораются ночью"""
    stone = bpy.data.materials.new('Stone')
    nt = stone.node_tree
    N, Ln = nt.nodes, nt.links
    bsdf = N['Principled BSDF']
    attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'tint'
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 6.0; noise.inputs['Detail'].default_value = 10.0
    fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY_ADD'
    Ln.new(attr.outputs['Fac'], fac.inputs[0]); fac.inputs[1].default_value = 0.75; fac.inputs[2].default_value = -0.42
    add = N.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    Ln.new(noise.outputs['Fac'], add.inputs[0]); add.inputs[1].default_value = 0.4
    Ln.new(fac.outputs[0], add.inputs[2])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    cr.elements[0].position = 0.08; cr.elements[0].color = (0.05, 0.035, 0.022, 1)
    cr.elements[1].position = 0.8; cr.elements[1].color = (0.62, 0.47, 0.30, 1)
    cr.elements.new(0.3).color = (0.21, 0.15, 0.095, 1)
    cr.elements.new(0.55).color = (0.40, 0.29, 0.18, 1)
    Ln.new(add.outputs[0], ramp.inputs['Fac'])
    geo = N.new('ShaderNodeNewGeometry')
    sep = N.new('ShaderNodeSeparateXYZ'); Ln.new(geo.outputs['Position'], sep.inputs[0])
    hgt = N.new('ShaderNodeMapRange'); hgt.inputs['From Min'].default_value = -2.6; hgt.inputs['From Max'].default_value = 0.0
    hgt.inputs['To Min'].default_value = 0.5; hgt.inputs['To Max'].default_value = 1.0
    Ln.new(sep.outputs['Z'], hgt.inputs['Value'])
    shade = N.new('ShaderNodeVectorMath'); shade.operation = 'SCALE'
    Ln.new(ramp.outputs['Color'], shade.inputs[0]); Ln.new(hgt.outputs['Result'], shade.inputs['Scale'])
    wear = N.new('ShaderNodeMapRange'); wear.inputs['From Min'].default_value = 0.52; wear.inputs['From Max'].default_value = 0.62
    wear.inputs['To Min'].default_value = 1.0; wear.inputs['To Max'].default_value = 1.35
    Ln.new(geo.outputs['Pointiness'], wear.inputs['Value'])
    lit = N.new('ShaderNodeVectorMath'); lit.operation = 'SCALE'
    Ln.new(shade.outputs['Vector'], lit.inputs[0]); Ln.new(wear.outputs['Result'], lit.inputs['Scale'])
    # фактура тёсаного камня (фото rock_08): его яркость — множитель тона около единицы (поры, пятна, выветривание)
    ph, ph_val = _photo(N, Ln, 'rock_08_diff_1k.jpg', 0.8)
    det = N.new('ShaderNodeMapRange'); det.inputs['From Min'].default_value = 0.05; det.inputs['From Max'].default_value = 0.45
    det.inputs['To Min'].default_value = 0.78; det.inputs['To Max'].default_value = 1.12  # мягко: сильнее — камень как наждачка
    Ln.new(ph_val, det.inputs['Value'])
    lit2 = N.new('ShaderNodeVectorMath'); lit2.operation = 'SCALE'
    Ln.new(lit.outputs['Vector'], lit2.inputs[0]); Ln.new(det.outputs['Result'], lit2.inputs['Scale'])
    nsep = N.new('ShaderNodeSeparateXYZ'); Ln.new(geo.outputs['Normal'], nsep.inputs[0])
    up = N.new('ShaderNodeMapRange'); up.inputs['From Min'].default_value = 0.5; up.inputs['From Max'].default_value = 0.9
    Ln.new(nsep.outputs['Z'], up.inputs['Value'])
    mn = N.new('ShaderNodeTexNoise'); mn.inputs['Scale'].default_value = 2.5; mn.inputs['Detail'].default_value = 8.0
    mt = N.new('ShaderNodeMapRange'); mt.inputs['From Min'].default_value = 0.55; mt.inputs['From Max'].default_value = 0.7
    Ln.new(mn.outputs['Fac'], mt.inputs['Value'])
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.08
    crev = N.new('ShaderNodeMapRange'); crev.inputs['From Min'].default_value = 0.6; crev.inputs['From Max'].default_value = 0.95
    crev.inputs['To Min'].default_value = 1.0; crev.inputs['To Max'].default_value = 0.35
    Ln.new(ao.outputs['AO'], crev.inputs['Value'])
    m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'
    Ln.new(up.outputs['Result'], m1.inputs[0]); Ln.new(mt.outputs['Result'], m1.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
    Ln.new(m1.outputs[0], m2.inputs[0]); Ln.new(crev.outputs['Result'], m2.inputs[1])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    sk = {s.identifier: s for s in mix.inputs}
    Ln.new(m2.outputs[0], sk['Factor_Float'])
    Ln.new(lit2.outputs['Vector'], sk['A_Color'])
    sk['B_Color'].default_value = (0.13, 0.19, 0.05, 1)
    Ln.new([s for s in mix.outputs if s.identifier == 'Result_Color'][0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.86
    # рельеф: крупные неровности шумом + мелкая фактура из яркости фото
    bsum = N.new('ShaderNodeMath'); bsum.operation = 'MULTIPLY_ADD'
    Ln.new(ph_val, bsum.inputs[0]); bsum.inputs[1].default_value = 0.9
    Ln.new(noise.outputs['Fac'], bsum.inputs[2])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.5; bump.inputs['Distance'].default_value = 0.02
    Ln.new(bsum.outputs[0], bump.inputs['Height']); Ln.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if crevice_glow:  # где камень заслонён соседями — «трещина»
        ao2 = N.new('ShaderNodeAmbientOcclusion'); ao2.inputs['Distance'].default_value = 0.05
        mask = N.new('ShaderNodeMapRange')
        mask.inputs['From Min'].default_value = 0.45; mask.inputs['From Max'].default_value = 0.9
        mask.inputs['To Min'].default_value = 1.0; mask.inputs['To Max'].default_value = 0.0
        Ln.new(ao2.outputs['AO'], mask.inputs['Value'])
        Ln.new(mask.outputs['Result'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    else:
        bsdf.inputs['Emission Color'].default_value = (0, 0, 0, 1)

    # скала: слоистая порода (фото cliff_side) поверх тёмной шкалы — так она не спорит по тону с кладкой
    rock = bpy.data.materials.new('Rock')
    rn, rl = rock.node_tree.nodes, rock.node_tree.links
    rb = rn['Principled BSDF']
    rv = rn.new('ShaderNodeTexVoronoi'); rv.inputs['Scale'].default_value = 4.0
    rno = rn.new('ShaderNodeTexNoise'); rno.inputs['Scale'].default_value = 3.0; rno.inputs['Detail'].default_value = 12.0
    rr = rn.new('ShaderNodeValToRGB')
    rr.color_ramp.elements[0].color = (0.07, 0.055, 0.04, 1)
    rr.color_ramp.elements[1].color = (0.32, 0.25, 0.18, 1)
    rl.new(rno.outputs['Fac'], rr.inputs['Fac'])
    rph, rph_val = _photo(rn, rl, 'cliff_side_diff_1k.jpg', 0.45)
    rmix = rn.new('ShaderNodeMix'); rmix.data_type = 'RGBA'
    rs = {s.identifier: s for s in rmix.inputs}
    rs['Factor_Float'].default_value = 0.65
    rl.new(rr.outputs['Color'], rs['A_Color'])
    rl.new(rph.outputs['Color'], rs['B_Color'])
    rl.new([s for s in rmix.outputs if s.identifier == 'Result_Color'][0], rb.inputs['Base Color'])
    rb.inputs['Roughness'].default_value = 0.95
    rsum = rn.new('ShaderNodeMath'); rsum.operation = 'MULTIPLY_ADD'
    rl.new(rph_val, rsum.inputs[0]); rsum.inputs[1].default_value = 2.0
    rl.new(rv.outputs['Distance'], rsum.inputs[2])
    rbump = rn.new('ShaderNodeBump'); rbump.inputs['Strength'].default_value = 0.8
    rl.new(rsum.outputs[0], rbump.inputs['Height'])
    rl.new(rbump.outputs['Normal'], rb.inputs['Normal'])
    rb.inputs['Emission Color'].default_value = (0, 0, 0, 1)

    return [stone, rock,
            _ramp_material('Grass', [(0.3, (0.06, 0.15, 0.03)), (0.7, (0.18, 0.32, 0.07))], bump=0.25, scale=8.0),
            _ramp_material('Soil', [(0.3, (0.09, 0.055, 0.03)), (0.7, (0.18, 0.11, 0.06))], scale=6.0),
            _ramp_material('Plaster', [(0.3, (0.55, 0.47, 0.36)), (0.7, (0.72, 0.64, 0.50))], bump=0.15, scale=4.0),
            _ramp_material('RoofRed', None, rough=0.8, brick=((0.42, 0.09, 0.05), (0.55, 0.14, 0.07), (0.12, 0.03, 0.02), 7.0)),
            _ramp_material('RoofBlue', None, rough=0.7, brick=((0.08, 0.13, 0.36), (0.11, 0.19, 0.46), (0.03, 0.04, 0.10), 7.0)),
            _ramp_material('Wood', [(0.3, (0.12, 0.07, 0.035)), (0.7, (0.24, 0.14, 0.07))], scale=12.0),
            _ramp_material('Leaves', [(0.3, (0.05, 0.15, 0.03)), (0.7, (0.18, 0.36, 0.07))], bump=0.5, scale=9.0),
            _ramp_material('Pine', [(0.3, (0.025, 0.08, 0.035)), (0.7, (0.07, 0.19, 0.07))], bump=0.4, scale=9.0),
            _ramp_material('Bark', [(0.3, (0.11, 0.06, 0.025)), (0.7, (0.24, 0.14, 0.06))], bump=0.6, scale=14.0),  # тёплая: тёмная кора под небом уходила в лиловый
            _ramp_material('Water', [(0.3, (0.05, 0.22, 0.42)), (0.7, (0.12, 0.38, 0.62))], rough=0.1, bump=0.05, scale=3.0),
            _ramp_material('Crystal', [(0.3, (0.32, 0.16, 0.70)), (0.7, (0.55, 0.36, 0.95))], rough=0.2, bump=0.0, emit=(0.55, 0.30, 1.0)),
            _ramp_material('Window', [(0.3, (0.04, 0.03, 0.02)), (0.7, (0.08, 0.06, 0.04))], bump=0.0, emit=(1.0, 0.62, 0.22)),
            _ramp_material('Flower', [(0.3, (0.80, 0.25, 0.45)), (0.7, (0.95, 0.55, 0.65))], bump=0.0, scale=20.0),
            _ramp_material('Gold', [(0.3, (0.62, 0.40, 0.08)), (0.7, (0.85, 0.62, 0.18))], rough=0.35, bump=0.0),
            _ramp_material('Iron', [(0.3, (0.05, 0.05, 0.055)), (0.7, (0.13, 0.13, 0.14))], rough=0.5, bump=0.1, scale=10.0),
            _ramp_material('Petal', [(0.3, (0.82, 0.82, 0.78)), (0.7, (0.95, 0.95, 0.92))], bump=0.0, scale=20.0)]


# ---------- детальная модель → простая ----------

def build_high(M, name, at, mats, bevel=0.02, segments=2):
    """bevel, segments — скругление рёбер камней (мост — шире и мягче: камни-подушки, без острых углов)"""
    bmesh.ops.transform(M.bm, matrix=TO_BLENDER, verts=M.bm.verts)
    me = bpy.data.meshes.new(name + '_high')
    M.bm.to_mesh(me)
    M.bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name + '_high', me)
    ob.location = g2b(at)
    bpy.context.scene.collection.objects.link(ob)
    bev = ob.modifiers.new('Bevel', 'BEVEL')
    bev.width = bevel
    bev.segments = segments
    bev.limit_method = 'ANGLE'
    return ob


def tri_count(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def keep_largest(me):
    """после сплавления внутри остаются замкнутые пустоты — отдельные оболочки; оставляем только внешнюю"""
    bm = bmesh.new()
    bm.from_mesh(me)
    seen, comps = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        seen.add(f)
        stack, comp = [f], []
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    bmesh.ops.delete(bm, geom=[f for c in comps[1:] for f in c], context='FACES')
    bm.to_mesh(me)
    bm.free()
    return [len(c) for c in comps[1:]]  # размеры выброшенного: крупное — значит, деталь не касалась основы


def build_low(high, name, at, tris, voxel, props=None, smooth=0):
    """камни сплавляются вокселями (швы уже вокселя закрываются, силуэт остаётся), внутренние пустоты
    выбрасываются, остальное упрощается до tris треугольников. props — в glTF extras (размер, точки привязки)"""
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    tmp = high.copy()
    scene.collection.objects.link(tmp)
    rm = tmp.modifiers.new('Remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    holes = keep_largest(me)
    if smooth:  # сгладить ступеньки вокселей и рёбра силуэта до упрощения — края камней скруглены и в простой модели
        bm = bmesh.new()
        bm.from_mesh(me)
        for _ in range(smooth):
            bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.to_mesh(me)
        bm.free()
    low = bpy.data.objects.new(name, me)
    low.location = g2b(at)
    for k, v in (props or {}).items():
        low[k] = v
    scene.collection.objects.link(low)
    dm = low.modifiers.new('Decimate', 'DECIMATE')
    dm.ratio = min(1.0, tris / max(1, tri_count(me)))
    dg.update()
    me2 = bpy.data.meshes.new_from_object(low.evaluated_get(dg))
    low.modifiers.clear()
    low.data = me2
    bpy.data.meshes.remove(me)
    # слоты материалов достались от детальной модели — простой нужен свой единственный (иначе запекание пишет мимо атласа)
    me2.materials.clear()
    me2.polygons.foreach_set('material_index', [0] * len(me2.polygons))
    print('LOW', name, tri_count(me2), 'tris; removed shells (faces):', sorted(holes, reverse=True)[:8])
    return low


# ---------- развёртка, запекание, экспорт ----------

def unwrap(lows, weights, top=1.6):
    """общий атлас; weights — во сколько раз больше места куску (линейно); top — во сколько раз больше места граням,
    смотрящим вверх: верх плит и дёрна камера видит ближе всего (развёртываются отдельно — у верха свои острова)"""
    bpy.ops.object.select_all(action='DESELECT')
    for lo in lows:
        lo.select_set(True)
    bpy.context.view_layer.objects.active = lows[0]
    bpy.ops.object.mode_set(mode='EDIT')
    for up in (True, False):
        bpy.ops.mesh.select_all(action='DESELECT')
        for lo in lows:
            bm = bmesh.from_edit_mesh(lo.data)
            for f in bm.faces:
                if (f.normal.z > 0.7) == up:
                    f.select_set(True)
            bmesh.update_edit_mesh(lo.data)
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    for lo, wgt in zip(lows, weights):
        bm = bmesh.new()
        bm.from_mesh(lo.data)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            k = wgt * (top if f.normal.z > 0.7 else 1.0)
            for l in f.loops:
                l[uvl].uv = l[uvl].uv * k
        bm.to_mesh(lo.data)
        bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')


def use_gpu(scene):
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for dev in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = dev
                prefs.get_devices()
                if any(x.type == dev for x in prefs.devices):
                    for x in prefs.devices:
                        x.use = True
                    scene.cycles.device = 'GPU'
                    print('GPU:', dev)
                    return
            except TypeError:
                continue
    except Exception as e:
        print('GPU не включился:', e)


def bake_atlas(highs, lows, work, color_size=2048, normal_size=2048, emit_size=1024, ao=0.8):
    """цвет (с затенением AO внутри), рельеф и «свечение» с детальных моделей на простые; картинки — в work.
    ao — сила затенения в швах (издали сильное затенение мелких швов превращается в рябь)"""
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Bake')
    scene.world = world
    world.light_settings.distance = 0.6  # радиус затенения AO
    use_gpu(scene)
    for lo in lows:  # простые модели не заслоняют детальные при запекании
        lo.visible_shadow = False
        lo.visible_diffuse = False
    target = bpy.data.materials.new('BakeTarget')
    tnode = target.node_tree.nodes.new('ShaderNodeTexImage')
    target.node_tree.nodes.active = tnode
    for lo in lows:
        lo.data.materials.append(target)

    def image(name, size, data):
        img = bpy.data.images.new(name, size, size, alpha=False)
        if data:
            img.colorspace_settings.name = 'Non-Color'
        return img

    def bake(kind, img, samples, **kw):
        tnode.image = img
        scene.cycles.samples = samples
        for i, (hi, lo) in enumerate(zip(highs, lows)):
            bpy.ops.object.select_all(action='DESELECT')
            hi.select_set(True)
            lo.select_set(True)
            bpy.context.view_layer.objects.active = lo
            bpy.ops.object.bake(type=kind, use_clear=(i == 0), use_selected_to_active=True, cage_extrusion=0.05,
                                max_ray_distance=0.12, margin=8, **kw)
        print('baked', kind)

    color = image('color', color_size, False)
    normal = image('normal', normal_size, True)
    occl = image('ao', color_size, True)
    emit = image('emit', emit_size, False)
    bake('DIFFUSE', color, 1, pass_filter={'COLOR'})
    bake('NORMAL', normal, 1, normal_space='TANGENT')
    bake('AO', occl, 96)
    bake('EMIT', emit, 16)
    n = color_size * color_size * 4
    c = np.empty(n, np.float32)
    a = np.empty(n, np.float32)
    color.pixels.foreach_get(c)
    occl.pixels.foreach_get(a)
    k = (1 - ao) + ao * np.clip(a[0::4], 0, 1) ** 1.3
    for ch in range(3):
        c[ch::4] *= k
    color.pixels.foreach_set(c)
    for img in (color, normal, occl, emit):
        img.filepath_raw = os.path.join(work, img.name + '.png')
        img.file_format = 'PNG'
        img.save()
    return color, normal, emit


def export(lows, color, normal, emit, out, name='Baked'):
    """материал для игры: цвет, рельеф, «свечение» (маска швов или окна с кристаллами) → glb с extras"""
    exp = bpy.data.materials.new(name)
    N, Ln = exp.node_tree.nodes, exp.node_tree.links
    bsdf = N['Principled BSDF']
    ti = N.new('ShaderNodeTexImage'); ti.image = color
    Ln.new(ti.outputs['Color'], bsdf.inputs['Base Color'])
    ni = N.new('ShaderNodeTexImage'); ni.image = normal
    nm = N.new('ShaderNodeNormalMap')
    Ln.new(ni.outputs['Color'], nm.inputs['Color'])
    Ln.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    mi = N.new('ShaderNodeTexImage'); mi.image = emit
    Ln.new(mi.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.9
    for lo in lows:
        lo.data.materials.clear()
        lo.data.materials.append(exp)
    bpy.ops.object.select_all(action='DESELECT')
    for lo in lows:
        lo.select_set(True)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_tangents=True,
                              export_image_format='WEBP', export_image_quality=90, export_materials='EXPORT', export_yup=True,
                              export_extras=True)
    print('GLB', out, os.path.getsize(out))
    return bsdf


def preview(path, cam_at, look_at, size=(720, 1280)):
    """рендер для глаза: небо, тёплое солнце, камера как в игре (оси игры)"""
    scene = bpy.context.scene
    world = scene.world
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.42, 0.62, 0.92, 1)
    bg.inputs['Strength'].default_value = 0.8
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.93, 0.82)
    sun.rotation_euler = (math.radians(48), math.radians(-14), math.radians(-35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle_y = math.radians(60)
    cam.location = g2b(cam_at)
    cam.rotation_euler = (g2b(look_at) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

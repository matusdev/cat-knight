# Общие детали для стилизованных фигурок — пса (dog.py) и врагов (enemies.py): материалы, куски-примитивы,
# склейка кусков в жёсткие части с точкой поворота и экспорт в glTF. Части — то, что игра крутит без костей
# (голова, лапы, крылья); точки поворота — там же, где их группы в main.js.
#
# Координаты кусков — в осях игры (x вправо, y вверх, z — к камере), до масштаба фигурки в игре;
# G и S переводят их в оси Blender (Z вверх, игровая +z — это −Y).
# Краска куска — пара (материал, цвет в вершинах): материалов у фигурки мало (каждый материал части — отдельный
# вызов отрисовки), а разные цвета — в вершинах. Игра умножает цвет вершин на цвет материала.
import bpy, bmesh, math, os
from mathutils import Vector, Euler, Matrix


def G(x, y, z):
    """точка в осях игры → оси Blender"""
    return (x, -z, y)


def S(rx, ry, rz):
    """полуоси (вбок, вверх, вглубь) в осях игры → оси Blender"""
    return (rx, rz, ry)


def material(name, base, rough=0.5, metal=0.0, vcol=False, double=False):
    """vcol — цвет из вершин (слой Col); double — видна с обеих сторон (перепонки крыльев)"""
    m = bpy.data.materials.new(name)
    N, L = m.node_tree.nodes, m.node_tree.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = tuple(base) + (1,)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.use_backface_culling = not double
    if vcol:
        a = N.new('ShaderNodeVertexColor')
        a.layer_name = 'Col'
        L.new(a.outputs['Color'], b.inputs['Base Color'])
    return m


def xf(c, rot=(0, 0, 0), s=(1, 1, 1)):
    return Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal(Vector(tuple(s) + (1,)))


def clamp01(x):
    return max(0.0, min(1.0, x))


def mix(a, b, k):
    return [a[i] + (b[i] - a[i]) * k for i in range(3)]


class Figure:
    def __init__(self, pivots, mats, paints):
        """pivots: часть → точка поворота (оси игры); mats: имя → материал; paints: краска → (имя материала, цвет)"""
        self.pivots = pivots
        self.parts = {k: [] for k in pivots}
        self.M = mats
        self.paints = paints
        self.col = bpy.context.scene.collection

    def _finish(self, part, me, paint, smooth=True):
        mat, color = self.paints[paint]
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for d in ca.data:
            d.color = tuple(color) + (1,)
        me.materials.append(self.M[mat])
        if smooth:
            me.shade_smooth()
        else:
            me.shade_flat()

    def _add(self, part, bm, paint, smooth=True):
        me = bpy.data.meshes.new(part)
        bm.to_mesh(me)
        bm.free()
        self._finish(part, me, paint, smooth)
        o = bpy.data.objects.new(part, me)
        self.col.objects.link(o)
        self.parts[part].append(o)
        return o

    @staticmethod
    def _bm():
        bm = bmesh.new()
        bm.loops.layers.uv.new('UVMap')  # без слоя calc_uvs ничего не пишет; развёртка нужна оболочкам шерсти
        return bm

    def sphere(self, part, paint, c, s, rot=(0, 0, 0), seg=24, dome=False):
        """dome — только верхняя половина (купол шляпки); низ открыт"""
        bm = self._bm()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0, calc_uvs=True)
        if dome:
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
        bm.transform(xf(c, rot, s))
        return self._add(part, bm, paint)

    def rock(self, part, paint, c, s, seed=0, rough=0.16):
        """угловатый валун: икосфера со сдвинутыми вершинами и плоскими гранями (камень, а не облако)"""
        import random
        rnd = random.Random(seed)
        bm = self._bm()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, calc_uvs=True)
        for v in bm.verts:
            v.co *= 1 + rnd.uniform(-rough, rough)
        bm.transform(xf(c, (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3)), s))
        return self._add(part, bm, paint, smooth=False)

    def cone(self, part, paint, c, r1, r2, h, rot=(0, 0, 0), s=(1, 1, 1), seg=16, uvs=1.0):
        """uvs — доля текстуры прядей на развёртке: у маленьких деталей меньше, иначе пряди мельче пикселя"""
        bm = self._bm()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=xf(c, rot, s), calc_uvs=True)
        uv = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                lp[uv].uv *= uvs
        return self._add(part, bm, paint)

    def box(self, part, paint, c, s, rot=(0, 0, 0), bevel=0.18, shape=None):
        """shape(v) — правка вершин до фаски (например, скос клинка)"""
        bm = self._bm()
        bmesh.ops.create_cube(bm, size=1.0, matrix=xf(c, rot, s), calc_uvs=True)
        if shape:
            for v in bm.verts:
                shape(v)
        if bevel:
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(s) * bevel, segments=1, affect='EDGES')
        return self._add(part, bm, paint)

    def torus(self, part, paint, c, R, r, rot=(0, 0, 0), half=False):
        """half — только нижняя половина кольца (дуга улыбки)"""
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=32, minor_segments=10)
        t = bpy.context.active_object
        if half:
            bm = bmesh.new()
            bm.from_mesh(t.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.002], context='VERTS')
            bm.to_mesh(t.data)
            bm.free()
        t.data.transform(xf(c, rot))
        self._finish(part, t.data, paint)
        self.parts[part].append(t)
        return t

    def sheet(self, part, paint, pts):
        """плоская перепонка (крыло) по контуру — точки в осях игры, по порядку обхода"""
        bm = self._bm()
        bm.faces.new([bm.verts.new(G(*p)) for p in pts])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        uv = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x, lp.vert.co.y)
        return self._add(part, bm, paint)

    def slab(self, part, paint, pts, thick, bevel=0.0):
        """пластина толщиной thick по плоскому контуру (точки в осях игры, в плоскости z = const): лезвие, табличка"""
        bm = self._bm()
        face = bm.faces.new([bm.verts.new(G(*p)) for p in pts])
        bm.normal_update()
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        moved = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=moved, vec=Vector((0, thick, 0)))  # вглубь от камеры: игровая −z — это +Y Blender
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if bevel:
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES')
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        uv = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x, lp.vert.co.z)
        return self._add(part, bm, paint, smooth=False)

    def rod(self, part, paint, a, b, r1, r2=None, seg=8):
        """стержень (кость крыла, лапка) от точки a к точке b — оси игры; r2 — радиус у b"""
        a, b = Vector(G(*a)), Vector(G(*b))
        d = b - a
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
        return self.cone(part, paint, tuple((a + b) / 2), r1, r1 if r2 is None else r2, d.length, tuple(rot), seg=seg)

    def join(self):
        """склеить куски каждой части, начало координат — в точку поворота"""
        objs = []
        for name, pieces in self.parts.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in pieces:
                o.select_set(True)
            bpy.context.view_layer.objects.active = pieces[0]
            if len(pieces) > 1:
                bpy.ops.object.join()
            o = bpy.context.view_layer.objects.active
            o.name = name
            o.data.name = name
            pv = Vector(G(*self.pivots[name]))
            o.data.transform(Matrix.Translation(-pv))
            o.location = pv
            objs.append(o)
        return objs


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_materials='EXPORT', export_yup=True, export_vertex_color='MATERIAL')
    print('GLB', path, os.path.getsize(path))


def preview(path, cam_at, look_at, lens=60, size=(600, 700)):
    """превью в Cycles: небо, солнце, камера из cam_at на look_at (оси Blender)"""
    scene = bpy.context.scene
    world = bpy.data.worlds.new('w')
    scene.world = world
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.5, 0.65, 0.85, 1)
    bg.inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.data.color = (1, 0.93, 0.83)
    sun.rotation_euler = (math.radians(50), math.radians(-10), math.radians(-20))
    scene.collection.objects.link(sun)
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for x in prefs.devices:
            x.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU', e)
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'AgX'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = lens
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = cam_at
    cam.rotation_euler = (Vector(look_at) - Vector(cam_at)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

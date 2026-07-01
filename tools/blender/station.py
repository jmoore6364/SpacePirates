# Headless Blender: a deep-space station for Void Corsair. Central spindle hub, a
# habitation ring with a lit window band, connecting spokes, solar-panel arrays, a
# comms dish and running lights. Exported as GLB. Run:
#   blender --background --python station.py -- <out.glb>
import bpy, math, sys
from mathutils import Vector

OUT = sys.argv[-1]

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def mat(name, base, emit=(0, 0, 0), strength=0.0, metallic=0.7, rough=0.45):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Emission Color'].default_value = (*emit, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m

HULL = mat('hull', (0.62, 0.64, 0.70), metallic=0.8, rough=0.4)          # light metal
DARK = mat('dark', (0.16, 0.18, 0.22), metallic=0.7, rough=0.5)          # panels/greebles
PANEL = mat('panel', (0.06, 0.10, 0.28), emit=(0.05, 0.12, 0.35), strength=0.6, metallic=0.3, rough=0.4)  # solar
WIN = mat('win', (0.9, 0.8, 0.55), emit=(1.0, 0.85, 0.55), strength=2.2)  # warm windows
REDL = mat('redlight', (1, 0.1, 0.1), emit=(1, 0.05, 0.05), strength=6)
GRNL = mat('grnlight', (0.1, 1, 0.2), emit=(0.05, 1, 0.1), strength=6)
CYAN = mat('cyan', (0.3, 0.9, 1.0), emit=(0.3, 0.9, 1.0), strength=4)

def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc)
    o = bpy.context.active_object; o.rotation_euler = rot; o.data.materials.append(m); return o

def torus(major, minor, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=10, location=loc)
    o = bpy.context.active_object; o.rotation_euler = rot; o.data.materials.append(m); return o

def box(dims, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = dims; o.rotation_euler = rot; o.data.materials.append(m); return o

# central spindle hub (along Z) + command modules
cyl(1.8, 15, (0, 0, 0), HULL)
cyl(2.2, 2.0, (0, 0, 6.5), HULL)                      # upper collar
box((3.2, 3.2, 2.2), (0, 0, 8.2), HULL)               # command block
cyl(1.2, 3, (0, 0, 10), DARK)                          # docking spire
# hub window bands
for z in (-4, -1.5, 1, 3.5):
    torus(1.85, 0.18, (0, 0, z), WIN, rot=(math.radians(90), 0, 0))

# habitation ring (in the XY plane) + its lit window band
torus(9.0, 1.1, (0, 0, 0), HULL)
torus(9.0, 0.45, (0, 0, 0.0), WIN)                     # glowing window band on the ring rim
# 4 connecting spokes hub -> ring
for a in range(4):
    ang = a * math.pi / 2
    mx, my = math.cos(ang) * 5.4, math.sin(ang) * 5.4
    box((7.2, 0.6, 0.6), (mx, my, 0), DARK, rot=(0, 0, ang))

# solar-panel arrays on booms out the sides
for sx in (-1, 1):
    box((0.4, 0.4, 6), (sx * 13.5, 0, 0), HULL, rot=(0, math.radians(90), 0))  # boom
    for k in (-1, 1):
        box((7, 0.15, 4.5), (sx * 17, 0, k * 3.4), PANEL, rot=(0, math.radians(90), 0))

# comms dish on top
cyl(2.2, 0.4, (0, 0, 11.6), HULL, rot=(math.radians(20), 0, 0), verts=12)
box((0.15, 0.15, 2), (0, -0.6, 12.4), DARK, rot=(math.radians(20), 0, 0))

# running lights at extremities
box((0.4, 0.4, 0.4), (0, 0, 11.2), REDL)
box((0.4, 0.4, 0.4), (13.5, 0, 3.6), GRNL)
box((0.4, 0.4, 0.4), (-13.5, 0, -3.6), REDL)
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    box((0.35, 0.35, 0.35), (math.cos(ang) * 9, math.sin(ang) * 9, 1.4), CYAN)

# join, center, export
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.join()
st = bpy.context.active_object; st.name = 'Station'
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
st.location = (0, 0, 0)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True)
print('WROTE', OUT)

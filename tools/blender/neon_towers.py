# Headless Blender: 4 neon-city skyscraper variants for Void Corsair's towers style.
# Each is a separate object (TowerA..D), modelled tall along Blender Z with its base at
# Z=0 (so glTF export -> upright, base at Y=0, no extra rotation needed). Emissive window
# bands + corner strips + a distinctive top. Run:
#   blender --background --python neon_towers.py -- <out.glb>
import bpy, math, sys

OUT = sys.argv[-1]

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def mat(name, base, emit=(0, 0, 0), strength=0.0, metallic=0.6, rough=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Emission Color'].default_value = (*emit, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m

HULL = mat('hull', (0.05, 0.06, 0.09), metallic=0.7, rough=0.55)

def box(dims, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = dims; o.data.materials.append(material); return o

def cone(r, depth, loc, material):
    bpy.ops.mesh.primitive_cone_add(radius1=r, depth=depth, vertices=6, location=loc)
    o = bpy.context.active_object; o.data.materials.append(material); return o

def sphere(r, loc, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=16, ring_count=8, location=loc)
    o = bpy.context.active_object; o.data.materials.append(material); return o

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    o.location = (0, 0, 0)
    return o

def tower(name, tiers, neon, top):
    win = mat(name + '_win', (0.02, 0.02, 0.03), emit=neon, strength=0.9)   # lit windows (soft, won't bloom into beams)
    beacon = mat(name + '_beacon', neon, emit=neon, strength=2.5)
    parts, z = [], 0.0
    base_w = tiers[0][0]
    for (w, h) in tiers:
        parts.append(box((w, w, h), (0, 0, z + h / 2), HULL))
        for k in range(1, int(h // 6.0) + 1):                      # horizontal window bands (sparse for perf)
            parts.append(box((w + 0.18, w + 0.18, 0.45), (0, 0, z + k * 2.6), win))
        z += h
    H = z
    for sx in (-1, 1):                                             # glowing corner strips
        for sy in (-1, 1):
            parts.append(box((0.28, 0.28, H), (sx * base_w / 2, sy * base_w / 2, H / 2), win))
    if top == 'spire':
        parts.append(box((0.5, 0.5, 6), (0, 0, H + 3), HULL))
        parts.append(box((0.9, 0.9, 0.9), (0, 0, H + 6), beacon))
    elif top == 'antenna':
        for ax in (-1.2, 0, 1.2):
            parts.append(box((0.16, 0.16, 4 + abs(ax)), (ax, 0, H + (4 + abs(ax)) / 2), HULL))
        parts.append(box((base_w * 0.5, base_w * 0.5, 0.6), (0, 0, H + 0.3), beacon))
    elif top == 'dome':
        parts.append(sphere(base_w * 0.42, (0, 0, H), beacon))
    else:  # crown
        for sx in (-1, 1):
            parts.append(box((0.6, 0.6, 3), (sx * base_w * 0.32, 0, H + 1.5), beacon))
    return join(parts, name)

tower('TowerA', [(9, 14), (7, 12), (5.2, 10)], (0.35, 0.85, 1.0), 'spire')    # cyan stepped
tower('TowerB', [(10, 32)], (1.0, 0.3, 0.7), 'antenna')                       # magenta slab
tower('TowerC', [(10, 10), (8.2, 10), (6.4, 10), (4.6, 8)], (1.0, 0.8, 0.3), 'dome')  # gold tapered
tower('TowerD', [(8, 22), (6, 14)], (0.3, 1.0, 0.7), 'crown')                 # teal twin

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True)
print('WROTE', OUT)

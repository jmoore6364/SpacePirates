# Headless Blender model: the pirate "Warlord" capital ship for Void Corsair.
# Menacing, asymmetric-ish low-poly: long dark hull, forward mandible claws, a bridge
# tower, engine nacelles with red glow, dorsal spines and side turrets. Faces -Z.
# Run: blender --background --python warlord.py
import bpy, math, sys

OUT = sys.argv[-1]  # output .glb path passed after a '--'

# --- clean scene ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

def mat(name, base, emit=(0, 0, 0), strength=0.0, metallic=0.7, rough=0.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Emission Color'].default_value = (*emit, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m

HULL = mat('hull', (0.10, 0.04, 0.05), metallic=0.8, rough=0.5)            # near-black red steel
PLATE = mat('plate', (0.16, 0.08, 0.10), metallic=0.7, rough=0.55)         # lighter plating
RED = mat('accent', (0.9, 0.18, 0.25), emit=(0.9, 0.12, 0.18), strength=2.2)  # glowing red trim
ENGINE = mat('engine', (1.0, 0.45, 0.2), emit=(1.0, 0.4, 0.15), strength=5.0)  # hot exhaust

def box(dims, loc, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = dims
    o.rotation_euler = rot
    o.data.materials.append(material)
    return o

def cyl(r, depth, loc, material, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc)
    o = bpy.context.active_object
    o.rotation_euler = rot
    o.data.materials.append(material)
    return o

# central hull (long along Z, nose at -Z)
box((1.7, 1.2, 6.2), (0, 0, 0), HULL)
# forward command spear (tapered nose)
box((1.0, 0.85, 2.0), (0, 0.05, -3.6), PLATE)
box((0.5, 0.5, 1.2), (0, 0.05, -4.7), RED)  # glowing prow ram
# two forward mandible claws sweeping in toward the prow
for sx in (-1, 1):
    box((0.35, 0.6, 3.6), (sx * 1.25, -0.1, -3.0), HULL, rot=(0, 0, sx * 0.12))
    box((0.3, 0.45, 1.2), (sx * 0.95, -0.1, -4.8), RED, rot=(0, math.radians(sx * 14), 0))  # claw tips
# bridge / command tower on the dorsal spine
box((0.9, 1.1, 1.6), (0, 1.0, 0.6), PLATE)
box((0.6, 0.4, 0.9), (0, 1.7, 0.4), RED)  # lit bridge windows
# dorsal spines (a jagged ridge)
for z in (-1.2, 0.0, 1.2, 2.2):
    box((0.18, 0.9 - abs(z) * 0.08, 0.5), (0, 0.9, z), HULL, rot=(math.radians(18), 0, 0))
# side weapon sponsons + turret barrels
for sx in (-1, 1):
    box((0.6, 0.5, 2.4), (sx * 1.15, -0.1, 1.2), PLATE)
    for tz in (0.4, 1.6):
        cyl(0.12, 1.4, (sx * 1.45, -0.05, tz - 0.7), HULL, rot=(math.radians(90), 0, 0))
# engine block + three glowing nacelles at the rear (+Z)
box((1.5, 1.0, 0.8), (0, 0, 3.4), PLATE)
for ex in (-0.55, 0.0, 0.55):
    cyl(0.42, 0.7, (ex, 0, 3.9), HULL)            # nacelle housing (axis Z)
    cyl(0.34, 0.18, (ex, 0, 4.28), ENGINE)        # glowing exhaust disc
# tail fins
for sx in (-1, 1):
    box((0.12, 1.3, 1.0), (sx * 0.7, 0.4, 3.4), HULL, rot=(0, 0, math.radians(sx * 22)))

# bake each object's rotation+scale into its mesh BEFORE joining (otherwise the join
# target's transform warps the combined geometry), then join into one object
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.join()
ship = bpy.context.active_object
ship.name = 'Warlord'
# Blender is Z-up but glTF is Y-up: rotate -90° about X so the ship's length (modelled
# along Blender Z) ends up along glTF Z (the game's forward axis) instead of pointing up.
ship.rotation_euler = (math.radians(-90), 0, 0)
bpy.ops.object.transform_apply(rotation=True)
# center on origin
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
ship.location = (0, 0, 0)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True)
print('WROTE', OUT)

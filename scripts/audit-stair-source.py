import bpy
import sys
from mathutils import Vector

bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or not obj.name.startswith(("Cube_Material", "Cube010_Material", "Plane_Material")):
        continue
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = [round(min(point[i] for point in points), 3) for i in range(3)]
    high = [round(max(point[i] for point in points), 3) for i in range(3)]
    print("STAIR_AUDIT", obj.name, low, high)

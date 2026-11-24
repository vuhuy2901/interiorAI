import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return minimum, maximum


source = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
result = []
for obj in (obj for obj in bpy.context.scene.objects if obj.type == "MESH"):
    vertex_count = len(obj.data.vertices)
    parent = list(range(vertex_count))

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left

    for edge in obj.data.edges:
        union(edge.vertices[0], edge.vertices[1])
    components = {}
    for vertex in obj.data.vertices:
        components.setdefault(find(vertex.index), []).append(vertex.index)
    for component_index, indices in enumerate(components.values()):
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
        minimum = [min(point[axis] for point in points) for axis in range(3)]
        maximum = [max(point[axis] for point in points) for axis in range(3)]
        result.append({
            "index": len(result),
            "component": component_index,
            "name": obj.name,
            "materials": [slot.material.name if slot.material else "" for slot in obj.material_slots],
            "min": minimum,
            "max": maximum,
            "size": [maximum[axis] - minimum[axis] for axis in range(3)],
            "center": [(minimum[axis] + maximum[axis]) / 2 for axis in range(3)],
            "vertices": len(indices),
        })
print("ATELIER_COMPONENTS=" + json.dumps(result, ensure_ascii=False))

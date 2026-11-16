import bpy
import json
import os
import sys


source = sys.argv[sys.argv.index("--") + 1]
output = sys.argv[sys.argv.index("--") + 2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
bpy.context.view_layer.update()

objects = list(bpy.context.scene.objects)
meshes = [obj for obj in objects if obj.type == "MESH"]
materials = list(bpy.data.materials)
images = list(bpy.data.images)

from mathutils import Vector
world_points = []
for obj in meshes:
    for corner in obj.bound_box:
        world_points.append(obj.matrix_world @ Vector(corner))

if world_points:
    mins = [min(point[i] for point in world_points) for i in range(3)]
    maxs = [max(point[i] for point in world_points) for i in range(3)]
else:
    mins = maxs = [0.0, 0.0, 0.0]

def material_report(mat):
    textures = []
    extensions = []
    if mat.use_nodes and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                image = node.image
                textures.append({
                    "name": image.name,
                    "size": list(image.size),
                    "packed": bool(image.packed_file),
                    "filepath": image.filepath,
                    "colorspace": image.colorspace_settings.name,
                })
    return {
        "name": mat.name,
        "blend_method": getattr(mat, "surface_render_method", None),
        "use_backface_culling": mat.use_backface_culling,
        "textures": textures,
    }

def object_report(obj):
    parent = obj.parent.name if obj.parent else None
    return {
        "name": obj.name,
        "type": obj.type,
        "parent": parent,
        "children": [child.name for child in obj.children],
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "dimensions": list(obj.dimensions),
        "mesh": obj.data.name if obj.type == "MESH" else None,
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "vertices": len(obj.data.vertices) if obj.type == "MESH" else 0,
        "polygons": len(obj.data.polygons) if obj.type == "MESH" else 0,
        "uv_layers": [layer.name for layer in obj.data.uv_layers] if obj.type == "MESH" else [],
    }

report = {
    "source": source,
    "file_size_bytes": os.path.getsize(source),
    "scene_count": len(bpy.data.scenes),
    "object_count": len(objects),
    "mesh_object_count": len(meshes),
    "mesh_datablock_count": len(bpy.data.meshes),
    "material_count": len(materials),
    "image_count": len(images),
    "camera_count": len([obj for obj in objects if obj.type == "CAMERA"]),
    "light_count": len([obj for obj in objects if obj.type == "LIGHT"]),
    "bounds_min_m": mins,
    "bounds_max_m": maxs,
    "bounds_size_m": [maxs[i] - mins[i] for i in range(3)],
    "total_vertices": sum(len(obj.data.vertices) for obj in meshes),
    "total_polygons": sum(len(obj.data.polygons) for obj in meshes),
    "root_objects": [obj.name for obj in objects if obj.parent is None],
    "objects": [object_report(obj) for obj in objects],
    "materials": [material_report(mat) for mat in materials],
    "images": [{
        "name": image.name,
        "size": list(image.size),
        "packed": bool(image.packed_file),
        "filepath": image.filepath,
        "source": image.source,
    } for image in images],
}

with open(output, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2, ensure_ascii=False)
print(json.dumps({key: report[key] for key in (
    "object_count", "mesh_object_count", "material_count", "image_count",
    "camera_count", "light_count", "bounds_min_m", "bounds_max_m", "bounds_size_m",
    "total_vertices", "total_polygons"
)}, indent=2))

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main() -> None:
    separator = sys.argv.index("--")
    source = Path(sys.argv[separator + 1]).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = [min(point[index] for point in corners) for index in range(3)]
    maximum = [max(point[index] for point in corners) for index in range(3)]
    print("ATELIER_GLB_AUDIT=" + json.dumps({
        "bounds_min_m": minimum,
        "bounds_max_m": maximum,
        "bounds_size_m": [maximum[index] - minimum[index] for index in range(3)],
        "imported_mesh_count": len(meshes),
        "objects": [obj.name for obj in meshes],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

import json
import sys

import bpy


def main() -> None:
    cameras = []
    for obj in bpy.data.objects:
        if obj.type != "CAMERA":
            continue
        direction = obj.matrix_world.to_quaternion() @ __import__("mathutils").Vector((0.0, 0.0, -1.0))
        cameras.append({
            "name": obj.name,
            "location": list(obj.matrix_world.translation),
            "direction": list(direction),
            "lens_mm": obj.data.lens,
            "active": bpy.context.scene.camera == obj,
        })
    print("ATELIER_CAMERAS=" + json.dumps(cameras))


if __name__ == "__main__":
    main()

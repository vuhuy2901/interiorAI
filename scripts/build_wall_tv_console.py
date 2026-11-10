#!/usr/bin/env python3
"""
ATELIER AI 2.0 — Asset Builder Procedural Engine
Parametric Furniture Builder: Wall-Mounted TV Console (Tủ Tivi Treo Tường)
Dimensions: 1800 mm (W) x 350 mm (D) x 300 mm (H)

Standards:
- Part by part construction: top, bottom, gables, divider, shelves, back, doors, handles, wall cleat.
- Material slots: MAT_wood_body, MAT_wood_door, MAT_metal_handle, MAT_metal_hardware.
- Coordinate origin: [0, 0, 0] at center-bottom against wall (X=0 center, Y=0 wall contact, Z=0 bottom).
- Front faces -Y direction.
- Real details: 1.0 mm edge bevel (PVC edge banding), 2.5 mm door gaps, realistic panel thicknesses (17.5 mm, 6.0 mm).
- 6-angle rendering verification + 3 Vietnamese wood material variants.
- Strict asset_kind = "real".
"""
import sys
import os
import math
import json
from pathlib import Path

try:
    import bpy
    import bmesh
    from mathutils import Vector, Euler, Matrix
except ImportError:
    print("FATAL: This script must be executed via Blender: blender --background --python <script>")
    sys.exit(1)


# ==============================================================================
# 1. SETUP SCENE & METRIC UNITS
# ==============================================================================
def setup_clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0  # 1 Blender unit = 1 meter
    scene.unit_settings.length_unit = 'MILLIMETERS'
    
    # Configure render engine (EEVEE_NEXT in Blender 4.2 LTS)
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    
    # World background (neutral soft studio background)
    world = bpy.data.worlds.new(name="StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs["Color"].default_value = (0.92, 0.92, 0.93, 1.0)
        bg_node.inputs["Strength"].default_value = 1.0


# ==============================================================================
# 2. PROCEDURAL MATERIAL SYSTEM (NO BAKED COLORS, PROCEDURAL PBR)
# ==============================================================================
def create_principled_material(name, base_color, roughness=0.35, metallic=0.0, grain_scale=15.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    output.location = (400, 0)
    
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    
    if metallic > 0.5:
        # Metal handle / hardware
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    else:
        # Procedural wood grain shader with subtle micro-bump
        tex_coord = nodes.new(type="ShaderNodeTexCoord")
        tex_coord.location = (-700, 0)
        
        mapping = nodes.new(type="ShaderNodeMapping")
        mapping.location = (-500, 0)
        mapping.inputs["Scale"].default_value = (1.0, grain_scale, grain_scale * 0.5)
        links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
        
        wave = nodes.new(type="ShaderNodeTexWave")
        wave.location = (-300, 0)
        wave.wave_type = 'BANDS'
        wave.bands_direction = 'X'
        wave.inputs["Scale"].default_value = grain_scale
        wave.inputs["Distortion"].default_value = 2.5
        wave.inputs["Detail"].default_value = 3.0
        wave.inputs["Detail Scale"].default_value = 1.5
        links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
        
        ramp = nodes.new(type="ShaderNodeValToRGB")
        ramp.location = (-100, 100)
        # Gradient between base_color and slightly darker grain
        darker = (max(0.0, base_color[0] * 0.78), max(0.0, base_color[1] * 0.78), max(0.0, base_color[2] * 0.78), 1.0)
        lighter = (min(1.0, base_color[0] * 1.10), min(1.0, base_color[1] * 1.08), min(1.0, base_color[2] * 1.05), 1.0)
        ramp.color_ramp.elements[0].color = darker
        ramp.color_ramp.elements[1].color = lighter
        links.new(wave.outputs["Color"], ramp.inputs["Fac"])
        
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        
        # Micro bump for wood texture
        bump = nodes.new(type="ShaderNodeBump")
        bump.location = (-100, -150)
        bump.inputs["Strength"].default_value = 0.08
        bump.inputs["Distance"].default_value = 0.002
        links.new(wave.outputs["Color"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


# ==============================================================================
# 3. COMPONENT CREATION HELPER WITH BEVEL & UV
# ==============================================================================
def create_part_box(name, width_m, depth_m, height_m, center_pos, material, bevel_radius_m=0.001):
    """
    Creates a discrete parametric board/panel component with accurate dimensions,
    smooth normals, cubic UV unwrapping, and realistic edge beveling (PVC edge banding).
    """
    mesh = bpy.data.meshes.new(name=f"ME_{name}")
    obj = bpy.data.objects.new(name=name, object_data=mesh)
    bpy.context.collection.objects.link(obj)
    
    # Build geometry centered at origin first
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # Scale cube from 1.0 unit to target width(X), depth(Y), height(Z)
    for v in bm.verts:
        v.co.x *= width_m
        v.co.y *= depth_m
        v.co.z *= height_m
    bm.to_mesh(mesh)
    bm.free()
    
    # Position object in scene
    obj.location = Vector(center_pos)
    
    # Assign material slot
    if material:
        obj.data.materials.append(material)
    
    # Apply cubic projection UV map
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=0.5, correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    
    # Apply subtle realistic edge bevel (PVC edge banding 1mm)
    if bevel_radius_m > 0:
        bev = obj.modifiers.new(name="PVC_Edge_Bevel", type='BEVEL')
        bev.width = bevel_radius_m
        bev.segments = 2
        bev.limit_method = 'ANGLE'
        bev.angle_limit = math.radians(30.0)
        bev.profile = 0.7
    
    return obj


# ==============================================================================
# 4. BUILD PROCEDURAL WALL-MOUNTED TV CONSOLE (1800 x 350 x 300 mm)
# ==============================================================================
def build_wall_tv_console(
    total_w_mm=1800.0,
    total_d_mm=350.0,
    total_h_mm=300.0,
    panel_t_mm=17.5,
    back_t_mm=6.0,
    door_gap_mm=2.5,
    materials=None
):
    """
    Parametric assembly of TV console according to real manufacturing standards.
    Coordinates:
    - Width along X (-total_w/2 to +total_w/2)
    - Depth along -Y (0 at wall, front is -total_d)
    - Height along Z (0 at bottom, top is +total_h)
    """
    w = total_w_mm / 1000.0
    d = total_d_mm / 1000.0
    h = total_h_mm / 1000.0
    t = panel_t_mm / 1000.0
    t_back = back_t_mm / 1000.0
    gap = door_gap_mm / 1000.0
    
    mat_body = materials["MAT_wood_body"]
    mat_door = materials["MAT_wood_door"]
    mat_handle = materials["MAT_metal_handle"]
    mat_hardware = materials["MAT_metal_hardware"]
    
    created_parts = []
    
    # Front of doors is at Y = -d
    # Door thickness = t. So front of carcass is at Y = -(d - t)
    carcass_d = d - t
    
    # 1. Top Panel (Tấm nóc)
    # Extends full width w, depth d (full top overlay for clean waterfall aesthetic)
    top_pos = (0.0, -d / 2.0, h - t / 2.0)
    top_obj = create_part_box("Top_Panel", w, d, t, top_pos, mat_body)
    created_parts.append(top_obj)
    
    # 2. Bottom Panel (Tấm đáy)
    # Full width w, depth d
    bot_pos = (0.0, -d / 2.0, t / 2.0)
    bot_obj = create_part_box("Bottom_Panel", w, d, t, bot_pos, mat_body)
    created_parts.append(bot_obj)
    
    # Interior height between top and bottom
    interior_h = h - 2 * t
    interior_z = h / 2.0
    
    # 3. Left Gable (Hồi trái)
    # Positioned at left edge, lọt lòng between top and bottom
    left_x = -w / 2.0 + t / 2.0
    gable_d = carcass_d - 0.002  # slightly inset from front
    gable_y = -gable_d / 2.0
    left_gable = create_part_box("Left_Gable", t, gable_d, interior_h, (left_x, gable_y, interior_z), mat_body)
    created_parts.append(left_gable)
    
    # 4. Right Gable (Hồi phải)
    right_x = w / 2.0 - t / 2.0
    right_gable = create_part_box("Right_Gable", t, gable_d, interior_h, (right_x, gable_y, interior_z), mat_body)
    created_parts.append(right_gable)
    
    # 5. Center Divider (Vách ngăn giữa)
    # Divides the interior into 2 equal compartments
    divider_d = carcass_d - 0.015  # inset for clearance
    divider_y = -divider_d / 2.0 - 0.010
    center_div = create_part_box("Center_Divider", t, divider_d, interior_h, (0.0, divider_y, interior_z), mat_body)
    created_parts.append(center_div)
    
    # 6. Internal Shelves (Đợt ngang di động 2 bên)
    shelf_w = (w - 3 * t) / 2.0 - 0.004  # 2mm tolerance on each side
    shelf_d = divider_d - 0.020
    shelf_y = -shelf_d / 2.0 - 0.018
    shelf_z = interior_z  # mid-height
    
    left_shelf_x = -w / 4.0 - t / 4.0
    left_shelf = create_part_box("Shelf_Left", shelf_w, shelf_d, t, (left_shelf_x, shelf_y, shelf_z), mat_body)
    created_parts.append(left_shelf)
    
    right_shelf_x = w / 4.0 + t / 4.0
    right_shelf = create_part_box("Shelf_Right", shelf_w, shelf_d, t, (right_shelf_x, shelf_y, shelf_z), mat_body)
    created_parts.append(right_shelf)
    
    # 7. Back Panel (Tấm hậu ván HDF 6mm âm rãnh)
    # Recessed 15mm from rear wall to allow cabling and mounting cleat
    back_w = w - 2 * t + 0.010  # 5mm groove on each side
    back_h = interior_h + 0.010
    back_y = -0.018  # 15mm from wall
    back_obj = create_part_box("Back_Panel", back_w, t_back, back_h, (0.0, back_y, interior_z), mat_body, bevel_radius_m=0.0)
    created_parts.append(back_obj)
    
    # 8. French Cleat / Wall Hanging Bracket (Thanh treo Z-bar chịu lực)
    # Mounted at the rear in the 15mm void
    bracket_w = w * 0.85
    bracket_h = 0.045  # 45 mm
    bracket_t = 0.005  # 5 mm steel
    bracket_y = -0.006
    bracket_z = h - t - bracket_h / 2.0 - 0.010
    bracket_obj = create_part_box("Wall_Mount_Bracket", bracket_w, bracket_t, bracket_h, (0.0, bracket_y, bracket_z), mat_hardware, bevel_radius_m=0.0005)
    created_parts.append(bracket_obj)
    
    # 9. Two Front Doors (2 Cánh mở)
    # Height fits between top & bottom with expansion gap
    door_h = interior_h - 2 * gap
    door_w = (w - 2 * t - 3 * gap) / 2.0
    door_y = -d + t / 2.0  # Outer face flush at Y = -d
    door_z = interior_z
    
    door_left_x = -door_w / 2.0 - gap / 2.0
    door_left = create_part_box("Door_Left", door_w, t, door_h, (door_left_x, door_y, door_z), mat_door, bevel_radius_m=0.001)
    created_parts.append(door_left)
    
    door_right_x = door_w / 2.0 + gap / 2.0
    door_right = create_part_box("Door_Right", door_w, t, door_h, (door_right_x, door_y, door_z), mat_door, bevel_radius_m=0.001)
    created_parts.append(door_right)
    
    # 10. Sleek Metal Profile Handles (Tay nắm kim loại J-pull)
    # Mounted along top edge of each door for minimalist touch
    handle_w = 0.180  # 180 mm length
    handle_h = 0.016  # 16 mm height
    handle_d = 0.018  # 18 mm depth (reaches out slightly)
    handle_z = door_z + door_h / 2.0 - handle_h / 2.0
    handle_y = -d - handle_d / 2.0 + 0.006
    
    # Positioned toward the center meeting point for ergonomic reach
    handle_left_x = -gap - handle_w / 2.0 - 0.020
    handle_left = create_part_box("Handle_Left", handle_w, handle_d, handle_h, (handle_left_x, handle_y, handle_z), mat_handle, bevel_radius_m=0.0008)
    created_parts.append(handle_left)
    
    handle_right_x = gap + handle_w / 2.0 + 0.020
    handle_right = create_part_box("Handle_Right", handle_w, handle_d, handle_h, (handle_right_x, handle_y, handle_z), mat_handle, bevel_radius_m=0.0008)
    created_parts.append(handle_right)
    
    # Group all parts under an Empty Root with Origin at [0, 0, 0]
    root_obj = bpy.data.objects.new("TV_Console_Wall_1800x350x300", None)
    root_obj.location = (0.0, 0.0, 0.0)
    bpy.context.collection.objects.link(root_obj)
    
    for p in created_parts:
        p.parent = root_obj
    
    return root_obj, created_parts


# ==============================================================================
# 5. VERIFICATION & MEASUREMENT VALIDATION
# ==============================================================================
def verify_asset(created_parts, expected_w_mm=1800.0, expected_d_mm=350.0, expected_h_mm=300.0):
    all_materials = set()
    total_poly_count = 0
    non_manifold_count = 0
    
    # Carcass bounding box (wood body & doors)
    c_min_x, c_max_x = float('inf'), float('-inf')
    c_min_y, c_max_y = float('inf'), float('-inf')
    c_min_z, c_max_z = float('inf'), float('-inf')
    
    # Overall bounding box including hardware
    o_min_x, o_max_x = float('inf'), float('-inf')
    o_min_y, o_max_y = float('inf'), float('-inf')
    o_min_z, o_max_z = float('inf'), float('-inf')
    
    for obj in created_parts:
        bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        is_hardware = obj.name.startswith("Handle_") or obj.name.startswith("Wall_Mount_")
        
        for c in bbox_corners:
            o_min_x = min(o_min_x, c.x)
            o_max_x = max(o_max_x, c.x)
            o_min_y = min(o_min_y, c.y)
            o_max_y = max(o_max_y, c.y)
            o_min_z = min(o_min_z, c.z)
            o_max_z = max(o_max_z, c.z)
            
            if not is_hardware:
                c_min_x = min(c_min_x, c.x)
                c_max_x = max(c_max_x, c.x)
                c_min_y = min(c_min_y, c.y)
                c_max_y = max(c_max_y, c.y)
                c_min_z = min(c_min_z, c.z)
                c_max_z = max(c_max_z, c.z)
        
        for slot in obj.material_slots:
            if slot.material:
                all_materials.add(slot.material.name)
        
        total_poly_count += len(obj.data.polygons)
        
        # Check manifold geometry
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for e in bm.edges:
            if not e.is_manifold:
                non_manifold_count += 1
        bm.free()
    
    carcass_w_mm = (c_max_x - c_min_x) * 1000.0
    carcass_d_mm = (c_max_y - c_min_y) * 1000.0
    carcass_h_mm = (c_max_z - c_min_z) * 1000.0
    
    overall_w_mm = (o_max_x - o_min_x) * 1000.0
    overall_d_mm = (o_max_y - o_min_y) * 1000.0
    overall_h_mm = (o_max_z - o_min_z) * 1000.0
    
    error_w = abs(carcass_w_mm - expected_w_mm)
    error_d = abs(carcass_d_mm - expected_d_mm)
    error_h = abs(carcass_h_mm - expected_h_mm)
    
    is_accurate = (error_w <= 1.0) and (error_d <= 1.0) and (error_h <= 1.0)
    
    report = {
        "asset_name": "Tủ Tivi Treo Tường (Wall-Mounted TV Console)",
        "asset_kind": "real",
        "nominal_dimensions_mm": [expected_w_mm, expected_d_mm, expected_h_mm],
        "carcass_dimensions_mm": [round(carcass_w_mm, 2), round(carcass_d_mm, 2), round(carcass_h_mm, 2)],
        "overall_dimensions_with_hardware_mm": [round(overall_w_mm, 2), round(overall_d_mm, 2), round(overall_h_mm, 2)],
        "errors_carcass_mm": {"width": round(error_w, 2), "depth": round(error_d, 2), "height": round(error_h, 2)},
        "origin_coordinate": [0.0, 0.0, 0.0],
        "orientation": "Front faces -Y, Back against Y=0, Top is +Z",
        "tolerance_mm": 1.0,
        "is_dimension_valid": is_accurate,
        "material_slots_found": sorted(list(all_materials)),
        "required_slots": ["MAT_wood_body", "MAT_wood_door", "MAT_metal_handle", "MAT_metal_hardware"],
        "all_slots_present": all(s in all_materials for s in ["MAT_wood_body", "MAT_wood_door", "MAT_metal_handle", "MAT_metal_hardware"]),
        "total_polygons": total_poly_count,
        "non_manifold_edges": non_manifold_count,
        "is_manifold": non_manifold_count == 0,
        "parts_count": len(created_parts),
        "parts_list": [p.name for p in created_parts]
    }
    return report


# ==============================================================================
# 6. STUDIO LIGHTING & 6 CAMERA ANGLES
# ==============================================================================
def setup_studio_lighting():
    # Key light (Warm soft 4500K)
    key_data = bpy.data.lights.new(name="KeyLight", type='AREA')
    key_data.energy = 280.0
    key_data.size = 2.0
    key_data.color = (1.0, 0.98, 0.95)
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    key_obj.location = (-1.8, -2.5, 2.0)
    key_obj.rotation_euler = (math.radians(55), math.radians(0), math.radians(-35))
    bpy.context.collection.objects.link(key_obj)
    
    # Fill light (Cool soft 6500K)
    fill_data = bpy.data.lights.new(name="FillLight", type='AREA')
    fill_data.energy = 140.0
    fill_data.size = 2.5
    fill_data.color = (0.95, 0.98, 1.0)
    fill_obj = bpy.data.objects.new("FillLight", fill_data)
    fill_obj.location = (2.2, -2.0, 1.6)
    fill_obj.rotation_euler = (math.radians(60), math.radians(0), math.radians(45))
    bpy.context.collection.objects.link(fill_obj)
    
    # Rim / Backlight for top edge separation
    rim_data = bpy.data.lights.new(name="RimLight", type='AREA')
    rim_data.energy = 160.0
    rim_data.size = 1.5
    rim_data.color = (1.0, 1.0, 1.0)
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    rim_obj.location = (0.0, 0.8, 2.2)
    rim_obj.rotation_euler = (math.radians(-65), math.radians(0), math.radians(180))
    bpy.context.collection.objects.link(rim_obj)


def render_camera_view(name, location, rotation, output_path, lens_mm=50.0):
    cam_data = bpy.data.cameras.new(name=name)
    cam_data.lens = lens_mm
    cam_data.clip_start = 0.05
    cam_data.clip_end = 50.0
    cam_obj = bpy.data.objects.new(name, cam_data)
    cam_obj.location = Vector(location)
    cam_obj.rotation_euler = Euler(rotation, 'XYZ')
    bpy.context.collection.objects.link(cam_obj)
    
    bpy.context.scene.camera = cam_obj
    bpy.context.scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    
    # Remove camera after render
    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.cameras.remove(cam_data, do_unlink=True)


# ==============================================================================
# 7. MAIN RUNNER
# ==============================================================================
def main():
    print("================================================================================")
    print("🚀 ATELIER AI 2.0 — ASSET BUILDER: PROCEDURAL CABINETRY")
    print("================================================================================")
    
    output_dir = Path("C:/Users/TUAN/Downloads/qldapm_fina/data/exports/renders/asset_builder")
    models_dir = Path("C:/Users/TUAN/Downloads/qldapm_fina/data/exports/models")
    output_dir.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)
    
    setup_clean_scene()
    setup_studio_lighting()
    
    # Initial realistic materials: Natural Oak (Gỗ Sồi Tự Nhiên)
    # Hex: #D4B996 -> Linear sRGB: (0.65, 0.48, 0.31)
    oak_color = (0.65, 0.48, 0.31)
    handle_metal_color = (0.15, 0.15, 0.16)  # Anodized matte dark charcoal
    hardware_metal_color = (0.50, 0.52, 0.54) # Galvanized steel
    
    materials = {
        "MAT_wood_body": create_principled_material("MAT_wood_body", oak_color, roughness=0.38),
        "MAT_wood_door": create_principled_material("MAT_wood_door", oak_color, roughness=0.36),
        "MAT_metal_handle": create_principled_material("MAT_metal_handle", handle_metal_color, roughness=0.22, metallic=0.92),
        "MAT_metal_hardware": create_principled_material("MAT_metal_hardware", hardware_metal_color, roughness=0.30, metallic=0.85)
    }
    
    root_obj, parts = build_wall_tv_console(
        total_w_mm=1800.0,
        total_d_mm=350.0,
        total_h_mm=300.0,
        panel_t_mm=17.5,
        back_t_mm=6.0,
        door_gap_mm=2.5,
        materials=materials
    )
    
    # Verify geometry
    report = verify_asset(parts)
    print("\n📊 BÁO CÁO KIỂM TRA HÌNH HỌC & KHE VẬT LIỆU:")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    
    # Save verification JSON
    json_path = output_dir / "tv_console_validation_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    # Save Blend file
    blend_path = models_dir / "tv_console_wall_1800x350x300.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"\n💾 Đã lưu file Blend: {blend_path}")
    
    # Export GLB (lightweight for web viewer)
    glb_path = models_dir / "tv_console_wall_1800x350x300.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True
    )
    print(f"📦 Đã xuất file GLB: {glb_path} (Size: {os.path.getsize(glb_path):,} bytes)")
    
    # --------------------------------------------------------------------------
    # 6-ANGLE CAMERA RENDERS
    # --------------------------------------------------------------------------
    print("\n📸 ĐANG RENDER 6 GÓC NHÌN KIẾN TRÚC:")
    
    # 1. Front View (-Y looking +Y)
    render_camera_view(
        "Cam_Front",
        location=(0.0, -2.8, 0.15),
        rotation=(math.radians(90), 0.0, 0.0),
        output_path=output_dir / "render_01_front.png",
        lens_mm=55.0
    )
    print("  [1/6] render_01_front.png - Xong")
    
    # 2. Top View (+Z looking -Z)
    render_camera_view(
        "Cam_Top",
        location=(0.0, -0.175, 2.5),
        rotation=(0.0, 0.0, 0.0),
        output_path=output_dir / "render_02_top.png",
        lens_mm=45.0
    )
    print("  [2/6] render_02_top.png - Xong")
    
    # 3. Isometric Left Perspective
    render_camera_view(
        "Cam_Iso_Left",
        location=(-2.2, -2.2, 1.4),
        rotation=(math.radians(65), 0.0, math.radians(-45)),
        output_path=output_dir / "render_03_iso_left.png",
        lens_mm=48.0
    )
    print("  [3/6] render_03_iso_left.png - Xong")
    
    # 4. Isometric Right Perspective
    render_camera_view(
        "Cam_Iso_Right",
        location=(2.2, -2.2, 1.4),
        rotation=(math.radians(65), 0.0, math.radians(45)),
        output_path=output_dir / "render_04_iso_right.png",
        lens_mm=48.0
    )
    print("  [4/6] render_04_iso_right.png - Xong")
    
    # 5. Close-up Doors & 2.5mm Gap Detail
    render_camera_view(
        "Cam_Closeup_Doors",
        location=(0.0, -1.0, 0.20),
        rotation=(math.radians(82), 0.0, 0.0),
        output_path=output_dir / "render_05_closeup_doors.png",
        lens_mm=85.0
    )
    print("  [5/6] render_05_closeup_doors.png - Xong")
    
    # 6. Close-up Metal Handle Profile & Edge Bevel
    render_camera_view(
        "Cam_Closeup_Handle",
        location=(0.15, -0.65, 0.38),
        rotation=(math.radians(68), 0.0, math.radians(15)),
        output_path=output_dir / "render_06_closeup_handle.png",
        lens_mm=100.0
    )
    print("  [6/6] render_06_closeup_handle.png - Xong")
    
    # --------------------------------------------------------------------------
    # TEST SWAPPING 3 VIETNAMESE WOOD FINISHES
    # --------------------------------------------------------------------------
    print("\n🎨 THỬ NGHIỆM ĐỔI MAT_wood_body SANG 3 LOẠI GỖ THỰC TẾ:")
    wood_variants = [
        ("variant_1_oak", "Sồi Tự Nhiên (Natural Oak)", (0.68, 0.52, 0.34)),
        ("variant_2_walnut", "Óc Chó An Cường (American Walnut)", (0.24, 0.15, 0.08)),
        ("variant_3_ash", "Gỗ Tần Bì Sáng (Nordic Ash)", (0.78, 0.69, 0.55))
    ]
    
    for var_id, var_name, rgb in wood_variants:
        # Update MAT_wood_body and MAT_wood_door colors
        for mat_key in ["MAT_wood_body", "MAT_wood_door"]:
            mat = materials[mat_key]
            # Update color ramp nodes
            for node in mat.node_tree.nodes:
                if node.type == 'VALTORGB':
                    darker = (rgb[0] * 0.75, rgb[1] * 0.75, rgb[2] * 0.75, 1.0)
                    lighter = (min(1.0, rgb[0] * 1.12), min(1.0, rgb[1] * 1.10), min(1.0, rgb[2] * 1.06), 1.0)
                    node.color_ramp.elements[0].color = darker
                    node.color_ramp.elements[1].color = lighter
        
        # Render isometric view for each variant
        var_img = output_dir / f"render_{var_id}.png"
        render_camera_view(
            f"Cam_{var_id}",
            location=(-2.0, -2.0, 1.3),
            rotation=(math.radians(65), 0.0, math.radians(-45)),
            output_path=var_img,
            lens_mm=50.0
        )
        print(f"  ✨ Đã đổi sang {var_name} -> {var_img.name}")
    
    print("\n🎉 HOÀN THÀNH TẤT CẢ CÁC BƯỚC CỦA ASSET BUILDER!")


if __name__ == "__main__":
    main()

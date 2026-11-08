# ==============================================================================
# ATELIER AI — SketchUp Ruby Extension Bridge (Open COLLADA / Canonical JSON)
# File: packages/cad/sketchup_extension/atelier_ai_bridge.rb
# Compatible with SketchUp 2021+ Ruby 2.7/3.x API
# Note: Uses documented SketchUp Ruby API + Open COLLADA (.dae) & Canonical JSON.
# Does NOT require proprietary C++ .skp SDK.
# ==============================================================================

require 'sketchup.rb'
require 'json'
require 'net/http'
require 'uri'

module AtelierAI
  module SketchUpBridge
    API_BASE = 'http://127.0.0.1:8000/api/v1'.freeze
    DEFAULT_PROJECT_ID = 'proj_demo_4x5m'.freeze

    def self.pull_canonical_scene(project_id = DEFAULT_PROJECT_ID)
      model = Sketchup.active_model
      model.start_operation('ATELIER AI — Đồng bộ Mô hình Nội thất (mm)', true)
      begin
        uri = URI("#{API_BASE}/projects/#{project_id}")
        response = Net::HTTP.get(uri)
        data = JSON.parse(response)

        entities = model.active_entities
        layers = model.layers
        wall_layer = layers.add('A-WALL')
        furn_layer = layers.add('A-FURN')

        # Convert mm to SketchUp internal inches (1 inch = 25.4 mm)
        mm_to_in = ->(v) { (v.to_f / 25.4).inch }

        (data['walls'] || []).each do |w|
          p1 = Geom::Point3d.new(mm_to_in.call(w['start_mm'][0]), mm_to_in.call(w['start_mm'][1]), 0)
          p2 = Geom::Point3d.new(mm_to_in.call(w['end_mm'][0]), mm_to_in.call(w['end_mm'][1]), 0)
          group = entities.add_group
          group.layer = wall_layer
          group.name = "Wall_#{w['id']}"
          group.entities.add_line(p1, p2)
        end

        (data['furniture_instances'] || []).each do |f|
          cx = mm_to_in.call(f['x_mm'])
          cy = mm_to_in.call(f['y_mm'])
          fw = mm_to_in.call(f['width_mm'])
          fd = mm_to_in.call(f['depth_mm'])
          fh = mm_to_in.call(f['height_mm'])

          grp = entities.add_group
          grp.layer = furn_layer
          grp.name = "#{f['sku']}_#{f['name']}"
          pts = [
            Geom::Point3d.new(cx - fw / 2.0, cy - fd / 2.0, 0),
            Geom::Point3d.new(cx + fw / 2.0, cy - fd / 2.0, 0),
            Geom::Point3d.new(cx + fw / 2.0, cy + fd / 2.0, 0),
            Geom::Point3d.new(cx - fw / 2.0, cy + fd / 2.0, 0)
          ]
          face = grp.entities.add_face(pts)
          face.pushpull(-fh) if face
        end

        model.commit_operation
        UI.messagebox("ATELIER AI: Đã đồng bộ dự án '#{data['name']}' (Rev ##{data['revision']}) vào SketchUp thành công!")
      rescue StandardError => e
        model.abort_operation
        UI.messagebox("ATELIER AI Bridge Error: #{e.message}")
      end
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('ATELIER AI — Interior Studio')
      menu.add_item('Đồng bộ Mô hình từ ATELIER AI (Pull Canonical mm)') { pull_canonical_scene }
      file_loaded(__FILE__)
    end
  end
end

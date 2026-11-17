# ATELIER AI — Workflow nội thất 8 agent

Tài liệu này là hướng dẫn vận hành cho workflow mặc định version 3. Các workflow
run đã tồn tại tiếp tục đọc snapshot cũ; chỉ run mới dùng graph này.

## 1. Graph chính thức

```text
Chief Brief
    ↓
Floorplan ───────────────┐
    ↓                    │
Floorplan QA             │
    └──────────┬─────────┘
               ↓
           Geometry
          ↙         ↘
       Style       Furniture
          ↘         ↙
       Cost & Spec    Render
             ↘       ↙
              Final QA
                  ↓
             Chief Delivery
```

Workflow có 10 node nhưng chỉ có 8 agent. QA được dùng ở hai thời điểm, Chief
được dùng lúc mở và đóng dự án. Style và Furniture chạy song song. Cost thiếu
giá vẫn phải phát hành báo cáo coverage; không được chặn render concept.

## 2. Danh sách agent

| Agent | Trách nhiệm duy nhất | Không được làm |
|---|---|---|
| Chief Architect | Brief, route, decision ledger, tổng kết | Dựng hình hoặc giả kết quả agent khác |
| Floorplan | Nguồn, tỷ lệ, tường, lỗ mở, neo nội thất | Dựng 3D, Auto Layout |
| Geometry | SceneGraph, lỗ mở thật, revision | Tự sửa bố cục hoặc vật liệu |
| Style | Bảng màu, PBR, surface schedule | Sửa hình học |
| Furniture | Parametric furniture, anchor, clearance | Di chuyển món đã neo khi chưa duyệt |
| Cost & Specification | Catalog fit, BOM, coverage, cost | Bịa sản phẩm hoặc giá |
| Render | Camera, ánh sáng, Cycles, Gallery | Thêm/bớt/di chuyển vật thể |
| QA | Floorplan QA và Final QA độc lập | Sửa scene hoặc tự phê duyệt |

Chi tiết từng agent nằm trong [`docs/agents/`](agents/README.md).

## 3. Floorplan Contract

Floorplan là nguồn hình học duy nhất cho Geometry. Handoff phải có
`result.floorplan_contract` theo `atelier.floorplan.v1`.

```json
{
  "schema": "atelier.floorplan.v1",
  "source": {
    "artifact_id": "art_source",
    "sha256": "<64 hex>"
  },
  "coordinate_system": {
    "origin": "interior_top_left",
    "x_axis": "right",
    "y_axis": "down",
    "unit": "mm"
  },
  "scale": {
    "status": "CONFIRMED",
    "source": "dimension annotation 4190"
  },
  "rooms": [{
    "id": "room-1",
    "polygon_mm": [[0, 0], [4190, 0], [4190, 4040], [0, 4040], [0, 0]],
    "status": "CONFIRMED",
    "source": "inner wall boundary"
  }],
  "walls": [{
    "id": "wall-top",
    "start_mm": [0, 0],
    "end_mm": [4190, 0],
    "thickness": {"value_mm": 110, "status": "CONFIRMED", "source": "dimension annotation"},
    "room_refs": ["room-1"],
    "status": "CONFIRMED",
    "source": "hatched wall line"
  }],
  "openings": [{
    "id": "door-1",
    "type": "door",
    "wall_id": "wall-left",
    "offset": {"value_mm": 900, "status": "CONFIRMED", "source": "dimension chain"},
    "width": {"value_mm": 900, "status": "CONFIRMED", "source": "door annotation"},
    "swing": "inward"
  }],
  "furniture_anchors": [{
    "id": "bed-1",
    "category": "bed",
    "wall_id": "wall-top",
    "align": "center",
    "offset": {"value_mm": 700, "status": "CONFIRMED", "source": "dimension chain"},
    "width": {"value_mm": 1800, "status": "CONFIRMED", "source": "bed label"},
    "depth": {"value_mm": 2000, "status": "CONFIRMED", "source": "bed label"}
  }]
}
```

### Quy tắc đo

- `CONFIRMED`: đọc trực tiếp từ kích thước/bản CAD hoặc người dùng xác nhận.
- `INFERRED`: suy luận có căn cứ, chỉ dùng cho concept và phải `PROVISIONAL`.
- `UNKNOWN`: không có giá trị đáng tin; không được biến thành số thi công.
- Polygon phòng phải khép kín.
- Opening và furniture anchor phải tham chiếu `wall_id` tồn tại.
- `offset + width` không được vượt chiều dài tường.
- Geometry chỉ được mở khi QA phát hành
  `result.floorplan_validation.passed=true`.

## 4. Handoff bắt buộc

Mỗi node ghi:

```text
runs/<run_id>/handoffs/<node_id>.md
runs/<run_id>/handoffs/<node_id>.json
```

JSON có `status`, `run_id`, `node_id`, `agent_id`, `input_artifact_ids`,
`artifacts`, `result`, `verified`, `assumptions`, `issues` và
`handoff_conditions`. Node chỉ `COMPLETED` khi artifact tồn tại và SHA-256 khớp.

## 5. Gate và trạng thái

- Không còn Scale Gate chung chặn toàn workflow. Floorplan QA quyết định riêng
  việc Geometry có đủ dữ liệu hay không.
- Scale `INFERRED` được phép làm concept khi config cho phép, nhưng scene và
  kích thước phải mang `PROVISIONAL`.
- Thiếu màu/mã vật liệu không chặn Geometry.
- Thiếu giá không chặn Render; Cost báo coverage và `UNVERIFIED`.
- QA FAIL trả về agent gây lỗi. Chief không được tự sửa hoặc tự override.

## 6. Bảo toàn dữ liệu

- Workflow run chỉ đọc snapshot được lưu lúc tạo run.
- Publish workflow mới không đổi task/run cũ.
- Mọi sửa scene tạo revision mới.
- Không xóa project, revision, artifact hoặc handoff lịch sử.
- Không fallback sang Chief khi agent được gán thiếu hoặc lỗi.

## 7. Nghiệm thu một dự án

Một dự án chỉ được bàn giao khi:

1. Floorplan source có SHA-256 và Floorplan QA PASS.
2. SceneGraph mở lại được và cửa/cửa sổ là lỗ mở thật.
3. Nội thất giữ đúng anchor từ bản vẽ hoặc có approval cho thay đổi.
4. Render lưu được vào Gallery và gắn đúng Scene Revision.
5. QA đối chiếu Floorplan → SceneGraph → Render và có bằng chứng.
6. Cost nêu rõ coverage; mọi giá đều có trạng thái và nguồn.


---
name: ergonomics-and-circulation-optimization
description: Tối ưu hóa nhân trắc học và luồng giao thông thông thủy theo tiêu chuẩn Neufert và TCVN, khoảng cách công thái học và an toàn sử dụng.
key: paperclipai/bundled/interior-design/ergonomics-and-circulation-optimization
defaultInstall: true
recommendedForRoles:
  - designer
  - architect
  - qa-auditor
tags:
  - interior-design
  - ergonomics
  - circulation
  - clearance
  - neufert
---

# Ergonomics & Circulation Optimization (Công Thái Học Nhân Trắc & Luồng Giao Thông)

## Chủ sở hữu (Owner)
- **Primary Agent**: `Furniture Planner` (`agent_furniture`)
- **Supporting Agent**: `QA & Validation Specialist` (`agent_qa`)

## Mô tả & Mục tiêu
Đảm bảo bố cục không gian đạt độ thoải mái tuyệt đối cho cơ thể người và luồng di chuyển mượt mà không bị cản trở theo tiêu chuẩn kiến trúc Neufert và TCVN:
1. **Quy Chuẩn Khoảng Hở Thông Thủy (Clearance Dimensions)**:
   - Hành lang giao thông chính: Tối thiểu 900mm - 1100mm (đủ 2 người lách qua nhau).
   - Lối đi phụ giữa sofa và bàn trà: Tối thiểu 400mm - 450mm (đủ duỗi chân và đứng lên dễ dàng).
   - Khoảng lùi kéo ghế bàn ăn: Tối thiểu 800mm từ mép bàn đến tường hoặc vật cản (để đứng lên không chạm tường).
   - Khoảng mở cánh tủ áo: Tối thiểu 750mm phía trước tủ cánh mở (hoặc sử dụng cánh lùa nếu không gian < 700mm).
2. **Quy Chuẩn Tam Giác Bếp (Kitchen Work Triangle)**:
   - Tổng chu vi tam giác công năng (Tủ lạnh - Bồn rửa - Bếp nấu) phải nằm trong khoảng 4.0m - 7.0m.
   - Khoảng cách giữa 2 cạnh đối diện trong bếp chữ U hoặc bếp song song tối thiểu 1100mm - 1200mm.
3. **Khoảng Cách Tầm Nhìn Mắt Đến Màn Hình Tivi (Ergonomic Viewing Distance)**:
   - Độ cao tâm tivi: 1000mm - 1100mm tính từ mặt sàn (vừa tầm mắt người ngồi sofa).
   - Khoảng cách nhìn tối ưu cho màn hình độ phân giải 4K: Bằng 1.2 - 1.6 lần đường chéo màn hình (Ví dụ: Tivi 65 inch cách sofa từ 2.4m - 3.0m).

## Trigger (Khi nào kích hoạt)
- Bố trí mặt bằng đồ nội thất rời, kiểm tra xung đột va chạm hình học (Collision Check).
- QA Specialist duyệt mặt bằng trước khi xuất hồ sơ kỹ thuật CAD.

## Tool Allowlist
- `geometry.audit_clearances`
- `geometry.verify_kitchen_triangle`
- `geometry.calculate_sightlines`

## Ràng buộc canonical của ATELIER

Hệ tọa độ canonical dùng `X/Y` trên mặt sàn và `Z` hướng lên. Không chuyển trực tiếp công thức từ nguồn dùng `X/Z` làm mặt sàn.

Khi đọc hoặc đề xuất thay đổi `FurnitureInstance`, phải xử lý các trường sau:

- `locked=true`: không tạo phương án tự động và không gửi yêu cầu đổi transform. Chỉ tiếp tục sau khi người dùng mở khóa rõ ràng.
- `allowed_rotation_deg`: nếu danh sách không rỗng, mọi phương án chỉ được dùng các góc trong danh sách.
- `preferred_x_mm`, `preferred_y_mm`: dùng làm điểm ưu tiên khi xếp hạng phương án; không phải quyền bỏ qua collision hay clearance.
- `front_clearance_mm`: vùng thao tác nằm trước mặt local `+Y` của đồ vật. Vùng này phải nằm trong polygon phòng và không bị đồ vật khác chiếm ở cùng khoảng cao độ.
- `z_mm`, `height_mm`: chỉ báo va chạm khi hai footprint giao nhau **và** hai khoảng cao độ giao nhau. Thảm mỏng sát sàn không được coi là vật cản đồ nội thất đặt trên thảm.

Luồng ghi layout hợp lệ là `PATCH /api/v1/projects/{project_id}/furniture/layout` với `base_revision`, evidence phê duyệt và các transform được duyệt. Endpoint có thể từ chối bằng `furniture_locked`, `rotation_not_allowed`, `invalid_furniture_layout` hoặc `minimum_clearance_not_met`; không được bỏ qua lỗi để ghi Pascal trực tiếp.

Kết quả QA phải dùng đúng ba trạng thái:

- `PASS`: có phép đo/evidence và đạt yêu cầu.
- `FAIL`: có phép đo/evidence và vi phạm yêu cầu.
- `NOT_CHECKED`: chưa có dữ liệu hoặc capability để kiểm tra. Không được đổi `NOT_CHECKED` thành `PASS`.

## Input / Output JSON Schema

### Input Schema
```json
{
  "type": "object",
  "required": ["project_id"],
  "properties": {
    "project_id": { "type": "string" },
    "room_zone": { "type": "string" },
    "check_types": {
      "type": "array",
      "items": { "type": "string", "enum": ["walkways", "door_swings", "front_access", "kitchen_triangle", "tv_viewing_distance"] }
    }
  }
}
```

### Output Schema
```json
{
  "type": "object",
  "required": ["ergonomic_score", "violations", "recommended_adjustments"],
  "properties": {
    "ergonomic_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "violations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rule_name": { "type": "string" },
          "measured_mm": { "type": "number" },
          "required_min_mm": { "type": "number" },
          "location": { "type": "string" }
        }
      }
    },
    "recommended_adjustments": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

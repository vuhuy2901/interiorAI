---
name: canonical-scene-integrity-audit
description: Kiểm định cảnh canonical, GLB/external scene và revision trước khi bố trí, render, QA hoặc bóc tách. Dùng để phát hiện nhầm project, cảnh rỗng, asset thiếu, sai tỷ lệ, sai tầng, bounds bất thường và evidence thuộc revision cũ mà không sửa cảnh.
key: paperclipai/bundled/interior-design/canonical-scene-integrity-audit
defaultInstall: true
recommendedForRoles:
  - architect
  - engineer
  - qa
tags:
  - interior-design
  - scene-integrity
  - glb
  - qa
---

# Canonical Scene Integrity Audit

## Mục tiêu

Chứng minh Agent đang làm trên đúng `project_id`, canonical `scene_id` và revision hiện hành trước khi dùng cảnh làm nguồn cho thiết kế, render, BOQ hoặc nghiệm thu. Skill này chỉ đọc và kiểm định; không tự sửa geometry, material hay dữ liệu dự án.

## Nguồn dữ liệu thật của ATELIER

- Canonical scene qua `GET /api/v1/projects/{project_id}`.
- Native/Paperclip mapping qua workspace project và scene bridge hiện có.
- Cảnh nguồn qua `external_scene` và scene asset đã gắn với project.
- File và audit asset qua `GET /api/v1/scene-assets/{asset_id}/file` và `GET /api/v1/scene-assets/{asset_id}/audit`.
- Kiểm tra bridge qua `POST /api/v1/projects/{project_id}/scene-bridge/verify` khi luồng hiện tại đã tạo bridge.

Không đặt tên một tool tưởng tượng thay cho các API trên. Nếu runtime không cấp quyền gọi endpoint cần thiết, báo thiếu capability thay vì tuyên bố đã kiểm tra.

## Quy trình bắt buộc

1. Ghi lại `project_id`, `scene_id`, revision, asset ID/hash và thời điểm kiểm tra.
2. Xác nhận project/native workspace đang ánh xạ đến đúng canonical scene. Không dùng tên hiển thị làm định danh.
3. Với GLB/external scene, kiểm tra file tải được, audit đọc được và asset hash khớp metadata của revision.
4. Ghi số node/mesh/material/texture, root transform, bounds toàn cảnh và đơn vị. glTF dùng mét; chỉ đổi tỷ lệ khi có bằng chứng nguồn xuất sai.
5. Phân tầng theo cao độ và bounds; phát hiện vật thể, đèn hoặc camera nằm ngoài tầng/phòng dự kiến.
6. Phát hiện cảnh rỗng, asset 404, texture thiếu, bounds bằng 0, scale cực đoan, NaN/Infinity, mesh ngoài bounds hoặc cảnh cũ chồng cảnh mới.
7. So sánh evidence với revision hiện hành ngay trước handoff. Revision đã đổi thì evidence cũ hết hiệu lực.

## Kết quả tối thiểu

```json
{
  "projectId": "...",
  "sceneId": "...",
  "revision": 16,
  "assetId": "...",
  "assetHash": "...",
  "counts": { "nodes": 0, "meshes": 0, "materials": 0, "textures": 0 },
  "boundsMeters": { "min": [0, 0, 0], "max": [0, 0, 0] },
  "floors": [],
  "checks": [],
  "verdict": "pass"
}
```

`verdict` là `pass`, `pass_with_warnings` hoặc `blocked`. Mọi cảnh báo phải nêu đối tượng/evidence cụ thể.

## Điều kiện handoff

- `pass`: được dùng revision đã kiểm định cho bước tiếp theo.
- `pass_with_warnings`: chỉ tiếp tục khi cảnh báo không ảnh hưởng phạm vi đang làm và được ghi rõ trong handoff.
- `blocked`: không tìm được canonical scene, asset/revision không khớp, cảnh rỗng/hỏng hoặc bounds không đáng tin cậy.

Không chuyển task sang `done` chỉ vì endpoint trả HTTP 200; phải có kết quả kiểm định và evidence cùng revision.

## Kiểm tra ràng buộc bố trí nội thất

Khi scene chứa `furniture_instances`, audit thêm các trường canonical `locked`, `allowed_rotation_deg`, `preferred_x_mm`, `preferred_y_mm` và `front_clearance_mm`. Xác nhận transform hiện tại không vi phạm góc xoay được phép và vùng thao tác phía trước nằm trong đúng room polygon, không giao đồ vật khác ở cùng khoảng cao độ. Đồ ở tầng/khoảng `Z` khác nhau không được báo va chạm chỉ vì footprint 2D chồng nhau.

Ghi riêng kết quả `geometry` và `front_access` dưới dạng `PASS`, `FAIL` hoặc `NOT_CHECKED`. Các mục điện, vận hành cửa sổ, an toàn cháy, IFC và chế tạo phải giữ `NOT_CHECKED` nếu chưa có công cụ/evidence tương ứng.

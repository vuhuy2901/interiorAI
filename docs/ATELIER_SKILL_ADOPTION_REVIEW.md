# Đánh giá và tích hợp `atelier-skills.zip`

## Kết luận

Gói ZIP chứa nhiều nguyên tắc phù hợp với ATELIER, nhưng chưa thể cài trực tiếp vì các file là bản nháp `.md` phẳng, còn placeholder `[XÁC MINH]`, trùng với skill có sẵn và nhắc đến một số tool chưa được dự án cung cấp.

Thay vì chép nguyên 10 file, dự án hợp nhất phần phù hợp thành 4 skill có thể gán cho Agent:

| Skill mới | Nguồn ý tưởng trong ZIP | Lý do áp dụng |
| --- | --- | --- |
| `canonical-scene-integrity-audit` | GLB import + scene geometry validator | Chặn nhầm project/revision, cảnh rỗng, sai bounds/tầng trước mọi workflow |
| `photoreal-render-evidence-gate` | lighting/render + photoreal QA | Gắn camera, Cycles job và ảnh đầu ra vào đúng snapshot; bổ sung cho skill render hiện có |
| `scene-bound-cost-provenance` | cost/BOM/material pricing | Chặn dùng giá phòng cũ; phân biệt verified/reference/missing và buộc đối chiếu revision |
| `atelier-workflow-evidence-lifecycle` | chief orchestrator + approval lifecycle | Chuẩn hóa trạng thái thật của Paperclip và điều kiện apply/verify/done |

## Nội dung không tách thành skill mới

- Furniture layout và material/style đã được bao phủ bởi các skill catalog hiện tại; quy tắc scene/revision được bổ sung qua skill kiểm định chung.
- Construction animation là hành vi viewer phía giao diện, không phải deliverable do Agent nghiệp vụ tạo. Việc biến nó thành skill Agent sẽ khiến Agent tưởng có API mutation/animation mà runtime không cấp.
- Các tên tool/API chưa kiểm chứng trong ZIP không được đưa vào skill mới.

## Gán Agent

| Agent | Skill bổ sung |
| --- | --- |
| Chief Architect | scene integrity, render evidence, workflow lifecycle |
| Floor Plan | workflow lifecycle |
| Geometry & BIM | scene integrity, workflow lifecycle |
| Furniture Planner | workflow lifecycle |
| Style & Materials | workflow lifecycle |
| Cost, BOM & Inventory | cost provenance, workflow lifecycle |
| Lighting & Visualization | render evidence, workflow lifecycle |
| Product & Sourcing | cost provenance, workflow lifecycle |
| QA & Validation | scene integrity, render evidence, cost provenance, workflow lifecycle |

Nguồn gán nằm trong `ATELIER_SPECIALIST_AGENTS`; bootstrap Paperclip sẽ cập nhật skill của Agent hiện hữu theo cấu hình này.

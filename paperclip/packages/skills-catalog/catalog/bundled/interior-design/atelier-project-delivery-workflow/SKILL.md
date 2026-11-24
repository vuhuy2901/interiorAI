---
name: atelier-project-delivery-workflow
description: Điều phối một dự án nội thất ATELIER từ intake đến bàn giao trên đúng project, canonical scene và revision. Dùng cho mọi task thuộc workflow đa agent để chống nhầm project mẫu, kiểm soát handoff, evidence, approval và điều kiện Done.
key: paperclipai/bundled/interior-design/atelier-project-delivery-workflow
defaultInstall: true
recommendedForRoles:
  - ceo
  - architect
  - engineer
  - designer
  - finance
  - researcher
  - qa
tags:
  - interior-design
  - project-delivery
  - workflow
  - multi-agent
  - canonical-scene
---

# ATELIER Project Delivery Workflow

## Mục tiêu

Giữ toàn bộ agent trong cùng một dự án, cùng canonical scene và đúng revision; giao đúng việc cho đúng vai trò; chỉ chuyển bước khi đầu ra có thể kiểm chứng. Skill này là hợp đồng chung của dự án. Khi thực hiện chuyên môn, đọc thêm skill chuyên ngành đã gắn cho agent.

## Project identity gate — bắt buộc trước mọi công việc

1. Lấy `company_id`, native `project_id`, canonical `project_id/scene_id` và revision từ task hiện tại hoặc workspace binding. Không suy ra từ tên hiển thị và không dùng project mở gần nhất.
2. Nếu task có file đầu vào, ghi tên file, kích thước, SHA-256 và quan hệ của file với project hiện tại.
3. Đọc canonical project bằng API hiện hành và xác nhận mapping native ↔ canonical. Với external GLB, xác nhận `external_scene.asset_id`, hash và URL file tải được.
4. Không fallback sang project demo, Japandi, Studio, Project A/B hoặc bất kỳ ID hardcode nào khi binding thiếu. Trả `needs_input` với đúng thông tin còn thiếu.
5. Mỗi artifact, proposal, BOQ, render và handoff phải ghi lại project ID, scene ID, revision và asset hash tương ứng.

Nếu một trong các định danh trên không xác minh được, dừng trước mọi mutation. Lỗi API tạm thời là `blocked`; thiếu lựa chọn từ người dùng là `needs_input`. Không tạo downstream task để che lỗi intake.

## Luồng chuẩn

```text
Chief intake
  → Floorplan/source understanding
  → Floorplan QA
  → Geometry/canonical scene
  → Style + Furniture (song song khi độc lập)
  → Cost/Specification + Render
  → Final QA
  → Chief review/delivery
```

- External GLB đã được người dùng chọn làm nguồn chuẩn: bắt đầu bằng scene integrity audit; không dựng lại floorplan hoặc thay hình học nếu task chỉ yêu cầu bảo toàn cảnh.
- Bản vẽ 2D/PDF/DXF/ảnh: Floorplan phải phát hành contract hợp lệ trước Geometry.
- Style và Furniture chỉ chạy khi canonical revision đầu vào đã khóa.
- Cost báo coverage thật và nguồn giá; Render khóa cùng revision với scene/vật liệu; hai nhánh không được tự sửa hình học.
- Final QA là độc lập. Chief chỉ tổng hợp và xin quyết định, không làm thay chuyên gia hoặc tự override FAIL.

Đọc [role-contracts.md](references/role-contracts.md) khi giao hoặc nhận task giữa các agent. Đọc [artifact-and-state-contracts.md](references/artifact-and-state-contracts.md) trước khi ghi handoff, đổi trạng thái hoặc kết luận Done.

## Quy tắc mutation và approval

- Mỗi thay đổi scene tạo proposal/diff dựa trên revision hiện tại. Không ghi đè revision đã duyệt.
- Trước khi apply, kiểm tra base revision vẫn là revision đang dùng; lệch revision thì tải lại và đánh giá lại.
- Chỉ mutation thuộc phạm vi task và quyền của agent. Agent đọc/QA không được ghi scene.
- Approval chỉ bắt buộc khi hợp đồng node hoặc proposal yêu cầu. Approval phải trỏ đúng proposal, project và base revision.
- Sau apply phải GET lại canonical scene, xác nhận revision mới và kiểm chứng các đối tượng bị ảnh hưởng.

## Handoff tối thiểu

Với task có `executionPolicy.atelierWorkflow` thuộc specialist delivery: backend đã tạo toàn bộ subtasks. Đọc `GET /api/atelier/workflow/runs/{workflowRunId}` và hoàn tất node bằng `POST /api/atelier/workflow/runs/{workflowRunId}/stages/{nodeId}/complete`. Body gồm `idempotencyKey`, `output: {sceneId, revision, summary, decisions, references:[{uri:"/api/issues/{taskId}/documents/{key}"}]}`. Lưu document trước. Backend xác nhận bằng chứng rồi tự kích hoạt bước tiếp; không tạo task downstream hoặc tự PATCH done. QA gửi `verdict: pass|fail`; FAIL kèm `corrections:[{nodeId,reason}]`. QA mặt bằng PASS còn cần `checks: {sourceVerified:true,scaleVerified:true,topologyVerified:true}`. Chief bàn giao chờ người dùng nghiệm thu.

Chi tiết có thể chỉnh lại trong brief do chuyên gia tự chọn và triển khai, ghi lý do, nguồn và khả năng hoàn tác. Dùng trạng thái `agent_decided`/`provisional`, không giả thành sở thích người dùng đã xác nhận. Chỉ hỏi Chief khi đổi brief, thiếu tỷ lệ tin cậy, có rủi ro an toàn hoặc cam kết chi tiêu. Không chạy workflow sidecar thứ hai.

Mỗi handoff phải có:

- định danh project/scene/revision/asset;
- đầu vào đã dùng và hash nếu là file;
- deliverable thực tế và đường dẫn/ID truy cập được;
- kiểm tra đã chạy, kết quả và evidence;
- giả định, giới hạn, dữ liệu chưa xác minh;
- agent nhận tiếp theo và điều kiện để agent đó bắt đầu.

Không dùng câu “đã xử lý”, “đã điều phối” hoặc “đã kiểm tra” thay cho deliverable/evidence.

## Trạng thái

- `todo`: chưa bắt đầu và dependency chưa đủ.
- `in_progress`: agent đang tạo deliverable thật.
- `needs_input`: thiếu quyết định hoặc dữ liệu mà chỉ người dùng có thể cung cấp.
- `blocked`: có lỗi kỹ thuật/dependency cụ thể; ghi endpoint, mã lỗi, lần kiểm tra gần nhất và retry owner.
- `in_review`: deliverable đã tồn tại, đang chờ QA/approval được định danh rõ.
- `done`: deliverable đã persist, đọc lại được, đạt tiêu chí node và handoff đã hoàn tất.

Không đổi `blocked` thành `todo` để làm đẹp tiến độ. Không để `in_review` nếu không tồn tại đối tượng review. Không đánh dấu `done` chỉ vì agent đã trả lời bằng văn bản.

## Điều kiện bàn giao dự án

Chỉ bàn giao khi:

1. Project binding và canonical revision cuối cùng đọc lại được.
2. Hình học/scene đúng nguồn đã duyệt; không lẫn dữ liệu project mẫu.
3. Style, furniture và material schedule khớp revision bàn giao.
4. BOQ/cost nêu coverage, nguồn và phần chưa xác minh; không coi giá tham khảo là báo giá mua hàng.
5. Render gắn đúng revision/camera và file tải được.
6. Final QA có evidence và không còn FAIL chưa xử lý.
7. Mọi approval bắt buộc đã được quyết định; Chief phát hành delivery summary chứa link/ID artifact.


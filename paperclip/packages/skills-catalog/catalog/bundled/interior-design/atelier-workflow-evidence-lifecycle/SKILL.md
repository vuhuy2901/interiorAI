---
name: atelier-workflow-evidence-lifecycle
description: Điều phối vòng đời task ATELIER bằng deliverable và evidence thật. Dùng khi tạo/handoff task, đổi trạng thái, xử lý dependency, xin duyệt, retry hoặc đóng workflow để tránh task todo/in_review/blocked giả và tránh báo done khi chưa apply-verify.
key: paperclipai/bundled/interior-design/atelier-workflow-evidence-lifecycle
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
  - workflow
  - lifecycle
  - approval
---

# ATELIER Workflow Evidence Lifecycle

## Trạng thái hợp lệ

Paperclip dùng: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

- `todo`: sẵn sàng để đúng assignee bắt đầu.
- `in_progress`: Agent đang thực hiện deliverable.
- `in_review`: deliverable thật đã tồn tại và đang chờ kiểm tra/duyệt hoặc handoff xác nhận.
- `blocked`: không thể tiếp tục vì điều kiện cụ thể chưa đạt; phải có owner và đường mở khóa.
- `done`: completion contract đã đạt, deliverable được apply/verify và approval bắt buộc đã xong.

`needs_input` là mô tả disposition/câu hỏi, không phải trạng thái task. Khi chờ người dùng, dùng `blocked` hoặc `in_review` theo hành vi của luồng hiện tại và ghi rõ câu trả lời cần thiết.

## Quy trình

1. Khi nhận việc, ghi completion contract: đầu ra, project/scene/revision, tiêu chí kiểm tra, người duyệt và dependency.
2. Chỉ chuyển `in_progress` khi Agent thực sự bắt đầu và có quyền/capability cần thiết.
3. Handoff phải tạo task đúng assignee, liên kết dependency và chuyển giao context/evidence; Agent giao việc không làm thay deliverable của Agent nhận.
4. Chỉ chuyển `in_review` khi artifact hoặc thay đổi có thể mở/đọc/kiểm tra. Bình luận “đã xử lý” không phải deliverable.
5. Approval chỉ hợp lệ cho đúng project, task, scene và base revision. Revision đổi thì phải đánh giá lại approval.
6. Sau approval: apply thay đổi → đọc lại canonical state → QA/verify → final review nếu completion contract yêu cầu → `done`.
7. Dependency chỉ được gỡ khi blocker thật đã `done` hoặc điều kiện đã được đáp ứng bằng evidence.
8. Retry tối đa hai lần cho cùng loại lỗi khi có thay đổi đầu vào/cấu hình. Cùng nguyên nhân lặp lại thì `blocked`, không tạo vòng recovery vô hạn.

## Mẫu blocked bắt buộc

```json
{
  "status": "blocked",
  "reason": "nguyên nhân có thể kiểm tra",
  "owner": "người hoặc agent có thể mở khóa",
  "unblockDescriptor": "đầu vào/hành động/evidence cần cung cấp",
  "retryCount": 1,
  "preservedEvidence": ["..."]
}
```

Thiếu một trong `reason`, `owner`, `unblockDescriptor` thì chưa được coi là disposition bền vững.

## Evidence khi đóng task

- Deliverable/path/record tồn tại và mở được.
- Canonical project/scene/revision khớp.
- Kết quả apply và verify, không chỉ lời tường thuật.
- Approval record nếu task có cổng duyệt.
- Các dependency đã giải quyết; không còn blocker chưa hoàn thành.

## Quy tắc an toàn

- Không đánh dấu `done` để làm đẹp phần trăm tiến độ.
- Không tự phê duyệt thay người dùng khi policy yêu cầu human approval.
- Không tạo task/recovery mới chỉ để né lỗi quyền hoặc dependency.
- Không dùng evidence của project/revision khác.
- Không thay cấu hình model, token, Telegram, database hoặc API contract trong một task nghiệp vụ nếu không được yêu cầu rõ.

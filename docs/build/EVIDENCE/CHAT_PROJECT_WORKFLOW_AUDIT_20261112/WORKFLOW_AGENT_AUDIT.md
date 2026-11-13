# Workflow agent audit - 2026-11-12/13

## Kết luận

Kết quả là **đúng một phần, chưa đạt workflow hiện hành**.

- Hai workflow run đang tồn tại được pin vào workflow version 1. Mapping giữa task
  node, stage, issue assignee, agent metadata và dependency advancement là đúng.
- Workflow đang publish hiện tại là version 3, có 11 node và thêm stage
  `asset_discovery`. Hai run cũ không có stage này, vì vậy không thể khẳng định agent
  đang chạy theo sơ đồ version 3 vừa vẽ.
- Không có execution run nào đang active tại thời điểm audit.

## Run 1 - Studio project

- Run ID: `6e1e...`
- Workflow version: 1
- Trạng thái run: `running`
- `floorplan`: done, có 1 output
- `geometry`: done, không có output reference
- `furniture`: done, không có output reference
- `style`: needs_review, issue đang in_review
- `lighting`: pending, chờ furniture + style; blocker text còn stale dù furniture đã done
- `cost`, `qa`, `final`: pending

## Run 2 - Bedroom project

- Run ID: `4aa7...`
- Workflow version: 1
- Trạng thái run: `needs_input`
- `floorplan`: needs_input vì thiếu xác nhận điện/điều hòa và preference hoàn thiện
- Các stage phía sau: pending đúng dependency
- Không có execution run đang active

## Đối chiếu governance

PASS cho version 1:

- Mỗi task node map đúng stage.
- Agent ID của stage map đúng issue assignee.
- Metadata agent map đúng workflow version/stage.
- Stage sau không vượt dependency gate.

Chưa đạt để gọi là chạy đúng workflow hiện tại:

- Hai run chưa migrate/restart theo version 3.
- `asset_discovery` chưa xuất hiện trong run thực tế.
- Geometry/furniture completed legacy stages chưa có output reference.
- Lighting còn blocker text stale.
- Không có agent đang thực thi ở thời điểm audit.

## Kết luận vận hành

Không nên báo "các agent đã chạy đúng workflow v3". Kết luận chính xác là:
governance và assignment của run v1 đang nhất quán, nhưng workflow v3 chưa có run
thực tế để chứng minh end-to-end.

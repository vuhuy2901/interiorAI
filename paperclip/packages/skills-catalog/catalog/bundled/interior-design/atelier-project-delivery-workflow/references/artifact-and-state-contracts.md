# Artifact và state contracts

## Project context

```json
{
  "company_id": "...",
  "native_project_id": "...",
  "canonical_project_id": "...",
  "scene_id": "...",
  "revision": 1,
  "asset": {
    "asset_id": "...",
    "sha256": "...",
    "source_file": "..."
  }
}
```

Không được thay trường thiếu bằng ID demo. Khi tạo project mới, persist mapping trước rồi GET lại để chứng minh mapping tồn tại.

## Handoff record

```json
{
  "status": "completed",
  "project_context": {},
  "agent_key": "agent_geometry",
  "task_id": "ATL-...",
  "input_references": [],
  "output_references": [],
  "checks": [],
  "assumptions": [],
  "limitations": [],
  "next_agent": "agent_style",
  "start_conditions": []
}
```

`output_references` phải là ID/URL/path đọc được. Nếu output gắn revision, ghi revision trong từng reference.

## Mutation receipt

Mọi mutation scene cần lưu:

- base revision;
- proposal/diff ID;
- object IDs bị ảnh hưởng;
- approval ID khi bắt buộc;
- resulting revision;
- kết quả GET sau ghi và validation.

## Evidence validity

- Evidence chỉ hợp lệ cho project, asset hash và revision đã ghi.
- Scene đổi revision làm hết hiệu lực các kết luận geometry/render/cost bị ảnh hưởng.
- Giá có thể còn hiệu lực qua revision nếu item identity và source chưa đổi; phải chứng minh mapping.
- HTTP 200 chỉ chứng minh endpoint trả lời, không chứng minh nội dung đạt QA.

## Retry

Trước retry, kiểm tra blocker còn tồn tại. Nếu đã hết, tiếp tục từ bước kiểm chứng gần nhất thay vì tạo project/task/artifact trùng. Giới hạn retry theo node; hết giới hạn thì giữ `blocked` và giao đúng owner, không vòng lặp handoff.


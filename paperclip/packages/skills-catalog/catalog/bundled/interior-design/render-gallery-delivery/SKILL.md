---
name: render-gallery-delivery
description: Giao ảnh render đúng project và đưa vào gallery để xem được ở cả màn hình thiết kế 3D lẫn trang chi tiết dự án. Bao gồm kiểm tra file tồn tại, cập nhật trạng thái job thành COMPLETED, lưu render_url theo project_id và revision, và xác nhận endpoint gallery trả về ảnh.
key: paperclipai/bundled/interior-design/render-gallery-delivery
defaultInstall: true
recommendedForRoles:
  - engineer
  - architect
tags:
  - interior-design
  - rendering
  - gallery
  - project-delivery
  - blender
---

# Render Gallery Delivery Skill

## Chủ sở hữu (Owner)
- **Primary Agent**: `Architectural Visualization & Rendering Agent` (`agent_render`)
- **Phạm vi**: Toàn bộ pipeline sau khi Blender Cycles hoàn thành — từ lúc job thành công đến lúc ảnh hiển thị trong dự án.

## Nguyên tắc cốt lõi

**MỌI ảnh render phải:**
1. Gắn với `project_id` chính xác của dự án đang thiết kế.
2. Có trạng thái `COMPLETED` trong bảng `render_jobs`.
3. Truy cập được qua `GET /api/v1/renders/{filename}`.
4. Xuất hiện trong `GET /api/v1/projects/{project_id}/render-gallery`.
5. Hiển thị được trong cả hai màn hình:
   - **Không gian 3D** (AtelierDesignStudioPage — panel "Ảnh render").
   - **Trang dự án** (ProjectRenderGalleryPage — `/projects/{id}/render-gallery`).

---

## Quy trình giao ảnh (Delivery Pipeline)

### Bước 1 — Xác nhận job hoàn thành
```
GET /api/v1/render-jobs/{job_id}
```
- Kiểm tra `status == "COMPLETED"`.
- Kiểm tra `renderer == "BLENDER_CYCLES"`.
- Kiểm tra `file_size_bytes > 0` (file thực sự tồn tại trên đĩa).
- Kiểm tra `render_url` không rỗng và trỏ đến `/api/v1/renders/{filename}`.

Nếu bất kỳ điều kiện nào thất bại → **KHÔNG** tiếp tục, báo cáo lý do cụ thể.

### Bước 2 — Xác nhận file trên đĩa
- `out_path` phải tồn tại tại `data/exports/renders/{filename}`.
- Kích thước file phải > 10 KB (tránh file rỗng hoặc bị cắt).
- Nếu file thiếu → gọi `POST /api/v1/render-jobs/{job_id}/retry` với `async_exec: false` để render lại đồng bộ.

### Bước 3 — Kiểm tra liên kết project
- `job.project_id` phải khớp với `project_id` hiện tại của task.
- Nếu không khớp → tạo render job mới với đúng `project_id`, đừng dùng job cũ từ project khác.

### Bước 4 — Xác nhận gallery trả về ảnh
```
GET /api/v1/projects/{project_id}/render-gallery
```
Phản hồi phải có `count >= 1` và ảnh vừa render trong `gallery[]`.

Nếu `count == 0` mặc dù job COMPLETED → kiểm tra:
- Trường `renderer` trong DB có phải `BLENDER_CYCLES` không.
- Trường `status` trong DB đã cập nhật chưa (có thể còn `RUNNING`).
- Gọi `POST /api/v1/render-jobs/{job_id}/retry` để buộc cập nhật trạng thái.

### Bước 5 — Xác nhận hiển thị trong UI
Sau khi gallery API trả về đúng:
- Màn hình thiết kế 3D: nhấn nút "Ảnh render" → panel strip phải load thumbnail.
- Trang dự án: vào `/projects/{project_id}/render-gallery` → phải thấy ảnh.

---

## Nhiều góc camera (Multi-view Delivery)

Khi yêu cầu nhiều góc (wide, eye_level, orbit, corner, isometric):
```
POST /api/v1/projects/{project_id}/render-jobs
{
  "camera_id": "eye_level",   // wide | eye_level | orbit | corner | isometric | hero
  "mode": "preview",          // draft | preview | final
  "async_exec": true
}
```
- Tạo từng job riêng, theo dõi từng `job_id`.
- Chờ tất cả job `COMPLETED` trước khi bàn giao.
- Gallery phải có `count >= số góc yêu cầu`.

**Camera presets chuẩn:**
| ID | Mô tả | Dùng khi |
|----|--------|----------|
| `wide` | Toàn cảnh phòng, 22mm | Ảnh tổng quan mặc định |
| `eye_level` | Tầm mắt 1,5m, 35mm | Phối cảnh thực tế |
| `orbit` | ¾ góc cao, 28mm | 3D dollhouse view |
| `corner` | Từ góc phòng, 24mm | Không gian nhỏ |
| `hero` | Focus vào điểm nhấn, 50mm + DoF | Ảnh marketing |
| `isometric` | Trực giao, 90° | Bản vẽ kỹ thuật |

---

## Chất lượng render (Quality Modes)

| Mode | Resolution | Samples | Dùng khi |
|------|------------|---------|----------|
| `draft` | 960×540 | 32 | Kiểm tra nhanh góc camera |
| `preview` | 1280×720 | 64 | Duyệt khách hàng |
| `final` | 1920×1080 | 96 | Giao sản phẩm hoàn chỉnh |
| `high` | 2560×1440 | 128 | In ấn, trình bày |

---

## Evidence bắt buộc khi bàn giao

Agent **phải** cung cấp trong handoff:
```json
{
  "project_id": "proj_xxx",
  "revision": 1,
  "renders": [
    {
      "job_id": "rjob_xxx",
      "camera": "wide",
      "status": "COMPLETED",
      "render_url": "/api/v1/renders/proj_xxx_rev1_wide_final_xxx.png",
      "file_size_bytes": 1234567,
      "gallery_verified": true
    }
  ],
  "gallery_count": 1,
  "gallery_url": "/api/v1/projects/proj_xxx/render-gallery",
  "ui_accessible": true
}
```

Thiếu bất kỳ trường nào → trạng thái `needs_review`, không được đánh dấu `done`.

---

## Điều kiện thất bại

| Tình huống | Hành động |
|-----------|-----------|
| `file_size_bytes == 0` hoặc file không tồn tại | Retry job, nếu vẫn thất bại → `BLOCKED` |
| `project_id` không khớp | Tạo job mới với đúng project_id |
| Gallery trả về `count == 0` sau COMPLETED | Kiểm tra `status` và `renderer` trong DB, retry nếu cần |
| Nhiều job nhưng không phải `BLENDER_CYCLES` | Lọc bỏ, chỉ giao job Cycles |
| `render_url` không truy cập được (404) | Kiểm tra `out_path`, retry hoặc re-render |

---

## Nhãn bắt buộc

Mọi ảnh render phải có watermark:
> **ẢNH MINH HỌA — KHÔNG DÙNG LÀM CĂN CỨ THI CÔNG.**

Không được xóa watermark kể cả khi khách hàng yêu cầu (đây là quy định pháp lý).

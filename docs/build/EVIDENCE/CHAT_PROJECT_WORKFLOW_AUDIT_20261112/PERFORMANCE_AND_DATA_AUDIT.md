# Frontend, project và material audit - 2026-11-13

## Dự án

- API toàn bộ: 27 project/scene legacy.
- API cho Studio sau lọc: 3 project người dùng.
- Fixture bị ẩn gồm Regression, E2E, Real Acceptance, G2/G7 demo và test project.
- Không xóa project hoặc revision nào.

Ba project còn hiển thị:

1. `proj_bedroom_japandi_4x4m` - Phòng Ngủ Master Japandi, Rev #2
2. `proj_demo_4x5m` - Căn hộ Studio Phòng Khách 4x5m, Rev #46
3. `proj_8465e010` - Căn Hộ Japandi 80M, Rev #1

## Frontend loading

- Sửa chọn project đầu tiên từ field sai `id` sang `project_id`.
- Route thông thường không còn fetch `/api/v1/*` của Atelier.
- Project bundle giảm từ 10 endpoint xuống 5 endpoint cốt lõi.
- Catalog, PBR và asset library chỉ tải trên route thực sự cần.
- Ref guard chặn request trùng trong React StrictMode.

## Material interaction

- Sidebar classic và streamlined không còn mục Material Catalog.
- `/ATL/materials-catalog` redirect về `/ATL/design-studio`.
- Inspector không còn swatch, select sơn/sàn hoặc PBR preset thủ công.
- Inspector hiển thị một hành động `Mở AI Copilot`.
- AI tìm màu/vật liệu và tạo proposal; người dùng vẫn phải approve trước khi
  thay đổi được persist.
- Backend catalog vẫn tồn tại để AI và renderer resolve màu, texture, PBR và nguồn.

## Browser verification

- URL sau redirect: `/ATL/design-studio`.
- Material nav count: 0.
- Manual surface picker count: 0.
- Manual PBR picker count: 0.
- AI material guidance count: 1.
- Project options: 3.
- Nút `Mở AI Copilot` mở đúng panel Kiến Trúc Sư Trưởng AI.

Ảnh liên quan trong thư mục này:

- `studio-projects-filtered.png`
- `chat-canonical.png`
- `materials-catalog-fixed.png` là evidence trung gian trước CR-001/CR-002 và đã
  được supersede bởi quyết định gỡ catalog thủ công.

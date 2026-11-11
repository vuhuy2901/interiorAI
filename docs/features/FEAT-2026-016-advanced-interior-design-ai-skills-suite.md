# [FEAT-2026-016] Bổ sung trọn bộ 7 kỹ năng AI thiết kế nội thất chuyên sâu (Advanced Design Skills Suite)

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Antigravity |
| Người chấp thuận | User (yêu cầu trực tiếp: "tất cả cho dự án tốt") |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |
| Revision bắt đầu | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |
| Revision cuối | c4c17d960016f5e97ab723a9d0d7073a8a990f18 |

## 1. Bối cảnh

Hệ thống Atelier AI trước đây chỉ có 17 kỹ năng thiết kế cơ bản (chủ yếu xoay quanh đọc bản vẽ, bóc tách khối lượng và vẽ scene thô). Người dùng phản hồi số lượng kỹ năng thiết kế thẩm mỹ còn quá ít, lo ngại sản phẩm thiết kế sinh ra thiếu tính nghệ thuật, chưa đạt tiêu chuẩn thẩm mỹ cao cấp, thiếu chiều sâu chiếu sáng và giải pháp chi tiết đồ mộc.

Người dùng yêu cầu bổ sung toàn bộ các kỹ năng AI thiết kế chuyên sâu để đảm bảo dự án đạt chất lượng tốt nhất.

## 2. Mục tiêu

1. Thiết kế và tích hợp trọn bộ **7 kỹ năng AI thiết kế nội thất cao cấp** chuẩn schema `SKILL.md`:
   - `aesthetic-moodboard-and-styling`: Định hình concept thẩm mỹ, bảng màu 60-30-10, phụ kiện decor & nghệ thuật bài trí.
   - `luxury-materials-and-tactile-textures`: Tuyển chọn bề mặt xúc giác & vật liệu cao cấp (đá marble, gỗ óc chó, kính fluted, kim loại PVD, vải bouclé, map PBR).
   - `architectural-lighting-mastery`: Chiếu sáng kiến trúc 3 lớp (Ambient / Task / Accent), kịch bản chiếu sáng, đèn ray nam châm, hắt cove led, CRI > 95.
   - `ergonomics-and-circulation-optimization`: Tối ưu hóa nhân trắc học & luồng giao thông thông thủy theo Neufert / TCVN.
   - `biophilic-indoor-landscape`: Kiến trúc xanh nội thất, cây xanh thanh lọc không khí, vi khí hậu & đối lưu ánh sáng tự nhiên.
   - `bespoke-millwork-and-joinery`: May đo đồ mộc liền tường tinh xảo, hệ tủ kịch trần, vách ốp composite/lam sóng, phụ kiện Hafele/Blum.
   - `cinematic-rendering-and-composition`: Bố cục điện ảnh & kết xuất quang học Blender Cycles (tiêu cự 35-50mm, DoF f/4-f/5.6, HDRI Studio Loft).
2. Đăng ký 7 kỹ năng vào `@paperclipai/skills-catalog` (tăng catalog từ 34 lên 41 kỹ năng).
3. Đăng ký vào `company_skills` của Atelier AI trong Paperclip live instance (tăng từ 27 lên 34 skills).
4. Phân bổ các kỹ năng mới vào 9 Agent chuyên môn tương ứng.
5. Bảo đảm Paperclip runtime (`localhost:3100`) và test suites hoạt động ổn định 100%.

## 3. Phạm vi

### In scope

- Tạo 7 thư mục kỹ năng mới với `SKILL.md` chi tiết tại:
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/aesthetic-moodboard-and-styling/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/luxury-materials-and-tactile-textures/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/architectural-lighting-mastery/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/ergonomics-and-circulation-optimization/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/biophilic-indoor-landscape/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/bespoke-millwork-and-joinery/SKILL.md`
  - `paperclip/packages/skills-catalog/catalog/bundled/interior-design/cinematic-rendering-and-composition/SKILL.md`
- Cập nhật `paperclip/packages/skills-catalog/generated/catalog.json` chứa 7 bản ghi catalog mới.
- Cập nhật bootstrap specification trong `paperclip/server/src/routes/atelier-bridge.ts`.
- Đồng bộ nạp 7 kỹ năng mới vào bảng `company_skills` và gán vào 9 live agents của công ty Atelier AI.
- Cập nhật tài liệu kỹ thuật `apps/api/app/services/agent_prompts.py` và `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`.

### Out of scope

- Không thay đổi model LLM hoặc adapter engine (`codex_local`, `gpt-5.6-luna`).
- Không thay đổi cấu trúc bảng cơ sở dữ liệu PostgreSQL.
- Không sửa đổi mã nguồn core của Pascal 3D BIM Gateway.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip backend (`:3100`), Embedded PostgreSQL (`:54329`), FastMCP server.
- Dữ liệu dùng chung: ID công ty Atelier AI (`b2e1c8a5-c3c9-412c-99cb-63180c4015dc`), danh sách 9 agent chủ đạo hiện có.
- Service/port/database không được ảnh hưởng: Không làm gián đoạn API `:3100` và kết nối PostgreSQL.

## 5. Thiết kế và kế hoạch triển khai

1. Biên soạn nội dung kỹ thuật chi tiết cho 7 file `SKILL.md` theo chuẩn Paperclip Skills Format (vai trò, trigger, tool allowlist, input/output schema, hướng dẫn chuyên gia).
2. Tái tạo manifest `generated/catalog.json` trong gói `skills-catalog`.
3. Cập nhật `atelier-bridge.ts` để phân quyền cho các agent tương ứng.
4. Chạy script đồng bộ nạp 7 kỹ năng mới vào PostgreSQL của Paperclip và cập nhật trường kỹ năng của 9 Agent.
5. Cập nhật `agent_prompts.py` và `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md`.
6. Chạy kiểm tra Paperclip `/api/health`, danh sách skills của công ty và bộ test hồi quy.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `paperclip/packages/skills-catalog/catalog/bundled/interior-design/*` | Tạo mới 7 folder & `SKILL.md` | Định nghĩa 7 kỹ năng AI thiết kế chuyên sâu |
| `paperclip/packages/skills-catalog/generated/catalog.json` | Cập nhật | Ghi nhận 7 kỹ năng vào catalog |
| `paperclip/server/src/routes/atelier-bridge.ts` | Cập nhật | Mở rộng danh sách kỹ năng cho 9 agent |
| PostgreSQL `company_skills` & `agents` | Dữ liệu runtime | Kích hoạt kỹ năng trên Paperclip UI và live agents |
| `apps/api/app/services/agent_prompts.py` | Cập nhật | Ghi nhận quyền và gợi ý kỹ năng mới cho Orchestrator |
| `docs/ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Cập nhật | Tài liệu hóa hệ thống kỹ năng mới |

## 7. Acceptance criteria

- [x] AC-01: 7 thư mục kỹ năng mới được tạo với đầy đủ `SKILL.md` chuẩn schema frontmatter.
- [x] AC-02: `catalog.json` chứa 41 skills (bổ sung 7 skills mới thuộc nhóm `interior-design`).
- [x] AC-03: `company_skills` của công ty Atelier AI trong Paperclip tăng từ 27 lên 34 skills.
- [x] AC-04: 9 agent chủ đạo được gán các kỹ năng mới tương ứng vai trò chuyên môn.
- [x] AC-05: Paperclip API `/api/health` trả về `status: ok`.
- [x] AC-06: Bộ test hồi quy `tests/test_ide_bridge.py` tiếp tục pass 6/6.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra file SKILL.md | Kiểm tra tồn tại 7 file trên ổ đĩa | 7/7 files tồn tại (PASS) |
| Kiểm tra catalog.json | Đọc `skills` trong `catalog.json` | 41 skills (PASS) |
| Kiểm tra company_skills live | GET `/api/companies/{id}/skills` | 34 skills (PASS) |
| Kiểm tra agent assignment | GET `/api/companies/{id}/agents` | 9 agent có kỹ năng mới (PASS) |
| Kiểm tra health | GET `/api/health` | `status=ok` (PASS) |
| Kiểm tra hồi quy | `pytest tests/test_ide_bridge.py` | 6/6 passed (PASS) |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Lỗi cú pháp frontmatter trong SKILL.md làm catalog builder dừng | Kiểm tra nghiêm ngặt format YAML và JSON schema trước khi ghi |
| Lỗi trùng key trong `company_skills` | Dùng câu lệnh `ON CONFLICT DO NOTHING` hoặc kiểm tra `existingSkillKeys` |

Rollback point và cách rollback:
- Khôi phục `catalog.json` và `atelier-bridge.ts` về revision `c4c17d9`.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Antigravity Assistant & User confirmation
- Thời điểm: 2026-11-11 11:27:00 +07:00

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 | c4c17d9 | Khởi tạo hợp đồng tính năng | FROZEN |
| 2026-11-11 | c4c17d9 | Tạo 7 file `SKILL.md` chi tiết trong `catalog/bundled/interior-design/` | Hoàn thành |
| 2026-11-11 | c4c17d9 | Cập nhật `generated/catalog.json` (tăng từ 34 lên 41 skills) | Hoàn thành |
| 2026-11-11 | c4c17d9 | Cập nhật mã nguồn bootstrap trong `atelier-bridge.ts` | Hoàn thành |
| 2026-11-11 | c4c17d9 | Cài đặt 7 kỹ năng vào Paperclip live API (`company_skills` tăng lên 34) | Hoàn thành |
| 2026-11-11 | c4c17d9 | Cập nhật phân quyền kỹ năng cho 9 Live Agents | Hoàn thành |
| 2026-11-11 | c4c17d9 | Cập nhật `agent_prompts.py` và `ATELIER_MULTI_AGENT_PROMPT_SYSTEM.md` | Hoàn thành |
| 2026-11-11 | c4c17d9 | Xác thực toàn bộ checklist và chạy regression tests (6/6 passed) | Hoàn thành |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 | c4c17d9 | Tồn tại 7 file SKILL.md | PASS (7/7 files) | File system verify |
| 2026-11-11 | c4c17d9 | Đếm kỹ năng trong `catalog.json` | PASS (41 skills) | JSON parser verify |
| 2026-11-11 | c4c17d9 | Đếm `company_skills` trên Paperclip `:3100` | PASS (34 skills) | GET `/api/companies/:id/skills` |
| 2026-11-11 | c4c17d9 | Phân bổ kỹ năng cho 9 Agents | PASS (9/9 agents) | GET `/api/companies/:id/agents` |
| 2026-11-11 | c4c17d9 | Paperclip API `/api/health` | PASS (`status: ok`) | API response |
| 2026-11-11 | c4c17d9 | `pytest tests/test_ide_bridge.py` | PASS (6 passed in 1.59s) | Pytest stdout |

## 14. Kết quả và đóng chức năng

- Kết quả: Đã bổ sung thành công 7 kỹ năng AI thiết kế nội thất chuyên sâu, nâng cấp toàn diện năng lực thẩm mỹ, vật liệu cao cấp, chiếu sáng kiến trúc 3 lớp, công thái học, kiến trúc xanh, mộc may đo và render điện ảnh cho Atelier AI.
- Hạn chế còn lại: Không.
- Rollback point: c4c17d9

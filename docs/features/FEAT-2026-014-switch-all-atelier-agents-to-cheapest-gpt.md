# [FEAT-2026-014] Chuyển toàn bộ Atelier agents sang GPT tiết kiệm

| Trường | Giá trị |
|---|---|
| Trạng thái | CLOSED |
| Phiên bản hợp đồng | 1.0 |
| Owner | Codex |
| Người chấp thuận | Người dùng yêu cầu trực tiếp |
| Ngày tạo | 2026-11-11 |
| Frozen at | 2026-11-11 |
| Revision bắt đầu | c4c17d960016f5e97ab723a9d0d7073a8a990f18 + runtime update 2026-11-11 |
| Revision cuối | c4c17d960016f5e97ab723a9d0d7073a8a990f18 + runtime update 2026-11-11 |

## 1. Bối cảnh

9 Atelier agents đang có cấu hình `codex_local` nhưng model live là
`antigravity-ide-bridge`. Lịch sử feature của repo đã xác định `gpt-5.6-luna`
là model GPT tiết kiệm được chọn cho roster Atelier.

## 2. Mục tiêu

Toàn bộ 9 agent thuộc company Atelier AI dùng `gpt-5.6-luna`, vẫn giữ nguyên
`codex_local`, `engine=cli`, lệnh `codex`, `modelReasoningEffort=low` và các
trường nghiệp vụ khác.

## 3. Phạm vi

### In scope

- Cập nhật model trong `adapterConfig` của 9 agent live thuộc company Atelier AI.
- Giữ nguyên adapter, engine, command, agent key, reasoning effort và runtime config.
- Ghi nhận bằng chứng cấu hình sau cập nhật.

### Out of scope

- Không đổi model catalog/giá của Paperclip.
- Không đổi model của fixtures, Storybook, tài liệu lịch sử hoặc agent ngoài company Atelier AI.
- Không đổi API key, connection, quyền, prompt, budget, schedule hay trạng thái agent.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: Paperclip API đang chạy tại `http://127.0.0.1:3100`.
- Dữ liệu dùng chung: cấu hình agent trong embedded PostgreSQL của Paperclip.
- Service/port/database không được ảnh hưởng: giữ nguyên Paperclip `3100` và PostgreSQL `54329`.

## 5. Thiết kế và kế hoạch triển khai

1. Đọc danh sách agent của company Atelier AI và lưu snapshot trước thay đổi.
2. PATCH từng agent chỉ thay `adapterConfig.model` thành `gpt-5.6-luna`.
3. Đọc lại toàn bộ roster và xác nhận không có trường ngoài phạm vi bị thay đổi.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-014-switch-all-atelier-agents-to-cheapest-gpt.md` | Contract/evidence | Ghi phạm vi, rollback và bằng chứng |
| Paperclip agent configuration for Atelier AI | Runtime data update | Đổi model của 9 agent live |

## 7. Acceptance criteria

- [ ] AC-01: 9/9 agent Atelier AI có `adapterConfig.model = gpt-5.6-luna`.
- [ ] AC-02: 9/9 agent vẫn có `adapterType=codex_local`, `engine=cli`, `command=codex` và `modelReasoningEffort=low`.
- [ ] AC-03: Không thay đổi runtime config, agent key, quyền, prompt, connection hoặc trạng thái.
- [ ] AC-04: Paperclip health vẫn `status=ok` sau cập nhật.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Snapshot trước/sau | GET `/api/companies/{companyId}/agents` | Chỉ model thay đổi |
| Roster assertion | PowerShell kiểm tra 9 agent | 9/9 đạt AC-01/AC-02 |
| Health | GET `/api/health` | `status=ok`, `startupRecovery.phase=ready` |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Model không được hỗ trợ bởi credential hiện tại | Xác nhận model catalog hiện có; rollback theo snapshot trước thay đổi |
| PATCH từng agent không đồng nhất | Đọc lại roster và rollback các agent đã đổi nếu assertion thất bại |

Rollback point và cách rollback: dùng snapshot trước thay đổi, PATCH lại từng
agent với model cũ tương ứng; không xóa dữ liệu.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu trực tiếp của người dùng.
- Thời điểm: 2026-11-11

> Sau khi mục này được chốt, không viết lại yêu cầu cũ. Mọi thay đổi phải đi qua
> Change Log bên dưới.

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-11 | c4c17d960016f5e97ab723a9d0d7073a8a990f18 + runtime | Cập nhật 9 agent live | Chỉ PATCH `adapterConfig.model` thành `gpt-5.6-luna`; snapshot trước là `antigravity-ide-bridge` cho cả 9 agent |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-11 | c4c17d960016f5e97ab723a9d0d7073a8a990f18 + runtime | GET `/api/companies/b2e1c8a5-c3c9-412c-99cb-63180c4015dc/agents` | PASS: 9/9 `gpt-5.6-luna`; 9/9 `codex_local`, `cli`, `codex`, `low` | Live Paperclip API |
| 2026-11-11 | c4c17d960016f5e97ab723a9d0d7073a8a990f18 + runtime | GET `/api/health` | PASS: `status=ok`, `startupRecovery.phase=ready` | Live Paperclip API |

## 14. Kết quả và đóng chức năng

- Kết quả: Toàn bộ 9 Atelier agents đã chuyển sang `gpt-5.6-luna`.
- Hạn chế còn lại: Chưa có.
- Việc chưa hoàn tất: Không có.
- Rollback point: Snapshot cấu hình trước thay đổi.
- Trạng thái `CLOSED` bởi: Codex sau khi đạt AC-01 đến AC-04.
- Thời điểm: 2026-11-11

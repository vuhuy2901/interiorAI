# [FEAT-2026-128] ATELIER Visual Evolution 2.0 — quality foundation

| Trường | Giá trị |
|---|---|
| Trạng thái | VERIFYING |
| Phiên bản hợp đồng | 1.2 |
| Owner | Codex |
| Người chấp thuận | Người dùng theo Master Prompt ATELIER Visual Evolution 2.0 |
| Ngày tạo | 2026-11-19 |
| Frozen at | 2026-11-19 |
| Revision bắt đầu | working tree |
| Revision cuối | `6f6a2263` (CR-002 contrast/evidence commit) |

## 1. Bối cảnh

ATELIER đã có renderer Three.js, shadow map, camera orbit, time-of-day lighting,
agent interaction và bố cục văn phòng riêng. Master Prompt yêu cầu nâng cấp tại
chỗ, giữ nguyên nhận diện, nhưng hiện chưa có lớp cấu hình chất lượng hiển thị
được người dùng điều chỉnh và kiểm thử được.

## 2. Mục tiêu

Tạo nền tảng quality/style preset không làm mất scene data hoặc thay đổi bố cục:
người dùng có thể chọn Low/Medium/High/Ultra và Original ATELIER/Original
Enhanced/Premium Realistic; lựa chọn được lưu ở localStorage và áp dụng vào
renderer hiện tại.

Đợt này cũng ghi nhận baseline hiện có để các đợt lighting/material/asset sau
so sánh cùng camera và cùng scene.

## 3. Phạm vi

### In scope

- Giữ nguyên renderer, scene graph, camera mặc định, agent data và palette gốc.
- Bổ sung panel Visual Quality trong standalone company simulation.
- Quality preset điều khiển pixel ratio, shadow map, antialiasing fallback,
  ambient lighting và post-processing intensity ở mức an toàn.
- Style preset chỉ điều chỉnh display settings; không ghi đè scene data/material
  source.
- Lưu lựa chọn hiển thị và baseline manifest.
- Đợt 2: tinh chỉnh lighting và PBR material trong cùng standalone scene,
  có ảnh BEFORE/AFTER cùng camera và đo FPS theo bốn quality levels.
- CR-002: tăng tương phản Premium Realistic, thêm contact shadow/AO-style pass,
  và profile riêng cho sàn gỗ, kính, màn hình; chụp lại ba góc cùng project/12:00.

### Out of scope

- Chưa thay thế model FurniMesh tự động.
- Chưa sửa Pascal SceneBridge, CAS, provenance hoặc persistence.
- Chưa thêm Company Builder chỉnh phòng/sàn/furniture.
- Chưa tuyên bố hoàn tất E2E GLB Paperclip → Pascal.
- Không thiết kế lại văn phòng hoặc đổi palette mặc định.
- Không chạm FurniMesh hoặc Company Builder trong đợt 2.

## 4. Dependency và tài nguyên cần bảo vệ

- Dependency: `ai-office-standalone/index.html`, Three.js CDN hiện tại và static
  server `http://localhost:8123/`.
- Dữ liệu dùng chung: scene geometry, agent mapping, material palette và các
  preset time-of-day hiện có.
- Service/port/database không được ảnh hưởng: Paperclip `3100`, API `8000`,
  FurniMesh MCP `3180`, HOME&CO `8123`.

## 5. Thiết kế và kế hoạch triển khai

1. Lưu manifest baseline mô tả camera, renderer, lights, palette và ảnh hiện có.
2. Thêm panel quality/style vào UI hiện tại.
3. Áp dụng preset qua một hàm duy nhất, có giới hạn pixel ratio và shadow map.
4. Khôi phục preset sau reload bằng localStorage.
5. Chạy syntax/build/static-server smoke và ghi ảnh sau thay đổi nếu môi trường
   browser cho phép.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `ai-office-standalone/index.html` | Cập nhật | UI và runtime quality/style presets |
| `docs/evidence/atelier-visual-baseline-2026-11-19.json` | Thêm | Baseline có thể đối chiếu, không ghi đè preset gốc |
| `docs/features/FEAT-2026-128-atelier-visual-evolution-quality-foundation.md` | Thêm | Contract và evidence |
| `docs/evidence/after/phase2-before-original-atelier.png` | Thêm | Runtime BEFORE cùng camera |
| `docs/evidence/after/phase2-after-premium-realistic.png` | Thêm | Runtime AFTER cùng camera |
| `docs/evidence/after/phase2-fps.json` | Thêm | FPS đo cho bốn quality levels |
| `docs/evidence/after/phase2-capture-manifest.json` | Thêm | Cùng project, 12:00, camera và hash sáu ảnh |
| `docs/evidence/after/phase2-before-original-atelier-*.png` | Thêm | BEFORE ở overview/meeting/floor-cabinet |
| `docs/evidence/after/phase2-after-premium-realistic-*.png` | Thêm | AFTER ở overview/meeting/floor-cabinet |

## 7. Acceptance criteria

- [ ] AC-01: Mở standalone vẫn giữ bố cục/palette/camera mặc định hiện tại.
- [x] AC-02: UI có quality presets Low/Medium/High/Ultra và style presets nêu
  trong Master Prompt.
- [x] AC-03: Chọn preset thay đổi renderer mà không thay đổi scene geometry,
  agent mapping hoặc dữ liệu persistence.
- [x] AC-04: Reload giữ preset đã chọn; giá trị pixel ratio/shadow được giới hạn
  theo preset để không gây tải vô hạn.
- [x] AC-05: Baseline manifest tồn tại và liệt kê camera, renderer, lights,
  palette cùng ảnh tham chiếu.
- [x] AC-06: Static-server smoke và syntax check pass; mọi giới hạn visual/E2E
  chưa chạy được phải ghi rõ.
- [x] AC-07: Lighting/PBR phase 2 có BEFORE Original ATELIER và AFTER Premium
  Realistic cùng camera `theta=0.26`, `phi=0.86`, `radius=21.5`.
- [x] AC-08: FPS runtime được đo cho Low/Medium/High/Ultra và lưu thành JSON.
- [x] AC-09: Có ba cặp ảnh BEFORE/AFTER cùng project `Phòng ngủ GLB — Bedroom Interior 6×4m`, cùng giờ 12:00; overview giữ camera contract.
- [x] AC-10: Premium Realistic phân biệt trực quan bằng contrast, contact shadow và material profile floor/glass/screen.

## 8. Verification plan

| Kiểm tra | Lệnh/cách chạy | Kết quả mong đợi |
|---|---|---|
| Syntax | `node --check` trên script đã tách hoặc smoke browser | Không lỗi cú pháp |
| Static server | `Invoke-WebRequest http://localhost:8123/` | HTTP 200, title HOME&CO |
| UI behavior | Browser mở cùng scene, chọn từng preset, reload | Preset hiển thị đúng và được giữ |
| Baseline | Đối chiếu manifest với code/ảnh hiện có | Không ghi đè baseline cũ |
| Scope | `git diff --check` | Không lỗi whitespace |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Preset làm scene tối/sáng quá | Giữ palette và ánh sáng gốc làm Original ATELIER; giới hạn cường độ |
| Thiết bị yếu bị giảm FPS | Low/Medium giảm pixel ratio/shadows; có thể quay lại preset gốc |
| localStorage chứa giá trị cũ không hợp lệ | Validate enum và fallback về Original Enhanced |

Rollback point và cách rollback: revert thay đổi trong `index.html` và xóa
manifest mới; không xóa ảnh baseline cũ hoặc scene data.

## 10. Xác nhận đóng băng

- [x] Phạm vi và non-goals đã rõ.
- [x] Acceptance criteria kiểm tra được.
- [x] Dependency dùng chung đã được bảo vệ.
- [x] Kế hoạch rollback và verification đã đủ.
- Trạng thái chuyển sang `FROZEN` bởi: Codex theo yêu cầu người dùng
- Thời điểm: 2026-11-19

## 11. Change Log

| CR | Thời điểm | Thay đổi | Lý do | Ảnh hưởng | Chấp thuận | Version mới |
|---|---|---|---|---|---|---|
| CR-001 | 2026-11-19 | Mở rộng contract cho đợt 2: lighting + PBR material, ảnh runtime BEFORE/AFTER cùng camera, FPS 4 quality levels | Người dùng xác nhận đợt 1 đạt và yêu cầu tiếp tục đợt 2 có bằng chứng runtime | Chỉ mở rộng `ai-office-standalone/index.html` và evidence; giữ FurniMesh/Company Builder ngoài phạm vi | Người dùng | 1.1 |
| CR-002 | 2026-11-19 | Tăng khác biệt Premium Realistic và thêm 3 góc BEFORE/AFTER lúc 12:00 | Ảnh phase 2 hiện tại khó phân biệt với BEFORE | Chỉ thay đổi lighting/PBR/contact-shadow display; không đổi geometry, FurniMesh hoặc Company Builder | Người dùng | 1.2 |

## 12. Implementation log

| Thời điểm | Revision | Công việc | Ghi chú |
|---|---|---|---|
| 2026-11-19 | working tree | Audit renderer và tạo contract đợt 1 | Giữ nguyên identity và scene data |
| 2026-11-19 | working tree | Thêm quality/style preset panel và localStorage preference | Chỉ tác động renderer settings |
| 2026-11-19 | working tree | Tạo baseline manifest | Giữ nguyên 8 ảnh baseline hiện có |
| 2026-11-19 | `b49d35ef` | Commit riêng đợt 1 | Chỉ gồm 3 file trong scope |
| 2026-11-19 | `8f34d934` | CR-001 frozen và triển khai lighting/PBR | Premium thêm warm fill/rim/bounce và điều chỉnh response MeshStandardMaterial; không đổi geometry |
| 2026-11-19 | `6f6a2263` | CR-002 frozen | Tăng contrast, contact shadow/AO-style và phân loại floor/glass/screen trước khi recapture |
| 2026-11-19 | `6f6a2263` | CR-002 runtime recapture | Sáu ảnh cùng project/12:00 ở overview, meeting và floor-cabinet |

## 13. Verification evidence

| Thời điểm | Revision | Kiểm tra | Kết quả | Evidence |
|---|---|---|---|---|
| 2026-11-19 | working tree | Inline script syntax check | PASS | `new Function(...)` trên script cuối của `ai-office-standalone/index.html` |
| 2026-11-19 | working tree | Static HTTP smoke | PASS | `http://127.0.0.1:8123/` trả HTTP 200 và title HOME&CO |
| 2026-11-19 | working tree | Headless Chrome runtime smoke | PASS | `renderer=true`, `canvas=true`, panel mở; Low đặt `R.shadowMap.enabled=false`; reload giữ `localStorage` quality=`low`; capture PNG 673726 bytes |
| 2026-11-19 | working tree | Baseline source audit | PASS | `docs/evidence/atelier-visual-baseline-2026-11-19.json` ghi camera, renderer, lights, palette và ảnh tham chiếu |
| 2026-11-19 | working tree | `git diff --check` | PASS | Không có lỗi whitespace trong các file phase-1 |
| 2026-11-19 | `b49d35ef` | Kiểm tra commit scope | PASS | Commit `feat(atelier): add visual quality foundation` chứa đúng 3 file phase-1 |
| 2026-11-19 | `8f34d934` | Phase-2 BEFORE runtime capture | PASS | `docs/evidence/after/phase2-before-original-atelier.png`; SHA-256 `A753332B1603E5B36A60AE86E20A8DE317065A116096896748516411CD20A350`; camera `0.26/0.86/21.5` |
| 2026-11-19 | `8f34d934` | Phase-2 AFTER runtime capture | PASS | `docs/evidence/after/phase2-after-premium-realistic.png`; SHA-256 `73DED26ED8884B780F23DCC608FA05C940282F45DCC89B02A0BE924A597F0517`; camera `0.26/0.86/21.5` |
| 2026-11-19 | `6f6a2263` | FPS four quality levels after CR-002 | PASS | `docs/evidence/after/phase2-fps.json`; SHA-256 `6283C31BB1FA3ECFA8DAEC316714FA24F4591BC404B8C4DEE7CF1E56A7705B5B`; Low 16.90, Medium 8.89, High 8.90, Ultra 8.89 FPS; sample 60 frames |
| 2026-11-19 | `6f6a2263` | CR-002 BEFORE/AFTER recapture | PASS | `docs/evidence/after/phase2-capture-manifest.json`; SHA-256 `511C99DE3EABBE16817F4F314895CC4FE6D6F11F27144EADE7E2A3FD8C0FEC99`; project `Phòng ngủ GLB — Bedroom Interior 6×4m`; hour `12:00`; polling locked |
| 2026-11-19 | `6f6a2263` | Overview pair | PASS | BEFORE `phase2-before-original-atelier-overview.png` SHA-256 `B6FD9DD79DB1B83081D18CBE59654B7D4C586466CBCAE98E438F7737C89DEDE4`; AFTER `phase2-after-premium-realistic-overview.png` SHA-256 `C9C913976E6EE825FB7E48ED42A6926D9C06CE9842EEBBD66B7C14007A73BD3C` |
| 2026-11-19 | `6f6a2263` | Meeting close pair | PASS | BEFORE `phase2-before-original-atelier-meeting.png` SHA-256 `F870BD256DA34FBC8633486CB5DEB3111B91E34848F68162382E9C43010C88D3`; AFTER `phase2-after-premium-realistic-meeting.png` SHA-256 `22C27A0DB443FE2FB016BDA0FC17E9912BCE8ABE73AC3F9E6671F98E964411BD` |
| 2026-11-19 | `6f6a2263` | Floor/cabinet close pair | PASS | BEFORE `phase2-before-original-atelier-floor-cabinet.png` SHA-256 `A429AA3FCE6B2C1424F698267DAE872C6632BBAF4692CE8A21BCFFEC925F78B3`; AFTER `phase2-after-premium-realistic-floor-cabinet.png` SHA-256 `3292881F6E7AD42E75F9426A9BCEA03EEB84C56B53B805D04F3CE1DCA045F03F` |

## 14. Kết quả và đóng chức năng

- Kết quả: Đợt 2 đã tăng cường Premium Realistic và có đủ evidence ba góc; chưa đóng contract.
- Hạn chế còn lại: FPS đo bằng headless software renderer thấp; cần đo lại GPU-enabled
  trên máy mục tiêu trước khi đặt ngưỡng thiết bị production.
- Việc chưa hoàn tất: FurniMesh/Company Builder/Paperclip → Pascal E2E vẫn ngoài
  scope đợt 2 và tiếp tục thuộc FEAT-2026-126.
- Rollback point: `ai-office-standalone/index.html` + baseline manifest.
- Trạng thái `VERIFYING` bởi: Chưa đóng đợt 2; chưa tuyên bố DONE Paperclip/FurniMesh/Pascal E2E.
- Thời điểm: Chưa có.

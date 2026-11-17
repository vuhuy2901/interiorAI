# ATELIER AI / Luxury 3D Office Simulation

Vite + React + TypeScript demo mô phỏng không gian điều phối của **ATELIER AI —
Studio Nội Thất & Kiến Trúc 3D**. Bản này dùng đúng roster agent/model hiện có
của ATELIER và dữ liệu event mẫu để trình diễn luồng Chief Architect → các agent
chuyên môn → BOQ/QA.

Đây là màn hình mô phỏng độc lập được nhập vào monorepo; nó chưa thay thế
Paperclip control plane và chưa tự đọc dữ liệu live từ PostgreSQL.

## Chạy ngay

```powershell
cd ai-office
npm install
npm run dev
```

Mở URL Vite in trong terminal (thường là `http://localhost:5173`). Production
build dùng `npm run build`, sau đó có thể kiểm tra bằng `npm run preview`.

## Tương tác

- Click một agent để mở profile, xem task, file, token, cost và 10 event gần nhất.
- Kéo chuột để orbit camera; dùng wheel để zoom.
- `Giờ +2h` đổi profile ánh sáng theo giờ.
- Agent ngồi tại ghế khi ở workstation; khi có handoff sẽ đứng dậy, đi giao hồ sơ
  và quay về đúng anchor ghế cũ.
- Mock event stream tự phát và lặp vô hạn; các event có `handoff_to` khiến agent
  cầm hồ sơ đi tới bàn người nhận, hiện trạng thái bàn giao trong 1.5 giây, rồi
  đi bộ về bàn cũ.

## Cây thư mục chính

```text
src/
  App.tsx
  office/OfficeScene.tsx, CameraRig.tsx, TimeLighting.tsx
  office/BlueprintWall.tsx, MaterialBoard.tsx, MiniRoom.tsx
  agents/AgentAvatar.tsx, useAgentMovement.ts, agentConfig.ts
  effects/ (đã bỏ handoff effect bay)
  events/EventBridge.ts, useEventStore.ts, events.mock.json
  ui/AgentPanel.tsx, TodayStats.tsx
```

Roster được ánh xạ theo các model key hiện có:

- `agent_chief_architect` — Kiến Trúc Sư Trưởng
- `agent_floorplan` — Phân Tích Mặt Bằng 2D
- `agent_geometry` — Dựng Hình 3D & BIM
- `agent_furniture` — Bố Trí Nội Thất
- `agent_style` — Phong Cách & Vật Liệu
- `agent_shopping` — Catalog & Mua Sắm
- `agent_cost` — Dự Toán & BOQ
- `agent_render` — Phối Cảnh & Chiếu Sáng
- `agent_qa` — QA & Xác Minh

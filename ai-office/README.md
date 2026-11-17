# AI Office / 3D Simulation

Standalone Vite + React + TypeScript demo mô phỏng một văn phòng 3D cozy indie
studio của 9 nhân viên AI. App chạy hoàn toàn bằng mock events, không cần backend.

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
- `Tua +2h` đổi profile ánh sáng theo giờ.
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

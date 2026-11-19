# [FEAT-2026-125] Nâng cấp Dashboard ATELIER – Agent Performance & Analytics

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản hợp đồng | 1.0 |
| Owner | Full-Stack AI Engineer |
| Người chấp thuận | Người dùng (theo Prompt Nâng Cấp Dashboard ATELIER) |
| Ngày tạo | 2026-11-18 |
| Frozen at | 2026-11-18 (Asia/Bangkok) |
| Revision bắt đầu | 7c38201065266b130fe5c517085954e6939abc7e |
| Revision cuối | Đang cập nhật sau khi hoàn thành |

## 1. Bối cảnh

Hệ thống điều phối Đa Tác Tử ATELIER AI trong Paperclip đang chạy các AI Agent thực thi đa dạng công việc (kiến trúc sư, bóc tách khối lượng, dựng hình CAD/3D, duyệt dự toán, v.v.).
Hiện tại giao diện Dashboard chỉ hiển thị KPI cơ bản (Agents Enabled, Tasks In Progress, Month Spend, Pending Approvals), 3 biểu đồ tổng quát 14 ngày (Run Activity, Tasks by Status, Success Rate), và danh sách tóm tắt Recent Activity / Recent Tasks.
Người quản trị chưa có cái nhìn chuyên sâu và đa chiều về hiệu suất thực tế của từng Agent: tổng thời gian chạy, thời gian chạy trung bình, tỷ lệ thành công/lỗi, xu hướng chạy theo thời gian, những lượt chạy lâu nhất (longest runs) và các bộ lọc đa chiều (thời gian, agent, project, status).

## 2. Mục tiêu

Bổ sung một khu vực thống kê độc lập, chuyên nghiệp, trải dài toàn bộ chiều ngang ở cuối trang Dashboard với tiêu đề:
**AGENT PERFORMANCE & ANALYTICS – THỐNG KÊ HIỆU SUẤT AGENTS**

Cam kết cốt lõi:
1. **Giữ nguyên 100% cấu trúc hiện tại của Dashboard**: không di chuyển, không thay đổi thứ tự, không thu nhỏ hay làm xáo trộn các thành phần hiện tại (ActiveAgentsPanel, 4 MetricCards, 3 ChartCards, Recent Activity, Recent Tasks).
2. **Dữ liệu 100% thực tế**: Tính toán từ cơ sở dữ liệu `heartbeatRuns`, `issues`, `agents`, `projects` trong PostgreSQL; không tạo số liệu giả, phân biệt rõ lượt chạy (runs) với task hoàn thành (completed issues), hỗ trợ empty state, loading state, error state.
3. **Đầy đủ 5 khối thống kê và bộ lọc**:
   - A. Bảng xếp hạng hiệu suất Agent (Agent Performance Ranking): Name, Total Runs, Total Runtime, Avg Runtime, Success Rate, Failed Runs, Completed Tasks; hỗ trợ sort.
   - B. Thống kê thời gian chạy (Runtime Analytics): Horizontal Bar so sánh tổng runtime, avg runtime, max runtime giữa các agent.
   - C. Kết quả thực thi (Execution Results): Donut Chart hiển thị tỷ lệ Successful, Failed, Recovered, Cancelled với tổng lượt chạy ở tâm.
   - D. Xu hướng sử dụng Agent (Agent Usage Trends): Line Chart hiển thị số lượt chạy của agent theo ngày/thời gian.
   - E. Top Longest Runs: Bảng 5–10 lượt chạy lâu nhất với link/click xem chi tiết.
   - Bộ lọc đồng bộ: Khoảng thời gian (24h, 7d, 30d, 90d, All), Agent, Project, Status.

## 3. Phạm vi

### In scope

- **Backend API**:
  - Endpoint `GET /api/companies/:companyId/agent-analytics`:
    - Nhận query params: `range` (24h, 7d, 30d, 90d, all), `agentId`, `projectId`, `status`.
    - Trả về cấu trúc dữ liệu phân tích hiệu suất chuẩn: `ranking`, `runtimeStats`, `executionDistribution`, `usageTrends`, `longestRuns`.
  - Logic tính toán SQL thực tế dựa trên bảng `heartbeat_runs`, `issues`, `agents`, `projects`.
- **Shared Types**:
  - Khai báo interface `AgentAnalyticsReport`, `AgentPerformanceMetric`, `AgentRuntimeMetric`, `ExecutionDistribution`, `AgentUsageTrendPoint`, `LongestRunItem`.
- **Frontend UI & Components**:
  - Thành phần `AgentPerformanceAnalytics.tsx` với phong cách Modern SaaS Dashboard, nền tím/xanh nhạt sang trọng (`bg-gradient-to-br from-indigo-50/50 via-slate-50 to-purple-50/50 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-indigo-950/40`), bo góc, đổ bóng nhẹ.
  - Các sub-cards:
    - Top Filter bar đồng bộ.
    - Performance Ranking Table (hỗ trợ sort theo Runs, Runtime, Success Rate, Failed).
    - Runtime Analytics Horizontal Bar Chart.
    - Execution Results Donut Chart (SVG clean, interactive tooltips, center total).
    - Usage Trends Line Chart (SVG multi-series, tooltips).
    - Top Longest Runs Table (link mở issue/task chi tiết).
  - Tích hợp vào `Dashboard.tsx` ngay bên dưới Recent Activity và Recent Tasks, full width.

### Out of scope

- Không thay đổi hoặc dịch chuyển bất kỳ thành phần nào của phần Dashboard phía trên.
- Không sửa schema cơ sở dữ liệu PostgreSQL (chỉ đọc dữ liệu hiện có).
- Không thêm các thư viện charting nặng cồng kềnh; sử dụng SVG/Tailwind tương thích hoàn toàn với kiến trúc Paperclip hiện tại.

## 4. Dependency và tài nguyên cần bảo vệ

- Bảng dữ liệu PostgreSQL: `heartbeat_runs`, `issues`, `agents`, `projects`, `companies`.
- API hiện có của Dashboard: `/api/companies/:companyId/dashboard`.
- Các layout và theme styling của Paperclip và ATELIER Studio.
- Không gây ảnh hưởng tới tiến trình port 3100, 8000, 8123 đang chạy.

## 5. Thiết kế và kế hoạch triển khai

1. **Bước 1**: Khởi tạo hợp đồng tính năng `FEAT-2026-125` ở trạng thái `FROZEN`.
2. **Bước 2**: Định nghĩa types cho Agent Performance Analytics trong `paperclip/packages/shared/src/types/`.
3. **Bước 3**: Xây dựng service phân tích và endpoint `GET /api/companies/:companyId/agent-analytics` trong `paperclip/server/`.
4. **Bước 4**: Thêm client API trong `paperclip/ui/src/api/dashboard.ts` hoặc `agent-analytics.ts`.
5. **Bước 5**: Xây dựng component `AgentPerformanceAnalytics.tsx` với đầy đủ 5 phân hệ thống kê, bộ lọc, tooltip, loading & empty state.
6. **Bước 6**: Nhúng component vào cuối `paperclip/ui/src/pages/Dashboard.tsx`.
7. **Bước 7**: Kiểm thử build TypeScript, kiểm tra endpoint API bằng PowerShell/Curl, kiểm tra hiển thị trên trình duyệt.
8. **Bước 8**: Cập nhật evidence và chuyển hợp đồng sang `CLOSED`.

## 6. File/component dự kiến thay đổi

| File hoặc component | Loại thay đổi | Lý do |
|---|---|---|
| `docs/features/FEAT-2026-125-dashboard-agent-performance-analytics.md` | Mới | Hợp đồng tính năng bắt buộc |
| `paperclip/packages/shared/src/types/agent-analytics.ts` | Mới | Định nghĩa kiểu dữ liệu báo cáo phân tích hiệu suất |
| `paperclip/packages/shared/src/types/index.ts` | Cập nhật | Re-export agent analytics types |
| `paperclip/server/src/services/agent-analytics.ts` | Mới | Service truy vấn và tổng hợp chỉ số hiệu suất từ database |
| `paperclip/server/src/routes/dashboard.ts` | Cập nhật | Endpoint REST phục vụ agent-analytics |
| `paperclip/ui/src/api/dashboard.ts` | Cập nhật | Hàm gọi API frontend |
| `paperclip/ui/src/components/AgentPerformanceAnalytics.tsx` | Mới | Giao diện khu vực AGENT PERFORMANCE & ANALYTICS |
| `paperclip/ui/src/pages/Dashboard.tsx` | Cập nhật | Nhúng khu vực thống kê ở cuối Dashboard (full width) |

## 7. Acceptance criteria

- [ ] AC-01: Giữ nguyên 100% cấu trúc Dashboard hiện tại (Agents list, 4 Metric cards, 3 Chart cards, Recent Activity, Recent Tasks) không bị xô lệch, mất mát hay đổi thứ tự.
- [ ] AC-02: Khu vực mới "AGENT PERFORMANCE & ANALYTICS – THỐNG KÊ HIỆU SUẤT AGENTS" nằm ở cuối trang, ngay dưới Recent Activity & Recent Tasks, trải dài toàn bộ chiều ngang.
- [ ] AC-03: Giao diện nền tím/xanh nhạt sang trọng, bo góc, bóng mờ nhẹ, card độc lập, chuẩn Modern SaaS.
- [ ] AC-04: Đầy đủ 5 phân hệ: (A) Bảng xếp hạng Agent với sắp xếp, (B) Biểu đồ thanh ngang Runtime, (C) Biểu đồ Donut kết quả thực thi, (D) Biểu đồ Line xu hướng sử dụng theo ngày, (E) Bảng Top Longest Runs với link mở chi tiết.
- [ ] AC-05: Bộ lọc góc trên bên phải đồng bộ toàn bộ bảng và biểu đồ (thời gian: 24h/7d/30d/90d/All, Agent, Project, Status).
- [ ] AC-06: Dữ liệu tính toán từ lịch sử thực tế trong DB, phân biệt rõ runs và completed tasks, không tính retry thành task mới, tính chính xác runtime.
- [ ] AC-07: Có Empty State rõ ràng nếu chưa có dữ liệu, có Loading State và Error State.
- [ ] AC-08: TypeScript và code build không có lỗi cú pháp hay gãy typing.

## 8. Verification plan

| Kiểm tra | Cách chạy | Kết quả mong đợi |
|---|---|---|
| Kiểm tra Type & Build | `pnpm --filter @paperclipai/shared build`, `pnpm --filter @paperclipai/ui build` (hoặc typecheck) | 0 lỗi compilation |
| Kiểm tra API Backend | `Invoke-RestMethod http://127.0.0.1:3100/api/companies/<id>/agent-analytics` | Trả về JSON 200 với các trường hợp lệ |
| Kiểm tra Dashboard UI | Kiểm tra trực quan route `/dashboard` | Giao diện trên giữ nguyên 100%, bên dưới có khu vực Analytics đẹp mắt, mượt mà |

## 9. Rủi ro và rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Lệnh truy vấn SQL nặng làm chậm database | Thêm điều kiện filter theo `company_id` và giới hạn index/range, hạn chế query scan toàn bảng |
| Màn hình nhỏ bị vỡ bố cục bảng/chart | Thiết kế responsive với container query, flex/grid wrap, thanh cuộn ngang an toàn cho table |
| Rollback nếu phát sinh sự cố | Component được tách độc lập hoàn toàn, dễ dàng revert via Git |

## 10. Tóm tắt các lần xem xét

| Lần | Ngày | Người xem xét | Ý kiến | Kết quả |
|---|---|---|---|---|
| 1 | 2026-11-18 | Tech Lead / PO | Khởi tạo hợp đồng đóng băng đúng theo yêu cầu | Chấp thuận FROZEN |

## 11. Bảng yêu cầu thay đổi

*(Chưa có thay đổi phát sinh)*

## 12. Implementation log

*(Sẽ ghi nhận từng bước triển khai)*

## 13. Verification evidence

*(Sẽ ghi nhận log và kết quả kiểm thử sau triển khai)*

## 14. Kết quả và đóng chức năng

*(Sẽ đóng sau khi hoàn tất nghiệm thu)*

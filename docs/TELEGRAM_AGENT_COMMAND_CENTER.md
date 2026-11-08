# ATELIER AI 2.0 — TRUNG TÂM ĐIỀU PHỐI AGENT QUA TELEGRAM (2 CHIỀU)

Tài liệu thiết kế kiến trúc, hướng dẫn thiết lập và vận hành hệ thống điều phối đa Agent qua Telegram Bot chính thức, tích hợp trực tiếp vào nhân điều phối Paperclip của **ATELIER AI 2.0**.

---

## 1. TỔNG QUAN KIẾN TRÚC & NGUYÊN LÝ HOẠT ĐỘNG

```mermaid
flowchart TD
    subgraph Telegram["Người dùng Telegram"]
        User["Người dùng / KTS / Khách hàng"]
        Bot["Telegram Bot Official API (@BotFather)"]
    end

    subgraph PaperclipLocal["ATELIER AI 2.0 Local-Lite (Windows / :3100)"]
        Poller["Telegram Poller (getUpdates Long Polling)"]
        Auth["Xác thực Pairing & Whitelist"]
        Router["Bộ phân tích ý định & Phân phối lệnh"]
        TaskMgr["Task & Approval Synchronization Manager"]
        
        subgraph PaperclipCore["Paperclip Core & Database (Embedded Postgres :54329)"]
            Agents["8 Specialist Agents"]
            Issues["Issues / Tasks (ATL-X)"]
            Comments["Issue Comments (2-Way Sync)"]
            Approvals["Approvals / Proposals"]
        end
    end

    User <-->|Nhắn tin / Lệnh / Nút bấm| Bot
    Bot <-->|HTTPS Long Polling (Offset checkpoint)| Poller
    Poller --> Auth
    Auth --> Router
    Router --> TaskMgr
    TaskMgr <--> Agents
    TaskMgr <--> Issues
    TaskMgr <--> Comments
    TaskMgr <--> Approvals
```

### Các nguyên tắc kỹ thuật cốt lõi:
1. **Long Polling (`getUpdates`)**: Hoạt động 100% cục bộ trên Windows mà **không cần Public Webhook, ngrok, Tailscale hay Cloud Server**.
2. **Task & Conversation Thật trong Paperclip**: Mọi yêu cầu từ Telegram đều tạo Task thực tế trong bảng `issues` với mã định danh `ATL-X` và phân công đích danh cho 1 trong 8 Agent.
3. **Đồng bộ hai chiều (Two-Way Sync)**: Khi người dùng **Reply** tin nhắn trên Telegram, nội dung phản hồi tự động được ghi nhận thành bình luận trong Task tương ứng trên Paperclip.
4. **Phê duyệt phương án bằng Inline Keyboard**: Đề xuất thiết kế và tác động ngân sách gửi về Telegram đi kèm 3 nút bấm tương tác: `[✅ Phê duyệt]`, `[❌ Từ chối]`, `[✏️ Yêu cầu sửa]`.
5. **Zero Docker, Zero Redis, Zero RabbitMQ**: Chạy ngầm trong tiến trình Node.js của Paperclip với mức tiêu thụ RAM bổ sung `< 15 MB`.
6. **Bảo mật tuyệt đối**: Token được che giấu (`••••••••`), chỉ cho phép các tài khoản đã ghép nối bằng mã 6 ký tự hoặc nằm trong Whitelist sử dụng Bot.

---

## 2. HƯỚNG DẪN TẠO BOT VỚI BOTFATHER

Để kết nối với ATELIER AI 2.0, bạn chỉ mất chưa tới 2 phút để tạo một Telegram Bot miễn phí:

1. Mở ứng dụng Telegram, tìm tài khoản chính thức **[@BotFather](https://t.me/BotFather)** (có dấu tích xanh).
2. Gửi lệnh:
   ```text
   /newbot
   ```
3. Nhập tên hiển thị cho Bot, ví dụ:
   ```text
   ATELIER AI Studio Bot
   ```
4. Nhập username kết thúc bằng chữ `bot`, ví dụ:
   ```text
   AtelierInteriorDesignerBot
   ```
5. BotFather sẽ trả về **HTTP API Token** có dạng:
   ```text
   7182948201:AAHk_3... (chuỗi ký tự bí mật)
   ```
6. Cấu hình danh mục lệnh cho Bot:
   Gửi `/setcommands` cho BotFather, chọn bot vừa tạo, sau đó dán đoạn mã sau:
   ```text
   start - Kết nối và ghép nối tài khoản
   agents - Xem danh sách 8 Agent chuyên trách
   newtask - Giao công việc mới qua menu chọn Agent
   tasks - Danh sách các công việc đang thực hiện
   approvals - Xem và phê duyệt các đề xuất thiết kế
   status - Kiểm tra trạng thái hệ thống Local-Lite
   progress - Xem tiến độ dự án hiện tại
   report - Báo cáo tổng hợp không gian và dự toán
   help - Hướng dẫn sử dụng chi tiết
   ```
7. Mở trình duyệt tại máy tính: truy cập `http://127.0.0.1:3100/settings/telegram`.
8. Dán Bot Token vào ô **Telegram Bot Token** và bấm **Lưu Cấu Hình & Cập Nhật Poller**.

---

## 3. CƠ CHẾ BẢO MẬT & GHÉP NỐI TÀI KHOẢN (PAIRING CODE)

Để ngăn chặn người lạ giao việc hoặc xem dự án của bạn:
1. Mọi tài khoản Telegram lần đầu nhắn tin cho Bot đều nhận thông báo yêu cầu xác thực.
2. Tại web `http://127.0.0.1:3100/settings/telegram`, bấm nút **Tạo Mã Ghép Nối Mới**.
3. Hệ thống sinh ra một mã xác thực 6 ký tự (VD: `ATL-8472`), có hiệu lực trong 15 phút.
4. Trên điện thoại/máy tính, gửi tin nhắn cho Bot:
   ```text
   /pair ATL-8472
   ```
5. Hệ thống xác nhận và gắn kết vĩnh viễn Telegram User ID của bạn vào cơ sở dữ liệu. Bạn có thể hủy ghép nối bất cứ lúc nào trên web.

---

## 4. DANH MỤC LỆNH ĐIỀU KHIỂN

| Lệnh | Ý nghĩa & Hành động hệ thống | Giao diện Telegram |
| :--- | :--- | :--- |
| `/start` | Chào mừng, kiểm tra quyền truy cập và hướng dẫn bắt đầu. | Thẻ chào mừng + Menu nút bấm |
| `/agents` | Đọc danh sách 8 Agent từ Paperclip DB, hiển thị vai trò và nút giao việc nhanh. | Inline Keyboard 8 Agent |
| `/newtask` | Bắt đầu quy trình tạo công việc mới có hướng dẫn tương tác. | Lưới chọn Agent + Ô nhập prompt |
| `/tasks` | Liệt kê các công việc đang thực hiện (`in_progress`, `todo`, `in_review`). | Danh sách Task + Nút xem chi tiết |
| `/task <mã>` | Xem chi tiết 1 Task (tiêu đề, Agent phụ trách, mô tả, bình luận gần nhất). | Thẻ thông tin công việc |
| `/approvals` | Liệt kê các đề xuất thiết kế hoặc thay đổi vật tư/chi phí đang chờ duyệt. | Thẻ đề xuất + 3 Nút Duyệt/Từ chối/Sửa |
| `/status` | Đo kiểm RAM (Node RSS), CPU, cơ sở dữ liệu Postgres, số lượng message và task. | Thẻ hạ tầng Local-Lite |
| `/progress` | Thước đo tiến độ công việc dự án theo tỷ lệ phần trăm (ASCII progress bar). | `[████████░░] 80%` |
| `/report` | Báo cáo quy cách phòng khách mẫu 4x5m, kích thước BIM và 3 gói dự toán BOQ. | Bản tóm tắt kỹ thuật & chi phí |
| `/cancel <mã>`| Hủy công việc chỉ định và ghi nhận lý do vào Paperclip. | Thông báo xác nhận hủy |
| `/help` | Xem toàn bộ cú pháp lệnh và mẹo giao việc bằng ngôn ngữ tự nhiên. | Bảng trợ giúp chi tiết |

---

## 5. MA TRẬN GIAO VIỆC BẰNG NGÔN NGỮ TỰ NHIÊN

Hệ thống tích hợp bộ phân giải ngôn ngữ tự nhiên tiếng Việt để ánh xạ chính xác đến 8 Agent chuyên trách:

| Câu lệnh ví dụ từ Telegram | Agent tiếp nhận | Hành vi hệ thống |
| :--- | :--- | :--- |
| *"Giao cho Geometry Agent dựng một căn phòng 4×5m, có một cửa ra vào và hai cửa sổ."* | **Geometry & BIM Specialist** | Tạo Task `ATL-X` gán cho Geometry Agent, ghi nhận tọa độ và kích thước BIM vào mô hình 3D. |
| *"Nhập bản vẽ mặt bằng 2D khảo sát căn hộ mẫu."* | **Floor Plan Specialist** | Khởi tạo công việc chuẩn hóa tỷ lệ và bóc tách đường biên tường 2D. |
| *"Bố trí lại sofa 3 chỗ và thêm bàn trà mặt đá tròn."* | **Furniture Planner** | Tạo công việc quy hoạch công năng, kiểm tra lối đi tối thiểu ≥ 700mm. |
| *"Đổi màu sơn tường sang Xanh Xô Thơm và sàn gỗ sồi."* | **Style & Material Consultant** | Cập nhật vật liệu trong danh mục hoàn thiện bề mặt Mục 7B. |
| *"Render lại góc nhìn phối cảnh hướng từ cửa chính vào."* | **Rendering Specialist** | Thiết lập góc máy camera và cường độ chiếu sáng 3D. |
| *"Báo giá lại dự toán theo gỗ MDF chống ẩm An Cường."* | **Cost Estimator** | Khởi chạy bóc tách BOQ chi phí xác định thị trường Việt Nam. |
| *"Tìm link mua mẫu đèn trần thả tròn phong cách Bắc Âu."* | **Shopping Researcher** | Khảo sát nhà cung cấp và lập danh mục mua sắm kèm mã sản phẩm. |
| *"Thiết kế phòng khách cho đẹp hơn."* *(Chưa rõ yêu cầu)* | **Chief Architect** | KTS Trưởng hỏi lại người dùng để làm rõ phong cách (Hiện đại/Japandi) và ngân sách trước khi giao việc chuyên môn. |

---

## 6. KẾT QUẢ ĐO KIỂM THỰC TẾ (12/12 BƯỚC ĐẠT 100%)

Tập lệnh kiểm thử tự động `scratch/test_telegram_agent_command_center.mjs` xác nhận:
- [x] **Bước 1**: Endpoint `/api/health` trả về `status: ok` (v0.3.1).
- [x] **Bước 2**: Bảo vệ an toàn Token qua `/api/atelier/telegram/status`, che giấu dạng `••••••••`.
- [x] **Bước 3**: Tải thành công 8 Specialist Agent từ cơ sở dữ liệu Paperclip.
- [x] **Bước 4**: Tạo mã ghép nối 6 ký tự `ATL-XXXX` với thời hạn tự hủy sau 15 phút.
- [x] **Bước 5**: Lệnh `/agents` trả về đầy đủ 8 chuyên gia thiết kế cho Telegram Keyboard.
- [x] **Bước 6**: Phân tích câu lệnh tự nhiên tiếng Việt và tạo Task thực tế gán cho Geometry Specialist.
- [x] **Bước 7**: Task mới xuất hiện tức thì trong danh sách `/tasks` và cơ sở dữ liệu Paperclip.
- [x] **Bước 8**: Cơ chế Reply-to-Comment đồng bộ 2 chiều vào đúng Task trong Paperclip.
- [x] **Bước 9**: Lệnh `/progress` tính toán chính xác tỷ lệ hoàn thành công việc dự án.
- [x] **Bước 10**: Endpoint kiểm tra kết nối từ chối an toàn mã lỗi 401 khi token sai mà không làm sập máy chủ.
- [x] **Bước 11**: Lưu vết đầy đủ nhật ký sự kiện, tin nhắn và lỗi vào bộ nhớ phục vụ giám sát.
- [x] **Bước 12**: Cập nhật cấu hình và danh sách Whitelist bền vững qua API.

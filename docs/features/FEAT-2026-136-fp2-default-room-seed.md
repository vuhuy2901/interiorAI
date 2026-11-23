# [FEAT-2026-136] FP2 Default Room Seed — layout phòng gốc khi khởi tạo

| Trường | Giá trị |
|---|---|
| Trạng thái | FROZEN |
| Phiên bản | 1.0 |
| File duy nhất | `ai-office-standalone/index.html` |
| Frozen | 2026-11-20 |

---

## 1. Vấn đề

`fp2Load()` không seed gì khi localStorage trống → FP2.floor rỗng → không có tường để test/drag.

---

## 2. Phạm vi

### In scope
- Khi localStorage không có dữ liệu FP2 (raw===null hoặc raw.v!==2), seed FP2.floor với các ô sàn khớp layout gốc 7 phòng + hành lang
- Rooms seed với ô INTERIOR (bỏ qua cột/hàng biên chung) → FP2 auto-wall tạo tường ngăn phòng
- Seed chỉ chạy 1 lần, localStorage lưu sau đó

### Out of scope  
- Door openings (người dùng tự mở sau)
- Thay đổi hardcoded room geometry
- Thay đổi corridor style hay màu sắc FP2

---

## 3. Rooms layout (cell ranges cho FP2)

| Room | c range | r range | Lý do skip |
|---|---|---|---|
| ops [0,0,16,16] | 0..14 | 0..14 | skip c=15 (wall vs meet), skip r=15 (wall vs corridor) |
| meet [15,0,40,16] | 16..38 | 0..14 | skip c=15, c=39, r=15 |
| mira [39,0,60,16] | 40..59 | 0..14 | skip c=39, r=15 |
| corridor [0,16,60,22] | 0..59 | 16..21 | full |
| design [0,22,20,40] | 0..18 | 23..39 | skip c=19, r=22 |
| bim [19,22,38,40] | 20..36 | 23..39 | skip c=19, c=37, r=22 |
| cost [37,22,52,40] | 38..50 | 23..39 | skip c=37, c=51, r=22 |
| qa [51,22,60,40] | 52..59 | 23..39 | skip c=51, r=22 |

Gaps tạo tường:
- c=15 → wall giữa ops/meet
- c=39 → wall giữa meet/mira
- r=15 → wall giữa top-wing/corridor  
- r=22 → wall giữa corridor/bottom-wing
- c=19,c=37,c=51 → walls giữa các phòng dưới

---

## 4. Vị trí thay đổi

```js
// Trong fp2Load(), thêm else branch:
function fp2Load(){
  try{
    const raw=JSON.parse(localStorage.getItem(FP2_KEY)||'null');
    if(raw&&raw.v===2){ ... }
    else { fp2SeedDefaultRooms(); }
  }catch{}
}

function fp2SeedDefaultRooms(){
  const seg=[[0,0,15,15],[16,0,39,15],[40,0,60,15],[0,16,60,22],[0,23,19,40],[20,23,37,40],[38,23,51,40],[52,23,60,40]];
  seg.forEach(([c0,r0,c1,r1])=>{ for(let c=c0;c<c1;c++) for(let r=r0;r<r1;r++) FP2.floor.add(c+','+r); });
}
```

---

## 5. Acceptance criteria

- [ ] Khi xóa localStorage và reload: FP2.floor.size > 1000
- [ ] Vào Build Mode → Wall mode: hover gần c=15 → 2 orange sphere handles xuất hiện
- [ ] Walls hiển thị giữa các phòng (gap rõ ràng ở c=15, c=39, r=15)
- [ ] Lưu localStorage sau seed → reload lần 2 không seed lại
- [ ] Không phá vỡ paint/furniture/erase mode

---

## 6. Rollback

Revert `else { fp2SeedDefaultRooms(); }` trong fp2Load().

---

## 7. Verification log

| Thời điểm | Revision | Kiểm tra | Kết quả |
|---|---|---|---|

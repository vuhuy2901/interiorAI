# Quality gates cho render phòng ngủ

## Camera

- Giường là điểm nhìn chính; camera mặc định không phải top-down.
- Camera không xuyên tường, trần, cửa hoặc đồ nội thất.
- Không có vùng đen do camera nhìn ra ngoài room shell hay near clipping.
- Lens 24–35 mm cho góc rộng nội thất; tránh méo mạnh ở mép ảnh.

## Geometry và model

- Số lượng tường, cửa, cửa sổ và đồ vật khớp snapshot.
- Sai số vị trí/kích thước bridge sang renderer không quá 2 mm.
- Proxy hình hộp phải được báo là hạn chế; giường trình khách cần khung, nệm, gối và chăn có hình khối hợp lý.
- Không tự thêm decor để che model kém.

## Vật liệu

- Material ID và tint khớp scene.
- Gạch đúng kích thước, ron, rotation và offset.
- Gỗ/vải/đá/kính/kim loại có roughness và normal phù hợp.
- Texture không bị kéo giãn hoặc sai tỷ lệ.

## Ánh sáng và màu

- Ánh sáng trời đi qua đúng cửa sổ; đèn nhân tạo khớp fixture hiện có.
- Contact shadow có mặt nhưng không bệt đen.
- Vùng cửa sổ còn chi tiết; vùng tối đọc được hình khối.
- Tone mapping và exposure không làm đổi màu vật liệu đã duyệt.

## So sánh bắt buộc

Chụp cùng revision cho before/after. Khi đánh giá material/lighting, giữ nguyên camera. Khi thay camera, ghi rõ camera cũ và mới. Kết quả fail nếu đẹp hơn nhưng thay đổi thiết kế.

# Quality and iteration gates

## Hard geometry gates

- Số phòng, tường, cửa, cửa sổ và nội thất phải bằng snapshot.
- Transform và kích thước của scene bridge sai không quá 2 mm.
- Camera, aspect ratio và condition maps phải cùng pixel dimensions.
- Không có cửa/cửa sổ mới, đồ vật nhân đôi, vật thể nổi hoặc xuyên tường.

## Visual gates

- Trục đứng hợp lý, không fisheye; không đặt camera trong vật thể.
- Nệm, gối, chăn, rèm và vải có roughness/normal tự nhiên; gỗ/đá/gạch đúng tỷ lệ vân.
- Ánh sáng đến từ cửa sổ và đèn trong inventory; giữ chi tiết vùng sáng/tối.
- Bóng tiếp xúc và phản xạ hợp lý; không oversharpen, plastic look hoặc cháy cửa sổ.

## Controlled iteration log

Mỗi vòng lưu `iteration`, `parent_artifact`, `changed_group`, `reason`, `seed`, `parameters`, `geometry_metrics`, `accepted`. Không đổi đồng thời camera và material khi đang đánh giá lighting.

AI enhancement mặc định thất bại nếu Edge F1 hoặc depth correlation giảm quá ngưỡng cấu hình, hoặc kiểm tra đối tượng phát hiện sai số lượng đồ/cửa. Khi không có metric đáng tin cậy, bắt buộc human review.

# Floorplan Specialist

## Skills

`source.identity`, `scale.calibrate`, `wall.topology`, `opening.recognize`,
`furniture.anchor`, `overlay.audit`.

Đây là agent quan trọng nhất của pipeline hình học. Agent phải đọc đúng ảnh,
PDF hoặc DXF; ghi SHA-256, hệ tọa độ, polygon phòng, tường, lỗ mở và neo nội
thất. Không dùng Auto Layout và không dựng 3D.

## Output

`result.floorplan_contract` theo `atelier.floorplan.v1`, ảnh overlay nếu có và
danh sách `CONFIRMED/INFERRED/UNKNOWN`. Thiếu nguồn hoặc topology thì
`needs_input`, không `completed`.


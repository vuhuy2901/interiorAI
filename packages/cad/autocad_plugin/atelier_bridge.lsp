;;; ============================================================================
;;; ATELIER AI — AutoCAD AutoLISP Bridge Suite
;;; File: packages/cad/autocad_plugin/atelier_bridge.lsp
;;; Commands:
;;;   ATELIER_AUDIT : Kiểm tra các lớp chuẩn A-WALL, A-DOOR, A-WIND, A-FURN, A-DIM
;;;   ATELIER_EXPORT_INFO : Hướng dẫn xuất DXF R2007 tỷ lệ 1:1 (mm) cho ATELIER AI
;;; ============================================================================

(defun c:ATELIER_AUDIT ( / lay_list lay_name)
  (princ "\n[ATELIER AI] Đang kiểm tra tiêu chuẩn Layer bản vẽ nội thất (Đơn vị: mm)...")
  (setq lay_list '("A-WALL" "A-DOOR" "A-WIND" "A-FURN" "A-ROOM-NAME" "A-DIM"))
  (foreach lay_name lay_list
    (if (tblsearch "LAYER" lay_name)
      (princ (strcat "\n  + Layer " lay_name ": OK (Đã tồn tại)"))
      (progn
        (command "._-LAYER" "_Make" lay_name "")
        (princ (strcat "\n  + Layer " lay_name ": Đã khởi tạo tự động"))
      )
    )
  )
  (setvar "INSUNITS" 4) ; 4 = Millimeters
  (princ "\n[ATELIER AI] Hoàn tất! Đơn vị INSUNITS đã khóa ở mức 4 (Millimeters).")
  (princ)
)

(defun c:ATELIER_EXPORT_INFO ()
  (alert "ATELIER AI CAD Bridge:\n1. Chạy lệnh ATELIER_AUDIT để chuẩn hóa Layer A-WALL, A-DOOR, A-WIND, A-FURN.\n2. Lưu bản vẽ dưới định dạng AutoCAD 2007 DXF (*.dxf) để nhập 1:1 vào ATELIER AI Studio.")
  (princ)
)

(princ "\n[ATELIER AI] Đã nạp AutoLISP Bridge. Gõ ATELIER_AUDIT để kiểm tra chuẩn Layer.")
(princ)

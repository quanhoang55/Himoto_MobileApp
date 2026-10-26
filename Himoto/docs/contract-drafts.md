# Nhập hợp đồng và lưu nháp — 07/10/2026

- `/contracts`: danh sách hợp đồng, nút **Nhập hợp đồng**, tab **Lưu nháp**, trạng thái **Nợ xấu**.
- `/contracts/drafts`: mục **Log**, chỉ liệt kê hợp đồng `draft`; mở bằng nút sửa để tiếp tục và **Lưu nháp** để cập nhật cùng ID/mã.
- Có thể lưu khi chưa điền đủ khách, nhân sự, xe hoặc thời gian. Dữ liệu đã nhập phải có giá trị hợp lệ; in vẫn yêu cầu đủ thông tin.
- Xem chi tiết và mở mẫu in trong giao diện mới; không chuyển sang web Render cũ.
- **Làm mới** tải lại dữ liệu API với `cache: no-store`; API lỗi không thay bằng dữ liệu mẫu.

## Supabase cục bộ

`.env.local` được Git bỏ qua. Dùng kết nối `DATABASE_URL` hoặc `SUPABASE_DATABASE_URL` hiện có cùng:

```dotenv
NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE=api
NEXT_PUBLIC_MANAGEMENT_API_MODE=supabase-local
```

Chạy `npm.cmd run dev` và mở `http://127.0.0.1:3000/contracts/drafts`.

Adapter dùng POST/PUT trên đường dẫn hợp đồng `/api/auth/order/car-rental[/ID]`. Chỉ tạo/cập nhật đơn có `order_status=draft`, dùng các cột sẵn có trong `himoto.orders`: `draft_reference`, `draft_payload` và thông tin hợp đồng. Snapshot đầy đủ nằm ở `draft_payload.management_composer`; dữ liệu `order_items` cũ và các trường ngoài snapshot được giữ lại. Dữ liệu soạn không tạo khoản thu/cọc, không thay đổi trạng thái xe hoặc bảng chi tiết xe vận hành. Hợp đồng đã phát hành bị từ chối cập nhật tại luồng này.

API trả `draft_revision` từ PostgreSQL `xmin`. Cập nhật phải gửi đúng revision hiện tại; nếu người khác đã sửa, trả HTTP 409 và giữ nội dung đang nhập trong form. Không đổi schema database.

API database vẫn chỉ hoạt động trong development và server dev chỉ bind `127.0.0.1`. Chưa có đăng nhập cho bản standalone; không mở dữ liệu Supabase công khai trên Vercel. Biến kết nối và nội dung `.env.local` không được commit/push.

## Demo

Khi chọn `NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE=demo`, chỉ bản nháp hợp đồng được lưu trong localStorage của trình duyệt, tách khỏi dữ liệu API. Bản nháp sống qua tải lại trang; các thay đổi danh mục/bản hợp đồng mẫu khác vẫn chỉ giữ trong phiên. **Khôi phục dữ liệu mẫu** xóa cả bản nháp demo sau hộp xác nhận. Demo không đồng bộ giữa thiết bị/tài khoản.

## Kiểm tra

```powershell
npm.cmd run test:drafts
node scripts/check-contract-drafts.cjs --database
python scripts/check-contract-drafts-ui.py --source api
python scripts/check-contract-drafts-ui.py --url http://localhost:3001 --source demo
```

Kiểm tra database tạo/sửa dữ liệu QA trong một transaction rồi ROLLBACK; không giữ bản ghi QA. Browser ở chế độ API chỉ đọc dữ liệu thật và chặn mọi request ghi. Ảnh QA chỉ được chụp ở chế độ demo để tránh đưa thông tin khách hàng thật vào Git.

Kết quả cục bộ ngày 07/10/2026: typecheck/lint/build đạt; 6 nhóm dữ liệu/database, 4 nhóm browser API, 3 nhóm browser demo đạt. Hồi quy danh mục 8 nhóm, sao chép/khách hàng 8 nhóm và auto-fill/in 11 nhóm đạt. Production build trả 404 cho GET/POST/PUT database. Dữ liệu QA trong Supabase đã được rollback.

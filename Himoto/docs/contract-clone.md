# Sao chép hợp đồng và hồ sơ khách hàng

## Giao diện

- Mỗi dòng hợp đồng có nút **Sao chép hợp đồng**. Bấm tạo ngay bản ghi demo với ID tăng mới và mã không trùng, rồi mở modal **Chỉnh sửa hợp đồng** của bản đó. Đóng modal vẫn giữ bản ghi đã sao chép. Có thể mở lại bằng icon sửa ở bảng.
- Sao chép giữ nguyên trạng thái, cơ sở, khách hàng, xe, thời gian, các số tiền, ghi chú và những trường khác của nguồn; chỉ ID/mã hiển thị của bản mới được cấp lại. Hợp đồng hủy vẫn giữ trạng thái hủy cho đến khi người dùng sửa. Không tạo giao dịch hay thay đổi trạng thái xe.
- Form sửa cho lưu trạng thái, loại hợp đồng, ghi chú, nhân sự đúng cơ sở, snapshot hồ sơ khách, nhiều xe và toàn bộ thông tin trên mẫu in. ID/mã đã cấp không sửa. Kiểm tra thông tin bắt buộc trước khi lưu; fixture cũ thiếu giờ/nhân sự cần bổ sung. Mẫu in vẫn giữ watermark nháp.
- Snapshot lưu bằng `draft_json` trong view model demo, không phải thay đổi schema DB. Mở lại hoặc sao chép tiếp giữ cả dữ liệu nhiều xe và thông tin đã chỉnh, không tự nạp đè từ danh mục khách hàng. Nút **Tra cứu** chủ động nạp lại hồ sơ khi người dùng cần.
- Khách hàng có trạng thái **Blacklist (khách nợ xấu)**, hiển thị đỏ và lọc được theo trạng thái. Ghi chú cảnh báo không thay thế Blacklist.
- Thêm/sửa khách hàng và popup thêm khách trong hợp đồng đều có dropdown cơ sở lấy từ danh mục chung. Cơ sở mới thêm xuất hiện ngay. Popup mặc định theo cơ sở hợp đồng. Khách chưa có hợp đồng vẫn xuất hiện đúng bộ lọc cơ sở của hồ sơ.

## Adapter và giới hạn

`ManagementRepository.cloneContract(id)` và `saveContract(id, edits)` trả `{ row, dataset }`. Demo cấp ID đồng bộ, sao chép độc lập, cập nhật danh sách chung; không lưu DB/localStorage. Chuyển màn giữ dữ liệu, tải lại trang mất thay đổi.

Chế độ API hiện chỉ đọc danh sách hợp đồng. Source Nest đã có create/update đơn thuê xe nhưng chưa có endpoint clone được xác minh. Adapter không gọi các route nghiệp vụ này để giả lập sao chép; `cloneContract`/`saveContract` báo chưa tích hợp và không gửi request. UI ẩn sao chép/sửa ở chế độ API.

Khi tích hợp backend hiện có, cần cung cấp endpoint sao chép trả ID/mã mới do server cấp, DTO đầy đủ (khách, nhiều xe, phụ kiện, thời gian, tài chính, thông tin in), endpoint cập nhật, quyền ghi và xử lý trùng yêu cầu. Đây là phần kết nối còn thiếu, không sửa API/database hoặc module đơn thuê xe trong lần triển khai này.

Adapter khách hàng đọc `store_id` và `status`; chấp nhận alias đọc `bad_debt` thành `blacklist`. Không suy diễn cơ sở từ hợp đồng hoặc ID khách hàng. API tạo khách hiện chỉ hỗ trợ năm trường `name`, `phone`, `email`, `address`, `id_card`; popup API tiếp tục chỉ nhận các trường được lưu thật. Cần xác nhận API ghi trạng thái/cơ sở trước khi bật hai trường này ở chế độ API; adapter từ chối nếu được truyền assignment chưa hỗ trợ.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:management
npm.cmd run test:contracts
npm.cmd run test:clone
npm.cmd run build
python scripts/check-contract-clone-ui.py --url http://localhost:3001
python scripts/check-contract-ui.py --url http://localhost:3001 --output docs/qa/contracts-clone/autofill-regression
python scripts/check-management-ui.py --url http://localhost:3001 --output docs/qa/contracts-clone/management-regression
```

Các ca kiểm tra bao gồm ID đồng thời, nguồn không thay đổi, trường không nhận diện vẫn được sao chép, snapshot nhiều xe sau lưu/mở lại/sao chép tiếp, API chưa tích hợp không ghi dữ liệu, Blacklist/cơ sở ở bảng và popup, dropdown cập nhật theo danh mục, in snapshot và thao tác mobile 375px. Kết quả và ảnh nằm trong `docs/qa/contracts-clone`.

Bản production cục bộ đạt 7 nhóm dữ liệu sao chép/khách hàng, 8 nhóm tương tác tính năng mới, 11 nhóm hồi quy auto-fill/in và 8 nhóm hồi quy danh mục; không có lỗi JavaScript hay request ghi API. Xem [kết quả tính năng mới](qa/contracts-clone/functional-results.json), [form sao chép desktop](qa/contracts-clone/clone-edit-1440.png), [mobile](qa/contracts-clone/clone-edit-375.png), [khách hàng Blacklist/cơ sở](qa/contracts-clone/customer-status-branch-1440.png).

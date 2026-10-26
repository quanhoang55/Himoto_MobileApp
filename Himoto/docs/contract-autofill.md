# Auto-fill và in hợp đồng

Phạm vi bổ sung ngày 06/10/2026: điền thông tin cho mẫu in tại màn danh sách hợp đồng, lọc nhân sự theo cơ sở, tìm khách hàng bằng giấy tờ, thêm khách hàng bằng modal. Không phát hành hợp đồng hoặc thực hiện nghiệp vụ đơn thuê xe.

Phần bổ sung tiếp theo cho phép sao chép/lưu chỉnh sửa bản ghi demo với ID/mã riêng và thêm Blacklist/cơ sở cho khách hàng. Xem [sao chép hợp đồng](contract-clone.md); chế độ API hợp đồng vẫn chỉ đọc và cần kết nối riêng.

## Giao diện

- Mở nút **Điền và in hợp đồng** để soạn mẫu mới, hoặc icon máy in của một dòng để đổ dữ liệu hợp đồng đã có.
- Cơ sở được chọn quyết định danh sách nhân sự. Dùng ID để phân biệt người trùng tên; nhân sự không làm việc bị vô hiệu hóa. Đổi cơ sở xóa nhân sự và xe đang chọn. Trạng thái tải/lỗi/danh sách trống hiển thị rõ.
- Tra cứu CCCD 12 số, CMND 9 số sau 350ms; giữ số 0 đầu. Demo hỗ trợ thêm mã `DEMO-000001`. Truy vấn khớp chính xác, hủy yêu cầu cũ và bỏ kết quả trả chậm. Đổi giấy tờ xóa hồ sơ cũ ngay.
- Tự điền tên, điện thoại, email, địa chỉ, ngày sinh, ngày/nơi cấp giấy tờ, người thân và cảnh báo nếu có dữ liệu. Chỉ sửa snapshot cho mẫu in, không cập nhật hồ sơ đã có.
- Không tìm thấy mới cho mở popup tạo khách hàng. Lỗi mạng/quyền không được coi là khách hàng chưa tồn tại. Popup giữ URL và thông tin hợp đồng; kiểm tra tên, số điện thoại, email, giấy tờ, địa chỉ và hồ sơ trùng. Lưu thành công mới đóng popup và đổ dữ liệu trở lại.
- Mẫu in có dữ liệu cơ sở, người đại diện, khách hàng, xe, thời gian, các số tiền nhập trên mẫu, phụ kiện và chữ ký. Không tự tính nghiệp vụ tài chính hoặc phát sinh giao dịch. Thời gian UTC có timezone được đổi sang Asia/Ho_Chi_Minh; thiếu giờ giữ là thiếu và yêu cầu bổ sung.

## Mẫu in

Nguồn nguyên bản: `resources/js/src/view/pages/Order/components-order/ContractPrintDocument.vue` ở repo cũ. Bản tham chiếu giữ trong `src/components/contracts/legacy/ContractPrintDocument.vue`. Script `scripts/port-legacy-contract.py <file-nguon>` chuyển cơ học binding Vue thành JSX và giữ nguyên câu chữ, bố cục hai cột, điều khoản, phụ lục, bảng trả xe và CSS A4 ngang. Các utility Bootstrap cần thiết được giới hạn trong document.

Renderer: `src/components/contracts/ContractPrintDocument.tsx`. DTO: `src/lib/management/contract-document.ts`. Mẫu mới luôn mang watermark nháp/chưa phát hành; không tự cấp số. Bảng xác nhận trả xe để trống, không thực hiện trả xe. Thông tin không có ô trên template cũ (ví dụ email/ngày sinh) được giữ trong form, không tự thêm điều khoản/ô mới vào mẫu.

Nút in sao chép riêng document vào iframe cùng origin, chờ stylesheet/font rồi gọi `print()`. Không in form/menu phía sau. Một xe là một trang A4 ngang; nhiều xe thêm trang phụ lục. Trình duyệt cho lưu PDF trong hộp thoại in. Không lưu giấy tờ vào localStorage, không gửi dữ liệu cho dịch vụ PDF bên ngoài.

## API hiện có

| Nhu cầu | API Nest đã đọc từ source |
| --- | --- |
| Nhân sự tại cơ sở | `GET /api/auth/hr/staff?store_id=ID` |
| Khách theo giấy tờ | `GET /api/auth/customers/search-by-id-card?id_card=...` |
| Tạo khách hàng | `POST /api/auth/customers` |

`ContractAutofillRepository` tách adapter demo/API. Source mặc định vẫn là demo. Chưa xác minh backend/database vận hành thật. Khi bật API, dùng cấu hình URL và token đăng nhập như adapter danh mục; không giả lập thành công hoặc fallback sang fixture.

Nest `CustomerService.create` hiện lưu năm trường `name`, `phone`, `email`, `id_card`, `address`, nên popup API chỉ nhận năm trường đó. Thông tin bổ sung có thể nhập trên form hợp đồng để in nháp, không được quảng bá là đã lưu vào hồ sơ API. Tra cứu trước POST chặn trùng ở client; cần xác minh ràng buộc duy nhất tại server/database khi tích hợp thực tế để xử lý tạo đồng thời. Không sửa API/database trong nhiệm vụ này.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:management
npm.cmd run test:contracts
npm.cmd run build
python scripts/check-contract-ui.py --url http://localhost:3001 --output docs/qa/contracts-autofill
```

Kiểm tra browser cần Python Playwright/Chromium và PyMuPDF. Các ca bao gồm kết quả trả chậm, lỗi và thử lại, popup không đổi URL, giấy tờ trùng, liên kết khách mới vào danh sách chung, focus/bàn phím ở 375px, giữ nguyên mọi điều khoản phụ lục, gọi hàm in thật qua iframe và kiểm tra PDF một/hai trang A4 ngang. Adapter API được test với response mô phỏng, không ghi dữ liệu vận hành.

Kết quả bản production cục bộ: TypeScript/lint/build đạt; 8 kiểm tra danh mục, 10 kiểm tra auto-fill/adapter và 11 nhóm tương tác auto-fill/in đạt. Kiểm tra hồi quy 8 nhóm tương tác danh mục cũng đạt. Xem [kết quả](qa/contracts-autofill/functional-results.json), [PDF một xe](qa/contracts-autofill/contract-single-vehicle.pdf), [PDF nhiều xe](qa/contracts-autofill/contract-multiple-vehicles.pdf).

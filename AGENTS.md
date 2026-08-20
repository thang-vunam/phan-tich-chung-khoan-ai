# NGUYÊN TẮC LÀM VIỆC & PHÁT TRIỂN DỰ ÁN (PROJECT RULES)

## ⚠️ NGUYÊN TẮC BẤT DI BẤT DỊCH (CORE PRINCIPLES):

1. **BẢO TOÀN CÁC THÀNH PHẦN ĐANG HOẠT ĐỘNG ỔN ĐỊNH:**
   - TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP chỉnh sửa, tái cấu trúc hoặc làm ảnh hưởng đến bất kỳ thành phần/tính năng nào đã và đang hoạt động ổn định trong dự án.
   - CHỈ tập trung khắc phục đúng phạm vi lỗi được người dùng yêu cầu (Surgical edits only).
   - Trước khi sửa bất kỳ tệp tin nào, phải đối chiếu và bảo toàn 100% logic của các chức năng hiện có.

2. **DỮ LIỆU THỰC TẾ & THUẬT TOÁN ĐỘNG (REAL-TIME DATA & DYNAMIC LOGIC):**
   - Không được "khóa cứng" (hardcode) các mốc điểm thị trường hay số liệu giả định trong code.
   - Luôn sử dụng dữ liệu nến thực tế từ sàn giao dịch (HOSE, HNX, UPCOM) và tính toán xu hướng theo thuật toán nến động (Dynamic Multi-Bar Trend Algorithm).
   - Đối với phân tích cơ bản doanh nghiệp: Phải định lượng cụ thể số liệu Doanh thu, Lợi nhuận, P/E, P/B, ROE của quý gần nhất, không nhận định cảm tính.

3. **KIỂM TRA & BẢO ĐẢM TRƯỚC KHI TRIỂN KHAI (TEST & VERIFY):**
   - Chạy `npm run lint` (`tsc --noEmit`) để đảm bảo không phát sinh lỗi kiểu dữ liệu TypeScript trước khi build.
   - Đảm bảo các đường link bài báo, phân tích, biểu đồ và giao diện hoạt động mượt mà 100%.

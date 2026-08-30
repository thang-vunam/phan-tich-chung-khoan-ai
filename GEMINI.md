# NGUYÊN TẮC PHÁT TRIỂN & CHUẨN MỰC HỆ THỐNG PHÂN TÍCH CHỨNG KHOÁN AI (SYSTEM MANIFESTO)

Tài liệu này quy định các **NGUYÊN TẮC BẤT DI BẤT DỊCH (CORE PRINCIPLES)** dành cho mọi AI Agent, lập trình viên và chuyên gia phân tích làm việc trên dự án này.

---

## 🏛️ 1. NGUYÊN TẮC KIẾN TRÚC TỰ THÍCH ỨNG & KHÔNG GÁN CỨNG (ZERO-HARDCODING & EVERGREEN INTELLIGENCE)
1. **Tuyệt đối không gán cứng bất kỳ số liệu tĩnh nào:**
   - Cấm ghi các con số cố định về Tỷ giá USD/VND, Giá vàng thế giới (Spot Gold USD/oz), Giá vàng trong nước, Giá dầu Brent, Giá quặng sắt/thép, CPI hay Mặt bằng lãi suất vào mã nguồn hoặc câu lệnh prompt.
   - Toàn bộ dữ liệu vĩ mô và giá hàng hóa phải được tra cứu trực tiếp qua **Google Search Grounding thời gian thực** tại thời điểm người dùng bấm phân tích.
2. **Tuyệt đối không gán cứng văn bản pháp lý hoặc cấm từ khóa tĩnh:**
   - Không được ép chết AI chỉ nói về một thông tư cụ thể (như Thông tư 68) hay cấm nhắc đến một dự án cụ thể (như KRX).
   - Phải để AI tra cứu **các văn bản quy phạm pháp luật mới nhất đang có hiệu lực của Bộ Tài chính / UBCKNN** (về cơ chế Non-pre-funding, ký quỹ, quản trị rủi ro) và **tiến độ thực tế các dự án hạ tầng công nghệ/nâng hạng** tại thời điểm tra cứu.
3. **Dữ liệu dòng tiền Khối ngoại & Thanh khoản:**
   - Không được áp đặt định kiến tĩnh (như ép "bán ròng 10 phiên"). Động thái mua/bán ròng của Khối ngoại và Tự doanh phải luôn phản ánh theo dữ liệu giao dịch thực tế của từng phiên.
   - Thanh khoản thị trường phải được tính toán động theo bình quân 20 phiên (MA20) từ nến thực tế của sàn HOSE/HNX.

---

## 📊 2. NGUYÊN TẮC CHUẨN XÁC DỮ LIỆU THỊ TRƯỜNG & KHỚP LỆNH ATC (EXCHANGE DATA ACCURACY & RECONCILIATION)
1. **Nguồn cấp dữ liệu chuẩn hóa cấp Sở Giao dịch:**
   - Nguồn dữ liệu nến đóng cửa ATC và khối lượng giao dịch cả ngày bắt buộc ưu tiên sử dụng **VNDirect DChart API (`https://dchart-api.vndirect.com.vn/dchart/history`)** được nạp qua **Vercel Serverless Function Proxy (`/api/stock-price`)**.
   - Cấm phụ thuộc vào các endpoint miễn phí thiếu đối soát ATC (như lỗi thiếu phiên chiều của Entrade).
2. **Đối soát 100% các con số giao dịch thực tế:**
   - Giá đóng cửa phiên gần nhất (ví dụ HPG phiên 28/08 là `22.100 VND`, biến động -100đ / -0.45%).
   - Khối lượng khớp lệnh phiên gần nhất (ví dụ HPG là `17.126.700 cp`) kèm khối lượng bình quân 20 phiên (`avgVolume20 = ~20,4 triệu cp/phiên`).
   - Mức biến động giá cụ thể: `prevPrice`, `change`, `changePct`, `formattedChange`.

---

## 📈 3. NGUYÊN TẮC TÍNH TOÀN VẸN NGHIỆP VỤ TÀI CHÍNH (FINANCIAL DOMAIN INTEGRITY)
1. **Bảo toàn 100% bản chất Lỗ / Lãi:**
   - Tuyệt đối **CẤM SỬ DỤNG `Math.abs`** đối với chỉ tiêu Lợi nhuận sau thuế (LNST).
   - Doanh nghiệp bị lỗ hoặc trích lập dự phòng (như PNJ Q2/2026) phải hiển thị nguyên vẹn **dấu âm (-)** (ví dụ: `-282,9 tỷ VND`) và phân tích rõ rủi ro/nguyên nhân dẫn đến khoản lỗ.
2. **Chuẩn hóa trường dữ liệu theo chuẩn Kế toán Việt Nam (VAS):**
   - **Doanh nghiệp thông thường:** Doanh thu thuần (`is1` hoặc `is4`), LNST của Cổ đông Công ty Mẹ (`is14` hoặc `is50`), Lợi nhuận gộp (`is2`), Biên lợi nhuận gộp, Tỷ lệ Nợ/Vốn CSH (D/E).
   - **Ngân hàng & Tổ chức tài chính (`isBank`):** Nhận diện chính xác ngân hàng (`bs7 > 0 && !is4`). Phân tích Thu nhập lãi thuần (`is1`), LNST (`is14`), NIM (`op10`), CASA (`op13`), Tỷ lệ nợ xấu NPL (`op18`), Tỷ lệ bao phủ nợ LLR (`op42`).
3. **Tính toán tự động 100% Bộ Chỉ Số Định Giá PTCB từ Backend:**
   - Tự động tính toán toán học: $\text{EPS (TTM)} = \text{LNST 4 quý} / \text{Số lượng CP lưu hành}$, $\text{BVPS} = \text{Vốn CSH} / \text{Số lượng CP}$, $\text{P/E} = \text{Thị giá Live} / \text{EPS}$, $\text{P/B} = \text{Thị giá Live} / \text{BVPS}$, $\text{ROE}$, $\text{ROA}$.
   - EPS luôn được chuẩn hóa ở đơn vị nghìn VND/cổ phiếu (nếu Simplize trả về $< 100 \rightarrow \times 1.000$, nếu null tự tính từ LNST TTM).
   - Cấm tuyệt đối AI viết "văn mẫu lý thuyết" kiểu *"P/E cần được tính toán dựa trên..."*; AI bắt buộc phải lấy trực tiếp các con số P/E, P/B, EPS đã tính toán để phân tích định giá đắt/rẻ so với toàn ngành.

---

## 🛡️ 4. CƠ CHẾ DỰ PHÒNG ĐA TẦNG KHÔNG GIÁN ĐOẠN (MULTI-TIER KEY POOL & SEARCH-TO-DIRECT FALLBACK)
1. **Bể chứa API Key đa tầng (Key Pool Rotator):**
   - Tích hợp nhiều API Key (`ALL_KEYS = [KEY_1, KEY_2, PAID_KEY]`), tự động luân chuyển khi gặp mã lỗi 429, 404 hoặc 503.
2. **Ưu tiên Model Thế hệ Mới:**
   - Ưu tiên mảng model: `['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.6-flash']`.
3. **Chuyển đổi mềm (Graceful Search-to-Direct Fallback):**
   - Khi Google Search Grounding chạm ngưỡng 50 lượt/ngày (429), hệ thống tự động chuyển sang chế độ Direct Generation với **Native JSON Mode (`responseMimeType: 'application/json'`)** kết hợp dữ liệu Backend nạp sẵn, tuyệt đối không quăng lỗi 429 ra ngoài giao diện người dùng.

---

## 🌐 5. NGUYÊN TẮC ĐỊNH LƯỢNG DÒNG TIỀN KHỐI NGOẠI & KHÔNG DÙNG CÂU NÉ TRÁNH (FOREIGN INVESTOR QUANTIFICATION & ZERO-EVASION)
1. **Cấm tuyệt đối các câu văn mẫu né tránh:**
   - Nghiêm cấm AI sinh ra các câu như *"Hiện tại, chưa có thông tin cụ thể về giao dịch của khối ngoại trong phiên gần nhất..."*.
2. **Lớp bảo vệ chuẩn hóa tự động (`normalizeForeignInvestors`):**
   - Ở tầng xử lý dữ liệu đầu ra, hệ thống tự động phát hiện và chuẩn hóa các câu rỗng thành phân tích chuyên sâu về xu hướng dòng vốn ngoại, tỷ lệ Room ngoại và tác động của dòng tiền ETF/quỹ chủ động đối với từng mã cổ phiếu/ngành.

---

## 📱 6. CHUẨN MỰC GIAO DIỆN NGƯỜI DÙNG & TRẢI NGHIỆM MOBILE (MOBILE UI/UX STANDARDS)
1. **Watchlist trên Mobile:**
   - Nút Danh mục theo dõi (Watchlist) được đặt tinh tế trên Thanh Header/Navigation, tuyệt đối không dùng nút floating cố định ở góc dưới (`fixed right-4 bottom-4`) gây che khuất nội dung báo cáo.
   - Giao diện Watchlist mở ra dưới dạng Responsive Slide-up Drawer / Modal có nền mờ chống lóa (Backdrop blur), không xung đột với các thẻ thông tin.
2. **Chất lượng Xuất File PDF:**
   - Thuật toán ngắt trang thông minh (Anti-cut text slicing), tự động mở rộng nội dung, tối ưu hóa độ sắc nét font tiếng Việt in đậm (`scale: 2.5`), đồng bộ giao diện Dark Mode và footer thương hiệu `© daututaichinh.pro`.

---

## 🔍 7. QUY TRÌNH TỰ PHẢN BIỆN & KIỂM THỬ KHẮT KHE (ADVERSARIAL SELF-AUDITING)
1. **Tư duy Chuyên gia Phân tích Đầu tư Thực chiến:**
   - Không bao giờ coi một task là hoàn thành chỉ vì "code chạy thông luồng không báo lỗi".
   - Phải tự đặt mình vào vị thế của Nhà đầu tư khó tính nhất để **đọc, đối soát từng con số và phản biện tính hợp lý của mọi báo cáo**.
2. **Kiểm thử đa dạng các nhóm ngành và trường hợp cực đoan (Edge-Cases):**
   - Luôn kiểm thử chéo trên các trường hợp đặc thù:
     * *Doanh nghiệp có quý báo lỗ do trích lập:* `PNJ`
     * *Ngân hàng với cấu trúc tài chính đặc thù:* `CTG`, `VCB`, `TCB`
     * *Doanh nghiệp sản xuất quy mô lớn:* `HPG`
     * *Dịch vụ chứng khoán & thị trường vốn:* `SSI`
3. **Bảo đảm toàn bộ các Module & Chức năng phụ trợ:**
   - Kiểm tra định kỳ cả 4 Module phân tích: Phân tích Đơn lẻ, So sánh Đối đầu, Phân tích Ngành, Phân tích Chỉ số.

# Đăng ký gác thi – Khoa Ngoại ngữ

```
Google Sheet (admin nhập, xuất mẫu)  <──Apps Script──>  Firestore (GV đăng ký, realtime)  <──  Web (GitHub Pages)
                                              └── mail nhắc trước 18 giờ (tính từ giờ CÓ MẶT)
```

**Quy ước:** Chuyên 1 = tổ SPA, Chuyên 2 = tổ NNA, Cơ bản = tổ 3.
**Ca (bắt đầu / có mặt):** 1 = 07:30 / 07:15 · 2 = 09:00 / 08:45 · 3 = 13:30 / 13:15 · 4 = 15:00 / 14:45 (sửa trong tab `CauHinh`).

## Cấu trúc Sheet
- Tab cố định: `CauHinh` (cấu hình chung), `GiaoVien` (email, tên, tổ, số ca đã gác trước đó), `Dot` (danh sách đợt thi), `NhatKyNhac`.
- **Mỗi đợt thi = một nhóm tab:** `CaThi_<mã>` (nhập lịch), `DangKy_<mã>` và `XuatMau_<mã>` (tự sinh).
- Mức tối thiểu 20 ca tính **cộng dồn cả năm học, qua mọi đợt** (`namHoc` trong `CauHinh`).

## A. Firebase (làm một lần)
1. console.firebase.google.com → tạo project (gói Spark miễn phí là đủ).
2. **Authentication → Sign-in method** → bật **Email/Password** (không cần bật "Email link"). *Settings → Authorized domains* thêm `<tên-github>.github.io`. Nếu có mục *User actions → Enable create (sign-up)* thì tắt đi.
3. **Firestore Database** → Create (production mode).
4. Tab **Rules** → dán `firestore.rules` → Publish.
5. **Project settings → Your apps → Web (</>)** → copy `firebaseConfig` vào `docs/firebase-config.js`.

## B. Web (GitHub Pages)
Giao diện nằm trong `docs/`. Vào repo *Settings → Pages* → Source: **Deploy from a branch**, branch `main`, thư mục `/docs`. Địa chỉ sẽ là `https://l2practice.github.io/exams/`. Ghi link vào `webUrl` trong `CauHinh` (nút trong mail).

## C. Google Sheet + Apps Script
1. Tạo Sheet mới → **Extensions → Apps Script**; dán toàn bộ `apps-script/Code.gs` vào file `Code.gs`, và `apps-script/appsscript.json` vào `appsscript.json` (bật *Project Settings → Show "appsscript.json" manifest file*). Chỉ cần 2 file này, không tạo thêm file nào khác.
2. **Project Settings → Google Cloud Platform project → Change project** → nhập *project number* của Firebase.
3. Tải lại Sheet → **Gác thi → Tạo các tab cố định**; điền `CauHinh`, `GiaoVien`.
4. **Gác thi → Cài lịch gửi mail nhắc**; **Gửi thử mail nhắc cho tôi** để xem mail thật.

## D. Mỗi đợt thi
1. **0. Tạo đợt thi mới** → nhập mã (VD `HK1-2627-GK`) và tên → có tab `CaThi_<mã>`. Điền hạn chót ở tab `Dot`.
2. Ở tab `CaThi_<mã>`: **1. Thêm ca nhanh** (ngày × ca × khoá × ngành), sửa lẻ trong tab nếu cần.
3. **2. Kiểm tra dữ liệu** → **3. Đồng bộ lên Firebase** (chạy lại bất kỳ lúc nào; đăng ký đã có được giữ nguyên).
4. Hết hạn: **4. Kéo đăng ký + Xuất MẪU** → tab `XuatMau_<mã>` → **5. Lưu .xlsx** để nộp.
Các menu làm việc trên đợt của tab đang mở.

## Giao diện đăng ký (bảng giống tab xuất mẫu)
Mỗi đợt thi của năm học là **một bảng**: cột = ca (hàng Ngày gộp cột / Ca + giờ bắt đầu / Khoá-Ngành / "Còn n" chỗ cho tổ của GV), hàng = GV (hàng của chính GV nằm đầu, có nút **+** để đăng ký và **✔** để huỷ; hàng đồng nghiệp hiện chữ **X**), cột **Cộng**, chân bảng "Tổng đăng ký" và "SL được giao". Cột tên và các hàng tiêu đề dính khi cuộn. Danh sách hàng lấy từ collection `roster` (tên + tổ, ghi bởi Apps Script khi đồng bộ).

## Đăng nhập
GV đăng nhập bằng **email + mật khẩu**. Mật khẩu mặc định là `chuyen1` (đổi ở `matKhauMacDinh` trong `CauHinh`; trên web đổi trong hằng số `DEFAULT_PW` ở `docs/app.js` cho khớp). Ô email nhớ email lần trước; GV tự đổi mật khẩu ở **Cài đặt**; có nút "Quên mật khẩu?" gửi thư đặt lại.
Tài khoản được tạo tự động khi **Đồng bộ lên Firebase** (hoặc menu *Tạo tài khoản đăng nhập cho GV*), với email đã xác thực, chỉ cho email có trong tab `GiaoVien`. Firestore rules yêu cầu email đã xác thực, nên người tự đăng ký bằng email lạ không vào được dữ liệu.
Lưu ý: mật khẩu mặc định chung nghĩa là ai biết email GV đều đăng nhập được cho tới khi GV đổi mật khẩu. Web sẽ nhắc đổi khi GV đăng nhập bằng mật khẩu mặc định.

## Cách chặn vượt số lượng (không dùng bộ đếm)
Mỗi "chỗ" của một tổ trong một ca là một tài liệu `claims/<ca>_t<tổ>_<k>` (k = 1..số GV cần). Đăng ký = tạo cùng lúc `regs` + `claims`; Firestore rules bắt buộc hai bên khớp nhau và mã chỗ là duy nhất, nên hai người không thể giữ cùng một chỗ, và không ai đăng ký quá số cần hay ngoài tổ của mình. Số "đã đăng ký" hiển thị được đếm từ danh sách đăng ký, không có số nào để bị sai lệch. Rules này **chưa được chạy thử** với Firebase Emulator: thử trước khi mở cho GV.

## Ghi chú
- Mỗi GV chỉ 1 ca tại một (ngày, ca), dù thuộc đợt nào.
- Giảm số GV cần của một ca đã có người đăng ký: người đã đăng ký vẫn giữ chỗ, hãy huỷ thủ công ở Firestore nếu cần.
- Gmail thường giới hạn ~100 mail/ngày (Workspace ~1.500); mail gộp mọi ca của một GV vào một thư.

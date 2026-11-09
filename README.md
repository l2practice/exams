# Đăng ký gác thi – Khoa Ngoại ngữ, ĐH Đồng Nai

```
Google Sheet (admin)                      Firestore                         Web (GitHub Pages)
 • GiaoVien: email, tổ, vai trò   ──►  teachers / roster / dots / config  ──►  GV: xem + đăng ký
 • Dot: các đợt thi, trạng thái                    ▲                           Tổ trưởng: thêm ca, thống kê
 • Xuất MẪU nộp  ◄── kéo đăng ký ◄────  slots / regs / claims  ◄──────────────  (ghi trực tiếp)
 • Mail nhắc, mật khẩu mới (Apps Script)
```

## 1. Vai trò (admin đặt trong tab `GiaoVien`, cột E)

| Cột E | Vai trò | Thấy gì trên web |
|---|---|---|
| (trống) | Tổ viên | **Tổng quan** · **Đăng ký** |
| `tt1` | Tổ trưởng tổ Chuyên 1 (SPA) | Nhóm **Quản lý** (Thống kê · Thêm ca) + nhóm **Cá nhân** (Tổng quan · Đăng ký, như tổ viên) |
| `tt2` | Tổ trưởng tổ Chuyên 2 (NNA) | như trên, chỉ với tổ 2 |
| `tt3` | Tổ trưởng tổ Cơ bản | như trên, chỉ với tổ 3 |
| `x` | Quản trị toàn khoa (tuỳ chọn) | như tổ trưởng nhưng cả 3 tổ |

Tổ trưởng chỉ thấy giảng viên của tổ mình và chỉ sửa được số giảng viên cần **của tổ mình**. Firestore rules ép đúng như vậy.
Cột C (Tổ) là tổ mà GV thuộc về, dùng để đăng ký ca; tổ trưởng cũng đăng ký gác thi như mọi người.

### Giao diện
Theo hệ thiết kế **ArticuWrite** (repo `l2practice/artwrite`): nền tím nhạt, thanh biểu tượng bên trái (biểu tượng trên chữ, mục đang chọn tô màu periwinkle), thanh tiêu đề có thẻ người dùng, thẻ trắng bóng nhẹ, nút dạng viên thuốc, font Be Vietnam Pro. Trên điện thoại, thanh bên thành **thanh tab cố định ở đáy màn hình** (luôn thấy, không phải mở menu); nút Đăng xuất chuyển vào trang Cài đặt để tránh bấm nhầm. Biểu tượng nằm trong `docs/icons.js`, logo và favicon là `docs/icon.svg`. Chữ cỡ lớn hơn ArticuWrite một chút vì nhiều giảng viên lớn tuổi.

## 2. Đợt thi: 3 trạng thái (tab `Dot`, cột D)

- `SOAN`: tổ trưởng đang soạn lịch (thêm ca). GV **chưa thấy**, chưa đăng ký được.
- `MO`: GV đăng ký được đến hạn chót. Tổ trưởng vẫn thêm/sửa ca được.
- `DONG`: khoá, chỉ xem.

## 3. Cài đặt từng bước

### Bước 1 – Firebase (project `dnu-exams`)
1. **Firestore Database → Rules**: xoá hết, dán toàn bộ `firestore.rules` → **Publish**. (Luật đã đổi nên bắt buộc dán lại.)
2. **Authentication → Sign-in method → Email/Password** phải đang **Enabled**.
3. *Authentication → Settings → Authorized domains* có `l2practice.github.io`.

### Bước 2 – GitHub Pages
Repo *Settings → Pages → Deploy from a branch → `main` → `/docs` → Save*. Địa chỉ: `https://l2practice.github.io/exams/`. Sau mỗi lần cập nhật code, chờ khoảng 1–2 phút; nếu vẫn thấy bản cũ, mở bằng cửa sổ ẩn danh hoặc thêm `?v=2` sau địa chỉ.

### Bước 3 – Apps Script (mở từ chính Google Sheet: *Extensions → Apps Script*)
1. Chỉ giữ **2 file**: `Code.gs` và `appsscript.json`. Xoá `Dialog.gs`/`Dialog.html` nếu còn.
2. Dán đè `apps-script/Code.gs` vào `Code.gs`; `appsscript.json` giữ như trong repo. Bấm **Save**.
3. *Project Settings → Google Cloud Platform (GCP) Project* phải là project number `261864613847` (đã làm).
4. **Deploy → Manage deployments** → bút chì cạnh deployment đang có → *Version: New version* → **Deploy**. Kiểm tra:
   - *Execute as:* **Me** (`duongthanhtu.dnu@gmail.com`)
   - *Who has access:* **Anyone**
   Địa chỉ `/exec` giữ nguyên và đã được điền vào `docs/firebase-config.js` (`resetUrl`). Nếu bạn tạo deployment **mới** thì địa chỉ đổi, hãy dán địa chỉ mới vào `resetUrl`.
   Thư "mật khẩu mới" và thư nhắc lịch đều gửi từ tài khoản **chạy script** (`duongthanhtu.dnu@gmail.com`).

### Bước 4 – Google Sheet
1. Tải lại sheet → **Gác thi → Tạo / cập nhật các tab cố định** (cấp quyền nếu được hỏi). Lệnh này cập nhật tiêu đề cột và danh sách chọn, không xoá dữ liệu.
2. Tab **`CauHinh`**: `FIREBASE_PROJECT_ID` = `dnu-exams`; `webUrl` = `https://l2practice.github.io/exams/`; kiểm tra `namHoc`, `khoaHopLe`.
3. Tab **`GiaoVien`** (từ dòng 2): A Email · B Họ tên · C Tổ (1/2/3) · D Số ca đã gác trước khi dùng app · E Vai trò (`tt1`/`tt2`/`tt3`/`x`/trống). Email phải đúng từng chữ, vì đó là tên đăng nhập.
4. **Gác thi → 0. Tạo đợt thi mới** (mã vd `HK1-2627`, tên vd `HỌC KỲ 1`). Điền **Hạn chót đăng ký** ở tab `Dot`, cột E.

### Bước 5 – Đồng bộ
**Gác thi → 1. Đồng bộ lên Firebase.** Hộp thoại phải báo số đợt, số giảng viên và "Tài khoản đăng nhập: tạo mới N". Tài khoản mới có mật khẩu mặc định (`matKhauMacDinh`, hiện là `chuyen1`) và web sẽ nhắc GV đổi. Chạy lại bất cứ lúc nào (thêm GV, đổi vai trò, đổi hạn chót, đổi trạng thái đợt); ca thi và đăng ký không bị đụng tới.

### Bước 6 – Chạy thử trọn vòng
1. Mở web bằng cửa sổ ẩn danh, đăng nhập bằng email tổ trưởng.
2. **Quản lý → Thêm ca thi mới**: chọn đợt `SOAN`, nhập ngày, tick ca/khoá/ngành, số GV cần của tổ → *Xem trước* → *Thêm vào đợt*.
3. Ở Sheet đổi trạng thái đợt thành `MO` → **Đồng bộ lại**.
4. Đăng nhập bằng một tổ viên → thẻ **Đăng ký ca thi** → bấm **+**. Thử thêm: huỷ ca, đổi mật khẩu, Quên mật khẩu.
5. **Gác thi → 2. Kéo đăng ký về Sheet + Xuất MẪU nộp** → so tab `XuatMau_<mã>` với file mẫu của trường → **3. Lưu file .xlsx**.
6. **Gác thi → Gửi thử mail nhắc cho tôi** → nếu ổn: **Cài lịch gửi mail nhắc (mỗi giờ)**.

## 4. Quy trình mỗi đợt thi
1. Admin: **Tạo đợt thi mới** (trạng thái `SOAN`) → Đồng bộ.
2. Tổ trưởng từng tổ: **Quản lý → Thêm ca thi mới** (cùng một ca thì các tổ tự gộp số của mình vào). Theo dõi ở danh sách "Ca đã thêm", sửa hoặc xoá được khi chưa có ai đăng ký.
3. Admin: đổi trạng thái đợt sang `MO`, kiểm tra hạn chót → Đồng bộ. Thông báo cho GV.
4. GV đăng ký. Tổ trưởng theo dõi ở **Thống kê giảng viên** (bấm tên GV để xem từng ca) và danh sách "Ca còn thiếu người".
5. Hết hạn: admin đổi sang `DONG` → Đồng bộ → **Kéo đăng ký + Xuất MẪU** → nộp.

## 5. Mail
- **Nhắc lịch:** gửi khi ca còn ≤ `nhacTruocGio` (mặc định 18) giờ tới giờ **có mặt**. Giờ bắt đầu nổi bật, giờ có mặt ghi nhỏ. Người gửi hiển thị là **tổ trưởng của GV đó** (tên "Họ tên – Tổ trưởng …") và GV bấm *Trả lời* là gửi tới tổ trưởng; địa chỉ gửi thật vẫn là tài khoản chạy script.
- **Quên mật khẩu:** web gọi Apps Script, script đặt mật khẩu ngẫu nhiên mới trong Firebase và gửi tới đúng email đó (tối đa 1 lần/10 phút cho mỗi email, 80 thư/ngày). Luôn báo "đã gửi" dù email có trong danh sách hay không để không lộ danh sách GV.
- Gmail thường giới hạn ~100 thư/ngày (Workspace ~1.500).

## 6. Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| "Email hoặc mật khẩu chưa đúng" | Email không khớp `GiaoVien`, hoặc **chưa Đồng bộ** nên chưa có tài khoản. |
| `auth/operation-not-allowed` | Chưa bật Email/Password trong Firebase. |
| Đồng bộ báo lỗi ở phần tài khoản | Chưa đổi GCP project (bước 3.3) hoặc tài khoản chạy script chưa là Owner/Editor của project Firebase. |
| Quên mật khẩu báo "Chưa gửi được" | Chưa Deploy lại Web App bản mới (bước 3.4), hoặc *Who has access* chưa là **Anyone**. |
| Tổ trưởng không thấy tab Quản lý | Cột E chưa ghi `tt1/tt2/tt3` hoặc chưa Đồng bộ; đăng xuất rồi đăng nhập lại. |
| Thêm ca báo "Không lưu được" | Đợt không còn `SOAN`/`MO`, hoặc ca vừa được tổ khác tạo cùng lúc: bấm *Xem trước* rồi thử lại. |
| Trang web vẫn là bản cũ | Bộ nhớ đệm của GitHub Pages: dùng cửa sổ ẩn danh hoặc thêm `?v=2`. |

## 7. Giới hạn đã biết
- Firestore rules **chưa được chạy thử** với Firebase Emulator; hãy thử với 2–3 tài khoản trước khi mở rộng.
- Xoá GV khỏi tab `GiaoVien` chưa tự xoá tài khoản và dữ liệu của họ trên Firebase (cần xoá tay trong Firebase Console).
- "Xoá ca" thực chất đặt số GV cần của tổ mình về 0; ca biến mất khi mọi tổ đều về 0.
- Mật khẩu mặc định chung là điểm yếu cho tới khi GV đổi; web nhắc đổi khi GV còn dùng mật khẩu do khoa cấp.

// Cấu hình Firebase Web (khoá apiKey là mã định danh công khai, không phải bí mật;
// việc bảo vệ dữ liệu nằm ở firestore.rules và Authentication).
export const firebaseConfig = {
  apiKey: "AIzaSyBt_oW_FZrV06TbBOrGH--4x4gG2oVxkJQ",
  authDomain: "dnu-exams.firebaseapp.com",
  projectId: "dnu-exams",
  appId: "1:261864613847:web:7b6e365c320f1ad3850d92",
};

// Địa chỉ Web App của Apps Script (Deploy → Web app) dùng cho "Quên mật khẩu":
// script đặt mật khẩu mới và gửi mail từ tài khoản chạy script. Để trống thì dùng thư đặt lại của Firebase.
export const resetUrl = "https://script.google.com/macros/s/AKfycbwpmzZbIFvqqyK9IWDOOiIWBIRB3DmzFSiyrpzMRt_vZvL7gLE_XjYMtmkTB4JSKDTs6Q/exec";

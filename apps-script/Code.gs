/**
 * Đăng ký gác thi – Khoa Ngoại ngữ ĐH Đồng Nai
 *
 * Phân vai:
 *  - Google Sheet (admin): danh sách GV + vai trò, các đợt thi, cấu hình, xuất MẪU nộp, mail nhắc.
 *  - Web (tổ trưởng / GV): tổ trưởng THÊM CA THI trực tiếp trên web; GV đăng ký, đổi hoặc huỷ qua Apps Script. Dữ liệu nằm ở Firestore.
 *
 * Tab: CauHinh | GiaoVien | Dot | NhatKyNhac (cố định);  DangKy_<mã> | XuatMau_<mã> (tự sinh theo đợt)
 * Cột E của GiaoVien: tt1 / tt2 / tt3 = tổ trưởng của tổ Chuyên 1 / Chuyên 2 / Cơ bản; x = quản trị toàn khoa; trống = tổ viên.
 */
const SH = { CFG: 'CauHinh', GV: 'GiaoVien', DOT: 'Dot', LOG: 'NhatKyNhac' };
const TAB = { REG: 'DangKy_', OUT: 'XuatMau_' };
const TO_LABEL = { 1: 'Chuyên 1', 2: 'Chuyên 2', 3: 'Cơ bản' }; // 1 = tổ SPA, 2 = tổ NNA, 3 = tổ Cơ bản
const NGANH = ['SPA', 'NNA'];
const LOG_SYNC = 'NhatKyDongBo';
const AUTO_DELAY_MS = 60 * 1000;   // gom các lần sửa liên tiếp: đồng bộ sau 1 phút kể từ lần sửa đầu
const TZ = 'Asia/Ho_Chi_Minh';
// [giờ bắt đầu, giờ CBCT có mặt tại HĐ thi] – sửa trong tab CauHinh, đây chỉ là mặc định
const CA_DEFAULT = { 1: ['07:30', '07:15'], 2: ['09:00', '08:45'], 3: ['13:30', '13:15'], 4: ['15:00', '14:45'] };
const DOT_HEADERS = ['Mã đợt', 'Tên đợt thi', 'Học kỳ (in trên mẫu)', 'Trạng thái (SOAN / MO / DONG)', 'Hạn chót đăng ký', 'Ghi chú', 'Năm học'];
const DOT_STATUS = ['SOAN', 'MO', 'DONG']; // SOAN: tổ trưởng soạn lịch, GV chưa đăng ký được · MO: GV đăng ký · DONG: khoá
const MAX_RESET_PER_DAY = 80;
// Mật khẩu mặc định của tài khoản giảng viên mới. Chỉ nằm ở đây (không hiện ở tab CauHinh hay trên web).
// Có thể đổi mà không sửa code: Project Settings → Script Properties → thêm DEFAULT_PASSWORD (tối thiểu 6 ký tự).
const DEFAULT_PASSWORD = 'chuyen1';
const defaultPassword = () => PropertiesService.getScriptProperties().getProperty('DEFAULT_PASSWORD') || DEFAULT_PASSWORD;

// ---------------------------------------------------------------- Menu
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gác thi')
    .addItem('0. Tạo đợt thi mới…', 'menuNewDot')
    .addItem('1. Đồng bộ lên Firebase (GV, vai trò, đợt thi)', 'menuSyncUp')
    .addItem('   Bật tự động đồng bộ (sửa sheet là Firebase tự cập nhật)', 'installAutoSync')
    .addItem('   Tắt tự động đồng bộ', 'removeAutoSync')
    .addSeparator()
    .addItem('2. Kéo đăng ký về Sheet + Xuất MẪU nộp', 'menuExport')
    .addItem('3. Lưu file .xlsx vào Drive', 'menuXlsx')
    .addSeparator()
    .addItem('Tạo tài khoản đăng nhập cho GV (mật khẩu mặc định)', 'menuAccounts')
    .addItem('Kiểm tra đăng nhập của một email…', 'menuCheckLogin')
    .addItem('Gửi thử mail nhắc cho tôi', 'menuTestMail')
    .addItem('Cài lịch gửi mail nhắc (mỗi giờ)', 'installTriggers')
    .addItem('Tạo / cập nhật các tab cố định', 'setupSheets')
    .addToUi();
}

// ---------------------------------------------------------------- Cấu hình
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  const get = (n) => ss.getSheetByName(n) || ss.insertSheet(n);

  const cfg = get(SH.CFG);
  if (cfg.getLastRow() < 2) {
    const rows = [
      ['Khoá', 'Giá trị', 'Giải thích'],
      ['FIREBASE_PROJECT_ID', '', 'Project ID của Firebase'],
      ['namHoc', '2026-2027', 'Năm học: số ca được cộng dồn trong năm học này, qua mọi đợt'],
      ['toiThieu', '20', 'Số ca tối thiểu/năm học'],
      ['coSo', 'cơ sở 1', 'Địa điểm coi thi (in trên mẫu và trong mail)'],
      ['khoaHopLe', '13,14,15,16', 'Các khoá đang học (hiện trong form thêm ca trên web)'],
      ['khoaNam1', '16', 'Khoá đang học năm 1 (16 → năm 1, 15 → năm 2…)'],
      ['nhacTruocGio', '18', 'Gửi mail nhắc trước giờ CÓ MẶT bao nhiêu giờ'],
      ['tenNguoiGui', 'Khoa Ngoại ngữ - ĐH Đồng Nai', 'Tên hiển thị khi gửi mail (nếu GV chưa có tổ trưởng)'],
      ['webUrl', '', 'Link web đăng ký (nút trong mail)'],
    ];
    [1, 2, 3, 4].forEach((c) => {
      rows.push([`ca${c}_batDau`, CA_DEFAULT[c][0], `Ca ${c}: giờ bắt đầu`]);
      rows.push([`ca${c}_coMat`, CA_DEFAULT[c][1], `Ca ${c}: giờ CBCT có mặt tại HĐ thi`]);
    });
    cfg.getRange(1, 2, rows.length, 1).setNumberFormat('@');           // giữ "07:30" là chữ, không bị đổi thành giờ
    cfg.getRange(1, 1, rows.length, 3).setValues(rows);
    cfg.setColumnWidth(1, 180); cfg.setColumnWidth(2, 220); cfg.setColumnWidth(3, 420);
    cfg.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  const have = new Set(cfg.getRange(1, 1, Math.max(cfg.getLastRow(), 1), 1).getValues().map((r) => String(r[0]).trim()));
  [['geminiModel', 'gemini-2.5-flash', 'Model Gemini dùng để quét lịch thi từ ảnh (khoá API dán ở Script Properties: GEMINI_API_KEY)'],
   ['FIREBASE_API_KEY', 'AIzaSyBt_oW_FZrV06TbBOrGH--4x4gG2oVxkJQ', 'Khoá Web của Firebase (công khai) để kiểm tra người gọi chức năng quét']]
    .filter((r) => !have.has(r[0])).forEach((r) => cfg.appendRow(r));

  const gv = get(SH.GV);
  gv.getRange(1, 1, 1, 5).setValues([['Email', 'Họ tên', 'Tổ (1=SPA, 2=NNA, 3=Cơ bản)', 'Số ca đã gác trước khi dùng app (cộng dồn trong năm học)', 'Vai trò (tt1, tt2, tt3 = tổ trưởng; x = quản trị toàn khoa; trống = tổ viên)']]).setFontWeight('bold');
  gv.setFrozenRows(1);
  gv.getRange('C2:C500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['1', '2', '3'], true).build());
  gv.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).build());
  gv.getRange('E2:E500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['tt1', 'tt2', 'tt3', 'x'], true).setAllowInvalid(false).build());

  const dot = get(SH.DOT);
  dot.getRange(1, 1, 1, DOT_HEADERS.length).setValues([DOT_HEADERS]).setFontWeight('bold');
  dot.setFrozenRows(1); dot.setColumnWidths(1, DOT_HEADERS.length, 170);
  dot.getRange('D2:D100').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(DOT_STATUS, true).setAllowInvalid(false).build());
  dot.getRange('E2:E100').setNumberFormat('dd/MM/yyyy HH:mm');
  ss.toast('Đã tạo/cập nhật tab. Điền CauHinh và GiaoVien, rồi dùng "0. Tạo đợt thi mới".');
}

const hhmm = (v) => (v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v || '').trim());

function getCfg() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.CFG);
  if (!sh) throw new Error('Chưa có tab CauHinh. Chạy menu "Tạo các tab cố định".');
  const o = {};
  sh.getDataRange().getValues().slice(1).forEach((r) => { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  o.khoaHopLe = String(o.khoaHopLe || '13,14,15,16');
  o.toiThieu = Number(o.toiThieu || 20);
  o.nhacTruocGio = Number(o.nhacTruocGio || 18);
  o.namHoc = String(o.namHoc);
  o.geminiModel = String(o.geminiModel || 'gemini-2.5-flash');          // đổi trong CauHinh nếu Google đã ngừng model này
  o.FIREBASE_API_KEY = String(o.FIREBASE_API_KEY || 'AIzaSyBt_oW_FZrV06TbBOrGH--4x4gG2oVxkJQ'); // khoá Web của Firebase (công khai), dùng để kiểm tra phiên đăng nhập
  o.ca = {};
  [1, 2, 3, 4].forEach((c) => (o.ca[c] = { start: hhmm(o[`ca${c}_batDau`]) || CA_DEFAULT[c][0], arrive: hhmm(o[`ca${c}_coMat`]) || CA_DEFAULT[c][1] }));
  return o;
}

// ---------------------------------------------------------------- Đợt thi
function readDots() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.DOT);
  if (!sh || sh.getLastRow() < 2) return [];
  const namHoc = getCfg().namHoc;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map((r, i) => {
    let st = String(r[3]).trim().toUpperCase();
    if (st === 'TRUE') st = 'MO'; else if (st === 'FALSE') st = 'DONG'; else if (!DOT_STATUS.includes(st)) st = 'SOAN';
    return { order: i + 1, ma: String(r[0]).trim(), ten: String(r[1]).trim(), hocKy: String(r[2] || r[1]).trim(), status: st, hanChot: r[4] instanceof Date ? r[4] : null, namHoc: String(r[6] || namHoc).trim() };
  }).filter((d) => d.ma);
}
function getDot(ma) {
  const d = readDots().find((x) => x.ma === ma);
  if (!d) throw new Error(`Không thấy đợt "${ma}" trong tab Dot.`);
  return d;
}
/** Đợt đang làm = đợt của tab đang mở (DangKy_x / XuatMau_x); chỉ có 1 đợt thì lấy luôn; nếu không thì hỏi mã đợt. */
function pickDot() {
  const m = SpreadsheetApp.getActiveSheet().getName().match(/^(?:DangKy_|XuatMau_)(.+)$/);
  const dots = readDots();
  if (m && dots.some((d) => d.ma === m[1])) return m[1];
  if (dots.length === 1) return dots[0].ma;
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Chọn đợt thi', 'Nhập mã đợt: ' + dots.map((d) => d.ma).join(', '), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) throw new Error('Đã huỷ.');
  const ma = r.getResponseText().trim();
  getDot(ma);
  return ma;
}

function menuNewDot() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Tạo đợt thi mới', 'Mã đợt (chữ không dấu, số, dấu gạch; ví dụ HK1-2627-GK):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const ma = a.getResponseText().trim();
  if (!/^[A-Za-z0-9-]{2,30}$/.test(ma)) return ui.alert('Mã đợt chỉ gồm chữ không dấu, số và dấu "-", dài 2–30 ký tự.');
  if (readDots().some((d) => d.ma === ma)) return ui.alert('Mã đợt này đã tồn tại.');
  const b = ui.prompt('Tên đợt thi', 'Tên in trên mẫu (ví dụ: HỌC KỲ 1 hoặc GIỮA KỲ HỌC KỲ 1):', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const ten = b.getResponseText().trim() || ma;
  SpreadsheetApp.getActive().getSheetByName(SH.DOT).appendRow([ma, ten, ten.toUpperCase(), 'SOAN', '', '', getCfg().namHoc]);
  ui.alert(`Đã tạo đợt "${ma}" ở trạng thái SOAN (soạn lịch).\n\nCác bước tiếp theo:\n1. Điền "Hạn chót đăng ký" ở tab Dot.\n2. Gác thi → Đồng bộ lên Firebase.\n3. Tổ trưởng thêm ca thi trên web.\n4. Khi lịch đã đủ, đổi trạng thái thành MO rồi đồng bộ lại để GV đăng ký.`);
}

// ---------------------------------------------------------------- Date / id helpers
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function toIso(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}` : null;
}
const isoToVN = (iso) => iso.split('-').reverse().join('/');
const DOW_VN = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const dowVN = (iso) => { const [y, m, d] = iso.split('-').map(Number); return DOW_VN[new Date(y, m - 1, d).getDay()]; };
const DOW_SHORT = ['Chủ nhật', 'thứ 2', 'thứ 3', 'thứ 4', 'thứ 5', 'thứ 6', 'thứ 7'];
/** "thứ 3 ngày 20/9/2026" (không thêm số 0 ở đầu); Chủ nhật → "Chủ nhật ngày 20/9/2026" */
function dateLongVN(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DOW_SHORT[new Date(y, m - 1, d).getDay()]} ngày ${d}/${m}/${y}`;
}
const slotWho = (s) => (String(s.nganh || '').indexOf('KHAC') === 0 ? 'K' + s.khoa + ' · Khoa khác: ' + (s.donVi || '') : 'K' + s.khoa + ' · ' + s.nganh);
const slotId = (ma, iso, ca, khoa, nganh) => `${ma}-${iso.replace(/-/g, '')}-c${ca}-k${khoa}-${nganh}`;
const startDate = (cfg, iso, ca) => new Date(`${iso}T${cfg.ca[ca].start}:00+07:00`);
const arriveDate = (cfg, iso, ca) => new Date(`${iso}T${cfg.ca[ca].arrive}:00+07:00`);
const hhmmVN = (s) => s.replace(':', 'h');

// ---------------------------------------------------------------- Ca thi (dữ liệu do tổ trưởng nhập trên web, lưu ở Firestore)
function readSlots(ma) {
  return fsList('slots')
    .filter((d) => d.dotId === ma && d.active !== false)
    .map((d) => ({ id: d._id, date: d.date, ca: d.ca, khoa: d.khoa, nganh: d.nganh, donVi: d.donVi || '', mon: d.mon || '', note: d.note || '',
      need: { t1: (d.need && d.need.t1) || 0, t2: (d.need && d.need.t2) || 0, t3: (d.need && d.need.t3) || 0 } }))
    .filter((s) => s.need.t1 + s.need.t2 + s.need.t3 > 0);
}

// ---------------------------------------------------------------- Giáo viên
function readTeachers() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.GV);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => {
      const role = String(r[4] || '').trim().toLowerCase();
      const m = role.match(/^tt([123])$/);
      return { email: String(r[0]).trim().toLowerCase(), name: String(r[1]).trim(), to: Number(r[2]), prior: Number(r[3] || 0),
        leadTo: m ? Number(m[1]) : 0, admin: role === 'x' || role === 'admin' };
    });
}

// ---------------------------------------------------------------- Tài khoản đăng nhập (email + mật khẩu)
function idtFetch(path, body) {
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/' + path, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
  });
  let json = {}; try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) { /* không phải JSON */ }
  return { code: res.getResponseCode(), json };
}
/**
 * Tạo tài khoản Firebase Auth (email đã xác thực, mật khẩu mặc định) cho GV chưa có.
 * Không bao giờ đặt lại mật khẩu của tài khoản đã được GV dùng.
 * Danh sách đã tạo được nhớ trong Script Properties nên các lần đồng bộ sau không gọi lại.
 */
function ensureAccounts(teachers) {
  const cfg = getCfg(), pid = cfg.FIREBASE_PROJECT_ID;
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('acctDone') || '[]'));
  const out = { created: 0, existing: 0, failed: [], createdEmails: [] };
  teachers.filter((t) => !done.has(t.email)).forEach((t) => {
    const r = idtFetch('accounts:signUp', { email: t.email, password: defaultPassword(), emailVerified: true, displayName: t.name, targetProjectId: pid });
    if (r.code < 300) { out.created++; out.createdEmails.push(t.email); done.add(t.email); return; }
    const msg = (r.json.error && r.json.error.message) || String(r.code);
    if (msg.indexOf('EMAIL_EXISTS') === 0) {
      // Đã có tài khoản. Nếu chưa xác thực email (có thể do người lạ đăng ký trước) thì xác thực lại và đặt về mật khẩu mặc định.
      const l = idtFetch(`projects/${pid}/accounts:lookup`, { email: [t.email] });
      const u = l.json.users && l.json.users[0];
      if (u && !u.emailVerified) {
        const up = idtFetch(`projects/${pid}/accounts:update`, { localId: u.localId, emailVerified: true, password: defaultPassword() });
        if (up.code >= 300) { out.failed.push(`${t.email}: không xác thực được (${up.code})`); return; }
        out.createdEmails.push(t.email);
      }
      out.existing++; done.add(t.email);
    } else out.failed.push(`${t.email}: ${msg}`);
  });
  props.setProperty('acctDone', JSON.stringify(Array.from(done)));
  return out;
}
function menuAccounts() {
  const r = ensureAccounts(readTeachers());
  if (r.createdEmails.length) fsCommit(r.createdEmails.map((e) => ({ path: 'teachers/' + e, data: { pwTemp: true } })));
  SpreadsheetApp.getUi().alert(`Tài khoản: tạo mới ${r.created}, đã có ${r.existing}` + (r.failed.length ? `\n\nLỗi:\n${r.failed.slice(0, 10).join('\n')}` : ''));
}

// ---------------------------------------------------------------- Tự động đồng bộ khi sửa sheet
/**
 * Bật một lần: tạo trigger "khi sửa" và "khi đổi cấu trúc" (chèn/xoá dòng). Sửa tab GiaoVien, Dot hoặc CauHinh thì sau khoảng 1 phút
 * script tự chạy đồng bộ (thêm GV mới là tự tạo tài khoản, đổi vai trò, đổi hạn chót đợt, xoá GV là gỡ quyền).
 * Dùng trigger "cài đặt" (không phải onEdit đơn giản) vì chỉ loại này mới được gọi Firebase.
 */
function installAutoSync() {
  const ss = SpreadsheetApp.getActive();
  removeAutoSync(true);
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  logSync('BẬT', 'Đã bật tự động đồng bộ khi sửa GiaoVien / Dot / CauHinh.');
  scheduleAutoSync();                                       // đồng bộ luôn dữ liệu hiện có
  ss.toast('Đã bật. Sửa GiaoVien / Dot / CauHinh thì khoảng 1 phút sau Firebase tự cập nhật. Xem tab NhatKyDongBo.', 'Gác thi', 10);
}
function removeAutoSync(quiet) {
  ScriptApp.getProjectTriggers().filter((t) => ['onSheetEdit', 'onSheetChange', 'autoSyncRun'].indexOf(t.getHandlerFunction()) >= 0).forEach((t) => ScriptApp.deleteTrigger(t));
  if (quiet !== true) { logSync('TẮT', 'Đã tắt tự động đồng bộ.'); SpreadsheetApp.getActive().toast('Đã tắt tự động đồng bộ.', 'Gác thi', 5); }
}
function onSheetEdit(e) {
  try {
    const name = e && e.range && e.range.getSheet().getName();
    if ([SH.GV, SH.DOT, SH.CFG].indexOf(name) >= 0) scheduleAutoSync();
  } catch (err) { /* không để lỗi làm hỏng thao tác sửa của người dùng */ }
}
function onSheetChange(e) {
  try { if (e && e.changeType && ['EDIT', 'FORMAT'].indexOf(e.changeType) < 0) scheduleAutoSync(); } catch (err) { /* như trên */ }
}
/** Hẹn đồng bộ sau AUTO_DELAY_MS; nếu đã có lịch hẹn thì thôi (nhiều lần sửa gộp thành một lần chạy). */
function scheduleAutoSync() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'autoSyncRun')) ScriptApp.newTrigger('autoSyncRun').timeBased().after(AUTO_DELAY_MS).create();
  } finally { lock.releaseLock(); }
}
function autoSyncRun() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'autoSyncRun').forEach((t) => ScriptApp.deleteTrigger(t));
    try {
      const r = syncUp({ skipInvalid: true }), a = r.acct;
      logSync(a.failed.length || r.skipped.length ? 'CẦN XEM' : 'OK',
        `${r.dots} đợt, ${r.teachers} GV · tài khoản mới ${a.created}` + (r.removed.length ? ` · gỡ ${r.removed.length} GV (${r.removed.join(', ')})` : '') +
        (r.skipped.length ? ` · BỎ QUA dòng chưa đủ email/tên/tổ: ${r.skipped.join(', ')}` : '') + (a.failed.length ? ` · LỖI tài khoản: ${a.failed.slice(0, 3).join('; ')}` : ''));
    } catch (e) { logSync('LỖI', String(e.message || e)); }
  } finally { lock.releaseLock(); }
}
/** Ghi nhật ký vào tab NhatKyDongBo (mới nhất ở trên) để biết lần đồng bộ nào thành công, lỗi gì. */
function logSync(status, detail) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(LOG_SYNC);
  if (!sh) { sh = ss.insertSheet(LOG_SYNC); sh.getRange(1, 1, 1, 3).setValues([['Thời gian', 'Kết quả', 'Chi tiết']]).setFontWeight('bold'); sh.setFrozenRows(1); sh.setColumnWidths(1, 1, 150); sh.setColumnWidths(2, 1, 90); sh.setColumnWidths(3, 1, 700); }
  sh.insertRowAfter(1);
  sh.getRange(2, 1, 1, 3).setValues([[Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'), status, detail]]);
  if (sh.getLastRow() > 301) sh.deleteRows(302, sh.getLastRow() - 301);
}

/** Hỏi một email rồi báo: có trong GiaoVien chưa, đã có tài khoản Firebase chưa, đã có hồ sơ trên Firestore chưa, vai trò gì. */
function menuCheckLogin() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Kiểm tra đăng nhập', 'Nhập email cần kiểm tra:', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const email = a.getResponseText().trim().toLowerCase();
  const cfg = getCfg(), pid = cfg.FIREBASE_PROJECT_ID, lines = [];
  const role = (t) => (t.admin ? 'x (quản trị toàn khoa)' : t.leadTo ? `tt${t.leadTo} (tổ trưởng)` : 'tổ viên');
  const t = readTeachers().find((x) => x.email === email);
  lines.push(t ? `✔ Có trong tab GiaoVien: ${t.name}, tổ ${t.to}, vai trò ${role(t)}.` : '✘ KHÔNG có trong tab GiaoVien → thêm một dòng cho email này (cột E: tt1/tt2/tt3 hoặc x nếu là quản lý).');
  const dots = fsList('dots');
  lines.push(dots.length ? `✔ Firebase đã có ${dots.length} đợt thi.` : '✘ Firebase chưa có đợt thi nào → chưa Đồng bộ lần nào (tạo đợt rồi chạy "1. Đồng bộ lên Firebase").');
  const l = idtFetch(`projects/${pid}/accounts:lookup`, { email: [email] });
  const u = l.json.users && l.json.users[0];
  lines.push(u ? `✔ Có tài khoản đăng nhập trên Firebase${u.emailVerified ? '' : ' nhưng CHƯA xác thực email → chạy Đồng bộ để sửa'}.` : '✘ Chưa có tài khoản đăng nhập trên Firebase → chạy "1. Đồng bộ lên Firebase".');
  let doc = null;
  try { doc = fromFields(fsFetch(`${fsBase()}/teachers/${encodeURIComponent(email)}`).fields || {}); } catch (e) { /* chưa có */ }
  if (doc) {
    lines.push(`✔ Có hồ sơ trên Firestore: tổ ${doc.to}, vai trò ${doc.admin ? 'x' : doc.leadTo ? 'tt' + doc.leadTo : 'tổ viên'}${doc.pwTemp ? ', đang dùng mật khẩu mặc định' : ''}.`);
    if (t && (!!doc.admin !== !!t.admin || Number(doc.leadTo || 0) !== t.leadTo)) lines.push('⚠ Vai trò trên Firestore KHÁC tab GiaoVien → chạy "1. Đồng bộ lên Firebase".');
  } else lines.push('✘ Chưa có hồ sơ trên Firestore → chạy "1. Đồng bộ lên Firebase".');
  const ok = t && dots.length && u && u.emailVerified && doc;
  lines.push('', ok ? `ĐĂNG NHẬP ĐƯỢC: email ${email} + mật khẩu mặc định (nếu chưa đổi).` : 'CHƯA đăng nhập được, làm theo các dòng ✘ ở trên.');
  ui.alert(lines.join('\n'));
}

// ---------------------------------------------------------------- Đồng bộ lên
/** Đẩy GV + vai trò, các đợt thi và cấu hình lên Firestore. KHÔNG đụng tới ca thi và đăng ký (do web quản lý). */
/**
 * opts.skipInvalid: dòng GV chưa đủ thông tin thì bỏ qua (dùng khi tự động đồng bộ lúc đang gõ dở) thay vì báo lỗi cả đợt.
 * GV có trong Firestore mà không còn trong sheet sẽ bị gỡ khỏi `teachers` và `roster` (mất quyền vào web; lịch sử đăng ký giữ nguyên).
 */
function syncUp(opts) {
  opts = opts || {};
  const cfg = getCfg();
  const dots = readDots();
  const badD = dots.filter((d) => !/^[A-Za-z0-9-]{2,30}$/.test(d.ma));
  if (badD.length) throw new Error('Mã đợt sai: ' + badD.map((d) => d.ma).join(', '));
  const all = readTeachers();
  const okRow = (t) => /^[^@\s]+@[^@\s]+$/.test(t.email) && [1, 2, 3].includes(t.to) && !!t.name;
  const badT = all.filter((t) => !okRow(t));
  if (badT.length && !opts.skipInvalid) throw new Error('GV thiếu tên / sai email / sai tổ: ' + badT.map((t) => t.email || t.name).join(', '));
  const teachers = all.filter(okRow);

  const writes = [];
  const far = new Date(Date.now() + 365 * 86400000);
  dots.forEach((d) => writes.push({ path: 'dots/' + d.ma,
    data: { name: d.ten, hocKy: d.hocKy, status: d.status, open: d.status === 'MO', deadline: d.hanChot || far, namHoc: d.namHoc, order: d.order } }));
  teachers.forEach((t, i) => {
    writes.push({ path: 'teachers/' + t.email, data: { name: t.name, to: t.to, prior: t.prior, admin: t.admin, leadTo: t.leadTo } });
    // Danh sách công khai cho GV (để vẽ các hàng của bảng): chỉ tên, tổ, thứ tự; số ca cũ (prior) giữ riêng trong teachers
    writes.push({ path: 'roster/' + t.email, data: { name: t.name, to: t.to, order: i + 1 } });
  });
  const caTimes = {}; [1, 2, 3, 4].forEach((c) => (caTimes[c] = cfg.ca[c]));
  writes.push({ path: 'config/main', data: { namHoc: cfg.namHoc, minCa: cfg.toiThieu, khoaNam1: Number(cfg.khoaNam1 || 0),
    khoaHopLe: cfg.khoaHopLe.split(',').map((x) => Number(x.trim())).filter(Boolean), caTimes } });
  fsCommit(writes);

  let acct;
  try { acct = ensureAccounts(teachers); } catch (e) { acct = { created: 0, existing: 0, failed: [String(e.message || e)], createdEmails: [] }; }
  // Tài khoản vừa tạo dùng mật khẩu mặc định → đánh dấu để web nhắc GV đổi mật khẩu
  if (acct.createdEmails.length) fsCommit(acct.createdEmails.map((e) => ({ path: 'teachers/' + e, data: { pwTemp: true } })));

  // Gỡ GV đã bị xoá khỏi sheet (chỉ khi sheet còn GV hợp lệ, để lỡ xoá nhầm cả bảng không làm mất quyền của mọi người)
  let removed = [];
  if (teachers.length) {
    const keep = new Set(all.map((t) => t.email));                       // dòng đang gõ dở vẫn được giữ
    removed = fsList('teachers').map((d) => d._id).filter((id) => !keep.has(id));
    if (removed.length) fsDelete(removed.flatMap((e) => ['teachers/' + e, 'roster/' + e]));
  }
  return { dots: dots.length, teachers: teachers.length, acct, removed, skipped: badT.map((t) => t.email || t.name || '(dòng trống tên)') };
}
function menuSyncUp() {
  const r = syncUp(), a = r.acct;
  SpreadsheetApp.getUi().alert(`Đã đồng bộ ${r.dots} đợt thi và ${r.teachers} giảng viên lên Firebase.\nTài khoản đăng nhập: tạo mới ${a.created}, đã có ${a.existing}.` +
    (r.removed.length ? `\nĐã gỡ ${r.removed.length} giảng viên không còn trong sheet: ${r.removed.join(', ')}.` : '') +
    (a.failed.length ? `\n\nLỖI tạo tài khoản (dữ liệu khác vẫn đã đồng bộ):\n${a.failed.slice(0, 8).join('\n')}` : ''));
}

// ---------------------------------------------------------------- Quên mật khẩu (web gọi vào Web App của script này)
/**
 * Triển khai: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Web gửi POST {action:'reset', email}. Luôn trả {ok:true} dù email có trong danh sách hay không (không lộ danh sách GV).
 * Mật khẩu mới được ĐẶT trực tiếp trong Firebase Auth và gửi qua mail tới chính email đó, từ tài khoản chạy script.
 */
function doGet() { return ContentService.createTextOutput('OK'); }
function doPost(e) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.action === 'reset') return out(resetPassword(String(req.email || '').trim().toLowerCase()));
    if (req.action === 'scan') return out(scanSchedule(req));
    if (req.action === 'shift') return out(changeShift(req));
    if (req.action === 'createDot') return out(createDot(req));
    if (req.action === 'endYear') return out(endAcademicYear(req));
    return out({ ok: false, error: 'unknown action' });
  } catch (err) { return out({ ok: false, error: String(err.message || 'bad request') }); }
}

/** Leaders create named exam periods from the web; Sheet remains the source for future syncs. */
function createDot(req) {
  const cfg = getCfg(), email = verifyIdToken(req.idToken, cfg);
  if (!email) return { ok: false, error: 'auth' };
  const manager = readTeachers().find((t) => t.email === email && (t.admin || t.leadTo > 0));
  if (!manager) return { ok: false, error: 'forbidden' };
  const name = String(req.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100) return { ok: false, error: 'name' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SH.DOT);
    if (!sh) return { ok: false, error: 'missing_dot_sheet' };
    const normalized = name.toLowerCase();
    if (readDots().some((d) => d.namHoc === cfg.namHoc && d.ten.toLowerCase() === normalized)) return { ok: false, error: 'duplicate' };
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'DOT-THI';
    const ma = `${slug}-${Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss')}`;
    const order = Math.max(0, sh.getLastRow() - 1) + 1;
    sh.appendRow([ma, name, name.toUpperCase(), 'SOAN', '', '', cfg.namHoc]);
    const deadline = new Date(Date.now() + 365 * 86400000);
    fsCommit([{ path: 'dots/' + ma, data: { name, hocKy: name.toUpperCase(), status: 'SOAN', open: false, deadline, namHoc: cfg.namHoc, order } }]);
    return { ok: true, id: ma, name, namHoc: cfg.namHoc };
  } finally { lock.releaseLock(); }
}

function nextSchoolYear(year) {
  const m = String(year || '').match(/^(\d{4})-(\d{4})$/);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) throw new Error('Năm học trong CauHinh phải có dạng 2026-2027.');
  return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
}

/** Close the current school year, email a Google Sheets report, reset prior counts and roll cohorts forward. */
function endAcademicYear(req) {
  let cfg = getCfg();
  const email = verifyIdToken(req.idToken, cfg);
  if (!email) return { ok: false, error: 'auth' };
  const leader = readTeachers().find((t) => t.email === email && t.admin);
  if (!leader) return { ok: false, error: 'forbidden' };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    cfg = getCfg();
    const year = cfg.namHoc, nextYear = nextSchoolYear(year);
    if (String(req.namHoc || '') !== year) return { ok: false, error: 'year_changed' };
    const priorClose = readDoc('yearClosures/' + year);
    if (priorClose) return { ok: false, error: 'already_closed', reportUrl: priorClose.reportUrl || '' };

    const teachers = readTeachers();
    const regs = fsList('regs').filter((r) => r.namHoc === year);
    const slots = new Map(fsList('slots').map((s) => [s._id, s]));
    const dots = new Map(fsList('dots').map((d) => [d._id, d]));
    const byEmail = new Map();
    regs.forEach((r) => byEmail.set(r.email, (byEmail.get(r.email) || []).concat(r)));
    const min = cfg.toiThieu || 20;
    const summary = teachers.map((t) => {
      const own = byEmail.get(t.email) || [], total = Number(t.prior || 0) + own.length;
      return [t.name, t.email, TO_LABEL[t.to] || t.to, Number(t.prior || 0), own.length, total, min,
        total < min ? `Thiếu ${min - total}` : total === min ? 'Đủ' : `Dư ${total - min}`];
    }).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'vi'));

    const report = SpreadsheetApp.create(`Thống kê gác thi năm học ${year}`);
    const sumSheet = report.getSheets()[0]; sumSheet.setName('Tổng hợp');
    sumSheet.getRange(1, 1, 1, 8).merge().setValue(`THỐNG KÊ GÁC THI NĂM HỌC ${year}`).setFontWeight('bold').setFontSize(16);
    sumSheet.getRange(2, 1, 1, 2).merge().setValue(`Ngày kết thúc: ${Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')}`);
    sumSheet.getRange(4, 1, 1, 8).setValues([['Họ tên', 'Email', 'Tổ', 'Ca trước app', 'Ca trên app', 'Tổng ca', 'Định mức', 'Trạng thái']]).setFontWeight('bold');
    if (summary.length) sumSheet.getRange(5, 1, summary.length, 8).setValues(summary);
    sumSheet.setFrozenRows(4); sumSheet.autoResizeColumns(1, 8);
    const detail = report.insertSheet('Chi tiết ca');
    detail.getRange(1, 1, 1, 10).setValues([['Ngày', 'Ca', 'Khóa', 'Ngành', 'Môn thi', 'Đợt thi', 'Email', 'Họ tên', 'Tổ chỉ tiêu', 'Năm học']]).setFontWeight('bold');
    const detailRows = regs.map((r) => {
      const s = slots.get(r.slotId) || {}, d = dots.get(r.dotId) || {};
      return [r.date || '', r.ca || '', s.khoa || '', (String(s.nganh || '').indexOf('KHAC') === 0 ? s.donVi : s.nganh) || '', s.mon || '', d.name || r.dotId || '', r.email || '', r.name || '', TO_LABEL[r.to] || r.to || '', year];
    }).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1]));
    if (detailRows.length) detail.getRange(2, 1, detailRows.length, 10).setValues(detailRows);
    detail.setFrozenRows(1); detail.autoResizeColumns(1, 10);

    const cfgSheet = SpreadsheetApp.getActive().getSheetByName(SH.CFG);
    const cfgRows = cfgSheet.getDataRange().getValues();
    const byKey = new Map(cfgRows.slice(1).map((r, i) => [String(r[0]).trim(), i + 2]));
    const cohorts = String(cfg.khoaHopLe || '13,14,15,16').split(',').map((x) => Number(x.trim())).filter(Boolean).map((k) => k + 1);
    const nextKhoaNam1 = Number(cfg.khoaNam1 || Math.max(...cohorts, 16)) + 1;
    [['namHoc', nextYear], ['khoaHopLe', cohorts.join(',')], ['khoaNam1', nextKhoaNam1]].forEach(([key, value]) => {
      const row = byKey.get(key); if (row) cfgSheet.getRange(row, 2).setValue(value);
    });
    const gvSheet = SpreadsheetApp.getActive().getSheetByName(SH.GV);
    if (gvSheet.getLastRow() > 1) gvSheet.getRange(2, 4, gvSheet.getLastRow() - 1, 1).setValues(Array.from({ length: gvSheet.getLastRow() - 1 }, () => [0]));

    const writes = teachers.map((t) => ({ path: 'teachers/' + t.email, data: { prior: 0 } }));
    const caTimes = {}; [1, 2, 3, 4].forEach((c) => caTimes[c] = cfg.ca[c]);
    writes.push({ path: 'config/main', data: { namHoc: nextYear, minCa: min, khoaNam1: nextKhoaNam1, khoaHopLe: cohorts, caTimes } });
    const reportUrl = report.getUrl();
    fsCommit(writes);

    let mailSent = true;
    try {
      MailApp.sendEmail({ to: 'duongthanhtu.dnu@gmail.com', name: cfg.tenNguoiGui || 'Gác thi DNU',
        subject: `Thống kê và kết thúc năm học ${year} – Gác thi DNU`,
        body: `Đã kết thúc năm học ${year}. Báo cáo thống kê ${teachers.length} giảng viên và ${regs.length} lượt gác thi: ${reportUrl}\n\nNăm học tiếp theo đã chuyển sang ${nextYear}; danh sách khóa học đã nâng lên ${cohorts.join(', ')}. Số ca gác trước ứng dụng đã được đặt lại về 0. Lịch sử năm cũ vẫn được giữ trong báo cáo và Firestore.` });
    } catch (mailError) { mailSent = false; }
    fsCommit([{ path: 'yearClosures/' + year, data: { namHoc: year, nextYear, reportUrl, teacherCount: teachers.length, regCount: regs.length, mailSent, closedAt: new Date() } }]);
    return { ok: true, mailSent, year, nextYear, reportUrl, teachers: teachers.length, regs: regs.length, cohorts };
  } finally { lock.releaseLock(); }
}
function randomPassword(n) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // bỏ ký tự dễ nhầm: 0 O 1 l I
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now());
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[(bytes[i] & 255) % alphabet.length];
  return s;
}
function resetPassword(email) {
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: true };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('rst:' + email)) return { ok: true };                       // tối đa 1 lần / 10 phút / email
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
    const [d0, c0] = String(props.getProperty('rstDay') || '').split(':');
    const count = d0 === day ? Number(c0) : 0;
    if (count >= MAX_RESET_PER_DAY) return { ok: false, error: 'limit' };     // chặn spam làm cạn hạn mức mail
    const t = readTeachers().find((x) => x.email === email);
    if (!t) return { ok: true };
    cache.put('rst:' + email, '1', 600);
    props.setProperty('rstDay', day + ':' + (count + 1));

    const cfg = getCfg(), pid = cfg.FIREBASE_PROJECT_ID, pw = randomPassword(10);
    const l = idtFetch(`projects/${pid}/accounts:lookup`, { email: [email] });
    const u = l.json.users && l.json.users[0];
    const r = u
      ? idtFetch(`projects/${pid}/accounts:update`, { localId: u.localId, password: pw, emailVerified: true })
      : idtFetch('accounts:signUp', { email, password: pw, emailVerified: true, displayName: t.name, targetProjectId: pid });
    if (r.code >= 300) return { ok: false, error: 'auth' };
    fsCommit([{ path: 'teachers/' + email, data: { name: t.name, to: t.to, prior: t.prior, admin: t.admin, leadTo: t.leadTo, pwTemp: true } }]);

    const link = cfg.webUrl ? `<p><a href="${esc(cfg.webUrl)}" style="color:#1b5ed8;font-weight:bold">Mở trang đăng ký gác thi</a></p>` : '';
    MailApp.sendEmail({
      to: email, name: cfg.tenNguoiGui, subject: 'Mật khẩu mới cho hệ thống đăng ký gác thi',
      body: `Chào ${t.name},\n\nMật khẩu mới của thầy/cô: ${pw}\n\nHãy đăng nhập bằng email này và mật khẩu trên, rồi vào Cài đặt để đổi mật khẩu.\nNếu thầy/cô không yêu cầu, hãy báo cho khoa.\n\n${cfg.tenNguoiGui}`,
      htmlBody: `<div style="font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#18202c"><p>Chào <b>${esc(t.name)}</b>,</p>` +
        `<p>Mật khẩu mới của thầy/cô để đăng nhập hệ thống đăng ký gác thi:</p>` +
        `<p style="font-size:26px;font-weight:700;letter-spacing:2px;background:#f3f5f9;border-radius:10px;padding:14px 18px;display:inline-block">${esc(pw)}</p>` +
        `<p>Hãy đăng nhập bằng email này, sau đó vào <b>Cài đặt</b> để đổi sang mật khẩu của riêng thầy/cô.</p>${link}` +
        `<p style="font-size:14px;color:#556070">Nếu thầy/cô không yêu cầu cấp lại mật khẩu, hãy báo cho khoa.</p>` +
        `<p style="font-size:14px;color:#7a8596">${esc(cfg.tenNguoiGui)}</p></div>`,
    });
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- Firestore REST
function fsBase() { return `https://firestore.googleapis.com/v1/projects/${getCfg().FIREBASE_PROJECT_ID}/databases/(default)/documents`; }
function fsFetch(url, method, body) {
  const res = UrlFetchApp.fetch(url, {
    method: method || 'get', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined,
  });
  if (res.getResponseCode() >= 300) throw new Error('Firestore ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
  return JSON.parse(res.getContentText() || '{}');
}
function fv(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fv) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
}
function fields(o) { const f = {}; Object.keys(o).forEach((k) => (f[k] = fv(o[k]))); return f; }
function fromFv(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(f) { const o = {}; Object.keys(f).forEach((k) => (o[k] = fromFv(f[k]))); return o; }

/** writes: [{path:'slots/abc', data:{...}}] – chỉ ghi các field top-level có trong data */
function fsCommit(writes) {
  const root = `projects/${getCfg().FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
  for (let i = 0; i < writes.length; i += 400) {
    fsFetch(fsBase() + ':commit', 'post', {
      writes: writes.slice(i, i + 400).map((w) => ({ update: { name: root + w.path, fields: fields(w.data) }, updateMask: { fieldPaths: Object.keys(w.data) } })),
    });
  }
}
/** Atomic mix of upserts and deletes for member shift operations. */
function fsCommitOps(ops) {
  const root = `projects/${getCfg().FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
  fsFetch(fsBase() + ':commit', 'post', { writes: ops.map((op) => op.delete
    ? { delete: root + op.path }
    : { update: { name: root + op.path, fields: fields(op.data) }, updateMask: { fieldPaths: Object.keys(op.data) } }) });
}
function fsDelete(paths) {
  const root = `projects/${getCfg().FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
  for (let i = 0; i < paths.length; i += 400) fsFetch(fsBase() + ':commit', 'post', { writes: paths.slice(i, i + 400).map((p) => ({ delete: root + p })) });
}
function fsList(col) {
  const out = []; let token = '';
  do {
    const r = fsFetch(`${fsBase()}/${col}?pageSize=300${token ? '&pageToken=' + token : ''}`);
    (r.documents || []).forEach((d) => out.push(Object.assign({ _id: d.name.split('/').pop() }, fromFields(d.fields || {}))));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}

// ---------------------------------------------------------------- Đăng ký / đổi / huỷ ca (server authoritative)
function readDoc(path) {
  try { const d = fsFetch(fsBase() + '/' + path); return Object.assign({ _id: path.split('/').pop() }, fromFields(d.fields || {})); }
  catch (e) { return null; }
}
function shiftError(message) { return { ok: false, error: message }; }
function shiftStart(slot, cfg) { return startDate(cfg, slot.date, slot.ca); }
function validateShiftWindow(slot, mode, cfg) {
  const starts = shiftStart(slot, cfg), now = new Date();
  if (starts <= now) return 'Ca thi đã bắt đầu hoặc đã qua.';
  if (mode === 'cancel' && starts.getTime() - now.getTime() < 48 * 60 * 60 * 1000)
    return 'Chỉ được huỷ ca trước thời điểm bắt đầu ít nhất 48 giờ. Bạn có thể chọn người thay thế để đổi ca.';
  return '';
}
function validTeacherEmail(email) { return /^[^@\s]+@[^@\s]+$/.test(email); }
function shiftRegId(slot, email) { return `${slot.date}_${slot.ca}__${email}`; }
function shiftMail(slot, action, from, replacement, bucket) {
  const lead = readTeachers().find((t) => t.leadTo === bucket);
  if (!lead) return false;
  const cfg = getCfg(), date = dateLongVN(slot.date), start = cfg.ca[slot.ca].start;
  const subject = action === 'exchange' ? `[Gác thi] Đổi người gác · ${date} · Ca ${slot.ca}` : `[Gác thi] Huỷ ca · ${date} · Ca ${slot.ca}`;
  const lines = action === 'exchange'
    ? `Thầy/cô ${from.name} đã chuyển ca gác thi cho thầy/cô ${replacement.name}.\n\n`
    : `Thầy/cô ${from.name} đã huỷ ca gác thi. Ca này đang trống người.\n\n`;
  MailApp.sendEmail({ to: lead.email, name: cfg.tenNguoiGui || 'Gác thi DNU', subject,
    body: `${lines}Ngày: ${date}\nCa ${slot.ca}, bắt đầu lúc ${start}\n${slotWho(slot)}${slot.mon ? ` · ${slot.mon}` : ''}\nTổ phụ trách chỉ tiêu: ${TO_LABEL[bucket]}\n\nVui lòng kiểm tra số người đã đăng ký trong ứng dụng.` });
  return true;
}
/** All enrollment/transfer/cancellation mutations are serialized and validated on the server. */
function changeShift(req) {
  const cfg = getCfg(), email = verifyIdToken(req.idToken, cfg);
  if (!email) return shiftError('auth');
  const teacher = readDoc('teachers/' + email);
  if (!teacher || ![1, 2, 3].includes(Number(teacher.to))) return shiftError('teacher');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const mode = String(req.mode || ''), slotIdReq = String(req.slotId || '');
    if (!['register', 'exchange', 'cancel'].includes(mode)) return shiftError('mode');
    const slot = fsList('slots').find((s) => s._id === slotIdReq && s.active !== false);
    if (!slot) return shiftError('slot');
    const regs = fsList('regs');
    const current = regs.find((r) => r.slotId === slot._id && r.email === email);
    if (mode !== 'register' && !current) return shiftError('registration');
    const windowError = validateShiftWindow(slot, mode, cfg);
    if (windowError) return shiftError(windowError);
    const dot = readDoc('dots/' + slot.dotId);
    if (!dot) return shiftError('dot');

    if (mode === 'register') {
      if (dot.status !== 'MO' || (dot.deadline && new Date(dot.deadline).getTime() <= Date.now())) return shiftError('closed');
      if (regs.some((r) => r.email === email && r.date === slot.date && Number(r.ca) === Number(slot.ca))) return shiftError('overlap');
      const poolOrder = [Number(teacher.to), ...[1, 2, 3].filter((t) => t !== Number(teacher.to))];
      let bucket = 0, k = 0;
      for (const t of poolOrder) {
        const used = new Set(regs.filter((r) => r.slotId === slot._id && Number(r.to) === t).map((r) => Number(r.k)));
        const need = Number((slot.need || {})['t' + t] || 0);
        for (let i = 1; i <= need; i++) if (!used.has(i)) { bucket = t; k = i; break; }
        if (bucket) break;
      }
      if (!bucket) return shiftError('full');
      const regId = shiftRegId(slot, email), claimId = `${slot._id}_t${bucket}_${k}`;
      const row = { slotId: slot._id, dotId: slot.dotId, namHoc: slot.namHoc, date: slot.date, ca: slot.ca,
        email, name: teacher.name, to: bucket, homeTo: Number(teacher.to), k, claimId, createdAt: new Date() };
      fsCommit([{ path: 'claims/' + claimId, data: { slotId: slot._id, dotId: slot.dotId, to: bucket, k, email, regId, namHoc: slot.namHoc } },
        { path: 'regs/' + regId, data: row }]);
      return { ok: true, mode, bucket };
    }

    const cutoff = validateShiftWindow(slot, mode, cfg);
    if (cutoff) return shiftError(cutoff);
    const claimId = current.claimId || `${slot._id}_t${current.to}_${current.k}`;
    const replacementEmail = String(req.replacementEmail || '').trim().toLowerCase();
    let replacement = null;
    if (mode === 'exchange') {
      if (!validTeacherEmail(replacementEmail) || replacementEmail === email) return shiftError('replacement');
      replacement = readDoc('teachers/' + replacementEmail);
      if (!replacement || ![1, 2, 3].includes(Number(replacement.to))) return shiftError('replacement');
      if (regs.some((r) => r.email === replacementEmail && r.date === slot.date && Number(r.ca) === Number(slot.ca))) return shiftError('replacement_overlap');
      const nextId = shiftRegId(slot, replacementEmail);
      const claim = { slotId: slot._id, dotId: slot.dotId, to: Number(current.to), k: Number(current.k), email: replacementEmail, regId: nextId, namHoc: slot.namHoc };
      const newReg = { ...current, email: replacementEmail, name: replacement.name, homeTo: Number(replacement.to), createdAt: new Date() };
      delete newReg._id;
      fsCommitOps([{ delete: true, path: 'regs/' + current._id }, { path: 'claims/' + claimId, data: claim }, { path: 'regs/' + nextId, data: newReg }]);
      let mailSent = false;
      try { mailSent = shiftMail(slot, 'exchange', teacher, replacement, Number(current.to)); } catch (e) { mailSent = false; }
      return { ok: true, mode, mailSent };
    }

    fsCommitOps([{ delete: true, path: 'regs/' + current._id }, { delete: true, path: 'claims/' + claimId }]);
    let mailSent = false;
    try { mailSent = shiftMail(slot, 'cancel', teacher, null, Number(current.to)); } catch (e) { mailSent = false; }
    return { ok: true, mode, mailSent };
  } catch (e) {
    return shiftError(String(e.message || e));
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- Kéo đăng ký về
const pullRegs = (ma) => fsList('regs').filter((r) => r.dotId === ma);
function syncDown(ma) {
  const regs = pullRegs(ma).sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
  const ss = SpreadsheetApp.getActive();
  const name = TAB.REG + ma;
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  const rows = regs.map((r) => [r.slotId, isoToVN(r.date), r.ca, r.email, r.name, TO_LABEL[r.to] || r.to, r.createdAt || '']);
  sh.getRange(1, 1, 1, 7).setValues([['Mã ca', 'Ngày', 'Ca', 'Email', 'Họ tên', 'Tổ', 'Đăng ký lúc']]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, 7).setValues(rows);
  return regs;
}

// ---------------------------------------------------------------- Xuất MẪU
function exportMau(ma) {
  const cfg = getCfg(), dot = getDot(ma);
  const slots = readSlots(ma);
  if (!slots.length) throw new Error('Đợt này chưa có ca nào (tổ trưởng thêm ca trên web).');
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || a.nganh.localeCompare(b.nganh));
  const teachers = readTeachers();
  const regs = syncDown(ma);
  const has = new Set(regs.map((r) => r.slotId + '|' + r.email));

  const ss = SpreadsheetApp.getActive();
  const old = ss.getSheetByName(TAB.OUT + ma);
  if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(TAB.OUT + ma);

  const n = slots.length, C0 = 4, COL_SUM = C0 + n, W = COL_SUM; // cột A TT, B tên, C nhãn, D.. ca, cuối = Cộng
  const R_HEAD = 7, R_T0 = 14, m = teachers.length, R_TOT = R_T0 + m, R_Q = R_TOT + 1;
  const R_TBL = R_Q + 2;
  const grid = Array.from({ length: R_TBL + 5 }, () => Array(W).fill(''));
  const L = (c) => sh.getRange(1, c).getA1Notation().replace(/\d+/, '');   // số cột → chữ cái
  const midCol = Math.max(3, Math.floor(W / 2));

  grid[0][0] = 'TRƯỜNG ĐẠI HỌC ĐỒNG NAI'; grid[0][midCol] = 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM';
  grid[1][0] = 'KHOA NGOẠI NGỮ'; grid[1][midCol] = 'Độc lập - Tự do - Hạnh phúc';
  grid[3][0] = `TỔNG HỢP DANH SÁCH KHOA NGOẠI NGỮ COI THI ${dot.hocKy.toUpperCase()} (NĂM HỌC ${cfg.namHoc})`;
  // Giữ nguyên câu của mẫu: "Coi thi tại cơ sở 1; Ca 1: CBCT có mặt tại HĐ thi lúc 07h15 Ca 2: ..."
  grid[4][0] = `* Coi thi tại ${cfg.coSo}; ` + [1, 2, 3, 4].map((c) => `Ca ${c}: CBCT có mặt tại HĐ thi lúc ${hhmmVN(cfg.ca[c].arrive)}`).join('; ');
  grid[6][0] = 'TT'; grid[6][1] = 'Họ tên GV'; grid[6][2] = 'Ngày thi, số lượng'; grid[6][COL_SUM - 1] = 'Cộng';
  grid[7][2] = 'Ngày'; grid[8][2] = 'Ca'; grid[9][2] = 'Khoá - Ngành'; grid[10][2] = 'TỔ BM';

  slots.forEach((s, j) => {
    const c = C0 - 1 + j;
    grid[7][c] = isoToVN(s.date); grid[8][c] = s.ca; grid[9][c] = slotWho(s).replace(' · ', ' - ');
    [1, 2, 3].filter((t) => s.need['t' + t] > 0).forEach((t, i) => (grid[10 + i][c] = `${TO_LABEL[t]} (${s.need['t' + t]})`));
  });

  teachers.forEach((t, i) => {
    const r = R_T0 - 1 + i;
    grid[r][0] = i + 1; grid[r][1] = t.name;
    slots.forEach((s, j) => { if (has.has(s.id + '|' + t.email)) grid[r][C0 - 1 + j] = 'X'; });
    grid[r][COL_SUM - 1] = `=COUNTIF(${L(C0)}${R_T0 + i}:${L(COL_SUM - 1)}${R_T0 + i},"X")`;
  });

  grid[R_TOT - 1][0] = 'Tổng đăng ký'; grid[R_Q - 1][0] = 'SL được giao';
  slots.forEach((s, j) => {
    const c = C0 - 1 + j, col = L(C0 + j);
    grid[R_TOT - 1][c] = m ? `=COUNTIF(${col}${R_T0}:${col}${R_TOT - 1},"X")` : 0;
    grid[R_Q - 1][c] = s.need.t1 + s.need.t2 + s.need.t3;
  });
  grid[R_TOT - 1][COL_SUM - 1] = `=SUM(${L(C0)}${R_TOT}:${L(COL_SUM - 1)}${R_TOT})`;
  grid[R_Q - 1][COL_SUM - 1] = `=SUM(${L(C0)}${R_Q}:${L(COL_SUM - 1)}${R_Q})`;

  grid[R_TBL - 1][0] = 'Bộ môn'; grid[R_TBL - 1][1] = 'Số lượng GV'; grid[R_TBL - 1][2] = 'Số ca được phân công';
  [1, 2, 3].forEach((t, i) => {
    const r = R_TBL + i;
    grid[r][0] = TO_LABEL[t];
    grid[r][1] = teachers.filter((x) => x.to === t).length;
    grid[r][2] = slots.reduce((a, s) => a + s.need['t' + t], 0);
  });
  grid[R_TBL + 3][0] = 'Tổng'; grid[R_TBL + 3][1] = `=SUM(B${R_TBL + 1}:B${R_TBL + 3})`; grid[R_TBL + 3][2] = `=SUM(C${R_TBL + 1}:C${R_TBL + 3})`;

  const rng = sh.getRange(1, 1, grid.length, W);
  rng.setValues(grid).setFontFamily('Times New Roman').setFontSize(11).setVerticalAlignment('middle');

  const mg = (a) => sh.getRange(a).merge();
  mg(`A1:C1`); mg(`${L(midCol + 1)}1:${L(W)}1`); mg(`A2:C2`); mg(`${L(midCol + 1)}2:${L(W)}2`);
  mg(`A4:${L(W)}4`); mg(`A5:${L(W)}5`);
  mg(`A${R_HEAD}:A13`); mg(`B${R_HEAD}:B13`); mg(`${L(COL_SUM)}${R_HEAD}:${L(COL_SUM)}13`);
  if (COL_SUM - 1 > 3) mg(`C${R_HEAD}:${L(COL_SUM - 1)}${R_HEAD}`);
  mg(`A${R_TOT}:C${R_TOT}`); mg(`A${R_Q}:C${R_Q}`);

  sh.getRange(1, 1, 2, W).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(4, 1).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sh.getRange(5, 1).setFontStyle('italic');
  const table = sh.getRange(R_HEAD, 1, R_Q - R_HEAD + 1, W);
  table.setBorder(true, true, true, true, true, true).setHorizontalAlignment('center').setWrap(true);
  sh.getRange(R_HEAD, 1, 7, W).setFontWeight('bold');
  sh.getRange(R_T0, 2, m, 1).setHorizontalAlignment('left');
  sh.getRange(R_TOT, 1, 2, W).setFontWeight('bold');
  const tbl = sh.getRange(R_TBL, 1, 5, 3);
  tbl.setBorder(true, true, true, true, true, true).setHorizontalAlignment('center');
  sh.getRange(R_TBL, 1, 1, 3).setFontWeight('bold'); sh.getRange(R_TBL + 4, 1, 1, 3).setFontWeight('bold');

  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 210); sh.setColumnWidth(3, 130);
  sh.setColumnWidths(C0, n, 92); sh.setColumnWidth(COL_SUM, 60);
  sh.setRowHeights(11, 3, 34);
  sh.setFrozenColumns(3);
  sh.setHiddenGridlines(true);
  ss.setActiveSheet(sh);
  return { slots: n, teachers: m, regs: regs.length };
}
function menuExport() {
  const r = exportMau(pickDot());
  SpreadsheetApp.getUi().alert(`Đã xuất mẫu: ${r.slots} ca, ${r.teachers} GV, ${r.regs} lượt đăng ký.`);
}

function exportXlsx(ma) {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TAB.OUT + ma);
  if (!sh) throw new Error('Chưa có tab xuất mẫu. Chạy "Kéo đăng ký về + Xuất MẪU" trước.');
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=xlsx&gid=${sh.getSheetId()}`;
  const blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob()
    .setName(`PHAN CONG COI THI ${getDot(ma).hocKy} ${getCfg().namHoc}.xlsx`);
  return DriveApp.createFile(blob).getUrl();
}
function menuXlsx() { SpreadsheetApp.getUi().alert('Đã lưu vào Drive:\n' + exportXlsx(pickDot())); }

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Dựng nội dung mail (thuần hàm, không gọi dịch vụ Google => xem thử được ngoài Apps Script).
 * items: [{ s: slot, arrive: 'HH:mm', start: 'HH:mm' }] đã sắp xếp theo ngày/ca
 * stat : { total, min }  số ca đã đăng ký trong năm học / mức tối thiểu
 */
function buildReminder(cfg, name, items, stat, sender) {
  const from = (sender && sender.name) || cfg.tenNguoiGui;
  const first = items[0];
  // Ngày thật của các ca: "Thứ Hai, 27/07/2026" hoặc "Thứ Hai, 27/07/2026 và Thứ Ba, 28/07/2026"
  const days = items.map((i) => i.s.date).filter((d, i, a) => a.indexOf(d) === i).map(dateLongVN);
  const whenTxt = days.length > 1 ? days.slice(0, -1).join(', ') + ' và ' + days[days.length - 1] : days[0];
  const subject = `[Nhắc lịch] Coi thi ${isoToVN(first.s.date).slice(0, 5)}: Ca ${first.s.ca}, bắt đầu ${first.start}` + (items.length > 1 ? ` (+${items.length - 1} ca)` : '');
  const cards = items.map(({ s, arrive, start }) => `
    <tr><td style="padding:0 0 12px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d9dfe8;border-left:6px solid #1b5ed8;border-radius:10px;background:#ffffff">
        <tr><td style="padding:14px 16px">
          <div style="font-size:15px;color:#556070">${dateLongVN(s.date).replace(/^./, (c) => c.toUpperCase())}</div>
          <div style="font-size:28px;line-height:1.25;font-weight:700;color:#1b5ed8;margin:2px 0 6px">Bắt đầu lúc ${start}</div>
          <div style="font-size:17px;color:#18202c"><b>Ca ${s.ca}</b> · ${esc(slotWho(s))}${s.mon ? ' · ' + esc(s.mon) : ''}</div>
          <div style="font-size:13px;color:#7a8596;margin-top:6px">Có mặt tại Hội đồng thi (${esc(cfg.coSo)}) lúc ${arrive}</div>
          ${s.note ? `<div style="font-size:15px;color:#9a5200;margin-top:4px">Ghi chú: ${esc(s.note)}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>`).join('');

  const short = Math.max(0, stat.min - stat.total);
  const progress = short > 0
    ? `Đến nay thầy/cô đã đăng ký <b>${stat.total}/${stat.min}</b> ca trong năm học ${esc(cfg.namHoc)}, còn thiếu <b>${short}</b> ca.`
    : `Đến nay thầy/cô đã đăng ký <b>${stat.total}/${stat.min}</b> ca trong năm học ${esc(cfg.namHoc)}: đã đủ định mức.`;
  const button = cfg.webUrl
    ? `<tr><td align="center" style="padding:6px 0 18px"><a href="${esc(cfg.webUrl)}" style="display:inline-block;background:#1b5ed8;color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;padding:14px 28px;border-radius:10px">Xem lịch của tôi</a></td></tr>` : '';

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9"><tr><td align="center" style="padding:16px 10px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#1b5ed8;padding:18px 20px">
      <div style="font-size:14px;color:#cfe0ff">Khoa Ngoại ngữ · Trường ĐH Đồng Nai</div>
      <div style="font-size:24px;font-weight:700;color:#ffffff;margin-top:2px">Nhắc lịch coi thi</div>
    </td></tr>
    <tr><td style="padding:20px">
      <p style="font-size:18px;line-height:1.5;margin:0 0 12px;color:#18202c">Chào thầy/cô <b>${esc(name)}</b>,</p>
      <p style="font-size:18px;line-height:1.5;margin:0 0 16px;color:#18202c">Thầy/cô có ${items.length > 1 ? `<b>${items.length} ca</b>` : '<b>1 ca</b>'} coi thi vào <b>${esc(whenTxt)}</b>:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
      <p style="font-size:16px;line-height:1.5;margin:6px 0 16px;color:#18202c;background:#f3f5f9;border-radius:10px;padding:12px 14px">${progress}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${button}</table>
      <p style="font-size:15px;line-height:1.5;margin:0;color:#556070">${sender && sender.replyTo ? 'Cần đổi ca hoặc cần hỗ trợ? Hãy trả lời thư này để liên hệ trực tiếp với tổ trưởng, hoặc huỷ ca trên trang đăng ký (nếu còn hạn).' : 'Cần đổi ca? Huỷ ca trên trang đăng ký (nếu còn hạn) hoặc liên hệ thư ký khoa. Thư này gửi tự động, vui lòng không trả lời.'}</p>
    </td></tr>
  </table>
  <div style="font-size:13px;color:#7a8596;padding:12px 0">${esc(from)}</div>
</td></tr></table></body></html>`;

  const text = `Chào thầy/cô ${name},\n\nNhắc lịch coi thi (${cfg.coSo}):\n\n` +
    items.map(({ s, arrive, start }) => `- ${dateLongVN(s.date)}: Ca ${s.ca}, BẮT ĐẦU ${start} (có mặt tại HĐ thi lúc ${arrive}), ${slotWho(s)}${s.mon ? ', ' + s.mon : ''}`).join('\n') +
    `\n\n${progress.replace(/<\/?b>/g, '')}\n\n${from}`;
  return { subject, html, text };
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'sendReminders').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Đã cài: kiểm tra mỗi giờ và gửi mail nhắc.');
}

/** Chạy mỗi giờ: ca nào còn ≤ N giờ nữa tới giờ CÓ MẶT (và chưa nhắc) → gửi mail, gộp các ca của cùng 1 GV vào 1 thư. Người gửi hiển thị là TỔ TRƯỞNG của GV đó. */
function sendReminders() {
  const cfg = getCfg();
  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(SH.LOG) || ss.insertSheet(SH.LOG);
  if (log.getLastRow() < 1) log.appendRow(['Khoá', 'Gửi lúc', 'Email']);
  const sent = new Set(log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().map((r) => r[0]) : []);
  const now = Date.now(), limit = cfg.nhacTruocGio * 3600000;

  const allRegs = fsList('regs').filter((r) => r.namHoc === cfg.namHoc);
  const yearCount = {}; allRegs.forEach((r) => (yearCount[r.email] = (yearCount[r.email] || 0) + 1));
  const teachers = readTeachers(), byEmail = {}, leadBy = {};
  teachers.forEach((t) => { byEmail[t.email] = t; if (t.leadTo && !leadBy[t.leadTo]) leadBy[t.leadTo] = t; });

  const slotMap = {};
  fsList('slots').forEach((d) => { if (d.active !== false) slotMap[d._id] = { id: d._id, date: d.date, ca: d.ca, khoa: d.khoa, nganh: d.nganh, donVi: d.donVi || '', mon: d.mon || '', note: d.note || '' }; });

  const perUser = {};
  allRegs.forEach((r) => {
    const s = slotMap[r.slotId]; if (!s) return;
    const left = arriveDate(cfg, s.date, s.ca).getTime() - now;
    if (left <= 0 || left > limit || sent.has(r.slotId + '|' + r.email)) return;
    (perUser[r.email] = perUser[r.email] || { name: r.name, items: [] }).items.push({ s, key: r.slotId + '|' + r.email, arrive: cfg.ca[s.ca].arrive, start: cfg.ca[s.ca].start });
  });

  Object.keys(perUser).forEach((email) => {
    const u = perUser[email], t = byEmail[email];
    u.items.sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.ca - b.s.ca);
    const lead = t && leadBy[t.to];
    const sender = lead && lead.email !== email
      ? { name: `${lead.name} - Tổ trưởng ${TO_LABEL[t.to]}`, replyTo: lead.email }
      : { name: cfg.tenNguoiGui };
    const mail = buildReminder(cfg, u.name, u.items, { total: (t ? t.prior : 0) + (yearCount[email] || 0), min: cfg.toiThieu }, sender);
    const opt = { to: email, subject: mail.subject, body: mail.text, htmlBody: mail.html, name: sender.name };
    if (sender.replyTo) opt.replyTo = sender.replyTo;
    MailApp.sendEmail(opt);
    u.items.forEach((i) => log.appendRow([i.key, new Date(), email]));
  });
}

/** Gửi mail mẫu (dữ liệu giả từ 2 ca đầu của đợt) về chính email của admin để xem thử. */
function menuTestMail() {
  const ma = pickDot(), cfg = getCfg();
  const slots = readSlots(ma).sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca).slice(0, 2);
  if (!slots.length) throw new Error('Đợt này chưa có ca nào (tổ trưởng thêm ca trên web).');
  const items = slots.map((s) => ({ s, arrive: cfg.ca[s.ca].arrive, start: cfg.ca[s.ca].start }));
  const to = Session.getEffectiveUser().getEmail();
  const mail = buildReminder(cfg, 'Nguyễn Văn A (thư thử)', items, { total: 14, min: cfg.toiThieu }, { name: 'Nguyễn Văn B - Tổ trưởng Chuyên 1', replyTo: to });
  MailApp.sendEmail({ to, subject: '[THỬ] ' + mail.subject, body: mail.text, htmlBody: mail.html, name: 'Nguyễn Văn B - Tổ trưởng Chuyên 1', replyTo: to });
  SpreadsheetApp.getUi().alert('Đã gửi mail thử tới ' + to);
}

// ---------------------------------------------------------------- Quét lịch thi từ ảnh (Gemini)
/**
 * Web gửi POST {action:'scan', idToken, image(base64), mime, namHoc}.
 * Chỉ tổ trưởng / quản trị (cột E trong GiaoVien) dùng được; khoá Gemini nằm ở Script Properties (GEMINI_API_KEY), không lộ ra web.
 * Trả {ok, rows:[{date, ca, khoa, nganh, mon, note, time}]} để web hiện bản xem trước cho tổ trưởng sửa. Không tự lưu gì.
 */
const SCAN_MAX_PER_DAY = 40;
const SCAN_MAX_B64 = 7 * 1024 * 1024;

/** Kiểm tra idToken của Firebase, trả email (chữ thường) hoặc null. */
function verifyIdToken(idToken, cfg) {
  if (!idToken) return null;
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(cfg.FIREBASE_API_KEY), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ idToken }),
  });
  if (res.getResponseCode() >= 300) return null;
  const u = (JSON.parse(res.getContentText() || '{}').users || [])[0];
  return u && u.emailVerified && u.email ? String(u.email).toLowerCase() : null;
}

function buildScanPrompt(cfg, namHoc) {
  const times = [1, 2, 3, 4].map((c) => `ca ${c} = ${cfg.ca[c].start}`).join(', ');
  return `Đây là ảnh (chụp hoặc chụp màn hình) lịch thi của một trường đại học ở Việt Nam. Hãy trích xuất MỌI ca thi thành danh sách.
Với mỗi ca thi trả về các trường:
- date: ngày thi dạng yyyy-mm-dd. Nếu ảnh chỉ ghi ngày/tháng, dùng năm thuộc năm học ${namHoc || ''}. Nếu không chắc, để chuỗi rỗng.
- time: giờ bắt đầu thi dạng HH:mm (24 giờ) nếu ảnh có ghi, nếu không để chuỗi rỗng. (Các ca của khoa: ${times}.)
- khoa: số khoá (ví dụ lớp "DHSPA13A" hoặc "K13" là khoá 13). Nếu không chắc, để null.
- nganh: "SPA" nếu là Sư phạm Tiếng Anh / Sư phạm Anh, "NNA" nếu là Ngôn ngữ Anh; nếu không chắc để chuỗi rỗng.
- mon: tên môn thi (giữ nguyên chữ trong ảnh).
- note: ghi chú khác (phòng thi, hình thức thi...) nếu có, nếu không để chuỗi rỗng.
Quy tắc: tuyệt đối không bịa. Nếu một ô không đọc được thì để trống thay vì đoán. Mỗi dòng của bảng là một phần tử; nếu một ô ghi nhiều ngày hoặc nhiều lớp thì tách thành nhiều phần tử. Chỉ trả JSON đúng định dạng yêu cầu.`;
}

/** Giờ thi → số ca (1-4) gần nhất trong ±45 phút so với giờ bắt đầu hoặc giờ có mặt; không khớp thì trả null. */
function timeToCa(time, cfg) {
  const m = String(time || '').trim().match(/^(\d{1,2})[:hH.](\d{2})$/);
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  let best = null, bestD = 46;
  [1, 2, 3, 4].forEach((c) => [cfg.ca[c].start, cfg.ca[c].arrive].forEach((x) => {
    const mm = String(x).match(/^(\d{1,2}):(\d{2})$/); if (!mm) return;
    const d = Math.abs(Number(mm[1]) * 60 + Number(mm[2]) - t);
    if (d < bestD) { bestD = d; best = c; }
  }));
  return best;
}

/** Chuẩn hoá kết quả của AI thành các dòng web dùng được (ngày ISO, ca, khoá hợp lệ, ngành SPA/NNA). Hàm thuần, thử được ngoài Apps Script. */
function normalizeScanRows(rows, cfg) {
  const khoaOK = cfg.khoaHopLe.split(',').map((x) => Number(x.trim())).filter(Boolean);
  return (rows || []).slice(0, 300).map((r) => {
    let date = String(r.date || '').trim();
    const dm = date.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (dm) date = `${dm[3]}-${pad2(+dm[2])}-${pad2(+dm[1])}`;
    const ym = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const okDate = !!ym && new Date(Date.UTC(+ym[1], +ym[2] - 1, +ym[3])).getUTCDate() === +ym[3];   // loại ngày không có thật (31/02…)
    const ng = String(r.nganh || '').trim().toUpperCase();
    const khoa = Number(r.khoa);
    return { date: okDate ? date : '', time: String(r.time || '').trim(), ca: timeToCa(r.time, cfg),
      khoa: khoaOK.includes(khoa) ? khoa : null, nganh: NGANH.includes(ng) ? ng : '', mon: String(r.mon || '').trim(), note: String(r.note || '').trim() };
  });
}

function scanSchedule(req) {
  const cfg = getCfg();
  const email = verifyIdToken(req.idToken, cfg);
  if (!email) return { ok: false, error: 'auth' };
  const t = readTeachers().find((x) => x.email === email);
  if (!t || !(t.admin || t.leadTo)) return { ok: false, error: 'forbidden' };
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  const b64 = String(req.image || '');
  if (!b64 || b64.length > SCAN_MAX_B64 || !/^image\/(jpeg|png|webp)$/.test(String(req.mime))) return { ok: false, error: 'bad_image' };

  const props = PropertiesService.getScriptProperties();                       // hạn mức mỗi người mỗi ngày (tránh dùng quá tay)
  const day = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd'), qk = 'scan:' + email;
  const [d0, c0] = String(props.getProperty(qk) || '').split(':');
  const used = d0 === day ? Number(c0) : 0;
  if (used >= SCAN_MAX_PER_DAY) return { ok: false, error: 'limit' };
  props.setProperty(qk, day + ':' + (used + 1));

  const body = {
    contents: [{ parts: [{ text: buildScanPrompt(cfg, req.namHoc) }, { inline_data: { mime_type: req.mime, data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['rows'], properties: { rows: { type: 'ARRAY', items: {
      type: 'OBJECT', required: ['date'], properties: { date: { type: 'STRING' }, time: { type: 'STRING' }, khoa: { type: 'INTEGER' }, nganh: { type: 'STRING' }, mon: { type: 'STRING' }, note: { type: 'STRING' } } } } } } },
  };
  const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel)}:generateContent`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body),
  });
  if (res.getResponseCode() >= 300) return { ok: false, error: 'gemini', detail: res.getContentText().slice(0, 300) };
  try {
    const text = JSON.parse(res.getContentText()).candidates[0].content.parts.map((p) => p.text || '').join('');
    return { ok: true, rows: normalizeScanRows(JSON.parse(text).rows, cfg), model: cfg.geminiModel };
  } catch (e) { return { ok: false, error: 'parse' }; }
}

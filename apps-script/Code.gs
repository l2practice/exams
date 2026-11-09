/**
 * Đăng ký gác thi – Khoa Ngoại ngữ ĐH Đồng Nai
 * Sheet = nơi admin nhập liệu + xuất mẫu.  Firestore = nơi GV đăng ký (nhanh, realtime).
 *
 * Tab cố định : CauHinh | GiaoVien | Dot | NhatKyNhac
 * Mỗi đợt thi : CaThi_<mã> (nhập lịch) | DangKy_<mã> (tự sinh) | XuatMau_<mã> (tự sinh)
 */
const SH = { CFG: 'CauHinh', GV: 'GiaoVien', DOT: 'Dot', LOG: 'NhatKyNhac' };
const TAB = { CA: 'CaThi_', REG: 'DangKy_', OUT: 'XuatMau_' };
const TO_LABEL = { 1: 'Chuyên 1', 2: 'Chuyên 2', 3: 'Cơ bản' }; // 1 = tổ SPA, 2 = tổ NNA, 3 = tổ Cơ bản
const NGANH = ['SPA', 'NNA'];
const TZ = 'Asia/Ho_Chi_Minh';
// [giờ bắt đầu, giờ CBCT có mặt tại HĐ thi] – sửa trong tab CauHinh, đây chỉ là mặc định
const CA_DEFAULT = { 1: ['07:30', '07:15'], 2: ['09:00', '08:45'], 3: ['13:30', '13:15'], 4: ['15:00', '14:45'] };
const CA_HEADERS = ['Mã ca (tự sinh)', 'Ngày', 'Ca', 'Khoá', 'Ngành', 'Môn thi', 'Cần Chuyên 1 (SPA)', 'Cần Chuyên 2 (NNA)', 'Cần Cơ bản', 'Ghi chú', 'Kiểm tra'];
const DOT_HEADERS = ['Mã đợt', 'Tên đợt thi', 'Học kỳ (in trên mẫu)', 'Mở đăng ký (TRUE/FALSE)', 'Hạn chót đăng ký', 'Ghi chú'];

// ---------------------------------------------------------------- Menu
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gác thi')
    .addItem('0. Tạo đợt thi mới…', 'menuNewDot')
    .addSeparator()
    .addItem('1. Thêm ca nhanh (ngày × ca × khoá × ngành)…', 'showQuickAdd')
    .addItem('2. Kiểm tra dữ liệu', 'menuCheck')
    .addItem('3. Đồng bộ lên Firebase (mở cho GV đăng ký)', 'menuSyncUp')
    .addSeparator()
    .addItem('4. Kéo đăng ký về Sheet + Xuất MẪU nộp', 'menuExport')
    .addItem('5. Lưu file .xlsx vào Drive', 'menuXlsx')
    .addSeparator()
    .addItem('Tạo tài khoản đăng nhập cho GV (mật khẩu mặc định)', 'menuAccounts')
    .addItem('Gửi thử mail nhắc cho tôi', 'menuTestMail')
    .addItem('Cài lịch gửi mail nhắc (mỗi giờ)', 'installTriggers')
    .addItem('Tạo các tab cố định (chạy lần đầu)', 'setupSheets')
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
      ['khoaHopLe', '13,14,15,16', 'Các khoá đang học'],
      ['khoaNam1', '16', 'Khoá đang học năm 1 (16 → năm 1, 15 → năm 2…)'],
      ['nhacTruocGio', '18', 'Gửi mail nhắc trước giờ CÓ MẶT bao nhiêu giờ'],
      ['tenNguoiGui', 'Khoa Ngoại ngữ - ĐH Đồng Nai', 'Tên hiển thị khi gửi mail'],
      ['webUrl', '', 'Link web đăng ký (nút trong mail)'],
      ['matKhauMacDinh', 'chuyen1', 'Mật khẩu mặc định khi tạo tài khoản cho GV (GV tự đổi trong Cài đặt trên web; tối thiểu 6 ký tự)'],
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

  const gv = get(SH.GV);
  if (gv.getLastRow() < 1) {
    gv.getRange(1, 1, 1, 4).setValues([['Email', 'Họ tên', 'Tổ (1=SPA, 2=NNA, 3=Cơ bản)', 'Số ca đã gác trước khi dùng app (cộng dồn trong năm học)']]).setFontWeight('bold');
    gv.setFrozenRows(1);
  }
  gv.getRange('E1').setValue('Vai trò quản lý: x = toàn khoa, tt = tổ trưởng (xem tổ mình)').setFontWeight('bold');
  gv.getRange('C2:C500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['1', '2', '3'], true).build());
  gv.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).build());

  const dot = get(SH.DOT);
  if (dot.getLastRow() < 1) {
    dot.getRange(1, 1, 1, DOT_HEADERS.length).setValues([DOT_HEADERS]).setFontWeight('bold');
    dot.setFrozenRows(1); dot.setColumnWidths(1, DOT_HEADERS.length, 170);
    dot.getRange('E2:E100').setNumberFormat('dd/MM/yyyy HH:mm');
  }
  ss.toast('Đã tạo tab. Điền CauHinh và GiaoVien, rồi dùng "Tạo đợt thi mới".');
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
  o.matKhauMacDinh = String(o.matKhauMacDinh || 'chuyen1');
  o.ca = {};
  [1, 2, 3, 4].forEach((c) => (o.ca[c] = { start: hhmm(o[`ca${c}_batDau`]) || CA_DEFAULT[c][0], arrive: hhmm(o[`ca${c}_coMat`]) || CA_DEFAULT[c][1] }));
  return o;
}

// ---------------------------------------------------------------- Đợt thi
function readDots() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.DOT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
    .map((r, i) => ({ order: i + 1, ma: String(r[0]).trim(), ten: String(r[1]).trim(), hocKy: String(r[2] || r[1]).trim(), open: String(r[3]).toUpperCase() === 'TRUE', hanChot: r[4] instanceof Date ? r[4] : null }))
    .filter((d) => d.ma);
}
function getDot(ma) {
  const d = readDots().find((x) => x.ma === ma);
  if (!d) throw new Error(`Không thấy đợt "${ma}" trong tab Dot.`);
  return d;
}
const caSheet = (ma) => {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.CA + ma);
  if (!sh) throw new Error(`Không thấy tab ${TAB.CA}${ma}.`);
  return sh;
};
/** Đợt đang làm = đợt của tab đang mở (CaThi_x / DangKy_x / XuatMau_x); nếu chỉ có 1 đợt thì lấy luôn. */
function pickDot() {
  const m = SpreadsheetApp.getActiveSheet().getName().match(/^(?:CaThi_|DangKy_|XuatMau_)(.+)$/);
  const dots = readDots();
  if (m && dots.some((d) => d.ma === m[1])) return m[1];
  if (dots.length === 1) return dots[0].ma;
  throw new Error('Hãy mở tab của đợt thi cần làm (ví dụ CaThi_HK3-2526) rồi chạy lại menu.');
}

function createCaTab(ma) {
  const ss = SpreadsheetApp.getActive();
  const ca = ss.insertSheet(TAB.CA + ma);
  ca.getRange(1, 1, 1, CA_HEADERS.length).setValues([CA_HEADERS]).setFontWeight('bold');
  ca.setFrozenRows(1);
  const rule = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  ca.getRange('B2:B2000').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build()).setNumberFormat('dd/MM/yyyy');
  ca.getRange('C2:E2000').setNumberFormat('@');
  ca.getRange('C2:C2000').setDataValidation(rule(['1', '2', '3', '4']));
  ca.getRange('D2:D2000').setDataValidation(rule(getCfg().khoaHopLe.split(',').map((s) => s.trim())));
  ca.getRange('E2:E2000').setDataValidation(rule(NGANH));
  ca.getRange('G2:I2000').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 20).build());
  ca.getRange('A:A').setFontColor('#888');
  ca.setColumnWidth(1, 190); ca.setColumnWidth(6, 220); ca.setColumnWidth(11, 260);
  return ca;
}

function menuNewDot() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Tạo đợt thi mới', 'Mã đợt (chữ không dấu, số, dấu gạch; ví dụ HK1-2627-GK):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const ma = a.getResponseText().trim();
  if (!/^[A-Za-z0-9-]{2,30}$/.test(ma)) return ui.alert('Mã đợt chỉ gồm chữ không dấu, số và dấu "-", dài 2–30 ký tự.');
  if (readDots().some((d) => d.ma === ma) || SpreadsheetApp.getActive().getSheetByName(TAB.CA + ma)) return ui.alert('Mã đợt này đã tồn tại.');
  const b = ui.prompt('Tên đợt thi', 'Tên in trên mẫu (ví dụ: HỌC KỲ 1 hoặc GIỮA KỲ HỌC KỲ 1):', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const ten = b.getResponseText().trim() || ma;
  const dot = SpreadsheetApp.getActive().getSheetByName(SH.DOT);
  dot.appendRow([ma, ten, ten.toUpperCase(), 'TRUE', '', '']);
  SpreadsheetApp.setActiveSheet(createCaTab(ma));
  ui.alert(`Đã tạo đợt "${ma}". Điền Hạn chót ở tab Dot, rồi dùng "Thêm ca nhanh" ở tab ${TAB.CA}${ma}.`);
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
const slotId = (ma, iso, ca, khoa, nganh) => `${ma}-${iso.replace(/-/g, '')}-c${ca}-k${khoa}-${nganh}`;
const startDate = (cfg, iso, ca) => new Date(`${iso}T${cfg.ca[ca].start}:00+07:00`);
const arriveDate = (cfg, iso, ca) => new Date(`${iso}T${cfg.ca[ca].arrive}:00+07:00`);
const hhmmVN = (s) => s.replace(':', 'h');

// ---------------------------------------------------------------- Đọc & kiểm tra CaThi_<mã>
function readSlots(ma) {
  const cfg = getCfg();
  const khoaOK = cfg.khoaHopLe.split(',').map((s) => s.trim());
  const sh = caSheet(ma);
  const last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, 10).getValues() : [];
  const slots = [], errors = [], seen = {};
  rows.forEach((r, i) => {
    if (r.slice(1, 9).every((c) => c === '' || c === null)) return; // dòng trống
    const rowNo = i + 2, errs = [];
    const iso = toIso(r[1]), ca = Number(r[2]), khoa = String(r[3]).trim(), nganh = String(r[4]).trim().toUpperCase();
    const need = [r[6], r[7], r[8]].map((x) => (x === '' ? 0 : Number(x)));
    if (!iso) errs.push('Ngày sai');
    if (![1, 2, 3, 4].includes(ca)) errs.push('Ca phải 1-4');
    if (!khoaOK.includes(khoa)) errs.push('Khoá không hợp lệ');
    if (!NGANH.includes(nganh)) errs.push('Ngành phải SPA/NNA');
    if (need.some((x) => !Number.isInteger(x) || x < 0)) errs.push('Số GV cần phải là số nguyên ≥ 0');
    else if (need.every((x) => x === 0)) errs.push('Chưa nhập số GV cần');
    let id = null;
    if (!errs.length) {
      id = slotId(ma, iso, ca, khoa, nganh);
      if (seen[id]) errs.push(`Trùng dòng ${seen[id]}`); else seen[id] = rowNo;
    }
    if (errs.length) errors.push({ row: rowNo, msg: errs.join('; ') });
    else slots.push({ row: rowNo, id, date: iso, ca, khoa: Number(khoa), nganh, mon: String(r[5] || '').trim(), need: { t1: need[0], t2: need[1], t3: need[2] }, note: String(r[9] || '').trim() });
  });
  return { slots, errors };
}

function checkAndMark(ma) {
  const sh = caSheet(ma);
  const { slots, errors } = readSlots(ma);
  const last = Math.max(sh.getLastRow(), 2);
  sh.getRange(2, 1, last - 1, 11).setBackground(null);
  sh.getRange(2, 11, last - 1, 1).clearContent();
  const byRow = {}; slots.forEach((s) => (byRow[s.row] = s.id));
  sh.getRange(2, 1, last - 1, 1).setValues(Array.from({ length: last - 1 }, (_, i) => [byRow[i + 2] || '']));
  errors.forEach((e) => {
    sh.getRange(e.row, 1, 1, 11).setBackground('#fde2e1');
    sh.getRange(e.row, 11).setValue(e.msg);
  });
  return { slots, errors };
}

function menuCheck() {
  const { slots, errors } = checkAndMark(pickDot());
  const ui = SpreadsheetApp.getUi();
  if (errors.length) ui.alert(`Có ${errors.length} dòng lỗi (tô đỏ, xem cột K):\n\n` + errors.slice(0, 15).map((e) => `Dòng ${e.row}: ${e.msg}`).join('\n'));
  else ui.alert(`Hợp lệ: ${slots.length} ca.`);
}

// ---------------------------------------------------------------- Nhập nhanh
function showQuickAdd() {
  const ma = pickDot();
  const html = HtmlService.createHtmlOutput(quickAddHtml(ma, getCfg().khoaHopLe.split(',').map((x) => x.trim())))
    .setWidth(520).setHeight(660);
  SpreadsheetApp.getUi().showModalDialog(html, `Thêm ca nhanh – đợt ${ma}`);
}

/** Nội dung hộp thoại "Thêm ca nhanh" – nhúng sẵn trong Code.gs nên không cần tạo file HTML riêng. */
function quickAddHtml(ma, khoas) {
  const khoaHtml = khoas.map((k) => `<label><input type="checkbox" name="khoa" value="${esc(k)}"> Khoá ${esc(k)}</label>`).join('');
  return `<!doctype html>
<html><head><base target="_top">
<style>
  body{font:14px system-ui,sans-serif;margin:14px;color:#1c2430}
  label.f{display:block;font-weight:600;margin:12px 0 4px}
  textarea,input[type=text],input[type=number]{width:100%;box-sizing:border-box;padding:6px;font:inherit}
  .row{display:flex;gap:14px;flex-wrap:wrap}
  .row label{font-weight:400}
  .need{display:flex;gap:8px}.need div{flex:1}
  small{color:#667085}
  button{padding:8px 14px;font:inherit;margin-right:6px;cursor:pointer}
  #go{background:#1d5fd6;color:#fff;border:0;border-radius:6px}
  #msg{margin-top:12px;padding:8px;border-radius:6px;display:none}
  .ok{background:#e7f6ef;color:#12805c}.err{background:#fde2e1;color:#b42318}
</style></head>
<body>
<label class="f">Ngày <small>(mỗi dòng/dấu phẩy một mục; hỗ trợ khoảng)</small></label>
<textarea id="dates" rows="3" placeholder="24/07/2026&#10;27/07/2026-31/07/2026"></textarea>
<label><input type="checkbox" id="skipSun" checked> Bỏ Chủ nhật</label>

<label class="f">Ca <small>(1: 7:30 · 2: 9:00 · 3: 13:30 · 4: 15:00)</small></label>
<div class="row">
  <label><input type="checkbox" name="ca" value="1"> Ca 1</label>
  <label><input type="checkbox" name="ca" value="2"> Ca 2</label>
  <label><input type="checkbox" name="ca" value="3"> Ca 3</label>
  <label><input type="checkbox" name="ca" value="4"> Ca 4</label>
</div>

<label class="f">Khoá</label>
<div class="row">${khoaHtml}</div>

<label class="f">Ngành</label>
<div class="row">
  <label><input type="checkbox" name="nganh" value="SPA"> SPA</label>
  <label><input type="checkbox" name="nganh" value="NNA"> NNA</label>
</div>

<label class="f">Môn thi <small>(tuỳ chọn, sửa riêng từng dòng sau)</small></label>
<input type="text" id="mon">

<label class="f">Số GV cần mỗi ca</label>
<div class="need">
  <div>Chuyên 1 (SPA)<input type="number" id="t1" min="0" value="1"></div>
  <div>Chuyên 2 (NNA)<input type="number" id="t2" min="0" value="1"></div>
  <div>Cơ bản<input type="number" id="t3" min="0" value="0"></div>
</div>

<p><button id="prev">Xem trước</button><button id="go">Thêm vào CaThi</button></p>
<div id="msg"></div>

<script>
var MA = ${JSON.stringify(ma)};
function vals(n) { return [].slice.call(document.querySelectorAll('input[name=' + n + ']:checked')).map(function (e) { return e.value; }); }
function form(dry) {
  return { ma: MA, dates: document.getElementById('dates').value, skipSun: document.getElementById('skipSun').checked,
    cas: vals('ca'), khoas: vals('khoa'), nganhs: vals('nganh'), mon: document.getElementById('mon').value,
    t1: document.getElementById('t1').value, t2: document.getElementById('t2').value, t3: document.getElementById('t3').value, dryRun: dry };
}
function say(t, ok) { var m = document.getElementById('msg'); m.style.display = 'block'; m.className = ok ? 'ok' : 'err'; m.textContent = t; }
function run(dry) {
  google.script.run
    .withSuccessHandler(function (r) {
      say((dry ? 'Sẽ thêm ' : 'Đã thêm ') + r.added + ' ca mới (bỏ qua ' + r.duplicates + ' ca đã có).' + (dry ? '' : ' Có thể thêm đợt tiếp theo.'), true);
    })
    .withFailureHandler(function (e) { say(String(e.message).replace(/^Error: /, ''), false); })
    .quickAdd(form(dry));
}
document.getElementById('prev').onclick = function () { run(true); };
document.getElementById('go').onclick = function () { run(false); };
</script>
</body></html>`;
}

function parseDates(text) {
  const out = [], bad = [];
  String(text).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
    let m = tok.match(/^(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const y2 = +m[6], mo2 = +m[5], d2 = +m[4];
      const d1 = +m[1], mo1 = m[2] ? +m[2] : mo2, y1 = m[3] ? +m[3] : y2;
      for (let d = new Date(y1, mo1 - 1, d1), end = new Date(y2, mo2 - 1, d2); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
      return;
    }
    m = tok.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) out.push(new Date(+m[3], +m[2] - 1, +m[1])); else bad.push(tok);
  });
  return { dates: out, bad };
}

/** f: {ma, dates, skipSun, cas[], khoas[], nganhs[], mon, t1,t2,t3, dryRun} */
function quickAdd(f) {
  const { dates, bad } = parseDates(f.dates);
  if (bad.length) throw new Error('Không hiểu ngày: ' + bad.join(', ') + '\nDạng đúng: 27/07/2026 hoặc 27/07/2026-31/07/2026 (phân tách bằng dấu phẩy hoặc xuống dòng).');
  const days = dates.filter((d) => !(f.skipSun && d.getDay() === 0));
  if (!days.length || !f.cas.length || !f.khoas.length || !f.nganhs.length) throw new Error('Chọn ít nhất 1 ngày, 1 ca, 1 khoá, 1 ngành.');
  const need = [f.t1, f.t2, f.t3].map((x) => Number(x || 0));
  if (need.every((x) => x === 0)) throw new Error('Nhập số GV cần cho ít nhất 1 tổ.');

  const sh = caSheet(f.ma);
  const existing = new Set(readSlots(f.ma).slots.map((s) => s.id));
  const rows = [];
  let dup = 0;
  days.forEach((d) => f.cas.forEach((ca) => f.khoas.forEach((k) => f.nganhs.forEach((ng) => {
    const id = slotId(f.ma, toIso(d), +ca, k, ng);
    if (existing.has(id)) { dup++; return; }
    existing.add(id);
    rows.push([id, d, String(ca), String(k), ng, f.mon || '', need[0], need[1], need[2], '', '']);
  }))));
  if (!f.dryRun && rows.length) {
    const start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 3, rows.length, 3).setNumberFormat('@');
    sh.getRange(start, 2, rows.length, 1).setNumberFormat('dd/MM/yyyy');
    sh.getRange(start, 1, rows.length, 11).setValues(rows);
  }
  return { added: rows.length, duplicates: dup };
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
function fsList(col) {
  const out = []; let token = '';
  do {
    const r = fsFetch(`${fsBase()}/${col}?pageSize=300${token ? '&pageToken=' + token : ''}`);
    (r.documents || []).forEach((d) => out.push(Object.assign({ _id: d.name.split('/').pop() }, fromFields(d.fields || {}))));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}

// ---------------------------------------------------------------- Giáo viên
function readTeachers() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.GV);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => ({ email: String(r[0]).trim().toLowerCase(), name: String(r[1]).trim(), to: Number(r[2]), prior: Number(r[3] || 0), admin: /^(x|admin|true|1)$/i.test(String(r[4]).trim()), lead: /^(tt|tổ trưởng|to truong)$/i.test(String(r[4]).trim()) }));
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
  const out = { created: 0, existing: 0, failed: [] };
  teachers.filter((t) => !done.has(t.email)).forEach((t) => {
    const r = idtFetch('accounts:signUp', { email: t.email, password: cfg.matKhauMacDinh, emailVerified: true, displayName: t.name, targetProjectId: pid });
    if (r.code < 300) { out.created++; done.add(t.email); return; }
    const msg = (r.json.error && r.json.error.message) || String(r.code);
    if (msg.indexOf('EMAIL_EXISTS') === 0) {
      // Đã có tài khoản. Nếu chưa xác thực email (có thể do người lạ đăng ký trước) thì xác thực lại và đặt về mật khẩu mặc định.
      const l = idtFetch(`projects/${pid}/accounts:lookup`, { email: [t.email] });
      const u = l.json.users && l.json.users[0];
      if (u && !u.emailVerified) {
        const up = idtFetch(`projects/${pid}/accounts:update`, { localId: u.localId, emailVerified: true, password: cfg.matKhauMacDinh });
        if (up.code >= 300) { out.failed.push(`${t.email}: không xác thực được (${up.code})`); return; }
      }
      out.existing++; done.add(t.email);
    } else out.failed.push(`${t.email}: ${msg}`);
  });
  props.setProperty('acctDone', JSON.stringify(Array.from(done)));
  return out;
}
function menuAccounts() {
  const r = ensureAccounts(readTeachers());
  SpreadsheetApp.getUi().alert(`Tài khoản: tạo mới ${r.created}, đã có ${r.existing}` + (r.failed.length ? `\n\nLỗi:\n${r.failed.slice(0, 10).join('\n')}` : ''));
}

// ---------------------------------------------------------------- Đồng bộ lên
function syncUp(ma) {
  const cfg = getCfg(), dot = getDot(ma);
  const { slots, errors } = checkAndMark(ma);
  if (errors.length) throw new Error(`Còn ${errors.length} dòng lỗi ở tab ${TAB.CA}${ma}. Sửa rồi đồng bộ lại.`);
  const teachers = readTeachers();
  const badT = teachers.filter((t) => !/^[^@\s]+@[^@\s]+$/.test(t.email) || ![1, 2, 3].includes(t.to) || !t.name);
  if (badT.length) throw new Error('GV thiếu tên / sai email / sai tổ: ' + badT.map((t) => t.email || t.name).join(', '));

  const writes = [];
  slots.forEach((s) => writes.push({
    path: 'slots/' + s.id,
    data: { dotId: ma, namHoc: cfg.namHoc, date: s.date, ca: s.ca, khoa: s.khoa, nganh: s.nganh, mon: s.mon, need: s.need, note: s.note, active: true, start: startDate(cfg, s.date, s.ca) },
  }));
  // Ca đã bị xoá khỏi sheet → ẩn đi (không xoá để giữ lịch sử đăng ký)
  const keep = new Set(slots.map((s) => s.id));
  fsList('slots').filter((d) => d.dotId === ma && d.active !== false && !keep.has(d._id))
    .forEach((d) => writes.push({ path: 'slots/' + d._id, data: { active: false } }));
  teachers.forEach((t) => writes.push({ path: 'teachers/' + t.email, data: { name: t.name, to: t.to, prior: t.prior, admin: t.admin, lead: t.lead } }));
  // Danh sách công khai cho GV (để vẽ các hàng của bảng): chỉ tên, tổ, thứ tự; số ca cũ (prior) giữ riêng trong teachers
  teachers.forEach((t, i) => writes.push({ path: 'roster/' + t.email, data: { name: t.name, to: t.to, order: i + 1 } }));
  const far = new Date(Date.now() + 365 * 86400000);
  writes.push({ path: 'dots/' + ma, data: { name: dot.ten, hocKy: dot.hocKy, open: dot.open, deadline: dot.hanChot || far, namHoc: cfg.namHoc, order: dot.order } });
  const caTimes = {}; [1, 2, 3, 4].forEach((c) => (caTimes[c] = cfg.ca[c]));
  writes.push({ path: 'config/main', data: { namHoc: cfg.namHoc, minCa: cfg.toiThieu, khoaNam1: Number(cfg.khoaNam1 || 0), caTimes } });
  fsCommit(writes);
  let acct;
  try { acct = ensureAccounts(teachers); } catch (e) { acct = { created: 0, existing: 0, failed: [String(e.message || e)] }; }
  return { slots: slots.length, teachers: teachers.length, acct };
}
function menuSyncUp() {
  const r = syncUp(pickDot());
  const a = r.acct;
  SpreadsheetApp.getUi().alert(`Đã đồng bộ ${r.slots} ca và ${r.teachers} giảng viên lên Firebase.\nTài khoản đăng nhập: tạo mới ${a.created}, đã có ${a.existing}.` +
    (a.failed.length ? `\n\nLỖI tạo tài khoản (dữ liệu ca vẫn đã đồng bộ):\n${a.failed.slice(0, 8).join('\n')}` : ''));
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
  const { slots, errors } = readSlots(ma);
  if (errors.length) throw new Error('Tab CaThi còn dòng lỗi.');
  if (!slots.length) throw new Error('Chưa có ca nào.');
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
    grid[7][c] = isoToVN(s.date); grid[8][c] = s.ca; grid[9][c] = `K${s.khoa} - ${s.nganh}`;
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

// ---------------------------------------------------------------- Mail nhắc
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Dựng nội dung mail (thuần hàm, không gọi dịch vụ Google => xem thử được ngoài Apps Script).
 * items: [{ s: slot, arrive: 'HH:mm', start: 'HH:mm' }] đã sắp xếp theo ngày/ca
 * stat : { total, min }  số ca đã đăng ký trong năm học / mức tối thiểu
 */
function buildReminder(cfg, name, items, stat) {
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
          <div style="font-size:17px;color:#18202c"><b>Ca ${s.ca}</b> · Khoá ${s.khoa} – ${esc(s.nganh)}${s.mon ? ' · ' + esc(s.mon) : ''}</div>
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
      <p style="font-size:15px;line-height:1.5;margin:0;color:#556070">Cần đổi ca? Huỷ ca trên trang đăng ký (nếu còn hạn) hoặc liên hệ thư ký khoa. Thư này gửi tự động, vui lòng không trả lời.</p>
    </td></tr>
  </table>
  <div style="font-size:13px;color:#7a8596;padding:12px 0">${esc(cfg.tenNguoiGui)}</div>
</td></tr></table></body></html>`;

  const text = `Chào thầy/cô ${name},\n\nNhắc lịch coi thi (${cfg.coSo}):\n\n` +
    items.map(({ s, arrive, start }) => `- ${dateLongVN(s.date)}: Ca ${s.ca}, BẮT ĐẦU ${start} (có mặt tại HĐ thi lúc ${arrive}), Khoá ${s.khoa} ${s.nganh}${s.mon ? ', ' + s.mon : ''}`).join('\n') +
    `\n\n${progress.replace(/<\/?b>/g, '')}\n\n${cfg.tenNguoiGui}`;
  return { subject, html, text };
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'sendReminders').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Đã cài: kiểm tra mỗi giờ và gửi mail nhắc.');
}

/** Chạy mỗi giờ: ca nào còn ≤ N giờ nữa tới giờ CÓ MẶT (và chưa nhắc) → gửi mail, gộp các ca của cùng 1 GV vào 1 thư. */
function sendReminders() {
  const cfg = getCfg();
  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(SH.LOG) || ss.insertSheet(SH.LOG);
  if (log.getLastRow() < 1) log.appendRow(['Khoá', 'Gửi lúc', 'Email']);
  const sent = new Set(log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().map((r) => r[0]) : []);
  const now = Date.now(), limit = cfg.nhacTruocGio * 3600000;

  const allRegs = fsList('regs').filter((r) => r.namHoc === cfg.namHoc);
  const yearCount = {}; allRegs.forEach((r) => (yearCount[r.email] = (yearCount[r.email] || 0) + 1));
  const prior = {}; readTeachers().forEach((t) => (prior[t.email] = t.prior));

  const slotMap = {};
  readDots().forEach((d) => { try { readSlots(d.ma).slots.forEach((s) => (slotMap[s.id] = s)); } catch (e) { /* đợt chưa có tab */ } });

  const perUser = {};
  allRegs.forEach((r) => {
    const s = slotMap[r.slotId]; if (!s) return;
    const left = arriveDate(cfg, s.date, s.ca).getTime() - now;
    if (left <= 0 || left > limit || sent.has(r.slotId + '|' + r.email)) return;
    (perUser[r.email] = perUser[r.email] || { name: r.name, items: [] }).items.push({ s, key: r.slotId + '|' + r.email, arrive: cfg.ca[s.ca].arrive, start: cfg.ca[s.ca].start });
  });

  Object.keys(perUser).forEach((email) => {
    const u = perUser[email];
    u.items.sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.ca - b.s.ca);
    const mail = buildReminder(cfg, u.name, u.items, { total: (prior[email] || 0) + (yearCount[email] || 0), min: cfg.toiThieu });
    MailApp.sendEmail({ to: email, subject: mail.subject, body: mail.text, htmlBody: mail.html, name: cfg.tenNguoiGui });
    u.items.forEach((i) => log.appendRow([i.key, new Date(), email]));
  });
}

/** Gửi mail mẫu (dữ liệu giả từ 2 ca đầu của đợt đang mở) về chính email của admin để xem thử. */
function menuTestMail() {
  const ma = pickDot(), cfg = getCfg();
  const slots = readSlots(ma).slots.sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca).slice(0, 2);
  if (!slots.length) throw new Error('Đợt này chưa có ca nào.');
  const items = slots.map((s) => ({ s, arrive: cfg.ca[s.ca].arrive, start: cfg.ca[s.ca].start }));
  const mail = buildReminder(cfg, 'Nguyễn Văn A (thư thử)', items, { total: 14, min: cfg.toiThieu });
  const to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to, subject: '[THỬ] ' + mail.subject, body: mail.text, htmlBody: mail.html, name: cfg.tenNguoiGui });
  SpreadsheetApp.getUi().alert('Đã gửi mail thử tới ' + to);
}

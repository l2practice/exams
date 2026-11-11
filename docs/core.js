// Dùng chung cho mọi màn hình: khởi tạo Firebase, trạng thái, hằng số, hàm tiện ích.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { icon } from "./icons.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ---- Hằng số ----
export const TO_LABEL = { 1: "Chuyên 1 (SPA)", 2: "Chuyên 2 (NNA)", 3: "Cơ bản" };
export const TO_SHORT = { 1: "SPA", 2: "NNA", 3: "Cơ bản" };
export const NGANH = ["SPA", "NNA"];
export const DEFAULT_CA = { 1: { start: "07:30", arrive: "07:15" }, 2: { start: "09:00", arrive: "08:45" }, 3: { start: "13:30", arrive: "13:15" }, 4: { start: "15:00", arrive: "14:45" } };

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Trạng thái toàn app ----
export const S = {
  user: null, me: null, cfg: null,
  dots: [], slotsBy: {}, regsBy: {}, roster: [], teachersAll: [], myYear: [],
  regView: "list",                              // trang Đăng ký: "list" danh sách | "matrix" bảng theo đợt | "grid" bảng giảng viên
  pick: null,                                   // ca đang chọn để xem trước
  mineView: "table", weekStart: null,           // trang Ca của tôi: "table" | "list" | "week" (lịch tuần) và ngày thứ Hai của tuần đang xem
  route: "me:overview",                        // trang đang mở (mục trên thanh bên trái)
  fDot: "all", fKhoa: "all", fNganh: "all", gvFilter: "all", openGv: null,
  unsub: [], unsubDots: {},
  render: () => {},                            // app.js gán hàm vẽ lại
};

// ---- Vai trò (do admin đặt ở cột E của tab GiaoVien) ----
export const manageTos = () => (S.me?.admin ? [1, 2, 3] : S.me?.leadTo ? [S.me.leadTo] : []);
export const isManager = () => manageTos().length > 0;

// ---- Đợt thi ----
export const statusOf = (d) => d?.status || (d?.open ? "MO" : "DONG");
export const isRegOpen = (d) => statusOf(d) === "MO" && (!d.deadline || d.deadline.toMillis() > Date.now());
export const canEditCa = (d) => ["SOAN", "MO"].includes(statusOf(d));
export const STATUS_LABEL = { SOAN: "Đang soạn lịch", MO: "Đang mở đăng ký", DONG: "Đã đóng" };

// ---- Ca thi ----
export const needOf = (s, t) => s.need?.["t" + t] || 0;
export const totalNeed = (s) => needOf(s, 1) + needOf(s, 2) + needOf(s, 3);
export const totalTaken = (regs, slotId) => (regs || []).filter((r) => r.slotId === slotId).length;
// Ca thi của khoa khác: vẫn có khoá (trùng khoá của khoa mình), nganh="KHAC<SLUG>" (để mã ca khác nhau giữa các khoa), donVi = tên khoa hiển thị
export const isOther = (s) => !!s && String(s.nganh || "").startsWith("KHAC");
export const otherCode = (name) => "KHAC" + String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
/** "K12 · SPA" hoặc "K14 · Khoa Kinh tế" */
export const slotWho = (s) => (!s ? "" : isOther(s) ? `K${s.khoa} · ${s.donVi || "—"}` : `K${s.khoa} · ${s.nganh}`);
export const slotId = (dot, iso, ca, khoa, nganh) => `${dot}-${iso.replace(/-/g, "")}-c${ca}-k${khoa}-${nganh}`;
export const visibleSlots = (dotId) => (S.slotsBy[dotId] || []).filter((s) => totalNeed(s) > 0);
export const findSlot = (id) => Object.values(S.slotsBy).flat().find((s) => s.id === id);
export const caInfo = (ca) => S.cfg?.caTimes?.[ca] || DEFAULT_CA[ca] || { start: "", arrive: "" };
export const khoaNam = (k) => (S.cfg?.khoaNam1 ? S.cfg.khoaNam1 - k + 1 : null);
export const khoaList = () => (S.cfg?.khoaHopLe?.length ? S.cfg.khoaHopLe : [13, 14, 15, 16]);

// ---- Ngày giờ ----
const DOW = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const dowOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()]; };
export const dmOf = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };
export const dmyOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d}/${m}/${y}`; };
export const fmtLong = (iso) => `${dowOf(iso)} ngày ${dmyOf(iso)}`;
const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());

/** "24/07/2026, 27/07/2026-31/07/2026" → danh sách ngày (Date). Trả thêm danh sách mục không hiểu. */
export function parseDates(text) {
  const dates = [], bad = [];
  for (const tok of String(text).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    let m = tok.match(/^(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const y2 = +m[6], mo2 = +m[5], d2 = +m[4], d1 = +m[1], mo1 = m[2] ? +m[2] : mo2, y1 = m[3] ? +m[3] : y2;
      const end = new Date(y2, mo2 - 1, d2);
      let ok = end.getDate() === d2;
      for (let d = new Date(y1, mo1 - 1, d1); d <= end && ok; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
      if (!ok || new Date(y1, mo1 - 1, d1).getDate() !== d1) bad.push(tok);
      continue;
    }
    m = tok.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const d = m && new Date(+m[3], +m[2] - 1, +m[1]);
    if (d && d.getDate() === +m[1]) dates.push(d); else bad.push(tok);
  }
  return { dates, bad };
}

export function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 4500);
}

export const chipsHtml = (items, cur, attr) =>
  items.map(([v, l]) => `<button class="chip ${String(v) === String(cur) ? "on" : ""}" data-${attr}="${esc(v)}">${esc(l)}</button>`).join("");

/**
 * Hộp thoại xác nhận (thay cho confirm() mặc định của trình duyệt): chữ lớn, nút to, hiện rõ từng thông tin.
 * rows = [[nhãn, giá trị]]. Trả Promise<boolean>. Esc hoặc bấm nền = không đồng ý.
 */
export function ask({ title, rows = [], text = "", warn = "", ok = "Đồng ý", cancel = "Không", danger = false, ic = "tasks", confirmText = "" }) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "aw-od-bg";
    bg.innerHTML = `<div class="aw-od" role="dialog" aria-modal="true" aria-labelledby="askT">
      <div class="aw-od-ic ${danger ? "danger" : ""}">${icon(ic)}</div>
      <h2 id="askT">${esc(title)}</h2>
      ${text ? `<p class="aw-od-sub">${esc(text)}</p>` : ""}
      ${rows.length ? `<dl class="aw-od-rows">${rows.filter((r) => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${warn ? `<div class="aw-od-warn"><b>⚠ Lưu ý</b><br>${esc(warn)}</div>` : ""}
      ${confirmText ? `<label for="askType" class="aw-od-type">Gõ <b>${esc(confirmText)}</b> để xác nhận</label><input id="askType" class="field" autocomplete="off" autocapitalize="off" spellcheck="false">` : ""}
      <div class="aw-od-foot"><button type="button" id="askNo">${esc(cancel)}</button><button type="button" id="askOk" class="${danger ? "danger" : "primary"}">${esc(ok)}</button></div>
    </div>`;
    document.body.appendChild(bg);
    const done = (v) => { document.removeEventListener("keydown", onKey); bg.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    document.addEventListener("keydown", onKey);
    bg.onclick = (e) => { if (e.target === bg) done(false); };
    bg.querySelector("#askNo").onclick = () => done(false);
    bg.querySelector("#askOk").onclick = () => done(true);
    const okBtn = bg.querySelector("#askOk"), typed = bg.querySelector("#askType");
    if (typed) { okBtn.disabled = true; typed.oninput = () => (okBtn.disabled = typed.value.trim() !== confirmText); typed.focus(); } else okBtn.focus();
  });
}

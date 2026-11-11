// Trang của tổ trưởng: Thống kê giảng viên trong tổ + Thêm ca thi mới.
// Tổ trưởng (tt1/tt2/tt3) chỉ thấy và chỉ sửa được phần của tổ mình; quản trị (x) thấy cả 3 tổ. Luật Firestore cũng ép như vậy.
import { doc, writeBatch, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { scriptUrl } from "./firebase-config.js";
import { icon } from "./icons.js";
import {
  auth, db, S, $, esc, toast, ask, NGANH, TO_LABEL, TO_SHORT, caInfo, dowOf, dmOf, fmtLong, todayIso, isoOf, parseDates, manageTos,
  statusOf, canEditCa, STATUS_LABEL, needOf, slotId, slotWho, isOther, otherCode, visibleSlots, findSlot, khoaList, khoaNam,
} from "./core.js";

const dmy = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
function sampleDates() { const a = new Date(); a.setDate(a.getDate() + 14); const b = new Date(a); b.setDate(b.getDate() + 4); return `${dmy(a)}\n${dmy(a)}-${dmy(b)}`; }
const dotName = (id) => S.dots.find((d) => d.id === id)?.name || "";
const scopeLabel = () => (S.me.admin ? "Toàn khoa (cả 3 tổ)" : `Tổ ${TO_LABEL[S.me.leadTo]}`);

// =====================================================================  1. Thống kê giảng viên
function peopleStats() {
  const min = S.cfg.minCa || 20, tos = manageTos(), today = todayIso();
  const by = {};
  S.dots.flatMap((d) => S.regsBy[d.id] || []).forEach((r) => (by[r.email] ||= []).push(r));
  return S.teachersAll.filter((t) => tos.includes(t.to)).map((t) => {
    const list = [...(by[t.email] || [])].sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
    const prior = Number(t.prior || 0), total = prior + list.length, past = list.filter((r) => r.date < today).length;
    return { email: t.email, name: t.name, to: t.to, prior, list, total, done: prior + past, upcoming: list.length - past, short: Math.max(0, min - total) };
  }).sort((a, b) => b.short - a.short || a.name.localeCompare(b.name, "vi"));
}

function detailHtml(p, cols) {
  const today = todayIso();
  const rows = p.list.map((r) => {
    const s = findSlot(r.slotId), ci = caInfo(r.ca);
    return `<tr><td>${esc(fmtLong(r.date))}</td><td>Ca ${r.ca} · ${ci.start} <span class="small">(có mặt ${ci.arrive})</span></td><td>${s ? "K" + esc(s.khoa) : "—"}</td><td>${s ? esc(isOther(s) ? s.donVi : s.nganh) : "—"}</td>
      <td>${esc(s?.mon || "")}</td><td>${esc(dotName(r.dotId))}</td><td><span class="pill ${r.date < today ? "ok" : "warn"}">${r.date < today ? "Đã gác" : "Sắp tới"}</span></td></tr>`;
  }).join("");
  return `<tr class="gv-detail"><td colspan="${cols}"><div class="detail">
    <div class="small">${p.prior} ca đã gác trước khi dùng app (chỉ có số lượng, không có chi tiết)</div>
    <table class="list"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá</th><th>Ngành</th><th>Môn</th><th>Đợt</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="muted">Chưa đăng ký ca nào trên app.</td></tr>`}</tbody></table></div></td></tr>`;
}

function missingHtml() {
  const tos = manageTos(), rows = [];
  for (const d of S.dots) {
    if (statusOf(d) === "DONG") continue;
    const regs = S.regsBy[d.id] || [];
    for (const s of visibleSlots(d.id)) {
      const miss = [];
      for (const t of tos) {
        const n = needOf(s, t); if (!n) continue;
        const c = regs.filter((r) => r.slotId === s.id && r.to === t).length;
        if (c < n) miss.push(`${TO_SHORT[t]} thiếu ${n - c}`);
      }
      if (miss.length) rows.push({ d, s, miss });
    }
  }
  rows.sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.ca - b.s.ca);
  const body = rows.map(({ d, s, miss }) => `<tr><td>${esc(d.name)}</td><td>${esc(dowOf(s.date))} ${dmOf(s.date)}</td><td>Ca ${s.ca} (${caInfo(s.ca).start})</td><td>${esc(slotWho(s))}</td><td>${miss.map(esc).join(", ")}</td></tr>`).join("");
  const mineN = rows.length, allN = S.dots.filter((d) => statusOf(d) !== "DONG").reduce((a, d) => a + visibleSlots(d.id).length, 0);
  return `<details class="card more"><summary><b>Ca còn thiếu người</b> <span class="small">(${mineN} ca của ${esc(scopeLabel())} · ${allN} ca đang mở toàn khoa)</span></summary>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Đợt</th><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Còn thiếu</th></tr></thead>
    <tbody>${body || `<tr><td colspan="5" class="okc">Mọi ca đều đủ người.</td></tr>`}</tbody></table></div></details>`;
}

const skeleton = () => `<div class="kpis4">${[1, 2, 3, 4].map(() => `<div class="kpi skel"><span class="kicon"></span><div><div class="kv">&nbsp;</div><div class="kl">&nbsp;</div></div></div>`).join("")}</div>
  <div class="card skel-rows" aria-busy="true" aria-live="polite"><p class="small">Đang tải danh sách giảng viên…</p>${[1, 2, 3, 4].map(() => `<div class="skel-row"></div>`).join("")}</div>`;

export function statsHtml() {
  if (!S.teachersLoaded || !S.dotsLoaded) return skeleton();
  const min = S.cfg.minCa || 20, all = peopleStats();
  const nShort = all.filter((p) => p.short > 0).length, nOk = all.length - nShort, sumDone = all.reduce((a, p) => a + p.total, 0);
  const shown = all.filter((p) => S.gvFilter === "all" || (S.gvFilter === "short" ? p.short > 0 : p.short === 0));
  const cols = S.me.admin ? 7 : 6;
  const rows = shown.map((p, i) => `
    <tr class="gv-row ${S.openGv === p.email ? "open" : ""}" data-gv="${esc(p.email)}">
      <td class="m-hide">${i + 1}</td>
      <td><button class="link">${S.openGv === p.email ? "▾" : "▸"} ${esc(p.name)}</button></td>
      ${S.me.admin ? `<td class="m-hide">${esc(TO_SHORT[p.to] || "")}</td>` : ""}
      <td><b>${p.total}</b> / ${min}</td><td class="m-hide">${p.done}</td><td class="m-hide">${p.upcoming}</td>
      <td>${p.short}</td>
      <td><span class="pill ${p.short ? "bad" : "ok"}">${p.short ? "Chưa đủ" : "Đủ"}</span></td></tr>
    ${S.openGv === p.email ? detailHtml(p, cols + 1) : ""}`).join("");
  const kpi = (cls, ic, v, l) => `<div class="kpi"><span class="kicon ${cls}">${icon(ic)}</span><div><div class="kv">${v}</div><div class="kl">${l}</div></div></div>`;
  return `<div class="kpis4">${kpi("violet", "users", all.length, "Giảng viên")}${kpi("green", "checkCircle", nOk, `Đủ ${min} ca`)}${kpi("orange", "hourglass", nShort, "Chưa đủ")}${kpi("blue", "calendarCheck", sumDone, "Tổng số ca đã gác")}</div>
    <div class="toolbar"><span class="grow"></span>
      <select class="sel" data-sel="gvf" aria-label="Trạng thái">${[["all", "Tất cả trạng thái"], ["short", "Chưa đủ"], ["ok", "Đã đủ"]].map(([v, l]) => `<option value="${v}" ${S.gvFilter === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="primary nowrap" id="btnCsv">${icon("list")} Tải CSV</button></div>
    <p class="small">Bấm vào tên giảng viên để xem chi tiết từng ca (ngày, giờ, khoá, ngành, môn).</p>
    <div class="tbl-wrap"><table class="list stats-tbl"><thead><tr><th class="m-hide">#</th><th>Giảng viên</th>${S.me.admin ? `<th class="m-hide">Tổ</th>` : ""}<th>Tổng ca</th><th class="m-hide">Đã gác</th><th class="m-hide">Sắp tới</th><th>Còn thiếu</th><th>Tình trạng</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols + 1}" class="muted">Không có giảng viên nào.</td></tr>`}</tbody></table></div>
    ${missingHtml()}`;
}

function downloadCsv() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Họ tên", "Email", "Tổ", "Số ca trước đó", "Số ca đăng ký", "Tổng", "Đã gác", "Sắp tới", "Còn thiếu"].map(q).join(",")]
    .concat(peopleStats().map((p) => [p.name, p.email, TO_LABEL[p.to] || p.to, p.prior, p.list.length, p.total, p.done, p.upcoming, p.short].map(q).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `thong-ke-gac-thi-${S.cfg.namHoc || ""}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}

// =====================================================================  2. Thêm ca thi mới
export function addHtml() {
  const dots = S.dots.filter(canEditCa).sort((a, b) => (b.order || 0) - (a.order || 0));
  const tos = manageTos();
  const createPeriod = `<div class="card">
      <h2>Tạo đợt thi</h2>
      <p class="small">Đợt mới thuộc năm học ${esc(S.cfg.namHoc || "")}, bắt đầu ở trạng thái soạn lịch.</p>
      <label for="newDotName">Tên đợt thi</label>
      <div class="create-dot-row"><input class="field" id="newDotName" maxlength="100" placeholder="Ví dụ: Thi học kỳ 1 năm học 2026–2027"><button type="button" class="primary" id="btnCreateDot">Tạo đợt</button></div>
      <div class="err" id="dotErr" role="alert"></div><div class="okmsg" id="dotMsg" role="status"></div>
    </div>`;
  if (!dots.length) return `<div id="addForm">${createPeriod}<div class="card center muted">Tạo đợt thi để bắt đầu nhập lịch.</div></div>`;
  return `<div id="addForm">
    ${createPeriod}
    <div class="card">
      <h2>Đợt thi và số giảng viên cần</h2>
      <p class="small">Bạn nhập số giảng viên cần của <b>${esc(scopeLabel())}</b>. Tổ khác tự nhập phần của họ cho cùng ca (cùng đợt, ngày, ca, khoá, ngành thì gộp vào một ca).</p>
      <label for="addDot">Đợt thi</label>
      <select class="sel field" id="addDot">${dots.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(STATUS_LABEL[statusOf(d)])})</option>`).join("")}</select>
      <label>Số giảng viên cần mỗi ca</label>
      <div class="row">${tos.map((t) => `<div class="need-in"><span>${esc(TO_LABEL[t])}</span><input class="field" id="addNeed${t}" type="number" min="0" max="20" value="1" inputmode="numeric"></div>`).join("")}</div>
      <p class="small">Mỗi ca cần ít nhất 1 giảng viên.</p>
    </div>

    <div class="seg" style="margin-bottom:14px"><button class="on" data-at="manual">Nhập tay</button><button data-at="scan"><span style="display:inline-grid;width:16px">${icon("sparkle")}</span> Quét AI</button></div>

    <div class="card" id="secManual">
      <h2>Nhập tay</h2>
      <label for="addDates">Ngày thi <span class="small">(cách nhau bằng dấu phẩy hoặc xuống dòng; có thể ghi khoảng)</span></label>
      <textarea class="field" id="addDates" rows="3" placeholder="${esc(sampleDates())}"></textarea>
      <label class="check"><input type="checkbox" id="addSkipSun" checked> Bỏ Chủ nhật</label>
      <label>Ca</label>
      <div class="row">${[1, 2, 3, 4].map((c) => `<label class="check"><input type="checkbox" name="addCa" value="${c}"> Ca ${c} (${caInfo(c).start})</label>`).join("")}</div>
      <div id="ownBox">
      <label>Khoá</label>
      <div class="row">${khoaList().map((k) => `<label class="check"><input type="checkbox" name="addKhoa" value="${k}"> Khoá ${k}${khoaNam(k) ? ` (năm ${khoaNam(k)})` : ""}</label>`).join("")}</div>
      <label>Ngành</label>
      <div class="row">${NGANH.map((n) => `<label class="check"><input type="checkbox" name="addNganh" value="${n}"> ${n}</label>`).join("")}<button type="button" class="chip-add" id="btnAddOther">+ Add others</button></div>
      <div id="otherBox" hidden>
        <label for="addDonVi">Tên khoa khác <span class="small">(chỉ dùng khi đi gác cho khoa khác: chọn Khoá ở trên, còn Ngành thì bỏ qua)</span></label>
        <input class="field" id="addDonVi" type="text" maxlength="60" placeholder="Ví dụ: Khoa Kinh tế">
      </div>
      </div>
      <label for="addMon">Môn thi <span class="small">(tuỳ chọn)</span></label>
      <input class="field" id="addMon" type="text">
      <div class="err" id="addErr" role="alert"></div>
      <div id="addMsg" class="okmsg"></div>
      <div class="two"><button type="button" id="btnAddPrev">Xem trước</button><button type="button" class="primary" id="btnAddGo">Thêm ca</button></div>
    </div>

    <div class="card scanbox" id="secScan" hidden>
      <h2><span class="ic-inline">${icon("sparkle")}</span> Quét lịch thi từ ảnh (AI)</h2>
      <p class="small">Chụp bảng lịch thi hoặc chọn ảnh có sẵn (kể cả ảnh chụp màn hình). AI điền sẵn ngày, ca, khoá, ngành, môn; <b>bạn kiểm tra và sửa</b> trước khi thêm. AI có thể đọc sai nên không có gì được lưu cho tới khi bạn bấm Thêm.</p>
      <div class="scanpick">
        <label class="filebtn" for="scanCam">${icon("camera")} Chụp bằng camera</label>
        <span class="or">hoặc</span>
        <label class="filebtn" for="scanFile">${icon("image")} Chọn ảnh từ máy</label>
      </div>
      <input type="file" id="scanCam" accept="image/*" capture="environment" hidden>
      <input type="file" id="scanFile" accept="image/*" hidden>
      <div class="err" id="scanErr" role="alert"></div>
      <div class="okmsg" id="scanMsg" role="status"></div>
      <div id="scanPreview"></div>
    </div>
  </div>`;
}

/** Trang "Danh sách ca thi": ca của tổ mình trong một đợt, sửa số lượng hoặc xoá. */
export function slotsHtml() {
  const dots = [...S.dots].sort((a, b) => (b.order || 0) - (a.order || 0));
  if (!dots.length) return `<div class="card center muted">Chưa có đợt thi nào.</div>`;
  return `<div id="slotsPage"><div class="toolbar"><label for="slotDot" style="margin:0">Đợt thi</label>
    <select class="sel" id="slotDot">${dots.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(STATUS_LABEL[statusOf(d)])})</option>`).join("")}</select></div>
    <div id="addList"></div></div>`;
}

const readNeed = () => { const n = {}; manageTos().forEach((t) => (n[t] = Number($("addNeed" + t).value || 0))); return n; };
const readForm = () => {
  const checked = (name) => [...document.querySelectorAll(`#addForm input[name=${name}]:checked`)].map((e) => e.value);
  return { dotId: $("addDot").value, dates: $("addDates").value, skipSun: $("addSkipSun").checked,
    cas: checked("addCa").map(Number), khoas: checked("addKhoa").map(Number), nganhs: checked("addNganh"), donVi: $("addDonVi").value.trim().replace(/\s+/g, " "), mon: $("addMon").value.trim(), need: readNeed() };
};

const takenOf = (dotId, id, t) => (S.regsBy[dotId] || []).filter((r) => r.slotId === id && r.to === t).length;

/** Từ danh sách ca {date,ca,khoa,nganh,mon} tính trước sẽ tạo mới / cập nhật những ca nào. Dùng chung cho nhập tay và quét ảnh. */
function planCombos(dotId, combos, need) {
  const tos = manageTos();
  if (tos.some((t) => !Number.isInteger(need[t]) || need[t] < 0 || need[t] > 20)) throw new Error("Số giảng viên cần phải là số nguyên từ 0 đến 20.");
  if (tos.every((t) => !(need[t] > 0))) throw new Error("Nhập số giảng viên cần (từ 1 trở lên) cho tổ của bạn.");
  const dot = S.dots.find((d) => d.id === dotId);
  if (!dot || !canEditCa(dot)) throw new Error("Đợt này không còn cho thêm ca.");
  const have = new Map((S.slotsBy[dotId] || []).map((s) => [s.id, s]));
  const creates = [], updates = [], seen = new Set();
  let same = 0, blocked = 0;
  for (const c of combos) {
    const id = slotId(dotId, c.date, c.ca, c.khoa, c.nganh);
    if (seen.has(id)) continue;                           // quét ảnh có thể ra trùng dòng
    seen.add(id);
    const ex = have.get(id);
    if (!ex) {
      const n = { t1: 0, t2: 0, t3: 0 };
      tos.forEach((t) => (n["t" + t] = need[t]));
      creates.push({ id, date: c.date, ca: c.ca, khoa: c.khoa, nganh: c.nganh, donVi: c.donVi || "", need: n, mon: c.mon || "" });
      continue;
    }
    const upd = {};
    for (const t of tos) {                               // ca đã có (do tổ khác tạo): chỉ cập nhật phần của tổ mình
      const v = need[t];
      if (!v || v === needOf(ex, t)) continue;
      if (v < takenOf(dotId, id, t)) { blocked++; continue; }
      upd["need.t" + t] = v;
    }
    if (c.mon && !ex.mon) upd.mon = c.mon;
    if (Object.keys(upd).length) updates.push({ id, upd }); else same++;
  }
  return { dot, creates, updates, same, blocked };
}

/** Nhập tay: ngày × ca × khoá × ngành. */
function plan(f) {
  const { dates, bad } = parseDates(f.dates);
  if (bad.length) throw new Error("Không hiểu ngày: " + bad.join(", ") + ". Dạng đúng: 27/07/2026 hoặc 27/07/2026-31/07/2026.");
  const days = dates.filter((d) => !(f.skipSun && d.getDay() === 0)).map(isoOf);
  const pastDays = days.filter((d) => d < todayIso());
  if (pastDays.length) throw new Error("Không thêm được ca vào ngày đã qua: " + pastDays.slice(0, 3).map((d) => fmtLong(d)).join("; ") + ". Hãy chọn ngày từ hôm nay trở đi.");
  const combos = [];
  if (f.donVi) {
    if (!days.length || !f.cas.length || !f.khoas.length) throw new Error("Chọn ít nhất 1 ngày, 1 ca và 1 khoá (khoá của sinh viên khoa đó thi).");
    for (const date of days) for (const ca of f.cas) for (const khoa of f.khoas) combos.push({ date, ca, khoa, nganh: otherCode(f.donVi), donVi: f.donVi, mon: f.mon });
    return planCombos(f.dotId, combos, f.need);
  }
  if (!days.length || !f.cas.length || !f.khoas.length || !f.nganhs.length) throw new Error("Chọn ít nhất 1 ngày, 1 ca, 1 khoá, 1 ngành.");
  for (const date of days) for (const ca of f.cas) for (const khoa of f.khoas) for (const nganh of f.nganhs) combos.push({ date, ca, khoa, nganh, mon: f.mon });
  return planCombos(f.dotId, combos, f.need);
}

const summary = (p) => `${p.creates.length} ca mới · ${p.updates.length} ca cập nhật · ${p.same} ca đã có sẵn, giữ nguyên` + (p.blocked ? ` · ${p.blocked} ca bỏ qua vì đã có nhiều người đăng ký hơn số mới` : "");

/** Ghi kế hoạch lên Firestore (chia lô ≤ 400). Trả true nếu xong. */
async function commit(p, dotId, errId, msgId) {
  const ops = [
    ...p.creates.map((c) => ({ id: c.id, set: { dotId, namHoc: p.dot.namHoc, date: c.date, ca: c.ca, khoa: c.khoa, nganh: c.nganh, ...(isOther(c) ? { donVi: c.donVi } : {}), mon: c.mon, note: "", need: c.need, active: true, createdBy: S.me.email, createdAt: serverTimestamp() } })),
    ...p.updates.map((u) => ({ id: u.id, upd: u.upd })),
  ];
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach((o) => (o.set ? b.set(doc(db, "slots", o.id), o.set) : b.update(doc(db, "slots", o.id), o.upd)));
      await b.commit();
    }
    $(msgId).textContent = "Đã lưu: " + summary(p);
    toast("Đã thêm ca thi.");
    return true;
  } catch (e) {
    $(errId).textContent = e.code === "permission-denied"
      ? "Không lưu được: đợt đã đóng, hoặc ca vừa được tổ khác tạo cùng lúc. Hãy thử lại."
      : "Lỗi mạng, thử lại. (" + (e.code || e.message) + ")";
    return false;
  }
}

async function runAdd(dry) {
  $("addErr").textContent = ""; $("addMsg").textContent = "";
  let f, p;
  try { f = readForm(); p = plan(f); } catch (e) { $("addErr").textContent = e.message; return; }
  if (dry) { $("addMsg").textContent = "Sẽ thực hiện: " + summary(p); return; }
  if (!p.creates.length && !p.updates.length) { $("addMsg").textContent = "Không có gì để thêm: " + summary(p); return; }
  await commit(p, f.dotId, "addErr", "addMsg");
}

// ---------------------------------------------------------------------  Quét lịch thi từ ảnh (AI)
let scanRows = [];                                           // các dòng AI đọc được; tổ trưởng sửa trực tiếp ở bản xem trước

const isoOk = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return !!m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDate() === +m[3]; };
const rowErr = (r) => ({ date: !isoOk(r.date), ca: ![1, 2, 3, 4].includes(Number(r.ca)), khoa: !khoaList().includes(Number(r.khoa)), nganh: !NGANH.includes(r.nganh) });
const rowOk = (r) => !Object.values(rowErr(r)).some(Boolean);

const SCAN_ERR = {
  auth: "Phiên đăng nhập không hợp lệ, hãy đăng nhập lại.",
  forbidden: "Chỉ tổ trưởng mới dùng được chức năng này.",
  no_key: "Chưa cài khoá Gemini. Quản trị viên dán GEMINI_API_KEY vào Apps Script → Project Settings → Script Properties.",
  limit: "Hôm nay bạn đã quét quá nhiều lần. Hãy nhập tay hoặc thử lại vào ngày mai.",
  bad_image: "Ảnh không hợp lệ hoặc quá lớn.",
  gemini: "AI đang bận hoặc gặp lỗi. Thử lại sau ít phút.",
  parse: "AI trả về kết quả không đọc được. Thử chụp rõ hơn.",
  no_url: "Chưa cấu hình địa chỉ Apps Script.",
};

/** Thu nhỏ ảnh (cạnh dài ≤ 1800px, JPEG) để gửi nhanh trên mạng điện thoại. */
async function compress(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("bad_image");
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  let q = 0.85, blob;
  do { blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q)); q -= 0.15; } while (blob && blob.size > 2.5 * 1024 * 1024 && q > 0.3);
  if (!blob) throw new Error("bad_image");
  const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { b64, mime: "image/jpeg" };
}

async function runScan(file) {
  $("scanErr").textContent = ""; $("scanMsg").textContent = "Đang xử lý ảnh…"; $("scanPreview").innerHTML = ""; scanRows = [];
  const dot = S.dots.find((d) => d.id === $("addDot").value);
  try {
    if (!scriptUrl) throw new Error("no_url");
    const { b64, mime } = await compress(file);
    $("scanMsg").textContent = "AI đang đọc lịch thi (có thể mất 10–30 giây)…";
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "scan", idToken, image: b64, mime, namHoc: dot?.namHoc || S.cfg.namHoc }) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "fail");
    scanRows = (j.rows || []).map((r) => ({ ...r, ca: r.ca || "", khoa: r.khoa || "", on: true }));
    scanRows.forEach((r) => (r.on = rowOk(r)));                        // dòng thiếu thông tin: mặc định bỏ tick, chờ sửa
    if (!scanRows.length) { $("scanMsg").textContent = ""; $("scanErr").textContent = "AI không tìm thấy ca thi nào trong ảnh. Hãy chụp rõ hơn (đủ sáng, không bị nghiêng) hoặc nhập tay."; return; }
    $("scanMsg").textContent = `AI đọc được ${scanRows.length} dòng. Ô màu đỏ là chỗ AI chưa chắc: hãy sửa, hoặc bỏ tick dòng không cần.`;
    renderScan();
  } catch (e) {
    $("scanMsg").textContent = "";
    $("scanErr").textContent = SCAN_ERR[e.message] || "Không quét được lúc này. Kiểm tra mạng rồi thử lại, hoặc nhập tay.";
  }
}

function renderScan() {
  const sel = (i, f, opts, cur) => `<select data-scan="${i}" data-f="${f}"><option value="">?</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const rows = scanRows.map((r, i) => {
    const e = rowErr(r);
    return `<tr data-row="${i}" class="${r.on ? "" : "off"}">
      <td><input type="checkbox" data-scan="${i}" data-f="on" ${r.on ? "checked" : ""} aria-label="Thêm dòng ${i + 1}"></td>
      <td class="${e.date ? "bad" : ""}"><input type="date" data-scan="${i}" data-f="date" value="${esc(r.date)}"></td>
      <td class="${e.ca ? "bad" : ""}">${sel(i, "ca", [1, 2, 3, 4].map((c) => [c, `Ca ${c} · ${caInfo(c).start}`]), r.ca)}</td>
      <td class="${e.khoa ? "bad" : ""}">${sel(i, "khoa", khoaList().map((k) => [k, `K${k}`]), r.khoa)}</td>
      <td class="${e.nganh ? "bad" : ""}">${sel(i, "nganh", NGANH.map((n) => [n, n]), r.nganh)}</td>
      <td><input type="text" data-scan="${i}" data-f="mon" value="${esc(r.mon)}" placeholder="Môn thi"></td>
      <td class="small">${esc(r.time || "")}</td></tr>`;
  }).join("");
  $("scanPreview").innerHTML = `<div class="tbl-wrap"><table class="list scan"><thead><tr><th></th><th>Ngày</th><th>Ca</th><th>Khoá</th><th>Ngành</th><th>Môn</th><th>Giờ AI đọc</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="okmsg" id="scanSum"></div>
    <div class="two"><button type="button" id="btnScanClear">Bỏ kết quả</button><button type="button" class="primary" id="btnScanAdd">Thêm</button></div>`;
  updateScanSummary();
}

function updateScanSummary() {
  const on = scanRows.filter((r) => r.on), good = on.filter(rowOk).length, badN = on.length - good;
  if ($("scanSum")) $("scanSum").textContent = `Đã chọn ${on.length} dòng` + (badN ? ` · ${badN} dòng còn thiếu thông tin (ô đỏ), sẽ bị bỏ qua` : "");
  if ($("btnScanAdd")) { $("btnScanAdd").textContent = `Thêm ${good} ca đã chọn`; $("btnScanAdd").disabled = good === 0; }
}

/** Sửa một ô trong bản xem trước: cập nhật tại chỗ (không vẽ lại bảng để khỏi mất con trỏ khi đang gõ). */
function editScan(el) {
  const i = Number(el.dataset.scan), f = el.dataset.f, r = scanRows[i];
  if (!r) return;
  r[f] = f === "on" ? el.checked : el.value;
  if (f !== "on" && f !== "mon") {
    const e = rowErr(r);
    el.closest("tr").querySelectorAll("[data-f]").forEach((x) => { if (e[x.dataset.f] !== undefined) x.closest("td").classList.toggle("bad", e[x.dataset.f]); });
    if (rowOk(r) && !r.on) { r.on = true; el.closest("tr").querySelector('[data-f="on"]').checked = true; }
  }
  el.closest("tr").classList.toggle("off", !r.on);
  updateScanSummary();
}

async function applyScan() {
  $("scanErr").textContent = "";
  const rows = scanRows.filter((r) => r.on && rowOk(r));
  let p;
  try { p = planCombos($("addDot").value, rows.map((r) => ({ date: r.date, ca: Number(r.ca), khoa: Number(r.khoa), nganh: r.nganh, mon: (r.mon || "").trim() })), readNeed()); }
  catch (e) { $("scanErr").textContent = e.message; return; }
  if (!p.creates.length && !p.updates.length) { $("scanMsg").textContent = "Không có gì để thêm: " + summary(p); return; }
  const need = readNeed();
  const ok = await ask({ title: `Thêm ca vào "${p.dot.name}"?`, ok: "Thêm", cancel: "Xem lại", ic: "calendarPlus",
    rows: [["Ca mới", String(p.creates.length)], ["Cập nhật", String(p.updates.length)], ["Giữ nguyên", String(p.same)], ["Số GV cần mỗi ca", manageTos().map((t) => `${TO_SHORT[t]}: ${need[t]}`).join(" · ")]] });
  if (!ok) return;
  if (await commit(p, $("addDot").value, "scanErr", "scanMsg")) { scanRows = []; $("scanPreview").innerHTML = ""; }
}

/** Các thay đổi (change) trong trang; trả true nếu là của tổ trưởng. */
export function manageChange(e) {
  const t = e.target;
  if (t.id === "slotDot") { refreshAddList(); return true; }
  if (t.dataset && t.dataset.sel === "gvf") { S.gvFilter = t.value; S.render(); return true; }
  if (t.id === "scanCam" || t.id === "scanFile") { const f = t.files && t.files[0]; t.value = ""; if (f) runScan(f); return true; }
  if (t.dataset && t.dataset.scan !== undefined) { editScan(t); return true; }
  return false;
}

/** Danh sách ca của tổ mình trong đợt đang chọn: sửa số lượng hoặc xoá. Không vẽ lại khi người dùng đang gõ trong bảng. */
export function refreshAddList() {
  const box = $("addList"); if (!box) return;
  if (document.activeElement && box.contains(document.activeElement)) return;
  const dotId = $("slotDot")?.value, tos = manageTos();
  const slots = (S.slotsBy[dotId] || []).filter((s) => tos.some((t) => needOf(s, t) > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || a.nganh.localeCompare(b.nganh));
  const editable = canEditCa(S.dots.find((d) => d.id === dotId));
  const rows = slots.map((s) => `<tr>
    <td>${esc(dowOf(s.date))} ${dmOf(s.date)}</td><td>Ca ${s.ca} · ${caInfo(s.ca).start}</td><td>${esc(slotWho(s))}</td><td>${esc(s.mon || "")}</td>
    ${tos.map((t) => `<td><input class="num" type="number" min="0" max="20" value="${needOf(s, t)}" data-need="${esc(s.id)}" data-t="${t}" ${editable ? "" : "disabled"}> <span class="small">đã ĐK ${takenOf(dotId, s.id, t)}</span></td>`).join("")}
    <td><button data-save="${esc(s.id)}" ${editable ? "" : "disabled"}>Lưu</button> <button class="danger" data-del="${esc(s.id)}" ${editable ? "" : "disabled"}>Xoá</button></td></tr>`).join("");
  box.innerHTML = `<div class="tbl-wrap"><table class="list"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Môn</th>${tos.map((t) => `<th>Cần ${esc(TO_SHORT[t])}</th>`).join("")}<th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${5 + tos.length}" class="muted">Chưa có ca nào của ${esc(scopeLabel())} trong đợt này.</td></tr>`}</tbody></table></div>`;
}

/** Refresh the current-year exam-period dropdown after a leader creates a new period. */
export function refreshAddPeriods(preferred = "") {
  const select = $("addDot"); if (!select) return;
  const selected = preferred || select.value;
  const dots = S.dots.filter(canEditCa).sort((a, b) => (b.order || 0) - (a.order || 0));
  select.innerHTML = dots.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(STATUS_LABEL[statusOf(d)])})</option>`).join("");
  if (dots.some((d) => d.id === selected)) select.value = selected;
}

async function createExamPeriod() {
  const name = $("newDotName")?.value.trim() || "";
  $("dotErr").textContent = ""; $("dotMsg").textContent = "";
  if (!name) { $("dotErr").textContent = "Nhập tên đợt thi trước."; return; }
  const button = $("btnCreateDot"); button.disabled = true; button.textContent = "Đang tạo…";
  try {
    if (!scriptUrl) throw new Error("no_url");
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "createDot", idToken, name }) });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "failed");
    $("newDotName").value = "";
    $("dotMsg").textContent = `Đã tạo “${result.name}” cho năm học ${result.namHoc}.`;
    refreshAddPeriods(result.id);
    setTimeout(() => refreshAddPeriods(result.id), 700);
  } catch (e) {
    $("dotErr").textContent = ({ auth: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", forbidden: "Chỉ quản lý được tạo đợt thi.", duplicate: "Đã có đợt cùng tên trong năm học này." })[e.message] || "Chưa tạo được đợt. Kiểm tra kết nối rồi thử lại.";
  } finally { button.disabled = false; button.textContent = "Tạo đợt"; }
}

/** Called from the Settings page. The server independently checks the leader role. */
export async function endYearFromSettings() {
  const year = String(S.cfg.namHoc || "");
  const next = year.replace(/^(\d{4})-(\d{4})$/, (_, a, b) => `${Number(a) + 1}-${Number(b) + 1}`);
  if (next === year) return toast("Năm học trong cấu hình chưa đúng định dạng YYYY-YYYY.");
  const confirmed = await ask({
    title: `Kết thúc năm học ${year}?`,
    text: "Ứng dụng sẽ tạo báo cáo Google Sheets và gửi liên kết cho bạn trước khi chuyển sang năm học mới.",
    rows: [["Năm học tiếp theo", next], ["Email nhận báo cáo", "duongthanhtu.dnu@gmail.com"], ["Sau khi kết thúc", "Reset ca trước app về 0; nâng khóa học lên một khóa; giữ lịch sử năm cũ"]],
    warn: "Đây là thao tác chốt năm. Hãy chắc chắn đã hoàn tất phân công và thống kê của năm học hiện tại.",
    ok: "Xuất báo cáo và kết thúc", cancel: "Quay lại", danger: true, confirmText: year,
  });
  if (!confirmed) return;
  const button = $("btnEndYear"); button.disabled = true; button.textContent = "Đang chốt năm học…";
  $("yearEndErr").textContent = ""; $("yearEndMsg").textContent = "";
  try {
    if (!scriptUrl) throw new Error("no_url");
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "endYear", idToken, namHoc: year }) });
    const result = await response.json();
    if (!result.ok) {
      if (result.error === "already_closed" && result.reportUrl) window.open(result.reportUrl, "_blank", "noopener");
      throw new Error(result.error || "failed");
    }
    S.yearClosed = true;   // giữ trang để còn thấy link báo cáo; dữ liệu năm mới cần tải lại
    $("yearEndMsg").innerHTML = `Đã kết thúc ${esc(result.year)}. ${result.mailSent ? "Báo cáo đã gửi qua email." : "Không gửi được email; hãy mở báo cáo tại đây."} <a href="${esc(result.reportUrl)}" target="_blank" rel="noopener">Mở Google Sheets</a> <button type="button" class="primary" onclick="location.reload()">Tải lại để sang năm ${esc(result.nextYear)}</button>`;
    toast(`Đã chuyển sang năm học ${result.nextYear}.`);
  } catch (e) {
    $("yearEndErr").textContent = ({ auth: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", forbidden: "Chỉ quản trị toàn khoa mới được kết thúc năm học.", already_closed: "Năm học này đã được kết thúc trước đó.", year_changed: "Năm học đã thay đổi. Tải lại trang rồi kiểm tra lại.", "Năm học trong CauHinh phải có dạng 2026-2027.": "Năm học trong cấu hình chưa đúng định dạng YYYY-YYYY." })[e.message] || "Chưa hoàn tất được. Hãy mở tab mới và kiểm tra tab NhatKyDongBo trước khi thử lại.";
  } finally { button.disabled = false; button.textContent = "Xuất thống kê và kết thúc năm học"; }
}

async function saveRow(id) {
  const s = findSlot(id); if (!s) return;
  const upd = {};
  for (const t of manageTos()) {
    const inp = document.querySelector(`#addList input[data-need="${CSS.escape(id)}"][data-t="${t}"]`);
    const v = Number(inp?.value);
    if (!Number.isInteger(v) || v < 0 || v > 20) return toast("Số giảng viên cần phải là số nguyên từ 0 đến 20.");
    if (v === needOf(s, t)) continue;
    const taken = takenOf(s.dotId, id, t);
    if (v < taken) return toast(`Đã có ${taken} người đăng ký, không thể giảm xuống ${v}. Nhờ giảng viên huỷ đăng ký trước.`);
    upd["need.t" + t] = v;
  }
  if (!Object.keys(upd).length) return toast("Chưa có thay đổi.");
  try { await updateDoc(doc(db, "slots", id), upd); toast("Đã lưu."); }
  catch (e) { toast("Không lưu được (đợt có thể đã đóng)."); }
}

async function delRow(id) {
  const s = findSlot(id); if (!s) return;
  const tos = manageTos().filter((t) => needOf(s, t) > 0);
  const busy = tos.map((t) => takenOf(s.dotId, id, t)).reduce((a, b) => a + b, 0);
  if (busy) return toast(`Ca này đã có ${busy} người đăng ký. Hãy nhờ họ huỷ trước khi xoá.`);
  if (!(await ask({ title: "Xoá ca thi này?", text: `Chỉ xoá phần của ${scopeLabel()}; tổ khác vẫn giữ nguyên.`, ok: "Xoá ca", cancel: "Giữ lại", danger: true,
    rows: [["Ngày", fmtLong(s.date)], ["Ca", `Ca ${s.ca} · ${caInfo(s.ca).start}`], ["Khoá - Ngành", slotWho(s)]] }))) return;
  const upd = {}; tos.forEach((t) => (upd["need.t" + t] = 0));
  try { await updateDoc(doc(db, "slots", id), upd); toast("Đã xoá ca."); }
  catch (e) { toast("Không xoá được (đợt có thể đã đóng)."); }
}

/** Gọi từ app.js cho mọi cú bấm trong trang; trả true nếu là thao tác của tổ trưởng. */
export function manageClick(e) {
  if (e.target.closest("#btnAddOther")) { const b = $("otherBox"); b.hidden = !b.hidden; if (!b.hidden) $("addDonVi").focus(); else $("addDonVi").value = ""; return true; }
  let el;
  if ((el = e.target.closest("[data-at]"))) {                      // chuyển tab Nhập tay / Quét AI (không vẽ lại trang để khỏi mất dữ liệu đang nhập)
    const scan = el.dataset.at === "scan";
    $("secManual").hidden = scan; $("secScan").hidden = !scan;
    el.parentNode.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el));
    return true;
  }
  if ((el = e.target.closest("[data-gv]"))) { S.openGv = S.openGv === el.dataset.gv ? null : el.dataset.gv; S.render(); return true; }
  if ((el = e.target.closest("[data-gf]"))) { S.gvFilter = el.dataset.gf; S.render(); return true; }
  if (e.target.closest("#btnCsv")) { downloadCsv(); return true; }
  if (e.target.closest("#btnAddPrev")) { runAdd(true); return true; }
  if (e.target.closest("#btnAddGo")) { runAdd(false); return true; }
  if (e.target.closest("#btnCreateDot")) { createExamPeriod(); return true; }
  if (e.target.closest("#btnScanAdd")) { applyScan(); return true; }
  if (e.target.closest("#btnScanClear")) { scanRows = []; $("scanPreview").innerHTML = ""; $("scanMsg").textContent = ""; return true; }
  if ((el = e.target.closest("[data-save]"))) { saveRow(el.dataset.save); return true; }
  if ((el = e.target.closest("[data-del]"))) { delRow(el.dataset.del); return true; }
  return false;
}

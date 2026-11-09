// Trang của tổ trưởng: Thống kê giảng viên trong tổ + Thêm ca thi mới.
// Tổ trưởng (tt1/tt2/tt3) chỉ thấy và chỉ sửa được phần của tổ mình; quản trị (x) thấy cả 3 tổ. Luật Firestore cũng ép như vậy.
import { doc, writeBatch, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  db, S, $, esc, toast, TO_LABEL, TO_SHORT, caInfo, dowOf, dmOf, fmtLong, todayIso, isoOf, parseDates, manageTos,
  statusOf, canEditCa, STATUS_LABEL, needOf, slotId, visibleSlots, findSlot, khoaList, khoaNam, chipsHtml,
} from "./core.js";

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
    return `<tr><td>${esc(fmtLong(r.date))}</td><td>Ca ${r.ca} · ${ci.start} <span class="small">(có mặt ${ci.arrive})</span></td><td>${s ? "K" + esc(s.khoa) : "—"}</td><td>${s ? esc(s.nganh) : "—"}</td>
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
  const body = rows.map(({ d, s, miss }) => `<tr><td>${esc(d.name)}</td><td>${esc(dowOf(s.date))} ${dmOf(s.date)}</td><td>Ca ${s.ca} (${caInfo(s.ca).start})</td><td>K${esc(s.khoa)} ${esc(s.nganh)}</td><td>${miss.map(esc).join(", ")}</td></tr>`).join("");
  return `<details class="card more"><summary><b>Ca còn thiếu người</b> <span class="small">(${rows.length} ca)</span></summary>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Đợt</th><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Còn thiếu</th></tr></thead>
    <tbody>${body || `<tr><td colspan="5" class="okc">Mọi ca đều đủ người.</td></tr>`}</tbody></table></div></details>`;
}

export function statsHtml() {
  const min = S.cfg.minCa || 20, all = peopleStats();
  const nShort = all.filter((p) => p.short > 0).length;
  const shown = all.filter((p) => S.gvFilter === "all" || p.short > 0);
  const cols = S.me.admin ? 6 : 5;
  const rows = shown.map((p) => `
    <tr class="gv-row ${S.openGv === p.email ? "open" : ""}" data-gv="${esc(p.email)}">
      <td><button class="link">${S.openGv === p.email ? "▾" : "▸"} ${esc(p.name)}</button></td>
      ${S.me.admin ? `<td>${esc(TO_SHORT[p.to] || "")}</td>` : ""}
      <td><b>${p.total}</b> / ${min}</td><td>${p.done}</td><td>${p.upcoming}</td>
      <td class="${p.short ? "bad" : "okc"}">${p.short ? "Thiếu " + p.short : "Đủ"}</td></tr>
    ${S.openGv === p.email ? detailHtml(p, cols) : ""}`).join("");
  return `<div class="card"><b>Phạm vi:</b> ${esc(scopeLabel())} · ${all.length} giảng viên · ${all.length - nShort} đã đủ ${min} ca · <b>${nShort}</b> chưa đủ</div>
    <div class="chips">${chipsHtml([["all", `Tất cả (${all.length})`], ["short", `Chưa đủ ${min} ca (${nShort})`]], S.gvFilter, "gf")}<button class="chip" id="btnCsv">Tải CSV</button></div>
    <p class="small">Bấm vào tên giảng viên để xem chi tiết từng ca (ngày, giờ, khoá, ngành, môn).</p>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Giảng viên</th>${S.me.admin ? "<th>Tổ</th>" : ""}<th>Số ca / định mức</th><th>Đã gác</th><th>Sắp tới</th><th>Tình trạng</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols}" class="muted">Không có giảng viên nào.</td></tr>`}</tbody></table></div>
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
  if (!dots.length) return `<div class="card center muted">Chưa có đợt nào ở trạng thái SOAN hoặc MO. Nhờ quản trị tạo đợt thi trong Google Sheet rồi chạy "Đồng bộ lên Firebase".</div>`;
  const tos = manageTos();
  return `<div class="card" id="addForm">
    <h2>Thêm ca thi mới</h2>
    <p class="small">Bạn nhập số giảng viên cần của <b>${esc(scopeLabel())}</b>. Tổ khác tự nhập phần của họ cho cùng ca (cùng đợt, ngày, ca, khoá, ngành thì gộp vào một ca).</p>
    <label for="addDot">Đợt thi</label>
    <select class="field" id="addDot">${dots.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(STATUS_LABEL[statusOf(d)])})</option>`).join("")}</select>
    <label for="addDates">Ngày thi <span class="small">(cách nhau bằng dấu phẩy hoặc xuống dòng; có thể ghi khoảng)</span></label>
    <textarea class="field" id="addDates" rows="3" placeholder="24/07/2026&#10;27/07/2026-31/07/2026"></textarea>
    <label class="check"><input type="checkbox" id="addSkipSun" checked> Bỏ Chủ nhật</label>
    <label>Ca</label>
    <div class="row">${[1, 2, 3, 4].map((c) => `<label class="check"><input type="checkbox" name="addCa" value="${c}"> Ca ${c} (${caInfo(c).start})</label>`).join("")}</div>
    <label>Khoá</label>
    <div class="row">${khoaList().map((k) => `<label class="check"><input type="checkbox" name="addKhoa" value="${k}"> Khoá ${k}${khoaNam(k) ? ` (năm ${khoaNam(k)})` : ""}</label>`).join("")}</div>
    <label>Ngành</label>
    <div class="row">${["SPA", "NNA"].map((n) => `<label class="check"><input type="checkbox" name="addNganh" value="${n}"> ${n}</label>`).join("")}</div>
    <label for="addMon">Môn thi <span class="small">(tuỳ chọn)</span></label>
    <input class="field" id="addMon" type="text">
    <label>Số giảng viên cần mỗi ca</label>
    <div class="row">${tos.map((t) => `<div class="need-in"><span>${esc(TO_LABEL[t])}</span><input class="field" id="addNeed${t}" type="number" min="0" max="20" value="1" inputmode="numeric"></div>`).join("")}</div>
    <div class="err" id="addErr" role="alert"></div>
    <div id="addMsg" class="okmsg"></div>
    <div class="two"><button type="button" id="btnAddPrev">Xem trước</button><button type="button" class="primary" id="btnAddGo">Thêm vào đợt</button></div>
  </div>
  <h2 class="sec">Ca đã thêm của ${esc(scopeLabel())}</h2>
  <div id="addList"></div>`;
}

function readForm() {
  const checked = (name) => [...document.querySelectorAll(`#addForm input[name=${name}]:checked`)].map((e) => e.value);
  const f = { dotId: $("addDot").value, dates: $("addDates").value, skipSun: $("addSkipSun").checked,
    cas: checked("addCa").map(Number), khoas: checked("addKhoa").map(Number), nganhs: checked("addNganh"), mon: $("addMon").value.trim(), need: {} };
  manageTos().forEach((t) => (f.need[t] = Number($("addNeed" + t).value || 0)));
  return f;
}

const takenOf = (dotId, id, t) => (S.regsBy[dotId] || []).filter((r) => r.slotId === id && r.to === t).length;

/** Tính trước sẽ tạo mới / cập nhật những ca nào; ném lỗi tiếng Việt nếu dữ liệu nhập sai. */
function plan(f) {
  const { dates, bad } = parseDates(f.dates);
  if (bad.length) throw new Error("Không hiểu ngày: " + bad.join(", ") + ". Dạng đúng: 27/07/2026 hoặc 27/07/2026-31/07/2026.");
  const days = dates.filter((d) => !(f.skipSun && d.getDay() === 0)).map(isoOf);
  if (!days.length || !f.cas.length || !f.khoas.length || !f.nganhs.length) throw new Error("Chọn ít nhất 1 ngày, 1 ca, 1 khoá, 1 ngành.");
  const tos = manageTos();
  if (tos.some((t) => !Number.isInteger(f.need[t]) || f.need[t] < 0 || f.need[t] > 20)) throw new Error("Số giảng viên cần phải là số nguyên từ 0 đến 20.");
  if (tos.every((t) => !(f.need[t] > 0))) throw new Error("Nhập số giảng viên cần (từ 1 trở lên) cho tổ của bạn.");
  const dot = S.dots.find((d) => d.id === f.dotId);
  if (!dot || !canEditCa(dot)) throw new Error("Đợt này không còn cho thêm ca.");
  const have = new Map((S.slotsBy[f.dotId] || []).map((s) => [s.id, s]));
  const creates = [], updates = [];
  let same = 0, blocked = 0;
  for (const date of days) for (const ca of f.cas) for (const khoa of f.khoas) for (const nganh of f.nganhs) {
    const id = slotId(f.dotId, date, ca, khoa, nganh), ex = have.get(id);
    if (!ex) {
      const need = { t1: 0, t2: 0, t3: 0 };
      tos.forEach((t) => (need["t" + t] = f.need[t]));
      creates.push({ id, date, ca, khoa, nganh, need });
      continue;
    }
    const upd = {};
    for (const t of tos) {                               // ca đã có (do tổ khác tạo): chỉ cập nhật phần của tổ mình
      const v = f.need[t];
      if (!v || v === needOf(ex, t)) continue;
      if (v < takenOf(f.dotId, id, t)) { blocked++; continue; }
      upd["need.t" + t] = v;
    }
    if (f.mon && !ex.mon) upd.mon = f.mon;
    if (Object.keys(upd).length) updates.push({ id, upd }); else same++;
  }
  return { dot, creates, updates, same, blocked };
}

const summary = (p) => `${p.creates.length} ca mới · ${p.updates.length} ca cập nhật · ${p.same} ca đã có sẵn, giữ nguyên` + (p.blocked ? ` · ${p.blocked} ca bỏ qua vì đã có nhiều người đăng ký hơn số mới` : "");

async function runAdd(dry) {
  $("addErr").textContent = ""; $("addMsg").textContent = "";
  let f, p;
  try { f = readForm(); p = plan(f); } catch (e) { $("addErr").textContent = e.message; return; }
  if (dry) { $("addMsg").textContent = "Sẽ thực hiện: " + summary(p); return; }
  if (!p.creates.length && !p.updates.length) { $("addMsg").textContent = "Không có gì để thêm: " + summary(p); return; }
  const ops = [
    ...p.creates.map((c) => ({ id: c.id, set: { dotId: f.dotId, namHoc: p.dot.namHoc, date: c.date, ca: c.ca, khoa: c.khoa, nganh: c.nganh, mon: f.mon, note: "", need: c.need, active: true, createdBy: S.me.email, createdAt: serverTimestamp() } })),
    ...p.updates.map((u) => ({ id: u.id, upd: u.upd })),
  ];
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach((o) => (o.set ? b.set(doc(db, "slots", o.id), o.set) : b.update(doc(db, "slots", o.id), o.upd)));
      await b.commit();
    }
    $("addMsg").textContent = "Đã lưu: " + summary(p);
    toast("Đã thêm ca thi.");
  } catch (e) {
    $("addErr").textContent = e.code === "permission-denied"
      ? "Không lưu được: đợt đã đóng, hoặc ca vừa được tổ khác tạo cùng lúc. Hãy bấm Xem trước rồi thử lại."
      : "Lỗi mạng, thử lại. (" + (e.code || e.message) + ")";
  }
}

/** Danh sách ca của tổ mình trong đợt đang chọn: sửa số lượng hoặc xoá. Không vẽ lại khi người dùng đang gõ trong bảng. */
export function refreshAddList() {
  const box = $("addList"); if (!box) return;
  if (document.activeElement && box.contains(document.activeElement)) return;
  const dotId = $("addDot")?.value, tos = manageTos();
  const slots = (S.slotsBy[dotId] || []).filter((s) => tos.some((t) => needOf(s, t) > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || a.nganh.localeCompare(b.nganh));
  const editable = canEditCa(S.dots.find((d) => d.id === dotId));
  const rows = slots.map((s) => `<tr>
    <td>${esc(dowOf(s.date))} ${dmOf(s.date)}</td><td>Ca ${s.ca} · ${caInfo(s.ca).start}</td><td>K${esc(s.khoa)} ${esc(s.nganh)}</td><td>${esc(s.mon || "")}</td>
    ${tos.map((t) => `<td><input class="num" type="number" min="0" max="20" value="${needOf(s, t)}" data-need="${esc(s.id)}" data-t="${t}" ${editable ? "" : "disabled"}> <span class="small">đã ĐK ${takenOf(dotId, s.id, t)}</span></td>`).join("")}
    <td><button data-save="${esc(s.id)}" ${editable ? "" : "disabled"}>Lưu</button> <button class="danger" data-del="${esc(s.id)}" ${editable ? "" : "disabled"}>Xoá</button></td></tr>`).join("");
  box.innerHTML = `<div class="tbl-wrap"><table class="list"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Môn</th>${tos.map((t) => `<th>Cần ${esc(TO_SHORT[t])}</th>`).join("")}<th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${5 + tos.length}" class="muted">Chưa có ca nào của ${esc(scopeLabel())} trong đợt này.</td></tr>`}</tbody></table></div>`;
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
  if (!confirm(`Xoá ca ${fmtLong(s.date)} · Ca ${s.ca} · K${s.khoa} ${s.nganh}?\n(Chỉ xoá phần của ${scopeLabel()}; tổ khác vẫn giữ nguyên.)`)) return;
  const upd = {}; tos.forEach((t) => (upd["need.t" + t] = 0));
  try { await updateDoc(doc(db, "slots", id), upd); toast("Đã xoá ca."); }
  catch (e) { toast("Không xoá được (đợt có thể đã đóng)."); }
}

/** Gọi từ app.js cho mọi cú bấm trong trang; trả true nếu là thao tác của tổ trưởng. */
export function manageClick(e) {
  let el;
  if ((el = e.target.closest("[data-gv]"))) { S.openGv = S.openGv === el.dataset.gv ? null : el.dataset.gv; S.render(); return true; }
  if ((el = e.target.closest("[data-gf]"))) { S.gvFilter = el.dataset.gf; S.render(); return true; }
  if (e.target.closest("#btnCsv")) { downloadCsv(); return true; }
  if (e.target.closest("#btnAddPrev")) { runAdd(true); return true; }
  if (e.target.closest("#btnAddGo")) { runAdd(false); return true; }
  if ((el = e.target.closest("[data-save]"))) { saveRow(el.dataset.save); return true; }
  if ((el = e.target.closest("[data-del]"))) { delRow(el.dataset.del); return true; }
  return false;
}

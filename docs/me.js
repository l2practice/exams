// Các trang của giảng viên: Tổng quan · Đăng ký ca thi · Ca của tôi · Lịch sử gác thi.
import { doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  db, S, $, esc, toast, ask, TO_LABEL, TO_SHORT, caInfo, dowOf, dmOf, dmyOf, fmtLong, todayIso, khoaNam,
  statusOf, isRegOpen, STATUS_LABEL, needOf, visibleSlots, findSlot,
} from "./core.js";
import { icon } from "./icons.js";

const dotOf = (s) => S.dots.find((d) => d.id === s.dotId);
const dotName = (id) => S.dots.find((d) => d.id === id)?.name || "";
const openFirst = (a, b) => (isRegOpen(b) - isRegOpen(a)) || (b.order || 0) - (a.order || 0);
const slotKey = (a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || String(a.nganh).localeCompare(String(b.nganh));
const myIds = () => new Set(S.myYear.map((r) => r.slotId));
const dayLabel = (iso) => `${dowOf(iso)}, ${dmyOf(iso)}`;
const slotLabel = (s) => (s ? `K${s.khoa} · ${s.nganh}` : "");
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** Số người đã đăng ký theo từng ca và tổ của một đợt. */
export function countsOf(dotId) {
  const c = {};
  for (const r of S.regsBy[dotId] || []) (c[r.slotId] ||= { t1: 0, t2: 0, t3: 0 })["t" + r.to]++;
  return c;
}
const allCounts = () => Object.fromEntries(S.dots.map((d) => [d.id, countsOf(d.id)]));

/** Trạng thái của một ca với tổ của tôi: mine | open | full | na, kèm số liệu. */
function stateOf(s, cnts, mine) {
  const need = needOf(s, S.me.to), taken = cnts[s.dotId]?.[s.id]?.["t" + S.me.to] || 0;
  if (mine.has(s.id)) return { k: "mine", need, taken };
  if (!need) return { k: "na", need, taken };
  return taken >= need ? { k: "full", need, taken } : { k: "open", need, taken };
}
/** Lý do không đăng ký được (null = được). */
function reason(s, cnts) {
  if (!isRegOpen(dotOf(s))) return "Đã đóng";
  if (!needOf(s, S.me.to)) return "Không cần tổ bạn";
  if (stateOf(s, cnts, new Set()).k === "full") return "Đã đủ";
  if (S.myYear.find((r) => r.date === s.date && r.ca === s.ca)) return "Trùng giờ";
  return null;
}

// =====================================================================  Tổng quan
export function overviewHtml() {
  const min = S.cfg.minCa || 20, prior = Number(S.me.prior || 0), today = todayIso();
  const regs = [...S.myYear].sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
  const past = regs.filter((r) => r.date < today).length, upcoming = regs.filter((r) => r.date >= today);
  const done = prior + past, total = prior + regs.length, short = Math.max(0, min - total);
  const pct = Math.min(100, Math.round((done / min) * 100)), C = 2 * Math.PI * 54;
  const items = upcoming.slice(0, 3).map((r) => {
    const s = findSlot(r.slotId);
    return `<div class="uitem"><span class="uic">${icon("calendar")}</span><div><b>${esc(dayLabel(r.date))} – Ca ${r.ca}</b>
      <div class="small">${s ? `K${esc(s.khoa)} – ${esc(s.mon || s.nganh)}` : ""}${s?.mon ? ` · ${esc(s.nganh)}` : ""} · ${caInfo(r.ca).start}</div></div></div>`;
  }).join("");
  const kpi = (cls, ic, v, l) => `<div class="kpi"><span class="kicon ${cls}">${icon(ic)}</span><div><div class="kv">${v}</div><div class="kl">${l}</div></div></div>`;
  return `<div class="greet"><h2>Xin chào, <b>${esc(S.me.name || S.me.email)}</b> 👋</h2>
      <p>${S.me.leadTo ? `Tổ trưởng – Tổ ${esc(TO_LABEL[S.me.leadTo])}` : `Giảng viên – Tổ ${esc(TO_LABEL[S.me.to] || "")}`}</p></div>
    <div class="kpis4">${kpi("violet", "calendar", min, "Tổng số ca (định mức)")}${kpi("green", "checkCircle", done, "Đã gác")}${kpi("blue", "calendarCheck", upcoming.length, "Sắp tới")}${kpi("orange", "hourglass", short, "Còn thiếu")}</div>
    <div class="dash">
      <div class="card ringcard">
        <div class="ring"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="54" fill="none" stroke="#EEEBFF" stroke-width="12"/>
          <circle cx="66" cy="66" r="54" fill="none" stroke="${done >= min ? "#14966A" : "#5A45DD"}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg>
          <div class="t"><div><b>${done}/${min}</b><span>ca</span></div></div></div>
        <div><h2>Tiến độ gác thi</h2><p class="small" style="margin:4px 0">Đã hoàn thành ${pct}%</p>
          <p style="margin:6px 0 0">${short ? `Còn thiếu <b>${short}</b> ca để đủ định mức.` : "Đã đủ định mức, cảm ơn thầy/cô."}</p>
          <p class="small" style="margin:6px 0 0">Gồm ${prior} ca trước khi dùng app. Tính cả các đợt trong năm học ${esc(S.cfg.namHoc || "")}.</p></div>
      </div>
      <div class="card"><div class="card-h"><h2>Ca sắp tới của bạn</h2><button class="link" data-go="me:mine">Xem tất cả</button></div>
        ${items || `<p class="muted">Bạn chưa có ca nào sắp tới. Vào <b>Đăng ký ca thi</b> để chọn.</p>`}</div>
    </div>`;
}

// =====================================================================  Ca của tôi / Lịch sử
export function mineHtml(tab) {
  const today = todayIso(), prior = Number(S.me.prior || 0);
  const regs = [...S.myYear].sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
  const list = regs.filter((r) => (tab === "past" ? r.date < today : r.date >= today));
  const rows = list.map((r) => {
    const s = findSlot(r.slotId), dot = dotOf({ dotId: r.dotId });
    const canCancel = tab !== "past" && s && isRegOpen(dot);
    return `<tr><td><b>${esc(dayLabel(r.date))}</b></td><td>Ca ${r.ca} · ${caInfo(r.ca).start}</td><td>${s ? `K${esc(s.khoa)} · ${esc(s.nganh)}` : ""}</td><td>${esc(s?.mon || "")}</td><td>${esc(dotName(r.dotId))}</td>
      <td>${tab === "past" ? `<span class="pill ok">Đã gác</span>` : canCancel ? `<button class="danger sm" data-cancel="${esc(r.slotId)}">Huỷ</button>` : `<span class="pill">Đã chốt</span>`}</td></tr>`;
  }).join("");
  const nUp = regs.filter((r) => r.date >= today).length, nPast = regs.length - nUp;
  return `<div class="toolbar"><div class="seg"><button class="${tab === "upcoming" ? "on" : ""}" data-go="me:mine">Sắp tới (${nUp})</button><button class="${tab === "past" ? "on" : ""}" data-go="me:history">Đã gác (${nPast + prior})</button></div></div>
    ${tab === "past" && prior ? `<div class="card"><b>${prior} ca</b> <span class="muted">đã gác trước khi dùng app (chỉ có số lượng, không có chi tiết).</span></div>` : ""}
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Môn</th><th>Đợt</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">${tab === "past" ? "Chưa có ca nào đã gác trên app." : "Bạn chưa có ca nào sắp tới."}</td></tr>`}</tbody></table></div>`;
}

// =====================================================================  Đăng ký ca thi
const selHtml = (name, label, opts, cur) =>
  `<select class="sel" data-sel="${name}" aria-label="${esc(label)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

export function registerHtml() {
  const dots = S.dots.filter((d) => statusOf(d) !== "SOAN").sort(openFirst);       // đợt đang soạn lịch chưa hiện cho GV
  if (!dots.length) return `<div class="card center muted">Hiện chưa có đợt thi nào mở đăng ký.</div>`;
  const all = dots.flatMap((d) => visibleSlots(d.id));
  const khoas = [...new Set(all.map((s) => s.khoa))].sort((a, b) => a - b);
  const nganhs = [...new Set(all.map((s) => s.nganh))].sort();
  const cnts = allCounts(), mine = myIds();
  const shownDots = dots.filter((d) => S.fDot === "all" || d.id === S.fDot);
  const today = todayIso();
  const pass = (s) => (S.fKhoa === "all" || String(s.khoa) === S.fKhoa) && (S.fNganh === "all" || s.nganh === S.fNganh);
  const upcoming = (s) => s.date >= today;                                   // ca đã qua ngày không đăng ký nữa (xem ở Lịch sử gác thi)
  const items = shownDots.flatMap((d) => visibleSlots(d.id)).filter(pass).filter(upcoming).sort(slotKey);

  const bar = `<div class="toolbar">
      <div class="seg">${[["list", "Danh sách"], ["matrix", "Bảng theo đợt"], ["grid", "Bảng giảng viên"]].map(([v, l]) => `<button class="${S.regView === v ? "on" : ""}" data-rv="${v}">${l}</button>`).join("")}</div>
      <span class="grow"></span>
      ${selHtml("dot", "Đợt", [["all", "Tất cả đợt"], ...dots.map((d) => [d.id, d.name])], S.fDot)}
      ${selHtml("khoa", "Khoá", [["all", "Tất cả khoá"], ...khoas.map((k) => [k, `Khoá ${k}` + (khoaNam(k) ? ` (năm ${khoaNam(k)})` : "")])], S.fKhoa)}
      ${selHtml("nganh", "Ngành", [["all", "Tất cả ngành"], ...nganhs.map((n) => [n, n])], S.fNganh)}
    </div>`;
  if (S.regView === "grid") {
    return bar + `<p class="legend"><span class="cell free sm">+</span> bấm để đăng ký · <span class="cell mine sm">✔</span> ca của bạn, bấm để huỷ · <b>X</b> đồng nghiệp đã đăng ký. Vuốt ngang để xem các ngày khác.</p>` +
      shownDots.map((d) => gridFor(d, mine, pass)).join("");
  }
  if (!items.length) return bar + `<div class="card center muted">Không có ca nào sắp tới khớp bộ lọc.</div>`;
  if (!S.pick || !items.some((s) => s.id === S.pick)) S.pick = items[0].id;           // mặc định chọn ca gần nhất
  const preview = previewHtml(all, cnts, mine);
  return bar + preview + (S.regView === "matrix" ? shownDots.map((d) => matrixFor(d, cnts, mine, (s) => pass(s) && upcoming(s))).join("") : listRows(items, cnts, mine));
}

// ---- danh sách các dòng ca (bảng như bản thiết kế)
function listRows(items, cnts, mine) {
  const rows = items.filter((s) => needOf(s, S.me.to) > 0 || mine.has(s.id));
  if (!rows.length) return `<div class="card center muted">Không có ca nào cần tổ của bạn trong bộ lọc này.</div>`;
  const multi = S.dots.length > 1;
  return `<div class="rtable" id="rtable"><div class="rhead"><div>Ngày thi</div><div>Ca</div><div>Khoá</div><div>Ngành</div><div>Môn</div><div>Đã đăng ký / Cần</div><div style="text-align:right">Trạng thái</div></div>` +
    rows.map((s) => {
      const st = stateOf(s, cnts, mine), why = st.k === "mine" ? null : reason(s, cnts), ci = caInfo(s.ca);
      const act = st.k === "mine" ? `<span class="pill p">✔ Đã đăng ký</span> <button class="link" data-cancel="${esc(s.id)}" ${isRegOpen(dotOf(s)) ? "" : "disabled"}>Huỷ</button>`
        : !why ? `<button class="primary" data-reg="${esc(s.id)}">Đăng ký</button>`
        : why === "Đã đủ" ? `<span class="pill ok">Đã đủ</span>` : `<span class="pill">${esc(why)}</span>`;
      return `<div class="rrow ${s.id === S.pick ? "picked" : ""}" data-pick="${esc(s.id)}">
        <div class="c-date rr-date">${esc(dayLabel(s.date))}</div>
        <div class="c-ca">Ca ${s.ca} · ${ci.start}</div><div class="c-k">K${esc(s.khoa)}</div><div class="c-n">${esc(s.nganh)}</div>
        <div class="c-sum small">Ca ${s.ca} · ${ci.start} · K${esc(s.khoa)} · ${esc(s.nganh)} · đã ĐK ${st.taken}/${st.need}</div>
        <div class="c-meta">${esc(s.mon || "—")}${multi ? ` <span class="crowmeta">· ${esc(dotName(s.dotId))}</span>` : ""}</div>
        <div class="c-cnt">${st.need ? `${st.taken} / ${st.need}` : "—"}</div>
        <div class="act c-st">${act}</div></div>`;
    }).join("") + `</div>`;
}

// ---- bảng xem trước: vị trí ca đang chọn so với các ca đã đăng ký + chi tiết ngày
/** Ca đã đăng ký gần nhất trước / sau ca p, và các ca đã đăng ký cùng ngày (không tính chính p). */
function neighbors(p) {
  const key = (x) => `${x.date}|${String(x.ca).padStart(2, "0")}`, k0 = key(p);
  const others = S.myYear.filter((r) => r.slotId !== p.id).sort((a, b) => key(a).localeCompare(key(b)));
  return { prev: [...others].reverse().find((r) => key(r) < k0), next: others.find((r) => key(r) > k0), same: others.filter((r) => r.date === p.date), clash: others.find((r) => key(r) === k0), count: others.length };
}
const regText = (r) => `${dayLabel(r.date)} · Ca ${r.ca}`;
function positionNote(p, mine) {
  const nb = neighbors(p), parts = [];
  if (nb.clash) parts.push(`⚠ <b>Trùng giờ</b> với ca bạn đã đăng ký: ${esc(regText(nb.clash))}.`);
  if (!nb.count) parts.push(mine.has(p.id) ? "Đây là ca duy nhất bạn đã đăng ký." : "Đây sẽ là <b>ca đầu tiên</b> của bạn.");
  else {
    if (nb.same.length && !nb.clash) parts.push(`Cùng ngày bạn đã có: ${nb.same.map((r) => `<b>Ca ${r.ca}</b> ${esc(slotLabel(findSlot(r.slotId)))}`).join(", ")}.`);
    if (nb.prev) parts.push(`Nằm <b>sau</b> ca ${esc(regText(nb.prev))} (cách ${daysBetween(nb.prev.date, p.date)} ngày).`);
    if (nb.next) parts.push(`Nằm <b>trước</b> ca ${esc(regText(nb.next))} (cách ${daysBetween(p.date, nb.next.date)} ngày).`);
    if (!nb.prev && !nb.next && !nb.same.length) parts.push("Không có ca nào khác để so sánh.");
  }
  return parts.join("<br>");
}

function timelineCard(p, mine) {
  const today = todayIso(), isMine = mine.has(p.id);
  const entries = S.myYear.filter((r) => r.date >= today && r.slotId !== p.id).map((r) => ({ date: r.date, ca: r.ca, slot: findSlot(r.slotId), me: true }));
  entries.push({ date: p.date, ca: p.ca, slot: p, cand: true, me: isMine });
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
  const rows = entries.map((e) => `<tr class="${e.cand ? "cand" : ""} ${e.cand && e.me ? "mine" : ""}" ${e.cand ? 'id="candRow"' : ""}>
    <td>${esc(dayLabel(e.date))}</td><td>Ca ${e.ca} · ${caInfo(e.ca).start}</td><td>${esc(slotLabel(e.slot))}</td><td>${esc(e.slot?.mon || "")}</td>
    <td>${e.cand ? `<span class="tag cand">${e.me ? "Đang xem" : "Ca đang chọn"}</span>` : `<span class="pill p">Đã đăng ký</span>`}</td></tr>`).join("");
  return `<div class="card"><div class="card-h"><div><h2>Lịch gác của bạn</h2><div class="small">Vị trí của ca đang chọn so với các ca đã đăng ký</div></div></div>
    <div class="tbl-wrap pvwrap" id="pvwrap"><table class="list pvt"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Môn</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="posnote">${positionNote(p, mine)}</div></div>`;
}

function dayCard(all, p, cnts, mine) {
  const day = all.filter((s) => s.date === p.date).sort(slotKey);
  const cell = (s, t) => { const n = needOf(s, t); if (!n) return `<span class="cellx na">–</span>`; const c = cnts[s.dotId]?.[s.id]?.["t" + t] || 0; return `<span class="cellx ${c >= n ? "full" : c > 0 ? "part" : "zero"}">${c}/${n}</span>`; };
  const rows = day.map((s) => `<tr class="${s.id === p.id ? "sel" : ""}"><th>Ca ${s.ca}</th><td>K${esc(s.khoa)}</td><td>${esc(s.nganh)}</td><td>${cell(s, 1)}</td><td>${cell(s, 2)}</td><td>${cell(s, 3)}</td></tr>`).join("");
  const mineToday = S.myYear.filter((r) => r.date === p.date).sort((a, b) => a.ca - b.ca);
  const names = (S.regsBy[p.dotId] || []).filter((r) => r.slotId === p.id);
  const why = mine.has(p.id) ? null : reason(p, cnts);
  const act = mine.has(p.id) ? `<button class="danger wide" data-cancel="${esc(p.id)}" ${isRegOpen(dotOf(p)) ? "" : "disabled"}>Huỷ đăng ký ca này</button>`
    : !why ? `<button class="primary wide" data-reg="${esc(p.id)}">Đăng ký ca này</button>` : `<div class="small center" style="padding:6px">${esc(why)}</div>`;
  return `<div class="card"><div class="card-h"><h2>Chi tiết ngày: ${esc(dayLabel(p.date))}</h2></div>
    <table class="dd"><thead><tr><th>Ca</th><th>Khoá</th><th>Ngành</th><th>Tổ 1</th><th>Tổ 2</th><th>Tổ 3</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="small" style="margin-bottom:4px"><b>Ca của bạn trong ngày này</b></div>
    ${mineToday.length ? `<div class="mybox">${mineToday.map((r) => `✔ Bạn đã đăng ký: Ca ${r.ca} – ${esc(slotLabel(findSlot(r.slotId)))}${findSlot(r.slotId)?.mon ? " – " + esc(findSlot(r.slotId).mon) : ""}`).join("<br>")}</div>` : `<div class="mybox none">Bạn chưa đăng ký ca nào trong ngày này.</div>`}
    <div class="small"><b>Danh sách đã đăng ký – Ca ${p.ca} (${esc(slotLabel(p))})</b></div>
    ${names.length ? `<ol class="names">${names.map((r) => `<li>${esc(r.name)} <span class="small">(${esc(TO_SHORT[r.to] || "")})</span></li>`).join("")}</ol>` : `<p class="small" style="margin:4px 0 10px">Chưa có ai đăng ký ca này.</p>`}
    ${act}</div>`;
}

function previewHtml(all, cnts, mine) {
  const p = all.find((s) => s.id === S.pick);
  return p ? `<div class="pvgrid" id="preview">${timelineCard(p, mine)}${dayCard(all, p, cnts, mine)}</div>` : "";
}

// ---- Bảng theo đợt: ngày × (ca, khoá-ngành), mỗi ô là số đã đăng ký / cần của tổ tôi
function matrixFor(d, cnts, mine, pass) {
  const slots = visibleSlots(d.id).filter(pass);
  const range = (() => { const ds = visibleSlots(d.id).map((s) => s.date).sort(); return ds.length ? `${dmOf(ds[0])} – ${dmyOf(ds.at(-1))}` : ""; })();
  const open = isRegOpen(d);
  const head = `<div class="dot-head"><h2>${esc(d.name)}${range ? ` <span class="small">· ${range}</span>` : ""}</h2><span class="pill ${open ? "ok" : "bad"}">${esc(statusOf(d) === "MO" && !open ? "Đã hết hạn" : STATUS_LABEL[statusOf(d)])}</span></div>`;
  if (!slots.length) return `<section class="dot">${head}<div class="card muted center">Không có ca nào khớp bộ lọc.</div></section>`;
  const dates = [...new Set(slots.map((s) => s.date))].sort(), cas = [...new Set(slots.map((s) => s.ca))].sort((a, b) => a - b);
  const combos = [...new Set(slots.map((s) => `${s.khoa}|${s.nganh}`))].sort((a, b) => Number(a.split("|")[0]) - Number(b.split("|")[0]) || a.localeCompare(b));
  const h1 = cas.map((c) => `<th colspan="${combos.length}">Ca ${c} <span class="small">· ${caInfo(c).start}</span></th>`).join("");
  const h2 = cas.map(() => combos.map((c) => { const [k, n] = c.split("|"); return `<th>K${esc(k)}<br><span class="small">${esc(n)}</span></th>`; }).join("")).join("");
  const body = dates.map((dt) => `<tr><th class="dcol">${esc(dayLabel(dt))}</th>${cas.map((ca) => combos.map((c) => {
    const s = slots.find((x) => x.date === dt && x.ca === ca && `${x.khoa}|${x.nganh}` === c);
    if (!s) return `<td><span class="mxc na">–</span></td>`;
    const st = stateOf(s, cnts, mine), cls = st.k === "mine" ? "mine" : !st.need ? "na" : st.taken >= st.need ? "full" : st.taken > 0 ? "part" : "zero";
    return `<td><span class="mxc ${cls} ${s.id === S.pick ? "sel" : ""}" data-pick="${esc(s.id)}">${st.k === "mine" ? "✔" : st.need ? `${st.taken}/${st.need}` : "–"}</span></td>`;
  }).join("")).join("")}</tr>`).join("");
  return `<section class="dot">${head}<div class="tbl-wrap"><table class="mx"><thead><tr><th class="dcol" rowspan="2">Ngày</th>${h1}</tr><tr>${h2}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

// ---- Bảng giảng viên (giống file mẫu): cột = ca, hàng = GV
function gridFor(d, mine, pass) {
  const regs = S.regsBy[d.id] || [];
  const slots = visibleSlots(d.id).filter(pass).sort(slotKey);
  const open = isRegOpen(d);
  const stLabel = statusOf(d) === "MO" && !open ? "Đã hết hạn đăng ký" : STATUS_LABEL[statusOf(d)];
  const head = `<div class="dot-head"><h2>${esc(d.name)}</h2><span class="pill ${open ? "ok" : "bad"}">${esc(stLabel)}</span>
    ${open && d.deadline ? `<span class="small">Hạn chót: ${esc(d.deadline.toDate().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" }))}</span>` : ""}</div>`;
  if (!slots.length) return `<section class="dot">${head}<div class="card muted center">${visibleSlots(d.id).length ? "Không có ca nào khớp bộ lọc." : "Chưa có ca nào trong đợt này."}</div></section>`;
  const cnt = countsOf(d.id), who = new Set(), perUser = {};
  for (const r of regs) { who.add(r.slotId + "|" + r.email); perUser[r.email] = (perUser[r.email] || 0) + 1; }
  const cnts = allCounts();
  const days = [];
  for (const s of slots) { const last = days.at(-1); if (last && last.date === s.date) last.n++; else days.push({ date: s.date, n: 1 }); }
  const rowDate = days.map((g) => `<th colspan="${g.n}" class="date"><b>${esc(dowOf(g.date))}</b><br>${dmOf(g.date)}</th>`).join("");
  const rowCa = slots.map((s) => `<th>Ca ${s.ca}<br><small>${caInfo(s.ca).start}</small></th>`).join("");
  const rowKn = slots.map((s) => `<th title="${esc(s.mon || "")}">K${esc(s.khoa)}<br><small>${esc(s.nganh)}</small></th>`).join("");
  const rowLeft = slots.map((s) => { const need = needOf(s, S.me.to), left = need - (cnt[s.id]?.["t" + S.me.to] || 0); return `<th class="${!need ? "na" : left > 0 ? "okc" : "bad"}">${!need ? "–" : left > 0 ? `Còn ${left}` : "Đủ"}</th>`; }).join("");
  const meRow = S.roster.find((r) => r.email === S.me.email) || { name: S.me.name, to: S.me.to };
  const myCells = slots.map((s) => {
    if (who.has(s.id + "|" + S.me.email)) return `<td class="mine"><button class="cell mine" data-cancel="${esc(s.id)}" ${open ? "" : "disabled"} aria-label="Huỷ ca ${s.ca} ngày ${dmOf(s.date)}">✔</button></td>`;
    const why = reason(s, cnts);
    return why ? `<td class="na" title="${esc(why)}"><span class="cell na">–</span></td>` : `<td><button class="cell free" data-reg="${esc(s.id)}" aria-label="Đăng ký ca ${s.ca} ngày ${dmOf(s.date)}">+</button></td>`;
  }).join("");
  const others = S.roster.filter((r) => r.email !== S.me.email).map((r) =>
    `<tr><th class="name">${esc(r.name)}<small>${esc(TO_SHORT[r.to] || "")}</small></th>${slots.map((s) => `<td>${who.has(s.id + "|" + r.email) ? '<span class="x">X</span>' : ""}</td>`).join("")}<td class="sum">${perUser[r.email] || 0}</td></tr>`).join("");
  const sumReg = slots.map((s) => `<td>${(cnt[s.id]?.t1 || 0) + (cnt[s.id]?.t2 || 0) + (cnt[s.id]?.t3 || 0)}</td>`).join("");
  const sumNeed = slots.map((s) => `<td>${needOf(s, 1) + needOf(s, 2) + needOf(s, 3)}</td>`).join("");
  const totReg = regs.filter((r) => slots.some((s) => s.id === r.slotId)).length, totNeed = slots.reduce((a, s) => a + needOf(s, 1) + needOf(s, 2) + needOf(s, 3), 0);
  return `<section class="dot">${head}<div class="tbl-wrap"><table class="sheet">
    <thead><tr><th class="name corner" rowspan="4">Họ tên GV</th>${rowDate}<th class="sum corner" rowspan="4">Cộng</th></tr><tr>${rowCa}</tr><tr>${rowKn}</tr><tr>${rowLeft}</tr></thead>
    <tbody><tr class="me"><th class="name"><b>Bạn</b><br>${esc(meRow.name)}<small>${esc(TO_SHORT[meRow.to] || "")}</small></th>${myCells}<td class="sum">${perUser[S.me.email] || 0}</td></tr>${others}</tbody>
    <tfoot><tr><th class="name">Tổng đăng ký</th>${sumReg}<td class="sum">${totReg}</td></tr><tr><th class="name">SL được giao</th>${sumNeed}<td class="sum">${totNeed}</td></tr></tfoot>
  </table></div></section>`;
}

// =====================================================================  Đăng ký / huỷ (hộp thoại nêu rõ vị trí ca)
const posRows = (s) => {
  const nb = neighbors(s);
  return [["Ca gần nhất trước đó", nb.prev ? `${regText(nb.prev)} (cách ${daysBetween(nb.prev.date, s.date)} ngày)` : "Chưa có"], ["Ca gần nhất sau đó", nb.next ? `${regText(nb.next)} (cách ${daysBetween(s.date, nb.next.date)} ngày)` : "Chưa có"]];
};

async function register(s) {
  const to = S.me.to, email = S.me.email, ci = caInfo(s.ca);
  if (!(await ask({ title: "Xác nhận đăng ký", text: "Bạn có chắc chắn muốn đăng ký ca thi sau không?", ok: "Đăng ký", cancel: "Huỷ", ic: "calendarCheck",
    rows: [["Ngày", fmtLong(s.date)], ["Ca", `Ca ${s.ca} · bắt đầu ${ci.start}`], ["Có mặt tại HĐ thi", ci.arrive], ["Khoá - Ngành", `Khoá ${s.khoa} · ${s.nganh} · Tổ ${TO_SHORT[to]}`], ["Môn", s.mon || ""], ...posRows(s)] }))) return;
  const regId = `${s.date}_${s.ca}__${email}`, need = needOf(s, to);
  const used = new Set((S.regsBy[s.dotId] || []).filter((r) => r.slotId === s.id && r.to === to).map((r) => r.k));
  const order = Array.from({ length: need }, (_, i) => i + 1).sort((a, b) => used.has(a) - used.has(b));   // chỗ trống trước
  for (const k of order) {
    const claimId = `${s.id}_t${to}_${k}`;
    const b = writeBatch(db);
    b.set(doc(db, "claims", claimId), { slotId: s.id, dotId: s.dotId, to, k, email, regId, namHoc: s.namHoc });
    b.set(doc(db, "regs", regId), { slotId: s.id, dotId: s.dotId, namHoc: s.namHoc, date: s.date, ca: s.ca, email, name: S.me.name, to, k, claimId, createdAt: serverTimestamp() });
    try { await b.commit(); toast("Đã đăng ký ca thi."); return; }
    catch (e) { if (e.code !== "permission-denied") { toast("Lỗi mạng, thử lại: " + (e.code || e.message)); return; } }
  }
  toast("Không đăng ký được: ca vừa đủ người, đã đóng đăng ký, hoặc bạn đã có ca cùng giờ.");
}

async function cancel(s) {
  const ci = caInfo(s.ca);
  if (!(await ask({ title: "Huỷ đăng ký ca này?", ok: "Huỷ ca này", cancel: "Giữ lại", danger: true, ic: "history",
    rows: [["Ngày", fmtLong(s.date)], ["Ca", `Ca ${s.ca} · ${ci.start}`], ["Khoá - Ngành", `Khoá ${s.khoa} · ${s.nganh}`]] }))) return;
  const r = S.myYear.find((x) => x.slotId === s.id);
  if (!r) return;
  try {
    const b = writeBatch(db);
    b.delete(doc(db, "regs", r.id));
    b.delete(doc(db, "claims", r.claimId));
    await b.commit();
    toast("Đã huỷ đăng ký.");
  } catch (e) { toast("Không huỷ được (có thể đã hết hạn đăng ký)."); }
}

/** Sau khi vẽ lại: cuộn bảng "Lịch gác của bạn" tới dòng ca đang chọn. */
export function afterRender() {
  const w = $("pvwrap"), row = $("candRow");
  if (w && row) w.scrollTop = Math.max(0, row.offsetTop - w.clientHeight / 2 + row.clientHeight);
}

/** Cú bấm trong trang của giảng viên; trả true nếu đã xử lý. */
export function meClick(e, { store }) {
  let el;
  if ((el = e.target.closest("[data-reg],[data-cancel]"))) {
    const s = findSlot(el.dataset.reg || el.dataset.cancel);
    if (s) {
      if (S.pick !== s.id) { S.pick = s.id; S.render(); }      // bảng xem trước ở trên chuyển sang đúng ca đang đăng ký / huỷ
      if (el.dataset.reg) register(s); else cancel(s);
    }
    return true;
  }
  if ((el = e.target.closest("[data-rv]"))) { S.regView = el.dataset.rv; store.set("gacthi.regView", S.regView); S.render(); return true; }
  if ((el = e.target.closest("[data-pick]"))) {              // bấm một dòng / ô: xem trước ở trên
    S.pick = el.dataset.pick; S.render();
    $("preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  return false;
}
export function meChange(e) {
  const sel = e.target.closest("[data-sel]");
  if (!sel) return false;
  ({ dot: () => (S.fDot = sel.value), khoa: () => (S.fKhoa = sel.value), nganh: () => (S.fNganh = sel.value) })[sel.dataset.sel]?.();
  S.render();
  return true;
}

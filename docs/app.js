// Đăng nhập, nạp dữ liệu, điều hướng và các trang của giảng viên (Tổng quan, Đăng ký ca thi).
import {
  signInWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { resetUrl } from "./firebase-config.js";
import {
  auth, db, S, $, esc, toast, TO_LABEL, TO_SHORT, caInfo, dowOf, dmOf, dmyOf, fmtLong, todayIso, khoaNam,
  isManager, statusOf, isRegOpen, STATUS_LABEL, needOf, visibleSlots, findSlot, tabsHtml, chipsHtml,
} from "./core.js";
import { statsHtml, addHtml, refreshAddList, manageClick } from "./manage.js";

// =====================================================================  Đăng nhập
const EMAIL_KEY = "gacthi.email";
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};
const authMsg = (code) => ({
  "auth/invalid-credential": "Email hoặc mật khẩu chưa đúng.",
  "auth/wrong-password": "Email hoặc mật khẩu chưa đúng.",
  "auth/user-not-found": "Email hoặc mật khẩu chưa đúng.",
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/too-many-requests": "Nhập sai nhiều lần. Hãy chờ vài phút rồi thử lại.",
  "auth/network-request-failed": "Mất kết nối mạng. Hãy thử lại.",
  "auth/weak-password": "Mật khẩu mới quá ngắn (tối thiểu 6 ký tự).",
  "auth/operation-not-allowed": "Đăng nhập bằng email/mật khẩu chưa được bật trong Firebase. Hãy báo quản trị viên (Authentication → Sign-in method → Email/Password).",
  "auth/requires-recent-login": "Hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu.",
}[code] || "Có lỗi xảy ra, hãy thử lại. (" + code + ")");

function show(id) {
  for (const x of ["login", "denied", "app", "loading"]) $(x).hidden = x !== id;
  $("userBox").hidden = !S.user;
}

$("email").value = store.get(EMAIL_KEY);                // ô email luôn nhớ email lần trước
$("showPw").onchange = (e) => ($("pw").type = e.target.checked ? "text" : "password");

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase(), pw = $("pw").value;
  $("loginErr").textContent = ""; $("loginInfo").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    store.set(EMAIL_KEY, email);
    $("pw").value = "";
  } catch (err) { $("loginErr").textContent = authMsg(err.code); }
};

/** Quên mật khẩu: Apps Script đặt mật khẩu mới rồi gửi mail từ tài khoản của khoa (không lộ email nào có trong danh sách). */
$("btnForgot").onclick = async () => {
  const email = $("email").value.trim().toLowerCase();
  $("loginErr").textContent = ""; $("loginInfo").textContent = "";
  if (!email) { $("loginErr").textContent = "Nhập email của bạn trước, rồi bấm 'Quên mật khẩu?'."; return; }
  $("btnForgot").disabled = true;
  try {
    if (resetUrl) {
      const res = await fetch(resetUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "reset", email }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "fail");
    } else await sendPasswordResetEmail(auth, email);
    $("loginInfo").textContent = "Nếu email có trong danh sách giảng viên, mật khẩu mới đã được gửi tới email đó (xem cả mục Thư rác/Spam). Hãy đăng nhập bằng mật khẩu mới rồi đổi ở Cài đặt.";
  } catch { $("loginErr").textContent = "Chưa gửi được mật khẩu mới. Hãy thử lại sau ít phút hoặc báo thư ký khoa."; }
  finally { $("btnForgot").disabled = false; }
};

$("btnOut").onclick = $("btnOut2").onclick = () => { S.settings = false; signOut(auth); };

// Cài đặt: đổi mật khẩu
const openSettings = (v) => { S.settings = v; S.render(); if (v) $("settings").scrollIntoView({ behavior: "smooth" }); };
$("btnSet").onclick = () => openSettings(!S.settings);
$("btnSetClose").onclick = () => openSettings(false);
$("btnPwNow").onclick = () => openSettings(true);
$("pwForm").onsubmit = async (e) => {
  e.preventDefault();
  const cur = $("curPw").value, n1 = $("newPw").value, n2 = $("newPw2").value;
  $("pwErr").textContent = "";
  if (n1 !== n2) { $("pwErr").textContent = "Hai ô mật khẩu mới chưa giống nhau."; return; }
  if (n1 === cur) { $("pwErr").textContent = "Mật khẩu mới phải khác mật khẩu hiện tại."; return; }
  try {
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, cur));
    await updatePassword(auth.currentUser, n1);
    S.me.pwTemp = false;
    updateDoc(doc(db, "teachers", S.me.email), { pwTemp: false }).catch(() => {});   // tắt nhắc đổi mật khẩu
    $("pwForm").reset(); openSettings(false);
    toast("Đã đổi mật khẩu.");
  } catch (err) { $("pwErr").textContent = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "Mật khẩu hiện tại chưa đúng." : authMsg(err.code); }
};

// =====================================================================  Nạp dữ liệu
onAuthStateChanged(auth, async (u) => {
  S.unsub.forEach((f) => f()); S.unsub = [];
  Object.values(S.unsubDots).forEach((f) => f()); S.unsubDots = {};
  Object.assign(S, { user: u, me: null, dots: [], slotsBy: {}, regsBy: {}, roster: [], myYear: [], teachersAll: [], openGv: null });
  if (!u) return show("login");
  show("loading");
  const email = u.email.toLowerCase();
  const t = await getDoc(doc(db, "teachers", email));
  if (!t.exists()) { $("deniedEmail").textContent = email; return show("denied"); }
  S.me = { email, ...t.data() };
  const c = await getDoc(doc(db, "config", "main"));
  S.cfg = c.exists() ? c.data() : { minCa: 20 };

  S.unsub.push(onSnapshot(doc(db, "config", "main"), (d) => { S.cfg = d.data() || S.cfg; S.render(); }));
  S.unsub.push(onSnapshot(collection(db, "roster"), (qs) => {         // tên + tổ của mọi GV, để vẽ các hàng của bảng
    S.roster = qs.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    S.render();
  }));
  // Quản trị (x) thấy mọi GV; tổ trưởng chỉ thấy GV tổ mình. Luật Firestore cũng ép đúng như vậy.
  if (S.me.admin || S.me.leadTo) {
    const q = S.me.admin ? collection(db, "teachers") : query(collection(db, "teachers"), where("to", "==", S.me.leadTo));
    S.unsub.push(onSnapshot(q, (qs) => { S.teachersAll = qs.docs.map((d) => ({ email: d.id, ...d.data() })); S.render(); }));
  }
  // Các đợt thi của năm học hiện tại; mỗi đợt có listener riêng cho ca thi và đăng ký
  S.unsub.push(onSnapshot(collection(db, "dots"), (qs) => {
    S.dots = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.namHoc === S.cfg.namHoc).sort((a, b) => (a.order || 0) - (b.order || 0));
    const ids = new Set(S.dots.map((d) => d.id));
    for (const id of Object.keys(S.unsubDots)) if (!ids.has(id)) { S.unsubDots[id](); delete S.unsubDots[id]; delete S.slotsBy[id]; delete S.regsBy[id]; }
    for (const id of ids) if (!S.unsubDots[id]) subscribeDot(id);
    S.render();
  }));
  // Mọi ca của tôi trong cả năm học (mọi đợt)
  S.unsub.push(onSnapshot(query(collection(db, "regs"), where("email", "==", email), where("namHoc", "==", S.cfg.namHoc || "")), (qs) => {
    S.myYear = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    S.render();
  }));
  S.l1 = isManager() ? "mg" : "me";                 // tổ trưởng mở vào trang Quản lý trước
  show("app");
  S.render();
});

function subscribeDot(id) {
  const a = onSnapshot(query(collection(db, "slots"), where("dotId", "==", id)), (qs) => {
    S.slotsBy[id] = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.active !== false);
    S.render();
  });
  const b = onSnapshot(query(collection(db, "regs"), where("dotId", "==", id)), (qs) => {
    S.regsBy[id] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    S.render();
  });
  S.unsubDots[id] = () => { a(); b(); };
}

// =====================================================================  Điều hướng
const dotOf = (s) => S.dots.find((d) => d.id === s.dotId);
const openFirst = (a, b) => (isRegOpen(b) - isRegOpen(a)) || (b.order || 0) - (a.order || 0);

function render() {
  if (!S.me || !S.cfg || $("app").hidden) return;
  const mgr = isManager();
  if (!mgr) S.l1 = "me";
  $("pwBanner").hidden = !S.me.pwTemp || S.settings;
  $("settings").hidden = !S.settings;
  $("termLabel").textContent = "Khoa Ngoại ngữ · Năm học " + (S.cfg.namHoc || "");

  $("nav1").hidden = !mgr;                                                   // tổ trưởng có thêm tab "Quản lý"
  if (mgr) $("nav1").innerHTML = tabsHtml([["mg", "Quản lý"], ["me", "Gác thi của tôi"]], S.l1, "n1");
  const items = S.l1 === "mg" ? [["stats", "Thống kê giảng viên"], ["add", "Thêm ca thi mới"]] : [["overview", "Tổng quan của tôi"], ["register", "Đăng ký ca thi"]];
  $("nav2").innerHTML = tabsHtml(items, S.l2[S.l1], "n2");

  const key = `${S.l1}:${S.l2[S.l1]}`, page = $("page");
  if (key === "mg:add") {                         // trang có ô nhập: không vẽ lại cả trang khi dữ liệu realtime đổi
    if (!$("addForm")) page.innerHTML = addHtml();
    refreshAddList();
    return;
  }
  const scroll = [...page.querySelectorAll(".tbl-wrap")].map((w) => [w.scrollLeft, w.scrollTop]);
  page.innerHTML = key === "mg:stats" ? statsHtml() : key === "me:overview" ? overviewMeHtml() : registerHtml();
  page.querySelectorAll(".tbl-wrap").forEach((w, i) => { if (scroll[i]) { w.scrollLeft = scroll[i][0]; w.scrollTop = scroll[i][1]; } });
}
S.render = render;

$("nav1").onclick = (e) => { const b = e.target.closest("[data-n1]"); if (b) { S.l1 = b.dataset.n1; render(); } };
$("nav2").onclick = (e) => { const b = e.target.closest("[data-n2]"); if (b) { S.l2[S.l1] = b.dataset.n2; render(); } };
$("page").onchange = (e) => { if (e.target.id === "addDot") refreshAddList(); };
$("page").onclick = (e) => {
  if (manageClick(e)) return;
  let el;
  if ((el = e.target.closest("[data-fk]"))) { S.fKhoa = el.dataset.fk; return render(); }
  if ((el = e.target.closest("[data-fn]"))) { S.fNganh = el.dataset.fn; return render(); }
  if ((el = e.target.closest("[data-reg],[data-cancel]"))) {
    const s = findSlot(el.dataset.reg || el.dataset.cancel);
    if (s) { if (el.dataset.reg) register(s); else cancel(s); }
  }
};

// =====================================================================  Trang 1: Tổng quan của tôi
function overviewMeHtml() {
  const min = S.cfg.minCa || 20, prior = Number(S.me.prior || 0), today = todayIso();
  const regs = [...S.myYear].sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca);
  const past = regs.filter((r) => r.date < today).length, upcoming = regs.length - past;
  const done = prior + past, total = prior + regs.length, short = Math.max(0, min - total);
  const pct = Math.min(100, Math.round((total / min) * 100));
  const rows = regs.map((r) => {
    const s = findSlot(r.slotId), ci = caInfo(r.ca), dot = S.dots.find((d) => d.id === r.dotId);
    return `<tr><td>${esc(fmtLong(r.date))}</td><td>Ca ${r.ca} · ${ci.start}</td><td>${s ? `K${esc(s.khoa)} ${esc(s.nganh)}` : ""}</td><td>${esc(s?.mon || "")}</td><td>${esc(dot?.name || "")}</td>
      <td><span class="pill ${r.date < today ? "ok" : "warn"}">${r.date < today ? "Đã gác" : "Sắp tới"}</span></td></tr>`;
  }).join("");
  return `<div class="card">
      <div class="muted">Xin chào <b>${esc(S.me.name || S.me.email)}</b> · Tổ ${esc(TO_LABEL[S.me.to] || "?")}</div>
      <div class="progress-row"><span class="big">${total} / ${min} ca</span>
        <span class="pill ${short ? "warn" : "ok"}">${short ? `Còn thiếu ${short} ca` : "Đã đủ số ca"}</span></div>
      <div class="bar ${short ? "" : "done"}"><i style="width:${pct}%"></i></div>
      <div class="muted">Năm học ${esc(S.cfg.namHoc || "")} (tính cả các đợt thi)</div>
    </div>
    <div class="kpis3">
      <div class="card kpi"><div class="small">Đã gác thi</div><div class="big">${done}</div><div class="small">gồm ${prior} ca trước khi dùng app</div></div>
      <div class="card kpi"><div class="small">Sắp tới</div><div class="big">${upcoming}</div><div class="small">đã đăng ký, chưa diễn ra</div></div>
      <div class="card kpi"><div class="small">Còn thiếu</div><div class="big">${short}</div><div class="small">để đủ ${min} ca</div></div>
    </div>
    <h2 class="sec">Các ca tôi đã đăng ký</h2>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Môn</th><th>Đợt</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">Bạn chưa đăng ký ca nào. Vào tab "Đăng ký ca thi" để chọn.</td></tr>`}</tbody></table></div>`;
}

// =====================================================================  Trang 2: Đăng ký ca thi (bảng giống file mẫu)
/** Lý do GV không đăng ký được ô này (null = được). cnt = số người đã đăng ký theo tổ của ca. */
function reason(s, cnt) {
  if (!isRegOpen(dotOf(s))) return "Đã đóng đăng ký";
  const to = S.me.to;
  if (!needOf(s, to)) return "Ca này không cần tổ của bạn";
  if ((cnt?.["t" + to] || 0) >= needOf(s, to)) return "Tổ của bạn đã đủ người";
  if (S.myYear.find((r) => r.date === s.date && r.ca === s.ca)) return "Bạn đã có ca khác cùng giờ";
  return null;
}

function registerHtml() {
  const dots = S.dots.filter((d) => statusOf(d) !== "SOAN").sort(openFirst);      // đợt đang soạn lịch chưa hiện cho GV
  if (!dots.length) return `<div class="card center muted">Hiện chưa có đợt thi nào mở đăng ký.</div>`;
  const all = dots.flatMap((d) => visibleSlots(d.id));
  const khoas = [...new Set(all.map((s) => s.khoa))].sort((a, b) => a - b);
  const nganhs = [...new Set(all.map((s) => s.nganh))].sort();
  const mine = new Set(S.myYear.map((r) => r.slotId));
  return `<div class="filters">
      <div class="fl">Lọc theo khoá</div>
      <div class="chips">${chipsHtml([["all", "Mọi khoá"], ...khoas.map((k) => [k, `Khoá ${k}` + (khoaNam(k) ? ` (năm ${khoaNam(k)})` : "")])], S.fKhoa, "fk")}</div>
      <div class="fl">Lọc theo ngành</div>
      <div class="chips">${chipsHtml([["all", "Mọi ngành"], ...nganhs.map((n) => [n, n])], S.fNganh, "fn")}</div>
    </div>
    <p class="legend"><span class="cell free sm">+</span> bấm để đăng ký · <span class="cell mine sm">✔</span> ca của bạn, bấm để huỷ · <b>X</b> đồng nghiệp đã đăng ký. Vuốt ngang để xem các ngày khác.</p>` +
    dots.map((d) => tableFor(d, mine)).join("");
}

const TO_SHORT_LABEL = TO_SHORT;
/** Một bảng = một đợt thi: cột = ca (ngày/ca/khoá-ngành), hàng = GV; giống tab xuất mẫu. */
function tableFor(d, mine) {
  const regs = S.regsBy[d.id] || [];
  const slots = visibleSlots(d.id)
    .filter((s) => (S.fKhoa === "all" || String(s.khoa) === S.fKhoa) && (S.fNganh === "all" || s.nganh === S.fNganh))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || a.nganh.localeCompare(b.nganh));
  const open = isRegOpen(d);
  const stLabel = statusOf(d) === "MO" && !open ? "Đã hết hạn đăng ký" : STATUS_LABEL[statusOf(d)];
  const head = `<div class="dot-head"><h2>${esc(d.name)}</h2><span class="pill ${open ? "ok" : "bad"}">${esc(stLabel)}</span>
    ${open && d.deadline ? `<span class="small">Hạn chót: ${esc(d.deadline.toDate().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" }))}</span>` : ""}</div>`;
  if (!slots.length) return `<section class="dot">${head}<div class="card muted center">${visibleSlots(d.id).length ? "Không có ca nào khớp bộ lọc." : "Chưa có ca nào trong đợt này."}</div></section>`;

  const cnt = {}, who = new Set(), perUser = {};
  for (const r of regs) {
    (cnt[r.slotId] ||= { t1: 0, t2: 0, t3: 0 })["t" + r.to]++;
    who.add(r.slotId + "|" + r.email);
    perUser[r.email] = (perUser[r.email] || 0) + 1;
  }
  const days = [];
  for (const s of slots) { const last = days.at(-1); if (last && last.date === s.date) last.n++; else days.push({ date: s.date, n: 1 }); }
  const rowDate = days.map((g) => `<th colspan="${g.n}" class="r0 date"><b>${dowOf(g.date)}</b><br>${dmOf(g.date)}</th>`).join("");
  const rowCa = slots.map((s) => `<th class="r1">Ca ${s.ca}<br><small>${caInfo(s.ca).start}</small></th>`).join("");
  const rowKn = slots.map((s) => `<th class="r2" title="${esc(s.mon || "")}">K${esc(s.khoa)}<br><small>${esc(s.nganh)}</small></th>`).join("");
  const rowLeft = slots.map((s) => {
    const need = needOf(s, S.me.to), left = need - (cnt[s.id]?.["t" + S.me.to] || 0);
    return `<th class="r3 ${!need ? "na" : left > 0 ? "okc" : "bad"}">${!need ? "–" : left > 0 ? `Còn ${left}` : "Đủ"}</th>`;
  }).join("");

  const meRow = S.roster.find((r) => r.email === S.me.email) || { name: S.me.name, to: S.me.to };
  const myCells = slots.map((s) => {
    if (who.has(s.id + "|" + S.me.email)) return `<td class="mine"><button class="cell mine" data-cancel="${esc(s.id)}" ${open ? "" : "disabled"} aria-label="Huỷ ca ${s.ca} ngày ${dmOf(s.date)}">✔</button></td>`;
    const why = reason(s, cnt[s.id]);
    return why ? `<td class="na" title="${esc(why)}"><span class="cell na">–</span></td>`
      : `<td><button class="cell free" data-reg="${esc(s.id)}" aria-label="Đăng ký ca ${s.ca} ngày ${dmOf(s.date)}">+</button></td>`;
  }).join("");
  const others = S.roster.filter((r) => r.email !== S.me.email).map((r) => {
    const cells = slots.map((s) => `<td>${who.has(s.id + "|" + r.email) ? '<span class="x">X</span>' : ""}</td>`).join("");
    return `<tr><th class="name">${esc(r.name)}<small>${esc(TO_SHORT_LABEL[r.to] || "")}</small></th>${cells}<td class="sum">${perUser[r.email] || 0}</td></tr>`;
  }).join("");

  const sumReg = slots.map((s) => `<td>${(cnt[s.id]?.t1 || 0) + (cnt[s.id]?.t2 || 0) + (cnt[s.id]?.t3 || 0)}</td>`).join("");
  const sumNeed = slots.map((s) => `<td title="${[1, 2, 3].filter((t) => needOf(s, t)).map((t) => TO_SHORT[t] + ": " + needOf(s, t)).join(", ")}">${needOf(s, 1) + needOf(s, 2) + needOf(s, 3)}</td>`).join("");
  const totReg = regs.filter((r) => slots.some((s) => s.id === r.slotId)).length;
  const totNeed = slots.reduce((a, s) => a + needOf(s, 1) + needOf(s, 2) + needOf(s, 3), 0);

  return `<section class="dot">${head}
    <div class="tbl-wrap"><table class="sheet">
      <thead>
        <tr><th class="name corner" rowspan="4">Họ tên GV</th>${rowDate}<th class="sum corner" rowspan="4">Cộng</th></tr>
        <tr>${rowCa}</tr><tr>${rowKn}</tr><tr>${rowLeft}</tr>
      </thead>
      <tbody>
        <tr class="me"><th class="name"><b>Bạn</b><br>${esc(meRow.name)}<small>${esc(TO_SHORT_LABEL[meRow.to] || "")}</small></th>${myCells}<td class="sum">${perUser[S.me.email] || 0}</td></tr>
        ${others}
      </tbody>
      <tfoot>
        <tr><th class="name">Tổng đăng ký</th>${sumReg}<td class="sum">${totReg}</td></tr>
        <tr><th class="name">SL được giao</th>${sumNeed}<td class="sum">${totNeed}</td></tr>
      </tfoot>
    </table></div></section>`;
}

/** Đăng ký: giữ một "chỗ" (claims) và ghi lượt đăng ký (regs) trong cùng một batch; luật Firestore bắt hai bên khớp nhau. */
async function register(s) {
  const to = S.me.to, email = S.me.email, ci = caInfo(s.ca);
  if (!confirm(`Đăng ký gác thi?\n\n${fmtLong(s.date)}\nCa ${s.ca}: bắt đầu ${ci.start} (có mặt lúc ${ci.arrive})\nKhoá ${s.khoa} - ${s.nganh}${s.mon ? "\n" + s.mon : ""}`)) return;
  const regId = `${s.date}_${s.ca}__${email}`;
  const need = needOf(s, to);
  const used = new Set((S.regsBy[s.dotId] || []).filter((r) => r.slotId === s.id && r.to === to).map((r) => r.k));
  const order = Array.from({ length: need }, (_, i) => i + 1).sort((a, b) => used.has(a) - used.has(b)); // chỗ trống trước
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
  if (!confirm(`Huỷ đăng ký?\n\n${fmtLong(s.date)} · Ca ${s.ca} (${ci.start}) · Khoá ${s.khoa} - ${s.nganh}`)) return;
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

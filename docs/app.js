import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---- Hằng số ----
const TO_LABEL = { 1: "Chuyên 1 (SPA)", 2: "Chuyên 2 (NNA)", 3: "Cơ bản" };
const DEFAULT_CA = { 1: { start: "07:30", arrive: "07:15" }, 2: { start: "09:00", arrive: "08:45" }, 3: { start: "13:30", arrive: "13:15" }, 4: { start: "15:00", arrive: "14:45" } };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const S = { usedDefault: false, settings: false, user: null, me: null, cfg: null, dots: [], slotsBy: {}, regsBy: {}, roster: [], teachersAll: [], adminFilter: "all", myYear: [], fKhoa: "all", fNganh: "all", view: "all", unsub: [], unsubDots: {} };

const caInfo = (ca) => (S.cfg?.caTimes?.[ca]) || DEFAULT_CA[ca] || { start: "", arrive: "" };

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 4500);
}
function show(id) {
  for (const x of ["login", "denied", "app", "loading"]) $(x).hidden = x !== id;
  $("userBox").hidden = !S.user;
}

// ---- Auth ----
const EMAIL_KEY = "gacthi.email";
const DEFAULT_PW = "chuyen1";   // khớp với "matKhauMacDinh" trong tab CauHinh; chỉ dùng để nhắc GV đổi mật khẩu
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

// Ô email luôn nhớ email lần trước
$("email").value = store.get(EMAIL_KEY);
$("showPw").onchange = (e) => ($("pw").type = e.target.checked ? "text" : "password");

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase(), pw = $("pw").value;
  $("loginErr").textContent = "";
  S.usedDefault = pw === DEFAULT_PW;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    store.set(EMAIL_KEY, email);
    $("pw").value = "";
  } catch (err) { S.usedDefault = false; $("loginErr").textContent = authMsg(err.code); }
};
$("btnForgot").onclick = async () => {
  const email = $("email").value.trim().toLowerCase();
  if (!email) { $("loginErr").textContent = "Nhập email của bạn trước, rồi bấm 'Quên mật khẩu?'."; return; }
  try { await sendPasswordResetEmail(auth, email); toast("Đã gửi thư đặt lại mật khẩu tới " + email); }
  catch (err) { $("loginErr").textContent = authMsg(err.code); }
};
$("btnOut").onclick = $("btnOut2").onclick = () => { S.usedDefault = false; S.settings = false; signOut(auth); };

// Cài đặt: đổi mật khẩu
const openSettings = (v) => { S.settings = v; render(); if (v) $("settings").scrollIntoView({ behavior: "smooth" }); };
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
    S.usedDefault = false; $("pwForm").reset(); openSettings(false);
    toast("Đã đổi mật khẩu.");
  } catch (err) { $("pwErr").textContent = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "Mật khẩu hiện tại chưa đúng." : authMsg(err.code); }
};

onAuthStateChanged(auth, async (u) => {
  S.unsub.forEach((f) => f()); S.unsub = [];
  Object.values(S.unsubDots).forEach((f) => f()); S.unsubDots = {};
  S.user = u; S.me = null; S.dots = []; S.slotsBy = {}; S.regsBy = {}; S.roster = []; S.myYear = []; S.teachersAll = [];
  if (!u) return show("login");
  show("loading");
  const email = u.email.toLowerCase();
  const t = await getDoc(doc(db, "teachers", email));
  if (!t.exists()) { $("deniedEmail").textContent = email; return show("denied"); }
  S.me = { email, ...t.data() };
  const c = await getDoc(doc(db, "config", "main"));
  S.cfg = c.exists() ? c.data() : { minCa: 20 };

  S.unsub.push(onSnapshot(doc(db, "config", "main"), (d) => { S.cfg = d.data() || S.cfg; render(); }));
  // Danh sách GV (tên + tổ) để vẽ các hàng của bảng
  S.unsub.push(onSnapshot(collection(db, "roster"), (qs) => {
    S.roster = qs.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    render();
  }));
  // Quản trị (x) thấy mọi GV; tổ trưởng (tt) chỉ thấy GV cùng tổ. Luật Firestore cũng ép đúng như vậy.
  if (S.me.admin || S.me.lead) {
    const q = S.me.admin ? collection(db, "teachers") : query(collection(db, "teachers"), where("to", "==", S.me.to));
    S.unsub.push(onSnapshot(q, (qs) => { S.teachersAll = qs.docs.map((d) => ({ email: d.id, ...d.data() })); render(); }));
  }
  // Các đợt thi của năm học hiện tại: mỗi đợt một bảng, mỗi đợt có listener riêng
  S.unsub.push(onSnapshot(collection(db, "dots"), (qs) => {
    S.dots = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.namHoc === S.cfg.namHoc);
    const ids = new Set(S.dots.map((d) => d.id));
    for (const id of Object.keys(S.unsubDots)) if (!ids.has(id)) { S.unsubDots[id](); delete S.unsubDots[id]; delete S.slotsBy[id]; delete S.regsBy[id]; }
    for (const id of ids) if (!S.unsubDots[id]) subscribeDot(id);
    render();
  }));
  // Tổng số ca của tôi trong cả năm học (mọi đợt)
  S.unsub.push(onSnapshot(query(collection(db, "regs"), where("email", "==", email), where("namHoc", "==", S.cfg.namHoc || "")), (qs) => {
    S.myYear = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }));
  show("app");
});

function subscribeDot(id) {
  const a = onSnapshot(query(collection(db, "slots"), where("dotId", "==", id)), (qs) => {
    S.slotsBy[id] = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.active !== false);
    render();
  });
  const b = onSnapshot(query(collection(db, "regs"), where("dotId", "==", id)), (qs) => {
    S.regsBy[id] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  S.unsubDots[id] = () => { a(); b(); };
}

// ---- Logic ----
const mySlotIds = () => new Set(S.myYear.map((r) => r.slotId));
const isOpen = (d) => !!d && d.open === true && (!d.deadline || d.deadline.toMillis() > Date.now());
const khoaNam = (k) => (S.cfg.khoaNam1 ? S.cfg.khoaNam1 - k + 1 : null);
const DOW = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const dowOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()]; };
const dmOf = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };
const fmtLong = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${dowOf(iso).toLowerCase() === "cn" ? "Chủ nhật" : dowOf(iso).toLowerCase()} ngày ${d}/${m}/${y}`; };
const needOf = (s, to) => s.need?.["t" + to] || 0;
const findSlot = (id) => Object.values(S.slotsBy).flat().find((s) => s.id === id);
const dotOf = (s) => S.dots.find((d) => d.id === s.dotId);

/** Lý do GV không đăng ký được ô này (null = được). cnt = đếm số người đã đăng ký theo tổ của ca. */
function reason(s, cnt) {
  if (!isOpen(dotOf(s))) return "Đã đóng đăng ký";
  const to = S.me.to;
  if (!needOf(s, to)) return "Ca này không cần tổ của bạn";
  if ((cnt?.["t" + to] || 0) >= needOf(s, to)) return "Tổ của bạn đã đủ người";
  if (S.myYear.find((r) => r.date === s.date && r.ca === s.ca)) return "Bạn đã có ca khác cùng giờ";
  return null;
}

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

// ---- Render ----
function chips(el, items, cur, onPick) {
  el.innerHTML = items.map(([v, l]) => `<button class="chip ${String(v) === String(cur) ? "on" : ""}" data-v="${esc(v)}">${esc(l)}</button>`).join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => onPick(b.dataset.v)));
}

const TO_SHORT = { 1: "SPA", 2: "NNA", 3: "Cơ bản" };

/** Một bảng = một đợt thi, dựng giống tab xuất mẫu: cột = ca (ngày/ca/khoá-ngành), hàng = GV. */
function tableFor(d, mine) {
  const all = S.slotsBy[d.id] || [], regs = S.regsBy[d.id] || [];
  const slots = all.filter((s) =>
    (S.fKhoa === "all" || String(s.khoa) === S.fKhoa) &&
    (S.fNganh === "all" || s.nganh === S.fNganh) &&
    (S.view === "all" || mine.has(s.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ca - b.ca || a.khoa - b.khoa || a.nganh.localeCompare(b.nganh));

  const open = isOpen(d);
  const head = `<div class="dot-head"><h2>${esc(d.name)}</h2>
    <span class="pill ${open ? "ok" : "bad"}">${open ? "Đang mở đăng ký" : "Đã đóng"}</span>
    ${open && d.deadline ? `<span class="small">Hạn chót: ${esc(d.deadline.toDate().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" }))}</span>` : ""}</div>`;
  if (!slots.length) return `<section class="dot">${head}<div class="card muted center">${all.length ? "Không có ca nào khớp bộ lọc." : "Chưa có ca nào trong đợt này."}</div></section>`;

  // đếm theo ca: số người đã đăng ký mỗi tổ + ai đã đăng ký
  const cnt = {}, who = new Set(), perUser = {};
  for (const r of regs) {
    (cnt[r.slotId] ||= { t1: 0, t2: 0, t3: 0 })["t" + r.to]++;
    who.add(r.slotId + "|" + r.email);
    perUser[r.email] = (perUser[r.email] || 0) + 1;
  }

  // hàng tiêu đề: ngày (gộp cột) / ca / khoá-ngành / chỗ còn lại của tổ bạn
  const days = [];
  for (const s of slots) { const last = days.at(-1); if (last && last.date === s.date) last.n++; else days.push({ date: s.date, n: 1 }); }
  const rowDate = days.map((g) => `<th colspan="${g.n}" class="r0 date"><b>${dowOf(g.date)}</b><br>${dmOf(g.date)}</th>`).join("");
  const rowCa = slots.map((s) => `<th class="r1">Ca ${s.ca}<br><small>${caInfo(s.ca).start}</small></th>`).join("");
  const rowKn = slots.map((s) => `<th class="r2" title="${esc(s.mon || "")}">K${esc(s.khoa)}<br><small>${esc(s.nganh)}</small></th>`).join("");
  const rowLeft = slots.map((s) => {
    const need = needOf(s, S.me.to), left = need - (cnt[s.id]?.["t" + S.me.to] || 0);
    return `<th class="r3 ${!need ? "na" : left > 0 ? "okc" : "bad"}">${!need ? "–" : left > 0 ? `Còn ${left}` : "Đủ"}</th>`;
  }).join("");

  // hàng của tôi (nút bấm) + hàng các GV khác (chữ X)
  const meRow = S.roster.find((r) => r.email === S.me.email) || { email: S.me.email, name: S.me.name, to: S.me.to };
  const myCells = slots.map((s) => {
    if (who.has(s.id + "|" + S.me.email)) return `<td class="mine"><button class="cell mine" data-cancel="${esc(s.id)}" ${open ? "" : "disabled"} aria-label="Huỷ ca ${s.ca} ngày ${dmOf(s.date)}">✔</button></td>`;
    const why = reason(s, cnt[s.id]);
    return why ? `<td class="na" title="${esc(why)}"><span class="cell na">–</span></td>`
      : `<td><button class="cell free" data-reg="${esc(s.id)}" aria-label="Đăng ký ca ${s.ca} ngày ${dmOf(s.date)}">+</button></td>`;
  }).join("");
  const myTotal = perUser[S.me.email] || 0;
  const others = S.roster.filter((r) => r.email !== S.me.email).map((r, i) => {
    const cells = slots.map((s) => `<td>${who.has(s.id + "|" + r.email) ? '<span class="x">X</span>' : ""}</td>`).join("");
    return `<tr><th class="name">${esc(r.name)}<small>${esc(TO_SHORT[r.to] || "")}</small></th>${cells}<td class="sum">${perUser[r.email] || 0}</td></tr>`;
  }).join("");

  // chân bảng: tổng đăng ký / số lượng được giao
  const sumReg = slots.map((s) => `<td>${(cnt[s.id]?.t1 || 0) + (cnt[s.id]?.t2 || 0) + (cnt[s.id]?.t3 || 0)}</td>`).join("");
  const sumNeed = slots.map((s) => `<td title="${[1, 2, 3].filter((t) => needOf(s, t)).map((t) => TO_SHORT[t] + ": " + needOf(s, t)).join(", ")}">${needOf(s, 1) + needOf(s, 2) + needOf(s, 3)}</td>`).join("");
  const totReg = regs.filter((r) => slots.some((s) => s.id === r.slotId)).length;
  const totNeed = slots.reduce((a, s) => a + needOf(s, 1) + needOf(s, 2) + needOf(s, 3), 0);

  return `<section class="dot">${head}
    <div class="tbl-wrap"><table class="sheet">
      <thead>
        <tr><th class="name corner" rowspan="4">Họ tên GV</th>${rowDate}<th class="sum corner" rowspan="4">Cộng</th></tr>
        <tr>${rowCa}</tr><tr>${rowKn}</tr>
        <tr>${rowLeft}</tr>
      </thead>
      <tbody>
        <tr class="me"><th class="name"><b>Bạn</b><br>${esc(meRow.name)}<small>${esc(TO_SHORT[meRow.to] || "")}</small></th>${myCells}<td class="sum">${myTotal}</td></tr>
        ${others}
      </tbody>
      <tfoot>
        <tr><th class="name">Tổng đăng ký</th>${sumReg}<td class="sum">${totReg}</td></tr>
        <tr><th class="name">SL được giao</th>${sumNeed}<td class="sum">${totNeed}</td></tr>
      </tfoot>
    </table></div></section>`;
}

function render() {
  if (!S.me || !S.cfg || $("app").hidden) return;
  const min = S.cfg.minCa || 20;
  const prior = Number(S.me.prior || 0), now = S.myYear.length, total = prior + now;
  const pct = Math.min(100, Math.round((total / min) * 100));
  $("progress").innerHTML = `
    <div class="muted">Xin chào <b>${esc(S.me.name || S.me.email)}</b> · Tổ ${esc(TO_LABEL[S.me.to] || "?")}</div>
    <div class="progress-row"><span class="big">${total} / ${min} ca</span>
      <span class="pill ${total >= min ? "ok" : "warn"}">${total >= min ? "Đã đủ số ca" : `Còn thiếu ${min - total} ca`}</span></div>
    <div class="bar ${total >= min ? "done" : ""}"><i style="width:${pct}%"></i></div>
    <div class="muted">Năm học ${esc(S.cfg.namHoc || "")}: đã gác trước đó ${prior} ca · đã đăng ký trên app ${now} ca</div>`;
  const canManage = !!(S.me.admin || S.me.lead);
  $("tabAdmin").hidden = !canManage;
  if (S.view === "admin" && !canManage) S.view = "all";
  $("filters").hidden = S.view === "admin";
  $("pwBanner").hidden = !S.usedDefault || S.settings;
  $("settings").hidden = !S.settings;
  $("termLabel").textContent = "Khoa Ngoại ngữ · Năm học " + (S.cfg.namHoc || "");

  const dots = [...S.dots].sort((a, b) => (isOpen(b) - isOpen(a)) || (b.order || 0) - (a.order || 0)); // đợt đang mở lên đầu
  const allSlots = dots.flatMap((d) => S.slotsBy[d.id] || []);
  const khoas = [...new Set(allSlots.map((s) => s.khoa))].sort((a, b) => a - b);
  const nganhs = [...new Set(allSlots.map((s) => s.nganh))].sort();
  chips($("fKhoa"), [["all", "Mọi khoá"], ...khoas.map((k) => [k, `Khoá ${k}` + (khoaNam(k) ? ` (năm ${khoaNam(k)})` : "")])], S.fKhoa, (v) => { S.fKhoa = v; render(); });
  chips($("fNganh"), [["all", "Mọi ngành"], ...nganhs.map((n) => [n, n])], S.fNganh, (v) => { S.fNganh = v; render(); });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("on", b.dataset.view === S.view);
    b.onclick = () => { S.view = b.dataset.view; render(); };
  });

  if (S.view === "admin") { $("list").innerHTML = overviewHtml(dots); return; }
  if (!dots.length) { $("list").innerHTML = `<div class="card center muted">Chưa có đợt thi nào.</div>`; return; }
  // giữ vị trí cuộn ngang của từng bảng khi dữ liệu cập nhật realtime
  const scroll = [...$("list").querySelectorAll(".tbl-wrap")].map((w) => [w.scrollLeft, w.scrollTop]);
  const mine = mySlotIds();
  $("list").innerHTML = `<p class="legend"><span class="cell free sm">+</span> bấm để đăng ký · <span class="cell mine sm">✔</span> ca của bạn, bấm để huỷ · <b>X</b> đồng nghiệp đã đăng ký. Vuốt ngang để xem các ngày khác.</p>` +
    dots.map((d) => tableFor(d, mine)).join("");
  $("list").querySelectorAll(".tbl-wrap").forEach((w, i) => { if (scroll[i]) { w.scrollLeft = scroll[i][0]; w.scrollTop = scroll[i][1]; } });
}

$("list").onclick = (e) => {
  const f = e.target.closest("[data-af]");
  if (f) { S.adminFilter = f.dataset.af; render(); return; }
  if (e.target.closest("#btnCsv")) { downloadCsv(); return; }
  const b = e.target.closest("[data-reg],[data-cancel]");
  if (!b) return;
  const s = findSlot(b.dataset.reg || b.dataset.cancel);
  if (!s) return;
  if (b.dataset.reg) register(s); else cancel(s);
};

// ---- Tổng quan cho quản trị / tổ trưởng ----
/** Dữ liệu tổng quan trong phạm vi của người xem: toàn khoa (admin) hoặc riêng tổ của tổ trưởng. */
function overviewData(dots) {
  const scope = S.me.admin ? null : S.me.to;               // null = toàn khoa
  const tos = scope ? [scope] : [1, 2, 3];
  const min = S.cfg.minCa || 20;
  const byTo = Object.fromEntries(tos.map((t) => [t, { need: 0, taken: 0 }]));
  const perUser = {};
  const dotRows = [], missing = [];
  for (const d of dots) {
    const slots = S.slotsBy[d.id] || [], regs = S.regsBy[d.id] || [];
    const cnt = {};
    for (const r of regs) { (cnt[r.slotId] ||= { 1: 0, 2: 0, 3: 0 })[r.to]++; perUser[r.email] = (perUser[r.email] || 0) + 1; }
    let need = 0, taken = 0, full = 0;
    for (const s of slots) {
      let ok = true; const miss = [];
      for (const t of tos) {
        const n = needOf(s, t), c = cnt[s.id]?.[t] || 0;
        need += n; taken += Math.min(c, n); byTo[t].need += n; byTo[t].taken += Math.min(c, n);
        if (c < n) { ok = false; miss.push([t, n - c]); }
      }
      if (ok) full++; else missing.push({ d, s, miss });
    }
    dotRows.push({ d, slots: slots.length, need, taken, full });
  }
  const people = S.teachersAll.filter((t) => !scope || t.to === scope).map((t) => {
    const reg = perUser[t.email] || 0, total = Number(t.prior || 0) + reg;
    return { email: t.email, name: t.name, to: t.to, prior: Number(t.prior || 0), reg, total, short: Math.max(0, min - total) };
  }).sort((a, b) => b.short - a.short || a.name.localeCompare(b.name, "vi"));
  missing.sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.ca - b.s.ca);
  return { scope, tos, min, byTo, dotRows, missing, people };
}

function overviewHtml(dots) {
  const o = overviewData(dots);
  const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
  const scopeLabel = o.scope ? `Tổ ${TO_LABEL[o.scope]}` : "Toàn khoa";
  const cards = o.dotRows.map(({ d, slots, need, taken, full }) => `
    <div class="card kpi"><div class="dot-head"><h2>${esc(d.name)}</h2><span class="pill ${isOpen(d) ? "ok" : "bad"}">${isOpen(d) ? "Đang mở" : "Đã đóng"}</span></div>
      <div class="big">${taken} / ${need} <span class="small">chỗ đã có người (${pct(taken, need)}%)</span></div>
      <div class="bar ${taken >= need && need ? "done" : ""}"><i style="width:${pct(taken, need)}%"></i></div>
      <div class="small">${slots} ca · ${full} ca đã đủ người · ${slots - full} ca còn thiếu</div></div>`).join("");
  const toRows = o.tos.map((t) => { const x = o.byTo[t]; return `<tr><td>${esc(TO_LABEL[t])}</td><td>${x.need}</td><td>${x.taken}</td><td class="${x.need - x.taken > 0 ? "bad" : "okc"}">${Math.max(0, x.need - x.taken)}</td></tr>`; }).join("");
  const missRows = o.missing.map(({ d, s, miss }) => `<tr><td>${esc(d.name)}</td><td>${dowOf(s.date)} ${dmOf(s.date)}</td><td>Ca ${s.ca} (${caInfo(s.ca).start})</td><td>K${esc(s.khoa)} ${esc(s.nganh)}</td><td>${miss.map(([t, n]) => `${esc(TO_SHORT[t])} thiếu ${n}`).join(", ")}</td></tr>`).join("");
  const shown = o.people.filter((p) => S.adminFilter === "all" || p.short > 0);
  const pplRows = shown.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(TO_SHORT[p.to] || "")}</td><td>${p.prior}</td><td>${p.reg}</td><td><b>${p.total}</b> / ${o.min}</td><td class="${p.short ? "bad" : "okc"}">${p.short ? "Thiếu " + p.short : "Đủ"}</td></tr>`).join("");
  const nShort = o.people.filter((p) => p.short > 0).length;
  return `<div class="card"><b>Phạm vi xem:</b> ${esc(scopeLabel)}${S.me.admin ? "" : " (tổ trưởng chỉ xem tổ của mình)"}</div>
    <div class="kpis">${cards || '<div class="card muted">Chưa có đợt thi nào.</div>'}</div>
    <h2 class="sec">Chỉ tiêu theo tổ</h2>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Tổ</th><th>Cần</th><th>Đã đăng ký</th><th>Còn thiếu</th></tr></thead><tbody>${toRows}</tbody></table></div>
    <h2 class="sec">Ca còn thiếu người <span class="small">(${o.missing.length} ca)</span></h2>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Đợt</th><th>Ngày</th><th>Ca</th><th>Khoá - Ngành</th><th>Còn thiếu</th></tr></thead><tbody>${missRows || '<tr><td colspan="5" class="okc">Mọi ca đều đủ người.</td></tr>'}</tbody></table></div>
    <h2 class="sec">Giảng viên (mức tối thiểu ${o.min} ca/năm học)</h2>
    <div class="chips"><button class="chip ${S.adminFilter === "all" ? "on" : ""}" data-af="all">Tất cả (${o.people.length})</button>
      <button class="chip ${S.adminFilter === "short" ? "on" : ""}" data-af="short">Chưa đủ ${o.min} ca (${nShort})</button>
      <button class="chip" id="btnCsv">Tải CSV</button></div>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>Họ tên</th><th>Tổ</th><th>Trước đó</th><th>Đăng ký</th><th>Tổng</th><th>Tình trạng</th></tr></thead><tbody>${pplRows || '<tr><td colspan="6" class="muted">Không có GV nào.</td></tr>'}</tbody></table></div>`;
}

function downloadCsv() {
  const o = overviewData([...S.dots]);
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Họ tên", "Email", "Tổ", "Số ca trước đó", "Số ca đăng ký", "Tổng", "Còn thiếu"].map(q).join(",")]
    .concat(o.people.map((p) => [p.name, p.email, TO_LABEL[p.to] || p.to, p.prior, p.reg, p.total, p.short].map(q).join(",")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `tong-quan-gac-thi-${S.cfg.namHoc || ""}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}

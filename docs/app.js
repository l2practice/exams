// Đăng nhập, nạp dữ liệu realtime, khung ứng dụng (thanh bên, tiêu đề) và điều hướng giữa các trang.
import {
  signInWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { resetUrl } from "./firebase-config.js";
import { auth, db, S, $, esc, toast, TO_LABEL, TO_SHORT, isManager, statusOf } from "./core.js";
import { IC, LOGO, icon } from "./icons.js";
import { overviewHtml, mineHtml, registerHtml, meClick, meChange, afterRender } from "./me.js";
import { statsHtml, addHtml, slotsHtml, refreshAddList, refreshAddPeriods, endYearFromSettings, manageClick, manageChange } from "./manage.js";

// =====================================================================  Đăng nhập
const EMAIL_KEY = "gacthi.email";
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } },
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
  for (const x of ["login", "denied", "loading"]) $(x).hidden = x !== id;
  $("authWrap").hidden = id === "app";
  $("app").hidden = id !== "app";
}
// biểu tượng cố định
$("heroIc").innerHTML = LOGO; $("icMail").innerHTML = IC.mail; $("icLock").innerHTML = IC.lock; $("btnEye").innerHTML = IC.eye; $("icChev").innerHTML = IC.chevron;

$("email").value = store.get(EMAIL_KEY);                // ô email nhớ email lần trước
S.regView = ["list", "matrix", "grid"].includes(store.get("gacthi.regView")) ? store.get("gacthi.regView") : "list";
S.mineView = ["table", "list", "week"].includes(store.get("gacthi.mineView")) ? store.get("gacthi.mineView") : "table";
$("btnEye").onclick = () => { const p = $("pw"); p.type = p.type === "password" ? "text" : "password"; $("btnEye").setAttribute("aria-label", p.type === "password" ? "Hiện mật khẩu" : "Ẩn mật khẩu"); };

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase(), pw = $("pw").value;
  $("loginErr").textContent = ""; $("loginInfo").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    if ($("remember").checked) store.set(EMAIL_KEY, email); else store.del(EMAIL_KEY);
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

$("btnOut").onclick = $("btnOut2").onclick = $("btnOutSet").onclick = () => { $("userMenu").hidden = true; signOut(auth); };

// =====================================================================  Điều hướng
const ROUTES = {
  "me:overview": { label: "Tổng quan", short: "Tổng quan", title: "Tổng quan", icon: "home" },
  "me:register": { label: "Đăng ký ca thi", short: "Đăng ký", title: "Đăng ký ca thi", icon: "calendarCheck" },
  "me:mine": { label: "Ca của tôi", short: "Của tôi", title: "Ca của tôi", icon: "listCheck" },
  "me:history": { label: "Lịch sử gác thi", short: "Lịch sử", title: "Lịch sử gác thi", icon: "history" },
  "mg:stats": { label: "Thống kê giảng viên", short: "Thống kê", title: "Thống kê giảng viên", icon: "users" },
  "mg:add": { label: "Thêm ca thi mới", short: "Thêm ca", title: "Thêm ca thi mới", icon: "calendarPlus" },
  "mg:slots": { label: "Danh sách ca thi", short: "Danh sách", title: "Danh sách ca thi", icon: "list" },
  "settings": { label: "Cài đặt", short: "Cài đặt", title: "Cài đặt", icon: "settings" },
};
const defaultRoute = () => (S.me.pwTemp ? "settings" : isManager() ? "mg:stats" : "me:overview");   // còn dùng mật khẩu do Khoa cấp → mở Cài đặt trước

function go(route) {
  S.route = route;
  $("userMenu").hidden = true;
  render();
  window.scrollTo({ top: 0 });
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { go(g.dataset.go); return; }
  const n = e.target.closest("[data-nav]");
  if (n) { go(n.dataset.nav); return; }
  if (!e.target.closest("#userBtn,#userMenu")) $("userMenu").hidden = true;
});
$("userBtn").onclick = () => { $("userMenu").hidden = !$("userMenu").hidden; };
$("btnPwNow").onclick = () => go("settings");
$("btnSetClose").onclick = () => go(isManager() ? "mg:stats" : "me:overview");

const initials = (n) => String(n || "?").trim().split(/\s+/).slice(-2).map((w) => w[0] || "").join("").toUpperCase();
const roleLabel = () => (S.me.admin ? "Quản trị toàn khoa" : S.me.leadTo ? `Tổ trưởng – Tổ ${TO_LABEL[S.me.leadTo]}` : `Giảng viên – Tổ ${TO_LABEL[S.me.to] || ""}`);
const scopeText = () => (S.me.admin ? "Phạm vi: cả 3 tổ" : "Phạm vi: tổ mình");

function navHtml() {
  const item = (k, cls = "") => `<button class="nav-item ${cls} ${S.route === k ? "active" : k === "me:mine" && S.route === "me:history" ? "also" : ""}" data-nav="${k}" ${S.route === k ? 'aria-current="page"' : ""}>${icon(ROUTES[k].icon)}<span>${esc(ROUTES[k].short)}</span></button>`;
  const full = (k, cls = "") => item(k, cls).replace(`<span>${esc(ROUTES[k].short)}</span>`, `<span>${esc(ROUTES[k].label)}</span>`);
  let h = full("me:overview") + full("me:register") + full("me:mine") + full("me:history", "d-only");
  if (isManager()) {
    h += `<div class="nav-group d-only">${icon("users")}Quản lý</div>` + ["mg:stats", "mg:add", "mg:slots"].map((k) => full(k, "nav-sub d-only")).join("");
    h += `<button class="nav-item m-only ${S.route.startsWith("mg:") ? "active" : ""}" data-nav="mg:stats">${icon("users")}<span>Quản lý</span></button>`;   // điện thoại: một mục gọn
  }
  return h + full("settings");
}

function render() {
  if (!S.me || !S.cfg || $("app").hidden) return;
  const mgr = isManager();
  if (!ROUTES[S.route] || (S.route.startsWith("mg:") && !mgr)) S.route = defaultRoute();
  const r = ROUTES[S.route];

  $("awNav").innerHTML = navHtml();
  $("awPageTitle").textContent = r.title;
  $("awSub").textContent = S.route.startsWith("mg:") ? `${roleLabel()} · ${scopeText()}` : "";
  $("awYearBadge").textContent = S.cfg.namHoc ? `Năm học ${S.cfg.namHoc}` : "";
  $("awAvatar").textContent = initials(S.me.name);
  $("awUserName").textContent = $("awUserName2").textContent = S.me.name || S.me.email;
  $("awUserRole").textContent = roleLabel();
  $("pwBanner").hidden = !S.me.pwTemp || S.route === "settings";
  // điện thoại: ba trang Quản lý chuyển qua lại bằng thanh chọn phía trên (thanh dưới chỉ có một mục "Quản lý")
  $("subnav").hidden = !S.route.startsWith("mg:");
  if (!$("subnav").hidden) $("subnav").innerHTML = ["mg:stats", "mg:add", "mg:slots"].map((k) => `<button class="${S.route === k ? "on" : ""}" data-go="${k}">${esc(ROUTES[k].short)}</button>`).join("");
  $("settings").hidden = S.route !== "settings";
  $("yearEndPanel").hidden = !(S.route === "settings" && S.me.admin);
  $("page").hidden = S.route === "settings";
  if (S.route === "settings") {
    $("yearEndCurrent").textContent = S.cfg.namHoc || "";
    return;
  }

  const page = $("page");
  if (S.route === "mg:add") {                       // trang có ô nhập: không vẽ lại cả trang khi dữ liệu realtime đổi
    if (!$("addForm") || (!$("addDot") && S.dots.some((d) => ["SOAN", "MO"].includes(statusOf(d))))) page.innerHTML = addHtml();
    refreshAddPeriods();
    return;
  }
  if (S.route === "mg:slots") {
    if (!$("slotsPage")) page.innerHTML = slotsHtml();
    refreshAddList();
    return;
  }
  const scroll = [...page.querySelectorAll(".tbl-wrap")].map((w) => [w.scrollLeft, w.scrollTop]);
  page.innerHTML = { "me:overview": overviewHtml, "me:mine": () => mineHtml("upcoming"), "me:history": () => mineHtml("past"), "me:register": registerHtml, "mg:stats": statsHtml }[S.route]();
  page.querySelectorAll(".tbl-wrap").forEach((w, i) => { if (scroll[i] && w.id !== "pvwrap") { w.scrollLeft = scroll[i][0]; w.scrollTop = scroll[i][1]; } });
  if (S.route === "me:register") afterRender();
}
S.render = render;

$("page").onclick = (e) => { if (manageClick(e)) return; meClick(e, { store }); };
$("page").onchange = (e) => { if (manageChange(e)) return; meChange(e); };
$("btnEndYear").onclick = () => endYearFromSettings();

// =====================================================================  Cài đặt: đổi mật khẩu
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
    $("pwForm").reset(); go(isManager() ? "mg:stats" : "me:overview");
    toast("Đã đổi mật khẩu.");
  } catch (err) { $("pwErr").textContent = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "Mật khẩu hiện tại chưa đúng." : authMsg(err.code); }
};

// =====================================================================  Nạp dữ liệu
onAuthStateChanged(auth, async (u) => {
  S.unsub.forEach((f) => f()); S.unsub = [];
  Object.values(S.unsubDots).forEach((f) => f()); S.unsubDots = {};
  Object.assign(S, { teachersLoaded: false, dotsLoaded: false, user: u, me: null, dots: [], slotsBy: {}, regsBy: {}, roster: [], myYear: [], teachersAll: [], openGv: null, pick: null });
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
  S.teachersLoaded = !(S.me.admin || S.me.leadTo);
  if (S.me.admin || S.me.leadTo) {
    const q = S.me.admin ? collection(db, "teachers") : query(collection(db, "teachers"), where("to", "==", S.me.leadTo));
    S.unsub.push(onSnapshot(q, (qs) => { S.teachersAll = qs.docs.map((d) => ({ email: d.id, ...d.data() })); S.teachersLoaded = true; S.render(); }));
  }
  // Các đợt thi của năm học hiện tại; mỗi đợt có listener riêng cho ca thi và đăng ký
  S.unsub.push(onSnapshot(collection(db, "dots"), (qs) => {
    S.dots = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.namHoc === S.cfg.namHoc).sort((a, b) => (a.order || 0) - (b.order || 0));
    const ids = new Set(S.dots.map((d) => d.id));
    for (const id of Object.keys(S.unsubDots)) if (!ids.has(id)) { S.unsubDots[id](); delete S.unsubDots[id]; delete S.slotsBy[id]; delete S.regsBy[id]; }
    for (const id of ids) if (!S.unsubDots[id]) subscribeDot(id);
    S.dotsLoaded = true;
    S.render();
  }));
  // Mọi ca của tôi trong cả năm học (mọi đợt)
  S.unsub.push(onSnapshot(query(collection(db, "regs"), where("email", "==", email), where("namHoc", "==", S.cfg.namHoc || "")), (qs) => {
    S.myYear = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    S.render();
  }));
  S.route = defaultRoute();
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

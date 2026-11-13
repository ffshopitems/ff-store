const API_BASE = "https://ffshoploginapi.minahilbirthday.workers.dev";
const $ = id => document.getElementById(id);
let videos = [];
let cart = [];
let activePage = "home";
let activeFilter = "All";
let currentUser = null;
let sessionToken = sessionStorage.getItem("ffshop_session") || "";
let authMode = "login";
let toastTimer;

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = "none", 2800);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function videoCard(item) {
  const price = item.price ? `<span class="price">Rs. ${Number(item.price).toLocaleString("en-PK")}</span>` : `<span class="price">Price on request</span>`;
  return `<article class="video-card" data-id="${item.id}">
    <div class="video-frame"><video controls playsinline preload="metadata" src="${item.url}"></video></div>
    <div class="video-meta">
      <div class="video-meta-top"><h3>${escapeHTML(item.title)}</h3>${price}</div>
      ${item.description ? `<p class="description">${escapeHTML(item.description)}</p>` : ""}
      <div class="video-actions"><span class="video-category">${escapeHTML(item.category)}</span>
      <div class="customer-actions"><button data-like="${item.id}">♡ Like</button><button data-comment="${item.id}">Comment</button><button data-cart="${item.id}">Add to bag</button><button class="buy-now-btn" data-buy="${item.id}">Buy Now</button></div>
      ${currentUser?.isAdmin ? `<details class="admin-menu"><summary aria-label="Admin video options">⋮</summary><button data-delete="${item.id}">Delete video</button></details>` : ""}
      </div>
    </div></article>`;
}
function renderVideos(target, list) {
  const el = $(target);
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><span>▶</span><h3>No videos here yet</h3><p>Gaming videos uploaded to FF Shop will appear here.</p></div>`;
    return;
  }
  el.innerHTML = list.map(videoCard).join("");
}
function renderAll() {
  renderVideos("homeVideos", videos);
  renderVideos("shopVideos", videos.filter(v => activeFilter === "All" || v.category === activeFilter));
  searchVideos();
}
function searchVideos() {
  const input = $("searchInput");
  const query = (input?.value || "").trim().toLowerCase();
  const found = videos.filter(v => `${v.title} ${v.description} ${v.category}`.toLowerCase().includes(query));
  if (!query) $("searchResults").innerHTML = '<div class="empty-state compact">Start typing to search.</div>';
  else renderVideos("searchResults", found);
}
function goTo(page) {
  activePage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `${page}Page`));
  document.querySelectorAll(".nav-item[data-page]").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  if (page === "search") setTimeout(() => $("searchInput")?.focus(), 250);
  if (page === "profile") renderAccount();
  window.scrollTo({top:0,behavior:"smooth"});
}
function openModal(id, open=true) { $(id)?.classList.toggle("open", open); }
function addToBag(id) {
  const item = videos.find(v => v.id === id);
  if (!item) return;
  cart.push(item);
  $("cartCount").textContent = cart.length;
  toast("Added to your bag.");
}
function renderAccount() {
  const status = $("accountStatus");
  const form = $("authPanel");
  const logout = $("logoutButton");
  const admin = $("adminStatus");
  if (!currentUser) {
    status.textContent = "Create an account or sign in with your username and password.";
    form.hidden = false;
    logout.hidden = true;
    admin.textContent = "Sign in to access your account. Admin tools are only available to the verified administrator.";
    $("createButton").style.display = "none";
    return;
  }
  status.textContent = `Signed in as ${currentUser.username}`;
  form.hidden = true;
  logout.hidden = false;
  admin.textContent = currentUser.isAdmin ? "Administrator account verified. Admin tools are enabled." : "You are signed in as a standard customer.";
  $("createButton").style.display = currentUser.isAdmin ? "flex" : "none";
  renderAll();
}
function setAuthMode(mode) {
  authMode = mode;
  $("authTitle").textContent = mode === "signup" ? "Create your account" : "Welcome back";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Sign in";
  $("authSwitch").textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
  $("authHint").textContent = mode === "signup" ? "Choose a unique username and a password (at least 8 characters)." : "Enter your username and password to continue.";
  $("authError").textContent = "";
}
async function apiRequest(path, body, token = "") {
  const headers = {"Content-Type":"application/json"};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined});
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || data.ok === false) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}
function normalizeUser(data) {
  const u = data.user || data.account || data;
  const role = String(u.role || data.role || "").toLowerCase();
  return {username: u.username || data.username || "User", isAdmin: Boolean(u.isAdmin || u.admin || data.isAdmin || data.admin || role === "admin")};
}
async function restoreSession() {
  if (!sessionToken) { renderAccount(); return; }
  try {
    const data = await apiRequest("/me", {}, sessionToken);
    currentUser = normalizeUser(data);
    renderAccount();
  } catch {
    sessionStorage.removeItem("ffshop_session");
    sessionToken = "";
    currentUser = null;
    renderAccount();
  }
}
async function submitAuth(event) {
  event.preventDefault();
  const username = $("authUsername").value.trim();
  const password = $("authPassword").value;
  const error = $("authError");
  const button = $("authSubmit");
  error.textContent = "";
  if (!username || !password) { error.textContent = "Enter both username and password."; return; }
  button.disabled = true;
  button.textContent = "Please wait...";
  try {
    let data = await apiRequest(authMode === "signup" ? "/signup" : "/login", {username, password});
    let token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    // Some signup APIs create the account but do not create a session; sign in immediately after signup.
    if (!token && authMode === "signup") {
      data = await apiRequest("/login", {username, password});
      token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    }
    if (!token) throw new Error("Login server did not return a session token. Please check the Worker response.");
    sessionToken = token;
    sessionStorage.setItem("ffshop_session", token);
    const me = await apiRequest("/me", {}, token);
    currentUser = normalizeUser(me);
    $("authForm").reset();
    renderAccount();
    toast(authMode === "signup" ? "Account created successfully." : "Signed in successfully.");
  } catch (err) {
    error.textContent = err.message || "Could not connect. Please try again.";
  } finally {
    button.disabled = false;
    setAuthMode(authMode);
  }
}
function logout() {
  sessionStorage.removeItem("ffshop_session");
  sessionToken = "";
  currentUser = null;
  renderAccount();
  toast("You have signed out.");
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page]");
  const goto = event.target.closest("[data-goto]");
  const filter = event.target.closest("[data-filter]");
  const add = event.target.closest("[data-cart]");
  const buy = event.target.closest("[data-buy]");
  const del = event.target.closest("[data-delete]");
  if (nav) { event.preventDefault(); goTo(nav.dataset.page); }
  if (goto) goTo(goto.dataset.goto);
  if (filter) {
    activeFilter = filter.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(b => b.classList.toggle("selected", b === filter));
    renderVideos("shopVideos", videos.filter(v => activeFilter === "All" || v.category === activeFilter));
  }
  if (add) addToBag(Number(add.dataset.cart));
  if (buy) {
    const item = videos.find(v => v.id === Number(buy.dataset.buy));
    if (item) {
      const priceText = item.price ? `Rs. ${Number(item.price).toLocaleString("en-PK")}` : "Price on request";
      const message = `Assalamualaikum! I want to order this product from FF Shop.\nProduct: ${item.title}\nPrice: ${priceText}`;
      window.open(`https://wa.me/923248201259?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    }
  }
  if (del && currentUser?.isAdmin) {
    videos = videos.filter(v => v.id !== Number(del.dataset.delete));
    renderAll();
    toast("Video removed from this browser session.");
  }
  const like = event.target.closest("[data-like]");
  const comment = event.target.closest("[data-comment]");
  if (like || comment) toast(currentUser ? "This feature will be available when community tools are connected." : "Please sign in first.");
});
$("createButton").addEventListener("click", () => {
  if (!currentUser?.isAdmin) return toast("Administrator access is required.");
  openModal("uploadModal");
});
$("closeUpload").addEventListener("click", () => openModal("uploadModal", false));
$("uploadModal").addEventListener("click", e => { if (e.target === $("uploadModal")) openModal("uploadModal", false); });
$("uploadForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!currentUser?.isAdmin) return toast("Administrator access is required.");
  const file = $("videoFile").files[0];
  const title = $("videoTitle").value.trim();
  if (!file || !file.type.startsWith("video/") || !title) return toast("Choose a video and enter its title.");
  const url = URL.createObjectURL(file);
  videos.unshift({id:Date.now(),url,title,price:Number($("videoPrice").value)||0,category:$("videoCategory").value,description:$("videoDescription").value.trim()});
  $("uploadForm").reset();
  openModal("uploadModal", false);
  renderAll();
  goTo("home");
  toast("Video added for this browser session only.");
});
$("searchInput").addEventListener("input", searchVideos);
$("headerSearch").addEventListener("click", () => goTo("search"));
$("cartOpen").addEventListener("click", () => toast(cart.length ? `${cart.length} item(s) in your bag.` : "Your bag is empty."));
$("closeSettings").addEventListener("click", () => openModal("settingsModal", false));
$("authForm").addEventListener("submit", submitAuth);
$("authSwitch").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
$("logoutButton").addEventListener("click", logout);

renderAll();
setAuthMode("login");
renderAccount();
restoreSession();

function startLoadingScreen() {
  const screen = $("loadingScreen");
  const percent = $("loadingPercent");
  const fill = $("loadingFill");
  const caption = $("loadingCaption");
  if (!screen || !percent || !fill) return;
  const captions = [[0,"Initializing FF Shop..."],[28,"Preparing gaming items..."],[56,"Loading diamonds and accounts..."],[82,"Polishing your experience..."],[100,"You're all set."]];
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(100, progress + (progress < 65 ? 2 : 1));
    percent.textContent = `${progress}%`;
    fill.style.width = `${progress}%`;
    const current = captions.filter(([at]) => progress >= at).pop();
    if (current && caption) caption.textContent = current[1];
    if (progress >= 100) {
      clearInterval(timer);
      setTimeout(() => screen.classList.add("is-hidden"), 450);
      setTimeout(() => screen.remove(), 1250);
    }
  }, 32);
}
startLoadingScreen();

// FF Shop frontend: original blue-cyan layout + public browsing + connected Workers.
// Customer accounts remain on the existing auth Worker. Store media/actions use the FF Shop API Worker.
const AUTH_BASE = "https://ffshop-auth-v2.minahilbirthday.workers.dev";
const API_BASE = "https://ff-shop-fresh-v1.minahilbirthday.workers.dev";
const $ = id => document.getElementById(id);

let videos = [];
let cart = [];
let activePage = "home";
let activeFilter = "All";
let currentUser = null;
let sessionToken = sessionStorage.getItem("ffshop_session") || "";
let adminApiToken = sessionStorage.getItem("ffshop_admin_api_session") || "";
let authMode = "login";
let toastTimer;

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = "none", 3000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function request(base, path, body = null, token = "", isForm = false, methodOverride = "") {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method: methodOverride || (body ? "POST" : "GET"),
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }
  return data;
}

async function apiRequest(path, body = null, token = "", isForm = false) {
  return request(API_BASE, path, body, token, isForm);
}
async function authRequest(path, body = null, token = "") {
  return request(AUTH_BASE, path, body, token);
}

function normalizeUser(data) {
  const u = data.user || data.account || data;
  const role = String(u.role || data.role || "").toLowerCase();
  return {
    username: u.username || data.username || "User",
    isAdmin: Boolean(u.isAdmin || u.admin || data.isAdmin || data.admin || role === "admin")
  };
}

function normalizeVideo(item) {
  const relativeUrl = item.videoUrl || item.url || "";
  return {
    id: String(item.id),
    title: String(item.title || "Untitled video"),
    description: String(item.description || ""),
    price: Number(item.price || 0),
    category: String(item.category || item.accountLevel || item.level || "Other"),
    url: /^https?:\/\//i.test(relativeUrl) ? relativeUrl : `${API_BASE}${relativeUrl}`,
    likes: Number(item.likes || item.likesCount || item.likes_count || 0),
    comments: Number(item.comments || item.commentsCount || item.comments_count || 0),
    isSold: Boolean(item.isSold)
  };
}

function videoCard(item) {
  const price = item.price > 0
    ? `<span class="price">Rs. ${item.price.toLocaleString("en-PK")}</span>`
    : `<span class="price">Price on request</span>`;
  return `<article class="video-card" data-id="${escapeHTML(item.id)}">
    <div class="video-frame"><video controls playsinline preload="metadata" src="${escapeHTML(item.url)}"></video></div>
    <div class="video-meta">
      <div class="video-meta-top"><h3>${escapeHTML(item.title)}</h3>${price}</div>
      ${item.description ? `<p class="description">${escapeHTML(item.description)}</p>` : ""}
      <div class="video-actions"><span class="video-category">${escapeHTML(item.category)}</span>
        <div class="customer-actions">
          <button type="button" data-like="${escapeHTML(item.id)}">♡ Like (${item.likes})</button>
          <button type="button" data-comment="${escapeHTML(item.id)}">Comment (${item.comments})</button>
          <button type="button" data-cart="${escapeHTML(item.id)}">Add to bag</button>
          <button type="button" class="buy-now-btn" data-buy="${escapeHTML(item.id)}">Buy Now</button>
        </div>
        ${currentUser?.isAdmin && adminApiToken ? `<details class="admin-menu"><summary aria-label="Admin video options">⋮</summary><button type="button" data-delete="${escapeHTML(item.id)}">Delete video</button></details>` : ""}
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(id, open = true) { $(id)?.classList.toggle("open", open); }

function addToBag(id) {
  const item = videos.find(v => v.id === String(id));
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
  const create = $("createButton");
  if (!currentUser) {
    status.textContent = "Browse FF Shop freely. Sign in here only when you want to use your account.";
    form.hidden = false;
    logout.hidden = true;
    admin.textContent = "Administrator tools are available only to the verified store administrator.";
    if (create) create.style.display = "none";
    return;
  }
  status.textContent = `Signed in as ${currentUser.username}`;
  form.hidden = true;
  logout.hidden = false;
  if (currentUser.isAdmin && adminApiToken) {
    admin.textContent = "Administrator account verified. Upload and store management tools are enabled.";
    if (create) create.style.display = "flex";
  } else if (currentUser.isAdmin) {
    admin.textContent = "Your account is an administrator, but the store API session is missing. Sign out and sign in again to enable upload tools.";
    if (create) create.style.display = "none";
  } else {
    admin.textContent = "You are signed in as a standard customer. You can continue browsing the shop without signing in.";
    if (create) create.style.display = "none";
  }
  renderAll();
}

function setAuthMode(mode) {
  authMode = mode;
  $("authTitle").textContent = mode === "signup" ? "Create your account" : "Welcome back";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Sign in";
  $("authSwitch").textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
  $("authHint").textContent = mode === "signup"
    ? "Choose a unique username and a password (at least 8 characters)."
    : "Enter your username and password when you want to sign in.";
  $("authError").textContent = "";
}

async function restoreSession() {
  if (!sessionToken) { renderAccount(); return; }
  try {
    const data = await authRequest("/me", null, sessionToken);
    currentUser = normalizeUser(data);
    if (currentUser.isAdmin && adminApiToken) {
      try { await apiRequest("/me", null, adminApiToken); }
      catch { adminApiToken = ""; sessionStorage.removeItem("ffshop_admin_api_session"); }
    }
  } catch {
    sessionStorage.removeItem("ffshop_session");
    sessionStorage.removeItem("ffshop_admin_api_session");
    sessionToken = "";
    adminApiToken = "";
    currentUser = null;
  }
  renderAccount();
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
    let data = await authRequest(authMode === "signup" ? "/signup" : "/login", { username, password });
    let token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    if (!token && authMode === "signup") {
      data = await authRequest("/login", { username, password });
      token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    }
    if (!token) throw new Error("The account server did not return a session token.");
    sessionToken = token;
    sessionStorage.setItem("ffshop_session", token);
    const me = await authRequest("/me", null, token);
    currentUser = normalizeUser(me);

    // The API Worker has a separate admin session. Only a user already verified as admin
    // by the existing account Worker is allowed to request it.
    adminApiToken = "";
    sessionStorage.removeItem("ffshop_admin_api_session");
    if (currentUser.isAdmin) {
      try {
        const adminLogin = await apiRequest("/login", { username, password });
        adminApiToken = adminLogin.token || adminLogin.sessionToken || "";
        if (adminApiToken) sessionStorage.setItem("ffshop_admin_api_session", adminApiToken);
      } catch (adminError) {
        console.warn("FF Shop admin API login failed:", adminError);
      }
    }

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
  sessionStorage.removeItem("ffshop_admin_api_session");
  sessionToken = "";
  adminApiToken = "";
  currentUser = null;
  renderAccount();
  toast("You have signed out.");
}

async function loadVideos() {
  try {
    const data = await apiRequest("/videos");
    videos = (data.videos || []).map(normalizeVideo);
    renderAll();
  } catch (error) {
    console.error("Could not load FF Shop videos:", error);
    videos = [];
    renderAll();
    toast("Could not load shop videos. Please refresh in a moment.");
  }
}

async function toggleLike(id, button) {
  try {
    const data = await apiRequest(`/videos/${encodeURIComponent(id)}/like`, {});
    const item = videos.find(v => v.id === String(id));
    if (item) item.likes = Number(data.likes || 0);
    renderAll();
  } catch (error) { toast(error.message || "Could not update like."); }
}

async function addComment(id) {
  const comment = window.prompt("Write your comment (up to 500 characters):");
  if (comment === null) return;
  if (!comment.trim() || comment.trim().length > 500) return toast("Comment must be between 1 and 500 characters.");
  const name = currentUser?.username || "Guest";
  try {
    await apiRequest(`/videos/${encodeURIComponent(id)}/comments`, { name, comment: comment.trim() });
    const item = videos.find(v => v.id === String(id));
    if (item) item.comments += 1;
    renderAll();
    toast("Comment posted.");
  } catch (error) { toast(error.message || "Could not post comment."); }
}

async function deleteVideo(id) {
  if (!currentUser?.isAdmin || !adminApiToken) return toast("Verified administrator access is required.");
  if (!window.confirm("Delete this video from FF Shop?")) return;
  try {
    await request(API_BASE, `/admin/videos/${encodeURIComponent(id)}`, null, adminApiToken, false, "DELETE");
    videos = videos.filter(v => v.id !== String(id));
    renderAll();
    toast("Video deleted from FF Shop.");
  } catch (error) { toast(error.message || "Could not delete video."); }
}

// Click handling is delegated so dynamically rendered video cards keep working.
document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page]");
  const goto = event.target.closest("[data-goto]");
  const filter = event.target.closest("[data-filter]");
  const add = event.target.closest("[data-cart]");
  const buy = event.target.closest("[data-buy]");
  const del = event.target.closest("[data-delete]");
  const like = event.target.closest("[data-like]");
  const comment = event.target.closest("[data-comment]");

  if (nav) { event.preventDefault(); goTo(nav.dataset.page); }
  if (goto) goTo(goto.dataset.goto);
  if (filter) {
    activeFilter = filter.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(b => b.classList.toggle("selected", b === filter));
    renderVideos("shopVideos", videos.filter(v => activeFilter === "All" || v.category === activeFilter));
  }
  if (add) addToBag(add.dataset.cart);
  if (buy) {
    const item = videos.find(v => v.id === String(buy.dataset.buy));
    if (item) {
      const priceText = item.price ? `Rs. ${item.price.toLocaleString("en-PK")}` : "Price on request";
      const message = `Assalamualaikum! I want to order this product from FF Shop.\nProduct: ${item.title}\nPrice: ${priceText}`;
      window.open(`https://wa.me/923248201259?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    }
  }
  if (like) toggleLike(like.dataset.like, like);
  if (comment) addComment(comment.dataset.comment);
  if (del) deleteVideo(del.dataset.delete);
});

$("createButton").addEventListener("click", () => {
  if (!currentUser?.isAdmin || !adminApiToken) {
    goTo("profile");
    return toast("Sign in with the verified administrator account to upload videos.");
  }
  openModal("uploadModal");
});
$("closeUpload").addEventListener("click", () => openModal("uploadModal", false));
$("uploadModal").addEventListener("click", event => {
  if (event.target === $("uploadModal")) openModal("uploadModal", false);
});
$("uploadForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser?.isAdmin || !adminApiToken) return toast("Verified administrator access is required.");
  const file = $("videoFile").files[0];
  const title = $("videoTitle").value.trim();
  if (!file || !file.type.startsWith("video/") || !title) return toast("Choose a video and enter its title.");
  if (file.size > 50 * 1024 * 1024) return toast("Video must be 50 MB or smaller.");
  const form = new FormData();
  form.append("video", file);
  form.append("title", title);
  form.append("description", $("videoDescription").value.trim());
  form.append("price", $("videoPrice").value || "");
  // The Worker stores this value in account_level; the frontend displays it as the category.
  form.append("level", $("videoCategory").value);
  const submit = $("uploadForm").querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Uploading...";
  try {
    await request(API_BASE, "/admin/videos", form, adminApiToken, true);
    $("uploadForm").reset();
    openModal("uploadModal", false);
    await loadVideos();
    goTo("home");
    toast("Video uploaded and published.");
  } catch (error) {
    toast(error.message || "Video upload failed.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Publish video ↗";
  }
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
loadVideos();
restoreSession();

function startLoadingScreen() {
  const screen = $("loadingScreen");
  const percent = $("loadingPercent");
  const fill = $("loadingFill");
  const caption = $("loadingCaption");
  if (!screen || !percent || !fill) return;
  const captions = [[0, "Initializing FF Shop..."], [28, "Preparing gaming items..."], [56, "Loading diamonds and accounts..."], [82, "Polishing your experience..."], [100, "You're all set."]];
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

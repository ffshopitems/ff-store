// FF Shop frontend connected to the new Cloudflare Worker.
const API_BASE = "https://ff-shop-fresh-v1.minahilbirthday.workers.dev";
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
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
  toastTimer = setTimeout(() => el.style.display = "none", 3000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function normalizeVideo(item) {
  return {
    ...item,
    id: Number(item.id),
    price: Number(item.price || 0),
    title: String(item.title || "Untitled video"),
    category: String(item.category || "Other"),
    description: String(item.description || ""),
    url: String(item.url || ""),
    likesCount: Number(item.likesCount || item.likes_count || 0),
    commentsCount: Number(item.commentsCount || item.comments_count || 0),
    liked: Boolean(item.liked)
  };
}

function videoCard(item) {
  const price = item.price > 0
    ? `<span class="price">Rs. ${item.price.toLocaleString("en-PK")}</span>`
    : `<span class="price">Price on request</span>`;
  const likeLabel = item.liked ? `♥ Liked (${item.likesCount})` : `♡ Like (${item.likesCount})`;

  return `<article class="video-card" data-id="${item.id}">
    <div class="video-frame"><video controls playsinline preload="metadata" src="${escapeHTML(item.url)}"></video></div>
    <div class="video-meta">
      <div class="video-meta-top"><h3>${escapeHTML(item.title)}</h3>${price}</div>
      ${item.description ? `<p class="description">${escapeHTML(item.description)}</p>` : ""}
      <div class="video-actions">
        <span class="video-category">${escapeHTML(item.category)}</span>
        <div class="customer-actions">
          <button type="button" data-like="${item.id}">${likeLabel}</button>
          <button type="button" data-comment="${item.id}">Comment (${item.commentsCount})</button>
          <button type="button" data-cart="${item.id}">Add to bag</button>
          <button type="button" class="buy-now-btn" data-buy="${item.id}">Buy Now</button>
        </div>
        ${currentUser?.isAdmin ? `<details class="admin-menu"><summary aria-label="Admin video options">⋮</summary><button type="button" data-delete="${item.id}">Delete video</button></details>` : ""}
      </div>
    </div>
  </article>`;
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
  const target = $("searchResults");
  if (!target) return;
  const query = (input?.value || "").trim().toLowerCase();
  const found = videos.filter(v => `${v.title} ${v.description} ${v.category}`.toLowerCase().includes(query));
  if (!query) target.innerHTML = '<div class="empty-state compact">Start typing to search.</div>';
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

function openModal(id, open = true) {
  $(id)?.classList.toggle("open", open);
}

function addToBag(id) {
  const item = videos.find(v => v.id === Number(id));
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
    status.textContent = "Create an account or sign in with your username and password.";
    form.hidden = false;
    logout.hidden = true;
    admin.textContent = "Sign in to access your account. Admin tools are only available to the verified administrator.";
    create.style.display = "none";
    renderAll();
    return;
  }
  status.textContent = `Signed in as ${currentUser.username}`;
  form.hidden = true;
  logout.hidden = false;
  admin.textContent = currentUser.isAdmin
    ? "Administrator account verified. Admin tools are enabled."
    : "You are signed in as a standard customer.";
  create.style.display = currentUser.isAdmin ? "flex" : "none";
  renderAll();
}

function setAuthMode(mode) {
  authMode = mode;
  $("authTitle").textContent = mode === "signup" ? "Create your account" : "Welcome back";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Sign in";
  $("authSwitch").textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
  $("authHint").textContent = mode === "signup"
    ? "Choose a unique username and a password (at least 8 characters)."
    : "Enter your username and password to continue.";
  $("authError").textContent = "";
}

async function apiRequest(path, { method = "GET", body, token = sessionToken } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }
  return data;
}

function normalizeUser(data) {
  const u = data.user || data.account || data;
  const role = String(u.role || data.role || "").toLowerCase();
  return {
    username: String(u.username || data.username || "User"),
    isAdmin: Boolean(u.isAdmin || u.admin || data.isAdmin || data.admin || role === "admin")
  };
}

async function refreshVideos(showError = false) {
  try {
    const data = await apiRequest("/videos", { token: sessionToken });
    videos = Array.isArray(data.videos) ? data.videos.map(normalizeVideo) : [];
    renderAll();
    return true;
  } catch (error) {
    if (showError) toast(error.message || "Could not load videos.");
    return false;
  }
}

async function restoreSession() {
  if (sessionToken) {
    try {
      const data = await apiRequest("/me", { method: "POST", body: {}, token: sessionToken });
      currentUser = normalizeUser(data);
    } catch {
      sessionStorage.removeItem("ffshop_session");
      sessionToken = "";
      currentUser = null;
    }
  }
  renderAccount();
  await refreshVideos(false);
}

async function submitAuth(event) {
  event.preventDefault();
  const username = $("authUsername").value.trim();
  const password = $("authPassword").value;
  const error = $("authError");
  const button = $("authSubmit");
  error.textContent = "";
  if (!username || !password) {
    error.textContent = "Enter both username and password.";
    return;
  }
  button.disabled = true;
  button.textContent = "Please wait...";
  try {
    let data = await apiRequest(authMode === "signup" ? "/signup" : "/login", {
      method: "POST", body: { username, password }, token: ""
    });
    let token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    if (!token && authMode === "signup") {
      data = await apiRequest("/login", { method: "POST", body: { username, password }, token: "" });
      token = data.token || data.sessionToken || data.accessToken || data.session?.token;
    }
    if (!token) throw new Error("Login server did not return a session token. Please check the old authentication Worker.");

    sessionToken = token;
    sessionStorage.setItem("ffshop_session", token);
    const me = await apiRequest("/me", { method: "POST", body: {}, token });
    currentUser = normalizeUser(me);
    $("authForm").reset();
    renderAccount();
    await refreshVideos(false);
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
  refreshVideos(false);
  toast("You have signed out.");
}

async function toggleLike(id) {
  if (!currentUser || !sessionToken) {
    toast("Please sign in to like videos.");
    goTo("profile");
    return;
  }
  try {
    await apiRequest(`/videos/${Number(id)}/like`, { method: "POST", body: {}, token: sessionToken });
    await refreshVideos(false);
  } catch (error) {
    toast(error.message || "Could not update like.");
  }
}

async function openComments(id) {
  let comments = [];
  try {
    const data = await apiRequest(`/videos/${Number(id)}/comments`, { token: sessionToken });
    comments = Array.isArray(data.comments) ? data.comments : [];
  } catch (error) {
    toast(error.message || "Could not load comments.");
    return;
  }

  const display = comments.length
    ? comments.slice(-20).map(c => `${c.username}: ${c.body}`).join("\n\n")
    : "No comments yet.";
  window.alert(`Comments\n\n${display}`);

  if (!currentUser || !sessionToken) {
    toast("Sign in to add a comment.");
    return;
  }
  const body = window.prompt("Write your comment (up to 1000 characters):");
  if (body === null) return;
  if (!body.trim()) {
    toast("Comment cannot be empty.");
    return;
  }
  try {
    await apiRequest(`/videos/${Number(id)}/comments`, {
      method: "POST", body: { body: body.trim() }, token: sessionToken
    });
    await refreshVideos(false);
    toast("Comment added.");
  } catch (error) {
    toast(error.message || "Could not add comment.");
  }
}

async function removeVideo(id) {
  if (!currentUser?.isAdmin) return toast("Administrator access is required.");
  if (!window.confirm("Delete this video permanently?")) return;
  try {
    await apiRequest(`/videos/${Number(id)}`, { method: "DELETE", token: sessionToken });
    await refreshVideos(false);
    toast("Video deleted successfully.");
  } catch (error) {
    toast(error.message || "Could not delete video.");
  }
}

async function uploadVideo(event) {
  event.preventDefault();
  if (!currentUser?.isAdmin || !sessionToken) return toast("Administrator access is required.");

  const file = $("videoFile").files[0];
  const title = $("videoTitle").value.trim();
  if (!file || !file.type.startsWith("video/") || !title) {
    toast("Choose a video and enter its title.");
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    toast("Video must be 90 MB or smaller.");
    return;
  }

  const button = $("uploadForm").querySelector('button[type="submit"]');
  const oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Uploading...";

  const form = new FormData();
  form.append("videoFile", file);
  form.append("title", title);
  form.append("price", $("videoPrice").value || "0");
  form.append("category", $("videoCategory").value);
  form.append("description", $("videoDescription").value.trim());

  try {
    const response = await fetch(`${API_BASE}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: form
    });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.message || `Upload failed (${response.status})`);
    }

    $("uploadForm").reset();
    openModal("uploadModal", false);
    await refreshVideos(false);
    goTo("home");
    toast("Video uploaded successfully.");
  } catch (error) {
    toast(error.message || "Video upload failed.");
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
}

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
    const item = videos.find(v => v.id === Number(buy.dataset.buy));
    if (item) {
      const priceText = item.price > 0 ? `Rs. ${item.price.toLocaleString("en-PK")}` : "Price on request";
      const message = `Assalamualaikum! I want to order this product from FF Shop.\nProduct: ${item.title}\nPrice: ${priceText}`;
      window.open(`https://wa.me/923248201259?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    }
  }
  if (del) removeVideo(del.dataset.delete);
  if (like) toggleLike(like.dataset.like);
  if (comment) openComments(comment.dataset.comment);
});

$("createButton").addEventListener("click", () => {
  if (!currentUser?.isAdmin) return toast("Administrator access is required.");
  openModal("uploadModal");
});
$("closeUpload").addEventListener("click", () => openModal("uploadModal", false));
$("uploadModal").addEventListener("click", e => {
  if (e.target === $("uploadModal")) openModal("uploadModal", false);
});
$("uploadForm").addEventListener("submit", uploadVideo);
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
  const captions = [
    [0, "Initializing FF Shop..."],
    [28, "Preparing gaming items..."],
    [56, "Loading diamonds and accounts..."],
    [82, "Polishing your experience..."],
    [100, "You're all set."]
  ];
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

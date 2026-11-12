const $ = id => document.getElementById(id);
let videos = [];
let cart = [];
let activePage = "home";
let adminMode = false; // Admin access must be verified by a secure backend.
let activeFilter = "All";
let toastTimer;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = "none", 2600);
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
      ${adminMode ? `<details class="admin-menu"><summary aria-label="Admin video options">⋮</summary><button data-delete="${item.id}">Delete video</button></details>` : ""}
      </div>
    </div></article>`;
}
function renderVideos(target, list) {
  const el = $(target);
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
  const query = $("searchInput").value.trim().toLowerCase();
  const found = videos.filter(v => `${v.title} ${v.description} ${v.category}`.toLowerCase().includes(query));
  if (!query) $("searchResults").innerHTML = '<div class="empty-state compact">Start typing to search.</div>';
  else renderVideos("searchResults", found);
}
function goTo(page) {
  activePage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `${page}Page`));
  document.querySelectorAll(".nav-item[data-page]").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  if (page === "search") setTimeout(() => $("searchInput").focus(), 350);
  window.scrollTo({top:0,behavior:"smooth"});
}
function openModal(id, open=true) { $(id).classList.toggle("open", open); }
function addToBag(id) {
  const item = videos.find(v => v.id === id);
  if (!item) return;
  cart.push(item);
  $("cartCount").textContent = cart.length;
  toast("Added to your bag.");
}
function updateAdminUI() {
  $("adminPreview").textContent = `Admin preview: ${adminMode ? "On" : "Off"}`;
  $("createButton").style.display = adminMode ? "flex" : "none";
  renderAll();
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
  if (del) toast("Secure admin access is not connected yet.");
  const like = event.target.closest("[data-like]");
  const comment = event.target.closest("[data-comment]");
  if (like || comment) toast("Please sign in first. Google Login will work after Firebase setup.");
});
$("createButton").addEventListener("click", () => {
  if (!adminMode) return toast("Admin access is required.");
  openModal("uploadModal");
});
$("closeUpload").addEventListener("click", () => openModal("uploadModal", false));
$("uploadModal").addEventListener("click", e => { if (e.target === $("uploadModal")) openModal("uploadModal", false); });
$("uploadForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!adminMode) return toast("Admin access is required.");
  const file = $("videoFile").files[0];
  const title = $("videoTitle").value.trim();
  if (!file || !file.type.startsWith("video/") || !title) return toast("Choose a video and enter its title.");
  const url = URL.createObjectURL(file);
  videos.unshift({id:Date.now(),url,title,price:Number($("videoPrice").value)||0,category:$("videoCategory").value,description:$("videoDescription").value.trim()});
  $("uploadForm").reset();
  openModal("uploadModal", false);
  renderAll();
  goTo("home");
  toast("Video added for this browser session.");
});
$("searchInput").addEventListener("input", searchVideos);
$("headerSearch").addEventListener("click", () => goTo("search"));
$("adminPreview").addEventListener("click", () => toast("Admin controls need secure server-side authentication."));
$("loginDemo").addEventListener("click", () => toast("Google Login needs Firebase configuration before it can be enabled."));
$("cartOpen").addEventListener("click", () => toast(cart.length ? `${cart.length} item(s) in your bag.` : "Your bag is empty."));
$("closeSettings").addEventListener("click", () => openModal("settingsModal", false));
renderAll();
updateAdminUI();


// Loading screen: animated 0–100% intro, then reveal the shop.
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
    // This is a visual intro progress animation, not a measurement of download bytes.
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

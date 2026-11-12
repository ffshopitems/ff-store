/* FF Shop - corrected front-end script
   IMPORTANT: Add your Firebase Web App config below before using Google Login.
   Firebase Web App config is public client configuration, not a service-account key.
*/
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCpRB6ZIc1RaH5T7S_643q2ydBXWT-FLh0",
  authDomain: "ff-store-7a777.firebaseapp.com",
  projectId: "ff-store-7a777",
  appId: "1:634624292034:web:6ea36db0c1a983ea45775b"
};

// The store owner's Google account. This front-end check only labels the account;
// privileged admin operations must still be protected by Firebase custom claims/rules.
const ADMIN_EMAIL = "asimladla222@gmail.com";
const WHATSAPP_NUMBER = "923248201259"; // Existing number found in the previous site script.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let videos = [];
  let cart = [];
  let activeFilter = "All";
  let toastTimer;
  let firebaseAuth = null;
  let currentUser = null;

  function toast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = "none"; }, 2800);
  }

  function hideLoadingScreen() {
    const screen = $("loadingScreen");
    if (!screen) return;
    screen.classList.add("is-hidden");
    setTimeout(() => screen.remove(), 850);
  }

  // Run independently of Firebase so a login/config error cannot freeze the intro.
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
    const started = Date.now();
    const timer = setInterval(() => {
      progress = Math.min(100, progress + 2);
      percent.textContent = `${progress}%`;
      fill.style.width = `${progress}%`;
      const current = captions.filter(([at]) => progress >= at).pop();
      if (current && caption) caption.textContent = current[1];

      if (progress >= 100 || Date.now() - started > 5000) {
        clearInterval(timer);
        percent.textContent = "100%";
        fill.style.width = "100%";
        setTimeout(hideLoadingScreen, 400);
      }
    }, 35);

    // Extra safety net: never leave the visitor trapped on the loading screen.
    setTimeout(hideLoadingScreen, 6500);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function videoCard(item) {
    const price = Number(item.price) > 0
      ? `<span class="price">Rs. ${Number(item.price).toLocaleString("en-PK")}</span>`
      : `<span class="price">Price on request</span>`;
    const safeUrl = escapeHTML(item.url || "");
    return `<article class="video-card" data-id="${Number(item.id)}">
      <div class="video-frame">${safeUrl
        ? `<video controls playsinline preload="metadata" src="${safeUrl}"></video>`
        : `<div class="video-placeholder">▶</div>`}</div>
      <div class="video-meta">
        <div class="video-meta-top"><h3>${escapeHTML(item.title)}</h3>${price}</div>
        ${item.description ? `<p class="description">${escapeHTML(item.description)}</p>` : ""}
        <div class="video-actions">
          <span class="video-category">${escapeHTML(item.category || "Other")}</span>
          <div class="customer-actions">
            <button type="button" data-cart="${Number(item.id)}">Add to bag</button>
            <button type="button" class="buy-now-btn" data-buy="${Number(item.id)}">Buy Now</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  function renderVideos(target, list) {
    const el = $(target);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><span>▶</span><h3>No items here yet</h3><p>Gaming items added to FF Shop will appear here.</p></div>`;
      return;
    }
    el.innerHTML = list.map(videoCard).join("");
  }

  function searchVideos() {
    const input = $("searchInput");
    const results = $("searchResults");
    if (!input || !results) return;
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = '<div class="empty-state compact">Start typing to search.</div>';
      return;
    }
    const found = videos.filter((v) =>
      `${v.title} ${v.description || ""} ${v.category || ""}`.toLowerCase().includes(query)
    );
    renderVideos("searchResults", found);
  }

  function renderAll() {
    renderVideos("homeVideos", videos);
    renderVideos("shopVideos", videos.filter((v) => activeFilter === "All" || v.category === activeFilter));
    searchVideos();
  }

  function goTo(page) {
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.toggle("active", el.id === `${page}Page`);
    });
    document.querySelectorAll(".nav-item[data-page]").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
    });
    if (page === "search") setTimeout(() => $("searchInput")?.focus(), 350);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openModal(id, open = true) {
    $(id)?.classList.toggle("open", open);
  }

  function addToBag(id) {
    const item = videos.find((v) => Number(v.id) === Number(id));
    if (!item) return;
    cart.push(item);
    if ($("cartCount")) $("cartCount").textContent = String(cart.length);
    toast("Added to your bag.");
  }

  function updateAccountUI(user) {
    currentUser = user || null;
    const status = $("accountStatus");
    const login = $("loginButton");
    const logout = $("logoutButton");
    const adminStatus = $("adminStatus");

    if (status) status.textContent = currentUser
      ? `Signed in as ${currentUser.displayName || currentUser.email || "Google user"}.`
      : "Sign in with Google to access your account.";
    if (login) login.hidden = !!currentUser;
    if (logout) logout.hidden = !currentUser;
    const isAdminEmail = !!currentUser &&
      String(currentUser.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (adminStatus) {
      adminStatus.textContent = !currentUser
        ? "Admin access is restricted to the store owner's Google account."
        : isAdminEmail
          ? `Admin email recognized: ${ADMIN_EMAIL}. Secure server-side admin permissions are still required for uploads and management.`
          : "Signed in with Google. This account is not the registered store administrator.";
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-firebase-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "yes") return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.firebaseSrc = src;
      script.onload = () => { script.dataset.loaded = "yes"; resolve(); };
      script.onerror = () => reject(new Error("Could not load Firebase SDK."));
      document.head.appendChild(script);
    });
  }

  async function initializeFirebaseAuth() {
    const configured = FIREBASE_CONFIG.apiKey &&
      !FIREBASE_CONFIG.apiKey.startsWith("PASTE_") &&
      FIREBASE_CONFIG.authDomain &&
      !FIREBASE_CONFIG.authDomain.startsWith("PASTE_") &&
      FIREBASE_CONFIG.projectId &&
      !FIREBASE_CONFIG.projectId.startsWith("PASTE_") &&
      FIREBASE_CONFIG.appId &&
      !FIREBASE_CONFIG.appId.startsWith("PASTE_");

    if (!configured) {
      updateAccountUI(null);
      if ($("loginButton")) $("loginButton").disabled = false;
      return;
    }

    try {
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
      if (!window.firebase) throw new Error("Firebase SDK did not initialize.");

      const app = window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(FIREBASE_CONFIG);
      firebaseAuth = app.auth();
      firebaseAuth.onAuthStateChanged(updateAccountUI);

      const pending = await firebaseAuth.getRedirectResult();
      if (pending && pending.user) updateAccountUI(pending.user);
    } catch (error) {
      console.error("Firebase Authentication setup error:", error);
      toast("Firebase setup error. Check the Web App config and authorized domain.");
      updateAccountUI(null);
    }
  }

  async function signInWithGoogle() {
    if (!firebaseAuth) {
      toast("Google Login setup is incomplete: add the Firebase Web App config in script.js first.");
      return;
    }
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      // Redirect is more reliable than popups on mobile browsers.
      await firebaseAuth.signInWithRedirect(provider);
    } catch (error) {
      console.error("Google sign-in error:", error);
      toast(error.message || "Google Login failed. Please try again.");
    }
  }

  async function signOut() {
    if (!firebaseAuth) return;
    try {
      await firebaseAuth.signOut();
      toast("You have signed out.");
    } catch (error) {
      console.error("Sign-out error:", error);
      toast("Could not sign out. Please try again.");
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const nav = target.closest("[data-page]");
      const goto = target.closest("[data-goto]");
      const filter = target.closest("[data-filter]");
      const add = target.closest("[data-cart]");
      const buy = target.closest("[data-buy]");

      if (nav) {
        event.preventDefault();
        goTo(nav.dataset.page);
      }
      if (goto) goTo(goto.dataset.goto);
      if (filter) {
        activeFilter = filter.dataset.filter;
        document.querySelectorAll(".filter-chip").forEach((button) =>
          button.classList.toggle("selected", button === filter)
        );
        renderVideos("shopVideos", videos.filter((v) => activeFilter === "All" || v.category === activeFilter));
      }
      if (add) addToBag(add.dataset.cart);
      if (buy) {
        const item = videos.find((v) => Number(v.id) === Number(buy.dataset.buy));
        if (!item) return;
        const priceText = Number(item.price) > 0
          ? `Rs. ${Number(item.price).toLocaleString("en-PK")}`
          : "Price on request";
        const message = `Assalamualaikum! I want to order this product from FF Shop.\nProduct: ${item.title}\nPrice: ${priceText}`;
        // Open directly from the user's tap so mobile popup blockers do not block it.
        window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`);
      }
    });

    $("searchInput")?.addEventListener("input", searchVideos);
    $("headerSearch")?.addEventListener("click", () => goTo("search"));
    $("cartOpen")?.addEventListener("click", () => {
      toast(cart.length ? `${cart.length} item(s) in your bag.` : "Your bag is empty.");
    });
    $("loginButton")?.addEventListener("click", signInWithGoogle);
    $("logoutButton")?.addEventListener("click", signOut);
    $("closeUpload")?.addEventListener("click", () => openModal("uploadModal", false));
    $("uploadModal")?.addEventListener("click", (event) => {
      if (event.target === $("uploadModal")) openModal("uploadModal", false);
    });
    $("closeSettings")?.addEventListener("click", () => openModal("settingsModal", false));

    // Upload UI is intentionally not presented as a working admin system:
    // secure Storage rules and verified admin permissions have not been configured.
    $("createButton")?.addEventListener("click", () => {
      toast("Video uploads need Firebase Storage and verified admin permissions first.");
    });
    $("uploadForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      toast("Video uploads are not enabled until secure Firebase Storage/admin access is configured.");
    });
  }

  function init() {
    startLoadingScreen();
    bindEvents();
    renderAll();
    updateAccountUI(null);
    initializeFirebaseAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

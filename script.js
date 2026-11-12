import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const ADMIN_EMAIL = "asimladla222@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "us-central1");
const claimAdmin = httpsCallable(functions, "claimStoreAdmin");
const $ = id => document.getElementById(id);
let videos = [], cart = [], activeFilter = "All", isAdmin = false, unsubscribeVideos = null, toastTimer;

function toast(message) { const el=$("toast"); el.textContent=message; el.style.display="block"; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.style.display="none",3200); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function videoCard(v) {
  const price=v.price ? `<span class="price">Rs. ${Number(v.price).toLocaleString("en-PK")}</span>` : `<span class="price">Price on request</span>`;
  return `<article class="video-card" data-id="${esc(v.id)}"><div class="video-frame"><video controls playsinline preload="metadata" src="${esc(v.url)}"></video></div><div class="video-meta"><div class="video-meta-top"><h3>${esc(v.title)}</h3>${price}</div>${v.description?`<p class="description">${esc(v.description)}</p>`:""}<div class="video-actions"><span class="video-category">${esc(v.category)}</span><div class="customer-actions"><button data-cart="${esc(v.id)}">Add to bag</button><button class="buy-now-btn" data-buy="${esc(v.id)}">Buy Now</button></div>${isAdmin?`<details class="admin-menu"><summary aria-label="Admin video options">⋮</summary><button data-delete="${esc(v.id)}">Delete video</button></details>`:""}</div></div></article>`;
}
function renderVideos(target,list) { const el=$(target); if(!list.length){el.innerHTML='<div class="empty-state"><span>▶</span><h3>No videos here yet</h3><p>Gaming videos uploaded to FF Shop will appear here.</p></div>';return;} el.innerHTML=list.map(videoCard).join(""); }
function searchVideos(){const q=$("searchInput").value.trim().toLowerCase();const found=videos.filter(v=>`${v.title} ${v.description} ${v.category}`.toLowerCase().includes(q));if(!q)$("searchResults").innerHTML='<div class="empty-state compact">Start typing to search.</div>';else renderVideos("searchResults",found);}
function renderAll(){renderVideos("homeVideos",videos);renderVideos("shopVideos",videos.filter(v=>activeFilter==="All"||v.category===activeFilter));searchVideos();}
function goTo(page){document.querySelectorAll(".page").forEach(e=>e.classList.toggle("active",e.id===`${page}Page`));document.querySelectorAll(".nav-item[data-page]").forEach(e=>e.classList.toggle("active",e.dataset.page===page));if(page==="search")setTimeout(()=>$("searchInput").focus(),250);window.scrollTo({top:0,behavior:"smooth"});}
function openModal(id,open=true){$(id).classList.toggle("open",open);}
function updateAccount(user){$("accountStatus").textContent=user?`Signed in as ${user.email}${isAdmin?" • Store administrator":" • Customer account"}`:"Sign in with Google to access your account.";$("loginButton").hidden=!!user;$("logoutButton").hidden=!user;$("adminStatus").textContent=isAdmin?"Verified administrator: upload and manage store videos.":"Admin tools are available only to the verified store administrator.";$("createButton").style.display=isAdmin?"flex":"none";renderAll();}
function subscribeVideos(){if(unsubscribeVideos)unsubscribeVideos();const q=query(collection(db,"videos"),orderBy("createdAt","desc"));unsubscribeVideos=onSnapshot(q,s=>{videos=s.docs.map(d=>({id:d.id,...d.data()}));renderAll();},e=>{console.error(e);toast("Could not load products. Check Firestore setup and rules.");});}
async function doLogin(){const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});try{await signInWithPopup(auth,provider);}catch(e){if(["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request"].includes(e.code)){await signInWithRedirect(auth,provider);}else{console.error(e);toast(`Google sign-in failed: ${e.code||e.message}`);}}}
getRedirectResult(auth).catch(e=>{console.error(e);toast(`Google sign-in failed: ${e.code||e.message}`);});

onAuthStateChanged(auth,async user=>{
  isAdmin=false;
  if(user){try{await user.reload();const token=await user.getIdTokenResult(true);isAdmin=token.claims.admin===true;if(user.email===ADMIN_EMAIL&&!isAdmin){$("adminStatus").textContent="Your Google account is signed in. Admin permission is not assigned yet; deploy the secure function, then sign out and sign in again.";}}catch(e){console.error(e);}}
  updateAccount(user);
  if(user && user.email===ADMIN_EMAIL && !isAdmin){try{const result=await claimAdmin();if(result.data?.admin===true){await user.getIdToken(true);const refreshed=await user.getIdTokenResult(true);isAdmin=refreshed.claims.admin===true;updateAccount(user);toast(isAdmin?"Admin access securely activated.":"Admin claim was not confirmed. Sign out and sign in again.");}}catch(e){console.warn("Admin claim setup:",e);$("adminStatus").textContent="Admin setup is not deployed yet. Follow README setup steps.";}}
});

$("loginButton").addEventListener("click",doLogin);
$("logoutButton").addEventListener("click",()=>signOut(auth).then(()=>toast("Signed out.")).catch(e=>toast(e.message)));
$("createButton").addEventListener("click",()=>{if(!isAdmin)return toast("Verified admin access required.");openModal("uploadModal");});
$("closeUpload").addEventListener("click",()=>openModal("uploadModal",false));
$("uploadModal").addEventListener("click",e=>{if(e.target===$("uploadModal"))openModal("uploadModal",false);});
$("uploadForm").addEventListener("submit",async e=>{e.preventDefault();if(!auth.currentUser||!isAdmin)return toast("Verified admin access required.");const file=$("videoFile").files[0],title=$("videoTitle").value.trim();if(!file||!file.type.startsWith("video/")||!title)return toast("Choose a video and enter its title.");if(file.size>100*1024*1024)return toast("Video must be 100 MB or smaller.");const submit=e.submitter;submit.disabled=true;try{const path=`videos/${auth.currentUser.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const storageRef=ref(storage,path);await uploadBytes(storageRef,file,{contentType:file.type});const url=await getDownloadURL(storageRef);await addDoc(collection(db,"videos"),{title,price:Number($("videoPrice").value)||0,category:$("videoCategory").value,description:$("videoDescription").value.trim(),url,storagePath:path,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});$("uploadForm").reset();openModal("uploadModal",false);toast("Video published to FF Shop.");}catch(err){console.error(err);toast(`Upload failed: ${err.code||err.message}`);}finally{submit.disabled=false;}});

document.addEventListener("click",async e=>{const nav=e.target.closest("[data-page]"),go=e.target.closest("[data-goto]"),filter=e.target.closest("[data-filter]"),add=e.target.closest("[data-cart]"),buy=e.target.closest("[data-buy]"),del=e.target.closest("[data-delete]");if(nav){e.preventDefault();goTo(nav.dataset.page);}if(go)goTo(go.dataset.goto);if(filter){activeFilter=filter.dataset.filter;document.querySelectorAll(".filter-chip").forEach(b=>b.classList.toggle("selected",b===filter));renderVideos("shopVideos",videos.filter(v=>activeFilter==="All"||v.category===activeFilter));}if(add){const v=videos.find(x=>x.id===add.dataset.cart);if(v){cart.push(v);$("cartCount").textContent=cart.length;toast("Added to your bag.");}}if(buy){const v=videos.find(x=>x.id===buy.dataset.buy);if(v){const p=v.price?`Rs. ${Number(v.price).toLocaleString("en-PK")}`:"Price on request";const msg=`Assalamualaikum! I want to order this product from FF Shop.\nProduct: ${v.title}\nPrice: ${p}`;window.open(`https://wa.me/923248201259?text=${encodeURIComponent(msg)}`,"_blank","noopener");}}if(del){if(!isAdmin||!auth.currentUser)return toast("Verified admin access required.");const v=videos.find(x=>x.id===del.dataset.delete);if(!v)return; if(!confirm("Delete this video from FF Shop?"))return;try{await deleteDoc(doc(db,"videos",v.id));if(v.storagePath)await deleteObject(ref(storage,v.storagePath));toast("Video deleted.");}catch(err){console.error(err);toast(`Delete failed: ${err.code||err.message}`);}}});
$("searchInput").addEventListener("input",searchVideos);$("headerSearch").addEventListener("click",()=>goTo("search"));$("cartOpen").addEventListener("click",()=>toast(cart.length?`${cart.length} item(s) in your bag.`:"Your bag is empty."));$("closeSettings").addEventListener("click",()=>openModal("settingsModal",false));
subscribeVideos();
function startLoadingScreen(){const screen=$("loadingScreen"),percent=$("loadingPercent"),fill=$("loadingFill"),caption=$("loadingCaption");if(!screen||!percent||!fill)return;let progress=0;const labels=[[0,"Initializing FF Shop..."],[28,"Preparing gaming items..."],[56,"Loading diamonds and accounts..."],[82,"Polishing your experience..."],[100,"You're all set."]];const timer=setInterval(()=>{progress=Math.min(100,progress+2);percent.textContent=`${progress}%`;fill.style.width=`${progress}%`;const label=labels.filter(([n])=>progress>=n).pop();if(label&&caption)caption.textContent=label[1];if(progress>=100){clearInterval(timer);setTimeout(()=>screen.classList.add("is-hidden"),450);setTimeout(()=>screen.remove(),1250);}},32);}startLoadingScreen();

"use strict";

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const navLinks = document.querySelectorAll(".nav-link");
const searchInput = document.getElementById("dashboardSearch");
const searchBox = searchInput.closest(".search");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const API_BASE_URL = LOCAL_HOSTS.has(window.location.hostname)
  ? `${window.location.protocol}//${window.location.hostname}:8787`
  : "https://ituestor-api.itumelaka.workers.dev";
const API_URL = `${API_BASE_URL}/api/items`;
const SUPABASE_URL = "https://tzsykhjfhmctasjscwch.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6CTHYsBbnzVVq-E9jj7UWw_xDkr2axy";
const chartColors = ["#2777c7", "#51a83c", "#ffc313", "#ed4938", "#8a62b8", "#40a5af"];
const ITEMS_PER_PAGE = 20;
let loadedItems = [];
let registerPage = 1;
let lastFocusedItem = null;
let inventoryRequest = null;
let inventoryLoaded = false;
let supabaseClient = null;
let accessRequest = null;
let accessGranted = false;
let currentSession = null;
let authRetryMode = "auth";

const elements = {
  dataState: document.getElementById("dataState"),
  dataStateMessage: document.getElementById("dataStateMessage"),
  retryData: document.getElementById("retryData"),
  totalItems: document.getElementById("totalItems"),
  knownStockValue: document.getElementById("knownStockValue"),
  lowStockCount: document.getElementById("lowStockCount"),
  outOfStockCount: document.getElementById("outOfStockCount"),
  categoryDonut: document.getElementById("categoryDonut"),
  categoryTotal: document.getElementById("categoryTotal"),
  categoryLegend: document.getElementById("categoryLegend"),
  stockAlertRows: document.getElementById("stockAlertRows"),
  dashboardView: document.getElementById("dashboard"),
  registerView: document.getElementById("daftar-item"),
  registerDataState: document.getElementById("registerDataState"),
  registerStateMessage: document.getElementById("registerStateMessage"),
  registerRetry: document.getElementById("registerRetry"),
  itemSearch: document.getElementById("itemSearch"),
  categoryFilter: document.getElementById("categoryFilter"),
  stockFilter: document.getElementById("stockFilter"),
  apiStatusFilter: document.getElementById("apiStatusFilter"),
  apiStatusFilterLabel: document.getElementById("apiStatusFilterLabel"),
  itemSort: document.getElementById("itemSort"),
  registerSummary: document.getElementById("registerSummary"),
  activeFilters: document.getElementById("activeFilters"),
  itemRows: document.getElementById("itemRows"),
  itemCards: document.getElementById("itemCards"),
  previousPage: document.getElementById("previousPage"),
  nextPage: document.getElementById("nextPage"),
  pageSummary: document.getElementById("pageSummary"),
  itemModal: document.getElementById("itemModal"),
  itemModalTitle: document.getElementById("itemModalTitle"),
  itemDetails: document.getElementById("itemDetails"),
  closeItemModal: document.getElementById("closeItemModal"),
  authGate: document.getElementById("authGate"),
  authState: document.getElementById("authState"),
  authStateMessage: document.getElementById("authStateMessage"),
  googleLogin: document.getElementById("googleLogin"),
  authRetry: document.getElementById("authRetry"),
  userProfile: document.getElementById("userProfile"),
  userAvatarFallback: document.getElementById("userAvatarFallback"),
  userAvatarImage: document.getElementById("userAvatarImage"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  logoutButton: document.getElementById("logoutButton")
};

const currencyFormatter = new Intl.NumberFormat("ms-MY", {
  style: "currency", currency: "MYR", minimumFractionDigits: 2
});
const textCollator = new Intl.Collator("ms", { sensitivity: "base", numeric: true });

function numericValue(value, fieldName, item) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    console.warn(`Nilai ${fieldName} tidak sah untuk item ${item.itemId || "(tanpa ID)"}; 0 digunakan untuk pengiraan paparan.`);
    return 0;
  }
  return number;
}

function parsedNumber(value, fieldName, item) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    console.warn(`Nilai ${fieldName} tidak sah untuk item ${item.itemId || "(tanpa ID)"}; nilai tidak dipaparkan.`);
    return { valid: false, value: 0 };
  }
  return { valid: true, value: number };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function setDataState(state, message) {
  elements.dataState.className = `data-state is-${state}`;
  elements.dataStateMessage.textContent = message;
  elements.retryData.hidden = state !== "error";
}

function setRegisterState(state, message) {
  elements.registerDataState.className = `data-state is-${state}`;
  elements.registerStateMessage.textContent = message;
  elements.registerRetry.hidden = state !== "error";
}

function itemNumbers(item) {
  return {
    stock: numericValue(item.stokAwal, "stokAwal", item),
    minimum: numericValue(item.stokMinimum, "stokMinimum", item),
    cost: numericValue(item.kosSeunit, "kosSeunit", item)
  };
}

function renderStockAlerts(items) {
  const alerts = items.map((item) => ({ item, ...itemNumbers(item) }))
    .filter(({ stock, minimum }) => stock <= 0 || (stock > 0 && stock <= minimum));

  if (!alerts.length) {
    const searching = searchInput.value.trim();
    elements.stockAlertRows.innerHTML = `<tr><td colspan="4" class="empty-state">${
      searching ? "Tiada item stok rendah atau habis sepadan dengan carian." :
        "Tiada item stok rendah atau habis berdasarkan stok awal dan stok minimum semasa."
    }</td></tr>`;
    return;
  }

  elements.stockAlertRows.innerHTML = alerts.map(({ item, stock }) => {
    const out = stock <= 0;
    return `<tr><td>${escapeHtml(item.namaItem || item.itemId || "—")}</td><td>${escapeHtml(item.kategori || "—")}</td><td>${escapeHtml(stock)}</td><td><b class="${out ? "status-out" : "status-low"}">${out ? "HABIS" : "RENDAH"}</b></td></tr>`;
  }).join("");
}

function renderCategories(items) {
  const counts = new Map();
  items.forEach((item) => {
    const category = String(item.kategori ?? "").trim();
    if (category) counts.set(category, (counts.get(category) || 0) + 1);
  });
  const total = items.length;
  let cursor = 0;
  const stops = [];
  [...counts.entries()].forEach(([, count], index) => {
    const end = total ? cursor + (count / total * 100) : cursor;
    stops.push(`${chartColors[index % chartColors.length]} ${cursor}% ${end}%`);
    cursor = end;
  });
  elements.categoryDonut.style.background = stops.length ? `conic-gradient(${stops.join(",")})` : "#ddd5cb";
  elements.categoryDonut.setAttribute("aria-label", `Carta ${total} item mengikut kategori`);
  elements.categoryTotal.textContent = total.toLocaleString("ms-MY");
  elements.categoryLegend.innerHTML = counts.size ? [...counts.entries()].map(([category, count], index) => {
    const percentage = total ? (count / total * 100).toLocaleString("ms-MY", { maximumFractionDigits: 1 }) : "0";
    return `<li><i class="dot" style="background:${chartColors[index % chartColors.length]}"></i><span>${escapeHtml(category)}<strong>${count} (${percentage}%)</strong></span></li>`;
  }).join("") : '<li class="empty-state">Tiada kategori untuk dipaparkan.</li>';
}

function renderDashboard(items, apiCount) {
  const metrics = items.map((item) => ({ item, ...itemNumbers(item) }));
  const knownValue = metrics.reduce((sum, entry) => sum + entry.stock * entry.cost, 0);
  const low = metrics.filter(({ stock, minimum }) => stock > 0 && stock <= minimum).length;
  const out = metrics.filter(({ stock }) => stock <= 0).length;

  elements.totalItems.textContent = numericValue(apiCount, "count", { itemId: "respons API" }).toLocaleString("ms-MY");
  elements.knownStockValue.textContent = new Intl.NumberFormat("ms-MY", {
    style: "currency", currency: "MYR", minimumFractionDigits: 2
  }).format(knownValue);
  elements.lowStockCount.textContent = low.toLocaleString("ms-MY");
  elements.outOfStockCount.textContent = out.toLocaleString("ms-MY");
  renderCategories(items);
  renderStockAlerts(items);
}

function filterItems() {
  const query = searchInput.value.trim().toLocaleLowerCase("ms");
  if (!query) return loadedItems;
  return loadedItems.filter((item) => [item.itemId, item.namaItem, item.kategori, item.unit]
    .some((value) => String(value ?? "").toLocaleLowerCase("ms").includes(query)));
}

function stockStatus(stock, minimum) {
  if (!stock.valid || !minimum.valid) return "—";
  if (stock.value <= 0) return "HABIS";
  if (stock.value <= minimum.value) return "RENDAH";
  return "ADA STOK";
}

function itemView(item) {
  const stock = parsedNumber(item.stokAwal, "stokAwal", item);
  const minimum = parsedNumber(item.stokMinimum, "stokMinimum", item);
  const cost = parsedNumber(item.kosSeunit, "kosSeunit", item);
  const value = stock.valid && cost.valid
    ? { valid: true, value: stock.value * cost.value }
    : { valid: false, value: 0 };
  return { item, stock, minimum, cost, value, operationalStatus: stockStatus(stock, minimum) };
}

function formatNumber(number) {
  return number.valid ? number.value.toLocaleString("ms-MY", { maximumFractionDigits: 2 }) : "—";
}

function formatCurrency(number) {
  return number.valid ? currencyFormatter.format(number.value) : "—";
}

function statusClass(status) {
  if (status === "ADA STOK") return "status-in";
  if (status === "RENDAH") return "status-low";
  if (status === "HABIS") return "status-out";
  return "";
}

function populateRegisterFilters() {
  const categories = [...new Set(loadedItems.map((item) => String(item.kategori ?? "").trim()).filter(Boolean))]
    .sort(textCollator.compare);
  const statuses = [...new Set(loadedItems.map((item) => String(item.status ?? "").trim()).filter(Boolean))]
    .sort(textCollator.compare);
  elements.categoryFilter.innerHTML = '<option value="">Semua kategori</option>' +
    categories.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  elements.apiStatusFilter.innerHTML = '<option value="">Semua status</option>' +
    statuses.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  elements.apiStatusFilterLabel.hidden = statuses.length === 0;
}

function filteredRegisterItems() {
  const query = elements.itemSearch.value.trim().toLocaleLowerCase("ms");
  const category = elements.categoryFilter.value;
  const operational = elements.stockFilter.value;
  const apiStatus = elements.apiStatusFilter.value;
  const views = loadedItems.map(itemView).filter((view) => {
    const item = view.item;
    const matchesQuery = !query || [item.itemId, item.namaItem, item.namaItemAsal, item.kategori, item.unit]
      .some((value) => String(value ?? "").toLocaleLowerCase("ms").includes(query));
    return matchesQuery &&
      (!category || item.kategori === category) &&
      (!operational || view.operationalStatus === operational) &&
      (!apiStatus || item.status === apiStatus);
  });

  const text = (value) => String(value ?? "");
  const numericSort = (field, direction) => (a, b) => {
    if (a[field].valid !== b[field].valid) return a[field].valid ? -1 : 1;
    return (a[field].value - b[field].value) * direction ||
      textCollator.compare(text(a.item.itemId), text(b.item.itemId));
  };
  const sorts = {
    id: (a, b) => textCollator.compare(text(a.item.itemId), text(b.item.itemId)),
    name: (a, b) => textCollator.compare(text(a.item.namaItem), text(b.item.namaItem)),
    category: (a, b) => textCollator.compare(text(a.item.kategori), text(b.item.kategori)) ||
      textCollator.compare(text(a.item.namaItem), text(b.item.namaItem)),
    "stock-asc": numericSort("stock", 1),
    "stock-desc": numericSort("stock", -1),
    "value-asc": numericSort("value", 1),
    "value-desc": numericSort("value", -1)
  };
  return views.slice().sort(sorts[elements.itemSort.value] || sorts.id);
}

function renderRegisterItem(view, card = false) {
  const item = view.item;
  const id = escapeHtml(item.itemId || "—");
  const name = escapeHtml(item.namaItem || item.namaItemAsal || "—");
  const category = escapeHtml(item.kategori || "—");
  const unit = escapeHtml(item.unit || "—");
  const apiStatus = escapeHtml(item.status || "—");
  const operation = escapeHtml(view.operationalStatus);
  if (card) {
    return `<button class="item-card" type="button" data-item-id="${id}" aria-label="Lihat butiran ${name}">
      <span class="item-card-head"><span><small>${id}</small><h3>${name}</h3></span><b class="status-badge ${statusClass(view.operationalStatus)}">${operation}</b></span>
      <span class="item-card-grid">
        <span>Kategori<strong>${category}</strong></span><span>Unit<strong>${unit}</strong></span>
        <span>Stok awal<strong>${formatNumber(view.stock)}</strong></span><span>Stok minimum<strong>${formatNumber(view.minimum)}</strong></span>
        <span>Kos seunit<strong>${formatCurrency(view.cost)}</strong></span><span>Nilai item<strong>${formatCurrency(view.value)}</strong></span>
        <span>Status item<strong>${apiStatus}</strong></span>
      </span>
    </button>`;
  }
  return `<tr tabindex="0" data-item-id="${id}" aria-label="Lihat butiran ${name}">
    <td>${id}</td><td>${name}</td><td>${category}</td><td>${unit}</td>
    <td class="money">${formatCurrency(view.cost)}</td><td class="number-cell">${formatNumber(view.stock)}</td>
    <td class="number-cell">${formatNumber(view.minimum)}</td><td class="money">${formatCurrency(view.value)}</td>
    <td><b class="status-badge ${item.status === "AKTIF" ? "api-active" : ""}">${apiStatus}</b></td>
    <td><b class="status-badge ${statusClass(view.operationalStatus)}">${operation}</b></td>
  </tr>`;
}

function activeFilterLabels() {
  const labels = [];
  if (elements.itemSearch.value.trim()) labels.push(`Carian: ${elements.itemSearch.value.trim()}`);
  if (elements.categoryFilter.value) labels.push(`Kategori: ${elements.categoryFilter.value}`);
  if (elements.stockFilter.value) labels.push(`Stok: ${elements.stockFilter.value}`);
  if (elements.apiStatusFilter.value) labels.push(`Status: ${elements.apiStatusFilter.value}`);
  return labels;
}

function renderRegister() {
  if (!loadedItems.length) {
    elements.itemRows.innerHTML = '<tr><td colspan="10" class="empty-state">Tiada item tersedia daripada API.</td></tr>';
    elements.itemCards.innerHTML = '<p class="empty-state">Tiada item tersedia daripada API.</p>';
    elements.registerSummary.textContent = "0 item";
    elements.pageSummary.textContent = "Halaman 0 daripada 0";
    elements.previousPage.disabled = true;
    elements.nextPage.disabled = true;
    return;
  }
  const matches = filteredRegisterItems();
  const totalPages = Math.max(1, Math.ceil(matches.length / ITEMS_PER_PAGE));
  registerPage = Math.min(registerPage, totalPages);
  const start = (registerPage - 1) * ITEMS_PER_PAGE;
  const pageItems = matches.slice(start, start + ITEMS_PER_PAGE);
  const filters = activeFilterLabels();
  elements.registerSummary.textContent = filters.length
    ? `${matches.length.toLocaleString("ms-MY")} daripada ${loadedItems.length.toLocaleString("ms-MY")} item sepadan`
    : `${loadedItems.length.toLocaleString("ms-MY")} item`;
  elements.activeFilters.innerHTML = filters.map((label) => `<span class="filter-chip">${escapeHtml(label)}</span>`).join("");
  if (!pageItems.length) {
    const message = "Tiada item sepadan dengan carian atau penapis semasa.";
    elements.itemRows.innerHTML = `<tr><td colspan="10" class="empty-state">${message}</td></tr>`;
    elements.itemCards.innerHTML = `<p class="empty-state">${message}</p>`;
  } else {
    elements.itemRows.innerHTML = pageItems.map((view) => renderRegisterItem(view)).join("");
    elements.itemCards.innerHTML = pageItems.map((view) => renderRegisterItem(view, true)).join("");
  }
  elements.pageSummary.textContent = `Halaman ${matches.length ? registerPage : 0} daripada ${matches.length ? totalPages : 0}`;
  elements.previousPage.disabled = registerPage <= 1 || !matches.length;
  elements.nextPage.disabled = registerPage >= totalPages || !matches.length;
}

function showView(hash) {
  const register = hash === "#daftar-item";
  elements.dashboardView.hidden = register;
  elements.registerView.hidden = !register;
  document.title = `${register ? "Daftar Item" : "Dashboard"} | ITU eSTOR`;
  searchBox.hidden = register;
  navLinks.forEach((link) => {
    const active = link.getAttribute("href") === (register ? "#daftar-item" : "#dashboard");
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (register && loadedItems.length) renderRegister();
}

function openItemDetails(itemId, trigger) {
  const item = loadedItems.find((candidate) => String(candidate.itemId) === itemId);
  if (!item) return;
  const view = itemView(item);
  const fields = [
    ["Item ID", item.itemId], ["Nama item", item.namaItem], ["Nama item asal", item.namaItemAsal],
    ["Kategori", item.kategori], ["Unit", item.unit], ["Kos seunit", formatCurrency(view.cost)],
    ["Stok awal", formatNumber(view.stock)], ["Stok minimum", formatNumber(view.minimum)],
    ["Nilai item", formatCurrency(view.value)], ["Status API", item.status],
    ["Status stok", view.operationalStatus], ["Sumber tab", item.sumberTab],
    ["Sumber baris", item.sumberBaris], ["Dicipta", item.createdAt], ["Dikemas kini", item.updatedAt]
  ];
  elements.itemModalTitle.textContent = item.namaItem || item.itemId || "Butiran item";
  elements.itemDetails.innerHTML = fields.map(([label, value], index) =>
    `<div class="${index === 2 ? "detail-wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "—")}</dd></div>`
  ).join("");
  lastFocusedItem = trigger;
  elements.itemModal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.closeItemModal.focus();
}

function closeItemDetails() {
  if (elements.itemModal.hidden) return;
  elements.itemModal.hidden = true;
  document.body.style.overflow = "";
  if (lastFocusedItem) lastFocusedItem.focus();
}

function setAuthState(state, message) {
  elements.authState.className = `auth-state is-${state}`;
  elements.authStateMessage.textContent = message;
  elements.googleLogin.hidden = state === "loading";
  elements.authRetry.hidden = state !== "error";
}

function redirectUrl() {
  if (window.location.hostname === "itumelaka.github.io") {
    return "https://itumelaka.github.io/ituestor/";
  }
  const path = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : window.location.pathname.slice(0, window.location.pathname.lastIndexOf("/") + 1);
  return `${window.location.origin}${path}`;
}

function hasOAuthParameters() {
  const parameters = new URLSearchParams(window.location.search);
  return ["code", "error", "error_code", "error_description"].some((key) => parameters.has(key)) ||
    /(?:^#|&)(?:access_token|refresh_token|error|error_code|error_description)=/.test(window.location.hash);
}

function cleanOAuthUrl() {
  if (!hasOAuthParameters()) return;
  const url = new URL(window.location.href);
  ["code", "error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
  if (/(?:access_token|refresh_token|error|error_code|error_description)=/.test(url.hash)) url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function userInitials(name, email) {
  const source = name || email || "Pengguna";
  const words = source.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("ms") || "P";
}

function showSignedOut(message = "Sila log masuk untuk meneruskan.") {
  currentSession = null;
  accessGranted = false;
  accessRequest = null;
  inventoryRequest = null;
  inventoryLoaded = false;
  loadedItems = [];
  authRetryMode = "auth";
  document.body.className = "auth-signed-out";
  elements.userProfile.hidden = true;
  elements.googleLogin.disabled = false;
  elements.googleLogin.hidden = false;
  elements.googleLogin.textContent = "Log masuk dengan Google";
  elements.authRetry.textContent = "Cuba lagi";
  setAuthState("signed-out", message);
}

function googleProfile(session) {
  const user = session?.user || {};
  const metadata = user.user_metadata || {};
  return {
    avatarUrl: metadata.avatar_url || metadata.picture || "",
    email: user.email || "E-mel tidak tersedia"
  };
}

function showAuthorizedUser(session, applicationUser) {
  const profile = googleProfile(session);
  const name = applicationUser.nama || applicationUser.email;
  const email = applicationUser.email;
  const avatarUrl = profile.avatarUrl;
  elements.userName.textContent = name;
  elements.userEmail.textContent = email;
  elements.userAvatarFallback.textContent = userInitials(name, email);
  elements.userAvatarFallback.hidden = Boolean(avatarUrl);
  elements.userAvatarImage.hidden = !avatarUrl;
  elements.userAvatarImage.src = avatarUrl;
  elements.userAvatarImage.alt = avatarUrl ? `Foto profil ${name}` : "";
  const roleLabel = elements.userProfile.querySelector("small");
  if (roleLabel) roleLabel.textContent = applicationUser.role;
  elements.userProfile.hidden = false;
  accessGranted = true;
  document.body.className = "auth-signed-in";
  cleanOAuthUrl();
}

function accessErrorMessage(status, code) {
  if (status === 401 || code === "AUTH_REQUIRED" || code === "INVALID_TOKEN") {
    return "Sesi anda telah tamat atau tidak sah. Log keluar dan masuk semula.";
  }
  const messages = {
    EMAIL_REQUIRED: "Akaun Google ini tidak mempunyai e-mel yang boleh disahkan.",
    USER_NOT_REGISTERED: "E-mel anda belum didaftarkan untuk mengakses ITU eSTOR.",
    USER_INACTIVE: "Akses pengguna anda tidak aktif.",
    ROLE_NOT_ALLOWED: "Peranan pengguna anda tidak dibenarkan."
  };
  return messages[code] || "Akses kepada ITU eSTOR ditolak.";
}

function showAccessGate(message, mode) {
  accessGranted = false;
  authRetryMode = mode;
  document.body.className = "auth-pending";
  elements.userProfile.hidden = true;
  setAuthState("error", message);
  elements.googleLogin.hidden = true;
  elements.authRetry.hidden = false;
  elements.authRetry.textContent = mode === "logout" ? "Log keluar" : "Cuba lagi";
}

async function checkApplicationAccess(session) {
  if (!session?.access_token) {
    showAccessGate("Sesi anda telah tamat. Log keluar dan masuk semula.", "logout");
    return;
  }
  if (accessGranted || accessRequest) return accessRequest;

  currentSession = session;
  document.body.className = "auth-pending";
  elements.userProfile.hidden = true;
  setAuthState("loading", "Menyemak akses aplikasiâ€¦");

  accessRequest = (async () => {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/api/me`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session.access_token}`
        }
      });
    } catch {
      showAccessGate("Perkhidmatan akses tidak dapat dihubungi. Sila cuba lagi.", "access");
      return;
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      showAccessGate("Respons pengesahan akses tidak sah. Sila cuba lagi.", "access");
      return;
    }

    if (response.status === 401 || response.status === 403) {
      showAccessGate(accessErrorMessage(response.status, data.error), "logout");
      return;
    }
    if (!response.ok || data.success !== true || !data.user) {
      showAccessGate("Perkhidmatan akses tidak tersedia buat masa ini. Sila cuba lagi.", "access");
      return;
    }

    showAuthorizedUser(session, data.user);
    ensureInventoryData(session.access_token);
  })().finally(() => {
    accessRequest = null;
  });

  return accessRequest;
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    setAuthState("error", "Perkhidmatan log masuk tidak dapat dimulakan.");
    return;
  }
  elements.googleLogin.disabled = true;
  setAuthState("loading", "Membuka log masuk Google…");
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl() }
    });
    if (error) throw error;
  } catch (error) {
    console.error("Log masuk Google gagal dimulakan.");
    elements.googleLogin.disabled = false;
    setAuthState("error", "Log masuk Google tidak dapat dimulakan. Sila cuba lagi.");
  }
}

async function signOut() {
  if (!supabaseClient) return;
  elements.logoutButton.disabled = true;
  elements.logoutButton.textContent = "Sedang keluar…";
  let error = null;
  try {
    ({ error } = await supabaseClient.auth.signOut());
  } catch (signOutError) {
    error = signOutError;
  }
  elements.logoutButton.disabled = false;
  elements.logoutButton.textContent = "Log keluar";
  if (error) {
    console.error("Log keluar gagal.");
    elements.logoutButton.title = "Log keluar gagal. Sila cuba lagi.";
  } else {
    elements.logoutButton.removeAttribute("title");
  }
}

async function initializeAuth() {
  setAuthState("loading", "Menyemak sesi anda…");
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    setAuthState("error", "Perkhidmatan log masuk gagal dimuatkan. Semak sambungan dan cuba lagi.");
    return;
  }
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) checkApplicationAccess(session);
      else showSignedOut();
    });
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) checkApplicationAccess(data.session);
    else {
      const oauthError = new URLSearchParams(window.location.search).has("error") ||
        /(?:^#|&)error=/.test(window.location.hash);
      if (oauthError) {
        cleanOAuthUrl();
        showSignedOut("Log masuk Google tidak berjaya. Sila cuba lagi.");
      } else {
        showSignedOut();
      }
    }
  } catch (error) {
    console.error("Sesi pengguna gagal dipulihkan.");
    cleanOAuthUrl();
    setAuthState("error", "Sesi anda tidak dapat disemak. Sila cuba lagi.");
  }
}

function ensureInventoryData(accessToken) {
  if (!accessGranted || !accessToken) return null;
  if (inventoryLoaded || inventoryRequest) return inventoryRequest;
  inventoryRequest = loadDashboardData(accessToken).finally(() => {
    inventoryRequest = null;
  });
  return inventoryRequest;
}

async function loadDashboardData(accessToken) {
  if (!accessGranted || !accessToken) return;
  setDataState("loading", "Memuatkan data stok sebenar…");
  try {
    const response = await fetch(API_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (response.status === 401 || response.status === 403) {
      let data = {};
      try {
        data = await response.json();
      } catch {
        // Gunakan mesej selamat lalai.
      }
      showAccessGate(accessErrorMessage(response.status, data.error), "logout");
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.items)) throw new Error("Respons API tidak sah");
    loadedItems = data.items.slice();
    inventoryLoaded = true;
    renderDashboard(loadedItems, data.count);
    populateRegisterFilters();
    renderRegister();
    setDataState("ready", "");
    setRegisterState(loadedItems.length ? "ready" : "empty", loadedItems.length ? "" : "API tidak mengandungi item untuk dipaparkan.");
  } catch (error) {
    console.error("Data dashboard gagal dimuatkan:", error);
    loadedItems = [];
    inventoryLoaded = false;
    renderRegister();
    setDataState("error", "Data stok tidak dapat dimuatkan buat masa ini.");
    setRegisterState("error", "Daftar item tidak dapat dimuatkan buat masa ini.");
  }
}

async function retryInventoryData() {
  if (!supabaseClient || !accessGranted) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session?.access_token) {
    showAccessGate("Sesi anda telah tamat. Log keluar dan masuk semula.", "logout");
    return;
  }
  ensureInventoryData(data.session.access_token);
}

function toggleSidebar(open) {
  sidebar.classList.toggle("open", open);
  drawerBackdrop.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
}

menuToggle.addEventListener("click", () => {
  toggleSidebar(!sidebar.classList.contains("open"));
});

drawerBackdrop.addEventListener("click", () => toggleSidebar(false));

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const target = link.getAttribute("href");
    if (target === "#dashboard" || target === "#daftar-item") showView(target);
    if (window.innerWidth <= 960) toggleSidebar(false);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.itemModal.hidden) {
    closeItemDetails();
    return;
  }
  if (event.key === "Escape" && sidebar.classList.contains("open")) {
    toggleSidebar(false);
    menuToggle.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 960 && sidebar.classList.contains("open")) {
    toggleSidebar(false);
  }
});

searchInput.addEventListener("input", () => {
  const active = searchInput.value.trim().length > 0;
  searchBox.classList.toggle("is-searching", active);
  searchBox.title = active ? `Menapis item: ${searchInput.value.trim()}` : "";
  if (loadedItems.length) renderStockAlerts(filterItems());
});

elements.retryData.addEventListener("click", retryInventoryData);
elements.registerRetry.addEventListener("click", retryInventoryData);
[
  elements.itemSearch, elements.categoryFilter, elements.stockFilter,
  elements.apiStatusFilter, elements.itemSort
].forEach((control) => control.addEventListener("input", () => {
  registerPage = 1;
  renderRegister();
}));
elements.previousPage.addEventListener("click", () => {
  if (registerPage > 1) {
    registerPage -= 1;
    renderRegister();
    elements.registerView.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
elements.nextPage.addEventListener("click", () => {
  registerPage += 1;
  renderRegister();
  elements.registerView.scrollIntoView({ behavior: "smooth", block: "start" });
});
[elements.itemRows, elements.itemCards].forEach((container) => {
  container.addEventListener("click", (event) => {
    const target = event.target.closest("[data-item-id]");
    if (target) openItemDetails(target.dataset.itemId, target);
  });
});
elements.itemRows.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    const target = event.target.closest("[data-item-id]");
    if (target) {
      event.preventDefault();
      openItemDetails(target.dataset.itemId, target);
    }
  }
});
elements.closeItemModal.addEventListener("click", closeItemDetails);
elements.itemModal.addEventListener("click", (event) => {
  if (event.target === elements.itemModal) closeItemDetails();
});
elements.googleLogin.addEventListener("click", signInWithGoogle);
elements.logoutButton.addEventListener("click", signOut);
elements.authRetry.addEventListener("click", () => {
  if (authRetryMode === "logout") {
    signOut();
  } else if (authRetryMode === "access" && currentSession) {
    checkApplicationAccess(currentSession);
  } else if (!window.supabase) {
    window.location.reload();
  } else {
    initializeAuth();
  }
});
elements.userAvatarImage.addEventListener("error", () => {
  elements.userAvatarImage.hidden = true;
  elements.userAvatarFallback.hidden = false;
});
window.addEventListener("hashchange", () => showView(window.location.hash));
showView(window.location.hash);
initializeAuth();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch(() => console.warn("Sokongan luar talian tidak dapat dimulakan."));
  });
}

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
const itemCategoryPrefixes = {
  "ALAT TULIS": "AT-",
  "BAHAN KIMIA": "BK-",
  "HOUSE HOLD": "HH-",
  "LAIN-LAIN": "LL-"
};
const ITEMS_PER_PAGE = 20;
let loadedItems = [];
let registerPage = 1;
let lastFocusedItem = null;
let openedItemId = "";
let inventoryRequest = null;
let inventoryLoaded = false;
let supabaseClient = null;
let accessRequest = null;
let accessGranted = false;
let currentSession = null;
let currentApplicationUser = null;
let authRetryMode = "auth";
let incomingAttemptKey = "";
let incomingAttemptFingerprint = "";
let incomingSubmitting = false;
let createItemAttemptKey = "";
let createItemAttemptFingerprint = "";
let createItemSubmitting = false;
let createdItemForIncoming = null;

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
  incomingView: document.getElementById("barang-masuk"),
  registerDataState: document.getElementById("registerDataState"),
  registerStateMessage: document.getElementById("registerStateMessage"),
  registerRetry: document.getElementById("registerRetry"),
  openCreateItem: document.getElementById("openCreateItem"),
  createItemPanel: document.getElementById("createItemPanel"),
  closeCreateItem: document.getElementById("closeCreateItem"),
  createItemState: document.getElementById("createItemState"),
  createItemStateMessage: document.getElementById("createItemStateMessage"),
  retryCreateItem: document.getElementById("retryCreateItem"),
  createItemForm: document.getElementById("createItemForm"),
  createItemCategory: document.getElementById("createItemCategory"),
  createItemName: document.getElementById("createItemName"),
  createItemUnit: document.getElementById("createItemUnit"),
  createItemCost: document.getElementById("createItemCost"),
  createItemMinimum: document.getElementById("createItemMinimum"),
  createItemPrefix: document.getElementById("createItemPrefix"),
  createItemSubmit: document.getElementById("createItemSubmit"),
  createItemSuccessActions: document.getElementById("createItemSuccessActions"),
  continueToIncoming: document.getElementById("continueToIncoming"),
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
  detailAddStock: document.getElementById("detailAddStock"),
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
  logoutButton: document.getElementById("logoutButton"),
  quickBarangMasuk: document.getElementById("quickBarangMasuk"),
  incomingState: document.getElementById("incomingState"),
  incomingStateMessage: document.getElementById("incomingStateMessage"),
  retryIncoming: document.getElementById("retryIncoming"),
  incomingForm: document.getElementById("incomingForm"),
  incomingItemSearch: document.getElementById("incomingItemSearch"),
  incomingItem: document.getElementById("incomingItem"),
  incomingItemSummary: document.getElementById("incomingItemSummary"),
  registerMissingItem: document.getElementById("registerMissingItem"),
  incomingQuantity: document.getElementById("incomingQuantity"),
  incomingUnitCost: document.getElementById("incomingUnitCost"),
  incomingNotes: document.getElementById("incomingNotes"),
  incomingTotal: document.getElementById("incomingTotal"),
  incomingSubmit: document.getElementById("incomingSubmit")
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

function setIncomingState(state, message, retry = false) {
  elements.incomingState.className = `data-state is-${state}`;
  elements.incomingStateMessage.textContent = message;
  elements.retryIncoming.hidden = !retry;
}

function setCreateItemState(state, message, retry = false) {
  elements.createItemState.className = `data-state is-${state}`;
  elements.createItemStateMessage.textContent = message;
  elements.retryCreateItem.hidden = !retry;
}

function canCreateItem() {
  return ["SUPER_ADMIN", "ADMIN_STOR"].includes(currentApplicationUser?.role);
}

function canAddStock() {
  return ["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"].includes(currentApplicationUser?.role);
}

function itemNumbers(item) {
  return {
    initialStock: numericValue(item.stokAwal, "stokAwal", item),
    incoming: numericValue(item.jumlahMasuk, "jumlahMasuk", item),
    outgoing: numericValue(item.jumlahKeluar, "jumlahKeluar", item),
    stock: numericValue(item.stokSemasa, "stokSemasa", item),
    minimum: numericValue(item.stokMinimum, "stokMinimum", item),
    cost: numericValue(item.kosSeunit, "kosSeunit", item),
    currentValue: numericValue(item.nilaiStokSemasa, "nilaiStokSemasa", item)
  };
}

function renderStockAlerts(items) {
  const alerts = items.map((item) => ({ item, ...itemNumbers(item) }))
    .filter(({ item }) => item.statusStok === "HABIS" || item.statusStok === "RENDAH");

  if (!alerts.length) {
    const searching = searchInput.value.trim();
    elements.stockAlertRows.innerHTML = `<tr><td colspan="4" class="empty-state">${
      searching ? "Tiada item stok rendah atau habis sepadan dengan carian." :
        "Tiada item stok rendah atau habis berdasarkan stok semasa dan stok minimum."
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
  const knownValue = metrics.reduce((sum, entry) => sum + entry.currentValue, 0);
  const low = metrics.filter(({ item }) => item.statusStok === "RENDAH").length;
  const out = metrics.filter(({ item }) => item.statusStok === "HABIS").length;

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
  return "TERSEDIA";
}

function itemView(item) {
  const initialStock = parsedNumber(item.stokAwal, "stokAwal", item);
  const incoming = parsedNumber(item.jumlahMasuk, "jumlahMasuk", item);
  const outgoing = parsedNumber(item.jumlahKeluar, "jumlahKeluar", item);
  const stock = parsedNumber(item.stokSemasa, "stokSemasa", item);
  const minimum = parsedNumber(item.stokMinimum, "stokMinimum", item);
  const cost = parsedNumber(item.kosSeunit, "kosSeunit", item);
  const value = parsedNumber(item.nilaiStokSemasa, "nilaiStokSemasa", item);
  const apiStockStatus = ["HABIS", "RENDAH", "TERSEDIA"].includes(item.statusStok)
    ? item.statusStok
    : stockStatus(stock, minimum);
  return {
    item, initialStock, incoming, outgoing, stock, minimum, cost, value,
    operationalStatus: apiStockStatus
  };
}

function formatNumber(number) {
  return number.valid ? number.value.toLocaleString("ms-MY", { maximumFractionDigits: 2 }) : "—";
}

function formatCurrency(number) {
  return number.valid ? currencyFormatter.format(number.value) : "—";
}

function statusClass(status) {
  if (status === "TERSEDIA") return "status-in";
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

function activeIncomingItems() {
  return loadedItems.filter((item) => String(item.status ?? "").trim().toUpperCase() === "AKTIF");
}

function populateIncomingItems() {
  const selected = elements.incomingItem.value;
  const query = elements.incomingItemSearch.value.trim().toLocaleLowerCase("ms");
  const matches = activeIncomingItems().filter((item) => !query ||
    [item.itemId, item.namaItem, item.namaItemAsal].some((value) =>
      String(value ?? "").toLocaleLowerCase("ms").includes(query)));
  elements.incomingItem.innerHTML = '<option value="">Pilih item</option>' +
    matches.map((item) => `<option value="${escapeHtml(item.itemId)}">${escapeHtml(item.itemId)} — ${escapeHtml(item.namaItem || item.namaItemAsal || "Tanpa nama")}</option>`).join("");
  if (matches.some((item) => String(item.itemId) === selected)) {
    elements.incomingItem.value = selected;
  }
  const missing = Boolean(query) && matches.length === 0;
  elements.registerMissingItem.hidden = !missing || !canCreateItem();
  updateIncomingItemSummary();
}

function selectedIncomingItem() {
  return loadedItems.find((item) => String(item.itemId) === elements.incomingItem.value);
}

function updateIncomingItemSummary() {
  const item = selectedIncomingItem();
  if (!item) {
    const query = elements.incomingItemSearch.value.trim();
    elements.incomingItemSummary.textContent = query
      ? `Item tidak ditemui: ${query}`
      : activeIncomingItems().length
        ? "Pilih item aktif daripada inventori."
        : "Tiada item aktif tersedia.";
    return;
  }
  elements.registerMissingItem.hidden = true;
  const view = itemView(item);
  elements.incomingItemSummary.textContent =
    `${item.itemId} · ${item.namaItem || item.namaItemAsal || "Tanpa nama"} · ${item.kategori || "Tiada kategori"} · ${item.unit || "Tiada unit"} · Stok semasa ${formatNumber(view.stock)} · Kos rujukan ${formatCurrency(view.cost)}`;
  if (!elements.incomingUnitCost.value && view.cost.valid) {
    elements.incomingUnitCost.value = view.cost.value.toFixed(2);
  }
}

function incomingPayload() {
  return {
    itemId: elements.incomingItem.value,
    kuantiti: Number(elements.incomingQuantity.value),
    kosSeunit: Number(elements.incomingUnitCost.value),
    catatan: elements.incomingNotes.value.trim()
  };
}

function incomingFingerprint() {
  const payload = incomingPayload();
  return JSON.stringify(payload);
}

function markIncomingMaterialChange() {
  const fingerprint = incomingFingerprint();
  if (incomingAttemptFingerprint && fingerprint !== incomingAttemptFingerprint) {
    incomingAttemptKey = "";
    incomingAttemptFingerprint = "";
  }
  const quantity = Number(elements.incomingQuantity.value);
  const cost = Number(elements.incomingUnitCost.value);
  const total = Number.isFinite(quantity) && Number.isFinite(cost) && quantity > 0 && cost >= 0
    ? quantity * cost
    : 0;
  elements.incomingTotal.textContent = currencyFormatter.format(total);
  if (!incomingSubmitting) setIncomingState("ready", "");
}

function incomingErrorMessage(status, code) {
  const messages = {
    VALIDATION_ERROR: "Semak semua medan wajib dan nilai nombor sebelum menghantar.",
    INVALID_JSON: "Maklumat transaksi tidak dapat dibaca.",
    INVALID_IDEMPOTENCY_KEY: "Cubaan ini tidak mempunyai pengecam selamat. Muat semula halaman dan cuba lagi.",
    IDEMPOTENCY_CONFLICT: "Cubaan yang sama telah digunakan untuk maklumat berbeza. Ubah borang dan cuba lagi.",
    ITEM_NOT_FOUND: "Item yang dipilih tidak lagi ditemui.",
    ITEM_INACTIVE: "Item yang dipilih tidak lagi aktif.",
    ROLE_NOT_ALLOWED: "Peranan anda tidak dibenarkan merekod Barang Masuk.",
    WRITE_FAILED: "Transaksi belum dapat disahkan tersimpan. Cuba hantar semula tanpa mengubah borang."
  };
  if (status === 401) return "Sesi anda telah tamat. Log keluar dan masuk semula.";
  return messages[code] || "Transaksi tidak dapat disimpan buat masa ini.";
}

async function submitIncomingTransaction(event) {
  if (event) event.preventDefault();
  if (incomingSubmitting || !accessGranted) return;
  if (!["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"].includes(currentApplicationUser?.role)) {
    setIncomingState("error", "Peranan anda tidak dibenarkan merekod Barang Masuk.");
    return;
  }
  if (!elements.incomingForm.reportValidity()) return;

  let session;
  try {
    const result = await supabaseClient.auth.getSession();
    if (result.error || !result.data.session?.access_token) {
      showAccessGate("Sesi anda telah tamat. Log keluar dan masuk semula.", "logout");
      return;
    }
    session = result.data.session;
  } catch {
    setIncomingState("error", "Sesi tidak dapat disemak. Cuba lagi.", true);
    return;
  }

  const payload = incomingPayload();
  const fingerprint = JSON.stringify(payload);
  if (!incomingAttemptKey || incomingAttemptFingerprint !== fingerprint) {
    incomingAttemptKey = crypto.randomUUID();
    incomingAttemptFingerprint = fingerprint;
  }

  incomingSubmitting = true;
  elements.incomingSubmit.disabled = true;
  elements.incomingSubmit.textContent = "Sedang menyimpan…";
  setIncomingState("loading", "Merekod transaksi dan audit…");
  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions/in`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "Idempotency-Key": incomingAttemptKey
      },
      body: JSON.stringify(payload)
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Gunakan mesej selamat lalai.
    }
    if (response.status === 401) {
      showAccessGate(incomingErrorMessage(response.status, data.error), "logout");
      return;
    }
    if (!response.ok || data.success !== true) {
      const uncertain = response.status >= 500 || data.error === "WRITE_FAILED";
      setIncomingState("error", incomingErrorMessage(response.status, data.error), uncertain);
      return;
    }

    const transaction = data.transaction || {};
    setIncomingState(
      "success",
      `${data.replayed ? "Transaksi disahkan semula" : "Barang Masuk berjaya direkodkan"}: ${transaction.transactionId || "rekod baharu"}.`
    );
    incomingAttemptKey = "";
    incomingAttemptFingerprint = "";
    elements.incomingQuantity.value = "";
    elements.incomingNotes.value = "";
    markIncomingMaterialChange();
    await refreshInventoryData();
  } catch {
    setIncomingState(
      "error",
      "Sambungan terputus dan status simpanan belum pasti. Cuba hantar semula tanpa mengubah borang.",
      true
    );
  } finally {
    incomingSubmitting = false;
    elements.incomingSubmit.disabled =
      !["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"].includes(currentApplicationUser?.role);
    elements.incomingSubmit.textContent = "Simpan Barang Masuk";
  }
}

function openCreateItemPanel(prefillName = "") {
  if (!canCreateItem()) return;
  elements.createItemPanel.hidden = false;
  if (prefillName && !elements.createItemName.value.trim()) {
    elements.createItemName.value = prefillName.trim().slice(0, 160);
  }
  markCreateItemMaterialChange();
  elements.createItemPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.createItemName.focus();
}

function closeCreateItemPanel() {
  elements.createItemPanel.hidden = true;
  elements.openCreateItem.focus();
}

function createItemPayload() {
  return {
    kategori: elements.createItemCategory.value,
    namaItem: elements.createItemName.value.trim().replace(/\s+/g, " "),
    unit: elements.createItemUnit.value.trim().replace(/\s+/g, " ").toLocaleUpperCase("ms"),
    kosSeunit: Number(elements.createItemCost.value),
    stokMinimum: Number(elements.createItemMinimum.value)
  };
}

function createItemFingerprint() {
  return JSON.stringify(createItemPayload());
}

function markCreateItemMaterialChange() {
  const fingerprint = createItemFingerprint();
  if (createItemAttemptFingerprint && fingerprint !== createItemAttemptFingerprint) {
    createItemAttemptKey = "";
    createItemAttemptFingerprint = "";
  }
  elements.createItemPrefix.textContent =
    itemCategoryPrefixes[elements.createItemCategory.value] || "—";
  if (createdItemForIncoming && !createItemSubmitting) {
    createdItemForIncoming = null;
    elements.createItemSuccessActions.hidden = true;
  }
  if (!createItemSubmitting) setCreateItemState("ready", "");
}

function createItemErrorMessage(status, code, data) {
  if (status === 401) return "Sesi anda telah tamat. Log keluar dan masuk semula.";
  const messages = {
    INVALID_JSON: "Maklumat item tidak dapat dibaca.",
    INVALID_IDEMPOTENCY_KEY: "Cubaan ini tidak mempunyai pengecam selamat. Muat semula halaman dan cuba lagi.",
    VALIDATION_ERROR: "Semak kategori, nama, unit, kos dan stok minimum.",
    ROLE_NOT_ALLOWED: "Peranan anda tidak dibenarkan mendaftar item baharu.",
    IDEMPOTENCY_CONFLICT: "Cubaan yang sama telah digunakan untuk maklumat item berbeza.",
    WRITE_FAILED: "Status simpanan belum dapat dipastikan. Cuba hantar semula tanpa mengubah borang."
  };
  if (code === "ITEM_ALREADY_EXISTS") {
    const item = data?.existingItem;
    return item?.itemId
      ? `Item sepadan telah wujud: ${item.itemId} — ${item.namaItem || "tanpa nama"} (${item.unit || "tanpa unit"}).`
      : "Item dengan nama, kategori dan unit yang sama telah wujud.";
  }
  return messages[code] || "Item tidak dapat didaftarkan buat masa ini.";
}

function mergeConfirmedItem(item) {
  if (!item?.itemId || loadedItems.some((existing) => existing.itemId === item.itemId)) return;
  loadedItems = [...loadedItems, {
    ...item,
    namaItemAsal: item.namaItem,
    sumberTab: "NEW_ITEM",
    sumberBaris: 0,
    jumlahMasuk: 0,
    jumlahKeluar: 0,
    stokSemasa: 0,
    nilaiStokSemasa: 0,
    statusStok: "HABIS"
  }];
  inventoryLoaded = true;
  renderDashboard(loadedItems, loadedItems.length);
  populateRegisterFilters();
  populateIncomingItems();
}

async function submitCreateItem(event) {
  if (event) event.preventDefault();
  if (createItemSubmitting || !accessGranted) return;
  if (!canCreateItem()) {
    setCreateItemState("error", "Peranan anda tidak dibenarkan mendaftar item baharu.");
    return;
  }
  if (!elements.createItemForm.reportValidity()) return;

  let session;
  try {
    const result = await supabaseClient.auth.getSession();
    if (result.error || !result.data.session?.access_token) {
      showAccessGate("Sesi anda telah tamat. Log keluar dan masuk semula.", "logout");
      return;
    }
    session = result.data.session;
  } catch {
    setCreateItemState("error", "Sesi tidak dapat disemak. Cuba lagi.", true);
    return;
  }

  const payload = createItemPayload();
  const fingerprint = JSON.stringify(payload);
  if (!createItemAttemptKey || createItemAttemptFingerprint !== fingerprint) {
    createItemAttemptKey = crypto.randomUUID();
    createItemAttemptFingerprint = fingerprint;
  }

  createItemSubmitting = true;
  elements.createItemSubmit.disabled = true;
  elements.createItemSubmit.textContent = "Sedang mendaftar…";
  elements.createItemSuccessActions.hidden = true;
  setCreateItemState("loading", "Mendaftar item dan jejak audit…");
  try {
    const response = await fetch(`${API_BASE_URL}/api/items`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "Idempotency-Key": createItemAttemptKey
      },
      body: JSON.stringify(payload)
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Gunakan mesej selamat lalai.
    }
    if (response.status === 401) {
      showAccessGate(createItemErrorMessage(response.status, data.error, data), "logout");
      return;
    }
    if (!response.ok || data.success !== true || !data.item) {
      const uncertain = response.status >= 500 || data.error === "WRITE_FAILED";
      setCreateItemState(
        "error",
        createItemErrorMessage(response.status, data.error, data),
        uncertain
      );
      return;
    }

    createdItemForIncoming = data.item;
    createItemAttemptKey = "";
    createItemAttemptFingerprint = "";
    setCreateItemState(
      "success",
      `${data.replayed ? "Item disahkan semula" : "Item berjaya didaftarkan"}: ${data.item.itemId}. Stok awal ialah 0.`
    );
    elements.createItemSuccessActions.hidden = false;
    const refreshed = await refreshInventoryData();
    if (!refreshed) mergeConfirmedItem(data.item);
    elements.itemSearch.value = data.item.itemId;
    registerPage = 1;
    renderRegister();
  } catch {
    setCreateItemState(
      "error",
      "Sambungan terputus dan status simpanan belum pasti. Cuba hantar semula tanpa mengubah borang.",
      true
    );
  } finally {
    createItemSubmitting = false;
    elements.createItemSubmit.disabled = !canCreateItem();
    elements.createItemSubmit.textContent = "Daftar Item";
  }
}

function continueCreatedItemToIncoming() {
  if (!createdItemForIncoming?.itemId) return;
  goToIncomingItem(createdItemForIncoming.itemId);
}

function goToIncomingItem(itemId) {
  if (!canAddStock()) return;
  const item = loadedItems.find((candidate) => String(candidate.itemId) === String(itemId));
  if (!item || String(item.status ?? "").trim().toUpperCase() !== "AKTIF") return;
  closeItemDetails();
  window.location.hash = "#barang-masuk";
  showView("#barang-masuk");
  elements.incomingItemSearch.value = "";
  populateIncomingItems();
  elements.incomingItem.value = itemId;
  if (!selectedIncomingItem()) {
    elements.incomingItemSearch.value = itemId;
    populateIncomingItems();
    elements.incomingItem.value = itemId;
  }
  elements.incomingUnitCost.value = "";
  updateIncomingItemSummary();
  markIncomingMaterialChange();
  elements.incomingQuantity.focus();
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
  const addStockAction = canAddStock() && item.status === "AKTIF"
    ? `<button class="add-stock-action" type="button" data-add-stock-id="${id}" aria-label="Tambah stok untuk ${name}">Tambah Stok</button>`
    : "";
  if (card) {
    return `<article class="item-card">
      <button class="item-card-details" type="button" data-item-id="${id}" aria-label="Lihat butiran ${name}">
      <span class="item-card-head"><span><small>${id}</small><h3>${name}</h3></span><b class="status-badge ${statusClass(view.operationalStatus)}">${operation}</b></span>
      <span class="item-card-grid">
        <span>Kategori<strong>${category}</strong></span><span>Unit<strong>${unit}</strong></span>
        <span>Stok semasa<strong>${formatNumber(view.stock)}</strong></span><span>Stok minimum<strong>${formatNumber(view.minimum)}</strong></span>
        <span>Kos seunit<strong>${formatCurrency(view.cost)}</strong></span><span>Nilai semasa<strong>${formatCurrency(view.value)}</strong></span>
        <span>Status item<strong>${apiStatus}</strong></span>
      </span>
      </button>${addStockAction}
    </article>`;
  }
  return `<tr tabindex="0" data-item-id="${id}" aria-label="Lihat butiran ${name}">
    <td>${id}</td><td>${name}</td><td>${category}</td><td>${unit}</td>
    <td class="money">${formatCurrency(view.cost)}</td><td class="number-cell">${formatNumber(view.stock)}</td>
    <td class="number-cell">${formatNumber(view.minimum)}</td><td class="money">${formatCurrency(view.value)}</td>
    <td><b class="status-badge ${item.status === "AKTIF" ? "api-active" : ""}">${apiStatus}</b></td>
    <td><b class="status-badge ${statusClass(view.operationalStatus)}">${operation}</b></td>
    <td>${addStockAction}</td>
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
    elements.itemRows.innerHTML = '<tr><td colspan="11" class="empty-state">Tiada item tersedia daripada API.</td></tr>';
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
    elements.itemRows.innerHTML = `<tr><td colspan="11" class="empty-state">${message}</td></tr>`;
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
  const incoming = hash === "#barang-masuk";
  elements.dashboardView.hidden = register || incoming;
  elements.registerView.hidden = !register;
  elements.incomingView.hidden = !incoming;
  const viewTitle = register ? "Daftar Item" : incoming ? "Barang Masuk" : "Dashboard";
  document.title = `${viewTitle} | ITU eSTOR`;
  searchBox.hidden = register || incoming;
  navLinks.forEach((link) => {
    const target = register ? "#daftar-item" : incoming ? "#barang-masuk" : "#dashboard";
    const active = link.getAttribute("href") === target;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (register && loadedItems.length) renderRegister();
  if (incoming && loadedItems.length) populateIncomingItems();
}

function renderItemDetails(item) {
  const view = itemView(item);
  const fields = [
    ["Item ID", item.itemId], ["Nama item", item.namaItem], ["Nama item asal", item.namaItemAsal],
    ["Kategori", item.kategori], ["Unit", item.unit], ["Kos seunit", formatCurrency(view.cost)],
    ["Stok awal", formatNumber(view.initialStock)], ["Jumlah masuk", formatNumber(view.incoming)],
    ["Jumlah keluar", formatNumber(view.outgoing)], ["Stok semasa", formatNumber(view.stock)],
    ["Stok minimum", formatNumber(view.minimum)], ["Nilai stok semasa", formatCurrency(view.value)],
    ["Status API", item.status], ["Status stok", view.operationalStatus], ["Sumber tab", item.sumberTab],
    ["Sumber baris", item.sumberBaris], ["Dicipta", item.createdAt], ["Dikemas kini", item.updatedAt]
  ];
  elements.itemModalTitle.textContent = item.namaItem || item.itemId || "Butiran item";
  elements.itemDetails.innerHTML = fields.map(([label, value], index) =>
    `<div class="${index === 2 ? "detail-wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "—")}</dd></div>`
  ).join("");
  const mayAddStock = canAddStock() && String(item.status ?? "").trim().toUpperCase() === "AKTIF";
  elements.detailAddStock.hidden = !mayAddStock;
  elements.detailAddStock.dataset.addStockId = mayAddStock ? item.itemId : "";
}

function openItemDetails(itemId, trigger) {
  const item = loadedItems.find((candidate) => String(candidate.itemId) === itemId);
  if (!item) return;
  renderItemDetails(item);
  openedItemId = itemId;
  lastFocusedItem = trigger;
  elements.itemModal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.closeItemModal.focus();
}

function closeItemDetails() {
  if (elements.itemModal.hidden) return;
  elements.itemModal.hidden = true;
  document.body.style.overflow = "";
  openedItemId = "";
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
  currentApplicationUser = null;
  openedItemId = "";
  incomingAttemptKey = "";
  incomingAttemptFingerprint = "";
  createItemAttemptKey = "";
  createItemAttemptFingerprint = "";
  createdItemForIncoming = null;
  elements.openCreateItem.hidden = true;
  elements.createItemPanel.hidden = true;
  elements.createItemSuccessActions.hidden = true;
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
  currentApplicationUser = applicationUser;
  const mayCreateItems = canCreateItem();
  elements.openCreateItem.hidden = !mayCreateItems;
  elements.createItemSubmit.disabled = !mayCreateItems;
  elements.createItemSubmit.title = mayCreateItems
    ? ""
    : "Peranan ini tidak dibenarkan mendaftar item baharu.";
  if (!mayCreateItems) elements.createItemPanel.hidden = true;
  const canWrite = ["SUPER_ADMIN", "ADMIN_STOR", "PEMBANTU_STOR"].includes(applicationUser.role);
  elements.incomingSubmit.disabled = !canWrite;
  elements.incomingSubmit.title = canWrite ? "" : "Peranan ini tidak dibenarkan merekod Barang Masuk.";
  if (!canWrite) {
    setIncomingState("error", "Peranan anda boleh membaca inventori tetapi tidak boleh merekod Barang Masuk.");
  }
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
  const hadLoadedItems = loadedItems.length > 0;
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
    populateIncomingItems();
    renderRegister();
    if (!elements.itemModal.hidden && openedItemId) {
      const openedItem = loadedItems.find((item) => String(item.itemId) === openedItemId);
      if (openedItem) renderItemDetails(openedItem);
      else closeItemDetails();
    }
    setDataState("ready", "");
    setRegisterState(loadedItems.length ? "ready" : "empty", loadedItems.length ? "" : "API tidak mengandungi item untuk dipaparkan.");
    return true;
  } catch (error) {
    console.error("Data dashboard gagal dimuatkan:", error);
    if (!hadLoadedItems) loadedItems = [];
    inventoryLoaded = hadLoadedItems;
    renderRegister();
    setDataState("error", "Data stok tidak dapat dimuatkan buat masa ini.");
    setRegisterState(
      "error",
      hadLoadedItems
        ? "Data terkini tidak dapat dimuatkan; senarai terakhir masih dipaparkan."
        : "Daftar item tidak dapat dimuatkan buat masa ini."
    );
    return false;
  }
}

async function refreshInventoryData() {
  if (!supabaseClient || !accessGranted) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session?.access_token) {
    showAccessGate("Sesi anda telah tamat. Log keluar dan masuk semula.", "logout");
    return;
  }
  inventoryLoaded = false;
  return await ensureInventoryData(data.session.access_token);
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
    if (target === "#dashboard" || target === "#daftar-item" || target === "#barang-masuk") showView(target);
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
elements.openCreateItem.addEventListener("click", () => openCreateItemPanel());
elements.closeCreateItem.addEventListener("click", closeCreateItemPanel);
[
  elements.createItemCategory, elements.createItemName, elements.createItemUnit,
  elements.createItemCost, elements.createItemMinimum
].forEach((control) => control.addEventListener("input", markCreateItemMaterialChange));
elements.createItemForm.addEventListener("submit", submitCreateItem);
elements.retryCreateItem.addEventListener("click", submitCreateItem);
elements.continueToIncoming.addEventListener("click", continueCreatedItemToIncoming);
elements.quickBarangMasuk.addEventListener("click", () => {
  window.location.hash = "#barang-masuk";
});
elements.incomingItemSearch.addEventListener("input", populateIncomingItems);
elements.incomingItem.addEventListener("change", () => {
  elements.incomingUnitCost.value = "";
  updateIncomingItemSummary();
  markIncomingMaterialChange();
});
[
  elements.incomingQuantity, elements.incomingUnitCost, elements.incomingNotes
].forEach((control) => control.addEventListener("input", markIncomingMaterialChange));
elements.incomingForm.addEventListener("submit", submitIncomingTransaction);
elements.retryIncoming.addEventListener("click", submitIncomingTransaction);
elements.registerMissingItem.addEventListener("click", () => {
  const query = elements.incomingItemSearch.value.trim();
  window.location.hash = "#daftar-item";
  showView("#daftar-item");
  openCreateItemPanel(query);
});
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
    const addStockTarget = event.target.closest("[data-add-stock-id]");
    if (addStockTarget) {
      event.stopPropagation();
      goToIncomingItem(addStockTarget.dataset.addStockId);
      return;
    }
    const target = event.target.closest("[data-item-id]");
    if (target) openItemDetails(target.dataset.itemId, target);
  });
});
elements.itemRows.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    if (event.target.closest("[data-add-stock-id]")) return;
    const target = event.target.closest("[data-item-id]");
    if (target) {
      event.preventDefault();
      openItemDetails(target.dataset.itemId, target);
    }
  }
});
elements.closeItemModal.addEventListener("click", closeItemDetails);
elements.detailAddStock.addEventListener("click", () => {
  goToIncomingItem(elements.detailAddStock.dataset.addStockId);
});
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

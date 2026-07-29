"use strict";

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const navLinks = document.querySelectorAll(".nav-link");
const searchInput = document.getElementById("dashboardSearch");
const searchBox = searchInput.closest(".search");
const API_URL = "https://ituestor-api.itumelaka.workers.dev/api/items";
const chartColors = ["#2777c7", "#51a83c", "#ffc313", "#ed4938", "#8a62b8", "#40a5af"];
let loadedItems = [];

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
  stockAlertRows: document.getElementById("stockAlertRows")
};

function numericValue(value, fieldName, item) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    console.warn(`Nilai ${fieldName} tidak sah untuk item ${item.itemId || "(tanpa ID)"}; 0 digunakan untuk pengiraan paparan.`);
    return 0;
  }
  return number;
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

async function loadDashboardData() {
  setDataState("loading", "Memuatkan data stok sebenar…");
  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.items)) throw new Error("Respons API tidak sah");
    loadedItems = data.items.slice();
    renderDashboard(loadedItems, data.count);
    setDataState("ready", "");
  } catch (error) {
    console.error("Data dashboard gagal dimuatkan:", error);
    loadedItems = [];
    setDataState("error", "Data stok tidak dapat dimuatkan buat masa ini.");
  }
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
    navLinks.forEach((item) => {
      item.classList.remove("active");
      item.removeAttribute("aria-current");
    });
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
    if (window.innerWidth <= 960) toggleSidebar(false);
  });
});

document.addEventListener("keydown", (event) => {
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

elements.retryData.addEventListener("click", loadDashboardData);
loadDashboardData();

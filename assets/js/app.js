"use strict";

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const navLinks = document.querySelectorAll(".nav-link");
const searchInput = document.getElementById("dashboardSearch");
const searchBox = searchInput.closest(".search");

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
  searchBox.title = active ? `Carian visual: ${searchInput.value.trim()}` : "";
});

/* Small mobile navigation adapter; existing N2K navigation remains authoritative. */
(() => {
  const button = document.getElementById("n2k-aero-mobile-menu");
  const shell = document.getElementById("app-shell");
  if (!button || !shell) return;
  const close = () => {
    shell.classList.remove("n2k-mobile-menu-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Navigationsmenü öffnen");
  };
  button.addEventListener("click", () => {
    const open = shell.classList.toggle("n2k-mobile-menu-open");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Navigationsmenü schließen" : "Navigationsmenü öffnen");
  });
  shell.querySelector(".side-nav")?.addEventListener("click", event => {
    if (event.target.closest("[data-target]")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });
  window.matchMedia("(min-width: 751px)").addEventListener("change", event => {
    if (event.matches) close();
  });
})();

/* Secondary overview cards are accessible on demand; core services always visible. */
(() => {
 const grid = document.querySelector("#dashboard-top .n2k-aero-applications .widget-grid");
 const button = document.querySelector("#dashboard-top .n2k-aero-more");
 if(!grid || !button) return;
 grid.id = "n2k-aero-extra-widgets";
 grid.classList.add("n2k-aero-compact");
 button.addEventListener("click", () => {
   const expanded = grid.classList.toggle("n2k-aero-expanded");
   button.setAttribute("aria-expanded", String(expanded));
   button.textContent = expanded ? "Weniger anzeigen" : "Weitere Widgets";
 });
})();

let csrfToken = "";
let workspaceArea = "documents";
let workspacePath = "";
let calendarCursor = new Date();
let calendarEvents = [];
const networkHistoryDown = [];
const networkHistoryUp = [];
let activeView = "dashboard-top";

function show(element, visible = true) {
  element.classList.toggle("hidden", !visible);
}

function authError(message = "") {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  show(el, Boolean(message));
}

function apiErrorMessage(code) {
  const messages = {
    invalid_username: "Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.",
    password_too_short: "Das Passwort muss mindestens 10 Zeichen lang sein.",
    invalid_credentials: "Benutzername oder Passwort ist falsch.",
    already_configured: "Der Server wurde bereits eingerichtet.",
    setup_required: "Der Server muss zuerst eingerichtet werden."
  };
  return messages[code] || "Die Anfrage konnte nicht verarbeitet werden.";
}

async function request(path, options = {}) {
  const headers = {"Content-Type": "application/json", ...(options.headers || {})};
  const response = await fetch(path, {...options, headers, cache: "no-store"});
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function bootstrapAuth() {
  const authShell = document.getElementById("auth-shell");
  const appShell = document.getElementById("app-shell");
  show(authShell, true);
  show(appShell, false);
  authError();

  const session = await request("/api/session");
  if (session.authenticated) {
    csrfToken = session.csrf || "";
    enterApp(session.username);
    return;
  }

  const setup = await request("/api/setup");
  const setupForm = document.getElementById("setup-form");
  const loginForm = document.getElementById("login-form");

  if (!setup.configured) {
    document.getElementById("auth-title").textContent = "Erste Einrichtung";
    document.getElementById("auth-copy").textContent =
      "Lege den ersten lokalen Administrator für diesen Netfreak2k-Server an.";
    show(setupForm, true);
    show(loginForm, false);
    document.getElementById("setup-username").focus();
  } else {
    document.getElementById("auth-title").textContent = "Anmelden";
    document.getElementById("auth-copy").textContent =
      "Melde dich an, um die Netfreak2k-Weboberfläche zu öffnen.";
    show(setupForm, false);
    show(loginForm, true);
    document.getElementById("login-username").focus();
  }
}

function enterApp(username) {
  show(document.getElementById("auth-shell"), false);
  show(document.getElementById("app-shell"), true);
  document.getElementById("session-user").textContent = username ? `@ ${username}` : "";
  loadStatus();
  loadApps();
  loadHomeAssistant();
  loadUpdates();
  loadCatalog();
  loadStorage();
  loadVms();
  loadBackups();
  loadWorkspace();
  loadFavorites();
  loadShares();
  loadCalendar();
  updateDesktopClock();
  loadOverview();
  switchView("dashboard-top");
}

document.getElementById("setup-form").addEventListener("submit", async event => {
  event.preventDefault();
  authError();
  const username = document.getElementById("setup-username").value.trim();
  const password = document.getElementById("setup-password").value;
  const repeat = document.getElementById("setup-password-repeat").value;
  if (password !== repeat) {
    authError("Die beiden Passwörter stimmen nicht überein.");
    return;
  }
  try {
    const data = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({username, password})
    });
    csrfToken = data.csrf || "";
    enterApp(data.username);
  } catch (error) {
    authError(apiErrorMessage(error.code));
  }
});

document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  authError();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    const data = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({username, password})
    });
    csrfToken = data.csrf || "";
    enterApp(data.username);
  } catch (error) {
    authError(apiErrorMessage(error.code));
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  try {
    await request("/api/logout", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
  } finally {
    csrfToken = "";
    await bootstrapAuth();
  }
});

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "–";
  const units = ["B","KB","MB","GB","TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`;
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "–";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} T ${hours} Std`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  return `${minutes} Min`;
}

function formatDateTime(epochSeconds) {
  if (!Number.isFinite(epochSeconds)) return "unbekannt";
  return new Date(epochSeconds * 1000).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function setConnection(ok, text) {
  const dot = document.getElementById("server-dot");
  document.getElementById("server-state").textContent = text;
  dot.classList.toggle("ok", ok);
  dot.classList.toggle("error", !ok);
}

async function loadStatus() {
  if (document.getElementById("app-shell").classList.contains("hidden")) return;
  setConnection(false, "Verbinde …");
  try {
    await request("/api/status", {headers: {}});
    setConnection(true, "Server online");
  } catch (error) {
    if (error.status === 401) {
      csrfToken = "";
      await bootstrapAuth();
      return;
    }
    console.error(error);
    setConnection(false, "Serverstatus nicht erreichbar");
  }
}

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return "0 B/s";
  const units = ["B/s","KB/s","MB/s","GB/s"];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${units[unit]}`;
}

function setRing(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  element.style.setProperty("--ring-value", `${percent * 3.6}deg`);
}

function updateDesktopClock() {
  const now = new Date();
  const clock = document.getElementById("desktop-clock");
  const date = document.getElementById("desktop-date");
  if (clock) {
    clock.textContent = now.toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"});
  }
  if (date) {
    date.textContent = now.toLocaleDateString("de-DE", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });
  }
}

function drawNetworkChart() {
  const canvas = document.getElementById("network-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const values = [...networkHistoryDown, ...networkHistoryUp];
  const max = Math.max(1, ...values);
  const draw = (history, alpha) => {
    if (history.length < 2) return;
    ctx.beginPath();
    history.forEach((value, index) => {
      const x = (index / Math.max(history.length - 1, 1)) * width;
      const y = height - 6 - ((value / max) * (height - 16));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(231,196,106,${alpha})`;
    ctx.stroke();
  };
  draw(networkHistoryDown, 0.95);
  draw(networkHistoryUp, 0.45);
}

function pushNetworkHistory(down, up) {
  networkHistoryDown.push(Number(down) || 0);
  networkHistoryUp.push(Number(up) || 0);
  while (networkHistoryDown.length > 36) networkHistoryDown.shift();
  while (networkHistoryUp.length > 36) networkHistoryUp.shift();
  drawNetworkChart();
}

function renderOverviewList(containerId, items, renderer, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<div class="widget-empty">${emptyText}</div>`;
    return;
  }
  items.forEach(item => container.appendChild(renderer(item)));
}

function recentItemNode(item) {
  const row = document.createElement("div");
  row.className = "widget-list-row";
  const ext = (item.name.split(".").pop() || "").toLowerCase();
  const icon = /^(png|jpg|jpeg|gif|webp|avif)$/.test(ext) ? "▧" :
    /^(mp3|wav|flac|m4a|ogg)$/.test(ext) ? "♪" :
    /^(mp4|mkv|webm|mov)$/.test(ext) ? "▶" : "▤";
  row.innerHTML = '<span class="widget-file-icon"></span><div><strong></strong><small></small></div>';
  row.querySelector(".widget-file-icon").textContent = icon;
  row.querySelector("strong").textContent = item.name;
  row.querySelector("small").textContent =
    `${workspaceAreaNames[item.area] || item.area} · ${formatDateTime(item.modified_at)}`;
  return row;
}

function eventItemNode(item) {
  const row = document.createElement("div");
  row.className = "widget-list-row calendar-row";
  row.innerHTML = '<span class="calendar-date-badge"><strong></strong><small></small></span><div><strong></strong><small></small></div>';
  const date = new Date(item.start_at * 1000);
  row.querySelector(".calendar-date-badge strong").textContent = String(date.getDate()).padStart(2, "0");
  row.querySelector(".calendar-date-badge small").textContent =
    date.toLocaleDateString("de-DE", {month: "short"}).replace(".", "");
  row.querySelector("div>strong").textContent = item.title;
  row.querySelector("div>small").textContent =
    date.toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"});
  return row;
}

function renderActivity(data) {
  const activity = [];
  for (const file of (data.recent || []).slice(0, 3)) {
    activity.push({time: file.modified_at, title: file.name, detail: "Zu N2K Drive hinzugefügt"});
  }
  if (data.backup?.created_at) {
    activity.push({time: data.backup.created_at, title: "Backup abgeschlossen", detail: data.backup.id || "Netfreak2k Backup"});
  }
  if (data.update?.update_available) {
    activity.push({time: Math.floor(Date.now() / 1000), title: "Update verfügbar", detail: "Neuer Netfreak2k-Stand"});
  }
  activity.sort((a,b) => b.time - a.time);
  renderOverviewList("overview-activity", activity.slice(0, 5), item => {
    const row = document.createElement("div");
    row.className = "widget-list-row";
    row.innerHTML = '<span class="activity-dot"></span><div><strong></strong><small></small></div>';
    row.querySelector("strong").textContent = item.title;
    row.querySelector("small").textContent = `${item.detail} · ${formatDateTime(item.time)}`;
    return row;
  }, "Noch keine Aktivität.");
}

async function loadOverview() {
  if (document.getElementById("app-shell").classList.contains("hidden")) return;
  try {
    const data = await request("/api/overview", {headers: {}});
    const memory = data.memory || {};
    const storage = data.storage || {};
    const network = data.network || {};
    const cpu = data.cpu_percent;

    document.getElementById("overview-cpu").textContent =
      Number.isFinite(cpu) ? `${Math.round(cpu)}%` : "…";
    document.getElementById("overview-cpu-label").textContent =
      Number.isFinite(cpu) ? "Auslastung" : "wird gemessen";
    setRing("cpu-ring", cpu);

    document.getElementById("overview-ram").textContent =
      Number.isFinite(memory.used_percent) ? `${Math.round(memory.used_percent)}%` : "–";
    document.getElementById("overview-ram-label").textContent =
      memory.total_bytes ? `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}` : "–";
    setRing("ram-ring", memory.used_percent);

    document.getElementById("overview-storage").textContent =
      Number.isFinite(storage.used_percent) ? `${Math.round(storage.used_percent)}%` : "–";
    document.getElementById("overview-storage-label").textContent =
      storage.total_bytes ? `${formatBytes(storage.free_bytes)} frei` : "–";
    setRing("storage-ring", storage.used_percent);
    setRing("drive-storage-ring", storage.used_percent);
    document.getElementById("drive-storage-percent").textContent =
      Number.isFinite(storage.used_percent) ? `${Math.round(storage.used_percent)}%` : "–";
    document.getElementById("drive-storage-copy").textContent =
      storage.total_bytes ? `${formatBytes(storage.used_bytes)} von ${formatBytes(storage.total_bytes)}` : "Speicherstatus nicht verfügbar";
    document.getElementById("drive-meta").textContent =
      `${data.favorites_count || 0} Favoriten · ${data.shares_count || 0} Freigaben`;

    document.getElementById("overview-uptime").textContent = formatUptime(data.uptime_seconds);

    document.getElementById("network-down").textContent = formatRate(network.down_bps);
    document.getElementById("network-up").textContent = formatRate(network.up_bps);
    document.getElementById("network-interface").textContent =
      Array.isArray(network.interfaces) && network.interfaces.length
        ? network.interfaces.join(" · ")
        : "Netzwerk";
    pushNetworkHistory(network.down_bps, network.up_bps);

    renderOverviewList("overview-calendar", data.upcoming || [], eventItemNode, "Keine kommenden Termine.");
    renderOverviewList("overview-recent", data.recent || [], recentItemNode, "Noch keine Dateien.");

    const haOk = data.homeassistant?.available &&
      data.homeassistant?.state === "running" &&
      data.homeassistant?.reachable;
    document.getElementById("overview-ha").textContent = haOk ? "Home Assistant online" : "Home Assistant prüfen";
    document.getElementById("overview-ha-detail").textContent =
      haOk ? "VM läuft · Oberfläche erreichbar" : (data.homeassistant?.state || "nicht erreichbar");
    document.getElementById("overview-ha-dot").classList.toggle("ok", haOk);
    document.getElementById("overview-ha-dot").classList.toggle("warn", !haOk);

    const apps = data.apps || {};
    document.getElementById("overview-apps").textContent =
      `${apps.running || 0} Apps aktiv${apps.stopped ? ` · ${apps.stopped} gestoppt` : ""}`;
    document.getElementById("overview-apps-dot").classList.toggle("ok", !apps.stopped);
    document.getElementById("overview-apps-dot").classList.toggle("warn", Boolean(apps.stopped));

    const backup = data.backup;
    document.getElementById("overview-backup").textContent =
      backup?.created_at ? `Backup ${formatDateTime(backup.created_at)}` : "Noch kein Backup";
    document.getElementById("overview-backup-dot").classList.toggle("ok", Boolean(backup));
    document.getElementById("overview-backup-dot").classList.toggle("warn", !backup);

    const updateAvailable = Boolean(data.update?.update_available);
    document.getElementById("overview-update").textContent =
      updateAvailable ? "Update verfügbar" : "System aktuell";
    document.getElementById("overview-update-dot").classList.toggle("ok", !updateAvailable);
    document.getElementById("overview-update-dot").classList.toggle("info", updateAvailable);

    const healthOk = Boolean(data.health?.ok);
    document.getElementById("overview-system").textContent = healthOk ? "System gesund" : "Hinweis vorhanden";
    document.getElementById("overview-system-dot").classList.toggle("ok", healthOk);
    document.getElementById("overview-system-dot").classList.toggle("warn", !healthOk);
    document.getElementById("overview-health-copy").textContent =
      healthOk ? "Alle wichtigen Dienste sehen gut aus." : "Ein Bereich benötigt deine Aufmerksamkeit.";

    const warningBox = document.getElementById("overview-warning");
    const warnings = data.health?.warnings || [];
    if (warnings.length) {
      const warning = warnings[0];
      warningBox.innerHTML = '<div><strong></strong><span></span></div><button>Öffnen</button>';
      warningBox.querySelector("strong").textContent = warning.title;
      warningBox.querySelector("span").textContent = warning.detail;
      warningBox.className = `overview-warning ${warning.level || "warning"}`;
      warningBox.querySelector("button").addEventListener("click", () => switchView(warning.target));
    } else {
      warningBox.className = "overview-warning hidden";
      warningBox.innerHTML = "";
    }

    renderActivity(data);
  } catch (error) {
    if (error.status === 401) {
      csrfToken = "";
      await bootstrapAuth();
      return;
    }
    console.error(error);
  }
}


async function loadApps() {
  if (document.getElementById("app-shell").classList.contains("hidden")) return;
  const summary = document.getElementById("apps-summary");
  const list = document.getElementById("apps-list");
  try {
    const data = await request("/api/apps", {headers: {}});
    const containers = Array.isArray(data.containers) ? data.containers : [];
    if (!data.available) {
      summary.textContent = "Docker-Inventar momentan nicht verfügbar.";
      list.innerHTML = "";
      return;
    }
    const running = containers.filter(item => item.state === "running").length;
    summary.textContent = `${containers.length} Container · ${running} aktiv`;
    list.innerHTML = "";
    for (const item of containers) {
      const row = document.createElement("div");
      row.className = "app-row";
      const ports = (item.ports || []).map(port => `${port.public}→${port.private}/${port.protocol}`).join(", ");
      row.innerHTML = `
        <div>
          <strong></strong>
          <small></small>
        </div>
        <div class="app-meta">
          <div class="app-state-line">
            <span class="state-pill"></span>
            <span class="app-role"></span>
          </div>
          <small class="app-ports"></small>
          <div class="app-actions"></div>
        </div>`;
      row.querySelector("strong").textContent = item.name || item.id || "Container";
      row.querySelector("small").textContent = item.image || "unbekanntes Image";
      const pill = row.querySelector(".state-pill");
      pill.textContent = item.state || "unknown";
      pill.classList.toggle("running", item.state === "running");
      row.querySelector(".app-ports").textContent = ports || "keine veröffentlichten Ports";
      const role = row.querySelector(".app-role");
      role.textContent = item.core ? "System" : (item.managed ? "verwaltet" : "");
      const actions = row.querySelector(".app-actions");
      if (item.managed) {
        const makeButton = (label, action) => {
          const button = document.createElement("button");
          button.className = "mini-action";
          button.textContent = label;
          button.addEventListener("click", () => appAction(item.name, action));
          return button;
        };
        if (item.state === "running") {
          actions.appendChild(makeButton("Stop", "stop"));
          actions.appendChild(makeButton("↻", "restart"));
        } else {
          actions.appendChild(makeButton("Start", "start"));
        }
      }
      list.appendChild(row);
    }
    if (!containers.length) {
      list.innerHTML = '<div class="app-empty">Keine Docker-Container gefunden.</div>';
    }
  } catch (error) {
    if (error.status === 401) {
      csrfToken = "";
      await bootstrapAuth();
      return;
    }
    console.error(error);
    summary.textContent = "Containerliste konnte nicht geladen werden.";
    list.innerHTML = "";
  }
}

async function appAction(name, action) {
  if (!confirm(`${name}: ${action} wirklich ausführen?`)) return;
  try {
    await request("/api/apps/action", {
      method: "POST",
      body: JSON.stringify({name, action}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    setTimeout(loadApps, 800);
  } catch (error) {
    console.error(error);
    alert("App-Aktion konnte nicht ausgeführt werden.");
  }
}

async function loadCatalog() {
  const list = document.getElementById("catalog-list");
  if (!list) return;
  try {
    const data = await request("/api/catalog", {headers: {}});
    const apps = Array.isArray(data.apps) ? data.apps : [];
    list.innerHTML = "";
    for (const app of apps) {
      const card = document.createElement("div");
      card.className = "catalog-card";
      card.innerHTML = `
        <div class="catalog-icon"></div>
        <div class="catalog-copy">
          <strong></strong>
          <span class="catalog-desc"></span>
          <small class="catalog-port"></small>
        </div>
        <div class="catalog-action"></div>`;
      card.querySelector(".catalog-icon").textContent =
        (app.name || "A").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
      card.querySelector("strong").textContent = app.name || app.id;
      card.querySelector(".catalog-desc").textContent = app.description || "";
      card.querySelector(".catalog-port").textContent =
        app.host_port ? `Port ${app.host_port}` : "";
      const action = card.querySelector(".catalog-action");
      if (app.installed) {
        const badge = document.createElement("span");
        badge.className = "status-chip good";
        badge.textContent = app.state === "running" ? "● Installiert" : "Installiert";
        action.appendChild(badge);
        if (app.host_port) {
          const open = document.createElement("button");
          open.className = "mini-action";
          open.textContent = "Öffnen";
          open.addEventListener("click", () => {
            window.open(`${window.location.protocol}//${window.location.hostname}:${app.host_port}/`, "_blank", "noopener");
          });
          action.appendChild(open);
        }
      } else {
        const install = document.createElement("button");
        install.className = "primary compact";
        install.textContent = "Installieren";
        install.addEventListener("click", () => installCatalogApp(app.id, app.name));
        action.appendChild(install);
      }
      list.appendChild(card);
    }
    if (!apps.length) {
      list.innerHTML = '<div class="app-empty">Noch keine Katalog-Apps verfügbar.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">App-Katalog konnte nicht geladen werden.</div>';
  }
}

async function installCatalogApp(appId, name) {
  if (!confirm(`${name} jetzt als verwaltete Netfreak2k-App installieren?`)) return;
  try {
    await request("/api/catalog/install", {
      method: "POST",
      body: JSON.stringify({app_id: appId}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    setTimeout(() => {
      loadCatalog();
      loadApps();
    }, 1200);
  } catch (error) {
    console.error(error);
    if (error.code === "app_port_in_use") {
      alert("Installation nicht möglich: Der benötigte Port ist bereits belegt.");
    } else {
      alert("App konnte nicht installiert werden.");
    }
  }
}

async function loadStorage() {
  const main = document.getElementById("storage-host-main");
  const detail = document.getElementById("storage-host-detail");
  const meter = document.getElementById("storage-meter-fill");
  const haos = document.getElementById("storage-haos-main");
  if (!main || !detail || !meter || !haos) return;
  try {
    const data = await request("/api/storage", {headers: {}});
    const host = data.host || {};
    main.textContent = host.used_percent == null
      ? "Host-Speicher"
      : `${host.used_percent}% belegt`;
    detail.textContent = host.total_bytes
      ? `${formatBytes(host.used_bytes)} von ${formatBytes(host.total_bytes)} · ${formatBytes(host.free_bytes)} frei`
      : "Speicherdaten nicht verfügbar";
    meter.style.width = host.used_percent == null ? "0%" : `${Math.min(100, host.used_percent)}%`;
    haos.textContent = data.haos_disk_bytes
      ? `${formatBytes(data.haos_disk_bytes)} HAOS-Disk`
      : "HAOS-Disk nicht gefunden";
  } catch (error) {
    console.error(error);
    main.textContent = "Speicherstatus nicht erreichbar";
    detail.textContent = "–";
    meter.style.width = "0%";
    haos.textContent = "–";
  }
}

async function loadVms() {
  const list = document.getElementById("vm-list");
  if (!list) return;
  try {
    const data = await request("/api/vms", {headers: {}});
    const vms = Array.isArray(data.vms) ? data.vms : [];
    list.innerHTML = "";
    for (const vm of vms) {
      const row = document.createElement("div");
      row.className = "vm-row";
      row.innerHTML = `
        <div class="app-icon small"></div>
        <div class="vm-copy"><strong></strong><span></span></div>
        <div class="vm-badge"></div>`;
      row.querySelector(".app-icon").textContent = vm.managed ? "HA" : "VM";
      row.querySelector("strong").textContent = vm.managed ? "Home Assistant OS" : vm.name;
      row.querySelector(".vm-copy span").textContent = vm.name;
      const badge = row.querySelector(".vm-badge");
      badge.className = "state-pill" + (vm.state === "running" ? " running" : "");
      badge.textContent = vm.state || "unknown";
      list.appendChild(row);
    }
    if (!vms.length) {
      list.innerHTML = '<div class="app-empty">Keine KVM-VMs gefunden.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">VM-Liste konnte nicht geladen werden.</div>';
  }
}

async function loadBackups() {
  const list = document.getElementById("backup-list");
  if (!list) return;
  try {
    const data = await request("/api/backups", {headers: {}});
    const backups = Array.isArray(data.backups) ? data.backups : [];
    list.innerHTML = "";
    for (const backup of backups) {
      const row = document.createElement("div");
      row.className = "backup-row";
      row.innerHTML = `
        <div>
          <strong></strong>
          <small class="backup-meta"></small>
        </div>
        <button class="secondary compact">Wiederherstellen</button>`;
      row.querySelector("strong").textContent = backup.id;
      const appText = Array.isArray(backup.apps) && backup.apps.length
        ? ` · Apps: ${backup.apps.join(", ")}`
        : "";
      row.querySelector(".backup-meta").textContent =
        `${formatDateTime(backup.created_at)} · ${formatBytes(backup.size_bytes)}${appText}`;
      row.querySelector("button").addEventListener("click", () => restoreBackup(backup.id));
      list.appendChild(row);
    }
    if (!backups.length) {
      list.innerHTML = '<div class="app-empty">Noch kein Netfreak2k-Backup vorhanden.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Backup-Liste konnte nicht geladen werden.</div>';
  }
}

async function createBackup() {
  const button = document.getElementById("create-backup");
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Sichere …";
  try {
    await request("/api/backups/create", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadBackups();
  } catch (error) {
    console.error(error);
    alert("Backup konnte nicht erstellt werden.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function restoreBackup(backupId) {
  const first = confirm(
    `Backup ${backupId} wiederherstellen? Netfreak2k und betroffene Apps werden dabei neu gestartet.`
  );
  if (!first) return;
  const second = confirm(
    "Vorhandene Netfreak2k-Admin- und App-Daten werden durch den Backup-Stand ersetzt. Wirklich fortfahren?"
  );
  if (!second) return;
  try {
    await request("/api/backups/restore", {
      method: "POST",
      body: JSON.stringify({backup_id: backupId}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    alert("Wiederherstellung wurde gestartet. Die Oberfläche lädt gleich neu.");
    setTimeout(() => window.location.reload(), 12000);
  } catch (error) {
    console.error(error);
    alert("Wiederherstellung konnte nicht gestartet werden.");
  }
}

const workspaceAreaNames = {
  documents: "Dokumente",
  media: "Bilder & Videos",
  audio: "Audio",
  downloads: "Downloads",
  personal: "Persönlich",
  shared: "Shared",
  trash: "Papierkorb"
};

function workspaceQuery(extra = {}) {
  const params = new URLSearchParams({
    area: workspaceArea,
    path: workspacePath,
    ...extra
  });
  return params.toString();
}

async function loadWorkspace() {
  const list = document.getElementById("workspace-list");
  const crumbs = document.getElementById("workspace-breadcrumbs");
  const summary = document.getElementById("workspace-summary");
  if (!list || !crumbs || !summary) return;

  try {
    const data = await request(`/api/workspace?${workspaceQuery()}`, {headers: {}});
    const items = Array.isArray(data.items) ? data.items : [];
    crumbs.textContent = workspacePath
      ? `${workspaceAreaNames[workspaceArea]} / ${workspacePath}`
      : workspaceAreaNames[workspaceArea];
    summary.textContent = `${items.length} Elemente`;
    list.classList.toggle("gallery-mode", workspaceArea === "media");
    list.innerHTML = "";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "workspace-row";
      row.innerHTML = `
        <div class="file-icon"></div>
        <div class="file-copy"><strong></strong><small></small></div>
        <div class="file-actions"></div>`;
      const icon = row.querySelector(".file-icon");
      const isImage = item.type === "file" && /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(item.name);
      if (workspaceArea === "media" && isImage) {
        const image = document.createElement("img");
        image.className = "file-thumb";
        image.loading = "lazy";
        image.alt = "";
        image.src = `/api/workspace/file?${workspaceQuery({name: item.name})}`;
        icon.appendChild(image);
        row.classList.add("media-row");
      } else {
        icon.textContent = item.type === "folder" ? "▤" : "·";
      }
      row.querySelector("strong").textContent = item.name;
      row.querySelector("small").textContent = item.type === "folder"
        ? "Ordner"
        : `${formatBytes(item.size_bytes)} · ${formatDateTime(item.modified_at)}`;

      if (item.type === "folder") {
        row.classList.add("is-folder");
        row.addEventListener("dblclick", () => {
          workspacePath = workspacePath ? `${workspacePath}/${item.name}` : item.name;
          loadWorkspace();
        });
        const open = document.createElement("button");
        open.className = "mini-action";
        open.textContent = "Öffnen";
        open.addEventListener("click", () => {
          workspacePath = workspacePath ? `${workspacePath}/${item.name}` : item.name;
          loadWorkspace();
        });
        row.querySelector(".file-actions").appendChild(open);
      } else {
        const open = document.createElement("button");
        open.className = "mini-action";
        open.textContent = "Öffnen";
        open.addEventListener("click", () => {
          window.open(`/api/workspace/file?${workspaceQuery({name: item.name})}`, "_blank", "noopener");
        });
        const download = document.createElement("button");
        download.className = "mini-action";
        download.textContent = "↓";
        download.title = "Herunterladen";
        download.addEventListener("click", () => {
          window.location.href = `/api/workspace/file?${workspaceQuery({name: item.name, download: "1"})}`;
        });
        row.querySelector(".file-actions").append(open, download);

        if (workspaceArea !== "trash") {
          const share = document.createElement("button");
          share.className = "mini-action";
          share.textContent = "Teilen";
          share.addEventListener("click", () => shareWorkspaceItem(item.name));
          row.querySelector(".file-actions").appendChild(share);

          const versions = document.createElement("button");
          versions.className = "mini-action";
          versions.textContent = "Versionen";
          versions.addEventListener("click", () => showFileVersions(item.name));
          row.querySelector(".file-actions").appendChild(versions);
        }
      }

      if (workspaceArea !== "trash") {
        const favorite = document.createElement("button");
        favorite.className = "mini-action";
        favorite.textContent = "★";
        favorite.title = "Favorit umschalten";
        favorite.addEventListener("click", () => toggleFavorite(workspaceArea, workspacePath, item.name));
        row.querySelector(".file-actions").appendChild(favorite);

        const copy = document.createElement("button");
        copy.className = "mini-action";
        copy.textContent = "Kopieren";
        copy.addEventListener("click", () => transferWorkspaceItem("copy", item.name));
        row.querySelector(".file-actions").appendChild(copy);

        const move = document.createElement("button");
        move.className = "mini-action";
        move.textContent = "Verschieben";
        move.addEventListener("click", () => transferWorkspaceItem("move", item.name));
        row.querySelector(".file-actions").appendChild(move);
        const rename = document.createElement("button");
        rename.className = "mini-action";
        rename.textContent = "Umbenennen";
        rename.addEventListener("click", () => renameWorkspaceItem(item.name));
        row.querySelector(".file-actions").appendChild(rename);
      } else {
        const restore = document.createElement("button");
        restore.className = "mini-action";
        restore.textContent = "Wiederherstellen";
        restore.addEventListener("click", () => restoreWorkspaceItem(item.name));
        row.querySelector(".file-actions").appendChild(restore);
      }

      const remove = document.createElement("button");
      remove.className = workspaceArea === "trash" ? "mini-action danger-mini" : "mini-action";
      remove.textContent = workspaceArea === "trash" ? "Endgültig löschen" : "Papierkorb";
      remove.addEventListener("click", () => deleteWorkspaceItem(item.name));
      row.querySelector(".file-actions").appendChild(remove);
      list.appendChild(row);
    }

    if (!items.length) {
      list.innerHTML = '<div class="workspace-empty">Dieser Bereich ist leer. Dateien einfach hier hochladen.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="workspace-empty">Arbeitsplatz konnte nicht geladen werden.</div>';
  }
}

async function uploadWorkspaceFile(file, replace = false) {
  const response = await fetch(
    `/api/workspace/upload?${workspaceQuery({name: file.name, replace: replace ? "1" : "0"})}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-CSRF-Token": csrfToken
      },
      body: file
    }
  );
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.code = data.error;
    throw error;
  }
  return data;
}

async function uploadWorkspaceFiles(files) {
  for (const file of files) {
    try {
      await uploadWorkspaceFile(file, false);
    } catch (error) {
      if (error.code === "already_exists") {
        const replace = confirm(
          `${file.name} existiert bereits. Ersetzen und die bisherige Datei als Version sichern?`
        );
        if (!replace) continue;
        try {
          await uploadWorkspaceFile(file, true);
        } catch (replaceError) {
          console.error(replaceError);
          alert(`${file.name} konnte nicht ersetzt werden.`);
          break;
        }
      } else {
        console.error(error);
        alert(`${file.name} konnte nicht hochgeladen werden.`);
        break;
      }
    }
  }
  await loadWorkspace();
}

async function createWorkspaceFolder() {
  const name = prompt("Name des neuen Ordners:");
  if (!name) return;
  try {
    await request("/api/workspace/mkdir", {
      method: "POST",
      body: JSON.stringify({area: workspaceArea, path: workspacePath, name}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
  } catch (error) {
    console.error(error);
    alert("Ordner konnte nicht erstellt werden.");
  }
}

async function deleteWorkspaceItem(name) {
  const permanent = workspaceArea === "trash";
  const text = permanent
    ? `${name} endgültig löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`
    : `${name} in den Papierkorb verschieben?`;
  if (!confirm(text)) return;
  try {
    await request("/api/workspace/delete", {
      method: "POST",
      body: JSON.stringify({area: workspaceArea, path: workspacePath, name}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
  } catch (error) {
    console.error(error);
    alert("Aktion konnte nicht ausgeführt werden.");
  }
}

async function renameWorkspaceItem(oldName) {
  const newName = prompt("Neuer Name:", oldName);
  if (!newName || newName === oldName) return;
  try {
    await request("/api/workspace/rename", {
      method: "POST",
      body: JSON.stringify({
        area: workspaceArea,
        path: workspacePath,
        old_name: oldName,
        new_name: newName
      }),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
  } catch (error) {
    console.error(error);
    alert("Umbenennen nicht möglich.");
  }
}

async function restoreWorkspaceItem(name) {
  if (!confirm(`${name} nach Dokumente wiederherstellen?`)) return;
  try {
    await request("/api/workspace/restore", {
      method: "POST",
      body: JSON.stringify({name}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
  } catch (error) {
    console.error(error);
    alert("Wiederherstellung nicht möglich.");
  }
}

async function shareWorkspaceItem(name) {
  const raw = prompt("Freigabe gültig für wie viele Stunden?", "24");
  if (!raw) return;
  const hours = Number.parseInt(raw, 10);
  if (!Number.isFinite(hours) || hours < 1) {
    alert("Bitte eine gültige Stundenanzahl eingeben.");
    return;
  }
  try {
    const data = await request("/api/workspace/share", {
      method: "POST",
      body: JSON.stringify({
        area: workspaceArea,
        path: workspacePath,
        name,
        hours
      }),
      headers: {"X-CSRF-Token": csrfToken}
    });
    const url = `${window.location.origin}/api/share?token=${encodeURIComponent(data.token)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Freigabelink wurde kopiert.");
    } catch (_) {
      prompt("Freigabelink:", url);
    }
    await loadShares();
  } catch (error) {
    console.error(error);
    alert("Freigabelink konnte nicht erstellt werden.");
  }
}

function openSearchResult(result) {
  if (result.kind === "calendar") {
    document.getElementById("calendar-panel")?.scrollIntoView({behavior: "smooth", block: "start"});
    return;
  }
  workspaceArea = result.area;
  workspacePath = result.path || "";
  document.querySelectorAll(".drive-area").forEach(item => {
    item.classList.toggle("active", item.dataset.area === workspaceArea);
  });
  document.getElementById("workspace-panel")?.scrollIntoView({behavior: "smooth", block: "start"});
  loadWorkspace().then(() => {
    const rows = Array.from(document.querySelectorAll(".workspace-row"));
    const row = rows.find(item => item.querySelector("strong")?.textContent === result.name);
    row?.classList.add("search-hit");
    setTimeout(() => row?.classList.remove("search-hit"), 2500);
  });
}

let searchTimer = null;
async function performGlobalSearch() {
  const input = document.getElementById("global-search");
  const box = document.getElementById("global-search-results");
  if (!input || !box) return;
  const q = input.value.trim();
  if (q.length < 2) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }
  try {
    const data = await request(`/api/search?q=${encodeURIComponent(q)}`, {headers: {}});
    const results = Array.isArray(data.results) ? data.results : [];
    box.innerHTML = "";
    for (const result of results.slice(0, 12)) {
      const button = document.createElement("button");
      button.className = "search-result";
      if (result.kind === "calendar") {
        button.innerHTML = "<strong></strong><small>Kalender</small>";
        button.querySelector("strong").textContent = result.title;
      } else {
        button.innerHTML = "<strong></strong><small></small>";
        button.querySelector("strong").textContent = result.name;
        button.querySelector("small").textContent =
          `${workspaceAreaNames[result.area] || result.area}${result.path ? " / " + result.path : ""}`;
      }
      button.addEventListener("click", () => {
        box.classList.add("hidden");
        openSearchResult(result);
      });
      box.appendChild(button);
    }
    if (!results.length) {
      box.innerHTML = '<div class="search-empty">Keine Treffer.</div>';
    }
    box.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    box.classList.add("hidden");
  }
}

async function toggleFavorite(area, path, name) {
  try {
    await request("/api/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({area, path, name}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadFavorites();
  } catch (error) {
    console.error(error);
    alert("Favorit konnte nicht geändert werden.");
  }
}

async function loadFavorites() {
  const list = document.getElementById("favorites-list");
  if (!list) return;
  try {
    const data = await request("/api/favorites", {headers: {}});
    const items = Array.isArray(data.favorites) ? data.favorites : [];
    list.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "cloud-row";
      row.innerHTML = '<div><strong></strong><small></small></div><div class="cloud-actions"></div>';
      row.querySelector("strong").textContent = item.name;
      row.querySelector("small").textContent =
        `${workspaceAreaNames[item.area] || item.area}${item.path ? " / " + item.path : ""}`;
      const open = document.createElement("button");
      open.className = "mini-action";
      open.textContent = "Öffnen";
      open.addEventListener("click", () => {
        workspaceArea = item.area;
        workspacePath = item.path || "";
        document.querySelectorAll(".drive-area").forEach(button => {
          button.classList.toggle("active", button.dataset.area === workspaceArea);
        });
        document.getElementById("workspace-panel")?.scrollIntoView({behavior: "smooth", block: "start"});
        loadWorkspace();
      });
      const remove = document.createElement("button");
      remove.className = "mini-action";
      remove.textContent = "★ Entfernen";
      remove.addEventListener("click", () => toggleFavorite(item.area, item.path || "", item.name));
      row.querySelector(".cloud-actions").append(open, remove);
      list.appendChild(row);
    }
    if (!items.length) list.innerHTML = '<div class="app-empty">Noch keine Favoriten.</div>';
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Favoriten konnten nicht geladen werden.</div>';
  }
}

async function loadShares() {
  const list = document.getElementById("shares-list");
  if (!list) return;
  try {
    const data = await request("/api/shares", {headers: {}});
    const shares = Array.isArray(data.shares) ? data.shares : [];
    list.innerHTML = "";
    for (const share of shares) {
      const row = document.createElement("div");
      row.className = "cloud-row";
      row.innerHTML = '<div><strong></strong><small></small></div><div class="cloud-actions"></div>';
      row.querySelector("strong").textContent = share.name;
      row.querySelector("small").textContent =
        `bis ${formatDateTime(share.expires_at)} · ${workspaceAreaNames[share.area] || share.area}`;
      const copy = document.createElement("button");
      copy.className = "mini-action";
      copy.textContent = "Link kopieren";
      copy.addEventListener("click", async () => {
        const url = `${window.location.origin}/api/share?token=${encodeURIComponent(share.token)}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch (_) {
          prompt("Freigabelink:", url);
        }
      });
      const revoke = document.createElement("button");
      revoke.className = "mini-action danger-mini";
      revoke.textContent = "Widerrufen";
      revoke.addEventListener("click", () => revokeShare(share.token));
      row.querySelector(".cloud-actions").append(copy, revoke);
      list.appendChild(row);
    }
    if (!shares.length) list.innerHTML = '<div class="app-empty">Keine aktiven Freigaben.</div>';
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Freigaben konnten nicht geladen werden.</div>';
  }
}

async function revokeShare(token) {
  if (!confirm("Diesen Freigabelink sofort ungültig machen?")) return;
  try {
    await request("/api/shares/revoke", {
      method: "POST",
      body: JSON.stringify({token}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadShares();
  } catch (error) {
    console.error(error);
    alert("Freigabe konnte nicht widerrufen werden.");
  }
}

async function transferWorkspaceItem(mode, name) {
  const area = prompt(
    "Zielbereich: documents, media, audio, downloads, personal oder shared",
    workspaceArea === "trash" ? "documents" : workspaceArea
  );
  if (!area) return;
  const allowed = ["documents","media","audio","downloads","personal","shared"];
  if (!allowed.includes(area)) {
    alert("Ungültiger Zielbereich.");
    return;
  }
  const path = prompt("Zielordner innerhalb des Bereichs (leer = Hauptordner):", "");
  if (path === null) return;
  try {
    await request("/api/workspace/transfer", {
      method: "POST",
      body: JSON.stringify({
        mode,
        source_area: workspaceArea,
        source_path: workspacePath,
        name,
        target_area: area,
        target_path: path
      }),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
    await loadFavorites();
  } catch (error) {
    console.error(error);
    alert(`${mode === "copy" ? "Kopieren" : "Verschieben"} nicht möglich.`);
  }
}

async function showFileVersions(name) {
  const list = document.getElementById("versions-list");
  const title = document.getElementById("versions-title");
  if (!list || !title) return;
  title.textContent = `Versionen · ${name}`;
  document.getElementById("drive-management-panel")?.scrollIntoView({behavior: "smooth", block: "start"});
  try {
    const params = new URLSearchParams({area: workspaceArea, path: workspacePath, name});
    const data = await request(`/api/workspace/versions?${params.toString()}`, {headers: {}});
    const versions = Array.isArray(data.versions) ? data.versions : [];
    list.innerHTML = "";
    for (const version of versions) {
      const row = document.createElement("div");
      row.className = "cloud-row";
      row.innerHTML = '<div><strong></strong><small></small></div><button class="mini-action">Wiederherstellen</button>';
      row.querySelector("strong").textContent = formatDateTime(version.created_at);
      row.querySelector("small").textContent = formatBytes(version.size_bytes);
      row.querySelector("button").addEventListener("click", () => restoreFileVersion(version.id, name));
      list.appendChild(row);
    }
    if (!versions.length) list.innerHTML = '<div class="app-empty">Noch keine ältere Version vorhanden.</div>';
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Versionen konnten nicht geladen werden.</div>';
  }
}

async function restoreFileVersion(id, name) {
  if (!confirm(`Eine ältere Version von ${name} wiederherstellen? Die aktuelle Datei wird vorher ebenfalls versioniert.`)) return;
  try {
    await request("/api/workspace/version/restore", {
      method: "POST",
      body: JSON.stringify({id}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadWorkspace();
    await showFileVersions(name);
  } catch (error) {
    console.error(error);
    alert("Version konnte nicht wiederhergestellt werden.");
  }
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("calendar-month");
  if (!grid || !label) return;

  const first = monthStart(calendarCursor);
  label.textContent = first.toLocaleDateString("de-DE", {month: "long", year: "numeric"});
  grid.innerHTML = "";

  const startOffset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day empty";
    grid.appendChild(blank);
  }

  const now = new Date();
  for (let day = 1; day <= days; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      day === now.getDate()
    ) cell.classList.add("today");

    const number = document.createElement("strong");
    number.textContent = day;
    cell.appendChild(number);

    const dayStart = Math.floor(date.getTime() / 1000);
    const dayEnd = dayStart + 86400;
    const events = calendarEvents.filter(event => event.start_at >= dayStart && event.start_at < dayEnd);
    for (const event of events.slice(0, 3)) {
      const badge = document.createElement("button");
      badge.className = "calendar-event";
      badge.textContent = event.title;
      badge.title = "Termin löschen";
      badge.addEventListener("click", () => deleteCalendarEvent(event.id, event.title));
      cell.appendChild(badge);
    }
    grid.appendChild(cell);
  }

  renderUpcomingEvents();
}

function renderUpcomingEvents() {
  const wrap = document.getElementById("upcoming-events");
  if (!wrap) return;
  const now = Math.floor(Date.now() / 1000);
  const upcoming = calendarEvents.filter(e => e.start_at >= now).slice(0, 5);
  wrap.innerHTML = '<h3>Nächste Termine</h3>';
  if (!upcoming.length) {
    wrap.innerHTML += '<div class="app-empty">Keine kommenden Termine.</div>';
    return;
  }
  for (const event of upcoming) {
    const row = document.createElement("div");
    row.className = "upcoming-row";
    row.innerHTML = "<strong></strong><small></small>";
    row.querySelector("strong").textContent = event.title;
    row.querySelector("small").textContent = formatDateTime(event.start_at);
    wrap.appendChild(row);
  }
}

async function loadCalendar() {
  try {
    const data = await request("/api/calendar", {headers: {}});
    calendarEvents = Array.isArray(data.events) ? data.events : [];
    renderCalendar();
  } catch (error) {
    console.error(error);
  }
}

async function createCalendarEvent() {
  const title = document.getElementById("event-title").value.trim();
  const startValue = document.getElementById("event-start").value;
  const endValue = document.getElementById("event-end").value;
  const notes = document.getElementById("event-notes").value;
  if (!title || !startValue) {
    alert("Titel und Beginn sind erforderlich.");
    return;
  }
  try {
    await request("/api/calendar/create", {
      method: "POST",
      body: JSON.stringify({
        title,
        start_at: Math.floor(new Date(startValue).getTime() / 1000),
        end_at: endValue ? Math.floor(new Date(endValue).getTime() / 1000) : null,
        notes
      }),
      headers: {"X-CSRF-Token": csrfToken}
    });
    document.getElementById("event-title").value = "";
    document.getElementById("event-notes").value = "";
    await loadCalendar();
  } catch (error) {
    console.error(error);
    alert("Termin konnte nicht gespeichert werden.");
  }
}

async function deleteCalendarEvent(id, title) {
  if (!confirm(`Termin „${title}“ löschen?`)) return;
  try {
    await request("/api/calendar/delete", {
      method: "POST",
      body: JSON.stringify({id}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadCalendar();
  } catch (error) {
    console.error(error);
    alert("Termin konnte nicht gelöscht werden.");
  }
}

async function loadHomeAssistant() {
  const state = document.getElementById("ha-state");
  const detail = document.getElementById("ha-detail");
  try {
    const data = await request("/api/homeassistant", {headers: {}});
    state.textContent = data.state || "unbekannt";
    state.classList.toggle("running", data.state === "running");
    const vmState = document.getElementById("vm-ha-state");
    if (vmState) vmState.textContent = data.state || "unbekannt";
    if (!data.available) {
      detail.textContent = "VM-Agent nicht erreichbar.";
    } else if (!data.installed) {
      detail.textContent = "Home Assistant OS ist noch nicht installiert.";
    } else if (data.reachable) {
      detail.textContent = "Supervisor / Apps bereit · Home Assistant erreichbar.";
    } else if (data.state === "running") {
      detail.textContent = "VM läuft · Home Assistant startet noch.";
    } else {
      detail.textContent = "VM ist gestoppt.";
    }
  } catch (error) {
    console.error(error);
    detail.textContent = "Home-Assistant-Status konnte nicht geladen werden.";
  }
}

async function homeAssistantAction(action) {
  try {
    await request("/api/homeassistant/action", {
      method: "POST",
      body: JSON.stringify({action}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadHomeAssistant();
  } catch (error) {
    console.error(error);
    alert("Home Assistant Aktion konnte nicht ausgeführt werden.");
  }
}

document.getElementById("ha-open")?.addEventListener("click", () => {
  window.open(`${window.location.protocol}//${window.location.hostname}:8123/`, "_blank", "noopener");
});
document.getElementById("ha-start")?.addEventListener("click", () => homeAssistantAction("start"));
document.getElementById("ha-restart")?.addEventListener("click", () => homeAssistantAction("restart"));
document.getElementById("ha-shutdown")?.addEventListener("click", () => homeAssistantAction("shutdown"));

async function loadUpdates() {
  const title = document.getElementById("update-title");
  const detail = document.getElementById("update-detail");
  if (!title || !detail) return;
  try {
    const data = await request("/api/updates", {headers: {}});
    if (!data.available) {
      title.textContent = "Update-Status noch nicht verfügbar";
      detail.textContent = "Die nächste automatische GitHub-Prüfung aktualisiert diesen Bereich.";
      return;
    }
    if (data.update_available) {
      title.textContent = "Neue Version verfügbar";
      const fingerprint = data.remote_fingerprint ? data.remote_fingerprint.slice(0, 12) : "GitHub";
      detail.textContent = `Neuer Stand ${fingerprint} erkannt. Installation erfolgt erst nach deiner Bestätigung.`;
    } else if (data.note === "github_archive_unavailable") {
      title.textContent = "GitHub momentan nicht erreichbar";
      detail.textContent = "Netfreak2k läuft weiter; die nächste Prüfung erfolgt automatisch.";
    } else {
      title.textContent = "Netfreak2k ist aktuell";
      detail.textContent = "Kein neuer GitHub-Stand erkannt.";
    }
  } catch (error) {
    console.error(error);
    title.textContent = "Update-Status nicht erreichbar";
    detail.textContent = "Die Weboberfläche bleibt uneingeschränkt nutzbar.";
  }
}

document.getElementById("refresh-status")?.addEventListener("click", () => {
  loadStatus();
  loadOverview();
});

document.querySelectorAll(".drive-area").forEach(button => {
  button.addEventListener("click", () => {
    workspaceArea = button.dataset.area;
    workspacePath = "";
    document.querySelectorAll(".drive-area").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    loadWorkspace();
  });
});
document.getElementById("workspace-up")?.addEventListener("click", () => {
  const parts = workspacePath.split("/").filter(Boolean);
  parts.pop();
  workspacePath = parts.join("/");
  loadWorkspace();
});
document.getElementById("workspace-upload")?.addEventListener("click", () => {
  document.getElementById("workspace-upload-input")?.click();
});
document.getElementById("workspace-upload-input")?.addEventListener("change", event => {
  uploadWorkspaceFiles(Array.from(event.target.files || []));
  event.target.value = "";
});
document.getElementById("workspace-new-folder")?.addEventListener("click", createWorkspaceFolder);

document.getElementById("calendar-prev")?.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("calendar-next")?.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});
document.getElementById("event-create")?.addEventListener("click", createCalendarEvent);
document.getElementById("refresh-apps")?.addEventListener("click", loadApps);
document.getElementById("refresh-catalog")?.addEventListener("click", loadCatalog);
document.getElementById("create-backup")?.addEventListener("click", createBackup);
document.getElementById("refresh-favorites")?.addEventListener("click", loadFavorites);
document.getElementById("refresh-shares")?.addEventListener("click", loadShares);
document.getElementById("refresh-updates")?.addEventListener("click", async () => {
  const button = document.getElementById("refresh-updates");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Prüfe …";
  try {
    await request("/api/updates/check", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadUpdates();
  } catch (error) {
    console.error(error);
    document.getElementById("update-title").textContent = "Prüfung fehlgeschlagen";
    document.getElementById("update-detail").textContent =
      "GitHub konnte momentan nicht geprüft werden. Die automatische Prüfung läuft später erneut.";
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});
document.getElementById("install-update")?.addEventListener("click", async () => {
  const button = document.getElementById("install-update");
  if (!confirm("Netfreak2k Server-OS jetzt aus GitHub aktualisieren? Die Weboberfläche wird dabei kurz neu gestartet.")) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Update wird gestartet …";
  try {
    await request("/api/updates/install", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    document.getElementById("update-title").textContent = "Update läuft";
    document.getElementById("update-detail").textContent =
      "Netfreak2k lädt den aktuellen GitHub-Stand. Die Oberfläche startet danach automatisch neu.";
    let attempts = 0;
    const waitForServer = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/healthz", {cache: "no-store"});
        if (response.ok && attempts > 2) {
          window.location.reload();
          return;
        }
      } catch (_) {}
      if (attempts < 60) setTimeout(waitForServer, 2000);
      else window.location.reload();
    };
    setTimeout(waitForServer, 5000);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = original;
    alert("Update konnte nicht gestartet werden.");
  }
});
const globalSearch = document.getElementById("global-search");
globalSearch?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(performGlobalSearch, 180);
});
globalSearch?.addEventListener("focus", () => {
  if (globalSearch.value.trim().length >= 2) performGlobalSearch();
});
document.addEventListener("click", event => {
  const box = document.getElementById("global-search-results");
  if (!box) return;
  if (!event.target.closest(".command-search-wrap")) box.classList.add("hidden");
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch?.focus();
  }
});

const viewGroups = {
  "workspace-panel": ["workspace-panel", "drive-management-panel"],
  "calendar-panel": ["calendar-panel"],
  "home-assistant-panel": ["home-assistant-panel"],
  "apps-panel": ["apps-panel", "app-store-panel"],
  "vms-panel": ["vms-panel"],
  "storage-panel": ["storage-panel"],
  "backups-panel": ["backups-panel"],
  "network-panel": ["network-panel"],
  "ai-panel": ["ai-panel"],
  "energy-panel": ["energy-panel"],
  "updates-panel": ["updates-panel"]
};

function switchView(targetId) {
  activeView = targetId || "dashboard-top";
  const overview = document.getElementById("dashboard-top");
  const grid = document.getElementById("module-grid");

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.target === activeView);
  });

  if (activeView === "dashboard-top" || activeView === "system") {
    show(overview, true);
    show(grid, false);
    window.scrollTo({top: 0, behavior: "smooth"});
    return;
  }

  show(overview, false);
  show(grid, true);
  const visible = new Set(viewGroups[activeView] || [activeView]);
  Array.from(grid.children).forEach(panel => {
    panel.classList.toggle("module-hidden", !visible.has(panel.id));
  });
  grid.classList.add("module-mode");
  window.scrollTo({top: 0, behavior: "smooth"});
}

document.querySelectorAll(".nav-item[data-target]").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.target));
});

document.querySelectorAll("[data-target-view]").forEach(btn => {
  btn.addEventListener("click", event => {
    event.stopPropagation();
    switchView(btn.dataset.targetView);
  });
});
document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => switchView("dashboard-top"));
});

document.querySelectorAll("[data-url]").forEach(btn => {
  btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank", "noopener"));
});

bootstrapAuth().catch(error => {
  console.error(error);
  document.getElementById("auth-title").textContent = "Server nicht erreichbar";
  document.getElementById("auth-copy").textContent =
    "Die Netfreak2k-API konnte nicht geladen werden.";
});

setInterval(updateDesktopClock, 1000);
setInterval(loadOverview, 5000);
setInterval(loadStatus, 30000);
setInterval(loadApps, 30000);
setInterval(loadHomeAssistant, 15000);
setInterval(loadUpdates, 60000);
setInterval(loadCatalog, 60000);
setInterval(loadStorage, 30000);
setInterval(loadVms, 20000);
setInterval(loadBackups, 60000);
setInterval(loadWorkspace, 30000);
setInterval(loadFavorites, 60000);
setInterval(loadShares, 60000);
setInterval(loadCalendar, 60000);

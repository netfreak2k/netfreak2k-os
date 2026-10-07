let csrfToken = "";
let workspaceArea = "documents";
let workspacePath = "";
let calendarCursor = new Date();
let calendarEvents = [];
const networkHistoryDown = [];
const networkHistoryUp = [];
let activeView = "dashboard-top";

const WALLPAPERS = [
  {id:"01-night-bay", name:"Golden Bay", mood:"Elegant · Nacht · Gold"},
  {id:"02-aurora", name:"Aurora", mood:"Kühl · Klar · Nordlicht"},
  {id:"03-golden-dunes", name:"Golden Dunes", mood:"Warm · Minimal · Morgen"},
  {id:"04-misty-forest", name:"Misty Forest", mood:"Ruhig · Natur · Nebel"},
  {id:"05-cosmic-nebula", name:"Cosmic Nebula", mood:"Space · Tief · Leuchtend"},
  {id:"06-glass-waves", name:"Glass Waves", mood:"Abstrakt · Clean · Golden Glass"},
  {id:"07-server-geometry", name:"Server Geometry", mood:"Technisch · Dunkel · Präzise"},
  {id:"08-golden-coast", name:"Golden Coast", mood:"Weit · Warm · Küste"},
  {id:"09-cyber-city", name:"Cyber City", mood:"Urban · Regen · Zukunft"},
  {id:"10-mountain-lake", name:"Mountain Lake", mood:"Still · Abend · Natur"}
];

let selectedWallpaper = "01-night-bay";

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
  const welcome = document.getElementById("top-welcome");
  if (welcome) welcome.textContent = username ? `Willkommen, ${username}` : "Willkommen";
  loadStatus();
  loadApps();
  loadHomeAssistant();
  loadUpdates();
  loadCatalog();
  loadOfficeStatus();
  loadTorBrowserStatus();
  loadStorage();
  loadVms();
  loadBackups();
  loadWorkspace();
  loadFavorites();
  loadShares();
  loadCalendar();
  loadSyncCredentials();
  renderWallpaperGallery();
  loadPreferences();
  initMediaCenter();
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

function drawNetworkDetailChart() {
  const canvas = document.getElementById("network-detail-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const all = [...networkHistoryDown, ...networkHistoryUp];
  const max = Math.max(1, ...all);
  const plotTop = 24;
  const plotBottom = height - 30;
  const plotHeight = plotBottom - plotTop;

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.055)";
  for (let i = 0; i <= 4; i += 1) {
    const y = plotTop + (plotHeight * i / 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const drawArea = (history, stroke, fill) => {
    if (history.length < 2) return;
    const points = history.map((value, index) => ({
      x: (index / Math.max(history.length - 1, 1)) * width,
      y: plotBottom - ((value / max) * plotHeight)
    }));
    ctx.beginPath();
    ctx.moveTo(points[0].x, plotBottom);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, plotBottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };

  drawArea(networkHistoryDown, "rgba(235,201,112,.95)", "rgba(235,201,112,.20)");
  drawArea(networkHistoryUp, "rgba(112,174,235,.9)", "rgba(112,174,235,.13)");

  const maxLabel = document.getElementById("network-detail-max");
  if (maxLabel) maxLabel.textContent = `${formatRate(max)} Spitze`;
}

function updateNetworkDetail(network) {
  const down = Number(network.down_bps) || 0;
  const up = Number(network.up_bps) || 0;
  const rx = Number(network.rx_bytes) || 0;
  const tx = Number(network.tx_bytes) || 0;
  const totalTraffic = Math.max(rx + tx, 1);

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText("network-detail-down", formatRate(down));
  setText("network-detail-up", formatRate(up));
  setText("network-detail-rx", `Empfangen: ${formatBytes(rx)}`);
  setText("network-detail-tx", `Gesendet: ${formatBytes(tx)}`);
  setText("network-volume-rx", formatBytes(rx));
  setText("network-volume-tx", formatBytes(tx));
  setText(
    "network-detail-interfaces",
    Array.isArray(network.interfaces) && network.interfaces.length ? network.interfaces.join(" · ") : "–"
  );
  setText("network-detail-provider", network.provider || "nicht erkannt");
  setText("network-detail-asn", network.asn ? `ASN ${network.asn}` : "Providerdaten nicht verfügbar");
  setText("network-detail-ping", Number.isFinite(network.ping_ms) ? `${network.ping_ms} ms` : "–");
  setText("network-detail-wan", network.public_ip || "–");
  setText("network-detail-country", network.country || "–");
  setText("network-detail-gateway", network.gateway || "–");
  setText("network-detail-dns", Array.isArray(network.dns) && network.dns.length ? `DNS: ${network.dns.join(" · ")}` : "DNS: –");

  const rxFill = document.getElementById("network-volume-rx-fill");
  const txFill = document.getElementById("network-volume-tx-fill");
  if (rxFill) rxFill.style.width = `${(rx / totalTraffic) * 100}%`;
  if (txFill) txFill.style.width = `${(tx / totalTraffic) * 100}%`;
  drawNetworkDetailChart();
}

function pushNetworkHistory(down, up) {
  networkHistoryDown.push(Number(down) || 0);
  networkHistoryUp.push(Number(up) || 0);
  while (networkHistoryDown.length > 36) networkHistoryDown.shift();
  while (networkHistoryUp.length > 36) networkHistoryUp.shift();
  drawNetworkChart();
  drawNetworkDetailChart();
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
    updateNetworkDetail(network);
    const provider = document.getElementById("network-provider");
    const ping = document.getElementById("network-ping");
    const wan = document.getElementById("network-wan-ip");
    if (provider) provider.textContent = network.provider || "nicht erkannt";
    if (ping) ping.textContent = Number.isFinite(network.ping_ms) ? `${network.ping_ms} ms` : "–";
    if (wan) wan.textContent = network.public_ip || "–";

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

async function installCatalogApp(appId, name, options = {}) {
  if (!confirm(`${name} jetzt als verwaltete Netfreak2k-App installieren?`)) return;
  try {
    await request("/api/catalog/install", {
      method: "POST",
      body: JSON.stringify({app_id: appId, options}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    setTimeout(() => {
      loadCatalog();
      loadApps();
      loadOfficeStatus();
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

async function loadOfficeStatus() {
  const state = document.getElementById("office-state");
  const engine = document.getElementById("office-engine-status");
  const install = document.getElementById("office-install");
  const open = document.getElementById("office-open");
  if (!state || !engine || !install || !open) return;

  try {
    const data = await request("/api/catalog", {headers: {}});
    const app = (Array.isArray(data.apps) ? data.apps : []).find(item => item.id === "onlyoffice-docs");
    const installed = Boolean(app?.installed);
    const running = app?.state === "running";

    state.textContent = running ? "● Bereit" : installed ? "Installiert · gestoppt" : "Optional";
    state.classList.toggle("running", running);
    engine.textContent = running ? "Editor läuft" : installed ? "Editor gestoppt" : "Nicht installiert";
    install.classList.toggle("hidden", installed);
    open.disabled = !running;
    open.textContent = running ? "Office öffnen" : "Office nicht aktiv";
  } catch (error) {
    console.error(error);
    state.textContent = "Status nicht verfügbar";
    engine.textContent = "Katalog nicht erreichbar";
    open.disabled = true;
  }
}

function openOffice() {
  window.open(`${window.location.protocol}//${window.location.hostname}:8082/`, "_blank", "noopener");
}

document.getElementById("office-open")?.addEventListener("click", openOffice);
document.getElementById("office-install")?.addEventListener("click", async () => {
  await installCatalogApp("onlyoffice-docs", "ONLYOFFICE Docs Community");
  setTimeout(loadOfficeStatus, 1400);
});
document.querySelectorAll("[data-office-kind]").forEach(button => {
  button.addEventListener("click", async () => {
    try {
      const data = await request("/api/catalog", {headers: {}});
      const app = (Array.isArray(data.apps) ? data.apps : []).find(item => item.id === "onlyoffice-docs");
      if (app?.state === "running") {
        openOffice();
      } else {
        switchView("office-panel");
        alert("Installiere zuerst die optionale Office-Engine.");
      }
    } catch (error) {
      console.error(error);
    }
  });
});

async function loadStorage() {
  const main = document.getElementById("storage-host-main");
  const detail = document.getElementById("storage-host-detail");
  const meter = document.getElementById("storage-meter-fill");
  const haos = document.getElementById("storage-haos-main");
  if (!main || !detail || !meter || !haos) return;
  try {
    const data = await request("/api/storage", {headers: {}});
    const host = data.host || {};
    const used = Number(host.used_bytes) || 0;
    const free = Number(host.free_bytes) || 0;
    const total = Number(host.total_bytes) || 0;
    const percent = Number.isFinite(host.used_percent) ? Math.max(0, Math.min(100, host.used_percent)) : 0;
    const haosBytes = Number(data.haos_disk_bytes) || 0;
    const haosShare = total > 0 ? Math.min(100, (haosBytes / total) * 100) : 0;

    main.textContent = total ? `${Math.round(percent)}% belegt` : "Host-Speicher";
    detail.textContent = total
      ? `${formatBytes(used)} von ${formatBytes(total)} · ${formatBytes(free)} frei`
      : "Speicherdaten nicht verfügbar";
    meter.style.width = `${percent}%`;
    haos.textContent = haosBytes ? `${formatBytes(haosBytes)} HAOS-Disk` : "HAOS-Disk nicht gefunden";

    const ring = document.getElementById("storage-detail-ring");
    if (ring) ring.style.setProperty("--storage-ring", `${percent * 3.6}deg`);
    const detailPercent = document.getElementById("storage-detail-percent");
    if (detailPercent) detailPercent.textContent = total ? `${Math.round(percent)}%` : "–";
    const usedValue = document.getElementById("storage-used-value");
    const freeValue = document.getElementById("storage-free-value");
    const totalValue = document.getElementById("storage-total-value");
    if (usedValue) usedValue.textContent = total ? formatBytes(used) : "–";
    if (freeValue) freeValue.textContent = total ? formatBytes(free) : "–";
    if (totalValue) totalValue.textContent = total ? formatBytes(total) : "–";

    const haosFill = document.getElementById("storage-haos-fill");
    if (haosFill) haosFill.style.width = `${haosShare}%`;
    const haosShareText = document.getElementById("storage-haos-share");
    if (haosShareText) haosShareText.textContent = haosBytes && total
      ? `${haosShare.toFixed(1)}% der Host-Gesamtkapazität`
      : "Virtuelle Disk nicht verfügbar";

    const freeFill = document.getElementById("storage-free-visual-fill");
    if (freeFill) freeFill.style.width = `${Math.max(0, 100 - percent)}%`;
    const freeMain = document.getElementById("storage-free-main");
    if (freeMain) freeMain.textContent = total ? `${formatBytes(free)} frei` : "–";
    const health = document.getElementById("storage-health-text");
    if (health) {
      health.textContent = percent >= 90 ? "Kritisch wenig freier Speicher" :
        percent >= 80 ? "Speicher wird knapp" :
        percent >= 65 ? "Kapazität im Blick behalten" :
        "Ausreichend freie Kapazität";
      health.dataset.level = percent >= 90 ? "critical" : percent >= 80 ? "warning" : "ok";
    }
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

function wallpaperPath(id) {
  return `assets/wallpapers/${id}.webp`;
}

function applyWallpaper(id) {
  const wallpaper = WALLPAPERS.find(item => item.id === id) || WALLPAPERS[0];
  selectedWallpaper = wallpaper.id;
  document.documentElement.style.setProperty("--n2k-wallpaper-image", `url("${wallpaperPath(wallpaper.id)}")`);
  document.querySelectorAll(".wallpaper-card").forEach(card => {
    card.classList.toggle("active", card.dataset.wallpaperId === wallpaper.id);
  });
  const selected = document.getElementById("wallpaper-selected");
  if (selected) selected.textContent = wallpaper.name;
}

function renderWallpaperGallery() {
  const gallery = document.getElementById("wallpaper-gallery");
  if (!gallery) return;
  gallery.innerHTML = "";
  for (const wallpaper of WALLPAPERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wallpaper-card";
    button.dataset.wallpaperId = wallpaper.id;
    button.innerHTML = `
      <span class="wallpaper-preview" style="background-image:url('${wallpaperPath(wallpaper.id)}')"></span>
      <span class="wallpaper-copy"><strong></strong><small></small></span>
      <span class="wallpaper-check">✓</span>
    `;
    button.querySelector("strong").textContent = wallpaper.name;
    button.querySelector("small").textContent = wallpaper.mood;
    button.addEventListener("click", () => saveWallpaper(wallpaper.id));
    gallery.appendChild(button);
  }
  applyWallpaper(selectedWallpaper);
}

async function loadPreferences() {
  try {
    const prefs = await request("/api/preferences", {headers: {}});
    applyWallpaper(prefs.wallpaper || "01-night-bay");
  } catch (error) {
    console.error(error);
    applyWallpaper("01-night-bay");
  }
}

async function saveWallpaper(id) {
  const previous = selectedWallpaper;
  applyWallpaper(id);
  try {
    await request("/api/preferences", {
      method: "POST",
      body: JSON.stringify({key: "wallpaper", value: id}),
      headers: {"X-CSRF-Token": csrfToken}
    });
  } catch (error) {
    console.error(error);
    applyWallpaper(previous);
    alert("Wallpaper konnte nicht gespeichert werden.");
  }
}

async function loadSyncCredentials() {
  const list = document.getElementById("sync-credentials-list");
  if (!list) return;
  try {
    const data = await request("/api/sync/credentials", {headers: {}});
    const webdav = document.getElementById("sync-webdav-url");
    const caldav = document.getElementById("sync-caldav-url");
    const absolute = path => `${window.location.origin}${path}`;
    if (webdav) webdav.textContent = absolute(data.webdav_url || "/dav/files/");
    if (caldav) caldav.textContent = absolute(data.caldav_url || "/dav/calendars/");
    list.innerHTML = "";
    const credentials = Array.isArray(data.credentials) ? data.credentials : [];
    for (const credential of credentials) {
      const row = document.createElement("div");
      row.className = "cloud-row";
      row.innerHTML = '<div><strong></strong><small></small></div><button class="mini-action danger-mini">Widerrufen</button>';
      row.querySelector("strong").textContent = credential.label;
      row.querySelector("small").textContent =
        `erstellt ${formatDateTime(credential.created_at)}${credential.last_used_at ? " · zuletzt " + formatDateTime(credential.last_used_at) : ""}`;
      row.querySelector("button").addEventListener("click", () => revokeSyncCredential(credential.id, credential.label));
      list.appendChild(row);
    }
    if (!credentials.length) {
      list.innerHTML = '<div class="app-empty">Noch kein Sync-Zugang eingerichtet.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Sync-Zugänge konnten nicht geladen werden.</div>';
  }
}

async function createSyncCredential() {
  const label = prompt("Name für diesen Sync-Zugang:", "Mein Gerät");
  if (!label) return;
  try {
    const data = await request("/api/sync/credentials/create", {
      method: "POST",
      body: JSON.stringify({label}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    const box = document.getElementById("sync-secret-box");
    const secret = document.getElementById("sync-secret");
    if (secret) secret.textContent = data.password || "";
    show(box, true);
    await loadSyncCredentials();
  } catch (error) {
    console.error(error);
    alert("Sync-Zugang konnte nicht erstellt werden.");
  }
}

async function revokeSyncCredential(id, label) {
  if (!confirm(`Sync-Zugang „${label}“ widerrufen?`)) return;
  try {
    await request("/api/sync/credentials/revoke", {
      method: "POST",
      body: JSON.stringify({id}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadSyncCredentials();
  } catch (error) {
    console.error(error);
    alert("Sync-Zugang konnte nicht widerrufen werden.");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    prompt("Kopieren:", text);
  }
}

async function loadHomeAssistant() {
  const state = document.getElementById("ha-state");
  const detail = document.getElementById("ha-detail");
  try {
    const data = await request("/api/homeassistant", {headers: {}});
    state.textContent = data.state || "unbekannt";
    state.classList.toggle("running", data.state === "running");
    const vmNetwork = document.getElementById("vm-ha-network");
    if (vmNetwork) {
      const networkActive = data.network?.active !== false;
      vmNetwork.textContent = networkActive ? "● libvirt-Netz aktiv" : "● libvirt-Netz prüfen";
      vmNetwork.classList.toggle("good", networkActive);
    }
    if (!data.available) {
      detail.textContent = "VM-Agent nicht erreichbar.";
    } else if (data.kvm === false) {
      detail.textContent = "KVM ist auf diesem Host nicht verfügbar.";
    } else if (!data.installed) {
      detail.textContent = "Home Assistant OS ist noch nicht installiert.";
    } else if (data.network && data.network.active === false) {
      detail.textContent = "VM vorhanden · libvirt-Netz ist nicht aktiv.";
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

function homeAssistantErrorMessage(code) {
  const messages = {
    libvirt_default_network_missing: "Das libvirt-Standardnetz fehlt.",
    libvirt_network_start_failed: "Das libvirt-Netz konnte nicht gestartet werden.",
    haos_not_installed: "Die Home-Assistant-OS-VM ist nicht installiert.",
    agent_auth_failed: "Der Netfreak2k-VM-Agent konnte nicht authentifiziert werden.",
    vm_agent_error: "Der Netfreak2k-VM-Agent hat einen Fehler gemeldet."
  };
  return messages[code] || code || "Unbekannter Fehler";
}

async function homeAssistantAction(action) {
  try {
    await request("/api/homeassistant/action", {
      method: "POST",
      body: JSON.stringify({action}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadHomeAssistant();
    await loadOverview();
  } catch (error) {
    console.error(error);
    alert(`Home Assistant konnte nicht gestartet werden:\n${homeAssistantErrorMessage(error.code)}`);
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
    const top = document.getElementById("top-update-status");
    const topDot = top?.querySelector(".health-dot");
    const topText = top?.querySelector("strong");
    const progress = data.progress || {};
    const installed = data.installed || {};

    const setText = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };

    const progressValue = Math.max(0, Math.min(100, Number(progress.progress) || 0));
    const progressFill = document.getElementById("update-progress-fill");
    if (progressFill) progressFill.style.width = `${progressValue}%`;
    setText("update-progress-percent", `${progressValue}%`);
    setText("update-step", progress.message || "Bereit");

    const runtimeState = progress.state || "idle";
    const statePill = document.getElementById("update-state-pill");
    if (statePill) {
      statePill.textContent =
        runtimeState === "running" ? "Update läuft" :
        runtimeState === "completed" ? "Abgeschlossen" :
        runtimeState === "failed" ? "Fehlgeschlagen" :
        data.update_available ? "Verfügbar" : "Aktuell";
      statePill.classList.toggle("running", runtimeState === "running" || runtimeState === "completed");
      statePill.classList.toggle("warning", runtimeState === "failed" || data.update_available);
    }

    setText("update-installed-ref", installed.ref || data.ref || "main");
    setText("update-installed-fingerprint",
      installed.fingerprint ? installed.fingerprint.slice(0, 16) : "Fingerprint unbekannt");
    setText("update-remote-ref", data.ref || "main");
    setText("update-remote-fingerprint",
      data.remote_fingerprint ? data.remote_fingerprint.slice(0, 16) : "nicht verfügbar");
    setText("update-last-check",
      Number.isFinite(data.checked_at) ? formatDateTime(data.checked_at) : "noch nicht geprüft");
    setText("update-installed-at",
      Number.isFinite(installed.installed_at) ? formatDateTime(installed.installed_at) : "unbekannt");
    setText("update-source", `Quelle: GitHub · ${data.repo || "netfreak2k/netfreak2k-os"}`);
    setText("update-runtime-state",
      runtimeState === "running" ? "Installation aktiv" :
      runtimeState === "completed" ? "Letztes Update erfolgreich" :
      runtimeState === "failed" ? "Letztes Update fehlgeschlagen" :
      "Kein Update aktiv");

    const stageOrder = ["prepare","download","extract","validate","install","services","containers","restart","verify","completed"];
    const currentIndex = stageOrder.indexOf(progress.step);
    document.querySelectorAll("[data-update-stage]").forEach(stage => {
      const idx = stageOrder.indexOf(stage.dataset.updateStage);
      stage.classList.toggle("active", currentIndex >= 0 && idx === currentIndex);
      stage.classList.toggle("done", currentIndex >= 0 && idx >= 0 && idx < currentIndex);
    });

    if (Number.isFinite(progress.updated_at)) {
      setText("update-progress-time", `zuletzt aktualisiert ${formatDateTime(progress.updated_at)}`);
    } else {
      setText("update-progress-time", "–");
    }

    if (!data.available) {
      title.textContent = "Update-Status noch nicht verfügbar";
      detail.textContent = "Die nächste automatische GitHub-Prüfung aktualisiert diesen Bereich.";
      if (topText) topText.textContent = "Update unbekannt";
      if (topDot) topDot.className = "health-dot";
      return;
    }

    if (runtimeState === "running") {
      title.textContent = "Systemupdate läuft";
      detail.textContent = progress.message || "Netfreak2k wird aktualisiert.";
      if (topText) topText.textContent = "Update läuft";
      if (topDot) topDot.className = "health-dot info";
      return;
    }

    if (runtimeState === "failed") {
      title.textContent = "Update fehlgeschlagen";
      detail.textContent = progress.message || "Der Update-Vorgang konnte nicht abgeschlossen werden.";
      if (topText) topText.textContent = "Update fehlgeschlagen";
      if (topDot) topDot.className = "health-dot warn";
      return;
    }

    if (data.update_available) {
      title.textContent = "Neue Version verfügbar";
      if (topText) topText.textContent = "Update verfügbar";
      if (topDot) topDot.className = "health-dot info";
      const fingerprint = data.remote_fingerprint ? data.remote_fingerprint.slice(0, 12) : "GitHub";
      detail.textContent = `Neuer Stand ${fingerprint} erkannt. Installation erfolgt erst nach deiner Bestätigung.`;
    } else if (data.note === "github_archive_unavailable") {
      title.textContent = "GitHub momentan nicht erreichbar";
      if (topText) topText.textContent = "Update-Prüfung offline";
      if (topDot) topDot.className = "health-dot warn";
      detail.textContent = "Netfreak2k läuft weiter; die nächste Prüfung erfolgt automatisch.";
    } else {
      title.textContent = runtimeState === "completed" ? "Update erfolgreich abgeschlossen" : "Netfreak2k ist aktuell";
      detail.textContent = runtimeState === "completed"
        ? "Der neue Stand wurde installiert und die Dienste wurden neu gestartet."
        : "Kein neuer GitHub-Stand erkannt.";
      if (topText) topText.textContent = "System aktuell";
      if (topDot) topDot.className = "health-dot ok";
    }
  } catch (error) {
    console.error(error);
    title.textContent = "Update-Status nicht erreichbar";
    detail.textContent = "Die Weboberfläche bleibt uneingeschränkt nutzbar.";
    const top = document.getElementById("top-update-status");
    const topText = top?.querySelector("strong");
    const topDot = top?.querySelector(".health-dot");
    if (topText) topText.textContent = "Update-Prüfung fehlgeschlagen";
    if (topDot) topDot.className = "health-dot warn";
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
document.getElementById("sync-create")?.addEventListener("click", createSyncCredential);
document.getElementById("sync-refresh")?.addEventListener("click", loadSyncCredentials);
document.getElementById("sync-copy-secret")?.addEventListener("click", () => {
  const value = document.getElementById("sync-secret")?.textContent || "";
  if (value) copyText(value);
});
document.querySelectorAll("[data-copy-sync]").forEach(button => {
  button.addEventListener("click", () => {
    const id = button.dataset.copySync === "caldav" ? "sync-caldav-url" : "sync-webdav-url";
    const value = document.getElementById(id)?.textContent || "";
    if (value && value !== "–") copyText(value);
  });
});

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
      "Netfreak2k startet den Update-Vorgang. Der Fortschritt wird live angezeigt.";
    const updateProgressPoll = setInterval(() => loadUpdates(), 1200);
    let attempts = 0;
    const waitForServer = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/healthz", {cache: "no-store"});
        if (response.ok && attempts > 2) {
          clearInterval(updateProgressPoll);
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
  "apps-panel": ["apps-panel", "app-store-panel"],
  "vms-panel": ["vms-panel"],
  "storage-panel": ["storage-panel"],
  "backups-panel": ["backups-panel"],
  "network-panel": ["network-panel"],
  "office-panel": ["office-panel"],
  "terminal-panel": ["terminal-panel"],
  "privacy-panel": ["privacy-panel"],
  "ai-panel": ["ai-panel"],
  "updates-panel": ["wallpaper-panel", "sync-panel", "updates-panel"]
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

document.querySelector(".side-nav")?.addEventListener("click", event => {
  const button = event.target.closest(".nav-item[data-target]");
  if (!button) return;
  event.preventDefault();
  switchView(button.dataset.target);
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-target-view]");
  if (!button) return;
  event.stopPropagation();
  switchView(button.dataset.targetView);
});
document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => switchView("dashboard-top"));
});

document.querySelectorAll("[data-url]").forEach(btn => {
  btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank", "noopener"));
});


const terminalCommands = {
  help: async () => [
    "Verfügbare Befehle:",
    "  help      Befehlsübersicht",
    "  status    Serverstatus",
    "  cpu       CPU-Auslastung",
    "  ram       Arbeitsspeicher",
    "  storage   Host-Speicher",
    "  network   Netzwerkstatus",
    "  apps      Verwaltete Apps",
    "  vms       Virtuelle Maschinen",
    "  uptime    Laufzeit",
    "  update-check  Nach Updates suchen",
    "  update-status Update-Status anzeigen",
    "  update    Netfreak2k aktualisieren",
    "  clear     Terminal leeren"
  ],
  status: async () => {
    const data = await request("/api/status", {headers:{}});
    const host = data.host || {};
    return [
      `Produkt: ${data.product || "Netfreak2k Server-OS"}`,
      `Version: ${data.version || "unbekannt"}`,
      `Host: ${host.hostname || "unbekannt"}`,
      `OS: ${host.os?.PRETTY_NAME || host.os?.NAME || "unbekannt"}`
    ];
  },
  cpu: async () => {
    const data = await request("/api/overview", {headers:{}});
    return [`CPU: ${Number.isFinite(data.cpu_percent) ? data.cpu_percent + "%" : "wird gemessen"}`];
  },
  ram: async () => {
    const data = await request("/api/overview", {headers:{}});
    const m = data.memory || {};
    return [
      `RAM: ${Number.isFinite(m.used_percent) ? m.used_percent + "%" : "–"}`,
      `Belegt: ${formatBytes(m.used_bytes)} / ${formatBytes(m.total_bytes)}`
    ];
  },
  storage: async () => {
    const data = await request("/api/storage", {headers:{}});
    const h = data.host || {};
    return [
      `Speicher: ${Number.isFinite(h.used_percent) ? h.used_percent + "% belegt" : "–"}`,
      `Belegt: ${formatBytes(h.used_bytes)}`,
      `Frei: ${formatBytes(h.free_bytes)}`,
      `Gesamt: ${formatBytes(h.total_bytes)}`
    ];
  },
  network: async () => {
    const data = await request("/api/overview", {headers:{}});
    const n = data.network || {};
    return [
      `Interfaces: ${Array.isArray(n.interfaces) && n.interfaces.length ? n.interfaces.join(", ") : "–"}`,
      `Download: ${formatRate(n.down_bps)}`,
      `Upload: ${formatRate(n.up_bps)}`,
      `Ping: ${Number.isFinite(n.ping_ms) ? n.ping_ms + " ms" : "–"}`,
      `Provider: ${n.provider || "–"}`,
      `WAN: ${n.public_ip || "–"}`
    ];
  },
  apps: async () => {
    const data = await request("/api/apps", {headers:{}});
    const items = Array.isArray(data.containers) ? data.containers : [];
    return items.length ? items.map(item => `${item.name}: ${item.state || "unknown"}`) : ["Keine verwalteten Apps gefunden."];
  },
  vms: async () => {
    const data = await request("/api/vms", {headers:{}});
    const items = Array.isArray(data.vms) ? data.vms : [];
    return items.length ? items.map(item => `${item.name}: ${item.state || "unknown"}`) : ["Keine VMs gefunden."];
  },
  uptime: async () => {
    const data = await request("/api/status", {headers:{}});
    return [`Uptime: ${formatUptime(data.host?.uptime_seconds)}`];
  },
  "update-check": async () => {
    const data = await request("/api/updates/check", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    return [
      "Update-Prüfung abgeschlossen.",
      data.update_available ? "Neues Update verfügbar." : "Kein neues Update erkannt.",
      data.remote_fingerprint ? `Remote: ${data.remote_fingerprint}` : "",
      data.installed_fingerprint ? `Installiert: ${data.installed_fingerprint}` : ""
    ].filter(Boolean);
  },
  "update-status": async () => {
    const data = await request("/api/updates", {headers:{}});
    const progress = data.progress || {};
    return [
      `Status: ${progress.status || data.status || "unbekannt"}`,
      `Phase: ${progress.stage || "–"}`,
      `Fortschritt: ${Number.isFinite(progress.percent) ? progress.percent + "%" : "–"}`,
      progress.message ? `Meldung: ${progress.message}` : ""
    ].filter(Boolean);
  },
  update: async () => {
    if (!confirm("Netfreak2k jetzt aktualisieren? Die Weboberfläche kann während des Updates kurz neu starten.")) {
      return ["Update abgebrochen."];
    }
    const data = await request("/api/updates/install", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    return [
      data.already_running ? "Update läuft bereits." : "Update wurde gestartet.",
      "Der Server lädt den aktuellen Stand von GitHub und baut die Webplattform neu.",
      "Mit 'update-status' kannst du den Fortschritt prüfen."
    ];
  }
};

function terminalPrint(lines, className="") {
  const output = document.getElementById("terminal-output");
  if (!output) return;
  for (const line of (Array.isArray(lines) ? lines : [lines])) {
    const row = document.createElement("div");
    row.className = `terminal-line ${className}`.trim();
    row.textContent = line;
    output.appendChild(row);
  }
  output.scrollTop = output.scrollHeight;
}

async function runTerminalCommand(raw) {
  const command = String(raw || "").trim();
  if (!command) return;
  terminalPrint([`n2k@server:~$ ${command}`], "terminal-command");
  const name = command.split(/\s+/)[0].toLowerCase();

  if (name === "clear") {
    const output = document.getElementById("terminal-output");
    if (output) output.innerHTML = "";
    return;
  }

  const handler = terminalCommands[name];
  if (!handler) {
    terminalPrint([`Befehl nicht erlaubt: ${name}`, "Tippe help für die freigegebene Befehlsliste."], "terminal-error");
    return;
  }

  try {
    terminalPrint(await handler());
  } catch (error) {
    console.error(error);
    const detail = error?.code || error?.message || "unbekannter_fehler";
    terminalPrint([`Fehler: ${detail}`], "terminal-error");
  }
}

document.getElementById("terminal-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const input = document.getElementById("terminal-input");
  const value = input?.value || "";
  if (input) input.value = "";
  await runTerminalCommand(value);
});

function startMatrixSimulation() {
  const canvas = document.getElementById("matrix-canvas");
  if (!canvas || canvas.dataset.running === "true") return;
  canvas.dataset.running = "true";

  const ctx = canvas.getContext("2d");
  const chars = "01N2KABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+<>/";
  const fontSize = 14;
  const columnStep = Math.round(fontSize * 1.45);
  const columns = Math.max(1, Math.floor(canvas.width / columnStep));
  const drops = Array.from({length: columns}, () => Math.floor(Math.random() * -28));

  let lastFrame = 0;
  const frameDelay = 170;

  const draw = timestamp => {
    if (!document.body.contains(canvas)) return;

    if (timestamp - lastFrame >= frameDelay) {
      lastFrame = timestamp;

      ctx.fillStyle = "rgba(2,7,5,.28)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      ctx.fillStyle = "rgba(88,255,138,.72)";

      for (let i = 0; i < drops.length; i += 1) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * columnStep;
        const y = drops[i] * fontSize;

        ctx.fillText(char, x, y);

        if (y > canvas.height && Math.random() > .988) {
          drops[i] = 0;
        } else if (Math.random() > .32) {
          drops[i] += 1;
        }
      }
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}
startMatrixSimulation();

async function openOnionInTorWorkspace(value) {
  const normalized = normalizeOnionUrl(value);
  if (!normalized) {
    alert("Bitte eine gültige .onion-Adresse eingeben.");
    return;
  }

  const explorerInput = document.getElementById("onion-explorer-url");
  const simpleInput = document.getElementById("onion-url");
  if (explorerInput) explorerInput.value = normalized;
  if (simpleInput) simpleInput.value = normalized;

  const history = onionLoad("history").filter(item => item.url !== normalized);
  history.unshift({url: normalized, at: Date.now()});
  onionSave("history", history);
  renderOnionExplorer();

  switchView("privacy-panel");
  await loadTorBrowserStatus();

  const stateText = document.getElementById("tor-browser-state")?.textContent || "";
  if (!stateText.startsWith("Bereit")) {
    alert("Der isolierte Tor Browser ist noch nicht aktiv. Installiere oder starte ihn im Tor-Workspace.");
    document.getElementById("tor-browser-install")?.focus();
    return;
  }

  try {
    await navigator.clipboard.writeText(normalized);
  } catch (_) {}

  document.querySelector(".tor-browser-shell")?.scrollIntoView({behavior:"smooth", block:"start"});
  alert("Die Onion-Adresse wurde in die Zwischenablage kopiert. Füge sie oben in die Adressleiste des eingebetteten Tor Browsers ein.");
}

document.getElementById("open-onion")?.addEventListener("click", () => {
  openOnionInTorWorkspace(document.getElementById("onion-url")?.value || "");
});

document.getElementById("tor-project")?.addEventListener("click", () => {
  window.open("https://www.torproject.org/download/", "_blank", "noopener");
});
function setTorControlState({installed=false, running=false, error=false} = {}) {
  const dot = document.getElementById("overview-tor-dot");
  const overviewState = document.getElementById("overview-tor-status");
  const install = document.getElementById("tor-browser-install");
  const open = document.getElementById("tor-browser-open");
  const startButtons = [
    document.getElementById("overview-tor-start"),
    document.getElementById("tor-browser-start")
  ].filter(Boolean);
  const stopButtons = [
    document.getElementById("overview-tor-stop"),
    document.getElementById("tor-browser-stop")
  ].filter(Boolean);
  const restartButtons = [
    document.getElementById("overview-tor-restart"),
    document.getElementById("tor-browser-restart")
  ].filter(Boolean);

  if (dot) {
    dot.classList.remove("running", "stopped", "missing", "error", "unknown");
    dot.classList.add(error ? "error" : running ? "running" : installed ? "stopped" : "missing");
  }
  if (overviewState) {
    overviewState.textContent = error ? "Fehler" : running ? "Tor aktiv" : installed ? "gestoppt" : "nicht installiert";
  }
  if (install) install.classList.toggle("hidden", installed);
  if (open) open.disabled = !running;
  startButtons.forEach(button => {
    button.disabled = !installed || running || error;
    button.classList.toggle("hidden", !installed);
  });
  stopButtons.forEach(button => {
    button.disabled = !running || error;
    button.classList.toggle("hidden", !installed);
  });
  restartButtons.forEach(button => {
    button.disabled = !running || error;
    button.classList.toggle("hidden", !installed);
  });
}

async function loadTorBrowserStatus() {
  const state = document.getElementById("tor-browser-state");
  const wrap = document.getElementById("tor-browser-frame-wrap");
  if (!state || !wrap) return;
  try {
    const data = await request("/api/catalog", {headers:{}});
    const app = (Array.isArray(data.apps) ? data.apps : []).find(item => item.id === "tor-browser");
    const installed = Boolean(app?.installed);
    const running = app?.state === "running";

    state.textContent = running ? "● Tor aktiv · eingebettet" : installed ? "Installiert · gestoppt" : "Nicht installiert";
    state.className = running ? "running" : "";
    setTorControlState({installed, running});

    if (running && !wrap.querySelector("iframe")) {
      wrap.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.className = "tor-browser-frame";
      frame.src = `https://${window.location.hostname}:6901/`;
      frame.title = "N2K Tor Browser";
      frame.referrerPolicy = "no-referrer";
      frame.setAttribute("allow", "clipboard-read; clipboard-write");
      wrap.appendChild(frame);
    } else if (!running && wrap.querySelector("iframe")) {
      wrap.innerHTML = `
        <div class="tor-browser-placeholder">
          <strong>Tor Browser ist gestoppt</strong>
          <span>Starte die isolierte Sitzung über das Dashboard oder hier im Workspace.</span>
        </div>`;
    }
  } catch (error) {
    console.error(error);
    state.textContent = "Status nicht verfügbar";
    state.className = "";
    setTorControlState({error:true});
  }
}

async function torBrowserAction(action) {
  const container = "netfreak2k-app-tor-browser";
  const buttons = [
    document.getElementById("overview-tor-start"),
    document.getElementById("overview-tor-stop"),
    document.getElementById("overview-tor-restart"),
    document.getElementById("tor-browser-start"),
    document.getElementById("tor-browser-stop"),
    document.getElementById("tor-browser-restart")
  ].filter(Boolean);
  buttons.forEach(button => button.disabled = true);
  try {
    await request("/api/apps/action", {
      method: "POST",
      body: JSON.stringify({name: container, action}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await loadTorBrowserStatus();
    loadApps();
    loadCatalog();
  } catch (error) {
    console.error(error);
    alert("Tor Browser konnte nicht " + (action === "start" ? "gestartet" : action === "stop" ? "gestoppt" : "neu gestartet") + " werden.");
    await loadTorBrowserStatus();
  }
}

document.getElementById("tor-browser-install")?.addEventListener("click", async () => {
  const password = prompt("Lege ein Passwort für den isolierten Tor-Browser fest (mindestens 10 Zeichen):");
  if (!password) return;
  if (password.length < 10 || password.length > 64) {
    alert("Das Passwort muss zwischen 10 und 64 Zeichen lang sein.");
    return;
  }
  await installCatalogApp("tor-browser", "Tor Browser", {password});
  setTimeout(loadTorBrowserStatus, 2500);
});

document.getElementById("overview-tor-start")?.addEventListener("click", event => {
  event.stopPropagation();
  torBrowserAction("start");
});
document.getElementById("overview-tor-stop")?.addEventListener("click", event => {
  event.stopPropagation();
  torBrowserAction("stop");
});
document.getElementById("overview-tor-restart")?.addEventListener("click", event => {
  event.stopPropagation();
  torBrowserAction("restart");
});
document.getElementById("tor-browser-start")?.addEventListener("click", () => torBrowserAction("start"));
document.getElementById("tor-browser-stop")?.addEventListener("click", () => torBrowserAction("stop"));
document.getElementById("tor-browser-restart")?.addEventListener("click", () => torBrowserAction("restart"));

document.querySelector(".onion-explorer-widget")?.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
    event.preventDefault();
    switchView("privacy-panel");
  }
});

document.getElementById("tor-browser-open")?.addEventListener("click", () => {
  window.open(`https://${window.location.hostname}:6901/`, "_blank", "noopener");
});

function normalizeOnionUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname.toLowerCase().endsWith(".onion")) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

function onionStoreKey(type) {
  return `n2k_onion_${type}`;
}

function onionLoad(type) {
  try {
    const value = JSON.parse(localStorage.getItem(onionStoreKey(type)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function onionSave(type, items) {
  localStorage.setItem(onionStoreKey(type), JSON.stringify(items.slice(0, 40)));
}

function renderOnionList(type, containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const items = onionLoad(type);
  box.innerHTML = "";
  if (!items.length) {
    box.innerHTML = `<div class="app-empty">${type === "favorites" ? "Noch keine Favoriten." : "Noch kein Verlauf."}</div>`;
    return;
  }
  items.slice(0, 12).forEach(item => {
    const row = document.createElement("button");
    row.className = "onion-list-row";
    row.innerHTML = "<strong></strong><small></small>";
    row.querySelector("strong").textContent = item.url;
    row.querySelector("small").textContent = new Date(item.at).toLocaleString("de-DE", {dateStyle:"short",timeStyle:"short"});
    row.addEventListener("click", () => {
      const input = document.getElementById("onion-explorer-url");
      if (input) input.value = item.url;
    });
    box.appendChild(row);
  });
}

function renderOnionExplorer() {
  renderOnionList("favorites", "onion-favorites");
  renderOnionList("history", "onion-history");
}
renderOnionExplorer();

document.getElementById("onion-explorer-open")?.addEventListener("click", () => {
  openOnionInTorWorkspace(document.getElementById("onion-explorer-url")?.value || "");
});

document.getElementById("onion-explorer-save")?.addEventListener("click", () => {
  const input = document.getElementById("onion-explorer-url");
  const value = normalizeOnionUrl(input?.value);
  if (!value) {
    alert("Bitte eine gültige .onion-Adresse eingeben.");
    return;
  }
  const items = onionLoad("favorites").filter(item => item.url !== value);
  items.unshift({url:value,at:Date.now()});
  onionSave("favorites",items);
  renderOnionExplorer();
});

document.getElementById("onion-copy")?.addEventListener("click", async () => {
  const value = normalizeOnionUrl(document.getElementById("onion-explorer-url")?.value);
  if (!value) {
    alert("Bitte zuerst eine gültige .onion-Adresse eingeben.");
    return;
  }
  try { await navigator.clipboard.writeText(value); } catch (_) {}
});

document.getElementById("tor-download")?.addEventListener("click", () => {
  window.open("https://www.torproject.org/download/", "_blank", "noopener");
});

document.getElementById("onion-clear-history")?.addEventListener("click", () => {
  localStorage.removeItem(onionStoreKey("history"));
  renderOnionExplorer();
});




function aiStorageKey(pane) {
  return `n2k_ai_pane_${pane}`;
}

function renderAiPane(pane) {
  const history = document.getElementById(`ai-history-${pane}`);
  if (!history) return;
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(aiStorageKey(pane)) || "[]");
  } catch (_) {
    items = [];
  }
  history.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    history.innerHTML = '<div class="ai-empty">Noch keine lokale Notiz.</div>';
    return;
  }
  items.slice(-4).forEach(item => {
    const row = document.createElement("div");
    row.className = "ai-note-row";
    const strong = document.createElement("strong");
    strong.textContent = item.text;
    const small = document.createElement("small");
    small.textContent = new Date(item.at).toLocaleString("de-DE", {dateStyle:"short", timeStyle:"short"});
    row.append(strong, small);
    history.appendChild(row);
  });
}

function saveAiPaneNote(pane) {
  const input = document.getElementById(`ai-input-${pane}`);
  const text = input?.value.trim();
  if (!text) return;
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(aiStorageKey(pane)) || "[]");
  } catch (_) {}
  if (!Array.isArray(items)) items = [];
  items.push({text, at: Date.now()});
  localStorage.setItem(aiStorageKey(pane), JSON.stringify(items.slice(-12)));
  renderAiPane(pane);
}

async function openAiPaneInChatGPT(pane) {
  const input = document.getElementById(`ai-input-${pane}`);
  const text = input?.value.trim() || "";
  if (text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
    saveAiPaneNote(pane);
  }
  window.open("https://chatgpt.com/", `n2k-chatgpt-${pane}`, "noopener");
}

for (let pane = 1; pane <= 4; pane += 1) renderAiPane(pane);
document.querySelectorAll(".ai-save-note").forEach(button => {
  button.addEventListener("click", () => saveAiPaneNote(button.dataset.pane));
});
document.querySelectorAll(".ai-copy-open").forEach(button => {
  button.addEventListener("click", () => openAiPaneInChatGPT(button.dataset.pane));
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
setInterval(loadOfficeStatus, 30000);
setInterval(loadTorBrowserStatus, 30000);
setInterval(loadStorage, 15000);
setInterval(loadVms, 20000);
setInterval(loadBackups, 60000);
setInterval(loadWorkspace, 30000);
setInterval(loadFavorites, 60000);
setInterval(loadShares, 60000);
setInterval(loadCalendar, 60000);
setInterval(loadSyncCredentials, 60000);


/* N2K Media Center */
const N2K_RADIO_STATIONS = [
  {id:"dlf",country:"DE",name:"Deutschlandfunk",genre:"News · Kultur",bitrate:"128 kbps",url:"https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3"},
  {id:"swr3",country:"DE",name:"SWR3",genre:"Pop · Charts",bitrate:"128 kbps",url:"https://liveradio.swr.de/sw282p3/swr3/play.mp3"},
  {id:"njoy",country:"DE",name:"N-JOY",genre:"Pop · Hits",bitrate:"128 kbps",url:"https://icecast.ndr.de/ndr/njoy/live/mp3/128/stream.mp3"},
  {id:"wdr2",country:"DE",name:"WDR 2",genre:"Pop · Information",bitrate:"128 kbps",url:"https://wdr-wdr2-rheinland.icecastssl.wdr.de/wdr/wdr2/rheinland/mp3/128/stream.mp3"},
  {id:"bbc6",country:"GB",name:"BBC Radio 6 Music",genre:"Alternative · Music",bitrate:"AAC",url:"https://stream.live.vc.bbcmedia.co.uk/bbc_6music"},
  {id:"bbc4",country:"GB",name:"BBC Radio 4",genre:"Talk · News",bitrate:"AAC",url:"https://stream.live.vc.bbcmedia.co.uk/bbc_radio_fourfm"},
  {id:"somafm",country:"US",name:"SomaFM Groove Salad",genre:"Ambient · Chill",bitrate:"128 kbps",url:"https://ice2.somafm.com/groovesalad-128-mp3"},
  {id:"defcon",country:"US",name:"SomaFM DEF CON Radio",genre:"Electronic · Hacker",bitrate:"128 kbps",url:"https://ice2.somafm.com/defcon-128-mp3"},
  {id:"fip",country:"FR",name:"FIP",genre:"Eclectic · Culture",bitrate:"AAC",url:"https://icecast.radiofrance.fr/fip-midfi.mp3"},
  {id:"franceinfo",country:"FR",name:"France Info",genre:"News",bitrate:"AAC",url:"https://icecast.radiofrance.fr/franceinfo-midfi.mp3"},
  {id:"nporadio2",country:"NL",name:"NPO Radio 2",genre:"Pop · Classics",bitrate:"AAC",url:"https://icecast.omroep.nl/radio2-bb-mp3"},
  {id:"npo3fm",country:"NL",name:"NPO 3FM",genre:"Alternative · Pop",bitrate:"AAC",url:"https://icecast.omroep.nl/3fm-bb-mp3"}
];

const N2K_EQ_PRESETS = {
  flat:[0,0,0,0,0,0,0,0,0,0],
  bass:[8,7,5,3,1,0,0,1,1,1],
  rock:[5,4,2,0,-1,1,3,5,6,5],
  electronic:[6,5,2,0,-2,1,3,5,6,7],
  vocal:[-2,-1,0,2,4,5,4,2,0,-1]
};

let mediaAudio = null;
let mediaStations = [...N2K_RADIO_STATIONS];
let mediaRadioRequest = 0;
let mediaRadioSearchTimer = null;
let mediaMultiroomSelection = new Set();
let mediaCountry = "DE";
let mediaStationIndex = -1;
let mediaInitialized = false;
let mediaAudioContext = null;
let mediaEqFilters = [];
let mediaSourceNode = null;

function ensureMediaAudio() {
  if (mediaAudio) return mediaAudio;
  mediaAudio = new Audio();
  mediaAudio.preload = "none";
  mediaAudio.crossOrigin = "anonymous";
  mediaAudio.volume = 0.72;
  mediaAudio.addEventListener("play", updateMediaPlaybackUi);
  mediaAudio.addEventListener("pause", updateMediaPlaybackUi);
  mediaAudio.addEventListener("waiting", () => setMediaStatus("Puffert …"));
  mediaAudio.addEventListener("playing", updateMediaPlaybackUi);
  mediaAudio.addEventListener("error", () => setMediaStatus("Stream nicht erreichbar"));
  return mediaAudio;
}

function mediaCurrentStation() {
  return mediaStationIndex >= 0 ? mediaStations[mediaStationIndex] : null;
}

function setMediaStatus(text) {
  const subtitle = document.getElementById("media-subtitle");
  if (subtitle && text) subtitle.textContent = text;
}

function updateMediaSessionMetadata() {
  const station = mediaCurrentStation();
  if (!("mediaSession" in navigator) || !station) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.genre || "Internet Radio",
      album: "N2K Media Center",
      artwork: station.favicon ? [
        {src: station.favicon, sizes: "96x96"},
        {src: station.favicon, sizes: "256x256"}
      ] : []
    });
    navigator.mediaSession.playbackState = ensureMediaAudio().paused ? "paused" : "playing";
  } catch (error) {
    console.debug("Media Session metadata unavailable", error);
  }
}

function setupMediaSessionControls() {
  if (!("mediaSession" in navigator)) return;
  const actions = {
    play: async () => {
      const audio = ensureMediaAudio();
      if (!audio.src) {
        const first = filteredMediaStations()[0];
        if (first) await playMediaStation(first.index);
      } else {
        await audio.play();
      }
    },
    pause: () => ensureMediaAudio().pause(),
    previoustrack: () => stepMediaStation(-1),
    nexttrack: () => stepMediaStation(1)
  };
  Object.entries(actions).forEach(([action,handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  });
}

function updateMediaPlaybackUi() {
  const audio = ensureMediaAudio();
  const playing = !audio.paused && Boolean(audio.src);
  const station = mediaCurrentStation();
  const play = document.getElementById("media-play");
  const topState = document.getElementById("top-media-state");
  const topTitle = document.getElementById("top-media-title");
  const liveDot = document.getElementById("media-live-dot");
  const visualizer = document.querySelector(".media-visualizer");

  if (play) play.textContent = playing ? "Ⅱ" : "▶";
  if (topState) topState.textContent = playing ? "Ⅱ" : "▶";
  if (topTitle) topTitle.textContent = station ? station.name : "Bereit";
  if (liveDot) liveDot.classList.toggle("active", playing);
  if (visualizer) visualizer.classList.toggle("is-playing", playing);

  if (station) {
    updateMediaSessionMetadata();
    const title = document.getElementById("media-title");
    const subtitle = document.getElementById("media-subtitle");
    if (title) title.textContent = station.name;
    if (subtitle) subtitle.textContent = `${station.genre} · ${station.bitrate} · ${station.country}`;
  }
}

function filteredMediaStations() {
  const q = (document.getElementById("media-radio-search")?.value || "").trim().toLowerCase();
  return mediaStations
    .map((station,index) => ({station,index}))
    .filter(({station}) => !station.country || station.country === mediaCountry)
    .filter(({station}) => !q || `${station.name} ${station.genre}`.toLowerCase().includes(q));
}

function renderMediaStations() {
  const list = document.getElementById("media-station-list");
  if (!list) return;
  list.innerHTML = "";
  const favorites = new Set(JSON.parse(localStorage.getItem("n2k-media-favorites") || "[]"));
  for (const {station,index} of filteredMediaStations()) {
    const row = document.createElement("div");
    row.className = "media-station-row";
    if (index === mediaStationIndex) row.classList.add("active");
    row.innerHTML = '<span class="media-station-logo">♪</span><div><strong></strong><small></small></div><button class="media-fav">♡</button><button class="media-station-play">▶</button>';
    const logo = row.querySelector(".media-station-logo");
    if (station.favicon) {
      logo.textContent = "";
      const image = document.createElement("img");
      image.src = station.favicon;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => { logo.textContent = "♪"; image.remove(); });
      logo.appendChild(image);
    }
    row.querySelector("strong").textContent = station.name;
    row.querySelector("small").textContent = `${station.genre} · ${station.bitrate}`;
    const fav = row.querySelector(".media-fav");
    fav.textContent = favorites.has(station.id) ? "♥" : "♡";
    fav.addEventListener("click", event => {
      event.stopPropagation();
      toggleMediaFavorite(station.id);
      renderMediaStations();
    });
    row.querySelector(".media-station-play").addEventListener("click", () => playMediaStation(index));
    row.addEventListener("dblclick", () => playMediaStation(index));
    list.appendChild(row);
  }
  if (!list.children.length) list.innerHTML = '<div class="media-empty">Keine Sender gefunden.</div>';
}

function toggleMediaFavorite(id) {
  const favorites = new Set(JSON.parse(localStorage.getItem("n2k-media-favorites") || "[]"));
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  localStorage.setItem("n2k-media-favorites", JSON.stringify([...favorites]));
  updateMediaFavoriteButton();
}

function updateMediaFavoriteButton() {
  const button = document.getElementById("media-favorite");
  const station = mediaCurrentStation();
  if (!button || !station) return;
  const favorites = new Set(JSON.parse(localStorage.getItem("n2k-media-favorites") || "[]"));
  button.textContent = favorites.has(station.id) ? "♥" : "♡";
}

async function playMediaStation(index) {
  const station = mediaStations[index];
  if (!station) return;
  const audio = ensureMediaAudio();
  mediaStationIndex = index;
  if (audio.src !== station.url) {
    audio.src = station.url;
    audio.load();
  }
  document.getElementById("media-title").textContent = station.name;
  document.getElementById("media-subtitle").textContent = `${station.genre} · ${station.bitrate} · ${station.country}`;
  updateMediaFavoriteButton();
  renderMediaStations();
  try {
    await audio.play();
  } catch (error) {
    console.error(error);
    setMediaStatus("Wiedergabe wurde vom Browser blockiert oder der Stream ist nicht erreichbar.");
  }
  updateMediaPlaybackUi();
}

function stepMediaStation(direction) {
  const candidates = mediaStations
    .map((station,index) => ({station,index}))
    .filter(({station}) => !station.country || station.country === mediaCountry);
  if (!candidates.length) return;
  const pos = candidates.findIndex(item => item.index === mediaStationIndex);
  const next = pos < 0 ? 0 : (pos + direction + candidates.length) % candidates.length;
  playMediaStation(candidates[next].index);
}

async function loadMediaRadioDirectory() {
  const requestId = ++mediaRadioRequest;
  const status = document.getElementById("media-radio-status");
  const search = (document.getElementById("media-radio-search")?.value || "").trim();
  if (status) status.textContent = `Lade ${mediaCountry}-Sender …`;
  try {
    const params = new URLSearchParams({country: mediaCountry, search, limit: "80"});
    const data = await request(`/api/media/radio?${params.toString()}`, {headers: {}});
    if (requestId !== mediaRadioRequest) return;
    const stations = Array.isArray(data.stations) ? data.stations : [];
    if (stations.length) {
      mediaStations = stations;
      mediaStationIndex = -1;
      if (status) status.textContent = `${stations.length} Sender · Radio Browser Verzeichnis`;
    } else {
      mediaStations = N2K_RADIO_STATIONS.filter(station => station.country === mediaCountry);
      if (status) status.textContent = "Keine Online-Treffer · lokale Startsender";
    }
  } catch (error) {
    if (requestId !== mediaRadioRequest) return;
    console.warn("Radio directory unavailable", error);
    mediaStations = N2K_RADIO_STATIONS.filter(station => station.country === mediaCountry);
    if (status) status.textContent = "Senderverzeichnis offline · lokale Startsender";
  }
  renderMediaStations();
}

async function setHostAudioOutput(nodeId) {
  try {
    await request("/api/media/output", {
      method: "POST",
      body: JSON.stringify({node_id: String(nodeId)}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await refreshMediaDevices();
  } catch (error) {
    console.error(error);
    alert("Audio-Ausgang konnte nicht umgeschaltet werden.");
  }
}

async function setBluetoothConnection(mac, connect) {
  try {
    await request("/api/media/bluetooth", {
      method: "POST",
      body: JSON.stringify({mac, action: connect ? "connect" : "disconnect"}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await refreshMediaDevices();
  } catch (error) {
    console.error(error);
    alert(connect ? "Bluetooth-Gerät konnte nicht verbunden werden." : "Bluetooth-Gerät konnte nicht getrennt werden.");
  }
}

async function setAirPlayDiscovery(enabled) {
  const button = document.getElementById("media-airplay-toggle");
  if (button) button.disabled = true;
  try {
    await request("/api/media/airplay", {
      method: "POST",
      body: JSON.stringify({action: enabled ? "enable" : "disable"}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    await refreshMediaDevices();
  } catch (error) {
    console.error(error);
    alert(enabled ? "AirPlay-Suche konnte nicht aktiviert werden." : "AirPlay-Suche konnte nicht deaktiviert werden.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function applyMediaMultiroom(clear = false) {
  try {
    const body = clear
      ? {action: "clear"}
      : {action: "set", sinks: Array.from(mediaMultiroomSelection)};
    if (!clear && body.sinks.length < 2) {
      alert("Bitte mindestens zwei Ausgänge für Multiroom auswählen.");
      return;
    }
    await request("/api/media/multiroom", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"X-CSRF-Token": csrfToken}
    });
    if (clear) mediaMultiroomSelection.clear();
    await refreshMediaDevices();
  } catch (error) {
    console.error(error);
    alert(clear ? "Multiroom-Gruppe konnte nicht gelöst werden." : "Multiroom-Gruppe konnte nicht gestartet werden.");
  }
}

function renderMediaRooms(routing = {}) {
  const grid = document.getElementById("media-room-grid");
  if (!grid) return;
  const pulseSinks = Array.isArray(routing.multiroom?.pulse_sinks) ? routing.multiroom.pulse_sinks : [];
  const state = routing.multiroom?.state || {};
  const activeMembers = new Set(Array.isArray(state.members) ? state.members : []);

  if (state.active && activeMembers.size) {
    mediaMultiroomSelection = new Set(activeMembers);
  }

  grid.innerHTML = "";
  const candidates = pulseSinks.filter(sink => sink.pulse_name && sink.pulse_name !== "n2k_multiroom");
  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "media-room-empty";
    empty.innerHTML = "<strong>Noch keine gruppierbaren Ausgänge aktiv</strong><small>PipeWire/Pulse-Ausgänge erscheinen hier automatisch.</small>";
    grid.appendChild(empty);
    return;
  }

  candidates.forEach(sink => {
    const button = document.createElement("button");
    const selected = mediaMultiroomSelection.has(sink.pulse_name);
    button.className = selected ? "selected-room" : "";
    button.innerHTML = "<span></span><strong></strong><small></small>";
    button.querySelector("span").textContent =
      sink.kind === "airplay" ? "◉" :
      sink.kind === "dlna" ? "⌂" :
      sink.kind === "bluetooth" ? "BT" :
      sink.kind === "hdmi" ? "▣" :
      sink.kind === "usb" ? "USB" : "♪";
    button.querySelector("strong").textContent = sink.name || sink.pulse_name;
    button.querySelector("small").textContent =
      selected ? "für Multiroom ausgewählt" : (sink.default ? "aktueller Standardausgang" : "antippen zum Auswählen");
    button.addEventListener("click", () => {
      if (mediaMultiroomSelection.has(sink.pulse_name)) mediaMultiroomSelection.delete(sink.pulse_name);
      else mediaMultiroomSelection.add(sink.pulse_name);
      renderMediaRooms(routing);
    });
    grid.appendChild(button);
  });

  const apply = document.getElementById("media-multiroom-apply");
  const clear = document.getElementById("media-multiroom-clear");
  if (apply) {
    apply.disabled = mediaMultiroomSelection.size < 2;
    apply.textContent = state.active ? "Gruppe aktualisieren" : "Gruppe starten";
  }
  if (clear) clear.disabled = !state.active;
}

async function refreshMediaDevices() {
  const list = document.getElementById("media-device-list");
  if (!list) return;
  list.innerHTML = "";
  const audio = ensureMediaAudio();
  const addRow = (icon,name,detail,status,action,extraClass = "") => {
    const row = document.createElement("div");
    row.className = `media-device-row ${extraClass}`.trim();
    row.innerHTML = '<span></span><div><strong></strong><small></small></div><em></em>';
    row.querySelector("span").textContent = icon;
    row.querySelector("strong").textContent = name;
    row.querySelector("small").textContent = detail;
    row.querySelector("em").textContent = status;
    if (action) {
      row.classList.add("clickable");
      row.addEventListener("click", action);
    }
    list.appendChild(row);
  };
  const setProtocol = (name, state, title = "") => {
    const badge = document.querySelector(`[data-media-protocol="${name}"]`);
    if (!badge) return;
    badge.classList.toggle("available", Boolean(state));
    badge.classList.toggle("planned", state === null);
    if (title) badge.title = title;
  };

  addRow("◉","System Audio","Browser-Standardausgang","Browser");

  try {
    const host = await request("/api/media/devices", {headers:{}});
    const hostDevices = Array.isArray(host.devices) ? host.devices : [];
    const routing = host.routing || {};
    const pipewire = routing.pipewire || {};
    const bluetooth = routing.bluetooth || {};
    renderMediaRooms(routing);

    hostDevices.forEach(device => {
      const icons = {hdmi:"▣",usb:"USB",bluetooth:"BT",local:"◉",audio:"♪"};
      addRow(
        icons[device.kind] || "♪",
        device.name || "Audio-Gerät",
        `${device.backend || "Host"} · ${device.detail || "bereit"}`,
        device.available === false ? "offline" : "erkannt"
      );
    });

    const sinks = Array.isArray(pipewire.sinks) ? pipewire.sinks : [];
    sinks.forEach(sink => {
      addRow(
        sink.default ? "●" : "○",
        sink.name || `PipeWire ${sink.id}`,
        `PipeWire · Node ${sink.id}`,
        sink.default ? "Standard" : "wählen",
        sink.default ? null : () => setHostAudioOutput(sink.id),
        sink.default ? "active-route" : ""
      );
    });

    const btDevices = Array.isArray(bluetooth.devices) ? bluetooth.devices : [];
    btDevices.forEach(device => {
      addRow(
        "BT",
        device.name || device.mac,
        `${device.paired ? "gekoppelt" : "bekannt"} · ${device.mac}`,
        device.connected ? "trennen" : "verbinden",
        () => setBluetoothConnection(device.mac, !device.connected),
        device.connected ? "active-route" : ""
      );
    });

    const hasHdmi = hostDevices.some(device => device.kind === "hdmi") || sinks.some(sink => /hdmi/i.test(sink.name || ""));
    const hasUsb = hostDevices.some(device => device.kind === "usb") || sinks.some(sink => /(usb|dac|fiio|scarlett|focusrite)/i.test(sink.name || ""));
    setProtocol("hdmi", hasHdmi, hasHdmi ? "HDMI-Audio am Host erkannt" : "Kein HDMI-Audio erkannt");
    setProtocol("usb", hasUsb, hasUsb ? "USB-Audio am Host erkannt" : "Kein USB-DAC erkannt");
    setProtocol("bluetooth", Boolean(bluetooth.available || host.bluetooth?.available), bluetooth.available ? "Bluetooth-Steuerung aktiv" : (host.bluetooth?.note || "Bluetooth"));
    setProtocol("airplay", routing.airplay?.available ? true : null, routing.airplay?.note || host.airplay?.note || "AirPlay vorbereitet");
    const airplayToggle = document.getElementById("media-airplay-toggle");
    const airplayStatus = document.getElementById("media-airplay-status");
    const airplayDiscovery = Boolean(routing.airplay?.discovery_active);
    if (airplayToggle) {
      airplayToggle.textContent = airplayDiscovery ? "AirPlay-Suche stoppen" : "AirPlay-Suche aktivieren";
      airplayToggle.dataset.enabled = airplayDiscovery ? "1" : "0";
    }
    if (airplayStatus) {
      const count = Array.isArray(routing.airplay?.sinks) ? routing.airplay.sinks.length : 0;
      airplayStatus.textContent = airplayDiscovery
        ? `RAOP-Suche aktiv · ${count} AirPlay-Ausgang${count === 1 ? "" : "e"}`
        : "RAOP-Suche ist aus";
    }
    setProtocol("dlna", routing.dlna?.available ? true : null, routing.dlna?.note || host.dlna?.note || "DLNA vorbereitet");

    if (!routing.available) {
      addRow("•","PipeWire Routing","Host-Agent noch nicht aktualisiert oder keine Desktop-Audiositzung aktiv","wartet");
    } else if (pipewire.error) {
      addRow("•","PipeWire Routing",pipewire.error,"prüfen");
    } else if (!sinks.length) {
      addRow("•","PipeWire Routing","Keine aktiven Audio-Sinks gefunden","leer");
    }
  } catch (error) {
    console.warn("Host audio inventory unavailable", error);
    addRow("•","Host-Audiogeräte","Inventar momentan nicht erreichbar","–");
    setProtocol("airplay", null, "AirPlay-Systemdienst folgt");
    setProtocol("dlna", null, "DLNA-Systemdienst folgt");
  }

  if (!navigator.mediaDevices?.enumerateDevices) {
    addRow("•","Browser-Ausgänge","Geräteauswahl wird von diesem Browser nicht unterstützt","–");
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(device => device.kind === "audiooutput");
    outputs.forEach((device,index) => {
      const label = device.label || `Browser-Ausgang ${index + 1}`;
      const canRoute = typeof audio.setSinkId === "function";
      addRow("◌",label,canRoute ? "Direkt aus N2K auswählbar" : "Vom System verwaltet",canRoute ? "wählen" : "bereit",
        canRoute ? async event => {
          try {
            await audio.setSinkId(device.deviceId);
            Array.from(list.querySelectorAll("em")).forEach(node => {
              if (node.textContent === "Browser aktiv") node.textContent = "bereit";
            });
            const badge = event.currentTarget.querySelector("em");
            if (badge) badge.textContent = "Browser aktiv";
          } catch (error) {
            console.error(error);
          }
        } : null);
    });
    if (!outputs.length) addRow("•","Keine zusätzlichen Browser-Ausgänge","Host-Audio bleibt verfügbar","–");
  } catch (error) {
    console.error(error);
    addRow("•","Browser-Geräte konnten nicht gelesen werden","Berechtigungen prüfen","–");
  }
}

function applyEqPreset(name) {
  const values = N2K_EQ_PRESETS[name] || N2K_EQ_PRESETS.flat;
  document.querySelectorAll("#media-equalizer input[data-eq]").forEach((input,index) => {
    input.value = values[index] ?? 0;
  });
  document.querySelectorAll(".media-eq-presets button").forEach(button => button.classList.toggle("active", button.dataset.eqPreset === name));
  applyMediaEq();
}

function ensureMediaEqGraph() {
  const audio = ensureMediaAudio();
  if (mediaAudioContext || !(window.AudioContext || window.webkitAudioContext)) return;
  try {
    mediaAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaSourceNode = mediaAudioContext.createMediaElementSource(audio);
    const freqs = [32,64,125,250,500,1000,2000,4000,8000,16000];
    mediaEqFilters = freqs.map(freq => {
      const filter = mediaAudioContext.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1.1;
      filter.gain.value = 0;
      return filter;
    });
    let previous = mediaSourceNode;
    for (const filter of mediaEqFilters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(mediaAudioContext.destination);
  } catch (error) {
    console.warn("N2K DSP unavailable", error);
    mediaAudioContext = null;
    mediaEqFilters = [];
    mediaSourceNode = null;
  }
}

function applyMediaEq() {
  ensureMediaEqGraph();
  const inputs = Array.from(document.querySelectorAll("#media-equalizer input[data-eq]"));
  inputs.forEach((input,index) => {
    if (mediaEqFilters[index]) mediaEqFilters[index].gain.value = Number(input.value) || 0;
  });
  const mode = document.getElementById("media-eq-mode");
  if (mode) mode.textContent = mediaEqFilters.length ? "DSP aktiv" : "EQ Oberfläche · System-DSP folgt";
}

function initMediaCenter() {
  if (mediaInitialized) return;
  mediaInitialized = true;
  ensureMediaAudio();
  setupMediaSessionControls();
  renderMediaStations();
  loadMediaRadioDirectory();
  refreshMediaDevices();
  updateMediaPlaybackUi();

  document.querySelectorAll("#media-country-tabs button").forEach(button => button.addEventListener("click", () => {
    mediaCountry = button.dataset.country || "DE";
    document.querySelectorAll("#media-country-tabs button").forEach(item => item.classList.toggle("active", item === button));
    loadMediaRadioDirectory();
  }));
  document.getElementById("media-radio-search")?.addEventListener("input", () => {
    clearTimeout(mediaRadioSearchTimer);
    mediaRadioSearchTimer = setTimeout(loadMediaRadioDirectory, 260);
  });
  document.getElementById("media-play")?.addEventListener("click", async () => {
    const audio = ensureMediaAudio();
    if (!audio.src) {
      const first = filteredMediaStations()[0];
      if (first) await playMediaStation(first.index);
      return;
    }
    if (audio.paused) {
      try { await audio.play(); } catch (error) { console.error(error); }
    } else {
      audio.pause();
    }
    updateMediaPlaybackUi();
  });
  document.getElementById("media-prev")?.addEventListener("click", () => stepMediaStation(-1));
  document.getElementById("media-next")?.addEventListener("click", () => stepMediaStation(1));
  document.getElementById("media-favorite")?.addEventListener("click", () => {
    const station = mediaCurrentStation();
    if (station) {
      toggleMediaFavorite(station.id);
      renderMediaStations();
    }
  });
  document.getElementById("media-volume")?.addEventListener("input", event => {
    const value = Number(event.target.value) || 0;
    ensureMediaAudio().volume = value / 100;
    const copy = document.getElementById("media-volume-value");
    if (copy) copy.textContent = `${value}%`;
  });
  document.getElementById("media-refresh-devices")?.addEventListener("click", refreshMediaDevices);
  document.querySelectorAll("[data-media-service]").forEach(button => button.addEventListener("click", () => {
    const url = button.dataset.mediaService;
    const name = button.querySelector("strong")?.textContent || "Streaming";
    localStorage.setItem("n2k-media-last-service", JSON.stringify({name, url}));
    window.open(url, "n2k-media-streaming", "noopener,noreferrer");
    const topTitle = document.getElementById("top-media-title");
    if (topTitle && ensureMediaAudio().paused) topTitle.textContent = name;
  }));
  document.querySelectorAll(".media-eq-presets button").forEach(button => button.addEventListener("click", () => applyEqPreset(button.dataset.eqPreset)));
  document.getElementById("media-eq-reset")?.addEventListener("click", () => applyEqPreset("flat"));
  document.querySelectorAll("#media-equalizer input[data-eq]").forEach(input => input.addEventListener("input", applyMediaEq));
}

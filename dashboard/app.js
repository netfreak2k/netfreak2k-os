let csrfToken = "";

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
    const data = await request("/api/status", {headers: {}});
    const host = data.host || {};
    const memory = host.memory || {};
    const load = host.load || {};

    document.getElementById("host-name").textContent = host.hostname || "–";
    document.getElementById("host-os").textContent = host.os?.name || "Linux";
    document.getElementById("host-os-mini").textContent = host.os?.name || "Linux";
    document.getElementById("host-uptime").textContent = formatUptime(host.uptime_seconds);
    document.getElementById("host-memory-percent").textContent =
      memory.used_percent == null ? "–" : `${memory.used_percent}%`;
    document.getElementById("host-memory").textContent =
      memory.used_percent == null
        ? "–"
        : `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}`;
    document.getElementById("host-load-primary").textContent =
      load["1m"] == null ? "–" : String(load["1m"]);
    document.getElementById("host-load").textContent =
      load["1m"] == null ? "–" : `${load["1m"]} · ${load["5m"]} · ${load["15m"]}`;

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
      const sha = data.remote_sha ? data.remote_sha.slice(0, 12) : "GitHub";
      detail.textContent = `Neuer Stand ${sha} erkannt. Installation erfolgt bewusst per Update-Befehl.`;
    } else if (data.note === "github_api_unavailable") {
      title.textContent = "GitHub-Prüfung momentan nicht möglich";
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

document.getElementById("refresh-status")?.addEventListener("click", loadStatus);
document.getElementById("refresh-apps")?.addEventListener("click", loadApps);
document.getElementById("refresh-catalog")?.addEventListener("click", loadCatalog);
document.getElementById("refresh-updates")?.addEventListener("click", loadUpdates);
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
      "Netfreak2k lädt den aktuellen GitHub-Stand. Die Oberfläche kann kurz nicht erreichbar sein.";
    setTimeout(() => window.location.reload(), 15000);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = original;
    alert("Update konnte nicht gestartet werden.");
  }
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

setInterval(loadStatus, 30000);
setInterval(loadApps, 30000);
setInterval(loadHomeAssistant, 15000);
setInterval(loadUpdates, 60000);
setInterval(loadCatalog, 60000);
setInterval(loadStorage, 30000);

let csrfToken = "";
let currentRole = "viewer";
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
    enterApp(session.username, session.role || "viewer");
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


let notificationItems = [];
let notificationLoadedOnce = false;
const N2K_NOTIFICATION_DESKTOP_KEY = "n2k-desktop-notifications";
const N2K_NOTIFICATION_SEEN_KEY = "n2k-notification-seen";

function desktopNotificationsEnabled() {
  return localStorage.getItem(N2K_NOTIFICATION_DESKTOP_KEY) === "1";
}

function notificationSeenIds() {
  try {
    const value = JSON.parse(localStorage.getItem(N2K_NOTIFICATION_SEEN_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []);
  } catch (_) {
    return new Set();
  }
}

function persistNotificationSeen(ids) {
  localStorage.setItem(N2K_NOTIFICATION_SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
}

function renderNotifications(payload = {}) {
  notificationItems = Array.isArray(payload.notifications) ? payload.notifications : [];
  const unread = Number(payload.unread) || 0;
  const critical = Number(payload.critical) || 0;
  const badge = document.getElementById("notification-badge");
  const button = document.getElementById("notification-toggle");
  const list = document.getElementById("notification-list");
  const summary = document.getElementById("notification-summary");

  if (badge) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.toggle("hidden", unread <= 0);
    badge.classList.toggle("critical", critical > 0);
  }
  if (button) {
    button.classList.toggle("has-alerts", unread > 0);
    button.classList.toggle("critical", critical > 0);
    button.title = unread ? String(unread) + " ungelesene Benachrichtigungen" : "Benachrichtigungen";
  }
  if (summary) {
    summary.textContent = critical
      ? String(critical) + " kritisch · " + String(unread) + " ungelesen"
      : unread ? String(unread) + " ungelesene Hinweise" : "Alles gelesen";
  }

  if (list) {
    list.innerHTML = "";
    if (!notificationItems.length) {
      list.innerHTML = '<div class="notification-empty">Keine Systemmeldungen vorhanden.</div>';
    } else {
      notificationItems.forEach(item => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "notification-row " + (item.level || "info") + (item.read ? " read" : "") + (item.active ? "" : " resolved");
        row.innerHTML = '<span class="notification-row-icon"></span><div><strong></strong><small></small><em></em></div><i></i>';
        row.querySelector(".notification-row-icon").textContent =
          item.level === "critical" ? "!" : item.level === "warning" ? "•" : "i";
        row.querySelector("strong").textContent = item.title || "Systemhinweis";
        row.querySelector("small").textContent = item.detail || "";
        const meta = [];
        if (!item.active) meta.push("Erledigt");
        meta.push(item.source === "network" ? "Netzwerk" : item.source === "update" ? "Update" : "System");
        if (item.last_seen) meta.push(formatDateTime(item.last_seen));
        row.querySelector("em").textContent = meta.join(" · ");
        row.querySelector("i").textContent = item.read ? "✓" : "●";
        row.addEventListener("click", async () => {
          if (!item.read) await markNotificationRead(item.id);
          if (item.target) {
            closeNotificationPanel();
            switchView(item.target);
          }
        });
        list.appendChild(row);
      });
    }
  }
}

function maybeShowDesktopNotifications(payload) {
  if (!desktopNotificationsEnabled() || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const seen = notificationSeenIds();
  let changed = false;
  const activeUnread = (payload.notifications || []).filter(item => item.active && !item.read);
  for (const item of activeUnread) {
    const id = Number(item.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    const notice = new Notification(item.title || "Netfreak2k", {
      body: item.detail || "Neuer Systemhinweis",
      tag: "n2k-" + (item.event_key || id),
      renotify: item.level === "critical"
    });
    notice.onclick = () => {
      window.focus();
      if (item.target) switchView(item.target);
      markNotificationRead(id);
    };
    seen.add(id);
    changed = true;
  }
  if (changed) persistNotificationSeen(seen);
}

async function loadNotifications() {
  if (document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const payload = await request("/api/notifications", {headers:{}});
    renderNotifications(payload);
    if (notificationLoadedOnce) maybeShowDesktopNotifications(payload);
    notificationLoadedOnce = true;
  } catch (error) {
    console.error(error);
    const summary = document.getElementById("notification-summary");
    if (summary) summary.textContent = "Hinweise nicht erreichbar";
  }
}

async function markNotificationRead(id) {
  try {
    await request("/api/notifications/read", {
      method:"POST",
      body:JSON.stringify({id:id}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    await loadNotifications();
  } catch (error) {
    console.error(error);
  }
}

async function markAllNotificationsRead() {
  try {
    await request("/api/notifications/read", {
      method:"POST",
      body:JSON.stringify({all:true}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    await loadNotifications();
  } catch (error) {
    console.error(error);
    showN2KToast("Benachrichtigungen konnten nicht aktualisiert werden.", "error");
  }
}

function closeNotificationPanel() {
  const panel = document.getElementById("notification-panel");
  const toggle = document.getElementById("notification-toggle");
  panel?.classList.add("hidden");
  toggle?.setAttribute("aria-expanded", "false");
}

function toggleNotificationPanel() {
  const panel = document.getElementById("notification-panel");
  const toggle = document.getElementById("notification-toggle");
  if (!panel || !toggle) return;
  const willOpen = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !willOpen);
  toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (willOpen) loadNotifications();
}

async function configureDesktopNotifications(enabled) {
  const control = document.getElementById("notification-desktop-toggle");
  if (!enabled) {
    localStorage.setItem(N2K_NOTIFICATION_DESKTOP_KEY, "0");
    if (control) control.checked = false;
    return;
  }
  if (typeof Notification === "undefined") {
    localStorage.setItem(N2K_NOTIFICATION_DESKTOP_KEY, "0");
    if (control) control.checked = false;
    showN2KToast("Dieser Browser unterstützt keine Desktop-Hinweise.", "error");
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  const allowed = permission === "granted";
  localStorage.setItem(N2K_NOTIFICATION_DESKTOP_KEY, allowed ? "1" : "0");
  if (control) control.checked = allowed;
  showN2KToast(allowed ? "Desktop-Hinweise aktiviert." : "Desktop-Hinweise wurden nicht freigegeben.", allowed ? "success" : "info");
}


function renderHostSecurity(data = {}) {
  const firewall = data.firewall || {};
  const ssh = data.ssh || {};
  const failed = data.failed_logins || {};
  const summary = data.summary || {};

  const badge = document.getElementById("security-hardening-score");
  if (badge) {
    const score = Number(data.score);
    badge.textContent = Number.isFinite(score) ? `${score}/100` : "–";
    badge.className = "security-badge " + (score >= 85 ? "ok" : score >= 65 ? "warn" : "bad");
  }

  setHealthText("security-firewall-state",
    firewall.active ? `${(firewall.engine || "Firewall").toUpperCase()} AKTIV` :
    firewall.engine && firewall.engine !== "none" ? `${firewall.engine.toUpperCase()} NICHT RESTRIKTIV` : "NICHT ERKANNT");
  setHealthText("security-firewall-detail", firewall.detail || "–");
  setHealthText("security-ssh-state", ssh.ok ? "AKTIV" : "NICHT AKTIV");
  setHealthText("security-ssh-unit", ssh.unit || ssh.state || "–");
  setHealthText("security-failed-logins", String(failed.count_24h ?? 0));
  setHealthText("security-failed-login-meta",
    Array.isArray(failed.sources) && failed.sources.length
      ? `${failed.sources.length} Quelladressen erkannt`
      : failed.available === false ? "Journal nicht verfügbar" : "keine auffälligen Quellen");
  setHealthText("security-listener-count", String(summary.listeners ?? 0));
  setHealthText("security-exposed-count", `${summary.distinct_exposed_ports ?? 0} Ports auf allen Interfaces`);

  const listeners = document.getElementById("security-listener-list");
  if (listeners) {
    listeners.innerHTML = "";
    const rows = Array.isArray(data.listeners) ? data.listeners : [];
    rows.slice(0, 40).forEach(item => {
      const row = document.createElement("div");
      row.className = "security-listener-row";
      row.innerHTML = "<span class='security-port-scope'></span><div><strong></strong><small></small></div><em></em>";
      const scope = row.querySelector(".security-port-scope");
      scope.textContent = item.scope === "all_interfaces" ? "WAN/LAN" : item.scope === "loopback" ? "LOCAL" : "IFACE";
      scope.classList.add(item.scope === "all_interfaces" ? "exposed" : item.scope === "loopback" ? "local" : "iface");
      row.querySelector("strong").textContent = `${String(item.protocol || "").toUpperCase()} ${item.address || "*"}:${item.port || "–"}`;
      row.querySelector("small").textContent = item.process
        ? `${item.process}${item.pid ? " · PID " + item.pid : ""}`
        : "Prozess nicht auflösbar";
      row.querySelector("em").textContent =
        item.scope === "all_interfaces" ? "alle Interfaces" :
        item.scope === "loopback" ? "nur localhost" : "Interface-Bindung";
      listeners.appendChild(row);
    });
    if (!rows.length) listeners.innerHTML = '<div class="app-empty">Keine Listening-Sockets erkannt.</div>';
  }

  const findings = document.getElementById("security-finding-list");
  if (findings) {
    findings.innerHTML = "";
    const rows = Array.isArray(data.findings) ? data.findings : [];
    rows.forEach(item => {
      const row = document.createElement("div");
      row.className = `security-finding-row ${item.level || "info"}`;
      row.innerHTML = "<span></span><div><strong></strong><small></small></div>";
      row.querySelector("span").textContent = item.level === "warning" ? "!" : "i";
      row.querySelector("strong").textContent = item.title || "Hinweis";
      row.querySelector("small").textContent = item.detail || "–";
      findings.appendChild(row);
    });
    if (!rows.length) findings.innerHTML = '<div class="app-empty">Keine auffälligen Host-Findings erkannt.</div>';
  }
}

async function loadHostSecurity() {
  if (!document.getElementById("security-host-hardening")) return;
  try {
    const data = await request("/api/security/host", {headers:{}});
    renderHostSecurity(data);
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("security-hardening-score");
    if (badge) {
      badge.textContent = "FEHLER";
      badge.className = "security-badge bad";
    }
  }
}

async function loadSecurity() {
  const panel = document.getElementById("security-panel");
  if (!panel || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/security", {headers:{}});
    const me = data.me || {};
    currentRole = me.role || currentRole || "viewer";
    document.getElementById("security-me").textContent = me.username || "–";
    document.getElementById("security-me-role").textContent =
      currentRole === "admin" ? "Administrator" : currentRole === "operator" ? "Operator" : "Viewer · Nur Lesen";
    const roleBadge = document.getElementById("security-role-badge");
    if (roleBadge) roleBadge.textContent = currentRole.toUpperCase();

    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    document.getElementById("security-session-count").textContent = String(sessions.length);
    const sessionList = document.getElementById("security-session-list");
    if (sessionList) {
      sessionList.innerHTML = "";
      sessions.forEach(item => {
        const row = document.createElement("div");
        row.className = "security-list-row";
        row.innerHTML = '<span class="security-device-icon">◫</span><div><strong></strong><small></small></div><button class="secondary compact">Abmelden</button>';
        row.querySelector("strong").textContent = item.username + " · " + (item.remote_addr || "lokal");
        row.querySelector("small").textContent =
          (item.user_agent ? item.user_agent.split(" ").slice(0,4).join(" ") : "Browser") + " · seit " + formatDateTime(item.created_at);
        row.querySelector("button").addEventListener("click", () => revokeSecuritySession(item.id));
        sessionList.appendChild(row);
      });
      if (!sessions.length) sessionList.innerHTML = '<div class="app-empty">Keine aktiven Sitzungen gefunden.</div>';
    }

    const adminOnly = currentRole === "admin";
    document.getElementById("security-users-card")?.classList.toggle("hidden", !adminOnly);
    document.getElementById("security-audit-card")?.classList.toggle("hidden", !adminOnly);
    const users = Array.isArray(data.users) ? data.users : [];
    document.getElementById("security-user-count").textContent = adminOnly ? String(users.length) : "–";
    const userList = document.getElementById("security-user-list");
    if (adminOnly && userList) {
      userList.innerHTML = "";
      users.forEach(user => {
        const row = document.createElement("div");
        row.className = "security-list-row security-user-row";
        row.innerHTML = '<span class="security-user-avatar"></span><div><strong></strong><small></small></div><select class="security-role-select"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select><label class="security-enable"><input type="checkbox"> Aktiv</label>';
        row.querySelector(".security-user-avatar").textContent = (user.username || "?").slice(0,1).toUpperCase();
        row.querySelector("strong").textContent = user.username;
        row.querySelector("small").textContent =
          user.last_login_at ? "Login " + formatDateTime(user.last_login_at) : "noch kein Login";
        const roleSelect = row.querySelector(".security-role-select");
        roleSelect.value = user.role || "viewer";
        const enabled = row.querySelector(".security-enable input");
        enabled.checked = Boolean(user.enabled);
        const update = () => updateSecurityUser(user.username, roleSelect.value, enabled.checked);
        roleSelect.addEventListener("change", update);
        enabled.addEventListener("change", update);
        userList.appendChild(row);
      });
    }

    const audit = Array.isArray(data.audit) ? data.audit : [];
    const auditList = document.getElementById("security-audit-list");
    if (adminOnly && auditList) {
      auditList.innerHTML = "";
      audit.forEach(item => {
        const row = document.createElement("div");
        row.className = "security-audit-row";
        row.innerHTML = "<span></span><div><strong></strong><small></small></div><em></em>";
        row.querySelector("span").textContent = "◆";
        row.querySelector("strong").textContent = item.action + " · " + item.username;
        row.querySelector("small").textContent = item.detail || item.remote_addr || "Sicherheitsereignis";
        row.querySelector("em").textContent = formatDateTime(item.created_at);
        auditList.appendChild(row);
      });
      if (!audit.length) auditList.innerHTML = '<div class="app-empty">Noch keine Audit-Ereignisse.</div>';
    }
    await loadHostSecurity();
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("security-role-badge");
    if (badge) badge.textContent = "FEHLER";
  }
}

async function createSecurityUser() {
  const username = document.getElementById("security-new-username")?.value.trim() || "";
  const password = document.getElementById("security-new-password")?.value || "";
  const role = document.getElementById("security-new-role")?.value || "viewer";
  try {
    await request("/api/security/users/create", {method:"POST", body:JSON.stringify({username,password,role}), headers:{"X-CSRF-Token":csrfToken}});
    document.getElementById("security-user-create").classList.add("hidden");
    showN2KToast("Benutzerkonto erstellt.", "success");
    await loadSecurity();
  } catch (error) { console.error(error); showN2KToast("Benutzer konnte nicht erstellt werden.", "error"); }
}

async function updateSecurityUser(username, role, enabled) {
  try {
    await request("/api/security/users/update", {method:"POST", body:JSON.stringify({username,role,enabled}), headers:{"X-CSRF-Token":csrfToken}});
    showN2KToast("Benutzerrechte aktualisiert.", "success");
    await loadSecurity();
  } catch (error) {
    console.error(error);
    showN2KToast(error.code === "last_admin" ? "Der letzte aktive Admin kann nicht herabgestuft werden." : "Benutzer konnte nicht geändert werden.", "error");
    await loadSecurity();
  }
}

async function revokeSecuritySession(id) {
  try {
    await request("/api/security/session/revoke", {method:"POST", body:JSON.stringify({id}), headers:{"X-CSRF-Token":csrfToken}});
    showN2KToast("Sitzung beendet.", "success");
    await loadSecurity();
  } catch (error) { console.error(error); showN2KToast("Sitzung konnte nicht beendet werden.", "error"); }
}


function renderRemoteConnectivity(data = {}) {
  setHealthText("remote-public-ip", data.public_ip || "Nicht erkannt");
  setHealthText("remote-public-ip-note", data.public_ip ? "Öffentliche IPv4 vom Host aus erkannt" : "WAN-IP konnte nicht ermittelt werden");

  setHealthText("remote-dns-match", data.domain
    ? (data.dns_matches_public_ip ? "PASST" : "ABWEICHUNG")
    : "NICHT AKTIV");
  setHealthText("remote-dns-values",
    data.domain
      ? `DNS: ${(data.dns_addresses || []).join(", ") || "–"} · WAN: ${data.public_ip || "–"}`
      : "Kein Domain-Modus konfiguriert");

  const listeners = data.listeners || {};
  setHealthText("remote-port-state", listeners.http && listeners.https ? "80 + 443 AKTIV" :
    listeners.https ? "443 AKTIV" : "PRÜFEN");
  setHealthText("remote-port-detail",
    `HTTP ${listeners.http ? "✓" : "–"} · HTTPS ${listeners.https ? "✓" : "–"}`);

  const probe = data.self_probe || {};
  setHealthText("remote-selftest-state",
    probe.attempted ? (probe.ok ? "ERREICHBAR" : "FEHLER") : "NICHT AKTIV");
  setHealthText("remote-selftest-detail", probe.detail || "–");

  const list = document.getElementById("remote-connectivity-checks");
  if (list) {
    list.innerHTML = "";
    const checks = Array.isArray(data.checks) ? data.checks : [];
    checks.forEach(check => {
      const row = document.createElement("div");
      row.className = "remote-connectivity-row";
      row.innerHTML = "<span></span><div><strong></strong><small></small></div><em></em>";
      row.querySelector("span").className = "remote-connectivity-dot " + (check.ok ? "ok" : "bad");
      row.querySelector("strong").textContent = check.label || check.id || "Prüfung";
      row.querySelector("small").textContent = check.detail || "–";
      row.querySelector("em").textContent = check.ok ? "OK" : "PRÜFEN";
      list.appendChild(row);
    });
    if (!checks.length) list.innerHTML = '<div class="app-empty">Keine Connectivity-Prüfungen verfügbar.</div>';
  }

  const outside = document.getElementById("remote-outside-note");
  if (outside) {
    outside.textContent = data.outside_in_verified
      ? "Outside-In-Prüfung bestätigt externe Erreichbarkeit."
      : (data.outside_in_note || "Echter externer Zugriff wurde nicht aus einem fremden Netz geprüft.");
    outside.classList.toggle("verified", Boolean(data.outside_in_verified));
  }

  const badge = document.getElementById("remote-access-badge");
  if (badge && data.mode === "domain") {
    badge.textContent = data.domain_ready ? "DOMAIN BEREIT" : data.local_ready ? "LOKAL BEREIT" : "PRÜFEN";
    badge.className = "security-badge " + (data.domain_ready ? "ok" : data.local_ready ? "warn" : "bad");
  }
}

async function loadRemoteConnectivity() {
  if (!document.getElementById("remote-connectivity-checks")) return;
  try {
    const data = await request("/api/remote-access/connectivity", {headers:{}});
    renderRemoteConnectivity(data);
  } catch (error) {
    console.error(error);
    const list = document.getElementById("remote-connectivity-checks");
    if (list) list.innerHTML = '<div class="app-empty">Connectivity-Diagnose nicht erreichbar.</div>';
  }
}

async function loadRemoteAccess() {
  const card = document.getElementById("remote-access-card");
  if (!card || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/remote-access", {headers:{}});
    const badge = document.getElementById("remote-access-badge");
    const cert = data.certificate || {};
    const nginxOk = Boolean(data.nginx?.ok);
    const remoteReady = Boolean(data.remote_ready);
    if (badge) {
      badge.textContent = remoteReady ? "REMOTE HTTPS" : nginxOk ? "LOKAL HTTPS" : "PRÜFEN";
      badge.className = "security-badge " + (remoteReady || nginxOk ? "ok" : "warn");
    }

    const primaryUrl = Array.isArray(data.urls) && data.urls.length ? data.urls[0] : null;
    const localEntry = Array.isArray(data.urls) ? data.urls.find(item => item.https && /\d+\.\d+\.\d+\.\d+/.test(item.https)) : null;
    const localUrl = localEntry?.https || primaryUrl?.https || "–";
    document.getElementById("remote-local-url").textContent = localUrl;
    document.getElementById("remote-local-note").textContent =
      cert.type === "local" ? "Lokales Zertifikat · Browser kann beim ersten Aufruf warnen" : "TLS über Nginx";

    document.getElementById("remote-cert-state").textContent =
      cert.valid ? (cert.type === "letsencrypt" ? "Let's Encrypt" : "Lokales TLS") : "Nicht verfügbar";
    document.getElementById("remote-cert-expiry").textContent =
      cert.expires_at ? "Gültig bis " + formatDateTime(cert.expires_at) : "Zertifikatsstatus wird lokal geprüft";

    document.getElementById("remote-mode-state").textContent = data.mode === "domain" ? "Domain aktiv" : "Nur lokal";
    document.getElementById("remote-domain-state").textContent =
      data.mode === "domain" && data.domain ? data.domain : "Kein öffentlicher Domain-Zugriff";

    document.querySelectorAll('input[name="remote-mode"]').forEach(input => {
      input.checked = input.value === (data.mode === "domain" ? "domain" : "local");
    });
    const domainInput = document.getElementById("remote-domain");
    const emailInput = document.getElementById("remote-email");
    if (domainInput) domainInput.value = data.domain || "";
    if (emailInput) emailInput.value = data.email || "";
    document.getElementById("remote-domain-config")?.classList.toggle("hidden", data.mode !== "domain");
    document.getElementById("remote-admin-config")?.classList.toggle("hidden", currentRole !== "admin");
    await loadRemoteConnectivity();
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("remote-access-badge");
    if (badge) {
      badge.textContent = "NICHT ERREICHBAR";
      badge.className = "security-badge warn";
    }
  }
}

async function saveRemoteAccess() {
  const mode = document.querySelector('input[name="remote-mode"]:checked')?.value || "local";
  const domain = document.getElementById("remote-domain")?.value.trim() || "";
  const email = document.getElementById("remote-email")?.value.trim() || "";
  const button = document.getElementById("remote-save");
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = mode === "domain" ? "Zertifikat wird eingerichtet …" : "Gateway wird konfiguriert …"; }
  try {
    await request("/api/remote-access/configure", {
      method:"POST",
      body:JSON.stringify({mode,domain,email}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast(mode === "domain" ? "Remote HTTPS wurde eingerichtet." : "Lokaler HTTPS-Zugriff ist aktiv.", "success");
    await loadRemoteAccess();
    await loadSecurity();
  } catch (error) {
    console.error(error);
    const message = error.code === "domain_requires_ports_80_443"
      ? "Für Domain-HTTPS müssen Port 80 und 443 verfügbar sein."
      : error.code === "certificate_issue_failed"
        ? "Let's Encrypt konnte kein Zertifikat ausstellen. DNS und Router-Portfreigaben prüfen."
        : "HTTPS-Konfiguration fehlgeschlagen. Domain, DNS und Ports prüfen.";
    showN2KToast(message, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function renewRemoteCertificate() {
  const button = document.getElementById("remote-renew");
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Prüfe …"; }
  try {
    await request("/api/remote-access/renew", {
      method:"POST", body:"{}", headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast("Zertifikat wurde geprüft und bei Bedarf erneuert.", "success");
    await loadRemoteAccess();
  } catch (error) {
    console.error(error);
    showN2KToast("Zertifikatsprüfung konnte nicht abgeschlossen werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function enterApp(username, role = "viewer") {
  currentRole = role || "viewer";
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
  loadStorage();
  loadVms();
  loadBackups();
  loadSystemHealth();
  loadHardwareMaintenance();
  loadSecurity();
  loadRemoteAccess();
  loadScheduler();
  loadEventCenter();
  loadRecoveryCenter();
  loadNotifications();
  loadNetworkInventory();
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
    enterApp(data.username, data.role || "admin");
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
    enterApp(data.username, data.role || "viewer");
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

let networkInventoryDevices = [];
let networkInventoryFilter = "all";
let networkInventorySelectedId = null;

const networkDeviceTypeLabels = {
  router:"Router", network:"Netzwerk", server:"Server", nas:"NAS", computer:"Computer",
  mobile:"Smartphone / Tablet", tv:"TV / Streaming", printer:"Drucker", iot:"Smart Home / IoT", unknown:"Unbekannt"
};

const networkDeviceTypeIcons = {
  router:"⌂", network:"⌁", server:"▣", nas:"▤", computer:"▰", mobile:"▯", tv:"▱", printer:"▧", iot:"◈", unknown:"?"
};

function formatNetworkSeen(epoch) {
  if (!Number.isFinite(Number(epoch))) return "–";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(epoch)));
  if (seconds < 20) return "gerade eben";
  if (seconds < 60) return `vor ${seconds} Sek.`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
  return formatDateTime(Number(epoch));
}

function networkDeviceSearchText(device) {
  const deepPorts = Array.isArray(device.deep_scan?.ports)
    ? device.deep_scan.ports.map(port => `${port.port} ${port.service} ${port.product || ""}`).join(" ")
    : "";
  return [
    device.name, device.custom_name, device.hostname, device.ip, device.mac, device.vendor,
    device.device_type, ...(device.services || []), deepPorts, device.notes
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderNetworkInventory(payload = {}) {
  networkInventoryDevices = Array.isArray(payload.devices) ? payload.devices : networkInventoryDevices;
  const summary = payload.summary || {};
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  setText("network-count-known", summary.known ?? networkInventoryDevices.length);
  setText("network-count-online", summary.online ?? networkInventoryDevices.filter(d => d.online).length);
  setText("network-count-new", summary.new ?? networkInventoryDevices.filter(d => d.online && d.new).length);
  setText("network-count-offline", summary.offline ?? networkInventoryDevices.filter(d => !d.online).length);
  setText("network-topology-gateway", payload.gateway || "–");
  setText("network-topology-subnet", payload.subnet || "–");
  setText("network-topology-devices", `${summary.online ?? networkInventoryDevices.filter(d => d.online).length} online`);
  const provider = document.getElementById("network-detail-provider")?.textContent;
  setText("network-topology-provider", provider && provider !== "–" ? provider : "Internet");
  setText("network-last-scan", Number.isFinite(Number(payload.last_scan)) ? `Letzter Scan: ${formatDateTime(Number(payload.last_scan))}` : "Noch kein Scan");
  const traffic = payload.traffic || {};
  setText("network-traffic-mode", traffic.per_device_available
    ? "Geräte-Traffic: Live-Messung aktiv"
    : "Geräte-Traffic: nicht direkt messbar · Host-Sicht");
  const trafficMode = document.getElementById("network-traffic-mode");
  if (trafficMode) trafficMode.title = traffic.per_device_available
    ? "Per-Device-Traffic wird direkt gemessen."
    : "Für echten Client-Traffic muss Netfreak2k als Gateway/Bridge im Datenpfad liegen.";
  const scanState = document.getElementById("network-scan-state");
  if (scanState) {
    scanState.textContent = Number.isFinite(Number(payload.last_scan))
      ? `${summary.online ?? 0} online · ${payload.subnet || "Heimnetz"}`
      : "Noch nicht gescannt";
    scanState.classList.toggle("good", Boolean(payload.last_scan));
  }
  renderNetworkDeviceList();
}

function renderNetworkDeviceList() {
  const body = document.getElementById("network-device-list");
  if (!body) return;
  const query = (document.getElementById("network-device-search")?.value || "").trim().toLowerCase();
  const type = document.getElementById("network-device-type-filter")?.value || "all";
  const items = networkInventoryDevices.filter(device => {
    if (networkInventoryFilter === "online" && !device.online) return false;
    if (networkInventoryFilter === "offline" && device.online) return false;
    if (networkInventoryFilter === "new" && !(device.online && device.new)) return false;
    if (type !== "all" && device.device_type !== type) return false;
    if (query && !networkDeviceSearchText(device).includes(query)) return false;
    return true;
  });

  body.innerHTML = "";
  for (const device of items) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "network-device-card";
    if (device.new && device.online) card.classList.add("new");
    if (!device.online) card.classList.add("offline");

    const typeLabel = networkDeviceTypeLabels[device.device_type] || "Unbekannt";
    const latency = Number.isFinite(Number(device.latency_ms)) ? `${device.latency_ms} ms` : "–";
    const services = Array.isArray(device.services) ? device.services.slice(0, 3) : [];
    const identity = device.name || device.hostname || device.ip || "Unbekannt";
    const secondary = [device.vendor, device.hostname && device.hostname !== identity ? device.hostname : ""].filter(Boolean).join(" · ") || "Gerät im Heimnetz";

    card.innerHTML = `
      <div class="network-card-top">
        <span class="network-card-icon"></span>
        <div class="network-card-title"><strong></strong><small></small></div>
        <span class="network-card-state"></span>
      </div>
      <div class="network-card-address">
        <span><small>IP</small><strong></strong></span>
        <span><small>MAC</small><strong></strong></span>
      </div>
      <div class="network-card-meta">
        <span class="network-card-type"></span>
        <span class="network-card-ping"></span>
        <span class="network-card-seen"></span>
      </div>
      <div class="network-card-services"></div>
      <div class="network-card-footer"><span></span><strong>Details ›</strong></div>`;

    card.querySelector(".network-card-icon").textContent = networkDeviceTypeIcons[device.device_type] || "?";
    card.querySelector(".network-card-title strong").textContent = identity;
    card.querySelector(".network-card-title small").textContent = secondary;

    const state = card.querySelector(".network-card-state");
    state.textContent = device.online ? (device.new ? "NEU" : "ONLINE") : "OFFLINE";
    state.classList.toggle("online", Boolean(device.online));
    state.classList.toggle("new", Boolean(device.new && device.online));

    const addressSpans = card.querySelectorAll(".network-card-address span");
    addressSpans[0].querySelector("strong").textContent = device.ip || "–";
    addressSpans[1].querySelector("strong").textContent = device.mac || "nicht verfügbar";

    card.querySelector(".network-card-type").textContent = typeLabel;
    card.querySelector(".network-card-ping").textContent = `Ping ${latency}`;
    card.querySelector(".network-card-seen").textContent = formatNetworkSeen(device.last_seen);

    const serviceWrap = card.querySelector(".network-card-services");
    if (services.length) {
      services.forEach(service => {
        const chip = document.createElement("span");
        chip.textContent = service;
        serviceWrap.appendChild(chip);
      });
    } else {
      const chip = document.createElement("span");
      chip.className = "muted";
      chip.textContent = device.trusted ? "Bekanntes Gerät" : "Keine Dienste erkannt";
      serviceWrap.appendChild(chip);
    }

    const openPorts = Array.isArray(device.deep_scan?.ports) ? device.deep_scan.ports.length : 0;
    const presence = device.online && Number.isFinite(Number(device.online_since))
      ? `Online ${formatUptime(Math.max(0, Math.floor(Date.now()/1000 - Number(device.online_since))))}`
      : !device.online && Number.isFinite(Number(device.offline_since))
        ? `Offline ${formatUptime(Math.max(0, Math.floor(Date.now()/1000 - Number(device.offline_since))))}`
        : "";
    card.querySelector(".network-card-footer span").textContent =
      [device.trusted ? "✓ Vertrauenswürdig" : (device.new && device.online ? "Neu im Netzwerk" : "Lokales Gerät"), presence, openPorts ? `${openPorts} offene Ports` : ""]
        .filter(Boolean).join(" · ");

    card.addEventListener("click", () => openNetworkDevice(device.id));
    body.appendChild(card);
  }

  if (!body.children.length) {
    body.innerHTML = '<div class="network-device-empty">Keine Geräte für diesen Filter.</div>';
  }
}

async function loadNetworkInventory() {
  const root = document.getElementById("network-device-inventory");
  if (!root) return;
  try {
    const data = await request("/api/network/devices", {headers:{}});
    renderNetworkInventory(data);
  } catch (error) {
    console.error(error);
    const state = document.getElementById("network-scan-state");
    if (state) state.textContent = "Inventar nicht verfügbar";
  }
}

async function scanNetworkInventory() {
  const button = document.getElementById("network-scan");
  const state = document.getElementById("network-scan-state");
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Scanne Heimnetz …";
  if (state) state.textContent = "ARP · Ping · mDNS werden geprüft …";
  try {
    const data = await request("/api/network/scan", {
      method:"POST", body:"{}", headers:{"X-CSRF-Token":csrfToken}
    });
    renderNetworkInventory(data);
    const newlyFound = (data.devices || []).filter(device => device.online && device.new).length;
    showN2KToast(
      newlyFound ? `${newlyFound} neue Geräte im Heimnetz erkannt.` : `${data.summary?.online || 0} Geräte online.`,
      newlyFound ? "info" : "success"
    );
  } catch (error) {
    console.error(error);
    if (state) state.textContent = "Scan fehlgeschlagen";
    showN2KToast("Heimnetz konnte nicht vollständig gescannt werden.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderNetworkDeviceModal(device) {
  if (!device) return;
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText("network-device-modal-title", device.name || device.hostname || device.ip || "Gerät");
  setText("network-device-modal-status", device.online ? (device.new ? "NEUES GERÄT · ONLINE" : "GERÄT · ONLINE") : "GERÄT · OFFLINE");
  setText("network-device-modal-subtitle", [device.vendor, networkDeviceTypeLabels[device.device_type]].filter(Boolean).join(" · ") || "Lokales Netzwerkgerät");
  setText("network-device-ip", device.ip || "–");
  setText("network-device-mac", device.mac || "–");
  setText("network-device-vendor", device.vendor || "unbekannt");
  setText("network-device-hostname", device.hostname || "–");
  setText("network-device-ping", Number.isFinite(Number(device.latency_ms)) ? `${device.latency_ms} ms` : "–");
  setText("network-device-first-seen", Number.isFinite(Number(device.first_seen)) ? formatDateTime(Number(device.first_seen)) : "–");
  setText("network-device-last-seen", Number.isFinite(Number(device.last_seen)) ? formatDateTime(Number(device.last_seen)) : "–");
  setText("network-device-online", device.online ? "Online" : "Offline");
  setText("network-device-online-since", device.online && Number.isFinite(Number(device.online_since))
    ? `${formatDateTime(Number(device.online_since))} · ${formatUptime(Math.max(0, Math.floor(Date.now()/1000 - Number(device.online_since))))}`
    : "–");
  setText("network-device-offline-since", !device.online && Number.isFinite(Number(device.offline_since))
    ? `${formatDateTime(Number(device.offline_since))} · ${formatUptime(Math.max(0, Math.floor(Date.now()/1000 - Number(device.offline_since))))}`
    : "–");
  setText("network-device-seen-count", Number.isFinite(Number(device.seen_count)) ? String(device.seen_count) : "–");
  setText("network-device-last-wake", Number.isFinite(Number(device.last_wake_at)) ? formatDateTime(Number(device.last_wake_at)) : "Noch nie");

  const nameInput = document.getElementById("network-device-custom-name");
  const typeInput = document.getElementById("network-device-type");
  const trustedInput = document.getElementById("network-device-trusted");
  const notesInput = document.getElementById("network-device-notes");
  const wakeButton = document.getElementById("network-device-wake");
  if (wakeButton) {
    const validMac = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(device.mac || "");
    wakeButton.disabled = currentRole === "viewer" || !validMac;
    wakeButton.title = !validMac ? "Keine gültige MAC-Adresse verfügbar" : "Magic Packet ins lokale Netzwerk senden";
  }
  if (nameInput) nameInput.value = device.custom_name || "";
  if (typeInput) typeInput.value = device.device_type || "unknown";
  if (trustedInput) trustedInput.checked = Boolean(device.trusted);
  if (notesInput) notesInput.value = device.notes || "";

  const services = document.getElementById("network-device-services");
  if (services) {
    services.innerHTML = "";
    const list = Array.isArray(device.services) ? device.services : [];
    if (list.length) {
      list.forEach(service => {
        const chip = document.createElement("span");
        chip.textContent = service;
        services.appendChild(chip);
      });
    } else {
      services.innerHTML = "<span>Keine mDNS-/Bonjour-Dienste erkannt.</span>";
    }
  }

  const deep = device.deep_scan || {};
  const ports = document.getElementById("network-device-ports");
  if (ports) {
    ports.innerHTML = "";
    const rows = Array.isArray(deep.ports) ? deep.ports : [];
    if (rows.length) {
      rows.forEach(port => {
        const row = document.createElement("div");
        row.className = "network-port-row";
        row.innerHTML = "<strong></strong><span></span><small></small>";
        row.querySelector("strong").textContent = `${port.port}/${port.protocol || "tcp"}`;
        row.querySelector("span").textContent = port.service || "Dienst";
        row.querySelector("small").textContent = port.product || "offen";
        ports.appendChild(row);
      });
    } else {
      ports.innerHTML = '<div class="network-device-empty">Noch keine Detailanalyse für dieses Gerät.</div>';
    }
  }
  setText("network-device-analysis-time", Number.isFinite(Number(deep.scanned_at)) ? `Analyse: ${formatDateTime(Number(deep.scanned_at))}` : "Noch nicht ausgeführt");
  setText("network-device-os-hint", deep.os_hint ? `Service-Hinweis: ${deep.os_hint}` : "");

  const history = document.getElementById("network-device-history");
  if (history) {
    history.innerHTML = "";
    const entries = Array.isArray(device.history) ? [...device.history].slice(-12).reverse() : [];
    if (entries.length) {
      for (const entry of entries) {
        const row = document.createElement("div");
        row.className = "network-history-row";
        const label = entry.state === "discovered" ? "Erstmals erkannt" :
          entry.state === "online" ? "Online" :
          entry.state === "offline" ? "Offline" :
          entry.state === "ip_change" ? "IP-Adresse geändert" :
          entry.state === "wake_sent" ? "Wake-on-LAN gesendet" : entry.state;
        row.innerHTML = "<span></span><strong></strong><small></small>";
        row.querySelector("span").className = `network-history-dot ${entry.state || ""}`;
        row.querySelector("strong").textContent = label;
        const at = Number.isFinite(Number(entry.at)) ? formatDateTime(Number(entry.at)) : "–";
        const extra = entry.state === "ip_change" && (entry.from || entry.to) ? ` · ${entry.from || "?"} → ${entry.to || "?"}` : "";
        row.querySelector("small").textContent = at + extra;
        history.appendChild(row);
      }
    } else {
      history.innerHTML = '<div class="network-device-empty">Noch keine Historie vorhanden.</div>';
    }
  }
}

function openNetworkDevice(deviceId) {
  const device = networkInventoryDevices.find(item => item.id === deviceId);
  if (!device) return;
  networkInventorySelectedId = deviceId;
  renderNetworkDeviceModal(device);
  document.getElementById("network-device-modal")?.classList.remove("hidden");
}

function closeNetworkDevice() {
  document.getElementById("network-device-modal")?.classList.add("hidden");
  networkInventorySelectedId = null;
}

async function saveNetworkDevice() {
  if (!networkInventorySelectedId) return;
  const fields = {
    custom_name: document.getElementById("network-device-custom-name")?.value || "",
    device_type: document.getElementById("network-device-type")?.value || "unknown",
    trusted: Boolean(document.getElementById("network-device-trusted")?.checked),
    notes: document.getElementById("network-device-notes")?.value || ""
  };
  try {
    const updated = await request("/api/network/device/update", {
      method:"POST",
      body:JSON.stringify({device_id:networkInventorySelectedId, fields}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    const index = networkInventoryDevices.findIndex(item => item.id === networkInventorySelectedId);
    if (index >= 0) networkInventoryDevices[index] = {...networkInventoryDevices[index], ...updated};
    renderNetworkDeviceList();
    renderNetworkDeviceModal(networkInventoryDevices[index]);
    showN2KToast("Geräteinformationen gespeichert.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast("Geräteinformationen konnten nicht gespeichert werden.", "error");
  }
}

async function wakeNetworkDevice() {
  if (!networkInventorySelectedId || currentRole === "viewer") return;
  const device = networkInventoryDevices.find(item => item.id === networkInventorySelectedId);
  if (!device) return;
  if (!confirm(`${device.name || device.ip}: Wake-on-LAN senden?`)) return;
  const button = document.getElementById("network-device-wake");
  const original = button?.textContent || "Wake-on-LAN";
  if (button) { button.disabled = true; button.textContent = "Sende …"; }
  try {
    await request("/api/network/device/wake", {
      method:"POST",
      body:JSON.stringify({device_id:networkInventorySelectedId}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    device.last_wake_at = Math.floor(Date.now()/1000);
    device.history = [...(device.history || []), {at:device.last_wake_at, state:"wake_sent"}].slice(-60);
    renderNetworkDeviceModal(device);
    showN2KToast("Wake-on-LAN wurde gesendet.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast(error.code === "wake_mac_unavailable" ? "Für dieses Gerät ist keine MAC-Adresse verfügbar." : "Wake-on-LAN konnte nicht gesendet werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}


async function analyzeNetworkDevice() {
  if (!networkInventorySelectedId) return;
  const button = document.getElementById("network-device-analyze");
  const original = button?.textContent || "Gerät analysieren";
  if (button) {
    button.disabled = true;
    button.textContent = "Analysiere Dienste …";
  }
  try {
    const updated = await request("/api/network/device/analyze", {
      method:"POST",
      body:JSON.stringify({device_id:networkInventorySelectedId}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    const index = networkInventoryDevices.findIndex(item => item.id === networkInventorySelectedId);
    if (index >= 0) networkInventoryDevices[index] = {...networkInventoryDevices[index], ...updated};
    renderNetworkDeviceList();
    renderNetworkDeviceModal(networkInventoryDevices[index]);
    showN2KToast("Detailanalyse abgeschlossen.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast("Detailanalyse konnte nicht abgeschlossen werden.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}


let healthRange = "24h";
let healthHistory = [];

function setHealthText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function healthStateClass(ok, warn=false) {
  return ok ? "ok" : warn ? "warn" : "bad";
}

function renderHealthHistoryChart() {
  const canvas = document.getElementById("health-history-chart");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(500, Math.round(rect.width || 900));
  const height = Math.max(180, Math.round(rect.height || 250));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const pad = {left:38, right:14, top:16, bottom:24};
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 1;
  ctx.font = "9px sans-serif";
  ctx.fillStyle = "rgba(190,201,211,.48)";
  for (let p = 0; p <= 100; p += 25) {
    const y = pad.top + chartH - (p / 100) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillText(`${p}`, 8, y + 3);
  }

  if (!healthHistory.length) {
    ctx.fillStyle = "rgba(190,201,211,.55)";
    ctx.textAlign = "center";
    ctx.fillText("Historie baut sich mit den Messungen auf.", width / 2, height / 2);
    return;
  }

  const metrics = [
    {key:"cpu_percent", stroke:"rgba(105,170,255,.95)"},
    {key:"ram_percent", stroke:"rgba(173,122,255,.92)"},
    {key:"temperature_c", stroke:"rgba(255,179,92,.92)"},
    {key:"storage_percent", stroke:"rgba(91,218,159,.90)"}
  ];

  for (const metric of metrics) {
    ctx.strokeStyle = metric.stroke;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    let started = false;
    healthHistory.forEach((item, index) => {
      const raw = Number(item[metric.key]);
      if (!Number.isFinite(raw)) return;
      const value = Math.max(0, Math.min(100, raw));
      const x = pad.left + (healthHistory.length === 1 ? 0 : (index / (healthHistory.length - 1)) * chartW);
      const y = pad.top + chartH - (value / 100) * chartH;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const first = healthHistory[0]?.sampled_at;
  const last = healthHistory[healthHistory.length - 1]?.sampled_at;
  ctx.fillStyle = "rgba(190,201,211,.45)";
  ctx.font = "8px sans-serif";
  ctx.textAlign = "left";
  if (first) ctx.fillText(new Date(first * 1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}), pad.left, height - 5);
  ctx.textAlign = "right";
  if (last) ctx.fillText(new Date(last * 1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}), width - pad.right, height - 5);
}

let selectedServiceUnit = "";

function ensureServiceDiagnosticsModal() {
  if (document.getElementById("service-diagnostics-modal")) return;
  const modal = document.createElement("div");
  modal.id = "service-diagnostics-modal";
  modal.className = "service-diagnostics-modal hidden";
  modal.innerHTML = `
    <div class="service-diagnostics-dialog">
      <div class="service-diagnostics-head">
        <div><small>SYSTEMDIENST</small><strong id="service-diag-title">Dienst</strong><span id="service-diag-unit">–</span></div>
        <button id="service-diag-close" class="secondary compact">Schließen</button>
      </div>
      <div class="service-diagnostics-status">
        <span id="service-diag-state" class="health-badge">–</span>
        <span id="service-diag-count">Logs werden geladen …</span>
        <button id="service-diag-action" class="primary compact hidden">Neu starten</button>
      </div>
      <pre id="service-diag-log" class="service-diagnostics-log">Logs werden geladen …</pre>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("service-diag-close")?.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", event => { if (event.target === modal) modal.classList.add("hidden"); });
  document.getElementById("service-diag-action")?.addEventListener("click", restartSelectedService);
}

async function openServiceDiagnostics(service) {
  ensureServiceDiagnosticsModal();
  selectedServiceUnit = service?.unit || "";
  const modal = document.getElementById("service-diagnostics-modal");
  const action = document.getElementById("service-diag-action");
  setHealthText("service-diag-title", service?.label || selectedServiceUnit.replace(".service","") || "Dienst");
  setHealthText("service-diag-unit", selectedServiceUnit || "–");
  setHealthText("service-diag-state", service?.state || "unknown");
  document.getElementById("service-diag-state").className = `health-badge ${service?.ok ? "ok" : "warn"}`;
  if (action) {
    action.classList.toggle("hidden", !service?.restartable || currentRole === "viewer");
    action.textContent = service?.ok ? "Neu starten" : "Starten";
    action.dataset.operation = service?.ok ? "restart" : "start";
  }
  setHealthText("service-diag-count", "Journal wird geladen …");
  document.getElementById("service-diag-log").textContent = "Logs werden geladen …";
  modal?.classList.remove("hidden");
  try {
    const data = await request(`/api/service/logs?unit=${encodeURIComponent(selectedServiceUnit)}&lines=120`, {headers:{}});
    const lines = Array.isArray(data.lines) ? data.lines : [];
    document.getElementById("service-diag-log").textContent = lines.length ? lines.join("\n") : "Keine Journal-Einträge vorhanden.";
    setHealthText("service-diag-count", `${data.line_count || lines.length} Journal-Zeilen`);
    const state = data.state || {};
    setHealthText("service-diag-state", state.state || "unknown");
    document.getElementById("service-diag-state").className = `health-badge ${state.ok ? "ok" : "warn"}`;
  } catch (error) {
    console.error(error);
    document.getElementById("service-diag-log").textContent = "Journal konnte nicht geladen werden.";
    setHealthText("service-diag-count", "Diagnose nicht verfügbar");
  }
}

async function restartSelectedService() {
  if (!selectedServiceUnit || currentRole === "viewer") return;
  const button = document.getElementById("service-diag-action");
  const operation = button?.dataset.operation || "restart";
  const original = button?.textContent || "Neu starten";
  if (button) { button.disabled = true; button.textContent = operation === "start" ? "Starte …" : "Starte neu …"; }
  try {
    const data = await request("/api/service/action", {
      method:"POST",
      body:JSON.stringify({unit:selectedServiceUnit, operation}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast(operation === "start" ? "Dienst wurde gestartet." : "Dienst wurde neu gestartet.", "success");
    await loadSystemHealth();
    await openServiceDiagnostics(data.service || {unit:selectedServiceUnit, restartable:true});
  } catch (error) {
    console.error(error);
    showN2KToast("Dienstaktion fehlgeschlagen.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function hardwareSmartForDrive(hardware, drive) {
  const rows = Array.isArray(hardware?.smart?.drives) ? hardware.smart.drives : [];
  return rows.find(item => item.device === drive.path || item.device === `/dev/${drive.name}`) || null;
}

function renderHardwareMaintenance(data) {
  const badge = document.getElementById("hardware-state-badge");
  if (badge) {
    badge.textContent = "ERKANNT";
    badge.className = "health-badge ok";
  }
  setHealthText("hardware-system", data.hostname || "Linux Host");
  const board = data.board || {};
  setHealthText("hardware-board", [board.system_vendor || board.vendor, board.product || board.name].filter(Boolean).join(" · ") || "Hardwareplattform nicht gemeldet");
  setHealthText("hardware-cpu-model", data.cpu_model || "CPU nicht erkannt");
  setHealthText("hardware-cpu-meta", `${data.logical_cores || 0} logische Kerne · ${data.architecture || "Architektur –"}`);
  setHealthText("hardware-memory", data.memory_total_bytes ? formatBytes(data.memory_total_bytes) : "–");
  setHealthText("hardware-uptime", `Uptime ${formatUptime(Number(data.uptime_seconds))}`);
  setHealthText("hardware-kernel", data.kernel || "–");
  setHealthText("hardware-os", data.os || "Linux");

  const drives = Array.isArray(data.drives) ? data.drives : [];
  setHealthText("hardware-drive-count", String(drives.length));
  const list = document.getElementById("hardware-drive-list");
  if (list) {
    list.innerHTML = "";
    if (!drives.length) {
      list.innerHTML = '<div class="health-empty">Keine physischen Laufwerke erkannt.</div>';
    } else {
      drives.forEach(drive => {
        const smart = hardwareSmartForDrive(data, drive);
        const row = document.createElement("div");
        row.className = "hardware-drive-row";
        row.innerHTML = "<span class='hardware-drive-icon'>SSD</span><div class='hardware-drive-copy'><strong></strong><small></small><span></span></div><div class='hardware-drive-health'><b></b><small></small></div>";
        row.querySelector(".hardware-drive-icon").textContent = drive.rotational ? "HDD" : drive.type === "rom" ? "ROM" : "SSD";
        row.querySelector(".hardware-drive-copy strong").textContent = [drive.vendor, drive.model].filter(Boolean).join(" ") || drive.path || drive.name;
        row.querySelector(".hardware-drive-copy small").textContent = `${drive.path || "–"} · ${formatBytes(Number(drive.size_bytes))} · ${drive.transport || "intern"}`;
        row.querySelector(".hardware-drive-copy span").textContent = drive.serial ? `S/N ${drive.serial}` : (drive.mountpoints || []).join(" · ") || "Kein Mountpoint";
        const health = smart?.health || "unknown";
        row.querySelector(".hardware-drive-health b").textContent = health === "passed" ? "SMART OK" : health === "failed" ? "SMART FEHLER" : "SMART –";
        row.querySelector(".hardware-drive-health b").className = health === "passed" ? "ok" : health === "failed" ? "bad" : "";
        row.querySelector(".hardware-drive-health small").textContent = Number.isFinite(Number(smart?.temperature_c)) ? `${smart.temperature_c} °C` : "Temperatur –";
        list.appendChild(row);
      });
    }
  }

  const reboot = document.getElementById("host-reboot");
  const poweroff = document.getElementById("host-poweroff");
  const canPower = currentRole === "admin";
  if (reboot) reboot.disabled = !canPower;
  if (poweroff) poweroff.disabled = !canPower;
  setHealthText("host-power-note", canPower ? "Admin-Modus · Aktionen werden protokolliert." : "Nur Administratoren können Host-Aktionen ausführen.");
}

async function loadHardwareMaintenance() {
  if (!document.getElementById("hardware-state-badge") || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/hardware", {headers:{}});
    renderHardwareMaintenance(data);
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("hardware-state-badge");
    if (badge) {
      badge.textContent = "NICHT VERFÜGBAR";
      badge.className = "health-badge warn";
    }
  }
}

async function hostPowerAction(operation) {
  if (currentRole !== "admin") return;
  const label = operation === "reboot" ? "neu starten" : "ausschalten";
  if (!window.confirm(`Server wirklich ${label}? Laufende VMs und Dienste werden dabei beendet.`)) return;
  const reboot = document.getElementById("host-reboot");
  const poweroff = document.getElementById("host-poweroff");
  if (reboot) reboot.disabled = true;
  if (poweroff) poweroff.disabled = true;
  setHealthText("host-power-note", operation === "reboot" ? "Neustart wird vorbereitet …" : "Server wird heruntergefahren …");
  try {
    await request("/api/power/action", {
      method:"POST",
      body:JSON.stringify({operation}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast(operation === "reboot" ? "Server-Neustart wurde ausgelöst." : "Server wird ausgeschaltet.", "success");
    setConnection(false, operation === "reboot" ? "Server startet neu …" : "Server fährt herunter …");
  } catch (error) {
    console.error(error);
    showN2KToast("Host-Aktion konnte nicht ausgeführt werden.", "error");
    if (reboot) reboot.disabled = false;
    if (poweroff) poweroff.disabled = false;
    setHealthText("host-power-note", "Host-Aktion fehlgeschlagen.");
  }
}

function renderHealthStatus(data) {
  const current = data.current || {};
  const score = Number(current.score);
  const scoreNode = document.getElementById("health-score-ring");
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  if (scoreNode) {
    scoreNode.style.setProperty("--health-score-angle", `${safeScore * 3.6}deg`);
    scoreNode.classList.toggle("warn", current.overall === "warning");
    scoreNode.classList.toggle("bad", current.overall === "critical");
  }
  setHealthText("health-score", Number.isFinite(score) ? String(Math.round(score)) : "–");
  const overallLabel = current.overall === "healthy" ? "System gesund" : current.overall === "warning" ? "Hinweise vorhanden" : current.overall === "critical" ? "Kritischer Zustand" : "Status unbekannt";
  setHealthText("health-overall", overallLabel);
  setHealthText("health-sampled-at", current.sampled_at ? `Messung ${formatDateTime(current.sampled_at)}` : "–");

  setHealthText("health-cpu", Number.isFinite(current.cpu_percent) ? `${Math.round(current.cpu_percent)}%` : "–");
  const cpu = current.cpu || {};
  setHealthText("health-cpu-detail", cpu.logical_cores ? `${cpu.physical_cores || cpu.logical_cores} Kerne · ${cpu.logical_cores} Threads` : "CPU-Topologie unbekannt");

  const temp = current.cpu_temperature || {};
  setHealthText("health-temp", Number.isFinite(temp.max_c) ? `${Number(temp.max_c).toFixed(1)} °C` : "–");
  setHealthText("health-temp-detail", temp.available ? `${(temp.sensors || []).length} Sensoren · Ø ${Number.isFinite(temp.current_c) ? Number(temp.current_c).toFixed(1) : "–"} °C` : "Kein Temperatursensor erkannt");

  const memory = current.memory || {};
  setHealthText("health-ram", Number.isFinite(memory.used_percent) ? `${Math.round(memory.used_percent)}%` : "–");
  setHealthText("health-ram-detail", memory.total_bytes ? `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}` : "–");

  const storage = current.storage || {};
  setHealthText("health-storage", Number.isFinite(storage.used_percent) ? `${Math.round(storage.used_percent)}%` : "–");
  setHealthText("health-storage-detail", storage.total_bytes ? `${formatBytes(storage.free_bytes)} frei` : "–");

  const load = current.load || {};
  setHealthText("health-load", Number.isFinite(load["1m"]) ? load["1m"].toFixed(2) : "–");
  setHealthText("health-load-detail", `${Number.isFinite(load["1m"]) ? load["1m"].toFixed(2) : "–"} / ${Number.isFinite(load["5m"]) ? load["5m"].toFixed(2) : "–"} / ${Number.isFinite(load["15m"]) ? load["15m"].toFixed(2) : "–"}`);

  const network = current.network || {};
  setHealthText("health-network", `${formatRate(network.down_bps)} ↓`);
  setHealthText("health-network-detail", `${formatRate(network.up_bps)} ↑ · ${Number.isFinite(network.ping_ms) ? network.ping_ms + " ms" : "Ping –"}`);

  const smart = current.smart || {};
  const smartBadge = document.getElementById("health-smart-badge");
  const smartOk = smart.overall === "passed";
  if (smartBadge) {
    smartBadge.textContent = smart.available ? (smartOk ? "OK" : smart.overall === "failed" ? "FEHLER" : "UNBEKANNT") : "N/A";
    smartBadge.className = `health-badge ${healthStateClass(smartOk, smart.overall !== "failed")}`;
  }
  const smartList = document.getElementById("health-smart-list");
  if (smartList) {
    smartList.innerHTML = "";
    const drives = Array.isArray(smart.drives) ? smart.drives : [];
    if (!drives.length) {
      smartList.innerHTML = '<div class="health-empty">Keine SMART-Daten verfügbar.</div>';
    } else {
      drives.forEach(drive => {
        const row = document.createElement("div");
        row.className = "health-list-row";
        row.innerHTML = "<span class='health-dot-mini'></span><div><strong></strong><small></small></div><em></em>";
        row.querySelector("strong").textContent = drive.model || drive.device;
        row.querySelector("small").textContent = `${drive.device}${drive.serial ? ` · ${drive.serial}` : ""}`;
        row.querySelector("em").textContent = Number.isFinite(drive.temperature_c) ? `${drive.temperature_c} °C` : drive.health;
        row.querySelector(".health-dot-mini").classList.add(drive.health === "passed" ? "ok" : drive.health === "failed" ? "bad" : "warn");
        smartList.appendChild(row);
      });
    }
  }

  const serviceList = document.getElementById("health-service-list");
  const services = Array.isArray(current.services) ? current.services : [];
  const docker = current.docker || {};
  const serviceOk = services.every(item => item.ok) && (!docker.available || docker.running === docker.total);
  const serviceBadge = document.getElementById("health-services-badge");
  if (serviceBadge) {
    serviceBadge.textContent = serviceOk ? "ONLINE" : "PRÜFEN";
    serviceBadge.className = `health-badge ${serviceOk ? "ok" : "warn"}`;
  }
  if (serviceList) {
    serviceList.innerHTML = "";
    const dockerRow = document.createElement("div");
    dockerRow.className = "health-list-row";
    dockerRow.innerHTML = "<span class='health-dot-mini'></span><div><strong>Docker Container</strong><small></small></div><em></em>";
    dockerRow.querySelector("small").textContent = `${docker.running || 0} von ${docker.total || 0} N2K-Containern`;
    dockerRow.querySelector("em").textContent = docker.available ? "Docker" : "nicht verfügbar";
    dockerRow.querySelector(".health-dot-mini").classList.add(docker.available && docker.running === docker.total ? "ok" : "warn");
    serviceList.appendChild(dockerRow);
    services.forEach(service => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "health-list-row health-service-row";
      row.innerHTML = "<span class='health-dot-mini'></span><div><strong></strong><small></small></div><em></em><span class='health-service-more'>Details ›</span>";
      row.querySelector("strong").textContent = service.label || service.unit.replace(".service","");
      row.querySelector("small").textContent = service.restartable ? "systemd · steuerbar" : "systemd · geschützt";
      row.querySelector("em").textContent = service.state || "unknown";
      row.querySelector(".health-dot-mini").classList.add(service.ok ? "ok" : "warn");
      row.addEventListener("click", () => openServiceDiagnostics(service));
      serviceList.appendChild(row);
    });
  }

  const workloadList = document.getElementById("health-workload-list");
  const ha = current.homeassistant || {};
  const backup = current.backup;
  const workloadOk = (!ha.installed || (ha.state === "running" && ha.reachable)) && Boolean(backup);
  const workloadBadge = document.getElementById("health-workload-badge");
  if (workloadBadge) {
    workloadBadge.textContent = workloadOk ? "OK" : "PRÜFEN";
    workloadBadge.className = `health-badge ${workloadOk ? "ok" : "warn"}`;
  }
  if (workloadList) {
    workloadList.innerHTML = "";
    const rows = [
      {
        title:"Home Assistant OS",
        detail:ha.installed ? `${ha.state || "unknown"} · ${ha.reachable ? "erreichbar" : "nicht erreichbar"}` : "nicht installiert",
        meta:ha.reachable ? "ONLINE" : "PRÜFEN",
        ok:!ha.installed || (ha.state === "running" && ha.reachable)
      },
      {
        title:"Letztes N2K Backup",
        detail:backup?.created_at ? formatDateTime(backup.created_at) : "Kein Backup vorhanden",
        meta:backup?.size_bytes ? formatBytes(backup.size_bytes) : "–",
        ok:Boolean(backup)
      },
      {
        title:"Systemupdate",
        detail:current.update?.update_available ? "Neuer Stand verfügbar" : "Installierter Stand aktuell",
        meta:current.update?.update_available ? "UPDATE" : "OK",
        ok:!current.update?.update_available
      }
    ];
    rows.forEach(item => {
      const row = document.createElement("div");
      row.className = "health-list-row";
      row.innerHTML = "<span class='health-dot-mini'></span><div><strong></strong><small></small></div><em></em>";
      row.querySelector("strong").textContent = item.title;
      row.querySelector("small").textContent = item.detail;
      row.querySelector("em").textContent = item.meta;
      row.querySelector(".health-dot-mini").classList.add(item.ok ? "ok" : "warn");
      workloadList.appendChild(row);
    });
  }

  const warnings = Array.isArray(current.warnings) ? current.warnings : [];
  setHealthText("health-alert-count", String(warnings.length));
  const alertList = document.getElementById("health-alert-list");
  if (alertList) {
    alertList.innerHTML = "";
    if (!warnings.length) {
      alertList.innerHTML = '<div class="health-empty health-all-good">✓ Keine kritischen Systemhinweise.</div>';
    } else {
      warnings.forEach(item => {
        const row = document.createElement("div");
        row.className = `health-alert-row ${item.level || "warning"}`;
        row.innerHTML = "<span></span><div><strong></strong><small></small></div>";
        row.querySelector("span").textContent = item.level === "critical" ? "!" : "•";
        row.querySelector("strong").textContent = item.title || "Systemhinweis";
        row.querySelector("small").textContent = item.detail || "";
        alertList.appendChild(row);
      });
    }
  }

  healthHistory = Array.isArray(data.history) ? data.history : [];
  setHealthText("health-history-points", `${healthHistory.length} Messpunkte`);
  setHealthText("health-history-range", data.period === "7d" ? "7 Tage · 30-Minuten-Mittel" : "24 Stunden · 5-Minuten-Mittel");
  renderHealthHistoryChart();
}

function renderMonitoringPolicy(policy = {}) {
  const setValue = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.value = value;
  };
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  };

  setValue("monitor-temp-warning", policy.temp_warning ?? 75);
  setValue("monitor-temp-critical", policy.temp_critical ?? 85);
  setValue("monitor-storage-warning", policy.storage_warning ?? 80);
  setValue("monitor-storage-critical", policy.storage_critical ?? 90);
  setValue("monitor-backup-age", String(policy.backup_max_age_hours ?? 72));
  setValue("monitor-quiet-start", policy.quiet_start || "22:00");
  setValue("monitor-quiet-end", policy.quiet_end || "07:00");
  setChecked("monitor-service-alerts", policy.service_alerts !== false);
  setChecked("monitor-network-alerts", policy.network_alerts !== false);
  setChecked("monitor-update-alerts", policy.update_alerts !== false);
  setChecked("monitor-maintenance-mode", policy.maintenance_mode);
  setChecked("monitor-quiet-enabled", policy.quiet_enabled);

  const badge = document.getElementById("monitoring-policy-badge");
  if (badge) {
    badge.textContent = policy.maintenance_mode ? "WARTUNG" : policy.quiet_active ? "RUHEZEIT" : "AKTIV";
    badge.className = "health-badge " + (policy.maintenance_mode ? "warn" : "ok");
  }
  const quiet = document.getElementById("monitor-quiet-state");
  if (quiet) {
    quiet.textContent = policy.quiet_active ? "AKTIV" : policy.quiet_enabled ? "GEPLANT" : "AUS";
    quiet.className = "status-chip" + (policy.quiet_active ? " good" : "");
  }
  setHealthText("monitoring-policy-meta",
    policy.updated_at ? `Zuletzt geändert ${formatDateTime(Number(policy.updated_at))}` : "Standardregeln aktiv");

  const editable = currentRole === "admin";
  document.querySelectorAll(".monitoring-automation-card input, .monitoring-automation-card select, #monitoring-policy-save")
    .forEach(node => { node.disabled = !editable; });
}

async function loadMonitoringPolicy() {
  if (!document.getElementById("monitoring-automation-card") && !document.querySelector(".monitoring-automation-card")) return;
  try {
    const policy = await request("/api/monitoring/policy", {headers:{}});
    renderMonitoringPolicy(policy);
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("monitoring-policy-badge");
    if (badge) {
      badge.textContent = "FEHLER";
      badge.className = "health-badge bad";
    }
  }
}

async function saveMonitoringPolicy() {
  if (currentRole !== "admin") return;
  const payload = {
    temp_warning: Number(document.getElementById("monitor-temp-warning")?.value),
    temp_critical: Number(document.getElementById("monitor-temp-critical")?.value),
    storage_warning: Number(document.getElementById("monitor-storage-warning")?.value),
    storage_critical: Number(document.getElementById("monitor-storage-critical")?.value),
    backup_max_age_hours: Number(document.getElementById("monitor-backup-age")?.value),
    service_alerts: Boolean(document.getElementById("monitor-service-alerts")?.checked),
    network_alerts: Boolean(document.getElementById("monitor-network-alerts")?.checked),
    update_alerts: Boolean(document.getElementById("monitor-update-alerts")?.checked),
    maintenance_mode: Boolean(document.getElementById("monitor-maintenance-mode")?.checked),
    quiet_enabled: Boolean(document.getElementById("monitor-quiet-enabled")?.checked),
    quiet_start: document.getElementById("monitor-quiet-start")?.value || "22:00",
    quiet_end: document.getElementById("monitor-quiet-end")?.value || "07:00"
  };
  const button = document.getElementById("monitoring-policy-save");
  const original = button?.textContent || "Regeln speichern";
  if (button) { button.disabled = true; button.textContent = "Speichere …"; }
  try {
    const policy = await request("/api/monitoring/policy", {
      method:"POST",
      body:JSON.stringify(payload),
      headers:{"X-CSRF-Token":csrfToken}
    });
    renderMonitoringPolicy(policy);
    await loadNotifications();
    showN2KToast("Monitoring-Regeln wurden aktualisiert.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast(
      error.code === "invalid_monitoring_threshold_order"
        ? "Warnschwelle muss unter der kritischen Schwelle liegen."
        : "Monitoring-Regeln konnten nicht gespeichert werden.",
      "error"
    );
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function loadSystemHealth() {
  if (!document.getElementById("health-panel") || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request(`/api/health?range=${encodeURIComponent(healthRange)}`, {headers:{}});
    renderHealthStatus(data);
    await loadMonitoringPolicy();
  } catch (error) {
    console.error(error);
    setHealthText("health-overall", "Monitoring nicht erreichbar");
  }
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
    const cpuInfo = data.cpu || {};

    document.getElementById("overview-cpu").textContent =
      Number.isFinite(cpu) ? `${Math.round(cpu)}%` : "…";
    document.getElementById("overview-cpu-label").textContent =
      Number.isFinite(cpu) ? "Auslastung" : "wird gemessen";
    const coreCopy = document.getElementById("overview-cpu-cores");
    if (coreCopy) {
      const logical = Number(cpuInfo.logical_cores);
      const physical = Number(cpuInfo.physical_cores);
      if (Number.isFinite(logical) && logical > 0) {
        coreCopy.textContent = Number.isFinite(physical) && physical > 0 && physical !== logical
          ? `${physical} Kerne · ${logical} Threads`
          : `${logical} Kerne`;
        if (cpuInfo.model) coreCopy.title = cpuInfo.model;
      } else {
        coreCopy.textContent = "Kerne nicht erkannt";
      }
    }
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
    const isNetworkDeviceWarning = warning => {
      const target = String(warning.target || "").toLowerCase();
      const copy = String(warning.title || "") + " " + String(warning.detail || "");
      return /(?:^|[-_])network(?:[-_]|$)/.test(target) && /gerät|device|heimnetz|client/i.test(copy);
    };
    const deviceWarnings = warnings.filter(isNetworkDeviceWarning);
    const deviceAlert = document.getElementById("network-device-alert");
    if (deviceAlert && deviceWarnings.length) {
      deviceAlert.textContent = deviceWarnings.map(w => w.title || w.detail).join(" · ");
      deviceAlert.hidden = false;
    } else if (deviceAlert) {
      deviceAlert.hidden = true;
      deviceAlert.textContent = "";
    }
    const overviewWarnings = warnings.filter(w => !isNetworkDeviceWarning(w));
    if (overviewWarnings.length && warningBox) {
      const warning = overviewWarnings.find(w => w.level === "critical") || overviewWarnings[0];
      warningBox.replaceChildren();
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "n2k-status-alert-button";
      const count = overviewWarnings.length;
      trigger.textContent = "⚠ " + String(warning.title || "Systemhinweis").slice(0, 42) + (count > 1 ? " +" + (count - 1) : "");
      trigger.title = [warning.title, warning.detail, count > 1 ? count + " aktive Hinweise" : ""].filter(Boolean).join(" · ");
      trigger.setAttribute("aria-label", trigger.title);
      trigger.addEventListener("click", () => switchView(warning.target || "health-panel"));
      warningBox.appendChild(trigger);
      warningBox.className = "overview-warning n2k-top-alert " + (warning.level || "warning");
    } else if (warningBox) {
      warningBox.className = "overview-warning n2k-top-alert hidden";
      warningBox.replaceChildren();
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


let selectedAppContainer = "";

function ensureAppDiagnosticsModal() {
  if (document.getElementById("app-diagnostics-modal")) return;
  const modal = document.createElement("div");
  modal.id = "app-diagnostics-modal";
  modal.className = "service-diagnostics-modal hidden";
  modal.innerHTML = `
    <div class="service-diagnostics-dialog app-diagnostics-dialog">
      <div class="service-diagnostics-head">
        <div><small>DOCKER DIAGNOSE</small><strong id="app-diag-title">Container</strong><span id="app-diag-image">–</span></div>
        <button id="app-diag-close" class="secondary compact">Schließen</button>
      </div>
      <div class="app-diag-metrics">
        <div><small>STATUS</small><strong id="app-diag-state">–</strong></div>
        <div><small>CPU</small><strong id="app-diag-cpu">–</strong></div>
        <div><small>RAM</small><strong id="app-diag-ram">–</strong></div>
        <div><small>NETZWERK</small><strong id="app-diag-net">–</strong></div>
      </div>
      <div class="app-diag-detail-grid">
        <section><small>PORTS</small><div id="app-diag-ports">–</div></section>
        <section><small>VOLUMES</small><div id="app-diag-volumes">–</div></section>
        <section><small>RESTART POLICY</small><div id="app-diag-restart">–</div></section>
        <section><small>UPDATE</small><div id="app-diag-update">Noch nicht geprüft</div></section>
      </div>
      <div class="service-diagnostics-status">
        <span id="app-diag-log-count">Logs werden geladen …</span>
        <button id="app-diag-update-check" class="secondary compact">Update prüfen</button>
        <button id="app-diag-refresh" class="secondary compact">↻ Logs</button>
      </div>
      <pre id="app-diag-log" class="service-diagnostics-log">Logs werden geladen …</pre>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("app-diag-close")?.addEventListener("click", () => modal.classList.add("hidden"));
  document.getElementById("app-diag-refresh")?.addEventListener("click", () => loadSelectedAppLogs());
  document.getElementById("app-diag-update-check")?.addEventListener("click", () => checkSelectedAppUpdate());
  modal.addEventListener("click", event => { if (event.target === modal) modal.classList.add("hidden"); });
}

function formatContainerPorts(ports) {
  const rows = Array.isArray(ports) ? ports : [];
  return rows.length ? rows.map(port => {
    const pub = port.public ? `${port.host_ip && port.host_ip !== "0.0.0.0" ? port.host_ip + ":" : ""}${port.public} → ` : "";
    return `${pub}${port.private || "–"}`;
  }).join(" · ") : "Keine veröffentlichten Ports";
}

function formatContainerVolumes(mounts) {
  const rows = Array.isArray(mounts) ? mounts : [];
  return rows.length ? rows.map(mount => {
    const source = mount.name || mount.source || mount.type || "Volume";
    return `${source} → ${mount.destination || "–"}${mount.read_only ? " (RO)" : ""}`;
  }).join(" · ") : "Keine Volumes";
}

async function openAppDiagnostics(item) {
  ensureAppDiagnosticsModal();
  selectedAppContainer = item?.name || "";
  setHealthText("app-diag-title", item?.name || "Container");
  setHealthText("app-diag-image", item?.image || "–");
  setHealthText("app-diag-state", item?.state || "unknown");
  setHealthText("app-diag-cpu", item?.stats?.cpu_percent || "–");
  setHealthText("app-diag-ram", item?.stats?.memory_usage || "–");
  setHealthText("app-diag-net", item?.stats?.network_io || "–");
  setHealthText("app-diag-ports", formatContainerPorts(item?.ports));
  setHealthText("app-diag-volumes", formatContainerVolumes(item?.mounts));
  setHealthText("app-diag-restart", item?.restart_policy || "no");
  setHealthText("app-diag-update", "Noch nicht geprüft");
  const updateButton = document.getElementById("app-diag-update-check");
  if (updateButton) updateButton.classList.toggle("hidden", currentRole === "viewer");
  document.getElementById("app-diagnostics-modal")?.classList.remove("hidden");
  await loadSelectedAppLogs();
}

async function loadSelectedAppLogs() {
  if (!selectedAppContainer) return;
  setHealthText("app-diag-log-count", "Journal wird geladen …");
  const log = document.getElementById("app-diag-log");
  if (log) log.textContent = "Logs werden geladen …";
  try {
    const data = await request(`/api/apps/logs?name=${encodeURIComponent(selectedAppContainer)}&lines=160`, {headers:{}});
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (log) log.textContent = lines.length ? lines.join("\n") : "Keine Log-Einträge vorhanden.";
    setHealthText("app-diag-log-count", `${data.line_count || lines.length} Log-Zeilen`);
  } catch (error) {
    console.error(error);
    if (log) log.textContent = "Container-Logs konnten nicht geladen werden.";
    setHealthText("app-diag-log-count", "Logs nicht verfügbar");
  }
}

async function checkSelectedAppUpdate() {
  if (!selectedAppContainer || currentRole === "viewer") return;
  const button = document.getElementById("app-diag-update-check");
  if (button) { button.disabled = true; button.textContent = "Prüfe …"; }
  setHealthText("app-diag-update", "Registry wird geprüft …");
  try {
    const data = await request("/api/apps/update-check", {
      method:"POST",
      body:JSON.stringify({name:selectedAppContainer}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    const text = data.update_available === true ? "Update verfügbar" :
      data.update_available === false ? "Image ist aktuell" : "Nicht eindeutig prüfbar";
    setHealthText("app-diag-update", text);
    showN2KToast(text, data.update_available ? "success" : "info");
  } catch (error) {
    console.error(error);
    setHealthText("app-diag-update", "Update-Prüfung fehlgeschlagen");
    showN2KToast("Update-Prüfung konnte nicht durchgeführt werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Update prüfen"; }
  }
}

async function loadApps() {
  if (document.getElementById("app-shell").classList.contains("hidden")) return;
  const summary = document.getElementById("apps-summary");
  const list = document.getElementById("apps-list");
  if (!summary || !list) return;
  try {
    const data = await request("/api/apps", {headers: {}});
    const containers = Array.isArray(data.containers) ? data.containers : [];
    if (!data.available) {
      summary.textContent = "Docker-Inventar momentan nicht verfügbar.";
      list.innerHTML = "";
      return;
    }
    const meta = data.summary || {};
    const running = Number.isFinite(Number(meta.running)) ? Number(meta.running) : containers.filter(item => item.state === "running").length;
    setHealthText("apps-total", String(meta.total ?? containers.length));
    setHealthText("apps-running", String(running));
    setHealthText("apps-managed", String(meta.managed ?? containers.filter(item => item.managed).length));
    setHealthText("apps-core", String(meta.core ?? containers.filter(item => item.core).length));
    summary.textContent = `${containers.length} Container · ${running} aktiv`;
    list.innerHTML = "";

    for (const item of containers) {
      const row = document.createElement("article");
      row.className = "app-row app-row-v2";
      row.innerHTML = `
        <div class="app-v2-head">
          <div class="app-v2-icon"></div>
          <div class="app-v2-title"><strong></strong><small></small></div>
          <span class="state-pill"></span>
        </div>
        <div class="app-v2-metrics">
          <div><small>CPU</small><strong class="app-cpu">–</strong></div>
          <div><small>RAM</small><strong class="app-ram">–</strong></div>
          <div><small>NET I/O</small><strong class="app-net">–</strong></div>
          <div><small>PIDs</small><strong class="app-pids">–</strong></div>
        </div>
        <div class="app-v2-detail">
          <span class="app-ports"></span>
          <span class="app-volumes"></span>
        </div>
        <div class="app-v2-footer">
          <span class="app-role"></span>
          <div class="app-actions"></div>
        </div>`;
      row.querySelector(".app-v2-icon").textContent = item.core ? "SYS" : "APP";
      row.querySelector(".app-v2-title strong").textContent = item.name || item.id || "Container";
      row.querySelector(".app-v2-title small").textContent = item.image || "unbekanntes Image";
      const pill = row.querySelector(".state-pill");
      pill.textContent = item.state || "unknown";
      pill.classList.toggle("running", item.state === "running");
      row.querySelector(".app-cpu").textContent = item.stats?.cpu_percent || "–";
      row.querySelector(".app-ram").textContent = item.stats?.memory_usage || "–";
      row.querySelector(".app-net").textContent = item.stats?.network_io || "–";
      row.querySelector(".app-pids").textContent = item.stats?.pids || "–";
      row.querySelector(".app-ports").textContent = formatContainerPorts(item.ports);
      row.querySelector(".app-volumes").textContent = `${(item.mounts || []).length} Volume${(item.mounts || []).length === 1 ? "" : "s"} · Restart: ${item.restart_policy || "no"}`;

      const role = row.querySelector(".app-role");
      role.textContent = item.core ? "N2K Core · geschützt" : item.managed ? "N2K App · verwaltet" : "Container";
      const actions = row.querySelector(".app-actions");
      const details = document.createElement("button");
      details.className = "mini-action";
      details.textContent = "Details";
      details.addEventListener("click", () => openAppDiagnostics(item));
      actions.appendChild(details);

      if (item.managed && currentRole !== "viewer") {
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
      list.innerHTML = '<div class="app-empty">Keine N2K Docker-Container gefunden.</div>';
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
  if (currentRole === "viewer") return;
  if (!confirm(`${name}: ${action} wirklich ausführen?`)) return;
  try {
    await request("/api/apps/action", {
      method: "POST",
      body: JSON.stringify({name, action}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    showN2KToast("Container-Aktion ausgeführt.", "success");
    setTimeout(loadApps, 700);
  } catch (error) {
    console.error(error);
    showN2KToast("App-Aktion konnte nicht ausgeführt werden.", "error");
  }
}

async function checkCatalogContainerUpdate(name, button, badge) {
  if (!name || currentRole === "viewer") return;
  const original = button?.textContent || "Update prüfen";
  if (button) { button.disabled = true; button.textContent = "Prüfe …"; }
  try {
    const data = await request("/api/apps/update-check", {
      method:"POST",
      body:JSON.stringify({name}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    if (badge) {
      badge.textContent = data.update_available === true ? "Update verfügbar" :
        data.update_available === false ? "Aktuell" : "Unklar";
      badge.className = `status-chip ${data.update_available === false ? "good" : data.update_available === true ? "warn" : ""}`;
    }
    showN2KToast(data.update_available === true ? "Für diese App ist ein neuer Image-Stand verfügbar." :
      data.update_available === false ? "Die App ist auf dem aktuellen Image-Stand." :
      "Der Registry-Stand konnte nicht eindeutig verglichen werden.", "info");
  } catch (error) {
    console.error(error);
    if (badge) {
      badge.textContent = "Prüfung fehlgeschlagen";
      badge.className = "status-chip";
    }
    showN2KToast("Update-Prüfung konnte nicht durchgeführt werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
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
        if (currentRole !== "viewer" && app.container) {
          const check = document.createElement("button");
          check.className = "mini-action";
          check.textContent = "Update prüfen";
          check.addEventListener("click", () => checkCatalogContainerUpdate(app.container, check, badge));
          action.appendChild(check);
        }
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
      showN2KToast("Installation nicht möglich: Der benötigte Port ist bereits belegt.");
    } else {
      showN2KToast("App konnte nicht installiert werden.");
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
        showN2KToast("Installiere zuerst die optionale Office-Engine.");
      }
    } catch (error) {
      console.error(error);
    }
  });
});

function storageSmartForDevice(data, device) {
  const rows = Array.isArray(data?.smart?.drives) ? data.smart.drives : [];
  return rows.find(item => item.device === device.path || item.device === `/dev/${device.name}`) || null;
}

function storageTypeLabel(device) {
  if (device.type === "disk") return device.rotational ? "HDD" : "SSD";
  if (device.type === "part") return "PART";
  if (device.type === "rom") return "ROM";
  if (device.type === "lvm") return "LVM";
  if (device.type === "crypt") return "CRYPT";
  return (device.type || "DEV").toUpperCase();
}

function renderStorageInventory(data) {
  const devices = Array.isArray(data.devices) ? data.devices : [];
  const summary = data.summary || {};
  setHealthText("storage-device-summary", `${summary.disks || 0} Disks · ${summary.partitions || 0} Partitionen · ${summary.mounted || 0} gemountet`);

  const list = document.getElementById("storage-device-list");
  if (list) {
    list.innerHTML = "";
    if (!devices.length) {
      list.innerHTML = '<div class="app-empty">Keine Blockgeräte erkannt.</div>';
    } else {
      devices.forEach(device => {
        const smart = storageSmartForDevice(data, device);
        const row = document.createElement("div");
        row.className = `storage-device-row storage-type-${device.type || "other"}`;
        row.innerHTML = `
          <span class="storage-device-kind"></span>
          <div class="storage-device-main"><strong></strong><small></small><span></span></div>
          <div class="storage-device-fs"><strong></strong><small></small></div>
          <div class="storage-device-state"><strong></strong><small></small></div>
          <div class="storage-device-actions"></div>`;
        row.querySelector(".storage-device-kind").textContent = storageTypeLabel(device);
        row.querySelector(".storage-device-main strong").textContent =
          [device.vendor, device.model].filter(Boolean).join(" ") || device.label || device.path || device.name;
        row.querySelector(".storage-device-main small").textContent =
          `${device.path || "–"} · ${formatBytes(Number(device.size_bytes))} · ${device.transport || (device.parent ? "Partition" : "intern")}`;
        row.querySelector(".storage-device-main span").textContent =
          device.serial ? `S/N ${device.serial}` : device.uuid ? `UUID ${device.uuid}` : "–";
        row.querySelector(".storage-device-fs strong").textContent = device.filesystem || "Kein Dateisystem";
        row.querySelector(".storage-device-fs small").textContent =
          device.label ? `Label: ${device.label}` : device.fs_used_percent ? `${device.fs_used_percent} belegt` : "–";
        const mounts = Array.isArray(device.mountpoints) ? device.mountpoints : [];
        row.querySelector(".storage-device-state strong").textContent = mounts.length ? "GEMOUNTET" : "NICHT GEMOUNTET";
        row.querySelector(".storage-device-state strong").className = mounts.length ? "ok" : "";
        row.querySelector(".storage-device-state small").textContent =
          mounts.length ? mounts.join(" · ") : smart?.health === "passed" ? "SMART OK" : smart?.health === "failed" ? "SMART FEHLER" : "Bereit";

        const actions = row.querySelector(".storage-device-actions");
        if (currentRole === "admin" && device.mountable) {
          const button = document.createElement("button");
          button.className = "secondary compact";
          button.textContent = "Mounten";
          button.addEventListener("click", () => storageMountAction(device.path, "mount", button));
          actions.appendChild(button);
        } else if (currentRole === "admin" && device.managed_mount) {
          const button = document.createElement("button");
          button.className = "secondary compact";
          button.textContent = "Aushängen";
          button.addEventListener("click", () => storageMountAction(device.path, "unmount", button));
          actions.appendChild(button);
        } else {
          const note = document.createElement("span");
          note.textContent = device.mounted ? "System/Fremd-Mount" : device.filesystem ? "Nur lesen" : "–";
          actions.appendChild(note);
        }
        list.appendChild(row);
      });
    }
  }

  const raid = data.raid || {};
  const mdraid = Array.isArray(raid.mdraid) ? raid.mdraid : [];
  const zpools = Array.isArray(raid.zpools) ? raid.zpools : [];
  setHealthText("storage-mdraid-count", String(mdraid.length));
  setHealthText("storage-zfs-count", String(zpools.length));

  const mdList = document.getElementById("storage-mdraid-list");
  if (mdList) {
    mdList.innerHTML = mdraid.length ? "" : '<div class="health-empty">Keine mdRAID-Arrays erkannt.</div>';
    mdraid.forEach(array => {
      const row = document.createElement("div");
      row.className = "storage-pool-row";
      row.innerHTML = "<div><strong></strong><small></small></div><span></span>";
      row.querySelector("strong").textContent = array.name || "mdRAID";
      row.querySelector("small").textContent = `${array.level || "RAID"} · ${(array.members || []).join(" · ") || "keine Memberdaten"}`;
      row.querySelector("span").textContent = array.state || "unknown";
      mdList.appendChild(row);
    });
  }

  const zList = document.getElementById("storage-zfs-list");
  if (zList) {
    zList.innerHTML = zpools.length ? "" : '<div class="health-empty">Keine ZFS-Pools erkannt.</div>';
    zpools.forEach(pool => {
      const row = document.createElement("div");
      row.className = "storage-pool-row";
      row.innerHTML = "<div><strong></strong><small></small></div><span></span>";
      row.querySelector("strong").textContent = pool.name || "ZFS";
      row.querySelector("small").textContent = `${pool.allocated || "–"} belegt · ${pool.free || "–"} frei · ${pool.size || "–"} gesamt`;
      row.querySelector("span").textContent = pool.health || "unknown";
      row.querySelector("span").className = String(pool.health || "").toUpperCase() === "ONLINE" ? "ok" : "";
      zList.appendChild(row);
    });
  }
}

async function storageMountAction(device, operation, button) {
  if (currentRole !== "admin") return;
  const original = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = operation === "mount" ? "Mounte …" : "Hänge aus …";
  }
  try {
    await request(`/api/storage/${operation}`, {
      method:"POST",
      body:JSON.stringify({device}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast(operation === "mount" ? "Datenträger wurde eingebunden." : "Datenträger wurde ausgehängt.", "success");
    await loadStorage();
  } catch (error) {
    console.error(error);
    const messages = {
      storage_device_not_mountable: "Datenträger kann nicht automatisch gemountet werden.",
      storage_mount_not_managed: "Nur durch N2K gemountete Datenträger dürfen hier ausgehängt werden."
    };
    showN2KToast(messages[error.code] || "Speicheraktion fehlgeschlagen.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
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
    renderStorageInventory(data);
  } catch (error) {
    console.error(error);
    main.textContent = "Speicherstatus nicht erreichbar";
    detail.textContent = "–";
    meter.style.width = "0%";
    haos.textContent = "–";
  }
}

function formatVmDisks(disks = []) {
  return disks.length ? disks.map(disk => {
    const size = Number.isFinite(Number(disk.size_bytes)) ? ` · ${formatBytes(Number(disk.size_bytes))}` : "";
    return `${disk.target || "disk"} · ${disk.device || disk.type || "storage"}${size}`;
  }).join(" · ") : "Keine Datenträgerdaten";
}

function formatVmNetworks(interfaces = []) {
  return interfaces.length ? interfaces.map(item => {
    return [item.source || item.type || "net", item.mac, item.address].filter(Boolean).join(" · ");
  }).join(" | ") : "Keine Netzwerkschnittstellen";
}

function renderVmSnapshots(container, vm) {
  container.innerHTML = "";
  const snapshots = Array.isArray(vm.snapshots) ? vm.snapshots : [];
  if (!snapshots.length) {
    container.innerHTML = '<div class="vm-snapshot-empty">Keine Snapshots vorhanden.</div>';
    return;
  }
  snapshots.slice(0, 8).forEach(snapshot => {
    const row = document.createElement("div");
    row.className = "vm-snapshot-row";
    row.innerHTML = "<strong></strong><span></span><small></small>";
    row.querySelector("strong").textContent = snapshot.name || "Snapshot";
    row.querySelector("span").textContent = snapshot.state || "–";
    row.querySelector("small").textContent = snapshot.created || "Zeit unbekannt";
    container.appendChild(row);
  });
}

async function vmAction(name, operation, button) {
  if (currentRole === "viewer") return;
  if (!confirm(`${name}: ${operation} wirklich ausführen?`)) return;
  const original = button?.textContent || "";
  if (button) { button.disabled = true; button.textContent = "Bitte warten …"; }
  try {
    await request("/api/vms/action", {
      method:"POST",
      body:JSON.stringify({name, operation}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast("VM-Aktion ausgeführt.", "success");
    setTimeout(loadVms, 600);
  } catch (error) {
    console.error(error);
    showN2KToast("VM-Aktion fehlgeschlagen.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function createVmSnapshot(name, button) {
  if (currentRole !== "admin") return;
  if (!confirm(`${name}: neuen Snapshot erstellen? Je nach Storage kann das kurz zusätzliche I/O erzeugen.`)) return;
  const original = button?.textContent || "Snapshot";
  if (button) { button.disabled = true; button.textContent = "Erstelle …"; }
  try {
    await request("/api/vms/snapshot", {
      method:"POST",
      body:JSON.stringify({name}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast("VM-Snapshot wurde erstellt.", "success");
    await loadVms();
  } catch (error) {
    console.error(error);
    showN2KToast("Snapshot konnte nicht erstellt werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function loadVms() {
  const list = document.getElementById("vm-list");
  if (!list) return;
  try {
    const data = await request("/api/vms", {headers: {}});
    const vms = Array.isArray(data.vms) ? data.vms : [];
    const summary = data.summary || {};
    setHealthText("vm-count-total", String(summary.total ?? vms.length));
    setHealthText("vm-count-running", String(summary.running ?? vms.filter(vm => vm.state === "running").length));
    setHealthText("vm-count-autostart", String(summary.autostart ?? vms.filter(vm => vm.autostart).length));
    setHealthText("vm-count-snapshots", String(summary.snapshots ?? vms.reduce((sum, vm) => sum + (vm.snapshots || []).length, 0)));

    list.innerHTML = "";
    for (const vm of vms) {
      const card = document.createElement("article");
      card.className = "vm-card-v2";
      card.innerHTML = `
        <div class="vm-card-head">
          <div class="app-icon small vm-card-icon"></div>
          <div class="vm-card-title"><strong></strong><span></span></div>
          <span class="state-pill vm-card-state"></span>
        </div>
        <div class="vm-resource-grid">
          <div><small>vCPU</small><strong class="vm-vcpu">–</strong></div>
          <div><small>RAM</small><strong class="vm-ram">–</strong></div>
          <div><small>AUTOSTART</small><strong class="vm-autostart">–</strong></div>
          <div><small>CPU TIME</small><strong class="vm-cpu-time">–</strong></div>
        </div>
        <div class="vm-detail-lines">
          <div><small>DISKS</small><span class="vm-disks"></span></div>
          <div><small>NETZWERK</small><span class="vm-networks"></span></div>
        </div>
        <div class="vm-card-actions"></div>
        <section class="vm-snapshot-card">
          <div class="vm-snapshot-head"><div><small>SNAPSHOTS</small><strong>Wiederherstellungspunkte</strong></div><button class="secondary compact vm-snapshot-create">+ Snapshot</button></div>
          <div class="vm-snapshot-list"></div>
        </section>`;
      card.querySelector(".vm-card-icon").textContent = vm.managed ? "HA" : "VM";
      card.querySelector(".vm-card-title strong").textContent = vm.managed ? "Home Assistant OS" : vm.name;
      card.querySelector(".vm-card-title span").textContent = vm.name;
      const state = card.querySelector(".vm-card-state");
      state.textContent = vm.state || "unknown";
      state.classList.toggle("running", vm.state === "running");
      card.querySelector(".vm-vcpu").textContent = Number.isFinite(Number(vm.vcpus)) ? String(vm.vcpus) : "–";
      card.querySelector(".vm-ram").textContent = Number.isFinite(Number(vm.memory_bytes)) ? formatBytes(Number(vm.memory_bytes)) : "–";
      card.querySelector(".vm-autostart").textContent = vm.autostart ? "AN" : "AUS";
      card.querySelector(".vm-cpu-time").textContent = vm.cpu_time || "–";
      card.querySelector(".vm-disks").textContent = formatVmDisks(vm.disks || []);
      card.querySelector(".vm-networks").textContent = formatVmNetworks(vm.interfaces || []);

      const actions = card.querySelector(".vm-card-actions");
      if (currentRole !== "viewer") {
        const make = (label, operation, cls="secondary") => {
          const button = document.createElement("button");
          button.className = cls + " compact";
          button.textContent = label;
          button.addEventListener("click", () => vmAction(vm.name, operation, button));
          return button;
        };
        if (vm.state === "running") {
          actions.appendChild(make("↻ Neustart", "restart"));
          actions.appendChild(make("⏻ Herunterfahren", "shutdown", "danger"));
        } else {
          actions.appendChild(make("▶ Starten", "start", "primary"));
        }
      }

      const snapshotButton = card.querySelector(".vm-snapshot-create");
      snapshotButton.classList.toggle("hidden", currentRole !== "admin");
      snapshotButton.addEventListener("click", () => createVmSnapshot(vm.name, snapshotButton));
      renderVmSnapshots(card.querySelector(".vm-snapshot-list"), vm);
      list.appendChild(card);
    }

    if (!vms.length) {
      list.innerHTML = '<div class="app-empty">Keine KVM-VMs gefunden.</div>';
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">VM-Liste konnte nicht geladen werden.</div>';
  }
}


function backupPolicyLabel(policy) {
  if (!policy?.enabled) return "Deaktiviert";
  const hour = String(Number(policy.hour) || 0).padStart(2, "0") + ":00";
  if (policy.frequency === "weekly") {
    const days = ["Mo","Di","Mi","Do","Fr","Sa","So"];
    return (days[Number(policy.weekday)] || "Wöchentlich") + " · " + hour;
  }
  return "Täglich · " + hour;
}

function renderBackupPolicy(policy = {}) {
  const enabled = document.getElementById("backup-policy-enabled");
  const frequency = document.getElementById("backup-policy-frequency");
  const hour = document.getElementById("backup-policy-hour");
  const weekday = document.getElementById("backup-policy-weekday");
  const retention = document.getElementById("backup-policy-retention");
  const verify = document.getElementById("backup-policy-verify");
  const path = document.getElementById("backup-target-path");
  if (enabled) enabled.checked = Boolean(policy.enabled);
  if (frequency) frequency.value = policy.frequency === "weekly" ? "weekly" : "daily";
  if (hour) hour.value = String(Number.isFinite(Number(policy.hour)) ? Number(policy.hour) : 3);
  if (weekday) weekday.value = String(Number.isFinite(Number(policy.weekday)) ? Number(policy.weekday) : 6);
  if (retention) retention.value = String(Number(policy.retention) || 7);
  if (verify) verify.checked = policy.verify_after_create !== false;
  if (path) path.value = policy.target_path || "";
  document.querySelectorAll('input[name="backup-target"]').forEach(input => {
    input.checked = input.value === (policy.target === "mounted" ? "mounted" : "local");
  });
  const weekdayWrap = document.getElementById("backup-weekday-wrap");
  weekdayWrap?.classList.toggle("hidden", policy.frequency !== "weekly");
  const pathWrap = document.getElementById("backup-target-path-wrap");
  pathWrap?.classList.toggle("hidden", policy.target !== "mounted");
  const targetState = document.getElementById("backup-target-state");
  if (targetState) targetState.textContent = policy.target === "mounted" ? "Lokal + extern" : "Lokal";

  const lastScheduled = Number(policy.last_scheduled_at);
  document.getElementById("backup-health-schedule").textContent = backupPolicyLabel(policy);
  document.getElementById("backup-health-next").textContent = policy.enabled
    ? (Number.isFinite(lastScheduled) && lastScheduled > 0 ? "Letzter Lauf: " + formatDateTime(lastScheduled) : "Wartet auf ersten geplanten Lauf")
    : "Automatische Sicherung ist aus";
  document.getElementById("backup-health-retention").textContent = String(Number(policy.retention) || 7) + " Backups";
  document.getElementById("backup-health-target").textContent =
    policy.target === "mounted" ? (policy.target_path || "Externes Ziel") : "Lokaler Server";
}

function renderBackupArchive(backups = []) {
  const list = document.getElementById("backup-list");
  if (!list) return;
  list.innerHTML = "";
  const latest = backups[0];

  const last = document.getElementById("backup-health-last");
  const lastMeta = document.getElementById("backup-health-last-meta");
  const integrity = document.getElementById("backup-health-integrity");
  const integrityMeta = document.getElementById("backup-health-integrity-meta");
  if (latest) {
    if (last) last.textContent = formatDateTime(latest.created_at);
    if (lastMeta) lastMeta.textContent = formatBytes(latest.size_bytes) + " · " + (latest.reason === "scheduled" ? "automatisch" : "manuell");
    if (integrity) integrity.textContent = latest.verified === true ? "Verifiziert" : latest.verified === false ? "Fehler" : "Nicht geprüft";
    if (integrityMeta) integrityMeta.textContent = latest.verified_at ? "Geprüft " + formatDateTime(latest.verified_at) : "SHA-256 Integritätsprüfung";
  } else {
    if (last) last.textContent = "Noch keines";
    if (lastMeta) lastMeta.textContent = "Erstelle den ersten Wiederherstellungspunkt";
    if (integrity) integrity.textContent = "Nicht geprüft";
    if (integrityMeta) integrityMeta.textContent = "SHA-256 Integritätsprüfung";
  }

  const summary = document.getElementById("backup-archive-summary");
  if (summary) {
    const verifiedCount = backups.filter(item => item.verified === true).length;
    summary.textContent = backups.length + " Backups · " + verifiedCount + " verifiziert";
  }

  for (const backup of backups) {
    const row = document.createElement("div");
    row.className = "backup-row backup-row-v2";
    const statusClass = backup.verified === true ? "ok" : backup.verified === false ? "bad" : "warn";
    const statusText = backup.verified === true ? "VERIFIZIERT" : backup.verified === false ? "FEHLER" : "UNGEPRÜFT";
    row.innerHTML = `
      <div class="backup-row-icon">↺</div>
      <div class="backup-row-copy">
        <div class="backup-row-title"><strong></strong><span class="backup-integrity-chip ${statusClass}"></span></div>
        <small class="backup-meta"></small>
        <div class="backup-row-tags"></div>
      </div>
      <div class="backup-row-actions">
        <button class="secondary compact backup-verify-btn">Prüfen</button>
        <button class="secondary compact backup-test-btn">Restore-Test</button>
        <button class="secondary compact backup-restore-btn">Wiederherstellen</button>
      </div>`;
    row.querySelector(".backup-row-title strong").textContent = backup.id;
    row.querySelector(".backup-integrity-chip").textContent = statusText;
    const appText = Array.isArray(backup.apps) && backup.apps.length
      ? " · Apps: " + backup.apps.join(", ")
      : "";
    row.querySelector(".backup-meta").textContent =
      formatDateTime(backup.created_at) + " · " + formatBytes(backup.size_bytes) + appText;

    const tags = row.querySelector(".backup-row-tags");
    const tagValues = [
      backup.reason === "scheduled" ? "Automatisch" : backup.reason === "update" ? "Update-Recovery" : "Manuell",
      backup.replicated ? "Externe Kopie" : "Lokal",
      backup.verified_at ? "Prüfung " + formatDateTime(backup.verified_at) : "",
      backup.restore_ready === true ? "Restore-Test OK" : backup.restore_ready === false ? "Restore-Test Fehler" : ""
    ].filter(Boolean);
    tagValues.forEach(value => {
      const tag = document.createElement("span");
      tag.textContent = value;
      tags.appendChild(tag);
    });

    row.querySelector(".backup-verify-btn").addEventListener("click", () => verifyBackup(backup.id));
    row.querySelector(".backup-test-btn").addEventListener("click", () => testRestoreBackup(backup.id));
    row.querySelector(".backup-restore-btn").addEventListener("click", () => restoreBackup(backup.id));
    list.appendChild(row);
  }

  if (!backups.length) {
    list.innerHTML = '<div class="app-empty">Noch kein Netfreak2k-Backup vorhanden.</div>';
  }
}

async function loadBackups() {
  const list = document.getElementById("backup-list");
  if (!list) return;
  try {
    const data = await request("/api/backups", {headers: {}});
    renderBackupPolicy(data.policy || {});
    renderBackupArchive(Array.isArray(data.backups) ? data.backups : []);
  } catch (error) {
    console.error(error);
    list.innerHTML = '<div class="app-empty">Backup-Status konnte nicht geladen werden.</div>';
  }
}

async function createBackup() {
  const button = document.getElementById("create-backup");
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Sicherung läuft …";
  try {
    const result = await request("/api/backups/create", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    const verified = result.verification?.ok;
    showN2KToast(verified === false ? "Backup erstellt, Integritätsprüfung meldet einen Fehler." : "Backup und Wiederherstellungspunkt erstellt.", verified === false ? "error" : "success");
    await loadBackups();
    loadNotifications();
  } catch (error) {
    console.error(error);
    showN2KToast("Backup konnte nicht erstellt werden.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function verifyBackup(backupId) {
  const buttons = document.querySelectorAll(".backup-verify-btn");
  buttons.forEach(button => button.disabled = true);
  try {
    const result = await request("/api/backups/verify", {
      method: "POST",
      body: JSON.stringify({backup_id: backupId}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    showN2KToast(
      result.ok ? "Backup wurde vollständig verifiziert." : "Integritätsprüfung fehlgeschlagen.",
      result.ok ? "success" : "error"
    );
    await loadBackups();
  } catch (error) {
    console.error(error);
    showN2KToast("Backup konnte nicht verifiziert werden.", "error");
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

async function testRestoreBackup(backupId) {
  const buttons = document.querySelectorAll(".backup-test-btn");
  buttons.forEach(button => button.disabled = true);
  try {
    const result = await request("/api/backups/test-restore", {
      method: "POST",
      body: JSON.stringify({backup_id: backupId}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    const failed = Array.isArray(result.checks) ? result.checks.filter(item => !item.ok) : [];
    showN2KToast(
      result.ok ? "Restore-Test erfolgreich: Backup ist wiederherstellbar." : "Restore-Test meldet " + failed.length + " Problem(e).",
      result.ok ? "success" : "error"
    );
    await loadBackups();
  } catch (error) {
    console.error(error);
    showN2KToast("Restore-Test konnte nicht abgeschlossen werden.", "error");
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

async function saveBackupPolicy() {
  const button = document.getElementById("backup-policy-save");
  const target = document.querySelector('input[name="backup-target"]:checked')?.value || "local";
  const fields = {
    enabled: Boolean(document.getElementById("backup-policy-enabled")?.checked),
    frequency: document.getElementById("backup-policy-frequency")?.value || "daily",
    hour: Number(document.getElementById("backup-policy-hour")?.value || 3),
    weekday: Number(document.getElementById("backup-policy-weekday")?.value || 6),
    retention: Number(document.getElementById("backup-policy-retention")?.value || 7),
    verify_after_create: Boolean(document.getElementById("backup-policy-verify")?.checked),
    target: target,
    target_path: target === "mounted" ? (document.getElementById("backup-target-path")?.value || "") : ""
  };
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Speichere …"; }
  try {
    await request("/api/backups/policy", {
      method: "POST",
      body: JSON.stringify({fields: fields}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    showN2KToast("Backup-Plan gespeichert.", "success");
    await loadBackups();
  } catch (error) {
    console.error(error);
    showN2KToast("Backup-Plan konnte nicht gespeichert werden. Prüfe den Zielpfad.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function pruneBackups() {
  const button = document.getElementById("backup-prune");
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Räume auf …"; }
  try {
    const result = await request("/api/backups/prune", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    const removed = Array.isArray(result.removed) ? result.removed.length : 0;
    showN2KToast(removed ? removed + " alte Backups entfernt." : "Aufbewahrung ist bereits sauber.", "success");
    await loadBackups();
  } catch (error) {
    console.error(error);
    showN2KToast("Aufbewahrung konnte nicht angewendet werden.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function restoreBackup(backupId) {
  const first = confirm(
    "Backup " + backupId + " wiederherstellen? Vor dem Restore wird die Integrität erneut geprüft."
  );
  if (!first) return;
  const second = confirm(
    "Vorhandene Netfreak2k-Admin- und App-Daten werden durch diesen geprüften Backup-Stand ersetzt. Wirklich fortfahren?"
  );
  if (!second) return;
  try {
    showN2KToast("Integrität wird geprüft, danach startet die Wiederherstellung.", "info");
    await request("/api/backups/restore", {
      method: "POST",
      body: JSON.stringify({backup_id: backupId}),
      headers: {"X-CSRF-Token": csrfToken}
    });
    showN2KToast("Geprüfte Wiederherstellung wurde gestartet. Die Oberfläche lädt gleich neu.", "success");
    setTimeout(() => window.location.reload(), 12000);
  } catch (error) {
    console.error(error);
    showN2KToast("Wiederherstellung wurde abgebrochen. Backup oder Integrität prüfen.", "error");
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

async function playWorkspaceAudio(name, relPath = "") {
  try {
    await loadMediaLibrary();
    const index = mediaLocalTracks.findIndex(track =>
      track.name === name && String(track.path || "") === String(relPath || "")
    );
    if (index < 0) {
      showN2KToast("Titel wurde im Audio-Ordner nicht gefunden.", "error");
      return;
    }
    switchView("media-center-panel");
    applyMediaSection("library");
    await playLocalTrack(index);
  } catch (error) {
    console.error(error);
    showN2KToast("Titel konnte nicht aus dem Arbeitsplatz gestartet werden.", "error");
  }
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
        const isAudioFile = workspaceArea === "audio" && /\.(mp3|m4a|aac|flac|wav|ogg|opus|weba)$/i.test(item.name);
        if (isAudioFile) {
          const play = document.createElement("button");
          play.className = "mini-action primary-mini";
          play.textContent = "▶ Abspielen";
          play.addEventListener("click", () => playWorkspaceAudio(item.name, workspacePath));
          row.querySelector(".file-actions").appendChild(play);
        }
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
          showN2KToast(`${file.name} konnte nicht ersetzt werden.`);
          break;
        }
      } else {
        console.error(error);
        showN2KToast(`${file.name} konnte nicht hochgeladen werden.`);
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
    showN2KToast("Ordner konnte nicht erstellt werden.");
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
    showN2KToast("Aktion konnte nicht ausgeführt werden.");
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
    showN2KToast("Umbenennen nicht möglich.");
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
    showN2KToast("Wiederherstellung nicht möglich.");
  }
}

async function shareWorkspaceItem(name) {
  const raw = prompt("Freigabe gültig für wie viele Stunden?", "24");
  if (!raw) return;
  const hours = Number.parseInt(raw, 10);
  if (!Number.isFinite(hours) || hours < 1) {
    showN2KToast("Bitte eine gültige Stundenanzahl eingeben.");
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
      showN2KToast("Freigabelink wurde kopiert.");
    } catch (_) {
      prompt("Freigabelink:", url);
    }
    await loadShares();
  } catch (error) {
    console.error(error);
    showN2KToast("Freigabelink konnte nicht erstellt werden.");
  }
}

function openSearchResult(result) {
  if (result.kind === "command") {
    switchView(result.target);
    return;
  }
  if (result.kind === "service") {
    window.open(result.url, "n2k-media-streaming", "noopener,noreferrer");
    return;
  }
  if (result.kind === "radio") {
    switchView("media-center-panel");
    mediaActiveSection = "radio";
    applyMediaSection("radio");
    let index = mediaStations.findIndex(item => String(item.id) === String(result.station.id));
    if (index < 0) {
      mediaStations = [...mediaStations, result.station];
      index = mediaStations.length - 1;
    }
    playMediaStation(index);
    return;
  }
  if (result.kind === "local-audio") {
    switchView("media-center-panel");
    mediaActiveSection = "library";
    applyMediaSection("library");
    const index = mediaLocalTracks.findIndex(item => String(item.id) === String(result.track.id));
    if (index >= 0) playLocalTrack(index);
    return;
  }
  if (result.kind === "calendar") {
    switchView("calendar-panel");
    return;
  }
  workspaceArea = result.area;
  workspacePath = result.path || "";
  document.querySelectorAll(".drive-area").forEach(item => {
    item.classList.toggle("active", item.dataset.area === workspaceArea);
  });
  switchView("workspace-panel");
  loadWorkspace().then(() => {
    const rows = Array.from(document.querySelectorAll(".workspace-row"));
    const row = rows.find(item => item.querySelector("strong")?.textContent === result.name);
    row?.classList.add("search-hit");
    setTimeout(() => row?.classList.remove("search-hit"), 2500);
  });
}

function localGlobalSearchResults(query) {
  const q = query.toLowerCase();
  const results = [];
  const matches = value => String(value || "").toLowerCase().includes(q);

  for (const entry of N2K_SEARCH_COMMANDS) {
    if (matches(entry.name) || matches(entry.detail) || matches(entry.keywords)) results.push(entry);
  }

  const services = [
    ...N2K_PRIMARY_MEDIA_SERVICES,
    ...N2K_GERMANY_MEDIA_SERVICES.map(item => ({
      kind:"service", name:item.name, detail:`${item.category} · ${item.detail}`, url:item.url
    }))
  ];
  for (const entry of services) {
    if (matches(entry.name) || matches(entry.detail)) results.push(entry);
  }

  for (const track of mediaLocalTracks) {
    if (matches(track.title) || matches(track.name) || matches(track.artist) || matches(track.album) || matches(track.genre) || matches(track.path)) {
      results.push({
        kind:"local-audio",
        name: track.title || track.name,
        detail: [track.artist, track.album, "Eigene Musik"].filter(Boolean).join(" · "),
        track
      });
    }
    if (results.length > 60) break;
  }

  document.querySelectorAll("#apps-list .app-row strong").forEach(node => {
    const name = node.textContent?.trim();
    if (name && matches(name)) results.push({kind:"command", name, detail:"Installierte App", target:"apps-panel", keywords:"app"});
  });
  document.querySelectorAll("#vm-list .vm-row strong").forEach(node => {
    const name = node.textContent?.trim();
    if (name && matches(name)) results.push({kind:"command", name, detail:"Virtuelle Maschine", target:"vms-panel", keywords:"vm"});
  });

  const radioPool = [...getMediaFavoriteStations(), ...mediaStations];
  const seen = new Set();
  for (const station of radioPool) {
    if (station?.source === "local" || seen.has(String(station.id))) continue;
    seen.add(String(station.id));
    if (matches(station.name) || matches(station.genre) || matches(station.country)) {
      results.push({
        kind:"radio",
        name: station.name,
        detail: `Radio · ${station.country || "Internet"} · ${station.genre || ""}`,
        station
      });
    }
    if (results.length > 80) break;
  }
  return results;
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
    const [data] = await Promise.all([
      request(`/api/search?q=${encodeURIComponent(q)}`, {headers: {}})
    ]);
    const remote = Array.isArray(data.results) ? data.results : [];
    const local = localGlobalSearchResults(q);
    const results = [...local, ...remote].slice(0, 18);

    box.innerHTML = "";
    for (const result of results) {
      const button = document.createElement("button");
      button.className = `search-result search-${result.kind || "file"}`;
      button.innerHTML = "<strong></strong><small></small>";
      button.querySelector("strong").textContent = result.title || result.name || "Treffer";
      if (result.kind === "calendar") {
        button.querySelector("small").textContent = "Kalender";
      } else if (["command","service","radio","local-audio"].includes(result.kind)) {
        button.querySelector("small").textContent = result.detail || "";
      } else {
        button.querySelector("small").textContent =
          `${workspaceAreaNames[result.area] || result.area}${result.path ? " / " + result.path : ""}`;
      }
      button.addEventListener("click", () => {
        box.classList.add("hidden");
        input.blur();
        openSearchResult(result);
      });
      box.appendChild(button);
    }
    if (!results.length) box.innerHTML = '<div class="search-empty">Keine Treffer.</div>';
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
    showN2KToast("Favorit konnte nicht geändert werden.");
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
    showN2KToast("Freigabe konnte nicht widerrufen werden.");
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
    showN2KToast("Ungültiger Zielbereich.");
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
    showN2KToast(`${mode === "copy" ? "Kopieren" : "Verschieben"} nicht möglich.`);
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
    showN2KToast("Version konnte nicht wiederhergestellt werden.");
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
    showN2KToast("Titel und Beginn sind erforderlich.");
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
    showN2KToast("Termin konnte nicht gespeichert werden.");
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
    showN2KToast("Termin konnte nicht gelöscht werden.");
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
    const location = prefs.weather_location || "";
    const input=document.getElementById("n2k-location-input");if(input)input.value=location;
    updateTopWeather(Boolean(location));
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
    showN2KToast("Wallpaper konnte nicht gespeichert werden.");
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
    showN2KToast("Sync-Zugang konnte nicht erstellt werden.");
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
    showN2KToast("Sync-Zugang konnte nicht widerrufen werden.");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    prompt("Kopieren:", text);
  }
}

// Separate Reticulum transport-node settings. They never touch the HA add-on.
async function loadMeshLinkNode() {
  const note = document.getElementById("n2k-node-state");
  if (!note) return;
  try {
    const data = await request("/api/messenger/node");
    document.getElementById("n2k-node-name").value = data.name || "N2K MeshLink";
    document.getElementById("n2k-node-enabled").checked = data.enabled === true;
    note.textContent = data.applied_transport === true ? "● Transportmodus aktiv" :
      data.enabled === true ? "◷ Neustart erforderlich" : "○ Transportmodus aus";
  } catch (_) {
    note.textContent = "Knoteneinstellungen nicht verfügbar";
  }
}
document.getElementById("n2k-node-save")?.addEventListener("click", async () => {
  const button = document.getElementById("n2k-node-save");
  const note = document.getElementById("n2k-node-note");
  const name = document.getElementById("n2k-node-name").value.trim();
  const enabled = document.getElementById("n2k-node-enabled").checked;
  if (!name || name.length > 64) {
    if (note) note.textContent = "Knotenname muss 1–64 Zeichen enthalten.";
    return;
  }
  if (enabled && !confirm("MeshLink als Reticulum-Transportknoten aktivieren? Der Dienst kann künftig Netzwerkverkehr anderer Reticulum-Teilnehmer weiterleiten. Die Netzwerkinterfaces müssen dafür geeignet sein.")) return;
  button.disabled = true;
  try {
    await request("/api/messenger/node", {method:"POST", headers:{"X-CSRF-Token":csrfToken},
      body:JSON.stringify({name,enabled})});
    if (note) note.textContent = "Gespeichert. MeshLink wird zum Anwenden neu gestartet.";
    await request("/api/messenger/node/restart", {method:"POST",headers:{"X-CSRF-Token":csrfToken},body:"{}"});
    if (note) note.textContent = "Einstellungen angewendet. Transportstatus wird geprüft.";
    await loadMeshLinkNode();
    await refreshNativeMessenger();
  } catch (err) {
    if (note) note.textContent = "Fehler: " + (err.message || "Neustart oder Speichern fehlgeschlagen");
  } finally { button.disabled = false; }
});
loadMeshLinkNode();

// OS-native messenger; HA bridge stays completely separate.
async function refreshNativeMessenger() {
  const status = document.getElementById("n2k-native-state");
  if (!status) return;
  try {
    const [state, contacts, inbox] = await Promise.all([
      request("/api/messenger/status"), request("/api/messenger/contacts"), request("/api/messenger/messages")
    ]);
    status.textContent = state.online ? "● Reticulum / LXMF bereit" : "○ Nicht bereit: " + (state.error || "offline");
    document.getElementById("n2k-native-id").value = state.identity || "";
    const qr=document.getElementById("n2k-lxmf-qr");
    if(qr&&!qr.hidden)drawNativeLxmfQr();
    const contactBox = document.getElementById("n2k-native-contacts");
    contactBox.replaceChildren();
    (contacts.contacts || []).forEach(item => {
      const button = document.createElement("button");
      button.className = "secondary compact";
      button.textContent = (item.name || "Kontakt") + " · " + (item.destination || "").slice(0,8);
      button.onclick = () => { document.getElementById("n2k-send-dest").value = item.destination || ""; const filter=document.getElementById("n2k-chat-filter");if(filter&&[...filter.options].some(o=>o.value===item.destination)){filter.value=item.destination;refreshNativeMessenger();} };
      contactBox.appendChild(button);
    });
    if (!contactBox.childNodes.length) contactBox.textContent = "Noch keine Kontakte";
    const conversationBox=document.getElementById("n2k-chat-conversations");
    const conversationSearch=document.getElementById("n2k-chat-search");
    const activeTitle=document.getElementById("n2k-chat-active-title");


    const chatFilter=document.getElementById("n2k-chat-filter");
    const chatCount=document.getElementById("n2k-chat-count");
    const records=Array.isArray(inbox.messages)?inbox.messages:[];
    const contactsByDestination=new Map((contacts.contacts||[]).map(c=>[c.destination,c.name||c.destination]));
    if(chatFilter){
      const selected=chatFilter.value;
      const ids=[...new Set(records.map(m=>String(m.source||"")).filter(Boolean))];
      chatFilter.replaceChildren(new Option("Alle Unterhaltungen",""));
      ids.forEach(id=>chatFilter.add(new Option((contactsByDestination.get(id)||id.slice(0,12)+"…"),id)));
      chatFilter.value=ids.includes(selected)?selected:"";
    }

    const knownContacts=Array.isArray(contacts.contacts)?contacts.contacts:[];
    const destinations=[...new Set([...knownContacts.map(c=>c.destination),...records.map(m=>m.source)].filter(Boolean))];
    const messageTime=id=>records.filter(m=>m.source===id).reduce((a,m)=>Math.max(a,Number(m.time)||0),0);
    destinations.sort((a,b)=>messageTime(b)-messageTime(a));
    if(conversationBox){
      const selected=chatFilter?.value||"";
      const term=(conversationSearch?.value||"").toLocaleLowerCase().trim();
      conversationBox.replaceChildren();
      for(const dest of destinations){
        const name=contactsByDestination.get(dest)||dest.slice(0,12)+"…";
        if(term&&!name.toLocaleLowerCase().includes(term)&&!dest.includes(term))continue;
        const button=document.createElement("button");button.type="button";
        button.className="n2k-chat-conversation"+(selected===dest?" is-selected":"");
        const nameEl=document.createElement("strong");nameEl.textContent=name;
        const meta=document.createElement("small");meta.textContent=records.filter(m=>m.source===dest).length+" Nachrichten · "+dest.slice(0,10)+"…";
        button.append(nameEl,meta);
        button.addEventListener("click",()=>{
          if(chatFilter){chatFilter.value=dest;refreshNativeMessenger();}
          document.getElementById("n2k-send-dest").value=dest;
        });
        conversationBox.append(button);
      }
      if(!conversationBox.childNodes.length)conversationBox.textContent="Noch keine passenden Unterhaltungen";
    }
    if(activeTitle)activeTitle.textContent=chatFilter?.value?(contactsByDestination.get(chatFilter.value)||chatFilter.value):"Alle Nachrichten";
    const filtered=chatFilter?.value?records.filter(m=>String(m.source||"")===chatFilter.value):records;
    if(chatCount)chatCount.textContent=filtered.length+" Nachrichten · Zustellung separat prüfen";
    const messageBox = document.getElementById("n2k-native-messages");
    messageBox.replaceChildren();
    filtered.slice(-80).reverse().forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = "padding:8px;border-bottom:1px solid #7774;overflow-wrap:anywhere";
      const title = document.createElement("strong");
      title.textContent = (item.direction === "in" ? "Empfangen" : "Gesendet") + " · " + (contactsByDestination.get(item.source) || String(item.source||"").slice(0,12)) + " · " + (item.status === "queued" ? "eingereiht" : (item.status || "Status unbekannt"));
      row.className="n2k-chat-message";
      const body = document.createElement("div");
      body.textContent = String(item.content || "");
      const when=document.createElement("small");
      if(Number.isFinite(Number(item.time))&&Number(item.time)>0)when.textContent=new Date(Number(item.time)*1000).toLocaleString("de-DE");
      row.append(title,body,when);
      messageBox.appendChild(row);
    });
    if (!messageBox.childNodes.length) messageBox.textContent = "Noch keine Nachrichten";
  } catch (err) {
    status.textContent = "Native Messenger-Verbindung nicht verfügbar";
  }
}
async function nativeMessengerSubmit(endpoint, payload) {
  try {
    await request("/api/messenger/" + endpoint, {method:"POST",headers:{"X-CSRF-Token":csrfToken},body:JSON.stringify(payload)});
    showN2KToast(endpoint === "contacts" ? "Kontakt gespeichert" : "Nachricht an LXMF übergeben");
    await refreshNativeMessenger();
  } catch (err) {
    showN2KToast("Messenger: " + (err.message || "Fehler"), "error");
  }
}
document.getElementById("n2k-native-refresh")?.addEventListener("click", refreshNativeMessenger);
document.getElementById("n2k-chat-filter")?.addEventListener("change", refreshNativeMessenger);
document.getElementById("n2k-chat-search")?.addEventListener("input",()=>{
  // Keep all message data on the server; filter only the visible conversation buttons.
  const term=document.getElementById("n2k-chat-search").value.toLocaleLowerCase().trim();
  for(const button of document.querySelectorAll("#n2k-chat-conversations button")){
    button.hidden=Boolean(term&&!button.textContent.toLocaleLowerCase().includes(term));
  }
});
document.getElementById("n2k-contact-save")?.addEventListener("click", () => nativeMessengerSubmit("contacts", {
  name: document.getElementById("n2k-contact-name").value,
  destination: document.getElementById("n2k-contact-dest").value
}));
document.getElementById("n2k-send-button")?.addEventListener("click", () => nativeMessengerSubmit("messages", {
  content: document.getElementById("n2k-send-content").value,
  destination: document.getElementById("n2k-send-dest").value
}));
refreshNativeMessenger();

// The Messenger runs inside the Home Assistant add-on; do not request or expose HA tokens.
async function refreshN2KRnsStatus() {
  const node = document.getElementById("n2k-rns-ha-status");
  const open = document.getElementById("n2k-rns-open");
  if (!node) return;
  try {
    const result = await request("/api/homeassistant", {headers:{}});
    const ready = Boolean(result.available && result.reachable && result.state === "running");
    node.textContent = ready ? "Home Assistant erreichbar · Add-on-Status separat prüfen" :
      result.installed ? "Home Assistant zurzeit nicht erreichbar" : "Home Assistant OS nicht installiert";
    if (open) open.disabled = !ready;
  } catch (_) {
    node.textContent = "Home Assistant Status nicht verfügbar";
    if (open) open.disabled = true;
  }
}
document.getElementById("n2k-rns-open")?.addEventListener("click", () => {
  window.open(`${window.location.protocol}//${window.location.hostname}:8123/`, "_blank", "noopener,noreferrer");
});
document.getElementById("n2k-rns-refresh")?.addEventListener("click", refreshN2KRnsStatus);
document.getElementById("n2k-rns-install-guide")?.addEventListener("click", () => {
  const guide = document.getElementById("n2k-rns-guide");
  if (!guide) return;
  guide.hidden = !guide.hidden;
});
refreshN2KRnsStatus();

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
    showN2KToast(`Home Assistant konnte nicht gestartet werden:\n${homeAssistantErrorMessage(error.code)}`);
  }
}

document.getElementById("ha-open")?.addEventListener("click", () => {
  window.open(`${window.location.protocol}//${window.location.hostname}:8123/`, "_blank", "noopener");
});
document.getElementById("ha-start")?.addEventListener("click", () => homeAssistantAction("start"));
document.getElementById("ha-restart")?.addEventListener("click", () => homeAssistantAction("restart"));
document.getElementById("ha-shutdown")?.addEventListener("click", () => homeAssistantAction("shutdown"));

let updatePreflightReady = false;
let updateAvailableNow = false;

function renderUpdatePreflight(data = {}) {
  updatePreflightReady = Boolean(data.ready);
  const badge = document.getElementById("update-preflight-badge");
  if (badge) {
    badge.textContent = data.ready ? "BEREIT" : "BLOCKIERT";
    badge.className = `health-badge ${data.ready ? "ok" : "bad"}`;
  }
  setHealthText("update-preflight-score", `${data.required_ok ?? 0} / ${data.required_total ?? 0} OK`);
  setHealthText("update-preflight-time", Number.isFinite(Number(data.checked_at)) ? formatDateTime(Number(data.checked_at)) : "–");
  setHealthText("update-backup-mode", data.automatic_backup ? "Automatisch + verifiziert" : "Manuell");

  const latest = data.latest_backup || {};
  setHealthText("update-last-backup", latest.id || "Noch keines");
  const backupMeta = latest.created_at
    ? `${formatDateTime(Number(latest.created_at))} · ${latest.verified === true ? "verifiziert" : latest.verified === false ? "Fehler" : "ungeprüft"}`
    : "Vor dem Update wird ein neuer Recovery-Punkt erzeugt.";
  setHealthText("update-last-backup-meta", backupMeta);

  const list = document.getElementById("update-preflight-list");
  if (list) {
    list.innerHTML = "";
    const checks = Array.isArray(data.checks) ? data.checks : [];
    checks.forEach(check => {
      const row = document.createElement("div");
      row.className = "update-preflight-row";
      row.innerHTML = "<span class='update-preflight-dot'></span><div><strong></strong><small></small></div><em></em>";
      row.querySelector(".update-preflight-dot").classList.add(check.ok ? "ok" : check.required ? "bad" : "warn");
      row.querySelector("strong").textContent = check.label || check.id || "Prüfung";
      row.querySelector("small").textContent = check.detail || "–";
      row.querySelector("em").textContent = check.ok ? "OK" : check.required ? "BLOCKIERT" : "HINWEIS";
      list.appendChild(row);
    });
    if (!checks.length) list.innerHTML = '<div class="health-empty">Keine Preflight-Daten verfügbar.</div>';
  }

  const install = document.getElementById("install-update");
  if (install) {
    const blocked = currentRole !== "admin" || !updatePreflightReady || !updateAvailableNow;
    install.disabled = blocked;
    install.title = currentRole !== "admin"
      ? "Nur Administratoren dürfen Systemupdates installieren."
      : !updateAvailableNow
        ? "Kein neuer Stand verfügbar."
        : !updatePreflightReady
          ? "Mindestens eine Pflichtprüfung blockiert das Update."
          : "Vor der Installation wird automatisch ein verifiziertes Backup erstellt.";
  }
}

async function loadUpdatePreflight() {
  if (!document.getElementById("update-preflight-list")) return null;
  try {
    const data = await request("/api/updates/preflight", {headers:{}});
    renderUpdatePreflight(data);
    return data;
  } catch (error) {
    console.error(error);
    updatePreflightReady = false;
    const badge = document.getElementById("update-preflight-badge");
    if (badge) {
      badge.textContent = "NICHT VERFÜGBAR";
      badge.className = "health-badge bad";
    }
    const list = document.getElementById("update-preflight-list");
    if (list) list.innerHTML = '<div class="health-empty">Preflight konnte nicht geladen werden.</div>';
    const install = document.getElementById("install-update");
    if (install) install.disabled = true;
    return null;
  }
}

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

    // Host OS updates are separate from Netfreak2k's GitHub update.
    let hostBox = document.getElementById("n2k-host-updates");
    if (!hostBox) {
      hostBox = document.createElement("section");
      hostBox.id = "n2k-host-updates";
      hostBox.style.cssText = "margin:16px 0;padding:16px;border:1px solid #476477;border-radius:14px";
      detail.insertAdjacentElement("afterend", hostBox);
    }
    const host = data.host_updates || {};
    hostBox.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = "Linux · Kernel · Docker";
    hostBox.append(heading);
    const rows = [
      ["Paketupdates", host.packages == null ? "Noch nicht geprüft" : host.packages + " verfügbar"],
      ["Sicherheitsupdates", host.security == null ? "Nicht ermittelt" : host.security + " (APT-Indikator)"],
      ["Kernel", host.kernel?.running || "Unbekannt"],
      ["Neustart", host.kernel?.reboot_required ? "Erforderlich" : "Kein Neustart-Marker"],
      ["Docker", host.docker?.installed ? host.docker.version : "Nicht erkannt"],
      ["Prüfung", host.checked_at ? new Date(host.checked_at * 1000).toLocaleString("de-DE") : "Noch nicht eingerichtet"]
    ];
    for (const [key, value] of rows) {
      const row = document.createElement("p");
      row.style.cssText = "margin:7px 0;font-size:14px";
      const label = document.createElement("strong");
      label.textContent = key + ": ";
      row.append(label, document.createTextNode(value));
      hostBox.append(row);
    }
    const notice = document.createElement("small");
    notice.textContent = "Nur Anzeige. Keine automatischen Linux- oder Docker-Updates. Docker-Image-Updates werden nicht geprüft.";
    hostBox.append(notice);

    const job = data.linux_upgrade || {};
    const jobInfo=document.createElement("p");
    jobInfo.textContent=job.state === "running" ? "Installation läuft: " + (job.message || "") :
      job.state === "completed" ? "Letzte Installation erfolgreich." :
      job.state === "failed" ? "Letzte Installation fehlgeschlagen. Serverprotokoll prüfen." : "";
    hostBox.append(jobInfo);
    const upgradeButton=document.createElement("button");
    upgradeButton.type="button";
    upgradeButton.textContent=job.state === "running" ? "Linux-Update läuft …" : "Linux-Updates installieren";
    upgradeButton.disabled=job.state === "running" || !Number.isFinite(host.packages) || host.packages < 1 || currentRole !== "admin";
    upgradeButton.style.cssText="margin-top:10px;padding:11px 16px;border-radius:10px;cursor:pointer";
    upgradeButton.addEventListener("click",async()=>{
      if(!window.confirm("Linux-Paketupdates auf diesem Server jetzt installieren? Dienste können kurz unterbrochen werden. Kein automatischer Neustart. Vorher Backup prüfen.")) return;
      upgradeButton.disabled=true;
      try {
        const response=await request("/api/updates/linux/install",{method:"POST",body:"{}",headers:{"X-CSRF-Token":csrfToken}});
        if(!response.accepted) throw Error(response.error || "Start abgelehnt");
        alert("Linux-Update gestartet. Fortschritt erscheint nach Aktualisierung der Seite.");
        loadUpdates();
      } catch(error) {
        alert("Linux-Update nicht gestartet: "+error.message);
        upgradeButton.disabled=false;
      }
    });
    hostBox.append(upgradeButton);


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
      updateAvailableNow = false;
      await loadUpdatePreflight();
      title.textContent = "Update-Status noch nicht verfügbar";
      detail.textContent = "Die nächste automatische GitHub-Prüfung aktualisiert diesen Bereich.";
      if (topText) topText.textContent = "Update unbekannt";
      if (topDot) topDot.className = "health-dot";
      return;
    }

    if (runtimeState === "running") {
      updateAvailableNow = Boolean(data.update_available);
      await loadUpdatePreflight();
      const install = document.getElementById("install-update");
      if (install) install.disabled = true;
      title.textContent = "Systemupdate läuft";
      detail.textContent = progress.message || "Netfreak2k wird aktualisiert.";
      if (topText) topText.textContent = "Update läuft";
      if (topDot) topDot.className = "health-dot info";
      return;
    }

    if (runtimeState === "failed") {
      updateAvailableNow = Boolean(data.update_available);
      await loadUpdatePreflight();
      title.textContent = "Update fehlgeschlagen";
      detail.textContent = progress.message || "Der Update-Vorgang konnte nicht abgeschlossen werden.";
      if (topText) topText.textContent = "Update fehlgeschlagen";
      if (topDot) topDot.className = "health-dot warn";
      return;
    }

    updateAvailableNow = Boolean(data.update_available);
    await loadUpdatePreflight();

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

document.getElementById("network-scan")?.addEventListener("click", scanNetworkInventory);
document.getElementById("network-device-search")?.addEventListener("input", renderNetworkDeviceList);
document.getElementById("network-device-type-filter")?.addEventListener("change", renderNetworkDeviceList);
document.querySelectorAll("[data-network-filter]").forEach(button => button.addEventListener("click", () => {
  networkInventoryFilter = button.dataset.networkFilter || "all";
  document.querySelectorAll("[data-network-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderNetworkDeviceList();
}));
document.getElementById("network-device-modal-close")?.addEventListener("click", closeNetworkDevice);
document.getElementById("network-device-modal")?.addEventListener("click", event => {
  if (event.target.id === "network-device-modal") closeNetworkDevice();
});
document.getElementById("network-device-save")?.addEventListener("click", saveNetworkDevice);
document.getElementById("network-device-analyze")?.addEventListener("click", analyzeNetworkDevice);
document.getElementById("network-device-wake")?.addEventListener("click", wakeNetworkDevice);

document.getElementById("health-refresh")?.addEventListener("click", loadSystemHealth);
document.getElementById("scheduler-refresh")?.addEventListener("click", loadScheduler);
document.getElementById("events-refresh")?.addEventListener("click", loadEventCenter);
document.getElementById("recovery-refresh")?.addEventListener("click", loadRecoveryCenter);
document.getElementById("events-search")?.addEventListener("input", renderEventCenter);
document.getElementById("events-source")?.addEventListener("change", renderEventCenter);
document.getElementById("events-level")?.addEventListener("change", renderEventCenter);
document.getElementById("monitoring-policy-save")?.addEventListener("click", saveMonitoringPolicy);
document.querySelectorAll("[data-health-range]").forEach(button => button.addEventListener("click", () => {
  healthRange = button.dataset.healthRange || "24h";
  document.querySelectorAll("[data-health-range]").forEach(item => item.classList.toggle("active", item === button));
  loadSystemHealth();
}));
window.addEventListener("resize", () => {
  if (activeView === "health-panel") renderHealthHistoryChart();
});

document.getElementById("notification-toggle")?.addEventListener("click", event => {
  event.stopPropagation();
  toggleNotificationPanel();
});
document.getElementById("notification-panel")?.addEventListener("click", event => event.stopPropagation());
document.getElementById("notification-read-all")?.addEventListener("click", markAllNotificationsRead);
document.getElementById("notification-desktop-toggle")?.addEventListener("change", event => {
  configureDesktopNotifications(Boolean(event.target.checked));
});
document.addEventListener("click", closeNotificationPanel);
const notificationDesktopToggle = document.getElementById("notification-desktop-toggle");
if (notificationDesktopToggle) {
  notificationDesktopToggle.checked = desktopNotificationsEnabled() &&
    typeof Notification !== "undefined" && Notification.permission === "granted";
}

document.getElementById("host-reboot")?.addEventListener("click", () => hostPowerAction("reboot"));
document.getElementById("host-poweroff")?.addEventListener("click", () => hostPowerAction("poweroff"));

document.getElementById("remote-save")?.addEventListener("click", saveRemoteAccess);
document.getElementById("remote-renew")?.addEventListener("click", renewRemoteCertificate);
document.querySelectorAll('input[name="remote-mode"]').forEach(input => input.addEventListener("change", () => {
  const domainMode = document.querySelector('input[name="remote-mode"]:checked')?.value === "domain";
  document.getElementById("remote-domain-config")?.classList.toggle("hidden", !domainMode);
}));

document.getElementById("security-user-create-toggle")?.addEventListener("click", () => {
  document.getElementById("security-user-create")?.classList.toggle("hidden");
});
document.getElementById("security-user-create-save")?.addEventListener("click", createSecurityUser);

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
document.getElementById("backup-policy-save")?.addEventListener("click", saveBackupPolicy);
document.getElementById("backup-prune")?.addEventListener("click", pruneBackups);
document.getElementById("backup-policy-frequency")?.addEventListener("change", event => {
  document.getElementById("backup-weekday-wrap")?.classList.toggle("hidden", event.target.value !== "weekly");
});
document.querySelectorAll('input[name="backup-target"]').forEach(input => input.addEventListener("change", () => {
  const mounted = document.querySelector('input[name="backup-target"]:checked')?.value === "mounted";
  document.getElementById("backup-target-path-wrap")?.classList.toggle("hidden", !mounted);
  const state = document.getElementById("backup-target-state");
  if (state) state.textContent = mounted ? "Lokal + extern" : "Lokal";
}));
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
let updateExperienceTimer = null;

function renderUpdateExperience(progress = {}, reachable = true) {
  const overlay = document.getElementById("update-experience");
  if (!overlay) return;
  const state = progress.state || "idle";
  const value = Math.max(0, Math.min(100, Number(progress.progress) || 0));
  const step = progress.step || "prepare";
  const message = progress.message || "Update-Status wird geprüft.";
  const stateNode = document.getElementById("update-experience-state");
  const title = document.getElementById("update-experience-title");
  const messageNode = document.getElementById("update-experience-message");
  const fill = document.getElementById("update-experience-fill");
  const percent = document.getElementById("update-experience-percent");
  const connection = document.getElementById("update-experience-connection");
  const reload = document.getElementById("update-experience-reload");

  overlay.classList.remove("complete", "failed");
  if (state === "completed") overlay.classList.add("complete");
  if (state === "failed") overlay.classList.add("failed");

  if (stateNode) stateNode.textContent =
    state === "completed" ? "UPDATE ABGESCHLOSSEN" :
    state === "failed" ? "UPDATE FEHLGESCHLAGEN" :
    reachable ? "SYSTEMUPDATE LÄUFT" : "SERVER WIRD NEU GESTARTET";
  if (title) title.textContent =
    state === "completed" ? "Netfreak2k ist aktualisiert" :
    state === "failed" ? "Update konnte nicht abgeschlossen werden" :
    "Netfreak2k wird aktualisiert";
  if (messageNode) messageNode.textContent = state === "completed"
    ? "Der neue Stand ist vollständig installiert und alle Dienste sind wieder verfügbar."
    : message;
  if (fill) fill.style.width = `${value}%`;
  if (percent) percent.textContent = `${value}%`;
  if (connection) connection.textContent = reachable
    ? "Verbindung zum Server aktiv"
    : "Dienste werden neu gestartet · Verbindung wird automatisch wiederhergestellt";
  if (reload) reload.classList.toggle("hidden", state !== "completed" && state !== "failed");

  const stageOrder = ["prepare","download","extract","validate","install","audio","services","containers","restart","verify","completed"];
  const stageGroups = {prepare:"prepare",download:"download",extract:"download",validate:"validate",install:"install",audio:"install",services:"containers",containers:"containers",restart:"containers",verify:"verify",completed:"verify"};
  const current = stageGroups[step] || "prepare";
  const compact = ["prepare","download","validate","install","containers","verify"];
  const idx = compact.indexOf(current);
  document.querySelectorAll("[data-update-live-stage]").forEach(node => {
    const nodeIndex = compact.indexOf(node.dataset.updateLiveStage);
    node.classList.toggle("active", state === "running" && nodeIndex === idx);
    node.classList.toggle("done", state === "completed" || (idx >= 0 && nodeIndex < idx));
  });
}

async function pollUpdateExperience() {
  const overlay = document.getElementById("update-experience");
  if (!overlay || overlay.classList.contains("hidden")) return;
  let progress = {};
  let reachable = true;
  try {
    const response = await fetch("/api/update/progress", {cache:"no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    progress = await response.json();
  } catch (_) {
    reachable = false;
    progress = {
      state:"running",
      progress:Number(localStorage.getItem("n2k-update-last-progress") || 78),
      step:"restart",
      message:"Die Webplattform wird neu gestartet."
    };
  }
  if (Number.isFinite(Number(progress.progress))) {
    localStorage.setItem("n2k-update-last-progress", String(progress.progress));
  }
  renderUpdateExperience(progress, reachable);

  if (progress.state === "completed") {
    localStorage.removeItem("n2k-update-ui-active");
    localStorage.removeItem("n2k-update-last-progress");
    clearTimeout(updateExperienceTimer);
    updateExperienceTimer = setTimeout(() => window.location.reload(), 2200);
    return;
  }
  if (progress.state === "failed") {
    localStorage.removeItem("n2k-update-ui-active");
    return;
  }
  updateExperienceTimer = setTimeout(pollUpdateExperience, reachable ? 1200 : 1800);
}

function openUpdateExperience() {
  const overlay = document.getElementById("update-experience");
  if (!overlay) return;
  localStorage.setItem("n2k-update-ui-active", "1");
  overlay.classList.remove("hidden");
  renderUpdateExperience({state:"running",progress:1,step:"prepare",message:"Update wird vorbereitet."}, true);
  clearTimeout(updateExperienceTimer);
  updateExperienceTimer = setTimeout(pollUpdateExperience, 500);
}

async function recoverUpdateExperience() {
  try {
    const response = await fetch("/api/update/progress", {cache:"no-store"});
    if (!response.ok) return;
    const progress = await response.json();
    const active = progress.state === "running" || localStorage.getItem("n2k-update-ui-active") === "1";
    if (active) {
      document.getElementById("update-experience")?.classList.remove("hidden");
      renderUpdateExperience(progress, true);
      clearTimeout(updateExperienceTimer);
      updateExperienceTimer = setTimeout(pollUpdateExperience, 700);
    }
  } catch (_) {}
}

document.getElementById("update-experience-reload")?.addEventListener("click", () => window.location.reload());

document.getElementById("install-update")?.addEventListener("click", async () => {
  const button = document.getElementById("install-update");
  if (currentRole !== "admin") return;
  const preflight = await loadUpdatePreflight();
  if (!preflight?.ready) {
    showN2KToast("Update blockiert: Preflight-Prüfungen sind nicht vollständig grün.", "error");
    return;
  }
  if (!confirm("Netfreak2k Server-OS sicher aktualisieren? Zuerst wird automatisch ein Backup erstellt und verifiziert. Erst danach startet die Installation.")) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Erstelle Recovery-Punkt …";
  try {
    const result = await request("/api/updates/install", {
      method: "POST",
      body: "{}",
      headers: {"X-CSRF-Token": csrfToken}
    });
    const backup = result.backup || {};
    if (backup.id) {
      setHealthText("update-last-backup", backup.id);
      setHealthText("update-last-backup-meta", `Gerade erstellt · verifiziert${backup.replicated ? " · extern repliziert" : ""}`);
      showN2KToast(`Recovery-Punkt ${backup.id} erstellt. Update startet.`, "success");
    }
    openUpdateExperience();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = original;
    await loadUpdatePreflight();
    showN2KToast(
      error.code === "update_backup_verification_failed"
        ? "Update abgebrochen: Das Sicherungsbackup konnte nicht verifiziert werden."
        : "Sicheres Update konnte nicht gestartet werden.",
      "error"
    );
  }
});

recoverUpdateExperience();
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
  const target = event.target;
  const editable = target instanceof HTMLElement &&
    (target.matches("input,textarea,select") || target.isContentEditable);

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch?.focus();
    globalSearch?.select();
    return;
  }
  if (!editable && event.key === "/") {
    event.preventDefault();
    globalSearch?.focus();
    return;
  }
  if (event.key === "Escape") {
    document.getElementById("global-search-results")?.classList.add("hidden");
    toggleMediaServiceDirectory(false);
    return;
  }
  if (editable || event.ctrlKey || event.metaKey || event.altKey) return;
  const hasMedia = Boolean(mediaAudio?.src);
  if (event.code === "Space" && (hasMedia || activeView === "media-center-panel")) {
    event.preventDefault();
    toggleMediaPlayback();
  } else if (event.key.toLowerCase() === "m" && hasMedia) {
    event.preventDefault();
    toggleMediaMute();
  } else if (event.key === "ArrowRight" && hasMedia) {
    event.preventDefault();
    stepMediaStation(1);
  } else if (event.key === "ArrowLeft" && hasMedia) {
    event.preventDefault();
    stepMediaStation(-1);
  }
});

const viewGroups = {
  "photos-panel": ["photos-panel"],
  "workspace-panel": ["workspace-panel", "drive-management-panel"],
  "calendar-panel": ["calendar-panel"],
  "apps-panel": ["apps-panel", "app-store-panel"],
  "health-panel": ["health-panel"],
  "security-panel": ["security-panel"],
  "scheduler-panel": ["scheduler-panel"],
  "events-panel": ["events-panel"],
  "recovery-panel": ["recovery-panel"],
  "vms-panel": ["vms-panel"],
  "storage-panel": ["storage-panel"],
  "backups-panel": ["backups-panel"],
  "network-panel": ["network-panel"],
  "media-center-panel": ["media-center-panel"],
  "office-panel": ["office-panel"],
  "terminal-panel": ["terminal-panel"],
  "privacy-panel": ["privacy-panel"],
  "ai-panel": ["ai-panel"],
  "updates-panel": ["wallpaper-panel", "sync-panel", "updates-panel"]
};

const systemNavTargets = new Set(["health-panel","vms-panel","storage-panel","backups-panel","network-panel","security-panel","scheduler-panel","events-panel","recovery-panel"]);

function setSystemNavOpen(open) {
  const group = document.getElementById("system-nav-group");
  const toggle = document.getElementById("system-nav-toggle");
  if (!group || !toggle) return;
  group.classList.toggle("open", Boolean(open));
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function syncSystemNavState(targetId) {
  const group = document.getElementById("system-nav-group");
  const toggle = document.getElementById("system-nav-toggle");
  if (!group || !toggle) return;
  const childActive = systemNavTargets.has(targetId);
  group.classList.toggle("active", childActive);
  toggle.classList.toggle("active", childActive);
  if (childActive) setSystemNavOpen(true);
}

document.getElementById("system-nav-toggle")?.addEventListener("click", () => {
  const group = document.getElementById("system-nav-group");
  setSystemNavOpen(!group?.classList.contains("open"));
});

function schedulerDateText(value) {
  if (!value) return "–";
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toLocaleString("de-DE");
  return value;
}

function renderSchedulerJobs(jobs = []) {
  const list = document.getElementById("scheduler-job-list");
  if (!list) return;
  list.innerHTML = "";
  jobs.forEach(job => {
    const row = document.createElement("article");
    row.className = "scheduler-job-row";
    row.innerHTML = `
      <div class="scheduler-job-main">
        <span class="scheduler-job-icon">JOB</span>
        <div><strong></strong><small></small></div>
      </div>
      <div class="scheduler-job-meta">
        <span class="scheduler-job-schedule"></span>
        <span class="scheduler-job-last"></span>
      </div>
      <div class="scheduler-job-state"><span class="status-chip"></span><small></small></div>
      <button class="secondary compact scheduler-run">Jetzt ausführen</button>`;
    row.querySelector(".scheduler-job-main strong").textContent = job.label || job.id || "Job";
    row.querySelector(".scheduler-job-main small").textContent = job.description || "";
    row.querySelector(".scheduler-job-schedule").textContent = "Plan: " + (job.schedule || "–");
    row.querySelector(".scheduler-job-last").textContent = job.last_run
      ? "Letzter Lauf: " + formatDateTime(Number(job.last_run))
      : "Noch nie manuell ausgeführt";
    const state = row.querySelector(".scheduler-job-state .status-chip");
    state.textContent = job.last_ok === false ? "FEHLER" : job.last_ok === true ? "OK" : "BEREIT";
    state.className = "status-chip " + (job.last_ok === false ? "warn" : job.last_ok === true ? "good" : "");
    row.querySelector(".scheduler-job-state small").textContent = job.last_detail || "Noch kein Ergebnis gespeichert";
    const button = row.querySelector(".scheduler-run");
    const adminOnly = job.role === "admin";
    button.disabled = currentRole === "viewer" || (adminOnly && currentRole !== "admin");
    button.title = adminOnly && currentRole !== "admin" ? "Nur Administratoren dürfen diesen Job starten." : "";
    button.addEventListener("click", () => runSchedulerJob(job.id, button));
    list.appendChild(row);
  });
  if (!jobs.length) list.innerHTML = '<div class="app-empty">Keine verwalteten N2K-Jobs gefunden.</div>';
}

function renderSchedulerTimers(timers = []) {
  const list = document.getElementById("scheduler-timer-list");
  if (!list) return;
  list.innerHTML = "";
  timers.forEach(timer => {
    const row = document.createElement("div");
    row.className = "scheduler-timer-row";
    row.innerHTML = `
      <span class="scheduler-timer-dot"></span>
      <div class="scheduler-timer-main"><strong></strong><small></small></div>
      <div class="scheduler-timer-times"><span class="scheduler-next"></span><small class="scheduler-last"></small></div>
      <em></em>`;
    row.querySelector(".scheduler-timer-dot").classList.add(timer.active_state === "active" ? "active" : "inactive");
    row.querySelector(".scheduler-timer-main strong").textContent = timer.description || timer.unit || "Timer";
    row.querySelector(".scheduler-timer-main small").textContent =
      [timer.unit, timer.activates].filter(Boolean).join(" → ");
    row.querySelector(".scheduler-next").textContent = "Nächster: " + schedulerDateText(timer.next);
    row.querySelector(".scheduler-last").textContent = "Letzter: " + schedulerDateText(timer.last);
    row.querySelector("em").textContent = timer.enabled ? "ENABLED" : String(timer.active_state || "unknown").toUpperCase();
    list.appendChild(row);
  });
  if (!timers.length) list.innerHTML = '<div class="app-empty">Keine systemd-Timer erkannt.</div>';
}

async function loadScheduler() {
  const panel = document.getElementById("scheduler-panel");
  if (!panel || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/scheduler", {headers:{}});
    const summary = data.summary || {};
    setHealthText("scheduler-job-count", String(summary.managed_jobs ?? (data.jobs || []).length));
    setHealthText("scheduler-timer-count", String(summary.system_timers ?? (data.timers || []).length));
    setHealthText("scheduler-active-count", String(summary.active_timers ?? 0));
    setHealthText("scheduler-failed-count", String(summary.failed_jobs ?? 0));
    renderSchedulerJobs(Array.isArray(data.jobs) ? data.jobs : []);
    renderSchedulerTimers(Array.isArray(data.timers) ? data.timers : []);
  } catch (error) {
    console.error(error);
    const jobs = document.getElementById("scheduler-job-list");
    const timers = document.getElementById("scheduler-timer-list");
    if (jobs) jobs.innerHTML = '<div class="app-empty">N2K-Jobs konnten nicht geladen werden.</div>';
    if (timers) timers.innerHTML = '<div class="app-empty">Systemtimer konnten nicht geladen werden.</div>';
  }
}

async function runSchedulerJob(jobId, button) {
  if (!jobId || currentRole === "viewer") return;
  const original = button?.textContent || "Jetzt ausführen";
  if (button) { button.disabled = true; button.textContent = "Läuft …"; }
  try {
    const result = await request("/api/scheduler/run", {
      method:"POST",
      body:JSON.stringify({job_id:jobId}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    showN2KToast(result.detail || "Job erfolgreich ausgeführt.", "success");
    await loadScheduler();
    await loadNotifications();
  } catch (error) {
    console.error(error);
    showN2KToast("Job konnte nicht erfolgreich ausgeführt werden.", "error");
    await loadScheduler();
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

let eventCenterRows = [];

function eventLevelLabel(level) {
  return level === "critical" ? "KRITISCH" :
    level === "error" ? "FEHLER" :
    level === "warning" ? "WARNUNG" : "INFO";
}

function renderEventCenter() {
  const list = document.getElementById("events-list");
  if (!list) return;
  const query = (document.getElementById("events-search")?.value || "").trim().toLowerCase();
  const source = document.getElementById("events-source")?.value || "all";
  const level = document.getElementById("events-level")?.value || "all";

  const rows = eventCenterRows.filter(item => {
    if (source !== "all" && item.source !== source) return false;
    if (level !== "all" && item.level !== level) return false;
    if (!query) return true;
    const haystack = [
      item.source, item.level, item.identifier, item.unit, item.message
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  list.innerHTML = "";
  rows.forEach(item => {
    const row = document.createElement("article");
    row.className = `event-row event-${item.level || "info"}`;
    row.innerHTML = `
      <span class="event-level"></span>
      <div class="event-copy"><strong></strong><small></small><p></p></div>
      <time></time>`;
    row.querySelector(".event-level").textContent = eventLevelLabel(item.level);
    row.querySelector(".event-copy strong").textContent = item.identifier || item.source || "system";
    row.querySelector(".event-copy small").textContent =
      [String(item.source || "system").toUpperCase(), item.unit].filter(Boolean).join(" · ");
    row.querySelector(".event-copy p").textContent = item.message || "–";
    row.querySelector("time").textContent = Number.isFinite(Number(item.timestamp))
      ? formatDateTime(Number(item.timestamp)) : "–";
    list.appendChild(row);
  });
  if (!rows.length) list.innerHTML = '<div class="app-empty">Keine Ereignisse entsprechen diesem Filter.</div>';
  setHealthText("events-filter-summary", `${rows.length} von ${eventCenterRows.length} Ereignissen`);
}

async function loadEventCenter() {
  const panel = document.getElementById("events-panel");
  if (!panel || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/events?lines=320", {headers:{}});
    eventCenterRows = Array.isArray(data.events) ? data.events : [];
    const summary = data.summary || {};
    setHealthText("events-count-total", String(summary.total ?? eventCenterRows.length));
    setHealthText("events-count-critical", String(summary.critical ?? 0));
    setHealthText("events-count-error", String(summary.errors ?? 0));
    setHealthText("events-count-warning", String(summary.warnings ?? 0));
    renderEventCenter();
  } catch (error) {
    console.error(error);
    const list = document.getElementById("events-list");
    if (list) list.innerHTML = '<div class="app-empty">Logs & Ereignisse konnten nicht geladen werden.</div>';
  }
}

function renderReleaseReadiness(data = {}) {
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const manual = Array.isArray(data.manual_gates) ? data.manual_gates : [];
  const badge = document.getElementById("release-readiness-badge");
  if (badge) {
    badge.textContent = data.host_ready ? "HOST BEREIT" : "BLOCKIERT";
    badge.className = "health-badge " + (data.host_ready ? "ok" : "bad");
  }

  setHealthText("release-readiness-score", `${data.passed ?? 0} / ${data.total ?? checks.length} OK`);
  setHealthText("release-readiness-version", data.version || "Version unbekannt");
  setHealthText("release-readiness-host", data.host_ready ? "BEREIT" : "PRÜFEN");
  setHealthText("release-readiness-manual", String(manual.filter(item => !item.complete).length));

  const checkList = document.getElementById("release-readiness-checks");
  if (checkList) {
    checkList.innerHTML = "";
    checks.forEach(check => {
      const row = document.createElement("div");
      row.className = "recovery-check-row";
      row.innerHTML = "<span></span><div><strong></strong><small></small></div><em></em>";
      row.querySelector("span").className = "recovery-check-dot " + (check.ok ? "ok" : "bad");
      row.querySelector("strong").textContent = check.label || check.id || "Prüfung";
      row.querySelector("small").textContent = check.detail || "–";
      row.querySelector("em").textContent = check.ok ? "OK" : "BLOCKIERT";
      checkList.appendChild(row);
    });
    if (!checks.length) checkList.innerHTML = '<div class="app-empty">Keine technischen Release-Checks verfügbar.</div>';
  }

  const manualList = document.getElementById("release-manual-gates");
  if (manualList) {
    manualList.innerHTML = "";
    manual.forEach(item => {
      const row = document.createElement("div");
      row.className = "release-manual-row";
      row.innerHTML = "<span></span><div class='release-manual-copy'><strong></strong><small></small><em></em></div><button class='secondary compact release-gate-toggle'></button>";
      row.querySelector("span").textContent = item.complete ? "✓" : "!";
      row.querySelector("span").className = item.complete ? "done" : "open";
      row.querySelector("strong").textContent = item.label || item.id || "Freigabe";
      row.querySelector("small").textContent = item.detail || "–";
      const meta = row.querySelector("em");
      meta.textContent = item.complete
        ? `Bestätigt${item.confirmed_by ? " von " + item.confirmed_by : ""}${item.confirmed_at ? " · " + formatDateTime(Number(item.confirmed_at)) : ""}`
        : "Noch offen";
      const button = row.querySelector(".release-gate-toggle");
      if (item.can_confirm === false) {
        button.textContent = "Nur per LICENSE";
        button.disabled = true;
        button.title = "Dieser Gate wird erst durch eine tatsächlich committe Projektlizenz freigegeben.";
      } else {
        button.textContent = item.complete ? "Wieder öffnen" : "Bestätigen";
        button.disabled = currentRole !== "admin";
        button.title = currentRole !== "admin" ? "Nur Administratoren können Release-Gates bestätigen." : "";
        button.addEventListener("click", () => updateReleaseGate(item.id, !item.complete, button));
      }
      manualList.appendChild(row);
    });
    if (!manual.length) manualList.innerHTML = '<div class="app-empty">Keine manuellen Release-Gates hinterlegt.</div>';
  }
}

async function loadReleaseReadiness() {
  if (!document.getElementById("release-readiness-card") && !document.querySelector(".release-readiness-card")) return;
  try {
    const data = await request("/api/release/readiness", {headers:{}});
    renderReleaseReadiness(data);
  } catch (error) {
    console.error(error);
    const badge = document.getElementById("release-readiness-badge");
    if (badge) {
      badge.textContent = "FEHLER";
      badge.className = "health-badge bad";
    }
  }
}

async function updateReleaseGate(gateId, complete, button) {
  if (currentRole !== "admin" || !gateId) return;
  const action = complete ? "als erfolgreich bestätigen" : "wieder öffnen";
  if (!confirm(`Release-Gate wirklich ${action}?`)) return;
  const original = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = complete ? "Bestätige …" : "Öffne …";
  }
  try {
    const result = await request("/api/release/readiness/gate", {
      method:"POST",
      body:JSON.stringify({gate_id:gateId, complete}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    renderReleaseReadiness(result);
    showN2KToast(complete ? "Release-Gate wurde bestätigt." : "Release-Gate wurde wieder geöffnet.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast("Release-Gate konnte nicht aktualisiert werden.", "error");
    await loadReleaseReadiness();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function renderRecoveryCenter(data = {}) {
  const health = data.health || {};
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const latest = data.latest_backup || {};
  const updateBackup = data.latest_update_backup || {};

  setHealthText("recovery-health-score", Number.isFinite(Number(health.score)) ? String(Math.round(Number(health.score))) : "–");
  setHealthText("recovery-health-state", health.overall || "unknown");
  setHealthText("recovery-check-count", `${checks.filter(item => item.ok).length} / ${checks.length} OK`);
  setHealthText("recovery-latest-backup", latest.id || "Keines");
  setHealthText("recovery-latest-backup-meta",
    latest.created_at ? `${formatDateTime(Number(latest.created_at))} · ${latest.verified === true ? "verifiziert" : latest.verified === false ? "Fehler" : "ungeprüft"}` : "Kein Wiederherstellungspunkt");
  setHealthText("recovery-update-backup", updateBackup.id || "Keines");
  setHealthText("recovery-update-backup-meta",
    updateBackup.created_at ? `${formatDateTime(Number(updateBackup.created_at))} · Update-Recovery` : "Noch kein Update-Recovery vorhanden");

  const badge = document.getElementById("recovery-ready-badge");
  if (badge) {
    badge.textContent = data.ready ? "BEREIT" : "PRÜFEN";
    badge.className = "health-badge " + (data.ready ? "ok" : "warn");
  }

  const checkList = document.getElementById("recovery-check-list");
  if (checkList) {
    checkList.innerHTML = "";
    checks.forEach(check => {
      const row = document.createElement("div");
      row.className = "recovery-check-row";
      row.innerHTML = "<span></span><div><strong></strong><small></small></div><em></em>";
      row.querySelector("span").className = "recovery-check-dot " + (check.ok ? "ok" : "bad");
      row.querySelector("strong").textContent = check.label || check.id || "Prüfung";
      row.querySelector("small").textContent = check.detail || "–";
      row.querySelector("em").textContent = check.ok ? "OK" : "PRÜFEN";
      checkList.appendChild(row);
    });
    if (!checks.length) checkList.innerHTML = '<div class="app-empty">Keine Recovery-Prüfungen verfügbar.</div>';
  }

  const actionList = document.getElementById("recovery-action-list");
  if (actionList) {
    actionList.innerHTML = "";
    const actions = Array.isArray(data.safe_actions) ? data.safe_actions : [];
    actions.forEach(action => {
      const button = document.createElement("button");
      button.className = "recovery-action-button";
      button.disabled = currentRole !== "admin";
      button.innerHTML = "<strong></strong><small></small>";
      button.querySelector("strong").textContent = action.label || action.id;
      button.querySelector("small").textContent =
        action.id.startsWith("restart-") ? "Dienst kontrolliert neu starten" : "Recovery-Punkt vollständig prüfen";
      button.addEventListener("click", () => runRecoveryAction(action.id, button));
      actionList.appendChild(button);
    });
    if (!actions.length) actionList.innerHTML = '<div class="app-empty">Keine sicheren Recovery-Aktionen verfügbar.</div>';
  }

  const warningList = document.getElementById("recovery-warning-list");
  if (warningList) {
    warningList.innerHTML = "";
    const warnings = Array.isArray(health.warnings) ? health.warnings : [];
    warnings.forEach(item => {
      const row = document.createElement("div");
      row.className = `recovery-warning-row ${item.level || "warning"}`;
      row.innerHTML = "<span></span><div><strong></strong><small></small></div>";
      row.querySelector("span").textContent = item.level === "critical" ? "!" : "i";
      row.querySelector("strong").textContent = item.title || "Systemhinweis";
      row.querySelector("small").textContent = item.detail || "–";
      warningList.appendChild(row);
    });
    if (!warnings.length) warningList.innerHTML = '<div class="app-empty">Keine aktiven Systemwarnungen.</div>';
  }
}

async function loadRecoveryCenter() {
  const panel = document.getElementById("recovery-panel");
  if (!panel || document.getElementById("app-shell")?.classList.contains("hidden")) return;
  try {
    const data = await request("/api/recovery", {headers:{}});
    renderRecoveryCenter(data);
    await loadReleaseReadiness();
  } catch (error) {
    console.error(error);
    const list = document.getElementById("recovery-check-list");
    if (list) list.innerHTML = '<div class="app-empty">Recovery-Status konnte nicht geladen werden.</div>';
  }
}

async function runRecoveryAction(operation, button) {
  if (currentRole !== "admin" || !operation) return;
  const label = button?.querySelector("strong")?.textContent || operation;
  if (!confirm(`${label} wirklich ausführen?`)) return;
  const original = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<strong>Aktion läuft …</strong><small>Bitte nicht unterbrechen</small>";
  }
  try {
    const result = await request("/api/recovery/action", {
      method:"POST",
      body:JSON.stringify({operation}),
      headers:{"X-CSRF-Token":csrfToken}
    });
    const verification = result.verification || {};
    const message = verification.ok === false
      ? "Recovery-Prüfung meldet einen Integritätsfehler."
      : operation.startsWith("verify-")
        ? "Recovery-Punkt wurde verifiziert."
        : "Recovery-Aktion wurde erfolgreich ausgeführt.";
    showN2KToast(message, verification.ok === false ? "error" : "success");
    await loadRecoveryCenter();
    await loadSystemHealth();
    await loadNotifications();
  } catch (error) {
    console.error(error);
    showN2KToast("Recovery-Aktion konnte nicht abgeschlossen werden.", "error");
    await loadRecoveryCenter();
  } finally {
    if (button && original) button.innerHTML = original;
  }
}

function switchView(targetId) {
  activeView = targetId || "dashboard-top";
  n2kMobileMenu(false);
  n2kSyncMobileDock();
  const overview = document.getElementById("dashboard-top");
  const grid = document.getElementById("module-grid");

  document.querySelectorAll(".nav-item[data-target]").forEach(item => {
    item.classList.toggle("active", item.dataset.target === activeView);
  });
  syncSystemNavState(activeView);

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

function n2kMobileMenu(open) {
  const enabled = window.matchMedia("(max-width:620px)").matches;
  document.body.classList.toggle("n2k-mobile-menu-open", enabled && open);
  const shade = document.getElementById("n2k-mobile-nav-shade");
  if (shade) shade.hidden = !(enabled && open);
  document.getElementById("n2k-mobile-more")?.setAttribute("aria-expanded", String(enabled && open));
}
function n2kSyncMobileDock(){
  document.querySelectorAll("[data-mobile-view]").forEach(button=>{
    button.classList.toggle("active",button.dataset.mobileView===activeView);
    if(button.dataset.mobileView===activeView)button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  });
  const more = document.getElementById("n2k-mobile-more");
  if(more)more.classList.toggle("active", !["dashboard-top","workspace-panel","media-center-panel","photos-panel"].includes(activeView));
}
document.getElementById("n2k-mobile-dock")?.addEventListener("click", event=>{
  const btn=event.target.closest("button");
  if(!btn)return;
  if(btn.id==="n2k-mobile-more"){n2kMobileMenu(!document.body.classList.contains("n2k-mobile-menu-open"));return}
  if(btn.dataset.mobileView){n2kMobileMenu(false);switchView(btn.dataset.mobileView)}
});
document.getElementById("n2k-mobile-nav-shade")?.addEventListener("click",()=>n2kMobileMenu(false));
document.addEventListener("keydown",e=>{if(e.key==="Escape")n2kMobileMenu(false)});
window.addEventListener("resize",()=>{if(window.innerWidth>620)n2kMobileMenu(false)});
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
setInterval(loadStorage, 15000);
setInterval(loadVms, 20000);
setInterval(loadBackups, 60000);
setInterval(loadSystemHealth, 60000);
setInterval(loadHardwareMaintenance, 120000);
setInterval(loadNotifications, 60000);
setInterval(loadSecurity, 120000);
setInterval(loadRemoteAccess, 120000);
setInterval(loadScheduler, 60000);
setInterval(loadEventCenter, 60000);
setInterval(loadRecoveryCenter, 120000);
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

const N2K_GERMANY_MEDIA_SERVICES = [
  {rank:1, category:"Video", name:"Prime Video", detail:"Filme · Serien · Channels", url:"https://www.amazon.de/gp/video/storefront"},
  {rank:2, category:"Mediathek", name:"ARD Mediathek", detail:"Filme · Serien · Live-TV · Dokus", url:"https://www.ardmediathek.de/"},
  {rank:3, category:"Mediathek", name:"ZDF", detail:"Mediathek · Live-TV · Serien", url:"https://www.zdf.de/"},
  {rank:4, category:"Video", name:"Disney+", detail:"Disney · Marvel · Star Wars · Star", url:"https://www.disneyplus.com/de-de"},
  {rank:5, category:"Video", name:"RTL+", detail:"TV · Serien · Shows · Sport", url:"https://plus.rtl.de/"},
  {rank:6, category:"Video", name:"Joyn", detail:"Live-TV · Serien · Shows", url:"https://www.joyn.de/"},
  {rank:7, category:"Musik", name:"YouTube Music", detail:"Musik · Videos · Podcasts", url:"https://music.youtube.com/"},
  {rank:8, category:"Musik", name:"Amazon Music", detail:"Musik · Podcasts", url:"https://music.amazon.de/"},
  {rank:9, category:"Video", name:"WOW", detail:"Serien · Filme · Sport", url:"https://www.wowtv.de/"},
  {rank:10, category:"Sport", name:"DAZN", detail:"Live-Sport", url:"https://www.dazn.com/de-DE/home"},
  {rank:11, category:"Video", name:"Paramount+", detail:"Filme · Serien", url:"https://www.paramountplus.com/de/"},
  {rank:12, category:"TV", name:"MagentaTV", detail:"Live-TV · Mediatheken · Streaming", url:"https://www.magentatv.de/"},
  {rank:13, category:"TV", name:"waipu.tv", detail:"Live-TV · Aufnahmen · Pay-TV", url:"https://www.waipu.tv/"},
  {rank:14, category:"Video", name:"Pluto TV", detail:"Kostenlose Channels · Filme · Serien", url:"https://pluto.tv/de/"},
  {rank:15, category:"Audio", name:"ARD Sounds", detail:"Radio · Podcasts · Hörspiele", url:"https://www.ardaudiothek.de/"},
  {rank:16, category:"Musik", name:"Deezer", detail:"Musik · Podcasts", url:"https://www.deezer.com/de/"},
  {rank:17, category:"Musik", name:"SoundCloud", detail:"Musik · DJs · Independent", url:"https://soundcloud.com/"},
  {rank:18, category:"Musik", name:"TIDAL", detail:"Musik · HiFi", url:"https://listen.tidal.com/"},
  {rank:19, category:"Musik", name:"Qobuz", detail:"Hi-Res Musik", url:"https://www.qobuz.com/de-de/"},
  {rank:20, category:"Live", name:"Twitch", detail:"Live-Streams · Gaming · Musik", url:"https://www.twitch.tv/"},
  {rank:21, category:"Mediathek", name:"ARTE", detail:"Kultur · Dokus · Filme", url:"https://www.arte.tv/de/"},
  {rank:22, category:"Mediathek", name:"3sat", detail:"Kultur · Wissen · Filme", url:"https://www.3sat.de/"},
  {rank:23, category:"Mediathek", name:"KiKA", detail:"Kinder · Serien · Wissen", url:"https://www.kika.de/"},
  {rank:24, category:"Video", name:"Crunchyroll", detail:"Anime · Serien · Filme", url:"https://www.crunchyroll.com/de/"}
];

const N2K_SEARCH_COMMANDS = [
  {kind:"command", name:"Übersicht", detail:"N2K Desktop", target:"dashboard-top", keywords:"home start dashboard"},
  {kind:"command", name:"Arbeitsplatz", detail:"Dateien & N2K Drive", target:"workspace-panel", keywords:"drive dateien cloud"},
  {kind:"command", name:"Kalender", detail:"Termine", target:"calendar-panel", keywords:"termine kalender"},
  {kind:"command", name:"Apps", detail:"Apps & App Store", target:"apps-panel", keywords:"docker apps store"},
  {kind:"command", name:"Virtuelle Maschinen", detail:"VMs & Home Assistant", target:"vms-panel", keywords:"vm haos home assistant"},
  {kind:"command", name:"Speicher", detail:"Datenträger & Kapazität", target:"storage-panel", keywords:"storage disk"},
  {kind:"command", name:"Backups", detail:"Sichern & Wiederherstellen", target:"backups-panel", keywords:"backup restore"},
  {kind:"command", name:"Netzwerk", detail:"Provider · Ping · Interfaces", target:"network-panel", keywords:"network internet ping provider"},
  {kind:"command", name:"Media Center", detail:"Radio · Musik · Streaming", target:"media-center-panel", keywords:"audio radio musik streaming player"},
  {kind:"command", name:"Office", detail:"Dokumente · Tabellen · Präsentationen", target:"office-panel", keywords:"onlyoffice writer calc"},
  {kind:"command", name:"Terminal", detail:"N2K Terminal", target:"terminal-panel", keywords:"shell konsole cli"},
  {kind:"command", name:"Underground", detail:"Privacy & Tor", target:"privacy-panel", keywords:"tor darknet privacy"},
  {kind:"command", name:"KI", detail:"KI Arbeitsbereich", target:"ai-panel", keywords:"ai ki chatgpt"},
  {kind:"command", name:"Einstellungen & Updates", detail:"Systemeinstellungen", target:"updates-panel", keywords:"settings update wallpaper sync"}
];

const N2K_PRIMARY_MEDIA_SERVICES = [
  {kind:"service", name:"Apple Music", detail:"Streaming · Musik", url:"https://music.apple.com/de/"},
  {kind:"service", name:"Spotify", detail:"Streaming · Musik & Podcasts", url:"https://open.spotify.com/"},
  {kind:"service", name:"Apple TV", detail:"Streaming · Filme & Serien", url:"https://tv.apple.com/de/"},
  {kind:"service", name:"Netflix", detail:"Streaming · Filme & Serien", url:"https://www.netflix.com/de/"},
  {kind:"service", name:"YouTube", detail:"Streaming · Video & Live", url:"https://www.youtube.com/"}
];

const N2K_MEDIA_FAVORITES_KEY = "n2k-media-favorite-stations";
const N2K_MEDIA_FAVORITE_IDS_KEY = "n2k-media-favorites";

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
let mediaRadioMetadataTimer = null;
let mediaRadioMetadataRequest = 0;
let mediaMultiroomSelection = new Set();
let mediaCountry = "DE";
let mediaStationIndex = -1;
let mediaLocalTracks = [];
let mediaLocalIndex = -1;
let mediaQueue = [];
let mediaShuffle = false;
let mediaRepeat = "off";
let mediaActiveSection = "home";
let mediaSessionRestored = false;
let mediaSessionRestoring = false;
let mediaInitialized = false;
let mediaAudioContext = null;
let mediaEqFilters = [];
let mediaSourceNode = null;
let mediaAnalyser = null;
let mediaSpectrumFrame = null;
let mediaSpectrumData = null;
let mediaTimeData = null;

function showN2KToast(message, tone = "info", timeout = 3200) {
  const stack = document.getElementById("n2k-toast-stack");
  if (!stack || !message) return;
  const toast = document.createElement("div");
  toast.className = `n2k-toast ${tone}`;
  toast.innerHTML = "<span></span><strong></strong>";
  toast.querySelector("span").textContent = tone === "success" ? "✓" : tone === "error" ? "!" : "•";
  toast.querySelector("strong").textContent = message;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, timeout);
}

function formatMediaDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "–:––";
  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function mediaSessionSnapshot() {
  const current = mediaCurrentStation();
  return {
    volume: Math.round((mediaAudio?.volume ?? 0.72) * 100),
    muted: Boolean(mediaAudio?.muted),
    eq: Array.from(document.querySelectorAll("#media-equalizer input[data-eq]")).map(input => Number(input.value) || 0),
    country: mediaCountry,
    section: mediaActiveSection,
    shuffle: mediaShuffle,
    repeat: mediaRepeat,
    queue: [...mediaQueue],
    current: current ? {
      id: current.id,
      source: current.source || "radio",
      name: current.name,
      title: current.title,
      artist: current.artist,
      album: current.album,
      genre: current.genre,
      bitrate: current.bitrate,
      country: current.country,
      url: current.url,
      favicon: current.favicon,
      artwork_url: current.artwork_url,
      path: current.path
    } : null
  };
}

function saveMediaSession() {
  if (mediaSessionRestoring) return;
  try {
    localStorage.setItem("n2k-media-session", JSON.stringify(mediaSessionSnapshot()));
  } catch (_) {}
}

function loadMediaSession() {
  try {
    const data = JSON.parse(localStorage.getItem("n2k-media-session") || "{}");
    return data && typeof data === "object" ? data : {};
  } catch (_) {
    return {};
  }
}

function applyMediaSection(section = "home") {
  mediaActiveSection = section || "home";
  const grid = document.querySelector(".media-center-grid");
  document.querySelectorAll(".media-section-tabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.mediaSection === mediaActiveSection);
  });
  document.querySelectorAll("[data-media-group]").forEach(card => {
    const group = card.dataset.mediaGroup;
    const visible = mediaActiveSection === "home"
      ? ["radio","library","streaming"].includes(group)
      : group === mediaActiveSection;
    card.classList.toggle("media-section-hidden", !visible);
  });
  if (grid) {
    grid.classList.toggle("media-filtered", mediaActiveSection !== "home");
    grid.dataset.section = mediaActiveSection;
  }
  saveMediaSession();
}

function restoreMediaPreferences() {
  mediaSessionRestoring = true;
  const state = loadMediaSession();
  const audio = ensureMediaAudio();
  const volume = Number(state.volume);
  if (Number.isFinite(volume)) audio.volume = Math.max(0, Math.min(1, volume / 100));
  audio.muted = Boolean(state.muted);
  if (typeof state.country === "string" && /^[A-Z]{2}$/.test(state.country)) mediaCountry = state.country;
  if (typeof state.section === "string") {
    const legacySettings = new Set(["devices","audio","multiroom","all"]);
    mediaActiveSection = legacySettings.has(state.section)
      ? (state.section === "all" ? "home" : "settings")
      : state.section;
  }
  mediaShuffle = Boolean(state.shuffle);
  if (["off","all","one"].includes(state.repeat)) mediaRepeat = state.repeat;
  if (Array.isArray(state.queue)) mediaQueue = state.queue.map(String).slice(0, 200);

  const eqValues = Array.isArray(state.eq) ? state.eq : [];
  document.querySelectorAll("#media-equalizer input[data-eq]").forEach((input,index) => {
    if (Number.isFinite(Number(eqValues[index]))) input.value = String(eqValues[index]);
  });
  const volumeInput = document.getElementById("media-volume");
  const topVolumeInput = document.getElementById("top-media-volume");
  const volumeCopy = document.getElementById("media-volume-value");
  if (volumeInput) volumeInput.value = String(Math.round(audio.volume * 100));
  if (topVolumeInput) topVolumeInput.value = String(Math.round(audio.volume * 100));
  if (volumeCopy) volumeCopy.textContent = `${Math.round(audio.volume * 100)}%`;
  document.querySelectorAll("#media-country-tabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.country === mediaCountry);
  });
  applyMediaSection(mediaActiveSection);
  updateMediaPlayModes();
  applyMediaEq();
  mediaSessionRestoring = false;
}

function restoreMediaCurrentItem() {
  if (mediaSessionRestored) return;
  const state = loadMediaSession();
  const current = state.current;
  if (!current?.id || !current?.url) return;

  const audio = ensureMediaAudio();
  if (current.source === "local") {
    const index = mediaLocalTracks.findIndex(track => String(track.id) === String(current.id));
    if (index < 0) return;
    mediaStationIndex = -1;
    mediaLocalIndex = index;
    const track = mediaLocalTracks[index];
    audio.src = track.url;
    updateMediaArtwork(track);
  } else {
    let index = mediaStations.findIndex(station => String(station.id) === String(current.id));
    if (index < 0) {
      mediaStations = [...mediaStations, current];
      index = mediaStations.length - 1;
    }
    mediaLocalIndex = -1;
    mediaStationIndex = index;
    audio.src = current.url;
    updateMediaArtwork(current);
  }
  mediaSessionRestored = true;
  updateMediaPlaybackUi();
  if (mediaLocalIndex < 0 && mediaStationIndex >= 0) startRadioMetadataPolling(mediaStations[mediaStationIndex]);
  updateMediaFavoriteButton();
  renderMediaLibrary();
  renderMediaStations();
}

function clearSpectrumUi() {
  const canvas = document.getElementById("media-spectrum");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
  const peak = document.getElementById("media-spectrum-peak");
  const rms = document.getElementById("media-spectrum-rms");
  const state = document.getElementById("media-spectrum-state");
  if (peak) peak.textContent = "– dBFS";
  if (rms) rms.textContent = "– dBFS";
  if (state) state.textContent = "Kein Signal";
  document.querySelectorAll("[data-eq-level]").forEach(node => { node.textContent = "Signal – dB"; });
}

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
  mediaAudio.addEventListener("error", () => {
    setMediaStatus("Wiedergabe nicht erreichbar");
    showN2KToast("Die aktuelle Audioquelle konnte nicht wiedergegeben werden.", "error");
  });
  mediaAudio.addEventListener("ended", handleMediaEnded);
  mediaAudio.addEventListener("timeupdate", updateMediaProgress);
  mediaAudio.addEventListener("durationchange", updateMediaProgress);
  return mediaAudio;
}

function mediaCurrentStation() {
  if (mediaLocalIndex >= 0) return mediaLocalTracks[mediaLocalIndex] || null;
  return mediaStationIndex >= 0 ? mediaStations[mediaStationIndex] : null;
}

function setMediaStatus(text) {
  const subtitle = document.getElementById("media-subtitle");
  if (subtitle && text) subtitle.textContent = text;
}

function mediaDisplayTitle(item) {
  if (!item) return "Noch kein Titel";
  if (item.source === "local") return item.title || item.name;
  return item.now_playing?.title || item.now_playing?.raw || item.name || item.title || "Radiosender";
}

function mediaDisplayMeta(item) {
  if (!item) return "Radio · Eigene Musik · Streaming";
  if (item.source === "local") {
    return [item.artist || "Unbekannter Interpret", item.album || item.name].filter(Boolean).join(" · ");
  }
  if (item.now_playing?.artist) return [item.now_playing.artist, item.name].filter(Boolean).join(" · ");
  if (item.now_playing?.raw && item.now_playing.raw !== mediaDisplayTitle(item)) return [item.now_playing.raw, item.name].filter(Boolean).join(" · ");
  return [item.name, item.genre || "Radio", item.country || "Internet"].filter(Boolean).join(" · ");
}

function stopRadioMetadataPolling(clear = false) {
  clearTimeout(mediaRadioMetadataTimer);
  mediaRadioMetadataTimer = null;
  mediaRadioMetadataRequest += 1;
  if (clear) {
    const badge = document.getElementById("media-rds-badge");
    if (badge) badge.classList.add("hidden");
  }
}

function scheduleRadioMetadata(station, delay = 9000) {
  clearTimeout(mediaRadioMetadataTimer);
  mediaRadioMetadataTimer = setTimeout(() => pollRadioMetadata(station), delay);
}

async function pollRadioMetadata(station) {
  if (!station || station.source === "local" || !station.url) return;
  const current = mediaCurrentStation();
  if (!current || String(current.id) !== String(station.id) || mediaLocalIndex >= 0) return;
  const requestId = ++mediaRadioMetadataRequest;
  try {
    const data = await request(`/api/media/radio/metadata?url=${encodeURIComponent(station.url)}`, {headers:{}});
    if (requestId !== mediaRadioMetadataRequest) return;
    const active = mediaCurrentStation();
    if (!active || String(active.id) !== String(station.id)) return;
    if (data.available && (data.title || data.stream_title)) {
      station.now_playing = {
        title: String(data.title || data.stream_title || "").trim(),
        artist: String(data.artist || "").trim(),
        raw: String(data.stream_title || "").trim()
      };
      const badge = document.getElementById("media-rds-badge");
      if (badge) badge.classList.remove("hidden");
      updateMediaPlaybackUi();
      renderMediaStations();
    } else {
      station.now_playing = null;
      const badge = document.getElementById("media-rds-badge");
      if (badge) badge.classList.add("hidden");
      updateMediaPlaybackUi();
    }
  } catch (error) {
    console.debug("Radio metadata unavailable", error);
  } finally {
    const active = mediaCurrentStation();
    if (active && String(active.id) === String(station.id) && mediaLocalIndex < 0) scheduleRadioMetadata(station, 9000);
  }
}

function startRadioMetadataPolling(station) {
  stopRadioMetadataPolling(true);
  if (!station || station.source === "local") return;
  pollRadioMetadata(station);
}

function updateMediaSessionMetadata() {
  const station = mediaCurrentStation();
  if (!("mediaSession" in navigator) || !station) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaDisplayTitle(station),
      artist: station.source === "local"
        ? (station.artist || "Eigene Musik")
        : (station.now_playing?.artist || station.name || station.genre || "Internet Radio"),
      album: station.source === "local" ? (station.album || "N2K Audio") : (station.name || "N2K Media Center"),
      artwork: (station.artwork_url || station.favicon) ? [
        {src: station.artwork_url || station.favicon, sizes: "256x256"}
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
    play: () => playMediaPlayback(),
    pause: () => pauseMediaPlayback(),
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
  const topTitle = document.getElementById("top-media-title");
  const topSubtitle = document.getElementById("top-media-subtitle");
  const topStatus = document.getElementById("top-media-status");
  const sourceLabel = document.getElementById("media-source-label");
  const topPlay = document.getElementById("top-media-play");
  const topPause = document.getElementById("top-media-pause");
  const topMute = document.getElementById("top-media-mute");
  const topVolume = document.getElementById("top-media-volume");
  const mainVolume = document.getElementById("media-volume");
  const liveDot = document.getElementById("media-live-dot");
  const visualizer = document.querySelector(".media-visualizer");

  if (play) play.textContent = playing ? "Ⅱ" : "▶";
  const displayTitle = mediaDisplayTitle(station);
  const displayMeta = mediaDisplayMeta(station);
  const rdsLive = Boolean(station?.source !== "local" && station?.now_playing?.title);
  const sourceText = station?.source === "local" ? "EIGENE MUSIK" : station ? (rdsLive ? "RADIO · RDS" : "RADIO") : "MEDIA";
  if (topTitle) topTitle.textContent = displayTitle;
  if (topSubtitle) topSubtitle.textContent = displayMeta;
  if (topStatus) topStatus.textContent = `${sourceText} · ${playing ? "LÄUFT" : audio.src ? "PAUSE" : "BEREIT"}`;
  if (sourceLabel) sourceLabel.textContent = sourceText;
  if (topPlay) topPlay.classList.toggle("active", playing);
  if (topPause) topPause.classList.toggle("active", Boolean(mediaAudio?.paused && mediaAudio?.src));
  if (topMute) {
    topMute.textContent = mediaAudio?.muted ? "🔇" : "🔊";
    topMute.classList.toggle("active", Boolean(mediaAudio?.muted));
  }
  const volumeValue = Math.round(audio.volume * 100);
  if (topVolume && document.activeElement !== topVolume) topVolume.value = String(volumeValue);
  if (mainVolume && document.activeElement !== mainVolume) mainVolume.value = String(volumeValue);
  const overviewTitle = document.getElementById("overview-media-title");
  const overviewSubtitle = document.getElementById("overview-media-subtitle");
  const overviewPlay = document.getElementById("overview-media-play");
  if (overviewTitle && station) overviewTitle.textContent = mediaDisplayTitle(station);
  if (overviewSubtitle && station) overviewSubtitle.textContent = station
    ? (station.source === "local"
      ? [station.artist || "Eigene Musik", station.album].filter(Boolean).join(" · ")
      : (station.now_playing?.artist ? `${station.now_playing.artist} · ${station.name}` : `${station.genre || "Radio"} · ${station.country || "Internet"}`))
    : "Radio & Streaming";
  if (overviewPlay) overviewPlay.textContent = playing ? "Ⅱ" : "▶";
  if(station)n2kRememberPlayableMedia(station);
  if(station)n2kBridgeMediaToOverview(station);
  if (liveDot) liveDot.classList.toggle("active", playing);
  if (visualizer) visualizer.classList.toggle("has-signal", playing);

  if (station) {
    updateMediaSessionMetadata();
    const title = document.getElementById("media-title");
    const subtitle = document.getElementById("media-subtitle");
    if (title) title.textContent = mediaDisplayTitle(station);
    if (subtitle) subtitle.textContent = station.source === "local"
      ? [station.artist || "Unbekannter Interpret", station.album, station.name !== station.title ? station.name : "", station.genre, station.bitrate].filter(Boolean).join(" · ")
      : [station.now_playing?.artist, station.name, station.genre, station.bitrate, station.country].filter(Boolean).join(" · ");
    updateMediaArtwork(station);
  }
}

function n2kSafeMediaArtwork(item) {
  for (const raw of [item?.artwork_url,item?.favicon,item?.artwork,item?.cover,item?.image,item?.logo]) {
    const url=typeof raw==="string"?raw.trim():"";
    if (url && (url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://") || url.startsWith("blob:") || url.startsWith("data:image/"))) return url;
  }
  return "";
}

function n2kPlayerArtworkFromDom() {
  const node=document.getElementById("top-media-art");
  if(!node)return "";
  const value=node.style.backgroundImage||getComputedStyle(node).backgroundImage||"";
  if(!value.startsWith("url("))return "";
  const raw=value.slice(4,-1).trim().replace(/^["']|["']$/g,"");
  return n2kSafeMediaArtwork({artwork_url:raw});
}
function n2kBridgeMediaToOverview(item) {
  const playerImage=n2kPlayerArtworkFromDom();
  const art=playerImage||n2kSafeMediaArtwork(item);
  const station=item||mediaCurrentStation();
  if(station&&art){
    n2kOverviewLastArtwork({...station,artwork_url:art});
  }else{
    n2kOverviewLastArtwork(null);
  }
}
function n2kOverviewLastArtwork(item) {
  const cover=document.getElementById("overview-media-art");
  if(!cover)return;
  const key="n2k-media-last-artwork-v3";
  let saved=null;
  try { saved=JSON.parse(localStorage.getItem(key)||"null"); } catch(_) {}
  if(!saved) {
    try {
      const legacy=JSON.parse(localStorage.getItem("n2k-media-last-artwork-v2")||"null");
      if(legacy?.artwork)saved={title:legacy.title||"",artwork:legacy.artwork,subtitle:""};
    } catch(_) {}
  }
  if(!saved){
    const previous=loadMediaSession()?.current;
    if(previous)saved={title:previous.title||previous.name||"",artwork:n2kSafeMediaArtwork(previous),subtitle:previous.artist||""};
  }
  const candidate=item?n2kSafeMediaArtwork(item):"";
  if(item && candidate){
    saved={artwork:candidate,title:String(item.title||item.name||"Zuletzt gespielt").slice(0,150),
      subtitle:String(item.artist||item.album||item.genre||"").slice(0,150)};
    try{localStorage.setItem(key,JSON.stringify(saved));}catch(_){}
  }
  const artwork=candidate||n2kSafeMediaArtwork({artwork_url:saved?.artwork})||"";
  // Use an actual image element: stylesheet background declarations cannot hide it.
  let image=cover.querySelector("img.n2k-last-cover");
  if(artwork){
    if(!image){
      image=document.createElement("img");
      image.className="n2k-last-cover";
      image.alt="";
      image.decoding="async";
      image.addEventListener("load",()=>{cover.classList.add("has-artwork");});
      image.addEventListener("error",()=>{
        image.hidden=true;
        cover.classList.remove("has-artwork");
        cover.dataset.coverError="1";
      });
      cover.replaceChildren(image);
    }
    if(image.getAttribute("src")!==artwork){
      image.hidden=false;
      cover.dataset.coverError="";
      image.src=artwork;
    }
    if(!image.hidden)cover.classList.add("has-artwork");
  }else{
    cover.replaceChildren(document.createTextNode("♪"));
    cover.classList.remove("has-artwork");
  }
  cover.title=item?.title||item?.name||saved?.title||"Zuletzt gespielt";
  const title=document.getElementById("overview-media-title");
  const subtitle=document.getElementById("overview-media-subtitle");
  if(!item && saved?.title && title && ["Bereit","Noch kein Titel"].includes(title.textContent.trim()))title.textContent=saved.title;
  if(!item && saved?.subtitle && subtitle && ["Radio & Streaming","Radio · Eigene Musik · Streaming"].includes(subtitle.textContent.trim()))subtitle.textContent=saved.subtitle;
}
function updateMediaArtwork(item) {
  const cover = document.getElementById("media-cover");
  const topArt = document.getElementById("top-media-art");
  const artwork = item?.artwork_url || item?.favicon || "";
  const safeArtwork = artwork ? artwork.replace(/"/g, "%22") : "";

  if (cover) {
    cover.classList.toggle("has-artwork", Boolean(artwork));
    cover.style.backgroundImage = artwork ? `url("${safeArtwork}")` : "";
    const label = cover.querySelector("span");
    const sub = cover.querySelector("strong");
    if (label) label.textContent = artwork ? "" : "N2K";
    if (sub) sub.textContent = artwork ? "" : "MEDIA";
  }

  if (topArt) {
    topArt.classList.toggle("has-artwork", Boolean(artwork));
    topArt.style.backgroundImage = artwork ? `url("${safeArtwork}")` : "";
    const fallback = topArt.querySelector("span");
    if (fallback) fallback.textContent = artwork ? "" : "♪";
    topArt.title = item?.source === "local"
      ? (item?.album || item?.artist || "Lokale Musik")
      : (item?.name || "Radiosender");
  }
  n2kBridgeMediaToOverview(item);
}

function updateMediaProgress() {
  const audio = mediaAudio;
  const fill = document.getElementById("media-progress-fill");
  const time = document.getElementById("media-time");
  const current = mediaCurrentStation();
  if (!audio || !fill || !time) return;
  if (current?.source === "local" && Number.isFinite(audio.duration) && audio.duration > 0) {
    const percent = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
    fill.style.width = `${percent}%`;
    time.textContent = `${formatMediaDuration(audio.currentTime)} / ${formatMediaDuration(audio.duration)}`;
  } else {
    fill.style.width = "100%";
    time.textContent = audio.src ? "LIVE" : "–";
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
  const favorites = new Set(getMediaFavoriteStations().map(item => item.id));
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
    row.querySelector("small").textContent = station.now_playing?.title
      ? `RDS · ${[station.now_playing.artist, station.now_playing.title].filter(Boolean).join(" — ")}`
      : `${station.genre} · ${station.bitrate}`;
    const fav = row.querySelector(".media-fav");
    fav.textContent = favorites.has(station.id) ? "♥" : "♡";
    fav.addEventListener("click", event => {
      event.stopPropagation();
      toggleMediaFavorite(station);
      renderMediaStations();
    });
    row.querySelector(".media-station-play").addEventListener("click", () => playMediaStation(index));
    row.addEventListener("dblclick", () => playMediaStation(index));
    list.appendChild(row);
  }
  if (!list.children.length) list.innerHTML = '<div class="media-empty">Keine Sender gefunden.</div>';
}

function normalizeFavoriteStation(station) {
  if (!station || !station.id || !station.url) return null;
  const source = station.source === "local" ? "local" : "radio";
  return {
    id: String(station.id),
    source,
    country: String(station.country || (source === "local" ? "N2K AUDIO" : "")),
    name: String(station.name || station.title || (source === "local" ? "Lokaler Titel" : "Radiosender")),
    title: String(station.title || station.name || ""),
    artist: String(station.artist || ""),
    album: String(station.album || ""),
    genre: String(station.genre || (source === "local" ? "Lokale Musik" : "Radio")),
    bitrate: String(station.bitrate || ""),
    url: String(station.url),
    favicon: String(station.favicon || ""),
    artwork_url: String(station.artwork_url || ""),
    path: String(station.path || ""),
    duration_seconds: Number.isFinite(Number(station.duration_seconds)) ? Number(station.duration_seconds) : null
  };
}

function getMediaFavoriteStations() {
  let saved = [];
  try {
    const raw = JSON.parse(localStorage.getItem(N2K_MEDIA_FAVORITES_KEY) || "[]");
    if (Array.isArray(raw)) saved = raw.map(normalizeFavoriteStation).filter(Boolean);
  } catch (_) {}

  let legacyIds = [];
  try {
    const legacy = JSON.parse(localStorage.getItem(N2K_MEDIA_FAVORITE_IDS_KEY) || "[]");
    if (Array.isArray(legacy)) legacyIds = legacy.map(String);
  } catch (_) {}

  if (legacyIds.length) {
    const known = [...mediaStations, ...N2K_RADIO_STATIONS, ...mediaLocalTracks];
    for (const id of legacyIds) {
      if (saved.some(item => item.id === id)) continue;
      const station = known.find(item => String(item.id) === id);
      const normalized = normalizeFavoriteStation(station);
      if (normalized) saved.push(normalized);
    }
    localStorage.removeItem(N2K_MEDIA_FAVORITE_IDS_KEY);
    localStorage.setItem(N2K_MEDIA_FAVORITES_KEY, JSON.stringify(saved));
  }
  return saved;
}

function saveMediaFavoriteStations(stations) {
  const unique = [];
  for (const station of stations) {
    const normalized = normalizeFavoriteStation(station);
    if (normalized && !unique.some(item => item.id === normalized.id)) unique.push(normalized);
  }
  localStorage.setItem(N2K_MEDIA_FAVORITES_KEY, JSON.stringify(unique));
}

function toggleMediaFavorite(stationOrId) {
  const station = typeof stationOrId === "object"
    ? stationOrId
    : [...mediaStations, ...N2K_RADIO_STATIONS, ...mediaLocalTracks]
      .find(item => String(item.id) === String(stationOrId));
  if (!station) return;
  const favorites = getMediaFavoriteStations();
  const existing = favorites.findIndex(item => item.id === String(station.id));
  const adding = existing < 0;
  if (adding) favorites.push(station);
  else favorites.splice(existing, 1);
  saveMediaFavoriteStations(favorites);
  updateMediaFavoriteButton();
  renderMediaFavorites();
  renderMediaLibrary();
  showN2KToast(adding ? "Zu Meine Medien hinzugefügt." : "Aus Meine Medien entfernt.", adding ? "success" : "info");
}

function updateMediaFavoriteButton() {
  const button = document.getElementById("media-favorite");
  const station = mediaCurrentStation();
  if (!button) return;
  button.disabled = !station;
  if (!station) {
    button.textContent = "♡";
    return;
  }
  const favorites = new Set(getMediaFavoriteStations().map(item => item.id));
  button.textContent = favorites.has(String(station.id)) ? "♥" : "♡";
}

function playFavoriteStation(station) {
  if (station.source === "local") {
    const index = mediaLocalTracks.findIndex(item => String(item.id) === String(station.id));
    if (index >= 0) {
      playLocalTrack(index);
      return;
    }
    showN2KToast("Die lokale Datei ist nicht mehr im Audio-Ordner vorhanden.", "error");
    return;
  }
  let index = mediaStations.findIndex(item => String(item.id) === String(station.id));
  if (index < 0) {
    mediaStations = [...mediaStations, station];
    index = mediaStations.length - 1;
  }
  playMediaStation(index);
}

function favoriteArtwork(station) {
  return station.source === "local" ? station.artwork_url : station.favicon;
}

function renderMediaFavorites() {
  const favorites = getMediaFavoriteStations();
  const list = document.getElementById("media-favorites-list");
  const count = document.getElementById("media-favorites-count");
  const overview = document.getElementById("overview-media-favorites");
  if (count) count.textContent = String(favorites.length);

  if (list) {
    list.innerHTML = "";
    for (const station of favorites) {
      const row = document.createElement("div");
      row.className = "media-favorite-row";
      row.innerHTML = '<span class="media-station-logo">♪</span><div><strong></strong><small></small></div><button class="media-favorite-remove" title="Favorit entfernen">♥</button><button class="media-station-play" title="Abspielen">▶</button>';
      row.querySelector("strong").textContent = station.title || station.name;
      row.querySelector("small").textContent = station.source === "local"
        ? [station.artist, station.album, "Eigene Musik"].filter(Boolean).join(" · ")
        : [station.country, station.genre].filter(Boolean).join(" · ");
      const logo = row.querySelector(".media-station-logo");
      const artwork = favoriteArtwork(station);
      if (artwork) {
        logo.textContent = "";
        const image = document.createElement("img");
        image.src = artwork;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => { logo.textContent = "♪"; image.remove(); });
        logo.appendChild(image);
      }
      row.querySelector(".media-favorite-remove").addEventListener("click", () => toggleMediaFavorite(station));
      row.querySelector(".media-station-play").addEventListener("click", () => playFavoriteStation(station));
      row.addEventListener("dblclick", () => playFavoriteStation(station));
      list.appendChild(row);
    }
    if (!favorites.length) list.innerHTML = '<div class="media-empty">Noch keine Medien-Favoriten gespeichert.</div>';
  }

  if (overview) {
    overview.innerHTML = "";
    for (const station of favorites.slice(0, 4)) {
      const button = document.createElement("button");
      button.className = "overview-media-favorite";
      button.innerHTML = "<span>♪</span><strong></strong>";
      button.querySelector("strong").textContent = station.title || station.name;
      button.title = `${station.title || station.name} abspielen`;
      button.addEventListener("click", () => playFavoriteStation(station));
      overview.appendChild(button);
    }
    if (!favorites.length) overview.innerHTML = '<span class="widget-empty">Noch keine Medien-Favoriten.</span>';
  }
}

async function playMediaStation(index) {
  const station = mediaStations[index];
  if (!station) return;
  const audio = ensureMediaAudio();
  mediaLocalIndex = -1;
  ensureMediaEqGraph();
  if (mediaAudioContext?.state === "suspended") {
    try { await mediaAudioContext.resume(); } catch (_) {}
  }
  mediaStationIndex = index;
  n2kRememberPlayableMedia(station);
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
  startRadioMetadataPolling(station);
  saveMediaSession();
}

function localTrackIndexById(id) {
  return mediaLocalTracks.findIndex(track => String(track.id) === String(id));
}

function enqueueLocalTrack(index) {
  const track = mediaLocalTracks[index];
  if (!track) return;
  mediaQueue.push(track.id);
  renderMediaQueue();
  showN2KToast(`${track.title || track.name} zur Warteschlange hinzugefügt.`, "success");
  saveMediaSession();
}

function renderMediaQueue() {
  const list = document.getElementById("media-queue-list");
  const count = document.getElementById("media-queue-count");
  if (count) count.textContent = String(mediaQueue.length);
  if (!list) return;
  list.innerHTML = "";
  mediaQueue.forEach((id,queueIndex) => {
    const trackIndex = localTrackIndexById(id);
    const track = mediaLocalTracks[trackIndex];
    if (!track) return;
    const row = document.createElement("div");
    row.className = "media-queue-row";
    row.innerHTML = '<span></span><div><strong></strong><small></small></div><button title="Entfernen">×</button>';
    row.querySelector("span").textContent = String(queueIndex + 1).padStart(2, "0");
    row.querySelector("strong").textContent = track.title || track.name;
    row.querySelector("small").textContent = [track.artist, track.album].filter(Boolean).join(" · ") || "Eigene Musik";
    row.querySelector("button").addEventListener("click", () => {
      mediaQueue.splice(queueIndex, 1);
      renderMediaQueue();
      saveMediaSession();
    });
    row.addEventListener("dblclick", () => {
      mediaQueue.splice(queueIndex, 1);
      playLocalTrack(trackIndex);
      renderMediaQueue();
    });
    list.appendChild(row);
  });
  if (!list.children.length) list.innerHTML = '<div class="media-empty compact-empty">Queue ist leer.</div>';
}

function clearMediaQueue() {
  mediaQueue = [];
  renderMediaQueue();
  saveMediaSession();
  showN2KToast("Warteschlange geleert.", "info");
}

function updateMediaPlayModes() {
  const shuffle = document.getElementById("media-shuffle");
  const repeat = document.getElementById("media-repeat");
  if (shuffle) {
    shuffle.textContent = mediaShuffle ? "Zufall an" : "Zufall aus";
    shuffle.classList.toggle("active", mediaShuffle);
  }
  if (repeat) {
    const labels = {off:"Repeat aus", all:"Repeat alle", one:"Repeat Titel"};
    repeat.textContent = labels[mediaRepeat] || labels.off;
    repeat.classList.toggle("active", mediaRepeat !== "off");
  }
}

function nextLocalTrack(direction = 1, fromEnded = false) {
  if (!mediaLocalTracks.length) return false;
  if (direction > 0 && mediaQueue.length) {
    const id = mediaQueue.shift();
    const index = localTrackIndexById(id);
    renderMediaQueue();
    if (index >= 0) {
      playLocalTrack(index);
      return true;
    }
  }
  if (mediaRepeat === "one" && fromEnded && mediaLocalIndex >= 0) {
    playLocalTrack(mediaLocalIndex);
    return true;
  }
  if (mediaShuffle && mediaLocalTracks.length > 1) {
    let next = mediaLocalIndex;
    while (next === mediaLocalIndex) next = Math.floor(Math.random() * mediaLocalTracks.length);
    playLocalTrack(next);
    return true;
  }
  if (mediaLocalIndex < 0) {
    playLocalTrack(direction > 0 ? 0 : mediaLocalTracks.length - 1);
    return true;
  }
  const candidate = mediaLocalIndex + direction;
  if (candidate >= 0 && candidate < mediaLocalTracks.length) {
    playLocalTrack(candidate);
    return true;
  }
  if (mediaRepeat === "all") {
    playLocalTrack(direction > 0 ? 0 : mediaLocalTracks.length - 1);
    return true;
  }
  if (fromEnded) stopMediaPlayback();
  return false;
}

function handleMediaEnded() {
  if (mediaLocalIndex >= 0) {
    nextLocalTrack(1, true);
  } else if (mediaStationIndex >= 0) {
    stepMediaStation(1);
  }
}

function stepMediaStation(direction) {
  if (mediaLocalIndex >= 0 && mediaLocalTracks.length) {
    nextLocalTrack(direction, false);
    return;
  }
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
  const list = document.getElementById("media-station-list");
  if (list) list.innerHTML = '<div class="media-loading"><i></i><i></i><i></i></div>';
  try {
    const params = new URLSearchParams({country: mediaCountry, search, limit: "80"});
    const data = await request(`/api/media/radio?${params.toString()}`, {headers: {}});
    if (requestId !== mediaRadioRequest) return;
    const stations = Array.isArray(data.stations) ? data.stations : [];
    if (stations.length) {
      mediaStations = stations;
      if (mediaLocalIndex < 0) mediaStationIndex = -1;
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
  renderMediaFavorites();
  restoreMediaCurrentItem();
}

function renderMediaLibrary() {
  const list = document.getElementById("media-library-list");
  const count = document.getElementById("media-library-count");
  if (!list) return;
  const query = (document.getElementById("media-library-search")?.value || "").trim().toLowerCase();
  const favorites = new Set(getMediaFavoriteStations().map(item => String(item.id)));
  const visible = mediaLocalTracks
    .map((track,index) => ({track,index}))
    .filter(({track}) => !query || `${track.title} ${track.name} ${track.artist} ${track.album} ${track.genre} ${track.path}`.toLowerCase().includes(query));
  if (count) count.textContent = `${mediaLocalTracks.length} Titel`;
  list.innerHTML = "";

  for (const {track,index} of visible) {
    const row = document.createElement("div");
    row.className = "media-library-row";
    if (index === mediaLocalIndex) row.classList.add("active");
    row.innerHTML = '<span class="media-library-icon">♪</span><div class="media-library-copy"><strong></strong><small></small></div><em class="media-library-duration"></em><div class="media-library-row-actions"><button class="fav" title="Meine Medien">♡</button><button class="queue" title="Zur Warteschlange">＋</button><button class="play" title="Abspielen">▶</button></div>';
    const icon = row.querySelector(".media-library-icon");
    if (track.artwork_url) {
      icon.textContent = "";
      const image = document.createElement("img");
      image.src = track.artwork_url;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => { icon.textContent = "♪"; image.remove(); });
      icon.appendChild(image);
    }
    row.querySelector("strong").textContent = track.title || track.name;
    row.querySelector("small").textContent =
      [track.artist || "Unbekannter Interpret", track.album, track.genre, track.extension?.toUpperCase()].filter(Boolean).join(" · ");
    row.querySelector(".media-library-duration").textContent = formatMediaDuration(track.duration_seconds);
    const fav = row.querySelector(".fav");
    fav.textContent = favorites.has(String(track.id)) ? "♥" : "♡";
    fav.addEventListener("click", event => {
      event.stopPropagation();
      toggleMediaFavorite(track);
    });
    row.querySelector(".queue").addEventListener("click", event => {
      event.stopPropagation();
      enqueueLocalTrack(index);
    });
    row.querySelector(".play").addEventListener("click", event => {
      event.stopPropagation();
      playLocalTrack(index);
    });
    row.addEventListener("dblclick", () => playLocalTrack(index));
    list.appendChild(row);
  }
  if (!visible.length) {
    list.innerHTML = '<div class="media-empty">Keine Audiodateien gefunden. Lege Musik unter Arbeitsplatz → Audio ab.</div>';
  }
}

async function loadMediaLibrary() {
  const list = document.getElementById("media-library-list");
  if (list) list.innerHTML = '<div class="media-loading"><i></i><i></i><i></i></div>';
  try {
    const data = await request("/api/media/library", {headers:{}});
    mediaLocalTracks = (Array.isArray(data.tracks) ? data.tracks : []).map(track => ({
      ...track,
      source: "local",
      genre: track.genre || "Lokale Musik",
      country: "N2K AUDIO",
      bitrate: track.extension ? track.extension.toUpperCase() : "Audio"
    }));
    mediaQueue = mediaQueue.filter(id => localTrackIndexById(id) >= 0);
    renderMediaLibrary();
    renderMediaQueue();
    renderMediaFavorites();
    restoreMediaCurrentItem();
  } catch (error) {
    console.error("Local media library unavailable", error);
    if (list) list.innerHTML = '<div class="media-empty">Audio-Ordner konnte nicht geladen werden.</div>';
    showN2KToast("Lokale Musikbibliothek konnte nicht geladen werden.", "error");
  }
}

async function playLocalTrack(index) {
  const track = mediaLocalTracks[index];
  if (!track) return;
  stopRadioMetadataPolling(true);
  const audio = ensureMediaAudio();
  ensureMediaEqGraph();
  if (mediaAudioContext?.state === "suspended") {
    try { await mediaAudioContext.resume(); } catch (_) {}
  }
  mediaStationIndex = -1;
  mediaLocalIndex = index;
  n2kRememberPlayableMedia(track);
  const targetUrl = new URL(track.url, window.location.href).href;
  if (audio.src !== targetUrl) {
    audio.src = track.url;
    audio.load();
  }
  updateMediaFavoriteButton();
  renderMediaLibrary();
  updateMediaArtwork(track);
  try {
    await audio.play();
  } catch (error) {
    console.error(error);
    setMediaStatus("Lokale Audiodatei konnte nicht abgespielt werden.");
    showN2KToast("Lokale Audiodatei konnte nicht abgespielt werden.", "error");
  }
  updateMediaPlaybackUi();
  saveMediaSession();
}


function renderMediaServiceDirectory() {
  const list = document.getElementById("media-service-directory-list");
  if (!list) return;
  list.innerHTML = "";
  for (const service of [...N2K_GERMANY_MEDIA_SERVICES].sort((a,b) => a.rank - b.rank)) {
    const button = document.createElement("button");
    button.className = "media-directory-service";
    button.innerHTML = '<span class="media-directory-rank"></span><div><strong></strong><small></small></div><em>↗</em>';
    button.querySelector(".media-directory-rank").textContent = String(service.rank).padStart(2, "0");
    button.querySelector("strong").textContent = service.name;
    button.querySelector("small").textContent = `${service.category} · ${service.detail}`;
    button.addEventListener("click", () => window.open(service.url, "n2k-media-streaming", "noopener,noreferrer"));
    list.appendChild(button);
  }
}

function toggleMediaServiceDirectory(show) {
  const directory = document.getElementById("media-service-directory");
  if (!directory) return;
  directory.classList.toggle("hidden", !show);
  if (show) renderMediaServiceDirectory();
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
    showN2KToast("Audio-Ausgang konnte nicht umgeschaltet werden.", "error");
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
    showN2KToast(connect ? "Bluetooth-Gerät verbunden." : "Bluetooth-Gerät getrennt.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast(connect ? "Bluetooth-Gerät konnte nicht verbunden werden." : "Bluetooth-Gerät konnte nicht getrennt werden.", "error");
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
    showN2KToast(enabled ? "AirPlay-Suche aktiviert." : "AirPlay-Suche deaktiviert.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast(enabled ? "AirPlay-Suche konnte nicht aktiviert werden." : "AirPlay-Suche konnte nicht deaktiviert werden.", "error");
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
      showN2KToast("Bitte mindestens zwei Ausgänge für Multiroom auswählen.", "info");
      return;
    }
    await request("/api/media/multiroom", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"X-CSRF-Token": csrfToken}
    });
    if (clear) mediaMultiroomSelection.clear();
    await refreshMediaDevices();
    showN2KToast(clear ? "Multiroom-Gruppe gelöst." : "Multiroom-Gruppe aktiviert.", "success");
  } catch (error) {
    console.error(error);
    showN2KToast(clear ? "Multiroom-Gruppe konnte nicht gelöst werden." : "Multiroom-Gruppe konnte nicht gestartet werden.", "error");
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

async function friendlyAudioKind(kind) {
  return ({
    hdmi:"HDMI",
    usb:"USB DAC",
    bluetooth:"Bluetooth",
    airplay:"AirPlay",
    dlna:"DLNA / UPnP",
    local:"Interne Audioausgabe",
    audio:"Audioausgang"
  })[kind] || "Audioausgang";
}

async function refreshMediaDevices() {
  const list = document.getElementById("media-device-list");
  if (!list) return;
  list.innerHTML = '<div class="media-loading"><i></i><i></i><i></i></div>';
  const audio = ensureMediaAudio();
  const rows = [];
  const addRow = (icon,name,detail,status,action,extraClass = "",technical = "") => {
    const row = document.createElement("div");
    row.className = `media-device-row ${extraClass}`.trim();
    row.innerHTML = '<span></span><div><strong></strong><small></small></div><em></em>';
    row.querySelector("span").textContent = icon;
    row.querySelector("strong").textContent = name;
    const detailNode = row.querySelector("small");
    detailNode.textContent = detail;
    if (technical) {
      detailNode.title = technical;
      row.title = technical;
    }
    row.querySelector("em").textContent = status;
    if (action) {
      row.classList.add("clickable");
      row.addEventListener("click", action);
    }
    rows.push(row);
  };
  const setProtocol = (name, state, title = "") => {
    const badge = document.querySelector(`[data-media-protocol="${name}"]`);
    if (!badge) return;
    badge.classList.toggle("available", Boolean(state));
    badge.classList.toggle("planned", state === null);
    if (title) badge.title = title;
  };

  addRow("◉","Browser-Audio","Standardausgang dieses Browsers","bereit");

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
        device.name || friendlyAudioKind(device.kind),
        friendlyAudioKind(device.kind),
        device.available === false ? "offline" : "erkannt",
        null,
        "",
        `${device.backend || "Host"} · ${device.detail || ""}`
      );
    });

    const sinks = Array.isArray(pipewire.sinks) ? pipewire.sinks : [];
    sinks.forEach(sink => {
      const kind = sink.kind || "audio";
      addRow(
        sink.default ? "●" : "○",
        sink.name || friendlyAudioKind(kind),
        `${friendlyAudioKind(kind)} · Systemausgang`,
        sink.default ? "aktiv" : "wählen",
        sink.default ? null : async () => {
          await setHostAudioOutput(sink.id);
          showN2KToast("Audioausgang wurde gewechselt.", "success");
        },
        sink.default ? "active-route" : "",
        `PipeWire Node ${sink.id}`
      );
    });

    const btDevices = Array.isArray(bluetooth.devices) ? bluetooth.devices : [];
    btDevices.forEach(device => {
      addRow(
        "BT",
        device.name || "Bluetooth-Gerät",
        device.connected ? "Bluetooth · verbunden" : (device.paired ? "Bluetooth · gekoppelt" : "Bluetooth · bekannt"),
        device.connected ? "trennen" : "verbinden",
        () => setBluetoothConnection(device.mac, !device.connected),
        device.connected ? "active-route" : "",
        device.mac
      );
    });

    const hasHdmi = hostDevices.some(device => device.kind === "hdmi") || sinks.some(sink => /hdmi/i.test(sink.name || ""));
    const hasUsb = hostDevices.some(device => device.kind === "usb") || sinks.some(sink => /(usb|dac|fiio|scarlett|focusrite)/i.test(sink.name || ""));
    setProtocol("hdmi", hasHdmi, hasHdmi ? "HDMI-Audio erkannt" : "Kein HDMI-Audio erkannt");
    setProtocol("usb", hasUsb, hasUsb ? "USB-Audio erkannt" : "Kein USB-DAC erkannt");
    setProtocol("bluetooth", Boolean(bluetooth.available || host.bluetooth?.available), bluetooth.available ? "Bluetooth verfügbar" : "Bluetooth nicht verfügbar");
    setProtocol("airplay", routing.airplay?.available ? true : null, routing.airplay?.note || "AirPlay vorbereitet");
    setProtocol("dlna", routing.dlna?.available ? true : null, routing.dlna?.note || "DLNA vorbereitet");

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
        ? `AirPlay-Suche aktiv · ${count} Gerät${count === 1 ? "" : "e"}`
        : "AirPlay-Suche ist aus";
    }

    if (!routing.available) {
      addRow("•","System-Audio","Audio-Routing ist momentan nicht verfügbar","prüfen",null,"",routing.error || "Host-Agent");
    } else if (pipewire.error) {
      addRow("•","System-Audio","PipeWire-Audiositzung benötigt Aufmerksamkeit","prüfen",null,"",pipewire.error);
    }
  } catch (error) {
    console.warn("Host audio inventory unavailable", error);
    addRow("•","Server-Audio","Geräte konnten momentan nicht gelesen werden","offline");
    setProtocol("airplay", null, "AirPlay vorbereitet");
    setProtocol("dlna", null, "DLNA vorbereitet");
  }

  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(device => device.kind === "audiooutput");
      const savedSink = localStorage.getItem("n2k-media-browser-sink") || "";
      outputs.forEach((device,index) => {
        const label = device.label || `Browser-Ausgang ${index + 1}`;
        const canRoute = typeof audio.setSinkId === "function";
        addRow("◌",label,"Direkter Browser-Ausgang",canRoute ? "wählen" : "System",
          canRoute ? async () => {
            try {
              await audio.setSinkId(device.deviceId);
              localStorage.setItem("n2k-media-browser-sink", device.deviceId);
              showN2KToast(`${label} ist jetzt Browser-Ausgang.`, "success");
              await refreshMediaDevices();
            } catch (error) {
              console.error(error);
              showN2KToast("Browser-Ausgang konnte nicht gewechselt werden.", "error");
            }
          } : null
        );
        if (savedSink && canRoute && device.deviceId === savedSink && audio.sinkId !== savedSink) {
          audio.setSinkId(savedSink).catch(() => localStorage.removeItem("n2k-media-browser-sink"));
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  list.innerHTML = "";
  rows.forEach(row => list.appendChild(row));
  if (!rows.length) list.innerHTML = '<div class="media-empty">Keine Audioausgänge erkannt.</div>';
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
    mediaAnalyser = mediaAudioContext.createAnalyser();
    mediaAnalyser.fftSize = 2048;
    mediaAnalyser.smoothingTimeConstant = 0.72;
    mediaAnalyser.minDecibels = -100;
    mediaAnalyser.maxDecibels = -20;
    mediaSpectrumData = new Uint8Array(mediaAnalyser.frequencyBinCount);
    mediaTimeData = new Float32Array(mediaAnalyser.fftSize);

    let previous = mediaSourceNode;
    for (const filter of mediaEqFilters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(mediaAnalyser);
    mediaAnalyser.connect(mediaAudioContext.destination);
    startMediaSpectrum();
  } catch (error) {
    console.warn("N2K DSP unavailable", error);
    mediaAudioContext = null;
    mediaEqFilters = [];
    mediaSourceNode = null;
    mediaAnalyser = null;
  }
}

function spectrumDbFromByte(value) {
  if (!mediaAnalyser) return -100;
  const span = mediaAnalyser.maxDecibels - mediaAnalyser.minDecibels;
  return mediaAnalyser.minDecibels + (Number(value) / 255) * span;
}

function updateEqBandMeters() {
  if (!mediaAnalyser || !mediaSpectrumData || !mediaAudioContext) return;
  const centers = [32,64,125,250,500,1000,2000,4000,8000,16000];
  const nyquist = mediaAudioContext.sampleRate / 2;
  centers.forEach((frequency,index) => {
    const bin = Math.max(0, Math.min(mediaSpectrumData.length - 1, Math.round((frequency / nyquist) * mediaSpectrumData.length)));
    const level = spectrumDbFromByte(mediaSpectrumData[bin]);
    const node = document.querySelector(`[data-eq-level="${index}"]`);
    if (node) node.textContent = Number.isFinite(level) ? `${Math.round(level)} dB` : "– dB";
  });
}

function drawMediaSpectrum() {
  const canvas = document.getElementById("media-spectrum");
  if (!canvas || !mediaAnalyser || !mediaSpectrumData || !mediaTimeData) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  mediaAnalyser.getByteFrequencyData(mediaSpectrumData);
  mediaAnalyser.getFloatTimeDomainData(mediaTimeData);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(5,10,18,.62)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const bars = 56;
  const minFreq = 28;
  const maxFreq = Math.min(18000, mediaAudioContext.sampleRate / 2);
  const nyquist = mediaAudioContext.sampleRate / 2;
  let maxValue = 0;
  for (let i = 0; i < bars; i += 1) {
    const t0 = i / bars;
    const t1 = (i + 1) / bars;
    const f0 = minFreq * Math.pow(maxFreq / minFreq, t0);
    const f1 = minFreq * Math.pow(maxFreq / minFreq, t1);
    const b0 = Math.max(0, Math.floor((f0 / nyquist) * mediaSpectrumData.length));
    const b1 = Math.max(b0 + 1, Math.min(mediaSpectrumData.length, Math.ceil((f1 / nyquist) * mediaSpectrumData.length)));
    let value = 0;
    for (let b = b0; b < b1; b += 1) value = Math.max(value, mediaSpectrumData[b]);
    maxValue = Math.max(maxValue, value);
    const normalized = value / 255;
    const barHeight = Math.max(1, normalized * (height - 18));
    const x = (i / bars) * width;
    const barWidth = Math.max(2, width / bars - 3);
    const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
    gradient.addColorStop(0, "rgba(218,88,255,.92)");
    gradient.addColorStop(1, "rgba(85,186,255,.82)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);
  }

  let sum = 0;
  let peak = 0;
  for (const sample of mediaTimeData) {
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / Math.max(1, mediaTimeData.length));
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
  const peakNode = document.getElementById("media-spectrum-peak");
  const rmsNode = document.getElementById("media-spectrum-rms");
  const stateNode = document.getElementById("media-spectrum-state");
  if (peakNode) peakNode.textContent = `${Math.max(-100, peakDb).toFixed(1)} dBFS`;
  if (rmsNode) rmsNode.textContent = `${Math.max(-100, rmsDb).toFixed(1)} dBFS`;
  if (stateNode) {
    if (!ensureMediaAudio().src) stateNode.textContent = "Kein Stream";
    else if (ensureMediaAudio().paused) stateNode.textContent = "Pausiert";
    else if (maxValue <= 1) stateNode.textContent =
      mediaCurrentStation()?.source === "local" ? "Kein messbares Signal" : "Stream blockiert Analyse / CORS";
    else stateNode.textContent = "Live Audiodaten";
  }
  updateEqBandMeters();
}

function startMediaSpectrum() {
  if (mediaSpectrumFrame) return;
  const tick = () => {
    mediaSpectrumFrame = requestAnimationFrame(tick);
    drawMediaSpectrum();
  };
  mediaSpectrumFrame = requestAnimationFrame(tick);
}

function applyMediaEq() {
  ensureMediaEqGraph();
  if (mediaAudioContext?.state === "suspended") mediaAudioContext.resume().catch(() => {});
  const inputs = Array.from(document.querySelectorAll("#media-equalizer input[data-eq]"));
  inputs.forEach((input,index) => {
    const gain = Number(input.value) || 0;
    if (mediaEqFilters[index]) mediaEqFilters[index].gain.value = gain;
    const label = document.querySelector(`[data-eq-gain="${index}"]`);
    if (label) label.textContent = `EQ ${gain > 0 ? "+" : ""}${gain} dB`;
  });
  const mode = document.getElementById("media-eq-mode");
  if (mode) mode.textContent = mediaEqFilters.length ? "DSP aktiv · Signal ≠ EQ-Verstärkung" : "DSP nicht verfügbar";
  saveMediaSession();
}

async function playMediaPlayback() {
  const audio = ensureMediaAudio();
  ensureMediaEqGraph();
  if (mediaAudioContext?.state === "suspended") {
    try { await mediaAudioContext.resume(); } catch (_) {}
  }
  if (!audio.src) {
    const first = filteredMediaStations()[0];
    if (first) {
      await playMediaStation(first.index);
      return;
    }
    const favorite = getMediaFavoriteStations()[0];
    if (favorite) {
      playFavoriteStation(favorite);
      return;
    }
  }
  try { await audio.play(); } catch (error) { console.error(error); }
  updateMediaPlaybackUi();
}

function pauseMediaPlayback() {
  const audio = ensureMediaAudio();
  if (audio.src) audio.pause();
  updateMediaPlaybackUi();
}

function n2kRememberPlayableMedia(item) {
 if(!item || !item.url)return;
 const snapshot={...item,source:item.source||"radio"};
 try{localStorage.setItem("n2k-last-playable-v1",JSON.stringify(snapshot));}catch(_){}
}
function n2kReadLastPlayableMedia() {
 try{return JSON.parse(localStorage.getItem("n2k-last-playable-v1")||"null");}catch(_){return null}
}
async function n2kPlayOverviewSelection() {
 const audio=ensureMediaAudio();
 if(audio.src && mediaCurrentStation())return toggleMediaPlayback();
 const recent=n2kReadLastPlayableMedia();
 if(recent?.url){
  if(recent.source==="local"){
   const index=mediaLocalTracks.findIndex(t=>String(t.id)===String(recent.id)||t.url===recent.url);
   if(index>=0)return playLocalTrack(index);
   showN2KToast("Die zuletzt gespielte lokale Datei ist nicht mehr verfügbar.","error");
   return;
  }
  let index=mediaStations.findIndex(t=>String(t.id)===String(recent.id)||t.url===recent.url);
  if(index<0){mediaStations.push(recent);index=mediaStations.length-1;}
  return playMediaStation(index);
 }
 return playMediaPlayback();
}
function stopMediaPlayback() {
  n2kRememberPlayableMedia(mediaCurrentStation());
  stopRadioMetadataPolling(true);
  const audio = ensureMediaAudio();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  mediaStationIndex = -1;
  mediaLocalIndex = -1;
  const title = document.getElementById("media-title");
  const subtitle = document.getElementById("media-subtitle");
  if (title) title.textContent = "Noch nichts ausgewählt";
  if (subtitle) subtitle.textContent = "Wähle Radio, eigene Musik oder einen Streaming-Dienst.";
  n2kBridgeMediaToOverview(null);
  clearSpectrumUi();
  updateMediaPlaybackUi();
  updateMediaFavoriteButton();
  saveMediaSession();
}

function toggleMediaMute() {
  const audio = ensureMediaAudio();
  audio.muted = !audio.muted;
  updateMediaPlaybackUi();
  saveMediaSession();
}

async function toggleMediaPlayback() {
  const audio = ensureMediaAudio();
  if (audio.src && !audio.paused) pauseMediaPlayback();
  else await playMediaPlayback();
}

function initMediaCenter() {
  if (mediaInitialized) return;
  mediaInitialized = true;
  ensureMediaAudio();
  setupMediaSessionControls();
  restoreMediaPreferences();
  renderMediaStations();
  renderMediaFavorites();
  loadMediaRadioDirectory();
  loadMediaLibrary();
  refreshMediaDevices();
  updateMediaPlaybackUi();

  document.querySelectorAll(".media-section-tabs button").forEach(button => button.addEventListener("click", () => {
    applyMediaSection(button.dataset.mediaSection || "all");
  }));
  document.querySelectorAll("#media-country-tabs button").forEach(button => button.addEventListener("click", () => {
    mediaCountry = button.dataset.country || "DE";
    document.querySelectorAll("#media-country-tabs button").forEach(item => item.classList.toggle("active", item === button));
    loadMediaRadioDirectory();
  }));
  document.getElementById("media-radio-search")?.addEventListener("input", () => {
    clearTimeout(mediaRadioSearchTimer);
    mediaRadioSearchTimer = setTimeout(loadMediaRadioDirectory, 260);
  });
  document.getElementById("media-play")?.addEventListener("click", toggleMediaPlayback);
  document.getElementById("overview-media-play")?.addEventListener("click", n2kPlayOverviewSelection);
  document.getElementById("overview-media-prev")?.addEventListener("click", () => stepMediaStation(-1));
  document.getElementById("overview-media-next")?.addEventListener("click", () => stepMediaStation(1));
  document.getElementById("top-media-prev")?.addEventListener("click", () => stepMediaStation(-1));
  document.getElementById("top-media-play")?.addEventListener("click", playMediaPlayback);
  document.getElementById("top-media-pause")?.addEventListener("click", pauseMediaPlayback);
  document.getElementById("top-media-stop")?.addEventListener("click", stopMediaPlayback);
  document.getElementById("top-media-next")?.addEventListener("click", () => stepMediaStation(1));
  document.getElementById("top-media-mute")?.addEventListener("click", toggleMediaMute);
  document.getElementById("media-prev")?.addEventListener("click", () => stepMediaStation(-1));
  document.getElementById("media-next")?.addEventListener("click", () => stepMediaStation(1));
  document.getElementById("media-favorite")?.addEventListener("click", () => {
    const station = mediaCurrentStation();
    if (station) {
      toggleMediaFavorite(station);
      renderMediaStations();
    }
  });
  document.getElementById("top-media-volume")?.addEventListener("input", event => {
    const value = Number(event.target.value) || 0;
    const audio = ensureMediaAudio();
    audio.volume = value / 100;
    if (value > 0 && audio.muted) audio.muted = false;
    const main = document.getElementById("media-volume");
    const copy = document.getElementById("media-volume-value");
    if (main) main.value = String(value);
    if (copy) copy.textContent = `${value}%`;
    updateMediaPlaybackUi();
    saveMediaSession();
  });
  document.getElementById("media-volume")?.addEventListener("input", event => {
    const value = Number(event.target.value) || 0;
    const audio = ensureMediaAudio();
    audio.volume = value / 100;
    if (value > 0 && audio.muted) audio.muted = false;
    const copy = document.getElementById("media-volume-value");
    if (copy) copy.textContent = `${value}%`;
    updateMediaPlaybackUi();
    saveMediaSession();
  });
  document.getElementById("media-refresh-devices")?.addEventListener("click", refreshMediaDevices);
  document.getElementById("media-library-refresh")?.addEventListener("click", loadMediaLibrary);
  document.getElementById("media-library-search")?.addEventListener("input", renderMediaLibrary);
  document.getElementById("media-queue-clear")?.addEventListener("click", clearMediaQueue);
  document.getElementById("media-shuffle")?.addEventListener("click", () => {
    mediaShuffle = !mediaShuffle;
    updateMediaPlayModes();
    saveMediaSession();
  });
  document.getElementById("media-repeat")?.addEventListener("click", () => {
    mediaRepeat = mediaRepeat === "off" ? "all" : mediaRepeat === "all" ? "one" : "off";
    updateMediaPlayModes();
    saveMediaSession();
  });
  document.getElementById("media-more-services")?.addEventListener("click", () => toggleMediaServiceDirectory(true));
  document.getElementById("media-service-directory-close")?.addEventListener("click", () => toggleMediaServiceDirectory(false));
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


async function updateTopWeather(enabled=true){
 const badge=document.getElementById("n2k-top-weather");
 if(!badge)return;
 if(!enabled){badge.hidden=true;badge.textContent="";return;}
 try{
  const response=await request("/api/preferences/weather",{headers:{}});
  if(!response.configured){badge.hidden=true;badge.textContent="";return;}
  badge.hidden=false;
  if(response.error){badge.textContent="Wetter nicht verfügbar";badge.title="Standort oder Onlineverbindung prüfen";return;}
  const code=Number(response.weather_code);
  const icon=code===0?"☀":code<=3?"⛅":code>=51&&code<=67?"🌧":code>=71&&code<=86?"❄":"☁";
  const temp=response.temperature_c!==null&&Number.isFinite(Number(response.temperature_c))?Math.round(Number(response.temperature_c))+"°C":"–";
  badge.textContent=icon+" "+temp;
  badge.title="Aktuelles Wetter in "+response.location+" · Quelle: Open-Meteo";
 }catch(e){badge.hidden=false;badge.textContent="Wetter nicht verfügbar";}
}

let n2kSelectedWeatherPlace=null;
let n2kLocationTimer=null;
let n2kLocationSeq=0;
async function saveWeatherLocation(location){
 const feedback=document.getElementById("n2k-location-feedback");
 const selection=n2kSelectedWeatherPlace;
 if(location&&!selection){if(feedback)feedback.textContent="Bitte zuerst einen passenden Ort aus der Vorschlagsliste auswählen.";return;}
 try{
  const coordinateValue=location&&selection?selection.latitude+","+selection.longitude:"";
  await request("/api/preferences",{method:"POST",body:JSON.stringify({key:"weather_coordinates",value:coordinateValue}),headers:{"X-CSRF-Token":csrfToken}});
  await request("/api/preferences",{method:"POST",body:JSON.stringify({key:"weather_location",value:location}),headers:{"X-CSRF-Token":csrfToken}});
  if(feedback)feedback.textContent=location?"Standort gespeichert · aktuelle Wetterdaten werden geladen.":"Standort entfernt. Wetteranzeige ausgeschaltet.";
  await updateTopWeather(Boolean(location));
 }catch(e){if(feedback)feedback.textContent="Standort konnte nicht gespeichert werden.";}
}
function initWeatherSettings(){
 const gallery=document.getElementById("wallpaper-gallery");
 for(const [id,delta] of [["wallpaper-prev",-1],["wallpaper-next",1]]){
  document.getElementById(id)?.addEventListener("click",()=>gallery?.scrollBy({left:delta*(gallery.clientWidth*.78),behavior:"smooth"}));
 }
 const input=document.getElementById("n2k-location-input");
 const suggestions=document.getElementById("n2k-location-suggestions");
 const feedback=document.getElementById("n2k-location-feedback");
 if(!input)return;
 input.addEventListener("input",()=>{
  n2kSelectedWeatherPlace=null;
  if(feedback)feedback.textContent="Bitte einen Ort aus der Liste auswählen.";
  const q=input.value.trim();clearTimeout(n2kLocationTimer);n2kLocationSeq++;
  const seq=n2kLocationSeq;
  suggestions.replaceChildren();suggestions.hidden=true;
  if(q.length<2)return;
  n2kLocationTimer=setTimeout(async()=>{
   try{
    const data=await request("/api/preferences/locations?q="+encodeURIComponent(q),{headers:{}});
    if(seq!==n2kLocationSeq)return;
    suggestions.replaceChildren();
    for(const place of data.results||[]){
     const option=document.createElement("button");
     option.type="button";option.className="n2k-location-option";option.textContent=place.label;option.setAttribute("role","option");
     option.addEventListener("click",()=>{
      n2kLocationSeq++;n2kSelectedWeatherPlace=place;input.value=place.label;
      suggestions.hidden=true;suggestions.replaceChildren();
      if(feedback)feedback.textContent="Ort ausgewählt. Jetzt Speichern drücken.";
     });
     suggestions.appendChild(option);
    }
    suggestions.hidden=!suggestions.children.length;
    if(!suggestions.children.length&&feedback)feedback.textContent="Kein Ort gefunden. Versuche nur den Ortsnamen, z. B. Aken.";
   }catch(e){if(feedback)feedback.textContent="Ortssuche momentan nicht erreichbar.";}
  },350);
 });
 document.getElementById("n2k-location-save")?.addEventListener("click",()=>saveWeatherLocation(input.value.trim()));
 document.getElementById("n2k-location-clear")?.addEventListener("click",()=>{
  n2kSelectedWeatherPlace=null;n2kLocationSeq++;clearTimeout(n2kLocationTimer);
  input.value="";suggestions.hidden=true;saveWeatherLocation("");
 });
 input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveWeatherLocation(input.value.trim());}});
 setInterval(()=>{const badge=document.getElementById("n2k-top-weather");if(badge&&!badge.hidden)updateTopWeather(true);},15*60*1000);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initWeatherSettings);else initWeatherSettings();

function n2kConnectPlayerCover(){
  n2kOverviewLastArtwork(null);
  const art=document.getElementById("top-media-art");
  const title=document.getElementById("top-media-title");
  const sync=()=>{
    const item=mediaCurrentStation();
    n2kBridgeMediaToOverview(item);
    if(item)return;
    const last=document.getElementById("overview-media-title");
    if(last&&["Bereit","Noch kein Titel"].includes(last.textContent.trim())){
      const saved=(()=>{try{return JSON.parse(localStorage.getItem("n2k-media-last-artwork-v3")||"null");}catch(_){return null;}})();
      if(saved?.title)last.textContent=saved.title;
    }
  };
  if(art)new MutationObserver(sync).observe(art,{attributes:true,attributeFilter:["style","class"]});
  if(title)new MutationObserver(sync).observe(title,{childList:true,characterData:true,subtree:true});
  sync();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",n2kConnectPlayerCover);
else n2kConnectPlayerCover();

/* Read-only status-strip resource widgets. */
(function(){
 async function refresh(){
  const cpu=document.getElementById("n2k-top-cpu"),ram=document.getElementById("n2k-top-ram");
  if(!cpu||!ram||document.getElementById("app-shell")?.classList.contains("hidden"))return;
  try{
   const res=await fetch("/api/overview",{credentials:"same-origin",cache:"no-store"});
   if(!res.ok)return;
   const d=await res.json();
   const cp=Number(d.cpu_percent),rp=Number(d.memory?.used_percent);
   cpu.textContent="CPU "+(Number.isFinite(cp)?Math.round(cp)+"%":"–");
   ram.textContent="RAM "+(Number.isFinite(rp)?Math.round(rp)+"%":"–");
  }catch(_){}
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh);else refresh();
 setInterval(refresh,30000);
})();



// Chart samples come from observed changes in cumulative Docker network counters.
const n2kServiceSamples = {};
function n2kNetworkBytes(text) {
  if (typeof text !== "string") return null;
  const match = text.trim().match(/^([\d.,]+)\s*([kKmMgGtT]?i?[bB])$/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();
  const exponent = {"b":0,"kb":1,"mb":2,"gb":3,"tb":4,"kib":1,"mib":2,"gib":3,"tib":4}[unit];
  return Number.isFinite(value) && exponent !== undefined ? value * Math.pow(unit.includes("i") ? 1024 : 1000, exponent) : null;
}
function n2kUpdateTrafficChart(prefix, text, running) {
  const canvas = document.getElementById(prefix + "-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const halves = String(text || "").split("/");
  const total = halves.length === 2 ? halves.map(v => n2kNetworkBytes(v)) : [];
  const sample = total.length === 2 && total.every(Number.isFinite) ? total[0] + total[1] : null;
  const record = n2kServiceSamples[prefix] || {last:null,values:[]};
  if (!running || sample === null) {
    record.last = null;
    if (!running) record.values = [];
  } else {
    const delta = record.last === null || sample < record.last ? 0 : sample - record.last;
    record.values.push(delta);
    record.values = record.values.slice(-24);
    record.last = sample;
  }
  n2kServiceSamples[prefix] = record;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (record.values.length < 2) return;
  const max = Math.max(...record.values, 1);
  ctx.beginPath();
  record.values.forEach((value,index) => {
    const x = index * (canvas.width - 6) / (record.values.length - 1) + 3;
    const y = canvas.height - 4 - (value / max) * (canvas.height - 10);
    if (index === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = "#c6b27c";
  ctx.lineWidth = 2;
  ctx.stroke();
}
// ShadowNode and MeshLink controls use the same authenticated OS APIs as their detail views.
// Container stats are cumulative RX/TX, not a fabricated current speed.
async function refreshN2KNetworkServices() {
  const specs = [
    {prefix:"n2k-mesh", path:"/api/meshlink/service", type:"mesh"}
  ];
  await Promise.all(specs.map(async spec => {
    const state = document.getElementById(spec.prefix + "-state");
    const nodes = document.getElementById(spec.prefix + "-nodes");
    const traffic = document.getElementById(spec.prefix + "-traffic");
    const on = document.getElementById(spec.prefix + "-on");
    const off = document.getElementById(spec.prefix + "-off");
    const meter = document.getElementById(spec.prefix + "-meter");
    if (!state) return;
    try {
      const data = await request(spec.path);
      if (!data.available) throw Error(data.error || "Host-Agent offline");
      state.textContent = data.running ? "● Aktiv" : data.installed ? "○ Ausgeschaltet" : "○ Nicht installiert";
      if (traffic) traffic.textContent = "RX / TX: " + (data.traffic || "–");
      n2kUpdateTrafficChart(spec.prefix, data.traffic, data.running);
      const hubPrefix = spec.type === "shadow" ? "n2k-hub-shadow" : "n2k-hub-mesh";
      const hubTraffic = document.getElementById(hubPrefix + "-traffic");
      const hubState = document.getElementById(hubPrefix + (spec.type === "shadow" ? "-status" : "-state"));
      if (hubTraffic) hubTraffic.textContent = data.traffic || "–";
      if (hubState) hubState.textContent = data.running ? "● Container läuft · LXMF wird geprüft" : data.installed ? "○ Container ausgeschaltet" : "○ Container nicht installiert";
      let meshKnownNodes = data.nodes;
      if (spec.type === "mesh") {
        // Host agent reports container state, but does not know Reticulum routes.
        // Fetch the actual observed LXMF announces via the authenticated messenger API.
        try {
          const peers = await request("/api/messenger/peers");
          if (hubState) hubState.textContent = !data.running ? "○ Container ausgeschaltet" :
            peers.online === true ? "● Container läuft · LXMF aktiv" :
            "◷ Container läuft · LXMF nicht bereit";
          if (peers.online !== true) {
            const routes = document.getElementById("n2k-rns-routes");
            const discovery = document.getElementById("n2k-rns-discovery");
            if (routes) routes.textContent = "Nicht verfügbar";
            if (discovery) discovery.textContent = "LXMF offline";
          }
          if (peers.online && Number.isFinite(Number(peers.known_count))) {
            meshKnownNodes = Math.max(0, Number(peers.known_count));
            const routes = document.getElementById("n2k-rns-routes");
            const discovery = document.getElementById("n2k-rns-discovery");
            if (routes) routes.textContent = peers.reachable_route_count != null && Number.isFinite(Number(peers.reachable_route_count)) ? String(peers.reachable_route_count) : "Nicht gemessen";
            if (discovery) discovery.textContent = peers.online ? "Gespeichert · " + meshKnownNodes : "Nicht verfügbar";
            const windowValue=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=Number.isFinite(Number(value))&&value!=null?String(value):"–";};
            windowValue("n2k-rns-15m",peers.recent_15m);
            windowValue("n2k-rns-1h",peers.recent_1h);
            windowValue("n2k-rns-24h",peers.recent_24h);
          }
        } catch (error) {
          console.debug("MeshLink peer count unavailable:", error);
          if (hubState && data.running) hubState.textContent = "◷ Container läuft · LXMF-Status unbekannt";
          const routes = document.getElementById("n2k-rns-routes");
          const discovery = document.getElementById("n2k-rns-discovery");
          if (routes) routes.textContent = "Nicht verfügbar";
          if (discovery) discovery.textContent = "Status nicht abrufbar";
        }
      }
      if (spec.type === "mesh") {
        const hubNodes = document.getElementById("n2k-hub-mesh-nodes");
        if (hubNodes) hubNodes.textContent = meshKnownNodes == null ? "Nicht verfügbar" : String(meshKnownNodes);
      }
      const hubOn = document.getElementById(hubPrefix + "-on");
      const hubOff = document.getElementById(hubPrefix + "-off");
      if (hubOn) hubOn.disabled = data.running || (spec.type === "mesh" && !data.installed);
      if (hubOff) hubOff.disabled = !data.running;
      if (spec.type === "shadow") {
        const assign = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
        let uptime = "–";
        if (data.running && data.started_at) {
          const timestamp = Date.parse(data.started_at);
          if (Number.isFinite(timestamp)) {
            const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
            uptime = Math.floor(seconds / 86400) + " T " + Math.floor((seconds % 86400) / 3600) + " h";
          }
        }
        assign("n2k-shadow-hub-uptime", uptime);
        assign("n2k-shadow-hub-port", "TCP " + (data.port || 9001) + " · Erreichbarkeit ungeprüft");
        assign("n2k-shadow-hub-mode", data.mode === "non-exit" ? "Non-Exit" : "Nicht bestätigt");
        assign("n2k-shadow-hub-peers", "Nicht verfügbar");
        assign("n2k-shadow-hub-container", data.state || "Unbekannt");
        const reach = data.reachability;
        const reachLabel = reach === "reachable" ? "● Öffentlich erreichbar" :
          reach === "unreachable" ? "● Nicht erreichbar" :
          reach === "checking" ? "◷ Tor prüft Erreichbarkeit" : "○ Relay ausgeschaltet";
        assign("n2k-shadow-hub-reachability", reachLabel);
        assign("n2k-shadow-hub-reachability-detail", data.reachability_detail || "Tor-Selbsttest nicht verfügbar.");

        const current = n2kServiceSamples[hubPrefix];
        const rate = document.getElementById("n2k-shadow-hub-rate");
        if (rate) {
          const v = current?.values || [];
          // Delta between Docker snapshots, sampled roughly every 30 seconds.
          const bytesPerSecond = v.length > 1 ? v[v.length - 1] / 30 : null;
          rate.textContent = bytesPerSecond === null ? "Live-Rate: –" : "Traffic ≈ " + (bytesPerSecond / 1024).toFixed(1) + " KiB/s";
        }
      }
      n2kUpdateTrafficChart(hubPrefix, data.traffic, data.running);
      if (nodes) nodes.textContent = spec.type === "shadow" ? "Non-Exit · Port " + (data.port || 9001) : "LXMF-Knoten: " + (meshKnownNodes == null ? "nicht verfügbar" : meshKnownNodes);
      if (meter) meter.style.width = data.running ? "100%" : "0%";
      if (on) on.disabled = data.running || (spec.type === "mesh" && !data.installed);
      if (off) off.disabled = !data.running;
    } catch (_) {
      // Host-agent metrics can fail while the Reticulum/LXMF runtime is healthy.
      // Never overwrite verified LXMF discovery with a host-monitoring error.
      const discovery = document.getElementById("n2k-rns-discovery");
      const routes = document.getElementById("n2k-rns-routes");
      const hubNodes = document.getElementById("n2k-hub-mesh-nodes");
      let messengerOnline = false;
      try {
        const [runtime, peers] = await Promise.all([
          request("/api/reticulum/clean-status"),
          request("/api/messenger/peers")
        ]);
        messengerOnline = runtime.connected === true || peers.online === true;
        if (messengerOnline) {
          const count = Number(peers.known_count);
          if (Number.isFinite(count) && count >= 0) {
            if (nodes) nodes.textContent = "LXMF-Knoten: " + count;
            if (hubNodes) hubNodes.textContent = String(count);
          }
          if (routes) routes.textContent = peers.reachable_route_count != null ? String(peers.reachable_route_count) : "Nicht gemessen";
          if (discovery) discovery.textContent = "Aktiv · LXMF";
        }
      } catch (error) {
        console.debug("Reticulum runtime status unavailable:", error);
      }
      if (!messengerOnline) {
        if (discovery) discovery.textContent = "Nicht erreichbar";
        if (routes) routes.textContent = "–";
        if (nodes) nodes.textContent = "LXMF-Status nicht verfügbar";
        if (hubNodes) hubNodes.textContent = "Nicht verfügbar";
      }
      state.textContent = messengerOnline ? "● LXMF aktiv · Host-Monitoring offline" : "Host-Monitoring nicht verfügbar";
      const hubState = document.getElementById("n2k-hub-mesh-state");
      if (hubState) hubState.textContent = messengerOnline ? "● LXMF aktiv" : "○ Status unbekannt";
      if (on) on.disabled = true;
      if (off) off.disabled = true;
      if (meter) meter.style.width = "0%";
      if (traffic) traffic.textContent = "Traffic: nicht gemessen";
      const hubTraffic = document.getElementById("n2k-hub-mesh-traffic");
      if (hubTraffic) hubTraffic.textContent = "Nicht gemessen";
    }
  }));
}
async function setN2KNetworkService(type, enabled) {
  const path = "/api/meshlink/service";
  try {
    await request(path, {method:"POST", headers:{"X-CSRF-Token":csrfToken}, body:JSON.stringify({enabled, acknowledged:enabled})});
    showN2KToast("MeshLink" + (enabled ? " gestartet" : " ausgeschaltet"));
  } catch (err) {
    showN2KToast((type === "shadow" ? "ShadowNode" : "MeshLink") + ": " + (err.message || "Aktion fehlgeschlagen"), "error");
  } finally {
    await refreshN2KNetworkServices();
    if (type === "mesh") await refreshNativeMessenger();
  }
}
for (const [id, type, enabled] of [
  ["n2k-mesh-on", "mesh", true], ["n2k-mesh-off", "mesh", false]
]) document.getElementById(id)?.addEventListener("click", () => setN2KNetworkService(type, enabled));
for (const [id, type, enabled] of [
  ["n2k-hub-mesh-on", "mesh", true], ["n2k-hub-mesh-off", "mesh", false]
]) document.getElementById(id)?.addEventListener("click", () => setN2KNetworkService(type, enabled));
// Clicking the overview service card, except its action buttons, opens Network Hub.
for (const card of document.querySelectorAll(".n2k-network-service-widget")) {
  card.setAttribute("role", "link");
  card.setAttribute("tabindex", "0");
  card.addEventListener("click", event => {
    if (event.target.closest("button, a, input")) return;
    switchView("privacy-panel");
  });
  card.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target === card) {
      event.preventDefault();
      switchView("privacy-panel");
    }
  });
}
refreshN2KNetworkServices();
setInterval(() => { if (!document.hidden) refreshN2KNetworkServices(); }, 30000);

/* Network Hub diagnostics: real Tor self-test and observed LXMF announces. */
(() => {
  const check = document.getElementById("n2k-tor-check");
  const checkText = document.getElementById("n2k-tor-check-result");
  async function checkTor() {
    if (!check || !checkText) return;
    check.disabled = true;
    checkText.textContent = "Tor-Selbsttest wird ausgewertet …";
    try {
      const d = await request("/api/tor/relay");
      const state = d.reachability || "checking";
      const binding=d.port_binding ? " · Docker-Port: "+d.port_binding : " · Kein veröffentlichter Docker-Port bestätigt";
      const bootstrap=Number.isInteger(d.bootstrap_percent)?" · Tor-Bootstrap "+d.bootstrap_percent+"%":"";
      checkText.textContent = state === "reachable" ? "Tor bestätigt: ORPort öffentlich erreichbar."+bootstrap+binding :
        state === "unreachable" ? "Tor meldet: ORPort nicht erreichbar. Firewall / Portfreigabe prüfen."+bootstrap+binding :
        state === "stopped" ? "ShadowNode ist ausgeschaltet." :
        "Noch keine externe Bestätigung von Tor. " + (d.reachability_detail || "")+bootstrap+binding;
    } catch(e) {
      checkText.textContent = "Tor-Prüfung derzeit nicht verfügbar.";
    } finally { check.disabled = false; }
  }
  check?.addEventListener("click",checkTor);

  const refresh = document.getElementById("n2k-peers-refresh");
  const count = document.getElementById("n2k-peers-count");
  const list = document.getElementById("n2k-peers-list");
  const search = document.getElementById("n2k-peer-filter");
  const routeFilter = document.getElementById("n2k-peer-route-filter");
  const visibleCount = document.getElementById("n2k-peer-visible-count");
  const meshCanvas = document.getElementById("n2k-living-mesh-canvas");
  const meshCount = document.getElementById("n2k-mesh-visual-count");
  let meshTargets = [];
  let selectedMesh = "";
  const cinemaToggle=document.getElementById("n2k-cinema-toggle");
  const cinemaReset=document.getElementById("n2k-cinema-reset");
  const cinemaState=document.getElementById("n2k-cinema-state");
  let cinemaEnabled=true;
  const camera={x:0,y:0,zoom:1};
  const cameraTarget={x:0,y:0,zoom:1};
  let focusUntil=0;
  let tourStep=0, tourNext=0, manualUntil=0;
  const tourHistory=[];
  function updateTour(now,ranks){
    if(!cinemaEnabled||calmMotion.matches||now<manualUntil||now<tourNext)return;
    tourNext=now+10000;
    if(!ranks.length)return;
    if(tourStep%4===3){
      selectedMesh="";focusUntil=0;
      cameraTarget.x=0;cameraTarget.y=0;cameraTarget.zoom=1.02;
      if(cinemaState)cinemaState.textContent="Auto Tour · Gesamtansicht";
      if(inspector)inspector.textContent="Cinema Auto Tour · Gesamtansicht · echte Announcements, schematische Positionen";
    }else{
      const current=Date.now()/1000;
      const recent=ranks.filter(p=>current-Number(p.last_seen||0)<=3600);
      const pool=(recent.length?recent:ranks).filter(p=>!tourHistory.includes(p.destination));
      const candidates=pool.length?pool:(recent.length?recent:ranks);
      const picked=candidates.slice().sort((a,b)=>{
        const score=p=>(Math.max(0,current-Number(p.last_seen||0))/3600)+(Number(p.hops||9)*.09);
        return score(a)-score(b);
      });
      const peer=picked[(tourStep*7)%Math.min(picked.length,12)];
      selectedMesh=String(peer.destination||"");focusUntil=now+9300;
      tourHistory.push(selectedMesh);if(tourHistory.length>10)tourHistory.shift();
      if(cinemaState)cinemaState.textContent="Auto Tour · "+(peer.name||"Knoten")+" · "+peer.hops+" Hops";
      if(inspector)inspector.textContent=(peer.name||"Unbenannter Knoten")+" · "+selectedMesh+" · "+peer.hops+" Hops · zuletzt angekündigt (kein Online-Nachweis)";
    }
    tourStep++;
  }
  cinemaToggle?.addEventListener("click",()=>{
    cinemaEnabled=!cinemaEnabled;
    cinemaToggle.textContent="Cinema: "+(cinemaEnabled?"Ein":"Aus");
    cinemaToggle.setAttribute("aria-pressed",String(cinemaEnabled));
    if(cinemaState)cinemaState.textContent=cinemaEnabled?"Kamerafahrt aktiv · schematische Darstellung":"Kamera angehalten";
    tourNext=performance.now()+1500;
    if(!cinemaEnabled){selectedMesh="";focusUntil=0;cameraTarget.x=0;cameraTarget.y=0;cameraTarget.zoom=1;}
    startMeshAnimation();
  });
  cinemaReset?.addEventListener("click",()=>{
    selectedMesh="";focusUntil=0;manualUntil=performance.now()+9000;tourNext=manualUntil;cameraTarget.x=0;cameraTarget.y=0;cameraTarget.zoom=1;
    if(inspector)inspector.textContent="Gesamtansicht · schematische Positionen";
    drawLivingMesh(cachedPeers);
  });
  const inspector = document.getElementById("n2k-mesh-inspector");
  function selectMeshPeer(peer) {
    selectedMesh=String(peer.destination||"");
    focusUntil=performance.now()+11000;
    manualUntil=focusUntil;
    tourNext=focusUntil+2500;
    if (inspector) inspector.textContent=(peer.name||"Unbenannter Knoten")+" · "+(Number.isInteger(peer.hops)?peer.hops+" Hops":"Hops unbekannt")+" · "+(peer.path_known?"Route bekannt":"Route unbekannt")+" · "+selectedMesh+" · Kein direkter Verbindungsnachweis";
    drawLivingMesh(cachedPeers);
  }
  meshCanvas?.addEventListener("click",event=>{
    const rect=meshCanvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const x=(event.clientX-rect.left)*meshCanvas.width/rect.width;
    const y=(event.clientY-rect.top)*meshCanvas.height/rect.height;
    const found=meshTargets.filter(t=>Math.hypot(t.x-x,t.y-y)<19).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    if(found)selectMeshPeer(found.peer);
  });
  meshCanvas?.addEventListener("keydown",event=>{
    if(event.key!=="ArrowRight"&&event.key!=="ArrowLeft"&&event.key!=="Enter")return;
    if(!meshTargets.length)return;
    event.preventDefault();
    const index=meshTargets.findIndex(t=>t.peer.destination===selectedMesh);
    const next=event.key==="ArrowLeft"?(index<0?meshTargets.length-1:(index+meshTargets.length-1)%meshTargets.length):(index+1)%meshTargets.length;
    selectMeshPeer(meshTargets[next].peer);
  });
  const calmMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  let meshFrame=0, latestMeshPeers=[];
  const meshVisible=()=>!document.hidden && meshCanvas?.getClientRects().length>0;
  function meshAnimationTick(now){
    meshFrame=0;
    if(!meshVisible()||calmMotion.matches)return;
    if(!meshAnimationTick.last || now-meshAnimationTick.last>45){drawLivingMesh(latestMeshPeers,now);meshAnimationTick.last=now;}
    meshFrame=window.requestAnimationFrame(meshAnimationTick);
  }
  function startMeshAnimation(){
    if(meshFrame||!meshVisible()||calmMotion.matches)return;
    meshFrame=window.requestAnimationFrame(meshAnimationTick);
  }
  document.addEventListener("visibilitychange",startMeshAnimation);
  document.addEventListener("n2k-rns-mesh-visible",startMeshAnimation);
  function drawLivingMesh(peers,now=0) {
    latestMeshPeers=peers;
    if (!meshCanvas) return;
    const ctx=meshCanvas.getContext("2d");
    if (!ctx) return;
    const w=meshCanvas.width, ht=meshCanvas.height;
    ctx.clearRect(0,0,w,ht);
    const center={x:w/2,y:ht/2};
    const motion=animatedTime=>animatedTime>0 && cinemaEnabled && !calmMotion.matches;
    const moving=motion(now);
    if(moving){
      const t=now/1000;
      if(now>focusUntil){
        cameraTarget.x=Math.sin(t*.115)*29;
        cameraTarget.y=Math.cos(t*.092)*12;
        cameraTarget.zoom=1.05+Math.sin(t*.14)*.08;
      }
    }else if(!cinemaEnabled||calmMotion.matches){cameraTarget.x=0;cameraTarget.y=0;cameraTarget.zoom=1;}
    const ease=moving?.055:1;
    camera.x+=(cameraTarget.x-camera.x)*ease;
    camera.y+=(cameraTarget.y-camera.y)*ease;
    camera.zoom+=(cameraTarget.zoom-camera.zoom)*ease;
    const project=(x,y)=>({x:center.x+(x-center.x)*camera.zoom+camera.x,y:center.y+(y-center.y)*camera.zoom+camera.y});
    const ranks=peers.filter(p=>p.path_known===true && Number.isInteger(p.hops)).sort((a,b)=>(b.last_seen||0)-(a.last_seen||0)).slice(0,90);
    const wallNow=Date.now()/1000;
    const animated=now>0;
    if(animated)updateTour(now,ranks);
    if(selectedMesh && now && now<focusUntil){
      const focused=ranks.findIndex(p=>p.destination===selectedMesh);
      if(focused>=0){const fp=ranks[focused];const hops=Math.max(1,Math.min(7,fp.hops));const a=focused*2.399963229728653;const radius=24+hops*19;
        cameraTarget.zoom=1.40;
        cameraTarget.x=-Math.cos(a)*radius*1.8*.38;
        cameraTarget.y=-Math.sin(a)*radius*.87*.38;
      }
    }
    for(let hop=1;hop<=7;hop++){
      const r=(24+hop*19)*camera.zoom;
      ctx.beginPath();ctx.ellipse(center.x+camera.x,center.y+camera.y,r,r*.9,0,0,Math.PI*2);
      ctx.strokeStyle="rgba(154,189,230,.16)";ctx.lineWidth=1;ctx.stroke();
    }
    if(animated){
      const sweep=(now/8500)%(Math.PI*2);
      ctx.save();ctx.translate(center.x+camera.x,center.y+camera.y);
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,184,sweep-.35,sweep);ctx.closePath();
      ctx.fillStyle="rgba(91,184,209,.045)";ctx.fill();ctx.restore();
    }
    meshTargets=[];
    const pulse=animated?Math.sin(now/1000*1.6):0;
    ranks.forEach((p,i)=>{
      const hops=Math.max(1,Math.min(7,p.hops));
      const a=i*2.399963229728653;
      const radius=24+hops*19;
      const baseX=center.x+Math.cos(a)*radius*1.8;
      const baseY=center.y+Math.sin(a)*radius*.87;
      const projected=project(baseX,baseY);
      const x=projected.x,y=projected.y;
      const origin=project(center.x,center.y);
      const age=Math.max(0,wallNow-Number(p.last_seen||0));
      const freshness=age<=900?1:age<=3600?.65:age<=86400?.35:.16;
      ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(x,y);
      ctx.strokeStyle="rgba(215,182,112,"+(.09+freshness*.17).toFixed(3)+")";ctx.stroke();
      if(animated && freshness>=.65 && i%3===0){
        const t=(now/5200+i*.137)%1;
        ctx.beginPath();ctx.arc(origin.x+(x-origin.x)*t,origin.y+(y-origin.y)*t,1.6,0,Math.PI*2);
        ctx.fillStyle="rgba(246,211,139,.60)";ctx.fill();
      }
      meshTargets.push({peer:p,x,y});
      if(animated && freshness>=.35){
        const phase=(now/(1900+((i%5)*290))+i*.17)%1;
        ctx.beginPath();ctx.arc(x,y,5+phase*13,0,Math.PI*2);
        ctx.strokeStyle="rgba(123,218,226,"+(0.55*(1-phase)).toFixed(3)+")";ctx.lineWidth=1.7;ctx.stroke();
      }
      ctx.beginPath();ctx.arc(x,y,p.destination===selectedMesh?7:3.6+(pulse+1)*1.15,0,Math.PI*2);
      ctx.globalAlpha=.30+.70*freshness;
      ctx.fillStyle=hops<=3?"#85e3cb":hops<=5?"#d7b672":"#8faad9";ctx.fill();ctx.globalAlpha=1;
    });
    const hub=project(center.x,center.y);
    ctx.beginPath();ctx.arc(hub.x,hub.y,8*camera.zoom,0,Math.PI*2);ctx.fillStyle="#f6d38b";ctx.fill();
    if(meshCount)meshCount.textContent=ranks.length+" Routen · "+ranks.filter(p=>wallNow-Number(p.last_seen||0)<=900).length+" in 15 Min gesehen";
    if(!now)startMeshAnimation();
  }

  let cachedPeers = [];
  function renderPeers() {
    if (!list) return;
    const term = (search?.value || "").trim().toLocaleLowerCase();
    const route = routeFilter?.value || "all";
    const matching = cachedPeers.filter(peer => {
      const matchesText = !term || String(peer.name || "").toLocaleLowerCase().includes(term) || String(peer.destination || "").toLowerCase().includes(term);
      return matchesText && (route === "all" || (route === "known" ? peer.path_known === true : peer.path_known !== true));
    }).sort((a,b)=>(b.last_seen||0)-(a.last_seen||0));
    drawLivingMesh(cachedPeers);
    if (visibleCount) visibleCount.textContent = matching.length + " von " + cachedPeers.length + " Knoten angezeigt" + (matching.length > 50 ? " · erste 50 sichtbar" : "");
    list.replaceChildren();
    if (!matching.length) { list.textContent = cachedPeers.length ? "Keine Knoten für diesen Filter gefunden." : "Noch keine Knoten entdeckt."; return; }
    for (const peer of matching.slice(0,50)) {
      const row=document.createElement("div"); row.className="n2k-peer-item";
      const info=document.createElement("div"); info.className="n2k-peer-info";
      const name=document.createElement("strong"); name.textContent=peer.name||"Unbenannter Knoten";
      const details=document.createElement("small");
      details.textContent=String(peer.destination||"").slice(0,16)+"… · "+(peer.path_known?"Route bekannt":"Route unbekannt")+(Number.isInteger(peer.hops)?" · "+peer.hops+" Hops":"");
      info.append(name,details); row.append(info);
      const action=document.createElement("button"); action.type="button"; action.className="secondary compact"; action.textContent="Pfad anfragen";
      action.addEventListener("click",async ()=>{
        action.disabled=true;
        try { await request("/api/messenger/peers/request",{method:"POST",headers:{"X-CSRF-Token":csrfToken},body:JSON.stringify({destination:peer.destination})}); action.textContent="Angefragt"; await loadPeers(); }
        catch(e) { action.textContent="Nicht möglich"; action.disabled=false; }
      });
      const detail=document.createElement("button");detail.type="button";detail.className="secondary compact";detail.textContent="Details";detail.addEventListener("click",()=>{selectMeshPeer(peer);document.querySelector('#privacy-panel .n2k-rns-workspace-tab[data-rns-view="mesh"]')?.click();meshCanvas?.scrollIntoView({behavior:"smooth",block:"nearest"});});
      row.append(detail,action); list.append(row);
    }
  }
  search?.addEventListener("input",renderPeers);
  routeFilter?.addEventListener("change",renderPeers);
  async function loadPeers() {
    if(!list || !count) return;
    try {
      const d=await request("/api/messenger/peers");
      if(d.error) throw Error(d.error);
      const peers=Array.isArray(d.peers)?d.peers:[];
      const routed=peers.filter(peer=>peer.path_known===true).length;
      count.textContent=peers.length+" gespeicherte LXMF-Ziele · "+routed+" bekannte Routen · TCP-Verbindungen nicht ermittelt";
      const windows=document.getElementById("n2k-announce-windows");
      if(windows) windows.textContent="Announcements zuletzt gesehen: 15 Min "+(d.recent_15m??"–")+" · 1 Std "+(d.recent_1h??"–")+" · 24 Std "+(d.recent_24h??"–")+" · nicht gleich online";
      cachedPeers=peers;
      renderPeers();
    }catch(e){count.textContent="Knotenstatus nicht verfügbar";list.textContent="Reticulum-Discovery momentan nicht erreichbar."}
  }
  refresh?.addEventListener("click",loadPeers);
  loadPeers();
  setInterval(()=>{if(!document.hidden)loadPeers()},30000);
})();

/* Explicit Reticulum public TCP peer: configuration, not an invented connection. */
(() => {
  const host=document.getElementById("n2k-peer-host");
  const port=document.getElementById("n2k-peer-port");
  const state=document.getElementById("n2k-peer-join-status");
  const join=document.getElementById("n2k-peer-join");
  const leave=document.getElementById("n2k-peer-leave");
  if(!host||!port||!state||!join||!leave)return;
  async function load(){
    try{
      const data=await request("/api/messenger/gateway");
      if(data.error) throw Error(data.error);
      host.value=data.host||"";
      port.value=String(data.port||4242);
      state.textContent=data.enabled?"TCP-Ziel konfiguriert: "+data.host+":"+data.port+" · Verbindung nicht bestätigt":
        "Kein öffentlicher TCP-Knoten aktiv.";
    }catch(_){state.textContent="TCP-Konfiguration nicht verfügbar"}
  }
  async function save(enabled){
    const address=host.value.trim().toLowerCase();
    const number=Number(port.value);
    if(enabled && !/^[a-z0-9.-]{1,253}$/.test(address)){state.textContent="Bitte gültigen Hostnamen oder IPv4-Adresse angeben.";return}
    if(!Number.isInteger(number)||number<1||number>65535){state.textContent="Ungültiger Port.";return}
    if(enabled&&!confirm("Ausgehende MeshLink-Verbindung zu "+address+":"+number+" konfigurieren und nur den MeshLink-Dienst neu starten?"))return;
    join.disabled=true;leave.disabled=true;
    try{
      await request("/api/messenger/gateway",{method:"POST",headers:{"X-CSRF-Token":csrfToken},
        body:JSON.stringify({host:address,port:number,enabled})});
      state.textContent="Gespeichert. MeshLink wird neu gestartet …";
      await request("/api/messenger/node/restart",{method:"POST",headers:{"X-CSRF-Token":csrfToken},body:"{}"});
      state.textContent=enabled?"Verbindungsversuch konfiguriert. Announcements und Pfade prüfen; keine Verbindung bestätigt.":"Öffentliche TCP-Verbindung deaktiviert.";
    }catch(e){state.textContent="Änderung fehlgeschlagen: "+(e.message||"API nicht erreichbar")}
    finally{join.disabled=false;leave.disabled=false}
  }
  join.addEventListener("click",()=>save(true));
  leave.addEventListener("click",()=>save(false));
  load();
})();


// MeshLink chooses the best observed LXMF route, not an unverified TCP connection.
(() => {
  const button=document.getElementById("n2k-peers-auto");
  const message=document.getElementById("n2k-peer-best-status");
  const refresh=document.getElementById("n2k-peers-refresh");
  if(!button||!message)return;
  async function best() {
    try{
      const d=await request("/api/messenger/peers/best");
      if(d.error)throw Error(d.error);
      const peer=d.best;
      message.textContent=peer ? "Beste bekannte Route: "+(peer.name||peer.destination)+
        " · "+peer.hops+" Hops · zuletzt gesehen vor "+peer.age_seconds+" s" :
        (d.diagnostic || "Keine aktuell bekannte erreichbare LXMF-Route.");
    }catch(_){message.textContent="Knotenbewertung nicht verfügbar."}
  }
  button.addEventListener("click",async ()=>{
    button.disabled=true;message.textContent="Besten beobachteten Pfad auswählen …";
    try{
      const d=await request("/api/messenger/peers/auto",{method:"POST",
        headers:{"X-CSRF-Token":csrfToken},body:"{}"});
      if(d.error)throw Error(d.error);
      message.textContent=d.selected ?
        "Pfad zu "+d.selected.slice(0,16)+"… angefragt · "+
        (d.path_known?"Route bekannt":"Verbindung noch nicht bestätigt"):
        "Keine kürzlich entdeckten LXMF-Knoten vorhanden.";
    }catch(_){message.textContent="Automatische Pfadanfrage nicht möglich."}
    finally{button.disabled=false}
  });
  refresh?.addEventListener("click",()=>setTimeout(best,700));
  best();
})();

/* RNS Workspace: move existing functional widgets into independent full-page tabs.
   Move nodes, never clone them; event listeners and component state survive. */
(() => {
  const root=document.getElementById("privacy-panel");
  if(!root || root.querySelector(".n2k-rns-workspace-nav"))return;
  const tiles=root.querySelector(".n2k-hub-tiles");
  const hub=root.querySelector(".n2k-hub-card");
  const peer=root.querySelector(".n2k-peer-browser");
  const radar=root.querySelector(".n2k-living-mesh");
  const gateway=root.querySelector(".n2k-public-peer-config");
  const messenger=root.querySelector(".tor-browser-shell");
  const node=messenger?.querySelector(".n2k-node-settings");
  if(!tiles||!hub||!peer||!radar||!gateway||!messenger||!node)return;
  const nav=document.createElement("nav");
  nav.className="n2k-rns-workspace-nav";
  nav.setAttribute("aria-label","RNS Arbeitsbereiche");
  const pages=document.createElement("div");
  pages.className="n2k-rns-workspace-pages";
  const tabs=[
    ["mesh","Living Mesh"],
    ["chat","Messenger"],
    ["peers","Knoten & Routen"],
    ["settings","Einstellungen"]
  ];
  const elements=new Map();
  const buttons=new Map();
  tabs.forEach(([id,label])=>{
    const b=document.createElement("button");
    b.type="button";b.className="n2k-rns-workspace-tab";
    b.textContent=label;b.dataset.rnsView=id;b.setAttribute("aria-controls","n2k-rns-page-"+id);
    nav.append(b);buttons.set(id,b);
    const p=document.createElement("section");
    p.id="n2k-rns-page-"+id;p.className="n2k-rns-workspace-page";
    p.setAttribute("aria-label",label);
    pages.append(p);elements.set(id,p);
    b.addEventListener("click",()=>activate(id));
  });
  const activate=id=>{
    if(id==="mesh")window.requestAnimationFrame(()=>document.dispatchEvent(new Event("n2k-rns-mesh-visible")));
    for(const [key,page] of elements){
      const active=id===key;
      page.hidden=!active;
      buttons.get(key).setAttribute("aria-current",active?"page":"false");
      buttons.get(key).classList.toggle("is-active",active);
    }
  };
  // Expose workspace navigation directly under the page heading; keep all controls in their sections.
  hub.classList.add("n2k-rns-status-strip");
  // Detach nested elements before relocating their original parents.
  node.remove();
  gateway.remove();
  radar.remove();
  peer.remove();
  elements.get("mesh").append(radar);
  elements.get("chat").append(messenger);
  elements.get("peers").append(peer);
  elements.get("settings").append(hub,node,gateway);
  tiles.remove();
  root.querySelector(".panel-head")?.insertAdjacentElement("afterend",nav);
  nav.insertAdjacentElement("afterend",pages);
  activate("mesh");
})();

/* LXMF contact exchange: copy/paste a normalized destination hash.
   QR rendering is local-only, with no third-party QR API or network call. */
function nativeLxmfHash(value){
  const s=String(value||"").trim().replace(/^lxmf:\/\//i,"").replace(/^lxmf:/i,"").replace(/\s/g,"");
  return /^[0-9a-f]{32}$/i.test(s)?s.toLowerCase():"";
}
function drawNativeLxmfQr(){
  const note=document.getElementById("n2k-lxmf-qr-note");
  const hash=nativeLxmfHash(document.getElementById("n2k-native-id")?.value);
  const canvas=document.getElementById("n2k-lxmf-qr-canvas");
  if(!canvas||!hash)return;
  // Do not misrepresent a decorative visual as a scannable QR code.
  if(note)note.textContent="Adresse kopieren und über einen vertrauenswürdigen Kanal teilen. Scannbarer QR-Code folgt.";
  canvas.hidden=true;
}
document.getElementById("n2k-lxmf-qr-toggle")?.addEventListener("click",()=>{
  const panel=document.getElementById("n2k-lxmf-qr");if(!panel)return;
  panel.hidden=!panel.hidden;
  if(!panel.hidden)drawNativeLxmfQr();
});
document.getElementById("n2k-lxmf-copy")?.addEventListener("click",async()=>{
  const hash=nativeLxmfHash(document.getElementById("n2k-native-id")?.value);
  if(!hash)return;
  try{await navigator.clipboard.writeText("lxmf://"+hash);}
  catch(e){const field=document.getElementById("n2k-native-id");field?.focus();field?.select();}
});
document.getElementById("n2k-lxmf-import-btn")?.addEventListener("click",()=>{
  const text=document.getElementById("n2k-lxmf-import")?.value;
  const hash=nativeLxmfHash(text);
  const note=document.getElementById("n2k-lxmf-import-note");
  if(!hash){if(note)note.textContent="Ungültig: 32 Hex-Zeichen oder lxmf://… erwartet";return;}
  const dest=document.getElementById("n2k-contact-dest");
  if(dest)dest.value=hash;
  if(note)note.textContent="Adresse geprüft und übernommen. Kontaktname eingeben und speichern.";
});

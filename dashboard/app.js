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
  setConnection(false, "Verbinde …");
  try {
    const response = await fetch("/api/status", {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const host = data.host || {};
    const memory = host.memory || {};
    const load = host.load || {};

    document.getElementById("host-name").textContent = host.hostname || "–";
    document.getElementById("host-os").textContent = host.os?.name || "Linux";
    document.getElementById("host-uptime").textContent = formatUptime(host.uptime_seconds);
    document.getElementById("host-memory").textContent =
      memory.used_percent == null
        ? "–"
        : `${memory.used_percent}% · ${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}`;
    document.getElementById("host-load").textContent =
      load["1m"] == null ? "–" : `${load["1m"]} · ${load["5m"]} · ${load["15m"]}`;

    setConnection(true, "Server online");
  } catch (error) {
    console.error(error);
    setConnection(false, "Serverstatus nicht erreichbar");
  }
}

document.getElementById("refresh-status")?.addEventListener("click", loadStatus);
document.querySelectorAll("[data-url]").forEach(btn => {
  btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank", "noopener"));
});

loadStatus();
setInterval(loadStatus, 30000);

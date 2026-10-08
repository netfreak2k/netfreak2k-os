#!/usr/bin/env bash
# Netfreak2k Server-OS: install LOCAL Hermes + LOCAL Ollama (8 GB host profile).
# Run on the Server-OS host, not inside the dashboard/API container.
set -Eeuo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this script as your normal sudo-capable server user, not root." >&2
  exit 1
fi
command -v sudo >/dev/null || { echo "sudo is required" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required" >&2; exit 1; }

RAM_KB=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
if (( RAM_KB < 6500000 )); then
  echo "Warning: less than ~7 GB physical RAM detected. Aborting to protect existing services." >&2
  exit 1
fi

if ! command -v ollama >/dev/null; then
  echo "Installing Ollama locally from the official installer..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Restrict Ollama model lifetime and concurrency to keep server workloads responsive.
# This affects only Ollama; Hermes remains separately managed by the login user.
sudo install -d -m 0755 /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/90-netfreak2k-lowram.conf >/dev/null <<'CONF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=0"
Environment="OLLAMA_CONTEXT_LENGTH=4096"
MemoryHigh=2500M
MemoryMax=3500M
CONF

sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sudo systemctl restart ollama

echo "Downloading tiny local model..."
ollama pull qwen3.5:0.8b
echo "Checking inference on the local-only listener..."
curl -fsS http://127.0.0.1:11434/api/tags >/dev/null

if ! command -v hermes >/dev/null; then
  echo "Installing Hermes Agent for current user..."
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
fi

export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
cat <<'NEXT'

Local model installed. Next: configure Hermes interactively:
  hermes model
  -> Custom endpoint
  -> URL: http://127.0.0.1:11434/v1
  -> API key: leave empty
  -> Model: qwen3.5:0.8b
  -> Context: 4096 (if accepted; try 8192 only if needed and memory allows)

  hermes doctor
  hermes

This is an intentionally conservative CPU/RAM profile. Small models can be
unreliable for complex tool calling. Do not enable unattended host shell tools.
The dashboard's existing Hermes tile is a status/launcher only; it does NOT yet
provide an embedded chat to the local process. No remote model is used.
NEXT

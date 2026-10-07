#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-local}"
DOMAIN="${2:-}"
EMAIL="${3:-}"
N2K_DIR="${N2K_DIR:-/opt/netfreak2k}"
ENV_FILE="${N2K_DIR}/server/.env"
STATE_DIR="${N2K_STATE_DIR:-/var/lib/netfreak2k}"
TLS_DIR="${STATE_DIR}/tls"
STATE_FILE="${STATE_DIR}/remote-access.json"
NGINX_SITE="/etc/nginx/sites-available/netfreak2k"
NGINX_LINK="/etc/nginx/sites-enabled/netfreak2k"
ACME_ROOT="/var/www/netfreak2k-acme"

[[ "${EUID}" -eq 0 ]] || { echo "root_required" >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || { echo "env_missing" >&2; exit 1; }
[[ "${MODE}" =~ ^(local|domain)$ ]] || { echo "invalid_mode" >&2; exit 1; }

read_env(){
  local key="$1" fallback="$2" value
  value="$(grep -E "^$key=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
  printf '%s' "${value:-$fallback}"
}

BACKEND_PORT="$(read_env N2K_BACKEND_PORT 18080)"
PUBLIC_HTTP_PORT="$(read_env N2K_PUBLIC_HTTP_PORT 80)"
PUBLIC_HTTPS_PORT="$(read_env N2K_PUBLIC_HTTPS_PORT 443)"

[[ "${BACKEND_PORT}" =~ ^[0-9]{1,5}$ ]] || { echo "invalid_backend_port" >&2; exit 1; }
[[ "${PUBLIC_HTTP_PORT}" =~ ^[0-9]{1,5}$ ]] || { echo "invalid_http_port" >&2; exit 1; }
[[ "${PUBLIC_HTTPS_PORT}" =~ ^[0-9]{1,5}$ ]] || { echo "invalid_https_port" >&2; exit 1; }

mkdir -p "${TLS_DIR}" "${ACME_ROOT}" /etc/nginx/sites-available /etc/nginx/sites-enabled
chmod 0700 "${TLS_DIR}"

LOCAL_CERT="${TLS_DIR}/local.crt"
LOCAL_KEY="${TLS_DIR}/local.key"
HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"
HOSTNAME_SHORT="$(hostname)"
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "${HOST_IP}" ]] || HOST_IP="127.0.0.1"

if [[ ! -s "${LOCAL_CERT}" || ! -s "${LOCAL_KEY}" ]]; then
  SAN="DNS:${HOSTNAME_SHORT},DNS:${HOSTNAME_SHORT}.local,DNS:${HOSTNAME_FQDN},IP:${HOST_IP},IP:127.0.0.1"
  openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 825     -keyout "${LOCAL_KEY}" -out "${LOCAL_CERT}"     -subj "/CN=${HOSTNAME_SHORT}.local/O=Netfreak2k"     -addext "subjectAltName=${SAN}" >/dev/null 2>&1
  chmod 0600 "${LOCAL_KEY}"
  chmod 0644 "${LOCAL_CERT}"
fi

proxy_block(){
cat <<EOF
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        client_max_body_size 260m;
EOF
}

write_local(){
  {
    cat <<EOF
server {
    listen ${PUBLIC_HTTP_PORT} default_server;
    listen [::]:${PUBLIC_HTTP_PORT} default_server;
    server_name _;
    location / {
EOF
    proxy_block
    cat <<EOF
    }
}
server {
    listen ${PUBLIC_HTTPS_PORT} ssl;
    listen [::]:${PUBLIC_HTTPS_PORT} ssl;
    server_name _;
    ssl_certificate ${LOCAL_CERT};
    ssl_certificate_key ${LOCAL_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=86400" always;
    location / {
EOF
    proxy_block
    cat <<EOF
    }
}
EOF
  } > "${NGINX_SITE}"
}

write_domain_http(){
cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
}

write_domain_tls(){
cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        client_max_body_size 260m;
    }
}
EOF
}

ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
rm -f /etc/nginx/sites-enabled/default

CERT_TYPE="local"
EFFECTIVE_DOMAIN=""

if [[ "${MODE}" == "domain" ]]; then
  [[ "${DOMAIN}" =~ ^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]] || { echo "invalid_domain" >&2; exit 1; }
  [[ "${EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo "invalid_email" >&2; exit 1; }
  [[ "${PUBLIC_HTTP_PORT}" == "80" && "${PUBLIC_HTTPS_PORT}" == "443" ]] || { echo "domain_requires_ports_80_443" >&2; exit 1; }
  write_domain_http
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  if ! certbot certonly --non-interactive --agree-tos --email "${EMAIL}" --webroot -w "${ACME_ROOT}" -d "${DOMAIN}"; then
    write_local
    nginx -t
    systemctl reload nginx
    echo "certificate_issue_failed" >&2
    exit 1
  fi
  write_domain_tls
  CERT_TYPE="letsencrypt"
  EFFECTIVE_DOMAIN="${DOMAIN}"
else
  write_local
fi

nginx -t
systemctl enable --now nginx
systemctl reload nginx

python3 - "${STATE_FILE}" "${MODE}" "${EFFECTIVE_DOMAIN}" "${EMAIL}" "${CERT_TYPE}" "${BACKEND_PORT}" "${PUBLIC_HTTP_PORT}" "${PUBLIC_HTTPS_PORT}" "${HOST_IP}" <<'PY'
import json, os, sys, time
path, mode, domain, email, cert_type, backend, http_port, https_port, host_ip = sys.argv[1:]
payload = {
    "mode": mode,
    "domain": domain,
    "email": email if mode == "domain" else "",
    "certificate": cert_type,
    "backend_port": int(backend),
    "http_port": int(http_port),
    "https_port": int(https_port),
    "host_ip": host_ip,
    "configured_at": int(time.time()),
}
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, separators=(",", ":"))
    handle.write("\n")
os.replace(tmp, path)
os.chmod(path, 0o600)
PY

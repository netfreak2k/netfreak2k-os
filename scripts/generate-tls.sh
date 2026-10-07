#!/usr/bin/env bash
set -Eeuo pipefail

TLS_DIR="${N2K_TLS_DIR:-/var/lib/netfreak2k/tls}"
CERT="${TLS_DIR}/server.crt"
KEY="${TLS_DIR}/server.key"
HOSTNAME_VALUE="$(hostname -s 2>/dev/null || hostname 2>/dev/null || printf 'netfreak2k')"

mkdir -p "${TLS_DIR}"
chmod 0700 "${TLS_DIR}"

if [[ -s "${CERT}" && -s "${KEY}" ]] && openssl x509 -checkend 2592000 -noout -in "${CERT}" >/dev/null 2>&1; then
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
config="${tmp}/openssl.cnf"

{
  cat <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no

[dn]
CN = ${HOSTNAME_VALUE}.local

[v3]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt

[alt]
DNS.1 = localhost
DNS.2 = ${HOSTNAME_VALUE}
DNS.3 = ${HOSTNAME_VALUE}.local
IP.1 = 127.0.0.1
EOF
  index=2
  for ip in $(hostname -I 2>/dev/null || true); do
    if [[ "${ip}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf 'IP.%s = %s\n' "${index}" "${ip}"
      index=$((index + 1))
    fi
  done
} > "${config}"

umask 077
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825   -keyout "${KEY}.new" -out "${CERT}.new" -config "${config}" >/dev/null 2>&1
mv "${KEY}.new" "${KEY}"
mv "${CERT}.new" "${CERT}"
chmod 0600 "${KEY}"
chmod 0644 "${CERT}"

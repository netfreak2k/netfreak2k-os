# Authentication Model

## Scope

Netfreak2k Server requires local authentication before exposing host status or future management functions.

The current implementation is intentionally small and self-contained.

## First-run setup

On a fresh installation:

1. the browser checks `/api/setup`
2. if no user exists, the setup form is shown
3. the first account becomes the local administrator
4. the password is never stored in plaintext
5. the browser receives an authenticated session cookie

## Password storage

Passwords are hashed with PBKDF2-HMAC-SHA256 using:

- a random per-user salt
- 310,000 iterations
- constant-time hash comparison during login

The SQLite database is stored only in the Docker volume `netfreak2k-data`.

## Sessions

Sessions are:

- random 256-bit-class tokens generated with Python `secrets`
- sent in an HttpOnly cookie
- SameSite=Strict
- valid for 12 hours
- kept in memory by the API process

A server/API restart therefore logs active browser sessions out.

This is acceptable for the current development phase and avoids persisting reusable session tokens.

## CSRF

Authenticated state-changing requests require a per-session CSRF token.

Logout already uses this mechanism.

Future host-changing API calls must use the same protection.

## HTTP limitation during development

The current LAN bootstrap uses plain HTTP so it can be reached directly through:

```text
http://SERVER-IP/
```

The session cookie therefore cannot yet use the `Secure` attribute.

Before remote/internet-facing management is allowed, HTTPS/TLS must be implemented and the cookie must become Secure.

## Current security boundary

The authenticated API currently exposes only read-only host status.

No endpoint can yet:

- install packages
- alter disks
- change networking
- control Docker
- reboot/shutdown the host
- write host configuration

Those capabilities must not be introduced until their permission model and audit behavior are defined.

FROM nginx:1.27-alpine

COPY server/nginx.conf /etc/nginx/conf.d/default.conf
COPY dashboard/ /usr/share/nginx/html/

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3   CMD wget --no-check-certificate -qO- https://127.0.0.1/healthz || exit 1

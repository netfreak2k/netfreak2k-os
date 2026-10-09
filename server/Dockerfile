FROM nginx:1.27-alpine

COPY server/nginx.conf /etc/nginx/conf.d/default.conf
COPY dashboard/ /usr/share/nginx/html/
COPY prototypes/reticulum/index.html /usr/share/nginx/html/reticulum-beta/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3   CMD wget -qO- http://127.0.0.1/healthz || exit 1

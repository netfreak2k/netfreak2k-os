FROM python:3.13-alpine

WORKDIR /app
COPY server/api/server.py /app/server.py
COPY server/api/reticulum_status.py /app/reticulum_status.py
COPY server/api/reticulum_activation.py /app/reticulum_activation.py
COPY server/api/reticulum_overview.py /app/reticulum_overview.py
COPY server/api/reticulum_beta_gate.py /app/reticulum_beta_gate.py

RUN pip install --no-cache-dir mutagen==1.47.0

RUN mkdir -p /data && chown nobody:nogroup /data

EXPOSE 8080

USER nobody

CMD ["python", "/app/server.py"]

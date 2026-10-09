FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 10002 --home /state n2klan && mkdir -p /state && chown 10002:10002 /state
RUN pip install --no-cache-dir rns
COPY server/reticulum-lan/service.py /app/service.py
COPY server/reticulum-lan/config_validation.py /app/config_validation.py
USER 10002:10002
CMD ["python", "/app/service.py"]
